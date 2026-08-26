import React, { useState } from 'react';
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
  Info,
} from 'lucide-react';
import type { DispatchLogItem, NotificationChannel } from '../../types';
import { formatDateTime } from '../../lib/utils';

interface DeliveryHistoryProps {
  logs: DispatchLogItem[];
  onRefresh?: () => void;
}

export const DeliveryHistory: React.FC<DeliveryHistoryProps> = ({ logs, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<DispatchLogItem | null>(null);

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
                className="text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
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
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold"
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

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors self-end sm:self-auto"
              title="Yenile"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
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
                  <th className="py-3 px-4">Durum & Kanal</th>
                  <th className="py-3 px-4">Alıcı</th>
                  <th className="py-3 px-4">Bildirim Başlığı</th>
                  <th className="py-3 px-4">Gecikme (Latency)</th>
                  <th className="py-3 px-4">Zaman</th>
                  <th className="py-3 px-4 text-right">Detay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
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
                      <button
                        onClick={() => setSelectedLogForDetails(log)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-[11px] transition-colors cursor-pointer"
                      >
                        İncele
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {filteredLogs.map((log) => (
              <div key={log.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
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
                  <span className="text-[11px] text-slate-400 font-mono">{log.latencyMs} ms</span>
                </div>

                <div className="font-bold text-xs text-slate-900 dark:text-white">{log.title}</div>
                <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300">{log.recipient}</div>

                <button
                  onClick={() => setSelectedLogForDetails(log)}
                  className="w-full py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 text-center"
                >
                  Sağlayıcı Yanıtını Gör
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
