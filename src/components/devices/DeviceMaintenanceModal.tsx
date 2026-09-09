import React, { useState } from 'react';
import type { Device } from '../../types';
import { Wrench, X, ShieldAlert, Clock, AlertTriangle, Check } from 'lucide-react';

interface DeviceMaintenanceModalProps {
  device: Device;
  isOpen: boolean;
  onClose: () => void;
  onToggleMaintenance: (enabled: boolean, reason?: string, until?: string) => Promise<void>;
}

export const DeviceMaintenanceModal: React.FC<DeviceMaintenanceModalProps> = ({
  device,
  isOpen,
  onClose,
  onToggleMaintenance,
}) => {
  const [enabled, setEnabled] = useState(device.maintenanceMode || false);
  const [reason, setReason] = useState(device.maintenanceReason || 'Periyodik kalibrasyon ve saha servis bakımı');
  const [durationHours, setDurationHours] = useState('2');
  const [customUntil, setCustomUntil] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      let untilDate: string | undefined;
      if (enabled) {
        if (customUntil) {
          untilDate = new Date(customUntil).toISOString();
        } else if (durationHours) {
          const d = new Date();
          d.setHours(d.getHours() + parseInt(durationHours, 10));
          untilDate = d.toISOString();
        }
      }
      await onToggleMaintenance(enabled, enabled ? reason : undefined, untilDate);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Bakım modu güncellenemedi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        id="modal-device-maintenance"
        className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">Cihaz Bakım & Servis Modu</h3>
              <p className="text-xs text-slate-400 font-mono">{device.name} ({device.id})</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Toggle Switch */}
          <div className="flex items-center justify-between p-4 bg-slate-800/40 border border-slate-800 rounded-lg">
            <div className="space-y-0.5">
              <span className="text-sm font-medium text-slate-200">Bakım Modunu Etkinleştir</span>
              <p className="text-xs text-slate-400">
                Bakım modundayken cihazdan kaynaklanan alarmlar ve bildirimler susturulur.
              </p>
            </div>
            <button
              type="button"
              id="toggle-maintenance-switch"
              onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                enabled ? 'bg-amber-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {enabled && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Reason */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Bakım Nedeni / Açıklaması
                </label>
                <input
                  id="input-maintenance-reason"
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Örn: Saha sensör kalibrasyonu, donanım değişimi..."
                  required
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Duration selection */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Tahmini Bakım Süresi
                  </label>
                  <select
                    id="select-maintenance-duration"
                    value={durationHours}
                    onChange={(e) => setDurationHours(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="1">1 Saat</option>
                    <option value="2">2 Saat</option>
                    <option value="4">4 Saat</option>
                    <option value="8">8 Saat</option>
                    <option value="24">24 Saat (1 Gün)</option>
                    <option value="72">3 Gün</option>
                    <option value="custom">Özel Bitiş Tarihi</option>
                  </select>
                </div>

                {durationHours === 'custom' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Bitiş Tarih & Saati
                    </label>
                    <input
                      id="input-maintenance-until"
                      type="datetime-local"
                      value={customUntil}
                      onChange={(e) => setCustomUntil(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                )}
              </div>

              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Bakım modu süresince telemetri verileri kaydedilmeye devam eder ancak alarm eşikleri tetiklendiğinde e-posta/SMS/WhatsApp bildirimleri gönderilmez.
                </span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              id="btn-save-maintenance-mode"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-amber-600 hover:bg-amber-500 rounded-lg transition-colors disabled:opacity-50 shadow-lg shadow-amber-900/20"
            >
              {loading ? (
                <span>Kaydediliyor...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{enabled ? 'Bakım Modunu Başlat' : 'Bakım Modunu Kapat'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
