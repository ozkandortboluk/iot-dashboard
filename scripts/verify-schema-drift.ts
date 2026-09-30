import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import {
  ALL_MIGRATIONS,
  CANONICAL_MIGRATION_MANIFEST,
  computeMigrationChecksum,
  isMigrationChecksumValid,
} from '../src/server/database/migrations/migrationRunner.js';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const { Pool } = pg;

async function verifySchemaDrift() {
  console.log('🔍 [P0 Schema Verification] Starting Production Schema Drift & Migration Contract Gate...');

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    if (process.env.CI === 'true' || process.env.NODE_ENV === 'production') {
      console.error('❌ [P0.2 FATAL] DATABASE_URL must be defined in CI or production environment.');
      process.exit(1);
    } else {
      console.warn('⚠️ [DEV WARNING] DATABASE_URL is not set in local environment. Skipping drift check.');
      process.exit(0);
    }
  }

  const pool = new Pool({
    connectionString: dbUrl,
  });

  let driftDetected = false;

  try {
    const client = await pool.connect();
    console.log('✅ Connected to database pool.');

    // 1. Verify all 21 Canonical Tables exist
    const allTablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public';
    `);
    const existingTables = new Set<string>(allTablesRes.rows.map((r: any) => r.table_name));

    const canonicalTables = [
      'users',
      'devices',
      'telemetry_packets',
      'telemetry_readings',
      'simulation_telemetry_readings',
      'threshold_rules',
      'active_alarms',
      'alarm_events',
      'device_commands',
      'notifications',
      'user_sessions',
      'audit_logs',
      'system_events',
      'device_ws_messages_dedup',
      'firmwares',
      'ota_deployment_jobs',
      'dashboard_layouts',
      'dispatch_logs',
      'schema_migrations',
      'service_tokens',
      'system_settings',
    ];

    const missingTables = canonicalTables.filter((tbl) => !existingTables.has(tbl));
    if (missingTables.length > 0) {
      console.error('❌ [DRIFT DETECTED] Missing canonical tables in database:');
      missingTables.forEach((t) => console.error(`   - ${t}`));
      driftDetected = true;
    } else {
      console.log(`✅ All ${canonicalTables.length} canonical schema tables verified.`);
    }

    // 2. Fetch all public columns and verify critical columns
    const colsRes = await client.query(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public';
    `);

    const existingColumns = new Set<string>(
      colsRes.rows.map((r: any) => `${r.table_name}.${r.column_name}`)
    );

    const criticalColumns = [
      'devices.id',
      'devices.tenant_id',
      'devices.name',
      'devices.user_id',
      'devices.last_telemetry_at',
      'devices.last_heartbeat_at',
      'devices.last_offline_notified_at',
      'devices.created_at',
      'users.id',
      'users.email',
      'users.role',
      'users.status',
      'telemetry_readings.id',
      'telemetry_readings.tenant_id',
      'telemetry_readings.device_id',
      'telemetry_readings.metric',
      'telemetry_readings.metric_value',
      'telemetry_readings.sequence',
      'telemetry_readings.boot_id',
      'telemetry_readings.created_at',
      'telemetry_packets.id',
      'telemetry_packets.device_id',
      'telemetry_packets.boot_id',
      'telemetry_packets.sequence',
      'active_alarms.id',
      'active_alarms.tenant_id',
      'active_alarms.device_id',
      'active_alarms.rule_id',
      'threshold_rules.id',
      'threshold_rules.tenant_id',
      'threshold_rules.metric_key',
      'device_commands.id',
      'device_commands.tenant_id',
      'device_commands.device_id',
      'device_commands.status',
      'notifications.id',
      'notifications.tenant_id',
      'notifications.event_key',
      'service_tokens.token_hash',
      'service_tokens.token_prefix',
      'system_settings.key',
      'system_settings.value',
    ];

    const missingColumns = criticalColumns.filter((c) => !existingColumns.has(c));
    if (missingColumns.length > 0) {
      console.error('❌ [DRIFT DETECTED] Missing critical columns in production DB:');
      missingColumns.forEach((c) => console.error(`   - ${c}`));
      driftDetected = true;
    } else {
      console.log(`✅ All ${criticalColumns.length} critical columns verified.`);
    }

    // 3. Verify Composite Primary Key on telemetry_readings
    const pkRes = await client.query(`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name 
        AND tc.table_schema = kcu.table_schema
      WHERE tc.table_name = 'telemetry_readings' AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.ordinal_position;
    `);

    const pkCols = pkRes.rows.map((r: any) => r.column_name);
    if (pkCols.length !== 2 || pkCols[0] !== 'id' || pkCols[1] !== 'created_at') {
      console.error('❌ [DRIFT DETECTED] telemetry_readings must have composite PRIMARY KEY exactly as (id, created_at)! Found:', pkCols);
      driftDetected = true;
    } else {
      console.log('✅ Composite PRIMARY KEY (id, created_at) verified on telemetry_readings.');
    }

    // 4. Verify Unique Constraint unq_telemetry_device_boot_sequence on telemetry_packets
    const unqRes = await client.query(`
      SELECT a.attname
      FROM pg_constraint c
      CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
      WHERE c.conrelid = 'telemetry_packets'::regclass 
        AND c.conname = 'unq_telemetry_device_boot_sequence'
      ORDER BY u.ord;
    `);

    const unqCols = unqRes.rows.map((r: any) => r.attname);
    const isUnqValid =
      unqCols.length === 3 &&
      unqCols[0] === 'device_id' &&
      unqCols[1] === 'boot_id' &&
      unqCols[2] === 'sequence';

    if (!isUnqValid) {
      console.error(
        '❌ [DRIFT DETECTED] Unique constraint unq_telemetry_device_boot_sequence on telemetry_packets must have exact ordinal columns (device_id, boot_id, sequence)! Found:',
        unqCols
      );
      driftDetected = true;
    } else {
      console.log('✅ Idempotency unique constraint (device_id, boot_id, sequence) verified in exact ordinal position.');
    }

    // 5. Verify TimescaleDB Hypertable and Compression if installed
    const hasTimescale = await client.query(`SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'`);
    if (hasTimescale.rows.length > 0) {
      const extVersion = hasTimescale.rows[0].extversion;
      console.log(`✅ TimescaleDB extension verified (version: ${extVersion}).`);

      const htRes = await client.query(`
        SELECT hypertable_name 
        FROM timescaledb_information.hypertables 
        WHERE hypertable_name = 'telemetry_readings';
      `);
      if (htRes.rows.length === 0) {
        console.error('❌ [DRIFT DETECTED] telemetry_readings is not a hypertable!');
        driftDetected = true;
      } else {
        console.log('✅ telemetry_readings hypertable verified.');
      }
    } else if (process.env.NODE_ENV === 'production' && process.env.REQUIRE_TIMESCALE === 'true') {
      console.error('❌ [DRIFT DETECTED] TimescaleDB extension is required in production environment!');
      driftDetected = true;
    }

    // 6. Strict Migration Manifest & Checksum Drift Verification
    const migRes = await client.query(`
      SELECT version, name, checksum, applied_at 
      FROM schema_migrations 
      ORDER BY version ASC;
    `);

    const appliedRows = migRes.rows;
    const appliedMap = new Map<string, any>(appliedRows.map((r: any) => [r.version, r]));
    const expectedVersions = new Set(ALL_MIGRATIONS.map((m) => m.version));

    // 6a. Check for pending (unapplied) migrations
    const pendingMigrations = ALL_MIGRATIONS.filter((m) => !appliedMap.has(m.version));
    if (pendingMigrations.length > 0) {
      console.error(`❌ [MIGRATION DRIFT DETECTED] ${pendingMigrations.length} pending migration(s) not applied to DB:`);
      pendingMigrations.forEach((m) => console.error(`   - Migration ${m.version}: ${m.name}`));
      driftDetected = true;
    }

    // 6b. Check for unknown migrations in DB
    const unknownMigrations = appliedRows.filter((r: any) => !expectedVersions.has(r.version));
    if (unknownMigrations.length > 0) {
      console.error(`❌ [MIGRATION DRIFT DETECTED] ${unknownMigrations.length} unknown migration(s) in DB not in codebase:`);
      unknownMigrations.forEach((r: any) => console.error(`   - Version ${r.version}: ${r.name}`));
      driftDetected = true;
    }

    // 6c. Verify Checksum on each applied migration
    for (const row of appliedRows) {
      const manifest = CANONICAL_MIGRATION_MANIFEST[row.version];
      if (manifest) {
        const canonicalChecksum = manifest.canonicalChecksum;
        const isValid = isMigrationChecksumValid(row.version, row.checksum);
        if (!isValid) {
          console.error(
            `❌ [CHECKSUM DRIFT DETECTED] Migration ${row.version} (${row.name}) checksum mismatch! DB: ${row.checksum}, Canonical: ${canonicalChecksum}`
          );
          driftDetected = true;
        }
      }
    }

    if (!driftDetected) {
      console.log(`✅ All ${appliedRows.length} applied migrations matched canonical manifest & checksums.`);
      console.log('🎉 [P0 Schema Verification] ALL CHECKS PASSED: No schema or migration drift detected.');
      process.exit(0);
    } else {
      console.error('💥 [P0 Schema Verification FATAL] Schema or migration drift detected! Exiting with non-zero status.');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Error during schema drift verification:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verifySchemaDrift();
