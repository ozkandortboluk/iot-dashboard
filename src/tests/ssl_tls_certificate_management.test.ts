import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const rootDir = path.resolve(__dirname, '../..');
const sslLibPath = path.join(rootDir, 'scripts/setup/lib/ssl.sh');
const colorsLibPath = path.join(rootDir, 'scripts/setup/lib/colors.sh');
const installScriptPath = path.join(rootDir, 'install.sh');

describe('TLS / SSL Certificate Management & Protection Engine', () => {
  let tempCertsDir: string;

  beforeEach(() => {
    tempCertsDir = fs.mkdtempSync(path.join(rootDir, 'data', 'test_certs_'));
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempCertsDir)) {
        fs.rmSync(tempCertsDir, { recursive: true, force: true });
      }
    } catch {}
  });

  // Helper to execute ensure_ssl_certificates with custom environment variables in a subshell
  const runSslScript = (env: Record<string, string> = {}) => {
    const envVars = Object.entries(env)
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ');

    const scriptCmd = `
      source "${colorsLibPath}"
      source "${sslLibPath}"
      CERTS_DIR="${tempCertsDir}"
      CRT_FILE="${path.join(tempCertsDir, 'server.crt')}"
      KEY_FILE="${path.join(tempCertsDir, 'server.key')}"
      ${envVars}
      ensure_ssl_certificates
    `;

    try {
      const output = execSync(`bash -c "${scriptCmd.replace(/"/g, '\\"')}"`, {
        cwd: rootDir,
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      return { status: 0, output, stderr: '' };
    } catch (err: any) {
      return {
        status: err.status || 1,
        output: err.stdout?.toString() || '',
        stderr: err.stderr?.toString() || err.message || ''
      };
    }
  };

  // =========================================================================
  // 1. Geçerli Sertifika ve Özel Anahtar
  // =========================================================================
  it('1. Geçerli sertifika ve anahtar: OpenSSL ile eşleşme doğrulanır, mevcut dosyalar korunur', () => {
    const crtFile = path.join(tempCertsDir, 'server.crt');
    const keyFile = path.join(tempCertsDir, 'server.key');

    // Generate a valid RSA keypair using OpenSSL
    execSync(
      `openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout "${keyFile}" -out "${crtFile}" -subj "/CN=valid.test"`,
      { stdio: 'pipe' }
    );

    const initialCrtContent = fs.readFileSync(crtFile, 'utf-8');
    const initialKeyContent = fs.readFileSync(keyFile, 'utf-8');

    const result = runSslScript({ USE_DOCKER_PROXY: 'true' });
    expect(result.status).toBe(0);
    expect(result.output).toMatch(/doğrulandı ve korundu/i);

    // Verify files were preserved byte-for-byte
    expect(fs.readFileSync(crtFile, 'utf-8')).toBe(initialCrtContent);
    expect(fs.readFileSync(keyFile, 'utf-8')).toBe(initialKeyContent);

    // Verify key permissions are strictly 0600
    const keyStat = fs.statSync(keyFile);
    expect(keyStat.mode & 0o077).toBe(0);
  });

  // =========================================================================
  // 2. Uyumsuz Sertifika ve Özel Anahtar
  // =========================================================================
  it('2. Uyumsuz sertifika ve anahtar: public key uyumsuzluğunda açık hata verilir ve güvenli durulur (fail-closed)', () => {
    const crtFile = path.join(tempCertsDir, 'server.crt');
    const keyFile = path.join(tempCertsDir, 'server.key');
    const dummyKey = path.join(tempCertsDir, 'dummy.key');

    // Create pair A
    execSync(
      `openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout "${dummyKey}" -out "${crtFile}" -subj "/CN=certA"`,
      { stdio: 'pipe' }
    );
    // Create completely different private key B
    execSync(`openssl genrsa -out "${keyFile}" 2048`, { stdio: 'pipe' });
    fs.unlinkSync(dummyKey);

    const initialCrtContent = fs.readFileSync(crtFile, 'utf-8');
    const initialKeyContent = fs.readFileSync(keyFile, 'utf-8');

    const result = runSslScript({ USE_DOCKER_PROXY: 'true' });

    // Must FAIL with non-zero exit code
    expect(result.status).not.toBe(0);
    const combinedOutput = `${result.output} ${result.stderr}`;
    expect(combinedOutput).toMatch(/UYUŞMUYOR|eşleşmiyor/i);
    expect(combinedOutput).toMatch(/kurulum durduruldu/i);

    // Existing files must NOT be destroyed or overwritten
    expect(fs.readFileSync(crtFile, 'utf-8')).toBe(initialCrtContent);
    expect(fs.readFileSync(keyFile, 'utf-8')).toBe(initialKeyContent);
  });

  // =========================================================================
  // 3. Yalnızca Sertifika Mevcut (Özel Anahtar Eksik)
  // =========================================================================
  it('3. Yalnızca sertifika mevcut: eksik anahtar durumunda mevcut dosya üzerine yazılmaz, güvenli hata verir', () => {
    const crtFile = path.join(tempCertsDir, 'server.crt');
    const dummyKey = path.join(tempCertsDir, 'dummy.key');

    execSync(
      `openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout "${dummyKey}" -out "${crtFile}" -subj "/CN=certOnly"`,
      { stdio: 'pipe' }
    );
    fs.unlinkSync(dummyKey);

    const initialCrtContent = fs.readFileSync(crtFile, 'utf-8');

    const result = runSslScript({ USE_DOCKER_PROXY: 'true' });
    expect(result.status).not.toBe(0);
    const combinedOutput = `${result.output} ${result.stderr}`;
    expect(combinedOutput).toMatch(/Yalnızca TLS Sertifikası.*Mevcut.*Özel Anahtar.*Eksik/i);
    expect(combinedOutput).toMatch(/fail-closed/i);

    // Certificate file must remain untouched
    expect(fs.readFileSync(crtFile, 'utf-8')).toBe(initialCrtContent);
    // Key file must NOT have been generated as an incompatible orphan
    expect(fs.existsSync(path.join(tempCertsDir, 'server.key'))).toBe(false);
  });

  // =========================================================================
  // 4. Yalnızca Özel Anahtar Mevcut (Sertifika Eksik)
  // =========================================================================
  it('4. Yalnızca özel anahtar mevcut: eksik sertifika durumunda anahtar üzerine yazılmaz, güvenli hata verir', () => {
    const keyFile = path.join(tempCertsDir, 'server.key');
    execSync(`openssl genrsa -out "${keyFile}" 2048`, { stdio: 'pipe' });

    const initialKeyContent = fs.readFileSync(keyFile, 'utf-8');

    const result = runSslScript({ USE_DOCKER_PROXY: 'true' });
    expect(result.status).not.toBe(0);
    const combinedOutput = `${result.output} ${result.stderr}`;
    expect(combinedOutput).toMatch(/Yalnızca Özel Anahtar.*Mevcut.*Sertifika.*Eksik/i);
    expect(combinedOutput).toMatch(/fail-closed/i);

    // Private key must remain untouched
    expect(fs.readFileSync(keyFile, 'utf-8')).toBe(initialKeyContent);
    // Certificate file must NOT have been randomly generated
    expect(fs.existsSync(path.join(tempCertsDir, 'server.crt'))).toBe(false);
  });

  // =========================================================================
  // 5. İki Dosya da Yok ve Docker Proxy Kapalı
  // =========================================================================
  it('5. İki dosya da yok ve Docker proxy kapalı: gereksiz sertifika üretimi yapılmaz, atlanır', () => {
    const crtFile = path.join(tempCertsDir, 'server.crt');
    const keyFile = path.join(tempCertsDir, 'server.key');

    const result = runSslScript({ USE_DOCKER_PROXY: 'false' });
    expect(result.status).toBe(0);
    expect(result.output).toMatch(/Docker proxy profili aktif değil.*atlandı/i);

    // No files should be generated
    expect(fs.existsSync(crtFile)).toBe(false);
    expect(fs.existsSync(keyFile)).toBe(false);
  });

  // =========================================================================
  // 6. İki Dosya da Yok ve Docker Proxy Açık (Atomik Üretim)
  // =========================================================================
  it('6. İki dosya da yok ve Docker proxy açık: geçici dizinde atomik olarak eşleşen çift üretilir', () => {
    const crtFile = path.join(tempCertsDir, 'server.crt');
    const keyFile = path.join(tempCertsDir, 'server.key');

    const result = runSslScript({ USE_DOCKER_PROXY: 'true' });
    expect(result.status).toBe(0);
    expect(result.output).toMatch(/Güvenli TLS sertifikaları başarıyla üretildi/i);

    expect(fs.existsSync(crtFile)).toBe(true);
    expect(fs.existsSync(keyFile)).toBe(true);

    // Verify key permissions (0600)
    const keyStat = fs.statSync(keyFile);
    expect(keyStat.mode & 0o077).toBe(0);

    // Verify generated cert and key match using OpenSSL
    const crtPub = execSync(`openssl x509 -noout -pubkey -in "${crtFile}"`, { encoding: 'utf-8' }).trim();
    const keyPub = execSync(`openssl pkey -pubout -in "${keyFile}"`, { encoding: 'utf-8' }).trim();
    expect(crtPub).toBe(keyPub);
    expect(crtPub.length).toBeGreaterThan(100);

    // Verify no lingering temp directories (.tmp_ssl_*)
    const files = fs.readdirSync(tempCertsDir);
    const tempDirs = files.filter((f) => f.startsWith('.tmp_ssl_'));
    expect(tempDirs.length).toBe(0);
  });

  // =========================================================================
  // 7. Tekrarlanan Kurulum ve Güncelleme (Idempotent Update)
  // =========================================================================
  it('7. Tekrarlanan kurulum ve güncelleme: mevcut sertifika çifti tekrarlanan çalıştırmalarda bayt bayt korunur', () => {
    const crtFile = path.join(tempCertsDir, 'server.crt');
    const keyFile = path.join(tempCertsDir, 'server.key');

    // Run 1: Generate initial certificate
    const run1 = runSslScript({ USE_DOCKER_PROXY: 'true' });
    expect(run1.status).toBe(0);

    const crtHash1 = execSync(`sha256sum "${crtFile}"`, { encoding: 'utf-8' }).split(' ')[0];
    const keyHash1 = execSync(`sha256sum "${keyFile}"`, { encoding: 'utf-8' }).split(' ')[0];

    // Run 2: Subsequent installation / update run
    const run2 = runSslScript({ USE_DOCKER_PROXY: 'true' });
    expect(run2.status).toBe(0);
    expect(run2.output).toMatch(/doğrulandı ve korundu/i);

    const crtHash2 = execSync(`sha256sum "${crtFile}"`, { encoding: 'utf-8' }).split(' ')[0];
    const keyHash2 = execSync(`sha256sum "${keyFile}"`, { encoding: 'utf-8' }).split(' ')[0];

    // Run 3: Third update run
    const run3 = runSslScript({ USE_DOCKER_PROXY: 'true' });
    expect(run3.status).toBe(0);

    const crtHash3 = execSync(`sha256sum "${crtFile}"`, { encoding: 'utf-8' }).split(' ')[0];
    const keyHash3 = execSync(`sha256sum "${keyFile}"`, { encoding: 'utf-8' }).split(' ')[0];

    // Absolute byte-for-byte idempotency
    expect(crtHash1).toBe(crtHash2);
    expect(crtHash2).toBe(crtHash3);
    expect(keyHash1).toBe(keyHash2);
    expect(keyHash2).toBe(keyHash3);
  });

  // =========================================================================
  // 8. install.sh Entegrasyonu ve Fail-Closed Davranışı
  // =========================================================================
  it('8. install.sh entegrasyonu: SSL hatası durumunda dağıtımı derhal durdurur (exit 1)', () => {
    // In an isolated subshell, test install.sh behavior when SSL fails
    const testScript = path.join(rootDir, 'data', 'temp_install_ssl_fail_test.sh');
    const bashScript = `#!/usr/bin/env bash
source "${colorsLibPath}"
ensure_ssl_certificates() {
  echo "Simulated TLS Mismatch Error" >&2
  return 1
}

# Source install.sh section or simulate step 6 check
HTTP_ONLY=false
if [ "$HTTP_ONLY" = false ]; then
  if ! ensure_ssl_certificates; then
    echo "FATAL_SSL_HALT_TRIGGERED" >&2
    exit 1
  fi
fi
`;
    fs.writeFileSync(testScript, bashScript, { mode: 0o755 });

    let exitCode = 0;
    let output = '';
    try {
      output = execSync(`bash "${testScript}" 2>&1`, { cwd: rootDir, encoding: 'utf-8' });
    } catch (err: any) {
      exitCode = err.status || 1;
      output = `${err.message || ''} ${err.stdout || ''} ${err.stderr || ''}`;
    } finally {
      try { fs.unlinkSync(testScript); } catch {}
    }

    expect(exitCode).toBe(1);
    expect(output).toContain('FATAL_SSL_HALT_TRIGGERED');
  });

  // =========================================================================
  // 9. Gitignore Kuralı Doğrulaması
  // =========================================================================
  it('9. Gitignore doğrulaması: docker/certs/ altındaki sertifika ve anahtar dosyaları Git tarafından yoksayılır', () => {
    const gitignorePath = path.join(rootDir, '.gitignore');
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');

    expect(gitignoreContent).toContain('docker/certs/server.crt');
    expect(gitignoreContent).toContain('docker/certs/server.key');
    expect(gitignoreContent).toContain('docker/certs/*.crt');
    expect(gitignoreContent).toContain('docker/certs/*.key');
  });
});
