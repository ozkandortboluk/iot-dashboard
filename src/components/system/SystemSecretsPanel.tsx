import React, { useState, useEffect } from 'react';
import {
  Key,
  Lock,
  Database,
  Mail,
  Bell,
  ShieldCheck,
  Save,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
  Trash2,
  Info,
  Server,
  Send,
} from 'lucide-react';
import { apiFetch as fetch } from '../../lib/apiFetch';

interface SystemSecretsState {
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    sslMode: string;
    isConfigured: boolean;
    hasPassword: boolean;
    passwordMasked: string;
    source: 'vault' | 'environment' | 'not_set';
  };
  email: {
    provider: 'resend' | 'smtp' | 'simulated';
    fromEmail: string;
    fromName: string;
    appBaseUrl: string;
    hasResendApiKey: boolean;
    resendApiKeyMasked: string;
    resendSource: 'vault' | 'environment' | 'not_set';
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    hasSmtpPass: boolean;
    smtpPassMasked: string;
    smtpSource: 'vault' | 'environment' | 'not_set';
    isConfigured: boolean;
  };
  notifications: {
    telegram: {
      enabled: boolean;
      hasBotToken: boolean;
      botTokenMasked: string;
      chatId: string;
    };
    whatsapp: {
      enabled: boolean;
      hasApiToken: boolean;
      apiTokenMasked: string;
      phoneNumberId: string;
    };
    webhook: {
      enabled: boolean;
      hasSecretHeader: boolean;
      secretHeaderMasked: string;
      defaultEndpoint: string;
    };
  };
  customSecrets: Array<{
    key: string;
    category: string;
    label: string;
    description?: string;
    isConfigured: boolean;
    maskedValue: string;
    updatedAt?: string;
  }>;
}

export const SystemSecretsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'database' | 'email' | 'notifications' | 'custom'>('database');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [dbForm, setDbForm] = useState({
    host: '',
    port: 5432,
    database: '',
    user: '',
    password: '',
    sslMode: 'disable',
  });

  const [emailForm, setEmailForm] = useState({
    provider: 'resend' as 'resend' | 'smtp' | 'simulated',
    fromEmail: '',
    fromName: '',
    appBaseUrl: '',
    resendApiKey: '',
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPass: '',
  });

  const [notifForm, setNotifForm] = useState({
    telegram: { enabled: false, botToken: '', chatId: '' },
    whatsapp: { enabled: false, apiToken: '', phoneNumberId: '' },
    webhook: { enabled: false, secretHeader: '', defaultEndpoint: '' },
  });

  const [customSecrets, setCustomSecrets] = useState<Array<any>>([]);
  const [newCustomKey, setNewCustomKey] = useState('');
  const [newCustomLabel, setNewCustomLabel] = useState('');
  const [newCustomVal, setNewCustomVal] = useState('');

  // Diagnostics state
  const [testDbLoading, setTestDbLoading] = useState(false);
  const [testDbResult, setTestDbResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testEmailLoading, setTestEmailLoading] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; message: string } | null>(null);

  const fetchSecrets = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/system/secrets');
      if (res.ok) {
        const json = await res.json();
        const data: SystemSecretsState = json.data;

        setDbForm({
          host: data.database.host || '',
          port: data.database.port || 5432,
          database: data.database.database || '',
          user: data.database.user || '',
          password: data.database.hasPassword ? data.database.passwordMasked : '',
          sslMode: data.database.sslMode || 'disable',
        });

        setEmailForm({
          provider: data.email.provider || 'simulated',
          fromEmail: data.email.fromEmail || '',
          fromName: data.email.fromName || '',
          appBaseUrl: data.email.appBaseUrl || '',
          resendApiKey: data.email.hasResendApiKey ? data.email.resendApiKeyMasked : '',
          smtpHost: data.email.smtpHost || '',
          smtpPort: data.email.smtpPort || 587,
          smtpSecure: data.email.smtpSecure || false,
          smtpUser: data.email.smtpUser || '',
          smtpPass: data.email.hasSmtpPass ? data.email.smtpPassMasked : '',
        });

        setNotifForm({
          telegram: {
            enabled: data.notifications.telegram.enabled,
            botToken: data.notifications.telegram.hasBotToken ? data.notifications.telegram.botTokenMasked : '',
            chatId: data.notifications.telegram.chatId || '',
          },
          whatsapp: {
            enabled: data.notifications.whatsapp.enabled,
            apiToken: data.notifications.whatsapp.hasApiToken ? data.notifications.whatsapp.apiTokenMasked : '',
            phoneNumberId: data.notifications.whatsapp.phoneNumberId || '',
          },
          webhook: {
            enabled: data.notifications.webhook.enabled,
            secretHeader: data.notifications.webhook.hasSecretHeader ? data.notifications.webhook.secretHeaderMasked : '',
            defaultEndpoint: data.notifications.webhook.defaultEndpoint || '',
          },
        });

        setCustomSecrets(data.customSecrets || []);
      }
    } catch (err: any) {
      setErrorMessage('Secret kasa bilgileri yüklenemedi: ' + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecrets();
  }, []);

  const handleSaveAll = async () => {
    try {
      setSaving(true);
      setErrorMessage(null);
      setSaveSuccess(false);

      const res = await fetch('/api/system/secrets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          database: dbForm,
          email: emailForm,
          notifications: notifForm,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Secret güncellenemedi.');
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
      fetchSecrets();
    } catch (err: any) {
      setErrorMessage(err.message || 'Secret kasası kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCustomSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomKey || !newCustomVal) return;

    try {
      const res = await fetch('/api/system/secrets/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: newCustomKey,
          label: newCustomLabel || newCustomKey,
          value: newCustomVal,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Özel secret eklenemedi.');

      setNewCustomKey('');
      setNewCustomLabel('');
      setNewCustomVal('');
      fetchSecrets();
    } catch (err: any) {
      setErrorMessage(err.message || 'Özel secret eklenemedi.');
    }
  };

  const handleDeleteCustomSecret = async (key: string) => {
    if (!window.confirm(`"${key}" adlı secret kaydını silmek istediğinize emin misiniz?`)) return;

    try {
      const res = await fetch(`/api/system/secrets/custom/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
      if (res.ok) fetchSecrets();
    } catch {}
  };

  const handleTestDatabase = async () => {
    try {
      setTestDbLoading(true);
      setTestDbResult(null);

      const res = await fetch('/api/system/secrets/test-database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbForm),
      });

      const data = await res.json();
      setTestDbResult({
        success: Boolean(data.success),
        message: data.message || (data.success ? 'PostgreSQL bağlantısı başarılı!' : 'Bağlantı kurulamadı.'),
      });
    } catch (err: any) {
      setTestDbResult({ success: false, message: err.message || 'Bağlantı testi başarısız.' });
    } finally {
      setTestDbLoading(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmailRecipient || !testEmailRecipient.includes('@')) {
      alert('Lütfen geçerli bir alıcı e-posta adresi girin.');
      return;
    }

    try {
      setTestEmailLoading(true);
      setTestEmailResult(null);

      const res = await fetch('/api/system/secrets/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testRecipient: testEmailRecipient }),
      });

      const data = await res.json();
      setTestEmailResult({
        success: Boolean(data.success),
        message: data.success
          ? `Test e-postası başarıyla iletildi (${data.provider}). Mesaj ID: ${data.messageId || 'simüle'}`
          : `E-posta gönderim hatası: ${data.error || 'Bilinmeyen hata'}`,
      });
    } catch (err: any) {
      setTestEmailResult({ success: false, message: err.message || 'E-posta testi başarısız.' });
    } finally {
      setTestEmailLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-[#0f172a] p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl flex items-center justify-center gap-3 text-slate-500">
        <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
        <span className="text-sm font-medium">Sistem güvenlik kasası (AES-256-GCM Vault) yükleniyor...</span>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-blue-500/10 text-blue-500 rounded-xl">
              <Lock className="w-5 h-5" />
            </span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Sistem Güvenlik Kasası & Secret Parametreleri
            </h3>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              AES-256-GCM
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Veritabanı parolaları, Resend API tokenı ve üçüncü taraf anahtarlar güvenle şifrelenir; asla düz metin (plaintext) döndürülmez veya loglanmaz.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchSecrets}
            disabled={saving}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Yenile</span>
          </button>
          <button
            onClick={handleSaveAll}
            disabled={saving}
            className={`px-4 py-1.5 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 text-white shadow-xs ${
              saveSuccess ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {saveSuccess ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{saveSuccess ? 'Kasaya Kaydedildi!' : saving ? 'Kaydediliyor...' : 'Kasayı Kaydet'}</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 gap-2 bg-slate-50/20 dark:bg-slate-900/20 overflow-x-auto">
        <button
          onClick={() => setActiveTab('database')}
          className={`py-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 shrink-0 ${
            activeTab === 'database'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>PostgreSQL & TimescaleDB</span>
        </button>

        <button
          onClick={() => setActiveTab('email')}
          className={`py-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 shrink-0 ${
            activeTab === 'email'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Mail className="w-4 h-4" />
          <span>E-Posta Servisi (Resend / SMTP)</span>
        </button>

        <button
          onClick={() => setActiveTab('notifications')}
          className={`py-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 shrink-0 ${
            activeTab === 'notifications'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Bildirim & Entegrasyonlar</span>
        </button>

        <button
          onClick={() => setActiveTab('custom')}
          className={`py-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 shrink-0 ${
            activeTab === 'custom'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Key className="w-4 h-4" />
          <span>Özel Secretlar ({customSecrets.length})</span>
        </button>
      </div>

      {/* Messages */}
      {errorMessage && (
        <div className="m-6 p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-xl text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Tab Contents */}
      <div className="p-6">
        {/* TAB 1: PostgreSQL & TimescaleDB */}
        {activeTab === 'database' && (
          <div className="space-y-5">
            <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-900/30 rounded-2xl flex items-start gap-3 text-xs text-slate-600 dark:text-slate-300">
              <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <span>
                Burada girilen veritabanı parolası sunucu tarafında AES-256-GCM ile şifrelenir. <code className="font-mono">.env</code> veya <code className="font-mono">docker-compose.yml</code> içinde şifrenizi tutmak zorunda kalmazsınız.
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Sunucu Host / IP
                </label>
                <input
                  type="text"
                  value={dbForm.host}
                  onChange={(e) => setDbForm({ ...dbForm, host: e.target.value })}
                  placeholder="timescaledb veya 91.151.x.x"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Port
                </label>
                <input
                  type="number"
                  value={dbForm.port}
                  onChange={(e) => setDbForm({ ...dbForm, port: parseInt(e.target.value, 10) || 5432 })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Veritabanı Adı
                </label>
                <input
                  type="text"
                  value={dbForm.database}
                  onChange={(e) => setDbForm({ ...dbForm, database: e.target.value })}
                  placeholder="iot_dashboard"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Kullanıcı Adı
                </label>
                <input
                  type="text"
                  value={dbForm.user}
                  onChange={(e) => setDbForm({ ...dbForm, user: e.target.value })}
                  placeholder="iot_user"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Veritabanı Parolası (Şifreli Kasa Alanı)
                </label>
                <input
                  type="password"
                  value={dbForm.password}
                  onChange={(e) => setDbForm({ ...dbForm, password: e.target.value })}
                  placeholder="Değiştirmek için yeni parola girin ya da maskeli bırakın"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Değer <code className="font-mono text-slate-500">••••••••</code> olarak göründüğünde mevcut parola korunur; değiştirmek istemiyorsanız dokunmayın.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  SSL Modu
                </label>
                <select
                  value={dbForm.sslMode}
                  onChange={(e) => setDbForm({ ...dbForm, sslMode: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500"
                >
                  <option value="disable">Devre Dışı (disable - Docker yerel ağ)</option>
                  <option value="require">Zorunlu (require - Bulut DB)</option>
                  <option value="prefer">Tercihli (prefer)</option>
                </select>
              </div>
            </div>

            {/* Test Connection Box */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <button
                onClick={handleTestDatabase}
                disabled={testDbLoading}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl transition flex items-center gap-2"
              >
                <Server className={`w-3.5 h-3.5 ${testDbLoading ? 'animate-spin text-blue-500' : ''}`} />
                <span>{testDbLoading ? 'Bağlantı Test Ediliyor...' : 'Bağlantıyı Test Et'}</span>
              </button>

              {testDbResult && (
                <div
                  className={`text-xs px-3 py-1.5 rounded-xl border flex items-center gap-1.5 ${
                    testDbResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                      : 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800'
                  }`}
                >
                  {testDbResult.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                  <span>{testDbResult.message}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: E-Posta Servisi */}
        {activeTab === 'email' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(['resend', 'smtp', 'simulated'] as const).map((prov) => (
                <button
                  key={prov}
                  type="button"
                  onClick={() => setEmailForm({ ...emailForm, provider: prov })}
                  className={`p-3 rounded-2xl border text-left transition flex items-center gap-3 ${
                    emailForm.provider === prov
                      ? 'bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400 font-semibold'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900'
                  }`}
                >
                  <Mail className="w-4 h-4" />
                  <span className="capitalize text-xs">
                    {prov === 'resend' ? 'Resend API (Bulut)' : prov === 'smtp' ? 'Özel SMTP Sunucusu' : 'Simülasyon (Test)'}
                  </span>
                </button>
              ))}
            </div>

            {emailForm.provider === 'resend' && (
              <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-blue-500" />
                  Resend API Anahtarı
                </h4>
                <input
                  type="password"
                  value={emailForm.resendApiKey}
                  onChange={(e) => setEmailForm({ ...emailForm, resendApiKey: e.target.value })}
                  placeholder="re_••••••••••••••••••••••••"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500"
                />
                <p className="text-[11px] text-slate-400">
                  Resend paneli üzerinden aldığınız <code className="font-mono">re_</code> ile başlayan gizli tokenı girin.
                </p>
              </div>
            )}

            {emailForm.provider === 'smtp' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    SMTP Host
                  </label>
                  <input
                    type="text"
                    value={emailForm.smtpHost}
                    onChange={(e) => setEmailForm({ ...emailForm, smtpHost: e.target.value })}
                    placeholder="smtp.example.com"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    SMTP Port
                  </label>
                  <input
                    type="number"
                    value={emailForm.smtpPort}
                    onChange={(e) => setEmailForm({ ...emailForm, smtpPort: parseInt(e.target.value, 10) || 587 })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    SMTP Kullanıcı
                  </label>
                  <input
                    type="text"
                    value={emailForm.smtpUser}
                    onChange={(e) => setEmailForm({ ...emailForm, smtpUser: e.target.value })}
                    placeholder="user@example.com"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    SMTP Parolası (Şifreli Kasa)
                  </label>
                  <input
                    type="password"
                    value={emailForm.smtpPass}
                    onChange={(e) => setEmailForm({ ...emailForm, smtpPass: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Gönderici E-Posta (From)
                </label>
                <input
                  type="email"
                  value={emailForm.fromEmail}
                  onChange={(e) => setEmailForm({ ...emailForm, fromEmail: e.target.value })}
                  placeholder="bildirim@nexusnodeiot.com.tr"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Uygulama Temel URL (Parola Sıfırlama Bağlantıları)
                </label>
                <input
                  type="text"
                  value={emailForm.appBaseUrl}
                  onChange={(e) => setEmailForm({ ...emailForm, appBaseUrl: e.target.value })}
                  placeholder="https://nexusnodeiot.com.tr"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono"
                />
              </div>
            </div>

            {/* Test Email Box */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <input
                type="email"
                value={testEmailRecipient}
                onChange={(e) => setTestEmailRecipient(e.target.value)}
                placeholder="test-alici@domain.com"
                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs w-64"
              />
              <button
                onClick={handleTestEmail}
                disabled={testEmailLoading}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
              >
                <Send className={`w-3.5 h-3.5 ${testEmailLoading ? 'animate-spin text-blue-500' : ''}`} />
                <span>{testEmailLoading ? 'Gönderiliyor...' : 'Test E-Postası Gönder'}</span>
              </button>

              {testEmailResult && (
                <span
                  className={`text-[11px] px-2.5 py-1 rounded-lg border ${
                    testEmailResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                      : 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800'
                  }`}
                >
                  {testEmailResult.message}
                </span>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: Bildirim Kanalları */}
        {activeTab === 'notifications' && (
          <div className="space-y-4">
            {/* Telegram */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Telegram Bot Entegrasyonu</span>
                </h4>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifForm.telegram.enabled}
                    onChange={(e) =>
                      setNotifForm({
                        ...notifForm,
                        telegram: { ...notifForm.telegram, enabled: e.target.checked },
                      })
                    }
                    className="rounded text-blue-600"
                  />
                  <span>Aktif</span>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Bot Token (Şifreli Kasa)
                  </label>
                  <input
                    type="password"
                    value={notifForm.telegram.botToken}
                    onChange={(e) =>
                      setNotifForm({
                        ...notifForm,
                        telegram: { ...notifForm.telegram, botToken: e.target.value },
                      })
                    }
                    placeholder="••••••••:••••••••"
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Varsayılan Chat ID
                  </label>
                  <input
                    type="text"
                    value={notifForm.telegram.chatId}
                    onChange={(e) =>
                      setNotifForm({
                        ...notifForm,
                        telegram: { ...notifForm.telegram, chatId: e.target.value },
                      })
                    }
                    placeholder="-100123456789"
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* WhatsApp */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>WhatsApp Cloud API</span>
                </h4>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifForm.whatsapp.enabled}
                    onChange={(e) =>
                      setNotifForm({
                        ...notifForm,
                        whatsapp: { ...notifForm.whatsapp, enabled: e.target.checked },
                      })
                    }
                    className="rounded text-blue-600"
                  />
                  <span>Aktif</span>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    API Access Token (Şifreli Kasa)
                  </label>
                  <input
                    type="password"
                    value={notifForm.whatsapp.apiToken}
                    onChange={(e) =>
                      setNotifForm({
                        ...notifForm,
                        whatsapp: { ...notifForm.whatsapp, apiToken: e.target.value },
                      })
                    }
                    placeholder="••••••••"
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Phone Number ID
                  </label>
                  <input
                    type="text"
                    value={notifForm.whatsapp.phoneNumberId}
                    onChange={(e) =>
                      setNotifForm({
                        ...notifForm,
                        whatsapp: { ...notifForm.whatsapp, phoneNumberId: e.target.value },
                      })
                    }
                    placeholder="10987654321"
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Webhook */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Güvenli Webhook Çağrısı</span>
                </h4>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifForm.webhook.enabled}
                    onChange={(e) =>
                      setNotifForm({
                        ...notifForm,
                        webhook: { ...notifForm.webhook, enabled: e.target.checked },
                      })
                    }
                    className="rounded text-blue-600"
                  />
                  <span>Aktif</span>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Webhook Gizli İmza Başlığı (Secret Header)
                  </label>
                  <input
                    type="password"
                    value={notifForm.webhook.secretHeader}
                    onChange={(e) =>
                      setNotifForm({
                        ...notifForm,
                        webhook: { ...notifForm.webhook, secretHeader: e.target.value },
                      })
                    }
                    placeholder="••••••••"
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Varsayılan Webhook URL Uç Noktası
                  </label>
                  <input
                    type="text"
                    value={notifForm.webhook.defaultEndpoint}
                    onChange={(e) =>
                      setNotifForm({
                        ...notifForm,
                        webhook: { ...notifForm.webhook, defaultEndpoint: e.target.value },
                      })
                    }
                    placeholder="https://api.domain.com/iot-webhook"
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Genişletilebilir Özel Secretlar */}
        {activeTab === 'custom' && (
          <div className="space-y-5">
            <div className="p-3 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/50 dark:border-purple-900/30 rounded-2xl flex items-start gap-3 text-xs text-slate-600 dark:text-slate-300">
              <Key className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
              <span>
                İleride sisteme entegre edeceğiniz harici yapay zeka API anahtarları (OpenAI, Gemini), harita servisleri veya özel webhook tokenlarını bu alana anahtar-değer çifti olarak kaydedebilirsiniz.
              </span>
            </div>

            {/* Existing custom secrets list */}
            {customSecrets.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">
                Henüz özel bir API anahtarı veya secret eklenmedi.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                {customSecrets.map((cs) => (
                  <div key={cs.key} className="p-3 flex items-center justify-between gap-3 bg-white dark:bg-slate-900">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">{cs.key}</span>
                        <span className="text-[10px] text-slate-400">({cs.label})</span>
                      </div>
                      <span className="font-mono text-xs text-slate-500">{cs.maskedValue || '••••••••'}</span>
                    </div>

                    <button
                      onClick={() => handleDeleteCustomSecret(cs.key)}
                      title="Secret kaydını sil"
                      className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new custom secret form */}
            <form onSubmit={handleAddCustomSecret} className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-blue-500" />
                Yeni Özel Secret Ekle
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newCustomKey}
                  onChange={(e) => setNewCustomKey(e.target.value)}
                  placeholder="Anahtar (örn: OPENAI_API_KEY)"
                  className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono"
                  required
                />
                <input
                  type="text"
                  value={newCustomLabel}
                  onChange={(e) => setNewCustomLabel(e.target.value)}
                  placeholder="Görünür Etiket"
                  className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                />
                <input
                  type="password"
                  value={newCustomVal}
                  onChange={(e) => setNewCustomVal(e.target.value)}
                  placeholder="Gizli Değer"
                  className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono"
                  required
                />
              </div>
              <button
                type="submit"
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Kasaya Ekle</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
