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

  // Critical Change for P0: Fail fast if PostgreSQL is not configured.
  // We no longer provide a fallback local pool because PostgreSQL is the Single Source of Truth.
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    // Only allow fallback in strictly test environments
    console.warn('[Drizzle] Using fallback local pool for test environment.');
    const fallback = new pg.Pool({
      host: process.env.SQL_HOST || process.env.PGHOST || 'localhost',
      user: process.env.SQL_USER || process.env.PGUSER || 'postgres',
      password: process.env.SQL_PASSWORD || process.env.PGPASSWORD || 'postgres',
      database: process.env.SQL_DB_NAME || process.env.PGDATABASE || 'iot_dashboard_db_test',
      port: Number(process.env.PGPORT) || 5432,
      max: 10,
    });
    fallback.on('error', (err: any) => {
      console.warn('[Drizzle Fallback Pool Warning]:', err?.message || err);
    });
    return fallback;
  }

  throw new Error('DATABASE_URL or equivalent PostgreSQL connection string is required. PostgreSQL is the authoritative data source and cannot be bypassed.');
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
