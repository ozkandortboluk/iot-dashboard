import React, { useState } from 'react';
import type { WidgetConfig } from '../../types';
import { useRealtime } from '../../context/RealtimeContext';
import { Sliders, ToggleLeft, ToggleRight, CheckCircle2, Zap, CircleDot, Loader2, AlertCircle } from 'lucide-react';
import { DeviceStatusDot } from './DeviceStatusDot';

interface SwitchControlWidgetProps {
  config: WidgetConfig;
  onEdit?: () => void;
}

export const SwitchControlWidget: React.FC<SwitchControlWidgetProps> = ({ config, onEdit }) => {
  const { devices, sendControlCommand, getPendingCommand } = useRealtime();

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
      setTimeout(() => setFeedbackMsg(null), 3500);
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
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const isCompact = (config.height || 'H1') === 'H1';
  const masterOn = Object.values(switchStates).some(Boolean);

  if (isCompact) {
    return (
      <div className="h-full w-full min-h-0 bg-white dark:bg-[#0f172a] rounded-2xl sm:rounded-3xl px-3.5 py-2 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-3 overflow-hidden">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="p-1.5 rounded-xl text-white font-bold shadow-sm shrink-0"
            style={{ backgroundColor: config.colorScheme || '#10b981' }}
          >
            <ToggleRight className="w-4 h-4" />
          </div>
          <DeviceStatusDot deviceId={config.deviceId} device={targetDevice} />
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
              {config.title || 'Röle & Switch'}
            </h3>
            <p className="text-[10px] text-slate-400 truncate">
              {targetDevice ? targetDevice.name : 'Cihaz Seçilmedi'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {feedbackMsg && (
            <span className="hidden sm:inline-block text-[10px] text-emerald-500 font-semibold truncate max-w-[120px]">
              {feedbackMsg}
            </span>
          )}
          <button
            onClick={() => handleMasterToggle(!masterOn)}
            disabled={!targetDevice || isSending}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
              masterOn
                ? 'bg-emerald-500 text-white shadow-emerald-500/20'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            <span>{masterOn ? 'AÇIK' : 'KAPALI'}</span>
          </button>
          {onEdit && (
            <button
              onClick={onEdit}
              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              title="Widget Özelleştir"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-0 bg-white dark:bg-[#0f172a] rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col justify-between transition-all overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5 shrink-0">
        <div className="flex items-center gap-2">
          <div
            className="p-2 rounded-xl text-white font-bold shadow-md"
            style={{ backgroundColor: config.colorScheme || '#10b981' }}
          >
            <ToggleRight className="w-4 h-4" />
          </div>
          <DeviceStatusDot deviceId={config.deviceId} device={targetDevice} />
          <div>
            <h3 className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[150px]">
              {config.title || 'Röle & Switch Paneli'}
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[150px]">
              {targetDevice
                ? `${targetDevice.name}`
                : isMissingDevice
                ? `⚠️ Kayıp Cihaz`
                : 'Cihaz Seçilmedi'}
            </p>
          </div>
        </div>

        {onEdit && (
          <button
            onClick={onEdit}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            title="Widget Özelleştir"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Master Toggle Bar */}
      <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-[10px] my-1 border border-slate-200 dark:border-slate-700/60 shrink-0">
        <span className="font-bold text-slate-700 dark:text-slate-300">Master:</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleMasterToggle(true)}
            disabled={!targetDevice || isSending}
            className="px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 font-bold rounded-lg border border-emerald-500/30 transition flex items-center gap-1"
          >
            {isSending && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
            AÇ
          </button>
          <button
            onClick={() => handleMasterToggle(false)}
            disabled={!targetDevice || isSending}
            className="px-2 py-0.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-bold rounded-lg border border-rose-500/30 transition flex items-center gap-1"
          >
            {isSending && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
            KAPAT
          </button>
        </div>
      </div>

      {/* Switches List */}
      <div className="space-y-1.5 my-1 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        {switchChannels.map((ch) => {
          const isOn = !!switchStates[ch.pin];
          const pending = targetDevice ? getPendingCommand(targetDevice.id, ch.pin) : null;
          const isPending = pending?.status === 'pending';
          const isApplied = pending?.status === 'applied';
          const isFailed = pending?.status === 'failed' || pending?.status === 'timeout';

          return (
            <div
              key={ch.id}
              className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-900/70 rounded-xl border border-slate-100 dark:border-slate-800/80 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isPending
                      ? 'bg-amber-400 animate-ping'
                      : isApplied
                      ? 'bg-emerald-400 ring-2 ring-emerald-400/40'
                      : isFailed
                      ? 'bg-rose-400'
                      : isOn
                      ? 'bg-emerald-500 animate-pulse'
                      : 'bg-slate-400 opacity-40'
                  }`}
                />
                <div className="min-w-0">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block max-w-[130px]">
                    {ch.label}
                  </span>
                  {isPending && (
                    <span className="text-[9px] text-amber-500 flex items-center gap-0.5 font-mono">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" /> İletiliyor...
                    </span>
                  )}
                  {isApplied && (
                    <span className="text-[9px] text-emerald-500 flex items-center gap-0.5 font-mono">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Donanım ACK Onaylandı
                    </span>
                  )}
                  {isFailed && (
                    <span className="text-[9px] text-rose-500 flex items-center gap-0.5 font-mono">
                      <AlertCircle className="w-2.5 h-2.5" /> {pending?.error || 'Zaman aşımı'}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleToggleSwitch(ch.pin, isOn)}
                disabled={!targetDevice || isSending || isPending}
                className={`p-1 rounded-lg transition-colors ${
                  isOn ? 'text-emerald-500' : 'text-slate-400'
                }`}
              >
                {isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
                ) : isOn ? (
                  <ToggleRight className="w-5 h-5" />
                ) : (
                  <ToggleLeft className="w-5 h-5" />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer Feedback */}
      <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400 shrink-0">
        <span className="truncate max-w-[200px]">{feedbackMsg || 'GPIO / Röle Çıkışları'}</span>
        <CircleDot className="w-3 h-3 text-cyan-400 shrink-0" />
      </div>
    </div>
  );
};
