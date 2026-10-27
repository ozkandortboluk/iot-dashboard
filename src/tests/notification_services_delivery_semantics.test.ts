import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationQueueItem } from '../types.js';
import { defaultNotificationConfig, dispatchMessageToChannel } from '../server/notificationServices.js';

const telegramItem: NotificationQueueItem = {
  id: 'queue-telegram-test',
  tenantId: 'tenant-test',
  channel: 'telegram',
  recipient: '987654321',
  title: 'Test alert',
  message: 'Test message',
  severity: 'warning',
  status: 'pending',
  attempts: 0,
  maxAttempts: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Telegram notification delivery semantics', () => {
  it('reports provider acceptance without claiming delivery or exposing the chat ID', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 123 } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const config = {
      ...defaultNotificationConfig,
      telegram: {
        ...defaultNotificationConfig.telegram,
        enabled: true,
        botToken: 'test-token-not-a-real-secret',
      },
    };

    const result = await dispatchMessageToChannel(telegramItem, config);

    expect(result.success).toBe(true);
    expect(result.providerResponse).toContain('Telegram API mesajı kabul etti');
    expect(result.providerResponse).toContain('Teslimat durumu');
    expect(result.providerResponse).not.toContain('İletildi');
    expect(result.providerResponse).not.toContain(telegramItem.recipient);
    expect(result.providerResponse).not.toContain('ChatID');
  });

  it('fails without calling Telegram when the bot token is not configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const config = {
      ...defaultNotificationConfig,
      telegram: {
        ...defaultNotificationConfig.telegram,
        enabled: true,
        botToken: '',
      },
    };

    const result = await dispatchMessageToChannel(telegramItem, config);

    expect(result.success).toBe(false);
    expect(result.errorDetails).toContain('Bot Token yapılandırılmamış');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
