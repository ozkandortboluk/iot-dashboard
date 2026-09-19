import 'dotenv/config';
import pg from 'pg';
async function run() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const res = await pool.query(`
    SELECT con.conname, con.contype, rel.relname, frel.relname AS frelname, pg_get_constraintdef(con.oid, true) AS def
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    LEFT JOIN pg_class frel ON frel.oid = con.confrelid
    WHERE rel.relname IN ('devices')
  `);
  console.log(res.rows);
  process.exit(0);
}
run();
