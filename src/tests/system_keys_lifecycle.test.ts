import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { systemKeysService } from '../server/services/systemKeys.service.js';
import fs from 'node:fs';
import path from 'node:path';

describe('System Keys Automatic Generation & Preservation Service (Single Master Key)', () => {
  const testDir = path.resolve(process.cwd(), 'data');
  const secretsDir = path.resolve(process.cwd(), 'secrets');

  it('correctly inspects system keys status with ENCRYPTION_KEY as sole user-managed key', () => {
    const status = systemKeysService.getKeyStatuses();
    expect(status).toHaveProperty('allConfigured');
    expect(status).toHaveProperty('missingCount');
    expect(status.keys).toHaveProperty('encryptionKey');
    expect(status.keys.encryptionKey.keyName).toBe('ENCRYPTION_KEY');
    expect(status.keys.encryptionKey.requiredForProduction).toBe(true);
    expect(status.keys.encryptionKey.rotatable).toBe(false);
  });

  it('generates missing keys in development and returns non-exportable safe metadata', async () => {
    const result = await systemKeysService.generateMissingKeys();
    expect(result.success).toBe(true);
    expect(result.envSnippet).toContain('ENCRYPTION_KEY');
    // Security policy: resolveEncryptionKey never leaks raw key material
    const encMeta = systemKeysService.resolveEncryptionKey();
    expect(encMeta).toHaveProperty('configured');
    expect(encMeta).toHaveProperty('source');
    expect(encMeta).toHaveProperty('keyId');
    expect((encMeta as any).value).toBeUndefined();

    const updatedStatus = systemKeysService.getKeyStatuses();
    expect(updatedStatus.keys.encryptionKey.isConfigured).toBe(true);
  });

  it('STRICTLY PRESERVES existing ENCRYPTION_KEY and never overwrites it on subsequent generation runs', async () => {
    // 1. Initial generation
    const firstRun = await systemKeysService.generateMissingKeys();
    const activeEnc = systemKeysService.resolveEncryptionKey();

    expect(activeEnc.configured).toBe(true);

    // 2. Second generation run
    const secondRun = await systemKeysService.generateMissingKeys();
    expect(secondRun.preservedKeys.encryptionKey).toBe(true);

    const afterEnc = systemKeysService.resolveEncryptionKey();

    // Must be exactly the same key metadata and source
    expect(afterEnc.configured).toBe(activeEnc.configured);
    expect(afterEnc.source).toBe(activeEnc.source);
    expect(afterEnc.keyId).toBe(activeEnc.keyId);
  });

  it('formats full export details correctly for VPS CLI show-keys command', () => {
    const details = systemKeysService.getFullExportDetails();
    expect(details.encryptionKey.isConfigured).toBe(true);
    expect(details.envSnippet).toBeTruthy();
  });

  it('preserves key metadata and ensures stability without unexpected rotation', async () => {
    // 1. Initial state
    await systemKeysService.generateMissingKeys();
    const initialStatus = systemKeysService.getKeyStatuses();
    expect(initialStatus.keys.encryptionKey.isConfigured).toBe(true);
    expect(initialStatus.keys.encryptionKey.rotatable).toBe(false);

    // 2. Calling generateMissingKeys again must strictly preserve existing keys
    const secondPass = await systemKeysService.generateMissingKeys();
    expect(secondPass.preservedKeys.encryptionKey).toBe(true);
    expect(secondPass.generatedItems.encryptionKey).toBe(false);
  });
});
