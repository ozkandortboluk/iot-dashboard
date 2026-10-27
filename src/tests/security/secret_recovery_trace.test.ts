import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const secretsScriptPath = path.resolve(__dirname, '../../../scripts/setup/lib/secrets.sh');
const secretsScript = fs.readFileSync(secretsScriptPath, 'utf8');

describe('Secret recovery shell tracing safety', () => {
  it('disables Bash xtrace before recovering or assigning a plaintext database password', () => {
    const functionStart = secretsScript.indexOf('ensure_secrets_initialized() {');
    const recoveredPasswordDeclaration = secretsScript.indexOf('local RECOVERED_PASSWORD', functionStart);
    const decryptedPasswordOutput = secretsScript.indexOf('console.log(pass)', functionStart);

    expect(functionStart).toBeGreaterThanOrEqual(0);
    expect(recoveredPasswordDeclaration).toBeGreaterThan(functionStart);
    expect(decryptedPasswordOutput).toBeGreaterThan(recoveredPasswordDeclaration);

    const preRecoverySource = secretsScript.slice(functionStart, recoveredPasswordDeclaration);
    expect(preRecoverySource).toMatch(/case\s+\$-\s+in[\s\S]*?\*x\*[\s\S]*?set\s+\+x/);
  });
});
