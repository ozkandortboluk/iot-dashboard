import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { apiFetch as fetch } from '../lib/apiFetch';
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
  Maximize2,
  Copy,
  Trash2,
  TrendingUp,
  Shield,
  Bot,
} from 'lucide-react';
import { COMMON_UNITS, getMetricUnit } from '../lib/utils';

export const DataGeneratorView: React.FC = () => {
  const { user } = useAuth();
  const { devices, simulationTelemetry, simulatorActive, toggleSimulator, subscribeChannel, unsubscribeChannel } = useRealtime();

  // Admin Role Check
  const isAdmin = user?.role === 'admin';

  // State for manual injection
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
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
  const [logPaused, setLogPaused] = useState<boolean>(false);
  const [localLogs, setLocalLogs] = useState<typeof simulationTelemetry>([]);

  // Only allow simulated devices
  const simulatedDevices = devices.filter((d) => d.isSimulated);

  // Set default selected device once loaded
  useEffect(() => {
    if (simulatedDevices.length > 0 && (!selectedDeviceId || !simulatedDevices.some((d) => d.id === selectedDeviceId))) {
      setSelectedDeviceId(simulatedDevices[0].id);
    }
  }, [simulatedDevices, selectedDeviceId]);

  // Keep track of live simulation telemetry logs
  useEffect(() => {
    if (!logPaused) {
      setLocalLogs(simulationTelemetry.slice(0, 80));
    }
  }, [simulationTelemetry, logPaused]);

  // Fetch initial simulator status
  useEffect(() => {
    fetch('/api/simulator/status')
      .then((res) => res.json())
      .then((data) => {
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

  // Handle Manual Data Injection
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
          <div className="w-16 h-16 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mx-auto">
            <Cpu className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Aktif Sanal Cihazınız Bulunmuyor</h2>
          <p className="text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
            Sanal veri üretmek ve telemetri testi yapmak için <strong>Cihazlar</strong> sayfasından en az bir <strong>Sanal Cihaz</strong> ekleyin. Fiziksel donanımlara simülasyon verisi gönderilmez.
          </p>
        </div>
      </div>
    );
  }

  const selectedDevice = simulatedDevices.find((d) => d.id === selectedDeviceId) || simulatedDevices[0];

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-60 h-60 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
                <Radio className="w-5 h-5 animate-pulse" />
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight">Sanal Veri & Telemetri Üreteci</h2>
              <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${
                isAdmin
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}>
                {isAdmin ? 'Admin Yetkisi' : 'Kullanıcı Test Alanı'}
              </span>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              {isAdmin
                ? 'Cihazlardan canlı gelen verileri simüle edin, elle özel telemetri paketleri enjekte edin veya saha senaryoları çalıştırarak sistem alarmlarını test edin.'
                : 'Kendi kayıtlı cihazlarınıza test telemetri paketleri gönderin veya sanal cihazlarınızın veri akışını izleyin.'}
            </p>
          </div>

          {/* Global Simulator Toggle Switch */}
          <div className="flex items-center gap-4 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 shrink-0">
            <div>
              <span className="block text-[11px] font-semibold text-slate-400">Otomatik Simülatör</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-2 h-2 rounded-full ${simulatorActive ? 'bg-emerald-400 animate-ping' : 'bg-rose-500'}`} />
                <span className={`text-xs font-bold ${simulatorActive ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {simulatorActive ? 'ÇALIŞIYOR (Aktif)' : 'DURAKLATILDI'}
                </span>
              </div>
            </div>

            {isAdmin ? (
              <button
                onClick={toggleSimulator}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-lg ${
                  simulatorActive
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30'
                    : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-500/20'
                }`}
              >
                {simulatorActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{simulatorActive ? 'Durdur' : 'Başlat'}</span>
              </button>
            ) : (
              <span className="text-[10px] text-slate-500 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-800">
                Genel Motor (Admin Kontrolünde)
              </span>
            )}
          </div>
        </div>

        {/* Live Metrics Quick Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800/80 text-xs">
          <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/80">
            <span className="text-[10px] text-slate-500 uppercase font-semibold">Paket Üretim Hızı</span>
            <div className="flex items-center gap-2 mt-1">
              <Clock className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-bold text-slate-200">1 paket / {(intervalMs / 1000).toFixed(1)}sn</span>
            </div>
          </div>

          <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/80">
            <span className="text-[10px] text-slate-500 uppercase font-semibold">Anomali / Risk Oranı</span>
            <div className="flex items-center gap-2 mt-1">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-bold text-slate-200">%{ (anomalyRate * 100).toFixed(0) }</span>
            </div>
          </div>

          <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/80">
            <span className="text-[10px] text-slate-500 uppercase font-semibold">Aktif Senaryo Modu</span>
            <div className="flex items-center gap-2 mt-1">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-bold text-slate-200 capitalize">
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

          <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/80">
            <span className="text-[10px] text-slate-500 uppercase font-semibold">Saha Cihaz Sayısı</span>
            <div className="flex items-center gap-2 mt-1">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-bold text-slate-200">{devices.length} Kayıtlı Cihaz</span>
            </div>
          </div>
        </div>
      </div>

      {/* Device Protection Notice Banner */}
      <div className="bg-gradient-to-r from-indigo-950/60 via-slate-900 to-cyan-950/40 border border-cyan-500/30 rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400 shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-slate-100 flex items-center gap-2">
              <span>Gerçek Donanım Güvenlik Protekolü Aktif</span>
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-extrabold rounded-full">
                Saha Koruma Modu
              </span>
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              Otomatik simülatör döngüsü yalnızca <strong className="text-cyan-300">[SANAL CİHAZ]</strong> etiketli test cihazlarına veri üretir. Fiziksel donanım cihazlarınıza (ESP32, NodeMCU, Sayaç vb.) asla sahte simülasyon verisi karıştırılmaz.
            </p>
          </div>
        </div>
      </div>

      {/* Success Banner Alert */}
      {successMessage && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 px-5 text-xs text-emerald-300 flex items-center justify-between shadow-lg animate-fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-emerald-200">
            ✕
          </button>
        </div>
      )}

      {/* Main Grid: Left Controls + Right Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (8 cols): Injection Forms & Scenario Controls */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: Manuel Anlık Telemetri Enjeksiyonu */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-indigo-400" />
                <h3 className="font-bold text-sm text-white">Anlık Elle Telemetri Gönder</h3>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">POST /api/simulator/v1/inject</span>
            </div>

            <div className="space-y-4 text-xs">
              {/* Target Device Dropdown */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Hedef Sanal Cihaz Seçin
                </label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                >
                  {simulatedDevices.map((d) => (
                    <option key={d.id} value={d.id}>
                      🟣 [SANAL] {d.name} ({d.type.toUpperCase()}) — Konum: {d.location}
                    </option>
                  ))}
                </select>
                {selectedDevice && (
                  <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>
                      API Key: <strong className="text-amber-400">{selectedDevice.apiKey}</strong>
                    </span>
                    <span className="text-cyan-400 font-bold">
                      🤖 Sanal Simülatör Cihazı
                    </span>
                  </div>
                )}
              </div>

              {/* Metric & Unit Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
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
                    placeholder="ör. temperature, cpu, vibration, power, co2"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                  {/* Quick Metric Chips */}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {['temperature', 'cpu', 'power', 'vibration', 'co2', 'pressure', 'voltage'].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setMetricKey(m);
                          setCustomUnit(getMetricUnit(m));
                        }}
                        className={`px-1.5 py-0.5 text-[10px] rounded font-mono transition ${
                          metricKey === m
                            ? 'bg-indigo-600 text-white font-bold'
                            : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Ölçüm Birimi
                  </label>
                  <input
                    type="text"
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value)}
                    placeholder="ör. °C, kW, %, hPa, mm/s"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                  {/* Quick Unit Chips */}
                  <div className="flex flex-wrap gap-1 mt-1.5 max-h-12 overflow-y-auto scrollbar-thin">
                    {COMMON_UNITS.slice(0, 10).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setCustomUnit(u)}
                        className={`px-1.5 py-0.5 text-[10px] rounded font-mono transition ${
                          customUnit === u
                            ? 'bg-emerald-600 text-white font-bold'
                            : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Metric Value Input */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-300">
                    Gönderilecek Değer: <span className="text-indigo-400 font-bold">{customValue}</span> {customUnit}
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Durum:{' '}
                    {customValue > 90 ? (
                      <strong className="text-rose-400">KRİTİK (&gt;90)</strong>
                    ) : customValue > 75 ? (
                      <strong className="text-amber-400">UYARI (&gt;75)</strong>
                    ) : (
                      <strong className="text-emerald-400">NORMAL</strong>
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
                    className="flex-1 h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <input
                    type="number"
                    value={customValue}
                    onChange={(e) => setCustomValue(parseFloat(e.target.value) || 0)}
                    className="w-20 px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-center font-bold font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>


              </div>

              {/* Raw IoT String Packet Preview */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300 space-y-1">
                <div className="text-[10px] text-slate-500 uppercase font-semibold flex items-center justify-between">
                  <span>IoT Ham Paket Çıktısı (Raw Protocol)</span>
                  <span className="text-emerald-400">Canlı Format</span>
                </div>
                <p className="text-emerald-300 break-all select-all font-semibold">
                  {selectedDevice?.apiKey || 'TOKEN'}, {selectedDevice?.name || 'CIHAZ'}, {metricKey}:{customValue}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => handleInjectData()}
                  disabled={sending}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition cursor-pointer disabled:opacity-50"
                >
                  {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>Anlık Veriyi Yayına Gönder</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleInjectData(98.8, metricKey, customUnit)}
                  disabled={sending}
                  className="px-4 py-2.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 hover:bg-rose-500/30 font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Flame className="w-4 h-4 text-rose-400" />
                  <span>Kritik Alarm Basa (98.8)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: Toplu Veri Akışı & Test Senaryoları */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm text-white">Toplu Veri Basma & Saha Senaryoları</h3>
              </div>
              <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded font-bold border border-amber-500/20">
                Stres Testi
              </span>
            </div>

            <div className="space-y-4 text-xs">
              {/* Batch Size Selector */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                  Toplu Paket Miktarı (Batch Injection)
                </label>
                <div className="flex items-center gap-3">
                  {[5, 20, 50, 100].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setBatchCount(num)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold transition border ${
                        batchCount === num
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 shadow-md'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
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
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-600/20 transition cursor-pointer disabled:opacity-50"
              >
                {batchSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                <span>{batchCount} Adet Sanal Telemetri Paketini Aynı Anda Bas</span>
              </button>

              {/* Predefined Scenarios Tiles */}
              <div className="pt-2 space-y-2">
                <span className="text-[11px] font-semibold text-slate-400 block">
                  💡 Hazır Canlı Test Senaryoları:
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveScenario('overheat');
                      saveSimulatorConfig(intervalMs, 0.4, 'overheat');
                    }}
                    className={`p-3 rounded-xl border text-left transition ${
                      activeScenario === 'overheat'
                        ? 'bg-rose-500/15 border-rose-500/40 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-rose-400 font-bold mb-1">
                      <Flame className="w-4 h-4" />
                      <span>Sıcaklık Aşırı Isınma</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-tight">
                      Sensörlerde 65°C - 100°C arası ısı artışı üreterek yüksek sıcaklık alarmlarını tetikler.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveScenario('spike_burst');
                      saveSimulatorConfig(intervalMs, 0.5, 'spike_burst');
                    }}
                    className={`p-3 rounded-xl border text-left transition ${
                      activeScenario === 'spike_burst'
                        ? 'bg-amber-500/15 border-amber-500/40 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-amber-400 font-bold mb-1">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Titreşim & Mekanik Anomali</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-tight">
                      Motorlarda ani 15-35 mm/s titreşim patlamaları oluşturur.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveScenario('sine_wave');
                      saveSimulatorConfig(intervalMs, 0.0, 'sine_wave');
                    }}
                    className={`p-3 rounded-xl border text-left transition ${
                      activeScenario === 'sine_wave'
                        ? 'bg-indigo-500/15 border-indigo-500/40 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-indigo-400 font-bold mb-1">
                      <TrendingUp className="w-4 h-4" />
                      <span>Sinüs Dalga Yük Eğrisi</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-tight">
                      Grafiklerin pürüzsüz akışını test etmek için düzenli sinüs yük dalgalanması sağlar.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveScenario('normal');
                      saveSimulatorConfig(intervalMs, 0.05, 'normal');
                    }}
                    className={`p-3 rounded-xl border text-left transition ${
                      activeScenario === 'normal'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-emerald-400 font-bold mb-1">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Normal Saha Profili</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-tight">
                      Gerçekçi cihaz profillerine göre %5 rastgele sapma ile standart veri üretir.
                    </p>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Frequency Controls & Live Ingestion Console */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 3: Otomatik Simülatör Hız & Frekans Ayarları */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold text-sm text-white">Simülatör Frekans & Anomali Ayarları</h3>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              {/* Interval Speed Slider */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-300">
                    Veri Üretim Sıklığı (Aralık)
                  </label>
                  <span className="text-cyan-400 font-bold font-mono">
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
                  className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                  <span>300ms (Çok Hızlı)</span>
                  <span>2000ms (Standart)</span>
                  <span>10000ms (Yavaş)</span>
                </div>
              </div>

              {/* Anomaly Rate Slider */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-300">
                    Rastgele Anomali İhtimali
                  </label>
                  <span className="text-amber-400 font-bold font-mono">
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
                  className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Card 4: Canlı Üretilen Telemetri Konsolu */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-sm text-white">Canlı Telemetri Konsolu</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLogPaused(!logPaused)}
                  className={`px-2 py-1 rounded text-[10px] font-bold border flex items-center gap-1 transition ${
                    logPaused
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {logPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                  <span>{logPaused ? 'Devam Et' : 'Duraklat'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLocalLogs([])}
                  title="Temizle"
                  className="p-1 text-slate-400 hover:text-slate-200"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Filter by metric */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[10px] text-slate-500 font-semibold uppercase">Filtre:</span>
              <select
                value={logFilterMetric}
                onChange={(e) => setLogFilterMetric(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-300 text-[11px] rounded-lg px-2 py-1"
              >
                <option value="all">Tüm Metrikler</option>
                <option value="temperature">Sıcaklık (°C)</option>
                <option value="cpu">CPU (%)</option>
                <option value="power">Güç (kW)</option>
                <option value="vibration">Titreşim (mm/s)</option>
              </select>
            </div>

            {/* Terminal Window */}
            <div className="bg-slate-950 rounded-xl border border-slate-800/80 p-3 h-80 overflow-y-auto font-mono text-[11px] space-y-1.5 scrollbar-thin">
              {localLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-600 text-[11px] italic">
                  Henüz veri konsolunda paket bulunmuyor...
                </div>
              ) : (
                localLogs
                  .filter((log) => logFilterMetric === 'all' || log.metric.toLowerCase().includes(logFilterMetric))
                  .map((log, idx) => (
                    <div
                      key={log.id ? `${log.id}_${idx}` : `log_${idx}`}
                      className="flex items-start gap-2 py-1 border-b border-slate-900/60 leading-tight hover:bg-slate-900/40 px-1 rounded transition"
                    >
                      <span className="text-slate-500 shrink-0 text-[10px]">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="text-indigo-400 font-semibold shrink-0">[{log.deviceName}]</span>
                      <span className="text-slate-300 truncate">
                        {log.metric}: <strong className="text-white">{log.value}</strong> {log.unit}
                      </span>
                      <span
                        className={`ml-auto shrink-0 px-1.5 py-0.2 rounded text-[9px] font-bold ${
                          log.status === 'critical'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : log.status === 'warning'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-emerald-500/10 text-emerald-400'
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
