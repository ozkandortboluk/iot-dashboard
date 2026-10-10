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
  candidateVaultPaths?: string[];
  targetPasswordPath?: string;
  allowEmpty?: boolean;
}

export function recoverDatabasePasswordFromVault(options?: MigrateSecretOptions): { success: boolean; error?: string; recoveredFrom?: string } {
  const rootDir = process.cwd();
  const encKeyFile = options?.encryptionKeyPath || path.resolve(rootDir, 'secrets', 'encryption_key');
  const targetFile = options?.targetPasswordPath || path.resolve(rootDir, 'secrets', 'postgres_password');

  // Determine candidate vault files to inspect in priority order
  const candidateFiles: string[] = [];
  if (options?.candidateVaultPaths && options.candidateVaultPaths.length > 0) {
    candidateFiles.push(...options.candidateVaultPaths);
  } else if (options?.vaultFilePath) {
    candidateFiles.push(options.vaultFilePath);
  } else {
    // Default search order: check app_data volume extraction path if present, then host ./data/.system_secrets.json
    candidateFiles.push(path.resolve(rootDir, 'data', '.system_secrets.json'));
  }

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

  const rootKeyBuffer = Buffer.from(rootKeyHex, 'hex');

  // 2. Locate authoritative candidate vault containing database.password
  let existingVaultFile: string | undefined;
  let dbSecretRecord: any;

  for (const file of candidateFiles) {
    if (!fs.existsSync(file)) continue;
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed?.secrets?.['database.password']?.encryptedValue) {
        existingVaultFile = file;
        dbSecretRecord = parsed.secrets['database.password'];
        break;
      }
    } catch {}
  }

  if (!existingVaultFile || !dbSecretRecord) {
    // If no candidate vault yielded database.password, check environment variables as fallback
    const envPass = process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || process.env.SQL_ADMIN_PASSWORD;
    if (envPass && envPass.trim()) {
      const plainPass = envPass.trim();
      const targetDir = path.dirname(targetFile);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });
      }
      const tempFile = path.join(targetDir, `.postgres_password.tmp.${crypto.randomBytes(6).toString('hex')}`);
      try {
        fs.writeFileSync(tempFile, plainPass, { mode: 0o600, encoding: 'utf8' });
        fs.chmodSync(tempFile, 0o600);
        fs.renameSync(tempFile, targetFile);
        fs.chmodSync(targetFile, 0o600);
      } catch (err: any) {
        return { success: false, error: `Parola dosyası yazılamadı: ${err?.message || 'I/O hatası'}` };
      }
      return { success: true, recoveredFrom: 'environment' };
    }

    return {
      success: false,
      error: `Authoritative Vault kasasında 'database.password' kaydı bulunamadı. Denenen yollar: ${candidateFiles.join(', ')}`
    };
  }

  let decryptedPassword = '';
  try {
    const ciphertext = dbSecretRecord.encryptedValue;
    const parts = ciphertext.split(':');
    if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') {
      return {
        success: false,
        error: `Bilinmeyen veya geçersiz şifreli veri formatı (${existingVaultFile}).`
      };
    }

    const iv = Buffer.from(parts[2], 'hex');
    const authTag = Buffer.from(parts[3], 'hex');
    const encryptedHex = parts[4];

    const decipher = crypto.createDecipheriv('aes-256-gcm', rootKeyBuffer, iv);
    decipher.setAuthTag(authTag);
    let dec = decipher.update(encryptedHex, 'hex', 'utf8');
    dec += decipher.final('utf8');

    if (!dec || dec.trim().length === 0) {
      return {
        success: false,
        error: `Çözülen veritabanı parolası boş (${existingVaultFile}).`
      };
    }

    decryptedPassword = dec.trim();
  } catch (err: any) {
    return {
      success: false,
      error: `Veritabanı parolası çözülemedi (${existingVaultFile}): ${err?.message || 'Şifre çözme hatası'}`
    };
  }

  // 3. Atomically write to target password file with 0600 mode
  const targetDir = path.dirname(targetFile);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });
  }

  const tempFile = path.join(targetDir, `.postgres_password.tmp.${crypto.randomBytes(6).toString('hex')}`);
  try {
    fs.writeFileSync(tempFile, decryptedPassword, { mode: 0o600, encoding: 'utf8' });
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

  return { success: true, recoveredFrom: existingVaultFile };
}

// CLI Execution Support
if (process.argv[1] && (process.argv[1].endsWith('migrate-vault-secret.ts') || process.argv[1].endsWith('migrate-vault-secret.cjs') || process.argv[1].endsWith('migrate-vault-secret.js'))) {
  const args = process.argv.slice(2);
  let vaultPath: string | undefined;
  let keyPath: string | undefined;
  let targetPath: string | undefined;
  let candidateList: string[] | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--vault' && args[i + 1]) {
      vaultPath = args[++i];
    } else if (args[i] === '--key' && args[i + 1]) {
      keyPath = args[++i];
    } else if (args[i] === '--target' && args[i + 1]) {
      targetPath = args[++i];
    } else if (args[i] === '--candidates' && args[i + 1]) {
      candidateList = args[++i].split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  const result = recoverDatabasePasswordFromVault({
    vaultFilePath: vaultPath,
    encryptionKeyPath: keyPath,
    targetPasswordPath: targetPath,
    candidateVaultPaths: candidateList
  });

  if (result.success) {
    console.log(`✅ [Vault Secret Migration] Veritabanı parolası Vault kasasından başarıyla kurtarıldı (${result.recoveredFrom || 'authoritative vault'}).`);
    process.exit(0);
  } else {
    console.error(`❌ [Vault Secret Migration Hatası]: ${result.error}`);
    process.exit(1);
  }
}
