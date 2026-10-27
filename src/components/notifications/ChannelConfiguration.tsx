import React, { useState, useEffect, useRef } from 'react';
import {
  Smartphone,
  MessageSquare,
  Mail,
  Send,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Webhook,
  Eye,
  EyeOff,
  Trash2,
  Lock,
  Radio,
  Check,
  Info,
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
  // 1. WhatsApp State
  const [whatsappEnabled, setWhatsappEnabled] = useState(serviceConfig?.whatsapp?.enabled ?? false);
  const [whatsappPhoneId, setWhatsappPhoneId] = useState(serviceConfig?.whatsapp?.phoneNumberId || '');
  const [whatsappToken, setWhatsappToken] = useState('');
  const [whatsappHasToken, setWhatsappHasToken] = useState(Boolean(serviceConfig?.whatsapp?.apiToken || serviceConfig?.whatsapp?.hasApiToken));
  const [whatsappClearToken, setWhatsappClearToken] = useState(false);
  const [whatsappShowToken, setWhatsappShowToken] = useState(false);

  // 2. Telegram State
  const [telegramEnabled, setTelegramEnabled] = useState(serviceConfig?.telegram?.enabled ?? false);
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramBotUser, setTelegramBotUser] = useState(serviceConfig?.telegram?.botUsername || '');
  const [telegramChatId, setTelegramChatId] = useState(serviceConfig?.telegram?.chatId || '');
  const [telegramHasToken, setTelegramHasToken] = useState(Boolean(serviceConfig?.telegram?.botToken || serviceConfig?.telegram?.hasBotToken));
  const [telegramClearToken, setTelegramClearToken] = useState(false);
  const [telegramShowToken, setTelegramShowToken] = useState(false);

  // 3. Email State
  const [emailEnabled, setEmailEnabled] = useState(serviceConfig?.email?.enabled ?? false);
  const [emailFrom, setEmailFrom] = useState(serviceConfig?.email?.fromEmail || '');

  // 4. SMS State
  const [smsEnabled, setSmsEnabled] = useState(serviceConfig?.sms?.enabled ?? false);
  const [smsTitle, setSmsTitle] = useState(serviceConfig?.sms?.senderTitle || '');

  // 5. Webhook State
  const [webhookEnabled, setWebhookEnabled] = useState(serviceConfig?.webhook?.enabled ?? false);
  const [webhookEndpoint, setWebhookEndpoint] = useState(serviceConfig?.webhook?.defaultEndpoint || '');
  const [webhookSecretHeader, setWebhookSecretHeader] = useState('');
  const [webhookHasSecret, setWebhookHasSecret] = useState(Boolean(serviceConfig?.webhook?.secretHeader || serviceConfig?.webhook?.hasSecretHeader));
  const [webhookClearSecret, setWebhookClearSecret] = useState(false);
  const [webhookShowSecret, setWebhookShowSecret] = useState(false);

  // Per-channel saving status & success badges
  const [savingChannel, setSavingChannel] = useState<string | null>(null);
  const [savedChannelBadge, setSavedChannelBadge] = useState<string | null>(null);

  // Track if user is actively editing a specific channel to prevent background updates from wiping unsaved edits
  const activeEdits = useRef<Record<string, boolean>>({});

  // Synchronize with external serviceConfig updates safely
  useEffect(() => {
    if (!serviceConfig) return;

    if (!activeEdits.current.whatsapp) {
      setWhatsappEnabled(serviceConfig.whatsapp?.enabled ?? false);
      setWhatsappPhoneId(serviceConfig.whatsapp?.phoneNumberId || '');
      setWhatsappHasToken(Boolean(serviceConfig.whatsapp?.apiToken || serviceConfig.whatsapp?.hasApiToken));
      setWhatsappClearToken(false);
    }

    if (!activeEdits.current.telegram) {
      setTelegramEnabled(serviceConfig.telegram?.enabled ?? false);
      setTelegramBotUser(serviceConfig.telegram?.botUsername || '');
      setTelegramChatId(serviceConfig.telegram?.chatId || '');
      setTelegramHasToken(Boolean(serviceConfig.telegram?.botToken || serviceConfig.telegram?.hasBotToken));
      setTelegramClearToken(false);
    }

    if (!activeEdits.current.email) {
      setEmailEnabled(serviceConfig.email?.enabled ?? false);
      setEmailFrom(serviceConfig.email?.fromEmail || '');
    }

    if (!activeEdits.current.sms) {
      setSmsEnabled(serviceConfig.sms?.enabled ?? false);
      setSmsTitle(serviceConfig.sms?.senderTitle || '');
    }

    if (!activeEdits.current.webhook) {
      setWebhookEnabled(serviceConfig.webhook?.enabled ?? false);
      setWebhookEndpoint(serviceConfig.webhook?.defaultEndpoint || '');
      setWebhookHasSecret(Boolean(serviceConfig.webhook?.secretHeader || serviceConfig.webhook?.hasSecretHeader));
      setWebhookClearSecret(false);
    }
  }, [serviceConfig]);

  // Flash saved badge helper
  const triggerSavedBadge = (channelKey: string) => {
    setSavedChannelBadge(channelKey);
    setTimeout(() => {
      setSavedChannelBadge((cur) => (cur === channelKey ? null : cur));
    }, 3500);
  };

  // INDEPENDENT SAVE: Save ONLY the selected channel so other channels are NEVER touched!
  const saveSingleChannel = async (channelKey: 'whatsapp' | 'telegram' | 'email' | 'sms' | 'webhook') => {
    setSavingChannel(channelKey);
    try {
      let payload: any = {};

      if (channelKey === 'telegram') {
        payload = {
          telegram: {
            enabled: telegramEnabled,
            botUsername: telegramBotUser.trim(),
            chatId: telegramChatId.trim(),
            ...(telegramClearToken
              ? { clearBotToken: true, botToken: '__CLEAR__' }
              : telegramBotToken.trim()
              ? { botToken: telegramBotToken.trim() }
              : {}),
          },
        };
      } else if (channelKey === 'whatsapp') {
        payload = {
          whatsapp: {
            enabled: whatsappEnabled,
            phoneNumberId: whatsappPhoneId.trim(),
            provider: (whatsappToken.trim() || whatsappHasToken) ? 'cloud_api' : (serviceConfig?.whatsapp?.provider || 'simulated'),
            ...(whatsappClearToken
              ? { clearApiToken: true, apiToken: '__CLEAR__' }
              : whatsappToken.trim()
              ? { apiToken: whatsappToken.trim() }
              : {}),
          },
        };
      } else if (channelKey === 'email') {
        payload = {
          email: {
            enabled: emailEnabled,
            fromEmail: emailFrom.trim(),
            provider: serviceConfig?.email?.provider || 'simulated',
          },
        };
      } else if (channelKey === 'sms') {
        payload = {
          sms: {
            enabled: smsEnabled,
            senderTitle: smsTitle.trim(),
            provider: serviceConfig?.sms?.provider || 'simulated',
          },
        };
      } else if (channelKey === 'webhook') {
        payload = {
          webhook: {
            enabled: webhookEnabled,
            defaultEndpoint: webhookEndpoint.trim(),
            ...(webhookClearSecret
              ? { clearSecretHeader: true, secretHeader: '__CLEAR__' }
              : webhookSecretHeader.trim()
              ? { secretHeader: webhookSecretHeader.trim() }
              : {}),
          },
        };
      }

      await onSaveServiceConfig(payload);
      activeEdits.current[channelKey] = false;

      // Clear input fields for sensitive secrets after successful save
      if (channelKey === 'telegram') {
        if (telegramBotToken.trim()) setTelegramHasToken(true);
        if (telegramClearToken) setTelegramHasToken(false);
        setTelegramBotToken('');
        setTelegramClearToken(false);
      } else if (channelKey === 'whatsapp') {
        if (whatsappToken.trim()) setWhatsappHasToken(true);
        if (whatsappClearToken) setWhatsappHasToken(false);
        setWhatsappToken('');
        setWhatsappClearToken(false);
      } else if (channelKey === 'webhook') {
        if (webhookSecretHeader.trim()) setWebhookHasSecret(true);
        if (webhookClearSecret) setWebhookHasSecret(false);
        setWebhookSecretHeader('');
        setWebhookClearSecret(false);
      }

      triggerSavedBadge(channelKey);
    } finally {
      setSavingChannel(null);
    }
  };

  // GLOBAL SAVE: Saves all channels safely without wiping unentered secrets
  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingChannel('all');
    try {
      await onSaveServiceConfig({
        whatsapp: {
          enabled: whatsappEnabled,
          phoneNumberId: whatsappPhoneId.trim(),
          provider: (whatsappToken.trim() || whatsappHasToken) ? 'cloud_api' : (serviceConfig?.whatsapp?.provider || 'simulated'),
          ...(whatsappClearToken
            ? { clearApiToken: true, apiToken: '__CLEAR__' }
            : whatsappToken.trim()
            ? { apiToken: whatsappToken.trim() }
            : {}),
        },
        telegram: {
          enabled: telegramEnabled,
          botUsername: telegramBotUser.trim(),
          chatId: telegramChatId.trim(),
          ...(telegramClearToken
            ? { clearBotToken: true, botToken: '__CLEAR__' }
            : telegramBotToken.trim()
            ? { botToken: telegramBotToken.trim() }
            : {}),
        },
        email: {
          enabled: emailEnabled,
          fromEmail: emailFrom.trim(),
          provider: serviceConfig?.email?.provider || 'simulated',
        },
        sms: {
          enabled: smsEnabled,
          senderTitle: smsTitle.trim(),
          provider: serviceConfig?.sms?.provider || 'simulated',
        },
        webhook: {
          enabled: webhookEnabled,
          defaultEndpoint: webhookEndpoint.trim(),
          ...(webhookClearSecret
            ? { clearSecretHeader: true, secretHeader: '__CLEAR__' }
            : webhookSecretHeader.trim()
            ? { secretHeader: webhookSecretHeader.trim() }
            : {}),
        },
      });

      activeEdits.current = {};
      setWhatsappToken('');
      setTelegramBotToken('');
      setWebhookSecretHeader('');
      setWhatsappClearToken(false);
      setTelegramClearToken(false);
      setWebhookClearSecret(false);
      triggerSavedBadge('all');
    } finally {
      setSavingChannel(null);
    }
  };

  // Test Dispatcher State
  const [testChannel, setTestChannel] = useState<NotificationChannel>('telegram');
  const [testRecipient, setTestRecipient] = useState(telegramChatId || '');
  const [testTitle, setTestTitle] = useState('🚨 Kritik Sıcaklık Uyarısı (Test)');
  const [testMsg, setTestMsg] = useState('İstanbul Depo İklim Sensörü 42.5°C eşik değerini aştı.');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; response: string; error?: string } | null>(null);
  const testSectionRef = useRef<HTMLDivElement | null>(null);

  // Quick switch test channel and pre-fill destination
  const handleQuickTest = (channel: NotificationChannel, defaultDest = '') => {
    setTestChannel(channel);
    setTestRecipient(defaultDest);
    setTestResult(null);
    testSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleTestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testRecipient.trim()) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await onSendTestMessage(testChannel, testRecipient.trim(), testTitle, testMsg);
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
      {/* Informative Security & Isolation Banner */}
      <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-800/40 flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-indigo-600/10 dark:bg-indigo-400/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
          <ShieldCheck className="w-4 h-4" />
        </div>
        <div className="text-xs text-slate-700 dark:text-slate-300">
          <p className="font-semibold text-slate-900 dark:text-white mb-0.5">
            Bağımsız Kanal Yapılandırması ve Güvenli Kasa İzolasyonu
          </p>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
            Her bildirim kanalı birbirinden tamamen izole edilmiştir. Bir kanalda değişiklik yapıp kaydettiğinizde diğer kanalların API anahtarları veya parametreleri asla sıfırlanmaz veya değişmez. Token alanlarını boş bıraktığınızda mevcut kayıtlı şifreleriniz korunur.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* ========================================================================= */}
        {/* 1. TELEGRAM BOT API CARD (Highlighted for user priority)                  */}
        {/* ========================================================================= */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border-2 border-sky-300/80 dark:border-sky-500/30 shadow-sm space-y-4 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-sky-500/5 rounded-full blur-2xl pointer-events-none" />

          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center border border-sky-200/50 dark:border-sky-500/20">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Telegram Bot API</h4>
                    {telegramEnabled ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                        Aktif
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500">
                        Pasif
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Anlık Alarm ve Uyarı Bildirim Botu</p>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={telegramEnabled}
                  onChange={(e) => {
                    activeEdits.current.telegram = true;
                    setTelegramEnabled(e.target.checked);
                  }}
                  className="rounded text-sky-600 w-4 h-4 cursor-pointer focus:ring-sky-500"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Etkinleştir</span>
              </label>
            </div>

            {/* Inputs */}
            <div className="space-y-3.5">
              {/* Bot Token */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-sky-500" />
                    <span>Telegram Bot Token (BotFather)</span>
                  </label>
                  {telegramHasToken && !telegramClearToken && (
                    <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded-md border border-emerald-200/50 dark:border-emerald-800/30">
                      <Check className="w-3 h-3" /> Token Kasada Tanımlı
                    </span>
                  )}
                  {telegramClearToken && (
                    <span className="text-[10px] font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 px-2 py-0.5 rounded-md border border-rose-200/50">
                      Kaydedildiğinde silinecek
                    </span>
                  )}
                </div>

                <div className="relative">
                  <input
                    type={telegramShowToken ? 'text' : 'password'}
                    placeholder={
                      telegramHasToken && !telegramClearToken
                        ? '•••••••••••••••• (Mevcut tokeni korumak için boş bırakın)'
                        : 'Örn: 7123456789:AAHk...'
                    }
                    value={telegramBotToken}
                    autoComplete="new-password"
                    spellCheck={false}
                    onChange={(e) => {
                      activeEdits.current.telegram = true;
                      setTelegramBotToken(e.target.value);
                      if (telegramClearToken) setTelegramClearToken(false);
                    }}
                    className="w-full pl-3 pr-20 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setTelegramShowToken(!telegramShowToken)}
                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                      title={telegramShowToken ? 'Gizle' : 'Göster'}
                    >
                      {telegramShowToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    {telegramHasToken && !telegramClearToken && (
                      <button
                        type="button"
                        onClick={() => {
                          activeEdits.current.telegram = true;
                          setTelegramClearToken(true);
                          setTelegramBotToken('');
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                        title="Mevcut Tokeni Kasadan Temizle"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  @BotFather tarafından üretilen gizli API anahtarıdır. Değiştirmek istemiyorsanız boş bırakmanız yeterlidir.
                </p>
              </div>

              {/* Bot Username */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Bot Kullanıcı Adı (Username)
                </label>
                <input
                  type="text"
                  placeholder="@NexusAlarmBot"
                  value={telegramBotUser}
                  onChange={(e) => {
                    activeEdits.current.telegram = true;
                    setTelegramBotUser(e.target.value);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>

              {/* Default Chat ID */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Varsayılan Telegram Chat ID / Grup ID
                </label>
                <input
                  type="text"
                  placeholder="Örn: 129837465 veya -100192837465"
                  value={telegramChatId}
                  onChange={(e) => {
                    activeEdits.current.telegram = true;
                    setTelegramChatId(e.target.value);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Alarmların gideceği varsayılan Telegram sohbet veya grup ID'si. Kullanıcıların profilindeki Chat ID'ye ek olarak veya genel alarm kanalı olarak kullanılır.
                </p>
              </div>
            </div>
          </div>

          {/* Card Footer Actions */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={() => handleQuickTest('telegram', telegramChatId)}
              className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:text-sky-500 flex items-center gap-1.5 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Bu Kanalı Test Et</span>
            </button>

            <div className="flex items-center gap-2">
              {savedChannelBadge === 'telegram' && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4" /> Kaydedildi
                </span>
              )}
              <button
                type="button"
                disabled={savingChannel === 'telegram' || loadingAction === 'serviceConfig'}
                onClick={() => saveSingleChannel('telegram')}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-xl text-xs shadow-sm shadow-sky-600/20 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {savingChannel === 'telegram' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Kaydediliyor...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Telegram Ayarlarını Kaydet</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. META WHATSAPP CLOUD API CARD                                           */}
        {/* ========================================================================= */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200/50 dark:border-emerald-500/20">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Meta WhatsApp Cloud API</h4>
                    {whatsappEnabled ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                        Aktif
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500">
                        Pasif
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Resmi İşletme WhatsApp Mesajları</p>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={whatsappEnabled}
                  onChange={(e) => {
                    activeEdits.current.whatsapp = true;
                    setWhatsappEnabled(e.target.checked);
                  }}
                  className="rounded text-emerald-600 w-4 h-4 cursor-pointer focus:ring-emerald-500"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Etkinleştir</span>
              </label>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Phone Number ID
                </label>
                <input
                  type="text"
                  placeholder="Örn: 104928374928174"
                  value={whatsappPhoneId}
                  onChange={(e) => {
                    activeEdits.current.whatsapp = true;
                    setWhatsappPhoneId(e.target.value);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Permanent System User API Token</span>
                  </label>
                  {whatsappHasToken && !whatsappClearToken && (
                    <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded-md border border-emerald-200/50">
                      <Check className="w-3 h-3" /> Token Kasada Tanımlı
                    </span>
                  )}
                  {whatsappClearToken && (
                    <span className="text-[10px] font-medium text-rose-600 dark:text-rose-400 bg-rose-50 px-2 py-0.5 rounded-md">
                      Kaydedildiğinde silinecek
                    </span>
                  )}
                </div>

                <div className="relative">
                  <input
                    type={whatsappShowToken ? 'text' : 'password'}
                    placeholder={
                      whatsappHasToken && !whatsappClearToken
                        ? '•••••••••••••••• (Mevcut tokeni korumak için boş bırakın)'
                        : 'EAAG...'
                    }
                    value={whatsappToken}
                    autoComplete="new-password"
                    spellCheck={false}
                    onChange={(e) => {
                      activeEdits.current.whatsapp = true;
                      setWhatsappToken(e.target.value);
                      if (whatsappClearToken) setWhatsappClearToken(false);
                    }}
                    className="w-full pl-3 pr-20 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setWhatsappShowToken(!whatsappShowToken)}
                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                      title={whatsappShowToken ? 'Gizle' : 'Göster'}
                    >
                      {whatsappShowToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    {whatsappHasToken && !whatsappClearToken && (
                      <button
                        type="button"
                        onClick={() => {
                          activeEdits.current.whatsapp = true;
                          setWhatsappClearToken(true);
                          setWhatsappToken('');
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                        title="Tokeni Kasadan Temizle"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={() => handleQuickTest('whatsapp')}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 flex items-center gap-1.5 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Bu Kanalı Test Et</span>
            </button>

            <div className="flex items-center gap-2">
              {savedChannelBadge === 'whatsapp' && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4" /> Kaydedildi
                </span>
              )}
              <button
                type="button"
                disabled={savingChannel === 'whatsapp' || loadingAction === 'serviceConfig'}
                onClick={() => saveSingleChannel('whatsapp')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs shadow-sm shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {savingChannel === 'whatsapp' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Kaydediliyor...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>WhatsApp Ayarlarını Kaydet</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. EMAIL (SMTP / RESEND) CARD                                             */}
        {/* ========================================================================= */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200/50 dark:border-indigo-500/20">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">E-posta Bildirimleri (SMTP / Resend)</h4>
                    {emailEnabled ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                        Aktif
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500">
                        Pasif
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Alarm ve Olay E-postaları Gönderimi</p>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={emailEnabled}
                  onChange={(e) => {
                    activeEdits.current.email = true;
                    setEmailEnabled(e.target.checked);
                  }}
                  className="rounded text-indigo-600 w-4 h-4 cursor-pointer focus:ring-indigo-500"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Etkinleştir</span>
              </label>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Gönderici E-posta Adresi (From)
                </label>
                <input
                  type="email"
                  placeholder="alarms@iotplatform.com"
                  value={emailFrom}
                  onChange={(e) => {
                    activeEdits.current.email = true;
                    setEmailFrom(e.target.value);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  İleri düzey SMTP sunucu adresi ve Resend API anahtarı Hesap Ayarları veya Güvenlik Kasası panelinden yönetilir.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={() => handleQuickTest('email')}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 flex items-center gap-1.5 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Bu Kanalı Test Et</span>
            </button>

            <div className="flex items-center gap-2">
              {savedChannelBadge === 'email' && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4" /> Kaydedildi
                </span>
              )}
              <button
                type="button"
                disabled={savingChannel === 'email' || loadingAction === 'serviceConfig'}
                onClick={() => saveSingleChannel('email')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs shadow-sm shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {savingChannel === 'email' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Kaydediliyor...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>E-posta Ayarlarını Kaydet</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 4. SMS GATEWAY CARD                                                       */}
        {/* ========================================================================= */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-200/50 dark:border-amber-500/20">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">SMS Ağ Geçidi</h4>
                    {smsEnabled ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                        Aktif
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500">
                        Pasif
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">NetGSM / Twilio SMS Başlığı</p>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={smsEnabled}
                  onChange={(e) => {
                    activeEdits.current.sms = true;
                    setSmsEnabled(e.target.checked);
                  }}
                  className="rounded text-amber-600 w-4 h-4 cursor-pointer focus:ring-amber-500"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Etkinleştir</span>
              </label>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  SMS Gönderici Başlığı (Header)
                </label>
                <input
                  type="text"
                  placeholder="IOT_ALARM"
                  value={smsTitle}
                  onChange={(e) => {
                    activeEdits.current.sms = true;
                    setSmsTitle(e.target.value);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={() => handleQuickTest('sms')}
              className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-500 flex items-center gap-1.5 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Bu Kanalı Test Et</span>
            </button>

            <div className="flex items-center gap-2">
              {savedChannelBadge === 'sms' && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4" /> Kaydedildi
                </span>
              )}
              <button
                type="button"
                disabled={savingChannel === 'sms' || loadingAction === 'serviceConfig'}
                onClick={() => saveSingleChannel('sms')}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl text-xs shadow-sm shadow-amber-600/20 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {savingChannel === 'sms' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Kaydediliyor...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>SMS Ayarlarını Kaydet</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 5. WEBHOOK REST ENDPOINT CARD                                             */}
        {/* ========================================================================= */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 md:col-span-2 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center border border-cyan-200/50 dark:border-cyan-500/20">
                  <Webhook className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Webhook & Harici HTTP Entegrasyonu</h4>
                    {webhookEnabled ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                        Aktif
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500">
                        Pasif
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Otomatik JSON payload POST çağrıları ve Güvenlik Başlığı</p>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={webhookEnabled}
                  onChange={(e) => {
                    activeEdits.current.webhook = true;
                    setWebhookEnabled(e.target.checked);
                  }}
                  className="rounded text-cyan-600 w-4 h-4 cursor-pointer focus:ring-cyan-500"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Etkinleştir</span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Varsayılan Webhook URL Adresi
                </label>
                <input
                  type="url"
                  placeholder="https://api.sirketiniz.com/iot/alarms"
                  value={webhookEndpoint}
                  onChange={(e) => {
                    activeEdits.current.webhook = true;
                    setWebhookEndpoint(e.target.value);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-cyan-500" />
                    <span>Güvenlik Başlığı / Secret Header (X-Webhook-Secret)</span>
                  </label>
                  {webhookHasSecret && !webhookClearSecret && (
                    <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded-md border border-emerald-200/50">
                      <Check className="w-3 h-3" /> Secret Tanımlı
                    </span>
                  )}
                  {webhookClearSecret && (
                    <span className="text-[10px] font-medium text-rose-600 dark:text-rose-400 bg-rose-50 px-2 py-0.5 rounded-md">
                      Kaydedildiğinde silinecek
                    </span>
                  )}
                </div>

                <div className="relative">
                  <input
                    type={webhookShowSecret ? 'text' : 'password'}
                    placeholder={
                      webhookHasSecret && !webhookClearSecret
                        ? '•••••••••••••••• (Mevcut secretı korumak için boş bırakın)'
                        : 'Örn: sec_header_xyz9876'
                    }
                    value={webhookSecretHeader}
                    autoComplete="new-password"
                    spellCheck={false}
                    onChange={(e) => {
                      activeEdits.current.webhook = true;
                      setWebhookSecretHeader(e.target.value);
                      if (webhookClearSecret) setWebhookClearSecret(false);
                    }}
                    className="w-full pl-3 pr-20 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setWebhookShowSecret(!webhookShowSecret)}
                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                      title={webhookShowSecret ? 'Gizle' : 'Göster'}
                    >
                      {webhookShowSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    {webhookHasSecret && !webhookClearSecret && (
                      <button
                        type="button"
                        onClick={() => {
                          activeEdits.current.webhook = true;
                          setWebhookClearSecret(true);
                          setWebhookSecretHeader('');
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                        title="Secret Başlığını Temizle"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={() => handleQuickTest('webhook', webhookEndpoint)}
              className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 flex items-center gap-1.5 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Bu Kanalı Test Et</span>
            </button>

            <div className="flex items-center gap-2">
              {savedChannelBadge === 'webhook' && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4" /> Kaydedildi
                </span>
              )}
              <button
                type="button"
                disabled={savingChannel === 'webhook' || loadingAction === 'serviceConfig'}
                onClick={() => saveSingleChannel('webhook')}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl text-xs shadow-sm shadow-cyan-600/20 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {savingChannel === 'webhook' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Kaydediliyor...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Webhook Ayarlarını Kaydet</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Global Save Button */}
      <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <Info className="w-4 h-4 text-slate-400" />
          <span>Dilerseniz tüm kanalları tek tıkla toplu olarak kaydedebilirsiniz. Boş bırakılan şifreler korunur.</span>
        </div>

        <div className="flex items-center gap-3">
          {savedChannelBadge === 'all' && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4" /> Tüm Kanallar Kaydedildi
            </span>
          )}
          <button
            type="button"
            disabled={savingChannel === 'all' || loadingAction === 'serviceConfig'}
            onClick={handleSaveAll}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            {savingChannel === 'all' || loadingAction === 'serviceConfig' ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Kaydediliyor...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Tüm Bildirim Servis Ayarlarını Kaydet</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* LIVE TEST DISPATCHER SECTION                                              */}
      {/* ========================================================================= */}
      <div
        ref={testSectionRef}
        className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-base font-bold text-slate-900 dark:text-white">Canlı Bildirim Test Gönderimi</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Yapılandırılan Telegram, WhatsApp, SMS veya E-posta kanallarına anında canlı test iletisi gönderin.
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
                onChange={(e) => {
                  const ch = e.target.value as NotificationChannel;
                  setTestChannel(ch);
                  if (ch === 'telegram') {
                    setTestRecipient(telegramChatId || '');
                  } else if (ch === 'webhook') {
                    setTestRecipient(webhookEndpoint || '');
                  }
                }}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-semibold"
              >
                <option value="telegram">Telegram (Chat ID / Grup ID)</option>
                <option value="whatsapp">WhatsApp (+90 Telefon Numarası)</option>
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
                  testChannel === 'telegram'
                    ? '129837465 veya -100123456789'
                    : testChannel === 'whatsapp' || testChannel === 'sms'
                    ? '+905321234567'
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
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 animate-fadeIn ${
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
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>İletiliyor...</span>
                </>
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
