import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { runAllMigrations, ALL_MIGRATIONS } from '../src/server/database/migrations/migrationRunner.js';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const { Pool } = pg;

async function executeStandaloneMigrations() {
  console.log('🚀 [Standalone Migration Runner] Starting database migrations...');

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    if (process.env.CI === 'true' || process.env.NODE_ENV === 'production') {
      console.error('❌ [FATAL] DATABASE_URL environment variable is required for standalone migrations.');
      process.exit(1);
    } else {
      console.warn('⚠️ [DEV] DATABASE_URL is not set. Skipping standalone migrations.');
      process.exit(0);
    }
  }

  const pool = new Pool({
    connectionString: dbUrl,
  });

  try {
    const result = await runAllMigrations(pool);
    if (!result.success) {
      console.error(`❌ [Migration Failed]: ${result.error}`);
      await pool.end().catch(() => {});
      process.exit(1);
    }

    console.log(`✅ [Migration Success] ${ALL_MIGRATIONS.length} total migrations checked (${result.appliedCount} newly applied).`);
    await pool.end().catch(() => {});
    process.exit(0);
  } catch (err: any) {
    console.error(`💥 [Migration Exception]: ${err?.message || err}`);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

executeStandaloneMigrations();
