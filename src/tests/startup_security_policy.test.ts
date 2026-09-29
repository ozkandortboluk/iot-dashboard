import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  validateProductionSecurityPolicy,
  isDefaultPassword,
  isDefaultSecret,
} from '../server/utils/startupSecurityPolicy.js';

describe('OLD-112 & OLD-115: Startup Security Policy & Secret Protection', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('1. Correctly identifies default vs strong passwords', () => {
    expect(isDefaultPassword('postgres')).toBe(true);
    expect(isDefaultPassword('password')).toBe(true);
    expect(isDefaultPassword('admin1234')).toBe(true);
    expect(isDefaultPassword('GUCLU_VERITABANI_PAROLANIZ')).toBe(true);
    expect(isDefaultPassword('K3p!9$mX_zL7#vQ2Wp1')).toBe(false);
  });

  it('2. Correctly identifies default vs strong secrets', () => {
    expect(isDefaultSecret('secret')).toBe(true);
    expect(isDefaultSecret('jwt_secret')).toBe(true);
    expect(isDefaultSecret('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')).toBe(true);
    expect(isDefaultSecret('f8c9b2a1e4d3c5b6a7890123456789abcdef0123456789abcdef0123456789a')).toBe(false);
  });

  it('3. Rejects startup in production when default DB password is set (OLD-112)', () => {
    process.env.NODE_ENV = 'production';
    process.env.POSTGRES_PASSWORD = 'postgres';
    process.env.ENCRYPTION_KEY = 'a8f7c6e5d4c3b2a1a8f7c6e5d4c3b2a1a8f7c6e5d4c3b2a1a8f7c6e5d4c3b2a1';

    const result = validateProductionSecurityPolicy();
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // Ensure raw password is NOT leaked in error text
    const errorText = result.errors.join(' ');
    expect(errorText).not.toContain('postgres');
    expect(errorText).toContain('OLD-112');
  });

  it('4. Rejects startup in production when default JWT secret is set (OLD-113)', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'jwt_secret';
    process.env.POSTGRES_PASSWORD = 'SuperSecureProductionPass_2026!';
    process.env.ENCRYPTION_KEY = 'a8f7c6e5d4c3b2a1a8f7c6e5d4c3b2a1a8f7c6e5d4c3b2a1a8f7c6e5d4c3b2a1';

    const result = validateProductionSecurityPolicy();
    expect(result.valid).toBe(false);
    const errorText = result.errors.join(' ');
    expect(errorText).not.toContain('jwt_secret');
    expect(errorText).toContain('OLD-113');
  });

  it('5. Rejects startup in production when default ENCRYPTION_KEY is used (OLD-115)', () => {
    process.env.NODE_ENV = 'production';
    process.env.POSTGRES_PASSWORD = 'SuperSecureProductionPass_2026!';
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    const result = validateProductionSecurityPolicy();
    expect(result.valid).toBe(false);
    const errorText = result.errors.join(' ');
    expect(errorText).toContain('OLD-115');
  });

  it('6. Passes startup in production when all secrets are strong', () => {
    process.env.NODE_ENV = 'production';
    process.env.POSTGRES_PASSWORD = 'StrongUniquePass_987654321!';
    process.env.JWT_SECRET = 'StrongUniqueJwtSecret_1234567890!';
    process.env.ENCRYPTION_KEY = 'e8f7c6e5d4c3b2a1a8f7c6e5d4c3b2a1a8f7c6e5d4c3b2a1a8f7c6e5d4c3b2a1';

    const result = validateProductionSecurityPolicy();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('7. Rejects startup in production when DB password is missing (SEC-12)', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.POSTGRES_PASSWORD;
    delete process.env.SQL_ADMIN_PASSWORD;
    delete process.env.SQL_PASSWORD;
    delete process.env.PGPASSWORD;
    delete process.env.DB_PASSWORD;
    process.env.DATABASE_URL = 'postgresql://iot_user@localhost:5432/iot_db';
    process.env.JWT_SECRET = 'StrongUniqueJwtSecret_1234567890!';
    process.env.ENCRYPTION_KEY = 'e8f7c6e5d4c3b2a1a8f7c6e5d4c3b2a1a8f7c6e5d4c3b2a1a8f7c6e5d4c3b2a1';

    const result = validateProductionSecurityPolicy();
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('SEC-12');
  });

  it('8. Rejects startup in production when JWT secret is missing or too short (SEC-13)', () => {
    process.env.NODE_ENV = 'production';
    process.env.POSTGRES_PASSWORD = 'StrongUniquePass_987654321!';
    delete process.env.JWT_SECRET;
    delete process.env.SESSION_SECRET;
    process.env.ENCRYPTION_KEY = 'e8f7c6e5d4c3b2a1a8f7c6e5d4c3b2a1a8f7c6e5d4c3b2a1a8f7c6e5d4c3b2a1';

    const result = validateProductionSecurityPolicy();
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('SEC-13');

    // Too short (< 16 chars)
    process.env.JWT_SECRET = 'short_secret';
    const shortResult = validateProductionSecurityPolicy();
    expect(shortResult.valid).toBe(false);
    expect(shortResult.errors.join(' ')).toContain('SEC-13');
  });

  it('9. Rejects startup in production when ENCRYPTION_KEY is missing or too short (SEC-13)', () => {
    process.env.NODE_ENV = 'production';
    process.env.POSTGRES_PASSWORD = 'StrongUniquePass_987654321!';
    process.env.JWT_SECRET = 'StrongUniqueJwtSecret_1234567890!';
    delete process.env.ENCRYPTION_KEY;

    const result = validateProductionSecurityPolicy();
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('SEC-13');
  });

  it('10. Ensures former bypass envs fail to bypass security policy checks (SEC-13)', () => {
    process.env.NODE_ENV = 'production';
    process.env.POSTGRES_PASSWORD = 'postgres'; // weak
    process.env.JWT_SECRET = 'jwt_secret'; // weak
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // default
    process.env.BYPASS_SECURITY_POLICY = 'true';
    process.env.ALLOW_INSECURE_SECRETS = 'true';
    process.env.SKIP_SECURITY_CHECK = 'true';

    const result = validateProductionSecurityPolicy();
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
