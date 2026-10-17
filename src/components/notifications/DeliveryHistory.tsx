import React, { useState, useEffect } from 'react';
import { useUserPreference } from '../../hooks/useUserPreference';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  RefreshCw,
  Smartphone,
  Mail,
  MessageSquare,
  Globe,
  Bell,
  Layers,
  ChevronRight,
  ChevronLeft,
  Info,
  Trash2,
  CheckSquare,
} from 'lucide-react';
import type { DispatchLogItem, NotificationChannel } from '../../types';
import { formatDateTime } from '../../lib/utils';
import { BulkDeleteModal } from '../common/BulkDeleteModal';

interface DeliveryHistoryProps {
  logs: DispatchLogItem[];
  onRefresh?: () => void;
  onDelete?: (logId: string) => Promise<void>;
  onBulkDelete?: (logIds: string[]) => Promise<void>;
  onBulkDeleteLogs?: (logIds: string[]) => Promise<void>;
  onClearHistory?: () => Promise<void>;
}

export const DeliveryHistory: React.FC<DeliveryHistoryProps> = ({
  logs,
  onRefresh,
  onDelete,
  onBulkDelete,
  onBulkDeleteLogs,
  onClearHistory,
}) => {
  const effectiveBulkDelete = onBulkDelete || onBulkDeleteLogs;

  // Filters with Database & User Persistence
  const [searchTerm, setSearchTerm] = useUserPreference<string>('delivery_filter_search', '');
  const [channelFilter, setChannelFilter] = useUserPreference<string>('delivery_filter_channel', 'all');
  const [statusFilter, setStatusFilter] = useUserPreference<string>('delivery_filter_status', 'all');
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<DispatchLogItem | null>(null);

  // Bulk Selection States
  const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Single Delete State
  const [logToDelete, setLogToDelete] = useState<DispatchLogItem | null>(null);
  const [isSingleDeleting, setIsSingleDeleting] = useState(false);

  // Clear All Modal State
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const filteredLogs = logs.filter((log) => {
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchesTitle = log.title?.toLowerCase().includes(q);
      const matchesMsg = log.message?.toLowerCase().includes(q);
      const matchesRecipient = log.recipient?.toLowerCase().includes(q);
      if (!matchesTitle && !matchesMsg && !matchesRecipient) return false;
    }
    if (channelFilter !== 'all' && log.channel !== channelFilter) return false;
    if (statusFilter !== 'all' && log.status !== statusFilter) return false;
    return true;
  });

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, channelFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / itemsPerPage));
  const currentLogs = filteredLogs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleToggleLogSelect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedLogIds.size === filteredLogs.length && filteredLogs.length > 0) {
      setSelectedLogIds(new Set());
    } else {
      setSelectedLogIds(new Set(filteredLogs.map((l) => l.id)));
    }
  };

  const handleConfirmBulkDelete = async () => {
    if (!effectiveBulkDelete || selectedLogIds.size === 0) return;
    setIsBulkDeleting(true);
    try {
      await effectiveBulkDelete(Array.from(selectedLogIds));
      setSelectedLogIds(new Set());
      setShowBulkDeleteModal(false);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleConfirmSingleDelete = async () => {
    if (!logToDelete || !onDelete) return;
    setIsSingleDeleting(true);
    try {
      await onDelete(logToDelete.id);
      setSelectedLogIds((prev) => {
        const next = new Set(prev);
        next.delete(logToDelete.id);
        return next;
      });
      setLogToDelete(null);
    } finally {
      setIsSingleDeleting(false);
    }
  };

  const handleConfirmClearAll = async () => {
    if (!onClearHistory) return;
    setIsClearingAll(true);
    try {
      await onClearHistory();
      setSelectedLogIds(new Set());
      setShowClearAllModal(false);
    } finally {
      setIsClearingAll(false);
    }
  };

  const selectedLogsList = filteredLogs.filter((l) => selectedLogIds.has(l.id));
  const selectedLogPreviews = selectedLogsList.map((l) => `[${l.channel.toUpperCase()}] ${l.recipient} - ${l.title}`);

  const getChannelIcon = (ch: NotificationChannel) => {
    switch (ch) {
      case 'whatsapp':
        return <Smartphone className="w-4 h-4 text-emerald-500" />;
      case 'telegram':
        return <MessageSquare className="w-4 h-4 text-sky-500" />;
      case 'email':
        return <Mail className="w-4 h-4 text-indigo-500" />;
      case 'sms':
        return <Smartphone className="w-4 h-4 text-amber-500" />;
      case 'webhook':
        return <Globe className="w-4 h-4 text-purple-500" />;
      default:
        return <Bell className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      {/* Inspector Modal */}
      {selectedLogForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Info className="w-5 h-5 text-indigo-500" />
                <span>İletim Kayıt Ayrıntısı</span>
              </h4>
              <button
                onClick={() => setSelectedLogForDetails(null)}
                className="text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                Kapat
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Kanal:</span>
                <span className="font-bold text-slate-900 dark:text-white uppercase">{selectedLogForDetails.channel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Alıcı:</span>
                <span className="font-mono text-indigo-600 dark:text-indigo-400 font-semibold">{selectedLogForDetails.recipient}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Gecikme (Latency):</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{selectedLogForDetails.latencyMs} ms</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Gönderim Zamanı:</span>
                <span>{formatDateTime(selectedLogForDetails.sentAt)}</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Servis Sağlayıcı Yanıtı / Payload
              </label>
              <pre className="p-3 bg-slate-950 text-slate-200 rounded-xl text-[11px] font-mono overflow-x-auto max-h-48 whitespace-pre-wrap">
                {selectedLogForDetails.providerResponse || selectedLogForDetails.errorDetails || 'Yanıt gövdesi yok'}
              </pre>
            </div>

            <div className="text-right">
              <button
                type="button"
                onClick={() => setSelectedLogForDetails(null)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header & Filter Controls */}
      <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>İletim Geçmişi & Teslimat Günlükleri</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {filteredLogs.length} Kayıt
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tüm harici sağlayıcılardan (WhatsApp API, Resend, NetGSM, Telegram) dönen teslimat raporları.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {logs.length > 0 && onClearHistory && (
              <button
                type="button"
                onClick={() => setShowClearAllModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-900/50 transition-colors cursor-pointer"
                title="Tüm İletim Geçmişini Temizle"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Geçmişi Temizle</span>
              </button>
            )}
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                title="Yenile"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Alıcı, başlık veya mesaj ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">Tüm Kanallar</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="telegram">Telegram Bot</option>
              <option value="email">E-posta</option>
              <option value="sms">SMS</option>
              <option value="webhook">Webhook</option>
            </select>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">Tüm Durumlar</option>
              <option value="delivered">✅ Başarılı Teslimat</option>
              <option value="failed">❌ Başarısız Teslimat</option>
            </select>
          </div>
        </div>

        {/* Bulk Actions Bar */}
        {selectedLogIds.size > 0 && (
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/60 rounded-xl flex items-center justify-between flex-wrap gap-2.5 animate-in fade-in">
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-900 dark:text-indigo-200">
              <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>
                <strong>{selectedLogIds.size}</strong> / {filteredLogs.length} iletim kaydı seçildi.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleSelectAll}
                className="px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:underline cursor-pointer"
              >
                {selectedLogIds.size === filteredLogs.length ? 'Seçimi Temizle' : 'Tümünü Seç'}
              </button>
              {effectiveBulkDelete && (
                <button
                  type="button"
                  onClick={() => setShowBulkDeleteModal(true)}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold shadow-md shadow-rose-600/20 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Seçilenleri Sil ({selectedLogIds.size})</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Table / Cards */}
      {filteredLogs.length === 0 ? (
        <div className="py-12 px-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center mb-3">
            <Clock className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">İletim Kaydı Bulunamadı</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Filtrelere uygun herhangi bir bildirim iletim geçmişi bulunmamaktadır.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={filteredLogs.length > 0 && selectedLogIds.size === filteredLogs.length}
                      onChange={handleToggleSelectAll}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 cursor-pointer"
                      title="Tümünü Seç / Kaldır"
                    />
                  </th>
                  <th className="py-3 px-4">Durum & Kanal</th>
                  <th className="py-3 px-4">Alıcı</th>
                  <th className="py-3 px-4">Bildirim Başlığı</th>
                  <th className="py-3 px-4">Gecikme (Latency)</th>
                  <th className="py-3 px-4">Zaman</th>
                  <th className="py-3 px-4 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {currentLogs.map((log, idx) => {
                  const isChecked = selectedLogIds.has(log.id);

                  return (
                    <tr
                      key={`hist_desk_${log.id}_${idx}`}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                        isChecked ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handleToggleLogSelect(log.id, e as any)}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 cursor-pointer"
                        />
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                            {getChannelIcon(log.channel)}
                          </div>
                          {log.status === 'delivered' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>İletildi</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20">
                              <XCircle className="w-3 h-3" />
                              <span>Hata</span>
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                        {log.recipient}
                      </td>

                      <td className="py-3.5 px-4 max-w-sm truncate text-slate-700 dark:text-slate-300 font-semibold">
                        {log.title}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-500 dark:text-slate-400 font-mono text-xs">
                        {log.latencyMs} ms
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-500 dark:text-slate-400 text-[11px]">
                        {formatDateTime(log.sentAt)}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => setSelectedLogForDetails(log)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-[11px] transition-colors cursor-pointer"
                          >
                            İncele
                          </button>
                          {onDelete && (
                            <button
                              onClick={() => setLogToDelete(log)}
                              className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 transition-colors cursor-pointer"
                              title="İletim Kaydını Sil"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
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

          {/* Mobile Card View */}
          <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {currentLogs.map((log, idx) => {
              const isChecked = selectedLogIds.has(log.id);

              return (
                <div
                  key={`hist_mob_${log.id}_${idx}`}
                  className={`p-4 space-y-2 ${isChecked ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => handleToggleLogSelect(log.id, e as any)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 cursor-pointer"
                      />
                      {getChannelIcon(log.channel)}
                      {log.status === 'delivered' ? (
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> İletildi
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" /> Hata
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400 font-mono">{log.latencyMs} ms</span>
                      {onDelete && (
                        <button
                          onClick={() => setLogToDelete(log)}
                          className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 cursor-pointer"
                          title="Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="font-bold text-xs text-slate-900 dark:text-white">{log.title}</div>
                  <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300">{log.recipient}</div>

                  <button
                    onClick={() => setSelectedLogForDetails(log)}
                    className="w-full py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 text-center cursor-pointer"
                  >
                    Sağlayıcı Yanıtını Gör
                  </button>
                </div>
              );
            })}
          </div>

          {/* Single Delete Log Modal */}
          {logToDelete && (
            <BulkDeleteModal
              isOpen={Boolean(logToDelete)}
              title="İletim Kaydı Silme Onayı"
              itemCount={1}
              itemLabel="iletim kaydını"
              itemsPreview={[`[${logToDelete.channel.toUpperCase()}] ${logToDelete.recipient} - ${logToDelete.title}`]}
              isDeleting={isSingleDeleting}
              onClose={() => setLogToDelete(null)}
              onConfirm={handleConfirmSingleDelete}
              description={
                <p>
                  <strong>{logToDelete.recipient}</strong> alıcısına gönderilen <strong>"{logToDelete.title}"</strong> başlıklı iletim raporu sistemden kalıcı olarak silinecektir.
                </p>
              }
            />
          )}

          {/* Clear All Logs Modal */}
          {showClearAllModal && (
            <BulkDeleteModal
              isOpen={showClearAllModal}
              title="Tüm İletim Geçmişini Temizleme Onayı"
              itemCount={logs.length}
              itemLabel="iletim kaydını"
              itemsPreview={logs.slice(0, 5).map((l) => `[${l.channel.toUpperCase()}] ${l.recipient} - ${l.title}`)}
              isDeleting={isClearingAll}
              onClose={() => setShowClearAllModal(false)}
              onConfirm={handleConfirmClearAll}
              description={
                <p>
                  Toplam <strong>{logs.length}</strong> adet iletim ve teslimat raporunun tamamı sistemden kalıcı olarak temizlenecektir. Bu işlem geri alınamaz.
                </p>
              }
            />
          )}

          {/* Bulk Delete Logs Modal */}
          <BulkDeleteModal
            isOpen={showBulkDeleteModal}
            title="Toplu İletim Kaydı Silme Onayı"
            itemCount={selectedLogIds.size}
            itemLabel="iletim kaydını"
            itemsPreview={selectedLogPreviews}
            isDeleting={isBulkDeleting}
            onClose={() => setShowBulkDeleteModal(false)}
            onConfirm={handleConfirmBulkDelete}
            description={
              <p>
                Seçilen <strong>{selectedLogIds.size}</strong> adet bildirim iletim geçmişi ve teslimat raporu sistemden kalıcı olarak silinecektir.
              </p>
            }
          />

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 sm:px-5 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Toplam <span className="font-semibold text-slate-700 dark:text-slate-300">{filteredLogs.length}</span> kayıttan{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {(currentPage - 1) * itemsPerPage + 1}-
                  {Math.min(currentPage * itemsPerPage, filteredLogs.length)}
                </span>{' '}
                arası gösteriliyor.
              </span>
              
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="text-xs font-semibold px-2 text-slate-700 dark:text-slate-300">
                  {currentPage} / {totalPages}
                </div>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

