import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
const { Pool } = pg;
import { systemLogger } from '../services/systemLogger.service.js';
import { systemSecretsService } from '../services/systemSecrets.service.js';

import { DatabaseState } from '../../types.js';
export { DatabaseState };

export type PgPoolType = pg.Pool;

declare global {
  var _unifiedPostgresPool: pg.Pool | undefined;
  var _unifiedPostgresPoolUrl: string | undefined;
}

export type PgPoolRecycleListener = (newPool: pg.Pool | null) => void;
const poolRecycleListeners: Set<PgPoolRecycleListener> = new Set();

export function onPgPoolRecycled(listener: PgPoolRecycleListener): () => void {
  poolRecycleListeners.add(listener);
  return () => poolRecycleListeners.delete(listener);
}

function notifyPoolRecycled(newPool: pg.Pool | null): void {
  for (const listener of poolRecycleListeners) {
    try {
      listener(newPool);
    } catch {}
  }
}

/**
 * Resolves PostgreSQL connection URL from all possible environment variable conventions
 * and structured fallback configurations.
 */
export function resolvePostgresConnectionString(customUrl?: string): string {
  // 1. Explicitly supplied URL (e.g. from UI settings modal or direct argument)
  const envUrl = (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRESQL_URL ||
    process.env.PG_URL ||
    ''
  ).trim();

  if (customUrl && typeof customUrl === 'string') {
    const trimmed = customUrl.trim();
    if ((trimmed.startsWith('postgres://') || trimmed.startsWith('postgresql://')) && !trimmed.includes('••••••••')) {
      const isDockerPlaceholder = trimmed.includes('@timescaledb:5432') || trimmed.includes('@postgres:5432') || trimmed.includes('@db:5432');
      if (!isDockerPlaceholder || !envUrl) {
        return trimmed;
      }
    }
  }

  // 2. Standard Connection String Environment Variables
  if (envUrl && (envUrl.startsWith('postgres://') || envUrl.startsWith('postgresql://')) && !envUrl.includes('••••••••')) {
    return envUrl;
  }

  // 3. Structured / Deconstructed Environment Variables (Cloud SQL, Docker, standard Postgres conventions)
  const host = process.env.SQL_HOST || process.env.PGHOST || process.env.POSTGRES_HOST || process.env.DB_HOST;
  const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER || process.env.PGUSER || process.env.POSTGRES_USER || process.env.DB_USER;
  const password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD || process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD;
  const dbName = process.env.SQL_DB_NAME || process.env.PGDATABASE || process.env.POSTGRES_DB || process.env.SQL_DATABASE || process.env.DB_NAME;
  const port = process.env.SQL_PORT || process.env.PGPORT || process.env.POSTGRES_PORT || process.env.DB_PORT || '5432';

  // If host is explicitly configured, construct standard PostgreSQL URL
  if (host && host.trim() !== '') {
    const encUser = encodeURIComponent(user || 'postgres');
    const encPass = password !== undefined ? encodeURIComponent(password) : '';
    const auth = encPass ? `${encUser}:${encPass}` : encUser;
    const db = dbName || 'postgres';
    const candidate = `postgresql://${auth}@${host}:${port}/${db}`;
    return candidate;
  }

  // 4. Runtime Secret Store (from First Run Setup Wizard or Docker Secret or Vault)
  try {
    const secretPath = path.resolve(process.cwd(), 'data', '.db_config.json');
    if (fs.existsSync(secretPath)) {
      const raw = fs.readFileSync(secretPath, 'utf8');
      const cfg = JSON.parse(raw);
      if (cfg && cfg.host && cfg.database) {
        // Resolve password from Vault if not present in config file
        let resolvedPass = cfg.password;
        if (!resolvedPass) {
          resolvedPass = systemSecretsService.getDatabasePassword();
        }
        if (!resolvedPass && fs.existsSync('/run/secrets/db_password')) {
          try {
            resolvedPass = fs.readFileSync('/run/secrets/db_password', 'utf8').trim();
          } catch {}
        }
        const encUser = encodeURIComponent(cfg.user || 'postgres');
        const encPass = resolvedPass !== undefined && resolvedPass !== '' ? encodeURIComponent(resolvedPass) : '';
        const auth = encPass ? `${encUser}:${encPass}` : encUser;
        const p = cfg.port || 5432;
        const sslParam = cfg.sslMode && cfg.sslMode !== 'disable' ? `?sslmode=${cfg.sslMode}` : '';
        return `postgresql://${auth}@${cfg.host}:${p}/${cfg.database}${sslParam}`;
      }
    }
  } catch {}

  // 5. System Secrets Vault database configuration (AES-256-GCM encrypted)
  try {
    const vaultDb = systemSecretsService.getDatabaseConfig();
    if (vaultDb.isConfigured && vaultDb.host && vaultDb.database) {
      const encUser = encodeURIComponent(vaultDb.user || 'postgres');
      const encPass = vaultDb.password ? encodeURIComponent(vaultDb.password) : '';
      const auth = encPass ? `${encUser}:${encPass}` : encUser;
      const p = vaultDb.port || 5432;
      const sslParam = vaultDb.sslMode && vaultDb.sslMode !== 'disable' ? `?sslmode=${vaultDb.sslMode}` : '';
      return `postgresql://${auth}@${vaultDb.host}:${p}/${vaultDb.database}${sslParam}`;
    }
  } catch {}

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
    process.env.PG_POOL_MAX || process.env.SQL_POOL_MAX || process.env.DATABASE_POOL_MAX || '10',
    10
  );
  const max = Number.isFinite(envMax) && envMax > 0 ? Math.min(Math.max(envMax, 2), 25) : 10;

  const envConnTimeout = parseInt(process.env.PG_CONNECTION_TIMEOUT_MS || '8000', 10);
  const connectionTimeoutMillis = Number.isFinite(envConnTimeout) && envConnTimeout > 0 ? envConnTimeout : 8000;

  const envIdleTimeout = parseInt(process.env.PG_IDLE_TIMEOUT_MS || '10000', 10);
  const idleTimeoutMillis = Number.isFinite(envIdleTimeout) && envIdleTimeout > 0 ? envIdleTimeout : 10000;

  const envStatementTimeout = parseInt(process.env.PG_STATEMENT_TIMEOUT_MS || '30000', 10);
  const statementTimeoutMillis = Number.isFinite(envStatementTimeout) && envStatementTimeout > 0 ? envStatementTimeout : 30000;

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

  const currentPool = global._unifiedPostgresPool;
  const isPoolTerminated = !currentPool || Boolean((currentPool as any).ending) || Boolean((currentPool as any).ended);

  if (isPoolTerminated || global._unifiedPostgresPoolUrl !== url) {
    if (currentPool && !(currentPool as any).ending && !(currentPool as any).ended) {
      try {
        currentPool.end().catch(() => {});
      } catch {}
    }

    global._unifiedPostgresPool = undefined;
    global._unifiedPostgresPoolUrl = url;
    notifyPoolRecycled(null);

    try {
      const limits = getPostgresPoolLimits();
      const newPool = new Pool({
        connectionString: url,
        connectionTimeoutMillis: limits.connectionTimeoutMillis,
        idleTimeoutMillis: limits.idleTimeoutMillis,
        statement_timeout: limits.statementTimeoutMillis,
        query_timeout: limits.statementTimeoutMillis,
        max: limits.max,
        ssl: getPostgresSslOption(url),
      });

      newPool.on('error', (err: any) => {
        console.warn('[Unified PostgreSQL Pool Error]:', err?.message);
        systemLogger.warn('database', 'Birleşik PostgreSQL havuz hatası tespit edildi', err?.message);
      });
      console.log(`[Unified PostgreSQL Pool] Bağlantı havuzu başlatıldı (Max: ${limits.max}, ConnTimeout: ${limits.connectionTimeoutMillis}ms).`);
      global._unifiedPostgresPool = newPool;
      notifyPoolRecycled(newPool);
    } catch (err: any) {
      systemLogger.error('database', 'Birleşik PostgreSQL havuzu oluşturulamadı', err?.message);
      global._unifiedPostgresPool = undefined;
      notifyPoolRecycled(null);
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
  const poolToEnd = global._unifiedPostgresPool;
  global._unifiedPostgresPool = undefined;
  global._unifiedPostgresPoolUrl = undefined;
  notifyPoolRecycled(null);

  if (poolToEnd) {
    try {
      if (!(poolToEnd as any).ending && !(poolToEnd as any).ended) {
        await poolToEnd.end();
      }
    } catch {}
    systemLogger.info('database', 'Birleşik PostgreSQL bağlantı havuzu sıfırlandı.');
  }
}
