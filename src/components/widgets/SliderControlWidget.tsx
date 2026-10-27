import React, { useState } from 'react';
import type { WidgetConfig } from '../../types';
import { useRealtime } from '../../context/RealtimeContext';
import { Sliders, CheckCircle2, Zap, Radio, CircleDot, Gauge } from 'lucide-react';
import { DeviceStatusDot } from './DeviceStatusDot';

interface SliderControlWidgetProps {
  config: WidgetConfig;
  onEdit?: () => void;
}

export const SliderControlWidget: React.FC<SliderControlWidgetProps> = ({ config, onEdit }) => {
  const { devices, sendControlCommand } = useRealtime();

  // Find target device strictly if configured
  const isSpecificConfigured = Boolean(config.deviceId && config.deviceId !== 'all');
  const targetDevice = isSpecificConfigured
    ? devices.find((d) => d.id === config.deviceId || d.apiKey === config.deviceId) || null
    : (devices.length === 1 ? devices[0] : null);

  const isMissingDevice = isSpecificConfigured && !targetDevice;

  const min = config.sliderMin ?? 0;
  const max = config.sliderMax ?? 100;
  const step = config.sliderStep ?? 1;
  const unit = config.unit || '%';
  const outputPin = config.outputPin || config.metricKey || 'PWM_OUT_1';

  const [sliderValue, setSliderValue] = useState<number>(() => {
    if (targetDevice?.metrics?.[outputPin] !== undefined) {
      return Number(targetDevice.metrics[outputPin]);
    }
    return Math.round((min + max) / 2);
  });

  const [isSending, setIsSending] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const handleSendValue = async (valToSend?: number) => {
    if (!targetDevice) return;

    const val = valToSend !== undefined ? valToSend : sliderValue;
    setIsSending(true);

    try {
      await sendControlCommand(targetDevice.id, outputPin, val, outputPin, unit);
      setFeedbackMsg(`Sinyal İletildi: [${outputPin}] = ${val} ${unit}`);
    } catch (err: any) {
      setFeedbackMsg(`Hata: ${err.message || 'Sinyal gönderilemedi'}`);
    } finally {
      setIsSending(false);
      setTimeout(() => setFeedbackMsg(null), 3000);
    }
  };

  const handlePresetClick = (presetPercent: number) => {
    const val = Math.round(min + (max - min) * (presetPercent / 100));
    setSliderValue(val);
    handleSendValue(val);
  };

  // Percentage for progress fill
  const percentage = Math.min(100, Math.max(0, ((sliderValue - min) / (max - min)) * 100));

  return (
    <div className="h-full bg-white dark:bg-[#0f172a] rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col justify-between transition-all">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className="p-2.5 rounded-xl text-white font-bold shadow-md"
            style={{ backgroundColor: config.colorScheme || '#3b82f6' }}
          >
            <Gauge className="w-4 h-4" />
          </div>
          <DeviceStatusDot deviceId={config.deviceId} device={targetDevice} />
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {config.title || 'Analog / PWM Çıkış Sürgüsü'}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                [{outputPin}]
              </span>
            </div>
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

      {/* Main Slider & Gauge Card */}
      <div className="my-2 p-4 bg-slate-50 dark:bg-slate-900/70 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3">
        {/* Value Display */}
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">
              Çıkış Değeri / Setpoint
            </span>
            <span className="text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
              {sliderValue}{' '}
              <span className="text-sm font-bold text-cyan-500 dark:text-cyan-400 font-sans">{unit}</span>
            </span>
          </div>

          <div className="text-right font-mono text-[10px] text-slate-400">
            <span>Aralık: {min} - {max} {unit}</span>
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="w-full bg-slate-200 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden relative">
          <div
            className="h-full transition-all duration-150 rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400"
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Range Input Slider */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={sliderValue}
          onChange={(e) => setSliderValue(Number(e.target.value))}
          onMouseUp={() => handleSendValue()}
          onTouchEnd={() => handleSendValue()}
          disabled={!targetDevice}
          className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />

        {/* Quick Preset Buttons */}
        <div className="flex items-center justify-between gap-1 text-[10px]">
          <span className="text-slate-400 font-bold shrink-0">Hızlı Preset:</span>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {[0, 25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                onClick={() => handlePresetClick(pct)}
                disabled={!targetDevice || isSending}
                className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-mono font-bold border border-slate-200 dark:border-slate-700 transition"
              >
                %{pct}
              </button>
            ))}
          </div>
        </div>

        {/* Manual Send Action Button */}
        <button
          onClick={() => handleSendValue()}
          disabled={isSending || !targetDevice}
          className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 text-xs transition cursor-pointer"
        >
          {isSending ? (
            <Radio className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Zap className="w-3.5 h-3.5" />
          )}
          <span>{isSending ? 'Sinyal İletiliyor...' : `Analog Sinyali Cihaza POST Et (${sliderValue} ${unit})`}</span>
        </button>
      </div>

      {/* Footer Status */}
      <div className="mt-1 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px]">
        {feedbackMsg ? (
          <span className="text-emerald-500 dark:text-emerald-400 font-semibold flex items-center gap-1 animate-fade-in">
            <CheckCircle2 className="w-3 h-3" /> {feedbackMsg}
          </span>
        ) : (
          <span className="text-slate-400 flex items-center gap-1">
            <CircleDot className="w-3 h-3 text-purple-400" /> PWM / Analog Çıkış Voltaj Sinyal Modülü
          </span>
        )}
      </div>
    </div>
  );
};
