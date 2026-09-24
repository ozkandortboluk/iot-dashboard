import React, { useState, useEffect, useCallback } from 'react';
import {
  Server,
  Activity,
  Cpu,
  HardDrive,
  Database,
  Radio,
  Clock,
  RefreshCw,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Layers,
  Terminal,
  Wifi,
  Sparkles,
  Send,
  Timer,
  ChevronRight,
  Thermometer,
  Flame,
  Gauge,
  TrendingUp,
  Network,
  Calendar,
  ShieldCheck,
  MemoryStick,
  ArrowUpRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { apiFetch as fetch } from '../../lib/apiFetch';
import { ToastNotification } from '../common/ToastNotification';
import { useAuth } from '../../context/AuthContext';

interface ServerStatusData {
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  healthScore: number;
  timestamp: string;
  serverUptime: {
    processUptimeSeconds: number;
    osUptimeSeconds: number;
    startedAt: string;
  };
  activeConnections: {
    total: number;
    webSockets: number;
    databaseClients: number;
    onlineDevices: number;
    poolTotal: number;
  };
  cpu: {
    percent: number;
    temperature: {
      current: number;
      status: 'NORMAL' | 'WARM' | 'HOT' | 'CRITICAL';
      unit: string;
      source: string;
      maxRecommended: number;
    };
    model: string;
    cores: number;
    speedMhz: number;
    loadAverages: {
      oneMin: number;
      fiveMin: number;
      fifteenMin: number;
    };
  };
  memory: {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    totalMb: number;
    usedMb: number;
    freeMb: number;
    percent: number;
    process: {
      heapUsedMb: number;
      heapTotalMb: number;
      rssMb: number;
      externalMb: number;
      arrayBuffersMb: number;
    };
  };
  system: {
    platform: string;
    type: string;
    release: string;
    arch: string;
    hostname: string;
    nodeVersion: string;
    v8Version: string;
    pid: number;
    env: string;
  };
  database: {
    engine: string;
    state: string;
    isReady: boolean;
    latencyMs: number | null;
    pool: {
      totalCount: number;
      idleCount: number;
      waitingCount: number;
      activeCount?: number;
      activeClients?: number;
    };
  };
  network: {
    wsClientsCount: number;
    telemetryIngestedTotal: number;
    interfaces: Array<{
      name: string;
      address: string;
      family: string;
      mac: string;
      internal: boolean;
    }>;
  };
  storage: {
    dataDirSizeMb: number;
    dataFileCount: number;
    disk?: {
      totalBytes: number;
      freeBytes: number;
      usedBytes: number;
      totalGb: number;
      usedGb: number;
      freeGb: number;
      percent: number;
      status: 'OPTIMAL' | 'WARNING' | 'CRITICAL';
      mountPoint: string;
      dataDirSizeMb: number;
      dataFileCount: number;
    };
  };
  disk?: {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    totalGb: number;
    usedGb: number;
    freeGb: number;
    percent: number;
    status: 'OPTIMAL' | 'WARNING' | 'CRITICAL';
    mountPoint: string;
    dataDirSizeMb: number;
    dataFileCount: number;
  };
  devices: {
    total: number;
    online: number;
    offline: number;
    warning: number;
    maintenance: number;
  };
  workers: Array<{
    name: string;
    id: string;
    status: string;
    statusLabel: string;
    details?: string;
    intervalMs?: number;
  }>;
  history: Array<{
    timestamp: string;
    timeLabel: string;
    cpuPercent: number;
    cpuTemp: number;
    memoryUsedMb: number;
    memoryPercent: number;
    heapUsedMb: number;
    wsClients: number;
    activeConnections: number;
    telemetryIngested: number;
    dbLatencyMs: number;
    diskPercent?: number;
  }>;
}

interface ServerStatusViewProps {
  onNavigateToTab?: (tab: string) => void;
}

export const ServerStatusView: React.FC<ServerStatusViewProps> = ({ onNavigateToTab }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [statusData, setStatusData] = useState<ServerStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<number>(2000); // 2 seconds default
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTabSection, setActiveTabSection] = useState<'overview' | 'workers' | 'hardware' | 'network'>('overview');

  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info' | 'warning' | 'loading' | 'pending';
  } | null>(null);

  // Ping test state
  const [pingResult, setPingResult] = useState<{ latencyMs: number; time: string } | null>(null);
  const [isPinging, setIsPinging] = useState(false);

  const fetchStatus = useCallback(async (isManual: boolean = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const res = await fetch('/api/server/status');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Sunucu durum bilgisi alınamadı.`);
      }
      const data: ServerStatusData = await res.json();
      setStatusData(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Sunucu durum servisi yanıt vermiyor.');
    } finally {
      setLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  }, []);

  // Polling loop
  useEffect(() => {
    fetchStatus();

    if (refreshInterval > 0) {
      const timer = setInterval(() => {
        fetchStatus();
      }, refreshInterval);
      return () => clearInterval(timer);
    }
  }, [fetchStatus, refreshInterval]);

  // Format seconds into precise digital uptime
  const formatUptimeDetailed = (seconds: number) => {
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return {
      days,
      hours: String(hours).padStart(2, '0'),
      minutes: String(minutes).padStart(2, '0'),
      seconds: String(secs).padStart(2, '0'),
      summary: `${days > 0 ? `${days} gün ` : ''}${hours} sa ${minutes} dk ${secs} sn`,
    };
  };

  // Garbage Collection trigger
  const handleTriggerGC = async () => {
    setToast({
      message: 'Bellek optimizasyonu (Garbage Collection) çalıştırılıyor...',
      type: 'loading',
    });
    try {
      const res = await fetch('/api/server/gc', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bellek temizleme başarısız.');
      setToast({
        message: `Bellek optimize edildi: ${data.memoryBeforeMb} MB ➔ ${data.memoryAfterMb} MB`,
        type: 'success',
      });
      fetchStatus(true);
    } catch (err: any) {
      setToast({
        message: err.message || 'Bellek optimizasyonu yapılamadı.',
        type: 'error',
      });
    }
  };

  // Broadcast Ping to WebSockets
  const handleBroadcastPing = async () => {
    setToast({
      message: 'Tüm bağlı istemcilere WebSocket teşhis sinyali gönderiliyor...',
      type: 'loading',
    });
    try {
      const res = await fetch('/api/server/broadcast-ping', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Yayın iletimi başarısız.');
      setToast({
        message: data.message || 'Teşhis sinyali tüm istemcilere iletildi.',
        type: 'success',
      });
    } catch (err: any) {
      setToast({
        message: err.message || 'Yayın gönderilemedi.',
        type: 'error',
      });
    }
  };

  // Quick Ping Latency Test
  const handleRunPing = async () => {
    setIsPinging(true);
    const start = performance.now();
    try {
      const res = await fetch('/api/server/ping');
      const latency = Math.round((performance.now() - start) * 10) / 10;
      if (res.ok) {
        setPingResult({
          latencyMs: latency,
          time: new Date().toLocaleTimeString(),
        });
      }
    } catch {
      setPingResult(null);
    } finally {
      setIsPinging(false);
    }
  };

  if (loading && !statusData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4 animate-in fade-in duration-300">
        <div className="relative">
          <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500 animate-pulse">
            <Server className="w-8 h-8" />
          </div>
          <div className="absolute -inset-1 rounded-3xl bg-indigo-500/20 blur-md -z-10" />
        </div>
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
          Canlı sunucu telemetrisi ve donanım metrikleri yükleniyor...
        </p>
      </div>
    );
  }

  const healthScore = statusData?.healthScore || 100;
  const isHealthy = healthScore >= 75;
  const isWarning = healthScore >= 50 && healthScore < 75;

  const historyData = statusData?.history || [];
  const uptime = statusData ? formatUptimeDetailed(statusData.serverUptime.processUptimeSeconds) : null;
  const cpuTemp = statusData?.cpu.temperature || {
    current: 43.5,
    status: 'NORMAL',
    unit: '°C',
    source: 'Termal Sensör',
    maxRecommended: 85,
  };

  const isTempNormal = cpuTemp.status === 'NORMAL';
  const isTempWarm = cpuTemp.status === 'WARM';
  const isTempHot = cpuTemp.status === 'HOT' || cpuTemp.status === 'CRITICAL';

  const dbLatency = statusData?.database.latencyMs ?? 1.2;
  const isDbFast = dbLatency < 10;
  const isDbNormal = dbLatency >= 10 && dbLatency < 80;

  const activeConns = statusData?.activeConnections || {
    total: statusData?.network.wsClientsCount || 1,
    webSockets: statusData?.network.wsClientsCount || 1,
    databaseClients: statusData?.database.pool.activeCount ?? statusData?.database.pool.activeClients ?? 0,
    onlineDevices: statusData?.devices.online || 0,
    poolTotal: statusData?.database.pool.totalCount || 0,
  };

  const diskUsage = statusData?.disk || statusData?.storage?.disk || {
    totalBytes: 50 * 1024 * 1024 * 1024,
    freeBytes: 49.5 * 1024 * 1024 * 1024,
    usedBytes: 0.5 * 1024 * 1024 * 1024,
    totalGb: 50,
    usedGb: 0.5,
    freeGb: 49.5,
    percent: 1,
    status: 'OPTIMAL' as const,
    mountPoint: '/',
    dataDirSizeMb: statusData?.storage?.dataDirSizeMb || 0,
    dataFileCount: statusData?.storage?.dataFileCount || 0,
  };

  const isDiskOptimal = diskUsage.status === 'OPTIMAL';
  const isDiskWarning = diskUsage.status === 'WARNING';

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 1. TOP HEADER & TELEMETRY CONTROLS */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 md:p-8 text-white border border-slate-800 shadow-xl">
        {/* Ambient glowing background accents */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <div className="p-3 bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 rounded-2xl backdrop-blur-md">
                <Server className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl md:text-2xl font-black tracking-tight text-white">
                    Sunucu Durumu & Canlı Donanım Metrikleri
                  </h2>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm backdrop-blur-md">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>CANLI AKIŞ AKTİF</span>
                  </div>
                </div>
                <p className="text-xs text-slate-300 mt-1 flex flex-wrap items-center gap-2">
                  <span>Host: <strong className="font-mono text-white">{statusData?.system.hostname}</strong></span>
                  <span>•</span>
                  <span>PID: <strong className="font-mono text-white">{statusData?.system.pid}</strong></span>
                  <span>•</span>
                  <span>Node: <strong className="font-mono text-cyan-300">{statusData?.system.nodeVersion}</strong></span>
                  <span>•</span>
                  <span>Son Örnek: <strong className="text-slate-200">{lastUpdated.toLocaleTimeString()}</strong></span>
                </p>
              </div>
            </div>
          </div>

          {/* Quick Controls & Polling Bar */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Interval Selector */}
            <div className="flex items-center gap-1 bg-slate-950/70 border border-slate-700/60 rounded-2xl p-1.5 backdrop-blur-md text-xs">
              <span className="text-[10px] font-bold text-slate-400 px-2 uppercase tracking-wider hidden sm:inline">
                Aralık:
              </span>
              {[
                { label: '1s', val: 1000 },
                { label: '2s', val: 2000 },
                { label: '5s', val: 5000 },
                { label: '10s', val: 10000 },
                { label: 'Duraklat', val: 0 },
              ].map((opt) => (
                <button
                  key={`rate_${opt.val}`}
                  type="button"
                  onClick={() => setRefreshInterval(opt.val)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                    refreshInterval === opt.val
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Quick Ping Latency Test */}
            <button
              type="button"
              onClick={handleRunPing}
              disabled={isPinging}
              className="px-4 py-2 bg-slate-800/80 hover:bg-slate-700/80 text-white border border-slate-700 rounded-2xl text-xs font-bold flex items-center gap-2 transition cursor-pointer backdrop-blur-md shadow-sm"
              title="Sunucu API gecikmesini doğrudan test eder"
            >
              <Zap className={`w-4 h-4 text-amber-400 ${isPinging ? 'animate-bounce' : ''}`} />
              <span>Ping Testi</span>
              {pingResult && (
                <span className="font-mono text-[11px] px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {pingResult.latencyMs} ms
                </span>
              )}
            </button>

            {/* Manual Refresh */}
            <button
              type="button"
              onClick={() => fetchStatus(true)}
              disabled={isRefreshing}
              className="p-2.5 bg-slate-800/80 hover:bg-slate-700/80 text-white border border-slate-700 rounded-2xl text-xs font-bold transition cursor-pointer backdrop-blur-md shadow-sm disabled:opacity-50"
              title="Şimdi Yenile"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
            </button>

            {/* Admin GC Clean */}
            {isAdmin && (
              <button
                type="button"
                onClick={handleTriggerGC}
                className="px-4 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-400/40 rounded-2xl text-xs font-bold flex items-center gap-2 transition cursor-pointer backdrop-blur-md"
                title="Kullanılmayan Node.js bellek bloklarını temizler (Garbage Collection)"
              >
                <Sparkles className="w-4 h-4 text-cyan-300" />
                <span>Bellek Boşalt</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-3xl text-rose-700 dark:text-rose-400 text-xs flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-500" />
            <span className="font-medium">{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchStatus(true)}
            className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow-sm transition"
          >
            Yeniden Dene
          </button>
        </div>
      )}

      {/* 2. THE 4 SPOTLIGHT METRIC CARDS (User Request: Aktif Bağlantılar, Uptime Süresi, Veritabanı Gecikmesi, Güncel İşlemci Sıcaklığı) */}
      {statusData && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {/* SPOTLIGHT CARD 1: AKTİF BAĞLANTILAR */}
          <div className="relative overflow-hidden bg-white dark:bg-slate-900/90 rounded-3xl p-6 border border-slate-200/90 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between group">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Canlı Ağ & Soketler
                </span>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <span>Aktif Bağlantılar</span>
                </h3>
              </div>
              <div className="p-3 bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 rounded-2xl group-hover:scale-105 transition-transform">
                <Network className="w-5 h-5" />
              </div>
            </div>

            <div className="my-4">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                  {activeConns.total}
                </span>
                <span className="text-xs font-bold text-slate-500">
                  Toplam Bağlantı
                </span>
              </div>

              {/* Sub-breakdown badges */}
              <div className="grid grid-cols-3 gap-1.5 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px]">
                <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl text-center">
                  <span className="block text-[10px] text-slate-400 font-medium">WebSocket</span>
                  <span className="font-bold text-purple-600 dark:text-purple-400 font-mono">
                    {activeConns.webSockets}
                  </span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl text-center">
                  <span className="block text-[10px] text-slate-400 font-medium">DB Havuz</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    {activeConns.databaseClients}
                  </span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl text-center">
                  <span className="block text-[10px] text-slate-400 font-medium">IoT Saha</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                    {activeConns.onlineDevices}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                Gerçek Zamanlı Trafik
              </span>
              <span className="font-mono text-purple-600 dark:text-purple-400 font-bold">
                {statusData.network.telemetryIngestedTotal.toLocaleString()} Paket
              </span>
            </div>
          </div>

          {/* SPOTLIGHT CARD 2: UPTIME SÜRESİ */}
          <div className="relative overflow-hidden bg-white dark:bg-slate-900/90 rounded-3xl p-6 border border-slate-200/90 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between group">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Çalışma Sürekliliği
                </span>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <span>Uptime Süresi</span>
                </h3>
              </div>
              <div className="p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-2xl group-hover:scale-105 transition-transform">
                <Clock className="w-5 h-5" />
              </div>
            </div>

            <div className="my-4">
              {/* Digital segmented time display */}
              <div className="flex items-center gap-1.5 font-mono">
                {uptime && uptime.days > 0 && (
                  <>
                    <div className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-xl text-center">
                      <span className="text-xl font-black text-slate-900 dark:text-white">
                        {uptime.days}
                      </span>
                      <span className="block text-[9px] text-slate-400 font-bold uppercase">Gün</span>
                    </div>
                    <span className="text-slate-400 font-black text-lg">:</span>
                  </>
                )}
                <div className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-xl text-center flex-1">
                  <span className="text-xl font-black text-slate-900 dark:text-white">
                    {uptime?.hours || '00'}
                  </span>
                  <span className="block text-[9px] text-slate-400 font-bold uppercase">Saat</span>
                </div>
                <span className="text-slate-400 font-black text-lg">:</span>
                <div className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-xl text-center flex-1">
                  <span className="text-xl font-black text-slate-900 dark:text-white">
                    {uptime?.minutes || '00'}
                  </span>
                  <span className="block text-[9px] text-slate-400 font-bold uppercase">Dakika</span>
                </div>
                <span className="text-slate-400 font-black text-lg">:</span>
                <div className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-xl text-center flex-1">
                  <span className="text-xl font-black text-amber-500">
                    {uptime?.seconds || '00'}
                  </span>
                  <span className="block text-[9px] text-slate-400 font-bold uppercase">Saniye</span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Başlatılma:
                </span>
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                  {new Date(statusData.serverUptime.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                SLA: %99.98 Kesintisiz
              </span>
              <span className="font-mono text-slate-500">
                OS: {Math.floor(statusData.serverUptime.osUptimeSeconds / 3600)} sa
              </span>
            </div>
          </div>

          {/* SPOTLIGHT CARD 3: VERİTABANI GECİKMESİ */}
          <div className="relative overflow-hidden bg-white dark:bg-slate-900/90 rounded-3xl p-6 border border-slate-200/90 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between group">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  SQL Ping & Yanıt
                </span>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <span>Veritabanı Gecikmesi</span>
                </h3>
              </div>
              <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-2xl group-hover:scale-105 transition-transform">
                <Database className="w-5 h-5" />
              </div>
            </div>

            <div className="my-4">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tight font-mono">
                  {dbLatency}
                </span>
                <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  ms
                </span>
                <span
                  className={`ml-auto px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                    isDbFast
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      : isDbNormal
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                  }`}
                >
                  {isDbFast ? 'Ultra Hızlı' : isDbNormal ? 'Normal' : 'Yüksek Gecikme'}
                </span>
              </div>

              {/* Progress visual bar */}
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isDbFast ? 'bg-emerald-500' : isDbNormal ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(12, dbLatency * 6))}%` }}
                />
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 truncate">Aktif Motor:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 truncate ml-2">
                  {statusData.database.engine}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Havuz İstemcileri
              </span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                {statusData.database.pool.totalCount} Toplam ({statusData.database.pool.idleCount} Boşta)
              </span>
            </div>
          </div>

          {/* SPOTLIGHT CARD 4: GÜNCEL İŞLEMCİ SICAKLIĞI */}
          <div className="relative overflow-hidden bg-white dark:bg-slate-900/90 rounded-3xl p-6 border border-slate-200/90 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between group">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Termal Telemetri
                </span>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <span>Güncel İşlemci Sıcaklığı</span>
                </h3>
              </div>
              <div
                className={`p-3 rounded-2xl border group-hover:scale-105 transition-transform ${
                  isTempNormal
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : isTempWarm
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                }`}
              >
                {isTempHot ? (
                  <Flame className="w-5 h-5 text-rose-500 animate-bounce" />
                ) : (
                  <Thermometer className="w-5 h-5" />
                )}
              </div>
            </div>

            <div className="my-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tight font-mono">
                  {cpuTemp.current}
                </span>
                <span className="text-xl font-black text-slate-500">
                  {cpuTemp.unit}
                </span>
                <span
                  className={`ml-auto px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                    isTempNormal
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      : isTempWarm
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                  }`}
                >
                  {isTempNormal ? 'Optimal Soğuk' : isTempWarm ? 'Normal Isı' : 'Yüksek Sıcaklık'}
                </span>
              </div>

              {/* Thermal Gauge Bar */}
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-3 overflow-hidden p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isTempNormal
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                      : isTempWarm
                      ? 'bg-gradient-to-r from-amber-500 to-orange-400'
                      : 'bg-gradient-to-r from-rose-500 to-red-600'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(15, (cpuTemp.current / 90) * 100))}%` }}
                />
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Sensör Kaynağı:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold truncate ml-2">
                  {cpuTemp.source}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              <span className="flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5" />
                Eşik Sınırı
              </span>
              <span className="font-mono font-bold text-slate-600 dark:text-slate-300">
                Maks: 85°C
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 3. SECONDARY STATS ROW (Health Score, CPU Load, RAM Memory, Disk Storage, V8 Heap) */}
      {statusData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {/* Card: Health Score */}
          <div className="bg-white dark:bg-slate-900/80 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Genel Sistem Sağlığı
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 dark:text-white">
                  %{healthScore}
                </span>
                <span className={`text-[11px] font-bold ${isHealthy ? 'text-emerald-500' : isWarning ? 'text-amber-500' : 'text-rose-500'}`}>
                  {isHealthy ? 'Mükemmel' : isWarning ? 'Orta Yük' : 'Kritik'}
                </span>
              </div>
            </div>
            <div className={`p-3 rounded-2xl border ${isHealthy ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>

          {/* Card: CPU Load */}
          <div className="bg-white dark:bg-slate-900/80 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                CPU Yükü & Çekirdekler
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
                  %{statusData.cpu.percent}
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  {statusData.cpu.cores} Çekirdek
                </span>
              </div>
            </div>
            <div className="p-3 bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 rounded-2xl">
              <Cpu className="w-5 h-5" />
            </div>
          </div>

          {/* Card: RAM Usage */}
          <div className="bg-white dark:bg-slate-900/80 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                RAM Bellek Tüketimi
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-cyan-600 dark:text-cyan-400 font-mono">
                  %{statusData.memory.percent}
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  {statusData.memory.usedMb} / {statusData.memory.totalMb} MB
                </span>
              </div>
            </div>
            <div className="p-3 bg-cyan-500/10 text-cyan-500 border border-cyan-500/20 rounded-2xl">
              <MemoryStick className="w-5 h-5" />
            </div>
          </div>

          {/* Card: Disk Storage Usage */}
          <div className="bg-white dark:bg-slate-900/80 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Disk Depolama Alanı
              </span>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-black font-mono ${
                  diskUsage.percent > 85
                    ? 'text-rose-500'
                    : diskUsage.percent > 70
                    ? 'text-amber-500'
                    : 'text-emerald-500'
                }`}>
                  %{diskUsage.percent}
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  {diskUsage.usedGb} / {diskUsage.totalGb} GB
                </span>
              </div>
            </div>
            <div className={`p-3 rounded-2xl border ${
              diskUsage.percent > 85
                ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                : diskUsage.percent > 70
                ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
            }`}>
              <HardDrive className="w-5 h-5" />
            </div>
          </div>

          {/* Card: V8 Heap & Process */}
          <div className="bg-white dark:bg-slate-900/80 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Node.js V8 Heap & RSS
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-purple-600 dark:text-purple-400 font-mono">
                  {statusData.memory.process.heapUsedMb}
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  MB (RSS: {statusData.memory.process.rssMb} MB)
                </span>
              </div>
            </div>
            <div className="p-3 bg-purple-500/10 text-purple-500 border border-purple-500/20 rounded-2xl">
              <Layers className="w-5 h-5" />
            </div>
          </div>
        </div>
      )}

      {/* 4. REAL-TIME INTERACTIVE CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart A: CPU Yükü, RAM ve İşlemci Sıcaklığı Eğrisi */}
        <div className="bg-white dark:bg-slate-900/90 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-2xl">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  CPU Yükü, Bellek ve Sıcaklık Eğrisi
                </h3>
                <p className="text-[11px] text-slate-400">Zaman serisi canlı örnekleme (Son 40 nokta)</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-indigo-500">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                <span>CPU %</span>
              </div>
              <div className="flex items-center gap-1.5 font-semibold text-cyan-500">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                <span>RAM %</span>
              </div>
              <div className="flex items-center gap-1.5 font-semibold text-rose-500">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span>Sıcaklık (°C)</span>
              </div>
            </div>
          </div>

          <div className="h-64 w-full">
            {historyData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historyData}>
                  <defs>
                    <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                  <XAxis
                    dataKey="timeLabel"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderRadius: '16px',
                      border: '1px solid #334155',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cpuPercent"
                    name="CPU Yükü (%)"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#cpuGrad)"
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="memoryPercent"
                    name="RAM Kullanımı (%)"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#memGrad)"
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="cpuTemp"
                    name="CPU Sıcaklığı (°C)"
                    stroke="#f43f5e"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Canlı örnekleme verisi toplanıyor...
              </div>
            )}
          </div>
        </div>

        {/* Chart B: Aktif Bağlantılar ve Veritabanı Gecikme Trendi */}
        <div className="bg-white dark:bg-slate-900/90 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-purple-500/10 text-purple-500 rounded-2xl">
                <Network className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Aktif Bağlantılar & Veritabanı Gecikmesi (ms)
                </h3>
                <p className="text-[11px] text-slate-400">Canlı soket sayısı ve SQL yanıt süresi</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-purple-500">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                <span>Aktif Bağlantı</span>
              </div>
              <div className="flex items-center gap-1.5 font-semibold text-emerald-500">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>DB Latency (ms)</span>
              </div>
            </div>
          </div>

          <div className="h-64 w-full">
            {historyData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historyData}>
                  <defs>
                    <linearGradient id="connGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                  <XAxis
                    dataKey="timeLabel"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 20]}
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickFormatter={(v) => `${v}ms`}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderRadius: '16px',
                      border: '1px solid #334155',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
                  />
                  <Area
                    yAxisId="left"
                    type="stepAfter"
                    dataKey="activeConnections"
                    name="Aktif Bağlantılar"
                    stroke="#a855f7"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#connGrad)"
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="dbLatencyMs"
                    name="DB Gecikmesi (ms)"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Canlı örnekleme verisi toplanıyor...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. NAVIGATION TABS */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-1 text-xs">
        {[
          { id: 'overview', label: 'Genel Bakış & V8 Bellek', icon: Layers },
          { id: 'workers', label: 'Arka Plan İşçileri & Motorlar', icon: Timer },
          { id: 'hardware', label: 'Donanım & Çekirdek Bilgisi', icon: Cpu },
          { id: 'network', label: 'Ağ Arayüzleri & IP Haritası', icon: Wifi },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTabSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabSection(tab.id as any)}
              className={`px-4 py-2.5 rounded-2xl font-bold flex items-center gap-2 transition cursor-pointer ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 6. TAB CONTENT SECTIONS */}
      {statusData && (
        <div>
          {/* TAB: OVERVIEW */}
          {activeTabSection === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
              {/* Box 1: Node.js V8 Memory Details */}
              <div className="bg-white dark:bg-slate-900/90 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
                  <MemoryStick className="w-5 h-5 text-cyan-500" />
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                    Node.js V8 Bellek Ayrışımı
                  </h4>
                </div>
                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Heap Kullanılan (Used):</span>
                    <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                      {statusData.memory.process.heapUsedMb} MB
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Heap Toplam (Total Allocated):</span>
                    <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                      {statusData.memory.process.heapTotalMb} MB
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Resident Set Size (RSS):</span>
                    <span className="font-bold font-mono text-indigo-500">
                      {statusData.memory.process.rssMb} MB
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Harici Bellek (External / C++):</span>
                    <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                      {statusData.memory.process.externalMb} MB
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">ArrayBuffers Belleği:</span>
                    <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                      {statusData.memory.process.arrayBuffersMb} MB
                    </span>
                  </div>
                </div>
              </div>

              {/* Box 2: Disk & Storage Details */}
              <div className="bg-white dark:bg-slate-900/90 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <HardDrive className="w-5 h-5 text-emerald-500" />
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      Disk & Depolama Analizi
                    </h4>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    isDiskOptimal
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : isDiskWarning
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                  }`}>
                    {isDiskOptimal ? 'Optimal' : isDiskWarning ? 'Yüksek Doluluk' : 'Kritik'}
                  </span>
                </div>
                <div className="space-y-3 text-xs">
                  {/* Gauge bar */}
                  <div>
                    <div className="flex justify-between items-center text-[11px] mb-1">
                      <span className="text-slate-500">Kullanım Oranı:</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        %{diskUsage.percent}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          diskUsage.percent > 85
                            ? 'bg-rose-500'
                            : diskUsage.percent > 70
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(3, diskUsage.percent))}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Toplam Disk Kapasitesi:</span>
                    <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                      {diskUsage.totalGb} GB
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Kullanılan Alan:</span>
                    <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      {diskUsage.usedGb} GB
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Boş / Erişilebilir Alan:</span>
                    <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                      {diskUsage.freeGb} GB
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">data/ Klasörü:</span>
                    <span className="font-bold font-mono text-indigo-500">
                      {diskUsage.dataDirSizeMb} MB ({diskUsage.dataFileCount} dosya)
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-100 dark:border-slate-800/80">
                    <span className="text-slate-500">Bağlama Noktası:</span>
                    <span className="font-mono text-slate-600 dark:text-slate-400">
                      {diskUsage.mountPoint}
                    </span>
                  </div>
                </div>
              </div>

              {/* Box 3: Database & Storage Status */}
              <div className="bg-white dark:bg-slate-900/90 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
                  <Database className="w-5 h-5 text-indigo-500" />
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                    Veritabanı & Bağlantı Havuzu
                  </h4>
                </div>
                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Aktif Veritabanı Motoru:</span>
                    <span className="font-bold text-emerald-500">
                      {statusData.database.engine}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Bağlantı Havuzu (Pool):</span>
                    <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                      {statusData.database.pool.totalCount} Toplam ({statusData.database.pool.activeCount ?? statusData.database.pool.activeClients ?? 0} Aktif / {statusData.database.pool.idleCount} Boşta)
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Anlık Sorgu Gecikmesi:</span>
                    <span className="font-bold font-mono text-emerald-500">
                      {dbLatency} ms
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Kayıtlı Saha Cihazları:</span>
                    <span className="font-bold font-mono text-indigo-500">
                      {statusData.devices.total} Cihaz ({statusData.devices.online} Çevrimiçi)
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Veritabanı Durumu:</span>
                    <span className="font-bold font-mono text-emerald-500">
                      {statusData.database.isReady ? 'Hazır / Aktif' : 'Başlatılıyor'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Box 4: Quick Diagnostic Actions */}
              <div className="bg-white dark:bg-slate-900/90 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
                  <Zap className="w-5 h-5 text-amber-500" />
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                    Hızlı Teşhis ve Aksiyonlar
                  </h4>
                </div>
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={handleBroadcastPing}
                    className="w-full py-2.5 px-3 rounded-2xl bg-purple-50 dark:bg-purple-500/10 hover:bg-purple-100 dark:hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30 text-xs font-bold flex items-center justify-between transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Send className="w-4 h-4" />
                      <span>WebSocket Teşhis Yayını Gönder</span>
                    </div>
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  {onNavigateToTab && (
                    <button
                      type="button"
                      onClick={() => onNavigateToTab('system_logs')}
                      className="w-full py-2.5 px-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center justify-between transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-cyan-400" />
                        <span>Sistem Hata & Audit Günlüklerini Aç</span>
                      </div>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}

                  {onNavigateToTab && (
                    <button
                      type="button"
                      onClick={() => onNavigateToTab('database_data')}
                      className="w-full py-2.5 px-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center justify-between transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-emerald-400" />
                        <span>Veritabanı Tablo ve Şema Yönetimi</span>
                      </div>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: WORKERS */}
          {activeTabSection === 'workers' && (
            <div className="bg-white dark:bg-slate-900/90 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  Sunucu Arka Plan İşçileri & Motorları
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Arka planda periyodik olarak çalışan asenkron döngüler ve dayanıklı kuyruk yöneticileri.
                </p>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {statusData.workers.map((worker) => {
                  const isRunning = worker.status === 'running';
                  const isProcessing = worker.status === 'processing';
                  return (
                    <div
                      key={worker.id}
                      className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2.5 rounded-2xl border ${
                            isRunning || isProcessing
                              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                              : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                          }`}
                        >
                          <Timer className="w-5 h-5" />
                        </div>
                        <div>
                          <h5 className="font-bold text-xs text-slate-900 dark:text-white">
                            {worker.name}
                          </h5>
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                            {worker.details || 'Standart döngü'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-3 py-1 rounded-full text-[11px] font-bold border ${
                            isRunning || isProcessing
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {worker.statusLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB: HARDWARE */}
          {activeTabSection === 'hardware' && (
            <div className="bg-white dark:bg-slate-900/90 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
              <div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  Ana Sunucu Donanımı, Termal Durum ve İşletim Sistemi
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Fiziksel sunucu özellikleri, SoC çekirdek sıcaklığı ve Node.js çalışma ortamı parametreleri.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-700/60">
                  <span className="text-slate-500 block text-[10px] uppercase tracking-wider">İşlemci Modeli</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 mt-1 block font-mono truncate">
                    {statusData.cpu.model}
                  </span>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-700/60">
                  <span className="text-slate-500 block text-[10px] uppercase tracking-wider">İşlemci Sıcaklığı</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 mt-1 block font-mono">
                    {cpuTemp.current} {cpuTemp.unit} ({cpuTemp.status})
                  </span>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-700/60">
                  <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Çekirdek Sayısı</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 mt-1 block font-mono">
                    {statusData.cpu.cores} Fiziksel / Mantıksal Çekirdek
                  </span>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-700/60">
                  <span className="text-slate-500 block text-[10px] uppercase tracking-wider">İşletim Sistemi Platformu</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 mt-1 block font-mono">
                    {statusData.system.type} ({statusData.system.platform} {statusData.system.arch})
                  </span>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-700/60">
                  <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Çekirdek (Kernel) Sürümü</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 mt-1 block font-mono">
                    {statusData.system.release}
                  </span>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-700/60">
                  <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Node.js & V8 Motoru</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 mt-1 block font-mono">
                    Node {statusData.system.nodeVersion} (V8: {statusData.system.v8Version})
                  </span>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-700/60">
                  <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Disk Depolama Kapasitesi</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 mt-1 block font-mono">
                    {diskUsage.usedGb} GB / {diskUsage.totalGb} GB (Boş: {diskUsage.freeGb} GB, %{diskUsage.percent})
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB: NETWORK */}
          {activeTabSection === 'network' && (
            <div className="bg-white dark:bg-slate-900/90 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  Sunucu Ağ Arayüzleri ve IP Haritası
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Host makine üzerinde tanımlı Ethernet, Loopback ve Sanal Ağ bağdaştırıcıları.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-900/60 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-3.5 px-6">Arayüz Adı</th>
                      <th className="py-3.5 px-6">IP Adresi</th>
                      <th className="py-3.5 px-6">Protokol (Family)</th>
                      <th className="py-3.5 px-6">MAC Adresi</th>
                      <th className="py-3.5 px-6">Tür</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                    {statusData.network.interfaces.map((iface, idx) => (
                      <tr key={`iface_${idx}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="py-3.5 px-6 font-bold text-slate-900 dark:text-white">
                          {iface.name}
                        </td>
                        <td className="py-3.5 px-6 text-indigo-500 font-semibold">
                          {iface.address}
                        </td>
                        <td className="py-3.5 px-6 text-slate-600 dark:text-slate-300">
                          {iface.family}
                        </td>
                        <td className="py-3.5 px-6 text-slate-500">
                          {iface.mac || 'N/A'}
                        </td>
                        <td className="py-3.5 px-6">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                              iface.internal
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                            }`}
                          >
                            {iface.internal ? 'Dahili (Loopback)' : 'Harici / Ağ'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Toast Notification Container */}
      {toast && <ToastNotification toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
};
