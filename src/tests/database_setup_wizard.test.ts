import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { setupService, SetupService, type DatabaseConfigPayload } from '../server/services/setup.service.js';
import { db } from '../server/db.js';

describe('First Run Database Setup Wizard Service & Security', () => {
  const testSecretPath = path.resolve(process.cwd(), 'data', '.db_config.json');

  beforeEach(() => {
    // Clean up test runtime secret file if exists
    try {
      if (fs.existsSync(testSecretPath)) {
        fs.unlinkSync(testSecretPath);
      }
    } catch {}
  });

  afterEach(() => {
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
});
