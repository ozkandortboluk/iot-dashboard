import type { MonitorReport } from '../core/types.js';

export interface MessageSender { readonly external: boolean; send(text: string, signal?: AbortSignal): Promise<void>; }
export interface TelegramCredentials { botToken: string; chatId: string; }

export class FakeMessageSender implements MessageSender {
  readonly external = false;
  readonly messages: string[] = [];
  async send(text: string): Promise<void> { this.messages.push(text); }
}

export class TelegramHttpSender implements MessageSender {
  readonly external = true;
  constructor(private readonly credentials: TelegramCredentials, private readonly fetchImpl: typeof fetch = fetch) {
    if (!/^\d{5,12}:[A-Za-z0-9_-]{20,}$/.test(credentials.botToken)) throw new Error('Telegram credentials are invalid.');
    if (!/^-?\d{5,20}$/.test(credentials.chatId)) throw new Error('Telegram credentials are invalid.');
  }

  async send(text: string, signal?: AbortSignal): Promise<void> {
    const safeText = Array.from(text, (character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 0x1f || code === 0x7f ? ' ' : character;
    }).join('').slice(0, 3500);
    const timeout = AbortSignal.timeout(5_000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const response = await this.fetchImpl(`https://api.telegram.org/bot${this.credentials.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: this.credentials.chatId, text: safeText, disable_web_page_preview: true }),
        signal: combined,
        redirect: 'error',
      });
      try { await response.body?.cancel(); } catch { /* provider response is discarded */ }
      if (!response.ok) throw new Error('telegram_provider_rejected');
    } catch {
      throw new Error('telegram_delivery_failed');
    }
  }
}

export function readTelegramCredentials(env: NodeJS.ProcessEnv, tokenName: string, chatIdName: string): TelegramCredentials | undefined {
  const botToken = env[tokenName];
  const chatId = env[chatIdName];
  if (!botToken || !chatId) return undefined;
  return { botToken, chatId };
}

const notificationText: Record<string, string> = {
  app_liveness: 'NexusNode: uygulama liveness kontrolü başarısız.',
  app_readiness: 'NexusNode: uygulama/veritabanı readiness kontrolü başarısız.',
  database_readiness: 'NexusNode: uygulama/veritabanı readiness kontrolü başarısız.',
  host_resources: 'NexusNode: host kaynak eşik uyarısı.',
  docker_containers: 'NexusNode: Docker container durum uyarısı.',
  backup_artifact: 'NexusNode: yedek doğrulama veya yaş kontrolü uyarısı.',
  allowed_log_summary: 'NexusNode: izinli loglarda hata işaretleri bulundu.',
};

export function formatCriticalNotifications(report: MonitorReport): Array<{ checkId: string; status: 'warning' | 'critical' | 'unknown'; text: string }> {
  return report.results
    .filter((result) => result.status === 'critical' || result.status === 'warning' || result.status === 'unknown')
    .filter((result) => notificationText[result.id] !== undefined)
    .map((result) => ({
      checkId: result.id,
      status: result.status as 'warning' | 'critical' | 'unknown',
      text: result.status === 'unknown' ? `${notificationText[result.id]} Kontrol sonucu doğrulanamadı.` : notificationText[result.id],
    }));
}
