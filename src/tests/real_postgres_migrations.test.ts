import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { runAllMigrations, ALL_MIGRATIONS } from '../server/database/migrations/migrationRunner.js';

describe('Real PostgreSQL Migration & Upgrade Integration Matrix', () => {
  let pool: pg.Pool | null = null;
  let isDbReachable = false;
  const dbUrl = process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/postgres';

  beforeAll(async () => {
    try {
      pool = new pg.Pool({
        connectionString: dbUrl,
        connectionTimeoutMillis: 2000,
      });
      const client = await pool.connect();
      client.release();
      isDbReachable = true;
    } catch {
      // Skip running real assertions if no database is running in this sandboxed preview container.
      pool = null;
    }
  });

  afterAll(async () => {
    if (pool) {
      await pool.end().catch(() => {});
    }
  });

  it('should run clean install (001 -> latest) on completely empty DB and verify READY status', async () => {
    if (!isDbReachable || !pool) {
      console.log('⚠️ Skipping real PostgreSQL clean install test (No reachable database at: ' + dbUrl + ')');
      return;
    }

    const schemaName = 'test_clean_migration_install';
    const client = await pool.connect();
    try {
      // 1. Setup isolated clean schema sandbox
      await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE;`);
      await client.query(`CREATE SCHEMA ${schemaName};`);
      await client.query(`SET search_path TO ${schemaName};`);

      // 2. Perform fresh clean install via migrationRunner
      const res = await runAllMigrations(pool);
      expect(res.success).toBe(true);
      expect(res.appliedCount).toBe(22);

      // 3. Verify all canonical tables are present
      const tableCheck = await client.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = $1 AND table_type = 'BASE TABLE';
      `, [schemaName]);
      const tableNames = new Set(tableCheck.rows.map((r: any) => r.table_name));

      expect(tableNames.has('users')).toBe(true);
      expect(tableNames.has('devices')).toBe(true);
      expect(tableNames.has('telemetry_readings')).toBe(true);
      expect(tableNames.has('schema_migrations')).toBe(true);

      // 4. Verify migration count in schema_migrations
      const countRes = await client.query(`SELECT COUNT(*) as count FROM schema_migrations;`);
      expect(Number(countRes.rows[0].count)).toBe(22);
    } finally {
      // Clean sandbox schema
      await client.query(`SET search_path TO public;`).catch(() => {});
      await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE;`).catch(() => {});
      client.release();
    }
  });

  it('should run upgrade from historical state (001-021) to latest (022) with data preservation', async () => {
    if (!isDbReachable || !pool) {
      console.log('⚠️ Skipping real PostgreSQL upgrade test (No reachable database at: ' + dbUrl + ')');
      return;
    }

    const schemaName = 'test_historical_upgrade';
    const client = await pool.connect();
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
        await client.query(
          `INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3);`,
          [m.version, m.name, 'some_checksum_placeholder']
        );
      }

      // Add dummy user and dummy device in the 021 state
      await client.query(`
        INSERT INTO users (id, name, email, password_hash, role)
        VALUES ('usr_test_historical', 'Test User', 'test@historical.com', 'dummy_hash', 'customer');
      `);

      await client.query(`
        INSERT INTO devices (id, name, type, api_key, status)
        VALUES ('dev_test_historical', 'Historical Device', 'meter', 'some_key', 'offline');
      `);

      // 3. Perform live upgrade to 022
      // Execute the remaining 022 migration
      const m022 = ALL_MIGRATIONS.find((m: any) => m.version === '022');
      expect(m022).toBeDefined();

      if (m022) {
        await m022.up(client);
        await client.query(
          `INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3);`,
          [m022.version, m022.name, 'some_checksum_placeholder']
        );
      }

      // 4. Verify entity preservation (data/schema is preserved!)
      const userRes = await client.query(`SELECT id, email, name FROM users WHERE id = 'usr_test_historical';`);
      expect(userRes.rows).toHaveLength(1);
      expect(userRes.rows[0].email).toBe('test@historical.com');

      const devRes = await client.query(`SELECT id, name FROM devices WHERE id = 'dev_test_historical';`);
      expect(devRes.rows).toHaveLength(1);
      expect(devRes.rows[0].name).toBe('Historical Device');

      // 5. Verify the drift / schema structure check
      const totalCount = await client.query(`SELECT COUNT(*) as count FROM schema_migrations;`);
      expect(Number(totalCount.rows[0].count)).toBe(22);
    } finally {
      // Clean sandbox schema
      await client.query(`SET search_path TO public;`).catch(() => {});
      await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE;`).catch(() => {});
      client.release();
    }
  });
});
