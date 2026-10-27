import React, { useState, useEffect } from 'react';
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
  ReferenceLine,
} from 'recharts';
import type { WidgetConfig, MetricHistory } from '../../types';
import { useRealtime } from '../../context/RealtimeContext';
import { useTheme } from '../../context/ThemeContext';
import { formatShortTime, getMetricUnit } from '../../lib/utils';
import { Activity, Maximize2, RefreshCw } from 'lucide-react';
import { apiFetch as fetch, safeJson } from '../../lib/apiFetch';
import { DeviceStatusDot } from './DeviceStatusDot';

interface ChartWidgetProps {
  config: WidgetConfig;
  onDelete?: () => void;
}

type TimeRange = 'live' | '1h' | '24h' | '7d' | '30d';

export const ChartWidget: React.FC<ChartWidgetProps> = ({ config }) => {
  const { latestTelemetry, devices } = useRealtime();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [chartType, setChartType] = useState<WidgetConfig['type']>(config.type || 'area_chart');
  const [timeRange, setTimeRange] = useState<TimeRange>('live');
  const [timescaleData, setTimescaleData] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const metricKey = config.metricKey || 'cpu';
  const unit = config.unit || getMetricUnit(metricKey);

  const isSpecificDevice = Boolean(config.deviceId && config.deviceId !== 'all');
  const targetDev = isSpecificDevice
    ? devices.find((d) => d.id === config.deviceId || d.apiKey === config.deviceId)
    : null;

  useEffect(() => {
    if (timeRange === 'live') return;

    let isMounted = true;
    setIsLoadingHistory(true);

    const bucketMap: Record<string, string> = {
      '1h': '1m',
      '24h': '5m',
      '7d': '1h',
      '30d': '1d',
    };
    const now = new Date();
    const durationMs =
      timeRange === '1h' ? 3600000 :
      timeRange === '24h' ? 86400000 :
      timeRange === '7d' ? 7 * 86400000 :
      30 * 86400000;
    const startTime = new Date(now.getTime() - durationMs).toISOString();

    const devParam = isSpecificDevice ? `&deviceId=${encodeURIComponent(config.deviceId!)}` : '';
    const bucket = bucketMap[timeRange] || '5m';

    fetch(`/api/timescale/time-bucket?metric=${encodeURIComponent(metricKey)}&bucket=${bucket}&startTime=${encodeURIComponent(startTime)}${devParam}`)
      .then((res) => safeJson(res, []))
      .then((data) => {
        if (isMounted && Array.isArray(data)) {
          setTimescaleData(data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsLoadingHistory(false);
      });

    return () => {
      isMounted = false;
    };
  }, [timeRange, config.deviceId, metricKey]);

  let filtered: any[] = [];

  if (timeRange === 'live') {
    // Filter telemetry for this widget (latestTelemetry is ordered newest-first)
    const matchingTelemetry = latestTelemetry.filter((t) => {
      if (isSpecificDevice) {
        if (targetDev) {
          if (t.deviceId !== targetDev.id && t.deviceId !== targetDev.apiKey) return false;
        } else if (t.deviceId !== config.deviceId) {
          return false;
        }
      }
      return t.metric && t.metric.toLowerCase() === metricKey.toLowerCase();
    });

    filtered = matchingTelemetry
      .slice(0, 30)
      .reverse()
      .map((t) => ({
        time: formatShortTime(t.timestamp),
        value: t.value,
        deviceName: t.deviceName,
      }));
  } else if (timescaleData.length > 0) {
    filtered = timescaleData.map((d) => {
      const dt = new Date(d.timeBucket);
      const timeStr =
        timeRange === '1h' || timeRange === '24h'
          ? dt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
          : `${dt.getDate()}/${dt.getMonth() + 1} ${dt.getHours()}:00`;
      return {
        time: timeStr,
        value: d.avgValue,
        min: d.minValue,
        max: d.maxValue,
        count: d.readingCount,
      };
    });
  }

  const color = config.colorScheme || '#3b82f6';
  const tickColor = isDark ? '#94a3b8' : '#64748b';
  const tooltipStyle = {
    backgroundColor: isDark ? '#0f172a' : '#ffffff',
    borderColor: isDark ? '#334155' : '#e2e8f0',
    borderRadius: '12px',
    color: isDark ? '#ffffff' : '#0f172a',
    fontSize: '11px',
    boxShadow: isDark ? '0 10px 25px -5px rgba(0,0,0,0.5)' : '0 10px 25px -5px rgba(0,0,0,0.1)',
  };

  const renderChart = () => {
    if (isLoadingHistory) {
      return (
        <div className="h-48 flex items-center justify-center text-xs text-slate-400">
          Geçmiş veriler yükleniyor...
        </div>
      );
    }
    
    if (!filtered.length) {
      return (
        <div className="h-48 flex items-center justify-center text-xs text-slate-400">
          Veri yok veya yükleniyor...
        </div>
      );
    }

    if (chartType === 'line_chart') {
      return (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={filtered} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={isDark ? 0.15 : 0.3} stroke={isDark ? '#cbd5e1' : '#94a3b8'} />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: tickColor }} minTickGap={15} />
            <YAxis tick={{ fontSize: 10, fill: tickColor }} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(val: number) => [`${val.toFixed(1)} ${unit}`, 'Değer']}
            />
            {config.thresholdWarning && (
              <ReferenceLine y={config.thresholdWarning} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'Uyarı Eşiği', fill: '#f59e0b', fontSize: 10 }} />
            )}
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2.5}
              dot={timeRange !== 'live'}
              activeDot={{ r: 5, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'bar_chart') {
      return (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={filtered} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={isDark ? 0.15 : 0.3} stroke={isDark ? '#cbd5e1' : '#94a3b8'} />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: tickColor }} minTickGap={15} />
            <YAxis tick={{ fontSize: 10, fill: tickColor }} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(val: number) => [`${val.toFixed(1)} ${unit}`, 'Değer']}
            />
            <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    // Default Area Chart
    return (
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={filtered} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad_${config.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.4} />
              <stop offset="95%" stopColor={color} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" opacity={isDark ? 0.15 : 0.3} stroke={isDark ? '#cbd5e1' : '#94a3b8'} />
          <XAxis dataKey="time" tick={{ fontSize: 10, fill: tickColor }} minTickGap={15} />
          <YAxis tick={{ fontSize: 10, fill: tickColor }} domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(val: number) => [`${val.toFixed(1)} ${unit}`, 'Değer']}
          />
          {config.thresholdWarning && (
            <ReferenceLine y={config.thresholdWarning} stroke="#f59e0b" strokeDasharray="3 3" />
          )}
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2.5}
            fillOpacity={1}
            fill={`url(#grad_${config.id})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="h-full bg-white dark:bg-[#0f172a] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xl hover:shadow-2xl transition-all flex flex-col justify-between">
      {/* Widget Header */}
      <div className="flex flex-col gap-2 mb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Activity className="w-4 h-4 text-indigo-400" />
            </div>
            <DeviceStatusDot deviceId={config.deviceId} device={targetDev} metricKey={config.metricKey} />
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {config.title}
            </h3>
          </div>
          
          {/* Chart type switcher */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-[10px] border border-slate-200 dark:border-slate-700/60">
            <button
              onClick={() => setChartType('area_chart')}
              className={`px-2.5 py-0.5 rounded-lg font-medium transition-colors ${
                chartType === 'area_chart'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Alan
            </button>
            <button
              onClick={() => setChartType('line_chart')}
              className={`px-2.5 py-0.5 rounded-lg font-medium transition-colors ${
                chartType === 'line_chart'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Çizgi
            </button>
            <button
              onClick={() => setChartType('bar_chart')}
              className={`px-2.5 py-0.5 rounded-lg font-medium transition-colors ${
                chartType === 'bar_chart'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Sütun
            </button>
          </div>
        </div>

        {/* Time range switcher */}
        <div className="flex items-center justify-between gap-1 mt-1">
          <div className="flex items-center gap-1">
            {(['live', '1h', '24h', '7d', '30d'] as TimeRange[]).map((t) => (
              <button
                key={t}
                onClick={() => setTimeRange(t)}
                className={`text-[9px] px-2 py-0.5 rounded-lg font-medium border transition-colors ${
                  timeRange === t
                    ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 font-bold'
                    : 'bg-transparent border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                {t === 'live' ? 'Canlı (WS)' : t === '1h' ? '1 Saat' : t === '24h' ? '24 Saat' : t === '7d' ? '7 Gün' : '30 Gün'}
              </button>
            ))}
          </div>

          <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">
            {timeRange === 'live' ? '⚡ WS Canlı' : '🐘 TimescaleDB'}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 w-full mt-2">
        {renderChart()}
      </div>
    </div>
  );
};
