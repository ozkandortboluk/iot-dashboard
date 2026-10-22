import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Source-level regression guard: the SSH transport must not own persistent
 * installation state. This deliberately does not open an SSH or DB connection.
 */
describe('SSH tunnel transient configuration boundary', () => {
  const source = readFileSync(
    new URL('../../server/services/sshTunnel.service.ts', import.meta.url),
    'utf8'
  );

  it('does not write canonical setup configuration from the tunnel service', () => {
    expect(source).not.toMatch(/setupService\.saveRuntimeSecretConfig\s*\(/);
  });

  it('does not mark installation complete from the tunnel service', () => {
    expect(source).not.toMatch(/setupService\.markSetupCompleted\s*\(/);
  });

  it('retains the independent PostgreSQL SELECT 1 check', () => {
    expect(source).toContain("await testClient.query('SELECT 1;')");
    expect(source).toContain('await db.initPostgresRepository()');
  });
});
