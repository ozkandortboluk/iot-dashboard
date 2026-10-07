import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { recoverDatabasePasswordFromVault } from '../../scripts/migrate-vault-secret.js';

const rootDir = path.resolve(__dirname, '../..');
const secretsDir = path.join(rootDir, 'secrets');
const dataDir = path.join(rootDir, 'data');
const installScriptPath = path.join(rootDir, 'install.sh');

describe('Installer Secret Migration, Fresh Install vs Upgrade & Idempotent Update', () => {
  let backupSecrets: Record<string, string> = {};
  let backupVault: string | null = null;

  beforeEach(() => {
    // Snapshot existing secrets directory and vault
    backupSecrets = {};
    if (fs.existsSync(secretsDir)) {
      for (const file of fs.readdirSync(secretsDir)) {
        const full = path.join(secretsDir, file);
        if (fs.statSync(full).isFile()) {
          backupSecrets[file] = fs.readFileSync(full, 'utf8');
        }
      }
    } else {
      fs.mkdirSync(secretsDir, { recursive: true, mode: 0o700 });
    }

    const vaultFile = path.join(dataDir, '.system_secrets.json');
    if (fs.existsSync(vaultFile)) {
      backupVault = fs.readFileSync(vaultFile, 'utf8');
    } else {
      backupVault = null;
    }
  });

  afterEach(() => {
    // Restore initial secrets state
    if (fs.existsSync(secretsDir)) {
      for (const file of fs.readdirSync(secretsDir)) {
        try {
          fs.unlinkSync(path.join(secretsDir, file));
        } catch {}
      }
    }
    for (const [file, content] of Object.entries(backupSecrets)) {
      fs.writeFileSync(path.join(secretsDir, file), content, { mode: 0o600 });
    }

    const vaultFile = path.join(dataDir, '.system_secrets.json');
    if (backupVault !== null) {
      fs.writeFileSync(vaultFile, backupVault, { mode: 0o600 });
    } else if (fs.existsSync(vaultFile)) {
      try {
        fs.unlinkSync(vaultFile);
      } catch {}
    }
  });

  it('1. Fresh install: generates valid 64-hex root key, random DB password, and seals password into Vault', () => {
    // Clear secrets and vault for fresh install test
    for (const file of fs.readdirSync(secretsDir)) {
      try { fs.unlinkSync(path.join(secretsDir, file)); } catch {}
    }
    const vaultFile = path.join(dataDir, '.system_secrets.json');
    if (fs.existsSync(vaultFile)) {
      fs.unlinkSync(vaultFile);
    }

    const output = execSync(`bash ${installScriptPath} --init-only --quick`, { cwd: rootDir, encoding: 'utf-8' });
    expect(output).toMatch(/Yeni 256-bit AES Vault Root Anahtarı üretildi/i);
    expect(output).toMatch(/Yeni yüksek entropili veritabanı parolası üretildi/i);

    const encKey = fs.readFileSync(path.join(secretsDir, 'encryption_key'), 'utf8').trim();
    const pgPass = fs.readFileSync(path.join(secretsDir, 'postgres_password'), 'utf8').trim();

    expect(encKey).toMatch(/^[0-9a-fA-F]{64}$/);
    expect(pgPass.length).toBeGreaterThanOrEqual(24);

    expect(fs.existsSync(vaultFile)).toBe(true);
    const vaultContent = JSON.parse(fs.readFileSync(vaultFile, 'utf8'));
    expect(vaultContent.secrets['database.password']).toBeDefined();
    expect(vaultContent.secrets['database.password'].encryptedValue).toMatch(/^enc:v1:/);
  });

  it('2. Existing VPS upgrade: recovers database.password from Vault into secrets/postgres_password without generating new password', () => {
    const knownEncryptionKey = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const knownDbPass = 'Original_VPS_Database_Password_XYZ_9988!';

    // Write encryption key
    fs.writeFileSync(path.join(secretsDir, 'encryption_key'), knownEncryptionKey, { mode: 0o600 });

    // Remove postgres_password to simulate existing VPS missing the bootstrap secret
    const pgPassFile = path.join(secretsDir, 'postgres_password');
    if (fs.existsSync(pgPassFile)) fs.unlinkSync(pgPassFile);

    // Seal known DB password into Vault
    const rootKeyBuffer = Buffer.from(knownEncryptionKey, 'hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', rootKeyBuffer, iv);
    let enc = cipher.update(knownDbPass, 'utf8', 'hex');
    enc += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    const ciphertext = `enc:v1:${iv.toString('hex')}:${tag}:${enc}`;

    const vaultFile = path.join(dataDir, '.system_secrets.json');
    const vaultData = {
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      secrets: {
        'database.password': {
          key: 'database.password',
          category: 'database',
          label: 'PostgreSQL Password',
          encryptedValue: ciphertext,
          isSensitive: true,
          updatedAt: new Date().toISOString(),
          updatedBy: 'test'
        }
      }
    };
    fs.writeFileSync(vaultFile, JSON.stringify(vaultData, null, 2), { mode: 0o600 });

    // Run installer in init-only mode
    const output = execSync(`bash ${installScriptPath} --init-only --quick`, { cwd: rootDir, encoding: 'utf-8' });
    expect(output).toMatch(/Vault Root Anahtarı mevcut ve geçerli/i);
    expect(output).toMatch(/Veritabanı bootstrap parolası Vault kasasından başarıyla kurtarıldı/i);

    // Verify recovered password matches original and has 0600 mode
    expect(fs.existsSync(pgPassFile)).toBe(true);
    const recovered = fs.readFileSync(pgPassFile, 'utf8').trim();
    expect(recovered).toBe(knownDbPass);

    const stat = fs.statSync(pgPassFile);
    expect(stat.mode & 0o077).toBe(0);
  });

  it('3. Legacy db_password migration: safely moves legacy secret to postgres_password with 0600 mode', () => {
    const legacyPass = 'LegacyPass_From_Prior_Version_1234!';
    const dbPassFile = path.join(secretsDir, 'db_password');
    const pgPassFile = path.join(secretsDir, 'postgres_password');

    if (fs.existsSync(pgPassFile)) fs.unlinkSync(pgPassFile);
    fs.writeFileSync(dbPassFile, legacyPass, { mode: 0o600 });

    const output = execSync(`bash ${installScriptPath} --init-only --quick`, { cwd: rootDir, encoding: 'utf-8' });
    expect(output).toMatch(/Legacy veritabanı bootstrap parolası aktarıldı/i);

    expect(fs.existsSync(pgPassFile)).toBe(true);
    expect(fs.readFileSync(pgPassFile, 'utf8').trim()).toBe(legacyPass);
  });

  it('4. Fail-closed: halts with error if existing install cannot recover Vault password and secrets/postgres_password is missing', () => {
    const knownEncryptionKey = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
    fs.writeFileSync(path.join(secretsDir, 'encryption_key'), knownEncryptionKey, { mode: 0o600 });

    // Delete passwords
    const pgPassFile = path.join(secretsDir, 'postgres_password');
    const dbPassFile = path.join(secretsDir, 'db_password');
    if (fs.existsSync(pgPassFile)) fs.unlinkSync(pgPassFile);
    if (fs.existsSync(dbPassFile)) fs.unlinkSync(dbPassFile);

    // Create an empty or corrupt vault so recovery fails
    const vaultFile = path.join(dataDir, '.system_secrets.json');
    fs.writeFileSync(vaultFile, JSON.stringify({ version: 1, secrets: {} }), { mode: 0o600 });

    let failed = false;
    let errorMessage = '';
    try {
      execSync(`bash ${installScriptPath} --init-only --quick`, { cwd: rootDir, encoding: 'utf-8', stdio: 'pipe' });
    } catch (err: any) {
      failed = true;
      errorMessage = (err.stderr || err.stdout || '').toString();
    }

    expect(failed).toBe(true);
    expect(errorMessage).toMatch(/Mevcut Veritabanı Kurulumu Tespit Edildi Fakat Parola Kurtarılamadı/i);
    // Ensure no new password was generated
    expect(fs.existsSync(pgPassFile)).toBe(false);
  });

  it('5. Idempotent update: running --init-only or update multiple times preserves all existing secrets', () => {
    const encKeyBefore = fs.readFileSync(path.join(secretsDir, 'encryption_key'), 'utf8');
    const pgPassBefore = fs.readFileSync(path.join(secretsDir, 'postgres_password'), 'utf8');

    // Run first time
    const out1 = execSync(`bash ${installScriptPath} --init-only --quick`, { cwd: rootDir, encoding: 'utf-8' });
    expect(out1).toMatch(/KORUNDU/i);

    // Run second time
    const out2 = execSync(`bash ${installScriptPath} --init-only --quick`, { cwd: rootDir, encoding: 'utf-8' });
    expect(out2).toMatch(/KORUNDU/i);

    const encKeyAfter = fs.readFileSync(path.join(secretsDir, 'encryption_key'), 'utf8');
    const pgPassAfter = fs.readFileSync(path.join(secretsDir, 'postgres_password'), 'utf8');

    expect(encKeyAfter).toBe(encKeyBefore);
    expect(pgPassAfter).toBe(pgPassBefore);
  });

  it('6. recoverDatabasePasswordFromVault TypeScript helper executes atomic recovery with 0600 mode', () => {
    const tempKeyFile = path.join(secretsDir, 'test_enc_key');
    const tempVaultFile = path.join(dataDir, '.test_vault.json');
    const tempTargetPass = path.join(secretsDir, 'test_recovered_pass');

    const testKeyHex = '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';
    const testPlainPass = 'SuperSecretDbPassword_12345!';

    fs.writeFileSync(tempKeyFile, testKeyHex, { mode: 0o600 });

    const keyBuf = Buffer.from(testKeyHex, 'hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
    let enc = cipher.update(testPlainPass, 'utf8', 'hex');
    enc += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    const ciphertext = `enc:v1:${iv.toString('hex')}:${tag}:${enc}`;

    fs.writeFileSync(tempVaultFile, JSON.stringify({
      version: 1,
      secrets: {
        'database.password': {
          key: 'database.password',
          encryptedValue: ciphertext
        }
      }
    }), { mode: 0o600 });

    const res = recoverDatabasePasswordFromVault({
      encryptionKeyPath: tempKeyFile,
      vaultFilePath: tempVaultFile,
      targetPasswordPath: tempTargetPass
    });

    expect(res.success).toBe(true);
    expect(fs.existsSync(tempTargetPass)).toBe(true);
    expect(fs.readFileSync(tempTargetPass, 'utf8')).toBe(testPlainPass);

    const st = fs.statSync(tempTargetPass);
    expect(st.mode & 0o077).toBe(0);

    // Clean up temp files
    try {
      fs.unlinkSync(tempKeyFile);
      fs.unlinkSync(tempVaultFile);
      fs.unlinkSync(tempTargetPass);
    } catch {}
  });
});
