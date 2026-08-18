import React from 'react';
import type { WidgetConfig } from '../../types';
import { useRealtime } from '../../context/RealtimeContext';
import { formatMetricValue, getMetricUnit, getStatusColor } from '../../lib/utils';
import { TrendingUp, TrendingDown, Cpu, Thermometer, Zap, Activity } from 'lucide-react';
import { DeviceStatusDot } from './DeviceStatusDot';

interface MetricWidgetProps {
  config: WidgetConfig;
  onDelete?: () => void;
}

export const MetricWidget: React.FC<MetricWidgetProps> = ({ config, onDelete }) => {
  const { latestTelemetry, devices } = useRealtime();

  const metricKey = config.metricKey || 'cpu';
  const unit = config.unit || getMetricUnit(metricKey);

  // Target device lookup if specific deviceId is configured
  const targetDev = config.deviceId
    ? devices.find((d) => d.id === config.deviceId || d.apiKey === config.deviceId)
    : null;

  // Get matching readings (latestTelemetry is sorted descending by timestamp: index 0 is newest)
  const filtered = latestTelemetry.filter((t) => {
    if (config.deviceId && targetDev) {
      if (t.deviceId !== targetDev.id && t.deviceId !== targetDev.apiKey) return false;
    } else if (config.deviceId && t.deviceId !== config.deviceId) {
      return false;
    }
    return t.metric && t.metric.toLowerCase() === metricKey.toLowerCase();
  });

  const latest = filtered[0];

  let currentVal = 0;
  if (latest && typeof latest.value === 'number' && !isNaN(latest.value)) {
    currentVal = latest.value;
  } else if (targetDev && targetDev.metrics) {
    const matchKey = Object.keys(targetDev.metrics).find(
      (k) => k.toLowerCase() === metricKey.toLowerCase()
    );
    if (matchKey && (targetDev.metrics as Record<string, number>)[matchKey] !== undefined) {
      currentVal = Number((targetDev.metrics as Record<string, number>)[matchKey]);
    }
  } else {
    for (const d of devices) {
      if (d.metrics) {
        const matchKey = Object.keys(d.metrics).find(
          (k) => k.toLowerCase() === metricKey.toLowerCase()
        );
        if (matchKey && (d.metrics as Record<string, number>)[matchKey] !== undefined) {
          currentVal = Number((d.metrics as Record<string, number>)[matchKey]);
          break;
        }
      }
    }
  }

  const prevVal = filtered.length > 1 ? filtered[1].value : currentVal;
  const diff = currentVal - prevVal;
  const isUp = diff >= 0;

  const getMetricIcon = () => {
    switch (metricKey) {
      case 'cpu':
      case 'memory':
        return <Cpu className="w-5 h-5 text-blue-500" />;
      case 'temperature':
        return <Thermometer className="w-5 h-5 text-amber-500" />;
      case 'power':
        return <Zap className="w-5 h-5 text-emerald-500" />;
      default:
        return <Activity className="w-5 h-5 text-purple-500" />;
    }
  };

  const status = currentVal > (config.thresholdCritical || 85) ? 'critical' : currentVal > (config.thresholdWarning || 70) ? 'warning' : 'normal';
  const colors = getStatusColor(status);

  return (
    <div className="h-full bg-white dark:bg-[#0f172a] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xl hover:shadow-2xl transition-all flex flex-col justify-between relative group">
      {/* Widget Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-indigo-500/10 text-indigo-400 border border-slate-200 dark:border-indigo-500/20">{getMetricIcon()}</div>
          <DeviceStatusDot deviceId={config.deviceId} />
          <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            {config.title}
          </h3>
        </div>
        <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}>
          {status === 'critical' ? 'Kritik' : status === 'warning' ? 'Uyarı' : 'Normal'}
        </span>
      </div>

      {/* Main Metric Display */}
      <div className="my-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {formatMetricValue(currentVal)}
          </span>
          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">{unit}</span>
        </div>

        {/* Trend line */}
        <div className="flex items-center gap-1.5 mt-2 text-xs">
          {isUp ? (
            <span className="flex items-center text-rose-500 font-bold">
              <TrendingUp className="w-3.5 h-3.5 mr-0.5" />+{diff.toFixed(1)}
            </span>
          ) : (
            <span className="flex items-center text-emerald-500 font-bold">
              <TrendingDown className="w-3.5 h-3.5 mr-0.5" />{diff.toFixed(1)}
            </span>
          )}
          <span className="text-slate-400 dark:text-slate-500">son güncellenen değere göre</span>
        </div>
      </div>

      {/* Subtext info */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <span>Cihaz Sayısı: {devices.length}</span>
        <span className="flex items-center gap-1 text-emerald-400 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live WebSocket
        </span>
      </div>
    </div>
  );
};
