import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  if (!hash.startsWith('$2')) {
    return password === hash;
  }
  return bcrypt.compareSync(password, hash);
}

// AES-256-GCM Encryption Key Derivation for Secure Notification Vault
const MASTER_SECRET = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || 'nexus_iot_secure_notification_secret_key_2026_salt';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(MASTER_SECRET).digest();

/**
 * Encrypts a sensitive string (API token, secret header, bot token) using AES-256-GCM
 */
export function encryptSecret(plainText?: string): string {
  if (!plainText || !plainText.trim()) return '';
  if (plainText.startsWith('enc:v1:')) return plainText; // already encrypted

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `enc:v1:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted secret or returns plain text if not encrypted
 */
export function decryptSecret(cipherText?: string): string {
  if (!cipherText || !cipherText.trim()) return '';
  if (!cipherText.startsWith('enc:v1:')) return cipherText; // not encrypted / plain

  try {
    const parts = cipherText.split(':');
    if (parts.length !== 5) return cipherText;
    const [, , ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Decryption failed for secret:', err);
    return '';
  }
}

/**
 * Masks a sensitive secret so that only the last 4 characters are visible (••••••••son4),
 * or returns empty string if no secret is present.
 */
export function maskSecret(secret?: string): string {
  if (!secret || !secret.trim()) return '';
  const raw = decryptSecret(secret).trim();
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

