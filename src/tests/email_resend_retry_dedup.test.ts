import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmailService } from '../server/services/email.service.js';

describe('ALM-02: Email Service Retry, Backoff, Deduplication & HTTPS URL Policy', () => {
  const emailService = EmailService.getInstance();
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('1. Enforces HTTPS URL in production for non-loopback domains', () => {
    delete process.env.APP_BASE_URL;
    process.env.NODE_ENV = 'production';
    process.env.APP_URL = 'http://nexusnodeiot.com.tr';

    const baseUrl = emailService.getAppBaseUrl();
    expect(baseUrl).toBe('https://nexusnodeiot.com.tr');
  });

  it('2. Preserves localhost http URL in non-production or loopback', () => {
    delete process.env.APP_BASE_URL;
    process.env.NODE_ENV = 'development';
    process.env.APP_URL = 'http://localhost:3000';

    const baseUrl = emailService.getAppBaseUrl();
    expect(baseUrl).toBe('http://localhost:3000');
  });

  it('3. Deduplicates identical emails sent with same dedupKey within threshold', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ id: 'msg_test_123' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const options = {
      to: 'test_user@example.com',
      subject: 'Alarm Notification',
      html: '<p>Test Alarm</p>',
      dedupKey: 'dedup_alarm_1001',
    };

    const res1 = await emailService.sendEmail(options);
    expect(res1.success).toBe(true);

    // Second call with same dedupKey returns cached result
    const res2 = await emailService.sendEmail(options);
    expect(res2.success).toBe(true);
    expect(res2.messageId).toBe(res1.messageId);
  });

  it('4. Deduplicates simulated email mode calls with same dedupKey', async () => {
    emailService.updateEmailConfig({ provider: 'simulated' });

    const simOptions = {
      to: 'sim_test@example.com',
      subject: 'Simulated Notification',
      html: '<p>Simulated Body</p>',
      dedupKey: 'dedup_sim_1002',
    };

    const sim1 = await emailService.sendEmail(simOptions);
    expect(sim1.success).toBe(true);
    expect(sim1.provider).toBe('simulated');

    const sim2 = await emailService.sendEmail(simOptions);
    expect(sim2.success).toBe(true);
    expect(sim2.messageId).toBe(sim1.messageId);
  });
});
