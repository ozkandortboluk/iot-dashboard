import fs from 'node:fs';
import { systemLogger } from '../services/systemLogger.service.js';
import { systemSecretsService } from '../services/systemSecrets.service.js';
import { masterKeyProvider } from '../services/masterKeyProvider.js';
import { isProductionVpsEnvironment } from '../config/runtimeEnvironment.js';

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
 * Ensures that the high-entropy runtime Vault master encryption key is preserved across restarts
 * in local development runtimes without mutating or regenerating existing keys.
 * In production (NODE_ENV=production or VPS_PRODUCTION=true), secrets MUST NOT be auto-generated.
 */
export function ensureRuntimeSecuritySecrets(): void {
  const isProd = isProductionVpsEnvironment();

  if (isProd) {
    // SEC-13 / RUN-06: Production VPS environments strictly require explicit configuration or mounted Docker secrets.
    return;
  }

  // Delegate strictly to MasterKeyProvider (Single Source of Truth)
  // MasterKeyProvider checks persistent data/.vault_key first and preserves it across restarts!
  masterKeyProvider.getKey();
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
        const candidateSecretPaths = [
          '/run/secrets/postgres_password',
          '/run/secrets/db_password',
          'secrets/postgres_password',
          'secrets/db_password',
        ];
        for (const p of candidateSecretPaths) {
          try {
            if (fs.existsSync(p)) {
              const val = fs.readFileSync(p, 'utf8').trim();
              if (val) {
                candidateDbPass = val;
                break;
              }
            }
          } catch {}
        }
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
  // Active session management uses random opaque tokens hashed with SHA-256 in database/memory.
  // JWT_SECRET is optional. If provided, it must not be a weak or default secret.
  let sessionSecret = (process.env.SESSION_SECRET || process.env.JWT_SECRET || '').trim();
  if (!sessionSecret) {
    try {
      sessionSecret = (systemSecretsService.getJwtSecret() || '').trim();
    } catch {}
  }
  if (!sessionSecret && !process.env.NO_SECRET_FILES) {
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

  if (sessionSecret && (isDefaultSecret(sessionSecret) || sessionSecret.trim().length < 16)) {
    errors.push(
      `[CRITICAL POLICY] Üretim ortamında varsayılan veya güvensiz oturum/JWT anahtarı kullanımı engellenmiştir (SEC-13 / OLD-113).`
    );
  }

  // 3. Vault Encryption Key Validation (Single Production Policy: /run/secrets/encryption_key)
  let encKey = '';
  try {
    if (fs.existsSync('/run/secrets/encryption_key')) {
      encKey = fs.readFileSync('/run/secrets/encryption_key', 'utf8').trim();
    } else if (process.env.VITEST) {
      // In Vitest test harness where /run/secrets/encryption_key is not mounted on the test host
      encKey = (process.env.ENCRYPTION_KEY || '').trim();
    }
  } catch {}

  if (!encKey || encKey.trim() === '') {
    errors.push(
      `[CRITICAL POLICY] Üretim ortamında Vault root encryption key (/run/secrets/encryption_key) bulunamadı (SEC-13 / OLD-115). Uygulama fail-closed olarak durduruldu.`
    );
  } else if (isDefaultSecret(encKey) || (encKey.length !== 64 && encKey.length < 32)) {
    errors.push(
      `[CRITICAL POLICY] Üretim ortamında /run/secrets/encryption_key içindeki root key yetersiz entropiye sahip veya varsayılan değer içeriyor (SEC-13 / OLD-115). 256-bit (64 hex karakter) olmalıdır.`
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
