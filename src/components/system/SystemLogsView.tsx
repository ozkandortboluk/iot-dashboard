import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { SystemEvent, SystemEventLevel, SystemEventCategory, SystemLoggerConfig } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { apiFetch as fetch } from '../../lib/apiFetch';
import { formatDateTime, formatRelativeTime } from '../../lib/utils';
import { SystemLogDetailModal } from './SystemLogDetailModal';
import { SystemLogsSettingsModal } from './SystemLogsSettingsModal';
import {
  Terminal,
  AlertTriangle,
  AlertOctagon,
  Info,
  ShieldAlert,
  Search,
  RefreshCw,
  Sliders,
  Download,
  Trash2,
  Power,
  Play,
  CheckCircle2,
  HardDrive,
  Copy,
  Check,
  Eye,
  ChevronLeft,
  ChevronRight,
  Filter,
  Calendar,
  X,
  Server,
  Activity,
  Layers,
  ArrowUpDown,
} from 'lucide-react';

export const SystemLogsView: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // State Management
  const [logs, setLogs] = useState<SystemEvent[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [filteredCount, setFilteredCount] = useState<number>(0);
  const [config, setConfig] = useState<SystemLoggerConfig | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Filters with persistence
  const [searchQuery, setSearchQuery] = useState<string>(() => localStorage.getItem('system_logs_search') || '');
  const [selectedLevel, setSelectedLevel] = useState<string>(() => localStorage.getItem('system_logs_level') || 'all');
  const [selectedCategory, setSelectedCategory] = useState<string>(() => localStorage.getItem('system_logs_category') || 'all');
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(() => {
    const saved = localStorage.getItem('system_logs_refresh');
    return saved ? parseInt(saved, 10) : 5000;
  });

  // Modals
  const [inspectedEvent, setInspectedEvent] = useState<SystemEvent | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isClearModalOpen, setIsClearModalOpen] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 50;

  // Persist filters
  useEffect(() => {
    localStorage.setItem('system_logs_search', searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    localStorage.setItem('system_logs_level', selectedLevel);
  }, [selectedLevel]);

  useEffect(() => {
    localStorage.setItem('system_logs_category', selectedCategory);
  }, [selectedCategory]);

  useEffect(() => {
    localStorage.setItem('system_logs_refresh', String(autoRefreshInterval));
  }, [autoRefreshInterval]);

  const showNotification = (text: string, isError: boolean = false) => {
    setStatusMessage({ text, isError });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // Fetch Logs
  const fetchLogs = useCallback(async (silent = false) => {
    if (!isAdmin) return;
    if (!silent) setIsRefreshing(true);

    try {
      const params = new URLSearchParams();
      if (selectedLevel !== 'all') params.append('level', selectedLevel);
      if (selectedCategory !== 'all') params.append('category', selectedCategory);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      params.append('limit', String(pageSize));
      params.append('offset', String((currentPage - 1) * pageSize));

      const res = await fetch(`/api/system-logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.events || []);
        setTotalCount(data.total || 0);
        setFilteredCount(data.filteredTotal || 0);
        if (data.config) {
          setConfig(data.config);
        }
      }
    } catch (err: any) {
      if (!silent) {
        showNotification(err?.message || 'Log kayıtları alınamadı', true);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isAdmin, selectedLevel, selectedCategory, searchQuery, currentPage, pageSize]);

  // Initial load and filter reload
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Auto-refresh timer
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const interval = setInterval(() => {
      fetchLogs(true);
    }, autoRefreshInterval);
    return () => clearInterval(interval);
  }, [autoRefreshInterval, fetchLogs]);

  // Toggle Log Engine State
  const handleToggleLogging = async () => {
    if (!config) return;
    const newEnabled = !config.enabled;
    try {
      const res = await fetch('/api/system-logs/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        showNotification(
          newEnabled ? 'Sistem loglama motoru AKTİF edildi.' : 'Sistem loglama motoru GEÇİCİ OLARAK DURDURULDU.',
          !newEnabled
        );
        fetchLogs(true);
      }
    } catch {
      showNotification('Ayar güncellenirken hata oluştu', true);
    }
  };

  // Save Settings from Modal
  const handleSaveSettings = async (newSettings: Partial<SystemLoggerConfig>) => {
    try {
      const res = await fetch('/api/system-logs/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        showNotification('Loglama motoru yapılandırması güncellendi.');
        fetchLogs(true);
      }
    } catch {
      showNotification('Yapılandırma kaydedilemedi', true);
    }
  };

  // Clear Logs
  const handleClearLogs = async () => {
    try {
      const res = await fetch('/api/system-logs/clear', { method: 'POST' });
      if (res.ok) {
        showNotification('Tüm sistem ve hata logları temizlendi.');
        setIsClearModalOpen(false);
        fetchLogs();
      }
    } catch {
      showNotification('Loglar temizlenirken hata oluştu', true);
    }
  };

  // Generate Simulated Test Error
  const handleGenerateTestError = async () => {
    try {
      const res = await fetch('/api/system-logs/test-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 'error',
          category: 'server',
          message: `Tanı Doğrulama Test Hatası: Kod ve sistem seviyesi hata yakalama doğrulaması (${new Date().toLocaleTimeString('tr-TR')})`,
        }),
      });
      if (res.ok) {
        showNotification('Tanı/Test hata kaydı başarıyla oluşturuldu ve günlüğe işlendi.');
        fetchLogs();
      }
    } catch {
      showNotification('Test hatası oluşturulamadı', true);
    }
  };

  // Download / Export Logs
  const handleExport = (format: 'json' | 'log') => {
    window.location.href = `/api/system-logs/export?format=${format}`;
  };

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Permission Guard (Rule 1)
  if (!isAdmin) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center space-y-4">
        <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto border border-rose-500/20">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white">Yetkisiz Erişim</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Sunucu çalışma zamanı logları, sistem hataları ve teşhis araçları yalnızca{' '}
          <strong>Sistem Yöneticisi (Admin)</strong> rolüne açıktır.
        </p>
      </div>
    );
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const totalPages = Math.ceil(filteredCount / pageSize) || 1;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {statusMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl border text-xs font-semibold backdrop-blur-md transition-all ${
            statusMessage.isError
              ? 'bg-rose-500 text-white border-rose-600'
              : 'bg-emerald-600 text-white border-emerald-700'
          }`}
        >
          {statusMessage.isError ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Main Header Card */}
      <div className="bg-white dark:bg-[#0f172a] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-2xl border border-indigo-500/20">
              <Terminal className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Sunucu Sistem & Hata Günlükleri
                </h2>
                {config && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border flex items-center gap-1.5 ${
                      config.enabled
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                        : 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        config.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                      }`}
                    />
                    {config.enabled ? 'Loglama Aktif' : 'Loglama Kapalı'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Sunucu çalışırken oluşan kod hataları, API istisnaları ve sistem tanı günlükleri
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* Main Power Toggle */}
          {config && (
            <button
              onClick={handleToggleLogging}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                config.enabled
                  ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
              }`}
              title={config.enabled ? 'Loglama sistemini geçici olarak durdur' : 'Loglama sistemini başlat'}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{config.enabled ? 'Loglamayı Durdur' : 'Loglamayı Başlat'}</span>
            </button>
          )}

          {/* Test Error Generation */}
          <button
            onClick={handleGenerateTestError}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 rounded-xl text-xs font-bold transition-colors"
            title="Tanı amacıyla yapay bir hata kaydı oluşturup günlüğe yazar"
          >
            <Play className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Test Hatası Üret</span>
          </button>

          {/* Settings Modal Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-colors"
            title="Log yapılandırması"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Ayarlar</span>
          </button>

          {/* Export Dropdown / Buttons */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5 border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => handleExport('json')}
              className="px-2.5 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white rounded-lg transition-colors flex items-center gap-1"
              title="JSON formatında indir"
            >
              <Download className="w-3 h-3" />
              <span>JSON</span>
            </button>
            <div className="w-px h-3.5 bg-slate-300 dark:bg-slate-700" />
            <button
              onClick={() => handleExport('log')}
              className="px-2.5 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white rounded-lg transition-colors flex items-center gap-1"
              title="Düz metin .log formatında indir"
            >
              <span>LOG</span>
            </button>
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => fetchLogs()}
            disabled={isRefreshing}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-colors disabled:opacity-50"
            title="Yenile"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-500' : ''}`} />
          </button>

          {/* Clear Logs Button */}
          <button
            onClick={() => setIsClearModalOpen(true)}
            className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors"
            title="Tüm logları temizle"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Metrics Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Toplam Olay</span>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-slate-900 dark:text-white font-mono">
              {config?.counts?.total ?? totalCount}
            </span>
            <Activity className="w-4 h-4 text-slate-400" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl border border-rose-200 dark:border-rose-900/30 shadow-sm space-y-1">
          <span className="text-[10px] uppercase font-bold text-rose-500 tracking-wider">Kritik Hatalar</span>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-rose-500 font-mono">
              {config?.counts?.critical ?? 0}
            </span>
            <AlertOctagon className="w-4 h-4 text-rose-500" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl border border-red-200 dark:border-red-900/30 shadow-sm space-y-1">
          <span className="text-[10px] uppercase font-bold text-red-500 tracking-wider">Hatalar</span>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-red-500 font-mono">
              {config?.counts?.error ?? 0}
            </span>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl border border-amber-200 dark:border-amber-900/30 shadow-sm space-y-1">
          <span className="text-[10px] uppercase font-bold text-amber-500 tracking-wider">Uyarılar</span>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-amber-500 font-mono">
              {config?.counts?.warn ?? 0}
            </span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl border border-sky-200 dark:border-sky-900/30 shadow-sm space-y-1">
          <span className="text-[10px] uppercase font-bold text-sky-500 tracking-wider">Bilgilendirme</span>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-sky-500 font-mono">
              {config?.counts?.info ?? 0}
            </span>
            <Info className="w-4 h-4 text-sky-500" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Disk Boyutu</span>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-extrabold text-slate-700 dark:text-slate-300 font-mono">
              {formatFileSize(config?.fileSizeBytes || 0)}
            </span>
            <HardDrive className="w-4 h-4 text-indigo-500" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-[#0f172a] p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Hata mesajı, çağrı yığını (stack trace), URL veya kaynak ara..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Level Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 shrink-0 w-full md:w-auto overflow-x-auto">
            {[
              { id: 'all', label: 'Tümü' },
              { id: 'critical', label: 'Kritik', color: 'text-rose-500' },
              { id: 'error', label: 'Hata', color: 'text-red-500' },
              { id: 'warn', label: 'Uyarı', color: 'text-amber-500' },
              { id: 'info', label: 'Bilgi', color: 'text-sky-500' },
            ].map((lvl) => (
              <button
                key={lvl.id}
                onClick={() => {
                  setSelectedLevel(lvl.id);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  selectedLevel === lvl.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {lvl.color && <span className={`${lvl.color} mr-1`}>●</span>}
                {lvl.label}
              </button>
            ))}
          </div>

          {/* Category Dropdown */}
          <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full md:w-auto px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-semibold"
            >
              <option value="all">Tüm Kategoriler</option>
              <option value="server">Server / Sunucu</option>
              <option value="api">API İstekleri</option>
              <option value="database">Veritabanı / PostgreSQL</option>
              <option value="websocket">WebSocket</option>
              <option value="telemetry">Telemetri</option>
              <option value="auth">Kimlik / Yetki</option>
              <option value="client">Web Arayüz / İstemci</option>
              <option value="auto_repair">Otomatik Onarım</option>
              <option value="security">Güvenlik</option>
              <option value="backup">Yedekleme</option>
            </select>

            {/* Auto Refresh Interval */}
            <select
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(parseInt(e.target.value, 10))}
              className="w-full md:w-auto px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-semibold"
              title="Otomatik Yenileme Sıklığı"
            >
              <option value="0">Canlı: Kapalı</option>
              <option value="3000">Canlı: 3 Saniye</option>
              <option value="5000">Canlı: 5 Saniye</option>
              <option value="10000">Canlı: 10 Saniye</option>
              <option value="30000">Canlı: 30 Saniye</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Logs Table / Stream */}
      <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800 dark:text-slate-200">
              Kayıt Listesi ({filteredCount} sonuç)
            </span>
            {searchQuery && (
              <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[11px] font-medium">
                "{searchQuery}" filtresi aktif
              </span>
            )}
          </div>
          <span className="text-[11px] font-mono">
            Sayfa {currentPage} / {totalPages}
          </span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-500" />
            <p className="text-xs text-slate-500">Loglar yükleniyor...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            </div>
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Kriterlere Uygun Log Kaydı Bulunamadı
            </h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Seçili filtrelerde herhangi bir hata veya olay kaydı mevcut değil. Loglama sistemini test etmek için yukarıdaki "Test Hatası Üret" butonunu kullanabilirsiniz.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60 overflow-x-auto text-xs">
            {logs.map((item) => {
              const isCrit = item.level === 'critical';
              const isErr = item.level === 'error';
              const isWrn = item.level === 'warn';

              return (
                <div
                  key={item.id}
                  onClick={() => setInspectedEvent(item)}
                  className={`p-4 flex items-start justify-between gap-4 cursor-pointer transition-colors group ${
                    isCrit
                      ? 'hover:bg-rose-50/60 dark:hover:bg-rose-950/20 bg-rose-50/20 dark:bg-rose-950/10'
                      : isErr
                      ? 'hover:bg-red-50/50 dark:hover:bg-red-950/10 bg-red-50/10'
                      : isWrn
                      ? 'hover:bg-amber-50/50 dark:hover:bg-amber-950/10'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {/* Level Icon */}
                    <div className="mt-0.5 shrink-0">
                      {isCrit ? (
                        <div className="p-1.5 bg-rose-500/10 text-rose-500 rounded-xl border border-rose-500/20">
                          <AlertOctagon className="w-4 h-4" />
                        </div>
                      ) : isErr ? (
                        <div className="p-1.5 bg-red-500/10 text-red-500 rounded-xl border border-red-500/20">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                      ) : isWrn ? (
                        <div className="p-1.5 bg-amber-500/10 text-amber-500 rounded-xl border border-amber-500/20">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="p-1.5 bg-sky-500/10 text-sky-500 rounded-xl border border-sky-500/20">
                          <Info className="w-4 h-4" />
                        </div>
                      )}
                    </div>

                    {/* Main Content */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap text-[11px]">
                        <span className="font-mono text-slate-400 dark:text-slate-500 shrink-0" title={formatDateTime(item.timestamp)}>
                          {formatRelativeTime(item.timestamp)}
                        </span>
                        <span className="px-2 py-0.5 rounded-full font-bold uppercase text-[10px] tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {item.category}
                        </span>
                        {item.method && item.path && (
                          <span className="font-mono text-[10px] px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded">
                            {item.method} {item.path}
                          </span>
                        )}
                        {item.source && (
                          <span className="text-slate-400 font-mono text-[10px]">
                            [{item.source}]
                          </span>
                        )}
                        {item.stack && (
                          <span className="px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-500 border border-rose-500/20 text-[9px] font-bold">
                            STACK
                          </span>
                        )}
                      </div>

                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 break-words leading-relaxed group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {item.message}
                      </p>
                    </div>
                  </div>

                  {/* Actions on hover */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy(item.message, item.id);
                      }}
                      className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="Mesajı Kopyala"
                    >
                      {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setInspectedEvent(item);
                      }}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                      title="Detaylı İncele"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs bg-slate-50/50 dark:bg-slate-900/50">
            <span className="text-slate-500">
              Toplam {filteredCount} kayıttan {(currentPage - 1) * pageSize + 1} -{' '}
              {Math.min(currentPage * pageSize, filteredCount)} arası gösteriliyor
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Önceki</span>
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <span>Sonraki</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Clear Confirmation Modal */}
      {isClearModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Tüm Log Kayıtlarını Temizle
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Bellekteki tüm olaylar ve diskteki sistem log dosyası sıfırlanacaktır. Bu işlem geri alınamaz. Devam etmek istiyor musunuz?
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setIsClearModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Vazgeç
              </button>
              <button
                onClick={handleClearLogs}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-600/20 transition-all"
              >
                Evet, Temizle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Detail Inspector Modal */}
      <SystemLogDetailModal
        event={inspectedEvent}
        onClose={() => setInspectedEvent(null)}
      />

      {/* Settings Modal */}
      <SystemLogsSettingsModal
        config={config}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveSettings}
      />
    </div>
  );
};
