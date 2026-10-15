import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { systemSecretsService } from '../services/systemSecrets.service.js';
import { isProductionVpsEnvironment } from '../config/runtimeEnvironment.js';

// Production assets must live under /app/data (the persistent app_data volume).
// Existing assets in /app/uploads must be migrated BEFORE the first deployment.
const UPLOADS_DIR = path.join(process.cwd(), process.env.NODE_ENV === 'production' ? 'data/uploads' : 'uploads');
const KEYS_DIR = path.join(UPLOADS_DIR, 'keys');
const FIRMWARE_STORAGE_DIR = path.join(UPLOADS_DIR, 'firmware');
const SECRETS_DIR = path.join(process.cwd(), 'secrets');

// Ensure storage directories exist
try {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  fs.mkdirSync(FIRMWARE_STORAGE_DIR, { recursive: true });
  fs.mkdirSync(SECRETS_DIR, { recursive: true });
} catch {
  // Ignore
}

export interface KeyPair {
  keyId: string;
  privateKeyPem: string;
  publicKeyPem: string;
  publicKeyHex: string;
}

export interface TrustedPublicKeyInfo {
  keyId: string;
  publicKeyPem: string;
  publicKeyHex: string;
  isCurrent: boolean;
  status: 'active' | 'transitional' | 'deprecated';
  description?: string;
  createdAt?: string;
  notAfter?: string;
}

let cachedKeyPair: KeyPair | null = null;
let testMockKeyPair: KeyPair | null = null;

/**
 * Allows automated test suites to mock a keypair in isolated environments
 */
export function setMockKeyPairForTesting(mockPair: KeyPair | null): void {
  testMockKeyPair = mockPair;
  cachedKeyPair = mockPair;
}

/**
 * Gets the active Ed25519 signing keypair from Docker secrets or protected configuration.
 *
 * CRITICAL ROOT OF TRUST SECURITY DIRECTIVE:
 * Under NO circumstances does this function automatically generate a new private key when missing.
 * If the private key is lost or deleted, auto-generating a new key would break verification on all
 * hardware devices deployed in the field whose firmware has the public key pinned at compile time.
 */
export function getEd25519KeyPair(): KeyPair {
  if (testMockKeyPair) return testMockKeyPair;
  if (cachedKeyPair) return cachedKeyPair;

  const activeKeyId = process.env.OTA_SIGNING_KEY_ID || 'root_ed25519_v1';

  // 1. Check direct PEM string from AES-256-GCM Vault (CANONICAL RUNTIME SOURCE)
  const rawVaultKey = systemSecretsService.getOtaSigningKey() ||
    systemSecretsService.getSecret('ota.signing_key') ||
    systemSecretsService.getSecret('ota_signing_key');

  if (rawVaultKey) {
    try {
      const privateKeyPem = rawVaultKey.replace(/\\n/g, '\n');
      const privKeyObj = crypto.createPrivateKey(privateKeyPem);
      const pubKeyObj = crypto.createPublicKey(privKeyObj);
      const publicKeyPem = pubKeyObj.export({ type: 'spki', format: 'pem' }).toString();
      const publicKeyHex = pubKeyObj.export({ type: 'spki', format: 'der' }).toString('hex');
      cachedKeyPair = { keyId: activeKeyId, privateKeyPem, publicKeyPem, publicKeyHex };
      return cachedKeyPair;
    } catch (err: any) {
      console.error('[OTA Crypto] Vault OTA imzalama özel anahtarı ayrıştırılamadı:', err.message);
    }
  }

  // 2. In non-production or test environment, read candidate files or env if present
  const isProd = isProductionVpsEnvironment();
  if (!isProd) {
    const candidateSecretPaths = [
      '/run/secrets/ota_signing_key',
      '/run/secrets/ota_private_key',
      process.env.OTA_SIGNING_PRIVATE_KEY_PATH,
      path.join(SECRETS_DIR, 'ota_signing_key'),
      path.join(SECRETS_DIR, 'ota_signing_key.pem'),
      path.join(KEYS_DIR, 'ed25519_private.pem'),
    ].filter((p): p is string => Boolean(p));

    const rawEnvKey = process.env.OTA_SIGNING_PRIVATE_KEY;
    if (rawEnvKey) {
      try {
        const privateKeyPem = rawEnvKey.replace(/\\n/g, '\n');
        const privKeyObj = crypto.createPrivateKey(privateKeyPem);
        const pubKeyObj = crypto.createPublicKey(privKeyObj);
        const publicKeyPem = pubKeyObj.export({ type: 'spki', format: 'pem' }).toString();
        const publicKeyHex = pubKeyObj.export({ type: 'spki', format: 'der' }).toString('hex');
        cachedKeyPair = { keyId: activeKeyId, privateKeyPem, publicKeyPem, publicKeyHex };
        return cachedKeyPair;
      } catch {}
    }

    for (const secretPath of candidateSecretPaths) {
      if (fs.existsSync(secretPath)) {
        try {
          const privateKeyPem = fs.readFileSync(secretPath, 'utf8');
          const privKeyObj = crypto.createPrivateKey(privateKeyPem);
          const pubKeyObj = crypto.createPublicKey(privKeyObj);
          const publicKeyPem = pubKeyObj.export({ type: 'spki', format: 'pem' }).toString();
          const publicKeyHex = pubKeyObj.export({ type: 'spki', format: 'der' }).toString('hex');
          cachedKeyPair = { keyId: activeKeyId, privateKeyPem, publicKeyPem, publicKeyHex };
          return cachedKeyPair;
        } catch {}
      }
    }
  }

  // STRICT ROOT-OF-TRUST DIRECTIVE:
  // OTA key must NOT be silently generated or used without verified persistence in Vault.
  const errMsg =
    '[OTA Root of Trust Hatası] Kalıcı Ed25519 imzalama özel anahtarı (private key) Vault kasasında bulunamadı! ' +
    'Cihaz donanımlarına derleme anında sabitlenen Root of Trust güvenliğini korumak için sistem doğrulanmamış geçici anahtar kullanmaz. ' +
    'Lütfen systemSecretsService.ensureOtaSigningKey() çağrısının tamamlandığından emin olun.';

  console.error(errMsg);
  throw new Error(errMsg);
}

/**
 * Returns all trusted public keys in the keyring (active current key + transitional/historical keys)
 * for key rotation support and verification during transition periods.
 */
export function getTrustedPublicKeys(): TrustedPublicKeyInfo[] {
  const result: TrustedPublicKeyInfo[] = [];

  // 1. Add current active key
  try {
    const active = getEd25519KeyPair();
    result.push({
      keyId: active.keyId,
      publicKeyPem: active.publicKeyPem,
      publicKeyHex: active.publicKeyHex,
      isCurrent: true,
      status: 'active',
      description: 'Aktif Firmware İmzalama Anahtarı',
    });
  } catch {
    // If active key is not configured, continue checking keyring files
  }

  // 2. Check environment variable for transitional public keys JSON
  if (process.env.OTA_TRANSITIONAL_PUBLIC_KEYS_JSON) {
    try {
      const parsed = JSON.parse(process.env.OTA_TRANSITIONAL_PUBLIC_KEYS_JSON);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item.keyId && item.publicKeyPem && !result.some((r) => r.keyId === item.keyId)) {
            const pubKeyObj = crypto.createPublicKey(item.publicKeyPem);
            result.push({
              keyId: item.keyId,
              publicKeyPem: item.publicKeyPem,
              publicKeyHex: pubKeyObj.export({ type: 'spki', format: 'der' }).toString('hex'),
              isCurrent: false,
              status: item.status || 'transitional',
              description: item.description || 'Geçiş Dönemi Doğrulama Anahtarı',
              createdAt: item.createdAt,
              notAfter: item.notAfter,
            });
          }
        }
      }
    } catch (err: any) {
      console.warn('[OTA KeyRing] OTA_TRANSITIONAL_PUBLIC_KEYS_JSON ayrıştırılamadı:', err.message);
    }
  }

  // 3. Check JSON files in secrets/trusted_keys.json or uploads/keys/trusted_keys.json
  const candidateRingFiles = [
    path.join(SECRETS_DIR, 'trusted_keys.json'),
    path.join(KEYS_DIR, 'trusted_keys.json'),
  ];

  for (const ringPath of candidateRingFiles) {
    if (fs.existsSync(ringPath)) {
      try {
        const fileContent = fs.readFileSync(ringPath, 'utf8');
        const parsed = JSON.parse(fileContent);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item.keyId && !result.some((r) => r.keyId === item.keyId)) {
              let publicKeyPem = item.publicKeyPem;
              let publicKeyHex = item.publicKeyHex || '';
              if (!publicKeyPem && item.publicKeyPath) {
                // Historical keyring JSON can persist old absolute /app/uploads/keys paths.
                const legacyRoot = path.join(process.cwd(), 'uploads', 'keys') + path.sep;
                const fallback = process.env.NODE_ENV === 'production' &&
                  item.publicKeyPath.startsWith(legacyRoot)
                  ? path.join(KEYS_DIR, path.basename(item.publicKeyPath))
                  : item.publicKeyPath;
                if (fs.existsSync(fallback)) publicKeyPem = fs.readFileSync(fallback, 'utf8');
              }
              if (publicKeyPem) {
                try {
                  const pubKeyObj = crypto.createPublicKey(publicKeyPem);
                  publicKeyHex = pubKeyObj.export({ type: 'spki', format: 'der' }).toString('hex');
                } catch {}
              }

              if (publicKeyPem) {
                result.push({
                  keyId: item.keyId,
                  publicKeyPem,
                  publicKeyHex,
                  isCurrent: Boolean(item.isCurrent),
                  status: item.status || 'transitional',
                  description: item.description || 'Geçiş Dönemi Anahtarı',
                  createdAt: item.createdAt,
                  notAfter: item.notAfter,
                });
              }
            }
          }
        }
      } catch (err: any) {
        console.warn(`[OTA KeyRing] ${ringPath} okunamadı:`, err.message);
      }
    }
  }

  return result;
}

/**
 * Resolves a public key by keyId from the active key or trusted key ring
 */
export function getPublicKeyByKeyId(keyId?: string): { keyId: string; publicKeyPem: string; isCurrent: boolean } | null {
  const trustedList = getTrustedPublicKeys();
  if (!keyId) {
    const current = trustedList.find((k) => k.isCurrent) || trustedList[0];
    return current ? { keyId: current.keyId, publicKeyPem: current.publicKeyPem, isCurrent: current.isCurrent } : null;
  }

  const found = trustedList.find((k) => k.keyId === keyId);
  if (found) {
    return { keyId: found.keyId, publicKeyPem: found.publicKeyPem, isCurrent: found.isCurrent };
  }

  return null;
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

/**
 * Signs a binary buffer using the active Ed25519 private key and returns the signature, hash, and keyId
 */
export function signBinaryBuffer(buffer: Buffer): {
  sha256: string;
  signatureHex: string;
  keyId: string;
  publicKeyPem: string;
} {
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const keyPair = getEd25519KeyPair();
  
  const signatureBuffer = crypto.sign(null, buffer, keyPair.privateKeyPem);
  const signatureHex = signatureBuffer.toString('hex');

  return {
    sha256,
    signatureHex,
    keyId: keyPair.keyId,
    publicKeyPem: keyPair.publicKeyPem,
  };
}

/**
 * Verifies a binary buffer's Ed25519 signature.
 * If keyId is specified, verifies against that specific key from the trusted key ring.
 * If keyId is omitted, verifies against active key, then falls back to transitional keys.
 */
export function verifyBinarySignature(buffer: Buffer, signatureHex: string, keyId?: string): boolean {
  try {
    const signatureBuffer = Buffer.from(signatureHex, 'hex');

    if (keyId) {
      const keyInfo = getPublicKeyByKeyId(keyId);
      if (!keyInfo) return false;
      return crypto.verify(null, buffer, keyInfo.publicKeyPem, signatureBuffer);
    }

    // Try all keys in trusted key ring
    const trustedKeys = getTrustedPublicKeys();
    for (const key of trustedKeys) {
      try {
        if (crypto.verify(null, buffer, key.publicKeyPem, signatureBuffer)) {
          return true;
        }
      } catch {
        // Try next key in ring
      }
    }

    return false;
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
    // Legacy DB metadata stores absolute paths under /app/uploads/firmware.
    // Following the operator's one-time copy into the persistent volume, resolve these paths.
    const legacyPrefix = path.join(process.cwd(), 'uploads', 'firmware') + path.sep;
    if (process.env.NODE_ENV === 'production' && filePath.startsWith(legacyPrefix)) {
      const migratedPath = path.join(FIRMWARE_STORAGE_DIR, path.basename(filePath));
      if (fs.existsSync(migratedPath)) return fs.readFileSync(migratedPath);
    }
  } catch {
    // Ignore
  }
  return null;
}
