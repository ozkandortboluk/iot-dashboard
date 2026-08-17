import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
const { Pool } = pg;
import * as schema from './schema.ts';

declare global {
  var _postgresPool: pg.Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    const connStr = process.env.DATABASE_URL || '';
    if (connStr && (connStr.startsWith('postgres://') || connStr.startsWith('postgresql://'))) {
      global._postgresPool = new Pool({
        connectionString: connStr,
        max: 10,
        connectionTimeoutMillis: 15000,
        ssl: connStr.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
      });
    } else {
      global._postgresPool = new Pool({
        host: process.env.SQL_HOST || process.env.PGHOST || 'localhost',
        user: process.env.SQL_USER || process.env.PGUSER || 'postgres',
        password: process.env.SQL_PASSWORD || process.env.PGPASSWORD || 'postgres',
        database: process.env.SQL_DB_NAME || process.env.PGDATABASE || 'iot_dashboard_db',
        port: Number(process.env.PGPORT) || 5432,
        max: 10,
        connectionTimeoutMillis: 15000,
      });
    }

    global._postgresPool.on('error', (err: any) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

export const pool = createPool();
export const db = drizzle(pool, { schema });
