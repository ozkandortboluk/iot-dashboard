import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { systemSecretsService } from '../server/services/systemSecrets.service.js';
import { systemKeysService } from '../server/services/systemKeys.service.js';
import { setupService } from '../server/services/setup.service.js';
import { resolvePostgresConnectionString } from '../server/database/connection.js';
import { validateProductionSecurityPolicy } from '../server/utils/startupSecurityPolicy.js';
import { db } from '../server/db.js';

describe('Central Security Vault - Canonical Single Source of Truth Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('1. Database password must be resolved from Central Security Vault as canonical source', async () => {
    const testSecret = 'vault_canonical_db_pass_12345!';
    await systemSecretsService.setSecret('database.password', testSecret, {
      category: 'database',
      label: 'PostgreSQL Password',
      isSensitive: true,
    });

    // Vault has priority
    const resolved = systemSecretsService.getDatabasePassword();
    expect(resolved).toBe(testSecret);
  });

  it('2. JWT secret must be resolved from Central Security Vault as canonical source', async () => {
    const testJwt = 'vault_canonical_jwt_secret_998877665544332211!';
    await systemSecretsService.setSecret('authentication.jwt_secret', testJwt, {
      category: 'authentication',
      label: 'JWT Secret',
      isSensitive: true,
    });

    const resolved = systemSecretsService.getJwtSecret();
    expect(resolved).toBe(testJwt);

    const legacyStatus = systemKeysService.resolveLegacyJwtSecret();
    expect(legacyStatus.source).toBe('vault');
    expect(legacyStatus.value).toBe(testJwt);
  });

  it('3. OTA private key must be resolved from Central Security Vault as canonical source', async () => {
    const testOta = '-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgTestKeyPlaceholder1234567890abcdef\n-----END PRIVATE KEY-----';
    await systemSecretsService.setSecret('ota.signing_key', testOta, {
      category: 'ota',
      label: 'OTA Signing Key',
      isSensitive: true,
    });

    const resolved = systemSecretsService.getOtaSigningKey();
    expect(resolved).toBe(testOta);
  });

  it('4. resolvePostgresConnectionString must inject password from Central Security Vault if missing in connection string', async () => {
    const testDbPass = 'vault_injected_password_2026!';
    await systemSecretsService.setSecret('database.password', testDbPass, {
      category: 'database',
      label: 'PostgreSQL Password',
      isSensitive: true,
    });

    // URL without password (such as stored in db.json)
    const urlWithoutPass = 'postgresql://iot_user@timescaledb:5432/iot_dashboard';
    const resolvedUrl = resolvePostgresConnectionString(urlWithoutPass);

    expect(resolvedUrl).toContain(encodeURIComponent(testDbPass));
    expect(resolvedUrl).toContain('iot_user:');
    expect(resolvedUrl).toContain('@timescaledb:5432/iot_dashboard');
  });

  it('5. saveRuntimeSecretConfig must never store plaintext password in db.json postgresUrl', async () => {
    const secretPass = 'extremely_secret_password_do_not_leak!';
    setupService.saveRuntimeSecretConfig({
      host: 'timescaledb',
      port: 5432,
      database: 'iot_dashboard',
      user: 'iot_user',
      password: secretPass,
      sslMode: 'disable',
    });

    // Check db.data.databaseSettings.postgresUrl in db.json
    const storedUrl = db.data.databaseSettings?.postgresUrl || '';
    expect(storedUrl).not.toContain(secretPass);
    expect(storedUrl).toContain('postgresql://iot_user@timescaledb:5432/iot_dashboard');

    // But Vault must contain the real password
    const vaultPass = systemSecretsService.getDatabasePassword();
    expect(vaultPass).toBe(secretPass);
  });

  it('6. validateProductionSecurityPolicy must accept Vault secrets without requiring .env leakage', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    delete process.env.SESSION_SECRET;
    delete process.env.POSTGRES_PASSWORD;
    delete process.env.DATABASE_URL;
    process.env.NO_SECRET_FILES = 'true';
    process.env.ENCRYPTION_KEY = 'a8f7c6e5d4c3b2a1a8f7c6e5d4c3b2a1a8f7c6e5d4c3b2a1a8f7c6e5d4c3b2a1';

    // Store secure credentials in Vault
    await systemSecretsService.setSecret('database.password', 'StrongUniqueVaultDbPass_2026!', {
      category: 'database',
      label: 'PostgreSQL Password',
      isSensitive: true,
    });
    await systemSecretsService.setSecret('authentication.jwt_secret', 'StrongUniqueVaultJwtSecret_2026!_Min32Chars', {
      category: 'authentication',
      label: 'JWT Secret',
      isSensitive: true,
    });

    const result = validateProductionSecurityPolicy();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('7. Fresh install lifecycle: quickInitDocker must resolve password via canonical resolver and keep .db_config.json free of plaintext passwords', async () => {
    delete process.env.POSTGRES_PASSWORD;
    delete process.env.DB_PASSWORD;

    const freshBootstrapPass = 'FreshInstallPass_998877665544!';
    await systemSecretsService.setSecret('database.password', freshBootstrapPass, {
      category: 'database',
      label: 'PostgreSQL Password',
      isSensitive: true,
      updatedBy: 'bootstrap',
    });

    // Mock testConnection to succeed
    const testConnSpy = vi.spyOn(setupService, 'testConnection').mockResolvedValue({
      success: true,
      message: 'PostgreSQL bağlantısı başarılı.',
      timescaleAvailable: true,
    } as any);

    const initDbSpy = vi.spyOn(setupService, 'initializeDatabase').mockResolvedValue({
      success: true,
      message: 'Initialized',
      migratedTables: ['users', 'devices'],
    } as any);

    // Call quickInitDocker without passing password argument and without process.env.POSTGRES_PASSWORD
    const result = await setupService.quickInitDocker();
    expect(result.success).toBe(true);

    // Verify testConnection received the canonical Vault password
    expect(testConnSpy).toHaveBeenCalledWith(expect.objectContaining({
      host: 'timescaledb',
      user: 'iot_user',
      password: freshBootstrapPass,
    }));

    // Verify .db_config.json on disk contains no plaintext password
    const runtimeConfigPath = path.resolve(process.cwd(), 'data', '.db_config.json');
    if (fs.existsSync(runtimeConfigPath)) {
      const savedConfig = JSON.parse(fs.readFileSync(runtimeConfigPath, 'utf8'));
      expect(savedConfig.password).toBeUndefined();
      expect(savedConfig.passwordRef).toBe('vault:database.password');
      expect(savedConfig.hasPassword).toBe(true);
    }

    testConnSpy.mockRestore();
    initDbSpy.mockRestore();
  });
});
