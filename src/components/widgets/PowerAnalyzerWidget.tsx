import React, { useState, useEffect } from 'react';
import type { WidgetConfig } from '../../types';
import { useRealtime } from '../../context/RealtimeContext';
import { Activity, AlertTriangle, CheckCircle2, Zap, Settings2, ShieldAlert } from 'lucide-react';
import { DeviceStatusDot } from './DeviceStatusDot';

interface PowerAnalyzerWidgetProps {
  config: WidgetConfig;
  onEdit?: () => void;
}

export const PowerAnalyzerWidget: React.FC<PowerAnalyzerWidgetProps> = ({ config, onEdit }) => {
  const { latestTelemetry, devices } = useRealtime();

  // State for metrics
  const [metrics, setMetrics] = useState({
    l1: 0,
    l2: 0,
    l3: 0,
    ri: 0,
    rc: 0,
    p: 0,
    pct_ri: -1,
    pct_rc: -1,
  });

  // Extract values from live telemetry or device metrics
  useEffect(() => {
    // Search for telemetry matching configured deviceId or overall
    const devTelemetry = latestTelemetry.filter(
      (t) => !config.deviceId || t.deviceId === config.deviceId
    );

    const getMetric = (keys: string[], prevVal: number, defaultVal: number) => {
      const found = devTelemetry.find((t) =>
        keys.some((k) => k.toLowerCase() === t.metric.toLowerCase())
      );
      if (found !== undefined) return found.value;

      // Fallback check in device metrics (Case-Insensitive)
      const dev = devices.find((d) => !config.deviceId || d.id === config.deviceId);
      if (dev && dev.metrics) {
        const metricKeys = Object.keys(dev.metrics);
        for (const k of keys) {
          const match = metricKeys.find((mk) => mk.toLowerCase() === k.toLowerCase());
          if (match && (dev.metrics as Record<string, number>)[match] !== undefined) {
            return Number((dev.metrics as Record<string, number>)[match]);
          }
        }
      }
      return prevVal >= 0 ? prevVal : defaultVal;
    };

    // Check live telemetry batch or device metrics for pct_ri/pct_rc; fallback to previous value to prevent resetting
    const getLivePctMetric = (keys: string[], prevVal: number) => {
      const found = devTelemetry.find((t) =>
        keys.some((k) => k.toLowerCase() === t.metric.toLowerCase())
      );
      if (found !== undefined) return found.value;

      // Fallback check in device metrics (Case-Insensitive)
      const dev = devices.find((d) => !config.deviceId || d.id === config.deviceId);
      if (dev && dev.metrics) {
        const metricKeys = Object.keys(dev.metrics);
        for (const k of keys) {
          const match = metricKeys.find((mk) => mk.toLowerCase() === k.toLowerCase());
          if (match && (dev.metrics as Record<string, number>)[match] !== undefined) {
            return Number((dev.metrics as Record<string, number>)[match]);
          }
        }
      }
      return prevVal >= 0 ? prevVal : -1;
    };

    setMetrics((prev) => {
      const mappings = config.metricMappings || {};
      return {
        l1: getMetric(mappings.l1 ? [mappings.l1] : ['l1', 'voltage_l1', 'v1', 'l1_voltage', 'phase1', 'voltage'], prev.l1, prev.l1),
        l2: getMetric(mappings.l2 ? [mappings.l2] : ['l2', 'voltage_l2', 'v2', 'l2_voltage', 'phase2'], prev.l2, prev.l2),
        l3: getMetric(mappings.l3 ? [mappings.l3] : ['l3', 'voltage_l3', 'v3', 'l3_voltage', 'phase3'], prev.l3, prev.l3),
        ri: getMetric(mappings.ri ? [mappings.ri] : ['ri', 'reactive_ind', 'reactive_inductive', 'ind_reactive', 'induktif', 'enduktif', 'ri_kvar'], prev.ri, prev.ri),
        rc: getMetric(mappings.rc ? [mappings.rc] : ['rc', 'reactive_cap', 'reactive_capacitive', 'cap_reactive', 'kapasitif', 'rc_kvar'], prev.rc, prev.rc),
        p: getMetric(mappings.p ? [mappings.p] : ['p', 'power', 'active_power', 'kw', 'power_kw'], prev.p, prev.p),
        pct_ri: getLivePctMetric(mappings.pct_ri ? [mappings.pct_ri] : ['pct_ri', 'percent_ri', 'percent_ind', 'yuzde_ri', 'ri_percent', 'ri_ratio', 'pct_ind'], prev.pct_ri),
        pct_rc: getLivePctMetric(mappings.pct_rc ? [mappings.pct_rc] : ['pct_rc', 'percent_rc', 'percent_cap', 'yuzde_rc', 'rc_percent', 'rc_ratio', 'pct_cap'], prev.pct_rc),
      };
    });
  }, [latestTelemetry, devices, config.deviceId, config.metricMappings]);

  // Meter baseline last index values from config
  const lastRi = config.lastRiIndex;
  const lastRc = config.lastRcIndex;
  const lastTp = config.lastTpIndex;

  // Consumption difference over time interval: current meter value - baseline last index value
  const diffP = lastTp !== undefined && !isNaN(lastTp) ? Math.max(0, metrics.p - lastTp) : undefined;
  const diffRi = lastRi !== undefined && !isNaN(lastRi) ? Math.max(0, metrics.ri - lastRi) : undefined;
  const diffRc = lastRc !== undefined && !isNaN(lastRc) ? Math.max(0, metrics.rc - lastRc) : undefined;

  // Calculations for penalty percentages (% Ri and % Rc)
  const isRiFromField = metrics.pct_ri >= 0;
  const isRcFromField = metrics.pct_rc >= 0;

  const rawPercentRi = isRiFromField
    ? metrics.pct_ri
    : (diffP !== undefined && diffRi !== undefined && diffP > 0)
    ? (diffRi / diffP) * 100
    : (metrics.p > 0 ? (metrics.ri / metrics.p) * 100 : 0);

  const rawPercentRc = isRcFromField
    ? metrics.pct_rc
    : (diffP !== undefined && diffRc !== undefined && diffP > 0)
    ? (diffRc / diffP) * 100
    : (metrics.p > 0 ? (metrics.rc / metrics.p) * 100 : 0);

  const percentRi = Number.isFinite(rawPercentRi) ? rawPercentRi : 0;
  const percentRc = Number.isFinite(rawPercentRc) ? rawPercentRc : 0;

  const limitRi = config.thresholdRi ?? 20;
  const limitRc = config.thresholdRc ?? 15;

  // Penalty thresholds based on configured limit thresholds
  const isRiPenalty = percentRi > limitRi;
  const isRcPenalty = percentRc > limitRc;
  const isRiWarning = percentRi >= (limitRi * 0.75) && percentRi <= limitRi;
  const isRcWarning = percentRc >= (limitRc * 0.75) && percentRc <= limitRc;

  const hasAnyPenalty = isRiPenalty || isRcPenalty;

  // Helper SVG gauge builder for clean semi-circle meters
  const renderGauge = (
    label: string,
    subLabel: string,
    valPercent: number,
    limitPercent: number,
    isPenalty: boolean,
    isWarning: boolean,
    colorScheme: 'amber' | 'rose' | 'emerald' | 'indigo'
  ) => {
    const strokeWidth = 12;
    const radius = 42;
    const circumference = Math.PI * radius; // Half circle = PI * r
    const clampedVal = Math.min(100, Math.max(0, valPercent));
    
    // Map value percentage (0% to 40% scale for realistic display)
    // 0% -> 0 fill, 40% -> 100% arc fill
    const displayFill = Math.min(100, (clampedVal / 40) * 100);
    const strokeDashoffset = circumference - (displayFill / 100) * circumference;

    const arcColor = isPenalty
      ? '#ef4444' // Red
      : isWarning
      ? '#f59e0b' // Amber
      : colorScheme === 'indigo'
      ? '#6366f1'
      : '#10b981'; // Green

    const bgClasses = isPenalty
      ? 'bg-rose-500/10 dark:bg-rose-500/15 border-rose-500/30'
      : isWarning
      ? 'bg-amber-500/10 dark:bg-amber-500/15 border-amber-500/30'
      : colorScheme === 'indigo'
      ? 'bg-indigo-500/5 dark:bg-indigo-500/10 border-indigo-500/20'
      : 'bg-cyan-500/5 dark:bg-cyan-500/10 border-cyan-500/20';

    return (
      <div className={`${bgClasses} p-3.5 rounded-2xl border flex flex-col items-center justify-between text-center relative overflow-hidden group transition-all`}>
        {/* Top gauge info */}
        <div className="w-full flex items-center justify-between text-[11px] font-bold mb-1">
          <span className="text-slate-800 dark:text-slate-200 flex items-center gap-1 font-mono">
            {label}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
              isPenalty
                ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 animate-pulse'
                : isWarning
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {isPenalty ? 'CEZA' : isWarning ? 'RİSK' : 'NORMAL'}
          </span>
        </div>

        {/* Semi-circle Gauge SVG */}
        <div className="relative my-1 flex items-center justify-center w-full max-w-[140px] aspect-[2/1]">
          <svg className="w-36 h-20" viewBox="0 0 100 55">
            {/* Background Arc */}
            <path
              d="M 10 50 A 40 40 0 0 1 90 50"
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              className="text-slate-200 dark:text-slate-800"
              strokeLinecap="round"
            />
            {/* Limit Marker Tick Line at limitPercent (mapped to scale) */}
            {(() => {
              const limitAngleRad = Math.PI * (1 - (limitPercent / 40));
              const x1 = 50 + 34 * Math.cos(limitAngleRad);
              const y1 = 50 - 34 * Math.sin(limitAngleRad);
              const x2 = 50 + 44 * Math.cos(limitAngleRad);
              const y2 = 50 - 44 * Math.sin(limitAngleRad);
              return (
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#ef4444"
                  strokeWidth="2.5"
                  strokeDasharray="2 1"
                />
              );
            })()}

            {/* Filled Arc */}
            <path
              d="M 10 50 A 40 40 0 0 1 90 50"
              fill="none"
              stroke={arcColor}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-700 ease-out"
            />
          </svg>

          {/* Centered Value overlay inside semi-circle */}
          <div className="absolute bottom-1 flex flex-col items-center justify-center text-center">
            <span
              className={`text-xl font-black font-mono leading-none ${
                isPenalty ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
              }`}
            >
              %{valPercent.toFixed(1)}
            </span>
            <span className="text-[9px] font-bold text-slate-400 mt-0.5">{subLabel}</span>
          </div>
        </div>

        {/* Footer limit indicator */}
        <div className="w-full flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 border-t border-slate-200/60 dark:border-slate-800/80 pt-1.5 mt-1">
          <span>Limit: %0</span>
          <span className="font-extrabold text-rose-500">Yasal Limit: %{limitPercent}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full bg-white dark:bg-[#0f172a] rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xl hover:shadow-2xl transition-all flex flex-col justify-between space-y-4">
      {/* Widget Header */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-inner">
            <Zap className="w-5 h-5 text-amber-500" />
          </div>
          <DeviceStatusDot deviceId={config.deviceId} />
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {config.title || 'Elektrik Sayacı & Reaktif Ceza Analizörü'}
              </h3>
            </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Edit button if provided */}
          {onEdit && (
            <button
              onClick={onEdit}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Widget Ayarları"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* SECTION 1: TOP 2x3 GRID - 6 METRIC LABELS / BOXES (L1, L2, L3, Ri, Rc, P) */}
      <div className="grid grid-cols-3 gap-2.5">
        {/* Box 1: L1 Voltage */}
        <div className="bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-2xl flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between text-[11px] font-bold text-amber-700 dark:text-amber-400 gap-1 min-w-0">
            <span className="shrink-0 font-mono">L1</span>
            <span className="text-[9px] font-normal text-amber-600/70 dark:text-amber-400/70 truncate">Faz 1 Gerilimi</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between min-w-0">
            <span className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-white truncate">
              {Number.isFinite(metrics.l1) ? metrics.l1.toFixed(1) : '0.0'}
            </span>
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 font-mono shrink-0 ml-1">V</span>
          </div>
        </div>

        {/* Box 2: L2 Voltage */}
        <div className="bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-2xl flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between text-[11px] font-bold text-emerald-700 dark:text-emerald-400 gap-1 min-w-0">
            <span className="shrink-0 font-mono">L2</span>
            <span className="text-[9px] font-normal text-emerald-600/70 dark:text-emerald-400/70 truncate">Faz 2 Gerilimi</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between min-w-0">
            <span className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-white truncate">
              {Number.isFinite(metrics.l2) ? metrics.l2.toFixed(1) : '0.0'}
            </span>
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 font-mono shrink-0 ml-1">V</span>
          </div>
        </div>

        {/* Box 3: L3 Voltage */}
        <div className="bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-2xl flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between text-[11px] font-bold text-rose-700 dark:text-rose-400 gap-1 min-w-0">
            <span className="shrink-0 font-mono">L3</span>
            <span className="text-[9px] font-normal text-rose-600/70 dark:text-rose-400/70 truncate">Faz 3 Gerilimi</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between min-w-0">
            <span className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-white truncate">
              {Number.isFinite(metrics.l3) ? metrics.l3.toFixed(1) : '0.0'}
            </span>
            <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 font-mono shrink-0 ml-1">V</span>
          </div>
        </div>

        {/* Box 4: Ri (Endüktif Reaktif Güç) */}
        <div className="bg-purple-500/5 dark:bg-purple-500/10 border border-purple-500/20 p-2.5 rounded-2xl flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between text-[11px] font-bold text-purple-700 dark:text-purple-400 gap-1 min-w-0">
            <span className="shrink-0 font-mono">Ri</span>
            <span className="text-[9px] font-normal text-purple-600/70 dark:text-purple-400/70 truncate">Endüktif Reaktif</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between min-w-0">
            <span className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-white truncate">
              {Number.isFinite(metrics.ri) ? metrics.ri.toFixed(2) : '0.00'}
            </span>
            <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 font-mono shrink-0 ml-1">kVAr</span>
          </div>
        </div>

        {/* Box 5: Rc (Kapasitif Reaktif Güç) */}
        <div className="bg-cyan-500/5 dark:bg-cyan-500/10 border border-cyan-500/20 p-2.5 rounded-2xl flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between text-[11px] font-bold text-cyan-700 dark:text-cyan-400 gap-1 min-w-0">
            <span className="shrink-0 font-mono">Rc</span>
            <span className="text-[9px] font-normal text-cyan-600/70 dark:text-cyan-400/70 truncate">Kapasitif Reaktif</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between min-w-0">
            <span className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-white truncate">
              {Number.isFinite(metrics.rc) ? metrics.rc.toFixed(2) : '0.00'}
            </span>
            <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 font-mono shrink-0 ml-1">kVAr</span>
          </div>
        </div>

        {/* Box 6: P (Aktif Güç) */}
        <div className="bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/20 p-2.5 rounded-2xl flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between text-[11px] font-bold text-indigo-700 dark:text-indigo-400 gap-1 min-w-0">
            <span className="shrink-0 font-mono">P</span>
            <span className="text-[9px] font-normal text-indigo-600/70 dark:text-indigo-400/70 truncate">Aktif Güç</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between min-w-0">
            <span className="text-base sm:text-lg font-black font-mono text-indigo-600 dark:text-indigo-400 truncate">
              {Number.isFinite(metrics.p) ? metrics.p.toFixed(2) : '0.00'}
            </span>
            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 font-mono shrink-0 ml-1">kW</span>
          </div>
        </div>
      </div>



      {/* SECTION 2: BOTTOM 2 GAUGES SIDE-BY-SIDE (% Ri and % Rc) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Gauge 1: % Ri (Endüktif Reaktif Ceza Oranı) */}
        {renderGauge(
          '% Ri',
          'Endüktif Ceza Oranı',
          percentRi,
          limitRi,
          isRiPenalty,
          isRiWarning,
          'indigo'
        )}

        {/* Gauge 2: % Rc (Kapasitif Reaktif Ceza Oranı) */}
        {renderGauge(
          '% Rc',
          'Kapasitif Ceza Oranı',
          percentRc,
          limitRc,
          isRcPenalty,
          isRcWarning,
          'amber'
        )}
      </div>

      {/* Status Alert Banner Footer - Fixed height & structure to prevent any widget height changes */}
      <div
        className={`h-8 px-2.5 rounded-xl border flex items-center justify-between text-[11px] font-semibold shrink-0 min-w-0 transition-colors ${
          hasAnyPenalty
            ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
            : isRiWarning || isRcWarning
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0 truncate pr-2">
          {hasAnyPenalty ? (
            <ShieldAlert className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          ) : isRiWarning || isRcWarning ? (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          )}
          <span className="truncate">
            {hasAnyPenalty
              ? `Reaktif Ceza Sınırı Aşıldı! (${isRiPenalty && isRcPenalty ? 'Ri & Rc' : isRiPenalty ? 'Endüktif %20' : 'Kapasitif %15'})`
              : isRiWarning || isRcWarning
              ? 'Reaktif değerler ceza sınırına yakın.'
              : 'Kompanzasyon durumu normal.'}
          </span>
        </div>

        <span
          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold shrink-0 uppercase ${
            hasAnyPenalty
              ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30'
              : isRiWarning || isRcWarning
              ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30'
              : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
          }`}
        >
          {hasAnyPenalty ? 'CEZA' : isRiWarning || isRcWarning ? 'RİSK' : 'NORMAL'}
        </span>
      </div>
    </div>
  );
};
