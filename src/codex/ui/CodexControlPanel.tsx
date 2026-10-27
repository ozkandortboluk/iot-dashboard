import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Bot, Check, LockKeyhole, RefreshCw, Save, Settings2, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../../lib/apiFetch';
import { DEFAULT_ADMIN_CONTROL_CONFIG, type AdminControlConfig } from '../admin/controlConfig';
import { CODEX_PLUGIN_NAME } from '../pluginMetadata';

type PermissionKey = keyof AdminControlConfig['permissions'];
type FeatureKey = keyof AdminControlConfig['features'];

const permissionItems: Array<{ key: PermissionKey; title: string; detail: string; locked?: boolean }> = [
  { key: 'readHealth', title: 'Uygulama ve DB readiness okuma', detail: 'Yalnız health endpoint HTTP durum kodu; response içeriği alınmaz.' },
  { key: 'readHostMetrics', title: 'Kaynak metriklerini okuma', detail: 'Disk, bellek ve işlemci yükü.' },
  { key: 'readDockerStatus', title: 'Docker durum metadatası', detail: 'Docker socket erişimi gerektirir; bu PR’da adapter kapalı.', locked: true },
  { key: 'readBackupMetadata', title: 'Yedek bütünlüğü metadatası', detail: 'Yalnız izinli artifact/checksum; mevcut secret içeren manifest desteklenmez.' },
  { key: 'readAllowedLogs', title: 'Allowlist log sayaçları', detail: 'Log satırları panel veya modele aktarılmaz.' },
  { key: 'sendTelegram', title: 'Giden Telegram bildirimi', detail: 'Ayar tek başına gönderim onayı değildir; gerçek gönderim ayrıca açık onay ister.' },
  { key: 'runCodexAnalysis', title: 'Codex model analizi', detail: 'CLI ve izolasyon doğrulanana kadar devre dışı.', locked: true },
];

const featureItems: Array<{ key: FeatureKey; title: string; permission: PermissionKey; detail: string; locked?: boolean }> = [
  { key: 'healthChecks', title: 'Liveness ve readiness kontrolü', permission: 'readHealth', detail: 'Loopback health path allowlist’i kullanılır.' },
  { key: 'hostMetrics', title: 'Disk, bellek ve CPU yükü', permission: 'readHostMetrics', detail: 'Salt okunur host metrikleri.' },
  { key: 'dockerStatus', title: 'Container durum kontrolü', permission: 'readDockerStatus', detail: 'Daemon erişimi gerektiğinden kullanılabilir durumda değil.', locked: true },
  { key: 'backupChecks', title: 'Yedek checksum/yaş denetimi', permission: 'readBackupMetadata', detail: 'Backup oluşturmaz, silmez veya restore etmez.' },
  { key: 'logSummary', title: 'İzinli log hata sayaçları', permission: 'readAllowedLogs', detail: 'Yalnız sayaç üretir.' },
  { key: 'criticalTelegramAlerts', title: 'Kritik Telegram uyarıları', permission: 'sendTelegram', detail: 'Gerçek gönderim için ayrıca açık işlem onayı gerekir.' },
  { key: 'dailyTelegramSummary', title: 'Günlük 09.00 özeti (Europe/Istanbul)', permission: 'sendTelegram', detail: 'Gerçek gönderim için ayrıca açık işlem onayı gerekir.' },
  { key: 'codexAnalysis', title: 'Anomali için Codex analizi', permission: 'runCodexAnalysis', detail: 'CLI doğrulaması tamamlanana kadar kapalı.', locked: true },
];

export const CodexControlPanel: React.FC = () => {
  const [config, setConfig] = useState<AdminControlConfig>(DEFAULT_ADMIN_CONTROL_CONFIG);
  const [baseline, setBaseline] = useState<AdminControlConfig>(DEFAULT_ADMIN_CONTROL_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [activePlugin, setActivePlugin] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/system/codex/config');
      const data = await response.json();
      if (!response.ok || !data?.config) throw new Error(data?.error || 'Codex ayarları yüklenemedi.');
      setConfig(data.config);
      setBaseline(data.config);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Codex ayarları yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const dirty = JSON.stringify(config) !== JSON.stringify(baseline);

  const updatePermission = (key: PermissionKey, enabled: boolean) => {
    setSaved(false);
    setConfig((current) => {
      const permissions = { ...current.permissions, [key]: enabled };
      const features = { ...current.features };
      if (!enabled) {
        if (key === 'readHealth') features.healthChecks = false;
        if (key === 'readHostMetrics') features.hostMetrics = false;
        if (key === 'readDockerStatus') features.dockerStatus = false;
        if (key === 'readBackupMetadata') features.backupChecks = false;
        if (key === 'readAllowedLogs') features.logSummary = false;
        if (key === 'sendTelegram') { features.criticalTelegramAlerts = false; features.dailyTelegramSummary = false; }
        if (key === 'runCodexAnalysis') features.codexAnalysis = false;
      }
      return { ...current, permissions, features };
    });
  };

  const updateFeature = (key: FeatureKey, enabled: boolean) => {
    setSaved(false);
    setConfig((current) => ({ ...current, features: { ...current.features, [key]: enabled } }));
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const response = await apiFetch('/api/system/codex/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const data = await response.json();
      if (!response.ok || !data?.config) throw new Error(data?.error || 'Codex ayarları kaydedilemedi.');
      setConfig(data.config);
      setBaseline(data.config);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Codex ayarları kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-sm text-slate-500">Codex izinleri yükleniyor…</div>;

  if (!activePlugin) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Eklentiler</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sisteme eklenen modülleri görüntüleyin; bir eklentiyi açarak ayarlarını yönetin.</p>
        </header>

        <section aria-label="Yüklü eklentiler" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <article className="flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><Bot className="h-6 w-6" /></div>
                <div>
                  <h2 className="font-bold text-slate-900 dark:text-white">{CODEX_PLUGIN_NAME}</h2>
                  <p className="mt-1 text-xs text-slate-500">Sistem izleme eklentisi</p>
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${config.pluginEnabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                {config.pluginEnabled ? 'Etkin' : 'Kapalı'}
              </span>
            </div>
            <p className="mt-4 flex-1 text-sm text-slate-600 dark:text-slate-300">Sağlık, sunucu kaynakları, yedek metadatası ve izinli log sayaçları için yönetilebilir kontroller.</p>
            <button type="button" onClick={() => setActivePlugin('codex')} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
              <Settings2 className="h-4 w-4" /> Ayrıntılar ve ayarlar
            </button>
          </article>
        </section>

        <section className="rounded-2xl border border-sky-200 bg-white p-5 dark:border-sky-900 dark:bg-slate-900">
          <h2 className="font-bold text-slate-900 dark:text-white">Eklentiler nasıl çalışır?</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">Bir eklentiyi kartından açıp ayrıntılarını inceleyebilir, anahtarını ve izinlerini yönetebilirsiniz. Yeni eklentiler eklendikçe bu alanda ayrı kartlar olarak görünür.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <header className="rounded-2xl border border-indigo-200 bg-white p-6 shadow-sm dark:border-indigo-900 dark:bg-slate-900">
        <button type="button" onClick={() => setActivePlugin(null)} className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-300">
          <ArrowLeft className="h-4 w-4" /> Eklentilerin tümüne dön
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><Bot className="h-6 w-6" /></div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">{CODEX_PLUGIN_NAME}</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{CODEX_PLUGIN_NAME} eklentisini ve izinlerini yönetin.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${config.pluginEnabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}><ShieldCheck className="h-4 w-4" /> {config.pluginEnabled ? 'Eklenti açık' : 'Eklenti kapalı'}</span>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold dark:border-slate-700">
              <input type="checkbox" checked={config.pluginEnabled} onChange={(event) => { setSaved(false); setConfig((current) => ({ ...current, pluginEnabled: event.target.checked })); }} className="h-4 w-4 accent-indigo-600" />
              Eklentiyi etkinleştir
            </label>
          </div>
        </div>
        <div className="mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p>Eklenti kapalıyken hiçbir checker seçilmez. Bu PR’da VPS ajanı kurulmaz veya çalıştırılmaz; bu düğme yalnız yapılandırma tercihidir. Shell, DB yazımı, servis kontrolü, push, merge ve deployment yetkileri hiçbir ayarla açılamaz; gerçek Telegram gönderimi ayrıca işlem bazında açık onay gerektirir.</p>
        </div>
      </header>

      <section className="rounded-2xl border border-sky-200 bg-white p-5 dark:border-sky-900 dark:bg-slate-900">
        <h2 className="font-bold text-slate-900 dark:text-white">Nasıl çalışır?</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600 dark:text-slate-300">
          <li>Eklentiyi açın, gereken salt-okunur izinleri verin, sonra kullanacağınız özellikleri seçip kaydedin.</li>
          <li>Onaylı bir agent daha sonra bu ayarları okuduğunda önce izinleri, sonra özellikleri uygular; health, kaynak, backup ve log kontrolleri read-only çalışır.</li>
          <li>Bu PR’da agent servisi ve config dağıtımı yoktur; panelde açmak canlı kontrol başlatmaz. Gerçek Telegram gönderimi için ayrı işlem onayı gerekir.</li>
        </ol>
        <p className="mt-3 text-xs text-slate-500">Eklentiyi kaldırma adımları: <code>src/codex/UNINSTALL.md</code></p>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 flex items-center gap-2 font-bold"><LockKeyhole className="h-4 w-4 text-indigo-500" /> İzin kapsamı</h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {permissionItems.map((item) => (
              <label key={item.key} className="flex items-start justify-between gap-4 py-4">
                <span><span className="block text-sm font-semibold">{item.title}{item.locked && <span className="ml-2 text-[10px] uppercase text-amber-600">kapalı</span>}</span><span className="mt-1 block text-xs text-slate-500">{item.detail}</span></span>
                <input aria-label={item.title} type="checkbox" checked={config.permissions[item.key]} disabled={item.locked} onChange={(event) => updatePermission(item.key, event.target.checked)} className="mt-1 h-4 w-4 accent-indigo-600 disabled:opacity-40" />
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 flex items-center gap-2 font-bold"><Check className="h-4 w-4 text-indigo-500" /> Özellikler</h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {featureItems.map((item) => (
              <label key={item.key} className="flex items-start justify-between gap-4 py-4">
                <span><span className="block text-sm font-semibold">{item.title}{item.locked && <span className="ml-2 text-[10px] uppercase text-amber-600">kapalı</span>}</span><span className="mt-1 block text-xs text-slate-500">{item.detail}</span></span>
                <input aria-label={item.title} type="checkbox" checked={config.features[item.key]} disabled={!config.pluginEnabled || item.locked || !config.permissions[item.permission]} onChange={(event) => updateFeature(item.key, event.target.checked)} className="mt-1 h-4 w-4 accent-indigo-600 disabled:opacity-40" />
              </label>
            ))}
          </div>
        </section>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{error}</div>}
      {saved && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">Codex izinleri kaydedildi.</div>}
      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" onClick={() => void load()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"><RefreshCw className="h-4 w-4" /> Yenile</button>
        <button type="button" onClick={() => void save()} disabled={!dirty || saving} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" /> {saving ? 'Kaydediliyor…' : 'İzinleri kaydet'}</button>
      </div>
    </div>
  );
};
