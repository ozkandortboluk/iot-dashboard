import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeEmail,
  validateEmail,
  validatePassword,
  validateSetupInput,
  validateRegistrationInput,
} from './utils/validation.js';
import { UserRepository } from './repositories/user.repository.js';
import type { User } from '../types.js';

describe('Authentication & Validation Security Tests', () => {
  describe('Email Normalization & RFC 5322 Validation', () => {
    it('should normalize emails by trimming whitespace and converting to lowercase', () => {
      expect(normalizeEmail('  Admin@NexusIoT.Com  ')).toBe('admin@nexusiot.com');
      expect(normalizeEmail('USER.TEST+label@DOMAIN.CO.UK')).toBe('user.test+label@domain.co.uk');
    });

    it('should validate standard RFC 5322 email formats', () => {
      expect(validateEmail('admin@nexus.io').valid).toBe(true);
      expect(validateEmail('user.name+tag@sub.domain.org').valid).toBe(true);
      expect(validateEmail('').valid).toBe(false);
      expect(validateEmail('invalid-email').valid).toBe(false);
      expect(validateEmail('missing-domain@').valid).toBe(false);
      expect(validateEmail('@missing-username.com').valid).toBe(false);
    });
  });

  describe('Password Policy & Strength Enforcement', () => {
    it('should reject passwords shorter than 8 characters', () => {
      const res = validatePassword('Pass1!');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('en az 8 karakter');
    });

    it('should reject common weak and leaked passwords', () => {
      expect(validatePassword('12345678').valid).toBe(false);
      expect(validatePassword('password123').valid).toBe(false);
      expect(validatePassword('admin123').valid).toBe(false);
      expect(validatePassword('qwerty123').valid).toBe(false);
      expect(validatePassword('welcome123').valid).toBe(false);
    });

    it('should require a mix of letters and numbers/symbols', () => {
      expect(validatePassword('allletterspassword').valid).toBe(false);
      expect(validatePassword('123456789012').valid).toBe(false);
      expect(validatePassword('SecurePass2025!').valid).toBe(true);
      expect(validatePassword('Complex#IoT99').valid).toBe(true);
    });
  });

  describe('Input Schemas (Setup & Registration)', () => {
    it('should validate and sanitize setup input data', () => {
      const validBody = {
        name: '  Sistem Yöneticisi  ',
        email: ' ADMIN@EXAMPLE.COM ',
        password: 'AdminPassword2026!',
        companyName: ' Nexus HQ ',
        seedDemoData: true,
      };
      const result = validateSetupInput(validBody);
      expect(result.valid).toBe(true);
      expect(result.data?.name).toBe('Sistem Yöneticisi');
      expect(result.data?.email).toBe('admin@example.com');
      expect(result.data?.seedDemoData).toBe(true);
    });

    it('should reject invalid setup input with weak password', () => {
      const invalidBody = {
        name: 'Admin',
        email: 'admin@example.com',
        password: '123',
      };
      const result = validateSetupInput(invalidBody);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should always force customer role on public registration', () => {
      const regBody = {
        name: 'Yeni Müşteri',
        email: 'musteri@sirket.com',
        password: 'CustomerPass2026!',
        role: 'admin', // Attempted role escalation
      };
      const result = validateRegistrationInput(regBody);
      expect(result.valid).toBe(true);
      expect(result.data?.role).toBe('customer'); // Must be clamped to customer
    });
  });

  describe('UserRepository Session Lifecycle & Server-Side Revocation', () => {
    let mockDb: any;
    let userRepo: UserRepository;

    beforeEach(() => {
      mockDb = {
        data: {
          users: [] as User[],
          passwords: {} as Record<string, string>,
          dashboards: [],
          sessions: [],
          auditLogs: [],
        },
        postgresRepo: {
          saveUser: async () => {},
          saveDashboard: async () => {},
          saveAuditLog: async () => {},
          saveSession: async () => {},
          deleteSession: async () => {},
          deleteUserSessions: async () => {},
        },
        saveData: () => {},
        addAuditLog: () => {},
      };
      userRepo = new UserRepository(mockDb);
    });

    it('should create and verify user sessions with 30-day expiration', () => {
      const user: User = {
        id: 'usr_test_1',
        name: 'Test User',
        email: 'test@example.com',
        role: 'customer',
        created_at: new Date().toISOString(),
      };
      mockDb.data.users.push(user);

      const token = userRepo.createSession(user);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(20);

      const verified = userRepo.verifySession(token);
      expect(verified).not.toBeNull();
      expect(verified?.user.id).toBe(user.id);
      expect(verified?.session.token).toBe(token);
    });

    it('should explicitly revoke session on server when deleteSession is called (Logout)', () => {
      const user: User = {
        id: 'usr_test_2',
        name: 'Logout Test User',
        email: 'logout@example.com',
        role: 'customer',
        created_at: new Date().toISOString(),
      };
      mockDb.data.users.push(user);

      const token = userRepo.createSession(user);
      expect(userRepo.verifySession(token)).not.toBeNull();

      // Perform server-side session revocation
      const revoked = userRepo.deleteSession(token);
      expect(revoked).toBe(true);

      // Subsequent session checks must fail
      expect(userRepo.verifySession(token)).toBeNull();
    });

    it('should reject expired sessions', () => {
      const user: User = {
        id: 'usr_test_3',
        name: 'Expired Session User',
        email: 'expired@example.com',
        role: 'customer',
        created_at: new Date().toISOString(),
      };
      mockDb.data.users.push(user);

      const expiredToken = 'expired_session_token_123';
      mockDb.data.sessions.push({
        token: expiredToken,
        userId: user.id,
        userRole: user.role,
        userEmail: user.email,
        userName: user.name,
        createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() - 1000).toISOString(), // Expired
      });

      expect(userRepo.verifySession(expiredToken)).toBeNull();
    });

    it('should terminate all user sessions on terminateUserSessions', async () => {
      const user: User = {
        id: 'usr_test_4',
        name: 'Multi Session User',
        email: 'multi@example.com',
        role: 'customer',
        created_at: new Date().toISOString(),
      };
      mockDb.data.users.push(user);

      const t1 = userRepo.createSession(user);
      const t2 = userRepo.createSession(user);
      expect(userRepo.verifySession(t1)).not.toBeNull();
      expect(userRepo.verifySession(t2)).not.toBeNull();

      await userRepo.terminateUserSessions(user.id);
      expect(userRepo.verifySession(t1)).toBeNull();
      expect(userRepo.verifySession(t2)).toBeNull();
    });
  });
});
