import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  Clock,
  Zap,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Download,
  Trash2,
  RotateCcw,
  Sliders,
  Check,
  Activity,
  FileCode,
  Calendar,
  Save,
  Server,
  Database,
  Lock,
} from 'lucide-react';
import { apiFetch as fetch } from '../../lib/apiFetch';
import type { ScheduledBackupConfig, BackupSnapshotItem } from '../../types';

export const ScheduledBackupsPanel: React.FC = () => {
  const [config, setConfig] = useState<ScheduledBackupConfig>({
    enabled: true,
    frequencyHours: 24,
    preferredTime: '03:00',
    maxBackupRetentionCount: 14,
    includeHypertables: true,
    includeMetadata: true,
    autoVerifySnapshots: true,
  });

  const [snapshots, setSnapshots] = useState<BackupSnapshotItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingConfig, setSavingConfig] = useState<boolean>(false);
  const [triggeringNow, setTriggeringNow] = useState<boolean>(false);
  const [restoringFilename, setRestoringFilename] = useState<string | null>(null);
  const [deletingFilename, setDeletingFilename] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchBackupData = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/database/scheduled-backups/config');
      if (!res.ok) throw new Error('Yedekleme verileri alınamadı.');
      const data = await res.json();
      if (data.config) setConfig(data.config);
      if (data.snapshots) setSnapshots(data.snapshots);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Ağ hatası oluştu.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackupData();
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setMsg(null);
    try {
      const res = await fetch('/api/database/scheduled-backups/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: 'Zamanlanmış snapshot ayarları başarıyla kaydedildi.' });
        if (data.config) setConfig(data.config);
        if (data.snapshots) setSnapshots(data.snapshots);
      } else {
        setMsg({ type: 'error', text: data.error || 'Ayarlar kaydedilemedi.' });
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Ağ hatası.' });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTriggerNow = async () => {
    setTriggeringNow(true);
    setMsg(null);
    try {
      const res = await fetch('/api/database/scheduled-backups/trigger-now', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: data.message || 'Anlık snapshot yedeği alındı ve doğrulandı.' });
        if (data.config) setConfig(data.config);
        if (data.snapshots) setSnapshots(data.snapshots);
      } else {
        setMsg({ type: 'error', text: data.error || 'Snapshot alma başarısız.' });
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Ağ hatası.' });
    } finally {
      setTriggeringNow(false);
    }
  };

  const handleRestore = async (filename: string) => {
    if (!window.confirm(`DİKKAT! ${filename} isimli snapshot yedeğini geri yüklemek istediğinize emin misiniz? Mevcut verilerin üzerine yazılacaktır.`)) {
      return;
    }
    setRestoringFilename(filename);
    setMsg(null);
    try {
      const res = await fetch('/api/database/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg({ type: 'success', text: data.message || 'Snapshot yedeği başarıyla geri yüklendi.' });
        fetchBackupData();
      } else {
        setMsg({ type: 'error', text: data.error || 'Geri yükleme başarısız.' });
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Ağ hatası.' });
    } finally {
      setRestoringFilename(null);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!window.confirm(`${filename} dosyasını kalıcı olarak silmek istediğinize emin misiniz?`)) {
      return;
    }
    setDeletingFilename(filename);
    setMsg(null);
    try {
      const res = await fetch(`/api/database/scheduled-backups/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: 'Snapshot yedeği silindi.' });
        if (data.snapshots) setSnapshots(data.snapshots);
      } else {
        setMsg({ type: 'error', text: data.error || 'Silme başarısız.' });
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Ağ hatası.' });
    } finally {
      setDeletingFilename(null);
    }
  };

  const handleDownload = (filename: string) => {
    window.open(`/api/database/scheduled-backups/download/${encodeURIComponent(filename)}`, '_blank');
  };

  const totalBytes = snapshots.reduce((acc, curr) => acc + curr.sizeBytes, 0);
  const totalMB = Math.round((totalBytes / (1024 * 1024)) * 100) / 100;
  const verifiedCount = snapshots.filter((s) => s.status === 'verified').length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Readiness Score Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-xl p-5 border border-slate-800 shadow-md flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold text-white">
              Zamanlanmış Snapshot Yedeği & Afet Kurtarma Hazırlığı
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Yerel Yedekleme
            </span>
          </div>
          <p className="text-xs text-slate-300 max-w-3xl">
            PostgreSQL SQL yedeklerini burada oluşturabilir ve indirebilirsiniz. Bu işlem uygulama dosyalarını, Vault anahtarını ve firmware ikili dosyalarını kapsamaz; başarılı felaket kurtarma testi yerine geçmez.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleTriggerNow}
            disabled={triggeringNow}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <Zap className={`w-4 h-4 ${triggeringNow ? 'animate-bounce' : ''}`} />
            <span>{triggeringNow ? 'Snapshot Alınıyor...' : '⚡ Şimdi Anlık Snapshot Al (Trigger-Now)'}</span>
          </button>

          <button
            onClick={fetchBackupData}
            disabled={loading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition border border-slate-700 cursor-pointer"
            title="Yenile"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
            msg.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Readiness & KPI Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Son Otomatik Snapshot</span>
          <p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
            {config.lastBackupAt ? new Date(config.lastBackupAt).toLocaleString() : 'Henüz Alınmadı'}
          </p>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
            <Check className="w-3 h-3" /> {config.lastBackupAt ? 'Yedek üretildi; geri yükleme test edilmedi' : 'Henüz doğrulanmış yedek yok'}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Gelecek Planlanan Snapshot</span>
          <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
            {config.nextBackupAt ? new Date(config.nextBackupAt).toLocaleString() : 'Planlanmadı'}
          </p>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Sıklık: {config.frequencyHours} Saatte Bir ({config.preferredTime})
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Aktif Snapshot Sayısı</span>
          <p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
            {snapshots.length} / {config.maxBackupRetentionCount} Adet
          </p>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {verifiedCount} Doğrulanmış Bütünlük
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Toplam Disk Kaplaması</span>
          <p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
            {totalMB} MB
          </p>
          <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
            Prune Sınırı: En Eski {config.maxBackupRetentionCount}. Silinir
          </span>
        </div>
      </div>

      {/* Configuration Form */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-500" />
              Zamanlanmış Snapshot & Saklama İlkesi Yapılandırması
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Otomatik snapshot periyodunu, çalışma zamanını ve maksimum tutulacak snapshot sayısını belirleyin.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Otomatik Snapshot:</label>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
          </div>
        </div>

        <form onSubmit={handleSaveConfig} className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
          {/* Frequency */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Yedekleme Sıklığı (Frekans)
            </label>
            <select
              value={config.frequencyHours}
              onChange={(e) => setConfig({ ...config, frequencyHours: parseInt(e.target.value, 10) })}
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
            >
              <option value={6}>Her 6 Saat (Yüksek Hacimli Üretim)</option>
              <option value={12}>Her 12 Saat (Standart Sanayi)</option>
              <option value={24}>Günlük (24 Saatte Bir - 03:00)</option>
              <option value={168}>Haftalık (7 Günde Bir)</option>
            </select>
          </div>

          {/* Preferred Time */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Tercih Edilen Çalışma Saati (HH:MM)
            </label>
            <input
              type="text"
              value={config.preferredTime}
              onChange={(e) => setConfig({ ...config, preferredTime: e.target.value })}
              placeholder="03:00"
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
            />
          </div>

          {/* Retention Count */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Maksimum Retention Snapshot Sınırı
            </label>
            <input
              type="number"
              min={3}
              max={100}
              value={config.maxBackupRetentionCount}
              onChange={(e) => setConfig({ ...config, maxBackupRetentionCount: parseInt(e.target.value, 10) || 14 })}
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
            />
          </div>

          {/* Scope checkboxes */}
          <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/60">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.includeHypertables}
                onChange={(e) => setConfig({ ...config, includeHypertables: e.target.checked })}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                TimescaleDB Telemetri Hypertables DAHİL
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.includeMetadata}
                onChange={(e) => setConfig({ ...config, includeMetadata: e.target.checked })}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Kullanıcı, Cihaz & Sistem Ayarları DAHİL
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.autoVerifySnapshots}
                onChange={(e) => setConfig({ ...config, autoVerifySnapshots: e.target.checked })}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Otomatik Checksum & Bütünlük Doğrulaması
              </span>
            </label>
          </div>

          <div className="md:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={savingConfig}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{savingConfig ? 'Kaydediliyor...' : 'Yapılandırmayı Kaydet'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Snapshot History Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-500" />
              Yedek Snapshot Geçmişi & Afet Kurtarma Listesi
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sistemde saklanan SQL yedekleri. İndirme mümkündür; canlı üretimde geri yükleme kapalıdır ve güvenli izole kurtarma prosedürü gerekir.
            </p>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Toplam Snapshot: <strong className="text-slate-800 dark:text-slate-200">{snapshots.length}</strong>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3">Snapshot Dosyası</th>
                <th className="p-3">Tetiklenme Tipi</th>
                <th className="p-3">Oluşturulma Tarihi</th>
                <th className="p-3 text-right">Dosya Boyutu</th>
                <th className="p-3">Doğrulama & Checksum</th>
                <th className="p-3 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
              {snapshots.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-500 dark:text-slate-400">
                    Henüz oluşturulmuş snapshot yedeği bulunamadı. "⚡ Şimdi Anlık Snapshot Al" butonunu kullanarak ilk yedeğinizi oluşturabilirsiniz.
                  </td>
                </tr>
              ) : (
                snapshots.map((snap) => {
                  const sizeMB = Math.round((snap.sizeBytes / (1024 * 1024)) * 100) / 100;
                  return (
                    <tr key={snap.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                      <td className="p-3 font-mono font-medium text-indigo-600 dark:text-indigo-400">
                        {snap.filename}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            snap.triggerType === 'scheduled'
                              ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                              : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          }`}
                        >
                          {snap.triggerType === 'scheduled' ? 'Zamanlanmış' : 'Manuel Tetiklendi'}
                        </span>
                      </td>
                      <td className="p-3 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {new Date(snap.createdAt).toLocaleString()}
                      </td>
                      <td className="p-3 text-right font-mono font-bold tabular-nums">
                        {sizeMB > 0 ? `${sizeMB} MB` : `${Math.round(snap.sizeBytes / 1024)} KB`}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3" /> Yapısal SQL kontrolü (restore testi değil)
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleDownload(snap.filename)}
                            className="p-1.5 text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition cursor-pointer"
                            title="Bilgisayara İndir"
                          >
                            <Download className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleRestore(snap.filename)}
                            disabled={import.meta.env.PROD || restoringFilename === snap.filename}
                            className="p-1.5 text-slate-600 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition cursor-pointer disabled:opacity-50"
                            title="Canlı sistemde geri yükleme kapalıdır; izole DR kurtarma prosedürünü kullanın"
                          >
                            <RotateCcw className={`w-4 h-4 ${restoringFilename === snap.filename ? 'animate-spin' : ''}`} />
                          </button>

                          <button
                            onClick={() => handleDelete(snap.filename)}
                            disabled={deletingFilename === snap.filename}
                            className="p-1.5 text-slate-600 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition cursor-pointer disabled:opacity-50"
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
