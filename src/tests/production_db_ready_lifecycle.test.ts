import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocalDatabase } from '../server/db.js';
import { DatabaseState } from '../types.js';

describe('Production PostgreSQL READY State Lifecycle & Resilience Test Suite', () => {
  const originalEnv = process.env.NODE_ENV;
  let db: LocalDatabase;

  const createMockPool = (): any => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    }),
    totalCount: 5,
    idleCount: 5,
    waitingCount: 0,
    ending: false,
    ended: false,
  });

  const setPostgresOnline = (targetDb: LocalDatabase) => {
    const pool = createMockPool();
    targetDb.postgresRepo.setPool(pool);
    targetDb.postgresRepo.setConnected(true, true);
  };

  const setPostgresOffline = (targetDb: LocalDatabase) => {
    targetDb.postgresRepo.setConnected(false, false);
    targetDb.postgresRepo.setPool(null);
  };

  beforeEach(() => {
    // Reset to a clean Database instance
    db = new LocalDatabase();
    // Stop any periodic timers to keep tests crisp
    db.stopPostgresAutoReconnect();
    db.autoHealer.stopWatchdog();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    db.stopPostgresAutoReconnect();
    db.autoHealer.stopWatchdog();
    vi.restoreAllMocks();
  });

  describe('1. Production State Guard & Initialization Invariance', () => {
    it('should strictly prevent READY state in production when PostgreSQL is not connected', () => {
      process.env.NODE_ENV = 'production';

      // Ensure repo is not connected
      setPostgresOffline(db);

      // Attempting to set READY must be rejected and downgraded to DB_UNAVAILABLE
      db.setDatabaseState(DatabaseState.READY);

      expect(db.postgresRepo.isReady()).toBe(false);
      expect(db.getDatabaseState()).toBe(DatabaseState.DB_UNAVAILABLE);
    });

    it('should dynamically downgrade READY to DB_UNAVAILABLE if getDatabaseState() is called in production without active connection', () => {
      process.env.NODE_ENV = 'production';

      // Force raw internal state without active connection
      (db as any).dbState = DatabaseState.READY;
      setPostgresOffline(db);

      // getDatabaseState in production must detect the inconsistency and return DB_UNAVAILABLE
      const state = db.getDatabaseState();
      expect(state).toBe(DatabaseState.DB_UNAVAILABLE);
    });

    it('should allow READY state in non-production environments (e.g. dev/test) for local WAL development', () => {
      process.env.NODE_ENV = 'test';
      setPostgresOffline(db);

      db.setDatabaseState(DatabaseState.READY);
      expect(db.getDatabaseState()).toBe(DatabaseState.READY);
    });
  });

  describe('2. Connection Drop Scenario (Bağlantı Kopması)', () => {
    it('should transition from READY to DB_UNAVAILABLE when PostgreSQL connection drops in production', () => {
      process.env.NODE_ENV = 'production';

      // 1. Simulate PostgreSQL healthy connection and readiness
      setPostgresOnline(db);
      db.setDatabaseState(DatabaseState.READY);

      expect(db.postgresRepo.isReady()).toBe(true);
      expect(db.getDatabaseState()).toBe(DatabaseState.READY);

      // Listen for state change
      const stateChanges: DatabaseState[] = [];
      const unbind = db.onStateChange((newState) => {
        stateChanges.push(newState);
      });

      // 2. Simulate connection drop (network cut, DB crash, backend terminate)
      setPostgresOffline(db);

      // State should automatically transition to DB_UNAVAILABLE
      expect(db.postgresRepo.isReady()).toBe(false);
      expect(db.getDatabaseState()).toBe(DatabaseState.DB_UNAVAILABLE);
      expect(stateChanges).toContain(DatabaseState.DB_UNAVAILABLE);

      unbind();
    });

    it('should trigger state drop when pool recycling occurs without a replacement pool', () => {
      process.env.NODE_ENV = 'production';

      setPostgresOnline(db);
      db.setDatabaseState(DatabaseState.READY);
      expect(db.getDatabaseState()).toBe(DatabaseState.READY);

      // Calling recyclePgPool removes pool and sets connected to false
      db.recyclePgPool();

      expect(db.getDatabaseState()).toBe(DatabaseState.DB_UNAVAILABLE);
    });
  });

  describe('3. Restart & Recovery Scenario (Geri Gelme & Yeniden Başlama)', () => {
    it('should automatically recover from DB_UNAVAILABLE to READY when PostgreSQL reconnects', () => {
      process.env.NODE_ENV = 'production';

      // 1. Initial disconnected state
      setPostgresOffline(db);
      db.setDatabaseState(DatabaseState.DB_UNAVAILABLE);
      expect(db.getDatabaseState()).toBe(DatabaseState.DB_UNAVAILABLE);

      const stateChanges: DatabaseState[] = [];
      const unbind = db.onStateChange((newState) => {
        stateChanges.push(newState);
      });

      // 2. PostgreSQL comes back online ("Geri Gelme")
      // Connection established and schema validated
      setPostgresOnline(db);

      // State should automatically transition to READY
      expect(db.postgresRepo.isReady()).toBe(true);
      expect(db.getDatabaseState()).toBe(DatabaseState.READY);
      expect(stateChanges).toContain(DatabaseState.READY);

      unbind();
    });

    it('should allow multiple drop-recovery cycles without state drift or deadlock', () => {
      process.env.NODE_ENV = 'production';

      for (let cycle = 1; cycle <= 3; cycle++) {
        // Drop
        setPostgresOffline(db);
        expect(db.getDatabaseState()).toBe(DatabaseState.DB_UNAVAILABLE);

        // Recover
        setPostgresOnline(db);
        expect(db.getDatabaseState()).toBe(DatabaseState.READY);
      }
    });
  });

  describe('4. Server API Protection Middleware Simulation', () => {
    // Replicate the exact middleware logic implemented in server.ts
    function evaluateApiReadiness(database: LocalDatabase, isProd: boolean) {
      const dbState = database.getDatabaseState();
      const isPgReady = Boolean(database.postgresRepo?.isReady());
      const isSystemReady = isProd
        ? (isPgReady && dbState === DatabaseState.READY)
        : (isPgReady || dbState === DatabaseState.READY);

      return {
        isSystemReady,
        httpStatus: isSystemReady ? 200 : 503,
        code: isSystemReady ? 'OK' : 'DB_UNAVAILABLE',
        dbState,
        isPgReady,
      };
    }

    it('should reject API requests with 503 in production if dbState is READY but PostgreSQL is not ready', () => {
      // Inconsistent case where local WAL might try to masquerade as READY
      (db as any).dbState = DatabaseState.READY;
      setPostgresOffline(db);

      const result = evaluateApiReadiness(db, true);
      expect(result.isSystemReady).toBe(false);
      expect(result.httpStatus).toBe(503);
      expect(result.code).toBe('DB_UNAVAILABLE');
    });

    it('should allow API requests with 200 in production ONLY when both PostgreSQL and dbState are READY', () => {
      setPostgresOnline(db);
      db.setDatabaseState(DatabaseState.READY);

      const result = evaluateApiReadiness(db, true);
      expect(result.isSystemReady).toBe(true);
      expect(result.httpStatus).toBe(200);
      expect(result.code).toBe('OK');
    });

    it('should immediately block API requests when connection is lost during runtime in production', () => {
      // 1. Healthy operation
      setPostgresOnline(db);
      db.setDatabaseState(DatabaseState.READY);
      expect(evaluateApiReadiness(db, true).httpStatus).toBe(200);

      // 2. Connection drops
      setPostgresOffline(db);
      const droppedResult = evaluateApiReadiness(db, true);
      expect(droppedResult.isSystemReady).toBe(false);
      expect(droppedResult.httpStatus).toBe(503);

      // 3. Connection restored
      setPostgresOnline(db);
      const recoveredResult = evaluateApiReadiness(db, true);
      expect(recoveredResult.isSystemReady).toBe(true);
      expect(recoveredResult.httpStatus).toBe(200);
    });
  });
});
