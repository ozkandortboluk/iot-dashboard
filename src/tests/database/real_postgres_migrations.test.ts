import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { runAllMigrations, ALL_MIGRATIONS, CANONICAL_MIGRATION_MANIFEST } from '../../server/database/migrations/migrationRunner.js';
import { PostgresRepository } from '../../server/database/postgres.js';
import type { NotificationQueueItem } from '../../types.js';

describe('Real PostgreSQL Migration & Upgrade Integration Matrix', () => {
  let pool: pg.Pool | null = null;
  let isDbReachable = false;
  const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/postgres';

  beforeAll(async () => {
    try {
      pool = new pg.Pool({
        connectionString: dbUrl,
        connectionTimeoutMillis: 2000,
      });
      const client = await pool.connect();
      client.release();
      isDbReachable = true;
    } catch (err) {
      isDbReachable = false;
      pool = null;
    }
  }, 120_000);

  afterAll(async () => {
    if (pool) {
      await pool.end().catch(() => {});
    }
  });

  it('should run clean install (001 -> latest) on completely empty DB and verify READY status', async () => {
    if (!isDbReachable || !pool) {
      if (process.env.TEST_DATABASE_URL || process.env.DATABASE_URL) {
        expect.fail(`❌ [DB-01 FATAL] TEST_DATABASE_URL/PostgreSQL is configured but unreachable at: ${dbUrl}. Real PostgreSQL tests are MANDATORY for DB-01 validation.`);
      } else {
        console.log('⚠️ Skipping real PostgreSQL clean install test (TEST_DATABASE_URL is not configured and no local postgres found).');
        return;
      }
    }

    const schemaName = 'test_clean_migration_install';
    const client = await pool.connect();
    let migrationPool: pg.Pool | null = null;
    try {
      // 1. Setup isolated clean schema sandbox
      await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE;`);
      await client.query(`CREATE SCHEMA ${schemaName};`);

      // Apply an isolated search_path to every migration pool connection.
      client.release();
      migrationPool = new pg.Pool({ connectionString: dbUrl, options: `-c search_path=${schemaName},public` });

      // 2. Perform fresh clean install via migrationRunner
      const res = await runAllMigrations(migrationPool);
      expect(res.success).toBe(true);
      expect(res.appliedCount).toBe(23);

      // Re-connect to verify
      const client2 = await migrationPool.connect();
      try {
        // 3. Verify all canonical tables are present
        const tableCheck = await client2.query(`
          SELECT table_name FROM information_schema.tables 
          WHERE table_schema = $1 AND table_type = 'BASE TABLE';
        `, [schemaName]);
        const tableNames = new Set(tableCheck.rows.map((r: any) => r.table_name));

        expect(tableNames.has('users')).toBe(true);
        expect(tableNames.has('devices')).toBe(true);
        expect(tableNames.has('telemetry_readings')).toBe(true);
        expect(tableNames.has('schema_migrations')).toBe(true);

        // 4. Verify migration count in schema_migrations
        const countRes = await client2.query(`SELECT COUNT(*) as count FROM schema_migrations;`);
        expect(Number(countRes.rows[0].count)).toBe(23);
        const queueTable = await client2.query(`SELECT to_regclass('notification_queue') AS relation;`);
        expect(queueTable.rows[0].relation).toBe('notification_queue');

        const workerA = new PostgresRepository(pool);
        const workerB = new PostgresRepository(pool);
        (workerA as any).isConnected = true;
        (workerB as any).isConnected = true;
        const queuePrefix = `q_pg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const makeQueueItem = (suffix: string): NotificationQueueItem => ({
          id: `${queuePrefix}_${suffix}`,
          tenantId: 'usr_queue_integration',
          channel: 'email',
          recipient: 'queue@example.test',
          title: 'Persistent queue integration',
          message: 'Atomic claim and lease recovery',
          severity: 'warning',
          status: 'pending',
          attempts: 0,
          maxAttempts: 3,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        try {
          const batch = Array.from({ length: 8 }, (_, index) => makeQueueItem(`parallel_${index}`));
          for (const item of batch) await workerA.enqueueNotificationQueueItem(item);
          const [claimedA, claimedB] = await Promise.all([
            workerA.claimNotificationQueueItems('integration-worker-a', 8, 30_000),
            workerB.claimNotificationQueueItems('integration-worker-b', 8, 30_000),
          ]);
          const claimedIds = [...claimedA, ...claimedB].map((item) => item.id);
          expect(claimedIds).toHaveLength(batch.length);
          expect(new Set(claimedIds).size).toBe(batch.length);
          expect(claimedA.some((a) => claimedB.some((b) => b.id === a.id))).toBe(false);

          const recoveryItem = makeQueueItem('recovery');
          await workerA.enqueueNotificationQueueItem(recoveryItem);
          const firstClaim = await workerA.claimNotificationQueueItems('old-process', 1, 1000);
          expect(firstClaim.map((item) => item.id)).toContain(recoveryItem.id);
          await new Promise((resolve) => setTimeout(resolve, 1100));
          const recovered = await workerB.claimNotificationQueueItems('replacement-process', 1, 30_000);
          expect(recovered).toHaveLength(1);
          expect(recovered[0].id).toBe(recoveryItem.id);
          expect(recovered[0].attempts).toBe(2);
          const completed = await workerB.completeNotificationQueueItem(recoveryItem.id, 'replacement-process', { success: true });
          expect(completed?.status).toBe('sent');
        } finally {
          await migrationPool.query(`DELETE FROM notification_queue WHERE id LIKE $1;`, [`${queuePrefix}%`]);
        }
      } finally {
        await client2.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE;`).catch(() => {});
        client2.release();
      }
    } catch (err: any) {
      // Cleanup user search_path on failure
      const cleanupClient = await pool.connect();
      await cleanupClient.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE;`).catch(() => {});
      cleanupClient.release();
      throw err;
    } finally {
      await migrationPool?.end().catch(() => {});
    }
  });

  it('should run upgrade from historical state (001-021) to latest (023) with data preservation', async () => {
    if (!isDbReachable || !pool) {
      if (process.env.TEST_DATABASE_URL) {
        expect.fail(`❌ [DB-01 FATAL] TEST_DATABASE_URL/PostgreSQL is configured but unreachable at: ${dbUrl}. Real PostgreSQL tests are MANDATORY for DB-01 validation.`);
      } else {
        console.log('⚠️ Skipping real PostgreSQL upgrade test (TEST_DATABASE_URL is not configured and no local postgres found).');
        return;
      }
    }

    const schemaName = 'test_historical_upgrade';
    const client = await pool.connect();
    let migrationPool: pg.Pool | null = null;
    try {
      // 1. Setup isolated schema sandbox
      await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE;`);
      await client.query(`CREATE SCHEMA ${schemaName};`);
      await client.query(`SET search_path TO ${schemaName};`);

      // 2. Install migrations up to 021 first
      const migrations021 = ALL_MIGRATIONS.filter((m: any) => parseInt(m.version, 10) <= 21);

      // Perform partial run to 021 by running them sequentially
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(64) PRIMARY KEY,
          name VARCHAR(256) NOT NULL,
          checksum VARCHAR(64),
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      for (const m of migrations021) {
        await m.up(client);
        const manifestEntry = CANONICAL_MIGRATION_MANIFEST[m.version];
        expect(manifestEntry).toBeDefined();

        // Mümkün olan sürümlerde manifestteki gerçek 'provenanceStatus: 'observed' saha checksum'ını seç;
        // yoksa canonicalSourceHash'e fallback yap.
        const observedChecksumEntry = manifestEntry.historicalChecksums?.find(
          (hc: any) => hc.provenanceStatus === 'observed'
        );
        const checksumToInsert = observedChecksumEntry 
          ? observedChecksumEntry.checksum 
          : manifestEntry.canonicalSourceHash;

        await client.query(
          `INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3);`,
          [m.version, m.name, checksumToInsert]
        );
      }

      // Add dummy user and dummy device in the 021 state
      await client.query(`
        INSERT INTO users (id, name, email, password_hash, role)
        VALUES ('usr_test_historical', 'Test User', 'test@historical.com', 'dummy_hash', 'customer');
      `);

      await client.query(`
        INSERT INTO devices (id, name, device_type, api_key, status)
        VALUES ('dev_test_historical', 'Historical Device', 'meter', 'some_key', 'offline');
      `);

      client.release();
      migrationPool = new pg.Pool({ connectionString: dbUrl, options: `-c search_path=${schemaName},public` });

      // 3. Perform live upgrade to latest using the official runAllMigrations.
      // Only the pending 022 and 023 should be detected and applied!
      const res = await runAllMigrations(migrationPool);
      expect(res.success).toBe(true);
      expect(res.appliedCount).toBe(2); // Exactly 022 and 023 applied.

      // Connect to verify state after upgrade
      const client2 = await migrationPool.connect();
      try {
        // 4. Verify entity preservation (data/schema is preserved!)
        const userRes = await client2.query(`SELECT id, email, name FROM users WHERE id = 'usr_test_historical';`);
        expect(userRes.rows).toHaveLength(1);
        expect(userRes.rows[0].email).toBe('test@historical.com');

        const devRes = await client2.query(`SELECT id, name FROM devices WHERE id = 'dev_test_historical';`);
        expect(devRes.rows).toHaveLength(1);
        expect(devRes.rows[0].name).toBe('Historical Device');

        // 5. Verify the drift / schema structure check
        const totalCount = await client2.query(`SELECT COUNT(*) as count FROM schema_migrations;`);
        expect(Number(totalCount.rows[0].count)).toBe(23);
        const queueTable = await client2.query(`SELECT to_regclass('notification_queue') AS relation;`);
        expect(queueTable.rows[0].relation).toBe('notification_queue');
      } finally {
        await client2.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE;`).catch(() => {});
        client2.release();
      }
    } catch (err: any) {
      // Cleanup user search_path on failure
      const cleanupClient = await pool.connect();
      await cleanupClient.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE;`).catch(() => {});
      cleanupClient.release();
      throw err;
    } finally {
      await migrationPool?.end().catch(() => {});
    }
  });
});
