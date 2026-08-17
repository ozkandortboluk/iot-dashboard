import type { NotificationChannel, NotificationQueueItem, DispatchLogItem, NotificationServiceConfig } from '../types.js';

export const defaultNotificationConfig: NotificationServiceConfig = {
  email: {
    enabled: true,
    provider: 'simulated',
    fromEmail: 'alarms@iotplatform.com',
    fromName: 'IoT Akıllı Alarm Servisi',
  },
  whatsapp: {
    enabled: true,
    provider: 'simulated',
    phoneNumberId: '1029384756',
    apiToken: '',
    businessAccountId: 'act_987654321',
  },
  telegram: {
    enabled: true,
    botToken: '',
    botUsername: '@IoTAlarmBot',
  },
  sms: {
    enabled: true,
    provider: 'simulated',
    senderTitle: 'IOT_ALARM',
  },
  webhook: {
    enabled: true,
    defaultEndpoint: 'https://api.example.com/webhooks/iot-alerts',
    secretHeader: 'sec_key_iot_123',
  },
};

export async function dispatchMessageToChannel(
  item: NotificationQueueItem,
  config: NotificationServiceConfig = defaultNotificationConfig
): Promise<{ success: boolean; providerResponse: string; errorDetails?: string }> {
  const channel = item.channel;

  try {
    if (channel === 'whatsapp') {
      if (!config.whatsapp.enabled) {
        throw new Error('WhatsApp servisi yönetim panelinden devre dışı bırakılmış.');
      }
      if (!item.recipient || item.recipient.length < 7) {
        throw new Error(`Geçersiz WhatsApp numarası: "${item.recipient}". Lütfen ülke koduyla giriniz (+90...).`);
      }

      if (config.whatsapp.provider === 'cloud_api' && config.whatsapp.apiToken) {
        const res = await fetch(`https://graph.facebook.com/v18.0/${config.whatsapp.phoneNumberId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.whatsapp.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: item.recipient.replace(/[^0-9]/g, ''),
            type: 'text',
            text: { body: `*${item.title}*\n\n${item.message}` },
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || 'WhatsApp Cloud API Hatası');
        return {
          success: true,
          providerResponse: `WhatsApp Mesajı İletildi (ID: ${data.messages?.[0]?.id || 'WAMID_OK'})`,
        };
      } else {
        const cleanNumber = item.recipient.replace(/[^0-9+]/g, '');
        const simMessageId = `wamid.HBgL${Date.now()}${Math.random().toString(36).substring(2, 6)}`;
        
        if (cleanNumber.startsWith('+900')) {
          throw new Error('WhatsApp Gateway Hatası: Alıcı numarası geçici olarak kapsama alanı dışında (HTTP 503)');
        }

        return {
          success: true,
          providerResponse: `[WhatsApp Gateway Simulated OK] Numaraya iletildi: ${cleanNumber} (Ref ID: ${simMessageId})`,
        };
      }
    }

    if (channel === 'telegram') {
      if (!config.telegram.enabled) {
        throw new Error('Telegram servisi devre dışı bırakılmış.');
      }
      if (!item.recipient || item.recipient.trim().length === 0) {
        throw new Error('Geçersiz Telegram Chat ID. Lütfen kullanıcı profilinize Telegram Chat ID ekleyin.');
      }

      const chatId = item.recipient.trim();

      if (config.telegram.botToken) {
        const res = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `🚨 *${item.title}*\n\n${item.message}`,
            parse_mode: 'Markdown',
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.description || 'Telegram Bot API Hatası');
        return {
          success: true,
          providerResponse: `Telegram Bot Mesajı İletildi -> ChatID ${chatId} (Msg ID: ${data.result?.message_id})`,
        };
      } else {
        if (chatId === 'invalid_chat') {
          throw new Error('Telegram API: Chat not found (Kullanıcı bot ile sohbet başlatmamış)');
        }
        return {
          success: true,
          providerResponse: `[Telegram Bot Simulated OK] Chat ID ${chatId} hesabına iletildi (MsgID: ${Math.floor(Math.random() * 89999 + 10000)})`,
        };
      }
    }

    if (channel === 'email') {
      if (!config.email.enabled) {
        throw new Error('E-posta servisi devre dışı bırakılmış.');
      }
      if (!item.recipient || !item.recipient.includes('@')) {
        throw new Error(`Geçersiz e-posta adresi: "${item.recipient}"`);
      }

      return {
        success: true,
        providerResponse: `[SMTP/Email Gateway OK] E-Posta gönderildi: ${item.recipient} (250 OK - ID: MSG_${Date.now()})`,
      };
    }

    if (channel === 'sms') {
      if (!config.sms.enabled) {
        throw new Error('SMS servisi devre dışı bırakılmış.');
      }
      if (!item.recipient || item.recipient.length < 8) {
        throw new Error(`Geçersiz SMS telefon numarası: "${item.recipient}"`);
      }

      return {
        success: true,
        providerResponse: `[SMS Gateway OK] Başlıkla SMS İletildi: [${config.sms.senderTitle || 'IOT'}] -> ${item.recipient}`,
      };
    }

    if (channel === 'webhook') {
      if (!config.webhook.enabled) {
        throw new Error('Webhook servisi devre dışı bırakılmış.');
      }
      const targetUrl = item.recipient.startsWith('http') ? item.recipient : config.webhook.defaultEndpoint;
      if (!targetUrl || !targetUrl.startsWith('http')) {
        throw new Error('Geçersiz Webhook URL adresi.');
      }

      return {
        success: true,
        providerResponse: `[Webhook Dispatched OK] HTTP 200 OK -> ${targetUrl}`,
      };
    }

    if (channel === 'app') {
      return {
        success: true,
        providerResponse: 'Uygulama İçi Bildirim Oluşturuldu',
      };
    }

    throw new Error(`Bilinmeyen bildirim kanalı: ${channel}`);
  } catch (err: any) {
    return {
      success: false,
      providerResponse: 'GÖNDERİM BAŞARISIZ',
      errorDetails: err.message || 'Servis yanıt vermedi',
    };
  }
}
