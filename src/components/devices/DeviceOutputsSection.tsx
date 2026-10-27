import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Device, DeviceOutputDefinition, OutputType, DeviceCommand } from '../../types';
import { useRealtime } from '../../context/RealtimeContext';
import { Sliders, Clock, ChevronDown, ChevronUp, Plus, Lock } from 'lucide-react';
import { OutputControlCard } from './outputs/OutputControlCard';
import { AddOutputModal } from './outputs/AddOutputModal';
import { OutputHistoryDrawer } from './outputs/OutputHistoryDrawer';
import type { OutputControlState, CommandActionStatus } from './outputs/types';

export type { CommandActionStatus, OutputControlState };

interface DeviceOutputsSectionProps {
  device: Device;
  currentUserRole?: string;
  currentUserId?: string;
  onDeviceUpdated?: (updatedDev: Device) => void;
}

// Default standard output templates if device does not have explicit outputDefinitions
export const DEFAULT_OUTPUTS_FALLBACK: DeviceOutputDefinition[] = [
  {
    id: 'relay_1',
    name: 'Ana Güç Rölesi (Relay 1)',
    type: 'relay',
    pin: 26,
    activeLow: true,
    initialState: 'LOW',
    unit: 'DURUM',
    description: '220V Ana Yük / Kontaktör Kontrolü',
  },
  {
    id: 'relay_2',
    name: 'Yardımcı Röle / Pompa (Relay 2)',
    type: 'relay',
    pin: 27,
    activeLow: true,
    initialState: 'LOW',
    unit: 'DURUM',
    description: 'Saha Dalgıç Pompa / Valf Çıkışı',
  },
  {
    id: 'digital_1',
    name: 'Sistem Durum LED / Siren (Digital 1)',
    type: 'digital',
    pin: 2,
    activeLow: false,
    initialState: 0,
    unit: 'DURUM',
    description: 'Saha Uyarı İkaz & Durum Çıkışı',
  },
  {
    id: 'pwm_1',
    name: 'Hız / Dimmer Sürücü (PWM 1)',
    type: 'pwm',
    pin: 18,
    minValue: 0,
    maxValue: 100,
    pwmChannel: 0,
    pwmFreq: 5000,
    pwmResolution: 8,
    unit: '%',
    currentValue: 0,
    description: 'Fan / Motor Hız Kontrolü & Aydınlatma Dimmer',
  },
  {
    id: 'analog_1',
    name: 'Analog Referans Çıkışı (DAC 1)',
    type: 'analog',
    pin: 25,
    minValue: 0,
    maxValue: 100,
    unit: '%',
    currentValue: 0,
    description: '0-3.3V Analog Sinyal Referansı (ESP32 DAC)',
  },
];

export const DeviceOutputsSection: React.FC<DeviceOutputsSectionProps> = ({
  device,
  currentUserRole,
  currentUserId,
  onDeviceUpdated,
}) => {
  const { sendControlCommand, updateDevice, subscribeWsEvent } = useRealtime();

  // Multi-tenant permission validation
  const isAdmin = currentUserRole === 'admin';
  const isOwner = device.tenantId === currentUserId;
  const isViewer = currentUserRole === 'viewer' || currentUserRole === 'analyst';
  const canControl = (isAdmin || isOwner) && !isViewer;

  // Local output definitions (derived from device or fallback)
  const outputs: DeviceOutputDefinition[] = useMemo(() => {
    if (device.outputDefinitions && device.outputDefinitions.length > 0) {
      return device.outputDefinitions;
    }
    if (device.capabilities?.outputs && device.capabilities.outputs.length > 0) {
      return device.capabilities.outputs;
    }
    return DEFAULT_OUTPUTS_FALLBACK;
  }, [device]);

  // Live output control states (per outputId)
  const [controlStates, setControlStates] = useState<Record<string, OutputControlState>>({});
  const [sliderDrafts, setSliderDrafts] = useState<Record<string, number>>({});
  const [recentCommands, setRecentCommands] = useState<DeviceCommand[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAddOutputModal, setShowAddOutputModal] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'relay' | 'digital' | 'pwm' | 'analog'>('all');

  // New output form state
  const [newOutput, setNewOutput] = useState<Partial<DeviceOutputDefinition>>({
    id: '',
    name: '',
    type: 'relay',
    pin: 19,
    minValue: 0,
    maxValue: 100,
    unit: '%',
    activeLow: true,
  });

  // Timeouts ref for tracking 10s command timeouts
  const timeoutTimersRef = useRef<Record<string, NodeJS.Timeout | number>>({});

  // Initialize draft values from device metrics or current values
  useEffect(() => {
    const initialDrafts: Record<string, number> = {};
    outputs.forEach((out) => {
      const metricVal = device.metrics?.[out.id as keyof typeof device.metrics];
      const val = typeof metricVal === 'number' ? metricVal : typeof out.currentValue === 'number' ? out.currentValue : 0;
      initialDrafts[out.id] = val;
    });
    setSliderDrafts((prev) => ({ ...initialDrafts, ...prev }));
  }, [outputs, device.metrics]);

  // Fetch recent command history for this device
  const fetchCommandHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const res = await fetch(`/api/devices/${encodeURIComponent(device.id)}/commands?limit=20`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setRecentCommands(data);
        }
      }
    } catch (e) {
      console.error('Fetch command history error:', e);
    } finally {
      setLoadingHistory(false);
    }
  }, [device.id]);

  useEffect(() => {
    fetchCommandHistory();
  }, [fetchCommandHistory]);

  // WebSocket real-time command lifecycle listener
  useEffect(() => {
    const unsubscribeCreated = subscribeWsEvent('command:created', (payload: any) => {
      const cmd = payload?.command || payload;
      if (!cmd || cmd.deviceId !== device.id) return;

      setRecentCommands((prev) => {
        const exists = prev.some((c) => c.id === cmd.id);
        return exists ? prev.map((c) => (c.id === cmd.id ? { ...c, ...cmd } : c)) : [cmd, ...prev.slice(0, 19)];
      });
    });

    const unsubscribeAck = subscribeWsEvent('command:acknowledged', (payload: any) => {
      const cmd = payload?.command || payload;
      if (!cmd || cmd.deviceId !== device.id) return;

      setRecentCommands((prev) =>
        prev.map((c) => (c.id === cmd.id ? { ...c, status: 'acknowledged', acknowledgedAt: new Date().toISOString() } : c))
      );
    });

    const unsubscribeExecuted = subscribeWsEvent('command:executed', (payload: any) => {
      const cmd = payload?.command || payload;
      if (!cmd || cmd.deviceId !== device.id) return;

      setRecentCommands((prev) =>
        prev.map((c) => (c.id === cmd.id ? { ...c, status: 'executed', executedAt: cmd.executedAt || new Date().toISOString() } : c))
      );

      const outputKey = cmd.outputId || (cmd.commandType?.startsWith('SET_') ? cmd.commandType.replace('SET_', '').toLowerCase() : undefined);

      if (outputKey) {
        if (timeoutTimersRef.current[outputKey]) {
          clearTimeout(timeoutTimersRef.current[outputKey]);
          delete timeoutTimersRef.current[outputKey];
        }

        setControlStates((prev) => {
          const sentTime = prev[outputKey]?.sentAt || Date.now() - 150;
          const duration = Date.now() - sentTime;
          return {
            ...prev,
            [outputKey]: {
              outputId: outputKey,
              status: 'başarılı',
              lastValue: cmd.value ?? cmd.payload,
              commandId: cmd.id,
              message: `Başarıyla uygulandı (${duration}ms)`,
              sentAt: sentTime,
              completedAt: Date.now(),
              durationMs: duration,
            },
          };
        });

        setTimeout(() => {
          setControlStates((prev) => {
            if (prev[outputKey]?.status === 'başarılı') {
              return {
                ...prev,
                [outputKey]: { ...prev[outputKey], status: 'idle', message: undefined },
              };
            }
            return prev;
          });
        }, 4000);
      }
    });

    const unsubscribeFailed = subscribeWsEvent('command:failed', (payload: any) => {
      const cmd = payload?.command || payload;
      if (!cmd || cmd.deviceId !== device.id) return;

      setRecentCommands((prev) =>
        prev.map((c) => (c.id === cmd.id ? { ...c, status: 'failed', errorMessage: cmd.errorMessage } : c))
      );

      const outputKey = cmd.outputId;
      if (outputKey) {
        if (timeoutTimersRef.current[outputKey]) {
          clearTimeout(timeoutTimersRef.current[outputKey]);
          delete timeoutTimersRef.current[outputKey];
        }

        setControlStates((prev) => ({
          ...prev,
          [outputKey]: {
            outputId: outputKey,
            status: 'başarısız',
            commandId: cmd.id,
            message: cmd.errorMessage || 'Donanım komut yürütme hatası!',
            completedAt: Date.now(),
          },
        }));

        setTimeout(() => {
          setControlStates((prev) => {
            if (prev[outputKey]?.status === 'başarısız') {
              return {
                ...prev,
                [outputKey]: { ...prev[outputKey], status: 'idle', message: undefined },
              };
            }
            return prev;
          });
        }, 6000);
      }
    });

    const unsubscribeControl = subscribeWsEvent('device:control', (payload: any) => {
      if (!payload || payload.deviceId !== device.id) return;
      const outputKey = payload.outputPin;
      if (outputKey) {
        setControlStates((prev) => ({
          ...prev,
          [outputKey]: {
            outputId: outputKey,
            status: 'başarılı',
            lastValue: payload.value,
            message: 'Sinyal iletildi',
            sentAt: Date.now() - 50,
            completedAt: Date.now(),
            durationMs: 50,
          },
        }));

        setTimeout(() => {
          setControlStates((prev) => {
            if (prev[outputKey]?.status === 'başarılı') {
              return { ...prev, [outputKey]: { ...prev[outputKey], status: 'idle' } };
            }
            return prev;
          });
        }, 3500);
      }
    });

    return () => {
      unsubscribeCreated();
      unsubscribeAck();
      unsubscribeExecuted();
      unsubscribeFailed();
      unsubscribeControl();
      Object.values(timeoutTimersRef.current).forEach((t) => {
        if (t) clearTimeout(t as any);
      });
    };
  }, [device.id, subscribeWsEvent]);

  // Dispatch output command
  const handleSendCommand = async (
    outputId: string,
    commandType: string,
    value: string | number,
    unit?: string
  ) => {
    if (!canControl) return;

    const sentTimestamp = Date.now();

    // Set state to 'gönderiliyor'
    setControlStates((prev) => ({
      ...prev,
      [outputId]: {
        outputId,
        status: 'gönderiliyor',
        lastValue: value,
        sentAt: sentTimestamp,
        message: 'Komut cihaza gönderiliyor...',
      },
    }));

    // Start 10-second timeout timer
    if (timeoutTimersRef.current[outputId]) {
      clearTimeout(timeoutTimersRef.current[outputId]);
    }

    timeoutTimersRef.current[outputId] = setTimeout(() => {
      setControlStates((prev) => {
        if (prev[outputId]?.status === 'gönderiliyor') {
          return {
            ...prev,
            [outputId]: {
              outputId,
              status: 'timeout',
              message: 'Zaman aşımı! Saha cihazından 10 saniye içinde ACK onayı alınamadı.',
              completedAt: Date.now(),
            },
          };
        }
        return prev;
      });

      // Clear timeout status after 6 seconds
      setTimeout(() => {
        setControlStates((prev) => {
          if (prev[outputId]?.status === 'timeout') {
            return { ...prev, [outputId]: { ...prev[outputId], status: 'idle', message: undefined } };
          }
          return prev;
        });
      }, 6000);
    }, 10000);

    try {
      const response = await sendControlCommand(device.id, commandType, value, outputId, unit);
      if (response && response.command) {
        setRecentCommands((prev) => [response.command, ...prev.filter((c) => c.id !== response.command.id).slice(0, 19)]);
      }
    } catch (err: any) {
      if (timeoutTimersRef.current[outputId]) {
        clearTimeout(timeoutTimersRef.current[outputId]);
        delete timeoutTimersRef.current[outputId];
      }
      setControlStates((prev) => ({
        ...prev,
        [outputId]: {
          outputId,
          status: 'başarısız',
          message: err.message || 'Komut gönderilirken hata oluştu.',
          completedAt: Date.now(),
        },
      }));
    }
  };

  // Add custom output definition to device
  const handleSaveNewOutput = async () => {
    if (!newOutput.id || !newOutput.name) return;
    const cleanId = newOutput.id.trim().toLowerCase().replace(/\s+/g, '_');
    const updatedList: DeviceOutputDefinition[] = [
      ...outputs.filter((o) => o.id !== cleanId),
      {
        id: cleanId,
        name: newOutput.name.trim(),
        type: (newOutput.type as OutputType) || 'relay',
        pin: newOutput.pin ? Number(newOutput.pin) : undefined,
        minValue: newOutput.minValue !== undefined ? Number(newOutput.minValue) : 0,
        maxValue: newOutput.maxValue !== undefined ? Number(newOutput.maxValue) : 100,
        unit: newOutput.unit || (newOutput.type === 'pwm' ? '%' : newOutput.type === 'analog' ? 'V' : 'DURUM'),
        activeLow: newOutput.activeLow,
        description: newOutput.description,
      },
    ];

    try {
      const updated = await updateDevice(device.id, {
        outputDefinitions: updatedList,
      });
      if (onDeviceUpdated) onDeviceUpdated(updated);
      setShowAddOutputModal(false);
      setNewOutput({
        id: '',
        name: '',
        type: 'relay',
        pin: 19,
        minValue: 0,
        maxValue: 100,
        unit: '%',
        activeLow: true,
      });
    } catch (e: any) {
      alert(e.message || 'Çıkış tanımı kaydedilemedi.');
    }
  };

  // Filtered outputs
  const filteredOutputs = outputs.filter((o) => {
    if (activeFilter === 'all') return true;
    return o.type === activeFilter;
  });

  return (
    <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xl space-y-5 transition-all">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-indigo-500/10 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shadow-xs">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Cihaz Çıkışları & Aktüatör Kontrolü</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  {outputs.length} Çıkış
                </span>
              </h3>
              {device.status === 'online' ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  <span>Çevrim İçi</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  <span>Çevrimdışı (Kuyruğa Alınır)</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Röle, dijital GPIO, analog ve PWM sürücü çıkışlarını anlık olarak tetikleyin.
            </p>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Output Type Filter Tabs */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 text-[11px] font-bold">
            {(['all', 'relay', 'digital', 'pwm', 'analog'] as const).map((filterType) => (
              <button
                key={filterType}
                type="button"
                onClick={() => setActiveFilter(filterType)}
                className={`px-2.5 py-1 rounded-xl transition cursor-pointer ${
                  activeFilter === filterType
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {filterType === 'all'
                  ? 'Tümü'
                  : filterType === 'relay'
                  ? 'Röle'
                  : filterType === 'digital'
                  ? 'Dijital'
                  : filterType === 'pwm'
                  ? 'PWM'
                  : 'Analog'}
              </button>
            ))}
          </div>

          {/* History Toggle Button */}
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className={`px-3 py-1.5 rounded-2xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer ${
              showHistory
                ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700/60 hover:bg-slate-200'
            }`}
            title="Komut ve ACK kayıt geçmişini göster/gizle"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>ACK Geçmişi</span>
            {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {/* Add Custom Output Button (Admins & Owners) */}
          {canControl && (
            <button
              type="button"
              onClick={() => setShowAddOutputModal(true)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-bold shadow-md shadow-indigo-600/20 flex items-center gap-1.5 transition cursor-pointer active:scale-95"
              title="Yeni Saha Çıkışı Tanımla"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Çıkış Tanımla</span>
            </button>
          )}
        </div>
      </div>

      {/* Permission Warning if Read-Only / Unauthorized */}
      {!canControl && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center gap-2.5 text-xs text-amber-700 dark:text-amber-400">
          <Lock className="w-4 h-4 shrink-0" />
          <span>
            Salt-Okunur Erişim: Yalnızca cihazın yetkili sahibi veya sistem yöneticisi çıkış komutu gönderebilir.
          </span>
        </div>
      )}

      {/* Outputs Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredOutputs.map((out) => (
          <OutputControlCard
            key={out.id}
            device={device}
            output={out}
            ctrlState={controlStates[out.id] || { outputId: out.id, status: 'idle' }}
            canControl={canControl}
            sliderDraft={sliderDrafts[out.id]}
            onSliderDraftChange={(val) => setSliderDrafts((prev) => ({ ...prev, [out.id]: val }))}
            onSendCommand={handleSendCommand}
          />
        ))}
      </div>

      {/* Recent Commands & ACK History Drawer */}
      {showHistory && (
        <OutputHistoryDrawer
          recentCommands={recentCommands}
          loadingHistory={loadingHistory}
          onRefresh={fetchCommandHistory}
        />
      )}

      {/* Modal: Define New Custom Output */}
      {showAddOutputModal && (
        <AddOutputModal
          device={device}
          newOutput={newOutput}
          onNewOutputChange={setNewOutput}
          onSave={handleSaveNewOutput}
          onClose={() => setShowAddOutputModal(false)}
        />
      )}
    </div>
  );
};
export default DeviceOutputsSection;
