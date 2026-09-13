import React, { useState } from 'react';
import type { SystemLoggerConfig, SystemEventLevel } from '../../types';
import {
  X,
  Sliders,
  Power,
  HardDrive,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Save,
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
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen || !config) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        enabled,
        logToFile,
        minLevel,
        maxInMemory,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-2xl border border-indigo-500/20">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Loglama Sistemi & Teşhis Yapılandırması
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Sunucu hata kayıt motorunun çalışma parametrelerini yönetin
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

        {/* Content */}
        <div className="p-6 space-y-5 text-xs text-slate-600 dark:text-slate-300">
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

          {/* Disk File Persistence Toggle */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900/80 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <HardDrive className={`w-4 h-4 ${logToFile ? 'text-indigo-500' : 'text-slate-400'}`} />
                <span>Diske Yazma (File Persistence)</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Logları <code className="text-indigo-400 font-mono">logs/system_events.log</code> dosyasına append eder.
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
                  className={`p-2.5 rounded-xl border text-center font-bold text-xs transition-all ${
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
              className="w-full accent-indigo-600"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>200 (Hafif)</span>
              <span>1,000 (Varsayılan)</span>
              <span>5,000 (Detaylı)</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-medium transition-colors"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Kaydediliyor...' : 'Ayarları Kaydet'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
