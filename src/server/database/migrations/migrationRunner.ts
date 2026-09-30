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
import { migration021 } from './021_hash_device_and_session_tokens.js';
import { migration022 } from './022_add_system_settings_and_device_activity_columns.js';
import type { Migration, MigrationStatus } from './types.js';

const MIGRATION_ADVISORY_LOCK_ID = 13374242;

/**
 * Normalizes migration function source code across bundlers (esbuild, tsx, rollup, tsc),
 * stripping ephemeral comments and transpilation syntax discrepancies while strictly binding
 * to the exact SQL queries, logic, and operational statements in the migration body.
 */
export function normalizeMigrationSource(fn: (...args: any[]) => any): string {
  let src = fn.toString();
  // Strip block comments /* ... */
  src = src.replace(/\/\*[\s\S]*?\*\//g, '');
  // Strip single line comments // ...
  src = src.replace(/\/\/[^\n]*/g, '');
  // Normalize async parameter signatures: async (client) => / async client => / async function(client)
  src = src.replace(/^async\s*(?:\(\s*(\w+)?\s*\)|(\w+))\s*=>/, 'async ($1$2) =>');
  src = src.replace(/^async\s+function\s*\w*\s*\(\s*(\w+)?\s*\)/, 'async ($1) =>');
  // Collapse whitespace sequences to single space
  src = src.replace(/\s+/g, ' ').trim();
  return src;
}

/**
 * Computes deterministic content-bound checksum for a migration.
 * Binds directly to migration version, canonical name, and normalized executable body.
 * Any functional or SQL mutation to migration.up will alter the computed checksum.
 */
export function computeMigrationChecksum(migration: Migration): string {
  const normalizedBody = normalizeMigrationSource(migration.up);
  const payload = `${migration.version}:${migration.name}:${normalizedBody}`;
  return crypto.createHash('sha256').update(payload).digest('hex').substring(0, 32);
}

/**
 * Authoritative Canonical Migration Manifest & Historical Reconciliation Dictionary
 * Contains proven historical checksums recorded across VPS production deployments and releases,
 * providing safe backward-compatible reconciliation without blind database overwrites.
 */
export const CANONICAL_MIGRATION_MANIFEST: Record<
  string,
  {
    version: string;
    name: string;
    acceptedHistoricalChecksums: string[];
  }
> = {
  '001': {
    version: '001',
    name: 'core_relational_tables',
    acceptedHistoricalChecksums: [
      '261a1172cad1ce0d49ec20d8ab2f1936', // Proven 2026-09-30 VPS production checksum
      'd2f164ce5dc21156d55e784003f9ca72', // tsx baseline checksum
      'da7535f0949c84e736aa5fca2ebba4cb', // normalized source checksum
    ],
  },
  '002': {
    version: '002',
    name: 'timescale_hypertables',
    acceptedHistoricalChecksums: [
      'ebef955ae78cd1c312e43f19f8eabb2e', // tsx baseline checksum
      '440ac36bb02c4fc271d82305a2429ec6', // normalized source checksum
    ],
  },
  '003': {
    version: '003',
    name: 'idempotency_and_composite_pk_constraints',
    acceptedHistoricalChecksums: [
      '1175e4d5faf19c0422736e9014c93049',
      '783c04cd2473ca62a0df7c44eade1759',
    ],
  },
  '004': {
    version: '004',
    name: 'multitenant_columns_and_integrity',
    acceptedHistoricalChecksums: [
      'b9e1d8b9a460834f2e7e03ddef8dc196',
      '6cedf954c25a7b2fa7d4ae420b0b9232',
    ],
  },
  '005': {
    version: '005',
    name: 'auto_heal_expires_at_and_session_columns',
    acceptedHistoricalChecksums: [
      'dc0d75695b724d9c9da4be11038e462a',
      '41178b0712408d069777e2ca4de0d419',
    ],
  },
  '006': {
    version: '006',
    name: 'fix_audit_logs_and_on_conflict_constraints',
    acceptedHistoricalChecksums: [
      '734e3a1e087cd0b5c08e0068d2c5b84d',
      '3ed9252a3047e5a95724b3872fbf25a6',
    ],
  },
  '007': {
    version: '007',
    name: 'comprehensive_schema_synchronization_and_column_healing',
    acceptedHistoricalChecksums: [
      'ee459d95a229dbc48ab79092e4eb2880',
      '9592a455f94f60b183bd0a4664ff4b7c',
    ],
  },
  '008': {
    version: '008',
    name: 'remove_rigid_tenant_foreign_keys',
    acceptedHistoricalChecksums: [
      '2c402620fc8f141423057832d04f0122',
      '17d3a8291a1bb941d8d2b18344f29d50',
    ],
  },
  '009': {
    version: '009',
    name: 'ensure_device_schema_resilience',
    acceptedHistoricalChecksums: [
      '097fc68ce2fb27b6e8e35267adae9382',
      '69bda04484950f8dc1f8746489acb589',
    ],
  },
  '010': {
    version: '010',
    name: 'heal_device_tokens_and_prohibit_placeholders',
    acceptedHistoricalChecksums: [
      '912206e542bbb333e9452945884abac2', // Proven 2026-09-30 VPS production checksum
      '8d109f483c6064053175b862e6a50483', // tsx baseline checksum
      'c6d56c7d304cf60d04791873cedc5d8d', // normalized source checksum
    ],
  },
  '011': {
    version: '011',
    name: 'fix_threshold_rules_active_hours_json_syntax',
    acceptedHistoricalChecksums: [
      '1acdffd1035ffabdb897ae7f1c6faf2d',
      '652e05b1c64700838f3b83944cab725a',
    ],
  },
  '012': {
    version: '012',
    name: 'canonical_schema_full_harmonization',
    acceptedHistoricalChecksums: [
      '8a588441f74674b57e7e7b5c591f4dc0',
      '42b2de9c5cbfb607da54e14d4a283bde',
    ],
  },
  '013': {
    version: '013',
    name: 'add_device_power_status',
    acceptedHistoricalChecksums: [
      '4724df0c8720d810aa42b2c1173e4c77',
      '2974800ba09b8c08c2f0abed35382b72',
    ],
  },
  '014': {
    version: '014',
    name: 'widen_audit_logs_action_and_resilient_user_refs',
    acceptedHistoricalChecksums: [
      '245df46d111a3168f045fa4503e645cd', // Proven 2026-09-30 VPS production checksum
      'a9368402404ff76af2e34b117859901f', // tsx baseline checksum
      '102d9fd084b6f74ff3eb6cbb657bb547', // normalized source checksum
    ],
  },
  '015': {
    version: '015',
    name: 'schema_cleanup_and_consolidation',
    acceptedHistoricalChecksums: [
      '4ac8fa5cc7c0b667f1e65a1243de357a', // Proven 2026-09-30 VPS production checksum
      '0fdd53707bf340c6897f60ba7363dc2c', // tsx baseline checksum
      '032eb08cb639a4f40ce98468bd6d68a7', // normalized source checksum
    ],
  },
  '016': {
    version: '016',
    name: 'simplify_devices_table',
    acceptedHistoricalChecksums: [
      '293774afe2d9f8eab38895ab08b52696',
      '326a00ddfd2aca8769069250ba5d300b',
      'ad88441362500f8e5ad3e084ceaf9aea',
    ],
  },
  '017': {
    version: '017',
    name: 'simplify_telemetry_readings_table',
    acceptedHistoricalChecksums: [
      'b767a739687b305bd91de7dcf3100996',
      '94caaebbb8af69ae5113908cd2063d8b',
    ],
  },
  '018': {
    version: '018',
    name: 'secure_production_seed_cleanup',
    acceptedHistoricalChecksums: [
      'c3ec8b1b167b426fe06b89945a86c07b', // Proven 2026-09-30 VPS production checksum
      '0901f31a0c5dbf6bdfa026a70c27c67b', // tsx baseline checksum
      '6dbb43ed1ba2bd516bebfb2606445cf9', // normalized source checksum
      'ab15e36315c29a530effaf7d6965eec0',
    ],
  },
  '019': {
    version: '019',
    name: 'restore_canonical_test_entities',
    acceptedHistoricalChecksums: [
      '7888ea7eadf7283b249b72dd44400cec', // Proven 2026-09-30 VPS production checksum
      '50d032af95ca52755bd53074d9b8d160', // tsx baseline checksum
      '287d3e23071bb219f72740fcfa5fca1c', // earlier release checksum
      'ee0a81f703f7c39d9fd4d999feae8bec', // normalized source checksum
    ],
  },
  '020': {
    version: '020',
    name: 'add_service_tokens_table',
    acceptedHistoricalChecksums: [
      'b41fb2904e43f2d77b5ec8d978de9eee',
      'a9a734255698350083fc2e382f2948b3',
      'c03d7e5864b0e8d953be7972c9fab901',
    ],
  },
  '021': {
    version: '021',
    name: 'hash_device_and_session_tokens',
    acceptedHistoricalChecksums: [
      '3d5bb9b4dbb03c9d2a316a28a9f90732',
      '5043a5d8a65bedbd55190c57baaac4b8',
      'b993b629297ae65c26be390be883ba1b',
    ],
  },
  '022': {
    version: '022',
    name: 'add_system_settings_and_device_activity_columns',
    acceptedHistoricalChecksums: [
      'a73f8e4b2d1c905e6fa083b4c12d98ef',
      'b7e7bd001d241d9739059ee93f9f61e9',
      '9e9dd737a24db25a8097d455ca7ac8b3',
    ],
  },
};

/**
 * Validates whether a database-stored checksum matches the current migration content
 * or proven historical release checksums.
 */
export function isMigrationChecksumValid(
  version: string,
  dbChecksum?: string | null,
  currentComputedChecksum?: string
): boolean {
  if (!dbChecksum) {
    // Missing checksum in legacy database is eligible for safe canonical backfill
    return true;
  }
  if (currentComputedChecksum && dbChecksum === currentComputedChecksum) {
    return true;
  }
  const manifest = CANONICAL_MIGRATION_MANIFEST[version];
  if (!manifest) {
    return false;
  }
  return manifest.acceptedHistoricalChecksums.includes(dbChecksum);
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
  migration021,
  migration022,
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
 * Runs all pending migrations with advisory locking, deterministic content-bound checksums,
 * migration name contract enforcement, and fail-closed drift protection.
 */
export async function runAllMigrations(pool: pg.Pool): Promise<{
  success: boolean;
  appliedCount: number;
  error?: string;
}> {
  console.log('[Migration Runner] Starting database migration check...');
  if (!pool || typeof pool.connect !== 'function' || (pool as any).ending || (pool as any).ended) {
    return { success: false, appliedCount: 0, error: 'No active database connection pool available' };
  }

  let client: any = null;
  try {
    client = await pool.connect();
    if (client) client.on('error', () => {});
  } catch (connErr: any) {
    return { success: false, appliedCount: 0, error: connErr?.message || 'Veritabanı bağlantı havuzuna erişilemedi.' };
  }
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
    const knownVersions = new Set<string>(ALL_MIGRATIONS.map((m) => m.version));

    // Check for unexpected/unknown migrations in DB
    for (const [dbVer] of appliedMap) {
      if (!knownVersions.has(dbVer)) {
        const unknownErr = `[FATAL MIGRATION DRIFT] Database contains unknown migration version '${dbVer}' not defined in application codebase. Startup aborted.`;
        console.error(unknownErr);
        lastMigrationStatus = {
          success: false,
          error: unknownErr,
          appliedCount: 0,
          lastRunAt: new Date().toISOString(),
        };
        return {
          success: false,
          appliedCount: 0,
          error: unknownErr,
        };
      }
    }

    // Check name contract, deterministic content checksums, and reconcile legacy records
    for (const migration of ALL_MIGRATIONS) {
      const existing = appliedMap.get(migration.version);
      if (existing) {
        // Enforce migration name contract strictly
        if (existing.name !== migration.name) {
          const nameMismatchErr = `[FATAL MIGRATION DRIFT] Migration ${migration.version} name mismatch! DB: '${existing.name}', Codebase expects: '${migration.name}'. Startup aborted.`;
          console.error(nameMismatchErr);
          lastMigrationStatus = {
            success: false,
            error: nameMismatchErr,
            appliedCount: 0,
            lastRunAt: new Date().toISOString(),
          };
          return {
            success: false,
            appliedCount: 0,
            error: nameMismatchErr,
          };
        }

        const currentChecksum = computeMigrationChecksum(migration);
        if (!existing.checksum) {
          // Missing checksum: backfill content-derived checksum safely
          console.log(`[Migration Runner] Backfilling missing checksum for migration ${migration.version} (${currentChecksum})...`);
          await client.query('UPDATE schema_migrations SET checksum = $1 WHERE version = $2;', [
            currentChecksum,
            migration.version,
          ]);
        } else if (!isMigrationChecksumValid(migration.version, existing.checksum, currentChecksum)) {
          // Hard fail on unknown/unexpected checksum mismatch (Fail-Closed)
          const mismatchErr = `[FATAL MIGRATION DRIFT] Migration ${migration.version} (${migration.name}) checksum mismatch! DB: ${existing.checksum}, Current Content Hash: ${currentChecksum}. Refusing to start on mutated migration history.`;
          console.error(mismatchErr);
          lastMigrationStatus = {
            success: false,
            error: mismatchErr,
            appliedCount: 0,
            lastRunAt: new Date().toISOString(),
          };
          return {
            success: false,
            appliedCount: 0,
            error: mismatchErr,
          };
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
  if (!pool || typeof pool.connect !== 'function' || (pool as any).ending || (pool as any).ended) {
    return {
      isLocked: false,
      appliedCount: 0,
      pendingCount: ALL_MIGRATIONS.length,
      latestVersion: null,
      migrations: ALL_MIGRATIONS.map((m) => ({
        version: m.version,
        name: m.name,
        applied: false,
        checksum: computeMigrationChecksum(m),
      })),
      hasFailed: false,
      lastError: undefined,
    };
  }

  let client: any = null;
  try {
    client = await pool.connect();
    if (client) client.on('error', () => {});
  } catch {
    return {
      isLocked: false,
      appliedCount: 0,
      pendingCount: ALL_MIGRATIONS.length,
      latestVersion: null,
      migrations: ALL_MIGRATIONS.map((m) => ({
        version: m.version,
        name: m.name,
        applied: false,
        checksum: computeMigrationChecksum(m),
      })),
      hasFailed: false,
      lastError: undefined,
    };
  }
  try {
    await ensureMigrationsTable(client);
    const appliedRes = await client.query('SELECT version, name, applied_at, checksum FROM schema_migrations ORDER BY version ASC;');
    const appliedMap = new Map<string, any>(appliedRes.rows.map((r: any) => [r.version, r]));

    const migrationsList = ALL_MIGRATIONS.map((m) => {
      const applied = appliedMap.get(m.version);
      return {
        version: m.version,
        name: m.name,
        applied: !!applied,
        appliedAt: applied ? applied.applied_at : undefined,
        checksum: applied?.checksum || computeMigrationChecksum(m),
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
