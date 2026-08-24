import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Building2,
  Cpu,
  Trash2,
  KeyRound,
  ShieldCheck,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { useRealtime } from '../context/RealtimeContext';
import { useAuth } from '../context/AuthContext';
import type { User } from '../types';

interface CustomerManagementProps {
  onSelectCustomerForDashboard: (customerId: string) => void;
  onNavigateToDevices: () => void;
}

export const CustomerManagement: React.FC<CustomerManagementProps> = ({
  onSelectCustomerForDashboard,
  onNavigateToDevices,
}) => {
  const {
    customersList,
    createNewCustomer,
    deleteCustomer,
    devices,
    setSelectedCustomerForAdmin,
    selectedCustomerForAdmin,
  } = useRealtime();
  const { user } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCust, setNewCust] = useState({
    name: '',
    companyName: '',
    email: '',
    password: '',
    role: 'customer' as User['role'],
  });
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; customer: User | null; dependencies: any; confirmText: string; isLoading: boolean }>({ open: false, customer: null, dependencies: null, confirmText: '', isLoading: false });

  const filteredCustomers = customersList.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.companyName && c.companyName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    if (!newCust.name || !newCust.email || !newCust.password) {
      setErrorMsg('Lütfen ad, e-posta ve şifre alanlarını doldurun.');
      return;
    }

    setIsSubmitting(true);
    try {
      await createNewCustomer({
        name: newCust.name,
        email: newCust.email,
        password: newCust.password,
        companyName: newCust.companyName || newCust.name,
        role: newCust.role,
      });
      setSuccessMsg(`"${newCust.companyName || newCust.name}" müşteri hesabı başarıyla oluşturuldu.`);
      setNewCust({ name: '', companyName: '', email: '', password: '', role: 'customer' });
      setShowAddModal(false);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Hesap oluşturma hatası.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCustomerDeviceCount = (customerId: string) => {
    return devices.filter((d) => d.tenantId === customerId).length;
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center space-y-4">
        <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto border border-rose-500/20">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white">Yetkisiz Erişim</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Müşteri oluşturma, düzenleme ve silme işlemleri yalnızca <strong>Sistem Yöneticisi (Admin)</strong> rolüne aittir.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto text-slate-900 dark:text-slate-100">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-indigo-50 via-slate-100 to-slate-100 dark:from-indigo-950/60 dark:via-slate-900 dark:to-slate-900 p-6 rounded-3xl border border-indigo-200 dark:border-indigo-500/20 shadow-lg dark:shadow-2xl">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-semibold rounded-full">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Sadece Yönetici Yetkisi</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Müşteri & Cihaz Erişim Yönetimi</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
            Tüm müşterilerinizi listeleyin, her müşteri için özel giriş hesabı ve yetkilendirmeler tanımlayın. Müşteri seçerek cihazlarını ve dashboard ekranlarını canlı olarak inceleyin.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-2xl text-xs shadow-xl shadow-indigo-600/30 transition-all shrink-0 cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Yeni Müşteri Ekle</span>
        </button>
      </div>

      {/* Alert Messages */}
      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-2xl text-xs flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Customer Selection Quick Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#0f172a] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm dark:shadow-none">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Toplam Müşteri</p>
          <p className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">
            {customersList.filter((u) => u.role === 'customer').length}
          </p>
          <p className="text-[11px] text-slate-500">Kayıtlı kurum ve müşteri hesapları</p>
        </div>

        <div className="bg-white dark:bg-[#0f172a] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm dark:shadow-none">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Atanmış Cihaz Sayısı</p>
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {devices.filter((d) => d.tenantId !== 'usr_admin').length} / {devices.length}
          </p>
          <p className="text-[11px] text-slate-500">Müşterilere zimmetlenmiş sensör/sayaçlar</p>
        </div>

        <div className="bg-white dark:bg-[#0f172a] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm dark:shadow-none">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Seçili İzleme Modu</p>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
            {selectedCustomerForAdmin === 'all'
              ? '🌐 Genel Görünüm (Tüm Cihazlar)'
              : customersList.find((c) => c.id === selectedCustomerForAdmin)?.companyName || selectedCustomerForAdmin}
          </p>
          <button
            onClick={() => setSelectedCustomerForAdmin('all')}
            className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
          >
            Tüm Müşterilere Dön
          </button>
        </div>
      </div>

      {/* Customer List Header & Search */}
      <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-6 shadow-sm dark:shadow-none">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Müşteri Listesi & Firma Hesapları
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Her Müşterinin kullanıcı adı ve şifresi ile sadece kendi verilerini gördüğü güvenli izolasyon katmanı.
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Müşteri veya e-posta ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Customer Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider">
                <th className="py-3 px-4">Firma / Müşteri</th>
                <th className="py-3 px-4">E-posta (Kullanıcı Adı)</th>
                <th className="py-3 px-4">Rol</th>
                <th className="py-3 px-4 text-center">Atanan Cihazlar</th>
                <th className="py-3 px-4 text-right">Aksiyonlar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    Aramanızla eşleşen müşteri bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((cust) => {
                  const devCount = getCustomerDeviceCount(cust.id);
                  const isSelected = selectedCustomerForAdmin === cust.id;

                  return (
                    <tr
                      key={cust.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isSelected ? 'bg-indigo-500/10 border-l-2 border-indigo-500' : ''
                      }`}
                    >
                      <td className="py-4 px-4 font-medium text-slate-200">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-sm">
                            {cust.companyName ? cust.companyName[0] : cust.name[0]}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-100 flex items-center gap-2">
                              {cust.companyName || cust.name}
                              {cust.status === 'suspended' && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 uppercase">Askıda</span>
                              )}
                            </p>
                            <p className="text-[11px] text-slate-400">{cust.name}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4 text-slate-300 font-mono text-[11px]">
                        {cust.email}
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            cust.role === 'admin'
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                              : cust.role === 'customer'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {cust.role === 'admin' ? 'Sistem Yöneticisi' : 'Müşteri'}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-center">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-800 text-slate-200 rounded-lg text-xs font-semibold">
                          <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                          <span>{devCount} Cihaz</span>
                        </span>
                      </td>

                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setSelectedCustomerForAdmin(cust.id);
                              onSelectCustomerForDashboard(cust.id);
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                              isSelected
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                            }`}
                            title="Bu müşterinin paneline ve cihaz verilerine geçiş yap"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{isSelected ? 'İzleniyor' : 'Paneli İncele'}</span>
                          </button>

                          {cust.role !== 'admin' && cust.status !== 'suspended' && (
                            <button
                              onClick={async () => {
                                setDeleteDialog({ open: true, customer: cust, dependencies: null, confirmText: '', isLoading: true });
                                try {
                                  const res = await fetch(`/api/customers/${cust.id}?check_dependencies=true`, {
                                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                                  });
                                  const data = await res.json();
                                  setDeleteDialog(prev => ({ ...prev, dependencies: data.dependencies, isLoading: false }));
                                } catch (e) {
                                  setDeleteDialog(prev => ({ ...prev, isLoading: false }));
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                              title="Müşteriyi Sil"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteDialog.open && deleteDialog.customer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f172a] rounded-3xl border border-rose-800/50 p-6 md:p-8 w-full max-w-md shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-rose-500 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Müşteri Hesabını Askıya Al
              </h3>
              <button onClick={() => setDeleteDialog({ open: false, customer: null, dependencies: null, confirmText: '', isLoading: false })} className="text-slate-400 hover:text-white text-lg font-bold">✕</button>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm text-slate-300">
                <strong className="text-white">{deleteDialog.customer.companyName || deleteDialog.customer.name}</strong> müşterisini silmek (askıya almak) üzeresiniz.
              </p>
              
              {deleteDialog.isLoading ? (
                <div className="p-4 bg-slate-800/50 rounded-xl text-center text-sm text-slate-400">Bağımlılıklar kontrol ediliyor...</div>
              ) : (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-sm text-rose-200">
                  <p className="font-semibold mb-2">Bu müşteriye ait şu varlıklar da etkilenecektir:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>{deleteDialog.dependencies?.devices || 0} adet cihaz askıya alınacak</li>
                    <li>Aktif oturumları kapatılacak</li>
                  </ul>
                  <p className="mt-3 text-xs opacity-80">Geçmiş telemetri, alarm ve denetim kayıtları sistemde (askıya alınmış şekilde) korunacaktır.</p>
                </div>
              )}

              <div className="space-y-2 pt-2">
                <label className="text-xs font-semibold text-slate-400">İşlemi onaylamak için firmanın adını yazın: <span className="text-white">{deleteDialog.customer.companyName || deleteDialog.customer.name}</span></label>
                <input
                  type="text"
                  value={deleteDialog.confirmText}
                  onChange={(e) => setDeleteDialog({ ...deleteDialog, confirmText: e.target.value })}
                  className="w-full bg-[#1e293b] border border-slate-700 text-white rounded-xl px-4 py-2.5 outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all text-sm"
                  placeholder="Firma adını buraya yazın"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button onClick={() => setDeleteDialog({ open: false, customer: null, dependencies: null, confirmText: '', isLoading: false })} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-300 hover:bg-slate-800 transition-colors">
                İptal
              </button>
              <button
                disabled={deleteDialog.confirmText !== (deleteDialog.customer.companyName || deleteDialog.customer.name)}
                onClick={async () => {
                  await deleteCustomer(deleteDialog.customer!.id);
                  setDeleteDialog({ open: false, customer: null, dependencies: null, confirmText: '', isLoading: false });
                }}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Evet, Askıya Al
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f172a] rounded-3xl border border-slate-800 p-6 md:p-8 w-full max-w-md shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                Yeni Müşteri Kaydı
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Firma / Kurum Adı
                </label>
                <input
                  type="text"
                  placeholder="ör. ABC Lojistik A.Ş."
                  value={newCust.companyName}
                  onChange={(e) => setNewCust({ ...newCust, companyName: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Yetkili Kişi Adı Soyadı *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ör. Ahmet Yılmaz"
                  value={newCust.name}
                  onChange={(e) => setNewCust({ ...newCust, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Kullanıcı Adı / Giriş E-postası *
                </label>
                <input
                  type="email"
                  required
                  placeholder="ör. musteri@abclojistik.com"
                  value={newCust.email}
                  onChange={(e) => setNewCust({ ...newCust, email: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Giriş Şifresi *
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={newCust.password}
                  onChange={(e) => setNewCust({ ...newCust, password: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Rol & Yetki Seviyesi
                </label>
                <select
                  value={newCust.role}
                  onChange={(e) => setNewCust({ ...newCust, role: e.target.value as User['role'] })}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="customer">Müşteri (Sadece Kendi Cihazları ve Dashboard'u)</option>
                  <option value="operator">Saha Operatörü</option>
                  <option value="admin">Sistem Yöneticisi (Full Admin)</option>
                </select>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-medium hover:bg-slate-700"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                >
                  {isSubmitting ? 'Kaydediliyor...' : 'Müşteriyi Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
