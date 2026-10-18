import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const sourceRoot = path.resolve(__dirname, '../..');
const sandboxRoot = fs.mkdtempSync('/tmp/nexus-tls-test-');
fs.chmodSync(sandboxRoot, 0o755);
const rootDir = path.join(sandboxRoot, 'project');
fs.cpSync(sourceRoot, rootDir, { recursive: true, filter: (src) => {
  const rel = path.relative(sourceRoot, src);
  return !rel.split(path.sep).some((part) => ['.git', 'node_modules', 'secrets', 'data'].includes(part));
} });
fs.mkdirSync(path.join(rootDir, 'data'), { recursive: true, mode: 0o755 });
const sslLibPath = path.join(rootDir, 'scripts/setup/lib/ssl.sh');
const colorsLibPath = path.join(rootDir, 'scripts/setup/lib/colors.sh');

describe('TLS / SSL Certificate Management & Security Hardening', () => {
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

if [ "\${HTTP_ONLY:-false}" = "true" ]; then
  # Matches install.sh logic when --http-only is set
  exit 0
fi

ensure_ssl_certificates
exit $?
`;
    const tmpScript = path.join(rootDir, 'data', `temp_ssl_run_${Date.now()}_${Math.random().toString(36).substring(2)}.sh`);
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
    execSync(`openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout '${testKeyPath}' -out '${testCrtPath}' -subj '/CN=test.local' 2>/dev/null`);
    
    const initialCrt = fs.readFileSync(testCrtPath, 'utf-8');
    const initialKey = fs.readFileSync(testKeyPath, 'utf-8');

    const res = runSslHelper({ USE_DOCKER_PROXY: 'true' });
    expect(res.exitCode).toBe(0);
    expect(res.output).toMatch(/doğrulandı ve eşleşti.*KORUNDU/i);

    expect(fs.readFileSync(testCrtPath, 'utf-8')).toBe(initialCrt);
    expect(fs.readFileSync(testKeyPath, 'utf-8')).toBe(initialKey);

    const keyStat = fs.statSync(testKeyPath);
    const crtStat = fs.statSync(testCrtPath);
    expect(keyStat.mode & 0o077).toBe(0); // 0600
    expect(crtStat.mode & 0o004).toBe(0o004); // 0644
  });

  it('2. Uyumsuz sertifika ve anahtar: üzerine yazılmaz, açık hata ile güvenli durulur (fail-closed, exit 1)', () => {
    const pairAKey = path.join(testCertsDir, 'a.key');
    const pairACrt = path.join(testCertsDir, 'a.crt');
    const pairBKey = path.join(testCertsDir, 'b.key');
    const pairBCrt = path.join(testCertsDir, 'b.crt');

    execSync(`openssl req -x509 -nodes -days 1 -newkey rsa:2048 -keyout '${pairAKey}' -out '${pairACrt}' -subj '/CN=domainA' 2>/dev/null`);
    execSync(`openssl req -x509 -nodes -days 1 -newkey rsa:2048 -keyout '${pairBKey}' -out '${pairBCrt}' -subj '/CN=domainB' 2>/dev/null`);

    const mismatchedCrt = fs.readFileSync(pairACrt, 'utf-8');
    const mismatchedKey = fs.readFileSync(pairBKey, 'utf-8');

    fs.writeFileSync(testCrtPath, mismatchedCrt);
    fs.writeFileSync(testKeyPath, mismatchedKey);

    const res = runSslHelper({ USE_DOCKER_PROXY: 'true' });
    expect(res.exitCode).toBe(1);
    expect(res.output).toMatch(/eşleşmiyor.*Mevcut dosyaların üzerine yazılmıyor.*durduruldu/i);

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

  it('6. --http-only seçeneği aktif: izole ortamda install.sh akışında TLS kontrolü/üretimi atlanır', () => {
    const isolatedInstallDir = path.join(rootDir, 'data', 'temp_isolated_install');
    const isolatedCertsDir = path.join(isolatedInstallDir, 'docker/certs');
    const isolatedCrt = path.join(isolatedCertsDir, 'server.crt');
    const isolatedKey = path.join(isolatedCertsDir, 'server.key');

    if (fs.existsSync(isolatedInstallDir)) {
      fs.rmSync(isolatedInstallDir, { recursive: true, force: true });
    }
    fs.mkdirSync(isolatedInstallDir, { recursive: true, mode: 0o755 });

    try {
      fs.cpSync(path.join(rootDir, 'scripts'), path.join(isolatedInstallDir, 'scripts'), { recursive: true });
      fs.copyFileSync(path.join(rootDir, 'install.sh'), path.join(isolatedInstallDir, 'install.sh'));
      if (fs.existsSync(path.join(rootDir, '.env.example'))) {
        fs.copyFileSync(path.join(rootDir, '.env.example'), path.join(isolatedInstallDir, '.env.example'));
      }

      let output = '';
      let exitCode = 0;
      try {
        output = execSync('bash install.sh --http-only --init-only 2>&1', {
          cwd: isolatedInstallDir,
          encoding: 'utf-8',
          env: { ...process.env }
        });
      } catch (err: any) {
        exitCode = err.status || 1;
        output = `${err.message || ''} ${err.stdout || ''} ${err.stderr || ''}`;
      }

      expect(exitCode).toBe(0);
      expect(output).toMatch(/--init-only modunda tamamlandı/i);
      expect(fs.existsSync(isolatedCrt)).toBe(false);
      expect(fs.existsSync(isolatedKey)).toBe(false);
    } finally {
      if (fs.existsSync(isolatedInstallDir)) {
        try { fs.rmSync(isolatedInstallDir, { recursive: true, force: true }); } catch {}
      }
    }
  });

  it('7. İki dosya da yok (Docker proxy açık): atomik geçici dosyalarla güvenli sertifika çifti üretilir', () => {
    if (fs.existsSync(testCrtPath)) fs.unlinkSync(testCrtPath);
    if (fs.existsSync(testKeyPath)) fs.unlinkSync(testKeyPath);

    const res = runSslHelper({ USE_DOCKER_PROXY: 'true' });
    expect(res.exitCode).toBe(0);
    expect(res.output).toMatch(/Güvenli TLS sertifika çifti başarıyla üretildi ve doğrulandı/i);

    expect(fs.existsSync(testCrtPath)).toBe(true);
    expect(fs.existsSync(testKeyPath)).toBe(true);

    const keyStat = fs.statSync(testKeyPath);
    expect(keyStat.mode & 0o077).toBe(0); // 0600

    const verifyScript = `
      source "${sslLibPath}"
      verify_ssl_match "${testCrtPath}" "${testKeyPath}"
    `;
    expect(() => execSync(`bash -c '${verifyScript.replace(/'/g, "'\\''")}'`)).not.toThrow();
  });

  it('8. OpenSSL bulunamadığında verify_ssl_match fail-closed (return 1) uygular', () => {
    const dummyCrt = path.join(testCertsDir, 'dummy.crt');
    const dummyKey = path.join(testCertsDir, 'dummy.key');
    fs.writeFileSync(dummyCrt, 'cert-data');
    fs.writeFileSync(dummyKey, 'key-data');

    const verifyNoOpensslScript = `
      source "${sslLibPath}"
      PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
      # Override openssl in a wrapper shell function
      openssl() { return 127; }
      export -f openssl 2>/dev/null || true
      verify_ssl_match "${dummyCrt}" "${dummyKey}"
      exit $?
    `;

    let exitCode = 0;
    try {
      execSync(`bash -c '${verifyNoOpensslScript.replace(/'/g, "'\\''")}'`, { encoding: 'utf-8' });
    } catch (err: any) {
      exitCode = err.status || 1;
    }

    expect(exitCode).toBe(1);
  });

  it('9. Tekrarlanan kurulum ve güncelleme (Idempotency): ikinci çalıştırmada mevcut sertifika aynen korunur', () => {
    if (fs.existsSync(testCrtPath)) fs.unlinkSync(testCrtPath);
    if (fs.existsSync(testKeyPath)) fs.unlinkSync(testKeyPath);

    const res1 = runSslHelper({ USE_DOCKER_PROXY: 'true' });
    expect(res1.exitCode).toBe(0);

    const crt1 = fs.readFileSync(testCrtPath, 'utf-8');
    const key1 = fs.readFileSync(testKeyPath, 'utf-8');

    const res2 = runSslHelper({ USE_DOCKER_PROXY: 'true' });
    expect(res2.exitCode).toBe(0);
    expect(res2.output).toMatch(/doğrulandı ve eşleşti.*KORUNDU/i);

    const res3 = runSslHelper({ USE_DOCKER_PROXY: 'true' });
    expect(res3.exitCode).toBe(0);

    expect(fs.readFileSync(testCrtPath, 'utf-8')).toBe(crt1);
    expect(fs.readFileSync(testKeyPath, 'utf-8')).toBe(key1);
  });

  it('10. Eşzamanlı kurulum kilitlemesi (Locking): Kilit dosyası varken yeni kurulum çakışmayı engeller ve güvenli durur', () => {
    const lockDir = path.join(testCertsDir, '.ssl_setup.lock');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(path.join(lockDir, 'pid'), process.pid.toString());

    const res = runSslHelper({ USE_DOCKER_PROXY: 'true' });
    expect(res.exitCode).toBe(1);
    expect(res.output).toMatch(/Eşzamanlı TLS sertifika kurulumu algılandı/i);
  });
});
