import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { db } from '../../server/db.js';

describe('DB-02: PostgreSQL Hydration Empty and Error Boundaries', () => {
  let originalPostgresRepo: any;
  let originalGetPostgresUrl: any;
  let originalGetPgPool: any;

  beforeAll(() => {
    originalPostgresRepo = db.postgresRepo;
    originalGetPostgresUrl = db.getPostgresUrl;
    originalGetPgPool = db.getPgPool;
  });

  afterAll(() => {
    db.postgresRepo = originalPostgresRepo;
    db.getPostgresUrl = originalGetPostgresUrl;
    db.getPgPool = originalGetPgPool;
  });

  it('should preserve existing RAM data when PostgreSQL hydration fails with an error', async () => {
    // 1. Seed some dummy RAM data
    db.data.users = [{ id: 'usr_test', name: 'Test', email: 't@t.com', role: 'admin' }] as any;
    db.data.passwords = { usr_test: 'hash123' };
    db.data.sessions = [{ token: 'tok_test', userId: 'usr_test' }] as any;

    // 2. Mock postgresRepo to throw an error on hydration
    const mockRepo: any = {
      isReady: () => true,
      getPool: () => null,
      setPool: () => {},
      setConnected: () => {},
      ensureTelemetrySchema: async () => {},
      hydrateFromPostgres: vi.fn().mockRejectedValue(new Error('PostgreSQL Query Error')),
    };
    db.postgresRepo = mockRepo;
    db.getPostgresUrl = () => 'postgres://localhost/postgres';
    db.getPgPool = () => ({
      connect: async () => ({
        query: async () => ({ rows: [] }),
        release: () => {},
        on: () => {},
      }),
    } as any);

    // 3. Trigger bootstrap / hydration (casting to any to avoid private property TS error)
    const originalInit = (db as any).isInitializingPostgres;
    (db as any).isInitializingPostgres = false;
    await db.initPostgresRepository().catch(() => {});
    (db as any).isInitializingPostgres = originalInit;

    // 4. Verify RAM is strictly preserved
    expect(db.data.users).toHaveLength(1);
    expect(db.data.passwords.usr_test).toBe('hash123');
    expect(db.data.sessions).toHaveLength(1);
  });

  it('should successfully clear/overwrite RAM data when PostgreSQL hydration returns an authoritative empty snapshot', async () => {
    // 1. Seed some dummy RAM data
    db.data.users = [{ id: 'usr_test', name: 'Test', email: 't@t.com', role: 'admin' }] as any;
    db.data.passwords = { usr_test: 'hash123' };
    db.data.sessions = [{ token: 'tok_test', userId: 'usr_test' }] as any;

    // 2. Mock postgresRepo to return a successful empty snapshot
    const mockRepo: any = {
      isReady: () => true,
      getPool: () => null,
      setPool: () => {},
      setConnected: () => {},
      ensureTelemetrySchema: async () => {},
      hydrateFromPostgres: vi.fn().mockResolvedValue({
        users: [],
        passwords: {},
        devices: [],
        rules: [],
        alarms: [],
        dashboards: [],
        sessions: [],
        firmwares: [],
        otaJobs: [],
      }),
    };
    db.postgresRepo = mockRepo;
    db.getPostgresUrl = () => 'postgres://localhost/postgres';
    db.getPgPool = () => ({
      connect: async () => ({
        query: async () => ({ rows: [] }),
        release: () => {},
        on: () => {},
      }),
    } as any);

    // 3. Trigger hydration (casting to any to avoid private property TS error)
    const originalInit = (db as any).isInitializingPostgres;
    (db as any).isInitializingPostgres = false;
    await db.initPostgresRepository(true).catch(() => {});
    (db as any).isInitializingPostgres = originalInit;

    // 4. Verify RAM is completely cleared by the authoritative snapshot
    expect(db.data.users).toHaveLength(0);
    expect(db.data.passwords).toEqual({});
    expect(db.data.sessions).toHaveLength(0);
  });
});
