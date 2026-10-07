#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { decryptSecret } from '../src/server/utils/crypto.js';

/**
 * NexusNode IoT - One-Shot Secret Migration & Vault Recovery Helper
 * 
 * Safely recovers database.password from Central Security Vault (.system_secrets.json)
 * and writes it atomically to host secrets/postgres_password with mode 0600.
 * 
 * Security Guarantees:
 * - Passwords are NEVER printed to stdout, stderr, logs, or exit messages.
 * - Files are written atomically using a temporary file with 0600 permissions.
 * - Rejects any non-64 hex root key (strictly fail-closed).
 */

export interface MigrateSecretOptions {
  encryptionKeyPath?: string;
  vaultFilePath?: string;
  targetPasswordPath?: string;
  allowEmpty?: boolean;
}

export function recoverDatabasePasswordFromVault(options?: MigrateSecretOptions): { success: boolean; error?: string } {
  const rootDir = process.cwd();
  const encKeyFile = options?.encryptionKeyPath || path.resolve(rootDir, 'secrets', 'encryption_key');
  const vaultFile = options?.vaultFilePath || path.resolve(rootDir, 'data', '.system_secrets.json');
  const targetFile = options?.targetPasswordPath || path.resolve(rootDir, 'secrets', 'postgres_password');

  // 1. Resolve Root Encryption Key
  let rootKeyHex = '';
  if (fs.existsSync(encKeyFile)) {
    rootKeyHex = fs.readFileSync(encKeyFile, 'utf8').trim();
  } else if (process.env.ENCRYPTION_KEY) {
    rootKeyHex = process.env.ENCRYPTION_KEY.trim();
  }

  if (!rootKeyHex || !/^[0-9a-fA-F]{64}$/.test(rootKeyHex)) {
    return {
      success: false,
      error: 'Geçersiz veya eksik ENCRYPTION_KEY: Root key tam 64 hexadecimal karakter (256-bit) olmalıdır.'
    };
  }

  // 2. Locate and Parse Vault
  if (!fs.existsSync(vaultFile)) {
    return {
      success: false,
      error: `Vault dosyası bulunamadı (${vaultFile}).`
    };
  }

  let vaultData: any;
  try {
    const raw = fs.readFileSync(vaultFile, 'utf8');
    vaultData = JSON.parse(raw);
  } catch (err: any) {
    return {
      success: false,
      error: `Vault dosyası okunamadı veya JSON geçersiz: ${err?.message || 'Bilinmeyen hata'}`
    };
  }

  const dbSecretRecord = vaultData?.secrets?.['database.password'];
  if (!dbSecretRecord || !dbSecretRecord.encryptedValue) {
    return {
      success: false,
      error: 'Vault kasasında database.password kaydı bulunamadı.'
    };
  }

  // 3. Decrypt the password using AES-256-GCM
  let decryptedPassword = '';
  try {
    const rootKeyBuffer = Buffer.from(rootKeyHex, 'hex');
    const ciphertext = dbSecretRecord.encryptedValue;
    const parts = ciphertext.split(':');
    if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') {
      return {
        success: false,
        error: 'Bilinmeyen veya geçersiz şifreli veri formatı (enc:v1 bekleniyor).'
      };
    }

    const iv = Buffer.from(parts[2], 'hex');
    const authTag = Buffer.from(parts[3], 'hex');
    const encryptedHex = parts[4];

    const decipher = crypto.createDecipheriv('aes-256-gcm', rootKeyBuffer, iv);
    decipher.setAuthTag(authTag);
    let dec = decipher.update(encryptedHex, 'hex', 'utf8');
    dec += decipher.final('utf8');
    decryptedPassword = dec;
  } catch (err: any) {
    return {
      success: false,
      error: `Veritabanı parolası çözülemedi: ${err?.message || 'Şifre çözme hatası'}`
    };
  }

  if (!decryptedPassword || decryptedPassword.trim().length === 0) {
    return {
      success: false,
      error: 'Çözülen veritabanı parolası boş.'
    };
  }

  // 4. Atomically write to target password file with 0600 mode
  const targetDir = path.dirname(targetFile);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });
  }

  const tempFile = path.join(targetDir, `.postgres_password.tmp.${crypto.randomBytes(6).toString('hex')}`);
  try {
    fs.writeFileSync(tempFile, decryptedPassword.trim(), { mode: 0o600, encoding: 'utf8' });
    fs.chmodSync(tempFile, 0o600);
    fs.renameSync(tempFile, targetFile);
    fs.chmodSync(targetFile, 0o600);
  } catch (err: any) {
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch {}
    return {
      success: false,
      error: `Parola dosyası yazılamadı: ${err?.message || 'I/O hatası'}`
    };
  }

  return { success: true };
}

// CLI Execution Support
if (process.argv[1] && (process.argv[1].endsWith('migrate-vault-secret.ts') || process.argv[1].endsWith('migrate-vault-secret.cjs') || process.argv[1].endsWith('migrate-vault-secret.js'))) {
  const result = recoverDatabasePasswordFromVault();
  if (result.success) {
    console.log('✅ [Vault Secret Migration] Veritabanı parolası Vault kasasından başarıyla kurtarıldı ve mühürlendi.');
    process.exit(0);
  } else {
    console.error(`❌ [Vault Secret Migration Hatası]: ${result.error}`);
    process.exit(1);
  }
}
