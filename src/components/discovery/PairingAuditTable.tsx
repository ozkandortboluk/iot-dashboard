import React, { useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  QrCode,
  Key,
  Network,
  Cpu,
  RefreshCw,
} from 'lucide-react';
import type { PairingAuditRecord } from '../../types';

interface PairingAuditTableProps {
  records: PairingAuditRecord[];
  onRefresh: () => void;
  isLoading?: boolean;
}

export const PairingAuditTable: React.FC<PairingAuditTableProps> = ({
  records,
  onRefresh,
  isLoading = false,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'SUCCESS' | 'DUPLICATE_RESOLVED' | 'REJECTED'>('all');

  const filtered = records.filter((r) => {
    const matchSearch =
      r.deviceName.toLowerCase().includes(search.toLowerCase()) ||
      (r.macAddress && r.macAddress.toLowerCase().includes(search.toLowerCase())) ||
      (r.ipAddress && r.ipAddress.includes(search)) ||
      (r.actorName && r.actorName.toLowerCase().includes(search.toLowerCase())) ||
      (r.tenantName && r.tenantName.toLowerCase().includes(search.toLowerCase()));

    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const getMethodBadge = (method: string) => {
    switch (method) {
      case 'qr_scan':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">
            <QrCode className="w-3 h-3" /> QR Tarama
          </span>
        );
      case 'pairing_code':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">
            <Key className="w-3 h-3" /> PIN Kod
          </span>
        );
      case 'network_scan':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
            <Network className="w-3 h-3" /> Ağ Keşfi
          </span>
        );
      case 'manual':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-slate-500/10 text-slate-400 border border-slate-500/20 font-medium">
            <Cpu className="w-3 h-3" /> Manuel
          </span>
        );
    }
  };

  const getStatusBadge = (status: string, resolution?: string) => {
    switch (status) {
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
            <CheckCircle2 className="w-3 h-3" /> Başarılı
          </span>
        );
      case 'DUPLICATE_RESOLVED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
            <ShieldCheck className="w-3 h-3" />
            {resolution === 'replaced_hardware' ? 'Donanım Değişimi' : 'Çakışma Çözüldü'}
          </span>
        );
      case 'REJECTED':
      case 'FAILED':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-semibold">
            <XCircle className="w-3 h-3" /> Reddedildi
          </span>
        );
    }
  };

  return (
    <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
      {/* Table Toolbar */}
      <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 rounded-xl">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">Eşleştirme ve Provizyon Denetim Günlüğü</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Tüm cihaz provizyon, QR/PIN ve donanım değişim işlem kayıtları</p>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
            {filtered.length} Kayıt
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cihaz, MAC, IP, aktör ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 rounded-xl pl-8 pr-3 py-2 focus:outline-none focus:border-cyan-500 w-48 sm:w-60 font-sans"
            />
          </div>

          <select
            aria-label="Eşleştirme Durumu Filtresi"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-cyan-500 font-sans cursor-pointer"
          >
            <option value="all">Tüm Durumlar</option>
            <option value="SUCCESS">Başarılı</option>
            <option value="DUPLICATE_RESOLVED">Çakışma Çözülen</option>
            <option value="REJECTED">Reddedilen</option>
          </select>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700/60 transition-colors disabled:opacity-50 cursor-pointer"
            title="Günlüğü Yenile"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-950/70 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="py-3 px-4">Tarih / Saat</th>
              <th className="py-3 px-4">Hedef Cihaz</th>
              <th className="py-3 px-4">Yöntem</th>
              <th className="py-3 px-4">İşlemi Yapan (Aktör)</th>
              <th className="py-3 px-4">Organizasyon / Tenant</th>
              <th className="py-3 px-4">Durum</th>
              <th className="py-3 px-4">Detay & Çözüm</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400 dark:text-slate-500">
                  Kayıtlı eşleştirme denetim verisi bulunamadı.
                </td>
              </tr>
            ) : (
              filtered.map((record) => (
                <tr key={record.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs font-mono">
                    {new Date(record.timestamp).toLocaleString('tr-TR', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900 dark:text-slate-100">{record.deviceName}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      {record.macAddress || '—'} {record.ipAddress ? `• ${record.ipAddress}` : ''}
                    </div>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    {getMethodBadge(record.method)}
                  </td>
                  <td className="py-3 px-4 text-slate-800 dark:text-slate-200">
                    <span className="font-medium">{record.actorName}</span>
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                    {record.tenantName || record.tenantId}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    {getStatusBadge(record.status, record.resolutionAction)}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate" title={record.details}>
                    {record.details}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
