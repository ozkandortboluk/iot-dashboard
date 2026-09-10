import React, { useState } from 'react';
import { AlertTriangle, Trash2, Check, X, ShieldAlert, Database, LayoutDashboard, BellRing } from 'lucide-react';
import type { User as UserType } from '../../types';

interface BulkAdvancedCustomerDeleteModalProps {
  customers: UserType[];
  onClose: () => void;
  onConfirm: (options: {
    deleteDevices: boolean;
    deleteDashboards: boolean;
    deleteAlarms: boolean;
    deleteTelemetry: boolean;
  }) => Promise<void>;
}

export const BulkAdvancedCustomerDeleteModal: React.FC<BulkAdvancedCustomerDeleteModalProps> = ({
  customers,
  onClose,
  onConfirm,
}) => {
  const [deleteDevices, setDeleteDevices] = useState(false);
  const [deleteDashboards, setDeleteDashboards] = useState(true);
  const [deleteAlarms, setDeleteAlarms] = useState(true);
  const [deleteTelemetry, setDeleteTelemetry] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const targetConfirmText = `SIL ${customers.length}`;

  const handleDelete = async () => {
    if (confirmText !== targetConfirmText) return;
    setIsDeleting(true);
    try {
      await onConfirm({
        deleteDevices,
        deleteDashboards,
        deleteAlarms,
        deleteTelemetry
      });
      onClose();
    } catch (e) {
      console.error(e);
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-[#0f172a] rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Çoklu Müşteri Silme
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Seçili {customers.length} müşteri için toplu temizleme işlemi.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-200/50 dark:border-rose-900/30 rounded-xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-900 dark:text-rose-300 leading-relaxed">
              <strong>Dikkat:</strong> Seçili {customers.length} müşteri hesabını silmek kalıcı bir işlemdir. 
              Aşağıdaki seçenekleri kullanarak silinecek veya Merkez Yönetim hesabına 
              devredilecek verileri belirleyebilirsiniz.
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Veri Temizleme Opsiyonları
            </h3>

            {/* Devices Option */}
            <label className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer ${
              deleteDevices ? 'bg-rose-50/50 border-rose-200 dark:bg-rose-500/5 dark:border-rose-500/20' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
            }`}>
              <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                deleteDevices ? 'bg-rose-500 border-rose-500 text-white' : 'border-slate-300 dark:border-slate-600 bg-transparent'
              }`}>
                {deleteDevices && <Check className="w-3 h-3" />}
              </div>
              <input type="checkbox" className="hidden" checked={deleteDevices} onChange={(e) => setDeleteDevices(e.target.checked)} />
              <div>
                <div className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  Cihazları Tamamen Sil
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Seçilmezse, cihazlar veri kaybı yaşanmaması için "Merkez Yönetim" (usr_admin) hesabına devredilir.
                </p>
              </div>
            </label>

            {/* Dashboards Option */}
            <label className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer ${
              deleteDashboards ? 'bg-rose-50/50 border-rose-200 dark:bg-rose-500/5 dark:border-rose-500/20' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
            }`}>
              <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                deleteDashboards ? 'bg-rose-500 border-rose-500 text-white' : 'border-slate-300 dark:border-slate-600 bg-transparent'
              }`}>
                {deleteDashboards && <Check className="w-3 h-3" />}
              </div>
              <input type="checkbox" className="hidden" checked={deleteDashboards} onChange={(e) => setDeleteDashboards(e.target.checked)} />
              <div>
                <div className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <LayoutDashboard className="w-4 h-4 text-slate-400" /> Özel Ekranları (Dashboard) Sil
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Müşterilerin oluşturduğu tüm özel analiz ekranlarını ve widget'ları sistemden kalıcı olarak temizler.
                </p>
              </div>
            </label>

            {/* Alarms Option */}
            <label className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer ${
              deleteAlarms ? 'bg-rose-50/50 border-rose-200 dark:bg-rose-500/5 dark:border-rose-500/20' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
            }`}>
              <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                deleteAlarms ? 'bg-rose-500 border-rose-500 text-white' : 'border-slate-300 dark:border-slate-600 bg-transparent'
              }`}>
                {deleteAlarms && <Check className="w-3 h-3" />}
              </div>
              <input type="checkbox" className="hidden" checked={deleteAlarms} onChange={(e) => setDeleteAlarms(e.target.checked)} />
              <div>
                <div className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <BellRing className="w-4 h-4 text-slate-400" /> Alarm Kurallarını Sil
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Tüm eşik değerli alarm kurallarını ve geçmiş bildirim loglarını temizler.
                </p>
              </div>
            </label>

            {/* Telemetry Option */}
            <label className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer ${
              deleteTelemetry ? 'bg-rose-50/50 border-rose-200 dark:bg-rose-500/5 dark:border-rose-500/20' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
            }`}>
              <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                deleteTelemetry ? 'bg-rose-500 border-rose-500 text-white' : 'border-slate-300 dark:border-slate-600 bg-transparent'
              }`}>
                {deleteTelemetry && <Check className="w-3 h-3" />}
              </div>
              <input type="checkbox" className="hidden" checked={deleteTelemetry} onChange={(e) => setDeleteTelemetry(e.target.checked)} />
              <div>
                <div className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-slate-400" /> Telemetri Geçmişini Sil
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Cihazlara ait tüm sensör okumalarını ve zaman serisi verilerini kalıcı olarak siler.
                </p>
              </div>
            </label>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              İşlemi onaylamak için kutuya tam olarak <strong className="text-slate-900 dark:text-white">"{targetConfirmText}"</strong> yazın:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-[#0b1120] border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all uppercase"
              placeholder={targetConfirmText}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            İptal
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting || confirmText !== targetConfirmText}
            className="flex items-center gap-2 px-5 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-600/50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-md shadow-rose-600/20 transition-all cursor-pointer"
          >
            {isDeleting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Siliniyor...</span>
              </>
            ) : (
              <span>Kalıcı Olarak Sil</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
