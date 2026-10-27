import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  Phone,
  Mail,
  Smartphone,
  MessageSquare,
  Save,
  CheckCircle2,
  Shield,
  Info,
} from 'lucide-react';
import type { User } from '../../types';

interface ContactPreferencesProps {
  userProfile: Partial<User>;
  loadingAction: string | null;
  onSaveProfile: (profile: {
    phone: string;
    notificationEmail: string;
    whatsappNumber: string;
    telegramChatId: string;
  }) => Promise<void>;
}

export const ContactPreferences: React.FC<ContactPreferencesProps> = ({
  userProfile,
  loadingAction,
  onSaveProfile,
}) => {
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [telegram, setTelegram] = useState('');

  useEffect(() => {
    if (userProfile) {
      setPhone(userProfile.phone || '');
      setEmail(userProfile.notificationEmail || userProfile.email || '');
      setWhatsapp(userProfile.whatsappNumber || userProfile.phone || '');
      setTelegram(userProfile.telegramChatId || '');
    }
  }, [userProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveProfile({
      phone,
      notificationEmail: email,
      whatsappNumber: whatsapp,
      telegramChatId: telegram,
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Kişisel Bildirim & İletişim Tercihleri
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Saha alarmları ve acil durum uyarılarının doğrudan şahsınıza ulaşması için iletişim adreslerinizi güncelleyin.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* E-posta */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Alarm Bildirim E-posta Adresi
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                placeholder="ornek@alanadi.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          {/* WhatsApp Numarası */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              WhatsApp Numarası (Ülke Koduyla)
            </label>
            <div className="relative">
              <Smartphone className="w-4 h-4 text-emerald-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="tel"
                placeholder="+905321234567"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          {/* Telefon (SMS) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              SMS Telefon Numarası
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-amber-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="tel"
                placeholder="+905321234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
          </div>

          {/* Telegram Chat ID */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Telegram Chat ID
            </label>
            <div className="relative">
              <MessageSquare className="w-4 h-4 text-sky-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Örn: 129837465"
                value={telegram}
                onChange={(e) => setTelegram(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Telegram botunuza <code>/start</code> yazdıktan sonra size verilen kullanıcı ID numaranızdır.
            </p>
          </div>

          <div className="flex justify-end pt-3">
            <button
              type="submit"
              disabled={loadingAction === 'profile'}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              {loadingAction === 'profile' ? (
                <span>Kaydediliyor...</span>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>İletişim Tercihlerini Kaydet</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
