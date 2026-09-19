import 'dotenv/config';
import pg from 'pg';
async function run() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const res = await pool.query(`SELECT conname FROM pg_constraint WHERE conrelid = 'users'::regclass AND contype = 'u';`);
  console.log(res.rows);
  process.exit(0);
}
run();
