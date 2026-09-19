import 'dotenv/config';
import pg from 'pg';
async function run() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const res = await pool.query(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes 
    WHERE schemaname = 'public';
  `);
  for (const r of res.rows) {
    console.log(`${r.tablename}.${r.indexname} -> ${r.indexdef}`);
  }
  process.exit(0);
}
run();
