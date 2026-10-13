import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isSshTunnelAllowed,
  isSshTunnelRequired,
  isSshTunnelConfigured,
  resolvePostgresConnectionString,
} from '../server/database/connection.js';
import { sshTunnelService } from '../server/services/sshTunnel.service.js';
import { systemSecretsService } from '../server/services/systemSecrets.service.js';

describe('SSH Tunnel & PostgreSQL Connection Routing Test Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRESQL_URL;
    delete process.env.PG_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('1. Production VPS mode: isSshTunnelAllowed returns false and does not alter production connection', () => {
    process.env.NODE_ENV = 'production';
    process.env.VPS_PRODUCTION = 'true';
    delete process.env.DB_SSH_TUNNEL_ENABLED;
    delete process.env.ENABLE_SSH_TUNNEL;

    vi.spyOn(systemSecretsService, 'getDatabasePassword').mockReturnValue('pass');

    expect(isSshTunnelAllowed()).toBe(false);
    expect(isSshTunnelRequired('postgresql://postgres:pass@timescaledb:5432/db')).toBe(false);

    const resolved = resolvePostgresConnectionString('postgresql://postgres:pass@timescaledb:5432/db');
    expect(resolved).toContain('@timescaledb:5432/db');
    expect(resolved).not.toContain('127.0.0.1');
  });

  it('VPS production cannot enable SSH tunnel using environment overrides', () => {
    process.env.NODE_ENV = 'production';
    process.env.VPS_PRODUCTION = 'true';
    process.env.APP_ENV = 'aistudio';
    process.env.ENABLE_SSH_TUNNEL = 'true';
    process.env.DB_SSH_TUNNEL_ENABLED = 'true';

    expect(isSshTunnelAllowed()).toBe(false);
    expect(isSshTunnelRequired('postgresql://iot_user:pass@remote.example:5432/db')).toBe(false);
  });

  it('verified AI Studio preview permits SSH tunnel even with NODE_ENV=production', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'aistudio';
    process.env.AIS_PREVIEW = 'true';
    delete process.env.VPS_PRODUCTION;
    delete process.env.DB_SSH_TUNNEL_ENABLED;
    delete process.env.ENABLE_SSH_TUNNEL;

    expect(isSshTunnelAllowed()).toBe(true);
  });

  it('explicit VPS environment blocks SSH tunnel without NODE_ENV=production', () => {
    process.env.NODE_ENV = 'development';
    process.env.APP_ENV = 'vps';
    process.env.ENABLE_SSH_TUNNEL = 'true';
    delete process.env.VPS_PRODUCTION;

    expect(isSshTunnelAllowed()).toBe(false);
  });

  it('2. Local Postgres without SSH tunnel config: isSshTunnelRequired returns false', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.VPS_PRODUCTION;
    delete process.env.DB_SSH_TUNNEL_REQUIRED;

    vi.spyOn(sshTunnelService, 'getConfig').mockReturnValue(null as any);

    expect(isSshTunnelAllowed()).toBe(true);
    expect(isSshTunnelRequired('postgresql://postgres:pass@127.0.0.1:5432/db')).toBe(false);

    const resolved = resolvePostgresConnectionString('postgresql://postgres:pass@127.0.0.1:5432/db');
    expect(resolved).toBe('postgresql://postgres:pass@127.0.0.1:5432/db');
  });

  it('3. AI Studio Dev Mode with SSH Tunnel Configured but DISCONNECTED: prevents remote IP fallback', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.VPS_PRODUCTION;

    vi.spyOn(sshTunnelService, 'getConfig').mockReturnValue({
      sshHost: '91.151.95.66',
      sshPort: 22,
      sshUser: 'deploy',
      authType: 'password',
      remoteDbHost: '127.0.0.1',
      remoteDbPort: 5432,
      localPort: 5432,
    });
    vi.spyOn(sshTunnelService, 'isConnected').mockReturnValue(false);

    const remoteUrl = 'postgresql://postgres:secretPass@91.151.95.66:5432/iot_db';
    expect(isSshTunnelRequired(remoteUrl)).toBe(true);

    // When SSH tunnel is required but disconnected, resolvePostgresConnectionString must return empty string
    // to prevent direct TCP socket connection attempt to 91.151.95.66:5432!
    const resolved = resolvePostgresConnectionString(remoteUrl);
    expect(resolved).toBe('');
  });

  it('4. AI Studio Dev Mode with SSH Tunnel CONNECTED: reroutes remote URL to 127.0.0.1:localPort', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.VPS_PRODUCTION;

    vi.spyOn(sshTunnelService, 'getConfig').mockReturnValue({
      sshHost: '91.151.95.66',
      sshPort: 22,
      sshUser: 'deploy',
      authType: 'password',
      remoteDbHost: '127.0.0.1',
      remoteDbPort: 5432,
      localPort: 5433,
    });
    vi.spyOn(sshTunnelService, 'isConnected').mockReturnValue(true);
    vi.spyOn(sshTunnelService, 'getLocalPort').mockReturnValue(5433);

    const remoteUrl = 'postgresql://postgres:secretPass@91.151.95.66:5432/iot_db';
    const resolved = resolvePostgresConnectionString(remoteUrl);

    expect(resolved).toBe('postgresql://postgres:secretPass@127.0.0.1:5433/iot_db');
  });

  it('5. Production VPS mode: ignores lingering saved SSH tunnel config and forces timescaledb:5432', () => {
    process.env.NODE_ENV = 'production';
    process.env.VPS_PRODUCTION = 'true';
    delete process.env.DB_SSH_TUNNEL_ENABLED;
    delete process.env.ENABLE_SSH_TUNNEL;

    vi.spyOn(systemSecretsService, 'getDatabasePassword').mockReturnValue('vps_pass');

    expect(sshTunnelService.getConfig()).toBeNull();
    expect(sshTunnelService.isConnected()).toBe(false);
    expect(isSshTunnelConfigured()).toBe(false);

    process.env.SQL_HOST = 'timescaledb';
    const resolved = resolvePostgresConnectionString();
    expect(resolved).toContain('timescaledb:5432');
  });
});
