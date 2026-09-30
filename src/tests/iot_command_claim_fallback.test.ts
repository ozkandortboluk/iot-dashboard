import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { db } from '../server/db.js';

describe('IOT-01: claimPendingCommands Production Mode Fail-Closed Gate', () => {
  let originalPostgresRepo: any;

  beforeAll(() => {
    originalPostgresRepo = db.postgresRepo;
  });

  afterAll(() => {
    db.postgresRepo = originalPostgresRepo;
  });

  it('should throw an error and refuse RAM fallback when in production mode and postgres claim fails', async () => {
    // 1. Force production mode mock
    const originalIsProd = db.isPostgresProductionMode;
    db.isPostgresProductionMode = () => true;

    // 2. Mock postgresRepo to throw on claim
    const mockRepo: any = {
      claimPendingCommands: vi.fn().mockRejectedValue(new Error('PostgreSQL Lock/Connection Failure')),
    };
    db.postgresRepo = mockRepo;

    // 3. Clear commands in RAM to isolate
    db.data.commands = [];

    // 4. Call claimPendingCommands and assert it throws without falling back
    await expect(db.claimPendingCommands('dev_test_id')).rejects.toThrow('PostgreSQL Lock/Connection Failure');

    // Restore
    db.isPostgresProductionMode = originalIsProd;
  });

  it('should successfully return the claimed commands without throwing when in production mode and postgres claim succeeds', async () => {
    // 1. Force production mode mock
    const originalIsProd = db.isPostgresProductionMode;
    db.isPostgresProductionMode = () => true;

    // 2. Mock postgresRepo to succeed on claim
    const mockRepo: any = {
      claimPendingCommands: vi.fn().mockResolvedValue([
        { id: 'cmd_123', deviceId: 'dev_test_id', status: 'claimed' }
      ]),
    };
    db.postgresRepo = mockRepo;

    // 3. Call claimPendingCommands and assert success
    const result = await db.claimPendingCommands('dev_test_id');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('cmd_123');

    // Restore
    db.isPostgresProductionMode = originalIsProd;
  });
});
