import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../../server/db.js';
import { dispatchMessageToChannel, defaultNotificationConfig } from '../../server/notificationServices.js';
import type { NotificationQueueItem } from '../../types.js';

describe('Notification Channel Isolation & Telegram Delivery Resilience Test Suite', () => {
  beforeEach(() => {
    // Set known initial service config
    db.updateServiceConfig({
      whatsapp: {
        enabled: true,
        phoneNumberId: '10987654321',
        apiToken: 'EAAG_Initial_WaToken_1234',
        provider: 'cloud_api',
      },
      telegram: {
        enabled: true,
        botToken: '7123456789:AAHkTelegramBotToken_5678',
        botUsername: '@NexusIoTAlarmBot',
        chatId: '-100192837465',
      },
      email: {
        enabled: true,
        fromEmail: 'alarms@nexusnodeiot.com.tr',
        fromName: 'Nexus Alarmlar',
        provider: 'resend',
      },
      sms: {
        enabled: true,
        senderTitle: 'IOT_ALARM',
        provider: 'simulated',
      },
      webhook: {
        enabled: true,
        defaultEndpoint: 'https://api.external.com/webhooks/iot',
        secretHeader: 'super_secret_webhook_signature_1234',
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('1. Channel Isolation (Saving one channel never alters or wipes others)', () => {
    it('preserves Telegram bot token and chat ID when updating ONLY WhatsApp', () => {
      const before = db.getServiceConfig(true);
      expect(before.telegram.botToken).toBe('7123456789:AAHkTelegramBotToken_5678');
      expect(before.telegram.chatId).toBe('-100192837465');

      // Update only WhatsApp with a new phone number
      db.updateServiceConfig({
        whatsapp: {
          enabled: true,
          phoneNumberId: '99887766554',
          provider: 'cloud_api',
        },
      });

      const after = db.getServiceConfig(true);
      // WhatsApp updated
      expect(after.whatsapp.phoneNumberId).toBe('99887766554');
      // WhatsApp token preserved (not wiped even though not sent)
      expect(after.whatsapp.apiToken).toBe('EAAG_Initial_WaToken_1234');
      // Telegram is completely intact
      expect(after.telegram.enabled).toBe(true);
      expect(after.telegram.botToken).toBe('7123456789:AAHkTelegramBotToken_5678');
      expect(after.telegram.botUsername).toBe('@NexusIoTAlarmBot');
      expect(after.telegram.chatId).toBe('-100192837465');
      // Email is intact
      expect(after.email.fromEmail).toBe('alarms@nexusnodeiot.com.tr');
    });

    it('preserves existing Telegram bot token when empty string is passed in botToken (edit protection)', () => {
      // Simulate user editing Telegram username or chatId without retyping the password
      db.updateServiceConfig({
        telegram: {
          enabled: true,
          botUsername: '@UpdatedAlarmBot',
          chatId: '129837465',
          botToken: '', // User left it blank in UI!
        },
      });

      const updated = db.getServiceConfig(true);
      expect(updated.telegram.botUsername).toBe('@UpdatedAlarmBot');
      expect(updated.telegram.chatId).toBe('129837465');
      // Token must NOT be deleted!
      expect(updated.telegram.botToken).toBe('7123456789:AAHkTelegramBotToken_5678');
    });

    it('preserves existing token when masked string (••••••••5678) is sent', () => {
      db.updateServiceConfig({
        telegram: {
          enabled: true,
          botToken: '••••••••5678',
        },
      });

      const updated = db.getServiceConfig(true);
      expect(updated.telegram.botToken).toBe('7123456789:AAHkTelegramBotToken_5678');
    });

    it('allows explicitly clearing the token when clearBotToken flag or __CLEAR__ is passed', () => {
      db.updateServiceConfig({
        telegram: {
          enabled: false,
          clearBotToken: true,
        },
      });

      const updated = db.getServiceConfig(true);
      expect(updated.telegram.botToken).toBe('');
      expect(updated.telegram.enabled).toBe(false);
    });

    it('sanitizes accidental "bot" prefix from Telegram bot token on save', () => {
      db.updateServiceConfig({
        telegram: {
          enabled: true,
          botToken: 'bot123456789:XYZ_Token_9999',
        },
      });

      const updated = db.getServiceConfig(true);
      expect(updated.telegram.botToken).toBe('123456789:XYZ_Token_9999');
    });
  });

  describe('2. Telegram Message Delivery & HTML Formatting Resilience', () => {
    it('uses HTML mode and escapes special characters like underscores (_) without Telegram API parsing crashes', async () => {
      let capturedBody: any = null;
      const fetchMock = vi.fn().mockImplementation(async (_url: string, init: any) => {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({ ok: true, result: { message_id: 8888 } }),
        };
      });
      vi.stubGlobal('fetch', fetchMock);

      const queueItem: NotificationQueueItem = {
        id: 'q_test_tg_underscore',
        tenantId: 'tenant_1',
        channel: 'telegram',
        recipient: '129837465',
        title: 'Kritik Sensör Uyarısı: temp_sensor_depo_01',
        message: 'Kazan sıcaklığı_c 85.5_C eşiğini aştı [Cihaz: dev_esp32_01, Durum: CRITICAL_OVERHEAT]',
        severity: 'critical',
        status: 'pending',
        attempts: 0,
        maxAttempts: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await dispatchMessageToChannel(queueItem, db.getServiceConfig(true));

      expect(result.success).toBe(true);
      expect(fetchMock).toHaveBeenCalled();
      expect(capturedBody).not.toBeNull();
      expect(capturedBody.parse_mode).toBe('HTML');
      expect(capturedBody.chat_id).toBe('129837465');
      // Verifies HTML escaping
      expect(capturedBody.text).toContain('🚨 <b>Kritik Sensör Uyarısı: temp_sensor_depo_01</b>');
      expect(capturedBody.text).toContain('dev_esp32_01');
    });

    it('falls back to default chatId configured in serviceConfig when item recipient is not set', async () => {
      let capturedChatId: string | null = null;
      const fetchMock = vi.fn().mockImplementation(async (_url: string, init: any) => {
        const body = JSON.parse(init.body);
        capturedChatId = body.chat_id;
        return {
          ok: true,
          json: async () => ({ ok: true, result: { message_id: 9999 } }),
        };
      });
      vi.stubGlobal('fetch', fetchMock);

      const queueItemWithoutRecipient: NotificationQueueItem = {
        id: 'q_test_fallback',
        tenantId: 'tenant_1',
        channel: 'telegram',
        recipient: '', // Empty recipient
        title: 'Sistem Alarmı',
        message: 'Otomatik alarm tetiklendi',
        severity: 'warning',
        status: 'pending',
        attempts: 0,
        maxAttempts: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await dispatchMessageToChannel(queueItemWithoutRecipient, db.getServiceConfig(true));

      expect(result.success).toBe(true);
      // Falls back to the default -100192837465 configured in telegram.chatId!
      expect(capturedChatId).toBe('-100192837465');
    });
  });
});
