import React, { useState } from 'react';
import {
  SendHorizontal,
  RefreshCw,
  Trash2,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Smartphone,
  Mail,
  MessageSquare,
  Globe,
  Bell,
  CheckCheck,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { NotificationQueueItem, NotificationChannel } from '../../types';
import { formatDateTime } from '../../lib/utils';
import { BulkDeleteModal } from '../common/BulkDeleteModal';

interface DeliveryQueueProps {
  queueItems: NotificationQueueItem[];
  loadingAction: string | null;
  onRetryItem: (queueId: string) => Promise<void>;
  onClearQueue: () => Promise<void>;
  onRefresh?: () => void;
}

export const DeliveryQueue: React.FC<DeliveryQueueProps> = ({
  queueItems,
  loadingAction,
  onRetryItem,
  onClearQueue,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedChannelFilter, setSelectedChannelFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = React.useState(1);
  const itemsPerPage = 15;

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedChannelFilter, selectedStatusFilter]);

  const filteredItems = queueItems.filter((item) => {
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchesTitle = item.title?.toLowerCase().includes(q);
      const matchesMsg = item.message?.toLowerCase().includes(q);
      const matchesRecipient = item.recipient?.toLowerCase().includes(q);
      if (!matchesTitle && !matchesMsg && !matchesRecipient) return false;
    }
    if (selectedChannelFilter !== 'all' && item.channel !== selectedChannelFilter) {
      return false;
    }
    if (selectedStatusFilter !== 'all' && item.status !== selectedStatusFilter) {
      return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / itemsPerPage));
  const currentItems = filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            <span>{status === 'sent' ? 'Sağlayıcıya gönderildi' : 'Eski teslimat kaydı'}</span>
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 animate-pulse">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>Gönderiliyor</span>
          </span>
        );
      case 'retrying':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
            <RotateCcw className="w-3 h-3" />
            <span>Yeniden Deneniyor</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20">
            <AlertTriangle className="w-3 h-3" />
            <span>Hata Oluştu</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            <Clock className="w-3 h-3" />
            <span>Beklemede</span>
          </span>
        );
    }
  };

  const handleConfirmClearQueue = async () => {
    setIsClearing(true);
    try {
      await onClearQueue();
      setShowClearConfirm(false);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      {/* Clear Queue Confirm Modal */}
      <BulkDeleteModal
        isOpen={showClearConfirm}
        title="Gönderim Kuyruğunu Temizle"
        itemCount={queueItems.length}
        itemLabel="kuyruk iletisini"
        isDeleting={isClearing}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleConfirmClearQueue}
        description={
          <p>
            Kuyruktaki tüm bekleyen, yeniden denenmeyi bekleyen ve başarısız <strong>{queueItems.length}</strong> adet ileti silinecektir. Devam etmek istiyor musunuz?
          </p>
        }
      />

      {/* Header Bar */}
      <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <SendHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Bildirim Gönderim Kuyruğu</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {filteredItems.length} İleti
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Saha alarmlarının WhatsApp, Telegram, E-posta ve SMS sağlayıcılarına iletim süreci.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors"
                title="Yenile"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
            {queueItems.length > 0 && (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Kuyruğu Temizle</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Başlık, alıcı veya mesaj ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          <div>
            <select
              value={selectedChannelFilter}
              onChange={(e) => setSelectedChannelFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value="all">Tüm İletim Kanalları</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="telegram">Telegram Bot</option>
              <option value="email">E-posta</option>
              <option value="sms">SMS</option>
              <option value="webhook">Webhook</option>
            </select>
          </div>

          <div>
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value="all">Tüm Gönderim Durumları</option>
              <option value="pending">Beklemede Olanlar</option>
              <option value="retrying">Yeniden Denenenler</option>
              <option value="failed">Başarısız / Hata Alanlar</option>
              <option value="sent">Sağlayıcıya gönderilenler</option>
              <option value="delivered">Eski teslimat kayıtları</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table / Card Content */}
      {filteredItems.length === 0 ? (
        <div className="py-12 px-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center mb-3">
            <SendHorizontal className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">Kuyrukta Bekleyen İleti Yok</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Sistemdeki tüm alarmlar ilgili alıcılara iletildi veya gönderim kuyruğu temizlendi.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Kanal & Durum</th>
                  <th className="py-3 px-4">Alıcı Hedef</th>
                  <th className="py-3 px-4">Mesaj Başlığı & İçerik</th>
                  <th className="py-3 px-4 text-center">Deneme</th>
                  <th className="py-3 px-4">Oluşturulma</th>
                  <th className="py-3 px-4 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {currentItems.map((item, idx) => {
                  const isActionLoading = loadingAction === item.id;
                  return (
                    <tr key={`queue_desk_${item.id}_${idx}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                            {getChannelIcon(item.channel)}
                          </div>
                          <div>{getStatusBadge(item.status)}</div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900 dark:text-white font-mono text-xs">
                          {item.recipient}
                        </div>
                        {item.userName && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">{item.userName}</div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 max-w-sm">
                        <div className="font-bold text-slate-900 dark:text-white truncate">{item.title}</div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-1 mt-0.5">
                          {item.message}
                        </p>
                        {item.errorDetails && (
                          <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-1 font-mono">
                            Hata: {item.errorDetails}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center whitespace-nowrap text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {item.attempts} / {item.maxAttempts}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-500 dark:text-slate-400 text-[11px]">
                        {formatDateTime(item.createdAt)}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {(item.status === 'failed' || item.status === 'retrying') && (
                          <button
                            onClick={() => onRetryItem(item.id)}
                            disabled={isActionLoading}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-emerald-500/20 text-[11px] transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Tekrar Dene</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {currentItems.map((item, idx) => (
              <div key={`queue_mob_${item.id}_${idx}`} className="p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getChannelIcon(item.channel)}
                    {getStatusBadge(item.status)}
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">{formatDateTime(item.createdAt)}</span>
                </div>

                <div>
                  <div className="font-bold text-xs text-slate-900 dark:text-white">{item.title}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{item.message}</div>
                  <div className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 mt-1">
                    Alıcı: {item.recipient}
                  </div>
                </div>

                {(item.status === 'failed' || item.status === 'retrying') && (
                  <button
                    onClick={() => onRetryItem(item.id)}
                    className="w-full py-2 rounded-xl bg-emerald-600 text-white font-semibold text-xs text-center flex items-center justify-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Şimdi Yeniden Gönder ({item.attempts}/{item.maxAttempts})</span>
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 sm:px-5 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Toplam <span className="font-semibold text-slate-700 dark:text-slate-300">{filteredItems.length}</span> kayıttan{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {(currentPage - 1) * itemsPerPage + 1}-
                  {Math.min(currentPage * itemsPerPage, filteredItems.length)}
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
