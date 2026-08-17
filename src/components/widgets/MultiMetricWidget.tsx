import React from 'react';
import type { WidgetConfig } from '../../types';
import { useRealtime } from '../../context/RealtimeContext';
import { formatMetricValue, getMetricUnit, getStatusColor } from '../../lib/utils';
import {
  TrendingUp,
  TrendingDown,
  Cpu,
  Thermometer,
  Zap,
  Activity,
  Droplets,
  Gauge as GaugeIcon,
  Wind,
  Battery,
  Sliders,
  Settings2,
} from 'lucide-react';
import { DeviceStatusDot } from './DeviceStatusDot';

interface MultiMetricWidgetProps {
  config: WidgetConfig;
  onEdit?: () => void;
}

export const MultiMetricWidget: React.FC<MultiMetricWidgetProps> = ({ config, onEdit }) => {
  const { latestTelemetry, devices } = useRealtime();

  const count = config.multiMetricCount || 2; // 2 or 4
  const mappings = config.metricMappings || {};

  // Define default definitions for slots
  const slotsConfig = [
    {
      key: mappings.m1 || 'temperature',
      label: mappings.m1_label || 'Sıcaklık',
      unit: mappings.m1_unit || getMetricUnit(mappings.m1 || 'temperature'),
    },
    {
      key: mappings.m2 || 'humidity',
      label: mappings.m2_label || 'Nem Oranı',
      unit: mappings.m2_unit || getMetricUnit(mappings.m2 || 'humidity'),
    },
    {
      key: mappings.m3 || 'cpu',
      label: mappings.m3_label || 'İşlemci Yükü',
      unit: mappings.m3_unit || getMetricUnit(mappings.m3 || 'cpu'),
    },
    {
      key: mappings.m4 || 'power',
      label: mappings.m4_label || 'Güç Tüketimi',
      unit: mappings.m4_unit || getMetricUnit(mappings.m4 || 'power'),
    },
  ].slice(0, count);

  // Function to get metric icon
  const getMetricIcon = (metricKey: string) => {
    const key = metricKey.toLowerCase();
    if (key.includes('cpu') || key.includes('memory') || key.includes('ram')) {
      return <Cpu className="w-4 h-4 text-blue-500" />;
    }
    if (key.includes('temp') || key.includes('sicaklik')) {
      return <Thermometer className="w-4 h-4 text-amber-500" />;
    }
    if (key.includes('power') || key.includes('watt') || key.includes('volt') || key.includes('current') || key.includes('guc')) {
      return <Zap className="w-4 h-4 text-emerald-500" />;
    }
    if (key.includes('humidity') || key.includes('nem') || key.includes('flow')) {
      return <Droplets className="w-4 h-4 text-cyan-500" />;
    }
    if (key.includes('pressure') || key.includes('basinc')) {
      return <Wind className="w-4 h-4 text-indigo-500" />;
    }
    if (key.includes('battery') || key.includes('pil') || key.includes('batarya')) {
      return <Battery className="w-4 h-4 text-emerald-400" />;
    }
    return <Activity className="w-4 h-4 text-purple-500" />;
  };

  // Helper to extract value and trend for a slot
  const getMetricData = (metricKey: string) => {
    const filtered = latestTelemetry.filter(
      (t) => (!config.deviceId || t.deviceId === config.deviceId) && t.metric.toLowerCase() === metricKey.toLowerCase()
    );

    let currentVal = 0;
    const latest = filtered[0];

    if (latest) {
      currentVal = latest.value;
    } else if (config.deviceId) {
      const dev = devices.find((d) => d.id === config.deviceId);
      if (dev && dev.metrics && (dev.metrics as Record<string, number>)[metricKey] !== undefined) {
        currentVal = Number((dev.metrics as Record<string, number>)[metricKey]);
      }
    } else {
      const devWithMetric = devices.find(
        (d) => d.metrics && (d.metrics as Record<string, number>)[metricKey] !== undefined
      );
      if (devWithMetric) {
        currentVal = Number((devWithMetric.metrics as Record<string, number>)[metricKey]);
      }
    }

    const prevVal = filtered.length > 1 ? filtered[1].value : currentVal;
    const diff = currentVal - prevVal;
    const isUp = diff >= 0;

    const thresholdWarn = config.thresholdWarning || 70;
    const thresholdCrit = config.thresholdCritical || 85;

    const status = currentVal > thresholdCrit ? 'critical' : currentVal > thresholdWarn ? 'warning' : 'normal';

    return { currentVal, diff, isUp, status };
  };

  return (
    <div className="h-full bg-white dark:bg-[#0f172a] rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xl hover:shadow-2xl transition-all flex flex-col justify-between relative group">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            <Sliders className="w-4 h-4" />
          </div>
          <DeviceStatusDot deviceId={config.deviceId} />
          <div>
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              {config.title || `Çoklu Metrik Izgarası (${count}'li)`}
            </h3>
            <p className="text-[10px] text-slate-400">
              {config.deviceId ? 'Spesifik Cihaz Telemetrisi' : 'Tüm Cihazlar Genel Veri'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20">
            {count}'li Panel
          </span>

          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
              title="Widget Ayarlarını Düzenle"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Metric Grid Display */}
      <div className={`my-3 grid ${count === 2 ? 'grid-cols-1 gap-3' : 'grid-cols-2 gap-2.5'}`}>
        {slotsConfig.map((slot, index) => {
          const { currentVal, diff, isUp, status } = getMetricData(slot.key);
          const colors = getStatusColor(status);

          return (
            <div
              key={index}
              className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between hover:border-purple-500/40 transition-all group/item"
            >
              {/* Slot Header */}
              <div className="flex items-center justify-between gap-1.5 mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shrink-0">
                    {getMetricIcon(slot.key)}
                  </div>
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate" title={slot.label}>
                    {slot.label}
                  </span>
                </div>

                <span
                  className={`px-2 py-0.5 text-[9px] font-bold rounded-full border shrink-0 ${colors.bg} ${colors.text} ${colors.border}`}
                >
                  {status === 'critical' ? 'Kritik' : status === 'warning' ? 'Uyarı' : 'Normal'}
                </span>
              </div>

              {/* Slot Value */}
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className={`${count === 2 ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'} font-extrabold text-slate-900 dark:text-white tracking-tight`}>
                  {formatMetricValue(currentVal)}
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{slot.unit}</span>
              </div>

              {/* Slot Trend */}
              <div className="flex items-center justify-between text-[10px] mt-2 pt-1.5 border-t border-slate-200/50 dark:border-slate-700/50 text-slate-400">
                <span className="font-mono truncate">{slot.key}</span>
                {isUp ? (
                  <span className="flex items-center text-rose-500 font-bold shrink-0">
                    <TrendingUp className="w-3 h-3 mr-0.5" />+{diff.toFixed(1)}
                  </span>
                ) : (
                  <span className="flex items-center text-emerald-500 font-bold shrink-0">
                    <TrendingDown className="w-3 h-3 mr-0.5" />{diff.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <span className="truncate">Sensör Sayısı: {count} Metrik</span>
        <span className="flex items-center gap-1 text-emerald-400 font-medium shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Canlı WebSocket
        </span>
      </div>
    </div>
  );
};
