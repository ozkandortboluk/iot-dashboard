import { describe, expect, it, vi } from 'vitest';

vi.mock('../../server/services/email.service.js', () => ({
  emailService: {
    getEmailConfig: () => ({ isConfigured: false, provider: 'simulated' }),
    sendEmail: vi.fn(),
  },
}));

import { defaultNotificationConfig, dispatchMessageToChannel } from '../../server/notificationServices.js';
import type { NotificationChannel, NotificationQueueItem, NotificationServiceConfig } from '../../types.js';

function makeItem(channel: NotificationChannel): NotificationQueueItem {
  return {
    id: 'test-notification-1',
    tenantId: 'tenant-test',
    channel,
    recipient: channel === 'email' ? 'test@example.com' : channel === 'webhook' ? 'https://hooks.example.com/test' : '+905551112233',
    title: 'Notification test',
    message: 'Test payload',
    severity: 'info',
    status: 'pending',
    attempts: 0,
    maxAttempts: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function enabledSimulatedConfig(): NotificationServiceConfig {
  return {
    email: { ...defaultNotificationConfig.email, enabled: true, provider: 'simulated' },
    whatsapp: { ...defaultNotificationConfig.whatsapp, enabled: true, provider: 'simulated' },
    telegram: { ...defaultNotificationConfig.telegram, enabled: true, botToken: '' },
    sms: { ...defaultNotificationConfig.sms, enabled: true, provider: 'simulated' },
    webhook: { ...defaultNotificationConfig.webhook, enabled: true, defaultEndpoint: 'https://hooks.example.com/test' },
  };
}

describe('notification delivery truthfulness', () => {
  it.each(['email', 'sms', 'whatsapp', 'telegram', 'webhook'] as NotificationChannel[])(
    'does not report unimplemented or simulated %s delivery as successful',
    async (channel) => {
      const result = await dispatchMessageToChannel(makeItem(channel), enabledSimulatedConfig());
      expect(result.success).toBe(false);
      expect(result.errorDetails).toBeTruthy();
    },
  );

  it('keeps in-app notification creation as a successful local action', async () => {
    const result = await dispatchMessageToChannel(makeItem('app'), defaultNotificationConfig);
    expect(result.success).toBe(true);
    expect(result.providerResponse).toContain('Uygulama İçi Bildirim');
  });
});
