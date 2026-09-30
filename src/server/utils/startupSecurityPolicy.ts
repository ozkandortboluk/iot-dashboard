import fs from 'node:fs';
import crypto from 'node:crypto';
import { systemLogger } from '../services/systemLogger.service.js';
import { systemSecretsService } from '../services/systemSecrets.service.js';
import { resetEncryptionKeyCache, resolveEncryptionKey } from './crypto.js';

/**
 * Common default, weak, or sample passwords that MUST be strictly blocked in production.
 */
export const INSECURE_DEFAULT_PASSWORDS = new Set([
  'postgres',
  'password',
  'admin',
  'root',
  '123456',
  '12345678',
  'test1234',
  'admin1234',
  'postgres123',
  'timescale',
  'secret',
  'changeme',
  'qwerty',
  'toor',
  'guest',
  'GUCLU_VERITABANI_PAROLANIZ',
  'GUCLU_PAROLANIZ_BURAYA',
  'GUCLU_ADMIN_PAROLASI',
]);

/**
 * Known sample, test, or default secret keys that MUST NOT be used in production.
 */
export const INSECURE_DEFAULT_SECRETS = new Set([
  'secret',
  'jwt_secret',
  'session_secret',
  'nexus_secret',
  '12345678901234567890123456789012',
  'your-secret-key',
  'default-secret',
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
]);

/**
 * Checks if a candidate password matches known default/insecure sample passwords.
 */
export function isDefaultPassword(password?: string | null): boolean {
  if (!password) return true;
  const normalized = password.trim().toLowerCase();
  return INSECURE_DEFAULT_PASSWORDS.has(normalized) || INSECURE_DEFAULT_PASSWORDS.has(password.trim());
}

/**
 * Checks if a candidate secret matches known default/insecure sample secrets.
 */
export function isDefaultSecret(secret?: string | null): boolean {
  if (!secret) return false;
  const normalized = secret.trim().toLowerCase();
  return INSECURE_DEFAULT_SECRETS.has(normalized) || INSECURE_DEFAULT_SECRETS.has(secret.trim());
}

export interface SecurityPolicyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Ensures that high-entropy runtime security secrets (ENCRYPTION_KEY, JWT_SECRET, SESSION_SECRET)
 * are bootstrapped when missing or matching insecure sample defaults in local development runtimes only.
 * In production (NODE_ENV=production or VPS_PRODUCTION=true), secrets MUST NOT be auto-generated or modified.
 */
export function ensureRuntimeSecuritySecrets(): void {
  const isVpsProd = process.env.VPS_PRODUCTION === 'true';
  const isCloudRunSandbox = Boolean(process.env.K_SERVICE || process.env.K_REVISION || process.env.CLOUD_RUN_TIMEOUT_SECONDS) && !isVpsProd;
  const isProd = (process.env.NODE_ENV === 'production' || isVpsProd) && !isCloudRunSandbox;

  if (isProd) {
    // SEC-13 / RUN-06: Production VPS environments strictly require explicit configuration or mounted Docker secrets.
    return;
  }

  // 1. Vault ENCRYPTION_KEY bootstrap (Development, Test, and Cloud Run preview sandbox)
  const rawEncKey = (process.env.ENCRYPTION_KEY || '').trim();
  if (!rawEncKey || isDefaultSecret(rawEncKey) || rawEncKey.length < 16) {
    const generatedVaultKey = crypto.randomBytes(32).toString('hex');
    process.env.ENCRYPTION_KEY = generatedVaultKey;
    resetEncryptionKeyCache();
    console.log('[Security Bootstrap] High-entropy runtime Vault ENCRYPTION_KEY bootstrapped.');
  }

  // 2. SESSION_SECRET & JWT_SECRET bootstrap (Development, Test, and Cloud Run preview sandbox)
  const rawJwt = (process.env.JWT_SECRET || process.env.SESSION_SECRET || '').trim();
  if (!rawJwt || isDefaultSecret(rawJwt) || rawJwt.length < 16) {
    const generatedJwtSecret = crypto.randomBytes(32).toString('hex');
    process.env.JWT_SECRET = generatedJwtSecret;
    process.env.SESSION_SECRET = generatedJwtSecret;
    console.log('[Security Bootstrap] High-entropy runtime SESSION_SECRET & JWT_SECRET bootstrapped.');
  }
}

/**
 * Validates the startup security posture of the platform.
 * Enforces OLD-112 (No default DB password in production),
 * OLD-113 (No default JWT/session secrets in production), and
 * OLD-115 / SEC-13 (Secret scanning & startup policy gate).
 */
export function validateProductionSecurityPolicy(): SecurityPolicyValidationResult {
  const isProd = process.env.NODE_ENV === 'production' || process.env.VPS_PRODUCTION === 'true';
  const errors: string[] = [];
  const warnings: string[] = [];

  // In non-production environments (test, development, CI), policy violations emit warnings rather than halting
  if (!isProd) {
    return { valid: true, errors: [], warnings: [] };
  }

  // 1. Database Password Validation (SEC-12 / OLD-112)
  // Single-source precedence matching getEffectivePostgresUrl() in connection.ts
  const envUrl = (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRESQL_URL ||
    process.env.PG_URL ||
    ''
  ).trim();

  const envHost = (
    process.env.SQL_HOST ||
    process.env.PGHOST ||
    process.env.POSTGRES_HOST ||
    process.env.DB_HOST ||
    ''
  ).trim();

  let candidateDbPass: string | undefined;
  let isPgConfigured = false;

  if (envUrl && (envUrl.startsWith('postgres://') || envUrl.startsWith('postgresql://')) && !envUrl.includes('••••••••')) {
    // 1. Connection string URL takes absolute precedence.
    // Unrelated POSTGRES_PASSWORD in environment MUST NOT mask an omitted or empty password in DATABASE_URL!
    isPgConfigured = true;
    const urlMatch = envUrl.match(/^(?:postgres(?:ql)?):\/\/[^:]*(?::([^@]*))?@/);
    if (urlMatch && urlMatch[1]) {
      candidateDbPass = decodeURIComponent(urlMatch[1]);
    } else {
      candidateDbPass = ''; // Explicitly empty password inside URL
    }
  } else {
    // 2. Structured environment or direct database password configured
    const structuredPass =
      process.env.SQL_ADMIN_PASSWORD ||
      process.env.SQL_PASSWORD ||
      process.env.PGPASSWORD ||
      process.env.POSTGRES_PASSWORD ||
      process.env.DB_PASSWORD;

    if (envHost || structuredPass !== undefined) {
      isPgConfigured = true;
      candidateDbPass = structuredPass;

      if (!candidateDbPass) {
        try {
          candidateDbPass = systemSecretsService.getDatabasePassword();
        } catch {}
      }

      if (!candidateDbPass && !process.env.NO_SECRET_FILES) {
        const dockerSecretPath = '/run/secrets/db_password';
        const appSecretPath = 'secrets/db_password';
        try {
          if (fs.existsSync(dockerSecretPath)) {
            candidateDbPass = fs.readFileSync(dockerSecretPath, 'utf8').trim();
          } else if (fs.existsSync(appSecretPath)) {
            candidateDbPass = fs.readFileSync(appSecretPath, 'utf8').trim();
          }
        } catch {}
      }
    } else {
      // 3. Check runtime secret store or vault
      try {
        const vaultDb = systemSecretsService.getDatabaseConfig();
        if (vaultDb.isConfigured && vaultDb.host) {
          isPgConfigured = true;
          candidateDbPass = vaultDb.password;
        }
      } catch {}

      if (process.env.REQUIRE_DB_PASSWORD === 'true') {
        isPgConfigured = true;
      }
    }
  }

  if (isPgConfigured) {
    if (!candidateDbPass || candidateDbPass.trim() === '') {
      errors.push(
        `[CRITICAL POLICY] Üretim ortamında veritabanı parolası tanımlanmamıştır (SEC-12 / OLD-112).`
      );
    } else if (
      isDefaultPassword(candidateDbPass) ||
      (process.env.POSTGRES_PASSWORD && isDefaultPassword(process.env.POSTGRES_PASSWORD)) ||
      (process.env.SQL_PASSWORD && isDefaultPassword(process.env.SQL_PASSWORD)) ||
      (process.env.PGPASSWORD && isDefaultPassword(process.env.PGPASSWORD))
    ) {
      errors.push(
        `[CRITICAL POLICY] Üretim ortamında varsayılan veya güvensiz veritabanı parolası tespiti nedeniyle başlatma engellenmiştir (OLD-112).`
      );
    }
  }

  // 2. JWT / Session Secret Validation (SEC-13 / OLD-113)
  let sessionSecret = (process.env.SESSION_SECRET || process.env.JWT_SECRET || '').trim();
  if (!sessionSecret && !process.env.NO_SECRET_FILES) {
    // Check mounted Docker secrets or dedicated app secrets
    try {
      if (fs.existsSync('/run/secrets/jwt_secret')) {
        sessionSecret = fs.readFileSync('/run/secrets/jwt_secret', 'utf8').trim();
      } else if (fs.existsSync('secrets/jwt_secret')) {
        sessionSecret = fs.readFileSync('secrets/jwt_secret', 'utf8').trim();
      } else if (fs.existsSync('/run/secrets/session_secret')) {
        sessionSecret = fs.readFileSync('/run/secrets/session_secret', 'utf8').trim();
      } else if (fs.existsSync('secrets/session_secret')) {
        sessionSecret = fs.readFileSync('secrets/session_secret', 'utf8').trim();
      }
    } catch {}
  }

  if (!sessionSecret || sessionSecret.trim() === '') {
    errors.push(
      `[CRITICAL POLICY] Üretim ortamında SESSION_SECRET veya JWT_SECRET tanımlanmamıştır (SEC-13 / OLD-113). .env dosyanıza JWT_SECRET ekleyin veya Docker secrets kullanın.`
    );
  } else if (isDefaultSecret(sessionSecret) || sessionSecret.trim().length < 16) {
    errors.push(
      `[CRITICAL POLICY] Üretim ortamında varsayılan veya güvensiz oturum/JWT anahtarı kullanımı engellenmiştir (SEC-13 / OLD-113).`
    );
  }

  // 3. Vault Encryption Key Entropy Validation (SEC-13 / OLD-115)
  let encKey = (process.env.ENCRYPTION_KEY || '').trim();
  if (!encKey && !process.env.NO_SECRET_FILES) {
    const keyPath = process.env.ENCRYPTION_KEY_PATH || process.env.ENCRYPTION_KEY_FILE;
    try {
      if (keyPath && fs.existsSync(keyPath)) {
        encKey = fs.readFileSync(keyPath, 'utf8').trim();
      } else if (fs.existsSync('/run/secrets/encryption_key')) {
        encKey = fs.readFileSync('/run/secrets/encryption_key', 'utf8').trim();
      } else if (fs.existsSync('secrets/encryption_key')) {
        encKey = fs.readFileSync('secrets/encryption_key', 'utf8').trim();
      }
    } catch {}
  }

  if (!encKey || encKey.trim() === '') {
    errors.push(
      `[CRITICAL POLICY] Üretim ortamında ENCRYPTION_KEY (Vault şifreleme anahtarı) tanımlanmamıştır (SEC-13 / OLD-115).`
    );
  } else if (isDefaultSecret(encKey) || encKey.trim().length < 16) {
    errors.push(
      `[CRITICAL POLICY] Üretim ortamında varsayılan/örnek Vault şifreleme anahtarı (ENCRYPTION_KEY) kullanımı engellenmiştir (SEC-13 / OLD-115).`
    );
  }

  const isValid = errors.length === 0;

  if (!isValid) {
    for (const err of errors) {
      console.error(err);
      systemLogger.critical('security', err);
    }
  }

  return {
    valid: isValid,
    errors,
    warnings,
  };
}
