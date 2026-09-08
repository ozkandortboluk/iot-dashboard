import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRealtime } from '../../context/RealtimeContext';
import type { Device } from '../../types';
import { calculateWidgetFreshness } from '../../lib/widgetFreshness';
import { Clock, Wifi, AlertTriangle, CheckCircle2, XCircle, HelpCircle, Activity } from 'lucide-react';

export interface DeviceStatusDotProps {
  deviceId?: string;
  device?: Device | null;
  metricKey?: string;
  className?: string;
  showLabel?: boolean;
}

export const DeviceStatusDot: React.FC<DeviceStatusDotProps> = ({
  deviceId,
  device,
  metricKey,
  className = '',
  showLabel = false,
}) => {
  const { devices, latestTelemetry } = useRealtime();
  const [isHovered, setIsHovered] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; showAbove: boolean } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1-second interval ticker so freshness status and elapsed seconds update live in real-time
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((prev) => (prev + 1) % 10000);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const freshness = calculateWidgetFreshness({
    deviceId,
    device,
    metricKey,
    devices,
    telemetry: latestTelemetry,
  });

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 260;
    const tooltipHeight = 160;
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceBelow < tooltipHeight && rect.top > tooltipHeight;

    const top = showAbove ? rect.top - 6 : rect.bottom + 6;
    const left = Math.max(12, Math.min(window.innerWidth - tooltipWidth - 12, rect.left + rect.width / 2 - tooltipWidth / 2));

    setCoords({ top, left, showAbove });
  };

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    updatePosition();
    hoverTimeoutRef.current = setTimeout(() => {
      updatePosition();
      setIsHovered(true);
    }, 100);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setIsHovered(false);
  };

  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    updatePosition();
    setIsHovered((prev) => !prev);
  };

  const renderStatusIcon = () => {
    switch (freshness.status) {
      case 'live':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
      case 'delayed':
        return <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
      case 'stale':
        return <AlertTriangle className="w-3.5 h-3.5 text-orange-500 shrink-0" />;
      case 'offline':
        return <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />;
      case 'no_data':
      default:
        return <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
    }
  };

  return (
    <div
      ref={triggerRef}
      className={`relative inline-flex items-center gap-1.5 shrink-0 select-none ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleToggleClick}
      title={freshness.tooltip}
    >
      {/* Visual Dot */}
      <span className="relative flex h-2.5 w-2.5 items-center justify-center cursor-help">
        {freshness.status === 'live' && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${freshness.pingColorClass} opacity-75 animate-ping`}
          />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${freshness.dotColorClass} shadow-xs`}
        />
      </span>

      {/* Optional Compact Label */}
      {showLabel && (
        <span
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${freshness.badgeBgClass}`}
        >
          {freshness.label}
        </span>
      )}

      {/* Portal Tooltip: Immune to overflow-hidden on widget cards */}
      {isHovered && coords && typeof document !== 'undefined' && createPortal(
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            transform: coords.showAbove ? 'translateY(-100%)' : 'none',
            zIndex: 99999,
          }}
          className="w-64 p-3 rounded-2xl bg-slate-900/95 dark:bg-slate-950/95 text-white border border-slate-700/80 shadow-2xl backdrop-blur-md text-left text-[11px] pointer-events-none animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800">
            <div className="flex items-center gap-1.5">
              {renderStatusIcon()}
              <span className="font-bold text-slate-100">
                {freshness.icon} {freshness.label}
              </span>
            </div>
            <span
              className={`text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-md ${freshness.badgeBgClass}`}
            >
              {freshness.status.replace('_', ' ')}
            </span>
          </div>

          {/* Description */}
          <p className="text-slate-300 text-[10.5px] leading-relaxed mb-2">
            {freshness.description}
          </p>

          {/* Detailed Metadata Grid */}
          <div className="space-y-1 pt-1 border-t border-slate-800/80 text-[10px] text-slate-400">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Wifi className="w-3 h-3 text-slate-500" /> Cihaz:
              </span>
              <span className="font-medium text-slate-200 truncate max-w-[130px]" title={freshness.deviceName}>
                {freshness.deviceName}
              </span>
            </div>

            {/* Metric Flow Status */}
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3 text-slate-500" /> Metrik Akışı:
              </span>
              <span
                className={`font-semibold ${
                  freshness.metricFlowStatus === 'active'
                    ? 'text-emerald-400'
                    : freshness.metricFlowStatus === 'delayed'
                    ? 'text-amber-400'
                    : freshness.metricFlowStatus === 'stalled'
                    ? 'text-orange-400'
                    : 'text-rose-400'
                }`}
              >
                {freshness.metricFlowStatus === 'active'
                  ? `Alınıyor (${freshness.metricCount > 0 ? `${freshness.metricCount} Metrik` : 'Aktif'})`
                  : freshness.metricFlowStatus === 'delayed'
                  ? 'Gecikmeli'
                  : freshness.metricFlowStatus === 'stalled'
                  ? 'Duraksadı'
                  : 'Alınmıyor'}
              </span>
            </div>

            {/* List of active metrics received from device if available */}
            {freshness.availableMetrics.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-[9.5px]">Alınan Metrikler:</span>
                <span
                  className="text-slate-300 font-mono text-[9.5px] truncate max-w-[130px]"
                  title={freshness.availableMetrics.join(', ')}
                >
                  {freshness.availableMetrics.slice(0, 3).join(', ')}
                  {freshness.availableMetrics.length > 3 ? '...' : ''}
                </span>
              </div>
            )}

            {metricKey && (
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[9.5px]">Widget Odağı:</span>
                <span className="font-medium text-indigo-300 font-mono text-[9.5px]">
                  {metricKey}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-500" /> Son Metrik:
              </span>
              <span className="font-medium text-slate-200">
                {freshness.lastSeenText}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span>Beklenen Sıklık:</span>
              <span className="font-medium text-slate-200">
                ~{freshness.expectedIntervalSeconds} sn
              </span>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default DeviceStatusDot;
