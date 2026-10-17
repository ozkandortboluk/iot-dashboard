import React, { useState, useEffect, useMemo } from 'react';
import { useUserPreference } from '../hooks/useUserPreference';
import {
  Plus,
  Trash2,
  Edit2,
  Play,
  Activity,
  Power,
  Settings2,
  Save,
  X,
  Cpu,
  Search,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Sparkles,
  Zap,
  ArrowRight,
  Clock,
  Sliders,
  Filter,
} from 'lucide-react';
import type { Device, Automation } from '../types';
import { apiFetch as fetch } from '../lib/apiFetch';
import { useRealtime } from '../context/RealtimeContext';
import { ToastNotification } from './common/ToastNotification';

// In-memory module cache for 0ms instant tab switching
let inMemoryAutomationsCache: Automation[] | null = null;

export const AutomationsView: React.FC = () => {
  const { devices } = useRealtime();

  // Instant SWR state initialization from memory or sessionStorage
  const [automations, setAutomations] = useState<Automation[]>(() => {
    if (inMemoryAutomationsCache && inMemoryAutomationsCache.length > 0) {
      return inMemoryAutomationsCache;
    }
    try {
      const saved = sessionStorage.getItem('iot_automations_cache');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          inMemoryAutomationsCache = parsed;
          return parsed;
        }
      }
    } catch {
      // Ignore cache parse error
    }
    return [];
  });

  const [loading, setLoading] = useState<boolean>(() => !inMemoryAutomationsCache || inMemoryAutomationsCache.length === 0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info' | 'loading' | 'pending' } | null>(null);

  // Search and Filter state with Database & User Persistence
  const [searchQuery, setSearchQuery] = useUserPreference<string>('nexus_automations_search', '');
  const [statusFilter, setStatusFilter] = useUserPreference<'all' | 'active' | 'inactive'>(
    'nexus_automations_status',
    'all'
  );
  const [deviceFilter, setDeviceFilter] = useUserPreference<string>('nexus_automations_device', 'all');

  // Trigger testing state
  const [testingId, setTestingId] = useState<string | null>(null);

  // Modal / Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    enabled: true,
    triggerDeviceId: '',
    triggerMetric: 'temperature',
    triggerCondition: 'GREATER_THAN',
    triggerValue: '30',
    actionDeviceId: '',
    actionCommandPayload: '{\n  "relay_1": 1\n}',
  });

  // Fetch automations in background with fast SWR pattern
  const fetchAutomations = async (showRefreshSpinner = false) => {
    if (showRefreshSpinner) setIsRefreshing(true);
    try {
      const autoRes = await fetch('/api/automations');
      if (autoRes.ok) {
        const data: Automation[] = await autoRes.json();
        setAutomations(data);
        inMemoryAutomationsCache = data;
        try {
          sessionStorage.setItem('iot_automations_cache', JSON.stringify(data));
        } catch {
          // ignore
        }
      }
    } catch (e: any) {
      if (!automations.length) {
        setError(e.message || 'Senaryolar yüklenirken bir hata oluştu');
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAutomations(automations.length === 0);
  }, []);

  // Quick toggle scenario active/disabled directly with optimistic update
  const handleToggleEnabled = async (auto: Automation, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus = !auto.enabled;

    // Optimistic update
    setAutomations((prev) =>
      prev.map((item) => (item.id === auto.id ? { ...item, enabled: newStatus } : item))
    );

    try {
      const res = await fetch(`/api/automations/${auto.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newStatus }),
      });
      if (!res.ok) throw new Error('Güncelleme başarısız');
      setToast({
        message: `"${auto.name}" ${newStatus ? 'etkinleştirildi' : 'devre dışı bırakıldı'}.`,
        type: 'success',
      });
    } catch {
      // Revert on error
      setAutomations((prev) =>
        prev.map((item) => (item.id === auto.id ? { ...item, enabled: auto.enabled } : item))
      );
      setToast({
        message: 'Senaryo durumu güncellenemedi.',
        type: 'error',
      });
    }
  };

  // Test trigger scenario manually on demand
  const handleTestTrigger = async (auto: Automation, e: React.MouseEvent) => {
    e.stopPropagation();
    setTestingId(auto.id);
    setToast({
      message: `"${auto.name}" senaryosu tetikleniyor ve komut sinyali iletiliyor...`,
      type: 'loading',
    });
    try {
      const res = await fetch(`/api/automations/${auto.id}/trigger`, {
        method: 'POST',
      });
      if (res.ok) {
        setToast({
          message: `"${auto.name}" senaryosu başarıyla tetiklendi! Komut cihaza iletildi.`,
          type: 'success',
        });
        // Update lastTriggered optimistically
        setAutomations((prev) =>
          prev.map((item) =>
            item.id === auto.id ? { ...item, lastTriggered: new Date().toISOString() } : item
          )
        );
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Tetikleme başarısız oldu');
      }
    } catch (e: any) {
      setToast({
        message: e.message || 'Manuel tetikleme sırasında hata oluştu.',
        type: 'error',
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    setToast({
      message: editingId ? 'Senaryo güncelleniyor...' : 'Yeni senaryo oluşturuluyor...',
      type: 'loading',
    });
    try {
      let parsedPayload = {};
      try {
        parsedPayload = JSON.parse(formData.actionCommandPayload);
      } catch (err: any) {
        throw new Error('Gönderilecek komut geçerli bir JSON formatında olmalıdır! (Örn: {"relay_1": 1})', { cause: err });
      }

      const payload = {
        name: formData.name,
        enabled: formData.enabled,
        trigger: {
          deviceId: formData.triggerDeviceId,
          metric: formData.triggerMetric,
          condition: formData.triggerCondition,
          value: formData.triggerValue,
        },
        action: {
          deviceId: formData.actionDeviceId,
          commandPayload: parsedPayload,
        },
      };

      const url = editingId ? `/api/automations/${editingId}` : '/api/automations';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Otomasyon kaydedilemedi');
      }

      setIsFormOpen(false);
      setEditingId(null);
      setToast({
        message: editingId ? 'Senaryo başarıyla güncellendi.' : 'Yeni senaryo başarıyla oluşturuldu.',
        type: 'success',
      });
      fetchAutomations();
    } catch (e: any) {
      setToast({
        message: e.message || 'Otomasyon kaydedilemedi.',
        type: 'error',
      });
      setError(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}" adlı otomasyon senaryosunu silmek istediğinize emin misiniz?`)) return;
    setToast({
      message: `"${name}" senaryosu siliniyor...`,
      type: 'loading',
    });
    try {
      // Optimistic delete
      setAutomations((prev) => prev.filter((a) => a.id !== id));
      const res = await fetch(`/api/automations/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Silme işlemi başarısız oldu.');
      setToast({
        message: `"${name}" senaryosu başarıyla silindi.`,
        type: 'success',
      });
      fetchAutomations();
    } catch (e: any) {
      setToast({
        message: e.message || 'Silme işlemi sırasında hata oluştu.',
        type: 'error',
      });
      fetchAutomations();
    }
  };

  const openEdit = (auto: Automation) => {
    setEditingId(auto.id);
    setFormData({
      name: auto.name,
      enabled: auto.enabled,
      triggerDeviceId: auto.trigger.deviceId,
      triggerMetric: auto.trigger.metric,
      triggerCondition: auto.trigger.condition,
      triggerValue: String(auto.trigger.value),
      actionDeviceId: auto.action.deviceId,
      actionCommandPayload: JSON.stringify(auto.action.commandPayload, null, 2),
    });
    setIsFormOpen(true);
  };

  // Extract metrics list from selected trigger device for helpful autocomplete
  const selectedTriggerDevice = devices.find((d) => d.id === formData.triggerDeviceId);
  const availableTriggerMetrics = useMemo(() => {
    if (!selectedTriggerDevice) return ['temperature', 'humidity', 'voltage', 'current', 'power', 'pressure', 'co2'];
    const metricsFromDev = selectedTriggerDevice.metrics ? Object.keys(selectedTriggerDevice.metrics) : [];
    if (metricsFromDev.length > 0) return metricsFromDev;
    return ['temperature', 'humidity', 'voltage', 'current', 'power', 'pressure', 'co2'];
  }, [selectedTriggerDevice]);

  // Filtered automations
  const filteredAutomations = useMemo(() => {
    return automations.filter((auto) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = auto.name.toLowerCase().includes(q);
        const matchMetric = auto.trigger.metric.toLowerCase().includes(q);
        const triggerDev = devices.find((d) => d.id === auto.trigger.deviceId);
        const actionDev = devices.find((d) => d.id === auto.action.deviceId);
        const matchDev =
          (triggerDev?.name && triggerDev.name.toLowerCase().includes(q)) ||
          (actionDev?.name && actionDev.name.toLowerCase().includes(q));
        if (!matchName && !matchMetric && !matchDev) return false;
      }

      // Status
      if (statusFilter === 'active' && !auto.enabled) return false;
      if (statusFilter === 'inactive' && auto.enabled) return false;

      // Device
      if (deviceFilter !== 'all') {
        if (auto.trigger.deviceId !== deviceFilter && auto.action.deviceId !== deviceFilter) {
          return false;
        }
      }

      return true;
    });
  }, [automations, searchQuery, statusFilter, deviceFilter, devices]);

  // Summary Metrics
  const totalCount = automations.length;
  const activeCount = automations.filter((a) => a.enabled).length;
  const triggeredRecentCount = automations.filter(
    (a) => a.lastTriggered && Date.now() - new Date(a.lastTriggered).getTime() < 86400000
  ).length;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Toast Notification */}
      {toast && (
        <ToastNotification
          toast={toast}
          onClose={() => setToast(null)}
        />
      )}

      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900/60 backdrop-blur-md p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shadow-inner">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                Otomasyon & Senaryo Motoru
                {isRefreshing && (
                  <RotateCw className="w-4 h-4 text-indigo-500 animate-spin" />
                )}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Cihaz sensör eşiklerine göre anında kurallar belirleyin, röle ve kontrol eylemlerini otomatik tetikleyin.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button
            onClick={() => fetchAutomations(true)}
            title="Yenile"
            className="p-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition"
          >
            <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              setEditingId(null);
              setFormData({
                name: '',
                enabled: true,
                triggerDeviceId: devices[0]?.id || '',
                triggerMetric: 'temperature',
                triggerCondition: 'GREATER_THAN',
                triggerValue: '30',
                actionDeviceId: devices[0]?.id || '',
                actionCommandPayload: '{\n  "relay_1": 1\n}',
              });
              setIsFormOpen(true);
            }}
            className="flex-1 sm:flex-initial bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Senaryo</span>
          </button>
        </div>
      </div>

      {/* Quick Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-extrabold text-slate-900 dark:text-white">{totalCount}</div>
            <div className="text-xs text-slate-500 font-medium">Toplam Senaryo</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">{activeCount}</div>
            <div className="text-xs text-slate-500 font-medium">Aktif Kurallar</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-extrabold text-amber-600 dark:text-amber-400">{triggeredRecentCount}</div>
            <div className="text-xs text-slate-500 font-medium">Son 24s Tetiklenen</div>
          </div>
        </div>

        <div className="col-span-2 sm:col-span-3 lg:col-span-1 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-extrabold text-purple-600 dark:text-purple-400">{devices.length}</div>
            <div className="text-xs text-slate-500 font-medium">Saha Cihazı</div>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Senaryo adı, metrik veya cihaz ara..."
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm dark:text-white outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Tümü ({totalCount})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === 'active'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Aktif ({activeCount})
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === 'inactive'
                  ? 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Pasif ({totalCount - activeCount})
            </button>
          </div>

          {devices.length > 0 && (
            <select
              value={deviceFilter}
              onChange={(e) => setDeviceFilter(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium rounded-xl px-3 py-2 text-slate-700 dark:text-slate-200 outline-none"
            >
              <option value="all">Tüm Cihazlar</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Scenario Creation / Edit Form Modal */}
      {isFormOpen && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-fadeIn">
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Settings2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {editingId ? 'Senaryoyu Düzenle' : 'Yeni Otomasyon Senaryosu Oluştur'}
                </h3>
                <p className="text-xs text-slate-500">
                  Tetikleyici koşul sağlandığında hedef cihaza otomatik JSON komutu gönderilir.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsFormOpen(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 rounded-2xl text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Senaryo Adı
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Örn: Yüksek Sıcaklıkta Fanı Çalıştır & Alarm Rölesini Aç"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm font-medium dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Trigger Section */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-sm">
                    <Activity className="w-4 h-4 text-emerald-500" />
                    Eğer (Tetikleyici Koşul)
                  </h4>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    Sensör Girişi
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Kaynak Cihaz</label>
                  <select
                    required
                    value={formData.triggerDeviceId}
                    onChange={(e) => {
                      const devId = e.target.value;
                      const dev = devices.find((d) => d.id === devId);
                      const mList = dev?.metrics ? Object.keys(dev.metrics) : [];
                      setFormData({
                        ...formData,
                        triggerDeviceId: devId,
                        triggerMetric: mList.length > 0 ? mList[0] : formData.triggerMetric,
                      });
                    }}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm dark:text-white outline-none focus:border-indigo-500"
                  >
                    <option value="">Cihaz Seçin</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.hardwareModel || 'IoT Device'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      Ölçüm Metriği
                    </label>
                    <div className="relative">
                      <input
                        required
                        type="text"
                        value={formData.triggerMetric}
                        onChange={(e) => setFormData({ ...formData, triggerMetric: e.target.value })}
                        placeholder="temperature"
                        list="metric-suggestions"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm dark:text-white outline-none focus:border-indigo-500 font-mono"
                      />
                      <datalist id="metric-suggestions">
                        {availableTriggerMetrics.map((m) => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Eşik Değeri</label>
                    <input
                      required
                      type="text"
                      value={formData.triggerValue}
                      onChange={(e) => setFormData({ ...formData, triggerValue: e.target.value })}
                      placeholder="30"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm dark:text-white outline-none focus:border-indigo-500 font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Karşılaştırma Koşulu</label>
                  <select
                    value={formData.triggerCondition}
                    onChange={(e) => setFormData({ ...formData, triggerCondition: e.target.value as any })}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm dark:text-white outline-none focus:border-indigo-500"
                  >
                    <option value="GREATER_THAN">Büyüktür (&gt;)</option>
                    <option value="LESS_THAN">Küçüktür (&lt;)</option>
                    <option value="EQUALS">Eşittir (==)</option>
                    <option value="NOT_EQUALS">Eşit Değildir (!=)</option>
                  </select>
                </div>
              </div>

              {/* Action Section */}
              <div className="p-5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-500/20 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-2 text-sm">
                    <Play className="w-4 h-4 text-indigo-500" />
                    O Zaman (Aksiyon & Komut)
                  </h4>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                    Çıkış / Röle
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-indigo-900/70 dark:text-indigo-300/70 mb-1">
                    Hedef Cihaz
                  </label>
                  <select
                    required
                    value={formData.actionDeviceId}
                    onChange={(e) => setFormData({ ...formData, actionDeviceId: e.target.value })}
                    className="w-full bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-500/30 rounded-xl px-3.5 py-2.5 text-sm dark:text-white outline-none focus:border-indigo-500"
                  >
                    <option value="">Cihaz Seçin</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.hardwareModel || 'IoT Device'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-indigo-900/70 dark:text-indigo-300/70">
                      Gönderilecek Komut (JSON)
                    </label>
                    <div className="flex gap-1.5 text-[10.5px]">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, actionCommandPayload: '{\n  "relay_1": 1\n}' })}
                        className="text-indigo-600 dark:text-indigo-400 underline hover:opacity-80"
                      >
                        Röle 1 Aç
                      </button>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, actionCommandPayload: '{\n  "relay_1": 0\n}' })}
                        className="text-indigo-600 dark:text-indigo-400 underline hover:opacity-80"
                      >
                        Kapat
                      </button>
                    </div>
                  </div>
                  <textarea
                    required
                    value={formData.actionCommandPayload}
                    onChange={(e) => setFormData({ ...formData, actionCommandPayload: e.target.value })}
                    className="w-full h-28 font-mono text-xs bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-500/30 rounded-xl p-3 dark:text-white outline-none focus:border-indigo-500 resize-none leading-relaxed"
                    placeholder={`{\n  "relay_1": 1\n}`}
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Cihaza WebSocket veya HTTP downlink üzerinden anında gönderilecek komut.
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              <label className="flex items-center gap-2.5 text-sm font-semibold cursor-pointer text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                />
                <span>Senaryoyu hemen aktif et</span>
              </label>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-5 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-600/25 flex items-center gap-2 transition cursor-pointer"
                >
                  {isSaving ? <RotateCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>{editingId ? 'Güncellemeleri Kaydet' : 'Senaryoyu Başlat'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Scenario List / Cards */}
      {loading && automations.length === 0 ? (
        /* Instant High-Contrast Skeleton Loader */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 space-y-4 animate-pulse"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800" />
                  <div className="space-y-1.5">
                    <div className="w-32 h-4 rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="w-20 h-3 rounded bg-slate-100 dark:bg-slate-800/60" />
                  </div>
                </div>
                <div className="w-12 h-6 rounded-full bg-slate-200 dark:bg-slate-800" />
              </div>
              <div className="h-20 rounded-xl bg-slate-100 dark:bg-slate-800/40" />
              <div className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800/40" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAutomations.map((auto) => {
            const triggerDev = devices.find((d) => d.id === auto.trigger.deviceId);
            const actionDev = devices.find((d) => d.id === auto.action.deviceId);
            const isTesting = testingId === auto.id;

            return (
              <div
                key={auto.id}
                className={`group relative p-6 rounded-3xl border transition-all duration-200 flex flex-col justify-between ${
                  auto.enabled
                    ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-indigo-500/40'
                    : 'bg-slate-50/70 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800/80 opacity-75'
                }`}
              >
                <div>
                  {/* Top Row: Icon + Title + Switch + Edit/Delete */}
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`p-3 rounded-2xl shrink-0 ${
                          auto.enabled
                            ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
                            : 'bg-slate-200 text-slate-500 dark:bg-slate-800'
                        }`}
                      >
                        <Zap className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 dark:text-white text-base truncate" title={auto.name}>
                          {auto.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <button
                            onClick={(e) => handleToggleEnabled(auto, e)}
                            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full transition cursor-pointer ${
                              auto.enabled
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                                : 'bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-300'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${auto.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                            <span>{auto.enabled ? 'Aktif' : 'Devre Dışı'}</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        onClick={() => openEdit(auto)}
                        title="Düzenle"
                        className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-xl transition"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(auto.id, auto.name)}
                        title="Sil"
                        className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Trigger & Action Details */}
                  <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                    {/* Condition */}
                    <div className="bg-slate-50 dark:bg-slate-950/50 rounded-2xl p-3 border border-slate-100 dark:border-slate-800/80">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <Activity className="w-3 h-3 text-emerald-500" />
                        <span>Koşul (Eğer)</span>
                      </div>
                      <div className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 leading-snug">
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                          {triggerDev?.name || 'Cihaz Seçilmedi'}
                        </span>{' '}
                        üzerindeki{' '}
                        <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 rounded font-mono text-xs text-slate-800 dark:text-slate-200">
                          {auto.trigger.metric}
                        </span>{' '}
                        {auto.trigger.condition === 'GREATER_THAN'
                          ? '>'
                          : auto.trigger.condition === 'LESS_THAN'
                          ? '<'
                          : auto.trigger.condition === 'EQUALS'
                          ? '=='
                          : '!='}{' '}
                        <span className="font-extrabold text-slate-900 dark:text-white">{auto.trigger.value}</span>
                      </div>
                    </div>

                    {/* Action */}
                    <div className="bg-indigo-50/50 dark:bg-indigo-500/5 rounded-2xl p-3 border border-indigo-100 dark:border-indigo-500/10">
                      <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <Play className="w-3 h-3 text-indigo-500" />
                        <span>Aksiyon (O Zaman)</span>
                      </div>
                      <div className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 leading-snug">
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                          {actionDev?.name || 'Cihaz Seçilmedi'}
                        </span>{' '}
                        hedefine komut:
                        <div className="mt-1.5 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-500/20 rounded-xl font-mono text-xs overflow-x-auto text-indigo-700 dark:text-indigo-300">
                          {JSON.stringify(auto.action.commandPayload)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Footer: Last Triggered & Manual Test Button */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
                  <div>
                    {auto.lastTriggered ? (
                      <span className="flex items-center gap-1 text-[11px] text-slate-500" title={auto.lastTriggered}>
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{new Date(auto.lastTriggered).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">Henüz tetiklenmedi</span>
                    )}
                  </div>

                  <button
                    onClick={(e) => handleTestTrigger(auto, e)}
                    disabled={isTesting}
                    title="Senaryoyu manuel olarak hemen çalıştırıp cihaz komutunu test edin"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-950/40 text-slate-700 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 text-xs font-semibold transition cursor-pointer"
                  >
                    {isTesting ? (
                      <RotateCw className="w-3 h-3 animate-spin text-indigo-500" />
                    ) : (
                      <Play className="w-3 h-3 text-indigo-500" />
                    )}
                    <span>{isTesting ? 'İletiliyor...' : 'Test Et'}</span>
                  </button>
                </div>
              </div>
            );
          })}

          {/* Empty State */}
          {filteredAutomations.length === 0 && !isFormOpen && (
            <div className="col-span-full py-16 px-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-center">
              <div className="p-4 rounded-3xl bg-indigo-50 dark:bg-indigo-950/30 text-indigo-500 mb-4">
                <Sparkles className="w-10 h-10" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {searchQuery || statusFilter !== 'all' || deviceFilter !== 'all'
                  ? 'Filtreye Uygun Senaryo Bulunamadı'
                  : 'Henüz Otomasyon Senaryosu Yok'}
              </h3>
              <p className="text-sm text-slate-500 max-w-md mt-1 mb-6">
                {searchQuery || statusFilter !== 'all' || deviceFilter !== 'all'
                  ? 'Arama kriterlerinizi değiştirebilir veya filtreleri sıfırlayabilirsiniz.'
                  : 'Cihazlarınızdan gelen sensör verilerine göre otomatik röle veya eylem kontrolleri başlatmak için senaryo oluşturun.'}
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setDeviceFilter('all');
                  if (automations.length === 0) {
                    setIsFormOpen(true);
                  }
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/20 transition cursor-pointer"
              >
                {automations.length === 0 ? 'İlk Senaryoyu Oluştur' : 'Filtreleri Temizle'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
