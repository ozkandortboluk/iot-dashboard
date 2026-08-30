import React, { useState } from 'react';
import type { WidgetConfig, WidgetButtonConfig } from '../../types';
import { useRealtime } from '../../context/RealtimeContext';
import { Sliders, Power, CheckCircle2, Zap, Radio, CircleDot } from 'lucide-react';
import { DeviceStatusDot } from './DeviceStatusDot';

interface ButtonControlWidgetProps {
  config: WidgetConfig;
  onEdit?: () => void;
}

export const ButtonControlWidget: React.FC<ButtonControlWidgetProps> = ({ config, onEdit }) => {
  const { devices, sendControlCommand } = useRealtime();

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

  return (
    <div className="h-full bg-white dark:bg-[#0f172a] rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col justify-between transition-all">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="p-2.5 rounded-xl text-white font-bold shadow-md"
            style={{ backgroundColor: config.colorScheme || '#3b82f6' }}
          >
            <Power className="w-4 h-4" />
          </div>
          <DeviceStatusDot deviceId={config.deviceId} device={targetDevice} />
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {config.title || `${buttonCount}'li Buton Kontrol Paneli`}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                {buttonCount}'li Buton
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[220px]">
              {targetDevice
                ? `${targetDevice.name} (${targetDevice.location})`
                : isMissingDevice
                ? `⚠️ Cihaz Bulunamadı / Silinmiş (${config.deviceId})`
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

      {(!targetDevice || isMissingDevice) && (
        <div className="mb-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[11px] flex items-center justify-between gap-2">
          <span>
            {isMissingDevice
              ? `Seçili cihaz (${config.deviceId}) bulunamadı veya silinmiş. Güvenlik için komut gönderimi kilitlendi.`
              : 'Kontrol paneli için henüz bir donanım cihazı seçilmedi.'}
          </span>
          {onEdit && (
            <button
              onClick={onEdit}
              className="px-2 py-0.5 rounded-lg bg-amber-500 text-white font-bold text-[10px] shrink-0 hover:bg-amber-600 transition-colors"
            >
              Cihaz Ata
            </button>
          )}
        </div>
      )}

      {/* Buttons Grid */}
      <div className={`grid gap-3 my-2 ${getGridClass()}`}>
        {activeButtons.map((btn, idx) => {
          const isActive = !!buttonStates[btn.id];
          const isSending = sendingBtnId === btn.id;
          const btnColor = btn.color || ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'][idx % 4];

          return (
            <button
              key={btn.id || idx}
              onClick={() => handleButtonClick(btn)}
              disabled={isSending || !targetDevice}
              className={`relative overflow-hidden p-4 rounded-2xl border transition-all duration-200 text-left cursor-pointer flex flex-col justify-between ${
                buttonCount === 1 ? 'min-h-[110px]' : 'min-h-[90px]'
              } ${
                isActive
                  ? 'bg-slate-900 dark:bg-slate-900 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                  : 'bg-slate-50 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800/80 border-slate-200 dark:border-slate-800'
              }`}
            >
              {/* Top Row: Pin Name & LED Status */}
              <div className="flex items-center justify-between w-full">
                <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                  [{btn.outputPin || btn.command || `OUT_${idx + 1}`}]
                </span>

                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2.5 h-2.5 rounded-full transition-all ${
                      isActive ? 'animate-pulse shadow-md' : 'opacity-40'
                    }`}
                    style={{ backgroundColor: isActive ? btnColor : '#64748b' }}
                  />
                  <span className={`text-[10px] font-bold ${isActive ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {isActive ? 'AKTİF (ON)' : 'PASİF (OFF)'}
                  </span>
                </div>
              </div>

              {/* Middle: Button Title */}
              <div className="my-1">
                <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white block line-clamp-1">
                  {btn.label || `Buton ${idx + 1}`}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                  Sinyal: {btn.command} = {isActive ? (btn.value || 'HIGH') : 'LOW'}
                </span>
              </div>

              {/* Action Trigger Bar */}
              <div
                className="w-full py-1.5 rounded-xl font-bold text-[10px] flex items-center justify-center gap-1.5 transition-all mt-1"
                style={{
                  backgroundColor: isActive ? btnColor : 'rgba(100, 116, 139, 0.15)',
                  color: isActive ? '#ffffff' : '#94a3b8',
                }}
              >
                {isSending ? (
                  <Radio className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                <span>
                  {isSending
                    ? 'Gönderiliyor...'
                    : btn.mode === 'pulse'
                    ? 'Darbe / Pulse Gönder'
                    : isActive
                    ? 'Çıkışı Kapat'
                    : 'Çıkışı Aç'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer Feedback Message */}
      <div className="mt-1 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px]">
        {feedbackMsg ? (
          <span className="text-emerald-500 dark:text-emerald-400 font-semibold flex items-center gap-1 animate-fade-in">
            <CheckCircle2 className="w-3 h-3" /> {feedbackMsg}
          </span>
        ) : (
          <span className="text-slate-400 flex items-center gap-1">
            <CircleDot className="w-3 h-3 text-cyan-400" /> Cihaz Dijital Çıkış (GPIO / Röle) Komut Paneli
          </span>
        )}
      </div>
    </div>
  );
};
