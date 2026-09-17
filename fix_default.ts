import 'dotenv/config';
import pg from 'pg';
async function run() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  
  // Update the column default
  await pool.query(`ALTER TABLE devices ALTER COLUMN ota_status SET DEFAULT 'IDLE';`);
  
  // Also clean up any invalid rows just in case
  await pool.query(`UPDATE devices SET ota_status = 'IDLE' WHERE ota_status = 'idle' OR ota_status IS NULL;`);
  
  console.log("Fixed default");
  process.exit(0);
}
run();
