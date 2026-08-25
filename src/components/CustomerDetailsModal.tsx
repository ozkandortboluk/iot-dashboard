import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Building2,
  Mail,
  Phone,
  MessageSquare,
  Send,
  KeyRound,
  ShieldCheck,
  Ban,
  CheckCircle2,
  Cpu,
  Trash2,
  Download,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import type { User as UserType } from '../types';
import { useRealtime } from '../context/RealtimeContext';
import { apiFetch as fetch } from '../lib/apiFetch';

interface CustomerDetailsModalProps {
  customer: UserType;
  onClose: () => void;
  onNavigateToDevices: (customerId: string) => void;
}

export const CustomerDetailsModal: React.FC<CustomerDetailsModalProps> = ({
  customer,
  onClose,
  onNavigateToDevices,
}) => {
  const { devices } = useRealtime();
  const [activeTab, setActiveTab] = useState<'info' | 'devices' | 'security'>('info');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [formData, setFormData] = useState({
    name: customer.name || '',
    companyName: customer.companyName || '',
    email: customer.email || '',
    phone: customer.phone || '',
    whatsappNumber: customer.whatsappNumber || '',
    notificationEmail: customer.notificationEmail || '',
    telegramChatId: customer.telegramChatId || '',
  });

  // Veritabanından en güncel müşteri iletişim ve profil verilerini çek
  useEffect(() => {
    let isMounted = true;
    const fetchLatestCustomer = async () => {
      setIsLoading(true);
      try {
        const token = localStorage.getItem('dashboard_token');
        const res = await fetch(`/api/admin/tenants/${customer.id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data) {
            setFormData({
              name: data.name || customer.name || '',
              companyName: data.companyName || customer.companyName || '',
              email: data.email || customer.email || '',
              phone: data.phone || customer.phone || '',
              whatsappNumber: data.whatsappNumber || customer.whatsappNumber || '',
              notificationEmail: data.notificationEmail || customer.notificationEmail || '',
              telegramChatId: data.telegramChatId || customer.telegramChatId || '',
            });
          }
        }
      } catch {
        // Sessiz hata - prop verisi ile devam et
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchLatestCustomer();
    return () => {
      isMounted = false;
    };
  }, [customer.id]);

  const assignedDevices = devices.filter((d) => d.tenantId === customer.id);

  const handleUpdateInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('dashboard_token');
      const res = await fetch(`/api/admin/tenants/${customer.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          companyName: formData.companyName.trim(),
          phone: formData.phone.trim(),
          whatsappNumber: formData.whatsappNumber.trim(),
          notificationEmail: formData.notificationEmail.trim(),
          telegramChatId: formData.telegramChatId.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.details) {
          throw new Error(data.details.map((d: any) => d.message).join(', '));
        }
        throw new Error(data.error || 'Güncelleme başarısız');
      }

      setSuccessMsg('Müşteri profil ve iletişim bilgileri başarıyla veritabanına kaydedildi.');
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Kayıt sırasında bir hata meydana geldi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (status: 'active' | 'suspended') => {
    try {
      const token = localStorage.getItem('dashboard_token');
      const res = await fetch(`/api/admin/tenants/${customer.id}/suspend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      setSuccessMsg(`Hesap ${status === 'active' ? 'aktifleştirildi' : 'donduruldu'}.`);
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleResetPassword = async () => {
    try {
      const token = localStorage.getItem('dashboard_token');
      const res = await fetch(`/api/admin/tenants/${customer.id}/reset-password`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Parola sıfırlama başarısız.');
      setSuccessMsg('Parola sıfırlama bağlantısı gönderildi.');
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleTerminateSessions = async () => {
    try {
      const token = localStorage.getItem('dashboard_token');
      const res = await fetch(`/api/admin/tenants/${customer.id}/terminate-sessions`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Oturumlar sonlandırılamadı.');
      setSuccessMsg('Tüm aktif oturumlar sonlandırıldı.');
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800/60 bg-slate-50/70 dark:bg-slate-800/20">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xl">
              {formData.companyName ? formData.companyName[0].toUpperCase() : formData.name ? formData.name[0].toUpperCase() : 'M'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  {formData.companyName || formData.name || 'Müşteri Detayı'}
                </h2>
                {customer.status === 'suspended' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 uppercase tracking-wider">
                    Askıda
                  </span>
                )}
                {isLoading && (
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                )}
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 font-mono">{customer.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 space-x-6 border-b border-slate-200 dark:border-slate-800/60 overflow-x-auto shrink-0 bg-white dark:bg-slate-900">
          {[
            { id: 'info', label: 'Profil & İletişim', icon: User },
            { id: 'devices', label: `Cihazlar (${assignedDevices.length})`, icon: Cpu },
            { id: 'security', label: 'Güvenlik & Oturum', icon: ShieldCheck },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setActiveTab(t.id as any);
                setSuccessMsg('');
                setErrorMsg('');
              }}
              className={`flex items-center gap-2 py-4 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === t.id
                  ? 'border-indigo-600 dark:border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/60 dark:bg-[#0b1120]">
          {successMsg && (
            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-sm flex items-center gap-3 animate-fadeIn">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}
          {errorMsg && (
            <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl text-sm flex items-center gap-3 animate-fadeIn">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {activeTab === 'info' && (
            <form onSubmit={handleUpdateInfo} className="space-y-6 max-w-2xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    Yetkili Adı Soyadı *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    Firma / Kurum Adı
                  </label>
                  <input
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    placeholder="Örn: Atlas Lojistik"
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    Giriş E-posta Adresi (Değiştirilemez)
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    disabled
                    className="w-full px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-600 dark:text-slate-400 cursor-not-allowed font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                    Alarm Bildirim E-postası
                  </label>
                  <input
                    type="email"
                    value={formData.notificationEmail}
                    onChange={(e) => setFormData({ ...formData, notificationEmail: e.target.value })}
                    placeholder={formData.email || 'alarm@sirket.com'}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    Telefon / GSM (SMS)
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+90 532 000 0000"
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
                    WhatsApp Numarası
                  </label>
                  <input
                    type="text"
                    value={formData.whatsappNumber}
                    onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
                    placeholder="905320000000"
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Send className="w-3.5 h-3.5 text-sky-500" />
                    Telegram Chat ID / Kullanıcı Adı
                  </label>
                  <input
                    type="text"
                    value={formData.telegramChatId}
                    onChange={(e) => setFormData({ ...formData, telegramChatId: e.target.value })}
                    placeholder="@kullanici veya 12345678"
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-md shadow-indigo-600/20"
                >
                  {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSubmitting ? 'Kaydediliyor...' : 'Değişiklikleri Veritabanına Kaydet'}</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'devices' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Atanmış Cihazlar</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Müşteriye zimmetlenmiş donanım ve sensörler.</p>
                </div>
                <button
                  onClick={() => onNavigateToDevices(customer.id)}
                  className="px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 rounded-xl text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors cursor-pointer"
                >
                  Cihaz Yönetimine Git
                </button>
              </div>

              {assignedDevices.length === 0 ? (
                <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <Cpu className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">Bu müşteriye henüz atanmış cihaz bulunmuyor.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {assignedDevices.map((dev) => (
                    <div key={dev.id} className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between shadow-xs">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                          <Cpu className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-xs text-slate-900 dark:text-white">{dev.name}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{dev.id}</p>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        dev.status === 'online' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20' :
                        dev.status === 'offline' ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700' :
                        'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20'
                      }`}>
                        {dev.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-5 max-w-2xl text-xs">
              <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-3.5">
                    <div className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-100 dark:border-indigo-500/20 shrink-0">
                      <KeyRound className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white">Parola Sıfırlama</h4>
                      <p className="text-slate-600 dark:text-slate-400 mt-0.5">Müşteriye e-posta üzerinden güvenli parola sıfırlama bağlantısı gönderir.</p>
                    </div>
                  </div>
                  <button
                    onClick={handleResetPassword}
                    className="px-3.5 py-2 border border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 font-semibold rounded-xl transition-colors shrink-0 cursor-pointer"
                  >
                    Bağlantı Gönder
                  </button>
                </div>
              </div>

              <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-3.5">
                    <div className="p-2.5 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl border border-amber-100 dark:border-amber-500/20 shrink-0">
                      <Ban className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white">Oturumları Sonlandır</h4>
                      <p className="text-slate-600 dark:text-slate-400 mt-0.5">Müşterinin tüm cihazlardaki açık oturumlarını sonlandırır ve çıkış yapmasını sağlar.</p>
                    </div>
                  </div>
                  <button
                    onClick={handleTerminateSessions}
                    className="px-3.5 py-2 border border-amber-200 dark:border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 font-semibold rounded-xl transition-colors shrink-0 cursor-pointer"
                  >
                    Oturumları Kapat
                  </button>
                </div>
              </div>

              <div className="p-5 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-500/30 rounded-2xl shadow-xs">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-3.5">
                    <div className="p-2.5 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl border border-rose-100 dark:border-rose-500/20 shrink-0">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white">
                        Hesap Durumu: {customer.status === 'suspended' ? 'Askıda' : 'Aktif'}
                      </h4>
                      <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                        Hesabı dondurursanız müşteri sisteme giriş yapamaz, ancak verileri silinmez.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleStatusChange(customer.status === 'suspended' ? 'active' : 'suspended')}
                    className={`px-3.5 py-2 font-semibold rounded-xl transition-colors shrink-0 cursor-pointer ${
                      customer.status === 'suspended'
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/30'
                        : 'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20'
                    }`}
                  >
                    {customer.status === 'suspended' ? 'Hesabı Aktifleştir' : 'Hesabı Dondur'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
