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

  return (
    <div className="h-full bg-white dark:bg-[#0f172a] rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col justify-between transition-all">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl text-white font-bold" style={{ backgroundColor: config.colorScheme || '#f59e0b' }}>
            <Activity className="w-4 h-4" />
          </div>
          <DeviceStatusDot deviceId={config.deviceId} />
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {config.title || 'Eşik & SLA Tolerans İlerleme Çubuğu'}
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              Kritik limitlere göre anlık doluluk ve emniyet yüzdeleri
            </p>
          </div>
        </div>

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

      {/* Progress Bars List */}
      <div className="space-y-3.5 my-1">
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
            <div key={m.key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">{m.label}</span>
                <span className={`font-bold font-mono ${textColor}`}>
                  {val} {m.unit} <span className="text-slate-500 text-[10px]">({Math.round(pct)}%)</span>
                </span>
              </div>

              <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5">
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
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] flex items-center justify-between text-slate-400">
        <span>Kritik Limit Toleransı: %85</span>
        <span className="text-emerald-400 font-bold flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Güvenli
        </span>
      </div>
    </div>
  );
};
