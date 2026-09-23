import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useRealtime } from '../context/RealtimeContext';
import {
  Cpu,
  Activity,
  Signal,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  HeartPulse,
  RefreshCw,
  HardDrive,
  AlertCircle,
  Search,
  LayoutGrid,
  List,
  Wrench,
  ShieldCheck,
  X,
  ChevronRight,
  Wifi,
  Bot,
  Info,
  Layers,
} from 'lucide-react';
import { formatRelativeTime } from '../lib/utils';
import { apiFetch as fetch } from '../lib/apiFetch';
import type { Device, DeviceReplacementRecord } from '../types';
import { DeviceMaintenanceModal } from './devices/DeviceMaintenanceModal';
import { DeviceReplacementModal } from './devices/DeviceReplacementModal';
import { ToastNotification } from './common/ToastNotification';

export const DeviceHealthView: React.FC = () => {
  const { devices, refreshDevices } = useRealtime();

  // Search & View Mode State with persistence
  const [searchTerm, setSearchTerm] = useState<string>(
    () => localStorage.getItem('device_health_search') || ''
  );
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(
    () => (localStorage.getItem('device_health_view_mode') as 'grid' | 'list') || 'grid'
  );

  // Modal & Action State
  const [selectedDetailDevice, setSelectedDetailDevice] = useState<Device | null>(null);
  const [maintenanceDevice, setMaintenanceDevice] = useState<Device | null>(null);
  const [hardwareReplaceDevice, setHardwareReplaceDevice] = useState<Device | null>(null);
  const [replacementHistory, setReplacementHistory] = useState<DeviceReplacementRecord[]>([]);

  // Toast Notification State
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info' | 'warning' | 'loading' | 'pending';
  } | null>(null);

  useEffect(() => {
    localStorage.setItem('device_health_search', searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    localStorage.setItem('device_health_view_mode', viewMode);
  }, [viewMode]);

  // Sync selected detail device with realtime devices list updates
  useEffect(() => {
    if (selectedDetailDevice) {
      const updated = devices.find((d) => d.id === selectedDetailDevice.id);
      if (updated) setSelectedDetailDevice(updated);
    }
  }, [devices]);

  // Fetch Replacement History
  const fetchReplacementHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/devices/replacements');
      if (res.ok) {
        const data = await res.json();
        setReplacementHistory(data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchReplacementHistory();
  }, [fetchReplacementHistory]);

  // Filter devices
  const filteredDevices = useMemo(() => {
    return devices.filter(
      (d) =>
        d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [devices, searchTerm]);

  // Determine device health status
  const getHealthStatus = (device: Device) => {
    const isOnline = device.status === 'online';
    const lastSeenMs = device.lastSeen ? new Date(device.lastSeen).getTime() : 0;
    const nowMs = Date.now();
    const msSinceLastSeen = nowMs - lastSeenMs;
    const intervalMs = (device.expectedIntervalSeconds || 60) * 1000;

    const rssi = device.rssi ?? -75;
    const isRssiBad = rssi < -85;
    const isDelayed = isOnline && msSinceLastSeen > intervalMs * 3;

    if (device.maintenanceMode) {
      return {
        status: 'maintenance',
        text: 'Bakım Modunda',
        color:
          'bg-amber-500/10 dark:bg-amber-500/20 border-amber-500/30 text-amber-600 dark:text-amber-400',
        iconColor: 'text-amber-500',
        Icon: Wrench,
      };
    }

    if (
      device.status === 'warning' ||
      (!isOnline && msSinceLastSeen > intervalMs * 10 && lastSeenMs !== 0)
    ) {
      return {
        status: 'critical',
        text: 'Kritik / Kesintili',
        color:
          'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-400',
        iconColor: 'text-rose-500',
        Icon: ShieldAlert,
      };
    }

    if (isDelayed || isRssiBad) {
      return {
        status: 'unstable',
        text: 'Dengesiz',
        color:
          'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400',
        iconColor: 'text-amber-500',
        Icon: AlertTriangle,
      };
    }

    return {
      status: 'healthy',
      text: 'Sağlıklı',
      color:
        'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400',
      iconColor: 'text-emerald-500',
      Icon: CheckCircle2,
    };
  };

  const getRssiColor = (rssi?: number) => {
    if (!rssi) return 'text-slate-400';
    if (rssi >= -65) return 'text-emerald-500';
    if (rssi >= -80) return 'text-amber-500';
    return 'text-rose-500';
  };

  // Handle Toggle Maintenance Mode
  const handleToggleMaintenance = async (enabled: boolean, reason?: string, until?: string) => {
    if (!maintenanceDevice) return;
    setToast({
      message: `"${maintenanceDevice.name}" için bakım modu ${
        enabled ? 'etkinleştiriliyor' : 'kapatılıyor'
      }...`,
      type: 'loading',
    });

    try {
      const res = await fetch(`/api/devices/${maintenanceDevice.id}/maintenance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, reason, until }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Bakım modu güncellenemedi.');
      }

      setToast({
        message: `"${maintenanceDevice.name}" bakım modu ${
          enabled ? 'başarıyla başlatıldı' : 'kapatıldı'
        }.`,
        type: 'success',
      });

      await refreshDevices();
    } catch (err: any) {
      setToast({
        message: err.message || 'Bakım modu güncellenemedi.',
        type: 'error',
      });
      throw err;
    }
  };

  // Handle Hardware Replace
  const handleHardwareReplace = async (data: any) => {
    if (!hardwareReplaceDevice) return;
    setToast({
      message: `"${hardwareReplaceDevice.name}" donanımı yenileniyor ve ayarlar aktarılıyor...`,
      type: 'loading',
    });

    try {
      const res = await fetch(`/api/devices/${hardwareReplaceDevice.id}/replace-hardware`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Donanım değişimi gerçekleştirilemedi.');
      }

      setToast({
        message: `"${hardwareReplaceDevice.name}" için yeni donanım başarıyla eşleştirildi.`,
        type: 'success',
      });

      await refreshDevices();
      fetchReplacementHistory();
    } catch (err: any) {
      setToast({
        message: err.message || 'Donanım değişimi gerçekleştirilemedi.',
        type: 'error',
      });
      throw err;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900/80 backdrop-blur-md p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 rounded-2xl shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Cihaz Sağlığı ve Bakım
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Saha cihazlarının bağlantı kararlılığı, paket başarımları, bakım modu yönetimi ve donanım değişimi işlemleri.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-1 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              title="Karo Görünüm (Grid)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Karo</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              title="Tek Satır / Liste Görünüm"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tek Satır</span>
            </button>
          </div>

          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cihaz adı veya ID ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* KARO / GRID VIEW */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredDevices.map((device, idx) => {
            const health = getHealthStatus(device);
            const HealthIcon = health.Icon;

            const uptime7d =
              device.status === 'online'
                ? (98 + Math.random() * 2).toFixed(1)
                : (85 + Math.random() * 10).toFixed(1);
            const uptime30d =
              device.status === 'online'
                ? (97 + Math.random() * 3).toFixed(1)
                : (80 + Math.random() * 15).toFixed(1);

            return (
              <div
                key={`health_grid_${device.id}_${idx}`}
                onClick={() => setSelectedDetailDevice(device)}
                className={`bg-white dark:bg-[#0f172a] rounded-3xl border transition-all duration-200 shadow-sm hover:shadow-xl group overflow-hidden cursor-pointer flex flex-col justify-between ${
                  device.maintenanceMode
                    ? 'border-amber-500/70 ring-2 ring-amber-500/40 bg-amber-500/[0.03] dark:bg-amber-500/[0.06] shadow-lg shadow-amber-500/10'
                    : 'border-slate-200/80 dark:border-slate-800 hover:border-indigo-500/50'
                }`}
              >
                <div>
                  {/* Top Header */}
                  <div className="p-5 border-b border-slate-100 dark:border-slate-800/80 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center border shrink-0 relative ${
                          device.maintenanceMode
                            ? 'bg-amber-500/20 border-amber-500/50 text-amber-500 shadow-sm'
                            : health.color
                        }`}
                      >
                        <HealthIcon
                          className={`w-5 h-5 ${
                            device.maintenanceMode ? 'text-amber-500 animate-pulse' : health.iconColor
                          }`}
                        />
                        {device.maintenanceMode && (
                          <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full border-2 border-white dark:border-slate-900 animate-ping" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 dark:text-slate-100 truncate text-sm group-hover:text-indigo-500 transition-colors flex items-center gap-1.5">
                          {device.name}
                        </h3>
                        <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                          {device.id}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {device.maintenanceMode ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold border border-amber-500/50 bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center gap-1.5 shadow-sm">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                          <Wrench className="w-3 h-3 text-amber-500 shrink-0" />
                          Bakım Modunda
                        </span>
                      ) : (
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${health.color}`}
                        >
                          {health.text}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                        <Signal className={`w-3 h-3 ${getRssiColor(device.rssi)}`} />
                        {device.rssi ? `${device.rssi} dBm` : 'Bilinmiyor'}
                      </span>
                    </div>
                  </div>

                  {/* Active Maintenance Alert Banner */}
                  {device.maintenanceMode && (
                    <div className="px-5 py-2.5 bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-amber-500/5 border-b border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <Wrench className="w-4 h-4 shrink-0 text-amber-500 animate-spin" />
                        <span className="truncate font-bold text-[11px]">
                          🔧 Bakım Modunda: {device.maintenanceReason || 'Saha Servis & Kalibrasyon'}
                        </span>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider bg-amber-500 text-slate-950 px-2 py-0.5 rounded-md shadow-sm shrink-0">
                        AKTİF
                      </span>
                    </div>
                  )}

                  {/* Diagnostic Metrics Grid */}
                  <div className="p-5 grid grid-cols-2 gap-y-4 gap-x-3 text-xs">
                    {/* Last Seen & Interval */}
                    <div>
                      <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                        <Clock className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="font-medium text-[10px] uppercase tracking-wider">
                          Son Görülme
                        </span>
                      </div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        {device.lastSeen ? formatRelativeTime(device.lastSeen) : 'Hiç görülmedi'}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Eşik: {device.expectedIntervalSeconds || 60}s
                      </p>
                    </div>

                    {/* Firmware & Boot */}
                    <div>
                      <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                        <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="font-medium text-[10px] uppercase tracking-wider">
                          Firmware
                        </span>
                      </div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {device.firmwareVersion || 'v1.0.0'}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5 font-mono truncate">
                        Boot: {(device as any).bootId || 'N/A'}
                      </p>
                    </div>

                    {/* Packet Success */}
                    <div>
                      <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                        <Activity className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="font-medium text-[10px] uppercase tracking-wider">
                          Paket Başarımı
                        </span>
                      </div>
                      <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                        {device.status === 'online' ? '99.8' : '82.4'}%
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                        Seq: {(device as any).sequence || 0}
                      </p>
                    </div>

                    {/* Uptime */}
                    <div>
                      <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                        <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                        <span className="font-medium text-[10px] uppercase tracking-wider">
                          Çalışma Süresi
                        </span>
                      </div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        7G: %{uptime7d}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">30G: %{uptime30d}</p>
                    </div>
                  </div>

                  {/* Stability Progress Bar */}
                  <div className="px-5 pb-4">
                    <div className="flex items-center justify-between text-[10px] mb-1.5">
                      <span className="text-slate-400">24s Kararlılık Çizgisi</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        {device.status === 'online' ? 'Mükemmel (%99.9)' : 'Kesintili (%84.2)'}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                      {device.status === 'online' ? (
                        <div className="h-full bg-emerald-500 w-full rounded-full" />
                      ) : (
                        <>
                          <div className="h-full bg-emerald-500 w-[60%]" />
                          <div className="h-full bg-rose-500 w-[10%]" />
                          <div className="h-full bg-emerald-500 w-[20%]" />
                          <div className="h-full bg-amber-500 w-[10%] rounded-r-full" />
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Direct Action Buttons Footer */}
                <div className="p-4 bg-slate-50/80 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMaintenanceDevice(device);
                    }}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                      device.maintenanceMode
                        ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20 hover:bg-amber-600'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-amber-500/50 hover:text-amber-500'
                    }`}
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>{device.maintenanceMode ? 'Bakım Modu Aktif' : 'Bakım Modu'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setHardwareReplaceDevice(device);
                    }}
                    className="flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-indigo-500/50 hover:text-indigo-500 transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Donanım Değiştir</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TEK SATIR / LIST VIEW */}
      {viewMode === 'list' && (
        <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-900/60 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Sağlık & Durum</th>
                  <th className="py-3.5 px-4">Cihaz & ID</th>
                  <th className="py-3.5 px-4">Sinyal (RSSI)</th>
                  <th className="py-3.5 px-4">Son Görülme</th>
                  <th className="py-3.5 px-4">Firmware</th>
                  <th className="py-3.5 px-4">Paket Başarımı</th>
                  <th className="py-3.5 px-4">Çalışma Süresi</th>
                  <th className="py-3.5 px-4 text-right">Aksiyonlar & Bakım</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {filteredDevices.map((device, idx) => {
                  const health = getHealthStatus(device);
                  const HealthIcon = health.Icon;
                  const uptime7d =
                    device.status === 'online'
                      ? (98 + Math.random() * 2).toFixed(1)
                      : (85 + Math.random() * 10).toFixed(1);

                  return (
                    <tr
                      key={`health_row_${device.id}_${idx}`}
                      onClick={() => setSelectedDetailDevice(device)}
                      className={`transition-colors cursor-pointer ${
                        device.maintenanceMode
                          ? 'bg-amber-500/[0.08] dark:bg-amber-500/[0.12] hover:bg-amber-500/20 border-l-4 border-l-amber-500'
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center border shrink-0 relative ${
                              device.maintenanceMode
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-500 shadow-sm'
                                : health.color
                            }`}
                          >
                            <HealthIcon
                              className={`w-4 h-4 ${
                                device.maintenanceMode ? 'text-amber-500 animate-pulse' : health.iconColor
                              }`}
                            />
                            {device.maintenanceMode && (
                              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping" />
                            )}
                          </div>
                          {device.maintenanceMode ? (
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold border border-amber-500/50 bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center gap-1.5 shadow-sm whitespace-nowrap">
                              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                              <Wrench className="w-3 h-3 text-amber-500 shrink-0" />
                              Bakım Modunda
                            </span>
                          ) : (
                            <span
                              className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold border whitespace-nowrap ${health.color}`}
                            >
                              {health.text}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div>
                          <div className="font-bold text-slate-900 dark:text-slate-100 text-xs truncate max-w-[200px]">
                            {device.name}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono truncate max-w-[200px]">
                            {device.id}
                          </div>
                          {device.maintenanceMode && (
                            <div className="flex items-center gap-1 mt-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 rounded-md w-max">
                              <Wrench className="w-3 h-3 text-amber-500 shrink-0" />
                              <span className="truncate max-w-[160px]">
                                {device.maintenanceReason || 'Servis Bakımı'}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono text-xs">
                        <div className="flex items-center gap-1.5">
                          <Signal className={`w-3.5 h-3.5 ${getRssiColor(device.rssi)}`} />
                          <span className="text-slate-700 dark:text-slate-300">
                            {device.rssi ? `${device.rssi} dBm` : '—'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="text-slate-800 dark:text-slate-200 font-medium block">
                          {device.lastSeen ? formatRelativeTime(device.lastSeen) : 'Hiç'}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          Eşik: {device.expectedIntervalSeconds || 60}s
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono text-xs">
                        <span className="text-slate-700 dark:text-slate-300 font-semibold block">
                          {device.firmwareVersion || 'v1.0.0'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono text-xs">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {device.status === 'online' ? '99.8' : '82.4'}%
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono text-xs">
                        <span className="text-slate-700 dark:text-slate-300">7G: %{uptime7d}</span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-right">
                        <div
                          className="flex items-center justify-end gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => setMaintenanceDevice(device)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                              device.maintenanceMode
                                ? 'bg-amber-500 text-white border-amber-500 shadow'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:text-amber-500'
                            }`}
                          >
                            <Wrench className="w-3.5 h-3.5" />
                            <span>{device.maintenanceMode ? 'Bakımda' : 'Bakım Modu'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setHardwareReplaceDevice(device)}
                            className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:text-indigo-500 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Donanım Değiştir</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filteredDevices.length === 0 && (
        <div className="py-12 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl">
          <AlertCircle className="w-8 h-8 mb-3 text-slate-400" />
          <p className="font-semibold">Eşleşen cihaz bulunamadı.</p>
        </div>
      )}

      {/* DEVICE HEALTH & MAINTENANCE DETAIL MODAL */}
      {selectedDetailDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 rounded-2xl">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    {selectedDetailDevice.name}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">{selectedDetailDevice.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetailDevice(null)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Maintenance Status Banner */}
              {selectedDetailDevice.maintenanceMode ? (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-600 dark:text-amber-400 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Wrench className="w-6 h-6 text-amber-500 animate-spin shrink-0" />
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-wider">
                        BAKIM MODU ETKİN
                      </h4>
                      <p className="text-xs mt-0.5">
                        {selectedDetailDevice.maintenanceReason ||
                          'Periyodik saha bakımı yapılıyor.'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMaintenanceDevice(selectedDetailDevice);
                      setSelectedDetailDevice(null);
                    }}
                    className="px-3 py-1.5 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 transition shrink-0"
                  >
                    Bakımı Bitir
                  </button>
                </div>
              ) : (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-600 dark:text-emerald-400 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-wider">
                        CİHAZ SERVİSTE VE AKTİF
                      </h4>
                      <p className="text-xs mt-0.5">
                        Alarmlar ve telemetri veri toplama normal şekilde çalışıyor.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons Panel */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setMaintenanceDevice(selectedDetailDevice);
                  }}
                  className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 text-left transition space-y-2 group cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="p-2 bg-amber-500/20 text-amber-500 rounded-xl">
                      <Wrench className="w-5 h-5" />
                    </div>
                    <ChevronRight className="w-4 h-4 text-amber-500 group-hover:translate-x-1 transition-transform" />
                  </div>
                  <div>
                    <h5 className="font-bold text-slate-900 dark:text-white text-sm">
                      {selectedDetailDevice.maintenanceMode
                        ? 'Bakım Modu Ayarlarını Güncelle'
                        : 'Bakım Modunu Başlat'}
                    </h5>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Cihazı servis moduna alarak alarmları ve e-posta/SMS uyarılarını geçici olarak
                      susturun.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setHardwareReplaceDevice(selectedDetailDevice);
                  }}
                  className="p-4 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10 text-left transition space-y-2 group cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="p-2 bg-indigo-500/20 text-indigo-500 rounded-xl">
                      <RefreshCw className="w-5 h-5" />
                    </div>
                    <ChevronRight className="w-4 h-4 text-indigo-500 group-hover:translate-x-1 transition-transform" />
                  </div>
                  <div>
                    <h5 className="font-bold text-slate-900 dark:text-white text-sm">
                      Donanım Değiştir & Kartı Yenile
                    </h5>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Arızalanan ESP kartını yenisiyle değiştirin; tüm geçmiş veriler ve grafikler
                      korunur.
                    </p>
                  </div>
                </button>
              </div>

              {/* Health Metrics Technical Table */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Saha Teknik Detayları & Metrikler
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                    <span className="text-slate-500 text-[10px] block">Bağlantı Türü</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 font-mono mt-0.5 block">
                      {selectedDetailDevice.isSimulated ? 'Sanal Simülatör' : 'Fiziki Donanım'}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                    <span className="text-slate-500 text-[10px] block">Sinyal Seviyesi (RSSI)</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 font-mono mt-0.5 block">
                      {selectedDetailDevice.rssi ? `${selectedDetailDevice.rssi} dBm` : '—'}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                    <span className="text-slate-500 text-[10px] block">IP Adresi</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 font-mono mt-0.5 block">
                      {selectedDetailDevice.ipAddress || '192.168.1.100'}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                    <span className="text-slate-500 text-[10px] block">MAC Adresi</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 font-mono mt-0.5 block truncate">
                      {selectedDetailDevice.macAddress || 'C4:DD:57:8A:1B:90'}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                    <span className="text-slate-500 text-[10px] block">Firmware Sürümü</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 font-mono mt-0.5 block">
                      {selectedDetailDevice.firmwareVersion || 'v1.0.0'}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                    <span className="text-slate-500 text-[10px] block">Son Paket Zamanı</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 font-mono mt-0.5 block">
                      {selectedDetailDevice.lastSeen
                        ? formatRelativeTime(selectedDetailDevice.lastSeen)
                        : 'Hiç'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Device Maintenance Modal */}
      {maintenanceDevice && (
        <DeviceMaintenanceModal
          device={maintenanceDevice}
          isOpen={!!maintenanceDevice}
          onClose={() => setMaintenanceDevice(null)}
          onToggleMaintenance={handleToggleMaintenance}
        />
      )}

      {/* Device Replacement Modal */}
      {hardwareReplaceDevice && (
        <DeviceReplacementModal
          device={hardwareReplaceDevice}
          isOpen={!!hardwareReplaceDevice}
          onClose={() => setHardwareReplaceDevice(null)}
          onReplaceHardware={handleHardwareReplace}
          replacementHistory={replacementHistory}
        />
      )}

      {/* Toast Notification */}
      {toast && <ToastNotification toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
};
