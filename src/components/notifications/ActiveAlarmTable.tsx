import React, { useState, useMemo } from 'react';
import {
  Flame,
  AlertTriangle,
  Info,
  CheckCircle2,
  Clock,
  VolumeX,
  CheckCheck,
  Search,
  Filter,
  RefreshCw,
  Cpu,
  Thermometer,
  Zap,
  Activity,
  User as UserIcon,
  Shield,
  Layers,
  ArrowUpDown,
  ChevronRight,
  ChevronLeft,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import type { ActiveAlarm, Device, Customer } from '../../types';
import { formatDateTime } from '../../lib/utils';
import { METRIC_DICTIONARY } from './types';

interface ActiveAlarmTableProps {
  alarms: ActiveAlarm[];
  devices: Device[];
  customersList?: Customer[];
  currentUserRole?: string;
  loadingAction: string | null;
  onAcknowledge: (alarmId: string) => Promise<void>;
  onSilence: (alarmId: string, durationMinutes: number) => Promise<void>;
  onResolve: (alarmId: string) => Promise<void>;
  onDelete?: (alarmId: string) => Promise<void>;
  onBulkDelete?: (alarmIds: string[]) => Promise<void>;
  onBulkAcknowledge?: (alarmIds: string[]) => Promise<void>;
  onBulkResolve?: (alarmIds: string[]) => Promise<void>;
  onRefresh?: () => void;
}

export const ActiveAlarmTable: React.FC<ActiveAlarmTableProps> = ({
  alarms,
  devices,
  customersList = [],
  currentUserRole,
  loadingAction,
  onAcknowledge,
  onSilence,
  onResolve,
  onDelete,
  onBulkDelete,
  onBulkAcknowledge,
  onBulkResolve,
  onRefresh,
}) => {
  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedState, setSelectedState] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Bulk Selection States
  const [selectedAlarmIds, setSelectedAlarmIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isBulkActionLoading, setIsBulkActionLoading] = useState(false);
  const [alarmToDelete, setAlarmToDelete] = useState<ActiveAlarm | null>(null);

  // Pagination states
  const [currentPage, setCurrentPage] = React.useState(1);
  const itemsPerPage = 15;

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedDevice, selectedSeverity, selectedState, sortOrder]);

  // Filtered and Sorted Alarms
  const filteredAlarms = useMemo(() => {
    return alarms
      .filter((alarm) => {
        // Search term
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          const matchesDevice = alarm.deviceName?.toLowerCase().includes(q) || alarm.deviceId?.toLowerCase().includes(q);
          const matchesMetric = alarm.metricKey?.toLowerCase().includes(q);
          const matchesMessage = alarm.message?.toLowerCase().includes(q);
          if (!matchesDevice && !matchesMetric && !matchesMessage) return false;
        }

        // Device filter
        if (selectedDevice !== 'all' && alarm.deviceId !== selectedDevice) {
          return false;
        }

        // Severity filter
        if (selectedSeverity !== 'all' && alarm.severity !== selectedSeverity) {
          return false;
        }

        // State filter
        if (selectedState === 'active') {
          if (alarm.state !== 'ACTIVE' || alarm.acknowledged) return false;
        } else if (selectedState === 'acknowledged') {
          if (!alarm.acknowledged || alarm.state === 'RESOLVED') return false;
        } else if (selectedState === 'silenced') {
          if (alarm.state !== 'SILENCED') return false;
        } else if (selectedState === 'resolved') {
          if (alarm.state !== 'RESOLVED') return false;
        }

        return true;
      })
      .sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.triggeredAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.triggeredAt || 0).getTime();
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
      });
  }, [alarms, searchTerm, selectedDevice, selectedSeverity, selectedState, sortOrder]);

  const handleToggleAlarmSelect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedAlarmIds((prev) => {
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
    if (selectedAlarmIds.size === filteredAlarms.length && filteredAlarms.length > 0) {
      setSelectedAlarmIds(new Set());
    } else {
      setSelectedAlarmIds(new Set(filteredAlarms.map((a) => a.id)));
    }
  };

  const handleExecuteBulkDelete = async () => {
    if (!onBulkDelete || selectedAlarmIds.size === 0) return;
    setIsBulkActionLoading(true);
    try {
      await onBulkDelete(Array.from(selectedAlarmIds));
      setSelectedAlarmIds(new Set());
      setShowBulkDeleteModal(false);
    } finally {
      setIsBulkActionLoading(false);
    }
  };

  const handleExecuteBulkAcknowledge = async () => {
    if (!onBulkAcknowledge || selectedAlarmIds.size === 0) return;
    setIsBulkActionLoading(true);
    try {
      await onBulkAcknowledge(Array.from(selectedAlarmIds));
      setSelectedAlarmIds(new Set());
    } finally {
      setIsBulkActionLoading(false);
    }
  };

  const handleExecuteBulkResolve = async () => {
    if (!onBulkResolve || selectedAlarmIds.size === 0) return;
    setIsBulkActionLoading(true);
    try {
      await onBulkResolve(Array.from(selectedAlarmIds));
      setSelectedAlarmIds(new Set());
    } finally {
      setIsBulkActionLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(filteredAlarms.length / itemsPerPage));
  const currentAlarms = filteredAlarms.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getMetricIcon = (metricKey: string) => {
    const key = metricKey.toLowerCase();
    if (key.includes('temp')) return <Thermometer className="w-4 h-4 text-orange-500" />;
    if (key.includes('cpu') || key.includes('ram')) return <Cpu className="w-4 h-4 text-cyan-500" />;
    if (key.includes('power') || key.includes('volt') || key.includes('curr')) return <Zap className="w-4 h-4 text-amber-500" />;
    return <Activity className="w-4 h-4 text-indigo-500" />;
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20">
            <Flame className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>Kritik Alarm</span>
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Uyarı</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20">
            <Info className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>Bilgi</span>
          </span>
        );
    }
  };

  const getStateBadge = (alarm: ActiveAlarm) => {
    if (alarm.state === 'RESOLVED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3" />
          <span>Çözüldü</span>
        </span>
      );
    }
    if (alarm.state === 'SILENCED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
          <VolumeX className="w-3 h-3 text-slate-500" />
          <span>Susturuldu</span>
        </span>
      );
    }
    if (alarm.acknowledged) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
          <Clock className="w-3 h-3" />
          <span>Onaylandı (Gözetimde)</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-500/30 animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-600 dark:bg-rose-400" />
        <span>Aktif İhlal</span>
      </span>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      {/* Header & Filter Controls Bar */}
      <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Aktif & Geçmiş Alarmlar</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {filteredAlarms.length} Kayıt
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Saha sensörleri ve cihazlardan üretilen anlık ihlal kayıtları ve operatör müdahaleleri.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                title="Yenile"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>{sortOrder === 'desc' ? 'Yeniden Eskiye' : 'Eskiden Yeniye'}</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-2.5 pt-1">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Cihaz, metrik veya mesaj ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {/* Device Filter */}
          <div>
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              <option value="all">Tüm Cihazlar</option>
              {devices.map((dev) => (
                <option key={dev.id} value={dev.id}>
                  {dev.name}
                </option>
              ))}
            </select>
          </div>

          {/* Severity Filter */}
          <div>
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              <option value="all">Tüm Önem Seviyeleri</option>
              <option value="critical">🚨 Sadece Kritik</option>
              <option value="warning">⚠️ Sadece Uyarı</option>
              <option value="info">ℹ️ Sadece Bilgi</option>
            </select>
          </div>

          {/* State Filter */}
          <div>
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              <option value="all">Tüm Alarm Durumları</option>
              <option value="active">🔥 Aktif & Bekleyenler</option>
              <option value="acknowledged">⏳ Onaylanmış (Gözetimde)</option>
              <option value="silenced">🔇 Susturulmuş</option>
              <option value="resolved">✅ Çözülmüş Olanlar</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      {selectedAlarmIds.size > 0 && (
        <div className="bg-indigo-50/90 dark:bg-indigo-950/60 border-b border-indigo-200 dark:border-indigo-800 px-4 py-3 flex items-center justify-between flex-wrap gap-2.5 text-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="font-bold text-indigo-900 dark:text-indigo-200">
              {selectedAlarmIds.size} adet alarm seçildi
            </span>
            <button
              onClick={handleToggleSelectAll}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium cursor-pointer ml-2"
            >
              {selectedAlarmIds.size === filteredAlarms.length ? 'Seçimi Temizle' : 'Tümünü Seç'}
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {onBulkAcknowledge && (
              <button
                onClick={handleExecuteBulkAcknowledge}
                disabled={isBulkActionLoading}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Seçilenleri Onayla</span>
              </button>
            )}
            {onBulkResolve && (
              <button
                onClick={handleExecuteBulkResolve}
                disabled={isBulkActionLoading}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Seçilenleri Çöz</span>
              </button>
            )}
            {onBulkDelete && (
              <button
                onClick={() => setShowBulkDeleteModal(true)}
                disabled={isBulkActionLoading}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Seçilenleri Sil ({selectedAlarmIds.size})</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {filteredAlarms.length === 0 ? (
        <div className="py-12 px-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center mb-3">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">Filtrelere Uygun Alarm Bulunmuyor</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Seçtiğiniz kriterlerde herhangi bir aktif veya çözülmüş alarm kaydı bulunmuyor.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table View (md ve üzeri) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={filteredAlarms.length > 0 && selectedAlarmIds.size === filteredAlarms.length}
                      onChange={handleToggleSelectAll}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 cursor-pointer"
                      title="Tümünü Seç / Kaldır"
                    />
                  </th>
                  <th className="py-3 px-4">Önem & Durum</th>
                  <th className="py-3 px-4">Cihaz & Konum</th>
                  <th className="py-3 px-4">İhlal Değeri / Eşik</th>
                  <th className="py-3 px-4">Mesaj & Şablon</th>
                  <th className="py-3 px-4">Tetiklenme Zamanı</th>
                  <th className="py-3 px-4 text-right">Hızlı Müdahale & İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {currentAlarms.map((alarm, idx) => {
                  const unit = METRIC_DICTIONARY[alarm.metricKey?.toLowerCase()]?.unit || '';
                  const isActionLoading = loadingAction === alarm.id || loadingAction === `del_${alarm.id}`;
                  const isCritical = alarm.severity === 'critical';
                  const isChecked = selectedAlarmIds.has(alarm.id);

                  return (
                    <tr
                      key={`alarm_desk_${alarm.id}_${idx}`}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                        isChecked
                          ? 'bg-indigo-50/40 dark:bg-indigo-950/20'
                          : isCritical && alarm.state === 'ACTIVE' && !alarm.acknowledged
                          ? 'bg-rose-50/30 dark:bg-rose-950/10'
                          : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handleToggleAlarmSelect(alarm.id, e as any)}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 cursor-pointer"
                        />
                      </td>

                      {/* Önem & Durum */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="space-y-1">
                          {getSeverityBadge(alarm.severity)}
                          <div>{getStateBadge(alarm)}</div>
                        </div>
                      </td>

                      {/* Cihaz & Konum */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          {getMetricIcon(alarm.metricKey)}
                          <span>{alarm.deviceName || alarm.deviceId}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          ID: <span className="font-mono">{alarm.deviceId}</span>
                        </div>
                      </td>

                      {/* İhlal Değeri / Eşik */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-slate-900 dark:text-white font-bold">
                          <span className="text-rose-600 dark:text-rose-400 text-sm">
                            {alarm.currentValue}
                            {unit}
                          </span>
                          <span className="text-slate-400 font-normal">
                            {alarm.operator} {alarm.thresholdValue}
                            {unit}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Metrik: <span className="font-semibold text-slate-700 dark:text-slate-300">{alarm.metricKey}</span>
                        </div>
                      </td>

                      {/* Mesaj */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <p className="text-slate-700 dark:text-slate-300 text-xs line-clamp-2" title={alarm.message}>
                          {alarm.message}
                        </p>
                        {alarm.repeatCount > 0 && (
                          <span className="inline-block text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.2 rounded mt-1">
                            {alarm.repeatCount} kez tekrarlandı
                          </span>
                        )}
                      </td>

                      {/* Tetiklenme Zamanı */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-500 dark:text-slate-400 text-[11px]">
                        <div>{formatDateTime(alarm.triggeredAt || alarm.updatedAt)}</div>
                        {alarm.acknowledgedBy && (
                          <div className="text-emerald-600 dark:text-emerald-400 font-medium text-[10px] mt-0.5">
                            Onay: {alarm.acknowledgedBy}
                          </div>
                        )}
                      </td>

                      {/* Hızlı İşlemler */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {alarm.state !== 'RESOLVED' && (
                            <>
                              {/* Onayla Butonu */}
                              {!alarm.acknowledged && (
                                <button
                                  onClick={() => onAcknowledge(alarm.id)}
                                  disabled={isActionLoading}
                                  className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-semibold border border-amber-200 dark:border-amber-500/20 text-[11px] transition-colors cursor-pointer disabled:opacity-50"
                                  title="Alarmı Onayla (Farkındayım)"
                                >
                                  Onayla
                                </button>
                              )}

                              {/* 15 Dk Sustur */}
                              <button
                                onClick={() => onSilence(alarm.id, 15)}
                                disabled={isActionLoading}
                                className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-[11px] border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                                title="Bildirimleri 15 dakika sustur"
                              >
                                15 dk
                              </button>

                              {/* 1 Saat Sustur */}
                              <button
                                onClick={() => onSilence(alarm.id, 60)}
                                disabled={isActionLoading}
                                className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-[11px] border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                                title="Bildirimleri 1 saat sustur"
                              >
                                1 saat
                              </button>

                              {/* Çöz Butonu */}
                              <button
                                onClick={() => onResolve(alarm.id)}
                                disabled={isActionLoading}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                                title="Alarmı manuel olarak çözüldü olarak işaretle"
                              >
                                Çöz
                              </button>
                            </>
                          )}

                          {/* Sil Butonu */}
                          {onDelete && (
                            <button
                              onClick={() => setAlarmToDelete(alarm)}
                              disabled={isActionLoading}
                              className="p-1.5 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-transparent hover:border-rose-200 dark:hover:border-rose-900/50 transition-colors cursor-pointer disabled:opacity-50"
                              title="Alarmı Sil"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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

          {/* Mobile Card View (md altı ekranlar) */}
          <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {currentAlarms.map((alarm, idx) => {
              const unit = METRIC_DICTIONARY[alarm.metricKey?.toLowerCase()]?.unit || '';
              const isActionLoading = loadingAction === alarm.id || loadingAction === `del_${alarm.id}`;
              const isCritical = alarm.severity === 'critical';
              const isChecked = selectedAlarmIds.has(alarm.id);

              return (
                <div
                  key={`alarm_mob_${alarm.id}_${idx}`}
                  className={`p-4 space-y-3 ${
                    isChecked
                      ? 'bg-indigo-50/40 dark:bg-indigo-950/20'
                      : isCritical && alarm.state === 'ACTIVE' && !alarm.acknowledged
                      ? 'bg-rose-50/40 dark:bg-rose-950/20'
                      : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => handleToggleAlarmSelect(alarm.id, e as any)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 cursor-pointer"
                      />
                      {getSeverityBadge(alarm.severity)}
                      {getStateBadge(alarm)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400 font-mono">
                        {formatDateTime(alarm.triggeredAt || alarm.updatedAt)}
                      </span>
                      {onDelete && (
                        <button
                          onClick={() => setAlarmToDelete(alarm)}
                          className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg cursor-pointer"
                          title="Alarmı Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                      {getMetricIcon(alarm.metricKey)}
                      <span>{alarm.deviceName || alarm.deviceId}</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{alarm.message}</p>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-xs">
                    <div>
                      <span className="text-slate-500 text-[11px]">Metrik:</span>{' '}
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{alarm.metricKey}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-rose-600 dark:text-rose-400 font-bold">
                        {alarm.currentValue}
                        {unit}
                      </span>{' '}
                      <span className="text-slate-400">
                        ({alarm.operator} {alarm.thresholdValue}
                        {unit})
                      </span>
                    </div>
                  </div>

                  {/* Mobile Actions */}
                  {alarm.state !== 'RESOLVED' && (
                    <div className="grid grid-cols-4 gap-1.5 pt-1">
                      {!alarm.acknowledged ? (
                        <button
                          onClick={() => onAcknowledge(alarm.id)}
                          disabled={isActionLoading}
                          className="px-2 py-2 rounded-xl bg-amber-500 text-white font-semibold text-xs text-center transition-colors active:scale-95 disabled:opacity-50"
                        >
                          Onayla
                        </button>
                      ) : (
                        <div className="px-2 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-300 text-xs text-center font-medium">
                          Onaylı
                        </div>
                      )}

                      <button
                        onClick={() => onSilence(alarm.id, 15)}
                        disabled={isActionLoading}
                        className="px-2 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs text-center border border-slate-200 dark:border-slate-700 transition-colors active:scale-95 disabled:opacity-50"
                      >
                        15 dk
                      </button>

                      <button
                        onClick={() => onSilence(alarm.id, 60)}
                        disabled={isActionLoading}
                        className="px-2 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs text-center border border-slate-200 dark:border-slate-700 transition-colors active:scale-95 disabled:opacity-50"
                      >
                        1 saat
                      </button>

                      <button
                        onClick={() => onResolve(alarm.id)}
                        disabled={isActionLoading}
                        className="px-2 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-xs text-center transition-colors active:scale-95 disabled:opacity-50"
                      >
                        Çöz
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 sm:px-5 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Toplam <span className="font-semibold text-slate-700 dark:text-slate-300">{filteredAlarms.length}</span> kayıttan{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {(currentPage - 1) * itemsPerPage + 1}-
                  {Math.min(currentPage * itemsPerPage, filteredAlarms.length)}
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

      {/* Single Alarm Delete Modal */}
      {alarmToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-rose-500/30 space-y-4 animate-scaleUp">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="p-3 bg-rose-500/10 rounded-2xl">
                <Trash2 className="w-6 h-6 text-rose-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Alarm Kaydını Sil</h3>
                <p className="text-xs text-rose-400 font-semibold mt-0.5">Kalıcı Olarak Kaldırma</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong>"{alarmToDelete.deviceName || alarmToDelete.deviceId}"</strong> cihazına ait (
              <em>{alarmToDelete.metricKey}</em>) alarm kaydını sistemden silmek istediğinizden emin misiniz?
            </p>

            <div className="pt-3 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setAlarmToDelete(null)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (onDelete && alarmToDelete) {
                    await onDelete(alarmToDelete.id);
                    setAlarmToDelete(null);
                  }
                }}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-600/20 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Evet, Alarmı Sil</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Alarms Modal */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-rose-500/30 space-y-4 animate-scaleUp">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="p-3 bg-rose-500/10 rounded-2xl">
                <Trash2 className="w-6 h-6 text-rose-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Toplu Alarm Silme Onayı</h3>
                <p className="text-xs text-rose-400 font-semibold mt-0.5">Kritik İşlem</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Seçilen <strong>{selectedAlarmIds.size}</strong> adet alarm kaydını sistemden tamamen silmek istediğinizden emin misiniz?
            </p>

            <div className="pt-3 flex justify-end gap-2.5">
              <button
                type="button"
                disabled={isBulkActionLoading}
                onClick={() => setShowBulkDeleteModal(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={isBulkActionLoading}
                onClick={handleExecuteBulkDelete}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-600/20 flex items-center gap-1.5 disabled:opacity-50"
              >
                {isBulkActionLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Siliniyor...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Evet, {selectedAlarmIds.size} Alarmı Sil</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
