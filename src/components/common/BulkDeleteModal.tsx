import React from 'react';
import { AlertTriangle, Trash2, X, RefreshCw } from 'lucide-react';

interface BulkDeleteModalProps {
  isOpen: boolean;
  title: string;
  description?: React.ReactNode;
  itemCount: number;
  itemLabel?: string;
  itemsPreview?: string[];
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

export const BulkDeleteModal: React.FC<BulkDeleteModalProps> = ({
  isOpen,
  title,
  description,
  itemCount,
  itemLabel = 'öğe',
  itemsPreview = [],
  isDeleting,
  onClose,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-rose-500/30 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-rose-500/10 text-rose-500 rounded-2xl border border-rose-500/20">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {title}
              </h3>
              <p className="text-xs text-rose-500 font-semibold mt-0.5">
                Kritik / Geri Alınamaz İşlem
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed space-y-3">
          {description ? (
            <div>{description}</div>
          ) : (
            <p>
              Seçilen <strong>{itemCount}</strong> adet {itemLabel} kalıcı olarak sistemden silinecektir. Bu işlem geri alınamaz.
            </p>
          )}

          {/* Items Preview Chips */}
          {itemsPreview.length > 0 && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Silinecek Seçili Öğeler ({itemCount}):
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {itemsPreview.slice(0, 10).map((name, i) => (
                  <span
                    key={`${name}_${i}`}
                    className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-mono truncate max-w-[200px]"
                  >
                    {name}
                  </span>
                ))}
                {itemsPreview.length > 10 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-300 dark:bg-slate-800 text-slate-500 text-[11px] font-medium">
                    +{itemsPreview.length - 10} diğer
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="pt-2 flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={isDeleting || itemCount === 0}
            onClick={onConfirm}
            className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-600/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Siliniyor...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Evet, {itemCount} {itemLabel.charAt(0).toUpperCase() + itemLabel.slice(1)} Sil</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
