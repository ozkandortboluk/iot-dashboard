import 'dotenv/config';
import pg from 'pg';
async function run() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const res = await pool.query(`
    SELECT column_name, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'devices' AND column_name = 'ota_status';
  `);
  console.log(res.rows);
  process.exit(0);
}
run();
