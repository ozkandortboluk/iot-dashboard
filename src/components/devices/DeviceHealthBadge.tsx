import React from 'react';
import type { DeviceHealthSummary, DeviceStatus } from '../../types';
import { Activity, ShieldAlert, CheckCircle2, AlertTriangle, XCircle, Wrench } from 'lucide-react';

interface DeviceHealthBadgeProps {
  summary?: DeviceHealthSummary | null;
  status: DeviceStatus;
  maintenanceMode?: boolean;
  score?: number;
  className?: string;
  showDetails?: boolean;
}

export const DeviceHealthBadge: React.FC<DeviceHealthBadgeProps> = ({
  summary,
  status,
  maintenanceMode,
  score,
  className = '',
  showDetails = false,
}) => {
  const healthScore = summary ? summary.healthScore : (score !== undefined ? score : (status === 'online' ? 95 : (status === 'warning' ? 65 : 20)));
  const isMaintenance = summary?.maintenanceMode ?? maintenanceMode;

  const getScoreColor = (sc: number) => {
    if (sc >= 85) return 'text-emerald-400 bg-emerald-950/40 border-emerald-800/60';
    if (sc >= 60) return 'text-amber-400 bg-amber-950/40 border-amber-800/60';
    return 'text-rose-400 bg-rose-950/40 border-rose-800/60';
  };

  const getScoreProgressColor = (sc: number) => {
    if (sc >= 85) return 'bg-emerald-500';
    if (sc >= 60) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const getFreshnessLabel = (freshness?: string) => {
    switch (freshness) {
      case 'live':
        return { label: 'Canlı (Akıcı)', color: 'text-emerald-400' };
      case 'fresh':
        return { label: 'Güncel', color: 'text-teal-400' };
      case 'stale':
        return { label: 'Gecikmeli', color: 'text-amber-400' };
      default:
        return { label: 'Sinyal Yok', color: 'text-rose-400' };
    }
  };

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {isMaintenance && (
        <span
          id="badge-maintenance-mode"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse"
          title="Cihaz bakım modunda - Alarmlar susturuldu"
        >
          <Wrench className="w-3 h-3" />
          Bakım Modu
        </span>
      )}

      <div
        id="device-health-score-badge"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${getScoreColor(healthScore)}`}
        title={`Sağlık Skoru: ${healthScore}/100`}
      >
        <Activity className="w-3.5 h-3.5" />
        <span>%{healthScore}</span>
        {healthScore >= 85 ? (
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
        ) : healthScore >= 60 ? (
          <AlertTriangle className="w-3 h-3 text-amber-400" />
        ) : (
          <XCircle className="w-3 h-3 text-rose-400" />
        )}
      </div>

      {showDetails && summary && (
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-1">
            <span className="text-slate-500">Tazelik:</span>
            <span className={getFreshnessLabel(summary.dataFreshness).color}>
              {getFreshnessLabel(summary.dataFreshness).label}
            </span>
          </div>

          {summary.activeAlarmsCount > 0 && (
            <div className="flex items-center gap-1 text-rose-400">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{summary.activeAlarmsCount} Aktif Alarm</span>
            </div>
          )}

          {summary.latencyMs !== undefined && (
            <div className="flex items-center gap-1 text-slate-400">
              <span>{summary.latencyMs}ms</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
