import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import type { ThresholdRule } from '../../types';

interface DeleteRuleConfirmModalProps {
  rule: ThresholdRule | null;
  isOpen: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export const DeleteRuleConfirmModal: React.FC<DeleteRuleConfirmModalProps> = ({
  rule,
  isOpen,
  isDeleting,
  onClose,
  onConfirm,
}) => {
  if (!isOpen || !rule) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 overflow-hidden">
        <div className="flex items-start justify-between">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 flex items-center justify-center">
            <Trash2 className="w-6 h-6" />
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Alarm Kuralını Silmek İstediğinize Emin Misiniz?
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Bu işlem geri alınamaz. Kural kaldırıldığında eşik ihlalleri izlenmeyecektir.
          </p>

          <div className="mt-4 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Hedef Cihaz:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {rule.deviceId === 'all' ? 'Tüm Cihazlar (Global)' : rule.deviceId}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Koşul:</span>
              <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {rule.metricKey} {rule.operator} {rule.thresholdValue}
              </span>
            </div>
            {rule.messageTemplate && (
              <div className="pt-1.5 border-t border-slate-200/50 dark:border-slate-700/50 text-[11px] text-slate-600 dark:text-slate-300 italic line-clamp-2">
                "{rule.messageTemplate}"
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-600/20 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            {isDeleting ? (
              <span>Siliniyor...</span>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>Kuralı Kalıcı Olarak Sil</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
