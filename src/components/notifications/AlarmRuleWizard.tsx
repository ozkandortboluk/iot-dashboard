import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Check,
  Building2,
  Cpu,
  Sliders,
  Bell,
  Clock,
  Flame,
  AlertTriangle,
  Info,
  Shield,
  Smartphone,
  Mail,
  MessageSquare,
  Globe,
  Sparkles,
  Layers,
  Thermometer,
  Zap,
  Activity,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import type {
  ThresholdRule,
  Device,
  Customer,
  NotificationChannel,
  NotificationServiceConfig,
  NotificationSeverity,
} from '../../types';
import { extractDeviceMetrics, getChannelStatus, METRIC_DICTIONARY, type MetricMeta } from './types';

interface AlarmRuleWizardProps {
  isOpen: boolean;
  editingRule: ThresholdRule | null;
  initialRule?: Partial<ThresholdRule> | null;
  devices: Device[];
  customersList?: Customer[];
  serviceConfig: NotificationServiceConfig | null;
  currentUserRole?: string;
  currentUserId?: string;
  onClose: () => void;
  onSave: (payload: Partial<ThresholdRule>) => Promise<void>;
}

export const AlarmRuleWizard: React.FC<AlarmRuleWizardProps> = ({
  isOpen,
  editingRule,
  initialRule,
  devices,
  customersList = [],
  serviceConfig,
  currentUserRole,
  currentUserId,
  onClose,
  onSave,
}) => {
  // Current Wizard Step: 1, 2, 3, 4
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);

  // Step 1: Customer & Device
  const [tenantId, setTenantId] = useState<string>('usr_admin');
  const [deviceId, setDeviceId] = useState<string>('all');

  // Step 2: Metric & Condition
  const [metricKey, setMetricKey] = useState<string>('cpu');
  const [operator, setOperator] = useState<ThresholdRule['operator']>('>');
  const [thresholdValue, setThresholdValue] = useState<number>(80);
  const [thresholdMax, setThresholdMax] = useState<number>(100);

  // Step 3: Wait Duration, Hysteresis, Repeat & Schedule
  const [severity, setSeverity] = useState<NotificationSeverity>('critical');
  const [minBreachDurationSeconds, setMinBreachDurationSeconds] = useState<number>(10);
  const [hysteresis, setHysteresis] = useState<number>(2);
  const [repeatIntervalSeconds, setRepeatIntervalSeconds] = useState<number>(300);
  const [is24h, setIs24h] = useState<boolean>(true);
  const [activeHoursStart, setActiveHoursStart] = useState<string>('08:00');
  const [activeHoursEnd, setActiveHoursEnd] = useState<string>('18:00');
  const [timezone, setTimezone] = useState<string>('Europe/Istanbul');

  // Step 4: Channels, Recipients & Template
  const [channels, setChannels] = useState<NotificationChannel[]>(['app', 'email', 'whatsapp', 'telegram']);
  const [recipientsStr, setRecipientsStr] = useState<string>('');
  const [messageTemplate, setMessageTemplate] = useState<string>(
    'Cihaz {deviceName} üzerinde {metric} eşik değerini aştı! Mevcut Değer: {value} {unit}'
  );

  // Track initial state for unsaved changes detection
  const [isDirty, setIsDirty] = useState(false);

  // Use refs to prevent spurious resets while the modal is open
  const prevIsOpenRef = React.useRef(false);
  const prevEditingRuleIdRef = React.useRef<string | null | undefined>(null);
  const prevInitialMetricRef = React.useRef<string | undefined>(undefined);

  // Populate form on open / edit
  useEffect(() => {
    const justOpened = isOpen && !prevIsOpenRef.current;
    const ruleChanged = isOpen && editingRule && editingRule.id !== prevEditingRuleIdRef.current;
    const initialChanged = isOpen && !editingRule && initialRule?.metricKey !== prevInitialMetricRef.current;

    prevIsOpenRef.current = isOpen;
    prevEditingRuleIdRef.current = editingRule?.id;
    prevInitialMetricRef.current = initialRule?.metricKey;

    if (justOpened || ruleChanged || initialChanged) {
      setCurrentStep(1);
      setShowUnsavedPrompt(false);
      setIsDirty(false);

      if (editingRule) {
        setTenantId(editingRule.tenantId || (currentUserRole === 'admin' ? 'usr_admin' : currentUserId || ''));
        setDeviceId(editingRule.deviceId || 'all');
        setMetricKey(editingRule.metricKey || 'cpu');
        setOperator(editingRule.operator || '>');
        setThresholdValue(editingRule.thresholdValue ?? 80);
        setThresholdMax(editingRule.thresholdMax ?? 100);
        setSeverity(editingRule.severity || 'critical');
        setMinBreachDurationSeconds(editingRule.minBreachDurationSeconds ?? 10);
        setHysteresis(editingRule.hysteresis ?? 2);
        setRepeatIntervalSeconds(editingRule.repeatIntervalSeconds ?? 300);
        setTimezone(editingRule.timezone || 'Europe/Istanbul');

        if (!editingRule.activeHours || editingRule.activeHours === '00:00-23:59' || editingRule.activeHours === '24s') {
          setIs24h(true);
          setActiveHoursStart('08:00');
          setActiveHoursEnd('18:00');
        } else {
          setIs24h(false);
          let parts: string[] = [];
          if (typeof editingRule.activeHours === 'string') parts = editingRule.activeHours.split('-');
          else parts = [editingRule.activeHours.start, editingRule.activeHours.end];
          setActiveHoursStart(parts[0] || '08:00');
          setActiveHoursEnd(parts[1] || '18:00');
        }

        setChannels(editingRule.notificationChannels || ['app', 'email']);
        setRecipientsStr((editingRule.recipients || []).join(', '));
        setMessageTemplate(
          editingRule.messageTemplate || 'Cihaz {deviceName} üzerinde {metric} eşik değerini aştı! Mevcut Değer: {value} {unit}'
        );
      } else if (initialRule) {
        setTenantId(initialRule.tenantId || (currentUserRole === 'admin' ? 'usr_admin' : currentUserId || 'usr_customer1'));
        setDeviceId(initialRule.deviceId || 'all');
        setMetricKey(initialRule.metricKey || 'cpu');
        setOperator(initialRule.operator || '>');
        setThresholdValue(initialRule.thresholdValue ?? 80);
        setThresholdMax(initialRule.thresholdMax ?? 100);
        setSeverity(initialRule.severity || 'critical');
        setMinBreachDurationSeconds(initialRule.minBreachDurationSeconds ?? 10);
        setHysteresis(initialRule.hysteresis ?? 2);
        setRepeatIntervalSeconds(initialRule.repeatIntervalSeconds ?? 300);
        setTimezone(initialRule.timezone || 'Europe/Istanbul');
        setIs24h(true);
        setActiveHoursStart('08:00');
        setActiveHoursEnd('18:00');
        setChannels(initialRule.notificationChannels || ['app', 'email', 'whatsapp', 'telegram']);
        setRecipientsStr((initialRule.recipients || []).join(', '));
        setMessageTemplate(
          initialRule.messageTemplate || 'Cihaz {deviceName} üzerinde {metric} eşik değerini aştı! Mevcut Değer: {value} {unit}'
        );
      } else {
        setTenantId(currentUserRole === 'admin' ? 'usr_admin' : currentUserId || 'usr_customer1');
        setDeviceId('all');
        setMetricKey('cpu');
        setOperator('>');
        setThresholdValue(80);
        setThresholdMax(100);
        setSeverity('critical');
        setMinBreachDurationSeconds(10);
        setHysteresis(2);
        setRepeatIntervalSeconds(300);
        setTimezone('Europe/Istanbul');
        setIs24h(true);
        setActiveHoursStart('08:00');
        setActiveHoursEnd('18:00');
        setChannels(['app', 'email', 'whatsapp', 'telegram']);
        setRecipientsStr('');
        setMessageTemplate('Cihaz {deviceName} üzerinde {metric} eşik değerini aştı! Mevcut Değer: {value} {unit}');
      }
    }
  }, [isOpen, editingRule, initialRule, currentUserRole, currentUserId]);

  const markDirty = () => {
    if (!isDirty) setIsDirty(true);
  };

  // Selected Device Object
  const selectedDeviceObj = useMemo(() => {
    if (deviceId === 'all') return undefined;
    return devices.find((d) => d.id === deviceId);
  }, [deviceId, devices]);

  // Dynamically Extracted Metrics for the selected device
  const availableMetrics = useMemo(() => {
    return extractDeviceMetrics(selectedDeviceObj, devices);
  }, [selectedDeviceObj, devices]);

  // Current Selected Metric Metadata
  const currentMetricMeta = useMemo(() => {
    return (
      availableMetrics.find((m) => m.key.toLowerCase() === metricKey.toLowerCase()) || {
        key: metricKey,
        label: METRIC_DICTIONARY[metricKey.toLowerCase()]?.label || metricKey,
        unit: METRIC_DICTIONARY[metricKey.toLowerCase()]?.unit || '',
        currentValue: 0,
        min24h: 0,
        max24h: 100,
      }
    );
  }, [availableMetrics, metricKey]);

  // Live Rule Evaluation Preview ("Bu kural şu anda alarm üretir mi?")
  const liveEvaluation = useMemo(() => {
    const curr = currentMetricMeta.currentValue ?? 0;
    const thresh = Number(thresholdValue);
    const threshMax = Number(thresholdMax);
    let willTrigger = false;

    if (operator === '>') willTrigger = curr > thresh;
    else if (operator === '>=') willTrigger = curr >= thresh;
    else if (operator === '<') willTrigger = curr < thresh;
    else if (operator === '<=') willTrigger = curr <= thresh;
    else if (operator === 'OUTSIDE_RANGE') willTrigger = curr < thresh || curr > threshMax;
    else if (operator === 'INSIDE_RANGE') willTrigger = curr >= thresh && curr <= threshMax;
    else if (operator === 'UNCHANGED') willTrigger = false; // requires history
    else if (operator === 'NO_DATA') willTrigger = false; // requires history

    return {
      willTrigger,
      currentValue: curr,
      thresholdValue: thresh,
      thresholdMax: threshMax,
      unit: currentMetricMeta.unit,
      metricLabel: currentMetricMeta.label,
    };
  }, [currentMetricMeta, operator, thresholdValue, thresholdMax]);

  // Handle Safe Close
  const handleAttemptClose = () => {
    if (isDirty) {
      setShowUnsavedPrompt(true);
    } else {
      onClose();
    }
  };

  // Handle Form Submission
  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const recipients = recipientsStr
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const activeHoursPayload = is24h ? '00:00-23:59' : `${activeHoursStart}-${activeHoursEnd}`;

      const payload: Partial<ThresholdRule> = {
        tenantId,
        deviceId,
        metricKey,
        operator,
        thresholdValue: Number(thresholdValue),
        thresholdMax: Number(thresholdMax),
        timezone,
        severity,
        enabled: true,
        messageTemplate,
        hysteresis: Number(hysteresis),
        minBreachDurationSeconds: Number(minBreachDurationSeconds),
        repeatIntervalSeconds: Number(repeatIntervalSeconds),
        notificationChannels: channels,
        activeHours: activeHoursPayload,
        recipients,
      };

      await onSave(payload);
      setIsDirty(false);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleChannel = (channel: NotificationChannel) => {
    markDirty();
    const status = getChannelStatus(channel, serviceConfig);
    if (!status.isReady && !channels.includes(channel)) {
      // Still allow admin to force check or give warning
    }

    if (channels.includes(channel)) {
      if (channels.length === 1) return; // En az 1 kanal kalmalı
      setChannels(channels.filter((c) => c !== channel));
    } else {
      setChannels([...channels, channel]);
    }
  };

  const insertVariable = (variable: string) => {
    markDirty();
    setMessageTemplate((prev) => `${prev} ${variable}`);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleAttemptClose();
        }
      }}
    >
      {/* Unsaved Changes Confirmation Dialog */}
      {showUnsavedPrompt && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/70"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 max-w-sm w-full text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-slate-900 dark:text-white">
              Kaydedilmemiş Değişiklikler Var
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Formu kapatırsanız yaptığınız tüm düzenlemeler kaybolacaktır. Çıkmak istediğinize emin misiniz?
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowUnsavedPrompt(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Düzenlemeye Devam Et
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUnsavedPrompt(false);
                  setIsDirty(false);
                  onClose();
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-xs transition-colors"
              >
                Değişiklikleri At ve Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Wizard Modal Box */}
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Wizard Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>{editingRule ? 'Alarm Kuralını Düzenle' : 'Yeni Alarm Kuralı Sihirbazı'}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  Adım {currentStep} / 4
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Saha sensörleri ve cihazlar için eşik, bekleme süresi ve çok kanallı bildirimleri yapılandırın.
              </p>
            </div>
          </div>

          <button
            onClick={handleAttemptClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Progress Indicators */}
        <div className="px-5 sm:px-6 py-3 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1 sm:gap-2 shrink-0">
          {[
            { step: 1, label: 'Müşteri & Cihaz' },
            { step: 2, label: 'Metrik & Koşul' },
            { step: 3, label: 'Histerezis & Zaman' },
            { step: 4, label: 'Kanallar & Önizleme' },
          ].map((item) => {
            const isCompleted = currentStep > item.step;
            const isCurrent = currentStep === item.step;

            return (
              <button
                key={item.step}
                type="button"
                onClick={() => {
                  if (item.step < currentStep) setCurrentStep(item.step);
                }}
                className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-xl text-xs font-semibold transition-all text-left ${
                  isCurrent
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : isCompleted
                    ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 cursor-pointer'
                    : 'text-slate-400 dark:text-slate-500 opacity-70 cursor-not-allowed'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    isCurrent
                      ? 'bg-white text-indigo-600'
                      : isCompleted
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                  }`}
                >
                  {isCompleted ? <Check className="w-3 h-3" /> : item.step}
                </div>
                <span className="hidden sm:inline truncate">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Wizard Step Body (Scrollable) */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {/* STEP 1: Müşteri ve Cihaz */}
          {currentStep === 1 && (
            <div className="space-y-4">
              {/* Tenant / Customer Selection (for Admin) */}
              {currentUserRole === 'admin' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Kural Sahibi Müşteri / Hesap
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <select
                      value={tenantId}
                      onChange={(e) => {
                        markDirty();
                        setTenantId(e.target.value);
                      }}
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    >
                      <option value="usr_admin">👑 Sistem Yöneticisi / Merkez Yönetim (Tüm Cihazlar & Ortak Kural)</option>
                      {customersList
                        .filter((cust) => cust.role !== 'admin' && cust.id !== 'usr_admin')
                        .map((cust) => {
                          const hasCompany = cust.companyName && cust.companyName.trim().length > 0;
                          const hasName = cust.name && cust.name.trim().length > 0;
                          let displayName = '';
                          if (hasCompany && hasName && cust.companyName !== cust.name) {
                            displayName = `${cust.companyName} (${cust.name})`;
                          } else if (hasCompany) {
                            displayName = cust.companyName;
                          } else if (hasName) {
                            displayName = cust.name;
                          } else {
                            displayName = cust.email;
                          }
                          return (
                            <option key={cust.id} value={cust.id}>
                              🏢 {displayName} — {cust.email}
                            </option>
                          );
                        })}
                    </select>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Bu kuralın tetikleyeceği bildirimler seçilen müşteri hesabına atanacaktır.
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-xs">
                  <span className="text-slate-500">Müşteri Hesabı:</span>{' '}
                  <span className="font-bold text-slate-900 dark:text-white">Kendi Hesabınız</span>
                </div>
              )}

              {/* Target Device Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Hedef Saha Cihazı
                </label>
                <div className="relative">
                  <Cpu className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    value={deviceId}
                    onChange={(e) => {
                      markDirty();
                      setDeviceId(e.target.value);
                    }}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="all">🌐 Tüm Cihazlar (Global Eşik Kuralı)</option>
                    {devices.map((dev) => (
                      <option key={dev.id} value={dev.id}>
                        {dev.name} ({dev.hardwareModel || dev.type}) - IP: {dev.ipAddress || 'Bilinmiyor'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Selected Device Live Information Card */}
              {selectedDeviceObj ? (
                <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/70 dark:border-indigo-500/20 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>{selectedDeviceObj.name}</span>
                    </div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
                      {selectedDeviceObj.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-400 pt-1 border-t border-indigo-100 dark:border-indigo-900/40">
                    <div>
                      Konum: <span className="font-medium text-slate-800 dark:text-slate-200">{selectedDeviceObj.location || 'Depo/Saha'}</span>
                    </div>
                    <div>
                      Donanım: <span className="font-medium text-slate-800 dark:text-slate-200">{selectedDeviceObj.hardwareModel || selectedDeviceObj.type}</span>
                    </div>
                    <div>
                      IP Adresi: <span className="font-mono text-slate-800 dark:text-slate-200">{selectedDeviceObj.ipAddress || '192.168.1.x'}</span>
                    </div>
                    <div>
                      Son İletişim: <span className="text-slate-800 dark:text-slate-200">{selectedDeviceObj.lastSeen || 'Az önce'}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>
                    <strong>Global Kural Seçildi:</strong> Tanımlanacak koşul, sisteme bağlı tüm cihazların eşleşen telemetri verilerine otomatik olarak uygulanacaktır.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Metrik ve Koşul */}
          {currentStep === 2 && (
            <div className="space-y-4">
              {/* Dynamic Metric Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  İzlenecek Telemetri Metriği (Cihazın Gerçek Metrikleri)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {availableMetrics.map((m) => {
                    const isSelected = metricKey.toLowerCase() === m.key.toLowerCase();
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => {
                          markDirty();
                          setMetricKey(m.key);
                        }}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-500 ring-2 ring-indigo-500/20'
                            : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-900 dark:text-white">{m.label}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                            Metrik: <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{m.key}</span>
                          </div>
                        </div>
                        {m.currentValue !== undefined && (
                          <div className="text-right">
                            <span className="text-xs font-bold text-slate-900 dark:text-white">
                              {m.currentValue} {m.unit}
                            </span>
                            <div className="text-[10px] text-slate-400">Son Değer</div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Operator & Threshold Value */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Operator */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Mantıksal Koşul
                    </label>
                    <select
                      value={operator}
                      onChange={(e) => {
                        markDirty();
                        setOperator(e.target.value as any);
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value=">">&gt; Büyüktür</option>
                      <option value=">=">&gt;= Büyük veya eşittir</option>
                      <option value="<">&lt; Küçüktür</option>
                      <option value="<=">&lt;= Küçük veya eşittir</option>
                      <option value="OUTSIDE_RANGE">Aralık Dışında</option>
                      <option value="INSIDE_RANGE">Aralık İçinde</option>
                      <option value="UNCHANGED">Değer Değişmedi (Sabit)</option>
                      <option value="NO_DATA">Veri Alınamıyor (Koptu)</option>
                    </select>
                  </div>

                  {/* Threshold Input */}
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {operator === 'NO_DATA' ? 'Süre (Dakika)' : operator === 'OUTSIDE_RANGE' || operator === 'INSIDE_RANGE' ? 'Aralık (Alt - Üst)' : 'Eşik Değeri'}
                      </label>
                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                        Birim: {operator === 'NO_DATA' ? 'Dakika' : currentMetricMeta.unit || 'Birim Yok'}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          step="0.1"
                          value={thresholdValue}
                          onChange={(e) => {
                            markDirty();
                            setThresholdValue(parseFloat(e.target.value) || 0);
                          }}
                          placeholder="Alt Limit"
                          className="w-full pl-3 pr-10 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>
                      
                      {(operator === 'OUTSIDE_RANGE' || operator === 'INSIDE_RANGE') && (
                        <>
                          <div className="flex items-center text-slate-400">-</div>
                          <div className="relative flex-1">
                            <input
                              type="number"
                              step="0.1"
                              value={thresholdMax}
                              onChange={(e) => {
                                markDirty();
                                setThresholdMax(parseFloat(e.target.value) || 0);
                              }}
                              placeholder="Üst Limit"
                              className="w-full pl-3 pr-10 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* 24-Hour Min / Max & Last Value Strip */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-indigo-500" />
                    <span>
                      Son Ölçüm: <strong>{currentMetricMeta.currentValue ?? '-'} {currentMetricMeta.unit}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>24s Min: <strong className="text-slate-700 dark:text-slate-300">{currentMetricMeta.min24h ?? '-'} {currentMetricMeta.unit}</strong></span>
                    <span>24s Maks: <strong className="text-slate-700 dark:text-slate-300">{currentMetricMeta.max24h ?? '-'} {currentMetricMeta.unit}</strong></span>
                  </div>
                </div>
              </div>

              {/* LIVE RULE EVALUATION PREVIEW ("Bu kural şu anda alarm üretir mi?") */}
              <div
                className={`p-4 rounded-2xl border transition-all flex items-start gap-3 ${
                  liveEvaluation.willTrigger
                    ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                    : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    liveEvaluation.willTrigger
                      ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400'
                      : 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {liveEvaluation.willTrigger ? <Flame className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-xs flex items-center gap-2">
                    <span>
                      {liveEvaluation.willTrigger
                        ? '⚠️ Bu kural şu anda ALARM ÜRETİR!'
                        : '✅ Bu kural şu anda ALARM ÜRETMEZ (Güvenli Aralık)'}
                    </span>
                  </div>
                  <p className="text-xs opacity-90">
                    {liveEvaluation.willTrigger
                      ? `Mevcut ölçülen değer (${liveEvaluation.currentValue}${liveEvaluation.unit}) belirlediğiniz eşik değerini (${operator} ${liveEvaluation.thresholdValue}${liveEvaluation.unit}) aşıyor. Kural kaydedildiğinde anında tetiklenecektir.`
                      : `Mevcut ölçülen değer (${liveEvaluation.currentValue}${liveEvaluation.unit}) güvenli aralıktadır (${operator} ${liveEvaluation.thresholdValue}${liveEvaluation.unit} koşulu sağlanmamaktadır).`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Bekleme, Histerezis ve Tekrar */}
          {currentStep === 3 && (
            <div className="space-y-4">
              {/* Severity Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Alarm Önem Seviyesi (Severity)
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { key: 'critical', label: 'Kritik (Acil)', icon: Flame, color: 'text-rose-600 border-rose-200 dark:border-rose-800' },
                    { key: 'warning', label: 'Uyarı', icon: AlertTriangle, color: 'text-amber-600 border-amber-200 dark:border-amber-800' },
                    { key: 'info', label: 'Bilgilendirme', icon: Info, color: 'text-blue-600 border-blue-200 dark:border-blue-800' },
                  ].map((item) => {
                    const isSelected = severity === item.key;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          markDirty();
                          setSeverity(item.key as any);
                        }}
                        className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-md'
                            : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <Icon className={`w-5 h-5 mx-auto mb-1 ${isSelected ? 'text-inherit' : item.color}`} />
                        <div className="text-xs font-bold">{item.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Hysteresis & Min Breach Duration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Min Breach Duration */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Minimum İhlal Süresi
                    </label>
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                      {minBreachDurationSeconds} sn
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="120"
                    step="5"
                    value={minBreachDurationSeconds}
                    onChange={(e) => {
                      markDirty();
                      setMinBreachDurationSeconds(parseInt(e.target.value, 10));
                    }}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Geçici anlık voltaj veya sıcaklık sıçramalarında gereksiz alarmları engeller.
                  </p>
                </div>

                {/* Hysteresis Band */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Histerezis Bandı
                    </label>
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                      ±{hysteresis} {currentMetricMeta.unit}
                    </span>
                  </div>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={hysteresis}
                    onChange={(e) => {
                      markDirty();
                      setHysteresis(parseFloat(e.target.value) || 0);
                    }}
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Alarmın eşik sınırında sürekli açılıp kapanmasını (chattering) engeller.
                  </p>
                </div>
              </div>

              {/* Repeat Interval & Schedule */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Repeat Interval */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                    Tekrar Bildirim Aralığı
                  </label>
                  <select
                    value={repeatIntervalSeconds}
                    onChange={(e) => {
                      markDirty();
                      setRepeatIntervalSeconds(parseInt(e.target.value, 10));
                    }}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-semibold focus:outline-none"
                  >
                    <option value={60}>1 Dakika (Yoğun)</option>
                    <option value={300}>5 Dakika (Önerilen)</option>
                    <option value={900}>15 Dakika</option>
                    <option value={3600}>1 Saat</option>
                    <option value={86400}>Sadece 1 Kez (Günde 1)</option>
                  </select>
                </div>

                {/* Active Schedule (24h or Custom) */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Aktif Çalışma Saatleri
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        markDirty();
                        setIs24h(!is24h);
                      }}
                      className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      {is24h ? 'Özel Saat Tanımla' : '7/24 Kesintisiz'}
                    </button>
                  </div>

                  {is24h ? (
                    <div className="text-xs text-slate-600 dark:text-slate-300 font-medium flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-indigo-500" />
                      <span>7 Gün 24 Saat Kesintisiz İzleme</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={activeHoursStart}
                          onChange={(e) => {
                            markDirty();
                            setActiveHoursStart(e.target.value);
                          }}
                          className="flex-1 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                        />
                        <span className="text-xs text-slate-400">-</span>
                        <input
                          type="time"
                          value={activeHoursEnd}
                          onChange={(e) => {
                            markDirty();
                            setActiveHoursEnd(e.target.value);
                          }}
                          className="flex-1 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                        />
                      </div>
                      <select
                        value={timezone}
                        onChange={(e) => {
                          markDirty();
                          setTimezone(e.target.value);
                        }}
                        className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] text-slate-600 dark:text-slate-300"
                      >
                        <option value="Europe/Istanbul">Saat Dilimi: Europe/Istanbul (Türkiye)</option>
                        <option value="UTC">Saat Dilimi: UTC</option>
                        <option value="Europe/London">Saat Dilimi: Europe/London</option>
                        <option value="America/New_York">Saat Dilimi: America/New_York</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Kanallar, Alıcılar ve Önizleme */}
          {currentStep === 4 && (
            <div className="space-y-4">
              {/* Notification Channels Selection with Readiness Check */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Bildirim İletim Kanalları & Servis Durumu
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {[
                    { key: 'app', label: 'Uygulama İçi', icon: Bell },
                    { key: 'email', label: 'E-posta (SMTP)', icon: Mail },
                    { key: 'whatsapp', label: 'WhatsApp', icon: Smartphone },
                    { key: 'telegram', label: 'Telegram Bot', icon: MessageSquare },
                    { key: 'sms', label: 'SMS Başlığı', icon: Smartphone },
                    { key: 'webhook', label: 'Webhook (HTTP)', icon: Globe },
                  ].map((item) => {
                    const chKey = item.key as NotificationChannel;
                    const isSelected = channels.includes(chKey);
                    const status = getChannelStatus(chKey, serviceConfig);
                    const Icon = item.icon;

                    return (
                      <div
                        key={item.key}
                        onClick={() => toggleChannel(chKey)}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer relative ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-500'
                            : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <Icon className={`w-4 h-4 ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="rounded text-indigo-600 pointer-events-none"
                          />
                        </div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white mt-2">{item.label}</div>

                        {!status.isReady && (
                          <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium mt-1">
                            ⚠️ {status.reason || 'Yapılandırılmamış'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Target Recipients */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Özel Alıcılar (E-posta, WhatsApp No, Telegram Chat ID - Virgülle Ayırın)
                </label>
                <input
                  type="text"
                  placeholder="operasyon@firma.com, +905321234567, 129837465"
                  value={recipientsStr}
                  onChange={(e) => {
                    markDirty();
                    setRecipientsStr(e.target.value);
                  }}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Boş bırakılırsa kullanıcının varsayılan profil iletişim tercihleri kullanılır.
                </p>
              </div>

              {/* Custom Message Template with Variable Chips */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Bildirim Şablon Mesajı
                  </label>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {['{deviceName}', '{deviceId}', '{metric}', '{value}', '{unit}', '{threshold}', '{severity}', '{timestamp}', '{customerName}'].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => insertVariable(v)}
                        className="px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-mono font-semibold transition-colors cursor-pointer"
                      >
                        +{v}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  rows={2}
                  value={messageTemplate}
                  onChange={(e) => {
                    markDirty();
                    setMessageTemplate(e.target.value);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {/* Complete Rule Summary Card */}
              <div className="p-4 rounded-2xl bg-slate-900 text-white dark:bg-slate-950 border border-slate-800 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Kural Özeti & Canlı İletim Simülasyonu
                </div>
                <div className="flex items-center justify-between font-bold text-sm">
                  <span>
                    {selectedDeviceObj?.name || 'Tüm Cihazlar'} &rarr; {metricKey} {operator} {thresholdValue}
                    {currentMetricMeta.unit}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300">
                    {severity.toUpperCase()}
                  </span>
                </div>
                <div className="text-xs text-slate-300 italic pt-1 border-t border-slate-800">
                  "
                  {messageTemplate
                    .replace('{deviceName}', selectedDeviceObj?.name || 'Depo Sensörü')
                    .replace('{metric}', currentMetricMeta.label)
                    .replace('{value}', `${currentMetricMeta.currentValue ?? 45}${currentMetricMeta.unit}`)
                    .replace('{threshold}', `${thresholdValue}${currentMetricMeta.unit}`)}
                  "
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer Navigation */}
        <div className="px-5 sm:px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-800/20">
          <div>
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => prev - 1)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Geri</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleAttemptClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                İptal
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {currentStep < 4 ? (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => prev + 1)}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer active:scale-95"
              >
                <span>İleri</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span>Kaydediliyor...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{editingRule ? 'Kuralı Güncelle ve Aktif Et' : 'Kuralı Kaydet ve Başlat'}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
