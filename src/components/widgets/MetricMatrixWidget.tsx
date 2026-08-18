import React from 'react';
import type { WidgetConfig, MatrixSlotConfig } from '../../types';
import { useRealtime } from '../../context/RealtimeContext';
import { formatMetricValue, getMetricUnit } from '../../lib/utils';
import { Settings2, Grid, AlertTriangle, ShieldAlert, Wifi, WifiOff } from 'lucide-react';

interface MetricMatrixWidgetProps {
  config: WidgetConfig;
  onEdit?: () => void;
}

// Default metric threshold fallbacks if slot doesn't have custom ones
const getMetricDefaultWarning = (key: string): number => {
  const k = (key || '').toLowerCase();
  if (k.includes('temp') || k.includes('sıcaklık')) return 38;
  if (k.includes('cpu') || k.includes('ram') || k.includes('memory') || k.includes('nem') || k.includes('humidity')) return 70;
  if (k.includes('power') || k.includes('güç') || k.includes('watt')) return 2500;
  if (k.includes('voltage') || k.includes('volt') || k.includes('gerilim')) return 245;
  if (k.includes('pressure') || k.includes('basınç')) return 80;
  return 75;
};

const getMetricDefaultCritical = (key: string): number => {
  const k = (key || '').toLowerCase();
  if (k.includes('temp') || k.includes('sıcaklık')) return 55;
  if (k.includes('cpu') || k.includes('ram') || k.includes('memory') || k.includes('nem') || k.includes('humidity')) return 88;
  if (k.includes('power') || k.includes('güç') || k.includes('watt')) return 4000;
  if (k.includes('voltage') || k.includes('volt') || k.includes('gerilim')) return 260;
  if (k.includes('pressure') || k.includes('basınç')) return 110;
  return 90;
};

export const MetricMatrixWidget: React.FC<MetricMatrixWidgetProps> = ({ config, onEdit }) => {
  const { devices, latestTelemetry } = useRealtime();

  // Retrieve or generate default slots
  const slots: MatrixSlotConfig[] = config.matrixSlots && config.matrixSlots.length > 0
    ? config.matrixSlots
    : Array.from({ length: 32 }, (_, i) => {
        const devIndex = i % Math.max(1, devices.length);
        const dev = devices[devIndex];
        const defaultMetrics = ['temperature', 'humidity', 'cpu', 'power', 'voltage', 'pressure', 'memory', 'bandwidth'];
        const mKey = defaultMetrics[i % defaultMetrics.length];
        return {
          id: `slot_${i + 1}`,
          label: dev ? `${dev.name.slice(0, 10)}:${mKey}` : `M${i + 1}:${mKey}`,
          deviceId: dev ? dev.id : 'all',
          metricKey: mKey,
        };
      });

  // Helper to fetch value, online status, and threshold state for a slot
  const getSlotData = (slot: MatrixSlotConfig) => {
    let rawValue: number | null = null;
    let unit = getMetricUnit(slot.metricKey);
    let dev =
      slot.deviceId && slot.deviceId !== 'all'
        ? devices.find((d) => d.id === slot.deviceId || d.apiKey === slot.deviceId)
        : null;

    if (dev) {
      if (dev.metrics) {
        const matchKey = Object.keys(dev.metrics).find(
          (k) => k.toLowerCase() === slot.metricKey.toLowerCase()
        );
        if (matchKey && (dev.metrics as Record<string, number | undefined>)[matchKey] !== undefined) {
          rawValue = (dev.metrics as Record<string, number | undefined>)[matchKey] ?? null;
        }
      }
      const tele = latestTelemetry.find(
        (t) =>
          (t.deviceId === dev!.id || t.deviceId === dev!.apiKey || t.deviceName === dev!.name) &&
          t.metric &&
          t.metric.toLowerCase() === slot.metricKey.toLowerCase()
      );
      if (tele && typeof tele.value === 'number' && !isNaN(tele.value)) {
        rawValue = tele.value;
        if (tele.unit) unit = tele.unit;
      }
    } else {
      const tele = latestTelemetry.find(
        (t) => t.metric && t.metric.toLowerCase() === slot.metricKey.toLowerCase()
      );
      if (tele && typeof tele.value === 'number' && !isNaN(tele.value)) {
        rawValue = tele.value;
        if (tele.unit) unit = tele.unit;
      } else {
        const devWithMetric = devices.find((d) => {
          if (!d.metrics) return false;
          const matchKey = Object.keys(d.metrics).find(
            (k) => k.toLowerCase() === slot.metricKey.toLowerCase()
          );
          return matchKey && (d.metrics as Record<string, number | undefined>)[matchKey] !== undefined;
        });
        if (devWithMetric && devWithMetric.metrics) {
          const matchKey = Object.keys(devWithMetric.metrics).find(
            (k) => k.toLowerCase() === slot.metricKey.toLowerCase()
          );
          if (matchKey) {
            rawValue = (devWithMetric.metrics as Record<string, number | undefined>)[matchKey] ?? null;
            dev = devWithMetric;
          }
        }
      }
    }

    // Determine device online status
    const isOnline = dev ? dev.status === 'online' : devices.some((d) => d.status === 'online');

    // Threshold evaluation
    const warningLimit = slot.thresholdWarning ?? getMetricDefaultWarning(slot.metricKey);
    const criticalLimit = slot.thresholdCritical ?? getMetricDefaultCritical(slot.metricKey);

    let thresholdState: 'normal' | 'warning' | 'critical' = 'normal';
    if (rawValue !== null) {
      if (rawValue >= criticalLimit) {
        thresholdState = 'critical';
      } else if (rawValue >= warningLimit) {
        thresholdState = 'warning';
      }
    }

    return {
      rawValue,
      formattedValue: rawValue !== null ? `${formatMetricValue(rawValue)} ${unit}` : '-',
      isOnline,
      deviceName: dev ? dev.name : 'Tüm Cihazlar',
      thresholdState,
      warningLimit,
      criticalLimit,
    };
  };

  // Filter out empty slots if any
  const activeSlots = slots.filter((s) => s.label || s.metricKey);
  const displaySlots = activeSlots.length > 0 ? activeSlots : slots;

  // Counts for summary header
  let totalOnline = 0;
  let totalWarnings = 0;
  let totalCritical = 0;

  displaySlots.forEach((slot) => {
    if (slot.label || slot.metricKey) {
      const data = getSlotData(slot);
      if (data.isOnline) totalOnline++;
      if (data.thresholdState === 'warning') totalWarnings++;
      if (data.thresholdState === 'critical') totalCritical++;
    }
  });

  return (
    <div className={`h-full flex flex-col justify-between p-3.5 bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md relative overflow-hidden ${
      displaySlots.length > 32 ? 'min-h-[280px]' : displaySlots.length > 16 ? 'min-h-[220px]' : 'min-h-[140px]'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800/80 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Grid className="w-4 h-4 text-indigo-500 shrink-0" />
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
            {config.title || 'Çoklu Cihaz & Metrik Matrisi'}
          </h3>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold">
              {displaySlots.length} Veri
            </span>
            {totalCritical > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-rose-500 text-white font-bold animate-pulse flex items-center gap-0.5">
                <ShieldAlert className="w-2.5 h-2.5" /> {totalCritical} Kritik
              </span>
            )}
            {totalWarnings > 0 && totalCritical === 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500 text-white font-bold flex items-center gap-0.5">
                <AlertTriangle className="w-2.5 h-2.5" /> {totalWarnings} Uyarı
              </span>
            )}
          </div>
        </div>

        {onEdit && (
          <button
            onClick={onEdit}
            className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            title="Widget Ayarları"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Dynamic Grid Layout */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-0.5 max-h-[360px]">
        <div className={`grid gap-1.5 text-[11px] ${
          displaySlots.length > 20
            ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'
            : displaySlots.length > 8
            ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
            : 'grid-cols-2 sm:grid-cols-2'
        }`}>
          {displaySlots.map((slot, index) => {
            const isEmptySlot = !slot.label && !slot.metricKey;

            if (isEmptySlot) {
              return (
                <div
                  key={slot.id || `slot_${index}`}
                  className="flex items-center justify-center px-2 py-1.5 bg-slate-50/40 dark:bg-slate-900/20 border border-dashed border-slate-200/60 dark:border-slate-800/40 rounded-lg min-w-0"
                  title="Boş Slot"
                >
                  <span className="text-[10px] font-mono text-slate-300 dark:text-slate-700/60">-</span>
                </div>
              );
            }

            const data = getSlotData(slot);
            const slotName = slot.label || `M${index + 1}:${slot.metricKey}`;

            // Outer Thin Border -> Online vs Offline Device status
            const deviceBorderClass = data.isOnline
              ? 'border-2 border-emerald-500 dark:border-emerald-500/90 shadow-2xs'
              : 'border-2 border-slate-300 dark:border-slate-700/80 border-dashed';

            // Inner Fill Tone -> 3 Distinct Tones (Normal, Warning, Critical)
            let innerToneClass = 'bg-slate-50 dark:bg-slate-900/60 text-slate-800 dark:text-slate-200';
            if (data.thresholdState === 'warning') {
              innerToneClass = 'bg-amber-100/90 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 font-semibold';
            } else if (data.thresholdState === 'critical') {
              innerToneClass = 'bg-rose-100/90 dark:bg-rose-950/70 text-rose-950 dark:text-rose-100 font-bold animate-pulse';
            }

            return (
              <div
                key={slot.id || `slot_${index}`}
                className={`flex items-center justify-between px-2 py-1.5 rounded-lg min-w-0 gap-1.5 transition-all relative ${deviceBorderClass} ${innerToneClass}`}
                title={`${slotName} [${data.deviceName}] - Cihaz: ${data.isOnline ? 'ONLINE' : 'OFFLINE'} | Durum: ${data.thresholdState.toUpperCase()} (Uyarı > ${data.warningLimit}, Alarm > ${data.criticalLimit})`}
              >
                {/* Left: Device status indicator dot + Slot Label */}
                <div className="flex items-center gap-1 shrink min-w-0 truncate">
                  {data.isOnline ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="Cihaz Online" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-600 shrink-0" title="Cihaz Offline" />
                  )}
                  <span className="font-medium truncate shrink min-w-0 opacity-90">
                    {slotName}:
                  </span>
                </div>

                {/* Right: Value + Optional Alert Indicator */}
                <div className="flex items-center gap-1 shrink-0">
                  {data.thresholdState === 'critical' ? (
                    <ShieldAlert className="w-3 h-3 text-rose-600 dark:text-rose-400 shrink-0 animate-bounce" />
                  ) : data.thresholdState === 'warning' ? (
                    <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                  ) : null}
                  <span className="font-bold shrink-0 text-right font-mono">
                    {data.formattedValue}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
