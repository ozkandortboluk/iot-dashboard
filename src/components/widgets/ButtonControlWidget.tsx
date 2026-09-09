import React, { useState } from 'react';
import type { WidgetConfig, WidgetButtonConfig } from '../../types';
import { useRealtime } from '../../context/RealtimeContext';
import { Sliders, Power, CheckCircle2, Zap, Radio, CircleDot, Loader2, AlertCircle } from 'lucide-react';
import { DeviceStatusDot } from './DeviceStatusDot';

interface ButtonControlWidgetProps {
  config: WidgetConfig;
  onEdit?: () => void;
}

export const ButtonControlWidget: React.FC<ButtonControlWidgetProps> = ({ config, onEdit }) => {
  const { devices, sendControlCommand, getPendingCommand } = useRealtime();

  // Find target device strictly if configured
  const isSpecificConfigured = Boolean(config.deviceId && config.deviceId !== 'all');
  const targetDevice = isSpecificConfigured
    ? devices.find((d) => d.id === config.deviceId || d.apiKey === config.deviceId) || null
    : (devices.length === 1 ? devices[0] : null);

  const isMissingDevice = isSpecificConfigured && !targetDevice;

  const buttonCount = config.buttonCount || (config.buttons?.length as 1 | 2 | 3 | 4) || 1;

  // Default buttons setup if config.buttons is empty
  const defaultButtons: WidgetButtonConfig[] = Array.from({ length: buttonCount }).map((_, idx) => ({
    id: `btn_${idx + 1}`,
    label: buttonCount === 1 ? 'Master Röle / Güç' : `Röle Çıkışı #${idx + 1}`,
    command: `RELAY_${idx + 1}`,
    outputPin: `OUT_${idx + 1}`,
    value: 'HIGH',
    color: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'][idx % 4],
    mode: 'toggle',
  }));

  const activeButtons = config.buttons && config.buttons.length > 0 ? config.buttons.slice(0, buttonCount) : defaultButtons;

  // Track state per button (ON/OFF)
  const [buttonStates, setButtonStates] = useState<Record<string, boolean>>({});
  const [sendingBtnId, setSendingBtnId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const handleButtonClick = async (btn: WidgetButtonConfig) => {
    if (!targetDevice) return;

    setSendingBtnId(btn.id);
    const currentState = !!buttonStates[btn.id];
    const newState = btn.mode === 'pulse' ? true : !currentState;

    setButtonStates((prev) => ({ ...prev, [btn.id]: newState }));

    const payloadVal = btn.mode === 'pulse' ? (btn.value || 'PULSE') : (newState ? (btn.value || 'HIGH') : 'LOW');
    const pinName = btn.outputPin || btn.command || `OUT_${btn.id}`;

    try {
      await sendControlCommand(targetDevice.id, btn.command, payloadVal, pinName, 'STATE');
      setFeedbackMsg(`Sinyal İletildi: [${pinName}] -> ${payloadVal}`);

      if (btn.mode === 'pulse') {
        setTimeout(() => {
          setButtonStates((prev) => ({ ...prev, [btn.id]: false }));
        }, 600);
      }
    } catch (err: any) {
      setFeedbackMsg(`Hata: ${err.message || 'Sinyal iletilemedi'}`);
    } finally {
      setSendingBtnId(null);
      setTimeout(() => setFeedbackMsg(null), 3000);
    }
  };

  // Determine Grid Layout based on Button Count
  const getGridClass = () => {
    switch (buttonCount) {
      case 1:
        return 'grid-cols-1';
      case 2:
        return 'grid-cols-1 sm:grid-cols-2';
      case 3:
        return 'grid-cols-1 sm:grid-cols-3';
      case 4:
      default:
        return 'grid-cols-2';
    }
  };

  const isCompact = (config.height || 'H1') === 'H1';

  if (isCompact) {
    return (
      <div className="h-full w-full min-h-0 bg-white dark:bg-[#0f172a] rounded-2xl sm:rounded-3xl px-3.5 py-2 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-3 overflow-hidden">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="p-1.5 rounded-xl text-white font-bold shadow-sm shrink-0"
            style={{ backgroundColor: config.colorScheme || '#3b82f6' }}
          >
            <Power className="w-4 h-4" />
          </div>
          <DeviceStatusDot deviceId={config.deviceId} device={targetDevice} />
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
              {config.title || 'Buton Paneli'}
            </h3>
            <p className="text-[10px] text-slate-400 truncate">
              {targetDevice ? targetDevice.name : isMissingDevice ? '⚠️ Cihaz Yok' : 'Cihaz Yok'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {activeButtons.map((btn, idx) => {
            const isActive = !!buttonStates[btn.id];
            const isSending = sendingBtnId === btn.id;
            const btnColor = btn.color || ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'][idx % 4];

            return (
              <button
                key={btn.id || idx}
                onClick={() => handleButtonClick(btn)}
                disabled={isSending || !targetDevice}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-40 ${
                  isActive
                    ? 'text-white shadow-md'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
                style={{
                  backgroundColor: isActive ? btnColor : undefined,
                }}
                title={`Komut: ${btn.command}`}
              >
                {isSending ? (
                  <Radio className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                <span className="truncate max-w-[80px]">{btn.label || `B${idx + 1}`}</span>
              </button>
            );
          })}

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
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <div
            className="p-2 rounded-xl text-white font-bold shadow-md"
            style={{ backgroundColor: config.colorScheme || '#3b82f6' }}
          >
            <Power className="w-4 h-4" />
          </div>
          <DeviceStatusDot deviceId={config.deviceId} device={targetDevice} />
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[160px]">
                {config.title || `${buttonCount}'li Buton Paneli`}
              </h3>
              <span className="px-1.5 py-0.2 rounded-md text-[9px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                {buttonCount} B
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
              {targetDevice
                ? `${targetDevice.name}`
                : isMissingDevice
                ? `⚠️ Cihaz Bulunamadı`
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

      {/* Buttons Grid */}
      <div className={`grid gap-2 my-1 ${getGridClass()} flex-1 min-h-0 overflow-y-auto custom-scrollbar`}>
        {activeButtons.map((btn, idx) => {
          const isActive = !!buttonStates[btn.id];
          const pinName = btn.outputPin || btn.command || `OUT_${idx + 1}`;
          const pending = targetDevice ? getPendingCommand(targetDevice.id, pinName) : null;
          const isPending = sendingBtnId === btn.id || pending?.status === 'pending';
          const isApplied = pending?.status === 'applied';
          const isFailed = pending?.status === 'failed' || pending?.status === 'timeout';
          const btnColor = btn.color || ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'][idx % 4];

          return (
            <button
              key={btn.id || idx}
              onClick={() => handleButtonClick(btn)}
              disabled={isPending || !targetDevice}
              className={`relative overflow-hidden p-2.5 rounded-xl border transition-all duration-200 text-left cursor-pointer flex flex-col justify-between ${
                isApplied
                  ? 'bg-slate-900 dark:bg-slate-900 border-emerald-500 shadow-md shadow-emerald-500/20'
                  : isActive
                  ? 'bg-slate-900 dark:bg-slate-900 border-emerald-500/50 shadow-md shadow-emerald-500/10'
                  : 'bg-slate-50 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800/80 border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[9px] font-mono font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                  [{pinName}]
                </span>

                <div className="flex items-center gap-1">
                  <span
                    className={`w-2 h-2 rounded-full transition-all ${
                      isPending
                        ? 'bg-amber-400 animate-ping'
                        : isApplied
                        ? 'bg-emerald-400 ring-2 ring-emerald-400/40'
                        : isFailed
                        ? 'bg-rose-400'
                        : isActive
                        ? 'animate-pulse shadow-sm'
                        : 'opacity-40'
                    }`}
                    style={{ backgroundColor: isPending ? '#fbbf24' : isApplied ? '#34d399' : isFailed ? '#f87171' : isActive ? btnColor : '#64748b' }}
                  />
                  <span className={`text-[9px] font-bold ${isApplied ? 'text-emerald-400' : isActive ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {isApplied ? 'ACK' : isActive ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>

              <div className="my-0.5">
                <span className="text-xs font-bold text-slate-900 dark:text-white block line-clamp-1">
                  {btn.label || `Buton ${idx + 1}`}
                </span>
              </div>

              <div
                className="w-full py-1 rounded-lg font-bold text-[9px] flex items-center justify-center gap-1 transition-all mt-1"
                style={{
                  backgroundColor: isActive ? btnColor : 'rgba(100, 116, 139, 0.15)',
                  color: isActive ? '#ffffff' : '#94a3b8',
                }}
              >
                {isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                ) : isApplied ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                ) : isFailed ? (
                  <AlertCircle className="w-3 h-3 text-rose-400" />
                ) : (
                  <Zap className="w-3 h-3" />
                )}
                <span>
                  {isPending
                    ? 'İletiliyor...'
                    : isApplied
                    ? 'ACK Onaylandı'
                    : btn.mode === 'pulse'
                    ? 'Pulse'
                    : isActive
                    ? 'Kapat'
                    : 'Aç'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer Feedback */}
      <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400 shrink-0">
        {feedbackMsg ? (
          <span className="text-emerald-500 dark:text-emerald-400 font-semibold flex items-center gap-1 animate-fade-in truncate">
            <CheckCircle2 className="w-3 h-3 shrink-0" /> {feedbackMsg}
          </span>
        ) : (
          <span className="text-slate-400 flex items-center gap-1">
            <CircleDot className="w-3 h-3 text-cyan-400" /> GPIO Komut Paneli
          </span>
        )}
      </div>
    </div>
  );
};
