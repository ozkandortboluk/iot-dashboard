import type pg from 'pg';
import crypto from 'crypto';
import { migration001 } from './001_core_relational_tables.js';
import { migration002 } from './002_timescale_hypertables.js';
import { migration003 } from './003_idempotency_constraints.js';
import { migration004 } from './004_multitenant_columns.js';
import { migration005 } from './005_auto_heal_expires_at_and_session_columns.js';
import { migration006 } from './006_fix_audit_logs_and_on_conflict_constraints.js';
import { migration007 } from './007_comprehensive_schema_synchronization_and_column_healing.js';
import { migration008 } from './008_remove_rigid_tenant_foreign_keys.js';
import { migration009 } from './009_ensure_device_schema_resilience.js';
import { migration010 } from './010_heal_device_tokens_and_prohibit_placeholders.js';
import { migration011 } from './011_fix_threshold_rules_active_hours_json_syntax.js';
import { migration012 } from './012_canonical_schema_full_harmonization.js';
import { migration013 } from './013_add_device_power_status.js';
import { migration014 } from './014_widen_audit_logs_action_and_resilient_user_refs.js';
import { migration015 } from './015_schema_cleanup_and_consolidation.js';
import { migration016 } from './016_simplify_devices_table.js';
import { migration017 } from './017_simplify_telemetry_readings_table.js';
import { migration018 } from './018_secure_production_seed_cleanup.js';
import { migration019 } from './019_restore_canonical_test_entities.js';
import { migration020 } from './020_add_service_tokens_table.js';
import type { Migration, MigrationStatus } from './types.js';

const MIGRATION_ADVISORY_LOCK_ID = 13374242;

export function computeMigrationChecksum(migration: Migration): string {
  const content = `${migration.version}:${migration.name}:${migration.up.toString()}`;
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 32);
}

export const ALL_MIGRATIONS: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
  migration011,
  migration012,
  migration013,
  migration014,
  migration015,
  migration016,
  migration017,
  migration018,
  migration019,
  migration020,
];

let lastMigrationStatus: {
  success: boolean;
  error?: string;
  appliedCount: number;
  lastRunAt?: string;
} = {
  success: true,
  appliedCount: 0,
};

export function getLatestMigrationRunStatus() {
  return { ...lastMigrationStatus };
}

/**
 * Initializes schema_migrations table if it does not exist
 */
async function ensureMigrationsTable(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(64) PRIMARY KEY,
      name VARCHAR(256) NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      checksum VARCHAR(64)
    );
  `);
}

/**
 * Runs all pending migrations with advisory locking
 */
export async function runAllMigrations(pool: pg.Pool): Promise<{
  success: boolean;
  appliedCount: number;
  error?: string;
}> {
  console.log('[Migration Runner] Starting database migration check...');
  const client = await pool.connect();
  // Ensure migration DDL queries do not timeout prematurely
  await client.query('SET statement_timeout = 300000;').catch(() => {});

  let lockAcquired = false;
  try {
    // 1. Try to acquire advisory lock
    const lockRes = await client.query('SELECT pg_try_advisory_lock($1) as locked;', [
      MIGRATION_ADVISORY_LOCK_ID,
    ]);
    lockAcquired = lockRes.rows[0]?.locked === true;

    if (!lockAcquired) {
      console.log('[Migration Runner] Advisory lock is currently held by another instance/process. Waiting for completion...');
      
      const MAX_WAIT_MS = 60000; // Poll up to 60 seconds
      const POLL_INTERVAL_MS = 1000;
      let waitedMs = 0;
      let externalFinished = false;

      while (waitedMs < MAX_WAIT_MS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        waitedMs += POLL_INTERVAL_MS;

        // Try to acquire the advisory lock now
        const retryRes = await client.query('SELECT pg_try_advisory_lock($1) as locked;', [
          MIGRATION_ADVISORY_LOCK_ID,
        ]);
        if (retryRes.rows[0]?.locked === true) {
          lockAcquired = true;
          console.log(`[Migration Runner] Advisory lock successfully acquired after ${waitedMs}ms.`);
          break;
        }

        // Check if the other instance has finished applying all migrations
        try {
          await ensureMigrationsTable(client);
          const appliedRes = await client.query('SELECT version FROM schema_migrations;');
          const appliedVersions = new Set<string>(appliedRes.rows.map((r: any) => r.version));
          const pendingCount = ALL_MIGRATIONS.filter((m) => !appliedVersions.has(m.version)).length;

          if (pendingCount === 0) {
            console.log('[Migration Runner] All pending migrations were applied by another instance.');
            externalFinished = true;
            break;
          }
        } catch (checkErr) {
          // Ignore transient check errors while waiting
        }
      }

      if (!lockAcquired && externalFinished) {
        lastMigrationStatus = {
          success: true,
          appliedCount: 0,
          lastRunAt: new Date().toISOString(),
        };
        return {
          success: true,
          appliedCount: 0,
        };
      }

      if (!lockAcquired) {
        const lockErr = `[Migration Runner Error] Could not acquire migration advisory lock within ${MAX_WAIT_MS}ms. Another process holds the lock and pending migrations remain unapplied. Aborting migration on this instance.`;
        console.error(lockErr);
        lastMigrationStatus = {
          success: false,
          error: lockErr,
          appliedCount: 0,
          lastRunAt: new Date().toISOString(),
        };
        return {
          success: false,
          appliedCount: 0,
          error: lockErr,
        };
      }
    }

    // 2. Ensure schema_migrations table
    await ensureMigrationsTable(client);

    // 3. Get applied migrations
    const appliedRes = await client.query('SELECT version, name, checksum FROM schema_migrations;');
    const appliedMap = new Map<string, any>(appliedRes.rows.map((r: any) => [r.version, r]));
    const appliedVersions = new Set<string>(appliedMap.keys());

    // Check drift on already applied migrations
    for (const migration of ALL_MIGRATIONS) {
      const existing = appliedMap.get(migration.version);
      if (existing) {
        const expectedChecksum = computeMigrationChecksum(migration);
        if (existing.checksum && existing.checksum !== expectedChecksum) {
          console.warn(`[Migration Drift Warning] Migration ${migration.version} checksum mismatch (DB: ${existing.checksum}, Code: ${expectedChecksum})`);
        } else if (!existing.checksum) {
          // Backfill checksum if missing
          await client.query('UPDATE schema_migrations SET checksum = $1 WHERE version = $2;', [expectedChecksum, migration.version]);
        }
      }
    }

    let appliedThisRun = 0;

    // 4. Run pending migrations in order
    for (const migration of ALL_MIGRATIONS) {
      if (!appliedVersions.has(migration.version)) {
        console.log(`[Migration Runner] Applying migration ${migration.version}: ${migration.name}...`);
        
        // Ensure clean connection state before running each migration step
        await client.query('ROLLBACK').catch(() => {});

        const useTx = !migration.disableTransaction;
        if (useTx) {
          await client.query('BEGIN');
        }
        try {
          await migration.up(client);
          const checksum = computeMigrationChecksum(migration);
          await client.query(
            'INSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES ($1, $2, CURRENT_TIMESTAMP, $3);',
            [migration.version, migration.name, checksum]
          );
          if (useTx) {
            await client.query('COMMIT');
          }
          console.log(`[Migration Runner] ✅ Successfully applied migration ${migration.version}: ${migration.name}`);
          appliedThisRun++;
        } catch (migErr: any) {
          if (useTx) {
            try {
              await client.query('ROLLBACK');
            } catch (rbErr) {
              console.warn('[Migration Runner] ROLLBACK warning:', rbErr);
            }
          }
          const errorMsg = `[Migration Failed] Migration ${migration.version} (${migration.name}) failed: ${migErr?.message || migErr}`;
          console.error(errorMsg, migErr?.stack);
          
          lastMigrationStatus = {
            success: false,
            error: errorMsg,
            appliedCount: appliedThisRun,
            lastRunAt: new Date().toISOString(),
          };

          return {
            success: false,
            appliedCount: appliedThisRun,
            error: errorMsg,
          };
        }
      }
    }

    lastMigrationStatus = {
      success: true,
      appliedCount: appliedThisRun,
      lastRunAt: new Date().toISOString(),
    };

    console.log(`[Migration Runner] All migrations up to date (${appliedThisRun} newly applied, total available: ${ALL_MIGRATIONS.length}).`);
    return {
      success: true,
      appliedCount: appliedThisRun,
    };
  } catch (err: any) {
    const errMsg = `[Migration Runner Error]: ${err?.message || err}`;
    console.error(errMsg);
    lastMigrationStatus = {
      success: false,
      error: errMsg,
      appliedCount: 0,
      lastRunAt: new Date().toISOString(),
    };
    return {
      success: false,
      appliedCount: 0,
      error: errMsg,
    };
  } finally {
    if (lockAcquired) {
      try {
        await client.query('SELECT pg_advisory_unlock($1);', [MIGRATION_ADVISORY_LOCK_ID]);
      } catch (unlockErr) {
        console.warn('[Migration Runner] Notice releasing advisory lock:', unlockErr);
      }
    }
    client.release();
  }
}

/**
 * Retrieves current migration status for system diagnostics & readiness
 */
export async function getMigrationStatus(pool: pg.Pool): Promise<MigrationStatus> {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const appliedRes = await client.query('SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC;');
    const appliedMap = new Map<string, any>(appliedRes.rows.map((r: any) => [r.version, r]));

    const migrationsList = ALL_MIGRATIONS.map((m) => {
      const applied = appliedMap.get(m.version);
      return {
        version: m.version,
        name: m.name,
        applied: !!applied,
        appliedAt: applied ? applied.applied_at : undefined,
      };
    });

    const appliedCount = appliedMap.size;
    const pendingCount = ALL_MIGRATIONS.filter((m) => !appliedMap.has(m.version)).length;
    const latestVersion = appliedRes.rows.length > 0 ? appliedRes.rows[appliedRes.rows.length - 1].version : null;

    return {
      isLocked: false,
      appliedCount,
      pendingCount,
      latestVersion,
      migrations: migrationsList,
      hasFailed: !lastMigrationStatus.success,
      lastError: lastMigrationStatus.error,
    };
  } finally {
    client.release();
  }
}
