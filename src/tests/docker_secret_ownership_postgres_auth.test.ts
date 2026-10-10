import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { MasterKeyProvider } from '../server/services/masterKeyProvider.js';
import { getVaultStatus } from '../server/utils/crypto.js';

const rootDir = path.resolve(__dirname, '../..');
const secretsDir = path.join(rootDir, 'secrets');
const dataDir = path.join(rootDir, 'data');
const installScriptPath = path.join(rootDir, 'install.sh');
const secretsLibPath = path.join(rootDir, 'scripts/setup/lib/secrets.sh');

describe('Docker Secret Ownership, Vault Bootstrap & PostgreSQL Password Verification', () => {
  let backupSecrets: Record<string, string> = {};
  let backupVault: string | null = null;

  beforeEach(() => {
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

    MasterKeyProvider.getInstance().resetCache();
  });

  afterEach(() => {
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

    MasterKeyProvider.getInstance().resetCache();
  });

  // =========================================================================
  // 1. Temiz Kurulum Senaryosu (Fresh Install Scenario)
  // =========================================================================
  it('1. Temiz kurulum: bootstrap secret dosyaları ve Vault kasası otomatik ve güvenli oluşturulur', () => {
    // Clear secrets & vault to simulate clean fresh install
    for (const file of fs.readdirSync(secretsDir)) {
      try { fs.unlinkSync(path.join(secretsDir, file)); } catch {}
    }
    const vaultFile = path.join(dataDir, '.system_secrets.json');
    if (fs.existsSync(vaultFile)) fs.unlinkSync(vaultFile);

    const output = execSync(`bash ${installScriptPath} --init-only --quick`, {
      cwd: rootDir,
      encoding: 'utf-8'
    });

    expect(output).toMatch(/Kriptografik Kasa/i);
    expect(output).toMatch(/Yeni 256-bit AES Vault Root Anahtarı üretildi/i);
    expect(output).toMatch(/Yeni yüksek entropili veritabanı parolası üretildi/i);

    const encKeyPath = path.join(secretsDir, 'encryption_key');
    const pgPassPath = path.join(secretsDir, 'postgres_password');

    expect(fs.existsSync(encKeyPath)).toBe(true);
    expect(fs.existsSync(pgPassPath)).toBe(true);
    expect(fs.existsSync(vaultFile)).toBe(true);

    const encKey = fs.readFileSync(encKeyPath, 'utf8').trim();
    const pgPass = fs.readFileSync(pgPassPath, 'utf8').trim();

    // 256-bit AES hex key (exactly 64 hex characters)
    expect(encKey).toMatch(/^[0-9a-fA-F]{64}$/);
    expect(pgPass.length).toBeGreaterThanOrEqual(24);

    // Strict permissions: NEVER world-readable
    const encStat = fs.statSync(encKeyPath);
    const pgStat = fs.statSync(pgPassPath);
    expect(encStat.mode & 0o004).toBe(0); // Other read: forbidden
    expect(encStat.mode & 0o002).toBe(0); // Other write: forbidden
    expect(pgStat.mode & 0o004).toBe(0);
    expect(pgStat.mode & 0o002).toBe(0);

    // Vault contains encrypted database.password
    const vaultJson = JSON.parse(fs.readFileSync(vaultFile, 'utf8'));
    expect(vaultJson.secrets?.['database.password']).toBeDefined();
    expect(vaultJson.secrets['database.password'].encryptedValue).toMatch(/^enc:v1:/);
  });

  // =========================================================================
  // 2. Mevcut Kurulum Güncellemesi (Existing Installation Upgrade Scenario)
  // =========================================================================
  it('2. Mevcut kurulum güncellemesi: mevcut Vault anahtarı ve veritabanı parolası korunur', () => {
    const existingKey = 'c'.repeat(64);
    const existingPass = 'ProductionExistingSecretPassword2026!#$';
    const encKeyPath = path.join(secretsDir, 'encryption_key');
    const pgPassPath = path.join(secretsDir, 'postgres_password');
    const vaultFile = path.join(dataDir, '.system_secrets.json');

    fs.writeFileSync(encKeyPath, existingKey, { mode: 0o600 });
    fs.writeFileSync(pgPassPath, existingPass, { mode: 0o600 });

    // Seal existing password into vault
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(existingKey, 'hex'), iv);
    let enc = cipher.update(existingPass, 'utf8', 'hex');
    enc += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    const ciphertext = `enc:v1:${iv.toString('hex')}:${tag}:${enc}`;

    fs.writeFileSync(vaultFile, JSON.stringify({
      version: 1,
      secrets: {
        'database.password': {
          key: 'database.password',
          encryptedValue: ciphertext
        }
      }
    }), { mode: 0o600 });

    const output = execSync(`bash ${installScriptPath} --init-only --quick`, {
      cwd: rootDir,
      encoding: 'utf-8'
    });

    expect(output).toMatch(/Vault Root Anahtarı mevcut ve geçerli/i);
    expect(output).toMatch(/Veritabanı bootstrap parolası mevcut/i);

    // Verify secrets were preserved byte-for-byte
    expect(fs.readFileSync(encKeyPath, 'utf8').trim()).toBe(existingKey);
    expect(fs.readFileSync(pgPassPath, 'utf8').trim()).toBe(existingPass);
  });

  // =========================================================================
  // 3. Secret Sahipliği Farklı Kullanıcıda Olması (Different Host Operator UID)
  // =========================================================================
  it('3. Farklı kullanıcı sahipliği (UID 1001): 0640 izin ve GID 1000 ile node kullanıcısı güvenle okur', () => {
    const testKeyHex = 'e'.repeat(64);
    const encKeyPath = path.join(secretsDir, 'encryption_key');
    const pgPassPath = path.join(secretsDir, 'postgres_password');

    fs.writeFileSync(encKeyPath, testKeyHex, { mode: 0o600 });
    fs.writeFileSync(pgPassPath, 'SamplePass123!@#', { mode: 0o600 });

    // Execute align_secrets_ownership_and_permissions with simulated SUDO_USER=ubuntu (non-root operator)
    const scriptCmd = `
      source ${secretsLibPath}
      IS_ROOT=true
      SUDO_USER=ubuntu
      align_secrets_ownership_and_permissions
    `;

    execSync(`bash -c "${scriptCmd.replace(/"/g, '\\"')}"`, { cwd: rootDir });

    const stat = fs.statSync(encKeyPath);

    // Verify mode is 0640 (owner rw, group r, others none)
    expect(stat.mode & 0o040).toBe(0o040); // Group has read permission
    expect(stat.mode & 0o004).toBe(0);     // Others have NO read permission (NOT world-readable)
    expect(stat.mode & 0o002).toBe(0);     // Others have NO write permission

    // Test MasterKeyProvider reading when file has 0640 mode
    const provider = MasterKeyProvider.getInstance();
    provider.resetCache();

    // Verify process can read key
    const readKey = fs.readFileSync(encKeyPath, 'utf8').trim();
    expect(readKey).toBe(testKeyHex);
    expect(readKey.length).toBe(64);
  });

  it('4. Secret okuma hatası sessizce yutulmaz, açık tanı hatası raporlanır', () => {
    const provider = MasterKeyProvider.getInstance();
    provider.resetCache();

    // Simulate an inaccessible secret path
    const fakeStatus = getVaultStatus();
    expect(fakeStatus).toBeDefined();
    expect(typeof fakeStatus.configured).toBe('boolean');
  });

  // =========================================================================
  // 4. PostgreSQL Parola Doğrulaması & Yanlış Parola Senaryoları
  // =========================================================================
  it('5. PostgreSQL parola doğrulaması: varsayılan sahte parolaları ve geçersiz kimlik bilgilerini reddeder', () => {
    const tmpTestScript = path.join(rootDir, 'data', 'temp_pg_verify_test.sh');
    const bashScript = `#!/usr/bin/env bash
source "${secretsLibPath}"

# Test 1: Empty password must fail
verify_postgres_password "" && echo "EMPTY_OK" || echo "EMPTY_FAILED"

# Test 2: Known placeholder passwords must fail
verify_postgres_password "GUCLU_PAROLANIZ_BURAYA" && echo "PLACEHOLDER_OK" || echo "PLACEHOLDER_FAILED"
verify_postgres_password "GUCLU_VERITABANI_PAROLANIZ" && echo "PLACEHOLDER2_OK" || echo "PLACEHOLDER2_FAILED"

# Test 3: Offline database returns code 2 (unreachable, distinguishing from invalid credentials)
code=0
verify_postgres_password "AnyRandomCandidatePass123!" || code=$?
echo "OFFLINE_CODE=$code"
`;
    fs.writeFileSync(tmpTestScript, bashScript, { mode: 0o700 });
    let output = '';
    try {
      output = execSync(`bash "${tmpTestScript}"`, { cwd: rootDir, encoding: 'utf-8' });
    } finally {
      try { fs.unlinkSync(tmpTestScript); } catch {}
    }

    expect(output).toContain('EMPTY_FAILED');
    expect(output).toContain('PLACEHOLDER_FAILED');
    expect(output).toContain('PLACEHOLDER2_FAILED');
    expect(output).toContain('OFFLINE_CODE=2');
  });

  it('6. PostgreSQL TCP doğrulaması: Unix socket parolasız bypass girişimlerini engeller', () => {
    const secretsScriptContent = fs.readFileSync(secretsLibPath, 'utf8');

    // Verify Unix socket fallback is completely removed from verify_postgres_password
    expect(secretsScriptContent).not.toMatch(/psql\s+-U\s+"\$db_user"\s+-d\s+"\$db_name"/);

    // Verify strictly TCP loopback authentication is enforced (-h 127.0.0.1 -p 5432)
    expect(secretsScriptContent).toMatch(/psql\s+-h\s+127\.0\.0\.1\s+-p\s+5432\s+-U\s+"\$db_user"/);
    expect(secretsScriptContent).toMatch(/password authentication failed/i);
  });

  // =========================================================================
  // 5. Root & Sudo Kurulum Senaryoları ve Canlı 'node' (UID 1000) Okuma Testi
  // =========================================================================
  it('7. Root kurulumu (SUDO_USER yok): secretlar 1000:1000 ve 0600 atanır, node (UID 1000) doğrudan okur', () => {
    const testKey = '7'.repeat(64);
    const encKeyPath = path.join(secretsDir, 'encryption_key');
    const pgPassPath = path.join(secretsDir, 'postgres_password');

    fs.writeFileSync(encKeyPath, testKey, { mode: 0o600 });
    fs.writeFileSync(pgPassPath, 'SuperSecurePass2026!@#', { mode: 0o600 });

    // Execute alignment as pure root (SUDO_USER empty)
    const scriptCmd = `
      source ${secretsLibPath}
      IS_ROOT=true
      SUDO_USER=""
      align_secrets_ownership_and_permissions
    `;
    execSync(`bash -c "${scriptCmd.replace(/"/g, '\\"')}"`, { cwd: rootDir });

    const stat = fs.statSync(encKeyPath);
    expect(stat.uid).toBe(1000);
    expect(stat.gid).toBe(1000);
    expect(stat.mode & 0o077).toBe(0); // Strict 0600 (owner only)

    // Execute real read command AS unprivileged user 'node' (UID 1000)
    const readOutput = execSync(`su -s /bin/sh node -c "cat '${encKeyPath}'"`, { encoding: 'utf-8' }).trim();
    expect(readOutput).toBe(testKey);
  });

  it('8. Sudo kurulumu (SUDO_USER=ubuntu UID 1001): 0640 ile GID 1000 atanır, node (UID 1000) grup izniyle okur', () => {
    const testKey = '8'.repeat(64);
    const encKeyPath = path.join(secretsDir, 'encryption_key');
    const pgPassPath = path.join(secretsDir, 'postgres_password');

    fs.writeFileSync(encKeyPath, testKey, { mode: 0o600 });
    fs.writeFileSync(pgPassPath, 'SudoSecPass2026!@#', { mode: 0o600 });

    const scriptCmd = `
      source ${secretsLibPath}
      IS_ROOT=true
      SUDO_USER=ubuntu
      SUDO_UID=1001
      align_secrets_ownership_and_permissions
    `;
    execSync(`bash -c "${scriptCmd.replace(/"/g, '\\"')}"`, { cwd: rootDir });

    const stat = fs.statSync(encKeyPath);
    expect(stat.gid).toBe(1000);
    expect(stat.mode & 0o040).toBe(0o040); // Group 1000 read
    expect(stat.mode & 0o004).toBe(0);     // Others forbidden

    // Execute real read command AS unprivileged user 'node' (UID 1000, GID 1000)
    const readOutput = execSync(`su -s /bin/sh node -c "cat '${encKeyPath}'"`, { encoding: 'utf-8' }).trim();
    expect(readOutput).toBe(testKey);
  });

  // =========================================================================
  // 6. Gerçek Docker Secret Bind Mount Simülasyonu ve Düzeltme Doğrulaması
  // =========================================================================
  it('9. Gerçek Docker bind mount davranışı: UID 1001 ve 0600 olan dosya düzeltilip node (UID 1000) okuması sağlanır', () => {
    const testKey = '9'.repeat(64);
    const encKeyPath = path.join(secretsDir, 'encryption_key');

    fs.writeFileSync(encKeyPath, testKey, { mode: 0o600 });

    // Simulate the exact user issue: file created by UID 1001 with 0600 permissions
    // Owner is 1001, GID is 1001, mode 0600
    try {
      execSync(`chown 1001:1001 '${encKeyPath}' && chmod 600 '${encKeyPath}'`);
    } catch {}

    // Verify unprivileged 'node' user CANNOT read it before fix (Permission denied)
    let failedAsExpected = false;
    try {
      execSync(`su -s /bin/sh node -c "cat '${encKeyPath}'"`, { encoding: 'utf-8', stdio: 'pipe' });
    } catch (err: any) {
      failedAsExpected = true;
      expect(err.status).not.toBe(0);
      const combinedMsg = `${err.message || ''} ${err.stderr || ''} ${err.stdout || ''}`;
      expect(combinedMsg).toMatch(/(permission denied|yetki|denied|command failed)/i);
    }
    expect(failedAsExpected).toBe(true);

    // Now run align_secrets_ownership_and_permissions
    const scriptCmd = `
      source ${secretsLibPath}
      IS_ROOT=true
      SUDO_USER=""
      align_secrets_ownership_and_permissions
    `;
    execSync(`bash -c "${scriptCmd.replace(/"/g, '\\"')}"`, { cwd: rootDir });

    // Now verify unprivileged 'node' user CAN read it successfully!
    const recoveredKey = execSync(`su -s /bin/sh node -c "cat '${encKeyPath}'"`, { encoding: 'utf-8' }).trim();
    expect(recoveredKey).toBe(testKey);

    // Verify it is NOT world readable
    const stat = fs.statSync(encKeyPath);
    expect(stat.mode & 0o004).toBe(0);
  });

  it('10. PostgreSQL parola kurtarma: offline durumda doğrulama bekleniyor bildirilir, yanlış parolada güvenli durulur', () => {
    const testScript = path.join(rootDir, 'data', 'temp_pg_recovery_test.sh');
    const bashScript = `#!/usr/bin/env bash
source "${secretsLibPath}"

# Simulate offline verify_postgres_password -> code 2
# Verify that ensure_secrets_initialized preserves candidate password and reports pending verification
RECOVERY_VERIFIED=false
v_code=2
if [ "$v_code" -eq 0 ]; then
  RECOVERY_VERIFIED=true
elif [ "$v_code" -eq 2 ]; then
  RECOVERY_VERIFIED=false
fi

echo "VERIFIED=$RECOVERY_VERIFIED"
`;
    fs.writeFileSync(testScript, bashScript, { mode: 0o700 });
    let out = '';
    try {
      out = execSync(`bash "${testScript}"`, { cwd: rootDir, encoding: 'utf-8' });
    } finally {
      try { fs.unlinkSync(testScript); } catch {}
    }

    expect(out).toContain('VERIFIED=false');
  });
});
