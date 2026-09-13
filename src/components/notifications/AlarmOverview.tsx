import React from 'react';
import {
  AlertTriangle,
  Flame,
  CheckCircle2,
  Bell,
  Clock,
  ShieldCheck,
  Plus,
  SendHorizontal,
} from 'lucide-react';
import type { ActiveAlarm, ThresholdRule, NotificationQueueItem } from '../../types';

interface AlarmOverviewProps {
  activeAlarms: ActiveAlarm[];
  rules: ThresholdRule[];
  queueItems: NotificationQueueItem[];
  notificationsCount?: number;
  unreadNotificationsCount?: number;
  onOpenNewRule: () => void;
  onNavigateToTab?: (tab: 'notifications' | 'alarms_rules' | 'dispatch_queue' | 'delivery_logs' | 'channel_settings') => void;
}

export const AlarmOverview: React.FC<AlarmOverviewProps> = ({
  activeAlarms,
  rules,
  queueItems,
  notificationsCount = 0,
  unreadNotificationsCount = 0,
  onOpenNewRule,
  onNavigateToTab,
}) => {
  const criticalCount = activeAlarms.filter((a) => a.severity === 'critical' && a.state === 'ACTIVE').length;
  const warningCount = activeAlarms.filter((a) => a.severity === 'warning' && a.state === 'ACTIVE').length;
  const acknowledgedCount = activeAlarms.filter((a) => a.acknowledged || a.state === 'SILENCED').length;
  const activeRulesCount = rules.filter((r) => r.enabled).length;
  const pendingQueueCount = queueItems.filter((q) => q.status === 'pending' || q.status === 'retrying').length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
      {/* 1. Gelen Bildirimler */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-indigo-500" />
              Gelen Bildirimler
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
              {notificationsCount}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Bell className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
          <span>{unreadNotificationsCount > 0 ? `${unreadNotificationsCount} okunmamış` : 'Tümü okundu'}</span>
          {onNavigateToTab && (
            <button
              type="button"
              onClick={() => onNavigateToTab('notifications')}
              className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
            >
              Listeyi Gör &rarr;
            </button>
          )}
        </div>
      </div>
      {/* 1. Kritik Alarmlar */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
              Kritik Alarmlar
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
              {criticalCount}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400">
            <Flame className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
          <span>{warningCount} adet uyarı seviyesi</span>
          {criticalCount > 0 ? (
            <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              Müdahale Gerekli
            </span>
          ) : (
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">Sistem Normal</span>
          )}
        </div>
      </div>

      {/* 2. Onaylanan & Susturulan */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              Onaylanan & Susturulan
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
              {acknowledgedCount}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
          <span>Operatör gözetiminde</span>
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {activeAlarms.length} Toplam Alarm
          </span>
        </div>
      </div>

      {/* 3. Aktif Eşik Kuralları */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-indigo-500" />
              İzleme Kuralları
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
              {activeRulesCount} <span className="text-sm font-normal text-slate-400">/ {rules.length}</span>
            </div>
          </div>
          <button
            onClick={onOpenNewRule}
            className="w-10 h-10 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 transition-colors cursor-pointer"
            title="Yeni Kural Ekle"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
          <span>7/24 Telemetri Analizi</span>
          <span className="text-indigo-600 dark:text-indigo-400 font-semibold cursor-pointer" onClick={onOpenNewRule}>
            + Yeni Kural
          </span>
        </div>
      </div>

      {/* 4. Bildirim Gönderim Kuyruğu */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <SendHorizontal className="w-3.5 h-3.5 text-emerald-500" />
              Gönderim Durumu
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
              {pendingQueueCount > 0 ? `${pendingQueueCount} Kuyrukta` : 'Kuyruk Boş'}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
          <span>WhatsApp / E-posta / Bot</span>
          {onNavigateToTab && (
            <button
              onClick={() => onNavigateToTab('dispatch_queue')}
              className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline cursor-pointer"
            >
              Kuyruğu Gör &rarr;
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
