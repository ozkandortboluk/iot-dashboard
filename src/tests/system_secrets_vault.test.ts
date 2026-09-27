import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { systemSecretsService } from '../server/services/systemSecrets.service.js';
import { setupService } from '../server/services/setup.service.js';
import { secretsRouter } from '../server/routes/secrets.js';
import { encryptSecret, decryptSecret, maskSecret, isMaskedSecret } from '../server/utils/crypto.js';
import { db } from '../server/db.js';

describe('AES-256-GCM System Secrets Vault & Masking Infrastructure', () => {
  let app: express.Express;
  let adminToken: string;
  let operatorToken: string;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    // Mount secrets router
    app.use('/api/system/secrets', secretsRouter);

    // Create real admin session
    const adminUser = db.data.users.find((u) => u.role === 'admin') || {
      id: 'usr_test_admin',
      name: 'Test Admin',
      email: 'test@nexusnodeiot.com.tr',
      role: 'admin',
      status: 'active',
    };
    adminToken = await db.createSession(adminUser as any);

    // Create real operator user in db.data.users and session
    let opUser = db.data.users.find((u) => u.id === 'usr_vault_test_op');
    if (!opUser) {
      opUser = {
        id: 'usr_vault_test_op',
        name: 'Vault Operator',
        email: 'operator_vault@test.com',
        role: 'operator',
        status: 'active',
        created_at: new Date().toISOString(),
      };
      db.data.users.push(opUser);
    }
    operatorToken = await db.createSession(opUser as any);
  });

  describe('1. At-Rest Encryption & Decryption (AES-256-GCM)', () => {
    it('should encrypt sensitive string to standard enc:v1 format with IV and AuthTag', () => {
      const rawSecret = 'super_secret_pg_pass_9988!';
      const encrypted = encryptSecret(rawSecret);

      expect(encrypted).toMatch(/^enc:v1:[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$/);
      expect(encrypted).not.toContain(rawSecret);

      const decrypted = decryptSecret(encrypted);
      expect(decrypted).toBe(rawSecret);
    });

    it('should return empty string for null, undefined, or empty plaintext', () => {
      expect(encryptSecret('')).toBe('');
      expect(encryptSecret(undefined)).toBe('');
      expect(decryptSecret('')).toBe('');
      expect(decryptSecret(undefined)).toBe('');
    });

    it('should correctly mask secrets with maskSecret without exposing full value', () => {
      expect(maskSecret('short')).toBe('••••••••hort');
      expect(maskSecret('re_1234567890abcdef')).toBe('••••••••cdef');
      expect(maskSecret('')).toBe('');
      expect(maskSecret(undefined)).toBe('');
    });

    it('should correctly identify masked secrets with isMaskedSecret', () => {
      expect(isMaskedSecret('••••••••cdef')).toBe(true);
      expect(isMaskedSecret('••••••••')).toBe(true);
      expect(isMaskedSecret('********')).toBe(true);
      expect(isMaskedSecret('my_real_secret_token_123')).toBe(false);
    });
  });

  describe('2. SystemSecretsService In-Memory & File Vault', () => {
    it('should store database secrets and never return raw password in public state', async () => {
      const realPassword = 'vault_test_password_xyz_456!';
      await systemSecretsService.updateDatabaseSecrets(
        {
          host: 'db.prod.nexusnode.internal',
          port: 5432,
          database: 'prod_iot_vault',
          user: 'vault_admin',
          password: realPassword,
          sslMode: 'require',
        },
        'test_admin'
      );

      // Verify internal backend can read decrypted value for actual connection
      const resolvedPass = systemSecretsService.getDatabasePassword();
      expect(resolvedPass).toBe(realPassword);

      // Verify public summary returned for UI is strictly MASKED
      const publicState = systemSecretsService.getPublicSecretsState();
      expect(publicState.database.host).toBe('db.prod.nexusnode.internal');
      expect(publicState.database.isConfigured).toBe(true);
      expect(publicState.database.hasPassword).toBe(true);
      expect(publicState.database.passwordMasked).toContain('••••••••');
      expect(publicState.database.passwordMasked).not.toBe(realPassword);
      // Ensure raw password does not exist on public summary
      expect((publicState.database as any).password).toBeUndefined();
    });

    it('should store Resend API key and return masked representation in public summary', async () => {
      const realKey = 're_live_token_778899aabbcc';
      await systemSecretsService.updateEmailSecrets(
        {
          provider: 'resend',
          resendApiKey: realKey,
          fromEmail: 'test@nexusnodeiot.com.tr',
        },
        'test_admin'
      );

      expect(systemSecretsService.getResendApiKey()).toBe(realKey);

      const publicState = systemSecretsService.getPublicSecretsState();
      expect(publicState.email.hasResendApiKey).toBe(true);
      expect(publicState.email.resendApiKeyMasked).toContain('••••••••');
      expect(publicState.email.resendApiKeyMasked).not.toBe(realKey);
      expect((publicState.email as any).resendApiKey).toBeUndefined();
    });

    it('should NOT overwrite existing secret if a masked string is submitted during update', async () => {
      const originalSecret = 'permanent_secret_token_112233';
      await systemSecretsService.setSecret('custom.api_token', originalSecret, {
        category: 'custom',
        label: 'Test Token',
      });

      // User submits masked string from UI without changing it
      await systemSecretsService.setSecret('custom.api_token', '••••••••2233', {
        category: 'custom',
        label: 'Test Token',
      });

      // Verify original secret is preserved!
      expect(systemSecretsService.getSecret('custom.api_token')).toBe(originalSecret);
    });

    it('should support extensible custom secrets with add, list, and delete', async () => {
      await systemSecretsService.setCustomSecret(
        {
          key: 'OPENAI_API_KEY',
          label: 'OpenAI GPT-4 Integration',
          category: 'third_party',
          value: 'sk-live-0987654321fedcba',
        },
        'admin_user'
      );

      const state = systemSecretsService.getPublicSecretsState();
      const custom = state.customSecrets.find((c) => c.key === 'openai_api_key');
      expect(custom).toBeDefined();
      expect(custom?.label).toBe('OpenAI GPT-4 Integration');
      expect(custom?.isConfigured).toBe(true);
      expect(custom?.maskedValue).toContain('••••••••');
      expect(custom?.maskedValue).not.toBe('sk-live-0987654321fedcba');

      // Delete custom secret
      const deleted = await systemSecretsService.deleteSecret('openai_api_key');
      expect(deleted).toBe(true);
      expect(systemSecretsService.getSecret('openai_api_key')).toBeNull();
    });

    it('should sanitize log strings replacing secrets and passwords', () => {
      const urlWithPass = 'Connecting to postgresql://iot_user:SuperSecretP@ss123@timescaledb:5432/iot_db';
      const sanitized = systemSecretsService.sanitizeLogString(urlWithPass);
      expect(sanitized).toContain('postgresql://iot_user:••••••••@timescaledb:5432/iot_db');
      expect(sanitized).not.toContain('SuperSecretP@ss123');

      const logWithToken = 'Error calling resend with key re_1234567890abcdef123456';
      const sanitizedToken = systemSecretsService.sanitizeLogString(logWithToken);
      expect(sanitizedToken).toContain('re_••••••••');
      expect(sanitizedToken).not.toContain('re_1234567890abcdef123456');
    });
  });

  describe('3. REST API Authorization & Masking Verification', () => {
    it('should reject unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/system/secrets');
      expect(res.status).toBe(401);
    });

    it('should reject non-admin users with 403', async () => {
      const res = await request(app)
        .get('/api/system/secrets')
        .set('Authorization', `Bearer ${operatorToken}`);
      expect(res.status).toBe(403);
    });

    it('should allow Admin requests with 200 and return fully masked secrets', async () => {
      const res = await request(app)
        .get('/api/system/secrets')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.database).toBeDefined();
      expect(res.body.data.email).toBeDefined();
      expect(res.body.data.notifications).toBeDefined();
      expect(res.body.data.customSecrets).toBeDefined();

      // Ensure no raw passwords anywhere in response JSON string
      const jsonString = JSON.stringify(res.body);
      expect(jsonString).not.toContain('super_secret_pg_pass_9988!');
      expect(jsonString).not.toContain('vault_test_password_xyz_456!');
    });
  });

  describe('4. P0 Security Hardening & Zero-Plaintext Storage Validation', () => {
    it('should never write plaintext password to .db_config.json on disk', () => {
      const dbConfigPath = path.resolve(process.cwd(), 'data', '.db_config.json');

      const testSecretPassword = 'my_super_secret_pg_pass_9988_unique!';
      setupService.saveRuntimeSecretConfig({
        host: '10.0.0.99',
        port: 5432,
        database: 'vault_test_db',
        user: 'vault_test_user',
        password: testSecretPassword,
        sslMode: 'disable',
      });

      expect(fs.existsSync(dbConfigPath)).toBe(true);
      const rawFileContent = fs.readFileSync(dbConfigPath, 'utf8');

      // MUST NOT contain the plaintext password!
      expect(rawFileContent).not.toContain(testSecretPassword);

      const parsed = JSON.parse(rawFileContent);
      expect(parsed.password).toBeUndefined();
      expect(parsed.hasPassword).toBe(true);
      expect(parsed.passwordRef).toBe('vault:database.password');

      // Verify that in-memory runtimeConfig still resolves the password correctly via Vault
      const reloaded = setupService.loadRuntimeSecretConfig();
      expect(reloaded?.password).toBe(testSecretPassword);
    });

    it('should automatically migrate legacy plaintext password from .db_config.json to Vault and scrub disk', () => {
      const dbConfigPath = path.resolve(process.cwd(), 'data', '.db_config.json');

      const legacyPassword = 'legacy_unencrypted_password_to_migrate_123';
      const legacyPayload = {
        host: '10.0.0.100',
        port: 5432,
        database: 'legacy_db',
        user: 'legacy_user',
        password: legacyPassword, // Legacy plaintext on disk!
        sslMode: 'disable',
      };
      fs.writeFileSync(dbConfigPath, JSON.stringify(legacyPayload, null, 2), { mode: 0o600 });

      // Run loadRuntimeSecretConfig which triggers legacy migration
      const reloaded = setupService.loadRuntimeSecretConfig();
      expect(reloaded?.password).toBe(legacyPassword);

      // Verify disk file was scrubbed of plaintext password!
      const diskContent = fs.readFileSync(dbConfigPath, 'utf8');
      expect(diskContent).not.toContain(legacyPassword);
      const scrubbedJson = JSON.parse(diskContent);
      expect(scrubbedJson.password).toBeUndefined();
      expect(scrubbedJson.hasPassword).toBe(true);
    });

    it('should reject unencrypted plaintext secret in production unless allowLegacyPlaintext is set', () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';

        const plaintextVal = 'unencrypted_api_token_12345';
        // Without allowLegacyPlaintext, decryptSecret must reject plaintext in production
        const rejected = decryptSecret(plaintextVal);
        expect(rejected).toBe('');

        // With allowLegacyPlaintext explicitly enabled during migration, it allows reading for re-encryption
        const migrated = decryptSecret(plaintextVal, { allowLegacyPlaintext: true, context: 'test_migration' });
        expect(migrated).toBe(plaintextVal);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });
});
