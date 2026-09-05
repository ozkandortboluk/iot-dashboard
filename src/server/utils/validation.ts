// Server-Side Input Validation & Security Sanitization Utilities
import type { User } from '../../types.js';

// Common weak / easily guessable / leaked passwords blacklist
const COMMON_WEAK_PASSWORDS = new Set([
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password123',
  'admin',
  'admin123',
  'admin2024',
  'admin2025',
  'admin2026',
  'root',
  'qwerty',
  'qwerty123',
  'letmein',
  'welcome',
  'welcome123',
  'pass1234',
  '111111',
  '000000',
  'nexus123',
  'iloveyou',
  'master',
]);

const ALLOWED_ROLES: User['role'][] = ['admin', 'customer', 'operator', 'analyst'];

/**
 * Normalizes email by trimming and converting to lowercase
 */
export function normalizeEmail(email: unknown): string {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Validates email format according to standard RFC 5322 pattern
 */
export function validateEmail(email: unknown): { valid: boolean; error?: string; normalized: string } {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return { valid: false, error: 'E-posta adresi boş bırakılamaz.', normalized: '' };
  }

  if (normalized.length > 128) {
    return { valid: false, error: 'E-posta adresi en fazla 128 karakter olabilir.', normalized };
  }

  // RFC 5322 compliant regex for robust email validation
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(normalized)) {
    return { valid: false, error: 'Geçerli bir e-posta adresi giriniz (örn: kullanici@alanadi.com).', normalized };
  }

  return { valid: true, normalized };
}

/**
 * Validates password complexity, length, and against common password blacklists
 */
export function validatePassword(password: unknown): { valid: boolean; error?: string } {
  if (typeof password !== 'string' || !password) {
    return { valid: false, error: 'Şifre alanı zorunludur.' };
  }

  const trimmed = password.trim();

  // Minimum length check (8 characters minimum for security)
  if (trimmed.length < 8) {
    return { valid: false, error: 'Şifreniz en az 8 karakter uzunluğunda olmalıdır.' };
  }

  if (trimmed.length > 128) {
    return { valid: false, error: 'Şifreniz en fazla 128 karakter olabilir.' };
  }

  // Common weak passwords check
  if (COMMON_WEAK_PASSWORDS.has(trimmed.toLowerCase())) {
    return { valid: false, error: 'Bu şifre çok yaygın ve tahmin edilmesi kolaydır. Lütfen daha güçlü bir şifre belirleyin.' };
  }

  // Must contain at least one letter and at least one number or special symbol
  const hasLetter = /[a-zA-Z]/.test(trimmed);
  const hasDigitOrSymbol = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(trimmed);

  if (!hasLetter || !hasDigitOrSymbol) {
    return {
      valid: false,
      error: 'Şifreniz en az bir harf ve en az bir rakam veya özel karakter içermelidir.',
    };
  }

  return { valid: true };
}

/**
 * Sanitizes plain text input (names, company names, etc.)
 */
export function sanitizeText(text: unknown, maxLength = 100): string {
  if (typeof text !== 'string') return '';
  return text.trim().slice(0, maxLength);
}

/**
 * Validates role assignment
 */
export function validateRole(role: unknown, fallback: User['role'] = 'customer'): User['role'] {
  if (typeof role === 'string' && ALLOWED_ROLES.includes(role as User['role'])) {
    return role as User['role'];
  }
  return fallback;
}

/**
 * Validates and sanitizes first-time setup input
 */
export function validateSetupInput(body: any): {
  valid: boolean;
  error?: string;
  data?: {
    name: string;
    email: string;
    password: string;
    companyName: string;
    seedDemoData: boolean;
  };
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Geçersiz istek gövdesi.' };
  }

  const name = sanitizeText(body.name, 80);
  if (!name || name.length < 2) {
    return { valid: false, error: 'Yönetici adı ve soyadı en az 2 karakter olmalıdır.' };
  }

  const emailRes = validateEmail(body.email);
  if (!emailRes.valid) {
    return { valid: false, error: emailRes.error };
  }

  const passRes = validatePassword(body.password);
  if (!passRes.valid) {
    return { valid: false, error: passRes.error };
  }

  const companyName = sanitizeText(body.companyName || 'Merkez Yönetim', 100);
  const seedDemoData = Boolean(body.seedDemoData);

  return {
    valid: true,
    data: {
      name,
      email: emailRes.normalized,
      password: String(body.password).trim(),
      companyName,
      seedDemoData,
    },
  };
}

/**
 * Validates and sanitizes registration input
 */
export function validateRegistrationInput(body: any): {
  valid: boolean;
  error?: string;
  data?: {
    name: string;
    email: string;
    password: string;
    role: User['role'];
    companyName?: string;
  };
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Geçersiz istek gövdesi.' };
  }

  const name = sanitizeText(body.name, 80);
  if (!name || name.length < 2) {
    return { valid: false, error: 'Ad ve soyad alanı en az 2 karakter olmalıdır.' };
  }

  const emailRes = validateEmail(body.email);
  if (!emailRes.valid) {
    return { valid: false, error: emailRes.error };
  }

  const passRes = validatePassword(body.password);
  if (!passRes.valid) {
    return { valid: false, error: passRes.error };
  }

  const companyName = body.companyName ? sanitizeText(body.companyName, 100) : undefined;

  return {
    valid: true,
    data: {
      name,
      email: emailRes.normalized,
      password: String(body.password).trim(),
      role: 'customer', // Public registration is ALWAYS forced to customer
      companyName,
    },
  };
}
