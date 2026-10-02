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

  it('generates missing keys and returns a valid exportable env snippet', async () => {
    const result = await systemKeysService.generateMissingKeys();
    expect(result.success).toBe(true);
    expect(result.envSnippet).toContain('JWT_SECRET=');
    expect(result.envSnippet).toContain('ENCRYPTION_KEY=');

    const updatedStatus = systemKeysService.getKeyStatuses();
    expect(updatedStatus.keys.jwtSecret.isConfigured).toBe(true);
    expect(updatedStatus.keys.encryptionKey.isConfigured).toBe(true);
  });

  it('STRICTLY PRESERVES existing keys and never overwrites them on subsequent generation runs', async () => {
    // 1. Initial generation
    const firstRun = await systemKeysService.generateMissingKeys();
    const activeJwt = systemKeysService.resolveJwtSecret().value;
    const activeEnc = systemKeysService.resolveEncryptionKey().value;

    expect(activeJwt).toBeTruthy();
    expect(activeEnc).toBeTruthy();

    // 2. Second generation run
    const secondRun = await systemKeysService.generateMissingKeys();
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

  it('supports cryptographic key rotation with keyId and version history tracking', async () => {
    // 1. Initial state
    await systemKeysService.generateMissingKeys();
    const initialStatus = systemKeysService.getKeyStatuses();
    expect(initialStatus.keys.jwtSecret.rotatable).toBe(true);

    // 2. Rotate JWT secret
    const rotateJwt = await systemKeysService.rotateJwtSecret('test_admin');
    expect(rotateJwt.success).toBe(true);
    expect(rotateJwt.version).toBeGreaterThan(1);
    expect(rotateJwt.newKeyId).toContain('jwt_v');

    // 3. Verify updated status reflects new keyId and version
    const updatedStatus = systemKeysService.getKeyStatuses();
    expect(updatedStatus.keys.jwtSecret.keyId).toBe(rotateJwt.newKeyId);
    expect(updatedStatus.keys.jwtSecret.version).toBe(rotateJwt.version);

    // 4. Rotate OTA signing key
    const rotateOta = await systemKeysService.rotateOtaSigningKey('test_admin');
    expect(rotateOta.success).toBe(true);
    expect(rotateOta.newKeyId).toContain('root_ed25519_v');
    expect(rotateOta.publicKeyPem).toContain('BEGIN PUBLIC KEY');

    const updatedOtaStatus = systemKeysService.getKeyStatuses();
    expect(updatedOtaStatus.keys.otaSigningKey.keyId).toBe(rotateOta.newKeyId);
  });
});
