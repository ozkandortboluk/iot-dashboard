import React, { useState, useEffect } from 'react';
import type { WidgetConfig, TelemetryReading } from '../../types';
import { useRealtime } from '../../context/RealtimeContext';
import { Table, Sliders, Search, Download, ArrowUpDown, Database, Zap, RefreshCw } from 'lucide-react';
import { DeviceStatusDot } from './DeviceStatusDot';
import { formatShortTime, formatDateTime } from '../../lib/utils';
import { apiFetch as fetch, safeJson } from '../../lib/apiFetch';

interface DataTableWidgetProps {
  config: WidgetConfig;
  onEdit?: () => void;
}

export const DataTableWidget: React.FC<DataTableWidgetProps> = ({ config, onEdit }) => {
  const { latestTelemetry } = useRealtime();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMetric, setSelectedMetric] = useState<string>('all');
  const [dataSource, setDataSource] = useState<'live' | 'timescale'>('live');
  const [historyRows, setHistoryRows] = useState<TelemetryReading[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const fetchHistoryFromDb = () => {
    setIsLoadingHistory(true);
    const devParam = config.deviceId ? `&deviceId=${encodeURIComponent(config.deviceId)}` : '';
    const metricParam = selectedMetric !== 'all' ? `&metric=${encodeURIComponent(selectedMetric)}` : '';

    fetch(`/api/telemetry/history?limit=100${devParam}${metricParam}`)
      .then((res) => safeJson(res, []))
      .then((data) => {
        if (Array.isArray(data)) {
          setHistoryRows(data);
        }
      })
      .catch(() => {})
      .finally(() => {
        setIsLoadingHistory(false);
      });
  };

  useEffect(() => {
    if (dataSource === 'timescale') {
      fetchHistoryFromDb();
    }
  }, [dataSource, config.deviceId, selectedMetric]);

  const sourceData = dataSource === 'live' ? latestTelemetry : historyRows;

  const filtered = sourceData.filter((item) => {
    const matchesDevice = !config.deviceId || item.deviceId === config.deviceId;
    const matchesSearch =
      item.deviceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.metric.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesMetric = selectedMetric === 'all' || item.metric === selectedMetric;
    return matchesDevice && matchesSearch && matchesMetric;
  });

  const exportCSV = () => {
    const headers = 'Tarih/Saat,Cihaz,Metrik,Deger,Birim,Durum\n';
    const rows = filtered
      .map((t) => `${t.timestamp},${t.deviceName},${t.metric},${t.value},${t.unit},${t.status}`)
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `telemetry_export_${dataSource}_${Date.now()}.csv`;
    a.click();
  };

  return (
    <div className="h-full bg-white dark:bg-[#0f172a] rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col justify-between transition-all">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl text-white font-bold" style={{ backgroundColor: config.colorScheme || '#10b981' }}>
            <Table className="w-4 h-4" />
          </div>
          <DeviceStatusDot deviceId={config.deviceId} />
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {config.title || 'Telemetri Veri Tablosu'}
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              {dataSource === 'live' ? 'Anlık işlenen ham paketler (WebSocket)' : 'PostgreSQL / TimescaleDB Arşivi'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Source Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl text-[9px] border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setDataSource('live')}
              className={`px-2 py-0.5 rounded-lg font-bold transition-colors ${
                dataSource === 'live'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              ⚡ Canlı
            </button>
            <button
              onClick={() => setDataSource('timescale')}
              className={`px-2 py-0.5 rounded-lg font-bold transition-colors ${
                dataSource === 'timescale'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              🐘 Arşiv
            </button>
          </div>

          {dataSource === 'timescale' && (
            <button
              onClick={fetchHistoryFromDb}
              className="p-1 text-slate-400 hover:text-indigo-400 rounded-lg transition"
              title="Yenile"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
            </button>
          )}

          <button
            onClick={exportCSV}
            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-bold transition flex items-center gap-1 shadow"
            title="CSV İndir"
          >
            <Download className="w-3 h-3" />
            <span>CSV</span>
          </button>
          {onEdit && (
            <button
              onClick={onEdit}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
              title="Widget Özelleştir"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter controls */}
      <div className="flex items-center gap-2 mb-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cihaz veya metrik ara..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] text-slate-800 dark:text-slate-200 focus:outline-none"
          />
        </div>
        <select
          value={selectedMetric}
          onChange={(e) => setSelectedMetric(e.target.value)}
          className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] text-slate-700 dark:text-slate-300 focus:outline-none"
        >
          <option value="all">Tüm Metrikler</option>
          <option value="temperature">Sıcaklık</option>
          <option value="cpu">CPU</option>
          <option value="humidity">Nem</option>
          <option value="power">Güç</option>
        </select>
      </div>

      {/* Table view */}
      <div className="flex-1 overflow-y-auto max-h-48 border border-slate-100 dark:border-slate-800 rounded-2xl">
        {isLoadingHistory ? (
          <div className="p-8 text-center text-xs text-slate-400">
            TimescaleDB üzerinden geçmiş telemetri okunuyor...
          </div>
        ) : (
          <table className="w-full text-[11px] text-left">
            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900 text-slate-500 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2">Zaman</th>
                <th className="px-3 py-2">Cihaz</th>
                <th className="px-3 py-2">Metrik</th>
                <th className="px-3 py-2 text-right">Değer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
              {filtered.slice(-8).map((t, idx) => (
                <tr key={t.id ? `${t.id}_${idx}` : `dt_${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                  <td className="px-3 py-1.5 text-slate-400">{formatShortTime(t.timestamp)}</td>
                  <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200 font-semibold truncate max-w-[100px]">
                    {t.deviceName}
                  </td>
                  <td className="px-3 py-1.5 text-slate-400">{t.metric}</td>
                  <td className="px-3 py-1.5 text-right font-bold text-emerald-400">
                    {t.value} {t.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="pt-2 text-[10px] text-slate-400 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 mt-2">
        <span>Gösterilen: {Math.min(8, filtered.length)} / {filtered.length} Kayıt</span>
        <span className={dataSource === 'live' ? "text-cyan-400 font-semibold" : "text-indigo-400 font-semibold"}>
          {dataSource === 'live' ? '⚡ WS Canlı Akış' : '🐘 PostgreSQL / TimescaleDB'}
        </span>
      </div>
    </div>
  );
};
