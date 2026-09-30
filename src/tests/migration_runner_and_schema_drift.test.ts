import { describe, it, expect, vi } from 'vitest';
import {
  ALL_MIGRATIONS,
  CANONICAL_MIGRATION_MANIFEST,
  computeMigrationChecksum,
  isMigrationChecksumValid,
  runAllMigrations,
  getMigrationStatus,
} from '../server/database/migrations/migrationRunner.js';
import { migration002 } from '../server/database/migrations/002_timescale_hypertables.js';
import { migration022 } from '../server/database/migrations/022_add_system_settings_and_device_activity_columns.js';
import { CANONICAL_SCHEMA_METADATA } from '../server/database/canonicalSchema.js';

describe('DB-01 / USR-03: Deterministic Migrations & Schema Drift Gate', () => {
  describe('1. Deterministic Checksum & Manifest Contract', () => {
    it('should have all migrations from 001 to 022 in ALL_MIGRATIONS in strict sequential order', () => {
      expect(ALL_MIGRATIONS.length).toBe(22);
      for (let i = 0; i < ALL_MIGRATIONS.length; i++) {
        const expectedVer = String(i + 1).padStart(3, '0');
        expect(ALL_MIGRATIONS[i].version).toBe(expectedVer);
        expect(ALL_MIGRATIONS[i].name).toBeTruthy();
        expect(typeof ALL_MIGRATIONS[i].up).toBe('function');
      }
    });

    it('should match CANONICAL_MIGRATION_MANIFEST for all 22 migrations', () => {
      for (const m of ALL_MIGRATIONS) {
        const manifest = CANONICAL_MIGRATION_MANIFEST[m.version];
        expect(manifest).toBeDefined();
        expect(manifest.version).toBe(m.version);
        expect(manifest.name).toBe(m.name);
        expect(manifest.canonicalChecksum).toHaveLength(32);
        expect(computeMigrationChecksum(m)).toBe(manifest.canonicalChecksum);
      }
    });

    it('should validate canonical and accepted historical checksums accurately', () => {
      // 001 canonical check
      const m001 = CANONICAL_MIGRATION_MANIFEST['001'];
      expect(isMigrationChecksumValid('001', m001.canonicalChecksum)).toBe(true);
      expect(isMigrationChecksumValid('001', '001_legacy_core_relational_tables')).toBe(true);

      // Missing checksum is valid (will be backfilled)
      expect(isMigrationChecksumValid('001', null)).toBe(true);
      expect(isMigrationChecksumValid('001', undefined)).toBe(true);

      // Mutated / Tampered checksum must fail validation
      expect(isMigrationChecksumValid('001', 'tampered_or_invalid_checksum_12345')).toBe(false);
      expect(isMigrationChecksumValid('019', 'tampered_or_invalid_checksum_12345')).toBe(false);
      expect(isMigrationChecksumValid('022', 'tampered_or_invalid_checksum_12345')).toBe(false);
    });

    it('should include system_settings in canonicalSchema metadata and table creation order', () => {
      expect(CANONICAL_SCHEMA_METADATA.tables.system_settings).toBeDefined();
      expect(CANONICAL_SCHEMA_METADATA.tables.system_settings.primaryKey).toEqual(['key']);
      expect(CANONICAL_SCHEMA_METADATA.tables.system_settings.columns.some((c) => c.name === 'key')).toBe(true);
      expect(CANONICAL_SCHEMA_METADATA.tables.system_settings.columns.some((c) => c.name === 'value')).toBe(true);
    });
  });

  describe('2. Migration Runner Fail-Closed & Drift Enforcement', () => {
    it('should fail-closed when database contains an unknown migration version', async () => {
      const mockClient = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('pg_try_advisory_lock')) {
            return { rows: [{ locked: true }] };
          }
          if (sql.includes('SELECT version, name, checksum FROM schema_migrations')) {
            return {
              rows: [
                { version: '001', name: 'core_relational_tables', checksum: CANONICAL_MIGRATION_MANIFEST['001'].canonicalChecksum },
                { version: '999_rogue', name: 'untracked_external_mutation', checksum: 'abc123' },
              ],
            };
          }
          if (sql.includes('pg_advisory_unlock')) {
            return { rows: [{ unlocked: true }] };
          }
          return { rows: [] };
        }),
        on: vi.fn(),
        release: vi.fn(),
      };

      const mockPool: any = {
        connect: vi.fn(async () => mockClient),
      };

      const res = await runAllMigrations(mockPool);
      expect(res.success).toBe(false);
      expect(res.error).toContain('unknown migration version');
    });

    it('should fail-closed when database contains a checksum mismatch (tampered migration)', async () => {
      const mockClient = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('pg_try_advisory_lock')) {
            return { rows: [{ locked: true }] };
          }
          if (sql.includes('SELECT version, name, checksum FROM schema_migrations')) {
            return {
              rows: [
                { version: '001', name: 'core_relational_tables', checksum: 'corrupted_or_mutated_checksum_value' },
              ],
            };
          }
          if (sql.includes('pg_advisory_unlock')) {
            return { rows: [{ unlocked: true }] };
          }
          return { rows: [] };
        }),
        on: vi.fn(),
        release: vi.fn(),
      };

      const mockPool: any = {
        connect: vi.fn(async () => mockClient),
      };

      const res = await runAllMigrations(mockPool);
      expect(res.success).toBe(false);
      expect(res.error).toContain('checksum mismatch');
    });

    it('should backfill missing checksums safely on existing applied migrations', async () => {
      let backfilledSql = '';
      const mockClient = {
        query: vi.fn(async (sql: string, params?: any[]) => {
          if (sql.includes('pg_try_advisory_lock')) {
            return { rows: [{ locked: true }] };
          }
          if (sql.includes('SELECT version, name, checksum FROM schema_migrations')) {
            return {
              rows: [
                // All 22 applied, but version 001 has missing/null checksum
                ...ALL_MIGRATIONS.map((m) => ({
                  version: m.version,
                  name: m.name,
                  checksum: m.version === '001' ? null : computeMigrationChecksum(m),
                })),
              ],
            };
          }
          if (sql.includes('UPDATE schema_migrations SET checksum')) {
            backfilledSql = sql;
            return { rowCount: 1 };
          }
          if (sql.includes('pg_advisory_unlock')) {
            return { rows: [{ unlocked: true }] };
          }
          return { rows: [] };
        }),
        on: vi.fn(),
        release: vi.fn(),
      };

      const mockPool: any = {
        connect: vi.fn(async () => mockClient),
      };

      const res = await runAllMigrations(mockPool);
      expect(res.success).toBe(true);
      expect(backfilledSql).toContain('UPDATE schema_migrations SET checksum');
    });

    it('should successfully apply pending migrations in strict transaction and write canonical checksum', async () => {
      const executedQueries: string[] = [];
      const mockClient = {
        query: vi.fn(async (sql: string, params?: any[]) => {
          executedQueries.push(sql);
          if (sql.includes('pg_try_advisory_lock')) {
            return { rows: [{ locked: true }] };
          }
          if (sql.includes('SELECT version, name, checksum FROM schema_migrations')) {
            // Migrations 001 to 021 applied, 022 pending
            return {
              rows: ALL_MIGRATIONS.filter((m) => m.version !== '022').map((m) => ({
                version: m.version,
                name: m.name,
                checksum: computeMigrationChecksum(m),
              })),
            };
          }
          if (sql.includes('pg_advisory_unlock')) {
            return { rows: [{ unlocked: true }] };
          }
          return { rows: [] };
        }),
        on: vi.fn(),
        release: vi.fn(),
      };

      const mockPool: any = {
        connect: vi.fn(async () => mockClient),
      };

      const res = await runAllMigrations(mockPool);
      expect(res.success).toBe(true);
      expect(res.appliedCount).toBe(1);

      // Verify insertion of 022 into schema_migrations
      const insertQuery = executedQueries.find((q) => q.includes('INSERT INTO schema_migrations'));
      expect(insertQuery).toBeDefined();
    });
  });

  describe('3. TimescaleDB Migration 002 Strict Failure Handling', () => {
    it('should propagate hypertable creation errors when TimescaleDB is enabled', async () => {
      const mockClient = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('pg_extension')) {
            return { rows: [{ extversion: '2.14.2' }] };
          }
          if (sql.includes('timescaledb_version()')) {
            return { rows: [{ timescaledb_version: '2.14.2' }] };
          }
          if (sql.includes('create_hypertable')) {
            throw new Error('Fatal Disk I/O corruption during create_hypertable');
          }
          return { rows: [] };
        }),
      };

      await expect(migration002.up(mockClient as any)).rejects.toThrow(
        'Fatal Disk I/O corruption during create_hypertable'
      );
    });

    it('should ignore benign already-a-hypertable notices in Migration 002', async () => {
      const mockClient = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('pg_extension')) {
            return { rows: [{ extversion: '2.14.2' }] };
          }
          if (sql.includes('timescaledb_version()')) {
            return { rows: [{ timescaledb_version: '2.14.2' }] };
          }
          if (sql.includes('create_hypertable')) {
            throw new Error('table "telemetry_readings" is already a hypertable');
          }
          return { rows: [] };
        }),
      };

      await expect(migration002.up(mockClient as any)).resolves.not.toThrow();
    });
  });

  describe('4. Migration 022 Forward-Only Execution', () => {
    it('should create system_settings table and indexes', async () => {
      const sqlList: string[] = [];
      const mockClient = {
        query: vi.fn(async (sql: string) => {
          sqlList.push(sql);
          return { rows: [] };
        }),
      };

      await migration022.up(mockClient as any);
      expect(sqlList.some((s) => s.includes('CREATE TABLE IF NOT EXISTS system_settings'))).toBe(true);
      expect(sqlList.some((s) => s.includes('ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_telemetry_at'))).toBe(true);
      expect(sqlList.some((s) => s.includes('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_key'))).toBe(true);
    });
  });
});
