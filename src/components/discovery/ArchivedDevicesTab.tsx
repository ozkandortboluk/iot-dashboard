import React, { useState, useEffect, useMemo } from 'react';
import {
  RotateCcw,
  Trash2,
  HardDrive,
  Search,
  RefreshCw,
  Eye,
  Cpu,
  Archive,
  Database,
  FileCheck,
  Info,
  LayoutGrid,
  List,
  CheckSquare,
  Square,
  Sparkles,
} from 'lucide-react';
import type { ArchivedDevice } from '../../types';
import { apiFetch as fetch } from '../../lib/apiFetch';
import { ArchivedDeviceDetailModal } from './ArchivedDeviceDetailModal';
import { BulkDeleteModal } from '../common/BulkDeleteModal';
import { ToastNotification } from '../common/ToastNotification';

interface ArchivedDevicesTabProps {
  onDeviceRestored?: () => void;
}

export const ArchivedDevicesTab: React.FC<ArchivedDevicesTabProps> = ({ onDeviceRestored }) => {
  const [archivedList, setArchivedList] = useState<ArchivedDevice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => (localStorage.getItem('archived_devices_view_mode') as 'grid' | 'list') || 'grid');

  useEffect(() => {
    localStorage.setItem('archived_devices_view_mode', viewMode);
  }, [viewMode]);
  const [selectedDeviceForDetail, setSelectedDeviceForDetail] = useState<ArchivedDevice | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [isBulkRestoring, setIsBulkRestoring] = useState(false);

  // Selection state for bulk operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' | 'loading' | 'pending' } | null>(null);

  // Bulk Delete Modal state
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    mode: 'single' | 'bulk' | 'clear';
    targetId?: string;
    targetName?: string;
    itemCount?: number;
    isProcessing: boolean;
  }>({
    isOpen: false,
    mode: 'bulk',
    isProcessing: false,
  });

  const fetchArchived = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/network/archived');
      if (res.ok) {
        const data = await res.json();
        setArchivedList(data || []);
      }
    } catch (err) {
      console.error('Silinen cihazlar alınamadı:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchArchived();
  }, []);

  // Filter archived devices
  const filteredArchived = useMemo(() => {
    return archivedList.filter((a) => {
      const dev = a.device || {};
      const pres = a.preservedSettings || {};
      const query = searchQuery.toLowerCase();
      return (
        (a.id && a.id.toLowerCase().includes(query)) ||
        (dev.name && dev.name.toLowerCase().includes(query)) ||
        (pres.name && pres.name.toLowerCase().includes(query)) ||
        (dev.macAddress && dev.macAddress.toLowerCase().includes(query)) ||
        (pres.macAddress && pres.macAddress.toLowerCase().includes(query)) ||
        (dev.ipAddress && dev.ipAddress.includes(query)) ||
        (pres.ipAddress && pres.ipAddress.includes(query)) ||
        (dev.hardwareModel && dev.hardwareModel.toLowerCase().includes(query)) ||
        (pres.hardwareModel && pres.hardwareModel.toLowerCase().includes(query))
      );
    });
  }, [archivedList, searchQuery]);

  // Overall Statistics Calculation
  const totalStats = useMemo(() => {
    let totalPoints = 0;
    let totalRawBytes = 0;
    let totalCompressedBytes = 0;

    archivedList.forEach((a) => {
      const s = a.telemetrySnapshot?.stats;
      if (s) {
        totalPoints += s.originalPointsCount || 0;
        totalRawBytes += s.rawSizeBytes || 0;
        totalCompressedBytes += s.compressedSizeBytes || 0;
      }
    });

    const totalSavingsPercent =
      totalRawBytes > 0
        ? Math.max(0, Math.round(((totalRawBytes - totalCompressedBytes) / totalRawBytes) * 100))
        : 0;

    return {
      totalDevices: archivedList.length,
      totalPoints,
      totalRawBytes,
      totalCompressedBytes,
      totalSavingsPercent,
    };
  }, [archivedList]);

  // Selection handlers
  const handleToggleSelect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredArchived.length && filteredArchived.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredArchived.map((a) => a.id)));
    }
  };

  // Single Restore
  const handleRestore = async (deviceId: string) => {
    setRestoringId(deviceId);
    setToast({
      message: 'Cihaz ve geçmiş telemetri verileri sisteme geri yükleniyor...',
      type: 'loading',
    });
    try {
      const res = await fetch(`/api/network/archived/${deviceId}/restore`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setToast({
          message: data.message || 'Cihaz tüm ayarları ve geçmiş telemetrisiyle başarıyla sisteme geri yüklendi!',
          type: 'success',
        });
        setSelectedDeviceForDetail(null);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(deviceId);
          return next;
        });
        await fetchArchived();
        if (onDeviceRestored) onDeviceRestored();
      } else {
        setToast({
          message: data.error || 'Cihaz geri yüklenirken bir hata oluştu.',
          type: 'error',
        });
      }
    } catch (err: any) {
      setToast({
        message: err.message || 'Cihaz geri yüklenirken ağ hatası oluştu.',
        type: 'error',
      });
    } finally {
      setRestoringId(null);
    }
  };

  // Bulk Restore
  const handleBulkRestore = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkRestoring(true);
    setToast({
      message: `Seçilen ${selectedIds.size} cihaz ve geçmiş telemetrileri geri yükleniyor...`,
      type: 'loading',
    });
    try {
      const ids = Array.from(selectedIds);
      const res = await fetch('/api/network/archived/bulk-restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (res.ok) {
        setToast({
          message: data.message || `Seçilen ${ids.length} cihaz başarıyla sisteme geri yüklendi.`,
          type: 'success',
        });
        setSelectedIds(new Set());
        await fetchArchived();
        if (onDeviceRestored) onDeviceRestored();
      } else {
        setToast({
          message: data.error || 'Toplu geri yükleme işlemi başarısız oldu.',
          type: 'error',
        });
      }
    } catch (err: any) {
      setToast({
        message: err.message || 'Toplu geri yükleme sırasında ağ hatası oluştu.',
        type: 'error',
      });
    } finally {
      setIsBulkRestoring(false);
    }
  };

  // Delete initiation triggers
  const promptSingleDelete = (device: ArchivedDevice) => {
    const name = device.device?.name || device.preservedSettings?.name || device.id;
    setDeleteModalState({
      isOpen: true,
      mode: 'single',
      targetId: device.id,
      targetName: name,
      itemCount: 1,
      isProcessing: false,
    });
  };

  const promptBulkDelete = () => {
    if (selectedIds.size === 0) return;
    setDeleteModalState({
      isOpen: true,
      mode: 'bulk',
      itemCount: selectedIds.size,
      isProcessing: false,
    });
  };

  const promptClearAll = () => {
    setDeleteModalState({
      isOpen: true,
      mode: 'clear',
      itemCount: archivedList.length,
      isProcessing: false,
    });
  };

  // Confirmed Delete execution via BulkDeleteModal
  const handleConfirmModalDelete = async () => {
    setDeleteModalState((prev) => ({ ...prev, isProcessing: true }));
    setToast({
      message: 'Kalıcı silme işlemi gerçekleştiriliyor...',
      type: 'loading',
    });
    try {
      if (deleteModalState.mode === 'single' && deleteModalState.targetId) {
        const id = deleteModalState.targetId;
        const res = await fetch(`/api/network/archived/${id}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          setToast({
            message: 'Arşivlenmiş cihaz ve sıkıştırılmış paketleri kalıcı olarak silindi.',
            type: 'success',
          });
          setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          setSelectedDeviceForDetail(null);
          await fetchArchived();
        } else {
          const data = await res.json();
          setToast({
            message: data.error || 'Silme işlemi başarısız oldu.',
            type: 'error',
          });
        }
      } else if (deleteModalState.mode === 'bulk') {
        const ids = Array.from(selectedIds);
        const res = await fetch('/api/network/archived/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        });
        if (res.ok) {
          const data = await res.json();
          setToast({
            message: data.message || `Seçilen ${ids.length} cihaz kalıcı olarak silindi.`,
            type: 'success',
          });
          setSelectedIds(new Set());
          setSelectedDeviceForDetail(null);
          await fetchArchived();
        } else {
          const data = await res.json();
          setToast({
            message: data.error || 'Toplu silme işlemi başarısız oldu.',
            type: 'error',
          });
        }
      } else if (deleteModalState.mode === 'clear') {
        const res = await fetch('/api/network/archived/clear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (res.ok) {
          setToast({
            message: 'Tüm cihaz arşivi ve sıkıştırılmış telemetri paketleri tamamen temizlendi.',
            type: 'success',
          });
          setSelectedIds(new Set());
          setSelectedDeviceForDetail(null);
          await fetchArchived();
        } else {
          const data = await res.json();
          setToast({
            message: data.error || 'Arşiv temizlenirken hata oluştu.',
            type: 'error',
          });
        }
      }
    } catch (err: any) {
      setToast({
        message: err.message || 'Silme işlemi sırasında hata oluştu.',
        type: 'error',
      });
    } finally {
      setDeleteModalState({
        isOpen: false,
        mode: 'bulk',
        isProcessing: false,
      });
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const isAllSelected = filteredArchived.length > 0 && selectedIds.size === filteredArchived.length;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <ToastNotification
          toast={toast}
          onClose={() => setToast(null)}
        />
      )}

      {/* Info Card on Compression & Restore Policy */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
            <Info className="w-4 h-4" />
          </div>
          <div className="text-xs space-y-1">
            <h4 className="font-semibold text-slate-200 flex items-center gap-2">
              Akıllı Arşivleme, Veri Sıkıştırma ve Tek Tıkla Entegrasyon
            </h4>
            <p className="text-slate-400 leading-relaxed max-w-3xl">
              Sistemden silinen her cihaz, tüm donanım kimliği, özel API anahtarı, hiyerarşik konumu ve geçmiş telemetri kayıtlarıyla birlikte otomatik olarak bu havuza aktarılır. Telemetri serisi <strong className="text-cyan-400">GZIP Level-9</strong> algoritmasıyla sıkıştırılarak %85-90 depolama tasarrufu sağlanır. İstenildiğinde tek tıkla canlı ağa entegre edilebilir.
            </p>
          </div>
        </div>

        {archivedList.length > 0 && (
          <button
            type="button"
            onClick={promptClearAll}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium text-rose-400 bg-rose-950/30 hover:bg-rose-900/40 border border-rose-800/40 transition-colors shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Tüm Arşivi Temizle</span>
          </button>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <Archive className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-100 font-mono">{totalStats.totalDevices}</div>
            <div className="text-xs text-slate-400">Arşivlenen Cihaz</div>
          </div>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-100 font-mono">{totalStats.totalPoints}</div>
            <div className="text-xs text-slate-400">Saklanan Telemetri Paketi</div>
          </div>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-purple-300 font-mono">{formatBytes(totalStats.totalCompressedBytes)}</div>
            <div className="text-xs text-slate-400">Sıkıştırılmış Boyut ({formatBytes(totalStats.totalRawBytes)} Ham)</div>
          </div>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <FileCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-emerald-400 font-mono">%{totalStats.totalSavingsPercent}</div>
            <div className="text-xs text-slate-400">Ortalama Depolama Tasarrufu</div>
          </div>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Silinen cihaz adı, ID, MAC veya model ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Select All Toggle */}
          {filteredArchived.length > 0 && (
            <button
              type="button"
              onClick={handleSelectAll}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                isAllSelected
                  ? 'bg-indigo-950/60 text-indigo-300 border-indigo-700/60'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border-slate-800'
              }`}
            >
              {isAllSelected ? <CheckSquare className="w-3.5 h-3.5 text-indigo-400" /> : <Square className="w-3.5 h-3.5" />}
              <span>{isAllSelected ? 'Tümünü Kaldır' : 'Tümünü Seç'}</span>
            </button>
          )}

          {/* View Mode Switcher: Karo vs Tek Satır */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'grid'
                  ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/80 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Karo Görünüm (Grid)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Karo</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/80 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Tek Satır / Liste Görünüm"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tek Satır</span>
            </button>
          </div>

          <button
            type="button"
            onClick={fetchArchived}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Yenile</span>
          </button>
        </div>
      </div>

      {/* Floating / Sticky Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-indigo-950/70 border border-indigo-500/30 rounded-xl px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 text-xs text-indigo-200 font-medium">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            <span>
              Toplam <strong className="text-white font-bold">{selectedIds.size}</strong> arşivlenmiş cihaz seçildi.
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors"
            >
              Seçimi Temizle
            </button>

            <button
              type="button"
              disabled={isBulkRestoring}
              onClick={handleBulkRestore}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-md transition-all disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isBulkRestoring ? 'animate-spin' : ''}`} />
              <span>{isBulkRestoring ? 'Geri Yükleniyor...' : `Seçilenleri Geri Yükle (${selectedIds.size})`}</span>
            </button>

            <button
              type="button"
              onClick={promptBulkDelete}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-rose-300 bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800/60 shadow-md transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Seçilenleri Kalıcı Sil ({selectedIds.size})</span>
            </button>
          </div>
        </div>
      )}

      {/* Archived Devices List */}
      {filteredArchived.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/30 border border-dashed border-slate-800 rounded-2xl p-6">
          <div className="w-14 h-14 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center text-slate-400 mx-auto mb-3">
            <Archive className="w-7 h-7" />
          </div>
          <h3 className="text-base font-semibold text-slate-200">Silinen / Arşivlenen Cihaz Bulunmuyor</h3>
          <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto">
            Sistemden silinen fiziksel veya mantıksal cihazlar geçmiş telemetri paketleri ve konfigürasyonlarıyla birlikte burada listelenir.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* KARO / GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredArchived.map((archived, idx) => {
            const dev = archived.device || ({} as any);
            const pres = archived.preservedSettings || ({} as any);
            const stats = archived.telemetrySnapshot?.stats;
            const isCurrentRestoring = restoringId === archived.id;
            const isChecked = selectedIds.has(archived.id);

            return (
              <div
                key={`arch_grid_${archived.id}_${idx}`}
                className={`bg-slate-900/70 border rounded-xl p-5 flex flex-col justify-between shadow-sm transition-all hover:shadow-md ${
                  isChecked
                    ? 'border-indigo-500/80 bg-slate-900/90 ring-1 ring-indigo-500/30'
                    : 'border-slate-800 hover:border-slate-700/80'
                }`}
              >
                <div className="space-y-3">
                  {/* Top Bar with Checkbox */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleSelect(archived.id)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-700 bg-slate-950 cursor-pointer shrink-0"
                      />
                      <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                        <Cpu className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-100">{dev.name || pres.name || archived.id}</h4>
                        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                          <span>{dev.hardwareModel || pres.hardwareModel || 'ESP32'}</span>
                          <span>•</span>
                          <span>{dev.type || pres.type || 'sensor'}</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      Silindi
                    </span>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950/50 p-3 rounded-lg border border-slate-800/60 font-mono">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Cihaz ID:</span>
                      <span className="text-slate-300 truncate block">{archived.id}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">MAC / IP:</span>
                      <span className="text-slate-300 truncate block">
                        {dev.macAddress || pres.macAddress || dev.ipAddress || pres.ipAddress || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Silinme Zamanı:</span>
                      <span className="text-slate-400 truncate block">
                        {new Date(archived.deletedAt).toLocaleDateString('tr-TR')} {new Date(archived.deletedAt).toLocaleTimeString('tr-TR')}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Silme İşlemini Yapan:</span>
                      <span className="text-slate-300 truncate block">{archived.deletedByName || 'Sistem'}</span>
                    </div>
                  </div>

                  {/* Telemetry Compression Capsule */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Database className="w-3.5 h-3.5 text-cyan-400" />
                      <div>
                        <span className="text-slate-300 font-medium">
                          {stats?.originalPointsCount || stats?.compressedPointsCount || archived.telemetrySnapshot?.recentReadings?.length || 0} Telemetri Paketi
                        </span>
                        <span className="text-[10px] text-slate-500 block font-mono">
                          {formatBytes(stats?.rawSizeBytes || 0)} → {formatBytes(stats?.compressedSizeBytes || 0)}
                        </span>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      %{stats?.compressionRatioPercent || 0} Tasarruf (GZIP)
                    </span>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedDeviceForDetail(archived)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
                      title="Geçmiş telemetri ve ayarları incele"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>İncele</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => promptSingleDelete(archived)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                      title="Kalıcı Olarak Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={isCurrentRestoring}
                    onClick={() => handleRestore(archived.id)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-sm transition-all disabled:opacity-50"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${isCurrentRestoring ? 'animate-spin' : ''}`} />
                    <span>Sisteme Geri Yükle</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TEK SATIR / LIST VIEW */
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-700 bg-slate-950 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4">Cihaz & ID</th>
                  <th className="py-3 px-4">Donanım & Tip</th>
                  <th className="py-3 px-4">MAC / IP</th>
                  <th className="py-3 px-4">Sıkıştırılmış Arşiv</th>
                  <th className="py-3 px-4">Silinme Zamanı</th>
                  <th className="py-3 px-4 text-right">Eylemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filteredArchived.map((archived, idx) => {
                  const dev = archived.device || ({} as any);
                  const pres = archived.preservedSettings || ({} as any);
                  const stats = archived.telemetrySnapshot?.stats;
                  const isCurrentRestoring = restoringId === archived.id;
                  const isChecked = selectedIds.has(archived.id);

                  return (
                    <tr
                      key={`arch_list_${archived.id}_${idx}`}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isChecked ? 'bg-indigo-950/20' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelect(archived.id)}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-700 bg-slate-950 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                            <Cpu className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-100 text-xs truncate max-w-[180px]">
                              {dev.name || pres.name || archived.id}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono truncate max-w-[180px]">
                              {archived.id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-xs">
                        <div className="text-slate-200">{dev.hardwareModel || pres.hardwareModel || 'ESP32'}</div>
                        <div className="text-[10px] text-slate-400">{dev.type || pres.type || 'sensor'}</div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-xs text-slate-300">
                        {dev.macAddress || pres.macAddress || dev.ipAddress || pres.ipAddress || '—'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-300">{stats?.originalPointsCount || stats?.compressedPointsCount || archived.telemetrySnapshot?.recentReadings?.length || 0} Pkt</span>
                          <span className="text-slate-400 text-[10px]">
                            {formatBytes(stats?.rawSizeBytes || 0)} → {formatBytes(stats?.compressedSizeBytes || 0)}
                          </span>
                          <span className="text-emerald-400 font-bold bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-800/40 text-[10px]">
                            -%{stats?.compressionRatioPercent || 0}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="text-slate-200 font-medium">
                          {new Date(archived.deletedAt).toLocaleDateString('tr-TR')} {new Date(archived.deletedAt).toLocaleTimeString('tr-TR')}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {archived.deletedByName || 'Sistem'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedDeviceForDetail(archived)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white transition-colors"
                            title="İncele"
                          >
                            <Eye className="w-3.5 h-3.5 inline mr-1" />
                            İncele
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestore(archived.id)}
                            disabled={isCurrentRestoring}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition-all shadow-sm disabled:opacity-50"
                            title="Sisteme Geri Yükle"
                          >
                            <RotateCcw className={`w-3.5 h-3.5 inline mr-1 ${isCurrentRestoring ? 'animate-spin' : ''}`} />
                            {isCurrentRestoring ? 'Yükleniyor...' : 'Geri Yükle'}
                          </button>
                          <button
                            type="button"
                            onClick={() => promptSingleDelete(archived)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="Kalıcı Olarak Sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail & Telemetry Inspection Modal */}
      {selectedDeviceForDetail && (
        <ArchivedDeviceDetailModal
          archivedDevice={selectedDeviceForDetail}
          onClose={() => setSelectedDeviceForDetail(null)}
          onRestore={handleRestore}
          onDelete={(id) => promptSingleDelete(selectedDeviceForDetail)}
          isRestoring={restoringId === selectedDeviceForDetail.id}
        />
      )}

      {/* Standardized Bulk Delete Modal */}
      <BulkDeleteModal
        isOpen={deleteModalState.isOpen}
        title={
          deleteModalState.mode === 'clear'
            ? 'Tüm Cihaz Arşivini Temizleme Onayı'
            : deleteModalState.mode === 'single'
            ? 'Arşivlenmiş Cihazı Kalıcı Olarak Sil'
            : 'Toplu Arşiv Silme Onayı'
        }
        description={
          deleteModalState.mode === 'clear'
            ? 'Arşivde tutulan TÜM cihazlar, sıkıştırılmış geçmiş telemetri serileri ve donanım konfigürasyonları kalıcı olarak silinecektir.'
            : deleteModalState.mode === 'single'
            ? `"${deleteModalState.targetName || deleteModalState.targetId}" cihazı ve tüm sıkıştırılmış telemetri paketleri arşivden kalıcı olarak silinecektir.`
            : `Seçilen ${deleteModalState.itemCount} adet arşivlenmiş cihaz ve tüm geçmiş paketleri kalıcı olarak silinecektir.`
        }
        count={deleteModalState.itemCount || 1}
        itemType="Cihaz Arşivi & Telemetri Paketi"
        itemNames={
          deleteModalState.mode === 'single' && deleteModalState.targetName
            ? [deleteModalState.targetName]
            : undefined
        }
        onConfirm={handleConfirmModalDelete}
        onClose={() => setDeleteModalState((prev) => ({ ...prev, isOpen: false }))}
        isDeleting={deleteModalState.isProcessing}
      />
    </div>
  );
};
