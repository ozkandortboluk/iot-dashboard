import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../server/db.js';

describe('Device API Key Collision & PostgreSQL Constraint Resilience Test', () => {
  const testDev1Id = `test_dev_col_${Date.now()}_1`;
  const testDev2Id = `test_dev_col_${Date.now()}_2`;
  const sharedKey = `nex_key_col_shared_${Date.now()}`;

  afterAll(async () => {
    // Cleanup
    db.data.devices = (db.data.devices || []).filter((d) => d.id !== testDev1Id && d.id !== testDev2Id);
    if (db.postgresRepo?.isReady()) {
      await db.postgresRepo.deleteDevice(testDev1Id).catch(() => {});
      await db.postgresRepo.deleteDevice(testDev2Id).catch(() => {});
    }
  });

  const baseDeviceFields = {
    tenantId: 'usr_test_admin',
    status: 'online' as const,
    location: 'Lab',
    ipAddress: '192.168.1.50',
    rateLimitPerMin: 60,
    encryptionMethod: 'AES-256-GCM',
    metrics: {},
  };

  it('successfully creates a device with a unique API key', async () => {
    const dev1 = await db.createDevice({
      ...baseDeviceFields,
      id: testDev1Id,
      name: 'Test Cihaz 1',
      type: 'sensor',
      apiKey: sharedKey,
    });

    expect(dev1).toBeDefined();
    expect(dev1.apiKey).toBe(sharedKey);
  });

  it('prevents creating a second device with the same custom API key', async () => {
    await expect(
      db.createDevice({
        ...baseDeviceFields,
        id: testDev2Id,
        name: 'Test Cihaz 2 Collision',
        type: 'sensor',
        apiKey: sharedKey, // Duplicate key!
      })
    ).rejects.toThrow(/zaten başka bir cihaz tarafından kullanılıyor/);
  });

  it('prevents updating a device to use an API key already used by another device', async () => {
    // Create dev2 with auto key first
    const dev2 = await db.createDevice({
      ...baseDeviceFields,
      id: testDev2Id,
      name: 'Test Cihaz 2 Auto',
      type: 'sensor',
    });

    expect(dev2).toBeDefined();
    expect(dev2.apiKey).not.toBe(sharedKey);

    // Try updating dev2 to use dev1's sharedKey
    await expect(
      db.updateDevice(testDev2Id, {
        apiKey: sharedKey,
      })
    ).rejects.toThrow(/zaten başka bir cihaz tarafından kullanılıyor/);
  });

  it('PostgreSQL saveDevice handles operations cleanly without throwing unhandled devices_api_key_key violations', async () => {
    if (!db.postgresRepo?.isReady()) {
      return;
    }

    const dev = db.getDeviceById(testDev1Id);
    expect(dev).toBeDefined();

    // Should succeed cleanly
    await expect(db.postgresRepo.saveDevice(dev!)).resolves.not.toThrow();
  });
});
