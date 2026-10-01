import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

/**
 * Strictly verifies a password against a valid bcrypt hash ($2a$, $2b$, $2y$, $2$).
 * Plaintext password hashes are STRICTLY REJECTED to prevent fallback vulnerabilities.
 */
export function verifyPassword(password: string, hash: string): boolean {
  if (!hash || typeof hash !== 'string') return false;
  if (!hash.startsWith('$2a$') && !hash.startsWith('$2b$') && !hash.startsWith('$2y$') && !hash.startsWith('$2$')) {
    return false;
  }
  return bcrypt.compareSync(password, hash);
}

/**
 * Validates a user password during login and determines whether a legacy non-bcrypt password
 * needs a one-time migration to bcrypt.
 */
export function verifyAndMigratePassword(password: string, hash: string): { isValid: boolean; needsMigration: boolean } {
  if (!hash || typeof hash !== 'string') return { isValid: false, needsMigration: false };
  if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$') || hash.startsWith('$2$')) {
    return { isValid: bcrypt.compareSync(password, hash), needsMigration: false };
  }
  // One-time legacy plaintext verification for auto-migration to bcrypt
  const isValid = password === hash;
  return { isValid, needsMigration: isValid };
}

// ============================================================================
// AES-256-GCM SECURE VAULT ENCRYPTION INFRASTRUCTURE
// ============================================================================

const DOCKER_SECRET_KEY_PATH = '/run/secrets/encryption_key';
const DEDICATED_SECRETS_KEY_PATH = path.resolve(process.cwd(), 'secrets', 'encryption_key');
const LOCAL_VAULT_KEY_PATH = path.resolve(process.cwd(), 'data', '.vault_key');

let cachedKeyBuffer: Buffer | null = null;
let keySourceDescription = 'none';

export function resetEncryptionKeyCache(): void {
  cachedKeyBuffer = null;
  keySourceDescription = 'none';
}

/**
 * Resolves the 256-bit (32-byte) AES master key from strictly non-predictable sources:
 * 1. Environment variable: process.env.ENCRYPTION_KEY
 * 2. Production Docker Secret: /run/secrets/encryption_key or dedicated secrets mount: secrets/encryption_key
 * 3. File path: process.env.ENCRYPTION_KEY_PATH or process.env.ENCRYPTION_KEY_FILE
 * 4. Local standalone key file: data/.vault_key (strictly isolated from DB, gitignored, mode 0600 - dev/test only)
 *
 * CRITICAL SECURITY CONSTRAINTS:
 * - NO predictable or hardcoded fallback keys.
 * - In production: if no key is supplied via env, Docker secret, or dedicated secrets mount, returns null and marks Vault as UNCONFIGURED.
 * - In development/test: if no key exists, generates a cryptographic 32-byte random key and stores it in data/.vault_key (0600).
 */
export function resolveEncryptionKey(): Buffer | null {
  if (cachedKeyBuffer) {
    return cachedKeyBuffer;
  }

  // 1. Environment variable override
  const envKey = (process.env.ENCRYPTION_KEY || '').trim();
  if (envKey) {
    cachedKeyBuffer = derive32ByteKey(envKey);
    keySourceDescription = 'env:ENCRYPTION_KEY';
    return cachedKeyBuffer;
  }

  // 2. Production Docker Secret (/run/secrets/encryption_key or /app/secrets/encryption_key)
  try {
    if (fs.existsSync(DOCKER_SECRET_KEY_PATH)) {
      const secretRaw = fs.readFileSync(DOCKER_SECRET_KEY_PATH, 'utf8').trim();
      if (secretRaw) {
        cachedKeyBuffer = derive32ByteKey(secretRaw);
        keySourceDescription = 'docker_secret:/run/secrets/encryption_key';
        return cachedKeyBuffer;
      }
    }
  } catch {}

  try {
    if (fs.existsSync(DEDICATED_SECRETS_KEY_PATH)) {
      const secretRaw = fs.readFileSync(DEDICATED_SECRETS_KEY_PATH, 'utf8').trim();
      if (secretRaw) {
        cachedKeyBuffer = derive32ByteKey(secretRaw);
        keySourceDescription = 'file:secrets/encryption_key';
        return cachedKeyBuffer;
      }
    }
  } catch {}

  // 3. Custom path via ENCRYPTION_KEY_PATH or ENCRYPTION_KEY_FILE
  const keyPath = process.env.ENCRYPTION_KEY_PATH || process.env.ENCRYPTION_KEY_FILE;
  if (keyPath) {
    try {
      if (fs.existsSync(keyPath)) {
        const fileRaw = fs.readFileSync(keyPath, 'utf8').trim();
        if (fileRaw) {
          cachedKeyBuffer = derive32ByteKey(fileRaw);
          keySourceDescription = `file:${keyPath}`;
          return cachedKeyBuffer;
        }
      }
    } catch {}
  }

  // ==========================================================================
  // PRODUCTION SECURITY BOUNDARY:
  // In production (NODE_ENV=production or VPS_PRODUCTION=true), the encryption key
  // MUST NOT be generated or co-located inside the shared data volume (data/.vault_key).
  // It MUST be supplied via ENCRYPTION_KEY environment variable or a dedicated
  // Docker secret mount (/run/secrets/encryption_key).
  // If not configured, returns null (causing fail-closed startup or explicit vault error).
  // ==========================================================================
  const isProd = process.env.NODE_ENV === 'production' || process.env.VPS_PRODUCTION === 'true';
  if (isProd) {
    return null;
  }

  // 4. Standalone protected vault key file (data/.vault_key) for dev / local / test only
  try {
    if (fs.existsSync(LOCAL_VAULT_KEY_PATH)) {
      const localRaw = fs.readFileSync(LOCAL_VAULT_KEY_PATH, 'utf8').trim();
      if (localRaw) {
        cachedKeyBuffer = derive32ByteKey(localRaw);
        keySourceDescription = 'local_file:data/.vault_key';
        return cachedKeyBuffer;
      }
    }
  } catch {}

  // 5. Bootstrap a high-entropy 256-bit random key isolated in data/.vault_key (DEVELOPMENT / TEST ONLY)
  try {
    const dataDir = path.dirname(LOCAL_VAULT_KEY_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    }
    const bootstrapKey = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(LOCAL_VAULT_KEY_PATH, bootstrapKey, {
      encoding: 'utf8',
      mode: 0o600,
    });
    try {
      fs.chmodSync(LOCAL_VAULT_KEY_PATH, 0o600);
    } catch {}

    cachedKeyBuffer = derive32ByteKey(bootstrapKey);
    keySourceDescription = 'bootstrap_generated:data/.vault_key';
    return cachedKeyBuffer;
  } catch (err) {
    // Ephemeral in-memory fallback for read-only sandboxes in test
    cachedKeyBuffer = crypto.randomBytes(32);
    keySourceDescription = 'ephemeral_memory';
    return cachedKeyBuffer;
  }
}

/**
 * Derives a strict 32-byte (256-bit) Buffer from a string using SHA-256
 */
function derive32ByteKey(raw: string): Buffer {
  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

/**
 * Checks if the Secret Vault is configured with an active encryption key
 */
export function isVaultConfigured(): boolean {
  return resolveEncryptionKey() !== null;
}

/**
 * Returns diagnostic metadata regarding vault key status (never revealing the key)
 */
export function getVaultStatus(): {
  configured: boolean;
  source: string;
  isProduction: boolean;
  message?: string;
} {
  const isConfigured = isVaultConfigured();
  return {
    configured: isConfigured,
    source: keySourceDescription,
    isProduction: process.env.NODE_ENV === 'production',
    message: isConfigured
      ? 'Secret Vault AES-256-GCM şifreleme anahtarı aktif.'
      : 'Secret Vault yapılandırılmamış: ENCRYPTION_KEY veya /run/secrets/encryption_key tanımlanmalıdır.',
  };
}

/**
 * Resets cached key for testing
 */
export function resetKeyCacheForTesting(): void {
  cachedKeyBuffer = null;
  keySourceDescription = 'none';
}

/**
 * Options for decryptSecret
 */
export interface DecryptSecretOptions {
  allowLegacyPlaintext?: boolean;
  context?: string;
}

/**
 * Encrypts a sensitive string (API token, secret header, bot token) using AES-256-GCM.
 * Throws in production if Secret Vault is not configured.
 */
export function encryptSecret(plainText?: string): string {
  if (!plainText || !plainText.trim()) return '';
  if (plainText.startsWith('enc:v1:')) return plainText; // already encrypted

  const key = resolveEncryptionKey();
  if (!key) {
    throw new Error('Secret Vault yapılandırılmamış: ENCRYPTION_KEY ortam değişkeni veya /run/secrets/encryption_key tanımlanmalıdır.');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `enc:v1:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted secret.
 * Rejects silent unencrypted plaintext in production unless explicitly allowed during controlled migration.
 */
export function decryptSecret(cipherText?: string, options?: DecryptSecretOptions): string {
  if (!cipherText || !cipherText.trim()) return '';

  if (cipherText.startsWith('enc:v1:')) {
    const key = resolveEncryptionKey();
    if (!key) {
      if (process.env.NODE_ENV === 'production') {
        console.warn('[Security Warning] Secret Vault yapılandırılmamış (ENCRYPTION_KEY eksik). Şifreli veri çözülemiyor.');
      }
      return '';
    }

    try {
      const parts = cipherText.split(':');
      if (parts.length !== 5) return '';
      const [, , ivHex, authTagHex, encryptedHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      // Optional fallback for controlled key migration if LEGACY_ENCRYPTION_KEY is provided
      if (process.env.LEGACY_ENCRYPTION_KEY) {
        try {
          const legacyKey = derive32ByteKey(process.env.LEGACY_ENCRYPTION_KEY);
          const parts = cipherText.split(':');
          const [, , ivHex, authTagHex, encryptedHex] = parts;
          const decipher = crypto.createDecipheriv('aes-256-gcm', legacyKey, Buffer.from(ivHex, 'hex'));
          decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
          let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          return decrypted;
        } catch {}
      }
      return '';
    }
  }

  // Not starting with 'enc:v1:' (Plaintext legacy value)
  if (options?.allowLegacyPlaintext) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(`[Security Migration] Şifrelenmemiş (plaintext) secret kontrollü migration ile okundu (${options.context || 'legacy_migration'}). Vault'a şifrelenmeli.`);
    }
    return cipherText;
  }

  // In production: Reject unencrypted plaintext values
  if (process.env.NODE_ENV === 'production') {
    console.error(`[Security Violation] Şifrelenmemiş (plaintext) secret algılandı ve reddedildi (${options?.context || 'legacy_unencrypted_secret'}). Tüm secretlar 'enc:v1:' formatında olmalıdır.`);
    return '';
  }

  // In development/test mode: allow legacy plaintext with warning
  return cipherText;
}

/**
 * Masks a sensitive secret so that only the last 4 characters are visible (••••••••son4),
 * or returns empty string if no secret is present.
 */
export function maskSecret(secret?: string): string {
  if (!secret || !secret.trim()) return '';
  const trimmed = secret.trim();

  let raw = trimmed;
  if (trimmed.startsWith('enc:v1:')) {
    raw = decryptSecret(trimmed).trim();
  }

  if (!raw) return '';
  if (raw.length <= 4) {
    return '••••••••';
  }
  return `••••••••${raw.slice(-4)}`;
}

/**
 * Checks if a value is a masked string (e.g. contains •••• or ****)
 */
export function isMaskedSecret(val?: string): boolean {
  if (!val) return false;
  return val.includes('••••') || val.includes('****') || val.startsWith('••••••••') || val.startsWith('********');
}

/**
 * Comprehensive log & error message sanitizer.
 * Masks database passwords in connection strings, Resend tokens, SMTP passwords,
 * Telegram/WhatsApp bot tokens, Authorization headers, setup tokens, and private keys.
 */
export function sanitizeLogString(str?: string): string {
  if (!str || typeof str !== 'string') return '';
  return str
    // 1. Mask postgresql://user:password@host (handles passwords with @ or special characters)
    .replace(/(postgres(?:ql)?:\/\/[^:\/\s"']+?:)(.+)(@[a-zA-Z0-9_.-]+(?::\d+)?(?:\/[^\s?]*)?(?:\?[^\s]*)?)/gi, '$1••••••••$3')
    // 2. Mask Resend API keys & Service Tokens
    .replace(/re_[a-zA-Z0-9_-]{10,}/g, 're_••••••••')
    .replace(/nxs_srv_[a-zA-Z0-9_-]{10,}/g, 'nxs_srv_••••••••')
    // 3. Mask Telegram & WhatsApp bot tokens
    .replace(/\b\d{6,12}:[a-zA-Z0-9_-]{20,}\b/g, '••••••••:••••••••')
    // 4. Mask Authorization & Bearer / Basic headers
    .replace(/(Authorization:\s*(?:Bearer|Basic)\s+)[^\s"']+/gi, '$1••••••••')
    .replace(/(Bearer\s+)[a-zA-Z0-9_.-]{12,}/gi, '$1••••••••')
    // 5. Mask explicit password/secret/token key-value assignments
    .replace(/(password|passwd|pass|secret|smtpPass|smtp_pass|api_key|apikey|private_key|privateKey|setup_token|recovery_token)\s*[:=]\s*["']?([^"'\s,}{]+)["']?/gi, (match, p1, p2) => {
      if (isMaskedSecret(p2)) return match;
      return `${p1}=••••••••`;
    })
    // 6. Redact PEM Private Keys
    .replace(/-----BEGIN (?:RSA|EC|DSA|ED25519|OPENSSH|PRIVATE) KEY-----[\s\S]*?-----END (?:RSA|EC|DSA|ED25519|OPENSSH|PRIVATE) KEY-----/g, '[REDACTED PRIVATE KEY]');
}
