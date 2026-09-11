import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.ts';
import {
  getSharedPgPool,
  resolvePostgresConnectionString,
  getPostgresSslOption,
} from '../server/database/connection.js';

export { schema };

/**
 * Returns the unified singleton PostgreSQL connection pool shared across the entire application.
 */
export const createPool = (): pg.Pool => {
  const pool = getSharedPgPool();
  if (pool) {
    return pool;
  }

  // Fallback if accessed before full initialization
  const url = resolvePostgresConnectionString();
  if (url) {
    return getSharedPgPool(url)!;
  }

  // Local fallback pool if no URL provided yet
  const fallback = new pg.Pool({
    host: process.env.SQL_HOST || process.env.PGHOST || 'localhost',
    user: process.env.SQL_USER || process.env.PGUSER || 'postgres',
    password: process.env.SQL_PASSWORD || process.env.PGPASSWORD || 'postgres',
    database: process.env.SQL_DB_NAME || process.env.PGDATABASE || 'iot_dashboard_db',
    port: Number(process.env.PGPORT) || 5432,
    max: 10,
    connectionTimeoutMillis: 15000,
    ssl: getPostgresSslOption(process.env.DATABASE_URL || ''),
  });

  fallback.on('error', (err: any) => {
    console.warn('[Drizzle Fallback Pool Warning]:', err?.message || err);
  });

  return fallback;
};

// Singleton pool and Drizzle DB instance backed by the shared application pool
export const pool = createPool();
export const db = drizzle(pool, { schema });

/**
 * Helper to retrieve the current active Drizzle database client backed by the shared pool.
 */
export const getDrizzleDb = () => {
  const activePool = getSharedPgPool() || pool;
  return drizzle(activePool, { schema });
};
