import React, { useState, useMemo, useEffect } from 'react';
import type { Device, TimeBucketDataPoint } from '../types';
import { useRealtime } from '../context/RealtimeContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { exportToCSV, exportToJSON, formatDateTime, formatShortTime, getMetricUnit, isInternalOrControlMetric } from '../lib/utils';
import { apiFetch as fetch, safeJson } from '../lib/apiFetch';
import {
  BarChart3,
  Download,
  Filter,
  Calendar,
  Layers,
  FileSpreadsheet,
  FileJson,
  Printer,
  TrendingUp,
  Activity,
  Zap,
  Clock,
  Database,
  RefreshCw,
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
  Legend,
} from 'recharts';

export const AnalyticsView: React.FC = () => {
  const { user } = useAuth();
  const { latestTelemetry, devices } = useRealtime();
  const isAdmin = user?.role === 'admin';
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [selectedDevice, setSelectedDevice] = useState<string>('all');
  const [selectedMetric, setSelectedMetric] = useState<string>('temperature');
  const [timeRange, setTimeRange] = useState<string>('24h');
  const [timescaleData, setTimescaleData] = useState<TimeBucketDataPoint[]>([]);
  const [isLoadingTimescale, setIsLoadingTimescale] = useState(false);
  const [queryLatencyMs, setQueryLatencyMs] = useState<number | null>(null);

  const activeMetrics = useMemo(() => {
    const set = new Set<string>();
    const onlineDevices = devices.filter((d) => d.status === 'online' && d.dataFlowActive !== false);
    const onlineDevMap = new Map<string, Device>();
    onlineDevices.forEach((d) => {
      onlineDevMap.set(d.id, d);
      if (d.apiKey) onlineDevMap.set(d.apiKey, d);
      if (d.name) onlineDevMap.set(d.name, d);
    });

    latestTelemetry.forEach((t) => {
      if (!t.metric || isInternalOrControlMetric(t.metric)) return;
      const dev = onlineDevMap.get(t.deviceId) || onlineDevMap.get(t.deviceName);
      if (!dev) return;

      if (dev.isSimulated && Array.isArray(dev.simulatedMetrics)) {
        const allowedLower = dev.simulatedMetrics.map((m) => m.toLowerCase());
        if (!allowedLower.includes(t.metric.toLowerCase())) return;
      }
      set.add(t.metric);
    });

    onlineDevices.forEach((d) => {
      if (d.isSimulated && Array.isArray(d.simulatedMetrics)) {
        d.simulatedMetrics.forEach((m) => {
          if (m && !isInternalOrControlMetric(m)) set.add(m);
        });
      } else if (d.metrics) {
        Object.keys(d.metrics).forEach((m) => {
          if (m && !isInternalOrControlMetric(m)) set.add(m);
        });
      }
    });

    return Array.from(set);
  }, [latestTelemetry, devices]);

  // Fetch from TimescaleDB when not in live mode
  const fetchTimescaleData = () => {
    if (timeRange === 'live') {
      setTimescaleData([]);
      return;
    }

    setIsLoadingTimescale(true);
    const t0 = performance.now();

    const bucketMap: Record<string, string> = {
      '1h': '1m',
      '6h': '5m',
      '24h': '15m',
      '7d': '1h',
      '30d': '1d',
    };
    const now = new Date();
    const durationMs =
      timeRange === '1h' ? 3600000 :
      timeRange === '6h' ? 6 * 3600000 :
      timeRange === '24h' ? 86400000 :
      timeRange === '7d' ? 7 * 86400000 :
      30 * 86400000;
    const startTime = new Date(now.getTime() - durationMs).toISOString();

    const devParam = selectedDevice !== 'all' ? `&deviceId=${encodeURIComponent(selectedDevice)}` : '';
    const metricParam = selectedMetric !== 'all' ? `&metric=${encodeURIComponent(selectedMetric)}` : '';
    const bucket = bucketMap[timeRange] || '15m';

    fetch(`/api/timescale/time-bucket?bucket=${bucket}&startTime=${encodeURIComponent(startTime)}${devParam}${metricParam}`)
      .then((res) => safeJson(res, []))
      .then((data) => {
        const elapsed = Math.round(performance.now() - t0);
        setQueryLatencyMs(elapsed);
        if (Array.isArray(data)) {
          setTimescaleData(data);
        }
      })
      .catch(() => {})
      .finally(() => {
        setIsLoadingTimescale(false);
      });
  };

  useEffect(() => {
    fetchTimescaleData();
  }, [timeRange, selectedDevice, selectedMetric]);

  // Filter telemetry for live or fallback
  const filtered = latestTelemetry.filter((t) => {
    const devMatch = selectedDevice === 'all' || t.deviceId === selectedDevice;
    const metricMatch = selectedMetric === 'all' || t.metric === selectedMetric;
    return devMatch && metricMatch;
  });

  const unit = getMetricUnit(selectedMetric);

  // Statistics calculation depending on mode
  let minVal = 0;
  let maxVal = 0;
  let avgVal = 0;
  let count = 0;

  if (timeRange !== 'live' && timescaleData.length > 0) {
    const mins = timescaleData.map((d) => d.minValue);
    const maxs = timescaleData.map((d) => d.maxValue);
    const avgs = timescaleData.map((d) => d.avgValue);
    const counts = timescaleData.map((d) => d.readingCount);

    minVal = Math.min(...mins);
    maxVal = Math.max(...maxs);
    count = counts.reduce((a, b) => a + b, 0);
    avgVal = avgs.reduce((a, b) => a + b, 0) / avgs.length;
  } else {
    const values = filtered.map((f) => f.value);
    count = values.length;
    minVal = count ? Math.min(...values) : 0;
    maxVal = count ? Math.max(...values) : 0;
    avgVal = count ? values.reduce((a, b) => a + b, 0) / count : 0;
  }

  // Chart data formatting
  const chartData = timeRange === 'live'
    ? filtered.slice(-50).map((item) => ({
        time: formatShortTime(item.timestamp),
        deger: item.value,
        cihaz: item.deviceName,
      }))
    : timescaleData.map((d) => {
        const dt = new Date(d.timeBucket);
        const timeStr =
          timeRange === '1h' || timeRange === '6h' || timeRange === '24h'
            ? dt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
            : `${dt.getDate()}/${dt.getMonth() + 1} ${dt.getHours()}:00`;
        return {
          time: timeStr,
          deger: d.avgValue,
          min: d.minValue,
          max: d.maxValue,
          count: d.readingCount,
        };
      });

  const handleExportCSV = () => {
    if (timeRange !== 'live' && timescaleData.length > 0) {
      exportToCSV(`timescaledb_${selectedMetric}_${timeRange}`, timescaleData);
    } else {
      exportToCSV(`analytics_export_${selectedMetric}`, filtered);
    }
  };

  const handleExportJSON = () => {
    if (timeRange !== 'live' && timescaleData.length > 0) {
      exportToJSON(`timescaledb_${selectedMetric}_${timeRange}`, timescaleData);
    } else {
      exportToJSON(`analytics_export_${selectedMetric}`, filtered);
    }
  };

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#0f172a] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-400" />
              <span>Gelişmiş Veri Analizi & PostgreSQL/TimescaleDB Arşivi</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
              Hypertable Engine
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            TimescaleDB <code className="font-mono text-indigo-400">time_bucket()</code> optimizasyonuyla milyonlarca geçmiş telemetri kaydını milisaniyeler içinde analiz edin ve dışa aktarın.
          </p>
        </div>

        {/* Action Export Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={fetchTimescaleData}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl text-xs transition-colors border border-slate-200 dark:border-slate-700 flex items-center gap-1"
            title="Yenile"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingTimescale ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-bold shadow-lg flex items-center gap-1.5 transition-all"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>CSV İndir</span>
          </button>
          <button
            onClick={handleExportJSON}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-bold shadow-lg flex items-center gap-1.5 transition-all"
          >
            <FileJson className="w-4 h-4" />
            <span>JSON İndir</span>
          </button>
          <button
            onClick={handlePrintReport}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl text-xs transition-colors border border-slate-200 dark:border-slate-700"
            title="Raporu Yazdır"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Control Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white dark:bg-[#0f172a] p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl text-xs">
        <div>
          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
            Cihaz Seçimi
          </label>
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            className="w-full px-3 py-2 rounded-2xl bg-slate-50 dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
          >
            {isAdmin ? (
              <option value="all">🌐 Tüm Cihazlar (Sistem Geneli - {devices.length})</option>
            ) : (
              devices.length > 1 && <option value="all">📱 Tüm Cihazlarım ({devices.length})</option>
            )}
            {devices.map((d) => {
              const isOnline = d.status === 'online' && d.dataFlowActive !== false;
              return (
                <option key={d.id} value={d.id}>
                  {isOnline ? '🟢' : '🔴'} {d.name} - {isOnline ? 'Açık' : 'Kapalı'}
                </option>
              );
            })}
          </select>
        </div>

        <div>
          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
            Metrik / Parametre
          </label>
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value)}
            className="w-full px-3 py-2 rounded-2xl bg-slate-50 dark:bg-[#020617] border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
          >
            {activeMetrics.length > 0 && (
              <optgroup label="🟢 Açık Cihazlardan Gelen Aktif Metrikler">
                {activeMetrics.map((m) => (
                  <option key={m} value={m}>
                    {m} ({getMetricUnit(m)})
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="🔥 Sık Kullanılan Metrikler">
              <option value="temperature">Sıcaklık (°C)</option>
              <option value="humidity">Nem Oranı (%)</option>
              <option value="cpu">İşlemci / CPU Yükü (%)</option>
              <option value="memory">Bellek / RAM (%)</option>
              <option value="power">Güç Tüketimi (kW)</option>
            </optgroup>
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block font-bold text-slate-700 dark:text-slate-300">
              Zaman Aralığı & Çözünürlük
            </label>
            {queryLatencyMs !== null && timeRange !== 'live' && (
              <span className="text-[10px] text-emerald-400 font-mono">
                ⚡ {queryLatencyMs}ms (SQL time_bucket)
              </span>
            )}
          </div>
          <div className="grid grid-cols-5 gap-1 p-1 bg-slate-100 dark:bg-[#020617] rounded-2xl border border-slate-200 dark:border-slate-800">
            {[
              { id: 'live', label: 'Canlı' },
              { id: '1h', label: '1S' },
              { id: '6h', label: '6S' },
              { id: '24h', label: '24S' },
              { id: '7d', label: '7G' },
              { id: '30d', label: '30G' },
            ].map((r) => (
              <button
                key={r.id}
                onClick={() => setTimeRange(r.id)}
                className={`py-1 rounded-xl font-bold text-[10px] uppercase transition-colors ${
                  timeRange === r.id
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#0f172a] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Minimum Değer
          </p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              {minVal.toFixed(1)}
            </span>
            <span className="text-xs font-bold text-slate-400">{unit}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Maksimum Değer (Zirve)
          </p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-rose-500">
              {maxVal.toFixed(1)}
            </span>
            <span className="text-xs font-bold text-slate-400">{unit}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Ortalama Değer
          </p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-indigo-400">
              {avgVal.toFixed(1)}
            </span>
            <span className="text-xs font-bold text-slate-400">{unit}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {timeRange === 'live' ? 'Canlı Paket Sayısı' : 'TimescaleDB Örnek Kayıt'}
          </p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-emerald-400">
              {count}
            </span>
            <span className="text-xs font-bold text-slate-400">okuma</span>
          </div>
        </div>
      </div>

      {/* Main Analytics Chart */}
      <div className="bg-white dark:bg-[#0f172a] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-400" />
            <span>Zaman Serisi Trend Analizi ({selectedMetric.toUpperCase()})</span>
          </h3>

          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-slate-400">
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              {timeRange === 'live' ? 'WebSocket Canlı Akış' : 'TimescaleDB Hypertable'}
            </span>
          </div>
        </div>

        <div className="h-72 w-full">
          {isLoadingTimescale ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-400">
              TimescaleDB üzerinden zaman dilimleri sorgulanıyor...
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-400">
              Seçilen kriterlere uygun veri bulunamadı.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="analyticsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={isDark ? 0.15 : 0.3} stroke={isDark ? '#cbd5e1' : '#94a3b8'} />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#475569' }} />
                <YAxis tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#475569' }} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#0f172a' : '#ffffff',
                    borderColor: isDark ? '#334155' : '#e2e8f0',
                    borderRadius: '16px',
                    color: isDark ? '#ffffff' : '#0f172a',
                    fontSize: '12px',
                    boxShadow: isDark ? '0 10px 25px -5px rgba(0,0,0,0.5)' : '0 10px 25px -5px rgba(0,0,0,0.1)',
                  }}
                  formatter={(val: number) => [`${val} ${unit}`, 'Ortalama Ölçüm']}
                />
                <Area
                  type="monotone"
                  dataKey="deger"
                  stroke="#6366f1"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#analyticsGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Raw Data Data Table */}
      <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            {timeRange === 'live'
              ? `Detaylı Ham Kayıtlar Tablosu (${filtered.length} Kayıt)`
              : `TimescaleDB Zaman Dilimi (Bucket) Kayıtları (${timescaleData.length} Dilim)`}
          </h3>
        </div>

        <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
          {timeRange === 'live' ? (
            <>
              <div className="bg-slate-50 dark:bg-[#020617] p-3.5 grid grid-cols-5 font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                <span>Zaman</span>
                <span>Cihaz</span>
                <span>Metrik</span>
                <span>Değer</span>
                <span>Durum</span>
              </div>

              {filtered.slice(-50).reverse().map((item, idx) => (
                <div key={`${item.id}_${idx}`} className="p-3.5 grid grid-cols-5 items-center hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <span className="font-mono text-slate-500">{formatDateTime(item.timestamp)}</span>
                  <span className="font-semibold text-slate-900 dark:text-white truncate">{item.deviceName}</span>
                  <span className="text-slate-600 dark:text-slate-300 uppercase">{item.metric}</span>
                  <span className="font-bold text-indigo-400">{item.value} {item.unit}</span>
                  <span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      item.status === 'critical' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}>
                      {item.status}
                    </span>
                  </span>
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="bg-slate-50 dark:bg-[#020617] p-3.5 grid grid-cols-6 font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                <span>Zaman Dilimi</span>
                <span>Metrik</span>
                <span>Ortalama</span>
                <span>Min</span>
                <span>Max</span>
                <span>Okuma Sayısı</span>
              </div>

              {timescaleData.map((item, idx) => (
                <div key={`ts_row_${idx}`} className="p-3.5 grid grid-cols-6 items-center hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <span className="font-mono text-slate-500">{formatDateTime(item.timeBucket)}</span>
                  <span className="text-slate-600 dark:text-slate-300 uppercase font-semibold">{item.metric}</span>
                  <span className="font-bold text-indigo-400">{item.avgValue} {unit}</span>
                  <span className="text-slate-500">{item.minValue} {unit}</span>
                  <span className="text-rose-400 font-semibold">{item.maxValue} {unit}</span>
                  <span className="font-mono text-emerald-400 font-bold">{item.readingCount} adet</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
