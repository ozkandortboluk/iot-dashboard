import pg from 'pg';
const { Pool } = pg;
import { systemLogger } from '../services/systemLogger.service.js';

export type PgPoolType = pg.Pool;

declare global {
  var _unifiedPostgresPool: pg.Pool | undefined;
  var _unifiedPostgresPoolUrl: string | undefined;
}

/**
 * Resolves PostgreSQL connection URL from all possible environment variable conventions
 * and structured fallback configurations.
 */
export function resolvePostgresConnectionString(customUrl?: string): string {
  // 1. Explicitly supplied URL (e.g. from UI settings modal or direct argument)
  if (customUrl && typeof customUrl === 'string') {
    const trimmed = customUrl.trim();
    if ((trimmed.startsWith('postgres://') || trimmed.startsWith('postgresql://')) && !trimmed.includes('••••••••')) {
      return trimmed;
    }
  }

  // 2. Standard Connection String Environment Variables
  const envUrl = (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRESQL_URL ||
    process.env.PG_URL ||
    ''
  ).trim();

  if (envUrl && (envUrl.startsWith('postgres://') || envUrl.startsWith('postgresql://')) && !envUrl.includes('••••••••')) {
    return envUrl;
  }

  // 3. Structured / Deconstructed Environment Variables (Cloud SQL, Docker, standard Postgres conventions)
  const host = process.env.SQL_HOST || process.env.PGHOST || process.env.POSTGRES_HOST;
  const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER || process.env.PGUSER || process.env.POSTGRES_USER;
  const password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD || process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD;
  const dbName = process.env.SQL_DB_NAME || process.env.PGDATABASE || process.env.POSTGRES_DB || process.env.SQL_DATABASE;
  const port = process.env.SQL_PORT || process.env.PGPORT || process.env.POSTGRES_PORT || '5432';

  // If host is explicitly configured, construct standard PostgreSQL URL
  if (host && host.trim() !== '') {
    const encUser = encodeURIComponent(user || 'postgres');
    const encPass = password !== undefined ? encodeURIComponent(password) : '';
    const auth = encPass ? `${encUser}:${encPass}` : encUser;
    const db = dbName || 'postgres';
    const candidate = `postgresql://${auth}@${host}:${port}/${db}`;
    return candidate;
  }

  return '';
}

/**
 * Centralized SSL option resolver based on connection string, provider heuristics, and environment.
 */
export function getPostgresSslOption(url: string): { rejectUnauthorized: boolean } | undefined {
  if (!url) return undefined;
  if (url.includes('sslmode=disable')) {
    return undefined;
  }
  const hasSslParam =
    url.includes('sslmode=') ||
    url.includes('ssl=true') ||
    url.includes('ssl=1');

  const isCloudHost =
    url.includes('neon.tech') ||
    url.includes('supabase.co') ||
    url.includes('render.com') ||
    url.includes('railway.app') ||
    url.includes('aivencloud.com') ||
    url.includes('amazonaws.com') ||
    url.includes('cockroachlabs.cloud') ||
    url.includes('cloudsql');

  const isProductionRemote =
    process.env.NODE_ENV === 'production' &&
    !url.includes('localhost') &&
    !url.includes('127.0.0.1') &&
    !url.includes('postgres:5432');

  if (hasSslParam || isCloudHost || isProductionRemote) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

/**
 * Resolves connection pool size and timeout limits dynamically from environment variables
 */
export function getPostgresPoolLimits(): {
  max: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  statementTimeoutMillis: number;
} {
  const envMax = parseInt(
    process.env.PG_POOL_MAX || process.env.SQL_POOL_MAX || process.env.DATABASE_POOL_MAX || '30',
    10
  );
  const max = Number.isFinite(envMax) && envMax > 0 ? Math.min(Math.max(envMax, 10), 100) : 30;

  const envConnTimeout = parseInt(process.env.PG_CONNECTION_TIMEOUT_MS || '8000', 10);
  const connectionTimeoutMillis = Number.isFinite(envConnTimeout) && envConnTimeout > 0 ? envConnTimeout : 8000;

  const envIdleTimeout = parseInt(process.env.PG_IDLE_TIMEOUT_MS || '30000', 10);
  const idleTimeoutMillis = Number.isFinite(envIdleTimeout) && envIdleTimeout > 0 ? envIdleTimeout : 30000;

  const envStatementTimeout = parseInt(process.env.PG_STATEMENT_TIMEOUT_MS || '20000', 10);
  const statementTimeoutMillis = Number.isFinite(envStatementTimeout) && envStatementTimeout > 0 ? envStatementTimeout : 20000;

  return { max, connectionTimeoutMillis, idleTimeoutMillis, statementTimeoutMillis };
}

/**
 * Returns the singleton shared PostgreSQL Connection Pool.
 * If the connection URL changes or pool is not initialized, creates a single unified pool.
 */
export function getSharedPgPool(customUrl?: string): pg.Pool | null {
  const url = resolvePostgresConnectionString(customUrl);
  if (!url) {
    return null;
  }

  if (!global._unifiedPostgresPool || global._unifiedPostgresPoolUrl !== url) {
    if (global._unifiedPostgresPool) {
      try {
        global._unifiedPostgresPool.end().catch(() => {});
      } catch {}
    }

    global._unifiedPostgresPoolUrl = url;
    try {
      const limits = getPostgresPoolLimits();
      global._unifiedPostgresPool = new Pool({
        connectionString: url,
        connectionTimeoutMillis: limits.connectionTimeoutMillis,
        idleTimeoutMillis: limits.idleTimeoutMillis,
        statement_timeout: limits.statementTimeoutMillis,
        query_timeout: limits.statementTimeoutMillis,
        max: limits.max,
        ssl: getPostgresSslOption(url),
      });

      global._unifiedPostgresPool.on('error', (err: any) => {
        console.warn('[Unified PostgreSQL Pool Error]:', err?.message);
        systemLogger.warn('database', 'Birleşik PostgreSQL havuz hatası tespit edildi', err?.message);
      });
      console.log(`[Unified PostgreSQL Pool] Bağlantı havuzu başlatıldı (Max: ${limits.max}, ConnTimeout: ${limits.connectionTimeoutMillis}ms).`);
    } catch (err: any) {
      systemLogger.error('database', 'Birleşik PostgreSQL havuzu oluşturulamadı', err?.message);
      global._unifiedPostgresPool = undefined;
      return null;
    }
  }

  return global._unifiedPostgresPool;
}

/**
 * Returns real-time connection pool health & telemetry metrics.
 */
export function getSharedPgPoolStats(): {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  activeCount: number;
  max: number;
} | null {
  if (!global._unifiedPostgresPool) return null;
  const pool = global._unifiedPostgresPool;
  const total = pool.totalCount ?? 0;
  const idle = pool.idleCount ?? 0;
  const waiting = pool.waitingCount ?? 0;
  const limits = getPostgresPoolLimits();
  return {
    totalCount: total,
    idleCount: idle,
    waitingCount: waiting,
    activeCount: Math.max(0, total - idle),
    max: limits.max,
  };
}

/**
 * Safely recycles/terminates the shared pool (e.g. during disconnect or reconfiguration).
 */
export async function recycleSharedPgPool(): Promise<void> {
  if (global._unifiedPostgresPool) {
    try {
      await global._unifiedPostgresPool.end();
    } catch {}
    global._unifiedPostgresPool = undefined;
    global._unifiedPostgresPoolUrl = undefined;
    systemLogger.info('database', 'Birleşik PostgreSQL bağlantı havuzu sıfırlandı.');
  }
}
