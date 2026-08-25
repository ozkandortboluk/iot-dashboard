import React, { useState } from 'react';
import {
  X,
  User,
  Building2,
  Mail,
  Phone,
  MessageCircle,
  KeyRound,
  ShieldCheck,
  Ban,
  CheckCircle2,
  Cpu,
  Trash2,
  Download,
  AlertTriangle
} from 'lucide-react';
import type { User as UserType } from '../types';
import { useRealtime } from '../context/RealtimeContext';

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
  const { devices, customersList } = useRealtime();
  const [activeTab, setActiveTab] = useState<'info' | 'devices' | 'security'>('info');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [formData, setFormData] = useState({
    name: customer.name,
    companyName: customer.companyName || '',
    email: customer.email,
    phone: customer.phone || '',
    whatsappNumber: customer.whatsappNumber || '',
  });

  const assignedDevices = devices.filter((d) => d.tenantId === customer.id);

  const handleUpdateInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/tenants/${customer.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(formData)
      });
      if (!res.ok) {
        const data = await res.json();
        if (data.details) {
          throw new Error(data.details.map((d: any) => d.message).join(", "));
        }
        throw new Error(data.error || "Güncelleme başarısız");
      }
      setSuccessMsg('Müşteri bilgileri başarıyla güncellendi.');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (status: 'active' | 'suspended') => {
    try {
      const res = await fetch(`/api/admin/tenants/${customer.id}/suspend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ status })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      setSuccessMsg(`Hesap ${status === 'active' ? 'aktifleştirildi' : 'donduruldu'}.`);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleResetPassword = async () => {
    try {
      const res = await fetch(`/api/admin/tenants/${customer.id}/reset-password`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Parola sıfırlama başarısız.');
      setSuccessMsg('Parola sıfırlama bağlantısı gönderildi.');
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleTerminateSessions = async () => {
    try {
      const res = await fetch(`/api/admin/tenants/${customer.id}/terminate-sessions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Oturumlar sonlandırılamadı.');
      setSuccessMsg('Tüm aktif oturumlar sonlandırıldı.');
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-800/20">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500 font-bold text-xl">
              {customer.companyName ? customer.companyName[0] : customer.name[0]}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                {customer.companyName || customer.name}
                {customer.status === 'suspended' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20 uppercase tracking-wider">
                    Askıda
                  </span>
                )}
              </h2>
              <p className="text-sm text-slate-500">{customer.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 space-x-6 border-b border-slate-100 dark:border-slate-800/60 overflow-x-auto shrink-0">
          {[
            { id: 'info', label: 'Genel Bilgiler', icon: User },
            { id: 'devices', label: `Cihazlar (${assignedDevices.length})`, icon: Cpu },
            { id: 'security', label: 'Güvenlik', icon: ShieldCheck },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setActiveTab(t.id as any);
                setSuccessMsg('');
                setErrorMsg('');
              }}
              className={`flex items-center gap-2 py-4 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === t.id
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 dark:bg-[#0b1120]">
          {successMsg && (
            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-sm flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}
          {errorMsg && (
            <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl text-sm flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {activeTab === 'info' && (
            <form onSubmit={handleUpdateInfo} className="space-y-6 max-w-2xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-400" />
                    Yetkili Adı Soyadı
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    Firma / Kurum Adı
                  </label>
                  <input
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-slate-400" />
                    E-posta (Değiştirilemez)
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    disabled
                    className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-500 cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Phone className="w-4 h-4 text-slate-400" />
                    Telefon
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-slate-400" />
                    WhatsApp
                  </label>
                  <input
                    type="text"
                    value={formData.whatsappNumber}
                    onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-white"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'devices' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Atanmış Cihazlar</h3>
                  <p className="text-sm text-slate-500">Müşteriye zimmetlenmiş donanım ve sensörler.</p>
                </div>
                <button
                  onClick={() => onNavigateToDevices(customer.id)}
                  className="px-4 py-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl text-sm font-semibold hover:bg-indigo-500/20 transition-colors"
                >
                  Cihaz Yönetimine Git
                </button>
              </div>

              {assignedDevices.length === 0 ? (
                <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <Cpu className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-500">Bu müşteriye henüz atanmış cihaz bulunmuyor.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {assignedDevices.map((dev) => (
                    <div key={dev.id} className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                          <Cpu className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-slate-900 dark:text-white">{dev.name}</p>
                          <p className="text-xs text-slate-500 font-mono">{dev.id}</p>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${
                        dev.status === 'online' ? 'bg-emerald-500/10 text-emerald-500' :
                        dev.status === 'offline' ? 'bg-slate-100 dark:bg-slate-800 text-slate-500' :
                        'bg-amber-500/10 text-amber-500'
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
            <div className="space-y-6 max-w-2xl">
              <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
                <div className="flex items-start justify-between">
                  <div className="flex gap-4">
                    <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl shrink-0">
                      <KeyRound className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white">Parola Sıfırlama</h4>
                      <p className="text-sm text-slate-500 mt-1">Müşteriye e-posta üzerinden güvenli parola sıfırlama bağlantısı gönderir.</p>
                    </div>
                  </div>
                  <button
                    onClick={handleResetPassword}
                    className="px-4 py-2 border border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 font-semibold text-xs rounded-xl transition-colors shrink-0"
                  >
                    Bağlantı Gönder
                  </button>
                </div>
              </div>

              <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
                <div className="flex items-start justify-between">
                  <div className="flex gap-4">
                    <div className="p-2.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
                      <Ban className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white">Oturumları Sonlandır</h4>
                      <p className="text-sm text-slate-500 mt-1">Müşterinin tüm cihazlardaki açık oturumlarını sonlandırır ve çıkış yapmasını sağlar.</p>
                    </div>
                  </div>
                  <button
                    onClick={handleTerminateSessions}
                    className="px-4 py-2 border border-amber-200 dark:border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 font-semibold text-xs rounded-xl transition-colors shrink-0"
                  >
                    Oturumları Kapat
                  </button>
                </div>
              </div>

              <div className="p-5 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-500/30 rounded-2xl">
                <div className="flex items-start justify-between">
                  <div className="flex gap-4">
                    <div className="p-2.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl shrink-0">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white">
                        Hesap Durumu: {customer.status === 'suspended' ? 'Askıda' : 'Aktif'}
                      </h4>
                      <p className="text-sm text-slate-500 mt-1">
                        Hesabı dondurursanız müşteri sisteme giriş yapamaz, ancak verileri silinmez.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleStatusChange(customer.status === 'suspended' ? 'active' : 'suspended')}
                    className={`px-4 py-2 font-semibold text-xs rounded-xl transition-colors shrink-0 ${
                      customer.status === 'suspended'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                        : 'bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20'
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
