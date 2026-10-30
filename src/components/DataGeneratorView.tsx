import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { apiFetch as fetch, safeJson } from '../lib/apiFetch';
import {
  Cpu,
  Activity,
  Zap,
  Flame,
  Radio,
  Sliders,
  Send,
  ShieldAlert,
  Terminal,
  RefreshCw,
  Clock,
  Layers,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Play,
  Pause,
  Download,
  Trash2,
  TrendingUp,
  Shield,
  Gauge,
  SlidersHorizontal,
  FileJson,
  FileSpreadsheet,
} from 'lucide-react';
import { COMMON_UNITS, getMetricUnit, exportToCSV, exportToJSON } from '../lib/utils';

export interface DataGeneratorViewProps {
  onNavigateToDevices?: () => void;
}

export const DataGeneratorView: React.FC<DataGeneratorViewProps> = ({
  onNavigateToDevices,
}) => {
  const { user } = useAuth();
  const { devices, simulationTelemetry, simulatorActive, toggleSimulator } = useRealtime();

  // Admin Role Check
  const isAdmin = user?.role === 'admin';

  // State for manual injection
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [injectionMode, setInjectionMode] = useState<'single' | 'composite'>('single');
  const [metricKey, setMetricKey] = useState<string>('temperature');
  const [customValue, setCustomValue] = useState<number>(37.5);
  const [customUnit, setCustomUnit] = useState<string>('°C');
  const [sending, setSending] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // State for Simulator Config
  const [intervalMs, setIntervalMs] = useState<number>(2000);
  const [anomalyRate, setAnomalyRate] = useState<number>(0.05);
  const [activeScenario, setActiveScenario] = useState<string>('normal');
  const [configSaving, setConfigSaving] = useState(false);

  // State for Batch Generation
  const [batchCount, setBatchCount] = useState<number>(10);
  const [batchSending, setBatchSending] = useState(false);

  // Console Log filters
  const [logFilterMetric, setLogFilterMetric] = useState<string>('all');
  const [logFilterDevice, setLogFilterDevice] = useState<string>('all');
  const [logPaused, setLogPaused] = useState<boolean>(false);
  const [clearedLogTimestamp, setClearedLogTimestamp] = useState<number>(0);
  const [frozenLogs, setFrozenLogs] = useState<typeof simulationTelemetry>([]);

  // Only allow simulated devices
  const simulatedDevices = useMemo(() => devices.filter((d) => d.isSimulated), [devices]);

  // Set default selected device once loaded
  useEffect(() => {
    if (simulatedDevices.length > 0) {
      if (!selectedDeviceId || !simulatedDevices.some((d) => d.id === selectedDeviceId)) {
        setSelectedDeviceId(simulatedDevices[0].id);
      }
    }
  }, [simulatedDevices, selectedDeviceId]);

  const activeLogs = useMemo(() => {
    if (logPaused) return frozenLogs;
    return simulationTelemetry
      .filter((l) => !clearedLogTimestamp || new Date(l.timestamp).getTime() > clearedLogTimestamp)
      .slice(0, 100);
  }, [logPaused, frozenLogs, simulationTelemetry, clearedLogTimestamp]);

  const filteredLogs = useMemo(() => {
    return activeLogs.filter((log) => {
      const matchMetric = logFilterMetric === 'all' || log.metric.toLowerCase().includes(logFilterMetric.toLowerCase());
      const matchDevice = logFilterDevice === 'all' || log.deviceId === logFilterDevice;
      return matchMetric && matchDevice;
    });
  }, [activeLogs, logFilterMetric, logFilterDevice]);

  const handleToggleLogPause = () => {
    if (!logPaused) {
      setFrozenLogs(
        simulationTelemetry
          .filter((l) => !clearedLogTimestamp || new Date(l.timestamp).getTime() > clearedLogTimestamp)
          .slice(0, 100)
      );
      setLogPaused(true);
    } else {
      setLogPaused(false);
    }
  };

  const handleClearLogs = () => {
    setClearedLogTimestamp(Date.now());
    setFrozenLogs([]);
  };

  // Fetch initial simulator status
  useEffect(() => {
    fetch('/api/simulator/status')
      .then((res) => safeJson<any>(res, null))
      .then((data) => {
        if (!data) return;
        if (data.simulatorIntervalMs) setIntervalMs(data.simulatorIntervalMs);
        if (data.anomalyProbability !== undefined) setAnomalyRate(data.anomalyProbability);
        if (data.activeScenario) setActiveScenario(data.activeScenario);
      })
      .catch(() => {});
  }, []);

  // Update Simulator Config on Server
  const saveSimulatorConfig = async (newInterval: number, newAnomaly: number, newScenario: string) => {
    if (!isAdmin) return;
    setConfigSaving(true);
    try {
      const res = await fetch('/api/simulator/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intervalMs: newInterval,
          anomalyRate: newAnomaly,
          scenario: newScenario,
          active: simulatorActive,
        }),
      });
      if (res.ok) {
        setSuccessMessage('Simülatör parametreleri başarıyla güncellendi.');
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setConfigSaving(false);
    }
  };

  // Preset Load Profiles
  const applyPresetProfile = (preset: { interval: number; anomaly: number; scenario: string; label: string }) => {
    setIntervalMs(preset.interval);
    setAnomalyRate(preset.anomaly);
    setActiveScenario(preset.scenario);
    saveSimulatorConfig(preset.interval, preset.anomaly, preset.scenario);
    setSuccessMessage(`Simülatör "${preset.label}" profiline ayarlandı.`);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // Handle Manual Single Metric Injection
  const handleInjectData = async (valueToUse?: number, overrideMetric?: string, overrideUnit?: string) => {
    const dev = simulatedDevices.find((d) => d.id === selectedDeviceId) || simulatedDevices[0];
    if (!dev) {
      alert('Lütfen önce bir sanal cihaz seçin.');
      return;
    }

    setSending(true);
    const m = overrideMetric || metricKey;
    const v = valueToUse !== undefined ? valueToUse : customValue;
    const u = overrideUnit || customUnit || getMetricUnit(m);

    try {
      const res = await fetch('/api/simulator/v1/inject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceId: dev.id,
          metric: m,
          value: v,
          unit: u,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccessMessage(`Test Verisi Enjekte Edildi: [${dev.name}] -> ${m}: ${v} ${u}`);
        setTimeout(() => setSuccessMessage(null), 3500);
      } else {
        alert(data.message || data.error || 'Veri gönderilemedi');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  // Handle Composite Multi-Sensor Packet Injection
  const handleInjectComposite = async () => {
    const dev = simulatedDevices.find((d) => d.id === selectedDeviceId) || simulatedDevices[0];
    if (!dev) {
      alert('Lütfen önce bir sanal cihaz seçin.');
      return;
    }

    setSending(true);
    const readings = [
      { metric: 'temperature', value: Number((32 + Math.random() * 12).toFixed(1)), unit: '°C' },
      { metric: 'humidity', value: Number((50 + Math.random() * 20).toFixed(1)), unit: '%' },
      { metric: 'vibration', value: Number((1.5 + Math.random() * 4.5).toFixed(2)), unit: 'mm/s' },
      { metric: 'power', value: Number((2.5 + Math.random() * 6).toFixed(2)), unit: 'kW' },
    ];

    try {
      const res = await fetch('/api/simulator/v1/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: dev.id,
          readings,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccessMessage(`Kompozit Paket Enjekte Edildi: [${dev.name}] -> 4 sensör metriği canlı yayına verildi.`);
        setTimeout(() => setSuccessMessage(null), 3500);
      } else {
        alert(data.message || data.error || 'Kompozit paket gönderilemedi');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  // Handle Batch Surge Generation
  const handleBatchInject = async () => {
    setBatchSending(true);
    try {
      const dev = simulatedDevices.find((d) => d.id === selectedDeviceId);
      const res = await fetch('/api/simulator/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: batchCount,
          deviceId: dev?.id,
          metric: metricKey,
          value: customValue,
          unit: customUnit,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMessage(`Toplu Akış Gönderildi: ${data.generatedCount} adet sanal paket canlı yayına verildi!`);
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        alert(data.message || data.error || 'Toplu veri basılamadı');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBatchSending(false);
    }
  };

  // Export Telemetry
  const handleExportCSV = () => {
    if (!filteredLogs.length) return;
    const exportData = filteredLogs.map((l) => ({
      Timestamp: l.timestamp,
      DeviceId: l.deviceId,
      DeviceName: l.deviceName,
      Metric: l.metric,
      Value: l.value,
      Unit: l.unit,
      Status: l.status,
    }));
    exportToCSV(`simulasyon_telemetri_${new Date().toISOString().slice(0, 10)}.csv`, exportData);
  };

  const handleExportJSON = () => {
    if (!filteredLogs.length) return;
    exportToJSON(`simulasyon_telemetri_${new Date().toISOString().slice(0, 10)}.json`, filteredLogs);
  };

  // Admin Role Guard
  if (!isAdmin) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center space-y-4">
        <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto border border-rose-500/20">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white">Yetkisiz Erişim</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Sanal cihaz yönetimi, telemetri üretimi ve veri işleme testleri yalnızca <strong>Sistem Yöneticisi (Admin)</strong> yetkisine aittir.
        </p>
      </div>
    );
  }

  // If no simulated devices available
  if (simulatedDevices.length === 0) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-amber-500/20 text-amber-500 rounded-full flex items-center justify-center mx-auto">
            <Cpu className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Aktif Sanal Cihazınız Bulunmuyor</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
            Sanal veri üretmek ve telemetri testi yapmak için {
              onNavigateToDevices ? (
                <button
                  type="button"
                  onClick={onNavigateToDevices}
                  className="underline text-indigo-600 dark:text-indigo-400 font-bold hover:text-indigo-500 cursor-pointer"
                >
                  Cihazlar
                </button>
              ) : (
                <strong>Cihazlar</strong>
              )
            } sayfasından en az bir <strong>Sanal Cihaz</strong> ekleyin. Fiziksel donanımlara simülasyon verisi gönderilmez.
          </p>
        </div>
      </div>
    );
  }

  const selectedDevice = simulatedDevices.find((d) => d.id === selectedDeviceId) || simulatedDevices[0];

  return (
    <div className="space-y-5 animate-fadeIn pb-12">
      {/* Top Header - Standard Dashboard Proportions */}
      <div className="bg-white dark:bg-slate-900/80 backdrop-blur-md p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 shrink-0">
            <Radio className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                Sanal Veri & Telemetri Üreteci
              </h1>
              <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Admin Test Laboratuvarı
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-2xl">
              Saha cihazlarından gelen canlı telemetri akışlarını simüle edin, elle özel paketler enjekte edin ve sistem alarmlarını test edin.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0 self-end sm:self-center flex-wrap">
          {onNavigateToDevices && (
            <button
              type="button"
              onClick={onNavigateToDevices}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 shadow-xs transition-all cursor-pointer active:scale-95"
              title="Tüm Saha Cihazlarına Dön"
            >
              <Cpu className="w-3.5 h-3.5 text-indigo-500" />
              <span>Tüm Saha Cihazları</span>
            </button>
          )}

          {/* Global Simulator Toggle Switch */}
          <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-950/80 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
          <div className="text-right sm:text-left">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Otonom Simülatör</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${simulatorActive ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'}`} />
              <span className={`text-xs font-bold ${simulatorActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                {simulatorActive ? 'ÇALIŞIYOR' : 'DURAKLATILDI'}
              </span>
            </div>
          </div>

          <button
            onClick={toggleSimulator}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs ${
              simulatorActive
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-300 border border-rose-500/30 hover:bg-rose-500/20'
                : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-600/20'
            }`}
          >
            {simulatorActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{simulatorActive ? 'Durdur' : 'Başlat'}</span>
          </button>
        </div>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-[#0f172a] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block truncate">Paket Hızı</span>
            <span className="text-sm sm:text-base font-bold font-mono text-slate-800 dark:text-slate-100">
              {(intervalMs / 1000).toFixed(1)} sn
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold tracking-wider text-amber-500 block truncate">Anomali Oranı</span>
            <span className="text-sm sm:text-base font-bold font-mono text-amber-600 dark:text-amber-400">
              %{(anomalyRate * 100).toFixed(0)}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 shrink-0">
            <Activity className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-500 block truncate">Aktif Senaryo</span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate block">
              {activeScenario === 'normal'
                ? 'Dengeli Profil'
                : activeScenario === 'overheat'
                ? 'Aşırı Isınma'
                : activeScenario === 'spike_burst'
                ? 'Titreşim Anomali'
                : 'Sinüs Dalgası'}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 shrink-0">
            <Cpu className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold tracking-wider text-cyan-500 block truncate">Sanal Cihazlar</span>
            <span className="text-sm sm:text-base font-bold font-mono text-slate-800 dark:text-slate-100">
              {simulatedDevices.length} / {devices.length}
            </span>
          </div>
        </div>
      </div>

      {/* Device Protection Notice Banner */}
      <div className="bg-cyan-50/80 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800/60 rounded-2xl p-3.5 shadow-xs flex items-center gap-3 text-xs">
        <div className="p-2 bg-cyan-100 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/20 rounded-xl text-cyan-600 dark:text-cyan-400 shrink-0">
          <Shield className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span>Gerçek Donanım Güvenlik Protokolü Aktif</span>
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 text-[9px] font-extrabold rounded-full">
              Saha Koruma Modu
            </span>
          </h4>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
            Simülatör yalnızca <strong className="text-cyan-600 dark:text-cyan-300">[SANAL CİHAZ]</strong> etiketli test cihazlarına veri üretir. Fiziksel donanım cihazlarınıza (ESP32, NodeMCU, Sayaç) asla sahte test verisi karıştırılmaz.
          </p>
        </div>
      </div>

      {/* Success Banner Alert */}
      {successMessage && (
        <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-3 px-4 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-semibold">{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-200 cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Main Grid: Left Controls + Right Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (7 cols): Injection Forms & Scenario Controls */}
        <div className="lg:col-span-7 space-y-5">
          {/* Card 1: Manuel Telemetri Enjeksiyonu */}
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-indigo-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Manuel Telemetri Enjeksiyonu</h3>
              </div>

              {/* Mode switch: Single vs Composite */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700/80 text-[11px]">
                <button
                  type="button"
                  onClick={() => setInjectionMode('single')}
                  className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                    injectionMode === 'single'
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs font-bold'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Tekil Metrik
                </button>
                <button
                  type="button"
                  onClick={() => setInjectionMode('composite')}
                  className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                    injectionMode === 'composite'
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs font-bold'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Kompozit Paket
                </button>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              {/* Target Device Dropdown */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Hedef Sanal Cihaz
                </label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-indigo-500 font-medium"
                >
                  {simulatedDevices.map((d) => (
                    <option key={d.id} value={d.id}>
                      🟣 [SANAL] {d.name} ({d.type.toUpperCase()}) — Konum: {d.location}
                    </option>
                  ))}
                </select>
                {selectedDevice && (
                  <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                    <span>
                      API Key: <strong className="text-amber-600 dark:text-amber-400">{selectedDevice.apiKey}</strong>
                    </span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                      🤖 Sanal Simülatör Cihazı
                    </span>
                  </div>
                )}
              </div>

              {injectionMode === 'single' ? (
                <>
                  {/* Metric & Unit Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Metrik Adı
                      </label>
                      <input
                        type="text"
                        value={metricKey}
                        onChange={(e) => {
                          const newM = e.target.value;
                          setMetricKey(newM);
                          setCustomUnit(getMetricUnit(newM));
                        }}
                        placeholder="ör. temperature, cpu, vibration, power"
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-indigo-500 font-mono"
                      />
                      {/* Quick Metric Chips */}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {['temperature', 'cpu', 'power', 'vibration', 'co2', 'pressure', 'voltage', 'humidity'].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              setMetricKey(m);
                              setCustomUnit(getMetricUnit(m));
                            }}
                            className={`px-1.5 py-0.5 text-[10px] rounded font-mono transition cursor-pointer ${
                              metricKey === m
                                ? 'bg-indigo-600 text-white font-bold'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Ölçüm Birimi
                      </label>
                      <input
                        type="text"
                        value={customUnit}
                        onChange={(e) => setCustomUnit(e.target.value)}
                        placeholder="ör. °C, kW, %, hPa, mm/s"
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-indigo-500 font-mono"
                      />
                      {/* Quick Unit Chips */}
                      <div className="flex flex-wrap gap-1 mt-1.5 max-h-12 overflow-y-auto scrollbar-thin">
                        {COMMON_UNITS.slice(0, 10).map((u) => (
                          <button
                            key={u}
                            type="button"
                            onClick={() => setCustomUnit(u)}
                            className={`px-1.5 py-0.5 text-[10px] rounded font-mono transition cursor-pointer ${
                              customUnit === u
                                ? 'bg-emerald-600 text-white font-bold'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            {u}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Metric Value Slider */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        Gönderilecek Değer: <span className="text-indigo-600 dark:text-indigo-400 font-bold">{customValue}</span> {customUnit}
                      </label>
                      <span className="text-[10px] text-slate-500 font-mono">
                        Durum:{' '}
                        {customValue > 90 ? (
                          <strong className="text-rose-600 dark:text-rose-400">KRİTİK (&gt;90)</strong>
                        ) : customValue > 75 ? (
                          <strong className="text-amber-600 dark:text-amber-400">UYARI (&gt;75)</strong>
                        ) : (
                          <strong className="text-emerald-600 dark:text-emerald-400">NORMAL</strong>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="150"
                        step="0.5"
                        value={customValue}
                        onChange={(e) => setCustomValue(parseFloat(e.target.value))}
                        className="flex-1 h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                      <input
                        type="number"
                        value={customValue}
                        onChange={(e) => setCustomValue(parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-center font-bold font-mono focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Raw IoT String Packet Preview */}
                  <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 font-mono text-[11px] space-y-1">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold flex items-center justify-between">
                      <span>IoT Ham Protokol Çıktısı</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">Canlı Format</span>
                    </div>
                    <p className="text-emerald-700 dark:text-emerald-300 break-all select-all font-semibold">
                      {selectedDevice?.apiKey || 'TOKEN'}, {selectedDevice?.name || 'CIHAZ'}, {metricKey}:{customValue}
                    </p>
                  </div>

                  {/* Action Button */}
                  <button
                    type="button"
                    onClick={() => handleInjectData()}
                    disabled={sending}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center justify-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
                  >
                    {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>Tekil Veriyi Yayına Gönder</span>
                  </button>
                </>
              ) : (
                /* Composite Multi-Sensor Bundle */
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 text-xs space-y-1.5">
                    <div className="flex items-center gap-2 font-bold text-indigo-700 dark:text-indigo-300">
                      <Layers className="w-4 h-4" />
                      <span>Endüstriyel Kompozit Sensör Paketi</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      Bu işlem tek bir HTTP isteğinde 4 farklı sensör metriğini (Sıcaklık, Nem, Titreşim ve Güç) eşzamanlı olarak üretip cihaza yazar.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[10px]">
                      <div className="p-1.5 rounded bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800/60">
                        <span className="text-slate-400 block">temperature:</span>
                        <strong className="text-indigo-600 dark:text-indigo-400">32 - 44 °C</strong>
                      </div>
                      <div className="p-1.5 rounded bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800/60">
                        <span className="text-slate-400 block">humidity:</span>
                        <strong className="text-cyan-600 dark:text-cyan-400">50 - 70 %</strong>
                      </div>
                      <div className="p-1.5 rounded bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800/60">
                        <span className="text-slate-400 block">vibration:</span>
                        <strong className="text-amber-600 dark:text-amber-400">1.5 - 6 mm/s</strong>
                      </div>
                      <div className="p-1.5 rounded bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800/60">
                        <span className="text-slate-400 block">power:</span>
                        <strong className="text-emerald-600 dark:text-emerald-400">2.5 - 8.5 kW</strong>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleInjectComposite}
                    disabled={sending}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold flex items-center justify-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
                  >
                    {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                    <span>4'lü Kompozit Paketi Canlı Yayına Gönder</span>
                  </button>
                </div>
              )}

              {/* Hızlı Anomali Enjeksiyon Paleti (Quick Anomaly Buttons) */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-2">
                  ⚡ Tek Tıkla Hızlı Anomali Enjeksiyonu (Alarm Testi):
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleInjectData(98.8, 'temperature', '°C')}
                    disabled={sending}
                    title="98.8°C Aşırı Sıcaklık Alarma Gönder"
                    className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 text-left transition cursor-pointer"
                  >
                    <div className="flex items-center gap-1 font-bold text-xs">
                      <Flame className="w-3.5 h-3.5" />
                      <span>98.8 °C</span>
                    </div>
                    <span className="text-[10px] text-rose-600/80 dark:text-rose-400/80 block mt-0.5">Aşırı Isınma</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleInjectData(18.5, 'power', 'kW')}
                    disabled={sending}
                    title="18.5 kW Aşırı Güç Dalgalanması"
                    className="p-2 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 text-left transition cursor-pointer"
                  >
                    <div className="flex items-center gap-1 font-bold text-xs">
                      <Zap className="w-3.5 h-3.5" />
                      <span>18.5 kW</span>
                    </div>
                    <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80 block mt-0.5">Aşırı Yük</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleInjectData(38.4, 'vibration', 'mm/s')}
                    disabled={sending}
                    title="38.4 mm/s Kritik Titreşim Şoku"
                    className="p-2 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-500/10 dark:hover:bg-purple-500/20 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20 text-left transition cursor-pointer"
                  >
                    <div className="flex items-center gap-1 font-bold text-xs">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>38.4 mm/s</span>
                    </div>
                    <span className="text-[10px] text-purple-600/80 dark:text-purple-400/80 block mt-0.5">Mekanik Şok</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleInjectData(780, 'pressure', 'hPa')}
                    disabled={sending}
                    title="780 hPa Ani Basınç Kaybı"
                    className="p-2 rounded-xl bg-sky-50 hover:bg-sky-100 dark:bg-sky-500/10 dark:hover:bg-sky-500/20 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20 text-left transition cursor-pointer"
                  >
                    <div className="flex items-center gap-1 font-bold text-xs">
                      <Gauge className="w-3.5 h-3.5" />
                      <span>780 hPa</span>
                    </div>
                    <span className="text-[10px] text-sky-600/80 dark:text-sky-400/80 block mt-0.5">Basınç Düşüşü</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Toplu Veri Akışı & Test Senaryoları */}
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Toplu Veri Basma & Saha Senaryoları</h3>
              </div>
              <span className="text-[10px] bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded font-bold border border-amber-200 dark:border-amber-500/20">
                Stres Testi
              </span>
            </div>

            <div className="space-y-4 text-xs">
              {/* Batch Size Selector */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Toplu Paket Miktarı (Batch Injection)
                </label>
                <div className="flex items-center gap-2">
                  {[5, 20, 50, 100].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setBatchCount(num)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                        batchCount === num
                          ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {num} Paket
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleBatchInject}
                disabled={batchSending}
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center justify-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                {batchSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                <span>{batchCount} Adet Sanal Telemetri Paketini Aynı Anda Bas</span>
              </button>

              {/* Predefined Scenarios Tiles */}
              <div className="pt-2 space-y-2">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                  💡 Hazır Canlı Test Senaryoları:
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveScenario('overheat');
                      saveSimulatorConfig(intervalMs, 0.4, 'overheat');
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      activeScenario === 'overheat'
                        ? 'bg-rose-50 dark:bg-rose-500/15 border-rose-300 dark:border-rose-500/40 text-slate-900 dark:text-white shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold mb-1">
                      <Flame className="w-4 h-4" />
                      <span>Sıcaklık Aşırı Isınma</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                      Sensörlerde 65°C - 100°C arası ısı artışı üreterek yüksek sıcaklık alarmlarını tetikler.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveScenario('spike_burst');
                      saveSimulatorConfig(intervalMs, 0.5, 'spike_burst');
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      activeScenario === 'spike_burst'
                        ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-300 dark:border-amber-500/40 text-slate-900 dark:text-white shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold mb-1">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Titreşim & Mekanik Anomali</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                      Motorlarda ani 15-35 mm/s titreşim patlamaları oluşturur.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveScenario('sine_wave');
                      saveSimulatorConfig(intervalMs, 0.0, 'sine_wave');
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      activeScenario === 'sine_wave'
                        ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-300 dark:border-indigo-500/40 text-slate-900 dark:text-white shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold mb-1">
                      <TrendingUp className="w-4 h-4" />
                      <span>Sinüs Dalga Yük Eğrisi</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                      Grafiklerin pürüzsüz akışını test etmek için düzenli sinüs yük dalgalanması sağlar.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveScenario('normal');
                      saveSimulatorConfig(intervalMs, 0.05, 'normal');
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      activeScenario === 'normal'
                        ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-300 dark:border-emerald-500/40 text-slate-900 dark:text-white shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold mb-1">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Normal Saha Profili</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                      Gerçekçi cihaz profillerine göre %5 rastgele sapma ile standart veri üretir.
                    </p>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Frequency Controls & Live Ingestion Console */}
        <div className="lg:col-span-5 space-y-5">
          {/* Card 3: Otomatik Simülatör Hız & Frekans Ayarları */}
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Frekans & Anomali Ayarları</h3>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              {/* Quick Profile Presets */}
              <div>
                <span className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Hızlı Yük Profilleri
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyPresetProfile({ interval: 5000, anomaly: 0.0, scenario: 'normal', label: 'Sakin / Düşük Yük' })}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-left hover:border-indigo-400 transition cursor-pointer"
                  >
                    <span className="font-bold block text-[10px]">🟢 Sakin Yük</span>
                    <span className="text-[9px] text-slate-400">5sn aralık, %0 anomali</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPresetProfile({ interval: 2000, anomaly: 0.05, scenario: 'normal', label: 'Standart Saha' })}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-left hover:border-indigo-400 transition cursor-pointer"
                  >
                    <span className="font-bold block text-[10px]">🔵 Standart</span>
                    <span className="text-[9px] text-slate-400">2sn aralık, %5 anomali</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPresetProfile({ interval: 500, anomaly: 0.20, scenario: 'spike_burst', label: 'Stres & Hız Testi' })}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-left hover:border-indigo-400 transition cursor-pointer"
                  >
                    <span className="font-bold block text-[10px]">🟠 Stres Testi</span>
                    <span className="text-[9px] text-slate-400">500ms, %20 anomali</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPresetProfile({ interval: 1000, anomaly: 0.40, scenario: 'overheat', label: 'Kaotik Arıza' })}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-left hover:border-indigo-400 transition cursor-pointer"
                  >
                    <span className="font-bold block text-[10px]">🔴 Arıza Tatbikatı</span>
                    <span className="text-[9px] text-slate-400">1sn, %40 alarm</span>
                  </button>
                </div>
              </div>

              {/* Interval Speed Slider */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    Veri Üretim Sıklığı (Aralık)
                  </label>
                  <span className="text-cyan-600 dark:text-cyan-400 font-bold font-mono">
                    {intervalMs} ms ({(intervalMs / 1000).toFixed(1)} sn)
                  </span>
                </div>
                <input
                  type="range"
                  min="300"
                  max="10000"
                  step="100"
                  value={intervalMs}
                  onChange={(e) => {
                    const newI = parseInt(e.target.value, 10);
                    setIntervalMs(newI);
                    saveSimulatorConfig(newI, anomalyRate, activeScenario);
                  }}
                  className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                  <span>300ms (Hızlı)</span>
                  <span>2000ms (Standart)</span>
                  <span>10000ms (Yavaş)</span>
                </div>
              </div>

              {/* Anomaly Rate Slider */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    Rastgele Anomali İhtimali
                  </label>
                  <span className="text-amber-600 dark:text-amber-400 font-bold font-mono">
                    %{(anomalyRate * 100).toFixed(0)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.5"
                  step="0.05"
                  value={anomalyRate}
                  onChange={(e) => {
                    const newA = parseFloat(e.target.value);
                    setAnomalyRate(newA);
                    saveSimulatorConfig(intervalMs, newA, activeScenario);
                  }}
                  className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Card 4: Canlı Üretilen Telemetri Konsolu */}
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Canlı Telemetri Konsolu</h3>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                  {filteredLogs.length} paket
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {/* Export Buttons */}
                <button
                  type="button"
                  onClick={handleExportCSV}
                  disabled={!filteredLogs.length}
                  title="CSV Olarak İndir"
                  className="p-1 rounded-lg text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer transition"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleExportJSON}
                  disabled={!filteredLogs.length}
                  title="JSON Olarak İndir"
                  className="p-1 rounded-lg text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer transition"
                >
                  <FileJson className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleToggleLogPause}
                  className={`px-2 py-1 rounded text-[10px] font-bold border flex items-center gap-1 transition cursor-pointer ${
                    logPaused
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/30'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {logPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                  <span>{logPaused ? 'Devam' : 'Dondur'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearLogs}
                  title="Konsolu Temizle"
                  className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Filter controls */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <select
                  value={logFilterMetric}
                  onChange={(e) => setLogFilterMetric(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[11px] rounded-lg px-2 py-1"
                >
                  <option value="all">Tüm Metrikler</option>
                  <option value="temperature">Sıcaklık (°C)</option>
                  <option value="cpu">CPU (%)</option>
                  <option value="power">Güç (kW)</option>
                  <option value="vibration">Titreşim (mm/s)</option>
                  <option value="pressure">Basınç (hPa)</option>
                  <option value="humidity">Nem (%)</option>
                </select>
              </div>
              <div>
                <select
                  value={logFilterDevice}
                  onChange={(e) => setLogFilterDevice(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[11px] rounded-lg px-2 py-1"
                >
                  <option value="all">Tüm Sanal Cihazlar</option>
                  {simulatedDevices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Terminal Window */}
            <div className="bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800/80 p-3 h-80 overflow-y-auto font-mono text-[11px] space-y-1.5 scrollbar-thin">
              {filteredLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-600 text-[11px] italic">
                  Henüz veri konsolunda paket bulunmuyor...
                </div>
              ) : (
                filteredLogs.map((log, idx) => (
                  <div
                    key={log.id ? `${log.id}_${idx}` : `log_${idx}`}
                    className="flex items-start gap-2 py-1 border-b border-slate-200/60 dark:border-slate-900/60 leading-tight hover:bg-slate-100/60 dark:hover:bg-slate-900/40 px-1 rounded transition"
                  >
                    <span className="text-slate-400 dark:text-slate-500 shrink-0 text-[10px]">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-semibold shrink-0">
                      [{log.deviceName}]
                    </span>
                    <span className="text-slate-700 dark:text-slate-300 truncate">
                      {log.metric}: <strong className="text-slate-900 dark:text-white">{log.value}</strong> {log.unit}
                    </span>
                    <span
                      className={`ml-auto shrink-0 px-1.5 py-0.2 rounded text-[9px] font-bold ${
                        log.status === 'critical'
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                          : log.status === 'warning'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {log.status.toUpperCase()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
