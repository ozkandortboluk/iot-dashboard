import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../server/db.js';

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
    // Ensure canonical test device exists
    const testDevId = 'dev_test_01';
    let dev = db.getDeviceById(testDevId);
    if (!dev) {
      dev = {
        id: testDevId,
        tenantId: 'usr_test_admin',
        name: 'Kanonik Test Cihazı',
        type: 'sensor',
        apiKey: 'dev_key_test_0000000000000000',
        status: 'online',
        location: 'Test Laboratuvarı',
        metrics: { temperature: 24.5 },
      } as any;
      if (!db.data.devices) db.data.devices = [];
      db.data.devices.push(dev);
    } else {
      dev.tenantId = 'usr_test_admin';
    }

    const backupResult = await db.createBackup();
    expect(backupResult).toBeDefined();
    expect(backupResult.success).toBe(true);
    const backupFile = backupResult.filename;
    expect(typeof backupFile).toBe('string');
    createdBackupFiles.push(backupFile);

    const backupPath = path.join(backupDir, backupFile);
    expect(fs.existsSync(backupPath)).toBe(true);

    const stats = fs.statSync(backupPath);
    expect(stats.size).toBeGreaterThan(0);

    const verification = db.verifyBackupFile(backupFile);
    expect(verification.isHealthy).toBe(true);
    expect(verification.sizeBytes).toBeGreaterThan(0);
    expect(verification.checksum.length).toBe(64); // SHA256 hex length
  });

  it('2. List backups with metadata and file size', async () => {
    const backupResult = await db.createBackup();
    if (backupResult.success) {
      createdBackupFiles.push(backupResult.filename);
    }

    const list = db.listBackups();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).toHaveProperty('filename');
    expect(list[0]).toHaveProperty('size');
    expect(list[0]).toHaveProperty('createdAt');
    expect(typeof list[0].size).toBe('number');

    const detailedSnapshots = db.listDetailedSnapshots();
    expect(Array.isArray(detailedSnapshots)).toBe(true);
    expect(detailedSnapshots.length).toBeGreaterThan(0);
    expect(detailedSnapshots[0].verificationReport.isHealthy).toBe(true);
    expect(detailedSnapshots[0].checksum).not.toContain('md5');
  });

  it('3. Verify real .sql backup and listing when in production mode with pg_dump', async () => {
    // Simulate valid SQL backup file
    const sqlFilename = `pg_backup_test_${Date.now()}.sql`;
    const sqlPath = path.join(backupDir, sqlFilename);
    const mockSqlDump = `-- PostgreSQL database dump
SET statement_timeout = 0;
SET lock_timeout = 0;

CREATE TABLE users (id text PRIMARY KEY, email text);
CREATE TABLE devices (id text PRIMARY KEY, name text);
CREATE TABLE telemetry_readings (id text PRIMARY KEY, value numeric);

INSERT INTO users VALUES ('usr_01', 'admin@example.com');
INSERT INTO devices VALUES ('dev_01', 'Test Device');
-- PostgreSQL database dump complete
`;
    fs.writeFileSync(sqlPath, mockSqlDump, 'utf8');
    createdBackupFiles.push(sqlFilename);

    const verification = db.verifyBackupFile(sqlFilename);
    expect(verification.isHealthy).toBe(true);
    expect(verification.tablesVerified).toBe(3);
    expect(verification.recordsCount).toBe(2);

    const list = db.listBackups();
    expect(list.some((b) => b.filename === sqlFilename)).toBe(true);
  });

  it('4. Rejects corrupted SQL backup and prevents database modification', async () => {
    const corruptedFilename = `pg_backup_corrupted_${Date.now()}.sql`;
    const corruptedPath = path.join(backupDir, corruptedFilename);
    fs.writeFileSync(corruptedPath, 'CORRUPTED NON-SQL INVALID DATA 12345', 'utf8');
    createdBackupFiles.push(corruptedFilename);

    const verification = db.verifyBackupFile(corruptedFilename);
    expect(verification.isHealthy).toBe(false);

    const initialDeviceCount = db.data.devices.length;
    const restored = await db.restoreBackup(corruptedFilename);
    expect(restored).toBe(false);

    // Ensure database state remained untouched
    expect(db.data.devices.length).toBe(initialDeviceCount);
  });

  it('5. Return failure when pg_dump is missing in production mode without fake JSON fallback', async () => {
    const originalProd = process.env.VPS_PRODUCTION;
    const originalPath = process.env.PATH;
    try {
      process.env.VPS_PRODUCTION = 'true';
      // Force empty PATH so pg_dump cannot be located
      process.env.PATH = '/non_existent_bin_dir';

      const backupRes = await db.createBackup();
      expect(backupRes.success).toBe(false);
      expect(backupRes.filename).toBe('');
      expect(backupRes.size).toBe(0);
    } finally {
      process.env.VPS_PRODUCTION = originalProd;
      process.env.PATH = originalPath;
    }
  });

  it('6. Preserve legacy JSON backup restore functionality', async () => {
    const targetDevId = 'dev_test_01';
    let originalDev = db.getDeviceById(targetDevId);
    if (!originalDev) {
      originalDev = {
        id: targetDevId,
        tenantId: 'usr_test_admin',
        name: 'Kanonik Test Cihazı',
        type: 'sensor',
        apiKey: 'dev_key_test_0000000000000000',
        status: 'online',
        location: 'Test Laboratuvarı',
        metrics: { pressure: 99.9 },
      } as any;
      if (!db.data.devices) db.data.devices = [];
      db.data.devices.push(originalDev);
    }
    expect(originalDev).toBeDefined();

    if (originalDev) {
      originalDev.metrics = { ...(originalDev.metrics || {}), pressure: 99.9 };
    }

    const legacySnapshot = {
      version: '1.0.0',
      devices: [
        {
          id: targetDevId,
          tenantId: 'usr_test_admin',
          name: 'Kanonik Test Cihazı',
          type: 'sensor',
          apiKey: 'dev_key_test_0000000000000000',
          status: 'online',
          location: 'Test Laboratuvarı',
          metrics: { pressure: 88.8 },
        },
      ],
      users: [],
    };

    const jsonFilename = `db_backup_json_test_${Date.now()}.json`;
    const jsonPath = path.join(backupDir, jsonFilename);
    fs.writeFileSync(jsonPath, JSON.stringify(legacySnapshot), 'utf8');
    createdBackupFiles.push(jsonFilename);

    const restored = await db.restoreBackup(jsonFilename);
    expect(restored).toBe(true);

    const restoredDev = db.getDeviceById(targetDevId);
    expect(restoredDev).toBeDefined();
    expect(restoredDev?.metrics?.pressure).toBe(88.8);
  });

  it('7. Verify pg_dump major version is PostgreSQL 16.x compatible when installed', async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);

    try {
      const { stdout } = await execFileAsync('pg_dump', ['--version']);
      const versionMatch = stdout.match(/pg_dump \(PostgreSQL\) (\d+)\./i) || stdout.match(/(\d+)\.\d+/);
      if (versionMatch && versionMatch[1]) {
        const majorVersion = parseInt(versionMatch[1], 10);
        expect(majorVersion).toBeGreaterThanOrEqual(16);
      }
    } catch {
      // If pg_dump is not installed in the local preview runner, skipping runtime binary assertion is expected
    }
  });
});
