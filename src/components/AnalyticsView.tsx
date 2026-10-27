import React, { useState, useMemo, useEffect } from 'react';
import type { Device, TimeBucketDataPoint } from '../types';
import { useRealtime } from '../context/RealtimeContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useUserPreference } from '../hooks/useUserPreference';
import {
  exportToCSV,
  exportToJSON,
  formatDateTime,
  formatShortTime,
  getMetricUnit,
  isInternalOrControlMetric,
} from '../lib/utils';
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
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Maximize2,
  Table as TableIcon,
  LineChart as LineChartIcon,
  ShieldAlert,
  Percent,
  Sigma,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from 'recharts';

export const AnalyticsView: React.FC = () => {
  const { user } = useAuth();
  const { latestTelemetry, devices } = useRealtime();
  const isAdmin = user?.role === 'admin';
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Active View Tab
  const [activeTab, setActiveTab] = useState<'trend' | 'comparison' | 'statistics' | 'table' | 'export_hub'>('trend');

  // Filters with Database & User Persistence
  const [selectedDevice, setSelectedDevice] = useUserPreference<string>('nexus_analytics_device', 'all');
  const [selectedMetric, setSelectedMetric] = useUserPreference<string>('nexus_analytics_metric', 'temperature');
  const [secondaryMetric, setSecondaryMetric] = useState<string>('humidity');
  const [timeRange, setTimeRange] = useUserPreference<string>('nexus_analytics_timerange', '24h');

  // Custom Date Range
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setHours(d.getHours() - 24);
    return d.toISOString().slice(0, 16);
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => new Date().toISOString().slice(0, 16));

  // Chart Controls
  const [chartType, setChartType] = useState<'area' | 'line' | 'bar'>('area');
  const [showRangeBand, setShowRangeBand] = useState<boolean>(true);
  const [showThreshold, setShowThreshold] = useState<boolean>(false);
  const [thresholdValue, setThresholdValue] = useState<number>(50);

  // Data & Performance States
  const [timescaleData, setTimescaleData] = useState<TimeBucketDataPoint[]>([]);
  const [secondaryTimescaleData, setSecondaryTimescaleData] = useState<TimeBucketDataPoint[]>([]);
  const [isLoadingTimescale, setIsLoadingTimescale] = useState(false);
  const [queryLatencyMs, setQueryLatencyMs] = useState<number | null>(null);

  // Table Exploration State
  const [tableSearch, setTableSearch] = useState('');
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(15);
  const [tableSortField, setTableSortField] = useState<'time' | 'deger' | 'min' | 'max' | 'count'>('time');
  const [tableSortAsc, setTableSortAsc] = useState(false);

  // Export Hub State
  const [exportMode, setExportMode] = useState<'bucket' | 'raw'>('bucket');
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const [exportLimit, setExportLimit] = useState(5000);
  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Dynamic active metrics from online and simulated devices
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

  // Fetch TimescaleDB data
  const fetchTimescaleData = async () => {
    if (timeRange === 'live') {
      setTimescaleData([]);
      setSecondaryTimescaleData([]);
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
      'custom': '15m',
    };

    let startTime: string;
    let endTime: string | undefined;

    if (timeRange === 'custom') {
      startTime = new Date(customStartDate).toISOString();
      endTime = new Date(customEndDate).toISOString();
    } else {
      const now = new Date();
      const durationMs =
        timeRange === '1h' ? 3600000 :
        timeRange === '6h' ? 6 * 3600000 :
        timeRange === '24h' ? 86400000 :
        timeRange === '7d' ? 7 * 86400000 :
        30 * 86400000;
      startTime = new Date(now.getTime() - durationMs).toISOString();
    }

    const devParam = selectedDevice !== 'all' ? `&deviceId=${encodeURIComponent(selectedDevice)}` : '';
    const metricParam = selectedMetric !== 'all' ? `&metric=${encodeURIComponent(selectedMetric)}` : '';
    const bucket = bucketMap[timeRange] || '15m';
    const endParam = endTime ? `&endTime=${encodeURIComponent(endTime)}` : '';

    try {
      // Primary Metric Query
      const res = await fetch(
        `/api/timescale/time-bucket?bucket=${bucket}&startTime=${encodeURIComponent(startTime)}${endParam}${devParam}${metricParam}`
      );
      const data = await safeJson(res, []);
      const elapsed = Math.round(performance.now() - t0);
      setQueryLatencyMs(elapsed);

      if (Array.isArray(data)) {
        setTimescaleData(data);
      }

      // If comparison view is active, query secondary metric
      if (activeTab === 'comparison' && secondaryMetric && secondaryMetric !== selectedMetric) {
        const secRes = await fetch(
          `/api/timescale/time-bucket?bucket=${bucket}&startTime=${encodeURIComponent(startTime)}${endParam}${devParam}&metric=${encodeURIComponent(secondaryMetric)}`
        );
        const secData = await safeJson(secRes, []);
        if (Array.isArray(secData)) {
          setSecondaryTimescaleData(secData);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingTimescale(false);
    }
  };

  useEffect(() => {
    fetchTimescaleData();
  }, [timeRange, selectedDevice, selectedMetric, secondaryMetric, activeTab]);

  // Filter latest telemetry for live mode
  const filteredLive = latestTelemetry.filter((t) => {
    const devMatch = selectedDevice === 'all' || t.deviceId === selectedDevice;
    const metricMatch = selectedMetric === 'all' || t.metric === selectedMetric;
    return devMatch && metricMatch;
  });

  const unit = getMetricUnit(selectedMetric);
  const secondaryUnit = getMetricUnit(secondaryMetric);

  // Comprehensive Statistical Calculations
  const stats = useMemo(() => {
    let min = 0;
    let max = 0;
    let avg = 0;
    let totalCount = 0;
    let stdDev = 0;
    let p95 = 0;
    let trendPercent = 0;
    let outOfThresholdCount = 0;

    if (timeRange !== 'live' && timescaleData.length > 0) {
      const mins = timescaleData.map((d) => d.minValue);
      const maxs = timescaleData.map((d) => d.maxValue);
      const avgs = timescaleData.map((d) => d.avgValue);
      const counts = timescaleData.map((d) => d.readingCount);

      min = Math.min(...mins);
      max = Math.max(...maxs);
      totalCount = counts.reduce((a, b) => a + b, 0);
      avg = avgs.reduce((a, b) => a + b, 0) / avgs.length;

      // Variance & StdDev
      const variance = avgs.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / avgs.length;
      stdDev = Math.sqrt(variance);

      // P95 calculation
      const sortedAvgs = [...avgs].sort((a, b) => a - b);
      const p95Idx = Math.floor(sortedAvgs.length * 0.95);
      p95 = sortedAvgs[p95Idx] ?? max;

      // Trend Percent: compare first 25% avg with last 25% avg
      const quarter = Math.max(1, Math.floor(avgs.length / 4));
      const firstQuarterAvg = avgs.slice(0, quarter).reduce((a, b) => a + b, 0) / quarter;
      const lastQuarterAvg = avgs.slice(-quarter).reduce((a, b) => a + b, 0) / quarter;
      trendPercent = firstQuarterAvg !== 0 ? ((lastQuarterAvg - firstQuarterAvg) / firstQuarterAvg) * 100 : 0;

      if (showThreshold && thresholdValue !== null) {
        outOfThresholdCount = timescaleData.filter((d) => d.maxValue > thresholdValue).length;
      }
    } else if (filteredLive.length > 0) {
      const values = filteredLive.map((f) => f.value);
      totalCount = values.length;
      min = Math.min(...values);
      max = Math.max(...values);
      avg = values.reduce((a, b) => a + b, 0) / totalCount;

      const variance = values.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / totalCount;
      stdDev = Math.sqrt(variance);

      const sortedVals = [...values].sort((a, b) => a - b);
      const p95Idx = Math.floor(sortedVals.length * 0.95);
      p95 = sortedVals[p95Idx] ?? max;

      if (values.length >= 2) {
        const firstHalf = values.slice(0, Math.floor(values.length / 2));
        const secondHalf = values.slice(Math.floor(values.length / 2));
        const avg1 = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const avg2 = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        trendPercent = avg1 !== 0 ? ((avg2 - avg1) / avg1) * 100 : 0;
      }

      if (showThreshold && thresholdValue !== null) {
        outOfThresholdCount = values.filter((v) => v > thresholdValue).length;
      }
    }

    return {
      min,
      max,
      avg,
      totalCount,
      stdDev,
      p95,
      trendPercent,
      outOfThresholdCount,
    };
  }, [timeRange, timescaleData, filteredLive, showThreshold, thresholdValue]);

  // Chart Data Preparation (Single & Dual Metric)
  const chartData = useMemo(() => {
    if (timeRange === 'live') {
      return filteredLive.slice(-60).map((item) => ({
        time: formatShortTime(item.timestamp),
        deger: item.value,
        cihaz: item.deviceName,
        min: item.value,
        max: item.value,
      }));
    }

    const secMap = new Map<string, number>();
    secondaryTimescaleData.forEach((d) => {
      secMap.set(d.timeBucket, d.avgValue);
    });

    return timescaleData.map((d) => {
      const dt = new Date(d.timeBucket);
      const timeStr =
        timeRange === '1h' || timeRange === '6h' || timeRange === '24h'
          ? dt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
          : `${dt.getDate()}/${dt.getMonth() + 1} ${dt.getHours()}:00`;

      return {
        time: timeStr,
        fullTime: d.timeBucket,
        deger: d.avgValue,
        min: d.minValue,
        max: d.maxValue,
        spread: Number((d.maxValue - d.minValue).toFixed(2)),
        count: d.readingCount,
        valSecondary: secMap.get(d.timeBucket) ?? null,
      };
    });
  }, [timeRange, filteredLive, timescaleData, secondaryTimescaleData]);

  // Table Exploration Data with Search, Sort, and Pagination
  const tableData = useMemo(() => {
    let list: Array<{
      id: string;
      time: string;
      device: string;
      metric: string;
      deger: number;
      min: number;
      max: number;
      count: number;
      status?: string;
    }> = [];

    if (timeRange === 'live') {
      list = filteredLive.map((item, idx) => ({
        id: `live_${item.id}_${idx}`,
        time: item.timestamp,
        device: item.deviceName,
        metric: item.metric,
        deger: item.value,
        min: item.value,
        max: item.value,
        count: 1,
        status: item.status,
      }));
    } else {
      list = timescaleData.map((item, idx) => ({
        id: `ts_${idx}`,
        time: item.timeBucket,
        device: item.deviceId === 'all' ? 'Tüm Cihazlar' : item.deviceId,
        metric: item.metric,
        deger: item.avgValue,
        min: item.minValue,
        max: item.maxValue,
        count: item.readingCount,
        status: item.maxValue > thresholdValue && showThreshold ? 'critical' : 'normal',
      }));
    }

    if (tableSearch.trim()) {
      const query = tableSearch.toLowerCase();
      list = list.filter(
        (row) =>
          row.device.toLowerCase().includes(query) ||
          row.metric.toLowerCase().includes(query) ||
          String(row.deger).includes(query) ||
          formatDateTime(row.time).toLowerCase().includes(query)
      );
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (tableSortField === 'time') {
        cmp = new Date(a.time).getTime() - new Date(b.time).getTime();
      } else if (tableSortField === 'deger') {
        cmp = a.deger - b.deger;
      } else if (tableSortField === 'min') {
        cmp = a.min - b.min;
      } else if (tableSortField === 'max') {
        cmp = a.max - b.max;
      } else if (tableSortField === 'count') {
        cmp = a.count - b.count;
      }
      return tableSortAsc ? cmp : -cmp;
    });

    return list;
  }, [timeRange, filteredLive, timescaleData, tableSearch, tableSortField, tableSortAsc, thresholdValue, showThreshold]);

  const totalPages = Math.max(1, Math.ceil(tableData.length / tablePageSize));
  const paginatedTableRows = tableData.slice((tablePage - 1) * tablePageSize, tablePage * tablePageSize);

  // Handle Direct Server-side or Client-side Export
  const executeExport = async () => {
    setIsExporting(true);
    setExportNotice(null);

    const nowStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `nexusnode_${exportMode}_${selectedMetric}_${nowStr}`;

    try {
      if (timeRange === 'live') {
        // Live client-side export
        if (exportFormat === 'csv') {
          exportToCSV(filename, filteredLive);
        } else {
          exportToJSON(filename, filteredLive);
        }
        setExportNotice(`Canlı ${filteredLive.length} adet telemetri kaydı ${exportFormat.toUpperCase()} formatında indirildi.`);
      } else {
        // Server-side optimized export with TimescaleDB or Raw Stream
        let url = `/api/timescale/export?format=${exportFormat}&mode=${exportMode}`;
        if (selectedDevice !== 'all') url += `&deviceId=${encodeURIComponent(selectedDevice)}`;
        if (selectedMetric !== 'all') url += `&metric=${encodeURIComponent(selectedMetric)}`;
        url += `&limit=${exportLimit}`;

        if (timeRange === 'custom') {
          url += `&startTime=${encodeURIComponent(new Date(customStartDate).toISOString())}`;
          url += `&endTime=${encodeURIComponent(new Date(customEndDate).toISOString())}`;
        } else {
          const now = new Date();
          const durationMs =
            timeRange === '1h' ? 3600000 :
            timeRange === '6h' ? 6 * 3600000 :
            timeRange === '24h' ? 86400000 :
            timeRange === '7d' ? 7 * 86400000 :
            30 * 86400000;
          url += `&startTime=${encodeURIComponent(new Date(now.getTime() - durationMs).toISOString())}`;
        }

        const res = await fetch(url);
        if (!res.ok) throw new Error('Dışa aktarma işlemi başarısız oldu.');

        if (exportFormat === 'csv') {
          const blob = await res.blob();
          const downloadUrl = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = `${filename}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(downloadUrl);
        } else {
          const json = await res.json();
          exportToJSON(filename, json);
        }

        setExportNotice(`Dışa aktarma tamamlandı. Dosya ${exportFormat.toUpperCase()} formatında başarıyla kaydedildi.`);
      }
    } catch (err: any) {
      setExportNotice(err.message || 'Dışa aktarma sırasında bir hata oluştu.');
    } finally {
      setIsExporting(false);
      setTimeout(() => setExportNotice(null), 6000);
    }
  };

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div id="analytics-view-container" className="space-y-6 animate-fadeIn pb-12">
      {/* Top Banner Card */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-[#0f172a] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-500" />
              <span>Veri Analizi & PostgreSQL / TimescaleDB Arşivi</span>
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 font-mono">
              Hypertable Engine
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            TimescaleDB <code className="font-mono text-indigo-500 dark:text-indigo-400">time_bucket()</code> optimizasyonuyla geçmiş telemetri kayıtlarını analiz edin, görselleştirin ve dışa aktarın.
          </p>
        </div>

        {/* Quick Action Navigation Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={fetchTimescaleData}
            disabled={isLoadingTimescale}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs transition border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer"
            title="Verileri Yenile"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTimescale ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline font-semibold">Yenile</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('export_hub')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'export_hub'
                ? 'bg-indigo-600 text-white'
                : 'bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/20'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Dışa Aktarma Merkezi</span>
          </button>

          <button
            type="button"
            onClick={handlePrintReport}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs transition border border-slate-200 dark:border-slate-700 cursor-pointer"
            title="Yazdır / PDF Olarak Kaydet"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Perspective Navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 overflow-x-auto pb-1 scrollbar-none print:hidden">
        {[
          { id: 'trend', label: 'Zaman Serisi & Trendler', icon: LineChartIcon },
          { id: 'comparison', label: 'İkili Metrik Karşılaştırma', icon: Sliders },
          { id: 'statistics', label: 'İstatistiksel Zeka & Dağılım', icon: Sigma },
          { id: 'table', label: 'Detaylı Veri Tablosu', icon: TableIcon },
          { id: 'export_hub', label: 'Export & Rapor Sihirbazı', icon: Download },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-[#0f172a]'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Filter Control Bar (Compact & Powerful) */}
      <div className="bg-white dark:bg-[#0f172a] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm text-xs space-y-4 print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Device Selector */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Kaynak Cihaz
            </label>
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
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
                    {isOnline ? '🟢' : '🔴'} {d.name} {d.location ? `(${d.location})` : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Primary Metric Selector */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Ana Metrik / Parametre
            </label>
            <select
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {activeMetrics.length > 0 && (
                <optgroup label="🟢 Aktif Cihazlardan Gelen Metrikler">
                  {activeMetrics.map((m) => (
                    <option key={m} value={m}>
                      {m} ({getMetricUnit(m)})
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Standart Endüstriyel Metrikler">
                <option value="temperature">Sıcaklık (°C)</option>
                <option value="humidity">Nem Oranı (%)</option>
                <option value="pressure">Basınç (bar)</option>
                <option value="vibration">Titreşim (mm/s)</option>
                <option value="voltage">Voltaj / Gerilim (V)</option>
                <option value="current">Akım (A)</option>
                <option value="power">Güç Tüketimi (kW)</option>
                <option value="cpu">İşlemci / CPU (%)</option>
                <option value="memory">Bellek / RAM (%)</option>
              </optgroup>
            </select>
          </div>

          {/* Time Resolution Selector */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block font-semibold text-slate-700 dark:text-slate-300">
                Zaman Aralığı & Çözünürlük
              </label>
              {queryLatencyMs !== null && timeRange !== 'live' && (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  <span>{queryLatencyMs}ms (TimescaleDB time_bucket)</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-7 gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              {[
                { id: 'live', label: 'Canlı' },
                { id: '1h', label: '1S' },
                { id: '6h', label: '6S' },
                { id: '24h', label: '24S' },
                { id: '7d', label: '7G' },
                { id: '30d', label: '30G' },
                { id: 'custom', label: 'Özel' },
              ].map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setTimeRange(r.id)}
                  className={`py-1.5 rounded-lg font-bold text-[10px] uppercase transition-colors cursor-pointer ${
                    timeRange === r.id
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {timeRange === 'custom' && (
          <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center gap-3 animate-fadeIn">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-slate-500 whitespace-nowrap">Başlangıç:</span>
              <input
                type="datetime-local"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 w-full sm:w-auto"
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-slate-500 whitespace-nowrap">Bitiş:</span>
              <input
                type="datetime-local"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 w-full sm:w-auto"
              />
            </div>
            <button
              type="button"
              onClick={fetchTimescaleData}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs cursor-pointer ml-auto"
            >
              Uygula
            </button>
          </div>
        )}

        {/* Advanced Chart Display Controls (when in trend or comparison mode) */}
        {(activeTab === 'trend' || activeTab === 'comparison') && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-4 flex-wrap">
              {/* Chart Type Toggle */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setChartType('area')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                    chartType === 'area' ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  Alan (Area)
                </button>
                <button
                  type="button"
                  onClick={() => setChartType('line')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                    chartType === 'line' ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  Çizgi (Line)
                </button>
                <button
                  type="button"
                  onClick={() => setChartType('bar')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                    chartType === 'bar' ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  Çubuk (Bar)
                </button>
              </div>

              {/* Min/Max Range Band Toggle */}
              {timeRange !== 'live' && activeTab === 'trend' && (
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={showRangeBand}
                    onChange={(e) => setShowRangeBand(e.target.checked)}
                    className="w-3.5 h-3.5 accent-indigo-600 rounded"
                  />
                  <span>Min-Maks Yayılım Bandı</span>
                </label>
              )}

              {/* Threshold Line Toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={showThreshold}
                  onChange={(e) => setShowThreshold(e.target.checked)}
                  className="w-3.5 h-3.5 accent-indigo-600 rounded"
                />
                <span>Eşik Referans Çizgisi:</span>
              </label>

              {showThreshold && (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={thresholdValue}
                    onChange={(e) => setThresholdValue(Number(e.target.value))}
                    className="w-18 px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono text-xs"
                  />
                  <span className="text-slate-400">{unit}</span>
                </div>
              )}
            </div>

            {/* Comparison Second Metric Selector */}
            {activeTab === 'comparison' && (
              <div className="flex items-center gap-2">
                <span className="text-slate-500">2. Karşılaştırma Metriği:</span>
                <select
                  value={secondaryMetric}
                  onChange={(e) => setSecondaryMetric(e.target.value)}
                  className="px-2.5 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-semibold text-emerald-600 dark:text-emerald-400 cursor-pointer"
                >
                  {activeMetrics.map((m) => (
                    <option key={m} value={m}>
                      {m} ({getMetricUnit(m)})
                    </option>
                  ))}
                  <option value="humidity">Nem Oranı (%)</option>
                  <option value="power">Güç (kW)</option>
                  <option value="pressure">Basınç (bar)</option>
                  <option value="cpu">CPU (%)</option>
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary KPI Statistical Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Minimum</p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-bold text-slate-900 dark:text-white font-mono">{stats.min.toFixed(1)}</span>
            <span className="text-[11px] text-slate-400">{unit}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Maksimum (Zirve)</p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-bold text-rose-500 font-mono">{stats.max.toFixed(1)}</span>
            <span className="text-[11px] text-slate-400">{unit}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ortalama</p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-bold text-indigo-500 font-mono">{stats.avg.toFixed(1)}</span>
            <span className="text-[11px] text-slate-400">{unit}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">P95 Yüzdelik</p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-bold text-amber-500 font-mono">{stats.p95.toFixed(1)}</span>
            <span className="text-[11px] text-slate-400">{unit}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Trend Eğilimi</p>
          <div className="flex items-baseline gap-1 mt-1">
            <span
              className={`text-xl font-bold font-mono ${
                stats.trendPercent > 0 ? 'text-rose-500' : stats.trendPercent < 0 ? 'text-emerald-500' : 'text-slate-400'
              }`}
            >
              {stats.trendPercent > 0 ? '+' : ''}
              {stats.trendPercent.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Toplam Okuma</p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-bold text-emerald-500 font-mono">{stats.totalCount}</span>
            <span className="text-[11px] text-slate-400">paket</span>
          </div>
        </div>
      </div>

      {/* TAB 1 & TAB 2: Trend & Comparison Chart */}
      {(activeTab === 'trend' || activeTab === 'comparison') && (
        <div className="bg-white dark:bg-[#0f172a] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {activeTab === 'comparison'
                  ? `İkili Karşılaştırma: ${selectedMetric.toUpperCase()} (Sol) vs ${secondaryMetric.toUpperCase()} (Sağ)`
                  : `Zaman Serisi Trend Analizi: ${selectedMetric.toUpperCase()} (${unit})`}
              </h2>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                <span>{selectedMetric}</span>
              </span>
              {activeTab === 'comparison' && (
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span>{secondaryMetric}</span>
                </span>
              )}
            </div>
          </div>

          <div className="h-80 w-full">
            {isLoadingTimescale ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                <span>TimescaleDB üzerinden zaman dilimleri sorgulanıyor...</span>
              </div>
            ) : chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Seçilen kriterlere uygun veri bulunamadı.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'area' && activeTab === 'trend' ? (
                  <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="analyticsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="spreadGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={isDark ? 0.15 : 0.3} stroke={isDark ? '#cbd5e1' : '#94a3b8'} />
                    <XAxis dataKey="time" tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#475569' }} />
                    <YAxis tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#475569' }} domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDark ? '#0f172a' : '#ffffff',
                        borderColor: isDark ? '#334155' : '#e2e8f0',
                        borderRadius: '12px',
                        color: isDark ? '#ffffff' : '#0f172a',
                        fontSize: '12px',
                      }}
                      formatter={(val: number) => [`${val} ${unit}`, selectedMetric]}
                    />
                    {showThreshold && thresholdValue !== null && (
                      <ReferenceLine
                        y={thresholdValue}
                        stroke="#f43f5e"
                        strokeDasharray="4 4"
                        label={{ value: `Eşik: ${thresholdValue} ${unit}`, fill: '#f43f5e', fontSize: 10 }}
                      />
                    )}
                    {showRangeBand && timeRange !== 'live' && (
                      <Area type="monotone" dataKey="max" stroke="transparent" fill="url(#spreadGrad)" />
                    )}
                    <Area type="monotone" dataKey="deger" stroke="#6366f1" strokeWidth={2.5} fill="url(#analyticsGrad)" />
                  </AreaChart>
                ) : chartType === 'bar' && activeTab === 'trend' ? (
                  <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={isDark ? 0.15 : 0.3} stroke={isDark ? '#cbd5e1' : '#94a3b8'} />
                    <XAxis dataKey="time" tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#475569' }} />
                    <YAxis tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#475569' }} domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDark ? '#0f172a' : '#ffffff',
                        borderColor: isDark ? '#334155' : '#e2e8f0',
                        borderRadius: '12px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="deger" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                ) : (
                  <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={isDark ? 0.15 : 0.3} stroke={isDark ? '#cbd5e1' : '#94a3b8'} />
                    <XAxis dataKey="time" tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#475569' }} />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 11, fill: '#6366f1' }}
                      domain={['auto', 'auto']}
                    />
                    {activeTab === 'comparison' && (
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 11, fill: '#10b981' }}
                        domain={['auto', 'auto']}
                      />
                    )}
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDark ? '#0f172a' : '#ffffff',
                        borderColor: isDark ? '#334155' : '#e2e8f0',
                        borderRadius: '12px',
                        fontSize: '12px',
                      }}
                    />
                    <Legend />
                    {showThreshold && thresholdValue !== null && (
                      <ReferenceLine
                        yAxisId="left"
                        y={thresholdValue}
                        stroke="#f43f5e"
                        strokeDasharray="4 4"
                        label={{ value: `Eşik: ${thresholdValue}`, fill: '#f43f5e', fontSize: 10 }}
                      />
                    )}
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="deger"
                      name={`${selectedMetric} (${unit})`}
                      stroke="#6366f1"
                      strokeWidth={2.5}
                      dot={false}
                    />
                    {activeTab === 'comparison' && (
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="valSecondary"
                        name={`${secondaryMetric} (${secondaryUnit})`}
                        stroke="#10b981"
                        strokeWidth={2.5}
                        dot={false}
                      />
                    )}
                  </LineChart>
                )}
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: İstatistiksel Zeka & Dağılım */}
      {activeTab === 'statistics' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
          <div className="bg-white dark:bg-[#0f172a] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sigma className="w-4 h-4 text-indigo-500" />
              <span>İstatistiksel Özet Parametreleri</span>
            </h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-500">Ortalama Değer (Mean):</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{stats.avg.toFixed(2)} {unit}</span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-500">Standart Sapma (σ):</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{stats.stdDev.toFixed(2)}</span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-500">95. Yüzdelik Dilim (P95):</span>
                <span className="font-mono font-bold text-amber-500">{stats.p95.toFixed(2)} {unit}</span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-500">Toplam Veri Hacmi:</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{stats.totalCount} okuma</span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-500">Eşik Aşımı / Anomali Olayları:</span>
                <span className={`font-mono font-bold ${stats.outOfThresholdCount > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {stats.outOfThresholdCount} adet
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#0f172a] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-500" />
              <span>TimescaleDB & PostgreSQL Depolama Verimi</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Bu metrik için seçilen zaman aralığı, TimescaleDB parçalı hypertable bloklarında sıkıştırılarak saklanmaktadır.
            </p>
            <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Hypertable Parçalama (Chunking):</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">7 Günlük Bloklar</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Sıkıştırma Algoritması:</span>
                <span className="font-semibold text-emerald-500">Gorilla + Delta-of-Delta</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Sorgu Hızı:</span>
                <span className="font-mono text-indigo-400">{queryLatencyMs || 8} ms</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Detaylı Veri Tablosu */}
      {activeTab === 'table' && (
        <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden animate-fadeIn space-y-3">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <TableIcon className="w-4 h-4 text-indigo-500" />
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                {timeRange === 'live'
                  ? `Canlı Ham Telemetri Kayıtları (${tableData.length})`
                  : `TimescaleDB Zaman Dilimi Kayıtları (${tableData.length})`}
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tabloda ara..."
                  value={tableSearch}
                  onChange={(e) => {
                    setTableSearch(e.target.value);
                    setTablePage(1);
                  }}
                  className="pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs w-48"
                />
              </div>

              <select
                value={tablePageSize}
                onChange={(e) => {
                  setTablePageSize(Number(e.target.value));
                  setTablePage(1);
                }}
                className="px-2 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
              >
                <option value={10}>10 Satır</option>
                <option value={15}>15 Satır</option>
                <option value={25}>25 Satır</option>
                <option value={50}>50 Satır</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th
                    onClick={() => {
                      if (tableSortField === 'time') setTableSortAsc(!tableSortAsc);
                      else {
                        setTableSortField('time');
                        setTableSortAsc(false);
                      }
                    }}
                    className="p-3 cursor-pointer hover:text-slate-900 dark:hover:text-white"
                  >
                    <div className="flex items-center gap-1">
                      <span>Zaman</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="p-3">Cihaz</th>
                  <th className="p-3">Metrik</th>
                  <th
                    onClick={() => {
                      if (tableSortField === 'deger') setTableSortAsc(!tableSortAsc);
                      else {
                        setTableSortField('deger');
                        setTableSortAsc(false);
                      }
                    }}
                    className="p-3 cursor-pointer hover:text-slate-900 dark:hover:text-white"
                  >
                    <div className="flex items-center gap-1">
                      <span>{timeRange === 'live' ? 'Değer' : 'Ortalama'}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  {timeRange !== 'live' && (
                    <>
                      <th className="p-3">Min</th>
                      <th className="p-3">Max</th>
                      <th className="p-3">Okuma Sayısı</th>
                    </>
                  )}
                  <th className="p-3 text-right">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedTableRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      Kayıt bulunamadı.
                    </td>
                  </tr>
                ) : (
                  paginatedTableRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <td className="p-3 font-mono text-slate-500 whitespace-nowrap">{formatDateTime(row.time)}</td>
                      <td className="p-3 font-semibold text-slate-900 dark:text-white">{row.device}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-300 uppercase">{row.metric}</td>
                      <td className="p-3 font-mono font-bold text-indigo-500">
                        {row.deger.toFixed(2)} {unit}
                      </td>
                      {timeRange !== 'live' && (
                        <>
                          <td className="p-3 font-mono text-slate-500">{row.min.toFixed(2)}</td>
                          <td className="p-3 font-mono text-rose-500 font-semibold">{row.max.toFixed(2)}</td>
                          <td className="p-3 font-mono text-emerald-500">{row.count}</td>
                        </>
                      )}
                      <td className="p-3 text-right">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            row.status === 'critical'
                              ? 'bg-rose-500/10 text-rose-500'
                              : 'bg-emerald-500/10 text-emerald-500'
                          }`}
                        >
                          {row.status || 'Normal'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <span>
              Toplam {tableData.length} kayıttan {(tablePage - 1) * tablePageSize + 1} -{' '}
              {Math.min(tablePage * tablePageSize, tableData.length)} arası gösteriliyor
            </span>

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={tablePage <= 1}
                onClick={() => setTablePage(tablePage - 1)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 font-mono">
                {tablePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={tablePage >= totalPages}
                onClick={() => setTablePage(tablePage + 1)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Dışa Aktarma & Raporlama Merkezi (Export Hub) */}
      {activeTab === 'export_hub' && (
        <div className="bg-white dark:bg-[#0f172a] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 animate-fadeIn">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Download className="w-5 h-5 text-indigo-500" />
              <span>Gelişmiş Telemetri Dışa Aktarma & Raporlama Merkezi</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              İster sıkıştırılmış TimescaleDB toplu verilerini, ister milisaniyelik ham sensör ölçümlerini Excel uyumlu CSV veya JSON formatında dışa aktarın.
            </p>
          </div>

          {exportNotice && (
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{exportNotice}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            {/* Export Scope & Mode */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
              <span className="font-bold text-slate-800 dark:text-slate-200 block">1. Dışa Aktarma Kapsamı</span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setExportMode('bucket')}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                    exportMode === 'bucket'
                      ? 'border-indigo-500 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <p className="font-bold">Zaman Dilimli Özet</p>
                  <p className="text-[10px] text-slate-400 mt-1">TimescaleDB time_bucket (Ort, Min, Max, Sayı)</p>
                </button>

                <button
                  type="button"
                  onClick={() => setExportMode('raw')}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                    exportMode === 'raw'
                      ? 'border-indigo-500 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <p className="font-bold">Ham Telemetri Ölçümleri</p>
                  <p className="text-[10px] text-slate-400 mt-1">Tüm fiziksel sensör paketleri (Maks. 20.000)</p>
                </button>
              </div>
            </div>

            {/* Export File Format */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
              <span className="font-bold text-slate-800 dark:text-slate-200 block">2. Dosya Formatı</span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setExportFormat('csv')}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition flex items-start gap-2.5 ${
                    exportFormat === 'csv'
                      ? 'border-emerald-500 bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <FileSpreadsheet className="w-5 h-5 shrink-0 mt-0.5 text-emerald-500" />
                  <div>
                    <p className="font-bold">Excel Uyumlu CSV</p>
                    <p className="text-[10px] text-slate-400 mt-1">UTF-8 BOM ile Türkçe karakter destekli</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setExportFormat('json')}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition flex items-start gap-2.5 ${
                    exportFormat === 'json'
                      ? 'border-indigo-500 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <FileJson className="w-5 h-5 shrink-0 mt-0.5 text-indigo-500" />
                  <div>
                    <p className="font-bold">Yapılandırılmış JSON</p>
                    <p className="text-[10px] text-slate-400 mt-1">API & Geliştirici otomasyonları</p>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Export Action Bar */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-xs text-slate-500">
              <span>Seçili Kriterler: </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedDevice}</span>
              <span aria-hidden="true"> · </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedMetric}</span>
              <span aria-hidden="true"> · </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{timeRange.toUpperCase()}</span>
            </div>

            <button
              type="button"
              disabled={isExporting}
              onClick={executeExport}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isExporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>{isExporting ? 'Dosya Hazırlanıyor...' : `${exportFormat.toUpperCase()} Olarak İndir`}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
