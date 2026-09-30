import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { systemKeysService } from '../server/services/systemKeys.service.js';
import fs from 'node:fs';
import path from 'node:path';

describe('System Keys Automatic Generation & Preservation Service', () => {
  const testDir = path.resolve(process.cwd(), 'data');
  const secretsDir = path.resolve(process.cwd(), 'secrets');

  it('correctly inspects system keys status', () => {
    const status = systemKeysService.getKeyStatuses();
    expect(status).toHaveProperty('allConfigured');
    expect(status).toHaveProperty('missingCount');
    expect(status.keys).toHaveProperty('jwtSecret');
    expect(status.keys).toHaveProperty('encryptionKey');
    expect(status.keys).toHaveProperty('otaSigningKey');
  });

  it('generates missing keys and returns a valid exportable env snippet', () => {
    const result = systemKeysService.generateMissingKeys();
    expect(result.success).toBe(true);
    expect(result.envSnippet).toContain('JWT_SECRET=');
    expect(result.envSnippet).toContain('ENCRYPTION_KEY=');

    const updatedStatus = systemKeysService.getKeyStatuses();
    expect(updatedStatus.keys.jwtSecret.isConfigured).toBe(true);
    expect(updatedStatus.keys.encryptionKey.isConfigured).toBe(true);
  });

  it('STRICTLY PRESERVES existing keys and never overwrites them on subsequent generation runs', () => {
    // 1. Initial generation
    const firstRun = systemKeysService.generateMissingKeys();
    const activeJwt = systemKeysService.resolveJwtSecret().value;
    const activeEnc = systemKeysService.resolveEncryptionKey().value;

    expect(activeJwt).toBeTruthy();
    expect(activeEnc).toBeTruthy();

    // 2. Second generation run
    const secondRun = systemKeysService.generateMissingKeys();
    expect(secondRun.preservedKeys.jwtSecret).toBe(true);
    expect(secondRun.preservedKeys.encryptionKey).toBe(true);
    expect(secondRun.preservedKeys.otaSigningKey).toBe(true);

    const afterJwt = systemKeysService.resolveJwtSecret().value;
    const afterEnc = systemKeysService.resolveEncryptionKey().value;

    // Must be exactly the same keys!
    expect(afterJwt).toBe(activeJwt);
    expect(afterEnc).toBe(activeEnc);
  });

  it('formats full export details correctly for VPS CLI show-keys command', () => {
    const details = systemKeysService.getFullExportDetails();
    expect(details.jwtSecret.isConfigured).toBe(true);
    expect(details.encryptionKey.isConfigured).toBe(true);
    expect(details.envSnippet).toBeTruthy();
  });
});
