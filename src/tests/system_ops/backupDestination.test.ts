import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  getBackupDestination,
  readBackupDestinationStatus,
  selectBackupDestination,
  enableBackupDestination,
  disableBackupDestination,
} from '../../server/services/backupDestination.service.js';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-backup-dest-'));
  process.env.NEXUS_TEST_DATA_DIR = dir;
});
afterEach(() => {
  delete process.env.NEXUS_TEST_DATA_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('full backup target selection', () => {
  it('defaults to local with no host capabilities', () => {
    expect(getBackupDestination()).toBe('local');
    const status = readBackupDestinationStatus();
    expect(status.requestedDestination).toBe('local');
    expect(status.destinations.find(x => x.id === 'gdrive')?.configured).toBe(false);
  });
  it('rejects unknown destinations, arbitrary paths and commands', () => {
    for (const input of ['../../etc/passwd', 'gdrive:evil', '$(touch /tmp/bad)', 'ssh', '', {}, null]) {
      expect(() => selectBackupDestination(input)).toThrow();
    }
    expect(getBackupDestination()).toBe('local');
  });
  it('rejects a provider without host provisioning', () => {
    expect(() => selectBackupDestination('dropbox')).toThrow(/yapılandırılmadı/);
    expect(fs.existsSync(path.join(dir, '.dr_destination.json'))).toBe(false);
  });
  it('accepts an allowlisted, pre-provisioned destination without credentials', () => {
    fs.writeFileSync(path.join(dir, '.dr_capabilities.json'), JSON.stringify({ ready: ['gdrive'] }));
    const saved = selectBackupDestination('gdrive');
    expect(saved.requestedDestination).toBe('gdrive');
    const record = JSON.parse(fs.readFileSync(path.join(dir, '.dr_destination.json'), 'utf8'));
    expect(Object.keys(record).sort()).toEqual(['destination', 'version']);
    if (process.platform !== 'win32') {
      expect(fs.statSync(path.join(dir, '.dr_destination.json')).mode & 0o077).toBe(0);
    }
  });
  it('refuses a symlinked selection file', () => {
    if (process.platform === 'win32') return;
    fs.symlinkSync(path.join(dir, 'absent'), path.join(dir, '.dr_destination.json'));
    expect(() => selectBackupDestination('local')).toThrow(/güvenli değil/);
  });
  it('does not expose secret fields from malformed host status', () => {
    fs.writeFileSync(path.join(dir, '.dr_delivery_status.json'), JSON.stringify({
      result: 'success', destination: 'local', timestamp: new Date().toISOString(),
      access_token: 'untrusted-secret',
    }));
    const status = readBackupDestinationStatus();
    expect(JSON.stringify(status)).not.toContain('untrusted-secret');
  });
  it('enables and disables non-local providers dynamically', () => {
    expect(readBackupDestinationStatus().destinations.find(x => x.id === 'sftp')?.configured).toBe(false);
    const enabled = enableBackupDestination('sftp');
    expect(enabled.destinations.find(x => x.id === 'sftp')?.configured).toBe(true);

    const saved = selectBackupDestination('sftp');
    expect(saved.requestedDestination).toBe('sftp');

    const disabled = disableBackupDestination('sftp');
    expect(disabled.destinations.find(x => x.id === 'sftp')?.configured).toBe(false);
    expect(disabled.requestedDestination).toBe('local');
  });
});
