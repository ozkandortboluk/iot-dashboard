import React, { useState, useEffect, useCallback } from 'react';
import {
  Sliders,
  Play,
  Square,
  RefreshCw,
  Zap,
  Bell,
  HardDrive,
  Radio,
  ShieldCheck,
  Activity,
  Terminal,
  Database,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  ArrowLeft,
  Settings,
  X,
  ServerCog,
  LayoutGrid,
  List,
} from 'lucide-react';
import { apiFetch } from '../lib/apiFetch';
import { useUserPreference } from '../hooks/useUserPreference';

export interface SystemEngineInfo {
  id: string;
  name: string;
  tag: string;
  category: 'alerts' | 'ota' | 'simulation' | 'watchdog' | 'automation' | 'downlink' | 'storage';
  categoryLabel: string;
  status: 'running' | 'paused' | 'stopped' | 'idle';
  enabled: boolean;
  intervalMs?: number;
  intervalLabel?: string;
  lastRunAt?: string;
  description: string;
  metrics: Record<string, string | number | boolean>;
  capabilities: {
    canToggle: boolean;
    canTrigger: boolean;
    canConfigure: boolean;
    quickLinkTab?: string;
    quickLinkLabel?: string;
  };
  config?: Record<string, any>;
}

interface SystemEnginesViewProps {
  onNavigateToTab?: (tab: string) => void;
}

interface ActionLogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

export const SystemEnginesView: React.FC<SystemEnginesViewProps> = ({ onNavigateToTab }) => {
  const [engines, setEngines] = useState<SystemEngineInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [logs, setLogs] = useState<ActionLogEntry[]>([]);
  const [editingConfigEngine, setEditingConfigEngine] = useState<SystemEngineInfo | null>(null);

  // View mode preference: 'grid' (karo) or 'list' (liste)
  const [viewMode, setViewMode] = useUserPreference<'grid' | 'list'>('system_engines_view_mode', 'grid');

  // Simulator config form state
  const [simInterval, setSimInterval] = useState<number>(2000);
  const [simAnomalyRate, setSimAnomalyRate] = useState<number>(0.05);
  const [simScenario, setSimScenario] = useState<string>('normal');

  const addLog = useCallback((type: 'info' | 'success' | 'warn' | 'error', message: string) => {
    const newEntry: ActionLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type,
      message,
    };
    setLogs((prev) => [newEntry, ...prev.slice(0, 49)]);
  }, []);

  const fetchEngines = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const res = await apiFetch('/api/system/engines', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data?.engines) {
          setEngines(data.engines);
        }
      } else {
        addLog('error', `Motor verileri alınamadı (HTTP ${res.status})`);
      }
    } catch (err: any) {
      addLog('error', `Bağlantı hatası: ${err?.message || err}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [addLog]);

  useEffect(() => {
    fetchEngines();
    const interval = setInterval(() => {
      fetchEngines(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchEngines]);

  const handleToggle = async (engine: SystemEngineInfo) => {
    const nextState = !engine.enabled;
    setActionInProgress(`toggle_${engine.id}`);
    addLog('info', `${engine.name} motor durumu değiştiriliyor (${nextState ? 'Başlatılıyor' : 'Durduruluyor'})...`);

    try {
      const res = await apiFetch(`/api/system/engines/${engine.id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState }),
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addLog('success', data.message || `${engine.name} durumu başarıyla güncellendi.`);
        await fetchEngines(true);
      } else {
        addLog('error', data.error || data.message || 'Motor durumu değiştirilemedi.');
      }
    } catch (err: any) {
      addLog('error', `Hata: ${err?.message || err}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleTrigger = async (engine: SystemEngineInfo) => {
    setActionInProgress(`trigger_${engine.id}`);
    addLog('info', `${engine.name} için manuel tek seferlik çalışma döngüsü başlatıldı...`);

    try {
      const res = await apiFetch(`/api/system/engines/${engine.id}/trigger`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addLog('success', data.message || `${engine.name} döngüsü başarıyla tamamlandı.`);
        await fetchEngines(true);
      } else {
        addLog('error', data.error || data.message || 'Manuel tetikleme başarısız oldu.');
      }
    } catch (err: any) {
      addLog('error', `Hata: ${err?.message || err}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleOpenConfig = (engine: SystemEngineInfo) => {
    setEditingConfigEngine(engine);
    if (engine.id === 'simulator' && engine.config) {
      setSimInterval(engine.config.intervalMs || 2000);
      setSimAnomalyRate(engine.config.anomalyProbability ?? 0.05);
      setSimScenario(engine.config.activeScenario || 'normal');
    }
  };

  const handleSaveConfig = async () => {
    if (!editingConfigEngine) return;
    setActionInProgress(`config_${editingConfigEngine.id}`);

    try {
      let configPayload: any = {};
      if (editingConfigEngine.id === 'simulator') {
        configPayload = {
          intervalMs: Number(simInterval),
          anomalyProbability: Number(simAnomalyRate),
          activeScenario: simScenario,
        };
      }

      const res = await apiFetch(`/api/system/engines/${editingConfigEngine.id}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configPayload),
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addLog('success', data.message || `${editingConfigEngine.name} ayarları güncellendi.`);
        setEditingConfigEngine(null);
        await fetchEngines(true);
      } else {
        addLog('error', data.error || 'Ayarlar kaydedilemedi.');
      }
    } catch (err: any) {
      addLog('error', `Hata: ${err?.message || err}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const getEngineIcon = (category: string) => {
    switch (category) {
      case 'alerts':
        return <Bell className="w-4 h-4 text-rose-500" />;
      case 'ota':
        return <HardDrive className="w-4 h-4 text-indigo-500" />;
      case 'simulation':
        return <Radio className="w-4 h-4 text-amber-500" />;
      case 'watchdog':
        return <ShieldCheck className="w-4 h-4 text-emerald-500" />;
      case 'automation':
        return <Zap className="w-4 h-4 text-cyan-500" />;
      case 'downlink':
        return <Activity className="w-4 h-4 text-purple-500" />;
      case 'storage':
        return <Database className="w-4 h-4 text-sky-500" />;
      default:
        return <ServerCog className="w-4 h-4 text-indigo-500" />;
    }
  };

  const filteredEngines = engines.filter((e) => {
    const matchesCategory = selectedCategory === 'all' || e.category === selectedCategory;
    const matchesSearch =
      e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.tag.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const runningCount = engines.filter((e) => e.status === 'running').length;
  const stoppedCount = engines.filter((e) => e.status === 'stopped' || e.status === 'paused').length;

  return (
    <div className="space-y-5 animate-fadeIn pb-12">
      {/* Top Header - Standard Dashboard Proportions */}
      <div className="bg-white dark:bg-slate-900/80 backdrop-blur-md p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs">
        {onNavigateToTab && (
          <div className="mb-3">
            <button
              type="button"
              onClick={() => onNavigateToTab('system_settings')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors cursor-pointer group"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span>Sistem ve Ayarları'na Dön</span>
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 shrink-0">
              <Sliders className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                  Sistem Motorları
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  Otonom Servis Masası
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-2xl">
                Platformun arka planında çalışan otonom servisleri izleyin, motor çalışma durumlarını denetleyin ve operasyonel ayarları yapılandırın.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
            {/* View Mode Toggle: Karo vs Liste */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700/80">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Karo (Kart) Görünümü"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Karo</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Liste (Tablo) Görünümü"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Liste</span>
              </button>
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => fetchEngines()}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all cursor-pointer border border-slate-200 dark:border-slate-700 disabled:opacity-50"
              title="Motor verilerini canlı yenile"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-500' : ''}`} />
              <span className="hidden sm:inline">{refreshing ? 'Yenileniyor...' : 'Yenile'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-[#0f172a] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shrink-0">
            <Sliders className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block truncate">Toplam Motor</span>
            <span className="text-base font-bold font-mono text-slate-800 dark:text-slate-100">{engines.length}</span>
          </div>
        </div>
        <div className="bg-white dark:bg-[#0f172a] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-500 block truncate">Çalışan Motor</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">{runningCount}</span>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-[#0f172a] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
          <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block truncate">Durdurulan</span>
            <span className="text-base font-bold font-mono text-slate-700 dark:text-slate-300">{stoppedCount}</span>
          </div>
        </div>
        <div className="bg-white dark:bg-[#0f172a] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 shrink-0">
            <ServerCog className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold tracking-wider text-purple-500 block truncate">Worker Mimarisi</span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate block">Otonom Havuz</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-[#0f172a] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {[
            { id: 'all', label: 'Tümü' },
            { id: 'alerts', label: 'Bildirim & Alarm' },
            { id: 'ota', label: 'OTA & Donanım' },
            { id: 'simulation', label: 'Simülatör' },
            { id: 'watchdog', label: 'Saha Bekçisi' },
            { id: 'automation', label: 'Otomasyon' },
            { id: 'downlink', label: 'Komut & Downlink' },
            { id: 'storage', label: 'WAL & Veritabanı' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative sm:w-64 shrink-0">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Motor ara..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Content Area: Loading, Empty, or Dual Mode (Karo / Liste) */}
      {loading ? (
        <div className="p-12 text-center bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Sistem motorları taranıyor...</p>
        </div>
      ) : filteredEngines.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Aramanıza uygun sistem motoru bulunamadı.</p>
        </div>
      ) : viewMode === 'list' ? (
        /* TEK SATIR / LIST VIEW */
        <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-900/60 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Motor & Kategori</th>
                  <th className="py-3 px-4">Durum</th>
                  <th className="py-3 px-4">Temel Metrikler</th>
                  <th className="py-3 px-4">Döngü Frekansı</th>
                  <th className="py-3 px-4">Son Tetik</th>
                  <th className="py-3 px-4 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {filteredEngines.map((engine) => {
                  const isToggling = actionInProgress === `toggle_${engine.id}`;
                  const isTriggering = actionInProgress === `trigger_${engine.id}`;
                  const isRunning = engine.status === 'running';

                  return (
                    <tr
                      key={`engine_row_${engine.id}`}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Motor & Kategori */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 flex items-center justify-center shrink-0">
                            {getEngineIcon(engine.category)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                                {engine.name}
                              </span>
                              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                {engine.tag}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate max-w-xs">
                              {engine.categoryLabel}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Durum */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase ${
                            isRunning
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                          <span>{isRunning ? 'Çalışıyor' : 'Durduruldu'}</span>
                        </span>
                      </td>

                      {/* Metrikler */}
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-1.5 max-w-sm">
                          {Object.entries(engine.metrics).slice(0, 3).map(([key, val]) => (
                            <span
                              key={key}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-[10px] font-mono text-slate-700 dark:text-slate-300"
                            >
                              <span className="text-slate-400 dark:text-slate-500">{key}:</span>
                              <strong className="font-bold">{String(val)}</strong>
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Döngü */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600 dark:text-slate-400 font-medium text-xs">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{engine.intervalLabel || 'Event-driven'}</span>
                        </div>
                      </td>

                      {/* Son Tetik */}
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-500 dark:text-slate-400 text-[11px]">
                        {engine.lastRunAt ? new Date(engine.lastRunAt).toLocaleTimeString('tr-TR') : '—'}
                      </td>

                      {/* İşlemler */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {engine.capabilities.canToggle && (
                            <button
                              onClick={() => handleToggle(engine)}
                              disabled={isToggling}
                              title={isRunning ? 'Motoru Durdur' : 'Motoru Başlat'}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                                isRunning
                                  ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 hover:bg-rose-100 border border-rose-200 dark:border-rose-500/20'
                                  : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-500/20'
                              } disabled:opacity-50`}
                            >
                              {isToggling ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : isRunning ? (
                                <Square className="w-3 h-3 fill-current" />
                              ) : (
                                <Play className="w-3 h-3 fill-current" />
                              )}
                              <span>{isRunning ? 'Durdur' : 'Başlat'}</span>
                            </button>
                          )}

                          {engine.capabilities.canTrigger && (
                            <button
                              onClick={() => handleTrigger(engine)}
                              disabled={isTriggering}
                              title="Tek seferlik döngü çalıştır"
                              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer transition-all border border-slate-200 dark:border-slate-700 disabled:opacity-50"
                            >
                              <Zap className={`w-3.5 h-3.5 text-amber-500 ${isTriggering ? 'animate-bounce' : ''}`} />
                            </button>
                          )}

                          {engine.capabilities.canConfigure && (
                            <button
                              onClick={() => handleOpenConfig(engine)}
                              title="Motor ayarlarını yapılandır"
                              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer transition-all border border-slate-200 dark:border-slate-700"
                            >
                              <Settings className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {engine.capabilities.quickLinkTab && onNavigateToTab && (
                            <button
                              onClick={() => onNavigateToTab(engine.capabilities.quickLinkTab!)}
                              title={`${engine.capabilities.quickLinkLabel || 'Masaya Git'}`}
                              className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30 cursor-pointer transition-all"
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* KARO / GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredEngines.map((engine) => {
            const isToggling = actionInProgress === `toggle_${engine.id}`;
            const isTriggering = actionInProgress === `trigger_${engine.id}`;
            const isRunning = engine.status === 'running';

            return (
              <div
                key={engine.id}
                className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800/90 p-4 sm:p-5 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-500/40 transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 flex items-center justify-center shrink-0">
                        {getEngineIcon(engine.category)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">{engine.name}</h3>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                            {engine.tag}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                          {engine.categoryLabel}
                        </span>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="shrink-0">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase ${
                          isRunning
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                            : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                        <span>{isRunning ? 'Çalışıyor' : 'Durduruldu'}</span>
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-3 line-clamp-2">
                    {engine.description}
                  </p>

                  {/* Metrics Box */}
                  <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-50 dark:bg-[#0b1120] rounded-xl border border-slate-100 dark:border-slate-800/80 mb-3">
                    {Object.entries(engine.metrics).map(([key, val]) => (
                      <div key={key} className="min-w-0">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate block">{key}</span>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono truncate block">
                          {String(val)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Execution Cycle Info */}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 mb-3 px-1">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Döngü: <strong className="text-slate-700 dark:text-slate-300">{engine.intervalLabel || 'Event-driven'}</strong></span>
                    </div>
                    {engine.lastRunAt && (
                      <span className="text-[10px] font-mono">
                        Son: {new Date(engine.lastRunAt).toLocaleTimeString('tr-TR')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {engine.capabilities.canToggle && (
                      <button
                        onClick={() => handleToggle(engine)}
                        disabled={isToggling}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                          isRunning
                            ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 hover:bg-rose-100 border border-rose-200 dark:border-rose-500/20'
                            : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-500/20'
                        } disabled:opacity-50`}
                      >
                        {isToggling ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : isRunning ? (
                          <Square className="w-3 h-3 fill-current" />
                        ) : (
                          <Play className="w-3 h-3 fill-current" />
                        )}
                        <span>{isRunning ? 'Durdur' : 'Başlat'}</span>
                      </button>
                    )}

                    {engine.capabilities.canTrigger && (
                      <button
                        onClick={() => handleTrigger(engine)}
                        disabled={isTriggering}
                        title="Motoru hemen tek seferlik çalıştır"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer transition-all border border-slate-200 dark:border-slate-700 disabled:opacity-50"
                      >
                        <Zap className={`w-3 h-3 text-amber-500 ${isTriggering ? 'animate-bounce' : ''}`} />
                        <span>{isTriggering ? '...' : 'Tetikle'}</span>
                      </button>
                    )}

                    {engine.capabilities.canConfigure && (
                      <button
                        onClick={() => handleOpenConfig(engine)}
                        title="Motor ayarlarını düzenle"
                        className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer transition-all border border-slate-200 dark:border-slate-700"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {engine.capabilities.quickLinkTab && onNavigateToTab && (
                    <button
                      onClick={() => onNavigateToTab(engine.capabilities.quickLinkTab!)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer ml-auto"
                    >
                      <span>{engine.capabilities.quickLinkLabel || 'Masaya Git'}</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Simulator / Engine Configuration Modal */}
      {editingConfigEngine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  {editingConfigEngine.name} Ayarları
                </h3>
              </div>
              <button
                onClick={() => setEditingConfigEngine(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editingConfigEngine.id === 'simulator' && (
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Veri Üretim Sıklığı (Aralık)
                  </label>
                  <select
                    value={simInterval}
                    onChange={(e) => setSimInterval(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500"
                  >
                    <option value={1000}>1 Saniye (Yüksek Hız)</option>
                    <option value={2000}>2 Saniye (Standart)</option>
                    <option value={5000}>5 Saniye (Dengeli)</option>
                    <option value={10000}>10 Saniye (Yavaş)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Anomali & Hata Üretim Oranı
                  </label>
                  <select
                    value={simAnomalyRate}
                    onChange={(e) => setSimAnomalyRate(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500"
                  >
                    <option value={0}>%0 (Sıfır Hata / Saf Veri)</option>
                    <option value={0.05}>%5 (Düşük Anomali)</option>
                    <option value={0.10}>%10 (Orta Seviye Test)</option>
                    <option value={0.25}>%25 (Yüksek Stres / Kaotik)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Aktif Simülasyon Senaryosu
                  </label>
                  <select
                    value={simScenario}
                    onChange={(e) => setSimScenario(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500"
                  >
                    <option value="normal">Normal Endüstriyel Çalışma</option>
                    <option value="overheat">Kritik Sıcaklık Artışı (Aşırı Isınma)</option>
                    <option value="pressure_drop">Ani Basınç Düşüşü</option>
                    <option value="power_surge">Voltaj & Güç Dalgalanması</option>
                  </select>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setEditingConfigEngine(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                onClick={handleSaveConfig}
                disabled={Boolean(actionInProgress)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer shadow-xs disabled:opacity-50"
              >
                {actionInProgress ? 'Kaydediliyor...' : 'Ayarları Uygula'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Engine Action & Event Console Log */}
      <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-slate-500" />
            <h3 className="font-bold text-xs text-slate-900 dark:text-slate-100">
              Motor İşlem & Komut Günlüğü
            </h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
              Canlı Akış
            </span>
          </div>
          {logs.length > 0 && (
            <button
              onClick={() => setLogs([])}
              className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              Günlüğü Temizle
            </button>
          )}
        </div>

        {logs.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500 py-3 text-center">
            Henüz manuel işlem kaydedilmedi. Motorları başlattığınızda veya tetiklediğinizde işlemler burada listelenir.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 text-[11px] font-mono scrollbar-thin">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-2 p-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/60"
              >
                <span className="text-slate-400 shrink-0">[{log.timestamp}]</span>
                <span
                  className={
                    log.type === 'success'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : log.type === 'error'
                      ? 'text-rose-600 dark:text-rose-400'
                      : log.type === 'warn'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-700 dark:text-slate-300'
                  }
                >
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
