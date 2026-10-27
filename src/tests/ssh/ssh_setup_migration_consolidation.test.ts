import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Consolidated development SSH and deferred migration safety', () => {
  const setup = readFileSync(new URL('../../server/services/setup.service.ts', import.meta.url), 'utf8');
  const runner = readFileSync(new URL('../../server/database/migrations/migrationRunner.ts', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../../server/database/migrations/staged_reconcile_timescale_hypertables.ts', import.meta.url), 'utf8');

  it('uses connected development SSH transport before saved direct DB config', () => {
    const method = setup.split('public getRuntimeConfig(): DatabaseConfigPayload | null {')[1]?.split('public saveRuntimeSecretConfig(')[0];
    expect(method).toBeTruthy();
    expect(method).toContain('isDevelopmentSshTunnelAllowed() && sshTunnelService.isConnected()');
    expect(method).toContain("host: '127.0.0.1'");
    expect(method!.indexOf('sshTunnelService.isConnected()')).toBeLessThan(method!.indexOf('if (!this.runtimeConfig)'));
  });

  it('does not auto-save transient SSH config during setup status resolution', () => {
    const guarded = 'if (!fs.existsSync(RUNTIME_SECRET_FILE) && !(isDevelopmentSshTunnelAllowed() && sshTunnelService.isConnected()))';
    expect(setup.split(guarded).length - 1).toBe(2);
  });

  it('keeps the Timescale migration dormant and activates the durable queue migration', () => {
    expect(migration).toContain('STAGED MIGRATION — NOT ACTIVE');
    expect(migration).toContain("version: '023'");
    expect(runner).toContain("import { migration023 } from './023_persistent_notification_queue.js';");
    expect(runner).toMatch(/migration022,[\s\S]{0,40}migration023,/);
  });
});
