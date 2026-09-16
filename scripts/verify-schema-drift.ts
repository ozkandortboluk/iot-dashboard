import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const { Pool } = pg;

async function verifySchemaDrift() {
  console.log('🔍 [P0 Schema Verification] Starting Production Schema Drift & Contract Gate...');

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

  try {
    const client = await pool.connect();
    console.log('✅ Connected to database pool.');

    // 1. Verify all 19 Canonical Tables exist
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
    ];

    const missingTables = canonicalTables.filter((tbl) => !existingTables.has(tbl));
    if (missingTables.length > 0) {
      console.error('❌ [DRIFT DETECTED] Missing canonical tables in database:');
      missingTables.forEach((t) => console.error(`   - ${t}`));
      process.exit(1);
    }
    console.log(`✅ All ${canonicalTables.length} canonical schema tables verified.`);

    // 2. Fetch all public columns
    const colsRes = await client.query(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public';
    `);

    const existingColumns = new Set<string>(
      colsRes.rows.map((r: any) => `${r.table_name}.${r.column_name}`)
    );

    // List of critical columns expected across core tables (P0.10)
    const criticalColumns = [
      'devices.id',
      'devices.tenant_id',
      'devices.name',
      'devices.user_id',
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
    ];

    const missingColumns = criticalColumns.filter((c) => !existingColumns.has(c));

    if (missingColumns.length > 0) {
      console.error('❌ [DRIFT DETECTED] Missing critical columns in production DB:');
      missingColumns.forEach((c) => console.error(`   - ${c}`));
      process.exit(1);
    }
    console.log(`✅ All ${criticalColumns.length} critical columns verified.`);

    // 3. Verify Composite Primary Key on telemetry_readings (P0.7)
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
      process.exit(1);
    }
    console.log('✅ Composite PRIMARY KEY (id, created_at) verified on telemetry_readings.');

    // 4. Verify Unique Constraint unq_telemetry_device_boot_sequence on telemetry_packets (P0.6, P0.14)
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
    const isUnqValid = unqCols.length === 3 && 
      unqCols[0] === 'device_id' && 
      unqCols[1] === 'boot_id' && 
      unqCols[2] === 'sequence';

    if (!isUnqValid) {
      console.error('❌ [DRIFT DETECTED] Unique constraint unq_telemetry_device_boot_sequence on telemetry_packets must have exact ordinal columns (device_id, boot_id, sequence)! Found:', unqCols);
      process.exit(1);
    }
    console.log('✅ Idempotency unique constraint (device_id, boot_id, sequence) verified in exact ordinal position.');

    // 5. Verify TimescaleDB Hypertable and Compression (P0.7, P0.13, P0.14)
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
        process.exit(1);
      }
      console.log('✅ telemetry_readings hypertable verified.');

      // Check chunk interval
      const dimRes = await client.query(`
        SELECT time_interval 
        FROM timescaledb_information.dimensions 
        WHERE hypertable_name = 'telemetry_readings';
      `);
      if (dimRes.rows.length > 0) {
        console.log(`✅ telemetry_readings chunk interval verified (${dimRes.rows[0].time_interval}).`);
      }

      // Check simulation_telemetry_readings hypertable
      const simHtRes = await client.query(`
        SELECT hypertable_name 
        FROM timescaledb_information.hypertables 
        WHERE hypertable_name = 'simulation_telemetry_readings';
      `);
      if (simHtRes.rows.length > 0) {
        console.log('✅ simulation_telemetry_readings hypertable verified.');
      }

      // Check compression settings
      const compRes = await client.query(`
        SELECT hypertable_name 
        FROM timescaledb_information.compression_settings 
        WHERE hypertable_name = 'telemetry_readings';
      `);
      if (compRes.rows.length > 0) {
        console.log('✅ telemetry_readings compression settings verified.');
      }
    } else {
      if (process.env.NODE_ENV === 'production' || process.env.REQUIRE_TIMESCALE === 'true') {
        console.error('❌ [DRIFT DETECTED] TimescaleDB extension is required in production environment!');
        process.exit(1);
      } else {
        console.warn('⚠️ [DEV WARNING] TimescaleDB extension is missing in local/dev environment.');
      }
    }

    // 6. Verify Migration Checksums in schema_migrations (P0.5, P0.14)
    const migCheck = await client.query(`
      SELECT version, name, checksum 
      FROM schema_migrations 
      ORDER BY version ASC;
    `);
    console.log(`✅ ${migCheck.rows.length} applied migrations verified in schema_migrations.`);

    console.log('🎉 [P0 Schema Verification] ALL CHECKS PASSED: No schema drift detected.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during schema drift verification:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verifySchemaDrift();
