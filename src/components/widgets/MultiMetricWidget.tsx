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

  // Target device lookup if specific deviceId is configured
  const isSpecificDevice = Boolean(config.deviceId && config.deviceId !== 'all');
  const targetDev = isSpecificDevice
    ? devices.find((d) => d.id === config.deviceId || d.apiKey === config.deviceId)
    : null;
  const isMissingDevice = isSpecificDevice && !targetDev;

  // Helper to extract value and trend for a slot
  const getMetricData = (metricKey: string) => {
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

    let currentVal = 0;
    const latest = filtered[0];

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

    const thresholdWarn = config.thresholdWarning || 70;
    const thresholdCrit = config.thresholdCritical || 85;

    const status = currentVal > thresholdCrit ? 'critical' : currentVal > thresholdWarn ? 'warning' : 'normal';

    return { currentVal, diff, isUp, status };
  };

  const isCompact = (config.height || 'H1') === 'H1';

  if (isCompact) {
    return (
      <div className="h-full w-full min-h-0 bg-white dark:bg-[#0f172a] rounded-2xl sm:rounded-3xl px-3.5 py-2 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-3 overflow-hidden">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0">
            <Sliders className="w-4 h-4" />
          </div>
          <DeviceStatusDot deviceId={config.deviceId} device={targetDev} />
          <div className="min-w-0 hidden sm:block">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
              {config.title || 'Çoklu Metrik'}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-1 justify-end min-w-0">
          {slotsConfig.map((slot, index) => {
            const { currentVal, isUp, diff, status } = getMetricData(slot.key);
            const colors = getStatusColor(status);

            return (
              <div
                key={index}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 min-w-0"
              >
                <div className="shrink-0">{getMetricIcon(slot.key)}</div>
                <div className="min-w-0">
                  <span className="text-[9px] font-bold text-slate-400 block truncate leading-none mb-0.5">
                    {slot.label}
                  </span>
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-xs sm:text-sm font-extrabold font-mono text-slate-900 dark:text-white tracking-tight">
                      {formatMetricValue(currentVal)}
                    </span>
                    <span className="text-[9px] font-semibold text-slate-400">{slot.unit}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors shrink-0"
            title="Widget Ayarları"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-0 bg-white dark:bg-[#0f172a] rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xl hover:shadow-2xl transition-all flex flex-col justify-between relative group overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/80 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            <Sliders className="w-3.5 h-3.5" />
          </div>
          <DeviceStatusDot deviceId={config.deviceId} device={targetDev} />
          <div>
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider truncate max-w-[140px]">
              {config.title || `Çoklu Metrik (${count}'li)`}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20">
            {count}'li
          </span>

          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
              title="Widget Ayarlarını Düzenle"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Metric Grid Display */}
      <div className={`my-1.5 grid ${count === 2 ? 'grid-cols-2 gap-2' : 'grid-cols-2 gap-1.5'} flex-1 min-h-0 overflow-y-auto custom-scrollbar`}>
        {slotsConfig.map((slot, index) => {
          const { currentVal, diff, isUp, status } = getMetricData(slot.key);
          const colors = getStatusColor(status);

          return (
            <div
              key={index}
              className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between hover:border-purple-500/40 transition-all group/item"
            >
              {/* Slot Header */}
              <div className="flex items-center justify-between gap-1 mb-1">
                <div className="flex items-center gap-1 min-w-0">
                  <div className="p-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shrink-0">
                    {getMetricIcon(slot.key)}
                  </div>
                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate" title={slot.label}>
                    {slot.label}
                  </span>
                </div>

                <span
                  className={`px-1.5 py-0.5 text-[8px] font-bold rounded-full border shrink-0 ${colors.bg} ${colors.text} ${colors.border}`}
                >
                  {status === 'critical' ? 'Kritik' : status === 'warning' ? 'Uyarı' : 'Normal'}
                </span>
              </div>

              {/* Slot Value */}
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-lg @sm:text-xl @md:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight transition-all">
                  {formatMetricValue(currentVal)}
                </span>
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{slot.unit}</span>
              </div>

              {/* Slot Trend */}
              <div className="flex items-center justify-between text-[9px] mt-1 pt-1 border-t border-slate-200/50 dark:border-slate-700/50 text-slate-400">
                <span className="font-mono truncate">{slot.key}</span>
                {isUp ? (
                  <span className="flex items-center text-rose-500 font-bold shrink-0">
                    <TrendingUp className="w-2.5 h-2.5 mr-0.5" />+{diff.toFixed(1)}
                  </span>
                ) : (
                  <span className="flex items-center text-emerald-500 font-bold shrink-0">
                    <TrendingDown className="w-2.5 h-2.5 mr-0.5" />{diff.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 shrink-0">
        <span className="truncate">Sensör Sayısı: {count} Metrik</span>
        <span className="flex items-center gap-1 text-emerald-400 font-medium shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Canlı
        </span>
      </div>
    </div>
  );
};
