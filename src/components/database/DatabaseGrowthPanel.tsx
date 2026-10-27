import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  HardDrive,
  Clock,
  Zap,
  RefreshCw,
  TrendingUp,
  Database,
  Layers,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ArrowUpRight,
  Info,
  Server,
  Activity,
  Cpu,
  FileText,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { apiFetch as fetch } from '../../lib/apiFetch';

interface TableBreakdownItem {
  tableName: string;
  displayName: string;
  rowCount: number;
  tableSizeMB: number;
  indexSizeMB: number;
  totalSizeMB: number;
  percentOfDb: number;
  isHypertable?: boolean;
}

interface TimescaleStats {
  isTimescaleActive: boolean;
  totalChunks: number;
  compressedChunks: number;
  uncompressedSizeMB: number;
  compressedSizeMB: number;
  savedSpaceMB: number;
  compressionRatio: number;
  savingsPercent: number;
}

interface GrowthTrendPoint {
  date: string;
  totalRows: number;
  uncompressedMB: number;
  compressedMB: number;
  dailyGrowthMB: number;
  occupancyPercent: number;
}

interface DatabaseGrowthAnalyticsResponse {
  isPostgres: boolean;
  allocatedStorageMB: number;
  usedStorageMB: number;
  occupancyPercentage: number;
  status: 'normal' | 'warning' | 'critical';
  totalRows: number;
  tablesBreakdown: TableBreakdownItem[];
  timescaleStats: TimescaleStats;
  growthTrends: GrowthTrendPoint[];
  growthVelocityMBPerDay: number;
  estimatedDaysUntilFull: number;
}

export const DatabaseGrowthPanel: React.FC = () => {
  const [data, setData] = useState<DatabaseGrowthAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [trendDaysFilter, setTrendDaysFilter] = useState<7 | 14 | 30>(14);
  const [compressingNow, setCompressingNow] = useState<boolean>(false);
  const [compressMsg, setCompressMsg] = useState<{ success: boolean; text: string } | null>(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/database/growth-analytics');
      if (!res.ok) throw new Error('Büyüme analitiği yüklenemedi.');
      const json: DatabaseGrowthAnalyticsResponse = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Veriler yüklenirken bir ağ hatası oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      fetchAnalytics();
    }, 10000);
    return () => clearInterval(timer);
  }, [autoRefresh]);

  const handleCompressNow = async () => {
    setCompressingNow(true);
    setCompressMsg(null);
    try {
      const res = await fetch('/api/database/timescale/compress-now', {
        method: 'POST',
      });
      const resData = await res.json();
      if (res.ok && resData.success) {
        setCompressMsg({ success: true, text: resData.message || 'Sıkıştırma işlemi başarıyla tamamlandı.' });
        fetchAnalytics();
      } else {
        setCompressMsg({ success: false, text: resData.message || resData.error || 'Sıkıştırma başarısız.' });
      }
    } catch (err: any) {
      setCompressMsg({ success: false, text: err.message || 'Ağ hatası.' });
    } finally {
      setCompressingNow(false);
    }
  };

  const filteredTrends = React.useMemo(() => {
    if (!data?.growthTrends) return [];
    return data.growthTrends.slice(-trendDaysFilter);
  }, [data?.growthTrends, trendDaysFilter]);

  if (loading && !data) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl p-8 border border-slate-200 dark:border-slate-800 text-center space-y-3">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto" />
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          PostgreSQL ve TimescaleDB doluluk metrikleri yükleniyor...
        </p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-rose-50 dark:bg-rose-950/40 p-6 rounded-xl border border-rose-200 dark:border-rose-800 text-center space-y-3">
        <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
        <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">{error}</p>
        <button
          onClick={fetchAnalytics}
          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg transition"
        >
          Tekrar Deneyin
        </button>
      </div>
    );
  }

  const occupancy = data?.occupancyPercentage ?? 0;
  const statusColor =
    occupancy >= 85
      ? 'text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/60 border-rose-300'
      : occupancy >= 70
      ? 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/60 border-amber-300'
      : 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 border-emerald-300';

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-xl p-5 border border-slate-800 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold text-white">
              PostgreSQL & TimescaleDB Doluluk ve Büyüme Trendleri Analitiği
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Canlı Metrikler
            </span>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl">
            Veritabanı disk alanı kullanımı, tablo boyutları dağılımı ve TimescaleDB hypertable LZ4/ZSTD sıkıştırma performansını anlık olarak izleyin.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-300 cursor-pointer bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 transition">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded text-indigo-500 focus:ring-indigo-500"
            />
            <span>Otomatik Yenile (10s)</span>
          </label>

          <button
            onClick={fetchAnalytics}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Yenile</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Occupancy Rate */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Anlık Doluluk Oranı</span>
            <HardDrive className="w-4 h-4 text-indigo-500" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
                %{occupancy}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                ({data?.usedStorageMB} MB / {data?.allocatedStorageMB} MB)
              </span>
            </div>
            {/* Custom Progress Bar */}
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden mt-2">
              <div
                className={`h-full transition-all duration-500 ${
                  occupancy >= 85
                    ? 'bg-rose-500'
                    : occupancy >= 70
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(1, occupancy))}%` }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500 dark:text-slate-400">Kapasite Sınırı: 10 GB</span>
            <span className={`px-1.5 py-0.5 rounded font-bold border text-[10px] ${statusColor}`}>
              {data?.status === 'critical'
                ? 'Kritik Doluluk'
                : data?.status === 'warning'
                ? 'Yüksek Doluluk'
                : 'Normal Seviye'}
            </span>
          </div>
        </div>

        {/* KPI 2: TimescaleDB Compression Savings */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">TimescaleDB Sıkıştırma Kazancı</span>
            <Zap className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">
                {data?.timescaleStats.savedSpaceMB ?? 0} MB
              </span>
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                %{data?.timescaleStats.savingsPercent ?? 0} Tasarruf
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 tabular-nums">
              Sıkıştırma Oranı: <strong>{data?.timescaleStats.compressionRatio ?? 1}x</strong>
            </p>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Ham: {data?.timescaleStats.uncompressedSizeMB} MB</span>
            <span>Sıkıştırılmış: {data?.timescaleStats.compressedSizeMB} MB</span>
          </div>
        </div>

        {/* KPI 3: Accumulation & Growth Velocity */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Günlük Büyüme Hızı</span>
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
                +{data?.growthVelocityMBPerDay ?? 0} MB
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">/ Gün</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
              Disk Dolum Tahmini: <strong className="text-indigo-600 dark:text-indigo-400 tabular-nums">~{data?.estimatedDaysUntilFull ?? 9999} Gün</strong>
            </p>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Ort. Telemetri Birikimi</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Stabil Akış</span>
          </div>
        </div>

        {/* KPI 4: Total Rows & Chunks */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Hypertable & Chunk Durumu</span>
            <Clock className="w-4 h-4 text-indigo-500" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
                {data?.totalRows.toLocaleString() ?? 0}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">Kayıt</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 tabular-nums">
              Toplam Chunk: <strong>{data?.timescaleStats.totalChunks ?? 0}</strong> ({data?.timescaleStats.compressedChunks ?? 0} Sıkıştırılmış)
            </p>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Hypertable: telemetry_readings</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-semibold">7 Günlük Chunks</span>
          </div>
        </div>
      </div>

      {/* Main Visualizations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Growth Trend Chart (2 Columns wide) */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-500" />
                Hypertable Veri Büyüme Trendi (Ham vs Sıkıştırılmış Disk)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Günün tarihine göre ham veri hacmi ile TimescaleDB LZ4 sıkıştırılmış boyutu arasındaki fark.
              </p>
            </div>

            {/* Time Filter Buttons */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg shrink-0">
              {([7, 14, 30] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setTrendDaysFilter(d)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${
                    trendDaysFilter === d
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {d} Gün
                </button>
              ))}
            </div>
          </div>

          {/* Area Chart */}
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredTrends} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorUncompressed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorCompressed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit=" MB" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '0.5rem',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                  formatter={(val: any, name: any) => [
                    `${val} MB`,
                    name === 'uncompressedMB' ? 'Ham Boyut' : 'Sıkıştırılmış Disk Boyutu',
                  ]}
                />
                <Legend
                  formatter={(value) => (
                    <span className="text-xs text-slate-600 dark:text-slate-300">
                      {value === 'uncompressedMB' ? 'Ham (Sıkıştırılmamış) Boyut' : 'Sıkıştırılmış Disk Kullanımı'}
                    </span>
                  )}
                />
                <Area
                  type="monotone"
                  dataKey="uncompressedMB"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorUncompressed)"
                />
                <Area
                  type="monotone"
                  dataKey="compressedMB"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorCompressed)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* TimescaleDB Hypertable & Chunk Management Card */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-500" />
                TimescaleDB Sıkıştırma Yönetimi
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                LZ4 / ZSTD
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              TimescaleDB, zaman serisi telemetri verilerini 7 günlük bölümlere (chunk) ayırır. Otomatik arka plan ilkesi 7 günü aşan eski parçaları kolon bazlı LZ4 algoritması ile sıkıştırır.
            </p>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700/60 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Hypertable Adı:</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">telemetry_readings</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Aktif Parça (Chunk):</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                  {data?.timescaleStats.totalChunks ?? 0} Adet
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Sıkıştırılmış Parça:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {data?.timescaleStats.compressedChunks ?? 0} Adet
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Tasarruf Edilen Disk:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {data?.timescaleStats.savedSpaceMB ?? 0} MB (%{data?.timescaleStats.savingsPercent ?? 0})
                </span>
              </div>
            </div>

            {compressMsg && (
              <div
                className={`p-2.5 rounded-lg border text-xs ${
                  compressMsg.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                }`}
              >
                {compressMsg.text}
              </div>
            )}
          </div>

          <button
            onClick={handleCompressNow}
            disabled={compressingNow}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition shadow-sm cursor-pointer disabled:opacity-50"
          >
            <Zap className={`w-4 h-4 ${compressingNow ? 'animate-bounce' : ''}`} />
            <span>{compressingNow ? 'Sıkıştırma Çalışıyor...' : 'Şimdi Manuel Sıkıştır'}</span>
          </button>
        </div>
      </div>

      {/* PostgreSQL Table Size Breakdown Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-500" />
              PostgreSQL Tablo Bazlı Doluluk ve Disk Dağılımı
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Veritabanındaki tüm tabloların satır sayıları, tablo boyutları, indeks büyüklükleri ve veritabanındaki yüzdesel oranları.
            </p>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Toplam Tablo Sayısı: <strong className="text-slate-800 dark:text-slate-200">{data?.tablesBreakdown.length ?? 0}</strong>
          </div>
        </div>

        {/* Table Data */}
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3">Tablo Adı & Açıklama</th>
                <th className="p-3 text-right">Satır Sayısı</th>
                <th className="p-3 text-right">Tablo Verisi</th>
                <th className="p-3 text-right">İndeks Boyutu</th>
                <th className="p-3 text-right">Toplam Disk</th>
                <th className="p-3 text-right">Pay (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
              {data?.tablesBreakdown.map((item) => (
                <tr key={item.tableName} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                  <td className="p-3 font-medium">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-indigo-600 dark:text-indigo-400">{item.tableName}</span>
                      {item.isHypertable && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          Hypertable
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">{item.displayName}</span>
                  </td>
                  <td className="p-3 text-right font-mono tabular-nums">{item.rowCount.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono tabular-nums">{item.tableSizeMB} MB</td>
                  <td className="p-3 text-right font-mono tabular-nums">{item.indexSizeMB} MB</td>
                  <td className="p-3 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                    {item.totalSizeMB} MB
                  </td>
                  <td className="p-3 text-right font-mono font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">
                    %{item.percentOfDb}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
