import 'dotenv/config';
import pg from 'pg';
import { runAllMigrations } from './src/server/database/migrations/migrationRunner.js';

async function run() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await runAllMigrations(pool);
    console.log("Migrations successful!");
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
run();
