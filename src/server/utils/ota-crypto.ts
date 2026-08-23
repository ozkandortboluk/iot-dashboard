import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const KEYS_DIR = path.join(process.cwd(), 'uploads', 'keys');
const FIRMWARE_STORAGE_DIR = path.join(process.cwd(), 'uploads', 'firmware');

// Ensure storage directories exist
try {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  fs.mkdirSync(FIRMWARE_STORAGE_DIR, { recursive: true });
} catch {
  // Ignore
}

interface KeyPair {
  privateKeyPem: string;
  publicKeyPem: string;
  publicKeyHex: string;
}

let cachedKeyPair: KeyPair | null = null;

export function getEd25519KeyPair(): KeyPair {
  if (cachedKeyPair) return cachedKeyPair;

  // 1. Check direct PEM string from environment
  if (process.env.OTA_SIGNING_PRIVATE_KEY) {
    try {
      const privateKeyPem = process.env.OTA_SIGNING_PRIVATE_KEY.replace(/\\n/g, '\n');
      const privKeyObj = crypto.createPrivateKey(privateKeyPem);
      const pubKeyObj = crypto.createPublicKey(privKeyObj);
      const publicKeyPem = pubKeyObj.export({ type: 'spki', format: 'pem' }).toString();
      const publicKeyHex = pubKeyObj.export({ type: 'spki', format: 'der' }).toString('hex');
      cachedKeyPair = { privateKeyPem, publicKeyPem, publicKeyHex };
      return cachedKeyPair;
    } catch (err: any) {
      console.error('[OTA Crypto] OTA_SIGNING_PRIVATE_KEY ortam değişkeni ayrıştırılamadı:', err.message);
    }
  }

  // 2. Check custom path from environment or default file path
  const privPath = process.env.OTA_SIGNING_PRIVATE_KEY_PATH || path.join(KEYS_DIR, 'ed25519_private.pem');
  const pubPath = path.join(path.dirname(privPath), 'ed25519_public.pem');

  if (fs.existsSync(privPath)) {
    try {
      const privateKeyPem = fs.readFileSync(privPath, 'utf8');
      const privKeyObj = crypto.createPrivateKey(privateKeyPem);
      const pubKeyObj = crypto.createPublicKey(privKeyObj);
      const publicKeyPem = pubKeyObj.export({ type: 'spki', format: 'pem' }).toString();
      const publicKeyHex = pubKeyObj.export({ type: 'spki', format: 'der' }).toString('hex');
      
      if (!fs.existsSync(pubPath)) {
        try { fs.writeFileSync(pubPath, publicKeyPem, 'utf8'); } catch {}
      }

      cachedKeyPair = { privateKeyPem, publicKeyPem, publicKeyHex };
      return cachedKeyPair;
    } catch (err: any) {
      console.error(`[OTA Crypto] ${privPath} özel anahtarı okunamadı:`, err.message);
    }
  }

  // In strict production, throw error if key is missing on persistent storage
  if (process.env.NODE_ENV === 'production') {
    console.error('[OTA Crypto ERROR] Üretim (Production) ortamında kalıcı Ed25519 özel anahtarı bulunamadı! Lütfen OTA_SIGNING_PRIVATE_KEY veya OTA_SIGNING_PRIVATE_KEY_PATH tanımlayın.');
    throw new Error('Kalıcı OTA imzalama anahtarı bulunamadı (OTA_SIGNING_PRIVATE_KEY veya OTA_SIGNING_PRIVATE_KEY_PATH zorunludur).');
  }

  // 3. Generate new Ed25519 keypair
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  try {
    fs.mkdirSync(path.dirname(privPath), { recursive: true });
    fs.writeFileSync(privPath, privateKey, 'utf8');
    fs.writeFileSync(pubPath, publicKey, 'utf8');
  } catch {
    // Ignore write error if filesystem is read-only
  }

  const pubKeyObject = crypto.createPublicKey(publicKey);
  const publicKeyHex = pubKeyObject.export({ type: 'spki', format: 'der' }).toString('hex');

  cachedKeyPair = {
    privateKeyPem: privateKey,
    publicKeyPem: publicKey,
    publicKeyHex,
  };

  return cachedKeyPair;
}

/**
 * Generates a secure single-use download token hash
 */
export function hashDownloadToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Timing-safe token string comparison
 */
export function compareTokensSafe(rawOrHashed1: string, rawOrHashed2: string): boolean {
  if (!rawOrHashed1 || !rawOrHashed2) return false;
  const h1 = rawOrHashed1.length === 64 ? rawOrHashed1 : hashDownloadToken(rawOrHashed1);
  const h2 = rawOrHashed2.length === 64 ? rawOrHashed2 : hashDownloadToken(rawOrHashed2);
  
  const buf1 = Buffer.from(h1, 'hex');
  const buf2 = Buffer.from(h2, 'hex');

  if (buf1.length !== buf2.length) return false;
  return crypto.timingSafeEqual(buf1, buf2);
}


export function signBinaryBuffer(buffer: Buffer): { sha256: string; signatureHex: string; publicKeyPem: string } {
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const { privateKeyPem, publicKeyPem } = getEd25519KeyPair();
  
  const signatureBuffer = crypto.sign(null, buffer, privateKeyPem);
  const signatureHex = signatureBuffer.toString('hex');

  return {
    sha256,
    signatureHex,
    publicKeyPem,
  };
}

export function verifyBinarySignature(buffer: Buffer, signatureHex: string): boolean {
  try {
    const { publicKeyPem } = getEd25519KeyPair();
    const signatureBuffer = Buffer.from(signatureHex, 'hex');
    return crypto.verify(null, buffer, publicKeyPem, signatureBuffer);
  } catch {
    return false;
  }
}

/**
 * Validates real ESP32 / ESP8266 binary file
 */
export function validateEspBinary(buffer: Buffer): { valid: boolean; error?: string } {
  if (!buffer || buffer.length < 1024) {
    return {
      valid: false,
      error: 'Yüklenen ikili dosya çok küçük (en az 1 KB olmalıdır).',
    };
  }

  // Reject dummy string uploads
  const sampleStr = buffer.toString('utf8', 0, Math.min(buffer.length, 100));
  if (sampleStr.startsWith('DUMMY_') || sampleStr.includes('DUMMY_ESP32_BINARY')) {
    return {
      valid: false,
      error: 'Sahte (dummy) metin dosyaları firmware olarak kabul edilmez. Lütfen derlenmiş gerçek bir .bin dosyası yükleyin.',
    };
  }

  // ESP Image Format Magic Byte Check (ESP32/ESP8266 images start with 0xE9 or 0x1F or 0x27)
  const magicByte = buffer[0];
  const validMagicBytes = [0xe9, 0x1f, 0x27, 0x7f]; // 0xE9 standard ESP flash image, 0x7F ELF/Bin
  if (!validMagicBytes.includes(magicByte)) {
    return {
      valid: false,
      error: `Geçersiz ESP binary başlık formatı (0x${magicByte.toString(16).toUpperCase()}). Gerçek ESP32/ESP8266 imajları '0xE9' sihirli bayrağı ile başlamalıdır.`,
    };
  }

  return { valid: true };
}

/**
 * Save firmware binary to disk and return file path
 */
export function saveFirmwareFileToDisk(firmwareId: string, buffer: Buffer): string {
  const filename = `${firmwareId}.bin`;
  const filePath = path.join(FIRMWARE_STORAGE_DIR, filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

/**
 * Get firmware binary buffer from disk
 */
export function readFirmwareFileFromDisk(filePath: string): Buffer | null {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath);
    }
  } catch {
    // Ignore
  }
  return null;
}
