import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X, Loader2 } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading' | 'pending';

export interface ToastMessage {
  text?: string;
  message?: string;
  title?: string;
  type?: ToastType;
  id?: string | number;
  progress?: number;
}

interface ToastNotificationProps {
  toast?: ToastMessage | string | null;
  message?: ToastMessage | string | null;
  type?: ToastType;
  title?: string;
  progress?: number;
  onClose: () => void;
  duration?: number;
}

export const ToastNotification: React.FC<ToastNotificationProps> = ({
  toast,
  message,
  type: propType,
  title: propTitle,
  progress: propProgress,
  onClose,
  duration = 4500,
}) => {
  const activeObj = toast || message;

  if (!activeObj) return null;

  let text = '';
  let type: ToastType = propType || 'success';
  let toastTitle: string | undefined = propTitle;
  let toastProgress: number | undefined = propProgress;

  if (typeof activeObj === 'string') {
    text = activeObj;
    if (propType) type = propType;
  } else if (typeof activeObj === 'object') {
    text = activeObj.text || activeObj.message || '';
    type = activeObj.type || propType || 'success';
    toastTitle = activeObj.title || propTitle;
    toastProgress = activeObj.progress !== undefined ? activeObj.progress : propProgress;
  }

  const isPendingType = type === 'loading' || type === 'pending';

  useEffect(() => {
    // Do not auto-dismiss loading / pending toasts; they wait for real backend completion
    if (isPendingType) {
      return;
    }
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [activeObj, isPendingType, onClose, duration]);

  const typeStyles = {
    success: {
      bg: 'bg-slate-900/95 border-emerald-500/50 text-emerald-100 shadow-emerald-950/40',
      badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      badgeText: 'Tamamlandı',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
      defaultTitle: 'İşlem Başarılı',
      bar: 'bg-emerald-500',
    },
    error: {
      bg: 'bg-slate-900/95 border-rose-500/50 text-rose-100 shadow-rose-950/40',
      badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      badgeText: 'Hata',
      icon: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />,
      defaultTitle: 'İşlem Başarısız',
      bar: 'bg-rose-500',
    },
    warning: {
      bg: 'bg-slate-900/95 border-amber-500/50 text-amber-100 shadow-amber-950/40',
      badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      badgeText: 'Uyarı',
      icon: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
      defaultTitle: 'Uyarı & Dikkat',
      bar: 'bg-amber-500',
    },
    info: {
      bg: 'bg-slate-900/95 border-cyan-500/50 text-cyan-100 shadow-cyan-950/40',
      badgeBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      badgeText: 'Bilgi',
      icon: <Info className="w-5 h-5 text-cyan-400 shrink-0" />,
      defaultTitle: 'Sistem Bilgisi',
      bar: 'bg-cyan-500',
    },
    loading: {
      bg: 'bg-slate-900/95 border-cyan-500/60 text-slate-100 shadow-cyan-950/50 ring-1 ring-cyan-500/30',
      badgeBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 animate-pulse',
      badgeText: 'İşleniyor...',
      icon: <Loader2 className="w-5 h-5 text-cyan-400 animate-spin shrink-0" />,
      defaultTitle: 'İşlem Gerçekleştiriliyor...',
      bar: 'bg-cyan-400 animate-pulse',
    },
    pending: {
      bg: 'bg-slate-900/95 border-indigo-500/60 text-slate-100 shadow-indigo-950/50 ring-1 ring-indigo-500/30',
      badgeBg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 animate-pulse',
      badgeText: 'Devam Ediyor',
      icon: <Loader2 className="w-5 h-5 text-indigo-400 animate-spin shrink-0" />,
      defaultTitle: 'İşlem Beklemede...',
      bar: 'bg-indigo-400 animate-pulse',
    },
  }[type];

  const title = toastTitle || typeStyles.defaultTitle;

  return (
    <div
      id="app-toast-notification"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-[9999] max-w-full sm:max-w-md w-auto pointer-events-auto transition-all duration-300 animate-in fade-in slide-in-from-bottom-5"
    >
      <div
        className={`relative overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl p-4 sm:p-4.5 flex items-start gap-3.5 ${typeStyles.bg}`}
      >
        <div className="mt-0.5 shrink-0">{typeStyles.icon}</div>
        
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-200">
              {title}
            </span>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${typeStyles.badgeBg}`}>
              {typeStyles.badgeText}
            </span>
          </div>

          <p className="text-xs sm:text-sm font-medium leading-relaxed text-slate-200 break-words">
            {text}
          </p>

          {/* Optional Progress Indicator */}
          {toastProgress !== undefined && (
            <div className="mt-2.5 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span>İlerleme Durumu</span>
                <span>%{Math.min(100, Math.max(0, toastProgress))}</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden border border-slate-700">
                <div
                  className="bg-cyan-400 h-full transition-all duration-300 ease-out"
                  style={{ width: `${Math.min(100, Math.max(0, toastProgress))}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-2 sm:p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 active:bg-slate-700 transition-colors shrink-0 min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center"
          title="Bildirimi Kapat"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Animated Progress Bar for auto-dismissing toasts */}
        {!isPendingType && (
          <div
            className={`absolute bottom-0 left-0 right-0 h-1 ${typeStyles.bar} opacity-75 animate-[shrink_linear_forwards]`}
            style={{ animationDuration: `${duration}ms` }}
          />
        )}
      </div>
    </div>
  );
};
