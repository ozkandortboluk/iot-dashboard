import React, { useState, useMemo } from 'react';
import type { SystemLoggerConfig, SystemEventLevel, LogIncludedFields } from '../../types';
import {
  X,
  Sliders,
  Power,
  HardDrive,
  ShieldCheck,
  Save,
  Sparkles,
  Layers,
  Eye,
  Lock,
  RotateCcw,
  Check,
} from 'lucide-react';

interface SystemLogsSettingsModalProps {
  config: SystemLoggerConfig | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (newSettings: Partial<SystemLoggerConfig>) => Promise<void>;
}

export const SystemLogsSettingsModal: React.FC<SystemLogsSettingsModalProps> = ({
  config,
  isOpen,
  onClose,
  onSave,
}) => {
  const [enabled, setEnabled] = useState<boolean>(config?.enabled ?? true);
  const [logToFile, setLogToFile] = useState<boolean>(config?.logToFile ?? true);
  const [minLevel, setMinLevel] = useState<SystemEventLevel>(config?.minLevel ?? 'info');
  const [maxInMemory, setMaxInMemory] = useState<number>(config?.maxInMemory ?? 1000);
  const [deduplication, setDeduplication] = useState<boolean>(config?.deduplication ?? true);
  const [autoSanitizeSecrets, setAutoSanitizeSecrets] = useState<boolean>(
    config?.autoSanitizeSecrets ?? true
  );

  const [includedFields, setIncludedFields] = useState<LogIncludedFields>(() => ({
    stack: config?.includedFields?.stack ?? true,
    ip: config?.includedFields?.ip ?? true,
    user: config?.includedFields?.user ?? true,
    http: config?.includedFields?.http ?? true,
    device: config?.includedFields?.device ?? true,
    details: config?.includedFields?.details ?? true,
    source: config?.includedFields?.source ?? true,
    traceId: config?.includedFields?.traceId ?? true,
  }));

  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  const toggleField = (key: keyof LogIncludedFields) => {
    setIncludedFields((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSelectAllFields = () => {
    setIncludedFields({
      stack: true,
      ip: true,
      user: true,
      http: true,
      device: true,
      details: true,
      source: true,
      traceId: true,
    });
  };

  const handleSelectMinimalFields = () => {
    setIncludedFields({
      stack: false,
      ip: false,
      user: false,
      http: true,
      device: false,
      details: false,
      source: true,
      traceId: false,
    });
  };

  // Live preview simulated JSON based on user's field selection
  const previewJson = useMemo(() => {
    const sample: Record<string, any> = {
      id: 'evt_sample_9841',
      timestamp: new Date().toISOString(),
      level: 'error',
      category: 'database',
      message: 'PostgreSQL bağlantı zaman aşımı (ETIMEDOUT 5432)',
    };

    if (includedFields.source) sample.source = 'postgres_pool';
    if (includedFields.traceId) sample.traceId = 'trc_7f39a04b12';
    if (includedFields.http) {
      sample.method = 'POST';
      sample.path = '/api/devices/telemetry';
      sample.statusCode = 500;
    }
    if (includedFields.ip) sample.ip = '192.168.1.105';
    if (includedFields.user) sample.userId = 'usr_admin_01';
    if (includedFields.device) sample.deviceId = 'esp32_gateway_01';
    if (includedFields.details) {
      sample.details = {
        retryCount: 3,
        dbHost: 'timescaledb',
        dbPassword: autoSanitizeSecrets ? '••••••••' : 'secret123',
      };
    }
    if (includedFields.stack) {
      sample.stack = 'Error: ETIMEDOUT\n    at Connection.connect (/app/server/pool.js:42:15)';
    }

    return JSON.stringify(sample, null, 2);
  }, [includedFields, autoSanitizeSecrets]);

  if (!isOpen || !config) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        enabled,
        logToFile,
        minLevel,
        maxInMemory,
        deduplication,
        includedFields,
        autoSanitizeSecrets,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const fieldList: {
    key: keyof LogIncludedFields;
    label: string;
    desc: string;
    tag: string;
  }[] = [
    {
      key: 'source',
      label: 'Sistem Kaynağı / Alt Modül',
      desc: 'Logu üreten servis (database, auth, security, mqtt, vb.)',
      tag: 'source',
    },
    {
      key: 'http',
      label: 'HTTP İstek Bilgisi',
      desc: 'İstek metodu (GET/POST), URL yolu ve HTTP durum kodu',
      tag: 'method, path, status',
    },
    {
      key: 'traceId',
      label: 'Dağıtık İzleme Kimliği (Trace ID)',
      desc: 'İstekler arası olay takibi için benzersiz izleme anahtarı',
      tag: 'traceId',
    },
    {
      key: 'ip',
      label: 'İstemci & Donanım IP Adresi',
      desc: 'İstek gönderen IoT cihazı veya web kullanıcısının IP adresi',
      tag: 'ip',
    },
    {
      key: 'user',
      label: 'Kullanıcı Kimliği & Oturum',
      desc: 'İşlemi tetikleyen kullanıcının ID ve rol bilgisi',
      tag: 'userId, userEmail',
    },
    {
      key: 'device',
      label: 'Cihaz & Sensör Tanımlayıcı',
      desc: 'Telemetri veya komut alan IoT donanımının cihaz ID bilgisi',
      tag: 'deviceId',
    },
    {
      key: 'details',
      label: 'Yapılandırılmış JSON Tanı Verisi',
      desc: 'Hatanın veya olayın detaylı parametreleri ve yükü (payload)',
      tag: 'details (JSON)',
    },
    {
      key: 'stack',
      label: 'Hata Çağrı Yığıtı (Stack Trace)',
      desc: 'Hatanın oluştuğu dosya ve satır numarasını gösteren çağrı yığını',
      tag: 'stack',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-2xl border border-indigo-500/20">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Loglama Sistemi & Detay Yapılandırması
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Loglarda yer alacak bilgileri seçin, filtreleyin ve kalıcı olarak kaydedin
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-6 text-xs text-slate-600 dark:text-slate-300 overflow-y-auto">
          {/* Main Enable / Disable Toggle Switch */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900/80 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <Power className={`w-4 h-4 ${enabled ? 'text-emerald-500' : 'text-slate-400'}`} />
                <span>Sistem Log Kayıt Motoru</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {enabled
                  ? 'Sunucu hataları, API istisnaları ve sistem olayları arka planda kaydediliyor.'
                  : 'Loglama geçici olarak devre dışı bırakıldı. Yeni kayıt oluşturulmaz.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Section: Log İçinde Bulunacak Bilgiler (Seçilebilir Alanlar) */}
          <div className="space-y-3 p-4 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-2xl border border-indigo-200/80 dark:border-indigo-900/40">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  <span>Log Kaydında Tutulacak Bilgiler (Alan Seçimi)</span>
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Her sistem hatasında ve olayında diske ve belleğe kaydedilecek veri alanlarını belirleyin.
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleSelectAllFields}
                  className="px-2.5 py-1 text-[10px] font-semibold bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 border border-slate-200 dark:border-slate-800 text-indigo-600 dark:text-indigo-400 rounded-lg transition-colors cursor-pointer"
                >
                  Tümünü Seç
                </button>
                <button
                  type="button"
                  onClick={handleSelectMinimalFields}
                  className="px-2.5 py-1 text-[10px] font-semibold bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 rounded-lg transition-colors cursor-pointer"
                >
                  Sade (Minimal)
                </button>
              </div>
            </div>

            {/* Field Checkboxes Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {fieldList.map((item) => {
                const isChecked = includedFields[item.key];
                return (
                  <div
                    key={item.key}
                    onClick={() => toggleField(item.key)}
                    className={`p-2.5 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all select-none ${
                      isChecked
                        ? 'bg-white dark:bg-slate-900 border-indigo-500/50 shadow-sm ring-1 ring-indigo-500/20'
                        : 'bg-slate-100/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center shrink-0 border transition-colors ${
                        isChecked
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-800'
                      }`}
                    >
                      {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate text-[11px]">
                          {item.label}
                        </span>
                        <code className="text-[9px] text-indigo-500 dark:text-indigo-400 font-mono">
                          {item.tag}
                        </code>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug line-clamp-1">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Secret Sanitization Toggle */}
            <div className="pt-2 border-t border-indigo-100 dark:border-indigo-900/30 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-xs">
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Hassas Veri Maskeleme (Auto-Sanitize Secrets)</span>
                </span>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Parola, token, SSH anahtarları ve veritabanı şifrelerini loglarda otomatik olarak maskeler.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAutoSanitizeSecrets(!autoSanitizeSecrets)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  autoSanitizeSecrets ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    autoSanitizeSecrets ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Live Preview Toggle & Box */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{showPreview ? 'Canlı JSON Önizlemeyi Gizle' : 'Canlı JSON Önizlemeyi Göster'}</span>
              </button>
              {showPreview && (
                <div className="mt-2 p-3 bg-slate-950 rounded-xl border border-slate-800 text-[10px] font-mono text-emerald-400 overflow-x-auto max-h-40 leading-relaxed scrollbar-thin">
                  <pre>{previewJson}</pre>
                </div>
              )}
            </div>
          </div>

          {/* Disk File Persistence Toggle */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900/80 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <HardDrive className={`w-4 h-4 ${logToFile ? 'text-indigo-500' : 'text-slate-400'}`} />
                <span>Diske Yazma (File Persistence)</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Logları <code className="text-indigo-400 font-mono">logs/system_events.log</code> dosyasına kalıcı olarak append eder.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLogToFile(!logToFile)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                logToFile ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  logToFile ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Deduplication & Simplification Toggle */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900/80 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <Sparkles className={`w-4 h-4 ${deduplication ? 'text-indigo-500' : 'text-slate-400'}`} />
                <span>Akıllı Log Sadeleştirme & Yinelenenleri Filtreleme</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Arka arkaya tekrarlayan aynı hata ve bildirimleri otomatik birleştirir; log kirliliğini engeller.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDeduplication(!deduplication)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                deduplication ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  deduplication ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Minimum Level Filter Selection */}
          <div className="space-y-2">
            <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-amber-500" />
              <span>Minimum Kayıt Seviyesi (Threshold)</span>
            </label>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Seçilen seviyenin altındaki daha düşük öncelikli olaylar filtrelenir ve belleğe kaydedilmez.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {[
                { id: 'info', label: 'Bilgi (Info+)', color: 'text-sky-500' },
                { id: 'warn', label: 'Uyarı (Warn+)', color: 'text-amber-500' },
                { id: 'error', label: 'Hata (Error+)', color: 'text-rose-500' },
                { id: 'critical', label: 'Yalnızca Kritik', color: 'text-red-600' },
              ].map((lvl) => (
                <button
                  key={lvl.id}
                  type="button"
                  onClick={() => setMinLevel(lvl.id as SystemEventLevel)}
                  className={`p-2.5 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer ${
                    minLevel === lvl.id
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span className={lvl.color}>●</span> {lvl.label}
                </button>
              ))}
            </div>
          </div>

          {/* Memory Capacity */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800 dark:text-slate-200">
                Bellekte Tutulacak Maksimum Olay Sayısı
              </label>
              <span className="font-mono text-indigo-500 font-bold">{maxInMemory} Adet</span>
            </div>
            <input
              type="range"
              min="200"
              max="5000"
              step="100"
              value={maxInMemory}
              onChange={(e) => setMaxInMemory(parseInt(e.target.value, 10))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>200 (Hafif)</span>
              <span>1,000 (Varsayılan)</span>
              <span>5,000 (Detaylı)</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-medium transition-colors cursor-pointer"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Kaydediliyor...' : 'Ayarları Kaydet'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
