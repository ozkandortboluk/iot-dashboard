import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export interface ToastMessage {
  text: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  id?: string | number;
}

interface ToastNotificationProps {
  message: ToastMessage | null;
  onClose: () => void;
  duration?: number;
}

export const ToastNotification: React.FC<ToastNotificationProps> = ({
  message,
  onClose,
  duration = 4500,
}) => {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [message, onClose, duration]);

  if (!message) return null;

  const type = message.type || 'success';

  const typeStyles = {
    success: {
      bg: 'bg-emerald-950/90 border-emerald-500/40 text-emerald-100',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
      title: 'İşlem Başarılı',
      bar: 'bg-emerald-500',
    },
    error: {
      bg: 'bg-rose-950/90 border-rose-500/40 text-rose-100',
      icon: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />,
      title: 'Hata Oluştu',
      bar: 'bg-rose-500',
    },
    warning: {
      bg: 'bg-amber-950/90 border-amber-500/40 text-amber-100',
      icon: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
      title: 'Dikkat',
      bar: 'bg-amber-500',
    },
    info: {
      bg: 'bg-slate-900/90 border-indigo-500/40 text-slate-100',
      icon: <Info className="w-5 h-5 text-indigo-400 shrink-0" />,
      title: 'Bilgi',
      bar: 'bg-indigo-500',
    },
  }[type];

  return (
    <div
      id="app-toast-notification"
      className="fixed bottom-6 right-6 z-[9999] max-w-md w-full sm:w-auto min-w-[320px] pointer-events-auto transition-all duration-300 animate-in fade-in slide-in-from-bottom-5"
    >
      <div
        className={`relative overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-md p-4 flex items-start gap-3.5 ${typeStyles.bg}`}
      >
        <div className="mt-0.5">{typeStyles.icon}</div>
        <div className="flex-1 min-w-0 pr-2">
          <p className="text-xs font-bold uppercase tracking-wider opacity-80 mb-0.5">
            {typeStyles.title}
          </p>
          <p className="text-xs sm:text-sm font-medium leading-snug break-words">
            {message.text}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          title="Bildirimi Kapat"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Animated Progress Bar */}
        <div
          className={`absolute bottom-0 left-0 right-0 h-1 ${typeStyles.bar} opacity-60 animate-[shrink_linear_forwards]`}
          style={{ animationDuration: `${duration}ms` }}
        />
      </div>
    </div>
  );
};
