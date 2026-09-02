import React from 'react';
import type { WidgetConfig } from '../../types';
import { useRealtime } from '../../context/RealtimeContext';
import { Sliders, Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { DeviceStatusDot } from './DeviceStatusDot';

interface ProgressBarWidgetProps {
  config: WidgetConfig;
  onEdit?: () => void;
}

export const ProgressBarWidget: React.FC<ProgressBarWidgetProps> = ({ config, onEdit }) => {
  const { devices } = useRealtime();

  const isSpecificDevice = Boolean(config.deviceId && config.deviceId !== 'all');
  const targetDev = isSpecificDevice
    ? devices.find((d) => d.id === config.deviceId || d.apiKey === config.deviceId)
    : null;

  // Pick metric readings
  const metricsList = [
    { label: 'CPU Yük Oranı', key: 'cpu', unit: '%', max: 100, warn: 70, crit: 90 },
    { label: 'Sıcaklık Seviyesi', key: 'temperature', unit: '°C', max: 80, warn: 45, crit: 65 },
    { label: 'RAM Kullanımı', key: 'memory', unit: '%', max: 100, warn: 75, crit: 90 },
    { label: 'Güç Tüketim Yükü', key: 'power', unit: 'kW', max: 10, warn: 6, crit: 8.5 },
  ];

  const getMetricValue = (key: string) => {
    if (isSpecificDevice) {
      if (targetDev && targetDev.metrics) {
        return Number(targetDev.metrics[key as keyof typeof targetDev.metrics] || 0);
      }
      return 0;
    }
    const total = devices.reduce((acc, d) => acc + (d.metrics[key as keyof typeof d.metrics] || 0), 0);
    return Math.round((total / (devices.length || 1)) * 10) / 10;
  };

  const isCompact = (config.height || 'H1') === 'H1';

  if (isCompact) {
    const primaryMetric = metricsList[0];
    const val = getMetricValue(primaryMetric.key);
    const pct = Math.min(100, Math.max(0, (val / primaryMetric.max) * 100));

    let barColor = 'bg-emerald-500';
    let textColor = 'text-emerald-500 dark:text-emerald-400';
    if (val >= primaryMetric.crit) {
      barColor = 'bg-rose-500';
      textColor = 'text-rose-500 dark:text-rose-400';
    } else if (val >= primaryMetric.warn) {
      barColor = 'bg-amber-500';
      textColor = 'text-amber-500 dark:text-amber-400';
    }

    return (
      <div className="h-full w-full min-h-0 bg-white dark:bg-[#0f172a] rounded-2xl sm:rounded-3xl px-3.5 py-2 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-3 overflow-hidden">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="p-1.5 rounded-xl text-white font-bold shrink-0"
            style={{ backgroundColor: config.colorScheme || '#f59e0b' }}
          >
            <Activity className="w-4 h-4" />
          </div>
          <DeviceStatusDot deviceId={config.deviceId} />
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
              {config.title || 'İlerleme Çubuğu'}
            </h3>
            <p className="text-[10px] text-slate-400 truncate">
              {primaryMetric.label}: <span className={`font-mono font-bold ${textColor}`}>{val} {primaryMetric.unit}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-1 max-w-[160px] sm:max-w-[220px]">
          <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-bold font-mono text-slate-700 dark:text-slate-300 shrink-0">
            {Math.round(pct)}%
          </span>
        </div>

        {onEdit && (
          <button
            onClick={onEdit}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors shrink-0"
            title="Widget Özelleştir"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-0 bg-white dark:bg-[#0f172a] rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col justify-between transition-all overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl text-white font-bold" style={{ backgroundColor: config.colorScheme || '#f59e0b' }}>
            <Activity className="w-3.5 h-3.5" />
          </div>
          <DeviceStatusDot deviceId={config.deviceId} />
          <div>
            <h3 className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[150px]">
              {config.title || 'İlerleme & Eşik Çubuğu'}
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              Kritik limitlere göre anlık doluluk
            </p>
          </div>
        </div>

        {onEdit && (
          <button
            onClick={onEdit}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            title="Widget Özelleştir"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Progress Bars List */}
      <div className="space-y-2 my-1 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        {metricsList.map((m) => {
          const val = getMetricValue(m.key);
          const pct = Math.min(100, Math.max(0, (val / m.max) * 100));

          let barColor = 'bg-emerald-500';
          let textColor = 'text-emerald-400';
          if (val >= m.crit) {
            barColor = 'bg-rose-500';
            textColor = 'text-rose-400';
          } else if (val >= m.warn) {
            barColor = 'bg-amber-500';
            textColor = 'text-amber-400';
          }

          return (
            <div key={m.key} className="space-y-0.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-slate-700 dark:text-slate-300">{m.label}</span>
                <span className={`font-bold font-mono ${textColor}`}>
                  {val} {m.unit} <span className="text-slate-500 text-[9px]">({Math.round(pct)}%)</span>
                </span>
              </div>

              <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer info */}
      <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[10px] flex items-center justify-between text-slate-400 shrink-0">
        <span>Tolerans: %85</span>
        <span className="text-emerald-400 font-bold flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Güvenli
        </span>
      </div>
    </div>
  );
};
