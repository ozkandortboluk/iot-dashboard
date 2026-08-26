import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  ThresholdRule,
  ActiveAlarm,
  NotificationChannel,
  NotificationQueueItem,
  DispatchLogItem,
  NotificationServiceConfig,
  User,
} from '../types';
import { useRealtime } from '../context/RealtimeContext';
import { useAuth } from '../context/AuthContext';
import { apiFetch as fetch, safeJson } from '../lib/apiFetch';
import {
  Bell,
  AlertTriangle,
  Sliders,
  SendHorizontal,
  Clock,
  Settings,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Building2,
  Wifi,
  WifiOff,
} from 'lucide-react';

// Sub-components
import { AlarmOverview } from './notifications/AlarmOverview';
import { ActiveAlarmTable } from './notifications/ActiveAlarmTable';
import { AlarmRuleList } from './notifications/AlarmRuleList';
import { AlarmRuleWizard } from './notifications/AlarmRuleWizard';
import { DeleteRuleConfirmModal } from './notifications/DeleteRuleConfirmModal';
import { DeliveryQueue } from './notifications/DeliveryQueue';
import { DeliveryHistory } from './notifications/DeliveryHistory';
import { ChannelConfiguration } from './notifications/ChannelConfiguration';
import { ContactPreferences } from './notifications/ContactPreferences';

export const NotificationsView: React.FC = () => {
  const { user } = useAuth();
  const { devices, customersList, isConnected, subscribeWsEvent } = useRealtime();

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState<
    'alarms' | 'rules' | 'queue' | 'history' | 'channels' | 'preferences'
  >('alarms');

  // Customer Filter (for Admin)
  const [selectedCustomerFilter, setSelectedCustomerFilter] = useState<string>('all');

  // Core Data States
  const [activeAlarms, setActiveAlarms] = useState<ActiveAlarm[]>([]);
  const [rules, setRules] = useState<ThresholdRule[]>([]);
  const [queueItems, setQueueItems] = useState<NotificationQueueItem[]>([]);
  const [dispatchLogs, setDispatchLogs] = useState<DispatchLogItem[]>([]);
  const [serviceConfig, setServiceConfig] = useState<NotificationServiceConfig | null>(null);
  const [userProfile, setUserProfile] = useState<Partial<User>>({});

  // Loading states
  const [isQueueLoading, setIsQueueLoading] = useState(false);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [isServicesLoading, setIsServicesLoading] = useState(false);

  // Wizard & Modal States
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ThresholdRule | null>(null);
  const [ruleToDelete, setRuleToDelete] = useState<ThresholdRule | null>(null);

  // Status & Feedback Messages
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = useState<string | null>(null);

  const showNotificationMsg = (msg: string, isError = false) => {
    if (isError) {
      setActionErrorMsg(msg);
      setTimeout(() => setActionErrorMsg(null), 4500);
    } else {
      setActionSuccessMsg(msg);
      setTimeout(() => setActionSuccessMsg(null), 4500);
    }
  };

  const ensureSuccess = async (res: Response) => {
    if (res.ok) return;
    const data = await safeJson<{ error?: string }>(res, {});
    throw new Error(data.error || `İşlem başarısız (${res.status})`);
  };

  // 1. Initial REST Fetch for Primary Data (Alarms, Rules, Profile)
  const fetchPrimaryData = useCallback(async () => {
    try {
      let rulesUrl = '/api/rules?limit=100';
      let alarmsUrl = '/api/alarms?limit=100';

      if (user?.role === 'admin' && selectedCustomerFilter !== 'all') {
        const param = `&targetCustomerId=${encodeURIComponent(selectedCustomerFilter)}`;
        rulesUrl += param;
        alarmsUrl += param;
      }

      const [rulesRes, alarmsRes, profileRes] = await Promise.all([
        fetch(rulesUrl),
        fetch(alarmsUrl),
        fetch('/api/profile'),
      ]);

      const [rulesData, alarmsData, profileData] = await Promise.all([
        safeJson<any>(rulesRes, []),
        safeJson<any>(alarmsRes, []),
        safeJson<User | null>(profileRes, null),
      ]);

      const rList = Array.isArray(rulesData) ? rulesData : (rulesData?.data || []);
      const aList = Array.isArray(alarmsData) ? alarmsData : (alarmsData?.data || []);

      setRules(rList);
      setActiveAlarms(aList);
      if (profileData) setUserProfile(profileData);
    } catch (e) {
      console.error('Error fetching primary notification data:', e);
    }
  }, [user, selectedCustomerFilter]);

  // 2. Lazy Fetchers for Specific Tabs
  const fetchQueueData = useCallback(async () => {
    setIsQueueLoading(true);
    try {
      let queueUrl = '/api/notification-queue?limit=100';
      if (user?.role === 'admin' && selectedCustomerFilter !== 'all') {
        queueUrl += `&targetCustomerId=${encodeURIComponent(selectedCustomerFilter)}`;
      }
      const res = await fetch(queueUrl);
      const data = await safeJson<any>(res, []);
      const list = Array.isArray(data) ? data : (data?.data || []);
      setQueueItems(list);
    } catch (e) {
      console.error('Error fetching queue:', e);
    } finally {
      setIsQueueLoading(false);
    }
  }, [user, selectedCustomerFilter]);

  const fetchLogsData = useCallback(async () => {
    setIsLogsLoading(true);
    try {
      let logsUrl = '/api/dispatch-logs?limit=100';
      if (user?.role === 'admin' && selectedCustomerFilter !== 'all') {
        logsUrl += `&targetCustomerId=${encodeURIComponent(selectedCustomerFilter)}`;
      }
      const res = await fetch(logsUrl);
      const data = await safeJson<any>(res, []);
      const list = Array.isArray(data) ? data : (data?.data || []);
      setDispatchLogs(list);
    } catch (e) {
      console.error('Error fetching logs:', e);
    } finally {
      setIsLogsLoading(false);
    }
  }, [user, selectedCustomerFilter]);

  const fetchServiceConfig = useCallback(async () => {
    if (user?.role !== 'admin') return;
    setIsServicesLoading(true);
    try {
      const res = await fetch('/api/notification-services');
      const data = await safeJson<NotificationServiceConfig | null>(res, null);
      if (data) setServiceConfig(data);
    } catch (e) {
      console.error('Error fetching service config:', e);
    } finally {
      setIsServicesLoading(false);
    }
  }, [user]);

  // Initial load
  useEffect(() => {
    fetchPrimaryData();
  }, [fetchPrimaryData]);

  // Lazy loading triggered on tab switches
  useEffect(() => {
    if (activeTab === 'queue') {
      fetchQueueData();
    } else if (activeTab === 'history') {
      fetchLogsData();
    } else if (activeTab === 'channels') {
      fetchServiceConfig();
    }
  }, [activeTab, fetchQueueData, fetchLogsData, fetchServiceConfig]);

  // 3. Realtime WebSocket Push Subscriptions
  useEffect(() => {
    const unsubAlarms = subscribeWsEvent('alarms:updated', (payload) => {
      if (Array.isArray(payload)) {
        if (user?.role === 'customer') {
          setActiveAlarms(payload.filter((a) => a.tenantId === user.id));
        } else if (selectedCustomerFilter !== 'all') {
          setActiveAlarms(payload.filter((a) => a.tenantId === selectedCustomerFilter));
        } else {
          setActiveAlarms(payload);
        }
      } else {
        fetchPrimaryData();
      }
    });

    const unsubRules = subscribeWsEvent('rules:updated', (payload) => {
      if (Array.isArray(payload)) {
        if (user?.role === 'customer') {
          setRules(payload.filter((r) => r.tenantId === user.id));
        } else if (selectedCustomerFilter !== 'all') {
          setRules(payload.filter((r) => r.tenantId === selectedCustomerFilter));
        } else {
          setRules(payload);
        }
      } else {
        fetchPrimaryData();
      }
    });

    const unsubQueue = subscribeWsEvent('notification-queue:updated', (payload) => {
      if (Array.isArray(payload)) {
        if (user?.role === 'customer') {
          setQueueItems(payload.filter((q) => q.tenantId === user.id));
        } else if (selectedCustomerFilter !== 'all') {
          setQueueItems(payload.filter((q) => q.tenantId === selectedCustomerFilter));
        } else {
          setQueueItems(payload);
        }
      }
    });

    const unsubLogs = subscribeWsEvent('dispatch-logs:updated', (payload) => {
      if (Array.isArray(payload)) {
        if (user?.role === 'customer') {
          setDispatchLogs(payload.filter((l) => l.tenantId === user.id));
        } else if (selectedCustomerFilter !== 'all') {
          setDispatchLogs(payload.filter((l) => l.tenantId === selectedCustomerFilter));
        } else {
          setDispatchLogs(payload);
        }
      }
    });

    return () => {
      unsubAlarms();
      unsubRules();
      unsubQueue();
      unsubLogs();
    };
  }, [subscribeWsEvent, user, selectedCustomerFilter, fetchPrimaryData]);

  // 4. Fallback Polling (ONLY when WebSocket is disconnected, 20s interval)
  useEffect(() => {
    if (isConnected) return; // WebSocket is healthy, no need for polling!

    const fallbackInterval = setInterval(() => {
      fetchPrimaryData();
      if (activeTab === 'queue') fetchQueueData();
      if (activeTab === 'history') fetchLogsData();
    }, 20000);

    return () => clearInterval(fallbackInterval);
  }, [isConnected, fetchPrimaryData, fetchQueueData, fetchLogsData, activeTab]);

  // ================= ALARM ACTIONS =================
  const handleAcknowledgeAlarm = async (alarmId: string) => {
    setLoadingAction(`ack_${alarmId}`);
    try {
      const res = await fetch(`/api/alarms/${alarmId}/acknowledge`, { method: 'POST' });
      await ensureSuccess(res);
      showNotificationMsg('Alarm başarıyla onaylandı (Acknowledge).');
      fetchPrimaryData();
    } catch (err: any) {
      showNotificationMsg(err.message || 'İşlem sırasında hata oluştu.', true);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSilenceAlarm = async (alarmId: string, durationMinutes: number) => {
    setLoadingAction(`silence_${alarmId}`);
    try {
      const res = await fetch(`/api/alarms/${alarmId}/silence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationMinutes }),
      });
      await ensureSuccess(res);
      showNotificationMsg(`Alarm ${durationMinutes} dakika süreyle susturuldu.`);
      fetchPrimaryData();
    } catch (err: any) {
      showNotificationMsg(err.message || 'İşlem sırasında hata oluştu.', true);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleResolveAlarm = async (alarmId: string) => {
    setLoadingAction(`resolve_${alarmId}`);
    try {
      const res = await fetch(`/api/alarms/${alarmId}/resolve`, { method: 'POST' });
      await ensureSuccess(res);
      showNotificationMsg('Alarm çözümlendi ve arşive kaldırıldı.');
      fetchPrimaryData();
    } catch (err: any) {
      showNotificationMsg(err.message || 'İşlem sırasında hata oluştu.', true);
    } finally {
      setLoadingAction(null);
    }
  };

  // ================= RULE ACTIONS (WITH OCC) =================
  const handleToggleRule = async (ruleId: string, enabled: boolean) => {
    try {
      const res = await fetch(`/api/rules/${ruleId}/toggle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      await ensureSuccess(res);
      showNotificationMsg(enabled ? 'Kural aktif edildi.' : 'Kural devre dışı bırakıldı.');
      fetchPrimaryData();
    } catch (err: any) {
      showNotificationMsg(err.message || 'İşlem sırasında hata oluştu.', true);
    }
  };

  const handleSaveRule = async (payload: Partial<ThresholdRule>) => {
    try {
      if (editingRule) {
        // Include version for optimistic concurrency control
        const rulePayload = {
          ...payload,
          version: editingRule.version,
        };
        const res = await fetch(`/api/rules/${editingRule.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rulePayload),
        });

        if (res.status === 409) {
          const confData = await res.json();
          showNotificationMsg(
            confData.error || 'Versiyon uyuşmazlığı: Bu kural başka bir kullanıcı tarafından güncellenmiş. Güncel kural yeniden yüklendi.',
            true
          );
          fetchPrimaryData();
          return;
        }

        await ensureSuccess(res);
        showNotificationMsg('Alarm kuralı başarıyla güncellendi.');
      } else {
        const res = await fetch('/api/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        await ensureSuccess(res);
        showNotificationMsg('Yeni alarm kuralı başarıyla oluşturuldu ve devreye alındı.');
      }
      setIsWizardOpen(false);
      setEditingRule(null);
      fetchPrimaryData();
    } catch (err: any) {
      showNotificationMsg(err.message || 'Kural kaydedilirken hata oluştu.', true);
    }
  };

  const handleConfirmDeleteRule = async () => {
    if (!ruleToDelete) return;
    try {
      const res = await fetch(`/api/rules/${ruleToDelete.id}`, { method: 'DELETE' });
      await ensureSuccess(res);
      showNotificationMsg(`"${ruleToDelete.metricKey}" kuralı başarıyla silindi.`);
      fetchPrimaryData();
    } catch (err: any) {
      showNotificationMsg(err.message || 'Kural silinirken hata oluştu.', true);
    } finally {
      setRuleToDelete(null);
    }
  };

  // ================= QUEUE ACTIONS =================
  const handleRetryQueueItem = async (queueId: string) => {
    setLoadingAction(queueId);
    try {
      const res = await fetch(`/api/notification-queue/${queueId}/retry`, { method: 'POST' });
      await ensureSuccess(res);
      showNotificationMsg('Mesaj gönderim kuyruğunda tekrar denemeye alındı.');
      fetchQueueData();
    } catch (err: any) {
      showNotificationMsg(err.message || 'Hata oluştu.', true);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleClearQueue = async () => {
    try {
      const res = await fetch('/api/notification-queue/clear', { method: 'POST' });
      await ensureSuccess(res);
      showNotificationMsg('Gönderim kuyruğu başarıyla temizlendi.');
      fetchQueueData();
    } catch (err: any) {
      showNotificationMsg(err.message || 'Kuyruk temizlenemedi.', true);
    }
  };

  // ================= SERVICE CONFIG & TEST =================
  const handleSaveServiceConfig = async (configPayload: any) => {
    setLoadingAction('serviceConfig');
    try {
      const res = await fetch('/api/notification-services', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configPayload),
      });
      await ensureSuccess(res);
      showNotificationMsg('Bildirim servis ayarları ve API anahtarları kaydedildi.');
      fetchServiceConfig();
    } catch (err: any) {
      showNotificationMsg(err.message || 'Ayarlar kaydedilirken hata oluştu.', true);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSendTestMessage = async (
    channel: NotificationChannel,
    recipient: string,
    title: string,
    message: string
  ) => {
    const res = await fetch('/api/notification-services/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, recipient, title, message }),
    });
    const data = await res.json();
    if (activeTab === 'history') fetchLogsData();
    if (activeTab === 'queue') fetchQueueData();
    if (res.ok && data.result) {
      return {
        success: data.result.success,
        response: data.result.providerResponse,
        error: data.result.errorDetails,
      };
    }
    return {
      success: false,
      response: 'Sunucu Hatası',
      error: data.error || 'Test gönderimi yapılamadı',
    };
  };

  // ================= CONTACT PREFERENCES =================
  const handleSaveProfile = async (profileData: {
    phone: string;
    notificationEmail: string;
    whatsappNumber: string;
    telegramChatId: string;
  }) => {
    setLoadingAction('profile');
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData),
      });
      await ensureSuccess(res);
      showNotificationMsg('İletişim ve bildirim tercihleriniz güncellendi.');
      fetchPrimaryData();
    } catch (err: any) {
      showNotificationMsg(err.message || 'Profil güncellenirken hata oluştu.', true);
    } finally {
      setLoadingAction(null);
    }
  };

  const pendingQueueCount = queueItems.filter((q) => q.status === 'pending' || q.status === 'retrying').length;
  const criticalAlarmCount = activeAlarms.filter((a) => a.severity === 'critical' && a.status === 'active').length;

  return (
    <div className="space-y-6">
      {/* Toast Feedback Messages */}
      {actionSuccessMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 rounded-2xl flex items-center gap-3 text-xs font-semibold shadow-md animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {actionErrorMsg && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 rounded-2xl flex items-center gap-3 text-xs font-semibold shadow-md animate-in fade-in">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{actionErrorMsg}</span>
        </div>
      )}

      {/* Top Banner & Customer Scope Filter (if admin) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Bell className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <span>Alarmlar & Bildirim Merkezi</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Saha sensör eşikleri, acil durum uyarıları, WhatsApp / Telegram gönderim kuyruğu ve teslimat raporları.
          </p>
        </div>

        {user?.role === 'admin' && customersList && customersList.length > 0 && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={selectedCustomerFilter}
              onChange={(e) => setSelectedCustomerFilter(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-white shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">🏢 Tüm Müşteri Kapsamı (Global)</option>
              {customersList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName} ({c.name})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Overview Metric Cards */}
      <AlarmOverview
        activeAlarms={activeAlarms}
        rules={rules}
        queueItems={queueItems}
        dispatchLogs={dispatchLogs}
      />

      {/* Tab Navigation Pill Bar */}
      <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-900/80 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <button
          onClick={() => setActiveTab('alarms')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'alarms'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Aktif Alarmlar</span>
          {criticalAlarmCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-extrabold animate-pulse">
              {criticalAlarmCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('rules')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'rules'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Eşik ve Alarm Kuralları</span>
          <span className="px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px]">
            {rules.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('queue')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'queue'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <SendHorizontal className="w-4 h-4" />
          <span>Gönderim Kuyruğu</span>
          {pendingQueueCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-extrabold">
              {pendingQueueCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'history'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Teslimat Geçmişi</span>
        </button>

        {user?.role === 'admin' && (
          <button
            onClick={() => setActiveTab('channels')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'channels'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Kanal Yapılandırması</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('preferences')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'preferences'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>İletişim Tercihlerim</span>
        </button>
      </div>

      {/* Dynamic Tab Body */}
      {activeTab === 'alarms' && (
        <ActiveAlarmTable
          alarms={activeAlarms}
          devices={devices}
          customersList={customersList}
          currentUserRole={user?.role}
          loadingAction={loadingAction}
          onAcknowledge={handleAcknowledgeAlarm}
          onSilence={handleSilenceAlarm}
          onResolve={handleResolveAlarm}
          onRefresh={fetchPrimaryData}
        />
      )}

      {activeTab === 'rules' && (
        <AlarmRuleList
          rules={rules}
          devices={devices}
          customersList={customersList}
          currentUserRole={user?.role}
          onOpenNewRule={() => {
            setEditingRule(null);
            setIsWizardOpen(true);
          }}
          onEditRule={(rule) => {
            setEditingRule(rule);
            setIsWizardOpen(true);
          }}
          onRequestDeleteRule={(rule) => setRuleToDelete(rule)}
          onToggleRule={handleToggleRule}
        />
      )}

      {activeTab === 'queue' && (
        <DeliveryQueue
          queueItems={queueItems}
          loadingAction={loadingAction}
          onRetryItem={handleRetryQueueItem}
          onClearQueue={handleClearQueue}
          onRefresh={fetchQueueData}
        />
      )}

      {activeTab === 'history' && (
        <DeliveryHistory logs={dispatchLogs} onRefresh={fetchLogsData} />
      )}

      {activeTab === 'channels' && user?.role === 'admin' && (
        <ChannelConfiguration
          serviceConfig={serviceConfig}
          loadingAction={loadingAction}
          onSaveServiceConfig={handleSaveServiceConfig}
          onSendTestMessage={handleSendTestMessage}
        />
      )}

      {activeTab === 'preferences' && (
        <ContactPreferences
          userProfile={userProfile}
          loadingAction={loadingAction}
          onSaveProfile={handleSaveProfile}
        />
      )}

      {/* 4-Step Alarm Rule Wizard Modal */}
      <AlarmRuleWizard
        isOpen={isWizardOpen}
        editingRule={editingRule}
        devices={devices}
        customersList={customersList}
        serviceConfig={serviceConfig}
        currentUserRole={user?.role}
        currentUserId={user?.id}
        onClose={() => {
          setIsWizardOpen(false);
          setEditingRule(null);
        }}
        onSave={handleSaveRule}
      />

      {/* Delete Rule Confirmation App Modal */}
      <DeleteRuleConfirmModal
        rule={ruleToDelete}
        devices={devices}
        onClose={() => setRuleToDelete(null)}
        onConfirm={handleConfirmDeleteRule}
      />
    </div>
  );
};
