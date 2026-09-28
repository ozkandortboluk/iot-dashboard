import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
const { Pool } = pg;
import { systemLogger } from '../services/systemLogger.service.js';
import { systemSecretsService } from '../services/systemSecrets.service.js';
import { sshTunnelService } from '../services/sshTunnel.service.js';

import { DatabaseState } from '../../types.js';
export { DatabaseState };

export type PgPoolType = pg.Pool;

declare global {
  var _unifiedPostgresPool: pg.Pool | undefined;
  var _unifiedPostgresPoolUrl: string | undefined;
  var _poolRecycleListeners: Set<PgPoolRecycleListener> | undefined;
}

export type PgPoolRecycleListener = (newPool: pg.Pool | null) => void;

function getPoolRecycleListeners(): Set<PgPoolRecycleListener> {
  if (!globalThis._poolRecycleListeners) {
    globalThis._poolRecycleListeners = new Set<PgPoolRecycleListener>();
  }
  return globalThis._poolRecycleListeners;
}

export function onPgPoolRecycled(listener: PgPoolRecycleListener): () => void {
  const listeners = getPoolRecycleListeners();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyPoolRecycled(newPool: pg.Pool | null): void {
  const listeners = getPoolRecycleListeners();
  for (const listener of listeners) {
    try {
      listener(newPool);
    } catch {}
  }
}

/**
 * Determines whether SSH Tunnel DB rerouting is allowed for database connections.
 * Can be explicitly controlled via DB_SSH_TUNNEL_ENABLED or ENABLE_SSH_TUNNEL environment variables.
 * Defaults to:
 * - FALSE in Production VPS mode (NODE_ENV=production or VPS_PRODUCTION=true)
 * - TRUE in Development / AI Studio Preview mode
 */
export function isSshTunnelAllowed(): boolean {
  if (process.env.DB_SSH_TUNNEL_ENABLED === 'true' || process.env.ENABLE_SSH_TUNNEL === 'true') {
    return true;
  }
  if (process.env.DB_SSH_TUNNEL_ENABLED === 'false' || process.env.ENABLE_SSH_TUNNEL === 'false') {
    return false;
  }
  const isProductionVps = process.env.NODE_ENV === 'production' || process.env.VPS_PRODUCTION === 'true';
  return !isProductionVps;
}

/**
 * Safely parses and URL-encodes special or non-ASCII characters in PostgreSQL connection strings
 * (e.g. unencoded 'ş', 'ğ', 'ü', '@', etc. in passwords)
 */
export function sanitizeAndEncodePostgresUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed.startsWith('postgres://') && !trimmed.startsWith('postgresql://')) {
    return trimmed;
  }

  try {
    const match = trimmed.match(/^(postgres(?:ql)?:\/\/)(?:([^:]+)(?::([^@]*))?@)?([^:/]+)(?::(\d+))?(\/.*)?$/);
    if (!match) return trimmed;

    const scheme = match[1];
    const rawUser = match[2];
    const rawPass = match[3];
    const host = match[4];
    const port = match[5] ? `:${match[5]}` : '';
    const rest = match[6] || '';

    if (rawUser === undefined) {
      return trimmed;
    }

    let encUser = rawUser;
    try {
      encUser = encodeURIComponent(decodeURIComponent(rawUser));
    } catch {
      encUser = encodeURIComponent(rawUser);
    }

    let encPass = '';
    if (rawPass !== undefined) {
      try {
        encPass = encodeURIComponent(decodeURIComponent(rawPass));
      } catch {
        encPass = encodeURIComponent(rawPass);
      }
    }

    const auth = encPass ? `${encUser}:${encPass}` : encUser;
    return `${scheme}${auth}@${host}${port}${rest}`;
  } catch {
    return trimmed;
  }
}

/**
 * Resolves PostgreSQL connection URL from all possible environment variable conventions
 * and structured fallback configurations with clear, deterministic precedence.
 */
export function resolvePostgresConnectionString(customUrl?: string): string {
  let candidateUrl = '';

  const isProduction = process.env.NODE_ENV === 'production' || process.env.VPS_PRODUCTION === 'true';
  const envHost = (process.env.SQL_HOST || process.env.PGHOST || process.env.POSTGRES_HOST || process.env.DB_HOST || '').trim();

  // Helper to build connection string from structured environment variables
  const buildFromEnvStructured = (): string => {
    if (!envHost) return '';
    const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER || process.env.PGUSER || process.env.POSTGRES_USER || process.env.DB_USER || 'postgres';
    let password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD || process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD;

    if (password === undefined || password === '') {
      try {
        password = systemSecretsService.getDatabasePassword();
      } catch {}
    }
    if ((password === undefined || password === '') && fs.existsSync('/run/secrets/db_password')) {
      try {
        password = fs.readFileSync('/run/secrets/db_password', 'utf8').trim();
      } catch {}
    }

    const dbName = process.env.SQL_DB_NAME || process.env.PGDATABASE || process.env.POSTGRES_DB || process.env.SQL_DATABASE || process.env.DB_NAME || 'postgres';
    const port = process.env.SQL_PORT || process.env.PGPORT || process.env.POSTGRES_PORT || process.env.DB_PORT || '5432';

    const encUser = encodeURIComponent(user);
    const encPass = password !== undefined && password !== '' ? encodeURIComponent(password) : '';
    const auth = encPass ? `${encUser}:${encPass}` : encUser;
    return `postgresql://${auth}@${envHost}:${port}/${dbName}`;
  };

  // 1. Explicit connection string environment variable (e.g. DATABASE_URL)
  const envUrl = (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRESQL_URL ||
    process.env.PG_URL ||
    ''
  ).trim();

  if (envUrl && (envUrl.startsWith('postgres://') || envUrl.startsWith('postgresql://')) && !envUrl.includes('••••••••')) {
    candidateUrl = envUrl;
  }

  // 2. Production Docker environment precedence: deployment env DB host takes precedence over stale stored customUrl
  if (!candidateUrl && isProduction && envHost) {
    candidateUrl = buildFromEnvStructured();
  }

  // 3. Custom / stored URL (e.g. from db.json or UI settings)
  if (!candidateUrl && customUrl && typeof customUrl === 'string') {
    const trimmed = customUrl.trim();
    if ((trimmed.startsWith('postgres://') || trimmed.startsWith('postgresql://')) && !trimmed.includes('••••••••')) {
      const isLoopbackInProd = isProduction && (trimmed.includes('@localhost') || trimmed.includes('@127.0.0.1'));
      if (isLoopbackInProd && envHost) {
        // Stale localhost/127.0.0.1 in production VPS -> override host with deployment DB_HOST (e.g. timescaledb)
        try {
          const match = trimmed.match(/^(postgres(?:ql)?:\/\/[^@]+@)([^:/]+)(?::\d+)?(\/.*)$/);
          if (match) {
            const port = process.env.SQL_PORT || process.env.PGPORT || process.env.POSTGRES_PORT || process.env.DB_PORT || '5432';
            candidateUrl = `${match[1]}${envHost}:${port}${match[3]}`;
          } else {
            candidateUrl = buildFromEnvStructured() || trimmed;
          }
        } catch {
          candidateUrl = buildFromEnvStructured() || trimmed;
        }
      } else {
        candidateUrl = trimmed;
      }
    }
  }

  // 4. Structured environment variables in non-production environments
  if (!candidateUrl && envHost) {
    candidateUrl = buildFromEnvStructured();
  }

  // 5. Runtime Secret Store (.db_config.json)
  if (!candidateUrl) {
    try {
      const secretPath = path.resolve(process.cwd(), 'data', '.db_config.json');
      if (fs.existsSync(secretPath)) {
        const raw = fs.readFileSync(secretPath, 'utf8');
        const cfg = JSON.parse(raw);
        if (cfg && cfg.host && cfg.database) {
          let resolvedPass = cfg.password;
          if (!resolvedPass) {
            try {
              resolvedPass = systemSecretsService.getDatabasePassword();
            } catch {}
          }
          if (!resolvedPass && fs.existsSync('/run/secrets/db_password')) {
            try {
              resolvedPass = fs.readFileSync('/run/secrets/db_password', 'utf8').trim();
            } catch {}
          }
          let targetHost = cfg.host;
          let targetPort: string | number = cfg.port || 5432;
          if (isProduction && (targetHost === 'localhost' || targetHost === '127.0.0.1') && envHost) {
            targetHost = envHost;
            targetPort = process.env.SQL_PORT || process.env.PGPORT || process.env.POSTGRES_PORT || process.env.DB_PORT || targetPort;
          }
          const encUser = encodeURIComponent(cfg.user || 'postgres');
          const encPass = resolvedPass !== undefined && resolvedPass !== '' ? encodeURIComponent(resolvedPass) : '';
          const auth = encPass ? `${encUser}:${encPass}` : encUser;
          const sslParam = cfg.sslMode && cfg.sslMode !== 'disable' ? `?sslmode=${cfg.sslMode}` : '';
          candidateUrl = `postgresql://${auth}@${targetHost}:${targetPort}/${cfg.database}${sslParam}`;
        }
      }
    } catch {}
  }

  // 6. System Secrets Vault database configuration
  if (!candidateUrl) {
    try {
      const vaultDb = systemSecretsService.getDatabaseConfig();
      if (vaultDb.isConfigured && vaultDb.host && vaultDb.database) {
        let targetHost = vaultDb.host;
        let targetPort: string | number = vaultDb.port || 5432;
        if (isProduction && (targetHost === 'localhost' || targetHost === '127.0.0.1') && envHost) {
          targetHost = envHost;
          targetPort = process.env.SQL_PORT || process.env.PGPORT || process.env.POSTGRES_PORT || process.env.DB_PORT || targetPort;
        }
        const encUser = encodeURIComponent(vaultDb.user || 'postgres');
        const encPass = vaultDb.password ? encodeURIComponent(vaultDb.password) : '';
        const auth = encPass ? `${encUser}:${encPass}` : encUser;
        const sslParam = vaultDb.sslMode && vaultDb.sslMode !== 'disable' ? `?sslmode=${vaultDb.sslMode}` : '';
        candidateUrl = `postgresql://${auth}@${targetHost}:${targetPort}/${vaultDb.database}${sslParam}`;
      }
    } catch {}
  }

  // Ensure user and password in candidateUrl are properly URL encoded
  candidateUrl = sanitizeAndEncodePostgresUrl(candidateUrl);

  // 7. Dynamic SSH Tunnel Routing: Reroute DB connections to 127.0.0.1:localPort ONLY if SSH Tunnel is explicitly allowed AND active
  if (candidateUrl && isSshTunnelAllowed() && sshTunnelService.isConnected()) {
    const localPort = sshTunnelService.getLocalPort();
    try {
      const match = candidateUrl.match(/^(postgres(?:ql)?:\/\/[^@]+@)([^:/]+)(?::\d+)?(\/.*)$/);
      if (match) {
        let rest = match[3];
        rest = rest.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
        candidateUrl = `${match[1]}127.0.0.1:${localPort}${rest}`;
      } else {
        candidateUrl = candidateUrl.replace(/@([^:/]+)(?::\d+)?/, `@127.0.0.1:${localPort}`);
      }
      systemLogger.info('database', `PostgreSQL bağlantı adresi SSH tüneli üzerinden yönlendirildi (127.0.0.1:${localPort})`);
    } catch {
      candidateUrl = candidateUrl.replace(/@([^:/]+)(?::\d+)?/, `@127.0.0.1:${localPort}`);
    }
  }

  // 8. Same-VPS / Local Loopback Auto-Fallback (non-production dev mode only)
  if (
    candidateUrl &&
    !isProduction &&
    !sshTunnelService.isConnected() &&
    (process.env.PGHOST === '127.0.0.1' ||
      process.env.PGHOST === 'localhost' ||
      process.env.PREFER_LOCAL_DB === 'true' ||
      process.env.USE_LOCAL_POSTGRES === 'true')
  ) {
    try {
      const match = candidateUrl.match(/^(postgres(?:ql)?:\/\/[^@]+@)([^:/]+)(?::\d+)?(\/.*)$/);
      if (match) {
        let rest = match[3];
        rest = rest.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
        const targetHost = process.env.PGHOST || '127.0.0.1';
        const targetPort = process.env.PGPORT || '5432';
        candidateUrl = `${match[1]}${targetHost}:${targetPort}${rest}`;
      }
    } catch {}
  }

  return candidateUrl;
}

/**
 * Centralized SSL option resolver based on connection string, provider heuristics, and environment.
 */
export function getPostgresSslOption(url: string): { rejectUnauthorized: boolean } | undefined {
  if (!url) return undefined;
  if (url.includes('sslmode=disable') || url.includes('sslmode=off') || url.includes('ssl=false') || url.includes('ssl=0')) {
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

  // Parse hostname from connection URL to determine internal Docker / loopback status
  const hostMatch = url.match(/@([^:/]+)(?::\d+)?/);
  const host = hostMatch ? hostMatch[1] : '';
  const isInternalDockerOrLoopback =
    !host ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === 'timescaledb' ||
    host === 'nexus_timescaledb' ||
    host === 'postgres' ||
    host === 'db' ||
    !host.includes('.'); // hostnames without a domain dot are internal docker container names

  const isProductionRemote =
    process.env.NODE_ENV === 'production' &&
    !isInternalDockerOrLoopback;

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
