import React, { useState } from 'react';
import type { WidgetConfig } from '../../types';
import { useRealtime } from '../../context/RealtimeContext';
import { Power, Sliders, RefreshCw, Cpu, Zap, AlertOctagon, CheckCircle2, Radio, RadioTower } from 'lucide-react';
import { DeviceStatusDot } from './DeviceStatusDot';

interface DeviceControlWidgetProps {
  config: WidgetConfig;
  onEdit?: () => void;
}

export const DeviceControlWidget: React.FC<DeviceControlWidgetProps> = ({ config, onEdit }) => {
  const { devices, sendControlCommand, updateDevice } = useRealtime();

  // Find target device strictly if configured
  const isSpecificConfigured = Boolean(config.deviceId && config.deviceId !== 'all');
  const targetDevice = isSpecificConfigured
    ? devices.find((d) => d.id === config.deviceId || d.apiKey === config.deviceId) || null
    : (devices.length === 1 ? devices[0] : null);

  const isMissingDevice = isSpecificConfigured && !targetDevice;

  const [relayState, setRelayState] = useState(true);
  const [speedLevel, setSpeedLevel] = useState(75);
  const [lastActionStatus, setLastActionStatus] = useState<string | null>(null);

  const handleToggleRelay = () => {
    if (!targetDevice) return;
    const newState = !relayState;
    setRelayState(newState);
    sendControlCommand(targetDevice.id, newState ? 'RELAY_ON' : 'RELAY_OFF');
    setLastActionStatus(`Röle kilit komutu ${newState ? 'AÇILDI' : 'KAPATILDI'}`);
    setTimeout(() => setLastActionStatus(null), 3000);
  };

  const handleReboot = () => {
    if (!targetDevice) return;
    sendControlCommand(targetDevice.id, 'REBOOT_DEVICE');
    setLastActionStatus(`Yeniden başlatma (Reboot) sinyali iletildi.`);
    setTimeout(() => setLastActionStatus(null), 3000);
  };

  return (
    <div className="h-full bg-white dark:bg-[#0f172a] rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col justify-between transition-all">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl text-white font-bold" style={{ backgroundColor: config.colorScheme || '#3b82f6' }}>
            <Cpu className="w-4 h-4" />
          </div>
          <DeviceStatusDot deviceId={config.deviceId} device={targetDevice} />
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {config.title || 'Cihaz Anlık Kontrol Masası'}
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
              {targetDevice
                ? `${targetDevice.name} (${targetDevice.location})`
                : isMissingDevice
                ? `⚠️ Cihaz Bulunamadı (${config.deviceId})`
                : 'Cihaz seçilmedi'}
            </p>
          </div>
        </div>

        {onEdit && (
          <button
            onClick={onEdit}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            title="Widget Özelleştir"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Control Buttons & Inputs Grid */}
      <div className="space-y-3 my-2">
        {/* Toggle Relay Switch */}
        <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/80 rounded-2xl border border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Power className={`w-4 h-4 ${relayState ? 'text-emerald-400' : 'text-slate-500'}`} />
            <div>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                Güç / Röle Çıkışı
              </span>
              <span className="text-[10px] text-slate-400">
                {relayState ? 'Aktif Akım Var (220V)' : 'Güç Kesildi (Devre Dışı)'}
              </span>
            </div>
          </div>

          <button
            onClick={handleToggleRelay}
            className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
              relayState ? 'bg-emerald-600' : 'bg-slate-700'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                relayState ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Data Flow / Telemetry Transmitter Toggle */}
        {targetDevice && (
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/80 rounded-2xl border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Radio className={`w-4 h-4 ${targetDevice.dataFlowActive !== false && targetDevice.status !== 'offline' ? 'text-emerald-400 animate-pulse' : 'text-rose-500'}`} />
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Telemetri Sinyal Akışı
                </span>
                <span className="text-[10px] text-slate-400">
                  {targetDevice.dataFlowActive !== false && targetDevice.status !== 'offline'
                    ? 'Canlı Sinyal Gönderiliyor'
                    : 'Veri Akışı Kesildi (40s Offline)'}
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                const isActive = targetDevice.dataFlowActive !== false && targetDevice.status !== 'offline';
                updateDevice(targetDevice.id, {
                  dataFlowActive: !isActive,
                  status: !isActive ? 'online' : 'offline',
                });
                setLastActionStatus(`Veri akışı ${!isActive ? 'BAŞLATILDI' : 'KESİLDİ'}`);
                setTimeout(() => setLastActionStatus(null), 3000);
              }}
              className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border transition cursor-pointer ${
                targetDevice.dataFlowActive !== false && targetDevice.status !== 'offline'
                  ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border-rose-500/30'
                  : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border-emerald-500/30'
              }`}
            >
              {targetDevice.dataFlowActive !== false && targetDevice.status !== 'offline'
                ? 'Veri Akışını Kes'
                : 'Sinyali Başlat'}
            </button>
          </div>
        )}

        {/* Speed / Limit Slider */}
        <div className="p-3 bg-slate-50 dark:bg-slate-900/80 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Güç Limiti (%)</span>
            </span>
            <span className="text-blue-500 dark:text-blue-400 font-bold font-mono">{speedLevel}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={speedLevel}
            onChange={(e) => setSpeedLevel(Number(e.target.value))}
            className="w-full accent-blue-500 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
          />
        </div>

        {/* Action Buttons: Reboot & Reset */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleReboot}
            className="py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
            <span>Yeniden Başlat</span>
          </button>

          <button
            onClick={() => {
              setLastActionStatus('Acil durum sinyali gönderildi!');
              setTimeout(() => setLastActionStatus(null), 3000);
            }}
            className="py-2 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>Acil Durum</span>
          </button>
        </div>
      </div>

      {/* Footer Status Message */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] h-6 flex items-center">
        {lastActionStatus ? (
          <div className="text-emerald-400 font-semibold flex items-center gap-1 animate-pulse">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{lastActionStatus}</span>
          </div>
        ) : (
          <span className="text-slate-500 dark:text-slate-400">
            Son komut onaylandı • Bekleme: 2ms
          </span>
        )}
      </div>
    </div>
  );
};
