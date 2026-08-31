import React from 'react';
import {
  Power,
  Zap,
  SlidersHorizontal,
  Gauge,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  X,
  Activity,
  Check,
} from 'lucide-react';
import type { Device, DeviceOutputDefinition } from '../../../types';
import type { OutputControlState } from './types';

interface OutputControlCardProps {
  device: Device;
  output: DeviceOutputDefinition;
  ctrlState: OutputControlState;
  canControl: boolean;
  sliderDraft?: number;
  onSliderDraftChange: (val: number) => void;
  onSendCommand: (outputId: string, commandType: string, value: string | number, unit?: string) => void;
}

export const OutputControlCard: React.FC<OutputControlCardProps> = ({
  device,
  output,
  ctrlState,
  canControl,
  sliderDraft,
  onSliderDraftChange,
  onSendCommand,
}) => {
  const isRelayOrDigital = output.type === 'relay' || output.type === 'digital';
  const isAnalogOrPwm = output.type === 'analog' || output.type === 'pwm';

  // Extract current digital/relay state
  const getStateValue = (): number => {
    if (ctrlState.lastValue !== undefined) {
      const v = String(ctrlState.lastValue).toUpperCase();
      return v === 'ON' || v === 'HIGH' || v === '1' || v === 'TRUE' ? 1 : 0;
    }
    const metricVal = device.metrics?.[output.id as keyof typeof device.metrics];
    if (typeof metricVal === 'number') {
      return metricVal > 0 ? 1 : 0;
    }
    if (output.currentValue !== undefined) {
      const v = String(output.currentValue).toUpperCase();
      return v === 'ON' || v === 'HIGH' || v === '1' || v === 'TRUE' ? 1 : 0;
    }
    if (output.initialState !== undefined) {
      const v = String(output.initialState).toUpperCase();
      return v === 'HIGH' || v === '1' || v === 'ON' || v === 'TRUE' ? 1 : 0;
    }
    return 0;
  };

  const getAnalogPwmValue = (): number => {
    if (sliderDraft !== undefined) return sliderDraft;
    const metricVal = device.metrics?.[output.id as keyof typeof device.metrics];
    if (typeof metricVal === 'number') return metricVal;
    if (typeof output.currentValue === 'number') return output.currentValue;
    return output.minValue || 0;
  };

  const stateValue = getStateValue();
  const currentAnalogValue = getAnalogPwmValue();

  const isSending = ctrlState.status === 'gönderiliyor';
  const isSuccess = ctrlState.status === 'başarılı';
  const isFailed = ctrlState.status === 'başarısız';
  const isTimeout = ctrlState.status === 'timeout';

  return (
    <div
      className={`rounded-3xl p-5 border transition-all duration-300 flex flex-col justify-between relative overflow-hidden ${
        isSending
          ? 'bg-indigo-500/5 dark:bg-indigo-950/20 border-indigo-500/50 shadow-indigo-500/10'
          : isSuccess
          ? 'bg-emerald-500/5 dark:bg-emerald-950/20 border-emerald-500/40 shadow-emerald-500/10'
          : isFailed
          ? 'bg-rose-500/5 dark:bg-rose-950/20 border-rose-500/40 shadow-rose-500/10'
          : isTimeout
          ? 'bg-amber-500/5 dark:bg-amber-950/20 border-amber-500/40 shadow-amber-500/10'
          : 'bg-slate-50/70 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800/90 hover:border-slate-300 dark:hover:border-slate-700'
      }`}
    >
      {/* Card Header */}
      <div>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`p-2 rounded-2xl shrink-0 transition-colors ${
                isRelayOrDigital
                  ? stateValue === 1
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                  : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
              }`}
            >
              {output.type === 'relay' ? (
                <Power className="w-4 h-4" />
              ) : output.type === 'digital' ? (
                <Zap className="w-4 h-4" />
              ) : output.type === 'pwm' ? (
                <SlidersHorizontal className="w-4 h-4" />
              ) : (
                <Gauge className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                {output.name}
              </h4>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                <span className="font-bold text-indigo-600 dark:text-indigo-400">{output.id}</span>
                {output.pin !== undefined && <span>• GPIO {output.pin}</span>}
                {output.pwmFreq !== undefined && <span>• {output.pwmFreq}Hz</span>}
              </div>
            </div>
          </div>

          {/* Status Badge */}
          <div className="shrink-0 flex items-center gap-1">
            {isSending && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30 flex items-center gap-1 animate-pulse">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                <span>Gönderiliyor</span>
              </span>
            )}
            {isSuccess && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" />
                <span>Başarılı</span>
              </span>
            )}
            {isFailed && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30 flex items-center gap-1">
                <AlertTriangle className="w-2.5 h-2.5" />
                <span>Başarısız</span>
              </span>
            )}
            {isTimeout && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                <span>Timeout</span>
              </span>
            )}
            {!isSending && !isSuccess && !isFailed && !isTimeout && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                  isRelayOrDigital
                    ? stateValue === 1
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : 'bg-slate-200/60 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700'
                    : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
                }`}
              >
                {isRelayOrDigital
                  ? stateValue === 1
                    ? 'AÇIK (ON)'
                    : 'KAPALI (OFF)'
                  : `${currentAnalogValue} ${output.unit || '%'}`}
              </span>
            )}
          </div>
        </div>

        {output.description && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mb-3">
            {output.description}
          </p>
        )}
      </div>

      {/* Control Interaction Area */}
      <div className="mt-2 space-y-3">
        {/* 1. RELAY / DIGITAL: Aç & Kapat Buttons */}
        {isRelayOrDigital && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!canControl || isSending}
              onClick={() => onSendCommand(output.id, 'RELAY_ON', 1, output.unit || 'DURUM')}
              className={`py-2.5 px-3 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                stateValue === 1
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20 ring-2 ring-emerald-500/30'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 border border-slate-200 dark:border-slate-700/60'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>AÇ (1)</span>
            </button>

            <button
              type="button"
              disabled={!canControl || isSending}
              onClick={() => onSendCommand(output.id, 'RELAY_OFF', 0, output.unit || 'DURUM')}
              className={`py-2.5 px-3 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                stateValue === 0
                  ? 'bg-slate-700 text-white shadow-md ring-2 ring-slate-600/30'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/60'
              }`}
            >
              <X className="w-3.5 h-3.5" />
              <span>KAPAT (0)</span>
            </button>
          </div>
        )}

        {/* 2. ANALOG / PWM: Slider & Direct Value Input */}
        {isAnalogOrPwm && (
          <div className="space-y-2.5 bg-white dark:bg-slate-950/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-800/80">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                <Activity className="w-3 h-3 text-indigo-500" />
                <span>Sinyal Değeri:</span>
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={output.minValue ?? 0}
                  max={output.maxValue ?? 100}
                  disabled={!canControl || isSending}
                  value={sliderDraft ?? currentAnalogValue}
                  onChange={(e) => {
                    const v = Math.min(
                      output.maxValue ?? 100,
                      Math.max(output.minValue ?? 0, Number(e.target.value))
                    );
                    onSliderDraftChange(v);
                  }}
                  className="w-16 px-2 py-0.5 text-right font-mono font-bold text-xs bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-indigo-600 dark:text-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <span className="font-bold text-slate-500 text-xs">{output.unit || '%'}</span>
              </div>
            </div>

            {/* Range Slider */}
            <input
              type="range"
              min={output.minValue ?? 0}
              max={output.maxValue ?? 100}
              step={1}
              disabled={!canControl || isSending}
              value={sliderDraft ?? currentAnalogValue}
              onChange={(e) => onSliderDraftChange(Number(e.target.value))}
              onMouseUp={() => {
                const val = sliderDraft ?? currentAnalogValue;
                onSendCommand(output.id, 'SET_OUTPUT', val, output.unit || '%');
              }}
              onTouchEnd={() => {
                const val = sliderDraft ?? currentAnalogValue;
                onSendCommand(output.id, 'SET_OUTPUT', val, output.unit || '%');
              }}
              className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600 disabled:opacity-50"
            />

            {/* Quick Preset Buttons */}
            <div className="flex items-center justify-between gap-1 pt-1">
              {[0, 25, 50, 75, 100].map((percent) => {
                const min = output.minValue ?? 0;
                const max = output.maxValue ?? 100;
                const calculatedVal = Math.round(min + (max - min) * (percent / 100));
                const isCurrent = (sliderDraft ?? currentAnalogValue) === calculatedVal;

                return (
                  <button
                    key={percent}
                    type="button"
                    disabled={!canControl || isSending}
                    onClick={() => {
                      onSliderDraftChange(calculatedVal);
                      onSendCommand(output.id, 'SET_OUTPUT', calculatedVal, output.unit || '%');
                    }}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                      isCurrent
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    %{percent}
                  </button>
                );
              })}
            </div>

            {/* Submit Value Button */}
            <button
              type="button"
              disabled={!canControl || isSending}
              onClick={() => {
                const val = sliderDraft ?? currentAnalogValue;
                onSendCommand(output.id, 'SET_OUTPUT', val, output.unit || '%');
              }}
              className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Check className="w-3 h-3" />
              <span>Uygula ({sliderDraft ?? currentAnalogValue} {output.unit || '%'})</span>
            </button>
          </div>
        )}

        {/* Status Message Banner */}
        {ctrlState.message && (
          <div
            className={`p-2 rounded-xl text-[11px] font-medium flex items-center gap-1.5 ${
              isSuccess
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : isFailed
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                : isTimeout
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
            }`}
          >
            {isSuccess ? (
              <CheckCircle2 className="w-3 h-3 shrink-0" />
            ) : isFailed ? (
              <AlertTriangle className="w-3 h-3 shrink-0" />
            ) : isTimeout ? (
              <Clock className="w-3 h-3 shrink-0" />
            ) : (
              <RefreshCw className="w-3 h-3 shrink-0 animate-spin" />
            )}
            <span className="truncate">{ctrlState.message}</span>
          </div>
        )}
      </div>
    </div>
  );
};
