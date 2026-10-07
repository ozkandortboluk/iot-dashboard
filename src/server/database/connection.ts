import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
const { Pool } = pg;
import { systemLogger } from '../services/systemLogger.service.js';
import { systemSecretsService } from '../services/systemSecrets.service.js';
import { sshTunnelService } from '../services/sshTunnel.service.js';
import { isDefaultPassword } from '../utils/startupSecurityPolicy.js';
import { resolveRuntimeEnvironment } from '../config/runtimeEnvironment.js';

import { DatabaseState } from '../../types.js';
export { DatabaseState };

export type PgPoolType = pg.Pool;

declare global {
  var _unifiedPostgresPool: pg.Pool | undefined;
  var _unifiedPostgresPoolUrl: string | undefined;
  var _poolRecycleListeners: Set<PgPoolRecycleListener> | undefined;
}

let lastLoggedSshTunnelPort: number | null = null;

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
  const env = resolveRuntimeEnvironment();
  // By default, SSH tunnel is disallowed on VPS production, and allowed in AI Studio, local development, and test.
  return env !== 'vps';
}

/**
 * Checks whether an SSH Tunnel configuration exists (saved config file or active configuration)
 */
export function isSshTunnelConfigured(): boolean {
  if (process.env.DB_SSH_TUNNEL_REQUIRED === 'true') {
    return true;
  }
  try {
    return Boolean(sshTunnelService.getConfig()?.sshHost);
  } catch {
    return false;
  }
}

/**
 * Determines whether SSH Tunnel is required for PostgreSQL connection in the current environment.
 * True when SSH tunnel is allowed in environment AND (explicitly required or configured for a remote host).
 * Does NOT block local/cloud PostgreSQL development connections that do not use SSH tunnel.
 */
export function isSshTunnelRequired(targetUrl?: string): boolean {
  if (!isSshTunnelAllowed()) {
    return false;
  }

  if (process.env.DB_SSH_TUNNEL_REQUIRED === 'true') {
    return true;
  }

  const hasSshConfig = isSshTunnelConfigured();
  if (!hasSshConfig) {
    return false;
  }

  if (targetUrl) {
    const hostMatch = targetUrl.match(/@([^:/]+)(?::\d+)?/);
    if (hostMatch) {
      const host = hostMatch[1].toLowerCase();
      const isLoopbackOrLocal =
        host === '127.0.0.1' ||
        host === 'localhost' ||
        host === 'timescaledb' ||
        host === 'nexus_timescaledb' ||
        host === 'postgres' ||
        host === 'db';
      if (isLoopbackOrLocal) {
        return false;
      }
    }
  }

  return true;
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
 * Injects or replaces the password in a PostgreSQL connection URL with a given canonical password.
 */
export function applyPasswordToPostgresUrl(url: string, newPassword: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed.startsWith('postgres://') && !trimmed.startsWith('postgresql://')) {
    return trimmed;
  }

  try {
    const match = trimmed.match(/^(postgres(?:ql)?:\/\/)(?:([^:@]+)(?::([^@]*))?@)?([^/?#]+)(\/[^?#]*)?(\?.*)?$/i);
    if (!match) return trimmed;

    const scheme = match[1];
    const rawUser = match[2] || 'postgres';
    const hostPort = match[4];
    const pathname = match[5] || '/iot_dashboard';
    const search = match[6] || '';

    let encUser = rawUser;
    try {
      encUser = encodeURIComponent(decodeURIComponent(rawUser));
    } catch {
      encUser = encodeURIComponent(rawUser);
    }

    let encPass = '';
    if (newPassword) {
      encPass = encodeURIComponent(newPassword);
    }

    const auth = encPass ? `${encUser}:${encPass}` : encUser;
    return `${scheme}${auth}@${hostPort}${pathname}${search}`;
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

  // =========================================================================
  // PRODUCTION ENVIRONMENT POLICY:
  // In production (NODE_ENV=production or VPS_PRODUCTION=true), the ONLY canonical
  // source for the database password is systemSecretsService.getDatabasePassword() / Vault database.password.
  // POSTGRES_PASSWORD, DB_PASSWORD, PGPASSWORD, SQL_ADMIN_PASSWORD, SQL_PASSWORD, or plaintext passwords
  // embedded in DATABASE_URL/POSTGRES_URL/PG_URL/customUrl are strictly IGNORED as password sources.
  // If Vault database password is not available in production, connection fails closed (returns empty string -> DB_UNAVAILABLE).
  // Non-sensitive deployment parameters (host, port, user, dbName) continue to be resolved from env/Vault.
  // =========================================================================
  if (isProduction) {
    let prodVaultPassword = '';
    try {
      prodVaultPassword = systemSecretsService.getDatabasePassword();
    } catch {}

    if (!prodVaultPassword) {
      // Production fail-closed: No password in Vault/Docker Secret, reject connection to prevent insecure plaintext fallback.
      return '';
    }

    // 1. Explicit / custom URL parameter (e.g. from explicit caller argument)
    if (customUrl && typeof customUrl === 'string') {
      const trimmed = customUrl.trim();
      if ((trimmed.startsWith('postgres://') || trimmed.startsWith('postgresql://')) && !trimmed.includes('••••••••')) {
        let targetUrl = trimmed;
        const isLoopbackInProd = targetUrl.includes('@localhost') || targetUrl.includes('@127.0.0.1');
        if (isLoopbackInProd && envHost) {
          try {
            const match = targetUrl.match(/^(postgres(?:ql)?:\/\/[^@]+@)([^:/]+)(?::\d+)?(\/.*)$/);
            if (match) {
              const port = process.env.SQL_PORT || process.env.PGPORT || process.env.POSTGRES_PORT || process.env.DB_PORT || '5432';
              targetUrl = `${match[1]}${envHost}:${port}${match[3]}`;
            }
          } catch {}
        }
        candidateUrl = applyPasswordToPostgresUrl(targetUrl, prodVaultPassword);
      }
    }

    // 2. Central Security Vault database configuration (CANONICAL APPLICATION SOURCE)
    if (!candidateUrl) {
      try {
        const vaultDb = systemSecretsService.getDatabaseConfig();
        if (vaultDb.isConfigured && vaultDb.host && vaultDb.database) {
          let targetHost = vaultDb.host;
          let targetPort: string | number = vaultDb.port || 5432;
          if ((targetHost === 'localhost' || targetHost === '127.0.0.1') && envHost) {
            targetHost = envHost;
            targetPort = process.env.SQL_PORT || process.env.PGPORT || process.env.POSTGRES_PORT || process.env.DB_PORT || targetPort;
          }
          const encUser = encodeURIComponent(vaultDb.user || 'postgres');
          const encPass = encodeURIComponent(prodVaultPassword);
          const sslParam = vaultDb.sslMode && vaultDb.sslMode !== 'disable' ? `?sslmode=${vaultDb.sslMode}` : '';
          candidateUrl = `postgresql://${encUser}:${encPass}@${targetHost}:${targetPort}/${vaultDb.database}${sslParam}`;
        }
      } catch {}
    }

    // 3. Explicit connection string environment variable (e.g. DATABASE_URL)
    if (!candidateUrl) {
      const envUrl = (
        process.env.DATABASE_URL ||
        process.env.POSTGRES_URL ||
        process.env.POSTGRESQL_URL ||
        process.env.PG_URL ||
        ''
      ).trim();

      if (envUrl && (envUrl.startsWith('postgres://') || envUrl.startsWith('postgresql://')) && !envUrl.includes('••••••••')) {
        candidateUrl = applyPasswordToPostgresUrl(envUrl, prodVaultPassword);
      }
    }

    // 4. Structured environment variables in production
    if (!candidateUrl && envHost) {
      const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER || process.env.PGUSER || process.env.POSTGRES_USER || process.env.DB_USER || 'postgres';
      const dbName = process.env.SQL_DB_NAME || process.env.PGDATABASE || process.env.POSTGRES_DB || process.env.SQL_DATABASE || process.env.DB_NAME || 'postgres';
      const port = process.env.SQL_PORT || process.env.PGPORT || process.env.POSTGRES_PORT || process.env.DB_PORT || '5432';

      const encUser = encodeURIComponent(user);
      const encPass = encodeURIComponent(prodVaultPassword);
      candidateUrl = `postgresql://${encUser}:${encPass}@${envHost}:${port}/${dbName}`;
    }

    // 5. Runtime Secret Store (.db_config.json)
    if (!candidateUrl) {
      try {
        const secretPath = path.resolve(process.cwd(), 'data', '.db_config.json');
        if (fs.existsSync(secretPath)) {
          const raw = fs.readFileSync(secretPath, 'utf8');
          const cfg = JSON.parse(raw);
          if (cfg && cfg.host && cfg.database) {
            let targetHost = cfg.host;
            let targetPort: string | number = cfg.port || 5432;
            if ((targetHost === 'localhost' || targetHost === '127.0.0.1') && envHost) {
              targetHost = envHost;
              targetPort = process.env.SQL_PORT || process.env.PGPORT || process.env.POSTGRES_PORT || process.env.DB_PORT || targetPort;
            }
            const encUser = encodeURIComponent(cfg.user || 'postgres');
            const encPass = encodeURIComponent(prodVaultPassword);
            const sslParam = cfg.sslMode && cfg.sslMode !== 'disable' ? `?sslmode=${cfg.sslMode}` : '';
            candidateUrl = `postgresql://${encUser}:${encPass}@${targetHost}:${targetPort}/${cfg.database}${sslParam}`;
          }
        }
      } catch {}
    }

    return sanitizeAndEncodePostgresUrl(candidateUrl);
  }

  // =========================================================================
  // NON-PRODUCTION / DEVELOPMENT / TEST / PREVIEW ENVIRONMENT POLICY:
  // Preserves full flexible developer workflows, SSH tunnel routing, test fixtures,
  // and local environment variables.
  // =========================================================================

  // 1. Custom / explicitly provided URL parameter (e.g. from tests or explicit caller argument)
  if (customUrl && typeof customUrl === 'string') {
    const trimmed = customUrl.trim();
    if ((trimmed.startsWith('postgres://') || trimmed.startsWith('postgresql://')) && !trimmed.includes('••••••••')) {
      candidateUrl = trimmed;
    }
  }

  // 2. Central Security Vault database configuration (CANONICAL APPLICATION SOURCE)
  if (!candidateUrl) {
    try {
      const vaultDb = systemSecretsService.getDatabaseConfig();
      if (vaultDb.isConfigured && vaultDb.host && vaultDb.database) {
        const encUser = encodeURIComponent(vaultDb.user || 'postgres');
        const encPass = vaultDb.password ? encodeURIComponent(vaultDb.password) : '';
        const auth = encPass ? `${encUser}:${encPass}` : encUser;
        const sslParam = vaultDb.sslMode && vaultDb.sslMode !== 'disable' ? `?sslmode=${vaultDb.sslMode}` : '';
        candidateUrl = `postgresql://${auth}@${vaultDb.host}:${vaultDb.port || 5432}/${vaultDb.database}${sslParam}`;
      }
    } catch {}
  }

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

    const dbName = process.env.SQL_DB_NAME || process.env.PGDATABASE || process.env.POSTGRES_DB || process.env.SQL_DATABASE || process.env.DB_NAME || 'postgres';
    const port = process.env.SQL_PORT || process.env.PGPORT || process.env.POSTGRES_PORT || process.env.DB_PORT || '5432';

    const encUser = encodeURIComponent(user);
    const encPass = password !== undefined && password !== '' ? encodeURIComponent(password) : '';
    const auth = encPass ? `${encUser}:${encPass}` : encUser;
    return `postgresql://${auth}@${envHost}:${port}/${dbName}`;
  };

  // 3. Explicit connection string environment variable (e.g. DATABASE_URL)
  if (!candidateUrl) {
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
          const encUser = encodeURIComponent(cfg.user || 'postgres');
          const encPass = resolvedPass !== undefined && resolvedPass !== '' ? encodeURIComponent(resolvedPass) : '';
          const auth = encPass ? `${encUser}:${encPass}` : encUser;
          const sslParam = cfg.sslMode && cfg.sslMode !== 'disable' ? `?sslmode=${cfg.sslMode}` : '';
          candidateUrl = `postgresql://${auth}@${cfg.host}:${cfg.port || 5432}/${cfg.database}${sslParam}`;
        }
      }
    } catch {}
  }

  // 6. Inject password from Central Security Vault if URL is missing credentials
  if (candidateUrl) {
    try {
      const match = candidateUrl.match(/^(postgres(?:ql)?:\/\/)(?:([^:@]+)(?::([^@]*))?@)?([^/?#]+)(\/[^?#]*)?(\?.*)?$/i);
      if (match) {
        const proto = match[1];
        const user = match[2] || 'iot_user';
        const existingPass = match[3];
        const hostPort = match[4];
        const pathname = match[5] || '/iot_dashboard';
        const search = match[6] || '';

        if (!existingPass || existingPass === '' || existingPass.includes('••••')) {
          const vaultPass = systemSecretsService.getDatabasePassword();
          if (vaultPass) {
            const encUser = encodeURIComponent(decodeURIComponent(user));
            const encPass = encodeURIComponent(vaultPass);
            candidateUrl = `${proto}${encUser}:${encPass}@${hostPort}${pathname}${search}`;
          }
        }
      }
    } catch {}
  }

  // Ensure user and password in candidateUrl are properly URL encoded
  candidateUrl = sanitizeAndEncodePostgresUrl(candidateUrl);

  // 7. Dynamic SSH Tunnel Routing: Reroute DB connections to 127.0.0.1:localPort when SSH Tunnel is active,
  // or safely wait in DB_UNAVAILABLE when SSH Tunnel is required for remote host but disconnected.
  if (isSshTunnelAllowed()) {
    if (sshTunnelService.isConnected()) {
      const localPort = sshTunnelService.getLocalPort();
      if (candidateUrl) {
        try {
          const match = candidateUrl.match(/^(postgres(?:ql)?:\/\/[^@]+@)([^:/]+)(?::\d+)?(\/.*)$/);
          if (match) {
            let rest = match[3];
            rest = rest.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
            candidateUrl = `${match[1]}127.0.0.1:${localPort}${rest}`;
          } else {
            candidateUrl = candidateUrl.replace(/@([^:/]+)(?::\d+)?/, `@127.0.0.1:${localPort}`);
          }
          if (lastLoggedSshTunnelPort !== localPort) {
            lastLoggedSshTunnelPort = localPort;
            systemLogger.info('database', `PostgreSQL bağlantı adresi SSH tüneli üzerinden yönlendirildi (127.0.0.1:${localPort})`);
          }
        } catch {
          candidateUrl = candidateUrl.replace(/@([^:/]+)(?::\d+)?/, `@127.0.0.1:${localPort}`);
        }
      } else {
        // Build connection string targeting the SSH tunnel local forwarded port
        try {
          const vaultDb = systemSecretsService.getDatabaseConfig();
          const user = vaultDb.user || process.env.SQL_USER || process.env.DB_USER || process.env.POSTGRES_USER || 'postgres';
          const pass = vaultDb.password || systemSecretsService.getDatabasePassword() || process.env.DB_PASSWORD || '';
          const dbName = vaultDb.database || process.env.DB_NAME || process.env.POSTGRES_DB || process.env.SQL_DB_NAME || 'iot_dashboard';
          const encUser = encodeURIComponent(user);
          const encPass = pass ? encodeURIComponent(pass) : '';
          const auth = encPass ? `${encUser}:${encPass}` : encUser;
          candidateUrl = `postgresql://${auth}@127.0.0.1:${localPort}/${dbName}`;
          if (lastLoggedSshTunnelPort !== localPort) {
            lastLoggedSshTunnelPort = localPort;
            systemLogger.info('database', `SSH Tüneli aktif: Veritabanı bağlantı adresi 127.0.0.1:${localPort} olarak otomatik yapılandırıldı.`);
          }
        } catch {}
      }
    } else if (isSshTunnelRequired(candidateUrl)) {
      // SSH Tunnel is required for this remote PostgreSQL connection, but tunnel is not connected yet!
      // Refuse to fall back to direct remote VPS IP/host to prevent ECONNREFUSED log spam and port 5432 probing.
      if (lastLoggedSshTunnelPort !== -1) {
        lastLoggedSshTunnelPort = -1;
        systemLogger.warn('database', 'PostgreSQL bağlantısı bekleniyor: SSH tüneli bağlı değil.');
      }
      return '';
    }
  } else {
    lastLoggedSshTunnelPort = null;
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

  return sanitizeAndEncodePostgresUrl(candidateUrl);
}

/**
 * Centralized SSL option resolver based on connection string, provider heuristics, and environment.
 * Supports verify-full and verify-ca with custom root certificates.
 */
export function getPostgresSslOption(url: string): { rejectUnauthorized: boolean; ca?: string } | undefined {
  if (!url) return undefined;

  let caCert: string | undefined;
  const caPath = process.env.PGSSLROOTCERT || process.env.DATABASE_SSL_CA_PATH || '/run/secrets/pg_ssl_root_cert';
  if (fs.existsSync(caPath)) {
    try {
      caCert = fs.readFileSync(caPath, 'utf8');
    } catch {}
  } else if (process.env.DATABASE_SSL_CA) {
    caCert = process.env.DATABASE_SSL_CA;
  }

  // Parse hostname from connection URL to determine internal Docker / loopback status
  const hostMatch = url.match(/@([^:/]+)(?::\d+)?/);
  const host = hostMatch ? hostMatch[1].toLowerCase() : '';
  const isInternalDockerOrLoopback =
    !host ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === 'timescaledb' ||
    host === 'nexus_timescaledb' ||
    host === 'postgres' ||
    host === 'db';

  const isProd = process.env.NODE_ENV === 'production' || process.env.VPS_PRODUCTION === 'true';
  const isRemote = !isInternalDockerOrLoopback;

  // Strict Production Policy (SEC-08):
  // In production (NODE_ENV=production or VPS_PRODUCTION=true) with a remote database,
  // TLS verification is strictly mandatory. sslmode=disable and PG_ALLOW_INSECURE_TLS are rejected.
  if (isProd && isRemote) {
    return {
      rejectUnauthorized: true,
      ...(caCert ? { ca: caCert } : {}),
    };
  }

  if (url.includes('sslmode=disable') || url.includes('sslmode=off') || url.includes('ssl=false') || url.includes('ssl=0')) {
    return undefined;
  }

  // Check for strict verification modes (verify-full, verify-ca)
  const isVerifyFull = url.includes('sslmode=verify-full') || process.env.PGSSLMODE === 'verify-full';
  const isVerifyCa = url.includes('sslmode=verify-ca') || process.env.PGSSLMODE === 'verify-ca';

  // When a trusted CA is explicitly provided or strict verification is requested, reject unauthorized certificates
  const rejectUnauthorizedExplicit =
    process.env.PG_REJECT_UNAUTHORIZED === 'true' ||
    isVerifyFull ||
    isVerifyCa ||
    Boolean(caCert);

  if (rejectUnauthorizedExplicit) {
    return {
      rejectUnauthorized: true,
      ...(caCert ? { ca: caCert } : {}),
    };
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

  const allowInsecureTls = !isProd && process.env.PG_ALLOW_INSECURE_TLS === 'true';

  if (hasSslParam || isCloudHost || (isRemote && !allowInsecureTls)) {
    // Remote hosts and cloud endpoints verify certificates by default
    return {
      rejectUnauthorized: !allowInsecureTls,
      ...(caCert ? { ca: caCert } : {}),
    };
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

  const isProduction = process.env.NODE_ENV === 'production' || process.env.VPS_PRODUCTION === 'true';
  if (isProduction) {
    const urlMatch = url.match(/^(?:postgres(?:ql)?):\/\/[^:]+:([^@]+)@/);
    if (urlMatch && urlMatch[1]) {
      const extractedPass = decodeURIComponent(urlMatch[1]);
      if (isDefaultPassword(extractedPass)) {
        systemLogger.critical(
          'security',
          `[CRITICAL POLICY] Üretim ortamında varsayılan veya güvensiz veritabanı parolası tespiti nedeniyle bağlantı reddedildi (OLD-112).`
        );
        console.error(`[CRITICAL POLICY] Üretim ortamında varsayılan veya güvensiz veritabanı parolasıyla bağlantı reddedildi (OLD-112).`);
        return null;
      }
    }
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
