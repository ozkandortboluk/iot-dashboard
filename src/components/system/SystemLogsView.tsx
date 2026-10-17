import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type {
  SystemEvent,
  SystemEventLevel,
  SystemEventCategory,
  SystemLoggerConfig,
  LogIncludedFields,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useUserPreference } from '../../hooks/useUserPreference';
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
  ChevronDown,
  ChevronUp,
  Filter,
  Calendar,
  X,
  Server,
  Activity,
  Layers,
  Sparkles,
  Lock,
  Globe,
  Hash,
  Code,
  SlidersHorizontal,
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

  // Filters with Database & User Persistence
  const [searchQuery, setSearchQuery] = useUserPreference<string>('system_logs_search', '');
  const [selectedLevel, setSelectedLevel] = useUserPreference<string>('system_logs_level', 'all');
  const [selectedCategory, setSelectedCategory] = useUserPreference<string>('system_logs_category', 'all');
  const [autoRefreshInterval, setAutoRefreshInterval] = useUserPreference<number>('system_logs_refresh', 5000);

  // Visible Metadata Columns Toggle with Database & User Persistence
  const [visibleMeta, setVisibleMeta] = useUserPreference<Record<string, boolean>>('system_logs_visible_meta', {
    source: true,
    http: true,
    ip: true,
    device: true,
    user: true,
    traceId: true,
    stack: true,
    details: true,
  });
  const [isMetaDropdownOpen, setIsMetaDropdownOpen] = useState<boolean>(false);
  const metaDropdownRef = useRef<HTMLDivElement>(null);

  // Inline Expanded Rows
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());

  // Modals
  const [inspectedEvent, setInspectedEvent] = useState<SystemEvent | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isClearModalOpen, setIsClearModalOpen] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 50;



  // Close meta dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (metaDropdownRef.current && !metaDropdownRef.current.contains(e.target as Node)) {
        setIsMetaDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        showNotification('Loglama motoru ve alan seçim yapılandırması kalıcı olarak kaydedildi.');
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

  // Simplify & Deduplicate Logs
  const [isSimplifying, setIsSimplifying] = useState<boolean>(false);
  const handleSimplifyLogs = async () => {
    setIsSimplifying(true);
    try {
      const res = await fetch('/api/system-logs/simplify', {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        showNotification(data.message || 'Gereksiz ve yinelenen loglar sadeleştirildi.');
        fetchLogs();
      } else {
        showNotification('Sadeleştirme işlemi gerçekleştirilemedi', true);
      }
    } catch {
      showNotification('Sadeleştirme sırasında bağlantı hatası oluştu', true);
    } finally {
      setIsSimplifying(false);
    }
  };

  // Toggle inline row expansion
  const toggleRowExpansion = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalPages = Math.ceil(filteredCount / pageSize) || 1;

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Count active fields in config
  const activeFieldsCount = useMemo(() => {
    if (!config?.includedFields) return 8;
    return Object.values(config.includedFields).filter(Boolean).length;
  }, [config?.includedFields]);

  if (!isAdmin) {
    return (
      <div className="p-8 text-center space-y-4">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
          Yetkisiz Erişim (403)
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Sistem ve sunucu hata kayıtlarını yalnızca Sistem Yöneticisi (Admin) rolüne sahip kullanıcılar görüntüleyebilir.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {statusMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-semibold backdrop-blur-md border animate-in fade-in slide-in-from-bottom-5 duration-200 ${
            statusMessage.isError
              ? 'bg-rose-500/95 text-white border-rose-600 shadow-rose-500/20'
              : 'bg-emerald-600/95 text-white border-emerald-500 shadow-emerald-500/20'
          }`}
        >
          {statusMessage.isError ? (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Top Header & Management Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-[#0f172a] p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <Terminal className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
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
                Sunucu çalışırken oluşan kod hataları, API istisnaları, telemetri uyarıları ve detaylı sistem tanı kayıtları
              </p>
            </div>
          </div>

          {/* Active Configuration Quick Badges */}
          {config && (
            <div className="flex items-center gap-2 flex-wrap text-[11px] pt-1">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition-colors cursor-pointer"
                title="Log alanı seçimi ve ayarları düzenle"
              >
                <Layers className="w-3 h-3 text-indigo-500" />
                <span className="font-semibold">Seçili Alanlar: {activeFieldsCount}/8 Aktif</span>
              </button>

              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                <Lock className="w-3 h-3 text-amber-500" />
                <span>Maskeleme: {config.autoSanitizeSecrets ? 'Açık' : 'Kapalı'}</span>
              </span>

              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                <HardDrive className="w-3 h-3 text-emerald-500" />
                <span>Kayıt: {config.logToFile ? 'Disk + RAM' : 'Yalnızca RAM'}</span>
              </span>

              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                Asgari: {config.minLevel.toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* Main Power Toggle */}
          {config && (
            <button
              onClick={handleToggleLogging}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer ${
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

          {/* Simplify & Deduplicate Logs */}
          <button
            onClick={handleSimplifyLogs}
            disabled={isSimplifying}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
            title="Gereksiz, yinelenen ve çırpınan logları sadeleştirip temizler; kritik bildirim ve gerçek hataları korur"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isSimplifying ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Logları Sadeleştir</span>
          </button>

          {/* Test Error Generation */}
          <button
            onClick={handleGenerateTestError}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            title="Tanı amacıyla yapay bir hata kaydı oluşturup günlüğe yazar"
          >
            <Play className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Test Hatası Üret</span>
          </button>

          {/* Visible Columns / Metadata Filter Dropdown */}
          <div className="relative" ref={metaDropdownRef}>
            <button
              onClick={() => setIsMetaDropdownOpen(!isMetaDropdownOpen)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              title="Tabloda görüntülenecek sütun ve meta verileri seçin"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
              <span>Görünüm Sütunları</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isMetaDropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-3 z-30 space-y-2 text-xs">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="font-bold text-slate-800 dark:text-slate-200">Görünür Alanlar</span>
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleMeta({
                        source: true,
                        http: true,
                        ip: true,
                        device: true,
                        user: true,
                        traceId: true,
                        stack: true,
                        details: true,
                      })
                    }
                    className="text-[10px] text-indigo-500 hover:underline font-semibold"
                  >
                    Tümü
                  </button>
                </div>
                {[
                  { key: 'source', label: 'Sistem Kaynağı (Source)' },
                  { key: 'http', label: 'HTTP İstek (Metot/URL)' },
                  { key: 'ip', label: 'İstemci IP Adresi' },
                  { key: 'device', label: 'Cihaz ID' },
                  { key: 'user', label: 'Kullanıcı Bilgisi' },
                  { key: 'traceId', label: 'Trace ID (İzleme)' },
                  { key: 'stack', label: 'Stack Trace Rozeti' },
                  { key: 'details', label: 'JSON Tanı Detayları' },
                ].map((col) => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 p-1.5 rounded-lg select-none"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(visibleMeta[col.key])}
                      onChange={(e) =>
                        setVisibleMeta((prev) => ({
                          ...prev,
                          [col.key]: e.target.checked,
                        }))
                      }
                      className="rounded accent-indigo-600"
                    />
                    <span className="text-[11px]">{col.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Settings Modal Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-lg shadow-indigo-600/20 cursor-pointer"
            title="Loglama sistemi ve alan seçim yapılandırması"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Log Ayarları & Alanlar</span>
          </button>

          {/* Export Dropdown / Buttons */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5 border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => handleExport('json')}
              className="px-2.5 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              title="JSON formatında dışa aktar"
            >
              <Download className="w-3 h-3" />
              <span>JSON</span>
            </button>
            <button
              onClick={() => handleExport('log')}
              className="px-2.5 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              title="Düz metin log formatında dışa aktar"
            >
              <Download className="w-3 h-3" />
              <span>LOG</span>
            </button>
          </div>

          {/* Clear Logs Button */}
          <button
            onClick={() => setIsClearModalOpen(true)}
            className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors border border-transparent hover:border-rose-500/20 cursor-pointer"
            title="Tüm logları sıfırla / temizle"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {/* Manual Refresh */}
          <button
            onClick={() => fetchLogs()}
            disabled={isRefreshing}
            className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            title="Listeyi Yenile"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats Counter Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Toplam Olay</span>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-slate-900 dark:text-white font-mono">
              {totalCount}
            </span>
            <Activity className="w-4 h-4 text-indigo-500" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl border border-rose-200 dark:border-rose-900/30 shadow-sm space-y-1">
          <span className="text-[10px] uppercase font-bold text-rose-500 tracking-wider">Kritik Olaylar</span>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-rose-500 font-mono">
              {config?.counts?.critical ?? 0}
            </span>
            <AlertOctagon className="w-4 h-4 text-rose-500" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl border border-red-200 dark:border-red-900/30 shadow-sm space-y-1">
          <span className="text-[10px] uppercase font-bold text-red-500 tracking-wider">Sistem Hataları</span>
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
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Disk Dosyası</span>
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
              placeholder="Hata mesajı, çağrı yığını (stack trace), URL, IP, Trace ID veya kaynak ara..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
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
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
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
              className="w-full md:w-auto px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-semibold cursor-pointer"
            >
              <option value="all">Tüm Kategoriler</option>
              <option value="server">Server / Sunucu</option>
              <option value="http">HTTP İstekleri</option>
              <option value="api">API Çağrıları</option>
              <option value="database">Veritabanı / PostgreSQL</option>
              <option value="device">Cihaz İşlemleri</option>
              <option value="telemetry">Telemetri Akışı</option>
              <option value="alarm">Alarlar & Kurallar</option>
              <option value="automation">Otomasyonlar</option>
              <option value="websocket">WebSocket Bağlantıları</option>
              <option value="auth">Kimlik & Oturum</option>
              <option value="security">Güvenlik / Firewall</option>
              <option value="auto_repair">Otomatik Onarım</option>
              <option value="backup">Yedekleme & Restore</option>
              <option value="ota">OTA Güncellemeleri</option>
              <option value="worker">Arka Plan İşçileri</option>
              <option value="client">Web Arayüz / İstemci</option>
            </select>

            {/* Auto Refresh Interval */}
            <select
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(parseInt(e.target.value, 10))}
              className="w-full md:w-auto px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-semibold cursor-pointer"
              title="Otomatik Yenileme Sıklığı"
            >
              <option value="0">Canlı: Kapalı</option>
              <option value="1000">Canlı: 1 Saniye (Anlık)</option>
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
              const isExpanded = expandedRowIds.has(item.id);

              return (
                <div
                  key={item.id}
                  className={`transition-colors group ${
                    isCrit
                      ? 'bg-rose-50/20 dark:bg-rose-950/10 hover:bg-rose-50/40'
                      : isErr
                      ? 'bg-red-50/10 hover:bg-red-50/30'
                      : isWrn
                      ? 'hover:bg-amber-50/30 dark:hover:bg-amber-950/10'
                      : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div
                    onClick={() => setInspectedEvent(item)}
                    className="p-4 flex items-start justify-between gap-3 cursor-pointer"
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

                      {/* Main Message & Configured Metadata Badges */}
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                          <span
                            className="font-mono text-slate-400 dark:text-slate-500 shrink-0"
                            title={formatDateTime(item.timestamp)}
                          >
                            {formatRelativeTime(item.timestamp)}
                          </span>

                          <span className="px-2 py-0.5 rounded-full font-bold uppercase text-[10px] tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {item.category}
                          </span>

                          {visibleMeta.source && item.source && (
                            <span className="text-slate-500 dark:text-slate-400 font-mono text-[10px] bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.5 rounded">
                              [{item.source}]
                            </span>
                          )}

                          {visibleMeta.http && (item.method || item.path) && (
                            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 rounded border border-indigo-200 dark:border-indigo-800">
                              {item.method || 'REQ'} {item.path} {item.statusCode ? `(${item.statusCode})` : ''}
                            </span>
                          )}

                          {visibleMeta.ip && item.ip && (
                            <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                              <Globe className="w-2.5 h-2.5" />
                              {item.ip}
                            </span>
                          )}

                          {visibleMeta.device && item.deviceId && (
                            <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                              Cihaz: {item.deviceId}
                            </span>
                          )}

                          {visibleMeta.user && item.userId && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                              Kullanıcı: {item.userId}
                            </span>
                          )}

                          {visibleMeta.traceId && item.traceId && (
                            <span className="font-mono text-[9px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                              #{item.traceId.slice(0, 8)}
                            </span>
                          )}

                          {visibleMeta.stack && item.stack && (
                            <span className="px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-500 border border-rose-500/20 text-[9px] font-bold">
                              STACK
                            </span>
                          )}

                          {visibleMeta.details && item.details && (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[9px] font-semibold">
                              JSON DETAY
                            </span>
                          )}
                        </div>

                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 break-words leading-relaxed group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {item.message}
                        </p>
                      </div>
                    </div>

                    {/* Action Buttons & Expand Toggle */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => toggleRowExpansion(item.id, e)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title={isExpanded ? 'Detayları Daralt' : 'Hızlı Önizlemeyi Aç'}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(item.message, item.id);
                        }}
                        className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Mesajı Kopyala"
                      >
                        {copiedId === item.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectedEvent(item);
                        }}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors cursor-pointer"
                        title="Tam Pencerede İncele"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Inline Expanded Detail Drawer */}
                  {isExpanded && (
                    <div className="px-5 pb-4 pt-1 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/60 space-y-3 animate-in fade-in duration-150">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                        <div className="p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                          <span className="text-[10px] text-slate-400 font-semibold block uppercase">Zaman</span>
                          <span className="font-mono text-slate-800 dark:text-slate-200 text-[11px] truncate block">
                            {formatDateTime(item.timestamp)}
                          </span>
                        </div>
                        <div className="p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                          <span className="text-[10px] text-slate-400 font-semibold block uppercase">Kaynak</span>
                          <span className="font-mono text-slate-800 dark:text-slate-200 text-[11px] truncate block">
                            {item.source || 'system'}
                          </span>
                        </div>
                        <div className="p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                          <span className="text-[10px] text-slate-400 font-semibold block uppercase">İstemci IP</span>
                          <span className="font-mono text-slate-800 dark:text-slate-200 text-[11px] truncate block">
                            {item.ip || 'Yerel'}
                          </span>
                        </div>
                        <div className="p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                          <span className="text-[10px] text-slate-400 font-semibold block uppercase">Trace ID</span>
                          <span className="font-mono text-slate-800 dark:text-slate-200 text-[11px] truncate block">
                            {item.traceId || '-'}
                          </span>
                        </div>
                      </div>

                      {/* Stack Trace if present */}
                      {item.stack && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-rose-500 flex items-center gap-1">
                              <Terminal className="w-3.5 h-3.5" /> Çağrı Yığıtı (Stack Trace)
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(item.stack!, `stack_${item.id}`);
                              }}
                              className="text-rose-500 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              {copiedId === `stack_${item.id}` ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span>Kopyala</span>
                            </button>
                          </div>
                          <pre className="p-3 bg-[#0a0f1d] text-rose-300 rounded-xl border border-rose-950/50 font-mono text-[11px] overflow-x-auto max-h-48 leading-relaxed scrollbar-thin select-all">
                            {item.stack}
                          </pre>
                        </div>
                      )}

                      {/* Details JSON if present */}
                      {item.details && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-emerald-500 flex items-center gap-1">
                              <Code className="w-3.5 h-3.5" /> Yapılandırılmış Tanı Detayları (JSON)
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const text = typeof item.details === 'object' ? JSON.stringify(item.details, null, 2) : String(item.details);
                                handleCopy(text, `details_${item.id}`);
                              }}
                              className="text-emerald-500 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              {copiedId === `details_${item.id}` ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span>Kopyala</span>
                            </button>
                          </div>
                          <pre className="p-3 bg-[#0a0f1d] text-emerald-400 rounded-xl border border-slate-800 font-mono text-[11px] overflow-x-auto max-h-40 leading-relaxed scrollbar-thin select-all">
                            {typeof item.details === 'object' ? JSON.stringify(item.details, null, 2) : item.details}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
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
                className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Önceki</span>
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
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
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                onClick={handleClearLogs}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-600/20 transition-all cursor-pointer"
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

      {/* Settings Modal with Field Selection */}
      <SystemLogsSettingsModal
        config={config}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveSettings}
      />
    </div>
  );
};
