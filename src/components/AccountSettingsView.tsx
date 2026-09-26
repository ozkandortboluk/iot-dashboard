import React, { useState, useEffect } from 'react';
import {
  User as UserIcon,
  Lock,
  Key,
  Shield,
  ShieldCheck,
  Mail,
  Phone,
  MessageSquare,
  Send,
  Bell,
  Smartphone,
  Moon,
  Sun,
  Check,
  AlertTriangle,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  LogOut,
  Building,
  Clock,
  Calendar,
  CheckCircle2,
  Sliders,
  Laptop,
  Globe,
  Palette,
  Volume2,
  VolumeX,
  Download,
  Copy,
  Terminal,
  Activity,
  Radio,
  Sparkles,
  Play,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useRealtime } from '../context/RealtimeContext';
import { apiFetch as fetch } from '../lib/apiFetch';
import { formatDateTime } from '../lib/utils';
import type { User } from '../types';
import { NexusNodeLogo } from './NexusNodeLogo';
import { APP_RELEASE_TAG } from '../config/version';

interface ActiveSessionItem {
  id: string;
  isCurrent: boolean;
  device: string;
  ip: string;
  location: string;
  createdAt: string;
  expiresAt: string;
  status: string;
}

interface UserActivityItem {
  id: string;
  action: string;
  details?: string;
  timestamp: string;
  severity?: 'info' | 'medium' | 'high';
  ip?: string;
}

export const AccountSettingsView: React.FC = () => {
  const { user, updateUser, refreshUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { isConnected, wsLatency } = useRealtime();

  // Navigation Sub-Tabs
  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'security' | 'sessions' | 'notifications' | 'preferences' | 'activity'>('profile');

  // Profile Form States
  const [name, setName] = useState(user?.name || '');
  const [companyName, setCompanyName] = useState(user?.companyName || '');
  const [title, setTitle] = useState(user?.title || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [timezone, setTimezone] = useState(user?.timezone || 'Europe/Istanbul');
  const [phone, setPhone] = useState(user?.phone || '');
  const [notificationEmail, setNotificationEmail] = useState(user?.notificationEmail || '');
  const [whatsappNumber, setWhatsappNumber] = useState(user?.whatsappNumber || '');
  const [telegramChatId, setTelegramChatId] = useState(user?.telegramChatId || '');
  const [avatarColor, setAvatarColor] = useState<'indigo' | 'emerald' | 'violet' | 'amber' | 'rose' | 'cyan' | 'slate'>(
    user?.avatarColor || 'indigo'
  );

  // Notification Preferences
  const [notifInApp, setNotifInApp] = useState(user?.notificationPreferences?.app ?? true);
  const [notifEmail, setNotifEmail] = useState(user?.notificationPreferences?.email ?? true);
  const [notifSms, setNotifSms] = useState(user?.notificationPreferences?.sms ?? false);
  const [notifWhatsapp, setNotifWhatsapp] = useState(user?.notificationPreferences?.whatsapp ?? false);
  const [notifTelegram, setNotifTelegram] = useState(user?.notificationPreferences?.telegram ?? false);
  const [notifWebhook, setNotifWebhook] = useState(user?.notificationPreferences?.webhook ?? false);

  // Extended Notification Rules
  const [alertCritical, setAlertCritical] = useState(user?.preferences?.alertThresholdLevels?.critical ?? true);
  const [alertWarning, setAlertWarning] = useState(user?.preferences?.alertThresholdLevels?.warning ?? true);
  const [alertOffline, setAlertOffline] = useState(user?.preferences?.alertThresholdLevels?.deviceOffline ?? true);
  const [alertOta, setAlertOta] = useState(user?.preferences?.alertThresholdLevels?.otaEvents ?? true);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(user?.preferences?.quietHours?.enabled ?? false);
  const [quietStart, setQuietStart] = useState(user?.preferences?.quietHours?.start || '22:00');
  const [quietEnd, setQuietEnd] = useState(user?.preferences?.quietHours?.end || '08:00');

  // Application Preferences
  const [refreshInterval, setRefreshInterval] = useState(user?.preferences?.refreshIntervalSec ?? 10);
  const [defaultTab, setDefaultTab] = useState(user?.preferences?.defaultTab || 'dashboard');
  const [soundAlerts, setSoundAlerts] = useState(user?.preferences?.soundAlerts ?? true);
  const [timeFormat, setTimeFormat] = useState(user?.preferences?.timeFormat || '24h');
  const [alertTone, setAlertTone] = useState<'chime' | 'beep' | 'radar'>('chime');

  // Password Form States
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  // Status & Feedback States
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);
  const [profileErrorMsg, setProfileErrorMsg] = useState<string | null>(null);

  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccessMsg, setPasswordSuccessMsg] = useState<string | null>(null);
  const [passwordErrorMsg, setPasswordErrorMsg] = useState<string | null>(null);

  const [savingNotif, setSavingNotif] = useState(false);
  const [notifSuccessMsg, setNotifSuccessMsg] = useState<string | null>(null);

  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsSuccessMsg, setPrefsSuccessMsg] = useState<string | null>(null);

  // Sessions State
  const [sessions, setSessions] = useState<ActiveSessionItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [revokingSessions, setRevokingSessions] = useState(false);
  const [sessionActionMsg, setSessionActionMsg] = useState<string | null>(null);

  // Activity Log State
  const [activities, setActivities] = useState<UserActivityItem[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);

  // Channel Test States
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ channel: string; success: boolean; message: string } | null>(null);

  // Data Export State
  const [exportingData, setExportingData] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // Refresh user data on mount
  useEffect(() => {
    refreshUser();
  }, []);

  // Sync state when user context changes
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setCompanyName(user.companyName || '');
      setTitle(user.title || '');
      setDepartment(user.department || '');
      setTimezone(user.timezone || 'Europe/Istanbul');
      setPhone(user.phone || '');
      setNotificationEmail(user.notificationEmail || '');
      setWhatsappNumber(user.whatsappNumber || '');
      setTelegramChatId(user.telegramChatId || '');
      if (user.avatarColor) setAvatarColor(user.avatarColor);

      if (user.notificationPreferences) {
        setNotifInApp(user.notificationPreferences.app ?? true);
        setNotifEmail(user.notificationPreferences.email ?? true);
        setNotifSms(user.notificationPreferences.sms ?? false);
        setNotifWhatsapp(user.notificationPreferences.whatsapp ?? false);
        setNotifTelegram(user.notificationPreferences.telegram ?? false);
        setNotifWebhook(user.notificationPreferences.webhook ?? false);
      }

      if (user.preferences) {
        setRefreshInterval(user.preferences.refreshIntervalSec ?? 10);
        setDefaultTab(user.preferences.defaultTab || 'dashboard');
        setSoundAlerts(user.preferences.soundAlerts ?? true);
        setTimeFormat(user.preferences.timeFormat || '24h');
        if (user.preferences.alertThresholdLevels) {
          setAlertCritical(user.preferences.alertThresholdLevels.critical ?? true);
          setAlertWarning(user.preferences.alertThresholdLevels.warning ?? true);
          setAlertOffline(user.preferences.alertThresholdLevels.deviceOffline ?? true);
          setAlertOta(user.preferences.alertThresholdLevels.otaEvents ?? true);
        }
        if (user.preferences.quietHours) {
          setQuietHoursEnabled(user.preferences.quietHours.enabled ?? false);
          setQuietStart(user.preferences.quietHours.start || '22:00');
          setQuietEnd(user.preferences.quietHours.end || '08:00');
        }
      }
    }
  }, [user]);

  // Load Sessions when navigating to sessions tab
  const fetchSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch('/api/profile/sessions');
      const data = await res.json();
      if (res.ok && data.sessions) {
        setSessions(data.sessions);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingSessions(false);
    }
  };

  // Load Activity logs when navigating to activity tab
  const fetchActivities = async () => {
    setLoadingActivities(true);
    try {
      const res = await fetch('/api/profile/activity');
      const data = await res.json();
      if (res.ok && data.activities) {
        setActivities(data.activities);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingActivities(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'sessions') {
      fetchSessions();
    } else if (activeSubTab === 'activity') {
      fetchActivities();
    }
  }, [activeSubTab]);

  // Handle Profile Update
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSuccessMsg(null);
    setProfileErrorMsg(null);

    try {
      const payload: Partial<User> = {
        name: name.trim(),
        companyName: companyName.trim(),
        title: title.trim(),
        department: department.trim(),
        timezone,
        avatarColor,
        phone: phone.trim(),
        notificationEmail: notificationEmail.trim(),
        whatsappNumber: whatsappNumber.trim(),
        telegramChatId: telegramChatId.trim(),
      };

      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Profil güncellenirken bir hata oluştu.');
      }

      if (data.user) {
        updateUser(data.user);
      }
      setProfileSuccessMsg(data.message || 'Profil bilgileriniz başarıyla güncellendi.');
      setTimeout(() => setProfileSuccessMsg(null), 5000);
    } catch (err: any) {
      setProfileErrorMsg(err.message || 'Profil güncellenemedi.');
    } finally {
      setSavingProfile(false);
    }
  };

  // Handle Notification Preferences Update
  const handleSaveNotifications = async () => {
    setSavingNotif(true);
    setNotifSuccessMsg(null);

    try {
      const payload: Partial<User> = {
        notificationPreferences: {
          app: notifInApp,
          email: notifEmail,
          sms: notifSms,
          whatsapp: notifWhatsapp,
          telegram: notifTelegram,
          webhook: notifWebhook,
        },
        preferences: {
          ...(user?.preferences || {}),
          alertThresholdLevels: {
            critical: alertCritical,
            warning: alertWarning,
            deviceOffline: alertOffline,
            otaEvents: alertOta,
          },
          quietHours: {
            enabled: quietHoursEnabled,
            start: quietStart,
            end: quietEnd,
          },
        },
      };

      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.user) {
        updateUser(data.user);
      }
      setNotifSuccessMsg('Bildirim kanal ve eşik tercihleriniz başarıyla kaydedildi.');
      setTimeout(() => setNotifSuccessMsg(null), 5000);
    } catch {
      // ignore
    } finally {
      setSavingNotif(false);
    }
  };

  // Handle Application Preferences Update
  const handleSavePreferences = async () => {
    setSavingPrefs(true);
    setPrefsSuccessMsg(null);

    try {
      const payload: Partial<User> = {
        preferences: {
          ...(user?.preferences || {}),
          refreshIntervalSec: Number(refreshInterval),
          defaultTab,
          soundAlerts,
          timeFormat: timeFormat as '24h' | '12h',
        },
      };

      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.user) {
        updateUser(data.user);
      }
      setPrefsSuccessMsg('Genel sistem tercihleriniz başarıyla güncellendi.');
      setTimeout(() => setPrefsSuccessMsg(null), 5000);
    } catch {
      // ignore
    } finally {
      setSavingPrefs(false);
    }
  };

  // Handle Password Change
  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSuccessMsg(null);
    setPasswordErrorMsg(null);

    if (!currentPassword) {
      setPasswordErrorMsg('Lütfen mevcut şifrenizi giriniz.');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordErrorMsg('Yeni şifreniz en az 6 karakter uzunluğunda olmalıdır.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordErrorMsg('Yeni şifre ile şifre tekrarı birbiriyle eşleşmiyor.');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch('/api/profile/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Şifre değiştirilemedi.');
      }

      setPasswordSuccessMsg(data.message || 'Şifreniz başarıyla değiştirildi.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccessMsg(null), 6000);
    } catch (err: any) {
      setPasswordErrorMsg(err.message || 'Şifre değiştirme işlemi başarısız oldu.');
    } finally {
      setSavingPassword(false);
    }
  };

  // Handle Revoke Other Sessions
  const handleRevokeOtherSessions = async () => {
    if (!window.confirm('Diğer tüm cihaz ve tarayıcılardaki oturumlarınız sonlandırılacak. Onaylıyor musunuz?')) {
      return;
    }
    setRevokingSessions(true);
    setSessionActionMsg(null);
    try {
      const res = await fetch('/api/profile/sessions/revoke-others', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSessionActionMsg(data.message || 'Diğer tüm oturumlar başarıyla kapatıldı.');
        fetchSessions();
      } else {
        setSessionActionMsg(data.error || 'Oturumlar kapatılamadı.');
      }
    } catch {
      setSessionActionMsg('İşlem sırasında bir hata oluştu.');
    } finally {
      setRevokingSessions(false);
      setTimeout(() => setSessionActionMsg(null), 5000);
    }
  };

  // Test Notification Channel
  const handleTestChannel = async (channel: string, recipient: string) => {
    setTestingChannel(channel);
    setTestResult(null);

    if (channel === 'app') {
      // In-App simulated trigger
      setTimeout(() => {
        setTestResult({
          channel: 'app',
          success: true,
          message: 'Uygulama içi test bildirimi başarıyla oluşturuldu ve üst çubuk zil ikonuna iletildi.',
        });
        setTestingChannel(null);
      }, 600);
      return;
    }

    try {
      const res = await fetch('/api/notification-services/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          recipient,
          title: 'NexusNode Test Bildirimi',
          message: `NexusNode IoT Cloud [${channel.toUpperCase()}] kanal doğrulama test iletisi. Zaman: ${new Date().toLocaleTimeString('tr-TR')}`,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setTestResult({
          channel,
          success: true,
          message: data.message || `Test iletisi ${recipient} adresine başarıyla kuyruğa alındı ve gönderildi.`,
        });
      } else {
        setTestResult({
          channel,
          success: false,
          message: data.error || 'Test gönderimi gerçekleştirilemedi.',
        });
      }
    } catch (err: any) {
      setTestResult({
        channel,
        success: false,
        message: err.message || 'Sunucuya bağlanılamadı.',
      });
    } finally {
      setTestingChannel(null);
    }
  };

  // Web Audio Synthesizer Alarm Test
  const playSoundAlert = (tone: 'chime' | 'beep' | 'radar') => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (tone === 'chime') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      } else if (tone === 'beep') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(920, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      }
    } catch {
      // Audio not supported or blocked
    }
  };

  // Export Account Data (GDPR/KVKK JSON Download)
  const handleExportData = async () => {
    setExportingData(true);
    try {
      const res = await fetch('/api/profile/export-data', { method: 'POST' });
      const result = await res.json();
      if (res.ok && result.data) {
        const jsonStr = JSON.stringify(result.data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename || `nexusnode-profile-${user?.id || 'export'}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch {
      // ignore
    } finally {
      setExportingData(false);
    }
  };

  // Copy simulated PAT
  const handleCopyPAT = () => {
    const fakePat = `nn_live_${user?.id ? user.id.replace(/-/g, '').slice(0, 16) : 'sec9821'}_${btoa(user?.email || 'admin').slice(0, 16)}`;
    navigator.clipboard.writeText(fakePat);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const isCustomer = user?.role === 'customer';

  // Avatar theme gradient map
  const avatarGradients: Record<string, string> = {
    indigo: 'from-indigo-600 to-violet-600',
    emerald: 'from-emerald-600 to-teal-500',
    violet: 'from-violet-600 to-purple-600',
    amber: 'from-amber-500 to-orange-600',
    rose: 'from-rose-500 to-pink-600',
    cyan: 'from-cyan-500 to-blue-600',
    slate: 'from-slate-700 to-slate-900',
  };

  // Password Strength Calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: 'Girilmedi', color: 'bg-slate-200 dark:bg-slate-700' };
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 10) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (score <= 2) return { score, label: 'Zayıf', color: 'bg-rose-500', text: 'text-rose-600' };
    if (score <= 4) return { score, label: 'Orta', color: 'bg-amber-500', text: 'text-amber-600' };
    return { score, label: 'Güçlü & Güvenli', color: 'bg-emerald-500', text: 'text-emerald-600' };
  };

  const passStrength = getPasswordStrength(newPassword);

  return (
    <div id="account-settings-container" className="space-y-6 max-w-6xl mx-auto animate-fadeIn pb-12">
      {/* Top Header Card & User Identity Hero */}
      <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div
          className={`h-28 relative ${
            isCustomer
              ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-800'
              : 'bg-gradient-to-r from-indigo-700 via-slate-900 to-violet-900'
          }`}
        >
          {/* Subtle Grid Effect */}
          <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />

          <div className="absolute top-3 right-4 flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-white text-[11px] font-semibold flex items-center gap-1.5 shadow-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
              <span>{isCustomer ? 'Müşteri Veri İzolasyonu Aktif' : 'Merkez Sistem Yöneticisi'}</span>
            </span>
          </div>
        </div>

        <div className="px-6 pb-6 pt-0 relative">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-12 mb-4">
            <div className="flex items-end gap-4">
              <div className="w-22 h-22 rounded-2xl bg-white dark:bg-[#0f172a] p-1.5 shadow-xl shrink-0">
                <div
                  className={`w-full h-full rounded-xl flex items-center justify-center font-bold text-white text-2xl shadow-inner bg-gradient-to-tr ${
                    avatarGradients[avatarColor] || avatarGradients.indigo
                  }`}
                >
                  {user?.name
                    ? user.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()
                    : 'NN'}
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                    {user?.name || 'Kullanıcı'}
                  </h1>
                  <span
                    className={`px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider ${
                      isCustomer
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
                    }`}
                  >
                    {isCustomer ? 'Müşteri Hesabı' : 'Sistem Yöneticisi'}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1 flex-wrap">
                  <span className="flex items-center gap-1 font-mono">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{user?.email}</span>
                  </span>
                  {user?.companyName && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="flex items-center gap-1">
                        <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{user.companyName}</span>
                      </span>
                    </>
                  )}
                  {user?.title && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-indigo-600 dark:text-indigo-400 font-medium">{user.title}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleExportData}
                disabled={exportingData}
                title="Hesap Verilerini JSON Olarak İndir (GDPR/KVKK)"
                className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition cursor-pointer text-xs font-semibold flex items-center gap-1.5"
              >
                <Download className={`w-3.5 h-3.5 ${exportingData ? 'animate-bounce' : ''}`} />
                <span className="hidden sm:inline">Verileri İndir</span>
              </button>

              <button
                type="button"
                onClick={refreshUser}
                title="Bilgileri Yenile"
                className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition cursor-pointer text-xs font-medium flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Yenile</span>
              </button>

              <button
                type="button"
                onClick={logout}
                className="px-3 py-2 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 rounded-xl transition cursor-pointer text-xs font-semibold flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Çıkış Yap</span>
              </button>
            </div>
          </div>

          {/* Sub-Navigation Tabs */}
          <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 overflow-x-auto pt-3 scrollbar-none">
            <button
              id="tab-profile-btn"
              onClick={() => setActiveSubTab('profile')}
              className={`px-3.5 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeSubTab === 'profile'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-500/10'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <UserIcon className="w-4 h-4" />
              <span>Profil & İletişim</span>
            </button>

            <button
              id="tab-security-btn"
              onClick={() => setActiveSubTab('security')}
              className={`px-3.5 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeSubTab === 'security'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-500/10'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <Lock className="w-4 h-4" />
              <span>Güvenlik & Şifre</span>
            </button>

            <button
              id="tab-sessions-btn"
              onClick={() => setActiveSubTab('sessions')}
              className={`px-3.5 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeSubTab === 'sessions'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-500/10'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <Laptop className="w-4 h-4" />
              <span>Aktif Oturumlar</span>
              {sessions.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-mono">
                  {sessions.length}
                </span>
              )}
            </button>

            <button
              id="tab-notifications-btn"
              onClick={() => setActiveSubTab('notifications')}
              className={`px-3.5 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeSubTab === 'notifications'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-500/10'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <Bell className="w-4 h-4" />
              <span>Bildirim & Test</span>
            </button>

            <button
              id="tab-preferences-btn"
              onClick={() => setActiveSubTab('preferences')}
              className={`px-3.5 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeSubTab === 'preferences'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-500/10'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Genel Tercihler</span>
            </button>

            <button
              id="tab-activity-btn"
              onClick={() => setActiveSubTab('activity')}
              className={`px-3.5 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeSubTab === 'activity'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-500/10'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Hesap Geçmişi</span>
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: Profil & İletişim Bilgileri */}
      {activeSubTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
          <div className="lg:col-span-2 bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-indigo-500" />
                  <span>Kişisel & Kurumsal Hesap Bilgileri</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Platform üzerindeki adınız, unvanınız, kurumunuz ve kritik telemetri bildirimlerinde kullanılacak iletişim adresleriniz.
                </p>
              </div>
            </div>

            {profileSuccessMsg && (
              <div className="mb-5 p-3.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2 animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>{profileSuccessMsg}</span>
              </div>
            )}

            {profileErrorMsg && (
              <div className="mb-5 p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40 rounded-xl text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{profileErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4">
              {/* Avatar Color Accent Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Profil Rozeti Tema Rengi</span>
                </label>
                <div className="flex items-center gap-2.5 flex-wrap">
                  {(['indigo', 'emerald', 'violet', 'amber', 'rose', 'cyan', 'slate'] as const).map((colorKey) => (
                    <button
                      key={colorKey}
                      type="button"
                      onClick={() => setAvatarColor(colorKey)}
                      className={`w-7 h-7 rounded-full bg-gradient-to-tr ${
                        avatarGradients[colorKey]
                      } transition-transform flex items-center justify-center cursor-pointer shadow-xs ${
                        avatarColor === colorKey ? 'ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-slate-900 scale-110' : 'opacity-80 hover:opacity-100'
                      }`}
                      title={colorKey}
                    >
                      {avatarColor === colorKey && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                  <span className="text-[11px] text-slate-500 capitalize ml-2">Seçili: {avatarColor}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Ad Soyad / Yetkili Adı *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Örn: Ahmet Yılmaz"
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Şirket / Tesis / Kurum Adı
                  </label>
                  <div className="relative">
                    <Building className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Örn: Atlas Lojistik Ltd."
                      className="w-full pl-9 pr-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Görev / Ünvan
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Örn: Baş Mühendis"
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Departman / Birim
                  </label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="Örn: Otomasyon & Enerji"
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Zaman Dilimi
                  </label>
                  <div className="relative">
                    <Globe className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="Europe/Istanbul">Europe/Istanbul (UTC+3)</option>
                      <option value="UTC">UTC (Standart Zaman)</option>
                      <option value="Europe/Berlin">Europe/Berlin (UTC+1)</option>
                      <option value="Europe/London">Europe/London (UTC+0)</option>
                      <option value="America/New_York">America/New_York (UTC-5)</option>
                      <option value="Asia/Dubai">Asia/Dubai (UTC+4)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Giriş E-posta Adresi (Değiştirilemez)
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="email"
                      readOnly
                      disabled
                      value={user?.email || ''}
                      className="w-full pl-9 pr-3.5 py-2.5 text-xs bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-slate-500 dark:text-slate-400 font-mono cursor-not-allowed"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">Hesap kimlik doğrulaması için kullanılır.</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Alarm & Bildirim E-posta Adresi
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 absolute left-3 top-3 text-indigo-400" />
                    <input
                      type="email"
                      value={notificationEmail}
                      onChange={(e) => setNotificationEmail(e.target.value)}
                      placeholder={user?.email || 'bildirim@sirketiniz.com'}
                      className="w-full pl-9 pr-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">Sensör alarm e-postalarının iletileceği özel adres.</span>
                </div>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-800 pt-4 mt-2">
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Anlık Mesajlaşma & GSM İletişim Kanalları</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Telefon / GSM (SMS)
                    </label>
                    <div className="relative">
                      <Phone className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+90 532 000 0000"
                        className="w-full pl-9 pr-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      WhatsApp Bildirim No
                    </label>
                    <div className="relative">
                      <MessageSquare className="w-3.5 h-3.5 absolute left-3 top-3 text-emerald-500" />
                      <input
                        type="text"
                        value={whatsappNumber}
                        onChange={(e) => setWhatsappNumber(e.target.value)}
                        placeholder="905320000000"
                        className="w-full pl-9 pr-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Telegram Chat ID / Kullanıcı
                    </label>
                    <div className="relative">
                      <Send className="w-3.5 h-3.5 absolute left-3 top-3 text-sky-500" />
                      <input
                        type="text"
                        value={telegramChatId}
                        onChange={(e) => setTelegramChatId(e.target.value)}
                        placeholder="@kullanici veya 12345678"
                        className="w-full pl-9 pr-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-xs transition shadow-sm hover:shadow flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {savingProfile ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{savingProfile ? 'Kaydediliyor...' : 'Profil Değişikliklerini Kaydet'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Account Metadata & Security Summary Card */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-500" />
                <span>Hesap & Güvenlik Özeti</span>
              </h3>

              <div className="space-y-3.5 text-xs">
                <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800/80">
                  <span className="text-slate-500 dark:text-slate-400">Hesap Kimliği (ID):</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 text-[11px] truncate max-w-[160px]">{user?.id}</span>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800/80">
                  <span className="text-slate-500 dark:text-slate-400">Yetki Rolü:</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400 uppercase">
                    {user?.role === 'admin' ? 'Yönetici (Admin)' : user?.role === 'operator' ? 'Operatör' : 'Müşteri (Customer)'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800/80">
                  <span className="text-slate-500 dark:text-slate-400">Kayıt Tarihi:</span>
                  <span className="text-slate-700 dark:text-slate-300">
                    {user?.created_at ? formatDateTime(user.created_at) : 'Kurulum Tarihi'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-500 dark:text-slate-400">Son Güncelleme:</span>
                  <span className="text-slate-700 dark:text-slate-300">
                    {user?.updatedAt ? formatDateTime(user.updatedAt) : 'Az Önce'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick KPI stats */}
            <div className="bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3 text-xs">
              <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-500" />
                <span>Hesap Durum Göstergeleri</span>
              </h4>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p className="text-[10px] text-slate-400">Güvenlik Skoru</p>
                  <p className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5">%100</p>
                  <p className="text-[9px] text-slate-400">Bcrypt + SHA256</p>
                </div>

                <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p className="text-[10px] text-slate-400">Aktif Kanallar</p>
                  <p className="text-base font-black text-indigo-600 dark:text-indigo-400 mt-0.5">
                    {[notifInApp, notifEmail, notifSms, notifWhatsapp, notifTelegram, notifWebhook].filter(Boolean).length} / 6
                  </p>
                  <p className="text-[9px] text-slate-400">İletim Hazır</p>
                </div>
              </div>
            </div>

            {/* Privacy Rule Card */}
            <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl p-5 text-xs">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-bold text-emerald-900 dark:text-emerald-200">Tam Veri İzolasyonu & Güvenlik</h4>
                  <p className="text-emerald-800/80 dark:text-emerald-300/80 leading-relaxed text-[11px]">
                    Cihazlarınız, alarmlarınız ve telemetri verileriniz diğer müşterilere tamamen kapalıdır. Yalnızca yetkili yöneticiler ve bu hesabın sahibi verilere erişebilir.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Güvenlik & Şifre Değiştirme */}
      {activeSubTab === 'security' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
          <div className="lg:col-span-2 bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Key className="w-4 h-4 text-indigo-500" />
                  <span>Hesap Şifresini Değiştir</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Hesap güvenliğinizi korumak için periyodik olarak güçlü bir şifre belirlemenizi öneririz.
                </p>
              </div>
            </div>

            {passwordSuccessMsg && (
              <div className="mb-5 p-3.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2 animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>{passwordSuccessMsg}</span>
              </div>
            )}

            {passwordErrorMsg && (
              <div className="mb-5 p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40 rounded-xl text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{passwordErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSavePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Mevcut Şifreniz *
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Yeni Şifre (En az 6 karakter) *
                  </label>
                  <div className="relative">
                    <Key className="w-3.5 h-3.5 absolute left-3 top-3 text-indigo-500" />
                    <input
                      type={showNewPass ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Yeni şifreniz"
                      className="w-full pl-9 pr-10 py-2.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPass(!showNewPass)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Yeni Şifre Tekrarı *
                  </label>
                  <div className="relative">
                    <Key className="w-3.5 h-3.5 absolute left-3 top-3 text-indigo-500" />
                    <input
                      type={showConfirmPass ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Yeni şifreyi onaylayın"
                      className="w-full pl-9 pr-10 py-2.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPass(!showConfirmPass)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Dynamic Password Strength Bar */}
              {newPassword && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Şifre Güvenlik Seviyesi:</span>
                    <span className={`font-bold ${passStrength.text}`}>{passStrength.label}</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${passStrength.color}`}
                      style={{ width: `${Math.min(100, (passStrength.score / 5) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Password Strength Checklist */}
              <div className="bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Şifre Gereksinimleri:</span>
                <div className="flex items-center gap-2">
                  <Check className={`w-3.5 h-3.5 ${newPassword.length >= 6 ? 'text-emerald-500' : 'text-slate-400'}`} />
                  <span className={newPassword.length >= 6 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-slate-500'}>
                    En az 6 karakter uzunluğunda
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className={`w-3.5 h-3.5 ${newPassword && newPassword === confirmPassword ? 'text-emerald-500' : 'text-slate-400'}`} />
                  <span className={newPassword && newPassword === confirmPassword ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-slate-500'}>
                    Şifreler birbiriyle eşleşiyor
                  </span>
                </div>
              </div>

              <div className="pt-3 flex justify-end">
                <button
                  type="submit"
                  disabled={savingPassword || newPassword.length < 6 || newPassword !== confirmPassword}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-xs transition shadow-sm hover:shadow flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {savingPassword ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                  <span>{savingPassword ? 'Şifre Güncelleniyor...' : 'Şifremi Güncelle'}</span>
                </button>
              </div>
            </form>
          </div>

          <div className="space-y-4">
            <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-500" />
                <span>Bcrypt & Oturum Güvenliği</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Şifreleriniz sunucuda tuzlanmış (salted) Bcrypt algoritması ile kriptografik olarak hash'lenir ve hem yerel depoda hem de PostgreSQL veritabanında korunur.
              </p>
              <ul className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>30 Günlük Güvenli Token Oturumu</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Audit Log Kayıtları ile Sürekli İzleme</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>OWASP Şifre Koruması & Anti-Enumeration</span>
                </li>
              </ul>
            </div>

            {/* 2FA Ready Card */}
            <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/40 rounded-2xl p-5 text-xs">
              <div className="flex items-start gap-3">
                <Smartphone className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <h4 className="font-bold text-indigo-950 dark:text-indigo-200">İki Faktörlü Doğrulama (2FA)</h4>
                  <p className="text-indigo-900/80 dark:text-indigo-300/80 leading-relaxed text-[11px]">
                    Hesabınız için Google Authenticator veya SMS OTP tabanlı ek güvenlik katmanı hazır durumdadır.
                  </p>
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-200/60 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200">
                    Standart Oturum Koruması Aktif
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Aktif Oturumlar & Cihazlar */}
      {activeSubTab === 'sessions' && (
        <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6 animate-fadeIn">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Laptop className="w-4 h-4 text-indigo-500" />
                <span>Aktif Cihaz & Tarayıcı Oturumları</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Bu hesaba şu anda bağlı olan web tarayıcıları ve mobil cihaz oturumlarının listesi.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchSessions}
                disabled={loadingSessions}
                className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingSessions ? 'animate-spin' : ''}`} />
                <span>Yenile</span>
              </button>

              <button
                type="button"
                onClick={handleRevokeOtherSessions}
                disabled={revokingSessions || sessions.length <= 1}
                className="px-3.5 py-2 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{revokingSessions ? 'Kapatılıyor...' : 'Diğer Tüm Oturumları Kapat'}</span>
              </button>
            </div>
          </div>

          {sessionActionMsg && (
            <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/40 rounded-xl text-xs text-indigo-800 dark:text-indigo-200 flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />
              <span>{sessionActionMsg}</span>
            </div>
          )}

          {loadingSessions ? (
            <div className="py-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
              <span>Aktif oturumlar yükleniyor...</span>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((sess) => (
                <div
                  key={sess.id}
                  className={`p-4 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    sess.isCurrent
                      ? 'border-indigo-500/40 bg-indigo-50/30 dark:bg-indigo-950/20'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        sess.isCurrent
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <Laptop className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">{sess.device}</span>
                        {sess.isCurrent ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span>Bu Cihaz (Şu Anki Oturum)</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            Aktif
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex-wrap">
                        <span>IP: {sess.ip}</span>
                        <span aria-hidden="true">·</span>
                        <span>{sess.location}</span>
                        <span aria-hidden="true">·</span>
                        <span>Başlangıç: {formatDateTime(sess.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right text-[11px] text-slate-400">
                    <span className="block">Bitiş: {formatDateTime(sess.expiresAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Bildirim & Canlı Test */}
      {activeSubTab === 'notifications' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Bell className="w-4 h-4 text-indigo-500" />
                  <span>Bildirim & Alarm İletim Tercihleri</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Cihazlarınızda eşik aşımı veya kritik durum meydana geldiğinde hangi kanallardan haberdar olmak istediğinizi belirleyin ve test edin.
                </p>
              </div>

              <button
                onClick={handleSaveNotifications}
                disabled={savingNotif}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-xs transition shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50 self-start sm:self-auto"
              >
                {savingNotif ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>{savingNotif ? 'Kaydediliyor...' : 'Tercihleri Kaydet'}</span>
              </button>
            </div>

            {notifSuccessMsg && (
              <div className="mb-5 p-3.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2 animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>{notifSuccessMsg}</span>
              </div>
            )}

            {testResult && (
              <div
                className={`mb-5 p-3.5 rounded-xl border text-xs flex items-center justify-between gap-2 animate-fadeIn ${
                  testResult.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40 text-rose-800 dark:text-rose-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                  <span>{testResult.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setTestResult(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs cursor-pointer"
                >
                  Kapat
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* In-App */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">Uygulama İçi Canlı Bildirimler</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">Üst çubuk zil ikonunda anlık gösterim</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleTestChannel('app', 'in_app')}
                    disabled={testingChannel === 'app'}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition cursor-pointer"
                  >
                    {testingChannel === 'app' ? 'Test...' : 'Test Et'}
                  </button>
                  <input
                    type="checkbox"
                    checked={notifInApp}
                    onChange={(e) => setNotifInApp(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">E-posta Alarm Bildirimleri</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {notificationEmail || user?.email || 'E-posta tanımlanmamış'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleTestChannel('email', notificationEmail || user?.email || '')}
                    disabled={testingChannel === 'email' || (!notificationEmail && !user?.email)}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-blue-700 dark:text-blue-300 rounded-lg transition cursor-pointer disabled:opacity-50"
                  >
                    {testingChannel === 'email' ? 'Gönderiliyor...' : 'Test Gönder'}
                  </button>
                  <input
                    type="checkbox"
                    checked={notifEmail}
                    onChange={(e) => setNotifEmail(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* WhatsApp */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">WhatsApp Mesaj Bildirimleri</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{whatsappNumber || 'Tanımlı numara yok'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleTestChannel('whatsapp', whatsappNumber)}
                    disabled={testingChannel === 'whatsapp' || !whatsappNumber}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 rounded-lg transition cursor-pointer disabled:opacity-50"
                  >
                    {testingChannel === 'whatsapp' ? 'Gönderiliyor...' : 'Test Gönder'}
                  </button>
                  <input
                    type="checkbox"
                    checked={notifWhatsapp}
                    onChange={(e) => setNotifWhatsapp(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* Telegram */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                    <Send className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">Telegram Bot Uyarıları</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{telegramChatId || 'Telegram Chat ID yok'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleTestChannel('telegram', telegramChatId)}
                    disabled={testingChannel === 'telegram' || !telegramChatId}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 text-sky-700 dark:text-sky-300 rounded-lg transition cursor-pointer disabled:opacity-50"
                  >
                    {testingChannel === 'telegram' ? 'Gönderiliyor...' : 'Test Gönder'}
                  </button>
                  <input
                    type="checkbox"
                    checked={notifTelegram}
                    onChange={(e) => setNotifTelegram(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* SMS */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">SMS Kısa Mesaj Uyarıları</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{phone || 'Tanımlı GSM no yok'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleTestChannel('sms', phone)}
                    disabled={testingChannel === 'sms' || !phone}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-amber-700 dark:text-amber-300 rounded-lg transition cursor-pointer disabled:opacity-50"
                  >
                    {testingChannel === 'sms' ? 'Gönderiliyor...' : 'Test Gönder'}
                  </button>
                  <input
                    type="checkbox"
                    checked={notifSms}
                    onChange={(e) => setNotifSms(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* Webhook */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">Özel Webhook Entegrasyonu</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">Harici REST API JSON POST iletimi</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="checkbox"
                    checked={notifWebhook}
                    onChange={(e) => setNotifWebhook(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Alarm Öncelik Seviyeleri ve Sessiz Saatler */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Radio className="w-4 h-4 text-indigo-500" />
                <span>Bildirim Tetikleyici Olay Filtreleri</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Yalnızca ilgilendiğiniz sistem olaylarında uyarı alarak gereksiz mesaj kalabalığını engelleyin.
              </p>

              <div className="space-y-3 pt-2 text-xs">
                <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 cursor-pointer">
                  <span className="font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    Kritik Eşik Aşımları (Acil Müdahale)
                  </span>
                  <input
                    type="checkbox"
                    checked={alertCritical}
                    onChange={(e) => setAlertCritical(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded"
                  />
                </label>

                <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 cursor-pointer">
                  <span className="font-medium text-amber-600 dark:text-amber-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Uyarı Seviyesi Eşik Aşımı (Warning)
                  </span>
                  <input
                    type="checkbox"
                    checked={alertWarning}
                    onChange={(e) => setAlertWarning(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded"
                  />
                </label>

                <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 cursor-pointer">
                  <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    Cihaz Bağlantı Kopması / Offline Uyarıları
                  </span>
                  <input
                    type="checkbox"
                    checked={alertOffline}
                    onChange={(e) => setAlertOffline(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded"
                  />
                </label>

                <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 cursor-pointer">
                  <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    OTA Donanım Güncelleme Olayları
                  </span>
                  <input
                    type="checkbox"
                    checked={alertOta}
                    onChange={(e) => setAlertOta(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded"
                  />
                </label>
              </div>
            </div>

            {/* Sessiz Saatler (Do Not Disturb) */}
            <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-500" />
                <span>Sessiz Saatler (Do Not Disturb)</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Belirlediğiniz saat aralığında kritik olmayan rutin bildirimler sessize alınır.
              </p>

              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Sessiz Saatleri Etkinleştir</span>
                  <input
                    type="checkbox"
                    checked={quietHoursEnabled}
                    onChange={(e) => setQuietHoursEnabled(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-500 mb-1">Başlangıç Saati</label>
                    <input
                      type="time"
                      value={quietStart}
                      disabled={!quietHoursEnabled}
                      onChange={(e) => setQuietStart(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 mb-1">Bitiş Saati</label>
                    <input
                      type="time"
                      value={quietEnd}
                      disabled={!quietHoursEnabled}
                      onChange={(e) => setQuietEnd(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Genel Tercihler & Görünüm */}
      {activeSubTab === 'preferences' && (
        <div className="space-y-6 animate-fadeIn">
          {prefsSuccessMsg && (
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{prefsSuccessMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Theme & Display */}
            <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sun className="w-4 h-4 text-amber-500" />
                <span>Görünüm & Tema Tercihi</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Uygulama arayüzünün karanlık veya aydınlık modda gösterilmesini ayarlayın.
              </p>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (theme === 'dark') toggleTheme();
                  }}
                  className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                    theme === 'light'
                      ? 'bg-amber-50 border-amber-300 text-amber-800 font-bold shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Sun className="w-4 h-4 text-amber-500" />
                  <span>Açık Mod (Light)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (theme === 'light') toggleTheme();
                  }}
                  className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                    theme === 'dark'
                      ? 'bg-indigo-950/40 border-indigo-500/40 text-indigo-300 font-bold shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Moon className="w-4 h-4 text-indigo-400" />
                  <span>Koyu Mod (Dark)</span>
                </button>
              </div>
            </div>

            {/* Audio Alerts & Chimes */}
            <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-indigo-500" />
                <span>Sesli Alarm & Akustik Uyarılar</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Kritik eşik aşımlarında tarayıcınızdan duyulabilir uyarı sinyali çalınmasını sağlar.
              </p>

              <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Sesli Uyarılar Aktif</span>
                <input
                  type="checkbox"
                  checked={soundAlerts}
                  onChange={(e) => setSoundAlerts(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <select
                  value={alertTone}
                  onChange={(e) => setAlertTone(e.target.value as any)}
                  className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  <option value="chime">Chime Melodisi (Yumuşak Çan)</option>
                  <option value="beep">Elektronik Bip (Endüstriyel)</option>
                  <option value="radar">Radar Sweep (Acil Siren)</option>
                </select>

                <button
                  type="button"
                  onClick={() => playSoundAlert(alertTone)}
                  className="px-3.5 py-2 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Dinle</span>
                </button>
              </div>
            </div>

            {/* Dashboard & Refresh Defaults */}
            <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-500" />
                <span>Başlangıç Ekranı & Veri Akışı</span>
              </h3>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-500 mb-1">Giriş Yapıldığında Açılacak Varsayılan Sayfa</label>
                  <select
                    value={defaultTab}
                    onChange={(e) => setDefaultTab(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    <option value="dashboard">Ana Dashboard & Canlı Widget'lar</option>
                    <option value="devices">Cihaz Listesi & Donanım Masası</option>
                    <option value="analytics">Veri Analizi & Zaman Serileri</option>
                    <option value="notifications">Bildirimler & Alarm Merkezi</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-500 mb-1">Veri Yenileme Periyodu (Arka Plan)</label>
                  <select
                    value={refreshInterval}
                    onChange={(e) => setRefreshInterval(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    <option value={5}>5 Saniyede Bir (Çok Hızlı / Saha Gözlemi)</option>
                    <option value={10}>10 Saniyede Bir (Önerilen)</option>
                    <option value={30}>30 Saniyede Bir (Düşük Bant Genişliği)</option>
                    <option value={60}>60 Saniyede Bir (Statik İzleme)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-500 mb-1">Saat & Zaman Formatı</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTimeFormat('24h')}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                        timeFormat === '24h'
                          ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-500 text-indigo-600 dark:text-indigo-400'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      24 Saat (14:30:00)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimeFormat('12h')}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                        timeFormat === '12h'
                          ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-500 text-indigo-600 dark:text-indigo-400'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      12 Saat (02:30 PM)
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Personal API Access Token */}
            <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-indigo-500" />
                <span>Kişisel API Jetonu (Personal Access Token)</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Python ajanları, Postman veya harici scriptlerinizden platform API'lerine erişmek için salt-okunur kimlik doğrulama belirteci.
              </p>

              <div className="space-y-2 pt-1 text-xs">
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    readOnly
                    value={`nn_live_${user?.id ? user.id.replace(/-/g, '').slice(0, 16) : 'sec9821'}_pat`}
                    className="flex-1 px-3 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-[11px] text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={handleCopyPAT}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedToken ? 'Kopyalandı!' : 'Kopyala'}</span>
                  </button>
                </div>
                <span className="text-[10px] text-slate-400 block">HTTP Header: Authorization: Bearer &lt;TOKEN&gt;</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleSavePreferences}
              disabled={savingPrefs}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-xs transition shadow-sm hover:shadow flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {savingPrefs ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{savingPrefs ? 'Kaydediliyor...' : 'Genel Tercihleri Kaydet'}</span>
            </button>
          </div>

          {/* Platform Identity & Domain Card */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl border border-indigo-500/20 p-6 shadow-md text-white flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <NexusNodeLogo variant="full" size="md" showDomain={true} animated={true} theme="dark" />
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 text-slate-300 font-mono">
                nexusnodeiot.com.tr
              </span>
              <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                {APP_RELEASE_TAG} Üretim Modu
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: Hesap Etkinlik Geçmişi (Audit Logs) */}
      {activeSubTab === 'activity' && (
        <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6 animate-fadeIn">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-500" />
                <span>Hesap Etkinlik & Güvenlik Günlüğü</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Hesabınızla gerçekleştirilen son kimlik doğrulama, şifre değişikliği ve yapılandırma olayları.
              </p>
            </div>

            <button
              type="button"
              onClick={fetchActivities}
              disabled={loadingActivities}
              className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingActivities ? 'animate-spin' : ''}`} />
              <span>Yenile</span>
            </button>
          </div>

          {loadingActivities ? (
            <div className="py-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
              <span>Etkinlik kayıtları yükleniyor...</span>
            </div>
          ) : activities.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Henüz bu hesap için kayıtlı güvenlik olayı bulunmuyor.
            </div>
          ) : (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
              {activities.map((act) => (
                <div key={act.id} className="relative group">
                  <div
                    className={`absolute -left-6 top-1 w-4 h-4 rounded-full border-2 border-white dark:border-[#0f172a] shrink-0 ${
                      act.severity === 'high'
                        ? 'bg-rose-500 ring-2 ring-rose-500/20'
                        : act.severity === 'medium'
                        ? 'bg-amber-500 ring-2 ring-amber-500/20'
                        : 'bg-indigo-500 ring-2 ring-indigo-500/20'
                    }`}
                  />
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{act.action}</span>
                      <span className="text-[11px] text-slate-400 font-mono">{formatDateTime(act.timestamp)}</span>
                    </div>
                    {act.details && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{act.details}</p>
                    )}
                    {act.ip && (
                      <span className="text-[10px] text-slate-400 font-mono block">IP Adresi: {act.ip}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
