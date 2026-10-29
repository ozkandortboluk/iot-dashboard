import React, { useState } from 'react';
import {
  Sliders,
  Settings,
  Bell,
  Database,
  ServerCog,
  CheckCircle2,
  Clock,
  ArrowRight,
  Terminal,
} from 'lucide-react';
import { APP_NAME, APP_RELEASE_TAG, RELEASE_DATE } from '../config/version';

interface SystemSettingsViewProps {
  initialSubTab?: 'general' | 'notifications' | 'storage';
  onNavigateToTab?: (tab: string) => void;
}

export const SystemSettingsView: React.FC<SystemSettingsViewProps> = ({
  initialSubTab = 'general',
  onNavigateToTab,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'general' | 'notifications' | 'storage'>(initialSubTab);

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* 1. Sleek, Compact Header Card */}
      <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 shadow-xs">
              <ServerCog className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                  Sistem ve Ayarları
                </h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Merkezi Yönetim
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Sistem motorları, PostgreSQL veritabanı, hata günlükleri ve platform konfigürasyonu.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-xs shrink-0 self-start sm:self-auto">
            <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-slate-600 dark:text-slate-300 text-[11px]">
              Sürüm: <strong className="text-slate-900 dark:text-slate-100">{APP_RELEASE_TAG}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Interactive Navigation Cards (Hub) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Sistem Motorları (Sub-Page Link) */}
        <div className="group relative bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 rounded-2xl p-4 sm:p-5 text-white shadow-md border border-indigo-500/30 flex flex-col justify-between hover:shadow-indigo-500/10 hover:shadow-xl transition-all">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                <Sliders className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                7 Otonom Motor
              </span>
            </div>
            <div>
              <h2 className="text-sm font-bold text-white group-hover:text-indigo-200 transition-colors">
                Sistem Motorları
              </h2>
              <p className="text-[11px] text-slate-300 leading-relaxed mt-1">
                OTA, Alarm, Simülasyon, Bekçi, Otomasyon, Downlink ve WAL servis kumanda merkezi.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateToTab?.('system_engines')}
            className="mt-4 w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm group-hover:shadow-md"
          >
            <span>Motorlar Masasını Aç</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* Card 2: PostgreSQL & Veritabanı (Sub-Page Link) */}
        <div className="group relative bg-gradient-to-br from-sky-950 via-slate-900 to-slate-950 rounded-2xl p-4 sm:p-5 text-white shadow-md border border-sky-500/30 flex flex-col justify-between hover:shadow-sky-500/10 hover:shadow-xl transition-all">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300">
                <Database className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30">
                PostgreSQL & WAL
              </span>
            </div>
            <div>
              <h2 className="text-sm font-bold text-white group-hover:text-sky-200 transition-colors">
                PostgreSQL & Veritabanı
              </h2>
              <p className="text-[11px] text-slate-300 leading-relaxed mt-1">
                TimescaleDB bağlantısı, tablo boyutları, depolama ve WAL veri kuyruğu yönetimi.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateToTab?.('database_data')}
            className="mt-4 w-full py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm group-hover:shadow-md"
          >
            <span>Veritabanı Masasını Aç</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* Card 3: Sistem & Hata Günlükleri (Sub-Page Link) */}
        <div className="group relative bg-gradient-to-br from-violet-950 via-slate-900 to-slate-950 rounded-2xl p-4 sm:p-5 text-white shadow-md border border-violet-500/30 flex flex-col justify-between hover:shadow-violet-500/10 hover:shadow-xl transition-all">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-400/30 flex items-center justify-center text-violet-300">
                <Terminal className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-400/30">
                Canlı Konsol
              </span>
            </div>
            <div>
              <h2 className="text-sm font-bold text-white group-hover:text-violet-200 transition-colors">
                Sistem & Hata Günlükleri
              </h2>
              <p className="text-[11px] text-slate-300 leading-relaxed mt-1">
                Sunucu hata kayıtları, API uyarıları, log arşivi ve anlık filtreleme konsolu.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateToTab?.('system_logs')}
            className="mt-4 w-full py-2 px-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm group-hover:shadow-md"
          >
            <span>Hata Günlüklerini Aç</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* Card 4: Genel Parametreler & Ayarlar */}
        <div
          onClick={() => setActiveSubTab('general')}
          className={`cursor-pointer rounded-2xl p-4 sm:p-5 transition-all flex flex-col justify-between border ${
            activeSubTab === 'general'
              ? 'bg-white dark:bg-[#0f172a] border-indigo-500 ring-2 ring-indigo-500/20 shadow-md'
              : 'bg-white dark:bg-[#0f172a] border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
          }`}
        >
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                activeSubTab === 'general'
                  ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
              }`}>
                <Settings className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-semibold text-slate-400">Yapılandırma</span>
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Genel Parametreler
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mt-1">
                Platform kimliği, süre eşikleri, zaman aşımı ve servis dağıtım politikaları.
              </p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] font-medium">
            <span className={activeSubTab === 'general' ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-400'}>
              {activeSubTab === 'general' ? 'Şu An Seçili' : 'Ayarları Görüntüle'}
            </span>
            <span className={`w-2 h-2 rounded-full ${activeSubTab === 'general' ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'}`} />
          </div>
        </div>
      </div>

      {/* 3. Sub-Tab Selector Navigation Pills */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveSubTab('general')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeSubTab === 'general'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Genel Parametreler</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('notifications')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeSubTab === 'notifications'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>Bildirim Dağıtımı</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('storage')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeSubTab === 'storage'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>Depolama & WAL Mimarisi</span>
        </button>
      </div>

      {/* 4. Detailed Setting Panels (Selected Sub-Tab) */}
      <div className="animate-fadeIn">
        {/* PANEL: Genel Parametreler */}
        {activeSubTab === 'general' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
            <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <Settings className="w-4 h-4 text-indigo-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Platform ve Kimlik Bilgileri
                </h3>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-slate-400 block mb-1">Uygulama Adı</span>
                  <input
                    type="text"
                    disabled
                    value={APP_NAME}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 font-semibold"
                  />
                </div>

                <div>
                  <span className="text-slate-400 block mb-1">Aktif Sürüm Etiketi</span>
                  <input
                    type="text"
                    disabled
                    value={`${APP_RELEASE_TAG} (${RELEASE_DATE})`}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 font-mono"
                  />
                </div>

                <div>
                  <span className="text-slate-400 block mb-1">Çalışma Modu</span>
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
                    <span className="font-bold">Üretim & Otonom İzleme Aktif</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <Clock className="w-4 h-4 text-indigo-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Süre ve Zaman Aşımı Politikaları
                </h3>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div>
                    <strong className="text-slate-800 dark:text-slate-200 block">Cihaz Kalp Atışı (Heartbeat) Eşiği</strong>
                    <span className="text-slate-400 text-[11px]">Sinyal kesintisinde offline işaretleme süresi</span>
                  </div>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">60 Saniye</span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div>
                    <strong className="text-slate-800 dark:text-slate-200 block">Downlink Komut Zaman Aşımı</strong>
                    <span className="text-slate-400 text-[11px]">Cihazdan onay gelmediğinde istek iptal süresi</span>
                  </div>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">10 Dakika</span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div>
                    <strong className="text-slate-800 dark:text-slate-200 block">OTA Yeniden Deneme Kademeleri</strong>
                    <span className="text-slate-400 text-[11px]">Otomatik kurtarma bekleme periyotları</span>
                  </div>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">1m / 5m / 15m</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PANEL: Bildirim Kanalları */}
        {activeSubTab === 'notifications' && (
          <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-rose-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Alarm Dağıtım Kanalları
                </h3>
              </div>
              {onNavigateToTab && (
                <button
                  type="button"
                  onClick={() => onNavigateToTab('notifications')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  <span>Bildirimler Masasını Aç</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Bildirim ve Alarm Motoru tarafından tespit edilen kritik ihlallerin iletildiği kanalların durumu:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">E-Posta (SMTP)</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-bold">Aktif</span>
                </div>
                <p className="text-[11px] text-slate-400">Kritik ve yüksek öncelikli sistem alarmları yetkili operatörlere e-posta ile iletilir.</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Web Kancası (Webhook)</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-bold">Aktif</span>
                </div>
                <p className="text-[11px] text-slate-400">Dış servis ve SCADA sistemlerine HTTP POST JSON paketleri gönderilir.</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Canlı WebSocket</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-bold">Gerçek Zamanlı</span>
                </div>
                <p className="text-[11px] text-slate-400">Müşteri ve operatör ekranlarına gecikmesiz canlı bildirim düşer.</p>
              </div>
            </div>
          </div>
        )}

        {/* PANEL: Depolama & WAL */}
        {activeSubTab === 'storage' && (
          <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-sky-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Veritabanı & Fiziksel WAL Kalıcılık Durumu
                </h3>
              </div>
              {onNavigateToTab && (
                <button
                  type="button"
                  onClick={() => onNavigateToTab('database_data')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  <span>PostgreSQL Masasını Aç</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                <strong className="text-slate-900 dark:text-slate-100 block">Fiziksel Disk WAL (Persistent Log)</strong>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  Cihazlardan gelen telemetri verileri anında <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded">data/wal/physical-telemetry.ndjson</code> dosyasına işlenir. Sunucu kesintisinde veya DB kopmasında veri kaybı yaşanmaz.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                <strong className="text-slate-900 dark:text-slate-100 block">PostgreSQL / TimescaleDB Kümesi</strong>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  WAL kuyruğundaki veriler, veritabanı hazır (READY) durumunda mikro-batch halinde otomatik flush edilir ve chunk sıkıştırmasına tabi tutulur.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
