import React, { useState } from 'react';
import type { Device, DeviceReplacementRecord } from '../../types';
import { RefreshCw, X, AlertTriangle, Check, History, Cpu, ArrowRight, ShieldCheck } from 'lucide-react';

interface DeviceReplacementModalProps {
  device: Device;
  isOpen: boolean;
  onClose: () => void;
  onReplaceHardware: (data: {
    newName?: string;
    newIp?: string;
    newMac?: string;
    pairingCode?: string;
    reason?: string;
    notes?: string;
  }) => Promise<void>;
  replacementHistory?: DeviceReplacementRecord[];
}

export const DeviceReplacementModal: React.FC<DeviceReplacementModalProps> = ({
  device,
  isOpen,
  onClose,
  onReplaceHardware,
  replacementHistory = [],
}) => {
  const [activeTab, setActiveTab] = useState<'replace' | 'history'>('replace');
  const [mode, setMode] = useState<'manual' | 'pairing'>('manual');
  const [newMac, setNewMac] = useState('');
  const [newIp, setNewIp] = useState('');
  const [newName, setNewName] = useState(device.name);
  const [pairingCode, setPairingCode] = useState('');
  const [reason, setReason] = useState('Arıza / Donanım Yenileme');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === 'manual' && !newMac && !newIp) {
        throw new Error('Lütfen yeni donanımın MAC adresini veya IP adresini girin.');
      }
      if (mode === 'pairing' && !pairingCode) {
        throw new Error('Lütfen eşleştirme kodunu girin.');
      }

      await onReplaceHardware({
        newName: newName !== device.name ? newName : undefined,
        newMac: mode === 'manual' ? newMac : undefined,
        newIp: mode === 'manual' ? newIp : undefined,
        pairingCode: mode === 'pairing' ? pairingCode : undefined,
        reason,
        notes: notes || (mode === 'manual' ? `Eski MAC: ${device.macAddress || '—'} -> Yeni MAC: ${newMac}` : `Eşleştirme Kodu ile aktarıldı: ${pairingCode}`),
      });

      onClose();
    } catch (err: any) {
      setError(err?.message || 'Donanım değişimi gerçekleştirilemedi.');
    } finally {
      setLoading(false);
    }
  };

  const deviceHistory = replacementHistory.filter(
    (r) => r.oldDeviceId === device.id || r.newDeviceId === device.id
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        id="modal-device-replacement"
        className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">Donanım Değişimi & Cihaz Göçü</h3>
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

        {/* Tab Header */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6">
          <button
            type="button"
            id="tab-btn-replace-hardware"
            onClick={() => setActiveTab('replace')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'replace'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Donanım Değiştir</span>
          </button>
          <button
            type="button"
            id="tab-btn-replacement-history"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Değişim Geçmişi ({deviceHistory.length})</span>
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'replace' ? (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
            {error && (
              <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-xs text-indigo-300 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Donanım değişimi yapıldığında; tüm geçmiş telemetri verileri, grafikler, ayarlar ve API erişimleri yeni karta KESİNTİSİZ aktarılır.
              </span>
            </div>

            {/* Mode selection */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                id="btn-mode-manual"
                onClick={() => setMode('manual')}
                className={`p-3 text-left rounded-lg border text-xs font-medium transition-colors ${
                  mode === 'manual'
                    ? 'border-indigo-500 bg-indigo-950/30 text-indigo-300'
                    : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold text-slate-200 mb-0.5">Manuel MAC / IP Girişi</div>
                <div className="text-[11px] text-slate-400">Yeni donanımın MAC veya IP adresini doğrudan tanımlayın.</div>
              </button>

              <button
                type="button"
                id="btn-mode-pairing"
                onClick={() => setMode('pairing')}
                className={`p-3 text-left rounded-lg border text-xs font-medium transition-colors ${
                  mode === 'pairing'
                    ? 'border-indigo-500 bg-indigo-950/30 text-indigo-300'
                    : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold text-slate-200 mb-0.5">Eşleştirme Kodu İle (Pairing)</div>
                <div className="text-[11px] text-slate-400">Ağda keşfedilen yeni cihazın 6 haneli kodunu kullanın.</div>
              </button>
            </div>

            {mode === 'manual' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Yeni Donanım MAC Adresi
                    </label>
                    <input
                      id="input-new-mac"
                      type="text"
                      value={newMac}
                      onChange={(e) => setNewMac(e.target.value)}
                      placeholder="AA:BB:CC:DD:EE:FF"
                      className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Yeni IP Adresi (Opsiyonel)
                    </label>
                    <input
                      id="input-new-ip"
                      type="text"
                      value={newIp}
                      onChange={(e) => setNewIp(e.target.value)}
                      placeholder="192.168.1.150"
                      className="w-full px-3 py-2 text-sm font-mono bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  6 Haneli Donanım Eşleştirme Kodu
                </label>
                <input
                  id="input-pairing-code"
                  type="text"
                  maxLength={6}
                  value={pairingCode}
                  onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
                  placeholder="Örn: 9B2E4F"
                  className="w-full px-3 py-2 text-sm font-mono tracking-widest text-center uppercase bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Değişim Nedeni
              </label>
              <select
                id="select-replacement-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="Arıza / Donanım Yenileme">Donanım Arızası / Bozulma</option>
                <option value="Model / Performans Yükseltme">Model / Performans Yükseltme (ESP8266 - ESP32)</option>
                <option value="Saha Kartı Değişimi">Periyodik Saha Kartı Değişimi</option>
                <option value="Diğer">Diğer</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Teknik Notlar & Açıklama
              </label>
              <textarea
                id="input-replacement-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Örn: Saha 2 ana panodaki yanmış ESP32 kartı yenilendi..."
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

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
                id="btn-submit-hardware-replacement"
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-50 shadow-lg shadow-indigo-900/20"
              >
                {loading ? (
                  <span>İşleniyor...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Değişimi Uygula ve Geçmişi Kaydet</span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-6 overflow-y-auto space-y-3">
            {deviceHistory.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                Bu cihaz için henüz donanım değişim kaydı bulunmuyor.
              </div>
            ) : (
              deviceHistory.map((rec) => (
                <div
                  key={rec.id}
                  id={`replacement-history-item-${rec.id}`}
                  className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="font-semibold text-slate-200">{rec.reason || 'Donanım Değişimi'}</span>
                    <span>{new Date(rec.replacedAt).toLocaleString('tr-TR')}</span>
                  </div>
                  <div className="flex items-center gap-2 text-indigo-400 font-mono">
                    <span>{rec.oldDeviceName}</span>
                    <ArrowRight className="w-3 h-3 text-slate-500" />
                    <span>{rec.newDeviceName}</span>
                  </div>
                  {rec.notes && <p className="text-slate-300">{rec.notes}</p>}
                  <div className="text-[11px] text-slate-500">
                    İşlemi Yapan: <span className="text-slate-400">{rec.replacedBy}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
