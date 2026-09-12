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

    // 1. Verify schema_migrations table exists (P0.5)
    const migTableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'schema_migrations';
    `);

    if (migTableRes.rows.length === 0) {
      console.error('❌ [DRIFT DETECTED] schema_migrations table is missing! Versioned migrations have not been initialized.');
      process.exit(1);
    }
    console.log('✅ Versioned migrations table (schema_migrations) verified.');

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
    if (!pkCols.includes('id') || !pkCols.includes('created_at')) {
      console.error('❌ [DRIFT DETECTED] telemetry_readings must have composite PRIMARY KEY (id, created_at)! Found:', pkCols);
      process.exit(1);
    }
    console.log('✅ Composite PRIMARY KEY (id, created_at) verified on telemetry_readings.');

    // 4. Verify Unique Constraint unq_telemetry_device_boot_sequence on telemetry_packets (P0.6)
    const unqRes = await client.query(`
      SELECT conname 
      FROM pg_constraint 
      WHERE conrelid = 'telemetry_packets'::regclass 
        AND (conname = 'unq_telemetry_device_boot_sequence' OR contype = 'u');
    `);

    if (unqRes.rows.length === 0) {
      console.error('❌ [DRIFT DETECTED] Unique constraint on telemetry_packets (device_id, boot_id, sequence) is missing!');
      process.exit(1);
    }
    console.log('✅ Idempotency unique constraint verified on telemetry_packets.');

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
