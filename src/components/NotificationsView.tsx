import React, { useState, useEffect } from 'react';
import type {
  NotificationItem,
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
import { formatDateTime } from '../lib/utils';
import { apiFetch as fetch, safeJson } from '../lib/apiFetch';
import {
  Bell,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  Sliders,
  Shield,
  Activity,
  Trash2,
  Edit3,
  Flame,
  Smartphone,
  Mail,
  MessageSquare,
  Globe,
  Clock,
  Filter,
  Check,
  Send,
  RefreshCw,
  Search,
  Settings,
  SendHorizontal,
  CheckCheck,
  Layers,
  Sparkles,
  Phone,
  UserCheck,
} from 'lucide-react';

export const NotificationsView: React.FC = () => {
  const { user } = useAuth();
  const {
    notifications,
    clearAllNotifications,
    devices,
    customersList,
  } = useRealtime();

  const [activeTab, setActiveTab] = useState<'alarms_rules' | 'dispatch_queue' | 'delivery_logs' | 'channel_settings'>('alarms_rules');

  const [activeAlarms, setActiveAlarms] = useState<ActiveAlarm[]>([]);
  const [rules, setRules] = useState<ThresholdRule[]>([]);
  const [selectedCustomerFilter, setSelectedCustomerFilter] = useState<string>('all');

  // Queue, Logs & Service Config States
  const [queueItems, setQueueItems] = useState<NotificationQueueItem[]>([]);
  const [dispatchLogs, setDispatchLogs] = useState<DispatchLogItem[]>([]);
  const [serviceConfig, setServiceConfig] = useState<NotificationServiceConfig | null>(null);
  const [userProfile, setUserProfile] = useState<Partial<User>>({});

  // UI state
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<ThresholdRule | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = useState<string | null>(null);

  // Search & Filters for Queue/Logs
  const [queueSearch, setQueueSearch] = useState('');
  const [logsChannelFilter, setLogsChannelFilter] = useState<string>('all');
  const [logsStatusFilter, setLogsStatusFilter] = useState<string>('all');

  // Profile Form State
  const [profilePhone, setProfilePhone] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileWhatsapp, setProfileWhatsapp] = useState('');
  const [profileTelegram, setProfileTelegram] = useState('');

  // Service Config Form State
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [whatsappPhoneId, setWhatsappPhoneId] = useState('');
  const [whatsappToken, setWhatsappToken] = useState('');

  const [telegramEnabled, setTelegramEnabled] = useState(true);
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramBotUser, setTelegramBotUser] = useState('');

  const [emailEnabled, setEmailEnabled] = useState(true);
  const [emailFrom, setEmailFrom] = useState('');

  const [smsEnabled, setSmsEnabled] = useState(true);
  const [smsTitle, setSmsTitle] = useState('');

  const [webhookEnabled, setWebhookEnabled] = useState(true);
  const [webhookEndpoint, setWebhookEndpoint] = useState('');

  // Test Dispatch Form State
  const [testChannel, setTestChannel] = useState<NotificationChannel>('whatsapp');
  const [testRecipient, setTestRecipient] = useState('');
  const [testTitle, setTestTitle] = useState('🚨 Kritik Sıcaklık Uyarısı (Test)');
  const [testMsg, setTestMsg] = useState('İstanbul Depo İklim Sensörü 42.5°C eşik değerini aştı.');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; response: string; error?: string } | null>(null);

  // Rule Modal Form State
  const [ruleUserId, setRuleUserId] = useState<string>('usr_admin');
  const [ruleDeviceId, setRuleDeviceId] = useState<string>('all');
  const [ruleMetric, setRuleMetric] = useState<string>('cpu');
  const [ruleOp, setRuleOp] = useState<'>' | '<' | '=='>('>');
  const [ruleVal, setRuleVal] = useState<number>(85);
  const [ruleSeverity, setRuleSeverity] = useState<'critical' | 'warning' | 'info'>('critical');
  const [ruleHysteresis, setRuleHysteresis] = useState<number>(2);
  const [ruleMinBreach, setRuleMinBreach] = useState<number>(10);
  const [ruleRepeatInterval, setRuleRepeatInterval] = useState<number>(300);
  const [ruleChannels, setRuleChannels] = useState<NotificationChannel[]>(['app', 'email', 'whatsapp', 'telegram']);
  const [ruleIs24h, setRuleIs24h] = useState<boolean>(true);
  const [ruleActiveStart, setRuleActiveStart] = useState<string>('08:00');
  const [ruleActiveEnd, setRuleActiveEnd] = useState<string>('18:00');
  const [ruleRecipientsStr, setRuleRecipientsStr] = useState<string>('');
  const [ruleMsg, setRuleMsg] = useState<string>('Cihaz {deviceName} yüksek {metric} yükünde: {value}');

  const fetchData = async () => {
    try {
      let rulesUrl = '/api/rules';
      if (user?.role === 'admin' && selectedCustomerFilter !== 'all') {
        rulesUrl += `?targetCustomerId=${selectedCustomerFilter}`;
      }

      let alarmsUrl = '/api/alarms';
      if (user?.role === 'admin' && selectedCustomerFilter !== 'all') {
        alarmsUrl += `?targetCustomerId=${selectedCustomerFilter}`;
      }

      let queueUrl = '/api/notification-queue';
      let logsUrl = '/api/dispatch-logs';
      if (user?.role === 'admin' && selectedCustomerFilter !== 'all') {
        queueUrl += `?targetCustomerId=${selectedCustomerFilter}`;
        logsUrl += `?targetCustomerId=${selectedCustomerFilter}`;
      }

      const [rulesRes, alarmsRes, queueRes, logsRes, serviceRes, profileRes] = await Promise.all([
        fetch(rulesUrl),
        fetch(alarmsUrl),
        fetch(queueUrl),
        fetch(logsUrl),
        fetch('/api/notification-services'),
        fetch('/api/profile'),
      ]);

      const [rulesData, alarmsData, queueData, logsData, serviceData, profileData] = await Promise.all([
        safeJson<ThresholdRule[]>(rulesRes, []),
        safeJson<ActiveAlarm[]>(alarmsRes, []),
        safeJson<NotificationQueueItem[]>(queueRes, []),
        safeJson<DispatchLogItem[]>(logsRes, []),
        safeJson<NotificationServiceConfig | null>(serviceRes, null),
        safeJson<User | null>(profileRes, null),
      ]);

      if (Array.isArray(rulesData)) setRules(rulesData);
      if (Array.isArray(alarmsData)) setActiveAlarms(alarmsData);
      if (Array.isArray(queueData)) setQueueItems(queueData);
      if (Array.isArray(logsData)) setDispatchLogs(logsData);

      if (serviceData && serviceData.whatsapp) {
        const cfg = serviceData;
        setServiceConfig(cfg);
        setWhatsappEnabled(cfg.whatsapp.enabled);
        setWhatsappPhoneId(cfg.whatsapp.phoneNumberId || '');
        setWhatsappToken(cfg.whatsapp.apiToken || '');

        setTelegramEnabled(cfg.telegram.enabled);
        setTelegramBotToken(cfg.telegram.botToken || '');
        setTelegramBotUser(cfg.telegram.botUsername || '');

        setEmailEnabled(cfg.email.enabled);
        setEmailFrom(cfg.email.fromEmail || '');

        setSmsEnabled(cfg.sms.enabled);
        setSmsTitle(cfg.sms.senderTitle || '');

        setWebhookEnabled(cfg.webhook.enabled);
        setWebhookEndpoint(cfg.webhook.defaultEndpoint || '');
      }

      if (profileData && profileData.id) {
        const prof = profileData;
        setUserProfile(prof);
        setProfilePhone(prof.phone || '');
        setProfileEmail(prof.notificationEmail || prof.email || '');
        setProfileWhatsapp(prof.whatsappNumber || prof.phone || '');
        setProfileTelegram(prof.telegramChatId || '');

        if (!testRecipient) {
          setTestRecipient(prof.whatsappNumber || prof.phone || prof.email || '129837465');
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [selectedCustomerFilter, user]);

  const showNotificationMsg = (msg: string, isError = false) => {
    if (isError) {
      setActionErrorMsg(msg);
      setTimeout(() => setActionErrorMsg(null), 4000);
    } else {
      setActionSuccessMsg(msg);
      setTimeout(() => setActionSuccessMsg(null), 4000);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingAction('profile');
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: profilePhone,
          notificationEmail: profileEmail,
          whatsappNumber: profileWhatsapp,
          telegramChatId: profileTelegram,
        }),
      });
      if (res.ok) {
        showNotificationMsg('Profil ve iletişim bilgileriniz başarıyla güncellendi.');
        fetchData();
      } else {
        const data = await res.json();
        showNotificationMsg(data.error || 'Profil güncellenemedi.', true);
      }
    } catch (err: any) {
      showNotificationMsg('Profil güncellenirken hata oluştu.', true);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSaveServiceConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingAction('serviceConfig');
    try {
      const res = await fetch('/api/notification-services', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whatsapp: {
            enabled: whatsappEnabled,
            phoneNumberId: whatsappPhoneId,
            apiToken: whatsappToken,
            provider: whatsappToken ? 'cloud_api' : 'simulated',
          },
          telegram: {
            enabled: telegramEnabled,
            botToken: telegramBotToken,
            botUsername: telegramBotUser,
          },
          email: {
            enabled: emailEnabled,
            fromEmail: emailFrom,
            provider: 'simulated',
          },
          sms: {
            enabled: smsEnabled,
            senderTitle: smsTitle,
            provider: 'simulated',
          },
          webhook: {
            enabled: webhookEnabled,
            defaultEndpoint: webhookEndpoint,
          },
        }),
      });
      if (res.ok) {
        showNotificationMsg('Bildirim servis ayarları ve API anahtarları kaydedildi.');
        fetchData();
      } else {
        const data = await res.json();
        showNotificationMsg(data.error || 'Ayarlar kaydedilemedi.', true);
      }
    } catch (err: any) {
      showNotificationMsg('Ayarlar kaydedilirken hata oluştu.', true);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRetryQueueItem = async (queueId: string) => {
    setLoadingAction(queueId);
    try {
      const res = await fetch(`/api/notification-queue/${queueId}/retry`, { method: 'POST' });
      if (res.ok) {
        showNotificationMsg('Mesaj gönderim kuyruğunda tekrar denemeye alındı.');
        fetchData();
      } else {
        const data = await res.json();
        showNotificationMsg(data.error || 'Yeniden deneme başlatılamadı.', true);
      }
    } catch (err) {
      showNotificationMsg('Hata oluştu.', true);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleClearQueue = async () => {
    if (!window.confirm('Gönderim kuyruğunu temizlemek istediğinize emin misiniz?')) return;
    try {
      await fetch('/api/notification-queue/clear', { method: 'POST' });
      showNotificationMsg('Gönderim kuyruğu temizlendi.');
      fetchData();
    } catch (err) {
      showNotificationMsg('Kuyruk temizlenemedi.', true);
    }
  };

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testRecipient) {
      showNotificationMsg('Lütfen test bildirimi için alıcı adresi/numarası girin.', true);
      return;
    }
    setTestSending(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/notification-services/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: testChannel,
          recipient: testRecipient,
          title: testTitle,
          message: testMsg,
        }),
      });
      const data = await res.json();
      if (res.ok && data.result) {
        setTestResult({
          success: data.result.success,
          response: data.result.providerResponse,
          error: data.result.errorDetails,
        });
        if (data.result.success) {
          showNotificationMsg(`Test bildirimi [${testChannel.toUpperCase()}] kanalına başarıyla iletildi.`);
        } else {
          showNotificationMsg(`Test gönderimi başarısız: ${data.result.errorDetails}`, true);
        }
        fetchData();
      } else {
        setTestResult({
          success: false,
          response: 'Sunucu Hatası',
          error: data.error || 'Gönderim testi başarısız.',
        });
        showNotificationMsg(data.error || 'Test gönderimi yapılamadı.', true);
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        response: 'Bağlantı Hatası',
        error: err.message || 'Ağ hatası oluştu',
      });
      showNotificationMsg('Test gönderimi sırasında ağ hatası oluştu.', true);
    } finally {
      setTestSending(false);
    }
  };

  const openNewRuleModal = () => {
    setEditingRule(null);
    setRuleUserId(user?.role === 'admin' ? 'usr_admin' : (user?.id || 'usr_customer1'));
    setRuleDeviceId('all');
    setRuleMetric('cpu');
    setRuleOp('>');
    setRuleVal(85);
    setRuleSeverity('critical');
    setRuleHysteresis(2);
    setRuleMinBreach(10);
    setRuleRepeatInterval(300);
    setRuleChannels(['app', 'email', 'whatsapp', 'telegram']);
    setRuleIs24h(true);
    setRuleActiveStart('08:00');
    setRuleActiveEnd('18:00');
    setRuleRecipientsStr('');
    setRuleMsg('Cihaz {deviceName} yüksek {metric} yükünde: {value}');
    setShowRuleModal(true);
  };

  const openEditRuleModal = (rule: ThresholdRule) => {
    setEditingRule(rule);
    setRuleUserId(rule.tenantId || 'usr_admin');
    setRuleDeviceId(rule.deviceId);
    setRuleMetric(rule.metricKey);
    setRuleOp(rule.operator);
    setRuleVal(rule.thresholdValue);
    setRuleSeverity(rule.severity);
    setRuleHysteresis(rule.hysteresis || 2);
    setRuleMinBreach(rule.minBreachDurationSeconds || 0);
    setRuleRepeatInterval(rule.repeatIntervalSeconds || 300);
    setRuleChannels(rule.notificationChannels || ['app', 'email']);

    if (!rule.activeHours || rule.activeHours === '00:00-23:59' || rule.activeHours === '24s') {
      setRuleIs24h(true);
      setRuleActiveStart('08:00');
      setRuleActiveEnd('18:00');
    } else {
      setRuleIs24h(false);
      let parts: string[] = [];
      if (typeof rule.activeHours === 'string') parts = rule.activeHours.split('-');
      else parts = [rule.activeHours.start, rule.activeHours.end];
      setRuleActiveStart(parts[0] || '08:00');
      setRuleActiveEnd(parts[1] || '18:00');
    }

    setRuleRecipientsStr((rule.recipients || []).join(', '));
    setRuleMsg(rule.messageTemplate);
    setShowRuleModal(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const recipients = ruleRecipientsStr
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const activeHoursPayload = ruleIs24h ? '00:00-23:59' : `${ruleActiveStart}-${ruleActiveEnd}`;

    const payload: Partial<ThresholdRule> = {
      tenantId: ruleUserId,
      deviceId: ruleDeviceId,
      metricKey: ruleMetric,
      operator: ruleOp,
      thresholdValue: Number(ruleVal),
      severity: ruleSeverity,
      enabled: true,
      messageTemplate: ruleMsg,
      hysteresis: Number(ruleHysteresis),
      minBreachDurationSeconds: Number(ruleMinBreach),
      repeatIntervalSeconds: Number(ruleRepeatInterval),
      notificationChannels: ruleChannels,
      activeHours: activeHoursPayload,
      recipients,
    };

    try {
      if (editingRule) {
        await fetch(`/api/rules/${editingRule.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        showNotificationMsg('Kural başarıyla güncellendi.');
      } else {
        await fetch('/api/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        showNotificationMsg('Yeni kural başarıyla oluşturuldu.');
      }
      setShowRuleModal(false);
      fetchData();
    } catch (e) {
      showNotificationMsg('Kural kaydedilemedi.', true);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!window.confirm('Bu kuralı silmek istediğinize emin misiniz?')) return;
    try {
      await fetch(`/api/rules/${id}`, { method: 'DELETE' });
      showNotificationMsg('Kural silindi.');
      fetchData();
    } catch (e) {
      showNotificationMsg('Kural silinemedi.', true);
    }
  };

  const toggleChannel = (channel: NotificationChannel) => {
    if (ruleChannels.includes(channel)) {
      if (ruleChannels.length === 1) return;
      setRuleChannels(ruleChannels.filter((c) => c !== channel));
    } else {
      setRuleChannels([...ruleChannels, channel]);
    }
  };

  const renderChannelBadges = (channels?: NotificationChannel[]) => {
    const list = channels || ['app'];
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {list.includes('app') && (
          <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-[10px] font-semibold flex items-center gap-1">
            <Smartphone className="w-3 h-3" /> Panel
          </span>
        )}
        {list.includes('whatsapp') && (
          <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold flex items-center gap-1">
            <Send className="w-3 h-3 text-emerald-400" /> WhatsApp
          </span>
        )}
        {list.includes('telegram') && (
          <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-400 border border-sky-500/30 text-[10px] font-semibold flex items-center gap-1">
            <Send className="w-3 h-3 text-sky-400" /> Telegram
          </span>
        )}
        {list.includes('email') && (
          <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-semibold flex items-center gap-1">
            <Mail className="w-3 h-3" /> E-Posta
          </span>
        )}
        {list.includes('sms') && (
          <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-semibold flex items-center gap-1">
            <MessageSquare className="w-3 h-3" /> SMS
          </span>
        )}
        {list.includes('webhook') && (
          <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-400 border border-purple-500/30 text-[10px] font-semibold flex items-center gap-1">
            <Globe className="w-3 h-3" /> Webhook
          </span>
        )}
      </div>
    );
  };

  const pendingQueueCount = queueItems.filter((q) => q.status === 'pending' || q.status === 'retrying').length;
  const failedQueueCount = queueItems.filter((q) => q.status === 'failed').length;

  return (
    <div className="space-y-6">
      {/* Toast Alert Banners */}
      {actionSuccessMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl flex items-center gap-3 text-xs font-semibold animate-fade-in shadow-lg">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {actionErrorMsg && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-2xl flex items-center gap-3 text-xs font-semibold animate-fade-in shadow-lg">
          <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />
          <span>{actionErrorMsg}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-[#0f172a] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Flame className="w-5 h-5 text-rose-500 animate-pulse" />
            <span>Bildirim Merkezi, WhatsApp & Telegram Servis Katmanı</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Müşteri özel alarm kuralları, WhatsApp, Telegram, E-posta gönderim kuyruğu, başarısız iletileri otomatik yeniden deneme ve teslimat geçmişi.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {user?.role === 'admin' && (
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-2xl border border-slate-200 dark:border-slate-700">
              <Filter className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-[11px] font-semibold text-slate-400">Müşteri Filtresi:</span>
              <select
                value={selectedCustomerFilter}
                onChange={(e) => setSelectedCustomerFilter(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="all">Tüm Müşteri Kuralları</option>
                <option value="usr_admin">Sistem Genel (Admin)</option>
                {customersList.map((cust) => (
                  <option key={cust.id} value={cust.id}>
                    {cust.name} ({cust.companyName || 'Müşteri'})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={openNewRuleModal}
            className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-2xl text-xs font-bold shadow-lg shadow-pink-600/20 flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Eşik Kuralı</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('alarms_rules')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
            activeTab === 'alarms_rules'
              ? 'bg-pink-600 text-white shadow-lg shadow-pink-600/20'
              : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Canlı Alarmlar & Eşik Kuralları</span>
          <span className="ml-1 px-2 py-0.5 bg-white/20 rounded-full text-[10px]">{rules.length}</span>
        </button>

        <button
          onClick={() => setActiveTab('dispatch_queue')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
            activeTab === 'dispatch_queue'
              ? 'bg-pink-600 text-white shadow-lg shadow-pink-600/20'
              : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          <RefreshCw className="w-4 h-4" />
          <span>Gönderim Kuyruğu & Yeniden Deneme</span>
          {pendingQueueCount > 0 && (
            <span className="px-2 py-0.5 bg-amber-500 text-slate-950 font-extrabold rounded-full text-[10px] animate-pulse">
              {pendingQueueCount} Bekliyor
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('delivery_logs')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
            activeTab === 'delivery_logs'
              ? 'bg-pink-600 text-white shadow-lg shadow-pink-600/20'
              : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Gönderim Geçmişi (Logs)</span>
          <span className="ml-1 px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-full text-[10px]">
            {dispatchLogs.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('channel_settings')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
            activeTab === 'channel_settings'
              ? 'bg-pink-600 text-white shadow-lg shadow-pink-600/20'
              : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Profil İletişim & Servis Ayarları</span>
        </button>
      </div>

      {/* TAB 1: ALARMS & RULES */}
      {activeTab === 'alarms_rules' && (
        <div className="space-y-6">
          {/* Active Alarms Section */}
          {activeAlarms.length > 0 && (
            <div className="bg-rose-500/5 dark:bg-rose-950/20 p-5 rounded-3xl border border-rose-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-rose-500 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Aktif & Bekleyen Saha Alarmları ({activeAlarms.length})</span>
                </h3>
                <span className="text-[11px] text-rose-400">Canlı Değerlendirme Aktif</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeAlarms.map((alarm) => (
                  <div
                    key={alarm.id}
                    className="p-4 rounded-2xl bg-white dark:bg-[#0f172a] border border-rose-500/30 dark:border-rose-500/40 shadow-lg space-y-2 relative overflow-hidden"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-md">
                            {alarm.state}
                          </span>
                          {(alarm.isSimulation || alarm.source === 'simulator') && (
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                              🧪 TEST ALARMI
                            </span>
                          )}
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white mt-1">
                          {alarm.deviceName} ({alarm.metricKey.toUpperCase()})
                        </h4>
                      </div>
                      <span className="text-[11px] font-extrabold text-rose-500 bg-rose-500/10 px-2.5 py-1 rounded-xl">
                        {alarm.currentValue} (Eşik: {alarm.thresholdValue})
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                      {alarm.message}
                    </p>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400">
                      <span>Tekrar Sayısı: #{alarm.repeatCount}</span>
                      <span>Tarih: {formatDateTime(alarm.updatedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rules List Grid */}
          <div className="bg-white dark:bg-[#0f172a] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-pink-500" />
                  <span>Tanımlı Eşik Kuralları ({rules.length})</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Her kural seçilen WhatsApp, Telegram, E-posta ve SMS kanalları üzerinden otomatik bildirim üretir.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rules.map((rule) => {
                const targetDevice = devices.find((d) => d.id === rule.deviceId);
                return (
                  <div
                    key={rule.id}
                    className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-pink-500/40 transition-all space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
                            {rule.userName || 'Müşteri'}
                          </span>
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white mt-1">
                            {rule.metricKey.toUpperCase()} {rule.operator} {rule.thresholdValue}
                          </h4>
                        </div>

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            rule.severity === 'critical'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {rule.severity.toUpperCase()}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Cihaz: <strong className="text-slate-700 dark:text-slate-300">{rule.deviceId === 'all' ? 'Tüm Cihazlar' : targetDevice?.name || rule.deviceId}</strong>
                      </p>

                      <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 font-mono">
                        "{rule.messageTemplate}"
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] font-semibold text-slate-400">Aktif Kanallar:</span>
                        {renderChannelBadges(rule.notificationChannels)}
                      </div>

                      {rule.recipients && rule.recipients.length > 0 && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          <strong>Alıcılar:</strong> {rule.recipients.join(', ')}
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">
                        Saatler: {typeof rule.activeHours === 'string' ? rule.activeHours : `${rule.activeHours?.start}-${rule.activeHours?.end}`}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditRuleModal(rule)}
                          className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all"
                          title="Kuralı Düzenle"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="p-1.5 hover:bg-rose-500/20 text-rose-400 rounded-lg transition-all"
                          title="Kuralı Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DISPATCH QUEUE */}
      {activeTab === 'dispatch_queue' && (
        <div className="bg-white dark:bg-[#0f172a] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-amber-500" />
                <span>Gönderim Kuyruğu & Yeniden Deneme Motoru ({queueItems.length})</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Başarısız WhatsApp, Telegram veya E-posta bildirimleri üstel geri çekilme (exponential backoff) ile otomatik veya manüel olarak tekrar denenir.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchData}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Yenile</span>
              </button>
              <button
                onClick={handleClearQueue}
                className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Kuyruğu Temizle</span>
              </button>
            </div>
          </div>

          {/* Queue Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-3">Kanal & Alıcı</th>
                  <th className="py-3 px-3">Başlık & Mesaj</th>
                  <th className="py-3 px-3">Durum</th>
                  <th className="py-3 px-3">Deneme</th>
                  <th className="py-3 px-3">Son / Sonraki Deneme</th>
                  <th className="py-3 px-3">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {queueItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                      Şu anda beklemede veya başarısız kuyruk öğesi bulunmuyor. Sistemdeki tüm bildirimler başarıyla iletildi.
                    </td>
                  </tr>
                ) : (
                  queueItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-all">
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          {renderChannelBadges([item.channel])}
                          <div className="font-mono font-bold text-slate-800 dark:text-slate-200">
                            {item.recipient}
                          </div>
                          <span className="text-[10px] text-slate-400">{item.userName || 'Kullanıcı'}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3 max-w-xs">
                        <div className="space-y-1">
                          <span className="font-bold text-slate-900 dark:text-white block truncate">{item.title}</span>
                          <span className="text-slate-500 dark:text-slate-400 line-clamp-2">{item.message}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        {item.status === 'delivered' && (
                          <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full font-extrabold text-[10px]">
                            İLETİLDİ
                          </span>
                        )}
                        {item.status === 'pending' && (
                          <span className="px-2.5 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full font-extrabold text-[10px] animate-pulse">
                            BEKLİYOR
                          </span>
                        )}
                        {item.status === 'retrying' && (
                          <span className="px-2.5 py-1 bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-full font-extrabold text-[10px] animate-pulse">
                            YENİDEN DENENİYOR
                          </span>
                        )}
                        {item.status === 'failed' && (
                          <span className="px-2.5 py-1 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-full font-extrabold text-[10px]">
                            BAŞARISIZ
                          </span>
                        )}

                        {item.errorDetails && (
                          <p className="text-[10px] text-rose-400 mt-1 font-mono">{item.errorDetails}</p>
                        )}
                      </td>

                      <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">
                        {item.attempts} / {item.maxAttempts}
                      </td>

                      <td className="py-3 px-3 text-[11px] text-slate-400">
                        <div>Oluşturulma: {formatDateTime(item.createdAt)}</div>
                        {item.nextRetryAt && (
                          <div className="text-amber-400 font-medium">Sonraki: {formatDateTime(item.nextRetryAt)}</div>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <button
                          onClick={() => handleRetryQueueItem(item.id)}
                          disabled={loadingAction === item.id}
                          className="px-3 py-1.5 bg-pink-600 hover:bg-pink-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1 disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${loadingAction === item.id ? 'animate-spin' : ''}`} />
                          <span>Yeniden Denet</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: DELIVERY LOGS */}
      {activeTab === 'delivery_logs' && (
        <div className="bg-white dark:bg-[#0f172a] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-sky-500" />
                <span>Gönderim Geçmişi & Raporlar ({dispatchLogs.length})</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Tüm kanallara (WhatsApp, Telegram, E-posta, SMS) yapılan dış gönderimlerin canlı servis durum yanıtları ve gecikme (latency) süreleri.
              </p>
            </div>
          </div>

          {/* Logs Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-3">Zaman</th>
                  <th className="py-3 px-3">Kanal</th>
                  <th className="py-3 px-3">Alıcı</th>
                  <th className="py-3 px-3">Mesaj & Başlık</th>
                  <th className="py-3 px-3">Durum</th>
                  <th className="py-3 px-3">Servis Yanıtı / Hata Detayı</th>
                  <th className="py-3 px-3">Gecikme</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {dispatchLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                      Henüz dış bildirim logu kaydı bulunmuyor.
                    </td>
                  </tr>
                ) : (
                  dispatchLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-all">
                      <td className="py-3 px-3 whitespace-nowrap text-slate-400 text-[11px]">
                        {formatDateTime(log.sentAt)}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {renderChannelBadges([log.channel])}
                      </td>

                      <td className="py-3 px-3 font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {log.recipient}
                      </td>

                      <td className="py-3 px-3 max-w-xs">
                        <div className="font-bold text-slate-900 dark:text-white truncate">{log.title}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{log.message}</div>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {log.status === 'delivered' ? (
                          <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full font-extrabold text-[10px]">
                            BAŞARILI
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-full font-extrabold text-[10px]">
                            BAŞARISIZ
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-[11px] font-mono text-slate-600 dark:text-slate-300 max-w-xs">
                        <div>{log.providerResponse}</div>
                        {log.errorDetails && <div className="text-rose-400 mt-0.5">{log.errorDetails}</div>}
                      </td>

                      <td className="py-3 px-3 font-mono text-slate-400 text-[11px]">
                        {log.latencyMs}ms
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: PROFILE CONTACTS & CHANNEL CREDENTIALS */}
      {activeTab === 'channel_settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* User Contact Info Form */}
          <div className="bg-white dark:bg-[#0f172a] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <UserCheck className="w-4 h-4 text-emerald-500" />
              <span>Kullanıcı İletişim & Bildirim Bilgilerim</span>
            </h3>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Alarm kurallarınız doğrudan profilinizdeki bu numaralara ve e-posta adresine otomatik WhatsApp, Telegram ve SMS bildirimi gönderir.
            </p>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Telefon Numarası (SMS & WhatsApp):
                </label>
                <input
                  type="text"
                  value={profilePhone}
                  onChange={(e) => setProfilePhone(e.target.value)}
                  placeholder="+90 555 123 45 67"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Bildirim E-Posta Adresi:
                </label>
                <input
                  type="email"
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                  placeholder="bildirim@musteri.com"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                  <span>WhatsApp Numarası:</span>
                  <span className="text-[10px] text-emerald-400 font-semibold">Uluslararası Format (+90...)</span>
                </label>
                <input
                  type="text"
                  value={profileWhatsapp}
                  onChange={(e) => setProfileWhatsapp(e.target.value)}
                  placeholder="+905551234567"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                  <span>Telegram Chat ID:</span>
                  <span className="text-[10px] text-sky-400 font-semibold">Örn: 129837465</span>
                </label>
                <input
                  type="text"
                  value={profileTelegram}
                  onChange={(e) => setProfileTelegram(e.target.value)}
                  placeholder="129837465"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Telegram botunuza (ör: @IoTAlarmBot) mesaj atarak Chat ID'nizi öğrenebilirsiniz.
                </span>
              </div>

              <button
                type="submit"
                disabled={loadingAction === 'profile'}
                className="w-full py-2.5 bg-pink-600 hover:bg-pink-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-pink-600/20 transition-all flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>İletişim Bilgilerini Kaydet</span>
              </button>
            </form>
          </div>

          {/* Service Configuration & API Credentials (Admin View) */}
          <div className="bg-white dark:bg-[#0f172a] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Settings className="w-4 h-4 text-pink-500" />
              <span>Servis Ayarları & API Anahtarları</span>
            </h3>

            <form onSubmit={handleSaveServiceConfig} className="space-y-4 text-xs">
              {/* WhatsApp Config */}
              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5" /> Meta WhatsApp Business API
                  </span>
                  <label className="flex items-center gap-1 text-[11px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={whatsappEnabled}
                      onChange={(e) => setWhatsappEnabled(e.target.checked)}
                      className="rounded accent-emerald-500"
                    />
                    <span>Aktif</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={whatsappPhoneId}
                    onChange={(e) => setWhatsappPhoneId(e.target.value)}
                    placeholder="Phone Number ID"
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-[11px]"
                  />
                  <input
                    type="password"
                    value={whatsappToken}
                    onChange={(e) => setWhatsappToken(e.target.value)}
                    placeholder="API Bearer Token"
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-[11px]"
                  />
                </div>
              </div>

              {/* Telegram Config */}
              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sky-400 flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5" /> Telegram Bot Servisi
                  </span>
                  <label className="flex items-center gap-1 text-[11px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={telegramEnabled}
                      onChange={(e) => setTelegramEnabled(e.target.checked)}
                      className="rounded accent-sky-500"
                    />
                    <span>Aktif</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={telegramBotToken}
                    onChange={(e) => setTelegramBotToken(e.target.value)}
                    placeholder="Bot API Token (7123...)"
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-[11px]"
                  />
                  <input
                    type="text"
                    value={telegramBotUser}
                    onChange={(e) => setTelegramBotUser(e.target.value)}
                    placeholder="@IoTAlarmBot"
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-[11px]"
                  />
                </div>
              </div>

              {/* Email Config */}
              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-blue-400 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" /> E-Posta / SMTP Gateway
                  </span>
                  <label className="flex items-center gap-1 text-[11px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={emailEnabled}
                      onChange={(e) => setEmailEnabled(e.target.checked)}
                      className="rounded accent-blue-500"
                    />
                    <span>Aktif</span>
                  </label>
                </div>

                <input
                  type="text"
                  value={emailFrom}
                  onChange={(e) => setEmailFrom(e.target.value)}
                  placeholder="alarms@iotplatform.com"
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-[11px]"
                />
              </div>

              {user?.role === 'admin' && (
                <button
                  type="submit"
                  disabled={loadingAction === 'serviceConfig'}
                  className="w-full py-2.5 bg-pink-600 hover:bg-pink-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-pink-600/20 transition-all"
                >
                  Servis Yapılandırmasını Kaydet
                </button>
              )}
            </form>
          </div>

          {/* Test Dispatch Panel */}
          <div className="lg:col-span-2 bg-white dark:bg-[#0f172a] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <SendHorizontal className="w-4 h-4 text-pink-500" />
              <span>Canlı Anlık Bildirim Test Gönderim Paneli</span>
            </h3>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              WhatsApp, Telegram, E-posta veya SMS kanalını seçerek doğrudan telefonunuza veya Telegram hesabınıza canlı test iletisi atabilirsiniz.
            </p>

            <form onSubmit={handleSendTestMessage} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Test Kanalı:
                </label>
                <select
                  value={testChannel}
                  onChange={(e) => {
                    const ch = e.target.value as NotificationChannel;
                    setTestChannel(ch);
                    if (ch === 'whatsapp') setTestRecipient(profileWhatsapp || profilePhone);
                    else if (ch === 'telegram') setTestRecipient(profileTelegram || '129837465');
                    else if (ch === 'email') setTestRecipient(profileEmail);
                    else if (ch === 'sms') setTestRecipient(profilePhone);
                    else setTestRecipient('https://api.example.com/webhooks/iot-alerts');
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
                >
                  <option value="whatsapp">WhatsApp Servisi</option>
                  <option value="telegram">Telegram Bot Servisi</option>
                  <option value="email">E-Posta Servisi</option>
                  <option value="sms">Kısa Mesaj (SMS)</option>
                  <option value="webhook">Webhook API Endpoints</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Alıcı Adresi / Telefon / Chat ID:
                </label>
                <input
                  type="text"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  placeholder="Alıcı bilgisi..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Test İleti Başlığı:
                </label>
                <input
                  type="text"
                  value={testTitle}
                  onChange={(e) => setTestTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  İleti İçeriği:
                </label>
                <input
                  type="text"
                  value={testMsg}
                  onChange={(e) => setTestMsg(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={testSending}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
                >
                  <Send className={`w-4 h-4 ${testSending ? 'animate-bounce' : ''}`} />
                  <span>{testSending ? 'Gönderiliyor...' : 'Test Mesajı Gönder'}</span>
                </button>
              </div>
            </form>

            {testResult && (
              <div
                className={`p-4 rounded-2xl border text-xs space-y-1 font-mono ${
                  testResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                }`}
              >
                <div className="font-bold flex items-center gap-2">
                  {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  <span>{testResult.success ? 'TEST GÖNDERİMİ BAŞARILI' : 'TEST GÖNDERİMİ BAŞARISIZ'}</span>
                </div>
                <div>Yanıt: {testResult.response}</div>
                {testResult.error && <div className="text-rose-400 font-semibold">Hata: {testResult.error}</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* RULE MODAL */}
      {showRuleModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-pink-500" />
                <span>{editingRule ? 'Eşik Kuralını Düzenle' : 'Yeni Eşik Kuralı Tanımla'}</span>
              </h3>
              <button
                onClick={() => setShowRuleModal(false)}
                className="text-slate-400 hover:text-white text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRule} className="space-y-4 text-xs">
              {/* Customer Ownership selection if admin */}
              {user?.role === 'admin' && (
                <div>
                  <label className="block font-semibold mb-1 text-slate-400">Kuralın Sahibi Müşteri:</label>
                  <select
                    value={ruleUserId}
                    onChange={(e) => setRuleUserId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    <option value="usr_admin">Sistem Genel (Admin)</option>
                    {customersList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.companyName || 'Müşteri'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-400">Hedef Cihaz:</label>
                  <select
                    value={ruleDeviceId}
                    onChange={(e) => setRuleDeviceId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    {user?.role === 'admin' ? (
                      <option value="all">🌐 Tüm Cihazlar (Sistem Geneli)</option>
                    ) : (
                      devices.length > 1 && <option value="all">📱 Tüm Cihazlarım</option>
                    )}
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        📱 {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-400">İzlenen Metrik:</label>
                  <select
                    value={ruleMetric}
                    onChange={(e) => setRuleMetric(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    <option value="cpu">İşlemci Yükü (CPU %)</option>
                    <option value="temperature">Ortam Sıcaklığı (°C)</option>
                    <option value="power">Güç Tüketimi (kW)</option>
                    <option value="humidity">Nem Oranı (%)</option>
                    <option value="memory">Bellek Yükü (RAM %)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-400">Koşul:</label>
                  <select
                    value={ruleOp}
                    onChange={(e) => setRuleOp(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  >
                    <option value=">">Büyüktür (&gt;)</option>
                    <option value="<">Küçüktür (&lt;)</option>
                    <option value="==">Eşittir (==)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-400">Eşik Değeri:</label>
                  <input
                    type="number"
                    value={ruleVal}
                    onChange={(e) => setRuleVal(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-400">Alarm Şiddeti:</label>
                  <select
                    value={ruleSeverity}
                    onChange={(e) => setRuleSeverity(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                  >
                    <option value="critical">KRİTİK</option>
                    <option value="warning">UYARI</option>
                    <option value="info">BİLGİ</option>
                  </select>
                </div>
              </div>

              {/* Notification Channels Selection */}
              <div>
                <label className="block font-semibold mb-2 text-slate-400">Bildirim Kanalları:</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => toggleChannel('app')}
                    className={`p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between border transition-all ${
                      ruleChannels.includes('app')
                        ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
                    }`}
                  >
                    <span className="flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5" /> Panel</span>
                    {ruleChannels.includes('app') && <Check className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleChannel('whatsapp')}
                    className={`p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between border transition-all ${
                      ruleChannels.includes('whatsapp')
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
                    }`}
                  >
                    <span className="flex items-center gap-1.5"><Send className="w-3.5 h-3.5 text-emerald-400" /> WhatsApp</span>
                    {ruleChannels.includes('whatsapp') && <Check className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleChannel('telegram')}
                    className={`p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between border transition-all ${
                      ruleChannels.includes('telegram')
                        ? 'bg-sky-500/20 border-sky-500/40 text-sky-400'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
                    }`}
                  >
                    <span className="flex items-center gap-1.5"><Send className="w-3.5 h-3.5 text-sky-400" /> Telegram</span>
                    {ruleChannels.includes('telegram') && <Check className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleChannel('email')}
                    className={`p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between border transition-all ${
                      ruleChannels.includes('email')
                        ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
                    }`}
                  >
                    <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> E-Posta</span>
                    {ruleChannels.includes('email') && <Check className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleChannel('sms')}
                    className={`p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between border transition-all ${
                      ruleChannels.includes('sms')
                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
                    }`}
                  >
                    <span className="flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> SMS</span>
                    {ruleChannels.includes('sms') && <Check className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleChannel('webhook')}
                    className={`p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between border transition-all ${
                      ruleChannels.includes('webhook')
                        ? 'bg-purple-500/20 border-purple-500/40 text-purple-400'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
                    }`}
                  >
                    <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Webhook</span>
                    {ruleChannels.includes('webhook') && <Check className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-400">
                  Özel Alıcı Listesi (E-Posta, Telefon veya Chat ID):
                </label>
                <input
                  type="text"
                  value={ruleRecipientsStr}
                  onChange={(e) => setRuleRecipientsStr(e.target.value)}
                  placeholder="ahmet@firma.com, +905321234567, 129837465"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-[11px]"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Virgülle ayırınız. Boş bırakılırsa kullanıcının kayıtlı telefon ve e-postasına gönderilir.
                </span>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-400">Şablon Mesajı:</label>
                <input
                  type="text"
                  value={ruleMsg}
                  onChange={(e) => setRuleMsg(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-[11px]"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRuleModal(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-300 rounded-xl font-bold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-xl font-bold shadow-lg shadow-pink-600/20"
                >
                  Kuralı Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
