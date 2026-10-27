import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { systemLogger } from '../../server/services/systemLogger.service.js';
import { db } from '../../server/db.js';

describe('System Log & Audit Persistence Architecture', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-log-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('1. systemLogger.flush() synchronously forces pending writes to disk immediately', () => {
    const initialConfig = systemLogger.getConfig();
    expect(initialConfig.filePath).toBeDefined();

    // Log a distinctive test event
    const testMsg = `Persistence test message at ${Date.now()}`;
    systemLogger.info('server', testMsg, { test: true }, 'test_runner');

    // Trigger explicit flush
    systemLogger.flush();

    // Verify file exists and has content
    expect(fs.existsSync(initialConfig.filePath)).toBe(true);
    const fileContent = fs.readFileSync(initialConfig.filePath, 'utf-8');
    expect(fileContent).toContain(testMsg);
  });

  it('2. getAuditLogsAsync retrieves in-memory cached logs and supports filtering', async () => {
    const adminId = 'usr_admin';
    const actionText = `Admin Audit Action Verification ${Date.now()}`;
    await db.addAuditLog(adminId, 'Admin User', actionText, 'medium');

    const logs = await db.getAuditLogsAsync();
    expect(Array.isArray(logs)).toBe(true);
    const found = logs.find((l) => l.action === actionText);
    expect(found).toBeDefined();
    expect(found?.severity).toBe('medium');
    expect(found?.tenantId).toBe(adminId);
  });

  it('3. In-memory audit log cache preserves history across multiple events', async () => {
    const testUser = `usr_test_${Date.now()}`;
    await db.addAuditLog(testUser, 'Test Operator', 'User created device', 'low');
    await db.addAuditLog(testUser, 'Test Operator', 'User updated device', 'low');

    const allLogs = await db.getAuditLogsAsync(testUser);
    expect(Array.isArray(allLogs)).toBe(true);
    const userLogs = allLogs.filter((l) => l.tenantId === testUser || l.userId === testUser);
    expect(userLogs.length).toBeGreaterThanOrEqual(2);
  });

  it('4. getConfig() returns resolved persistent filePath', () => {
    const config = systemLogger.getConfig();
    expect(typeof config.filePath).toBe('string');
    expect(config.filePath.length).toBeGreaterThan(0);
    expect(config.filePath.endsWith('system_events.log')).toBe(true);
  });
});
