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
  const isSpecificDevice = Boolean(config.deviceId && config.deviceId !== 'all');
  const targetDev = isSpecificDevice
    ? devices.find((d) => d.id === config.deviceId || d.apiKey === config.deviceId)
    : null;
  const isMissingDevice = isSpecificDevice && !targetDev;

  // Get matching readings (latestTelemetry is sorted descending by timestamp: index 0 is newest)
  const filtered = latestTelemetry.filter((t) => {
    if (isSpecificDevice) {
      if (targetDev && (t.deviceId === targetDev.id || t.deviceId === targetDev.apiKey)) {
        // match
      } else if (t.deviceId === config.deviceId) {
        // match
      } else {
        return false;
      }
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
  } else if (!isSpecificDevice) {
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

  const isCompact = (config.height || 'H1') === 'H1';

  if (isCompact) {
    return (
      <div className="h-full w-full min-h-0 bg-white dark:bg-[#0f172a] rounded-2xl sm:rounded-3xl px-3.5 py-2 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-2.5 overflow-hidden">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-xl bg-slate-100 dark:bg-indigo-500/10 text-indigo-400 border border-slate-200 dark:border-indigo-500/20 shrink-0">
            {getMetricIcon()}
          </div>
          <DeviceStatusDot deviceId={config.deviceId} />
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
              {config.title}
            </h3>
            <p className="text-[10px] text-slate-400 truncate">
              {isSpecificDevice
                ? targetDev
                  ? targetDev.name
                  : `⚠️ Kayıp Cihaz`
                : `Tüm Cihazlar (${devices.length})`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isUp ? (
            <span className="hidden sm:flex items-center text-rose-500 font-bold text-[10px]">
              <TrendingUp className="w-3 h-3 mr-0.5" />+{diff.toFixed(1)}
            </span>
          ) : (
            <span className="hidden sm:flex items-center text-emerald-500 font-bold text-[10px]">
              <TrendingDown className="w-3 h-3 mr-0.5" />{diff.toFixed(1)}
            </span>
          )}
          <div className="flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-black font-mono text-slate-900 dark:text-white tracking-tight">
              {formatMetricValue(currentVal)}
            </span>
            <span className="text-[11px] font-bold text-slate-400">{unit}</span>
          </div>
          <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}>
            {status === 'critical' ? 'Kritik' : status === 'warning' ? 'Uyarı' : 'Normal'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-0 bg-white dark:bg-[#0f172a] rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xl hover:shadow-2xl transition-all flex flex-col justify-between relative group overflow-hidden">
      {/* Widget Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-indigo-500/10 text-indigo-400 border border-slate-200 dark:border-indigo-500/20">{getMetricIcon()}</div>
          <DeviceStatusDot deviceId={config.deviceId} />
          <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider truncate max-w-[150px]">
            {config.title}
          </h3>
        </div>
        <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}>
          {status === 'critical' ? 'Kritik' : status === 'warning' ? 'Uyarı' : 'Normal'}
        </span>
      </div>

      {/* Main Metric Display */}
      <div className="my-2">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {formatMetricValue(currentVal)}
          </span>
          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">{unit}</span>
        </div>

        {/* Trend line */}
        <div className="flex items-center gap-1.5 mt-1.5 text-xs">
          {isUp ? (
            <span className="flex items-center text-rose-500 font-bold">
              <TrendingUp className="w-3.5 h-3.5 mr-0.5" />+{diff.toFixed(1)}
            </span>
          ) : (
            <span className="flex items-center text-emerald-500 font-bold">
              <TrendingDown className="w-3.5 h-3.5 mr-0.5" />{diff.toFixed(1)}
            </span>
          )}
          <span className="text-slate-400 dark:text-slate-500 text-[11px]">son okuma trendi</span>
        </div>
      </div>

      {/* Subtext info */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <span className="truncate max-w-[180px]">
          {isSpecificDevice
            ? targetDev
              ? targetDev.name
              : `⚠️ Kayıp Cihaz (${config.deviceId})`
            : `Tüm Cihazlar (${devices.length})`}
        </span>
        <span className="flex items-center gap-1 text-emerald-400 font-medium shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live WebSocket
        </span>
      </div>
    </div>
  );
};
