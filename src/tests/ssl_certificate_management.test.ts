import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const rootDir = path.resolve(__dirname, '../..');
const sslLibPath = path.join(rootDir, 'scripts/setup/lib/ssl.sh');
const colorsLibPath = path.join(rootDir, 'scripts/setup/lib/colors.sh');

describe('TLS / SSL Certificate Management & Protection', () => {
  const testCertsDir = path.join(rootDir, 'data', 'temp_ssl_test_certs');
  const testCrtPath = path.join(testCertsDir, 'server.crt');
  const testKeyPath = path.join(testCertsDir, 'server.key');

  beforeEach(() => {
    if (fs.existsSync(testCertsDir)) {
      fs.rmSync(testCertsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testCertsDir, { recursive: true, mode: 0o700 });
  });

  afterEach(() => {
    if (fs.existsSync(testCertsDir)) {
      try {
        fs.rmSync(testCertsDir, { recursive: true, force: true });
      } catch {}
    }
  });

  const runSslHelper = (env: Record<string, string> = {}) => {
    const script = `#!/usr/bin/env bash
source "${colorsLibPath}"
source "${sslLibPath}"

CERTS_DIR="${testCertsDir}"
CRT_FILE="${testCrtPath}"
KEY_FILE="${testKeyPath}"
SETUP_DOMAIN="localhost"

ensure_ssl_certificates
exit $?
`;
    const tmpScript = path.join(rootDir, 'data', `temp_ssl_run_${Date.now()}.sh`);
    fs.writeFileSync(tmpScript, script, { mode: 0o755 });

    let exitCode = 0;
    let output = '';
    try {
      output = execSync(`bash "${tmpScript}" 2>&1`, {
        cwd: rootDir,
        encoding: 'utf-8',
        env: { ...process.env, ...env }
      });
    } catch (err: any) {
      exitCode = err.status || 1;
      output = `${err.message || ''} ${err.stdout || ''} ${err.stderr || ''}`;
    } finally {
      try { fs.unlinkSync(tmpScript); } catch {}
    }

    return { exitCode, output };
  };

  it('1. Geçerli eşleşen sertifika ve anahtar: tam olarak korunur ve 0600/0644 izinleri sağlanır', () => {
    // Generate valid matching key pair into testCertsDir
    execSync(`openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout '${testKeyPath}' -out '${testCrtPath}' -subj '/CN=test.local' 2>/dev/null`);
    
    const initialCrt = fs.readFileSync(testCrtPath, 'utf-8');
    const initialKey = fs.readFileSync(testKeyPath, 'utf-8');

    const res = runSslHelper({ USE_DOCKER_PROXY: 'true' });
    expect(res.exitCode).toBe(0);
    expect(res.output).toMatch(/doğrulandı ve eşleşti.*KORUNDU/i);

    // Verify byte-for-byte preservation
    expect(fs.readFileSync(testCrtPath, 'utf-8')).toBe(initialCrt);
    expect(fs.readFileSync(testKeyPath, 'utf-8')).toBe(initialKey);

    // Verify secure permissions
    const keyStat = fs.statSync(testKeyPath);
    const crtStat = fs.statSync(testCrtPath);
    expect(keyStat.mode & 0o077).toBe(0); // 0600 strict
    expect(crtStat.mode & 0o004).toBe(0o004); // 0644
  });

  it('2. Uyumsuz sertifika ve anahtar: üzerine yazılmaz, açık hata ile güvenli durulur (fail-closed, exit 1)', () => {
    const pairAKey = path.join(testCertsDir, 'a.key');
    const pairACrt = path.join(testCertsDir, 'a.crt');
    const pairBKey = path.join(testCertsDir, 'b.key');
    const pairBCrt = path.join(testCertsDir, 'b.crt');

    execSync(`openssl req -x509 -nodes -days 1 -newkey rsa:2048 -keyout '${pairAKey}' -out '${pairACrt}' -subj '/CN=domainA' 2>/dev/null`);
    execSync(`openssl req -x509 -nodes -days 1 -newkey rsa:2048 -keyout '${pairBKey}' -out '${pairBCrt}' -subj '/CN=domainB' 2>/dev/null`);

    // Put pairA certificate and pairB key into server.crt and server.key
    const mismatchedCrt = fs.readFileSync(pairACrt, 'utf-8');
    const mismatchedKey = fs.readFileSync(pairBKey, 'utf-8');

    fs.writeFileSync(testCrtPath, mismatchedCrt);
    fs.writeFileSync(testKeyPath, mismatchedKey);

    const res = runSslHelper({ USE_DOCKER_PROXY: 'true' });
    expect(res.exitCode).toBe(1);
    expect(res.output).toMatch(/eşleşmiyor.*Mevcut dosyaların üzerine yazılmıyor.*durduruldu/i);

    // Verify existing files were NOT modified or overwritten
    expect(fs.readFileSync(testCrtPath, 'utf-8')).toBe(mismatchedCrt);
    expect(fs.readFileSync(testKeyPath, 'utf-8')).toBe(mismatchedKey);
  });

  it('3. Yalnızca sertifika mevcut: otomatik diğer dosya üretilmez, mevcut dosya korunur ve hata verilir', () => {
    const dummyCrt = '-----BEGIN CERTIFICATE-----\nTEST_CERT\n-----END CERTIFICATE-----\n';
    fs.writeFileSync(testCrtPath, dummyCrt);
    if (fs.existsSync(testKeyPath)) fs.unlinkSync(testKeyPath);

    const res = runSslHelper({ USE_DOCKER_PROXY: 'true' });
    expect(res.exitCode).toBe(1);
    expect(res.output).toMatch(/Eksik TLS sertifika çifti.*Yalnızca.*server.crt.*mevcut/i);
    expect(fs.readFileSync(testCrtPath, 'utf-8')).toBe(dummyCrt);
    expect(fs.existsSync(testKeyPath)).toBe(false);
  });

  it('4. Yalnızca özel anahtar mevcut: otomatik sertifika üretilmez, mevcut anahtar korunur ve hata verilir', () => {
    const dummyKey = '-----BEGIN PRIVATE KEY-----\nTEST_KEY\n-----END PRIVATE KEY-----\n';
    fs.writeFileSync(testKeyPath, dummyKey);
    if (fs.existsSync(testCrtPath)) fs.unlinkSync(testCrtPath);

    const res = runSslHelper({ USE_DOCKER_PROXY: 'true' });
    expect(res.exitCode).toBe(1);
    expect(res.output).toMatch(/Eksik TLS sertifika çifti.*Yalnızca.*server.key.*mevcut/i);
    expect(fs.readFileSync(testKeyPath, 'utf-8')).toBe(dummyKey);
    expect(fs.existsSync(testCrtPath)).toBe(false);
  });

  it('5. İki dosya da yok (Docker proxy kapalı): gereksiz sertifika üretimi atlanır', () => {
    if (fs.existsSync(testCrtPath)) fs.unlinkSync(testCrtPath);
    if (fs.existsSync(testKeyPath)) fs.unlinkSync(testKeyPath);

    const res = runSslHelper({ USE_DOCKER_PROXY: 'false', ENABLE_DOCKER_PROXY: 'false', COMPOSE_PROFILES: '' });
    expect(res.exitCode).toBe(0);
    expect(res.output).toMatch(/Docker Nginx proxy kullanılmıyor; self-signed TLS sertifika üretimi atlandı/i);
    expect(fs.existsSync(testCrtPath)).toBe(false);
    expect(fs.existsSync(testKeyPath)).toBe(false);
  });

  it('6. İki dosya da yok (Docker proxy açık): atomik geçici dosyalarla güvenli sertifika çifti üretilir', () => {
    if (fs.existsSync(testCrtPath)) fs.unlinkSync(testCrtPath);
    if (fs.existsSync(testKeyPath)) fs.unlinkSync(testKeyPath);

    const res = runSslHelper({ USE_DOCKER_PROXY: 'true' });
    expect(res.exitCode).toBe(0);
    expect(res.output).toMatch(/Güvenli TLS sertifika çifti başarıyla üretildi ve doğrulandı/i);

    expect(fs.existsSync(testCrtPath)).toBe(true);
    expect(fs.existsSync(testKeyPath)).toBe(true);

    const keyStat = fs.statSync(testKeyPath);
    expect(keyStat.mode & 0o077).toBe(0); // 0600

    // Verify generated cert and key actually match cryptographically using OpenSSL
    const verifyScript = `
      source "${sslLibPath}"
      verify_ssl_match "${testCrtPath}" "${testKeyPath}"
    `;
    expect(() => execSync(`bash -c '${verifyScript.replace(/'/g, "'\\''")}'`)).not.toThrow();
  });

  it('7. Tekrarlanan kurulum ve güncelleme (Idempotency): ikinci çalıştırmada mevcut sertifika aynen korunur', () => {
    if (fs.existsSync(testCrtPath)) fs.unlinkSync(testCrtPath);
    if (fs.existsSync(testKeyPath)) fs.unlinkSync(testKeyPath);

    // Run 1: Generates new certs
    const res1 = runSslHelper({ USE_DOCKER_PROXY: 'true' });
    expect(res1.exitCode).toBe(0);

    const crt1 = fs.readFileSync(testCrtPath, 'utf-8');
    const key1 = fs.readFileSync(testKeyPath, 'utf-8');

    // Run 2: Updating/Re-running setup
    const res2 = runSslHelper({ USE_DOCKER_PROXY: 'true' });
    expect(res2.exitCode).toBe(0);
    expect(res2.output).toMatch(/doğrulandı ve eşleşti.*KORUNDU/i);

    // Run 3: Another update
    const res3 = runSslHelper({ USE_DOCKER_PROXY: 'true' });
    expect(res3.exitCode).toBe(0);

    // Verify certs remained 100% identical byte-for-byte across all runs
    expect(fs.readFileSync(testCrtPath, 'utf-8')).toBe(crt1);
    expect(fs.readFileSync(testKeyPath, 'utf-8')).toBe(key1);
  });
});
