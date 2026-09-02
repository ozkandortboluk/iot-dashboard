import React, { useState, useEffect, useRef } from 'react';
import type { WidgetConfig, CustomPanelItem } from '../../types';
import { useRealtime } from '../../context/RealtimeContext';
import { 
  Settings, 
  Plus, 
  Power, 
  Sliders, 
  Zap, 
  Activity, 
  Lightbulb, 
  Radio, 
  Check, 
  AlertCircle, 
  RotateCw,
  Palette,
  Eye,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import { DeviceStatusDot } from './DeviceStatusDot';

interface CustomPanelWidgetProps {
  config: WidgetConfig;
  onEdit?: () => void;
}

export const CustomPanelWidget: React.FC<CustomPanelWidgetProps> = ({ config, onEdit }) => {
  const { latestTelemetry, devices, sendControlCommand } = useRealtime();
  
  // Pending request trackers & transient feedback per item
  const [loadingItems, setLoadingItems] = useState<Record<string, boolean>>({});
  const [feedbackItems, setFeedbackItems] = useState<Record<string, { type: 'success' | 'error'; message: string }>>({});
  const [localSliderValues, setLocalSliderValues] = useState<Record<string, number>>({});
  const [pulseActiveItems, setPulseActiveItems] = useState<Record<string, boolean>>({});

  const sliderDebounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

  const items = config.customPanelItems || [];

  // Helper to extract the latest live value for a specific device and metric
  const getLiveMetricValue = (item: CustomPanelItem) => {
    const targetDev = devices.find((d) => d.id === item.deviceId || d.apiKey === item.deviceId);
    
    // 1. Search latest telemetry stream (newest first)
    if (Array.isArray(latestTelemetry) && latestTelemetry.length > 0) {
      const match = latestTelemetry.find((t) => {
        const devMatch = targetDev 
          ? (t.deviceId === targetDev.id || t.deviceId === targetDev.apiKey || t.deviceId === item.deviceId)
          : (t.deviceId === item.deviceId);
        return devMatch && t.metric && t.metric.toLowerCase() === item.metricKey.toLowerCase();
      });
      if (match && match.value !== undefined) {
        return match.value;
      }
    }

    // 2. Check device metrics cache
    if (targetDev && targetDev.metrics) {
      const matchKey = Object.keys(targetDev.metrics).find(
        (k) => k.toLowerCase() === item.metricKey.toLowerCase()
      );
      if (matchKey && (targetDev.metrics as Record<string, any>)[matchKey] !== undefined) {
        return (targetDev.metrics as Record<string, any>)[matchKey];
      }
    }

    return undefined;
  };

  // Dispatch control command to ESP32 / IoT device
  const handleControl = async (item: CustomPanelItem, targetValue: any, explicitCommand?: string) => {
    const targetDev = devices.find((d) => d.id === item.deviceId || d.apiKey === item.deviceId);
    if (!targetDev) {
      setFeedbackItems((prev) => ({
        ...prev,
        [item.id]: { type: 'error', message: 'Cihaz bulunamadı' },
      }));
      setTimeout(() => {
        setFeedbackItems((prev) => {
          const updated = { ...prev };
          delete updated[item.id];
          return updated;
        });
      }, 3000);
      return;
    }

    setLoadingItems((prev) => ({ ...prev, [item.id]: true }));
    const commandName = explicitCommand || item.command || item.metricKey || 'SET_OUTPUT';
    const pinName = item.metricKey || 'OUT_1';

    try {
      if (sendControlCommand) {
        await sendControlCommand(
          targetDev.id,
          commandName,
          targetValue,
          pinName,
          item.unit || (typeof targetValue === 'number' ? '%' : 'STATE')
        );
      }

      setFeedbackItems((prev) => ({
        ...prev,
        [item.id]: { type: 'success', message: `İletildi: ${targetValue}` },
      }));

      // If pulse mode, trigger pulse visual state and auto-reset
      if (item.buttonMode === 'pulse') {
        setPulseActiveItems((prev) => ({ ...prev, [item.id]: true }));
        setTimeout(() => {
          setPulseActiveItems((prev) => ({ ...prev, [item.id]: false }));
        }, 700);
      }
    } catch (err: any) {
      console.error('CustomPanelWidget control failed:', err);
      setFeedbackItems((prev) => ({
        ...prev,
        [item.id]: { type: 'error', message: err.message || 'Komut iletilemedi' },
      }));
    } finally {
      setTimeout(() => {
        setLoadingItems((prev) => ({ ...prev, [item.id]: false }));
      }, 400);

      setTimeout(() => {
        setFeedbackItems((prev) => {
          const updated = { ...prev };
          delete updated[item.id];
          return updated;
        });
      }, 2500);
    }
  };

  // Slider change handler with debouncing
  const handleSliderChange = (item: CustomPanelItem, val: number) => {
    setLocalSliderValues((prev) => ({ ...prev, [item.id]: val }));

    if (sliderDebounceTimers.current[item.id]) {
      clearTimeout(sliderDebounceTimers.current[item.id]);
    }

    sliderDebounceTimers.current[item.id] = setTimeout(() => {
      handleControl(item, val);
    }, 250);
  };

  // Compute Tailwind col-span class based on item.colSpan (1 to 4)
  const getColSpanClass = (span?: number, defaultSpan: number = 1) => {
    const s = span || defaultSpan;
    switch (s) {
      case 1:
        return 'col-span-1';
      case 2:
        return 'col-span-1 sm:col-span-2';
      case 3:
        return 'col-span-1 sm:col-span-2 md:col-span-3';
      case 4:
      default:
        return 'col-span-1 sm:col-span-2 md:col-span-4';
    }
  };

  // Clean glass / dark / light wrapper styles
  const isGlass = config.displayStyle === 'glass';
  const isNeon = config.displayStyle === 'neon';
  const isFlat = config.displayStyle === 'flat';

  return (
    <div
      id={`custom_panel_${config.id}`}
      className={`h-full w-full rounded-3xl flex flex-col p-4 sm:p-5 transition-all duration-300 relative overflow-hidden ${
        isGlass
          ? 'bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/40 dark:border-slate-800/80 shadow-lg'
          : isNeon
          ? 'bg-slate-950 border border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.15)] text-white'
          : isFlat
          ? 'bg-slate-100 dark:bg-slate-800/90 border-0'
          : 'bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 shadow-md'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-sm flex-shrink-0"
            style={{ backgroundColor: config.colorScheme || '#3b82f6' }}
          >
            <Sliders className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm tracking-tight truncate">
              {config.title || 'Özel Kontrol Paneli'}
            </h3>
            <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              {items.length} Mini Kontrol / Gösterge
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {onEdit && (
            <button
              onClick={onEdit}
              title="Paneli Yapılandır"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Body Area */}
      <div className="flex-1 overflow-y-auto pr-1 -mr-1 custom-scrollbar">
        {items.length === 0 ? (
          <div className="h-full min-h-[160px] flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 dark:text-indigo-400 flex items-center justify-center mb-3 shadow-inner">
              <Sliders className="w-6 h-6" />
            </div>
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Özel Kontrol Paneli Boş
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs mb-4">
              Bu panele farklı ESP32/ESP8266 cihazlarınız için butonlar, kaydırıcılar, lambalar, anahtarlar ve canlı sensör etiketleri ekleyebilirsiniz.
            </p>
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md transition-all"
              >
                <Plus className="w-3.5 h-3.5" /> Mini Widget Ekle
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {items.map((item) => {
              const targetDev = devices.find((d) => d.id === item.deviceId || d.apiKey === item.deviceId);
              const liveValue = getLiveMetricValue(item);
              const isLoading = !!loadingItems[item.id];
              const feedback = feedbackItems[item.id];
              const isPulse = !!pulseActiveItems[item.id];

              const currentNumber = typeof liveValue === 'number' 
                ? liveValue 
                : Number(liveValue) || 0;

              const isTruthy = liveValue !== undefined && 
                liveValue !== 0 && 
                liveValue !== '0' && 
                liveValue !== false && 
                liveValue !== 'OFF' && 
                liveValue !== 'LOW';

              // Render item based on type
              switch (item.type) {
                case 'button': {
                  const isToggle = item.buttonMode === 'toggle';
                  const isBtnActive = isToggle ? isTruthy : isPulse;
                  const buttonCol = getColSpanClass(item.colSpan, 1);
                  const btnColor = item.color || '#3b82f6';

                  return (
                    <div
                      key={item.id}
                      className={`${buttonCol} flex flex-col justify-between p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 relative group transition hover:border-slate-300 dark:hover:border-slate-700`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate max-w-[80%]" title={item.label}>
                          {item.label || 'Buton'}
                        </span>
                        <DeviceStatusDot deviceId={item.deviceId} device={targetDev} />
                      </div>

                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => {
                          if (isToggle) {
                            const nextVal = isTruthy ? (item.valueOff ?? 0) : (item.valueOn ?? 1);
                            handleControl(item, nextVal);
                          } else {
                            handleControl(item, item.valueOn ?? 1);
                          }
                        }}
                        className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 ${
                          isLoading ? 'opacity-60 cursor-wait' : 'hover:shadow-md'
                        }`}
                        style={{
                          backgroundColor: isBtnActive ? btnColor : `${btnColor}18`,
                          color: isBtnActive ? '#ffffff' : btnColor,
                          border: `1.5px solid ${btnColor}`,
                        }}
                      >
                        {isLoading ? (
                          <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        ) : isBtnActive ? (
                          <Zap className="w-3.5 h-3.5 fill-current" />
                        ) : (
                          <Power className="w-3.5 h-3.5" />
                        )}
                        <span className="truncate">
                          {isToggle ? (isTruthy ? 'AÇIK (Kapat)' : 'KAPALI (Aç)') : item.label || 'Tetikle'}
                        </span>
                      </button>

                      {feedback && (
                        <div className={`mt-1 text-[10px] text-center font-bold animate-fade-in ${feedback.type === 'error' ? 'text-red-500' : 'text-emerald-500'}`}>
                          {feedback.message}
                        </div>
                      )}
                    </div>
                  );
                }

                case 'switch': {
                  const switchCol = getColSpanClass(item.colSpan, 1);
                  const isChecked = isTruthy;
                  const switchColor = item.color || '#10b981';

                  return (
                    <div
                      key={item.id}
                      className={`${switchCol} flex items-center justify-between p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 relative group transition hover:border-slate-300 dark:hover:border-slate-700`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <DeviceStatusDot deviceId={item.deviceId} device={targetDev} />
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate" title={item.label}>
                            {item.label || 'Röle Anahtarı'}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
                          {isChecked ? 'DURUM: AKTİF' : 'DURUM: PASİF'}
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => {
                          const nextVal = isChecked ? (item.valueOff ?? 0) : (item.valueOn ?? 1);
                          handleControl(item, nextVal);
                        }}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          isLoading ? 'opacity-60 cursor-wait' : ''
                        }`}
                        style={{
                          backgroundColor: isChecked ? switchColor : '#cbd5e1',
                        }}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                            isChecked ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  );
                }

                case 'slider': {
                  const sliderCol = getColSpanClass(item.colSpan, 2);
                  const min = item.min ?? 0;
                  const max = item.max ?? 100;
                  const step = item.step ?? 1;
                  const currentVal = localSliderValues[item.id] !== undefined 
                    ? localSliderValues[item.id] 
                    : currentNumber;
                  const sliderColor = item.color || '#3b82f6';

                  return (
                    <div
                      key={item.id}
                      className={`${sliderCol} p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 relative group transition hover:border-slate-300 dark:hover:border-slate-700`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <DeviceStatusDot deviceId={item.deviceId} device={targetDev} />
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">
                            {item.label || 'Analog Sürgü'}
                          </span>
                        </div>
                        <span
                          className="text-xs font-black px-2 py-0.5 rounded-md font-mono"
                          style={{
                            backgroundColor: `${sliderColor}18`,
                            color: sliderColor,
                          }}
                        >
                          {currentVal} {item.unit || ''}
                        </span>
                      </div>

                      <div className="relative flex items-center py-1">
                        <input
                          type="range"
                          min={min}
                          max={max}
                          step={step}
                          value={currentVal}
                          disabled={isLoading}
                          onChange={(e) => handleSliderChange(item, Number(e.target.value))}
                          className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-slate-200 dark:bg-slate-700 accent-blue-600 focus:outline-none"
                          style={{ accentColor: sliderColor }}
                        />
                      </div>

                      <div className="flex justify-between text-[9px] text-slate-400 font-mono mt-1">
                        <span>{min}</span>
                        <span>{max}</span>
                      </div>

                      {feedback && (
                        <div className="text-[10px] text-center font-bold text-emerald-500 mt-1">
                          {feedback.message}
                        </div>
                      )}
                    </div>
                  );
                }

                case 'indicator': {
                  const indicatorCol = getColSpanClass(item.colSpan, 1);
                  const isOn = isTruthy;
                  const lampColor = item.color || '#10b981';

                  return (
                    <div
                      key={item.id}
                      className={`${indicatorCol} flex items-center justify-between p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 relative group transition hover:border-slate-300 dark:hover:border-slate-700`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <DeviceStatusDot deviceId={item.deviceId} device={targetDev} />
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate" title={item.label}>
                            {item.label || 'Durum Lambası'}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {isOn ? 'AÇIK / AKTİF' : 'KAPALI'}
                        </span>
                      </div>

                      <div className="relative flex items-center justify-center p-1">
                        <div
                          className={`w-5 h-5 rounded-full transition-all duration-300 ${
                            isOn ? 'shadow-lg scale-110' : 'opacity-40'
                          }`}
                          style={{
                            backgroundColor: isOn ? lampColor : '#94a3b8',
                            boxShadow: isOn ? `0 0 14px ${lampColor}, inset 0 0 4px rgba(255,255,255,0.6)` : 'none',
                          }}
                        />
                        {isOn && (
                          <span
                            className="absolute w-7 h-7 rounded-full animate-ping opacity-30"
                            style={{ backgroundColor: lampColor }}
                          />
                        )}
                      </div>
                    </div>
                  );
                }

                case 'label': {
                  const labelCol = getColSpanClass(item.colSpan, 2);
                  const textColor = item.color || '#0f172a';
                  const displayStr = liveValue !== undefined ? String(liveValue) : '--';

                  return (
                    <div
                      key={item.id}
                      className={`${labelCol} p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 relative group transition hover:border-slate-300 dark:hover:border-slate-700 flex flex-col justify-between`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <DeviceStatusDot deviceId={item.deviceId} device={targetDev} />
                          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">
                            {item.label || item.metricKey}
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-400 font-mono truncate max-w-[40%]">
                          {targetDev?.name || 'ESP'}
                        </span>
                      </div>

                      <div className="flex items-baseline gap-1 mt-1">
                        {item.prefix && (
                          <span className="text-xs text-slate-400 font-medium">{item.prefix}</span>
                        )}
                        <span
                          className="text-lg sm:text-xl font-black font-mono tracking-tight text-slate-900 dark:text-white truncate"
                          style={{ color: item.color }}
                        >
                          {displayStr}
                        </span>
                        {item.unit && (
                          <span className="text-xs font-bold text-slate-400 dark:text-slate-500">
                            {item.unit}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }

                case 'color_picker': {
                  const colorCol = getColSpanClass(item.colSpan, 2);
                  const activeHex = typeof liveValue === 'string' && liveValue.startsWith('#') ? liveValue : (item.color || '#3b82f6');
                  const presetColors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff'];

                  return (
                    <div
                      key={item.id}
                      className={`${colorCol} p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 relative group transition hover:border-slate-300 dark:hover:border-slate-700`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <DeviceStatusDot deviceId={item.deviceId} device={targetDev} />
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">
                            {item.label || 'RGB Renk Paleti'}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 font-bold uppercase">
                          {activeHex}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Native Color Picker Circle */}
                        <div className="relative flex-shrink-0">
                          <input
                            type="color"
                            disabled={isLoading}
                            value={activeHex}
                            onChange={(e) => handleControl(item, e.target.value)}
                            className="w-8 h-8 rounded-full border-2 border-white dark:border-slate-700 shadow-md cursor-pointer appearance-none bg-transparent overflow-hidden"
                          />
                        </div>

                        {/* Quick Preset Palette */}
                        <div className="flex items-center gap-1 flex-wrap flex-1">
                          {presetColors.map((c) => (
                            <button
                              key={c}
                              type="button"
                              disabled={isLoading}
                              onClick={() => handleControl(item, c)}
                              style={{ backgroundColor: c }}
                              className={`w-5 h-5 rounded-full border border-black/10 dark:border-white/20 transition-transform hover:scale-110 active:scale-95 ${
                                activeHex.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-blue-500 scale-105' : ''
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      {feedback && (
                        <div className="text-[10px] text-center font-bold text-emerald-500 mt-1">
                          {feedback.message}
                        </div>
                      )}
                    </div>
                  );
                }

                default:
                  return null;
              }
            })}
          </div>
        )}
      </div>
    </div>
  );
};
