import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { LocalDatabase } from '../server/db.js';
import { DatabaseState, type User } from '../types.js';
import { SchemaAuditor } from '../server/database/schemaAuditor.js';
import { CANONICAL_SCHEMA_METADATA } from '../server/database/canonicalSchema.js';
import { systemRouter } from '../server/routes/system.js';
import { authRouter } from '../server/routes/auth.js';
import { hashPassword } from '../server/utils/crypto.js';

describe('DB-03 & DB-04: Fail-Closed Migration Readiness Gate and Session Integrity Test Suite', () => {
  const originalEnv = process.env.NODE_ENV;
  let db: LocalDatabase;

  const createMockPool = (options: {
    queryHandler?: (sql: string, params?: any[]) => any;
  } = {}): any => {
    const defaultQuery = async (sql: string, params?: any[]) => {
      if (sql.includes('SELECT 1')) return { rows: [{ '?column?': 1 }] };
      if (sql.includes('information_schema.tables')) {
        return {
          rows: Object.keys(CANONICAL_SCHEMA_METADATA.tables).map((t) => ({
            table_name: t,
          })),
        };
      }
      if (sql.includes('pg_stat_activity')) return { rows: [] };
      if (sql.includes('COUNT(*)')) return { rows: [{ count: '1', cnt: '0' }] };
      return { rows: [] };
    };

    return {
      query: vi.fn().mockImplementation(options.queryHandler || defaultQuery),
      connect: vi.fn().mockImplementation(async () => ({
        query: vi.fn().mockImplementation(options.queryHandler || defaultQuery),
        release: vi.fn(),
        on: vi.fn(),
      })),
      totalCount: 5,
      idleCount: 5,
      waitingCount: 0,
      ending: false,
      ended: false,
    };
  };

  beforeEach(() => {
    db = new LocalDatabase();
    db.stopPostgresAutoReconnect();
    db.autoHealer.stopWatchdog();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    db.stopPostgresAutoReconnect();
    db.autoHealer.stopWatchdog();
    vi.restoreAllMocks();
  });

  describe('DB-03: Migration Failure & Fatal Drift Fail-Closed Readiness Gate', () => {
    it('1. should latch postgresRepo.isReady() to false when migration fails or fatal drift is detected', () => {
      const mockPool = createMockPool();
      db.postgresRepo.setPool(mockPool);

      // Simulate a failed migration gate internally
      (db.postgresRepo as any).migrationGatePassed = false;
      (db.postgresRepo as any).isFatalMigrationDrift = true;
      (db.postgresRepo as any).isConnected = true;
      (db.postgresRepo as any).isSchemaEnsured = true;

      // Fail-closed invariant: Even if isConnected and isSchemaEnsured are true,
      // isReady() MUST be false if migrationGatePassed is false or isFatalMigrationDrift is true!
      expect(db.postgresRepo.isReady()).toBe(false);
      expect(db.postgresRepo.isMigrationGatePassed()).toBe(false);
    });

    it('2. should refuse external setConnected(true, true) elevation during fatal migration drift', () => {
      const mockPool = createMockPool();
      db.postgresRepo.setPool(mockPool);

      // Latch fatal drift
      (db.postgresRepo as any).migrationGatePassed = false;
      (db.postgresRepo as any).isFatalMigrationDrift = true;

      // External service / reconnect attempts to mark schema as ensured
      db.postgresRepo.setConnected(true, true);

      // Guard check: isSchemaEnsured and isReady must remain false
      expect(db.postgresRepo.getIsSchemaEnsured()).toBe(false);
      expect(db.postgresRepo.isReady()).toBe(false);
    });

    it('3. Auto-Healer health check cycle CANNOT elevate fatal migration drift / failed migration to READY or healthy', async () => {
      process.env.NODE_ENV = 'production';
      const mockPool = createMockPool({
        queryHandler: async (sql: string) => {
          if (sql.includes('SELECT 1')) return { rows: [{ '?column?': 1 }] };
          if (sql.includes('information_schema.tables')) {
            return {
              rows: Object.keys(CANONICAL_SCHEMA_METADATA.tables).map((t) => ({
                table_name: t,
              })),
            };
          }
          if (sql.includes('pg_stat_activity')) return { rows: [] };
          return { rows: [] };
        },
      });

      db.postgresRepo.setPool(mockPool);
      // Latch fatal drift in repo
      (db.postgresRepo as any).migrationGatePassed = false;
      (db.postgresRepo as any).isFatalMigrationDrift = true;
      (db.postgresRepo as any).isConnected = true;

      // Set DB state to DB_UNAVAILABLE initially
      db.setDatabaseState(DatabaseState.DB_UNAVAILABLE);

      // Run Auto-Healer health check cycle
      const report = await db.autoHealer.runHealthCheckAndAutoRepair();

      // Must remain degraded (or down) and NOT healthy or READY
      expect(['degraded', 'down']).toContain(report.status);
      expect(db.postgresRepo.isReady()).toBe(false);
      expect(db.getDatabaseState()).not.toBe(DatabaseState.READY);
    });

    it('4. HTTP Readiness endpoint (/health/ready) returns 503 and Liveness (/health/live) returns 200 during migration failure', async () => {
      const app = express();
      app.use(express.json());
      app.use(cookieParser());
      app.use('/', systemRouter);

      // Force database to be in unavailable state due to migration failure
      const mockPool = createMockPool();
      db.postgresRepo.setPool(mockPool);
      (db.postgresRepo as any).migrationGatePassed = false;
      (db.postgresRepo as any).isFatalMigrationDrift = true;
      db.setDatabaseState(DatabaseState.DB_UNAVAILABLE);

      // 1. Liveness should be 200 (Container is alive)
      const liveRes = await request(app).get('/health/live');
      expect(liveRes.status).toBe(200);
      expect(liveRes.body.live).toBe(true);

      // 2. Readiness must be 503 (Database not ready due to migration gate)
      const readyRes = await request(app).get('/health/ready');
      expect(readyRes.status).toBe(503);
      expect(readyRes.body.ready).toBe(false);
      expect(readyRes.body.state).not.toBe(DatabaseState.READY);
    });

    it('5. should unlatch to READY (200) only after migration gate and schema verify pass', async () => {
      const mockPool = createMockPool();
      db.postgresRepo.setPool(mockPool);

      // Successfully pass migration and contract verification
      (db.postgresRepo as any).migrationGatePassed = true;
      (db.postgresRepo as any).isFatalMigrationDrift = false;
      (db.postgresRepo as any).isConnected = true;
      (db.postgresRepo as any).isSchemaEnsured = true;
      db.setDatabaseState(DatabaseState.READY);

      expect(db.postgresRepo.isReady()).toBe(true);
      expect(db.getDatabaseState()).toBe(DatabaseState.READY);
    });
    it('6. DISABLE_AUTO_MIGRATION === true MUST NOT bypass fatal drift or unpassed migration gate', () => {
      const originalFlag = process.env.DISABLE_AUTO_MIGRATION;
      try {
        process.env.DISABLE_AUTO_MIGRATION = 'true';
        const mockPool = createMockPool();
        db.postgresRepo.setPool(mockPool);
        (db.postgresRepo as any).isConnected = true;
        (db.postgresRepo as any).isSchemaEnsured = true;

        // Negative Case A: Fatal drift latched
        (db.postgresRepo as any).migrationGatePassed = false;
        (db.postgresRepo as any).isFatalMigrationDrift = true;
        (db.postgresRepo as any).migrationError = 'Fatal checksum drift';
        expect(db.postgresRepo.isReady()).toBe(false);

        // Negative Case B: Migration error present
        (db.postgresRepo as any).isFatalMigrationDrift = false;
        (db.postgresRepo as any).migrationError = 'Migration failed';
        expect(db.postgresRepo.isReady()).toBe(false);

        // Negative Case C: Migration gate not passed
        (db.postgresRepo as any).migrationError = null;
        (db.postgresRepo as any).migrationGatePassed = false;
        expect(db.postgresRepo.isReady()).toBe(false);

        // Positive Case: Both migration gate passed and schema ensured
        (db.postgresRepo as any).migrationGatePassed = true;
        (db.postgresRepo as any).isFatalMigrationDrift = false;
        (db.postgresRepo as any).migrationError = null;
        expect(db.postgresRepo.isReady()).toBe(true);
      } finally {
        process.env.DISABLE_AUTO_MIGRATION = originalFlag;
      }
    });
  });

  describe('DB-04: user_sessions Schema Contract & Zero-Data-Loss Audit Equality', () => {
    it('1. nullable user_sessions.token with NULL rows MUST NOT produce an audit FAIL or data integrity alert', async () => {
      // Mock pool returning 26 rows with NULL token in user_sessions
      const mockPool = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('information_schema.tables')) {
            return { rows: Object.keys(CANONICAL_SCHEMA_METADATA.tables).map((t) => ({ table_name: t })) };
          }
          if (sql.includes('information_schema.columns')) {
            // Return valid columns for all tables, specially providing user_sessions columns with NULL token
            const allCols: any[] = [];
            for (const [tName, tDef] of Object.entries(CANONICAL_SCHEMA_METADATA.tables)) {
              for (const col of tDef.columns) {
                allCols.push({
                  table_name: tName,
                  column_name: col.name,
                  data_type: col.type.toLowerCase().includes('varchar') ? 'character varying' : 'text',
                  character_maximum_length: col.type.includes('(') ? parseInt(col.type.replace(/[^0-9]/g, ''), 10) : undefined,
                  is_nullable: col.nullable ? 'YES' : 'NO',
                  column_default: col.defaultValue,
                });
              }
            }
            return { rows: allCols };
          }
          if (sql.includes('pg_indexes')) {
            const allIdxs: any[] = [];
            for (const [tName, tDef] of Object.entries(CANONICAL_SCHEMA_METADATA.tables)) {
              for (const idx of tDef.indexes || []) {
                allIdxs.push({
                  tablename: tName,
                  indexname: idx.name,
                  indexdef: `CREATE INDEX ${idx.name} ON public.${tName} (${idx.columns.join(', ')})`,
                });
              }
            }
            return { rows: allIdxs };
          }
          if (sql.includes('pg_constraint')) {
            const allConstraints: any[] = [];
            for (const [tName, tDef] of Object.entries(CANONICAL_SCHEMA_METADATA.tables)) {
              allConstraints.push({
                constraint_name: `${tName}_pkey`,
                constraint_type: 'p',
                table_name: tName,
                constraint_def: `PRIMARY KEY (${tDef.primaryKey.join(', ')})`,
              });
            }
            return { rows: allConstraints };
          }
          if (sql.includes('COUNT(*)') && sql.includes('"token" IS NULL')) {
            // 26 legacy session rows with NULL token
            return { rows: [{ cnt: '26' }] };
          }
          return { rows: [] };
        }),
      };

      // 1. Audit schema
      const report = await SchemaAuditor.auditSchema(mockPool as any);
      // No missing NOT NULL constraint should be generated for user_sessions.token
      const tokenNotnullMissing = report.discrepancies.missingConstraints.some(
        (c) => c.table === 'user_sessions' && c.constraintName === 'nn_user_sessions_token'
      );
      expect(tokenNotnullMissing).toBe(false);

      // 2. Auto-heal must not report fatal data integrity alert for user_sessions.token
      const healResult = await SchemaAuditor.autoHeal(mockPool as any, report);
      expect(healResult.errors.filter((e) => e.includes('token'))).toHaveLength(0);
      expect(healResult.remainingDiscrepancies.filter((d) => d.includes('user_sessions.token'))).toHaveLength(0);
    });

    it('2. a genuine canonical nullable: false column with NULL rows DOES produce an audit FAIL (Zero Data Loss)', async () => {
      // Create scenario where a canonical NOT NULL column (e.g. id) has NULL rows in the database
      const mockPool = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('information_schema.tables')) {
            return { rows: [{ table_name: 'users' }] };
          }
          if (sql.includes('information_schema.columns')) {
            return {
              rows: [
                // Live DB column is erroneously marked as nullable 'YES' for a non-nullable canonical column 'name'
                { table_name: 'users', column_name: 'id', data_type: 'character varying', character_maximum_length: 64, is_nullable: 'NO' },
                { table_name: 'users', column_name: 'email', data_type: 'character varying', character_maximum_length: 128, is_nullable: 'NO' },
                { table_name: 'users', column_name: 'name', data_type: 'character varying', character_maximum_length: 128, is_nullable: 'YES' },
                { table_name: 'users', column_name: 'role', data_type: 'character varying', character_maximum_length: 32, is_nullable: 'NO', column_default: "'customer'::character varying" },
                { table_name: 'users', column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO', column_default: 'CURRENT_TIMESTAMP' },
              ],
            };
          }
          if (sql.includes('pg_indexes')) {
            return { rows: [] };
          }
          if (sql.includes('pg_constraint')) {
            return {
              rows: [
                { constraint_name: 'users_pkey', constraint_type: 'p', table_name: 'users', constraint_def: 'PRIMARY KEY (id)' },
              ],
            };
          }
          if (sql.includes('COUNT(*)') && sql.includes('"name" IS NULL')) {
            // Live DB contains 5 rows where name is NULL!
            return { rows: [{ cnt: '5' }] };
          }
          return { rows: [] };
        }),
      };

      const report = await SchemaAuditor.auditSchema(mockPool as any);
      // 'name' in users is nullable: false in canonical schema, so missing NOT NULL constraint should be detected
      const nameConstraint = report.discrepancies.missingConstraints.find(
        (c) => c.table === 'users' && c.constraintName === 'nn_users_name'
      );
      expect(nameConstraint).toBeDefined();

      // Auto-heal must fail-closed because NULL rows exist and cannot be deleted silently (Zero Data Loss)
      const healResult = await SchemaAuditor.autoHeal(mockPool as any, report);
      expect(healResult.verificationPassed).toBe(false);
      expect(healResult.errors.some((e) => e.includes('users.name'))).toBe(true);
    });

    it('3. upgrade reconciliation of legacy sessions safely generates token_hash in migration 021 and AutoHealer runs zero DDL on sessions', async () => {
      // 1. Test Migration 021 safely reconciles legacy user_sessions without data deletion
      const migrationExecutedSqls: string[] = [];
      const mockMigrationClient: any = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          migrationExecutedSqls.push(sql);
          return { rows: [] };
        }),
      };

      const { migration021 } = await import('../server/database/migrations/021_hash_device_and_session_tokens.js');
      await migration021.up(mockMigrationClient);

      // Verify that non-destructive legacy session hashing reconciliation SQL was executed by Migration 021
      const sessionUpdate = migrationExecutedSqls.find((q) => q.includes('token_hash = encode(sha256(token::bytea)'));
      expect(sessionUpdate).toBeDefined();
      expect(sessionUpdate).toContain('UPDATE user_sessions');
      expect(migrationExecutedSqls.some((q) => q.includes('DELETE FROM user_sessions;'))).toBe(false);

      // 2. Test that subsequent Auto-Healer cycles do NOT issue DDL or data mutations against user_sessions
      const healerExecutedSqls: string[] = [];
      const queryFn = vi.fn().mockImplementation(async (sql: string) => {
        healerExecutedSqls.push(sql);
        if (sql.includes('information_schema.tables')) {
          return { rows: Object.keys(CANONICAL_SCHEMA_METADATA.tables).map((t) => ({ table_name: t })) };
        }
        if (sql.includes('information_schema.columns')) {
          return { rows: [{ column_name: 'token' }, { column_name: 'expires_at' }] };
        }
        return { rows: [] };
      });

      const mockPool = {
        query: queryFn,
        connect: vi.fn().mockImplementation(async () => ({
          query: queryFn,
          release: vi.fn(),
          on: vi.fn(),
        })),
      };

      (db as any).getPgPool = () => mockPool;
      // Run two consecutive rounds of verifyAndRepairTables from AutoHealer
      await db.autoHealer.verifyAndRepairTables();
      await db.autoHealer.verifyAndRepairTables();

      // Ensure no ALTER TABLE user_sessions or UPDATE user_sessions was executed by AutoHealer
      const healerSessionAlters = healerExecutedSqls.filter((q) => q.includes('user_sessions') && (q.includes('ALTER TABLE') || q.includes('UPDATE')));
      expect(healerSessionAlters).toHaveLength(0);
    });

    it('4. Auth lifecycle: login -> authenticated session verification -> logout cleanly functions with token hashing', async () => {
      const testEmail = `operator_${Date.now()}@nexusnodeiot.com.tr`;
      const testPassword = 'Password123!';

      // Register active user in db
      const user = await db.registerUser(
        'Test Operatör',
        testEmail,
        testPassword,
        'operator',
        'Operasyon A.Ş.'
      );
      if (!db.data.passwords) db.data.passwords = {};
      db.data.passwords[user.id] = hashPassword(testPassword);

      // 1. Authenticate user
      const authRes = await db.authenticate(testEmail, testPassword);
      expect(authRes).not.toBeNull();
      expect(authRes?.user.id).toBe(user.id);
      expect(authRes?.token).toBeDefined();

      const sessionToken = authRes!.token;

      // 2. Verify session via verifySessionAsync
      const verified = await db.verifySessionAsync(sessionToken);
      expect(verified).not.toBeNull();
      expect(verified?.user.id).toBe(user.id);
      expect(verified?.user.email).toBe(testEmail);

      // 3. Logout / terminate session
      const deleted = await db.userRepository.deleteSession(sessionToken);
      expect(deleted).toBe(true);

      // 4. Session verification must now fail
      const afterLogout = await db.verifySessionAsync(sessionToken);
      expect(afterLogout).toBeNull();
    });
  });
});
