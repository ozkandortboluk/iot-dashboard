import React, { useState } from 'react';
import type { WidgetConfig } from '../../types';
import { useRealtime } from '../../context/RealtimeContext';
import { Sliders, ToggleLeft, ToggleRight, CheckCircle2, Zap, CircleDot } from 'lucide-react';
import { DeviceStatusDot } from './DeviceStatusDot';

interface SwitchControlWidgetProps {
  config: WidgetConfig;
  onEdit?: () => void;
}

export const SwitchControlWidget: React.FC<SwitchControlWidgetProps> = ({ config, onEdit }) => {
  const { devices, sendControlCommand } = useRealtime();

  // Find target device strictly if configured
  const isSpecificConfigured = Boolean(config.deviceId && config.deviceId !== 'all');
  const targetDevice = isSpecificConfigured
    ? devices.find((d) => d.id === config.deviceId || d.apiKey === config.deviceId) || null
    : (devices.length === 1 ? devices[0] : null);

  const isMissingDevice = isSpecificConfigured && !targetDevice;

  const switchChannels = [
    { id: 'sw_1', pin: 'RELAY_1', label: 'Ana Vana / Su Pompass' },
    { id: 'sw_2', pin: 'RELAY_2', label: 'Aydınlatma / Projektör' },
    { id: 'sw_3', pin: 'RELAY_3', label: 'Isıtıcı / Rezistans' },
    { id: 'sw_4', pin: 'RELAY_4', label: 'Sirkülasyon Fanı' },
  ];

  const [switchStates, setSwitchStates] = useState<Record<string, boolean>>({
    RELAY_1: true,
    RELAY_2: false,
    RELAY_3: false,
    RELAY_4: true,
  });

  const [isSending, setIsSending] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const handleToggleSwitch = async (pin: string, currentVal: boolean) => {
    if (!targetDevice) return;

    const newVal = !currentVal;
    setSwitchStates((prev) => ({ ...prev, [pin]: newVal }));
    setIsSending(true);

    try {
      await sendControlCommand(targetDevice.id, pin, newVal ? 'ON' : 'OFF', pin, 'RELAY');
      setFeedbackMsg(`Sinyal İletildi: [${pin}] -> ${newVal ? 'AÇIK (ON)' : 'KAPALI (OFF)'}`);
    } catch (err: any) {
      setFeedbackMsg(`Hata: ${err.message || 'Sinyal gönderilemedi'}`);
    } finally {
      setIsSending(false);
      setTimeout(() => setFeedbackMsg(null), 3000);
    }
  };

  const handleMasterToggle = async (targetState: boolean) => {
    if (!targetDevice) return;
    setIsSending(true);

    const newStates: Record<string, boolean> = {};
    for (const ch of switchChannels) {
      newStates[ch.pin] = targetState;
      await sendControlCommand(targetDevice.id, ch.pin, targetState ? 'ON' : 'OFF', ch.pin, 'RELAY');
    }

    setSwitchStates(newStates);
    setIsSending(false);
    setFeedbackMsg(`Tüm Röleler ${targetState ? 'AÇILDI' : 'KAPATILDI'}`);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  return (
    <div className="h-full bg-white dark:bg-[#0f172a] rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col justify-between transition-all">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className="p-2.5 rounded-xl text-white font-bold shadow-md"
            style={{ backgroundColor: config.colorScheme || '#10b981' }}
          >
            <ToggleRight className="w-4 h-4" />
          </div>
          <DeviceStatusDot deviceId={config.deviceId} device={targetDevice} />
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {config.title || 'Çoklu Röle & Switch Paneli'}
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
              {targetDevice
                ? `${targetDevice.name} (${targetDevice.location})`
                : isMissingDevice
                ? `⚠️ Cihaz Bulunamadı (${config.deviceId})`
                : 'Cihaz Seçilmedi'}
            </p>
          </div>
        </div>

        {onEdit && (
          <button
            onClick={onEdit}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors"
            title="Widget Özelleştir"
          >
            <Sliders className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Master Toggle Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-100 dark:bg-slate-800/80 rounded-2xl text-[10px] my-1 border border-slate-200 dark:border-slate-700/60">
        <span className="font-bold text-slate-700 dark:text-slate-300">Master Anahtar:</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleMasterToggle(true)}
            disabled={!targetDevice || isSending}
            className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 font-bold rounded-lg border border-emerald-500/30 transition"
          >
            Hepsini AÇ
          </button>
          <button
            onClick={() => handleMasterToggle(false)}
            disabled={!targetDevice || isSending}
            className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-bold rounded-lg border border-rose-500/30 transition"
          >
            Hepsini KAPAT
          </button>
        </div>
      </div>

      {/* Switches List */}
      <div className="space-y-2 my-1">
        {switchChannels.map((ch) => {
          const isOn = !!switchStates[ch.pin];
          return (
            <div
              key={ch.id}
              className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-900/70 rounded-2xl border border-slate-100 dark:border-slate-800/80"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isOn ? 'bg-emerald-400 animate-pulse shadow-md' : 'bg-slate-600'
                  }`}
                />
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                    {ch.label}
                  </span>
                  <span className="text-[9px] font-mono text-slate-400">
                    Pin: [{ch.pin}] — Durum: {isOn ? 'AÇIK (220V)' : 'KAPALI'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleToggleSwitch(ch.pin, isOn)}
                disabled={!targetDevice || isSending}
                className={`px-3 py-1.5 rounded-xl font-extrabold text-[10px] transition-all flex items-center gap-1 border cursor-pointer ${
                  isOn
                    ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700'
                }`}
              >
                {isOn ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4 text-slate-500" />}
                <span>{isOn ? 'AÇIK' : 'KAPALI'}</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer Status */}
      <div className="mt-1 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px]">
        {feedbackMsg ? (
          <span className="text-emerald-500 dark:text-emerald-400 font-semibold flex items-center gap-1 animate-fade-in">
            <CheckCircle2 className="w-3 h-3" /> {feedbackMsg}
          </span>
        ) : (
          <span className="text-slate-400 flex items-center gap-1">
            <CircleDot className="w-3 h-3 text-emerald-400" /> Dijital Sinyal & Röle Sürücü Kartı
          </span>
        )}
      </div>
    </div>
  );
};
