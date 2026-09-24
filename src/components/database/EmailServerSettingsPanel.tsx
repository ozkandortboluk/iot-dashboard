import React, { useState, useEffect } from 'react';
import {
  Mail,
  Server,
  Send,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  Save,
  ShieldCheck,
  Globe,
  Key,
  Info,
  ExternalLink,
  Check,
  Copy,
  Terminal,
  Zap,
} from 'lucide-react';
import { apiFetch as fetch } from '../../lib/apiFetch';

interface EmailConfigState {
  enabled: boolean;
  provider: 'resend' | 'smtp' | 'simulated';
  fromEmail: string;
  fromName: string;
  resendApiKeyMasked: string;
  hasResendApiKey: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassMasked: string;
  hasSmtpPass: boolean;
  appBaseUrl: string;
  isConfigured: boolean;
}

export const EmailServerSettingsPanel: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form Fields
  const [provider, setProvider] = useState<'resend' | 'smtp' | 'simulated'>('resend');
  const [enabled, setEnabled] = useState<boolean>(true);
  const [fromEmail, setFromEmail] = useState<string>('bildirim@nexusnodeiot.com.tr');
  const [fromName, setFromName] = useState<string>('NexusNode IoT Cloud');
  const [appBaseUrl, setAppBaseUrl] = useState<string>('https://nexusnodeiot.com.tr');

  // Resend API
  const [resendApiKey, setResendApiKey] = useState<string>('');
  const [showResendApiKey, setShowResendApiKey] = useState<boolean>(false);
  const [hasResendApiKey, setHasResendApiKey] = useState<boolean>(false);
  const [resendApiKeyMasked, setResendApiKeyMasked] = useState<string>('');

  // SMTP Settings
  const [smtpHost, setSmtpHost] = useState<string>('');
  const [smtpPort, setSmtpPort] = useState<number>(587);
  const [smtpSecure, setSmtpSecure] = useState<boolean>(false);
  const [smtpUser, setSmtpUser] = useState<string>('');
  const [smtpPass, setSmtpPass] = useState<string>('');
  const [showSmtpPass, setShowSmtpPass] = useState<boolean>(false);
  const [hasSmtpPass, setHasSmtpPass] = useState<boolean>(false);
  const [smtpPassMasked, setSmtpPassMasked] = useState<string>('');

  // Overall status
  const [isConfigured, setIsConfigured] = useState<boolean>(false);

  // Test Email
  const [testRecipient, setTestRecipient] = useState<string>('');
  const [testResult, setTestResult] = useState<{
    success: boolean;
    provider?: string;
    messageId?: string;
    error?: string;
    simulated?: boolean;
    domainUnverified?: boolean;
  } | null>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Load configuration from server
  const loadConfig = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/system/email-config');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Ayarlar yüklenemedi`);
      }
      const data: EmailConfigState = await res.json();
      setProvider(data.provider || 'resend');
      setEnabled(data.enabled !== false);
      setFromEmail(data.fromEmail || 'bildirim@nexusnodeiot.com.tr');
      setFromName(data.fromName || 'NexusNode IoT Cloud');
      setAppBaseUrl(data.appBaseUrl || 'https://nexusnodeiot.com.tr');

      setHasResendApiKey(data.hasResendApiKey);
      setResendApiKeyMasked(data.resendApiKeyMasked || '');
      setResendApiKey(data.resendApiKeyMasked || '');

      setSmtpHost(data.smtpHost || '');
      setSmtpPort(data.smtpPort || 587);
      setSmtpSecure(Boolean(data.smtpSecure));
      setSmtpUser(data.smtpUser || '');
      setHasSmtpPass(data.hasSmtpPass);
      setSmtpPassMasked(data.smtpPassMasked || '');
      setSmtpPass(data.smtpPassMasked || '');

      setIsConfigured(data.isConfigured);
    } catch (err: any) {
      console.error('[EmailServerSettingsPanel] Config load error:', err);
      setErrorMsg(err?.message || 'E-posta ayarları yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  // Save configuration
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const payload: any = {
        enabled,
        provider,
        fromEmail: fromEmail.trim(),
        fromName: fromName.trim(),
        appBaseUrl: appBaseUrl.trim(),
      };

      if (provider === 'resend') {
        if (resendApiKey && resendApiKey !== resendApiKeyMasked) {
          payload.resendApiKey = resendApiKey.trim();
        }
      } else if (provider === 'smtp') {
        payload.smtpHost = smtpHost.trim();
        payload.smtpPort = Number(smtpPort);
        payload.smtpSecure = Boolean(smtpSecure);
        payload.smtpUser = smtpUser.trim();
        if (smtpPass && smtpPass !== smtpPassMasked) {
          payload.smtpPass = smtpPass.trim();
        }
      }

      const res = await fetch('/api/system/email-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ayarlar kaydedilemedi');
      }

      setSuccessMsg('E-posta sunucu ayarları başarıyla kaydedildi.');
      setTimeout(() => setSuccessMsg(null), 4000);

      // Refresh config with newly returned masked fields
      if (data.config) {
        setHasResendApiKey(data.config.hasResendApiKey);
        setResendApiKeyMasked(data.config.resendApiKeyMasked || '');
        setResendApiKey(data.config.resendApiKeyMasked || '');
        setHasSmtpPass(data.config.hasSmtpPass);
        setSmtpPassMasked(data.config.smtpPassMasked || '');
        setSmtpPass(data.config.smtpPassMasked || '');
        setIsConfigured(data.config.isConfigured);
      }
    } catch (err: any) {
      console.error('[EmailServerSettingsPanel] Save error:', err);
      setErrorMsg(err?.message || 'Kaydetme sırasında bir hata meydana geldi.');
    } finally {
      setSaving(false);
    }
  };

  // Dispatch Test Email
  const handleTestEmail = async () => {
    if (!testRecipient || !testRecipient.includes('@')) {
      setErrorMsg('Lütfen test e-postasının gönderileceği geçerli bir adres giriniz.');
      return;
    }

    setTesting(true);
    setTestResult(null);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/system/email-config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testRecipient.trim() }),
      });

      const data = await res.json();
      setTestResult(data);

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Test e-postası gönderilemedi.');
      }
    } catch (err: any) {
      console.error('[EmailServerSettingsPanel] Test email error:', err);
      setErrorMsg(err?.message || 'Test gönderimi sırasında hata oluştu.');
    } finally {
      setTesting(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500 dark:text-slate-400 space-y-3">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
        <span className="text-sm font-medium">E-posta sunucu yapılandırması yükleniyor...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero Card */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-900/40 rounded-2xl p-5 sm:p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-indigo-600/30 border border-indigo-500/30 rounded-xl text-indigo-400 shadow-inner">
              <Mail className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight">E-Posta & SMTP / Resend Sunucu Ayarları</h2>
                {isConfigured ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    CANLI / AKTİF ({provider.toUpperCase()})
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    SİMÜLASYON MODU
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                İşlem e-postaları (Şifre Sıfırlama, Kritik Cihaz Alarmları, Yönetici Raporları) için giden sunucu yapılandırması.
                Veriler sunucuda şifrelenerek saklanır ve yetkisiz erişimlere karşı korunur.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={loadConfig}
              title="Yenile"
              className="p-2.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 rounded-xl border border-slate-700/60 transition cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-200 text-sm flex items-center gap-3 shadow-sm animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="font-medium">{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-800 dark:text-rose-200 text-sm flex items-center gap-3 shadow-sm">
          <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
          <span className="font-medium">{errorMsg}</span>
        </div>
      )}

      {/* Main Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Provider & Server Form (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
            
            {/* 1. Provider Selection Cards */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                E-Posta Servis Sağlayıcısı Seçimi
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Resend Option */}
                <div
                  onClick={() => setProvider('resend')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                    provider === 'resend'
                      ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 dark:border-indigo-500 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-indigo-500" />
                        Resend API
                      </span>
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                        Önerilen
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Resend REST API ile yüksek teslimat oranı, DNS doğrulamalı gönderim.
                    </p>
                  </div>
                  {provider === 'resend' && (
                    <div className="mt-3 flex items-center text-xs font-semibold text-indigo-600 dark:text-indigo-400 gap-1">
                      <Check className="w-3.5 h-3.5" /> Seçildi
                    </div>
                  )}
                </div>

                {/* SMTP Option */}
                <div
                  onClick={() => setProvider('smtp')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                    provider === 'smtp'
                      ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 dark:border-indigo-500 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Server className="w-4 h-4 text-sky-500" />
                        Özel SMTP
                      </span>
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300">
                        Nodemailer
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Kendi VPS veya kurumsal e-posta sunucunuz üzerinden SMTP protokolü.
                    </p>
                  </div>
                  {provider === 'smtp' && (
                    <div className="mt-3 flex items-center text-xs font-semibold text-indigo-600 dark:text-indigo-400 gap-1">
                      <Check className="w-3.5 h-3.5" /> Seçildi
                    </div>
                  )}
                </div>

                {/* Simulation Option */}
                <div
                  onClick={() => setProvider('simulated')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                    provider === 'simulated'
                      ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 dark:border-indigo-500 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Terminal className="w-4 h-4 text-amber-500" />
                        Simülasyon
                      </span>
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
                        Test Modu
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      E-postalar dışarıya gönderilmez; sunucu terminaline yazdırılır.
                    </p>
                  </div>
                  {provider === 'simulated' && (
                    <div className="mt-3 flex items-center text-xs font-semibold text-indigo-600 dark:text-indigo-400 gap-1">
                      <Check className="w-3.5 h-3.5" /> Seçildi
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 pt-5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-500" />
                Genel Gönderici & Platform Bilgileri
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Gönderici E-Posta */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Gönderici E-Posta Adresi (EMAIL_FROM)
                    </label>
                    {provider === 'resend' && fromEmail !== 'onboarding@resend.dev' && (
                      <button
                        type="button"
                        onClick={() => setFromEmail('onboarding@resend.dev')}
                        className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                        title="Resend varsayılan test adresine ayarla"
                      >
                        ⚡ Test için onboarding@resend.dev Kullan
                      </button>
                    )}
                  </div>
                  <input
                    type="email"
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    placeholder="bildirim@nexusnodeiot.com.tr"
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400">
                    <span>
                      {provider === 'resend' && fromEmail === 'onboarding@resend.dev'
                        ? '✅ Resend varsayılan test adresi aktif. (Herhangi bir alan adı doğrulaması gerektirmez)'
                        : 'Resend veya SMTP üzerinde doğrulanmış alan adı adresi.'}
                    </span>
                  </div>
                </div>

                {/* Gönderici Başlığı */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Gönderici Adı (From Name)
                  </label>
                  <input
                    type="text"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    placeholder="NexusNode IoT Cloud"
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Kullanıcının gelen kutusunda göreceği gönderen şirket/sistem adı.
                  </span>
                </div>

                {/* Platform Base URL */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Platform Genel Web Adresi (APP_BASE_URL)
                  </label>
                  <input
                    type="url"
                    value={appBaseUrl}
                    onChange={(e) => setAppBaseUrl(e.target.value)}
                    placeholder="https://nexusnodeiot.com.tr"
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Şifre sıfırlama e-postalarındaki tıklanabilir bağlantının kök adresi.
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Provider-Specific Fields */}
            {provider === 'resend' && (
              <div className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Key className="w-4 h-4 text-indigo-500" />
                    Resend API Kimlik Bilgileri
                  </h3>
                  <a
                    href="https://resend.com/api-keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    <span>Resend Konsolundan Al</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Resend API Anahtarı (RESEND_API_KEY)
                  </label>
                  <div className="relative">
                    <input
                      type={showResendApiKey ? 'text' : 'password'}
                      value={resendApiKey}
                      onChange={(e) => setResendApiKey(e.target.value)}
                      placeholder={hasResendApiKey ? '••••••••••••••••' : 're_1234567890abcdef...'}
                      className="w-full px-3.5 py-2.5 pr-11 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowResendApiKey(!showResendApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                    >
                      {showResendApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400">
                    <span>
                      {hasResendApiKey ? '✅ Sistemde kayıtlı anahtar mevcut. Değiştirmek için yeni anahtarı giriniz.' : 'Henüz bir API anahtarı girilmedi.'}
                    </span>
                    {hasResendApiKey && (
                      <span className="font-mono text-emerald-500 dark:text-emerald-400">
                        {resendApiKeyMasked}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {provider === 'smtp' && (
              <div className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Server className="w-4 h-4 text-sky-500" />
                  SMTP Sunucu Parametreleri
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* SMTP Host */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      SMTP Sunucu Adresi (Host)
                    </label>
                    <input
                      type="text"
                      value={smtpHost}
                      onChange={(e) => setSmtpHost(e.target.value)}
                      placeholder="mail.nexusnodeiot.com.tr veya smtp.resend.com"
                      required={provider === 'smtp'}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                    />
                  </div>

                  {/* SMTP Port */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Port Numarası
                    </label>
                    <input
                      type="number"
                      value={smtpPort}
                      onChange={(e) => setSmtpPort(parseInt(e.target.value, 10) || 587)}
                      placeholder="587"
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* SMTP Kullanıcı Adı */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      SMTP Kullanıcı Adı
                    </label>
                    <input
                      type="text"
                      value={smtpUser}
                      onChange={(e) => setSmtpUser(e.target.value)}
                      placeholder="bildirim@nexusnodeiot.com.tr"
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {/* SMTP Parolası */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      SMTP Parolası
                    </label>
                    <div className="relative">
                      <input
                        type={showSmtpPass ? 'text' : 'password'}
                        value={smtpPass}
                        onChange={(e) => setSmtpPass(e.target.value)}
                        placeholder={hasSmtpPass ? '••••••••••••••••' : 'SMTP Şifresi'}
                        className="w-full px-3.5 py-2.5 pr-11 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSmtpPass(!showSmtpPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                      >
                        {showSmtpPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* SSL / TLS Toggle */}
                <div className="flex items-center gap-3 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={smtpSecure}
                      onChange={(e) => setSmtpSecure(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Doğrudan SSL / TLS Kullan (Genellikle Port 465 içindir; Port 587 için kapalı tutunuz - STARTTLS)
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="border-t border-slate-200 dark:border-slate-800 pt-5 flex items-center justify-between flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  E-Posta Bildirim ve Sıfırlama Gönderimlerini Aktif Tut
                </span>
              </label>

              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-md hover:shadow-indigo-500/20 disabled:opacity-50 cursor-pointer"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Kaydediliyor...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Ayarları Kaydet</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Live Testing Tool & DNS Guidance (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Test Email Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-lg">
                <Send className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Canlı Test Gönderimi</h3>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Sunucu bağlantısını anında doğrulayın</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Alıcı Test E-Posta Adresi
              </label>
              <input
                type="email"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder="ornek@alanadiniz.com"
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              type="button"
              onClick={handleTestEmail}
              disabled={testing || !testRecipient}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {testing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Gönderiliyor...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Test E-Postası Gönder</span>
                </>
              )}
            </button>

            {/* Test Feedback Box */}
            {testResult && (
              <div
                className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                  testResult.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                }`}
              >
                <div className="flex items-center gap-2 font-bold">
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  )}
                  <span>{testResult.success ? 'E-Posta Başarıyla İletildi!' : 'Gönderim Başarısız!'}</span>
                </div>

                <div className="text-[11px] space-y-1 font-mono text-slate-600 dark:text-slate-300">
                  {testResult.provider && (
                    <div>Sağlayıcı: <strong className="uppercase">{testResult.provider}</strong></div>
                  )}
                  {testResult.messageId && (
                    <div>Mesaj ID: <span className="truncate block">{testResult.messageId}</span></div>
                  )}
                  {testResult.error && (
                    <div className="text-rose-600 dark:text-rose-400 font-sans mt-1 leading-relaxed">{testResult.error}</div>
                  )}
                  {testResult.simulated && (
                    <div className="text-amber-600 dark:text-amber-400 font-sans text-[10px]">
                      ℹ️ Sistem simülasyon modunda çalışıyor; e-posta sunucu konsoluna yazdırıldı.
                    </div>
                  )}
                </div>

                {/* Specific Actionable Solution Card for Unverified Domain Error */}
                {(testResult.domainUnverified || (testResult.error && (testResult.error.includes('not verified') || testResult.error.includes('resend.com/domains')))) && (
                  <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/80 rounded-lg text-[11px] text-amber-900 dark:text-amber-200 space-y-2">
                    <div className="font-bold flex items-center gap-1 text-amber-800 dark:text-amber-300">
                      <Info className="w-3.5 h-3.5" />
                      Resend Alan Adı Doğrulama Adımları:
                    </div>
                    <p className="leading-relaxed">
                      Resend varsayılan güvenlik politikası gereği doğrulanmamış alan adlarından giden e-postaları engeller.
                    </p>
                    <div className="flex flex-col gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setFromEmail('onboarding@resend.dev');
                          handleSave();
                        }}
                        className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-md transition text-[11px] flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Zap className="w-3 h-3" />
                        <span>'onboarding@resend.dev' Adresine Geç ve Kaydet</span>
                      </button>

                      <a
                        href="https://resend.com/domains"
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium rounded-md transition text-[11px] flex items-center justify-center gap-1 text-center"
                      >
                        <span>Resend Panelinde Alan Adını Doğrula</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* DNS Records Guidance Card */}
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white">
              <ShieldCheck className="w-4 h-4 text-indigo-500" />
              <h4 className="text-xs font-bold uppercase tracking-wider">DNS & Teslimat İpuçları</h4>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              E-postaların spam klasörüne düşmemesi için alan adınızın DNS yönetiminde (Cloudflare vb.) aşağıdaki kayıtları tamamlayınız:
            </p>

            <div className="space-y-2 text-xs">
              <div className="p-2.5 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700/60">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  <span>SPF Kaydı (TXT)</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard('v=spf1 include:resend.com ~all', 'spf')}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                  >
                    {copiedKey === 'spf' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
                <code className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono block break-all">
                  v=spf1 include:resend.com ~all
                </code>
              </div>

              <div className="p-2.5 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700/60">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  <span>DMARC Kaydı (TXT)</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard('v=DMARC1; p=none;', 'dmarc')}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                  >
                    {copiedKey === 'dmarc' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
                <code className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono block break-all">
                  v=DMARC1; p=none;
                </code>
              </div>
            </div>

            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900/40 text-[11px] text-indigo-900 dark:text-indigo-300 leading-relaxed flex items-start gap-2">
              <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <span>
                <strong>Güvenlik Garantisi:</strong> API anahtarları ve SMTP şifreleri asla tarayıcıda veya istemci kodunda açık tutulmaz; veritabanında AES şifreli olarak barındırılır.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
