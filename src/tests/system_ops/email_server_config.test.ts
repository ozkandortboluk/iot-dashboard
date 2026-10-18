import { describe, it, expect, beforeEach } from 'vitest';
import { emailService } from '../../server/services/email.service';
import { db } from '../../server/db';

describe('Email Server & Mail Configuration Architecture', () => {
  beforeEach(async () => {
    await db.waitForInitialization();
  });

  it('1. Default configuration: returns expected default sender and simulated fallback', () => {
    const config = emailService.getEmailConfig();
    expect(config).toBeDefined();
    expect(config.fromEmail).toBeTruthy();
    expect(config.fromName).toBeTruthy();
    expect(config.appBaseUrl).toBeTruthy();
    expect(typeof config.enabled).toBe('boolean');
    expect(['resend', 'smtp', 'simulated']).toContain(config.provider);
  });

  it('2. Configuration Update: updates Resend settings and securely masks API key', () => {
    const updated = emailService.updateEmailConfig({
      provider: 'resend',
      fromEmail: 'destek@nexusnodeiot.com.tr',
      fromName: 'NexusNode Destek Ekibi',
      resendApiKey: 're_secret_test_key_123456789',
      appBaseUrl: 'https://nexusnodeiot.com.tr',
    });

    expect(updated.fromEmail).toBe('destek@nexusnodeiot.com.tr');
    expect(updated.fromName).toBe('NexusNode Destek Ekibi');
    expect(updated.provider).toBe('resend');
    expect(updated.hasResendApiKey).toBe(true);
    // API key must be masked
    expect(updated.resendApiKeyMasked).toContain('••••');
    expect(updated.resendApiKeyMasked).not.toBe('re_secret_test_key_123456789');

    // Fetching again should still yield the masked key
    const current = emailService.getEmailConfig();
    expect(current.hasResendApiKey).toBe(true);
    expect(current.resendApiKeyMasked).toBe(updated.resendApiKeyMasked);
  });

  it('3. Secret Preservation: submitting masked key preserves original secret', () => {
    const current = emailService.getEmailConfig();
    const maskedKey = current.resendApiKeyMasked;

    // Simulate saving the form without changing the masked password
    const updated = emailService.updateEmailConfig({
      fromName: 'NexusNode Güncel İsim',
      resendApiKey: maskedKey,
    });

    expect(updated.fromName).toBe('NexusNode Güncel İsim');
    expect(updated.hasResendApiKey).toBe(true);
    // Internal API key must still resolve to the real secret
    expect(emailService.getResendApiKey()).toBe('re_secret_test_key_123456789');
  });

  it('4. SMTP Configuration: updates SMTP settings and securely handles SMTP port and pass', () => {
    const updated = emailService.updateEmailConfig({
      provider: 'smtp',
      smtpHost: 'mail.nexusnodeiot.com.tr',
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: 'smtp_admin@nexusnodeiot.com.tr',
      smtpPass: 'super_secret_smtp_password_99',
    });

    expect(updated.provider).toBe('smtp');
    expect(updated.smtpHost).toBe('mail.nexusnodeiot.com.tr');
    expect(updated.smtpPort).toBe(465);
    expect(updated.smtpSecure).toBe(true);
    expect(updated.smtpUser).toBe('smtp_admin@nexusnodeiot.com.tr');
    expect(updated.hasSmtpPass).toBe(true);
    expect(updated.smtpPassMasked).toContain('••••');
  });

  it('5. Test Email Dispatch: successfully triggers test dispatch in simulated mode', async () => {
    // Reset to simulated for deterministic test run
    emailService.updateEmailConfig({
      provider: 'simulated',
    });

    const result = await emailService.sendTestEmail({
      to: 'tester@nexusnodeiot.com.tr',
    });

    expect(result.success).toBe(true);
    expect(result.provider).toBe('simulated');
    expect(result.messageId).toBeDefined();
    expect(result.simulated).toBe(true);
  });

  it('6. System Settings Persistence: preserves Resend API key and settings across reloads', async () => {
    emailService.updateEmailConfig({
      provider: 'resend',
      fromEmail: 'sistem@bildirim.nexusnodeiot.com.tr',
      fromName: 'NexusNode Persistence Test',
      resendApiKey: 're_persistence_test_key_999888777',
    });

    const activeKeyBefore = emailService.getResendApiKey();
    expect(activeKeyBefore).toBe('re_persistence_test_key_999888777');

    // Simulate database re-sync
    await db.initPostgresRepository();

    const currentConfig = emailService.getEmailConfig();
    expect(currentConfig.fromEmail).toBe('sistem@bildirim.nexusnodeiot.com.tr');
    expect(currentConfig.fromName).toBe('NexusNode Persistence Test');
    expect(currentConfig.hasResendApiKey).toBe(true);
    expect(emailService.getResendApiKey()).toBe('re_persistence_test_key_999888777');
  });
});
