import 'dotenv/config';
import pg from 'pg';
async function run() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const res = await pool.query(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes 
    WHERE schemaname = 'public'
    LIMIT 15;
  `);
  console.log(res.rows);
  process.exit(0);
}
run();
