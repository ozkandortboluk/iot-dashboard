import React from 'react';
import type { WidgetConfig } from '../../types';
import { useRealtime } from '../../context/RealtimeContext';
import { formatShortTime } from '../../lib/utils';
import { Bell, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { DeviceStatusDot } from './DeviceStatusDot';

interface NotificationsWidgetProps {
  config: WidgetConfig;
}

export const NotificationsWidget: React.FC<NotificationsWidgetProps> = ({ config }) => {
  const { notifications, markNotificationRead } = useRealtime();

  return (
    <div className="h-full bg-white dark:bg-[#0f172a] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xl hover:shadow-2xl transition-all flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-pink-500/10 text-pink-400 border border-pink-500/20">
            <Bell className="w-4 h-4 text-pink-400" />
          </div>
          <DeviceStatusDot deviceId={config.deviceId} />
          <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {config.title}
          </h3>
        </div>
        <span className="text-[11px] font-semibold text-pink-400 bg-pink-500/10 border border-pink-500/20 px-2.5 py-0.5 rounded-full">
          {notifications.length} Bildirim
        </span>
      </div>

      <div className="space-y-2 overflow-y-auto max-h-56 pr-1">
        {notifications.length === 0 ? (
          <div className="text-center text-xs text-slate-400 py-6">Bildirim bulunmuyor.</div>
        ) : (
          notifications.slice(0, 6).map((n, idx) => (
            <div
              key={`${n.id}_${idx}`}
              onClick={() => markNotificationRead(n.id)}
              className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-colors flex items-start gap-2.5 ${
                !n.read
                  ? 'bg-pink-50/50 dark:bg-pink-900/10 border-pink-200 dark:border-pink-800/40'
                  : 'bg-slate-50 dark:bg-slate-700/30 border-slate-100 dark:border-slate-700'
              }`}
            >
              {n.severity === 'critical' ? (
                <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              ) : n.severity === 'warning' ? (
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">{n.title}</p>
                  <span className="text-[10px] text-slate-400 shrink-0">{formatShortTime(n.timestamp)}</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-1">
                  {n.message}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
