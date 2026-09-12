import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../server/db.js';
import type { Device, User, TelemetryReading } from '../types.js';

describe('P0.4: Backup, Restore, Schema Migration & Release Upgrade Suite', () => {
  const backupDir = path.join(process.cwd(), 'backups');
  let createdBackupFiles: string[] = [];
  let originalDbDataSnapshot: any;

  beforeAll(() => {
    originalDbDataSnapshot = JSON.parse(JSON.stringify(db.data));
  });

  afterAll(() => {
    if (originalDbDataSnapshot) {
      db.data = originalDbDataSnapshot;
      db.saveData(db.data);
    }
  });

  beforeEach(() => {
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up created test backup files
    createdBackupFiles.forEach((file) => {
      const fullPath = path.join(backupDir, file);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch {
          // ignore
        }
      }
    });
    createdBackupFiles = [];
  });

  it('1. Create durable JSON/SQL backup and verify structural completeness', async () => {
    // Ensure test data exists
    const testDevId = `dev_backup_test_${Date.now()}`;
    db.addDevice({
      id: testDevId,
      name: 'Backup Test Device',
      type: 'ESP32',
      tenantId: 'usr_admin',
      apiKey: `key_${testDevId}`,
      status: 'online',
      metrics: { temperature: 26.5 },
      lastSeen: new Date().toISOString(),
    } as any);

    const backupResult = await db.createBackup();
    expect(backupResult).toBeDefined();
    expect(backupResult.success).toBe(true);
    const backupFile = backupResult.filename;
    expect(typeof backupFile).toBe('string');
    createdBackupFiles.push(backupFile);

    const backupPath = path.join(backupDir, backupFile);
    expect(fs.existsSync(backupPath)).toBe(true);

    const content = fs.readFileSync(backupPath, 'utf8');
    const parsed = JSON.parse(content);

    expect(parsed).toHaveProperty('devices');
    expect(parsed).toHaveProperty('users');
    expect(Array.isArray(parsed.devices)).toBe(true);
    expect(parsed.devices.some((d: any) => d.id === testDevId)).toBe(true);
  });

  it('2. List backups with metadata and file size', () => {
    const list = db.listBackups();
    expect(Array.isArray(list)).toBe(true);
    if (list.length > 0) {
      expect(list[0]).toHaveProperty('filename');
      expect(list[0]).toHaveProperty('size');
      expect(list[0]).toHaveProperty('createdAt');
      expect(typeof list[0].size).toBe('number');
    }
  });

  it('3. Restore database state from backup and verify entity preservation', async () => {
    const targetDevId = `dev_restore_verify_${Date.now()}`;
    const testDevice: Device = {
      id: targetDevId,
      name: 'Pre-Backup Snapshot Sensor',
      type: 'NodeMCU',
      tenantId: 'usr_admin',
      apiKey: `key_restore_${Date.now()}`,
      status: 'online',
      metrics: { pressure: 1013.25 },
      lastSeen: new Date().toISOString(),
    } as any;

    db.addDevice(testDevice);
    const backupResult = await db.createBackup();
    const backupFile = backupResult.filename;
    createdBackupFiles.push(backupFile);

    // Modify local state by deleting test device
    db.deleteDevice(targetDevId);
    expect(db.getDeviceById(targetDevId)).toBeUndefined();

    // Restore from backup
    const restored = db.restoreBackup(backupFile);
    expect(restored).toBe(true);

    // Verify entity was restored
    const restoredDev = db.getDeviceById(targetDevId);
    expect(restoredDev).toBeDefined();
    expect(restoredDev?.name).toBe('Pre-Backup Snapshot Sensor');
    expect(restoredDev?.metrics?.pressure).toBe(1013.25);
  });

  it('4. Schema Migration & Version Upgrade backward compatibility', () => {
    // Simulate a legacy schema payload (v1.0.0 without tenantId or rateLimitPerMin)
    const legacySnapshot = {
      version: '1.0.0',
      devices: [
        {
          id: 'dev_legacy_01',
          name: 'Old Industrial Sensor',
          type: 'ESP8266',
          // Missing tenantId, rateLimitPerMin, roleKey
          apiKey: 'key_legacy_esp8266',
          status: 'online',
          metrics: { temperature: 21.0 },
        },
      ],
      users: [
        {
          id: 'usr_legacy_01',
          email: 'legacy_user@example.com',
          name: 'Legacy Operator',
          role: 'customer',
          created_at: new Date().toISOString(),
        },
      ],
      telemetry: [
        {
          id: 'tel_legacy_01',
          deviceId: 'dev_legacy_01',
          metric: 'temperature',
          value: 21.0,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const legacyFilename = `db_backup_legacy_v1_${Date.now()}.json`;
    const legacyPath = path.join(backupDir, legacyFilename);
    fs.writeFileSync(legacyPath, JSON.stringify(legacySnapshot), 'utf8');
    createdBackupFiles.push(legacyFilename);

    const restoreSuccess = db.restoreBackup(legacyFilename);
    expect(restoreSuccess).toBe(true);

    const migratedDev = db.getDeviceById('dev_legacy_01');
    expect(migratedDev).toBeDefined();
    expect(migratedDev?.id).toBe('dev_legacy_01');
    // Ensure migrated devices function properly
    expect(migratedDev?.name).toBe('Old Industrial Sensor');
  });
});
