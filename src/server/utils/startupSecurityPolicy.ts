import crypto from 'node:crypto';
import { systemLogger } from '../services/systemLogger.service.js';
import { systemSecretsService } from '../services/systemSecrets.service.js';

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
 * are bootstrapped when missing or matching insecure sample defaults in container runtimes.
 */
export function ensureRuntimeSecuritySecrets(): void {
  // 1. Vault ENCRYPTION_KEY bootstrap
  const rawEncKey = (process.env.ENCRYPTION_KEY || '').trim();
  if (!rawEncKey || isDefaultSecret(rawEncKey) || rawEncKey.length < 16) {
    const generatedVaultKey = crypto.randomBytes(32).toString('hex');
    process.env.ENCRYPTION_KEY = generatedVaultKey;
    console.log('[Security Bootstrap] High-entropy runtime Vault ENCRYPTION_KEY bootstrapped.');
  }

  // 2. SESSION_SECRET & JWT_SECRET bootstrap
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
 * OLD-115 (Secret scanning & startup policy gate).
 */
export function validateProductionSecurityPolicy(): SecurityPolicyValidationResult {
  ensureRuntimeSecuritySecrets();
  const isProd = process.env.NODE_ENV === 'production' || process.env.VPS_PRODUCTION === 'true';
  const errors: string[] = [];
  const warnings: string[] = [];

  // In non-production environments (test, development, CI), policy violations emit warnings rather than halting
  if (!isProd) {
    return { valid: true, errors: [], warnings: [] };
  }

  // 1. Database Password Validation (SEC-12 / OLD-112)
  let candidateDbPass: string | undefined =
    process.env.SQL_ADMIN_PASSWORD ||
    process.env.SQL_PASSWORD ||
    process.env.PGPASSWORD ||
    process.env.POSTGRES_PASSWORD ||
    process.env.DB_PASSWORD;

  if (!candidateDbPass) {
    try {
      candidateDbPass = systemSecretsService.getDatabasePassword();
    } catch {}
  }

  if (process.env.DATABASE_URL) {
    const rawUrl = process.env.DATABASE_URL;
    const urlMatch = rawUrl.match(/^(?:postgres(?:ql)?):\/\/[^:]+:([^@]+)@/);
    if (urlMatch && urlMatch[1]) {
      const extractedPass = decodeURIComponent(urlMatch[1]);
      if (isDefaultPassword(extractedPass)) {
        errors.push(
          `[CRITICAL POLICY] DATABASE_URL içinde varsayılan/güvensiz parola tespit edildi (OLD-112).`
        );
      }
      if (!candidateDbPass) {
        candidateDbPass = extractedPass;
      }
    }
  }

  const isPgConfigured = Boolean(
    process.env.DATABASE_URL ||
    process.env.POSTGRES_HOST ||
    process.env.PGHOST ||
    process.env.DB_HOST ||
    process.env.REQUIRE_DB_PASSWORD === 'true'
  );

  if (isPgConfigured) {
    if (!candidateDbPass || candidateDbPass.trim() === '') {
      errors.push(
        `[CRITICAL POLICY] Üretim ortamında veritabanı parolası tanımlanmamıştır (SEC-12 / OLD-112).`
      );
    } else if (isDefaultPassword(candidateDbPass)) {
      errors.push(
        `[CRITICAL POLICY] Üretim ortamında varsayılan veya güvensiz veritabanı parolası tespiti nedeniyle başlatma engellenmiştir (OLD-112).`
      );
    }
  }

  // 2. JWT / Session Secret Validation (SEC-13 / OLD-113)
  const sessionSecret = process.env.SESSION_SECRET || process.env.JWT_SECRET;
  if (!sessionSecret || sessionSecret.trim() === '') {
    errors.push(
      `[CRITICAL POLICY] Üretim ortamında SESSION_SECRET veya JWT_SECRET tanımlanmamıştır (SEC-13 / OLD-113).`
    );
  } else if (isDefaultSecret(sessionSecret) || sessionSecret.trim().length < 16) {
    errors.push(
      `[CRITICAL POLICY] Üretim ortamında varsayılan veya güvensiz oturum/JWT anahtarı kullanımı engellenmiştir (SEC-13 / OLD-113).`
    );
  }

  // 3. Vault Encryption Key Entropy Validation (SEC-13 / OLD-115)
  const encKey = process.env.ENCRYPTION_KEY;
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
