import 'dotenv/config';
import pg from 'pg';
async function run() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const res = await pool.query(`SELECT id, ota_status, status, power_source FROM devices;`);
  console.log(res.rows);
  process.exit(0);
}
run();
