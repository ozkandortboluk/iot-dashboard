import React, { useState, useMemo } from 'react';
import type { WidgetConfig, Device, NotificationItem } from '../../types';
import { useRealtime } from '../../context/RealtimeContext';
import { formatShortTime, formatRelativeTime } from '../../lib/utils';
import {
  Zap,
  ShieldAlert,
  HeartPulse,
  LineChart,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Signal,
  Clock,
  ArrowUpRight,
  Sliders,
  BellRing,
  Activity,
  Check,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { DeviceStatusDot } from './DeviceStatusDot';

interface QuickAccessWidgetProps {
  config: WidgetConfig;
  onEdit?: () => void;
  onNavigateToTab?: (tab: string) => void;
}

export const QuickAccessWidget: React.FC<QuickAccessWidgetProps> = ({
  config,
  onEdit,
  onNavigateToTab,
}) => {
  const { devices, notifications, markNotificationRead, markAllNotificationsRead } = useRealtime();
  const [activeSubTab, setActiveSubTab] = useState<'alarms' | 'health' | 'reports'>('alarms');
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'critical' | 'warning'>('all');

  // Filter alarms
  const criticalAlarms = useMemo(() => {
    return notifications.filter((n) => n.severity === 'critical');
  }, [notifications]);

  const warningAlarms = useMemo(() => {
    return notifications.filter((n) => n.severity === 'warning');
  }, [notifications]);

  const displayedAlarms = useMemo(() => {
    let list = notifications;
    if (filterSeverity === 'critical') list = criticalAlarms;
    else if (filterSeverity === 'warning') list = warningAlarms;
    return list.slice(0, 5);
  }, [notifications, filterSeverity, criticalAlarms, warningAlarms]);

  // Compute Device Health stats
  const healthStats = useMemo(() => {
    let online = 0;
    let unstable = 0;
    let critical = 0;
    let healthy = 0;

    const deviceHealthList = devices.map((device: Device) => {
      const isOnline = device.status === 'online';
      if (isOnline) online++;
      const lastSeenMs = device.lastSeen ? new Date(device.lastSeen).getTime() : 0;
      const nowMs = Date.now();
      const msSinceLastSeen = nowMs - lastSeenMs;
      const intervalMs = (device.expectedIntervalSeconds || 60) * 1000;

      const rssi = device.rssi ?? -75;
      const isRssiBad = rssi < -85;
      const isDelayed = isOnline && msSinceLastSeen > intervalMs * 3;

      if (
        device.status === 'warning' ||
        (!isOnline && msSinceLastSeen > intervalMs * 10 && lastSeenMs !== 0)
      ) {
        critical++;
        return {
          device,
          status: 'critical',
          label: 'Kritik / Kesintili',
          badgeColor: 'bg-rose-500/10 text-rose-500 border-rose-500/30',
          dotColor: 'bg-rose-500',
        };
      }
      if (isDelayed || isRssiBad) {
        unstable++;
        return {
          device,
          status: 'unstable',
          label: isRssiBad ? 'Zayıf Sinyal' : 'Gecikmeli',
          badgeColor: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
          dotColor: 'bg-amber-500',
        };
      }

      healthy++;
      return {
        device,
        status: 'healthy',
        label: 'Sağlıklı',
        badgeColor: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
        dotColor: 'bg-emerald-500',
      };
    });

    // Sort to show critical and unstable first
    deviceHealthList.sort((a, b) => {
      const order: Record<string, number> = { critical: 0, unstable: 1, healthy: 2 };
      return (order[a.status] ?? 3) - (order[b.status] ?? 3);
    });

    return {
      total: devices.length,
      online,
      healthy,
      unstable,
      critical,
      attentionRequired: unstable + critical,
      deviceHealthList,
    };
  }, [devices]);

  const handleNavigate = (tab: string) => {
    if (onNavigateToTab) {
      onNavigateToTab(tab);
    }
  };

  return (
    <div className="h-full w-full min-h-0 bg-white dark:bg-[#0f172a] rounded-3xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xl hover:shadow-2xl transition-all flex flex-col justify-between overflow-y-auto custom-scrollbar">
      {/* Top Header */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/20 shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <DeviceStatusDot deviceId={config.deviceId} />
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                {config.title || 'Hızlı Erişim & Sağlık / Alarm Merkezi'}
              </h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                Sağlık raporları ve anlık kritik alarmlar
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onEdit && (
              <button
                onClick={onEdit}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                title="Widget Ayarları"
              >
                <Sliders className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 4 Quick Access Shortcut Tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
          {/* Tile 1: Kritik Alarmlar */}
          <button
            onClick={() => handleNavigate('notifications')}
            className={`p-3 rounded-2xl border text-left transition-all group flex flex-col justify-between ${
              criticalAlarms.length > 0
                ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/50 hover:border-rose-400 dark:hover:border-rose-600 shadow-sm hover:shadow-md'
                : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-1.5">
              <div
                className={`p-1.5 rounded-xl ${
                  criticalAlarms.length > 0
                    ? 'bg-rose-500/10 text-rose-500 dark:text-rose-400'
                    : 'bg-slate-200/60 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-black text-slate-900 dark:text-white">
                  {criticalAlarms.length}
                </span>
                <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                  Kritik Alarm
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                Alarmlar & Bildirimler →
              </p>
            </div>
          </button>

          {/* Tile 2: Cihaz Sağlığı */}
          <button
            onClick={() => handleNavigate('device_health')}
            className={`p-3 rounded-2xl border text-left transition-all group flex flex-col justify-between ${
              healthStats.attentionRequired > 0
                ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/50 hover:border-amber-400 dark:hover:border-amber-600 shadow-sm hover:shadow-md'
                : 'bg-emerald-50/40 dark:bg-emerald-950/10 border-emerald-200/70 dark:border-emerald-800/40 hover:border-emerald-400'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-1.5">
              <div
                className={`p-1.5 rounded-xl ${
                  healthStats.attentionRequired > 0
                    ? 'bg-amber-500/10 text-amber-500'
                    : 'bg-emerald-500/10 text-emerald-500'
                }`}
              >
                <HeartPulse className="w-3.5 h-3.5" />
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-black text-slate-900 dark:text-white">
                  {healthStats.healthy}/{healthStats.total}
                </span>
                <span
                  className={`text-[10px] font-bold ${
                    healthStats.attentionRequired > 0 ? 'text-amber-500' : 'text-emerald-500'
                  }`}
                >
                  {healthStats.attentionRequired > 0
                    ? `${healthStats.attentionRequired} Uyarı`
                    : 'Mükemmel'}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                Sağlık & Sinyal Raporu →
              </p>
            </div>
          </button>

          {/* Tile 3: İleri Düzey Analitik */}
          <button
            onClick={() => handleNavigate('analytics')}
            className="p-3 rounded-2xl border bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 text-left transition-all group flex flex-col justify-between"
          >
            <div className="flex items-center justify-between w-full mb-1.5">
              <div className="p-1.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <LineChart className="w-3.5 h-3.5" />
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-black text-slate-900 dark:text-white">Analitik</span>
                <span className="text-[10px] font-bold text-indigo-500">Raporlar</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                Trend Analizleri & Log →
              </p>
            </div>
          </button>

          {/* Tile 4: Saha Cihazları Yönetimi */}
          <button
            onClick={() => handleNavigate('devices')}
            className="p-3 rounded-2xl border bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 text-left transition-all group flex flex-col justify-between"
          >
            <div className="flex items-center justify-between w-full mb-1.5">
              <div className="p-1.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Cpu className="w-3.5 h-3.5" />
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-black text-slate-900 dark:text-white">
                  {healthStats.online}
                </span>
                <span className="text-[10px] font-bold text-emerald-500">Çevrimiçi Cihaz</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                Tüm Saha Cihazları →
              </p>
            </div>
          </button>
        </div>

        {/* Sub Navigation Bar inside Widget */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2 mb-3 text-xs">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl">
            <button
              onClick={() => setActiveSubTab('alarms')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all text-xs flex items-center gap-1.5 ${
                activeSubTab === 'alarms'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <BellRing className="w-3 h-3 text-rose-500" />
              <span>Kritik Alarmlar</span>
              {criticalAlarms.length > 0 && (
                <span className="px-1.5 py-0.2 bg-rose-500 text-white rounded-full text-[9px] font-bold">
                  {criticalAlarms.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveSubTab('health')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all text-xs flex items-center gap-1.5 ${
                activeSubTab === 'health'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <HeartPulse className="w-3 h-3 text-emerald-500" />
              <span>Cihaz Sağlık Durumu</span>
              {healthStats.attentionRequired > 0 && (
                <span className="px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[9px] font-bold">
                  {healthStats.attentionRequired}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveSubTab('reports')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all text-xs flex items-center gap-1.5 ${
                activeSubTab === 'reports'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Activity className="w-3 h-3 text-indigo-500" />
              <span>Saha Sağlık Raporları</span>
            </button>
          </div>

          {activeSubTab === 'alarms' && notifications.length > 0 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() =>
                  setFilterSeverity((prev) => (prev === 'critical' ? 'all' : 'critical'))
                }
                className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition-all ${
                  filterSeverity === 'critical'
                    ? 'bg-rose-500 text-white border-rose-500'
                    : 'text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Yalnızca Kritik
              </button>
            </div>
          )}
        </div>

        {/* Tab 1: Alarmlar Görünümü */}
        {activeSubTab === 'alarms' && (
          <div className="space-y-2 overflow-y-auto max-h-56 pr-1">
            {displayedAlarms.length === 0 ? (
              <div className="text-center py-6 px-4 bg-slate-50/50 dark:bg-slate-800/20 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-1.5" />
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Aktif Kritik Alarm Bulunmuyor
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Tüm saha parametreleri belirlenen güvenli eşik aralıklarında çalışıyor.
                </p>
              </div>
            ) : (
              displayedAlarms.map((n, idx) => (
                <div
                  key={`${n.id}_${idx}`}
                  onClick={() => markNotificationRead(n.id)}
                  className={`p-2.5 rounded-2xl border text-xs cursor-pointer transition-all flex items-start justify-between gap-2.5 group ${
                    !n.read
                      ? n.severity === 'critical'
                        ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40 hover:border-rose-400'
                        : 'bg-amber-50/50 dark:bg-amber-950/15 border-amber-200 dark:border-amber-800/40 hover:border-amber-400'
                      : 'bg-slate-50/50 dark:bg-slate-800/30 border-slate-200/60 dark:border-slate-800 hover:border-slate-400'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="mt-0.5 shrink-0">
                      {n.severity === 'critical' ? (
                        <div className="p-1 rounded-lg bg-rose-500/10 text-rose-500">
                          <XCircle className="w-3.5 h-3.5" />
                        </div>
                      ) : n.severity === 'warning' ? (
                        <div className="p-1 rounded-lg bg-amber-500/10 text-amber-500">
                          <AlertTriangle className="w-3.5 h-3.5" />
                        </div>
                      ) : (
                        <div className="p-1 rounded-lg bg-blue-500/10 text-blue-500">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-900 dark:text-white truncate">
                          {n.title}
                        </span>
                        {n.severity === 'critical' && (
                          <span className="text-[9px] font-black uppercase text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.2 rounded-md">
                            Kritik
                          </span>
                        )}
                        {(n.isSimulation || n.source === 'simulator') && (
                          <span className="text-[9px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1 py-0.2 rounded">
                            Sanal Test
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-1">
                        {n.message}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0 text-[10px] text-slate-400">
                    <span>{formatShortTime(n.timestamp)}</span>
                    <span className="text-[9px] text-indigo-500 dark:text-indigo-400 group-hover:underline mt-1 font-semibold">
                      Görüntüle →
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 2: Cihaz Sağlık Durumu Görünümü */}
        {activeSubTab === 'health' && (
          <div className="space-y-2 overflow-y-auto max-h-56 pr-1">
            {healthStats.deviceHealthList.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">
                Kayıtlı saha cihazı bulunamadı.
              </div>
            ) : (
              healthStats.deviceHealthList.slice(0, 6).map(({ device, status, label, badgeColor, dotColor }) => {
                const rssi = device.rssi ?? -70;
                return (
                  <div
                    key={device.id}
                    onClick={() => handleNavigate('device_health')}
                    className="p-2.5 rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 hover:border-indigo-400/50 dark:hover:border-indigo-600 transition-all flex items-center justify-between gap-3 cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor} ${status === 'critical' ? 'animate-ping' : ''}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="font-bold text-slate-900 dark:text-white text-xs truncate">
                            {device.name}
                          </p>
                          <span className="text-[10px] font-mono text-slate-400 shrink-0 hidden xs:inline-block">
                            {device.id}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {device.lastSeen ? formatRelativeTime(device.lastSeen) : 'Hiç görülmedi'}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Signal className="w-3 h-3 text-slate-400" />
                            {rssi} dBm
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeColor}`}
                      >
                        {label}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Tab 3: Saha Sağlık Raporları Kısayolları */}
        {activeSubTab === 'reports' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 overflow-y-auto max-h-56 pr-1">
            {/* Report 1 */}
            <div
              onClick={() => handleNavigate('device_health')}
              className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-emerald-400 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-500">
                  <Signal className="w-3.5 h-3.5" />
                </div>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  %{((healthStats.healthy / (healthStats.total || 1)) * 100).toFixed(0)} SLA
                </span>
              </div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                Bağlantı & Sinyal Raporu
              </h4>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                RSSI, paket kayıpları ve ping gecikme analizleri
              </p>
            </div>

            {/* Report 2 */}
            <div
              onClick={() => handleNavigate('notifications')}
              className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-rose-400 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="p-1.5 rounded-xl bg-rose-500/10 text-rose-500">
                  <ShieldAlert className="w-3.5 h-3.5" />
                </div>
                <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                  {criticalAlarms.length} Aktif
                </span>
              </div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
                Eşik & Anomali Alarmları
              </h4>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                Sıcaklık, voltaj ve CPU aşım olay kayıtları
              </p>
            </div>

            {/* Report 3 */}
            <div
              onClick={() => handleNavigate('analytics')}
              className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-indigo-400 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="p-1.5 rounded-xl bg-indigo-500/10 text-indigo-500">
                  <LineChart className="w-3.5 h-3.5" />
                </div>
                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                  Canlı Trend
                </span>
              </div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                Telemetri & Metrik Trendi
              </h4>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                Saatlik/günlük agregasyon ve güç tüketim geçmişi
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Footer Actions */}
      <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <strong className="text-slate-700 dark:text-slate-200">{healthStats.online}</strong> Çevrimiçi
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <strong className="text-slate-700 dark:text-slate-200">{criticalAlarms.length}</strong> Kritik
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleNavigate('device_health')}
            className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 font-bold transition-all text-xs flex items-center gap-1"
          >
            <span>Detaylı Sağlık Raporu</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
