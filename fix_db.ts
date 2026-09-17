import 'dotenv/config';
import pg from 'pg';
async function run() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query("UPDATE devices SET ota_status = 'IDLE' WHERE ota_status NOT IN ('IDLE', 'PENDING', 'DOWNLOADING', 'FLASHING', 'SUCCESS', 'FAILED', 'CANCELLED') OR ota_status IS NULL;");
  process.exit(0);
}
run();
