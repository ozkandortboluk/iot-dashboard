import React, { useState, useMemo } from 'react';
import type { Device } from '../types';
import { Activity, CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react';

interface DeviceStabilitySparklineProps {
  device: Device;
  className?: string;
  compact?: boolean;
}

export interface StabilityPoint {
  hourOffset: number; // -23 to 0
  label: string; // e.g. "23s önce", "Şimdi"
  timeStr: string; // e.g. "14:00"
  stability: number; // 0 - 100 (%)
  pingMs: number;
  packetSuccess: number; // 0 - 100 (%)
  status: 'online' | 'offline' | 'warning' | 'maintenance';
}

/**
 * Deterministic pseudo-random generator from device ID & seed
 */
function seededRandom(seedStr: string, offset: number): number {
  let hash = 0;
  const combined = `${seedStr}_${offset}`;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0;
  }
  const x = Math.sin(hash) * 10000;
  return x - Math.floor(x);
}

/**
 * Computes 24 hourly stability data points for a device
 */
export function generate24hStabilityData(device: Device): {
  points: StabilityPoint[];
  avgStability: number;
  statusCategory: 'excellent' | 'good' | 'fair' | 'poor';
} {
  const now = new Date();
  const currentStatus = device.status || 'offline';
  const isOnline = currentStatus === 'online' && device.dataFlowActive !== false;
  const isWarning = currentStatus === 'warning';
  const isOffline = currentStatus === 'offline' || device.dataFlowActive === false;

  const basePing = device.pingMs && device.pingMs > 0 ? device.pingMs : 24;

  const points: StabilityPoint[] = [];

  for (let h = 23; h >= 0; h--) {
    const pointTime = new Date(now.getTime() - h * 60 * 60 * 1000);
    const hourStr = pointTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const label = h === 0 ? 'Şimdi' : `${h}s önce`;

    const r1 = seededRandom(device.id, h * 7 + 1);
    const r2 = seededRandom(device.id, h * 13 + 3);

    let stability = 100;
    let ping = basePing;
    let status: 'online' | 'offline' | 'warning' | 'maintenance' = 'online';

    if (isOnline) {
      if (h === 0) {
        stability = 100;
        ping = Math.round(basePing + (r1 * 4 - 2));
        status = 'online';
      } else {
        // High stability with slight natural fluctuations
        const dipProbability = device.isSimulated ? 0.05 : 0.12;
        if (r1 < dipProbability) {
          // minor jitter
          stability = Math.round(92 + r2 * 6);
          ping = Math.round(basePing * (1.2 + r2 * 0.4));
          status = 'online';
        } else {
          stability = Math.round(98 + r2 * 2);
          ping = Math.round(basePing + (r2 * 6 - 3));
          status = 'online';
        }
      }
    } else if (isWarning) {
      // Fluctuating stability
      stability = Math.round(65 + r1 * 25);
      ping = Math.round(basePing * (1.8 + r2 * 1.5));
      status = 'warning';
    } else if (isOffline) {
      // If offline now, determine when it dropped
      // e.g. offline in recent hours
      const offlineHours = Math.min(12, Math.max(2, Math.floor(r1 * 10) + 1));
      if (h < offlineHours) {
        stability = 0;
        ping = 0;
        status = 'offline';
      } else {
        // Was online previously
        stability = Math.round(94 + r2 * 5);
        ping = Math.round(basePing + r2 * 8);
        status = 'online';
      }
    } else {
      // Maintenance or other
      stability = Math.round(80 + r1 * 15);
      ping = Math.round(basePing * 1.3);
      status = 'maintenance';
    }

    stability = Math.max(0, Math.min(100, stability));
    const packetSuccess = stability > 0 ? Math.min(100, Math.round(stability * 0.99 + 1)) : 0;

    points.push({
      hourOffset: -h,
      label,
      timeStr: hourStr,
      stability,
      pingMs: Math.max(0, ping),
      packetSuccess,
      status,
    });
  }

  const sum = points.reduce((acc, p) => acc + p.stability, 0);
  const avgStability = Math.round((sum / points.length) * 10) / 10;

  let statusCategory: 'excellent' | 'good' | 'fair' | 'poor' = 'excellent';
  if (avgStability >= 98) statusCategory = 'excellent';
  else if (avgStability >= 90) statusCategory = 'good';
  else if (avgStability >= 70) statusCategory = 'fair';
  else statusCategory = 'poor';

  return { points, avgStability, statusCategory };
}

export const DeviceStabilitySparkline: React.FC<DeviceStabilitySparklineProps> = ({
  device,
  className = '',
  compact = false,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const { points, avgStability, statusCategory } = useMemo(() => {
    return generate24hStabilityData(device);
  }, [device.id, device.status, device.dataFlowActive, device.pingMs, device.isSimulated]);

  // SVG dimensions
  const width = compact ? 100 : 130;
  const height = compact ? 26 : 30;
  const padX = 3;
  const padY = 4;
  const usableWidth = width - padX * 2;
  const usableHeight = height - padY * 2;

  // Color schemes
  const colorTheme = useMemo(() => {
    if (statusCategory === 'excellent') {
      return {
        stroke: '#10b981', // emerald-500
        fillTop: '#10b981',
        fillBottom: '#10b98100',
        badgeBg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
        badgeText: 'text-emerald-700 dark:text-emerald-400',
        badgeBorder: 'border-emerald-500/30',
        dot: 'bg-emerald-500',
        label: 'Mükemmel',
      };
    }
    if (statusCategory === 'good') {
      return {
        stroke: '#06b6d4', // cyan-500
        fillTop: '#06b6d4',
        fillBottom: '#06b6d400',
        badgeBg: 'bg-cyan-500/10 dark:bg-cyan-500/15',
        badgeText: 'text-cyan-700 dark:text-cyan-400',
        badgeBorder: 'border-cyan-500/30',
        dot: 'bg-cyan-500',
        label: 'İyi',
      };
    }
    if (statusCategory === 'fair') {
      return {
        stroke: '#f59e0b', // amber-500
        fillTop: '#f59e0b',
        fillBottom: '#f59e0b00',
        badgeBg: 'bg-amber-500/10 dark:bg-amber-500/15',
        badgeText: 'text-amber-700 dark:text-amber-400',
        badgeBorder: 'border-amber-500/30',
        dot: 'bg-amber-500',
        label: 'Dalgalı',
      };
    }
    return {
      stroke: '#f43f5e', // rose-500
      fillTop: '#f43f5e',
      fillBottom: '#f43f5e00',
      badgeBg: 'bg-rose-500/10 dark:bg-rose-500/15',
      badgeText: 'text-rose-700 dark:text-rose-400',
      badgeBorder: 'border-rose-500/30',
      dot: 'bg-rose-500',
      label: 'Kritik / Kesintili',
    };
  }, [statusCategory]);

  // Generate SVG path points
  const svgPoints = useMemo(() => {
    return points.map((p, idx) => {
      const x = padX + (idx / (points.length - 1)) * usableWidth;
      // 100% -> padY (top), 0% -> height - padY (bottom)
      const normVal = p.stability / 100;
      const y = padY + (1 - normVal) * usableHeight;
      return { x, y, point: p };
    });
  }, [points, usableWidth, usableHeight, padX, padY]);

  // Smooth Bezier Curve generator
  const { linePath, areaPath } = useMemo(() => {
    if (svgPoints.length === 0) return { linePath: '', areaPath: '' };

    let d = `M ${svgPoints[0].x.toFixed(1)},${svgPoints[0].y.toFixed(1)}`;

    for (let i = 0; i < svgPoints.length - 1; i++) {
      const p0 = i > 0 ? svgPoints[i - 1] : svgPoints[i];
      const p1 = svgPoints[i];
      const p2 = svgPoints[i + 1];
      const p3 = i < svgPoints.length - 2 ? svgPoints[i + 2] : p2;

      // Catmull-Rom to Cubic Bezier conversion
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }

    const last = svgPoints[svgPoints.length - 1];
    const first = svgPoints[0];
    const bottomY = height;
    const a = `${d} L ${last.x.toFixed(1)},${bottomY} L ${first.x.toFixed(1)},${bottomY} Z`;

    return { linePath: d, areaPath: a };
  }, [svgPoints, height]);

  const gradientId = `sparkline-grad-${device.id.replace(/[^a-zA-Z0-9]/g, '_')}`;

  const hoveredPoint = hoveredIndex !== null && svgPoints[hoveredIndex] ? svgPoints[hoveredIndex] : null;
  const latestPoint = svgPoints[svgPoints.length - 1];

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const clampedX = Math.max(padX, Math.min(width - padX, mouseX));
    const ratio = (clampedX - padX) / usableWidth;
    const index = Math.round(ratio * (points.length - 1));
    const safeIndex = Math.max(0, Math.min(points.length - 1, index));
    setHoveredIndex(safeIndex);
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
  };

  return (
    <div
      className={`relative group flex items-center gap-2.5 p-1.5 sm:p-2 rounded-2xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 transition-all hover:border-indigo-400/50 hover:shadow-xs ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Sparkline Canvas & Indicator */}
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-1.5 text-[9px] font-semibold text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1 font-mono uppercase tracking-wider text-[8px] text-slate-400 dark:text-slate-400">
            <Activity className="w-2.5 h-2.5 text-indigo-500 shrink-0" />
            <span>24s Kararlılık</span>
          </span>
          <span className={`font-mono font-bold text-[10px] ${colorTheme.badgeText}`}>
            %{avgStability}
          </span>
        </div>

        {/* SVG Sparkline Container */}
        <div className="relative">
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="overflow-visible cursor-crosshair block"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colorTheme.fillTop} stopOpacity={0.35} />
                <stop offset="85%" stopColor={colorTheme.fillTop} stopOpacity={0.05} />
                <stop offset="100%" stopColor={colorTheme.fillBottom} stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* Subtle reference grid lines */}
            <line
              x1={padX}
              y1={padY}
              x2={width - padX}
              y2={padY}
              stroke="currentColor"
              strokeDasharray="2,2"
              className="text-slate-200 dark:text-slate-800"
              strokeWidth="0.8"
            />
            <line
              x1={padX}
              y1={height - padY}
              x2={width - padX}
              y2={height - padY}
              stroke="currentColor"
              strokeDasharray="2,2"
              className="text-slate-200 dark:text-slate-800"
              strokeWidth="0.8"
            />

            {/* Area Fill */}
            <path d={areaPath} fill={`url(#${gradientId})`} />

            {/* Line Path */}
            <path
              d={linePath}
              fill="none"
              stroke={colorTheme.stroke}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Pulsing dot on latest (current) point */}
            {latestPoint && hoveredIndex === null && (
              <g>
                <circle
                  cx={latestPoint.x}
                  cy={latestPoint.y}
                  r={4}
                  fill={colorTheme.stroke}
                  className="animate-ping opacity-60"
                />
                <circle
                  cx={latestPoint.x}
                  cy={latestPoint.y}
                  r={2.5}
                  fill="#ffffff"
                  stroke={colorTheme.stroke}
                  strokeWidth={1.5}
                />
              </g>
            )}

            {/* Active Hover Crosshair & Point */}
            {hoveredPoint && (
              <g>
                {/* Vertical guide line */}
                <line
                  x1={hoveredPoint.x}
                  y1={0}
                  x2={hoveredPoint.x}
                  y2={height}
                  stroke="#6366f1"
                  strokeWidth={1}
                  strokeDasharray="2,2"
                  className="opacity-70"
                />
                {/* Hover circle */}
                <circle
                  cx={hoveredPoint.x}
                  cy={hoveredPoint.y}
                  r={4.5}
                  fill={colorTheme.stroke}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  className="shadow-md"
                />
              </g>
            )}
          </svg>

          {/* Time range labels under sparkline */}
          <div className="flex items-center justify-between text-[8px] font-mono text-slate-400 dark:text-slate-400 px-0.5 mt-0.5">
            <span>-24s</span>
            <span>-12s</span>
            <span className={latestPoint ? 'text-indigo-500 font-semibold' : ''}>Şimdi</span>
          </div>
        </div>
      </div>

      {/* Stability Badge & Status Tag */}
      <div className="hidden md:flex flex-col items-end justify-center pl-1 border-l border-slate-200/80 dark:border-slate-800 shrink-0">
        <span
          className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold border flex items-center gap-1 ${colorTheme.badgeBg} ${colorTheme.badgeText} ${colorTheme.badgeBorder}`}
          title={`24 Saatlik Ortalama Bağlantı Kararlılığı: %${avgStability}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${colorTheme.dot}`} />
          <span>{colorTheme.label}</span>
        </span>
        <span className="text-[8px] text-slate-400 dark:text-slate-400 mt-0.5 font-mono">
          {device.pingMs && device.pingMs > 0 ? `${device.pingMs}ms` : 'Saha Hazır'}
        </span>
      </div>

      {/* Floating Detailed Hover Popover/Tooltip */}
      {hoveredPoint && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50 pointer-events-none w-48 bg-slate-900/95 text-white dark:bg-slate-950/95 backdrop-blur-md rounded-xl p-2.5 shadow-2xl border border-slate-700/80 text-[10px] space-y-1.5 transition-all">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1">
            <span className="font-bold text-slate-300 flex items-center gap-1">
              <Clock className="w-3 h-3 text-indigo-400" />
              <span>{hoveredPoint.point.label} ({hoveredPoint.point.timeStr})</span>
            </span>
            <span
              className={`px-1.5 py-0.2 rounded text-[8px] font-bold ${
                hoveredPoint.point.status === 'online'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : hoveredPoint.point.status === 'warning'
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-rose-500/20 text-rose-300'
              }`}
            >
              {hoveredPoint.point.status === 'online'
                ? 'Çevrimiçi'
                : hoveredPoint.point.status === 'warning'
                ? 'Uyarı'
                : 'Çevrimdışı'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 font-mono text-[9px]">
            <div className="bg-slate-800/60 p-1 rounded-lg">
              <span className="text-slate-400 block text-[8px]">Kararlılık</span>
              <strong className={colorTheme.badgeText}>%{hoveredPoint.point.stability}</strong>
            </div>
            <div className="bg-slate-800/60 p-1 rounded-lg">
              <span className="text-slate-400 block text-[8px]">Gecikme (Ping)</span>
              <strong className="text-cyan-300">
                {hoveredPoint.point.pingMs > 0 ? `${hoveredPoint.point.pingMs} ms` : 'N/A'}
              </strong>
            </div>
          </div>

          <div className="text-[8px] text-slate-400 flex items-center justify-between pt-0.5">
            <span>Paket Başarısı: <strong className="text-slate-200">%{hoveredPoint.point.packetSuccess}</strong></span>
            <span>24s Ort: <strong className="text-indigo-300">%{avgStability}</strong></span>
          </div>

          {/* Tiny arrow pointing down */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900/95" />
        </div>
      )}
    </div>
  );
};
