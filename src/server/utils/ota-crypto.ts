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

  const privPath = path.join(KEYS_DIR, 'ed25519_private.pem');
  const pubPath = path.join(KEYS_DIR, 'ed25519_public.pem');

  if (fs.existsSync(privPath) && fs.existsSync(pubPath)) {
    try {
      const privateKeyPem = fs.readFileSync(privPath, 'utf8');
      const publicKeyPem = fs.readFileSync(pubPath, 'utf8');
      const pubKeyObject = crypto.createPublicKey(publicKeyPem);
      const publicKeyHex = pubKeyObject.export({ type: 'spki', format: 'der' }).toString('hex');
      cachedKeyPair = { privateKeyPem, publicKeyPem, publicKeyHex };
      return cachedKeyPair;
    } catch {
      // Regenerate if error
    }
  }

  // Generate new keypair
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  try {
    fs.writeFileSync(privPath, privateKey, 'utf8');
    fs.writeFileSync(pubPath, publicKey, 'utf8');
  } catch {
    // Ignore write error if read-only
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
