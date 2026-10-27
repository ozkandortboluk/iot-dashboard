import React, { useState } from 'react';
import type { SystemEvent } from '../../types';
import {
  X,
  Copy,
  Check,
  Terminal,
  AlertTriangle,
  AlertOctagon,
  Info,
  ShieldAlert,
  Globe,
  Calendar,
  Server,
  User,
  Code,
  FileText,
  Activity,
} from 'lucide-react';
import { formatDateTime } from '../../lib/utils';

interface SystemLogDetailModalProps {
  event: SystemEvent | null;
  onClose: () => void;
}

export const SystemLogDetailModal: React.FC<SystemLogDetailModalProps> = ({ event, onClose }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!event) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'critical':
        return {
          bg: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
          icon: AlertOctagon,
          label: 'KRİTİK',
        };
      case 'error':
        return {
          bg: 'bg-red-500/10 text-red-500 border-red-500/20',
          icon: AlertTriangle,
          label: 'HATA',
        };
      case 'warn':
        return {
          bg: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
          icon: AlertTriangle,
          label: 'UYARI',
        };
      case 'info':
      default:
        return {
          bg: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
          icon: Info,
          label: 'BİLGİ',
        };
    }
  };

  const badge = getLevelBadge(event.level);
  const BadgeIcon = badge.icon;

  let parsedDetails: any = null;
  if (event.details) {
    try {
      parsedDetails = JSON.parse(event.details);
    } catch {
      parsedDetails = event.details;
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-2.5 rounded-2xl border ${badge.bg}`}>
              <BadgeIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider border ${badge.bg}`}>
                  {badge.label}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  {event.category}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {event.id}
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate mt-1">
                {event.message}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-600 dark:text-slate-300">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 dark:bg-slate-900/80 rounded-2xl border border-slate-100 dark:border-slate-800/80 space-y-1">
              <span className="text-[10px] text-slate-400 font-semibold uppercase flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Zaman
              </span>
              <p className="font-mono text-slate-800 dark:text-slate-200 truncate">
                {formatDateTime(event.timestamp)}
              </p>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-900/80 rounded-2xl border border-slate-100 dark:border-slate-800/80 space-y-1">
              <span className="text-[10px] text-slate-400 font-semibold uppercase flex items-center gap-1">
                <Server className="w-3 h-3" /> Kaynak (Source)
              </span>
              <p className="font-mono text-slate-800 dark:text-slate-200 truncate">
                {event.source || 'system'}
              </p>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-900/80 rounded-2xl border border-slate-100 dark:border-slate-800/80 space-y-1">
              <span className="text-[10px] text-slate-400 font-semibold uppercase flex items-center gap-1">
                <Globe className="w-3 h-3" /> İstemci IP
              </span>
              <p className="font-mono text-slate-800 dark:text-slate-200 truncate">
                {event.ip || '-'}
              </p>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-900/80 rounded-2xl border border-slate-100 dark:border-slate-800/80 space-y-1">
              <span className="text-[10px] text-slate-400 font-semibold uppercase flex items-center gap-1">
                <Activity className="w-3 h-3" /> Durum Kodu
              </span>
              <p className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate">
                {event.statusCode || (event.method && event.path ? '500' : '-')}
              </p>
            </div>
          </div>

          {/* HTTP Request Info if available */}
          {(event.method || event.path) && (
            <div className="p-3.5 bg-slate-900 text-slate-200 rounded-2xl border border-slate-800 font-mono text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 truncate">
                <span className="px-2 py-0.5 rounded bg-indigo-600 text-white font-bold text-[10px]">
                  {event.method || 'REQ'}
                </span>
                <span className="text-emerald-400 truncate">{event.path}</span>
              </div>
              <button
                onClick={() => handleCopy(`${event.method || ''} ${event.path || ''}`.trim(), 'http')}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                title="Kopyala"
              >
                {copiedKey === 'http' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}

          {/* Full Message Box */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-indigo-500" /> Tam Hata / Olay Mesajı
              </span>
              <button
                onClick={() => handleCopy(event.message, 'msg')}
                className="flex items-center gap-1 text-[11px] text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 font-medium"
              >
                {copiedKey === 'msg' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Kopyala</span>
              </button>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-mono whitespace-pre-wrap break-words leading-relaxed select-all">
              {event.message}
            </div>
          </div>

          {/* Stack Trace if available */}
          {event.stack && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-500 flex items-center gap-1.5">
                  <Terminal className="w-4 h-4" /> Çağrı Yığını (Stack Trace)
                </span>
                <button
                  onClick={() => handleCopy(event.stack!, 'stack')}
                  className="flex items-center gap-1 text-[11px] text-rose-500 hover:text-rose-600 dark:text-rose-400 font-medium"
                >
                  {copiedKey === 'stack' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Stack Kopyala</span>
                </button>
              </div>
              <pre className="p-4 bg-[#0a0f1d] text-rose-300/90 rounded-2xl border border-rose-950/40 text-[11px] font-mono whitespace-pre-wrap break-all max-h-60 overflow-y-auto leading-relaxed select-all scrollbar-thin">
                {event.stack}
              </pre>
            </div>
          )}

          {/* Details / Payload JSON */}
          {event.details && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <Code className="w-4 h-4 text-emerald-500" /> Yapılandırılmış Tanı Verisi (Details JSON)
                </span>
                <button
                  onClick={() => handleCopy(typeof parsedDetails === 'object' ? JSON.stringify(parsedDetails, null, 2) : String(event.details), 'details')}
                  className="flex items-center gap-1 text-[11px] text-emerald-500 hover:text-emerald-600 dark:text-emerald-400 font-medium"
                >
                  {copiedKey === 'details' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>JSON Kopyala</span>
                </button>
              </div>
              <pre className="p-4 bg-[#0a0f1d] text-emerald-400 rounded-2xl border border-slate-800 text-[11px] font-mono whitespace-pre-wrap break-all max-h-56 overflow-y-auto leading-relaxed select-all scrollbar-thin">
                {typeof parsedDetails === 'object' ? JSON.stringify(parsedDetails, null, 2) : event.details}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <button
            onClick={() => handleCopy(JSON.stringify(event, null, 2), 'all')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-medium text-xs transition-colors"
          >
            {copiedKey === 'all' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>Tüm Log Nesnesini Kopyala</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-xs transition-colors shadow-lg shadow-indigo-600/20"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
