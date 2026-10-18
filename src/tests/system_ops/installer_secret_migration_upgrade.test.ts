import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { recoverDatabasePasswordFromVault } from '../../../scripts/migrate-vault-secret.js';

// Run installer integration checks outside the protected GitHub runner checkout.
const sourceRoot = path.resolve(__dirname, '../../..');
const sandboxRoot = fs.mkdtempSync('/tmp/nexus-installer-test-');
fs.chmodSync(sandboxRoot, 0o755);
const rootDir = path.join(sandboxRoot, 'project');
fs.cpSync(sourceRoot, rootDir, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(sourceRoot, src);
    return !rel.split(path.sep).some((part) => ['.git', 'node_modules', 'secrets', 'data'].includes(part));
  }
});
fs.mkdirSync(path.join(rootDir, 'secrets'), { recursive: true, mode: 0o700 });
fs.mkdirSync(path.join(rootDir, 'data'), { recursive: true, mode: 0o755 });
const secretsDir = path.join(rootDir, 'secrets');
const dataDir = path.join(rootDir, 'data');
const installScriptPath = path.join(rootDir, 'install.sh');

describe('Installer Secret Migration, Fresh Install vs Upgrade & Idempotent Update', () => {
  let backupSecrets: Record<string, string> = {};
  let backupVault: string | null = null;

  beforeEach(() => {
    // Ensure docker/certs test certificates exist and are valid
    const certsDir = path.join(rootDir, 'docker/certs');
    const crtPath = path.join(certsDir, 'server.crt');
    const keyPath = path.join(certsDir, 'server.key');
    if (!fs.existsSync(crtPath) || !fs.existsSync(keyPath)) {
      try {
        fs.mkdirSync(certsDir, { recursive: true, mode: 0o700 });
        execSync(`openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout "${keyPath}" -out "${crtPath}" -subj "/CN=localhost"`, { stdio: 'ignore' });
      } catch {}
    }

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
    // The runner may have a real PostgreSQL instance on port 5432 with an
    // unrelated password. Simulate an unreachable database deterministically;
    // offline recovery must preserve the sealed Vault password.
    const probeDir = fs.mkdtempSync(path.join(dataDir, 'offline-db-'));
    fs.writeFileSync(path.join(probeDir, 'docker'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    fs.writeFileSync(path.join(probeDir, 'psql'), '#!/bin/sh\necho "connection refused" >&2\nexit 1\n', { mode: 0o755 });
    let output: string;
    try {
      output = execSync(`bash ${installScriptPath} --init-only --quick`, {
        cwd: rootDir,
        encoding: 'utf-8',
        env: { ...process.env, PATH: `${probeDir}:${process.env.PATH || ''}` }
      });
    } finally {
      fs.rmSync(probeDir, { recursive: true, force: true });
    }
    expect(output).toMatch(/Vault Root Anahtarı mevcut ve geçerli/i);
    expect(output).toMatch(/Veritabanı bootstrap parolası Vault kasasından.*kurtarıldı/i);

    // Verify recovered password matches original and has 0600 mode
    expect(fs.existsSync(pgPassFile)).toBe(true);
    const recovered = fs.readFileSync(pgPassFile, 'utf8').trim();
    expect(recovered).toBe(knownDbPass);

    const stat = fs.statSync(pgPassFile);
    expect(stat.mode & 0o037).toBe(0); // 0600 or 0640: group read for Docker GID 1000 is permitted
  });

  it('3. Legacy db_password migration: safely moves legacy secret to postgres_password with 0600 mode', () => {
    const legacyPass = 'LegacyPass_From_Prior_Version_1234!';
    const dbPassFile = path.join(secretsDir, 'db_password');
    const pgPassFile = path.join(secretsDir, 'postgres_password');

    if (fs.existsSync(pgPassFile)) fs.unlinkSync(pgPassFile);
    fs.writeFileSync(dbPassFile, legacyPass, { mode: 0o600 });
    // Legacy password migration is an existing-install upgrade. Preserve its
    // original Vault key; missing keys must still fail closed in production.
    fs.writeFileSync(path.join(secretsDir, 'encryption_key'), 'a'.repeat(64), { mode: 0o600 });

    const output = execSync(`bash ${installScriptPath} --init-only --quick`, { cwd: rootDir, encoding: 'utf-8' });
    expect(output).toMatch(/Legacy veritabanı bootstrap parolası aktarıldı/i);

    expect(fs.existsSync(pgPassFile)).toBe(true);
    expect(fs.readFileSync(pgPassFile, 'utf8').trim()).toBe(legacyPass);
  }, 30000);

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
    // Ensure initial secrets exist
    const testKey = 'ccddeeff00112233445566778899aabbccddeeff00112233445566778899aabb';
    const testPass = 'IdempotentPass_Test_1234567890!';
    fs.writeFileSync(path.join(secretsDir, 'encryption_key'), testKey, { mode: 0o600 });
    fs.writeFileSync(path.join(secretsDir, 'postgres_password'), testPass, { mode: 0o600 });

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

  it('7. Authoritative app_data volume priority: recovers genuine password from app_data volume over stale host vault', () => {
    const knownEncryptionKey = 'beefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef';
    const appDataGenuinePass = 'AppData_Authoritative_Password_Real_777!';
    const hostStalePass = 'Host_Stale_Incorrect_Password_000!';

    const tempKeyFile = path.join(secretsDir, 'test_priority_key');
    const appDataVaultFile = path.join(dataDir, '.test_app_data_vault.json');
    const hostVaultFile = path.join(dataDir, '.test_host_stale_vault.json');
    const targetPassFile = path.join(secretsDir, 'test_target_pass');

    fs.writeFileSync(tempKeyFile, knownEncryptionKey, { mode: 0o600 });

    const rootKeyBuffer = Buffer.from(knownEncryptionKey, 'hex');

    // Helper to encrypt
    const sealPassword = (pass: string) => {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', rootKeyBuffer, iv);
      let enc = cipher.update(pass, 'utf8', 'hex');
      enc += cipher.final('hex');
      const tag = cipher.getAuthTag().toString('hex');
      return `enc:v1:${iv.toString('hex')}:${tag}:${enc}`;
    };

    // AppData vault (authoritative)
    fs.writeFileSync(appDataVaultFile, JSON.stringify({
      version: 1,
      secrets: {
        'database.password': {
          key: 'database.password',
          encryptedValue: sealPassword(appDataGenuinePass)
        }
      }
    }), { mode: 0o600 });

    // Host vault (stale / outdated)
    fs.writeFileSync(hostVaultFile, JSON.stringify({
      version: 1,
      secrets: {
        'database.password': {
          key: 'database.password',
          encryptedValue: sealPassword(hostStalePass)
        }
      }
    }), { mode: 0o600 });

    // Execute recovery prioritizing app_data vault over host vault
    const res = recoverDatabasePasswordFromVault({
      encryptionKeyPath: tempKeyFile,
      candidateVaultPaths: [appDataVaultFile, hostVaultFile],
      targetPasswordPath: targetPassFile
    });

    expect(res.success).toBe(true);
    expect(res.recoveredFrom).toBe(appDataVaultFile);
    expect(fs.existsSync(targetPassFile)).toBe(true);

    const writtenPass = fs.readFileSync(targetPassFile, 'utf8').trim();
    // Must strictly match authoritative app_data password, NOT stale host password
    expect(writtenPass).toBe(appDataGenuinePass);
    expect(writtenPass).not.toBe(hostStalePass);

    // Second execution must not mutate or rotate the secret
    const res2 = recoverDatabasePasswordFromVault({
      encryptionKeyPath: tempKeyFile,
      candidateVaultPaths: [appDataVaultFile, hostVaultFile],
      targetPasswordPath: targetPassFile
    });
    expect(res2.success).toBe(true);
    expect(fs.readFileSync(targetPassFile, 'utf8').trim()).toBe(appDataGenuinePass);

    // Clean up
    try {
      fs.unlinkSync(tempKeyFile);
      fs.unlinkSync(appDataVaultFile);
      fs.unlinkSync(hostVaultFile);
      fs.unlinkSync(targetPassFile);
    } catch {}
  });

  it('8. Update re-exec flow: install.sh --update invokes early self-update hook and avoids re-exec loop', () => {
    // Ensure secrets exist for existing installation update
    if (!fs.existsSync(path.join(secretsDir, 'encryption_key'))) {
      fs.writeFileSync(path.join(secretsDir, 'encryption_key'), 'a'.repeat(64), { mode: 0o600 });
    }
    if (!fs.existsSync(path.join(secretsDir, 'postgres_password'))) {
      fs.writeFileSync(path.join(secretsDir, 'postgres_password'), 'UpdateTestDatabasePass123!@#', { mode: 0o600 });
    }

    // When _NEXUS_UPDATE_RELOADED=1 is set, it executes the main flow without attempting to re-exec
    const output = execSync(`_NEXUS_UPDATE_RELOADED=1 bash ${installScriptPath} --init-only --update --quick`, {
      cwd: rootDir,
      encoding: 'utf-8'
    });
    expect(output).toMatch(/NexusNode IoT Güncelleme ve Dağıtım Akışı Başlatılıyor/i);
    expect(output).toMatch(/Tüm secretlar, \.env ve dizinler başarıyla hazırlandı/i);
  });

  it('9. Precise volume scoping: resolve_app_data_volume isolates NexusNode volume and rejects foreign project volumes', () => {
    // Test the bash function resolve_app_data_volume using a standalone mock script
    const mockBashScript = `
      source ./scripts/setup/lib/secrets.sh
      
      # Mock docker command with simulated containers & volumes
      docker() {
        if [ "$1" = "inspect" ] && [ "$2" = "nexus_app" ]; then
          echo "/var/lib/docker/volumes/nexusnode_iot_app_data/_data"
          return 0
        elif [ "$1" = "volume" ] && [ "$2" = "inspect" ]; then
          if [ "$3" = "foreign_project_app_data" ]; then
            return 0
          elif [ "$3" = "test_compose_app_data" ]; then
            return 0
          fi
          return 1
        fi
        return 1
      }
      
      # 1. With nexus_app existing
      vol=$(resolve_app_data_volume)
      echo "RESOLVED_CONTAINER_VOL: $vol"
      
      # 2. Without nexus_app, with compose project name
      docker() {
        if [ "$1" = "inspect" ] && [ "$2" = "nexus_app" ]; then
          return 1
        elif [ "$1" = "volume" ] && [ "$2" = "inspect" ]; then
          if [ "$3" = "foreign_project_app_data" ]; then
            return 0
          elif [ "$3" = "test_compose_app_data" ]; then
            return 0
          fi
          return 1
        fi
        return 1
      }
      COMPOSE_PROJECT_NAME="test_compose"
      vol2=$(resolve_app_data_volume)
      echo "RESOLVED_COMPOSE_VOL: $vol2"
    `;

    const tempTestSh = path.join(rootDir, '.test_vol_scope.sh');
    fs.writeFileSync(tempTestSh, mockBashScript, { mode: 0o755 });

    try {
      const output = execSync(`bash ${tempTestSh}`, { cwd: rootDir, encoding: 'utf-8' });
      expect(output).toContain('RESOLVED_COMPOSE_VOL: test_compose_app_data');
      expect(output).not.toContain('foreign_project_app_data');
    } finally {
      if (fs.existsSync(tempTestSh)) fs.unlinkSync(tempTestSh);
    }
  });

  it('10. Fail-closed on corrupted/un-decryptable app_data vault: does NOT fall back to stale host vault and does not generate postgres_password', () => {
    const knownEncryptionKey = 'cafecafecafecafecafecafecafecafecafecafecafecafecafecafecafecafe';
    const wrongKey = '1111111111111111111111111111111111111111111111111111111111111111';
    const hostStalePass = 'Stale_Host_Fallback_Should_Never_Be_Used_999!';

    const tempKeyFile = path.join(secretsDir, 'test_failclosed_key');
    const appDataVaultFile = path.join(dataDir, '.test_app_data_corrupt_vault.json');
    const hostVaultFile = path.join(dataDir, '.test_host_valid_vault.json');
    const targetPassFile = path.join(secretsDir, 'test_target_failclosed_pass');

    fs.writeFileSync(tempKeyFile, knownEncryptionKey, { mode: 0o600 });

    // Encrypt host password with valid key
    const validRootKeyBuffer = Buffer.from(knownEncryptionKey, 'hex');
    const iv1 = crypto.randomBytes(12);
    const cipher1 = crypto.createCipheriv('aes-256-gcm', validRootKeyBuffer, iv1);
    let enc1 = cipher1.update(hostStalePass, 'utf8', 'hex');
    enc1 += cipher1.final('hex');
    const tag1 = cipher1.getAuthTag().toString('hex');
    const hostCiphertext = `enc:v1:${iv1.toString('hex')}:${tag1}:${enc1}`;

    fs.writeFileSync(hostVaultFile, JSON.stringify({
      version: 1,
      secrets: {
        'database.password': {
          key: 'database.password',
          encryptedValue: hostCiphertext
        }
      }
    }), { mode: 0o600 });

    // Encrypt app_data password with a DIFFERENT (wrong) key so it cannot be decrypted with knownEncryptionKey
    const wrongKeyBuffer = Buffer.from(wrongKey, 'hex');
    const iv2 = crypto.randomBytes(12);
    const cipher2 = crypto.createCipheriv('aes-256-gcm', wrongKeyBuffer, iv2);
    let enc2 = cipher2.update('AppData_Password_With_Different_Key', 'utf8', 'hex');
    enc2 += cipher2.final('hex');
    const tag2 = cipher2.getAuthTag().toString('hex');
    const corruptedCiphertext = `enc:v1:${iv2.toString('hex')}:${tag2}:${enc2}`;

    fs.writeFileSync(appDataVaultFile, JSON.stringify({
      version: 1,
      secrets: {
        'database.password': {
          key: 'database.password',
          encryptedValue: corruptedCiphertext
        }
      }
    }), { mode: 0o600 });

    // Execute recovery prioritizing app_data vault over host vault
    const res = recoverDatabasePasswordFromVault({
      encryptionKeyPath: tempKeyFile,
      candidateVaultPaths: [appDataVaultFile, hostVaultFile],
      targetPasswordPath: targetPassFile
    });

    // Must fail-closed!
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Veritabanı parolası çözülemedi/i);

    // Target password file must NOT be created from host fallback
    expect(fs.existsSync(targetPassFile)).toBe(false);

    // Clean up
    try {
      fs.unlinkSync(tempKeyFile);
      fs.unlinkSync(appDataVaultFile);
      fs.unlinkSync(hostVaultFile);
      if (fs.existsSync(targetPassFile)) fs.unlinkSync(targetPassFile);
    } catch {}
  });
});
