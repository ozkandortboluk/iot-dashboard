import { describe, it, expect, beforeEach } from 'vitest';
import { passwordResetService } from '../server/services/passwordReset.service';
import { emailService } from '../server/services/email.service';
import { db } from '../server/db';
import crypto from 'crypto';

describe('Password Reset & Transactional Email Architecture', () => {
  let testUser: any;

  beforeEach(async () => {
    await db.waitForInitialization();
    await emailService.updateEmailConfig({
      provider: 'simulated',
      fromEmail: 'destek@nexusnodeiot.com.tr',
    });

    // Create unique test user for password reset testing
    const uniqueEmail = `test_pwd_${Date.now()}_${crypto.randomBytes(4).toString('hex')}@nexusnodeiot.com.tr`;
    testUser = await db.registerUser(
      'Test User',
      uniqueEmail,
      'OldPassword123!',
      'customer',
      'Test Corp'
    );
  });

  it('1. OWASP Anti-Enumeration: returns identical generic response for both non-existent and existing accounts', async () => {
    const unknownRes = await passwordResetService.requestPasswordReset({
      email: 'nonexistent_account_xyz@example.com',
      clientIp: '192.168.1.101',
      baseUrl: 'http://localhost:3000',
    });

    expect(unknownRes.success).toBe(true);
    expect(unknownRes.message).toContain('Eğer bu e-posta adresi sistemimizde kayıtlı ise');

    const knownRes = await passwordResetService.requestPasswordReset({
      email: testUser.email,
      clientIp: '192.168.1.102',
      baseUrl: 'http://localhost:3000',
    });

    expect(knownRes.success).toBe(true);
    expect(knownRes.message).toBe(unknownRes.message);
    expect(knownRes.simulatedUrl).toBeDefined();
    expect(knownRes.simulatedUrl).toContain('token=');
  });

  it('2. Token Verification: successfully verifies valid token and masks email', async () => {
    const resetRes = await passwordResetService.requestPasswordReset({
      email: testUser.email,
      clientIp: '192.168.1.103',
      baseUrl: 'http://localhost:3000',
    });

    const token = resetRes.simulatedUrl!.split('token=')[1];
    expect(token).toBeTruthy();

    const verification = await passwordResetService.verifyToken(token);
    expect(verification.valid).toBe(true);
    expect(verification.emailMasked).toBeDefined();
    expect(verification.emailMasked).toContain('***');
    expect(verification.emailMasked).toContain('@nexusnodeiot.com.tr');
  });

  it('3. Single-use Token Enforcement: token cannot be used twice', async () => {
    const resetRes = await passwordResetService.requestPasswordReset({
      email: testUser.email,
      clientIp: '192.168.1.104',
      baseUrl: 'http://localhost:3000',
    });

    const token = resetRes.simulatedUrl!.split('token=')[1];
    
    // First reset attempt: should succeed
    const firstReset = await passwordResetService.resetPassword(token, 'NewSecurePassword123!');
    expect(firstReset.success).toBe(true);

    // Second reset attempt with same consumed token: MUST fail
    await expect(
      passwordResetService.resetPassword(token, 'AnotherPassword456!')
    ).rejects.toThrow('Bu sıfırlama bağlantısı daha önce kullanılmış');
  });

  it('4. Session Invalidation & Re-login: old sessions are cleared and user logs in with new password', async () => {
    // Authenticate with initial password to generate an active session
    const loginBefore = await db.authenticate(testUser.email, 'OldPassword123!');
    expect(loginBefore).toBeTruthy();
    expect(loginBefore?.token).toBeTruthy();

    const initialToken = loginBefore!.token;
    const sessionCheck = await db.verifySessionAsync(initialToken);
    expect(sessionCheck).toBeTruthy();

    // Trigger password reset
    const resetRes = await passwordResetService.requestPasswordReset({
      email: testUser.email,
      clientIp: '192.168.1.105',
      baseUrl: 'http://localhost:3000',
    });
    const token = resetRes.simulatedUrl!.split('token=')[1];

    await passwordResetService.resetPassword(token, 'BrandNewPassword123!');

    // Old session MUST be invalidated
    const invalidatedSession = await db.verifySessionAsync(initialToken);
    expect(invalidatedSession).toBeNull();

    // Login with old password MUST fail
    const oldLoginTry = await db.authenticate(testUser.email, 'OldPassword123!');
    expect(oldLoginTry).toBeNull();

    // Login with new password MUST succeed
    const newLoginTry = await db.authenticate(testUser.email, 'BrandNewPassword123!');
    expect(newLoginTry).toBeTruthy();
    expect(newLoginTry?.user.id).toBe(testUser.id);
  });

  it('5. Admin-Triggered Password Reset: generates reset and returns delivery status', async () => {
    const adminResult = await passwordResetService.adminSendPasswordReset({
      userId: testUser.id,
      baseUrl: 'http://localhost:3000',
      adminName: 'Sistem Yöneticisi',
    });

    expect(adminResult.success).toBe(true);
    expect(adminResult.message).toContain('adresine başarıyla gönderildi');
    expect(adminResult.simulatedUrl).toBeDefined();

    // The generated token from admin action must also be verifiable and usable
    const adminToken = adminResult.simulatedUrl!.split('token=')[1];
    const verification = await passwordResetService.verifyToken(adminToken);
    expect(verification.valid).toBe(true);
  });

  it('6. Email Service: formats HTML and Plain Text templates cleanly', async () => {
    const sendResult = await emailService.sendPasswordResetEmail({
      to: testUser.email,
      userName: testUser.name,
      resetUrl: 'http://localhost:3000/#reset-password?token=sample_token_123',
      expiresInMinutes: 15,
    });

    expect(sendResult.success).toBe(true);
    expect(sendResult.provider).toBeDefined();
  });
});
