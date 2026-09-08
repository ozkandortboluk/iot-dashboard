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
  CheckCircle,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useRealtime } from '../context/RealtimeContext';
import { apiFetch as fetch, safeJson } from '../lib/apiFetch';
import { formatDateTime } from '../lib/utils';
import type { User } from '../types';
import { NexusNodeLogo } from './NexusNodeLogo';
import { APP_RELEASE_TAG } from '../config/version';

export const AccountSettingsView: React.FC = () => {
  const { user, updateUser, refreshUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { isConnected, wsLatency, connectionStatus } = useRealtime();

  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'security' | 'notifications' | 'preferences'>('profile');

  // Profile Form States
  const [name, setName] = useState(user?.name || '');
  const [companyName, setCompanyName] = useState(user?.companyName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [notificationEmail, setNotificationEmail] = useState(user?.notificationEmail || '');
  const [whatsappNumber, setWhatsappNumber] = useState(user?.whatsappNumber || '');
  const [telegramChatId, setTelegramChatId] = useState(user?.telegramChatId || '');

  // Notification Preferences
  const [notifInApp, setNotifInApp] = useState(user?.notificationPreferences?.app ?? true);
  const [notifEmail, setNotifEmail] = useState(user?.notificationPreferences?.email ?? true);
  const [notifSms, setNotifSms] = useState(user?.notificationPreferences?.sms ?? false);
  const [notifWhatsapp, setNotifWhatsapp] = useState(user?.notificationPreferences?.whatsapp ?? false);
  const [notifTelegram, setNotifTelegram] = useState(user?.notificationPreferences?.telegram ?? false);
  const [notifWebhook, setNotifWebhook] = useState(user?.notificationPreferences?.webhook ?? false);

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

  // Mount olduğunda doğrudan veritabanından en güncel veriyi çek
  useEffect(() => {
    refreshUser();
  }, []);

  // Sync state when user context changes
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setCompanyName(user.companyName || '');
      setPhone(user.phone || '');
      setNotificationEmail(user.notificationEmail || '');
      setWhatsappNumber(user.whatsappNumber || '');
      setTelegramChatId(user.telegramChatId || '');

      if (user.notificationPreferences) {
        setNotifInApp(user.notificationPreferences.app ?? true);
        setNotifEmail(user.notificationPreferences.email ?? true);
        setNotifSms(user.notificationPreferences.sms ?? false);
        setNotifWhatsapp(user.notificationPreferences.whatsapp ?? false);
        setNotifTelegram(user.notificationPreferences.telegram ?? false);
        setNotifWebhook(user.notificationPreferences.webhook ?? false);
      }
    }
  }, [user]);

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
      setNotifSuccessMsg('Bildirim kanal tercihleriniz başarıyla kaydedildi.');
      setTimeout(() => setNotifSuccessMsg(null), 5000);
    } catch {
      // ignore
    } finally {
      setSavingNotif(false);
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

  const isCustomer = user?.role === 'customer';

  return (
    <div id="account-settings-container" className="space-y-6 max-w-6xl mx-auto animate-fadeIn">
      {/* Top Header Card & User Identity Banner */}
      <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className={`h-24 ${isCustomer ? 'bg-gradient-to-r from-emerald-600 to-teal-700' : 'bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-800'} relative`}>
          <div className="absolute top-3 right-4 flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-white text-[11px] font-semibold flex items-center gap-1.5 shadow-xs">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{isCustomer ? 'Müşteri İzolasyonu Aktif' : 'Merkez Yönetici'}</span>
            </span>
          </div>
        </div>

        <div className="px-6 pb-6 pt-0 relative">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-12 mb-4">
            <div className="flex items-end gap-4">
              <div className="w-20 h-20 rounded-2xl bg-white dark:bg-[#0f172a] p-1 shadow-xl shrink-0">
                <div className={`w-full h-full rounded-xl flex items-center justify-center font-bold text-white text-2xl shadow-inner ${
                  isCustomer ? 'bg-gradient-to-tr from-emerald-600 to-teal-500' : 'bg-gradient-to-tr from-indigo-600 to-violet-600'
                }`}>
                  {user?.name ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : 'US'}
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                    {user?.name || 'Kullanıcı'}
                  </h1>
                  <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider ${
                    isCustomer
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
                  }`}>
                    {isCustomer ? 'Müşteri Hesabı' : 'Sistem Yöneticisi'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="font-mono">{user?.email}</span>
                  {user?.companyName && (
                    <>
                      <span>•</span>
                      <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{user.companyName}</span>
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
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
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto pt-2 scrollbar-none">
            <button
              id="tab-profile-btn"
              onClick={() => setActiveSubTab('profile')}
              className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeSubTab === 'profile'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-500/10'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <UserIcon className="w-4 h-4" />
              <span>Profil & İletişim Bilgileri</span>
            </button>

            <button
              id="tab-security-btn"
              onClick={() => setActiveSubTab('security')}
              className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeSubTab === 'security'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-500/10'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <Lock className="w-4 h-4" />
              <span>Güvenlik & Şifre Değiştirme</span>
            </button>

            <button
              id="tab-notifications-btn"
              onClick={() => setActiveSubTab('notifications')}
              className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeSubTab === 'notifications'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-500/10'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <Bell className="w-4 h-4" />
              <span>Bildirim & Uyarı Kanalları</span>
            </button>

            <button
              id="tab-preferences-btn"
              onClick={() => setActiveSubTab('preferences')}
              className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeSubTab === 'preferences'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-500/10'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Genel Tercihler & Görünüm</span>
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: Profil & İletişim Bilgileri */}
      {activeSubTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-indigo-500" />
                  <span>Kişisel & Kurumsal Hesap Bilgileri</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Platform üzerindeki adınız, kurumunuz ve kritik telemetri bildirimlerinde kullanılacak iletişim adresleriniz.
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{user?.id}</span>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800/80">
                  <span className="text-slate-500 dark:text-slate-400">Yetki Rolü:</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400 uppercase">
                    {user?.role === 'admin' ? 'Yönetici (Admin)' : 'Müşteri (Customer)'}
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

            {/* Privacy Rule 1 Card */}
            <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl p-5 text-xs">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-bold text-emerald-900 dark:text-emerald-200">1. Kural: Tam Veri İzolasyonu</h4>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                  <span>Audit Log Kayıtları ile İzleme</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Bildirim & Uyarı Kanalları */}
      {activeSubTab === 'notifications' && (
        <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-indigo-500" />
                <span>Bildirim & Alarm İletim Tercihleri</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Cihazlarınızda eşik aşımı veya kritik durum meydana geldiğinde hangi kanallardan haberdar olmak istediğinizi belirleyin.
              </p>
            </div>

            <button
              onClick={handleSaveNotifications}
              disabled={savingNotif}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-xs transition shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* In-App */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">Uygulama İçi Canlı Bildirimler</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Üst çubuk zil ikonunda anlık bildirim gösterimi</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={notifInApp}
                onChange={(e) => setNotifInApp(e.target.checked)}
                className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
              />
            </div>

            {/* Email */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">E-posta Alarm Bildirimleri</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{notificationEmail || user?.email || 'E-posta adresinize'}</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={notifEmail}
                onChange={(e) => setNotifEmail(e.target.checked)}
                className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
              />
            </div>

            {/* WhatsApp */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">WhatsApp Mesaj Bildirimleri</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{whatsappNumber || 'Tanımlı WhatsApp numarasına'}</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={notifWhatsapp}
                onChange={(e) => setNotifWhatsapp(e.target.checked)}
                className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
              />
            </div>

            {/* Telegram */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">Telegram Bot Uyarıları</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{telegramChatId || 'Telegram Chat ID\'sine'}</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={notifTelegram}
                onChange={(e) => setNotifTelegram(e.target.checked)}
                className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
              />
            </div>

            {/* SMS */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">SMS Kısa Mesaj Uyarıları</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{phone || 'Tanımlı GSM numarasına'}</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={notifSms}
                onChange={(e) => setNotifSms(e.target.checked)}
                className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
              />
            </div>

            {/* Webhook */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">Özel Webhook Entegrasyonu</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Harici API / Sunucuya JSON POST yükü</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={notifWebhook}
                onChange={(e) => setNotifWebhook(e.target.checked)}
                className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Genel Tercihler & Görünüm */}
      {activeSubTab === 'preferences' && (
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

          {/* Connection & WebSocket Info */}
          <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Laptop className="w-4 h-4 text-indigo-500" />
              <span>Gerçek Zamanlı Akış Durumu</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cihaz telemetrisi ve alarm bildirimlerinin anlık WebSocket durumu.
            </p>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">WebSocket Durumu:</span>
                <span className={`font-bold ${isConnected ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {isConnected ? 'Aktif Bağlı' : 'Bağlantı Bekleniyor'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Sunucu Gecikmesi (Latency):</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{wsLatency} ms</span>
              </div>
            </div>
          </div>

          {/* Platform Identity & Domain Card */}
          <div className="md:col-span-2 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl border border-indigo-500/20 p-6 shadow-md text-white flex flex-col sm:flex-row items-center justify-between gap-4">
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
    </div>
  );
};
