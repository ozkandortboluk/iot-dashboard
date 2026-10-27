import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { verifyMasterEncryptionKey, resolveEncryptionKey, resetEncryptionKeyCache } from '../../server/utils/crypto.js';
import { db } from '../../server/db.js';

describe('Factory Reset & Master Encryption Key Verification', () => {
  const secretFilePath = path.resolve(process.cwd(), 'secrets', 'encryption_key');
  const vaultKeyPath = path.resolve(process.cwd(), 'data', '.vault_key');
  let activeKey = 'test_master_encryption_key_2026_secure';

  beforeEach(() => {
    if (fs.existsSync(secretFilePath)) {
      activeKey = fs.readFileSync(secretFilePath, 'utf8').trim();
    } else if (fs.existsSync(vaultKeyPath)) {
      activeKey = fs.readFileSync(vaultKeyPath, 'utf8').trim();
    } else {
      process.env.ENCRYPTION_KEY = activeKey;
    }
    resetEncryptionKeyCache();
    // Ensure admin user exists in memory for test
    if (!db.data.users.some((u: any) => u.id === 'usr_admin')) {
      db.data.users.push({
        id: 'usr_admin',
        name: 'Sistem Yöneticisi',
        email: 'admin@nexusnodeiot.com.tr',
        role: 'admin' as const,
        status: 'active' as const,
        created_at: new Date().toISOString(),
      });
    }
  });

  it('rejects empty or too short encryption key', () => {
    const emptyResult = verifyMasterEncryptionKey('');
    expect(emptyResult.valid).toBe(false);

    const shortResult = verifyMasterEncryptionKey('1234');
    expect(shortResult.valid).toBe(false);
  });

  it('validates correct encryption key matching active vault key', () => {
    const result = verifyMasterEncryptionKey(activeKey);
    expect(result.valid).toBe(true);
  });

  it('rejects incorrect encryption key', () => {
    const wrongResult = verifyMasterEncryptionKey('completely_wrong_key_12345678');
    expect(wrongResult.valid).toBe(false);
    expect(wrongResult.reason).toContain('eşleşmiyor');
  });

  it('executes selective factory reset in db without deleting canonical admin user', async () => {
    // Seed dummy device and customer
    db.data.devices.push({
      id: 'dev_test_reset',
      name: 'Sıfırlama Test Cihazı',
      type: 'esp32',
      status: 'online',
      tenantId: 'cust_reset',
      apiKey: 'dev_key_test',
      lastSeen: new Date().toISOString()
    } as any);

    db.data.users.push({
      id: 'cust_reset',
      name: 'Sıfırlanacak Müşteri',
      email: 'reset@example.com',
      role: 'customer' as const,
      status: 'active' as const,
      created_at: new Date().toISOString()
    });

    const resetResult = await db.executeFactoryReset({
      wipeDevices: true,
      wipeTelemetry: true,
      wipeUsers: true,
      wipeDashboards: true,
      wipeAlarms: true,
      wipeAutomations: true,
      wipeFirmwares: false,
      wipeServiceTokens: true,
      wipeDeviceCommands: true,
      wipeSystemSettings: false,
      wipeAuditLogs: false,
      wipeAll: false
    }, { id: 'usr_admin', name: 'Sistem Yöneticisi' });

    expect(resetResult.success).toBe(true);
    expect(db.data.devices.find((d: any) => d.id === 'dev_test_reset')).toBeUndefined();
    expect(db.data.users.find((u: any) => u.id === 'cust_reset')).toBeUndefined();
    // usr_admin must be preserved!
    expect(db.data.users.some((u: any) => u.id === 'usr_admin')).toBe(true);
  });
});
