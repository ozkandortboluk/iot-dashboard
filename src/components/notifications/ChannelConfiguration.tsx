import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  MessageSquare,
  Mail,
  Globe,
  Settings,
  Send,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Layers,
  Sparkles,
  ShieldCheck,
  Webhook,
} from 'lucide-react';
import type { NotificationServiceConfig, NotificationChannel } from '../../types';

interface ChannelConfigurationProps {
  serviceConfig: NotificationServiceConfig | null;
  loadingAction: string | null;
  onSaveServiceConfig: (config: any) => Promise<void>;
  onSendTestMessage: (
    channel: NotificationChannel,
    recipient: string,
    title: string,
    message: string
  ) => Promise<{ success: boolean; response: string; error?: string }>;
}

export const ChannelConfiguration: React.FC<ChannelConfigurationProps> = ({
  serviceConfig,
  loadingAction,
  onSaveServiceConfig,
  onSendTestMessage,
}) => {
  // Config Form State
  const [whatsappEnabled, setWhatsappEnabled] = useState(serviceConfig?.whatsapp?.enabled ?? true);
  const [whatsappPhoneId, setWhatsappPhoneId] = useState(serviceConfig?.whatsapp?.phoneNumberId || '');
  const [whatsappToken, setWhatsappToken] = useState(serviceConfig?.whatsapp?.apiToken || '');

  const [telegramEnabled, setTelegramEnabled] = useState(serviceConfig?.telegram?.enabled ?? true);
  const [telegramBotToken, setTelegramBotToken] = useState(serviceConfig?.telegram?.botToken || '');
  const [telegramBotUser, setTelegramBotUser] = useState(serviceConfig?.telegram?.botUsername || '');

  const [emailEnabled, setEmailEnabled] = useState(serviceConfig?.email?.enabled ?? true);
  const [emailFrom, setEmailFrom] = useState(serviceConfig?.email?.fromEmail || 'alarms@iotplatform.com');

  const [smsEnabled, setSmsEnabled] = useState(serviceConfig?.sms?.enabled ?? true);
  const [smsTitle, setSmsTitle] = useState(serviceConfig?.sms?.senderTitle || 'IOT_ALARM');

  const [webhookEnabled, setWebhookEnabled] = useState(serviceConfig?.webhook?.enabled ?? true);
  const [webhookEndpoint, setWebhookEndpoint] = useState(serviceConfig?.webhook?.defaultEndpoint || '');
  const [webhookSecretHeader, setWebhookSecretHeader] = useState(serviceConfig?.webhook?.secretHeader || '');

  // Synchronize when serviceConfig props update
  useEffect(() => {
    if (serviceConfig) {
      setWhatsappEnabled(serviceConfig.whatsapp?.enabled ?? true);
      setWhatsappPhoneId(serviceConfig.whatsapp?.phoneNumberId || '');
      setWhatsappToken(serviceConfig.whatsapp?.apiToken || '');
      setTelegramEnabled(serviceConfig.telegram?.enabled ?? true);
      setTelegramBotToken(serviceConfig.telegram?.botToken || '');
      setTelegramBotUser(serviceConfig.telegram?.botUsername || '');
      setEmailEnabled(serviceConfig.email?.enabled ?? true);
      setEmailFrom(serviceConfig.email?.fromEmail || 'alarms@iotplatform.com');
      setSmsEnabled(serviceConfig.sms?.enabled ?? true);
      setSmsTitle(serviceConfig.sms?.senderTitle || 'IOT_ALARM');
      setWebhookEnabled(serviceConfig.webhook?.enabled ?? true);
      setWebhookEndpoint(serviceConfig.webhook?.defaultEndpoint || '');
      setWebhookSecretHeader(serviceConfig.webhook?.secretHeader || '');
    }
  }, [serviceConfig]);

  // Test Dispatch State
  const [testChannel, setTestChannel] = useState<NotificationChannel>('whatsapp');
  const [testRecipient, setTestRecipient] = useState('');
  const [testTitle, setTestTitle] = useState('🚨 Kritik Sıcaklık Uyarısı (Test)');
  const [testMsg, setTestMsg] = useState('İstanbul Depo İklim Sensörü 42.5°C eşik değerini aştı.');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; response: string; error?: string } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveServiceConfig({
      whatsapp: {
        enabled: whatsappEnabled,
        phoneNumberId: whatsappPhoneId,
        apiToken: whatsappToken,
        provider: whatsappToken ? 'cloud_api' : (serviceConfig?.whatsapp?.provider || 'simulated'),
      },
      telegram: {
        enabled: telegramEnabled,
        botToken: telegramBotToken,
        botUsername: telegramBotUser,
      },
      email: {
        enabled: emailEnabled,
        fromEmail: emailFrom,
        provider: serviceConfig?.email?.provider || 'simulated',
      },
      sms: {
        enabled: smsEnabled,
        senderTitle: smsTitle,
        provider: serviceConfig?.sms?.provider || 'simulated',
      },
      webhook: {
        enabled: webhookEnabled,
        defaultEndpoint: webhookEndpoint,
        secretHeader: webhookSecretHeader,
      },
    });
  };

  const handleTestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testRecipient) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await onSendTestMessage(testChannel, testRecipient, testTitle, testMsg);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        response: 'Hata',
        error: err.message || 'Gönderim testi yapılamadı',
      });
    } finally {
      setTestSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Service Settings Form */}
      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 1. WhatsApp Cloud API */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Meta WhatsApp Cloud API</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Resmi İşletme WhatsApp Mesajları</p>
                </div>
              </div>

              <input
                type="checkbox"
                checked={whatsappEnabled}
                onChange={(e) => setWhatsappEnabled(e.target.checked)}
                className="rounded text-emerald-600 w-4 h-4 cursor-pointer"
              />
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Phone Number ID
                </label>
                <input
                  type="text"
                  placeholder="Örn: 104928374928174"
                  value={whatsappPhoneId}
                  onChange={(e) => setWhatsappPhoneId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Permanent System User API Token
                </label>
                <input
                  type="password"
                  placeholder="EAAG..."
                  value={whatsappToken}
                  onChange={(e) => setWhatsappToken(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* 2. Telegram Bot */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Telegram Bot API</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Anlık Alarm Bildirim Botu</p>
                </div>
              </div>

              <input
                type="checkbox"
                checked={telegramEnabled}
                onChange={(e) => setTelegramEnabled(e.target.checked)}
                className="rounded text-sky-600 w-4 h-4 cursor-pointer"
              />
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Bot Token (BotFather)
                </label>
                <input
                  type="password"
                  placeholder="619283749:AAHk..."
                  value={telegramBotToken}
                  onChange={(e) => setTelegramBotToken(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Bot Username
                </label>
                <input
                  type="text"
                  placeholder="@NexusAlarmBot"
                  value={telegramBotUser}
                  onChange={(e) => setTelegramBotUser(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* 3. E-posta (SMTP / Resend) */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">E-posta Bildirimleri (SMTP)</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Alarm E-postaları Gönderimi</p>
                </div>
              </div>

              <input
                type="checkbox"
                checked={emailEnabled}
                onChange={(e) => setEmailEnabled(e.target.checked)}
                className="rounded text-indigo-600 w-4 h-4 cursor-pointer"
              />
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Gönderici E-posta Adresi (From)
                </label>
                <input
                  type="email"
                  placeholder="alarms@iotplatform.com"
                  value={emailFrom}
                  onChange={(e) => setEmailFrom(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* 4. SMS Başlığı */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">SMS Ağ Geçidi</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">NetGSM / Twilio SMS Başlığı</p>
                </div>
              </div>

              <input
                type="checkbox"
                checked={smsEnabled}
                onChange={(e) => setSmsEnabled(e.target.checked)}
                className="rounded text-amber-600 w-4 h-4 cursor-pointer"
              />
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  SMS Gönderici Başlığı (Header)
                </label>
                <input
                  type="text"
                  placeholder="IOT_ALARM"
                  value={smsTitle}
                  onChange={(e) => setSmsTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* 5. Webhook HTTP REST Endpoint */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 md:col-span-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                  <Webhook className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Webhook & Harici HTTP Entegrasyonu</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Otomatik JSON payload POST çağrıları ve Güvenlik Başlığı</p>
                </div>
              </div>

              <input
                type="checkbox"
                checked={webhookEnabled}
                onChange={(e) => setWebhookEnabled(e.target.checked)}
                className="rounded text-cyan-600 w-4 h-4 cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Varsayılan Webhook URL Adresi
                </label>
                <input
                  type="url"
                  placeholder="https://api.sirketiniz.com/iot/alarms"
                  value={webhookEndpoint}
                  onChange={(e) => setWebhookEndpoint(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Güvenlik Başlığı / Secret Header (X-Webhook-Secret)
                </label>
                <input
                  type="text"
                  placeholder="••••••••son4"
                  value={webhookSecretHeader}
                  onChange={(e) => setWebhookSecretHeader(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Save Config Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loadingAction === 'serviceConfig'}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            {loadingAction === 'serviceConfig' ? (
              <span>Kaydediliyor...</span>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Bildirim Servis Ayarlarını Kaydet</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Live Test Dispatcher Section */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-base font-bold text-slate-900 dark:text-white">Canlı Bildirim Test Gönderimi</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Yapılandırılan WhatsApp, Telegram, SMS veya E-posta kanallarına anında canlı test iletisi gönderin.
            </p>
          </div>
        </div>

        <form onSubmit={handleTestSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Test Edilecek Kanal
              </label>
              <select
                value={testChannel}
                onChange={(e) => setTestChannel(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-semibold"
              >
                <option value="whatsapp">WhatsApp (+90 Telefon Numarası)</option>
                <option value="telegram">Telegram (Chat ID)</option>
                <option value="email">E-posta (ornek@alanadi.com)</option>
                <option value="sms">SMS (+90 Telefon Numarası)</option>
                <option value="webhook">Webhook (HTTP Endpoint)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Hedef Alıcı Bilgisi
              </label>
              <input
                type="text"
                placeholder={
                  testChannel === 'whatsapp' || testChannel === 'sms'
                    ? '+905321234567'
                    : testChannel === 'telegram'
                    ? '129837465'
                    : testChannel === 'email'
                    ? 'ornek@alanadi.com'
                    : 'https://webhook.site/...'
                }
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Test Başlığı
              </label>
              <input
                type="text"
                value={testTitle}
                onChange={(e) => setTestTitle(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Test Mesaj Metni
              </label>
              <input
                type="text"
                value={testMsg}
                onChange={(e) => setTestMsg(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Test Result Indicator */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                testResult.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/20 border-rose-300 text-rose-800 dark:text-rose-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-bold">
                  {testResult.success ? 'Test İletisi Başarıyla Gönderildi' : 'Test Gönderiminde Hata'}
                </div>
                <div className="text-[11px] font-mono mt-0.5">
                  {testResult.response} {testResult.error && `(${testResult.error})`}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={testSending}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl text-xs shadow-md shadow-purple-600/20 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              {testSending ? (
                <span>İletiliyor...</span>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Test Bildirimi Gönder</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
