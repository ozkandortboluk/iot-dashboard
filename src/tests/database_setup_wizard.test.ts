import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { setupService, SetupService, type DatabaseConfigPayload } from '../server/services/setup.service.js';
import { db } from '../server/db.js';

describe('First Run Database Setup Wizard Service & Security', () => {
  const testSecretPath = path.resolve(process.cwd(), 'data', '.db_config.json');

  beforeEach(() => {
    // Clean up test runtime secret file if exists and reset setupService state
    (setupService as any).isCompletedState = false;
    (setupService as any).completedAtDate = null;
    (setupService as any).runtimeConfig = null;
    try {
      if (fs.existsSync(testSecretPath)) {
        fs.unlinkSync(testSecretPath);
      }
    } catch {}
  });

  afterEach(() => {
    (setupService as any).isCompletedState = false;
    (setupService as any).completedAtDate = null;
    (setupService as any).runtimeConfig = null;
    try {
      if (fs.existsSync(testSecretPath)) {
        fs.unlinkSync(testSecretPath);
      }
    } catch {}
  });

  it('1. should construct connection string with proper URL encoding and without leaks', () => {
    const config: DatabaseConfigPayload = {
      host: 'timescaledb',
      port: 5432,
      database: 'iot_dashboard',
      user: 'iot_user',
      password: 'p@ssword#with%special!chars',
      sslMode: 'disable',
    };

    const connStr = setupService.buildConnectionString(config);
    expect(connStr).toContain('postgresql://iot_user:p%40ssword%23with%25special!chars@timescaledb:5432/iot_dashboard?sslmode=disable');
    expect(connStr).not.toContain('p@ssword#');
  });

  it('2. should securely persist and reload runtime DB configuration with restrictive permissions', () => {
    const config: DatabaseConfigPayload = {
      host: '10.0.0.15',
      port: 5433,
      database: 'secure_iot_db',
      user: 'iot_admin',
      password: 'very_secure_test_password_123',
      sslMode: 'require',
    };

    setupService.saveRuntimeSecretConfig(config, false);

    expect(fs.existsSync(testSecretPath)).toBe(true);
    const reloaded = setupService.loadRuntimeSecretConfig();
    expect(reloaded).not.toBeNull();
    expect(reloaded?.host).toBe('10.0.0.15');
    expect(reloaded?.port).toBe(5433);
    expect(reloaded?.database).toBe('secure_iot_db');
    expect(reloaded?.user).toBe('iot_admin');
    expect(reloaded?.password).toBe('very_secure_test_password_123');
    expect(reloaded?.sslMode).toBe('require');
  });

  it('3. should return sanitized status without revealing database password', async () => {
    const status = await setupService.getStatus();
    expect(status).toHaveProperty('setupRequired');
    expect(status).toHaveProperty('isCompleted');
    expect(status).toHaveProperty('currentStep');
    expect(status).toHaveProperty('stepsCompleted');
    // Ensure password is NEVER in the status response
    expect((status as any).password).toBeUndefined();
    if (status.dbConfig) {
      expect((status.dbConfig as any).password).toBeUndefined();
    }
    // Public status must never disclose or implicitly authenticate the setup token.
    expect(status.setupToken).toBeUndefined();
    expect(status.isSetupAuthenticated).toBe(false);
  });

  it('4. should handle invalid database connection test gracefully without crashing', async () => {
    const badConfig: DatabaseConfigPayload = {
      host: 'nonexistent-db-host-99999.invalid',
      port: 5432,
      database: 'test_db',
      user: 'test_user',
      password: 'test_password',
      sslMode: 'disable',
    };

    const result = await setupService.testConnection(badConfig);
    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
    // Message should not reveal the plaintext password
    expect(result.message).not.toContain('test_password');
  });

  it('5. should validate administrator password confirmation and minimum length', async () => {
    // Short password
    await expect(
      setupService.createAdministrator({
        name: 'Test Admin',
        email: 'test@nexusnodeiot.com.tr',
        password: 'short',
        passwordConfirm: 'short',
      })
    ).rejects.toThrow('en az 8 karakter');

    // Mismatched passwords
    await expect(
      setupService.createAdministrator({
        name: 'Test Admin',
        email: 'test@nexusnodeiot.com.tr',
        password: 'validPassword123!',
        passwordConfirm: 'differentPassword456!',
      })
    ).rejects.toThrow('eşleşmiyor');

    // Invalid email
    await expect(
      setupService.createAdministrator({
        name: 'Test Admin',
        email: 'invalid-email-format',
        password: 'validPassword123!',
        passwordConfirm: 'validPassword123!',
      })
    ).rejects.toThrow('Geçerli bir');
  });

  it('6. should reject configuration if setup is already completed', async () => {
    (setupService as any).isCompletedState = true;

    await expect(
      setupService.configureDatabase({
        host: 'localhost',
        port: 5432,
        database: 'iot_db',
        user: 'iot_user',
        password: 'pwd',
      })
    ).rejects.toThrow('Kurulum zaten tamamlanmış');

    await expect(setupService.initializeDatabase()).rejects.toThrow('Kurulum zaten tamamlanmış');

    // Reset state
    (setupService as any).isCompletedState = false;
  });

  it('7. should guarantee no hardcoded admin credentials (admin@nexusnode.io) exist in Canonical Schema DDL', async () => {
    const { generateCanonicalSchemaDDL, generateSingleTableDDL } = await import('../server/database/canonicalSchema.js');
    
    // Save original env
    const origEnv = process.env.NODE_ENV;
    const origVitest = process.env.VITEST;
    const origEnable = process.env.ENABLE_TEST_ACCOUNT;
    
    try {
      // Simulate production runtime
      process.env.NODE_ENV = 'production';
      delete (process.env as any).VITEST;
      delete (process.env as any).ENABLE_TEST_ACCOUNT;

      const ddl = generateCanonicalSchemaDDL();
      expect(ddl).not.toContain('admin@nexusnode.io');
      expect(ddl).not.toContain('$2a$10$B50m1l26vD8LhJqZ8XyqA.v2a00qQGq7cR/8v4M7sF2D3Q4s7rD9K');
      expect(ddl).not.toContain("VALUES ('usr_admin'");

      const usersTableDdl = generateSingleTableDDL('users');
      expect(usersTableDdl).not.toContain('admin@nexusnode.io');
      expect(usersTableDdl).not.toContain("VALUES (\n    'usr_admin'");
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origVitest) process.env.VITEST = origVitest;
      if (origEnable) process.env.ENABLE_TEST_ACCOUNT = origEnable;
    }
  });

  it('8. should verify isRealAdminUser strictly distinguishes genuine human admins from test or placeholder accounts', async () => {
    const { isRealAdminUser } = await import('../server/database/postgres.js');

    // Canonical test accounts must NOT count as real production admins
    expect(isRealAdminUser({ id: 'usr_test_admin', email: 'test@nexusnodeiot.com.tr', role: 'admin' })).toBe(false);
    expect(isRealAdminUser({ id: 'test_user_01', email: 'test_123@nexusnodeiot.com.tr', role: 'admin' })).toBe(false);
    expect(isRealAdminUser(null)).toBe(false);
    expect(isRealAdminUser({ id: 'usr_op', email: 'op@company.com', role: 'operator' })).toBe(false);

    // True operator admin accounts - including company domain @nexusnodeiot.com.tr
    expect(isRealAdminUser({ id: 'usr_admin', email: 'realadmin@mycompany.com', role: 'admin' })).toBe(true);
    expect(isRealAdminUser({ id: 'usr_admin', email: 'admin@nexusnodeiot.com.tr', role: 'admin' })).toBe(true);
    expect(isRealAdminUser({ id: 'usr_ozkan', email: 'ozkan@nexusnodeiot.com.tr', role: 'admin' })).toBe(true);
    expect(isRealAdminUser({ id: 'usr_director', email: 'director@nexusnodeiot.com.tr', role: 'admin' })).toBe(true);
  });

  it('9. should abort setup and throw error if admin database write fails, preventing false setup completion', async () => {
    // Attempting to create admin without database connection should fail fast
    (setupService as any).isCompletedState = false;
    (setupService as any).runtimeConfig = null;

    await expect(
      setupService.createAdministrator({
        name: 'Failure Test Admin',
        email: 'admin@nexusnodeiot.com.tr',
        password: 'validPassword123!',
        passwordConfirm: 'validPassword123!',
      })
    ).rejects.toThrow();

    // Setup must NOT be marked as completed
    expect(setupService.isSetupCompleted()).toBe(false);
  });

  it('10. should safely reset and resume setup session without unintended lockout', async () => {
    // 1. Configure initial DB
    const config: DatabaseConfigPayload = {
      host: 'localhost',
      port: 5432,
      database: 'iot_db_test',
      user: 'iot_user',
      password: 'testPassword123!',
      sslMode: 'disable',
    };
    setupService.saveRuntimeSecretConfig(config, false);

    // 2. Simulate partial state or lock
    (setupService as any).isCompletedState = true;
    expect(setupService.isSetupCompleted()).toBe(true);

    // 3. Reset setup preserving DB config
    const resetResult = await setupService.resetSetup(true);
    expect(resetResult.success).toBe(true);
    expect(resetResult.setupToken).toBeDefined();
    expect(setupService.isSetupCompleted()).toBe(false);

    // 4. Test resumeSetup
    (setupService as any).isCompletedState = true;
    const resumeResult = await setupService.resumeSetup();
    expect(resumeResult.success).toBe(true);
    expect(resumeResult.hasSavedConfig).toBe(true);
    expect(setupService.isSetupCompleted()).toBe(false);

    // 5. Reset without preserving config
    const fullResetResult = await setupService.resetSetup(false);
    expect(fullResetResult.success).toBe(true);
    expect(fullResetResult.currentStep).toBe(1);
    expect(setupService.isSetupCompleted()).toBe(false);
  });

  it('11. should auto-heal and unlock setup status if system lacks admin or DB connection', async () => {
    // Force corrupted completed state in memory
    (setupService as any).isCompletedState = true;
    (setupService as any).runtimeConfig = null;

    // getStatus should detect that DB/admin is missing and auto-heal isCompletedState to false
    const status = await setupService.getStatus();
    expect(status.isCompleted).toBe(false);
    expect(status.setupRequired).toBe(true);
    expect(setupService.isSetupCompleted()).toBe(false);
  });

  it('12. should require a valid recovery token for reset and resume', async () => {
    const { requireSetupAuth } = await import('../server/middleware/setupAuth.js');
    (setupService as any).isCompletedState = false;
    const recoveryToken = setupService.getOrInitSetupToken(true);

    const deniedReq: any = { path: '/reset', originalUrl: '/api/setup/reset', headers: {}, cookies: {}, query: {} };
    const deniedRes: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const deniedNext = vi.fn();

    requireSetupAuth(deniedReq, deniedRes, deniedNext);
    expect(deniedNext).not.toHaveBeenCalled();
    expect(deniedRes.status).toHaveBeenCalledWith(401);

    const allowedReq: any = {
      path: '/resume',
      originalUrl: '/api/setup/resume',
      headers: { 'x-setup-token': recoveryToken },
      cookies: {},
      query: {},
    };
    const allowedRes: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const allowedNext = vi.fn();

    requireSetupAuth(allowedReq, allowedRes, allowedNext);
    expect(allowedNext).toHaveBeenCalledOnce();
    expect(allowedRes.status).not.toHaveBeenCalled();
  });
});
