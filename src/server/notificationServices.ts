import type { NotificationChannel, NotificationQueueItem, DispatchLogItem, NotificationServiceConfig } from '../types.js';
import { emailService } from './services/email.service.js';

function escapeHtml(value: string): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return value.replace(/[&<>"']/g, (char) => entities[char] || char);
}

export const defaultNotificationConfig: NotificationServiceConfig = {
  email: {
    enabled: false,
    provider: 'simulated',
    fromEmail: '',
    fromName: 'NexusNode IoT',
  },
  whatsapp: {
    enabled: false,
    provider: 'simulated',
    phoneNumberId: '',
    apiToken: '',
    businessAccountId: '',
  },
  telegram: {
    enabled: false,
    botToken: '',
    botUsername: '',
  },
  sms: {
    enabled: false,
    provider: 'simulated',
    senderTitle: '',
  },
  webhook: {
    enabled: false,
    defaultEndpoint: '',
    secretHeader: '',
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
        throw new Error('WhatsApp gerçek gönderim sağlayıcısı yapılandırılmamış. Simülasyon teslimat olarak raporlanmaz.');
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
        throw new Error('Telegram Bot Token yapılandırılmamış. Simülasyon teslimat olarak raporlanmaz.');
      }
    }

    if (channel === 'email') {
      if (!config.email.enabled) throw new Error('E-posta servisi devre dışı bırakılmış.');
      if (!item.recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.recipient.trim())) {
        throw new Error('Geçersiz e-posta adresi.');
      }
      const emailConfig = emailService.getEmailConfig();
      if (!emailConfig.isConfigured || emailConfig.provider === 'simulated') {
        throw new Error('Gerçek e-posta sağlayıcısı yapılandırılmamış. Resend veya SMTP ayarlarını tamamlayın.');
      }
      const result = await emailService.sendEmail({
        to: item.recipient.trim(),
        subject: item.title,
        text: item.message,
        html: `<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${escapeHtml(item.message)}</div>`,
        dedupKey: item.id,
        tenantId: item.tenantId,
      });
      if (!result.success || result.simulated) throw new Error(result.error || 'E-posta sağlayıcısı teslimatı doğrulamadı.');
      return { success: true, providerResponse: `E-posta sağlayıcısı kabul etti (${result.provider}, ID: ${result.messageId || 'bilinmiyor'}).` };
    }

    if (channel === 'sms') {
      if (!config.sms.enabled) {
        throw new Error('SMS servisi devre dışı bırakılmış.');
      }
      if (!item.recipient || item.recipient.length < 8) {
        throw new Error(`Geçersiz SMS telefon numarası: "${item.recipient}"`);
      }

      throw new Error('SMS sağlayıcısı gerçek gönderim için entegre edilmemiş. Mesaj teslim edilmiş olarak işaretlenmedi.');
    }

    if (channel === 'webhook') {
      if (!config.webhook.enabled) {
        throw new Error('Webhook servisi devre dışı bırakılmış.');
      }
      const targetUrl = item.recipient.startsWith('http') ? item.recipient : config.webhook.defaultEndpoint;
      if (!targetUrl || !targetUrl.startsWith('http')) {
        throw new Error('Geçersiz Webhook URL adresi.');
      }

      throw new Error('Webhook gönderimi henüz uygulanmamış; sahte HTTP 200 sonucu üretilmedi.');
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
