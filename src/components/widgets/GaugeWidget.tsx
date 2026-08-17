import React from 'react';
import type { WidgetConfig } from '../../types';
import { useRealtime } from '../../context/RealtimeContext';
import { formatMetricValue, getMetricUnit } from '../../lib/utils';
import { Gauge } from 'lucide-react';
import { DeviceStatusDot } from './DeviceStatusDot';

interface GaugeWidgetProps {
  config: WidgetConfig;
}

export const GaugeWidget: React.FC<GaugeWidgetProps> = ({ config }) => {
  const { latestTelemetry, devices } = useRealtime();

  const metricKey = config.metricKey || 'power';
  const unit = config.unit || getMetricUnit(metricKey);

  const filtered = latestTelemetry.filter(
    (t) => (!config.deviceId || t.deviceId === config.deviceId) && t.metric === metricKey
  );
  const latest = filtered[0];
  let val = 0;
  if (latest) {
    val = latest.value;
  } else {
    const devWithMetric = devices.find(
      (d) => (!config.deviceId || d.id === config.deviceId) && d.metrics && (d.metrics as Record<string, number>)[metricKey] !== undefined
    );
    if (devWithMetric) {
      val = Number((devWithMetric.metrics as Record<string, number>)[metricKey]);
    }
  }

  const maxVal = metricKey === 'power' ? 150 : metricKey === 'cpu' ? 100 : 100;
  const percentage = Math.min(100, Math.max(0, (val / maxVal) * 100));

  // Radial calculation
  const strokeWidth = 10;
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * (circumference * 0.75); // 270 deg arc

  const color =
    percentage > 85 ? '#ef4444' : percentage > 70 ? '#f59e0b' : config.colorScheme || '#10b981';

  return (
    <div className="h-full bg-white dark:bg-[#0f172a] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xl hover:shadow-2xl transition-all flex flex-col justify-between items-center text-center">
      <div className="w-full flex items-center gap-2 mb-2">
        <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <Gauge className="w-4 h-4 text-emerald-400" />
        </div>
        <DeviceStatusDot deviceId={config.deviceId} />
        <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
          {config.title}
        </h3>
      </div>

      <div className="relative my-2 flex items-center justify-center">
        <svg className="w-36 h-36 transform -rotate-135">
          {/* Background Arc */}
          <circle
            cx="72"
            cy="72"
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-slate-100 dark:text-slate-700"
            fill="transparent"
            strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
            strokeLinecap="round"
          />
          {/* Progress Arc */}
          <circle
            cx="72"
            cy="72"
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-500 ease-out"
          />
        </svg>

        {/* Center Label */}
        <div className="absolute flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-slate-900 dark:text-white">
            {formatMetricValue(val)}
          </span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{unit}</span>
        </div>
      </div>

      <div className="w-full flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-700/60 pt-2">
        <span>0 {unit}</span>
        <span>Max: {maxVal} {unit}</span>
      </div>
    </div>
  );
};
