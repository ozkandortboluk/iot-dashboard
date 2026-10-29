import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const projectRoot = path.resolve(__dirname, '../../..');
const secretsScriptPath = path.join(projectRoot, 'scripts/setup/lib/secrets.sh');
const secretsScript = fs.readFileSync(secretsScriptPath, 'utf8');
const testPassword = 'isolated-xtrace-regression-password-7f39a2';
const fixtureDirectories: string[] = [];

function findBash(): string | undefined {
  const candidates = process.platform === 'win32'
    ? [
        'bash',
        path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git/bin/bash.exe'),
        path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git/usr/bin/bash.exe'),
      ]
    : ['bash'];

  return candidates.find((candidate) => {
    const result = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    return !result.error && result.status === 0;
  });
}

const bashPath = findBash();

afterAll(() => {
  for (const directory of fixtureDirectories) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('Secret recovery shell tracing safety', () => {
  it('disables xtrace before recovering a password and keeps it disabled for the caller', () => {
    const functionStart = secretsScript.indexOf('ensure_secrets_initialized() {');
    const recoveredPasswordDeclaration = secretsScript.indexOf('local RECOVERED_PASSWORD', functionStart);
    const decryptedPasswordOutput = secretsScript.indexOf('console.log(pass)', functionStart);

    expect(functionStart).toBeGreaterThanOrEqual(0);
    expect(recoveredPasswordDeclaration).toBeGreaterThan(functionStart);
    expect(decryptedPasswordOutput).toBeGreaterThan(recoveredPasswordDeclaration);
    expect(secretsScript.slice(functionStart, recoveredPasswordDeclaration))
      .toMatch(/case\s+\$-\s+in[\s\S]*?\*x\*[\s\S]*?set\s+\+x/);

    expect(bashPath, 'Bash is required for the runtime xtrace regression test').toBeDefined();

    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-xtrace-'));
    fixtureDirectories.push(fixtureDirectory);
    fs.mkdirSync(path.join(fixtureDirectory, 'secrets'), { recursive: true });
    fs.mkdirSync(path.join(fixtureDirectory, 'data'), { recursive: true });
    fs.writeFileSync(path.join(fixtureDirectory, 'secrets/encryption_key'), '0'.repeat(64));
    fs.writeFileSync(
      path.join(fixtureDirectory, 'data/.system_secrets.json'),
      '{"secrets":{"database.password":{"key":"database.password"}}}',
    );
    fs.writeFileSync(path.join(fixtureDirectory, '.env'), `POSTGRES_PASSWORD=${testPassword}\n`);

    const fixtureScript = String.raw`
set -e
source "$SECRETS_SCRIPT_PATH"
cd "$SECRETS_TEST_DIR"
log_step() { :; }
log_info() { :; }
log_warn() { :; }
log_success() { :; }
detect_existing_installation() { return 0; }
resolve_app_data_volume() { return 1; }
verify_postgres_password() { return 2; }
align_secrets_ownership_and_permissions() { return 0; }
docker() { return 1; }
node() { return 1; }
ensure_secrets_initialized
test "$(cat secrets/postgres_password)" = "$TEST_PASSWORD"
case $- in *x*) exit 41 ;; esac
downstream_secret="$TEST_PASSWORD"
test "$downstream_secret" = "$TEST_PASSWORD"
`;
    const result = spawnSync(bashPath!, ['-x', '-c', fixtureScript], {
      cwd: fixtureDirectory,
      encoding: 'utf8',
      env: {
        ...process.env,
        SECRETS_SCRIPT_PATH: secretsScriptPath,
        SECRETS_TEST_DIR: fixtureDirectory,
        TEST_PASSWORD: testPassword,
      },
    });

    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(testPassword);
  });
});
