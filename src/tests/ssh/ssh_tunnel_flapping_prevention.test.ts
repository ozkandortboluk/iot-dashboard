import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '../../server/db.js';
import { SchemaAuditor } from '../../server/database/schemaAuditor.js';
import { DatabaseState } from '../../types.js';

describe('SSH Tunnel & PostgreSQL Flapping Prevention Test Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (db.postgresRepo as any).isMigrationGatePassed;
  });

  it('1. postgresRepo.setPool(pool) is idempotent and does not reset connection when called with the same pool instance', () => {
    const dummyPool = { query: vi.fn(), on: vi.fn(), connect: vi.fn() } as any;

    // Attach initial dummy pool
    db.postgresRepo.setPool(dummyPool);
    db.postgresRepo.setConnected(true, true);

    expect(db.postgresRepo.getIsConnected()).toBe(true);
    expect(db.postgresRepo.getIsSchemaEnsured()).toBe(true);

    const changeSpy = vi.fn();
    const unsub = db.postgresRepo.onConnectionChange(changeSpy);

    // Call setPool again with identical pool reference
    db.postgresRepo.setPool(dummyPool);

    // Must NOT trigger connection change or wipe isConnected/isSchemaEnsured
    expect(changeSpy).not.toHaveBeenCalled();
    expect(db.postgresRepo.getIsConnected()).toBe(true);
    expect(db.postgresRepo.getIsSchemaEnsured()).toBe(true);

    unsub();
  });

  it('2. getPgPool() does not wipe postgresRepo pool or connection state if repo already has the pool', async () => {
    const mockPool = { query: vi.fn(), on: vi.fn(), connect: vi.fn() } as any;
    const connModule = await import('../../server/database/connection.js');
    vi.spyOn(connModule, 'getSharedPgPool').mockReturnValue(mockPool);
    vi.spyOn(db, 'getPostgresUrl').mockReturnValue('postgresql://test:test@127.0.0.1:5432/testdb');

    db.postgresRepo.setPool(mockPool);
    db.postgresRepo.setConnected(true, true);

    const setPoolSpy = vi.spyOn(db.postgresRepo, 'setPool');

    // Calling getPgPool() should not call setPool on repository if repo already holds the same pool
    db.getPgPool();
    expect(setPoolSpy).not.toHaveBeenCalled();
    expect(db.postgresRepo.getIsConnected()).toBe(true);
  });

  it('3. initPostgresRepository() returns true immediately if db is already READY and verified on the same URL', async () => {
    vi.spyOn(db, 'getPostgresUrl').mockReturnValue('postgresql://test:test@127.0.0.1:5432/testdb');
    (db as any).pgPoolUrl = 'postgresql://test:test@127.0.0.1:5432/testdb';
    vi.spyOn(db.postgresRepo, 'isReady').mockReturnValue(true);
    db.setDatabaseState(DatabaseState.READY);

    const setPoolSpy = vi.spyOn(db.postgresRepo, 'setPool');
    const res = await db.initPostgresRepository();

    expect(res).toBe(true);
    expect(db.getDatabaseState()).toBe(DatabaseState.READY);
    expect(setPoolSpy).not.toHaveBeenCalled();
  });

  it('4. onConnectionChange does not demote dbState from READY to DB_UNAVAILABLE if isInitializingPostgres is true', () => {
    (db as any).isInitializingPostgres = true;
    (db as any).dbState = DatabaseState.READY;

    // Trigger connection change with false
    db.postgresRepo.notifyConnectionChange();

    // dbState must remain READY because initialization is in progress
    expect(db.getDatabaseState()).toBe(DatabaseState.READY);
    (db as any).isInitializingPostgres = false;
  });

  it('5. DatabaseAutoHealer does not drop READY state to DB_UNAVAILABLE when schema is healthy and migrations pass even with SSH latency', async () => {
    vi.spyOn(db.postgresRepo, 'isReady').mockReturnValue(true);
    (db.postgresRepo as any).isMigrationGatePassed = vi.fn().mockReturnValue(true);
    vi.spyOn(db.autoHealer, 'clearHungQueriesAndDeadlocks').mockResolvedValue(0);
    vi.spyOn(SchemaAuditor, 'auditSchema').mockResolvedValue({
      isHealthy: true,
      humanReadableMessages: [],
    } as any);
    db.setDatabaseState(DatabaseState.READY);

    const mockPool = {
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('SELECT 1')) return { rows: [{ '?column?': 1 }] };
          if (sql.includes('information_schema.tables')) return { rows: [] };
          return { rows: [] };
        }),
        release: vi.fn(),
        on: vi.fn(),
      }),
      totalCount: 2,
      idleCount: 2,
      waitingCount: 0,
    };

    vi.spyOn(db, 'getPgPool').mockReturnValue(mockPool as any);
    vi.spyOn(db.postgresRepo, 'getPool').mockReturnValue(mockPool as any);

    // Run health check
    const report = await db.autoHealer.runHealthCheckAndAutoRepair();

    // Verify DB remains READY and status is not 'down'
    expect(report.status).not.toBe('down');
    expect(db.getDatabaseState()).toBe(DatabaseState.READY);
  });
});
