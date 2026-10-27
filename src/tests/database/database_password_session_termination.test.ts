import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { db } from '../../server/db.js';
import { setupService } from '../../server/services/setup.service.js';
import { systemSecretsService } from '../../server/services/systemSecrets.service.js';
import { databaseRouter } from '../../server/routes/system.js';
import { secretsRouter } from '../../server/routes/secrets.js';
import { setupRouter } from '../../server/routes/setup.js';
import * as systemLifecycle from '../../server/services/systemLifecycle.service.js';
import pg from 'pg';

describe('Database Password Change Session Termination & Controlled Reboot', () => {
  let app: express.Express;
  let originalVerifySessionAsync: any;
  let originalVerifySession: any;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/database', databaseRouter);
    app.use('/api/system/secrets', secretsRouter);
    app.use('/api/setup', setupRouter);

    originalVerifySessionAsync = db.verifySessionAsync;
    originalVerifySession = db.verifySession;
  });

  afterEach(() => {
    db.verifySessionAsync = originalVerifySessionAsync;
    db.verifySession = originalVerifySession;
    vi.restoreAllMocks();
  });

  const mockUserSession = (role: string = 'admin') => {
    const session = {
      user: { id: 'admin_usr_1', email: 'admin@nexusnode.io', name: 'Admin User', role },
      token: 'valid_admin_token_123',
      expiresAt: '2099-01-01T00:00:00.000Z',
    };
    db.verifySession = () => session as any;
    db.verifySessionAsync = async () => session as any;
  };

  it('1. db.terminateAllSessions revokes WAL in-memory sessions and calls PG cleanup', async () => {
    // Populate dummy in-memory sessions
    db.data.sessions = [
      { token: 'sess_1', user: { id: 'u1', role: 'admin' }, expiresAt: '2099-01-01' } as any,
      { token: 'sess_2', user: { id: 'u2', role: 'operator' }, expiresAt: '2099-01-01' } as any,
    ];
    expect(db.data.sessions.length).toBe(2);

    await db.terminateAllSessions('Test database password rotation');
    expect(db.data.sessions.length).toBe(0);
  });

  it('2. POST /api/database/rotate-password terminates sessions, clears cookie, and schedules reboot', async () => {
    mockUserSession('admin');

    // Mock system secrets
    vi.spyOn(systemSecretsService, 'getDatabaseConfig').mockReturnValue({
      host: 'timescaledb',
      port: 5432,
      database: 'iot_dashboard',
      user: 'iot_user',
      password: 'current_strong_pass_123',
      sslMode: 'disable',
      isConfigured: true,
    });

    vi.spyOn(setupService, 'testConnection').mockResolvedValue({
      success: true,
      message: 'Connection verified',
      timescaleAvailable: true,
    } as any);

    // Mock pg.Pool query for ALTER ROLE
    const mockQuery = vi.fn().mockResolvedValue({ rowCount: 1 });
    const mockRelease = vi.fn();
    const mockEnd = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(pg.Pool.prototype, 'connect').mockResolvedValue({
      query: mockQuery,
      release: mockRelease,
    } as any);
    vi.spyOn(pg.Pool.prototype, 'end').mockResolvedValue(undefined as any);

    vi.spyOn(systemSecretsService, 'updateDatabaseSecrets').mockResolvedValue(true as any);
    vi.spyOn(setupService, 'saveRuntimeSecretConfig').mockReturnValue(true as any);
    vi.spyOn(db, 'initPostgresRepository').mockResolvedValue(true);

    const terminateSpy = vi.spyOn(db, 'terminateAllSessions');
    const rebootSpy = vi.spyOn(systemLifecycle, 'scheduleSystemReboot');

    const res = await request(app)
      .post('/api/database/rotate-password')
      .set('Authorization', 'Bearer valid_admin_token_123')
      .send({
        currentPassword: 'current_strong_pass_123',
        newPassword: 'brand_new_secure_pass_456',
        confirmPassword: 'brand_new_secure_pass_456',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.rebooting).toBe(true);
    expect(res.body.sessionsRevoked).toBe(true);
    expect(res.body.message).toContain('tüm aktif oturumlar kapatıldı ve sistem yeniden başlatılıyor');

    // Verify terminateAllSessions was invoked
    expect(terminateSpy).toHaveBeenCalledWith('Veritabanı parolası sistem üzerinden değiştirildi');

    // Verify scheduleSystemReboot was called with delay
    expect(rebootSpy).toHaveBeenCalledWith(
      expect.stringContaining('Veritabanı parolası değiştirildi'),
      1500
    );

    // Verify session cookie was instructed to clear
    const setCookieHeaders = res.headers['set-cookie'];
    expect(setCookieHeaders).toBeDefined();
    const cookieHeaderStr = Array.isArray(setCookieHeaders) ? setCookieHeaders.join('; ') : String(setCookieHeaders);
    expect(cookieHeaderStr).toMatch(/nexus_session_token=;/);
  });

  it('3. PUT /api/system/secrets terminates sessions and schedules reboot when database password is changed', async () => {
    mockUserSession('admin');

    // Current DB config has password 'old_pass_123'
    vi.spyOn(systemSecretsService, 'getDatabaseConfig').mockReturnValue({
      host: 'timescaledb',
      port: 5432,
      database: 'iot_dashboard',
      user: 'iot_user',
      password: 'old_pass_123',
      sslMode: 'disable',
      isConfigured: true,
    });

    vi.spyOn(setupService, 'testConnection').mockResolvedValue({
      success: true,
      message: 'Connection verified',
      timescaleAvailable: true,
      tablesStatus: {
        users: true,
        devices: true,
        telemetry_readings: true,
      },
      permissionsStatus: {
        schema_usage: true,
        schema_create: true,
        users_select: true,
        users_insert: true,
        users_update: true,
        devices_select: true,
        devices_insert: true,
        devices_update: true,
        telemetry_select: true,
        telemetry_insert: true,
        sequences_usage: true,
      },
    } as any);

    vi.spyOn(systemSecretsService, 'updateDatabaseSecrets').mockResolvedValue(true as any);
    vi.spyOn(setupService, 'saveRuntimeSecretConfig').mockReturnValue(true as any);
    vi.spyOn(db, 'initPostgresRepository').mockResolvedValue(true);

    const terminateSpy = vi.spyOn(db, 'terminateAllSessions');
    const rebootSpy = vi.spyOn(systemLifecycle, 'scheduleSystemReboot');

    const res = await request(app)
      .put('/api/system/secrets')
      .set('Authorization', 'Bearer valid_admin_token_123')
      .send({
        database: {
          host: 'timescaledb',
          port: 5432,
          database: 'iot_dashboard',
          user: 'iot_user',
          password: 'new_different_secret_pass_789',
          sslMode: 'disable',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.rebooting).toBe(true);
    expect(res.body.sessionsRevoked).toBe(true);
    expect(terminateSpy).toHaveBeenCalledWith('Veritabanı parolası Kasa üzerinden güncellendi');
    expect(rebootSpy).toHaveBeenCalledWith(
      expect.stringContaining('Veritabanı parolası güncellendi'),
      1500
    );
  });

  it('4. POST /api/setup/emergency-database-config terminates sessions and schedules reboot', async () => {
    // Provide emergency setup auth mock
    vi.spyOn(setupService, 'testConnection').mockResolvedValue({
      success: true,
      message: 'Connection verified',
      timescaleAvailable: true,
    } as any);
    vi.spyOn(setupService, 'validateRecoveryToken').mockReturnValue(true);
    vi.spyOn(systemSecretsService, 'updateDatabaseSecrets').mockResolvedValue(true as any);
    vi.spyOn(setupService, 'saveRuntimeSecretConfig').mockReturnValue(true as any);
    vi.spyOn(db, 'initPostgresRepository').mockResolvedValue(true);

    const terminateSpy = vi.spyOn(db, 'terminateAllSessions');
    const rebootSpy = vi.spyOn(systemLifecycle, 'scheduleSystemReboot');

    const res = await request(app)
      .post('/api/setup/emergency-database-config')
      .send({
        recoveryToken: 'valid_emergency_recovery_token',
        password: 'emergency_updated_pass_999',
        host: 'timescaledb',
        port: 5432,
        database: 'iot_dashboard',
        user: 'iot_user',
        sslMode: 'disable',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.rebooting).toBe(true);
    expect(res.body.sessionsRevoked).toBe(true);
    expect(terminateSpy).toHaveBeenCalledWith('Acil durum veritabanı ayarları güncellendi');
    expect(rebootSpy).toHaveBeenCalledWith(
      expect.stringContaining('Acil durum veritabanı ayarları güncellendi'),
      1500
    );
  });
});
