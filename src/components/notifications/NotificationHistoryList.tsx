import React, { useState, useMemo } from 'react';
import type { Device } from '../../types';
import { useRealtime } from '../../context/RealtimeContext';
import { apiFetch as fetch, safeJson } from '../../lib/apiFetch';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Trash2,
  CheckCheck,
  Search,
  Filter,
  Bot,
  Cpu,
  RefreshCw,
  Clock,
  Info,
  Layers,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';

interface NotificationHistoryListProps {
  devices: Device[];
  onShowToast?: (message: string, isError?: boolean) => void;
}

export const NotificationHistoryList: React.FC<NotificationHistoryListProps> = ({
  devices,
  onShowToast,
}) => {
  const {
    notifications,
    markNotificationRead,
    clearAllNotifications,
    deleteNotification,
    deleteAllNotifications,
    bulkDeleteNotifications,
    fetchNotifications,
  } = useRealtime();

  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'unread' | 'critical' | 'warning' | 'info'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'real' | 'simulated' | 'system'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Device Map for Quick Lookup
  const deviceMap = useMemo(() => {
    const map = new Map<string, Device>();
    devices.forEach((d) => map.set(d.id, d));
    return map;
  }, [devices]);

  // Filtered Notifications
  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      // 1. Severity / Read status
      if (severityFilter === 'unread' && n.read) return false;
      if (severityFilter === 'critical' && n.severity !== 'critical') return false;
      if (severityFilter === 'warning' && n.severity !== 'warning') return false;
      if (severityFilter === 'info' && n.severity !== 'info') return false;

      // 2. Source filter
      const isSim = n.isSimulation || n.source === 'simulator';
      if (sourceFilter === 'simulated' && !isSim) return false;
      if (sourceFilter === 'real' && (isSim || n.source === 'system')) return false;
      if (sourceFilter === 'system' && n.source !== 'system' && !n.title.toLowerCase().includes('sistem')) return false;

      // 3. Search query
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchedTitle = (n.title || '').toLowerCase().includes(q);
        const matchedMsg = (n.message || '').toLowerCase().includes(q);
        const matchedDevId = (n.deviceId || '').toLowerCase().includes(q);
        const matchedDevName = n.deviceId && deviceMap.get(n.deviceId)
          ? deviceMap.get(n.deviceId)!.name.toLowerCase().includes(q)
          : false;

        if (!matchedTitle && !matchedMsg && !matchedDevId && !matchedDevName) {
          return false;
        }
      }

      return true;
    });
  }, [notifications, severityFilter, sourceFilter, searchTerm, deviceMap]);

  // Counters
  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const criticalCount = useMemo(() => notifications.filter((n) => n.severity === 'critical').length, [notifications]);
  const warningCount = useMemo(() => notifications.filter((n) => n.severity === 'warning').length, [notifications]);
  const infoCount = useMemo(() => notifications.filter((n) => n.severity === 'info').length, [notifications]);

  // Bulk Actions
  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredNotifications.length && filteredNotifications.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredNotifications.map((n) => n.id)));
    }
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleBulkMarkRead = async () => {
    setIsProcessing(true);
    try {
      for (const id of selectedIds) {
        await markNotificationRead(id);
      }
      setSelectedIds(new Set());
      onShowToast?.(`${selectedIds.size} adet bildirim okundu olarak işaretlendi.`);
    } catch {
      onShowToast?.('Bildirimler güncellenirken hata oluştu.', true);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteSingle = async (id: string) => {
    try {
      await deleteNotification(id);
      await fetchNotifications();
      onShowToast?.('Bildirim başarıyla silindi.');
    } catch (err: any) {
      onShowToast?.(err.message || 'Bildirim silinirken hata oluştu.', true);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const count = ids.length;
    setIsProcessing(true);
    try {
      await bulkDeleteNotifications(ids);
      setSelectedIds(new Set());
      await fetchNotifications();
      onShowToast?.(`${count} adet bildirim başarıyla silindi.`);
    } catch (err: any) {
      onShowToast?.(err.message || 'Bildirimler silinirken hata oluştu.', true);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearAll = async () => {
    setIsProcessing(true);
    try {
      await clearAllNotifications();
      setSelectedIds(new Set());
      await fetchNotifications();
      onShowToast?.('Tüm okunmamış bildirimler okundu olarak işaretlendi.');
    } catch (err: any) {
      onShowToast?.(err.message || 'Bildirimler güncellenirken hata oluştu.', true);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmDeleteAll = async () => {
    setShowDeleteAllModal(false);
    setIsProcessing(true);
    try {
      await deleteAllNotifications();
      setSelectedIds(new Set());
      await fetchNotifications();
      onShowToast?.('Tüm bildirim geçmişi başarıyla temizlendi.');
    } catch (err: any) {
      onShowToast?.(err.message || 'Bildirimler silinirken hata oluştu.', true);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTimestamp = (ts: string | number) => {
    if (!ts) return 'Bilinmiyor';
    try {
      const d = new Date(ts);
      return d.toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return String(ts);
    }
  };

  const formatRelativeTime = (ts: string | number) => {
    if (!ts) return '';
    try {
      const diffSec = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
      if (diffSec < 60) return `${diffSec} sn önce`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin} dk önce`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour} sa önce`;
      const diffDay = Math.floor(diffHour / 24);
      return `${diffDay} gün önce`;
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Top Banner / Header Card */}
      <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center shrink-0">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Gelen Bildirimler & Geçmiş
                </h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs font-bold animate-pulse">
                    {unreadCount} Okunmamış
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Sistem uyarıları, telemetri eşik aşımları, cihaz durumları ve olay kayıtları.
              </p>
            </div>
          </div>

          {/* Quick Global Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {unreadCount > 0 && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleClearAll}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30 transition-all flex items-center gap-1.5 cursor-pointer"
                title="Tüm okunmamış bildirimleri okundu olarak işaretler"
              >
                <CheckCheck className="w-4 h-4" />
                <span>Tümünü Okundu İşaretle</span>
              </button>
            )}

            {notifications.length > 0 && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => setShowDeleteAllModal(true)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 transition-all flex items-center gap-1.5 cursor-pointer"
                title="Tüm bildirim geçmişini kalıcı olarak temizler"
              >
                <Trash2 className="w-4 h-4" />
                <span>Tümünü Temizle</span>
              </button>
            )}

            <button
              type="button"
              onClick={fetchNotifications}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer"
              title="Bildirimleri Yenile"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Severity Stats Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <div
            onClick={() => setSeverityFilter(severityFilter === 'critical' ? 'all' : 'critical')}
            className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
              severityFilter === 'critical'
                ? 'bg-rose-500/10 border-rose-500 text-rose-600 dark:text-rose-400'
                : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500">
                <XCircle className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Kritik</span>
            </div>
            <span className="text-sm font-black text-rose-600 dark:text-rose-400">{criticalCount}</span>
          </div>

          <div
            onClick={() => setSeverityFilter(severityFilter === 'warning' ? 'all' : 'warning')}
            className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
              severityFilter === 'warning'
                ? 'bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400'
                : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Uyarı</span>
            </div>
            <span className="text-sm font-black text-amber-600 dark:text-amber-400">{warningCount}</span>
          </div>

          <div
            onClick={() => setSeverityFilter(severityFilter === 'info' ? 'all' : 'info')}
            className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
              severityFilter === 'info'
                ? 'bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                <Info className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Bilgi</span>
            </div>
            <span className="text-sm font-black text-blue-600 dark:text-blue-400">{infoCount}</span>
          </div>

          <div
            onClick={() => setSeverityFilter(severityFilter === 'unread' ? 'all' : 'unread')}
            className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
              severityFilter === 'unread'
                ? 'bg-indigo-500/10 border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                <Bell className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Okunmamış</span>
            </div>
            <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">{unreadCount}</span>
          </div>
        </div>

        {/* Filter Controls & Search */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-2">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Bildirim başlığı, içerik veya cihaz adı ile ara..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>

          {/* Source Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <button
              type="button"
              onClick={() => setSourceFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                sourceFilter === 'all'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              Tüm Kaynaklar
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter('real')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                sourceFilter === 'real'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              <Cpu className="w-3 h-3" />
              <span>Saha Donanımı</span>
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter('simulated')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                sourceFilter === 'simulated'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              <Bot className="w-3 h-3" />
              <span>Simülasyon / Test</span>
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter('system')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                sourceFilter === 'system'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>Sistem & API</span>
            </button>
          </div>
        </div>

        {/* Bulk Action Bar (When items selected) */}
        {selectedIds.size > 0 && (
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl flex items-center justify-between flex-wrap gap-2 animate-fadeIn">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                {selectedIds.size} bildirim seçildi
              </span>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-[11px] text-slate-500 hover:underline cursor-pointer"
              >
                Seçimi Temizle
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleBulkMarkRead}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Okundu Yap</span>
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleBulkDelete}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Sil</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Notifications List Container */}
      <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        {/* Table/List Header */}
        <div className="px-5 py-3.5 bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={
                filteredNotifications.length > 0 &&
                selectedIds.size === filteredNotifications.length
              }
              onChange={handleToggleSelectAll}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 cursor-pointer"
              title="Tümünü Seç / Kaldır"
            />
            <span>BİLDİRİM & OLAY DETAYI ({filteredNotifications.length})</span>
          </div>
          <div className="hidden sm:flex items-center gap-6">
            <span>KAYNAK / CİHAZ</span>
            <span>ZAMAN</span>
            <span>İŞLEMLER</span>
          </div>
        </div>

        {/* Notifications Items */}
        {filteredNotifications.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800/60 text-slate-400 flex items-center justify-center mx-auto">
              <Bell className="w-8 h-8 opacity-40" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {searchTerm || severityFilter !== 'all' || sourceFilter !== 'all'
                  ? 'Filtrelere Uygun Bildirim Bulunamadı'
                  : 'Henüz Bildirim Kaydı Yok'}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                {searchTerm || severityFilter !== 'all' || sourceFilter !== 'all'
                  ? 'Arama kriterlerinizi veya filtrelerinizi sıfırlayarak tekrar deneyebilirsiniz.'
                  : 'Sistem veya saha cihazlarından alarm, eşik aşımı veya kritik olay gerçekleştiğinde burada listelenecektir.'}
              </p>
            </div>
            {(searchTerm || severityFilter !== 'all' || sourceFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSeverityFilter('all');
                  setSourceFilter('all');
                }}
                className="mt-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 transition-colors cursor-pointer"
              >
                Filtreleri Temizle
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {filteredNotifications.map((n) => {
              const dev = n.deviceId ? deviceMap.get(n.deviceId) : null;
              const isSim = n.isSimulation || n.source === 'simulator';
              const isSelected = selectedIds.has(n.id);

              return (
                <div
                  key={n.id}
                  onClick={() => markNotificationRead(n.id)}
                  className={`p-4 sm:px-5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group ${
                    !n.read
                      ? 'bg-indigo-50/40 dark:bg-indigo-950/20 hover:bg-indigo-50/70 dark:hover:bg-indigo-900/30'
                      : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                  } ${isSelected ? 'ring-2 ring-indigo-500/50 bg-indigo-500/5' : ''}`}
                >
                  {/* Left Column: Checkbox, Severity Icon, Title, Message */}
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => handleToggleSelect(n.id, e as any)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                      />
                    </div>

                    {/* Severity Icon */}
                    <div className="shrink-0 mt-0.5">
                      {n.severity === 'critical' ? (
                        <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center border border-rose-500/20">
                          <XCircle className="w-4 h-4" />
                        </div>
                      ) : n.severity === 'warning' ? (
                        <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/20">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center border border-blue-500/20">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                      )}
                    </div>

                    {/* Title & Message */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {!n.read && (
                          <span
                            className="w-2 h-2 rounded-full bg-indigo-600 dark:text-indigo-400 shrink-0"
                            title="Okunmamış bildirim"
                          />
                        )}
                        <h4
                          className={`text-xs sm:text-sm font-bold truncate ${
                            !n.read
                              ? 'text-slate-900 dark:text-white'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {n.title}
                        </h4>

                        {/* Badges */}
                        {isSim && (
                          <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 shrink-0">
                            TEST ALARMI
                          </span>
                        )}

                        {n.severity === 'critical' && (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 shrink-0">
                            KRİTİK
                          </span>
                        )}

                        {n.severity === 'warning' && (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                            UYARI
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed break-words">
                        {n.message}
                      </p>

                      {/* Mobile metadata bar */}
                      <div className="flex items-center gap-2 mt-2 sm:hidden text-[10px] text-slate-400 flex-wrap">
                        {dev && (
                          <span className="flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300">
                            {dev.isSimulated ? (
                              <Bot className="w-2.5 h-2.5 text-purple-400" />
                            ) : (
                              <Cpu className="w-2.5 h-2.5 text-emerald-400" />
                            )}
                            <span>{dev.name}</span>
                          </span>
                        )}
                        <span>•</span>
                        <span>{formatRelativeTime(n.timestamp)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Device Tag, Timestamp, Action Buttons */}
                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-center pl-10 sm:pl-0">
                    {/* Device Tag */}
                    <div className="hidden sm:block text-right">
                      {dev ? (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold">
                          {dev.isSimulated ? (
                            <Bot className="w-3 h-3 text-purple-400 shrink-0" />
                          ) : (
                            <Cpu className="w-3 h-3 text-emerald-400 shrink-0" />
                          )}
                          <span className="truncate max-w-[120px]">{dev.name}</span>
                        </div>
                      ) : n.deviceId ? (
                        <span className="text-[10px] font-mono text-slate-400">
                          {n.deviceId}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Sistem</span>
                      )}
                    </div>

                    {/* Timestamp */}
                    <div
                      className="hidden sm:block text-right min-w-[90px]"
                      title={formatTimestamp(n.timestamp)}
                    >
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {formatRelativeTime(n.timestamp)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(n.timestamp).toLocaleTimeString('tr-TR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>

                    {/* Actions */}
                    <div
                      className="flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => markNotificationRead(n.id)}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          !n.read
                            ? 'text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10'
                            : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                        title={!n.read ? 'Okundu Olarak İşaretle' : 'Okundu'}
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteSingle(n.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Bildirimi Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete All Confirmation Modal */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full space-y-4">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
                <AlertCircle className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Tüm Bildirimleri Temizle?
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Bu işlem tüm bildirim geçmişini kalıcı olarak silecektir. Bu işlem geri alınamaz. Devam etmek istediğinize emin misiniz?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowDeleteAllModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmDeleteAll}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Trash2 className="w-4 h-4" />
                <span>Evet, Tümünü Sil</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
