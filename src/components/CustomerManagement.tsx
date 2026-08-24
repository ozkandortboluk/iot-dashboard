import React, { useState } from 'react';
import {
  Users, UserPlus, Building2, Cpu, Trash2, KeyRound, ShieldCheck, 
  Search, ExternalLink, CheckCircle2, AlertCircle, Eye, Download, Settings, Edit3
} from 'lucide-react';
import { useRealtime } from '../context/RealtimeContext';
import { useAuth } from '../context/AuthContext';
import type { User } from '../types';
import { CustomerDetailsModal } from './CustomerDetailsModal';

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
  const [detailsModalCustomer, setDetailsModalCustomer] = useState<User | null>(null);

  const filteredCustomers = customersList.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.companyName && c.companyName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleExportCSV = () => {
    const headers = ["ID", "Firma", "Yetkili", "E-posta", "Rol", "Durum", "Kayıt Tarihi"];
    const rows = filteredCustomers.map(c => [
      c.id,
      c.companyName || "-",
      c.name,
      c.email,
      c.role,
      c.status === "suspended" ? "Askida" : "Aktif",
      new Date(c.created_at).toLocaleDateString()
    ]);
    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.map(cell => `"${cell}"`).join(","))
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `musteriler_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

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

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-semibold rounded-2xl text-xs shadow-sm transition-colors shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">CSV İndir</span>
          </button>
          
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-2xl text-xs shadow-xl shadow-indigo-600/30 transition-all shrink-0 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Yeni Müşteri Ekle</span>
          </button>
        </div>
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
            className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium cursor-pointer"
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
              Müşterilerinizi yönetin, ayrıntılarını görüntüleyin ve sistem yapılandırmalarını düzenleyin.
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
                <th className="py-3 px-4 text-right">İşlemler</th>
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
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 uppercase tracking-wider">Askıda</span>
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
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                            title="Bu müşterinin paneline ve cihaz verilerine geçiş yap"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{isSelected ? 'İzleniyor' : 'Panel'}</span>
                          </button>

                          <button
                            onClick={() => setDetailsModalCustomer(cust)}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <Settings className="w-3.5 h-3.5" />
                            <span>Yönet</span>
                          </button>
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

      {detailsModalCustomer && (
        <CustomerDetailsModal
          customer={detailsModalCustomer}
          onClose={() => setDetailsModalCustomer(null)}
          onNavigateToDevices={(id) => {
            setSelectedCustomerForAdmin(id);
            setDetailsModalCustomer(null);
            onNavigateToDevices();
          }}
        />
      )}

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-6 md:p-8 w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-500" />
                Yeni Müşteri Ekle
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="mb-6 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 ml-1">Firma / Kurum Adı</label>
                <input
                  type="text"
                  value={newCust.companyName}
                  onChange={(e) => setNewCust({ ...newCust, companyName: e.target.value })}
                  placeholder="Örn: Acme A.Ş."
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 ml-1">Yetkili Adı Soyadı</label>
                <input
                  type="text"
                  required
                  value={newCust.name}
                  onChange={(e) => setNewCust({ ...newCust, name: e.target.value })}
                  placeholder="Örn: Ahmet Yılmaz"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 ml-1">E-posta (Giriş Adresi)</label>
                <input
                  type="email"
                  required
                  value={newCust.email}
                  onChange={(e) => setNewCust({ ...newCust, email: e.target.value })}
                  placeholder="ornek@firma.com"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 ml-1">Giriş Şifresi</label>
                <input
                  type="password"
                  required
                  value={newCust.password}
                  onChange={(e) => setNewCust({ ...newCust, password: e.target.value })}
                  placeholder="En az 6 karakter"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 ml-1">Hesap Türü (Rol)</label>
                <select
                  value={newCust.role}
                  onChange={(e) => setNewCust({ ...newCust, role: e.target.value as any })}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-white"
                >
                  <option value="customer">Müşteri (Sadece kendi cihazlarını görür)</option>
                  <option value="admin">Sistem Yöneticisi (Tüm sisteme erişir)</option>
                </select>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {isSubmitting ? 'Oluşturuluyor...' : 'Hesabı Oluştur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
