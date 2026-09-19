import 'dotenv/config';
import pg from 'pg';
async function run() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const res = await pool.query(`
      SELECT 
        con.conname AS constraint_name,
        con.contype AS constraint_type,
        rel.relname AS table_name,
        frel.relname AS foreign_table_name,
        pg_get_constraintdef(con.oid, true) AS constraint_def,
        (
          SELECT array_agg(attname ORDER BY array_position(con.conkey, attnum))
          FROM pg_attribute
          WHERE attrelid = con.conrelid AND attnum = ANY(con.conkey)
        ) AS columns,
        (
          SELECT array_agg(attname ORDER BY array_position(con.confkey, attnum))
          FROM pg_attribute
          WHERE attrelid = con.confrelid AND attnum = ANY(con.confkey)
        ) AS ref_columns
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      LEFT JOIN pg_class frel ON frel.oid = con.confrelid
      WHERE nsp.nspname = 'public' AND rel.relname = 'devices';
  `);
  console.log(res.rows);
  process.exit(0);
}
run();
