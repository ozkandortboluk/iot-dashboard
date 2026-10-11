import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { systemSecretsService } from '../server/services/systemSecrets.service.js';
import { systemKeysService } from '../server/services/systemKeys.service.js';
import { setupService } from '../server/services/setup.service.js';
import { resolvePostgresConnectionString } from '../server/database/connection.js';
import { validateProductionSecurityPolicy } from '../server/utils/startupSecurityPolicy.js';
import { resetKeyCacheForTesting } from '../server/utils/crypto.js';
import { db } from '../server/db.js';

describe('Central Security Vault - Canonical Single Source of Truth Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.ENCRYPTION_KEY = 'a8f7c6e5d4c3b2a1a8f7c6e5d4c3b2a1a8f7c6e5d4c3b2a1a8f7c6e5d4c3b2a1';
    resetKeyCacheForTesting();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetKeyCacheForTesting();
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
    // Populate the fixture Vault in test mode; production intentionally forbids env-only master keys.
    process.env.NODE_ENV = 'test';
    delete process.env.JWT_SECRET;
    delete process.env.SESSION_SECRET;
    delete process.env.POSTGRES_PASSWORD;
    delete process.env.DATABASE_URL;
    process.env.NO_SECRET_FILES = 'true';
    // Explicitly mark the Vitest harness so the production policy can read
    // the fixture encryption key without a Docker /run/secrets mount.
    process.env.VITEST = 'true';
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

    // Simulate a mounted Docker secret, without relaxing production key resolution.
    const realExistsSync = fs.existsSync.bind(fs);
    const realReadFileSync = fs.readFileSync.bind(fs);
    vi.spyOn(fs, 'existsSync').mockImplementation((p: any) =>
      p === '/run/secrets/encryption_key' ? true : realExistsSync(p)
    );
    vi.spyOn(fs, 'readFileSync').mockImplementation(((p: any, ...args: any[]) =>
      p === '/run/secrets/encryption_key' ? process.env.ENCRYPTION_KEY! : (realReadFileSync as any)(p, ...args)
    ) as typeof fs.readFileSync);
    process.env.NODE_ENV = 'production';
    resetKeyCacheForTesting();
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
    const runtimeConfigPath = path.join(process.env.NEXUS_TEST_DATA_DIR!, '.db_config.json');
    if (fs.existsSync(runtimeConfigPath)) {
      const savedConfig = JSON.parse(fs.readFileSync(runtimeConfigPath, 'utf8'));
      expect(savedConfig.password).toBeUndefined();
      expect(savedConfig.passwordRef).toBe('vault:database.password');
      expect(savedConfig.hasPassword).toBe(true);
    }

    testConnSpy.mockRestore();
    initDbSpy.mockRestore();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  it('8. Production mode: Vault password overrides conflicting passwords in env vars and customUrl', async () => {
    process.env.NODE_ENV = 'production';
    process.env.VPS_PRODUCTION = 'true';
    process.env.POSTGRES_PASSWORD = 'insecure_env_password_should_be_ignored';
    process.env.DB_PASSWORD = 'insecure_db_password_should_be_ignored';
    process.env.DATABASE_URL = 'postgresql://iot_user:env_url_password@timescaledb:5432/iot_dashboard';

    const vaultCanonicalPassword = 'CanonicalVaultPass_StrictProd_9988!';
    const getPassSpy = vi.spyOn(systemSecretsService, 'getDatabasePassword').mockReturnValue(vaultCanonicalPassword);

    // Case A: Resolving with DATABASE_URL env var
    const resolvedFromEnv = resolvePostgresConnectionString();
    expect(resolvedFromEnv).toContain(encodeURIComponent(vaultCanonicalPassword));
    expect(resolvedFromEnv).not.toContain('insecure_env_password_should_be_ignored');
    expect(resolvedFromEnv).not.toContain('env_url_password');

    // Case B: Resolving with explicit customUrl containing a conflicting password
    const customUrl = 'postgresql://admin:conflicting_url_pass@timescaledb:5432/iot_dashboard';
    const resolvedFromCustom = resolvePostgresConnectionString(customUrl);
    expect(resolvedFromCustom).toContain(encodeURIComponent(vaultCanonicalPassword));
    expect(resolvedFromCustom).not.toContain('conflicting_url_pass');

    getPassSpy.mockRestore();
  });

  it('9. Production mode fail-closed: returns empty string when Vault DB password is missing, refusing plaintext env fallback', async () => {
    process.env.NODE_ENV = 'production';
    process.env.VPS_PRODUCTION = 'true';
    process.env.POSTGRES_PASSWORD = 'plaintext_env_fallback_pass';
    process.env.DB_PASSWORD = 'plaintext_env_fallback_pass';
    process.env.DATABASE_URL = 'postgresql://iot_user:plaintext_url_pass@timescaledb:5432/iot_dashboard';
    process.env.SQL_HOST = 'timescaledb';

    // Mock getDatabasePassword to return empty string
    const getPassSpy = vi.spyOn(systemSecretsService, 'getDatabasePassword').mockReturnValue('');

    const resolved = resolvePostgresConnectionString();
    expect(resolved).toBe('');

    const resolvedCustom = resolvePostgresConnectionString('postgresql://iot_user:plaintext_url_pass@timescaledb:5432/iot_dashboard');
    expect(resolvedCustom).toBe('');

    getPassSpy.mockRestore();
  });

  it('10. Development mode: preserves environment and URL password fallbacks when Vault password is empty', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.VPS_PRODUCTION;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRESQL_URL;
    delete process.env.PG_URL;
    process.env.SQL_HOST = '127.0.0.1';
    process.env.SQL_ADMIN_PASSWORD = 'dev_env_password_123';

    // Mock getDatabasePassword to return empty
    const getPassSpy = vi.spyOn(systemSecretsService, 'getDatabasePassword').mockReturnValue('');
    const getCfgSpy = vi.spyOn(systemSecretsService, 'getDatabaseConfig').mockReturnValue({
      host: '',
      port: 5432,
      database: '',
      user: '',
      password: '',
      sslMode: 'disable',
      isConfigured: false,
    });

    const customUrl = 'postgresql://postgres:dev_explicit_pass@127.0.0.1:5432/iot_dashboard';
    const resolvedCustom = resolvePostgresConnectionString(customUrl);
    expect(resolvedCustom).toContain('dev_explicit_pass');

    const resolvedEnv = resolvePostgresConnectionString();
    expect(resolvedEnv).toContain('dev_env_password_123');

    getPassSpy.mockRestore();
    getCfgSpy.mockRestore();
  });
});
