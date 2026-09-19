import 'dotenv/config';
import pg from 'pg';
async function run() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query("ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS test_col VARCHAR(10);");
    console.log("Add col success");
  } catch(e) {
    console.error(e.message);
  }
  process.exit(0);
}
run();
