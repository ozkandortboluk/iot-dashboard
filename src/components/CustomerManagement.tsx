import React, { useState, useRef, useEffect } from 'react';
import {
  Users, UserPlus, Building2, Cpu, Trash2, KeyRound, ShieldCheck, 
  Search, ExternalLink, CheckCircle2, AlertCircle, Eye, Download, Settings, Edit3, X, SlidersHorizontal, Filter, RotateCcw, Check
} from 'lucide-react';
import { useRealtime } from '../context/RealtimeContext';
import { useAuth } from '../context/AuthContext';
import type { User } from '../types';
import { CustomerDetailsModal } from './CustomerDetailsModal';
import { CustomerAvatar } from './CustomerAvatar';
import { BulkAdvancedCustomerDeleteModal } from './admin/BulkAdvancedCustomerDeleteModal';
import { apiFetch as fetch } from '../lib/apiFetch';

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
    notifications,
    refreshCustomers,
  } = useRealtime();
  const { user } = useAuth();

  const [searchTerm, setSearchTerm] = useState(() => localStorage.getItem('nexus_customers_search') || '');
  const [roleFilter, setRoleFilter] = useState<string>(() => localStorage.getItem('nexus_customers_role') || 'all');
  const [statusFilter, setStatusFilter] = useState<string>(() => localStorage.getItem('nexus_customers_status') || 'all');
  const [deviceFilter, setDeviceFilter] = useState<string>(() => localStorage.getItem('nexus_customers_device') || 'all');
  const [alarmFilter, setAlarmFilter] = useState<string>(() => localStorage.getItem('nexus_customers_alarm') || 'all');
  const [sortBy, setSortBy] = useState<string>(() => localStorage.getItem('nexus_customers_sort') || 'newest');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('nexus_customers_search', searchTerm);
    localStorage.setItem('nexus_customers_role', roleFilter);
    localStorage.setItem('nexus_customers_status', statusFilter);
    localStorage.setItem('nexus_customers_device', deviceFilter);
    localStorage.setItem('nexus_customers_alarm', alarmFilter);
    localStorage.setItem('nexus_customers_sort', sortBy);
  }, [searchTerm, roleFilter, statusFilter, deviceFilter, alarmFilter, sortBy]);

  // Close filter dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setShowFilterDropdown(false);
      }
    };
    if (showFilterDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFilterDropdown]);

  const activeFilterCount = (roleFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (deviceFilter !== 'all' ? 1 : 0) + (alarmFilter !== 'all' ? 1 : 0) + (sortBy !== 'newest' ? 1 : 0);

  const resetFilters = () => {
    setRoleFilter('all');
    setStatusFilter('all');
    setDeviceFilter('all');
    setAlarmFilter('all');
    setSortBy('newest');
  };

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
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());
  const [showBulkAdvancedDelete, setShowBulkAdvancedDelete] = useState(false);

  const filteredCustomers = [...customersList].filter(
    (c) => {
      const matchSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (c.companyName && c.companyName.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchRole = roleFilter === 'all' || c.role === roleFilter;
      const matchStatus = statusFilter === 'all' || (c.status || 'active') === statusFilter;
      
      let matchDevice = true;
      if (deviceFilter !== 'all') {
        const customerDevices = devices.filter(d => d.tenantId === c.id);
        if (deviceFilter === 'has_devices') matchDevice = customerDevices.length > 0;
        else if (deviceFilter === 'no_devices') matchDevice = customerDevices.length === 0;
        else if (deviceFilter === 'has_offline') matchDevice = customerDevices.some(d => d.status === 'offline');
        else if (deviceFilter === 'has_critical') matchDevice = customerDevices.some(d => d.status === 'warning');
        else if (deviceFilter === 'has_simulated') matchDevice = customerDevices.some(d => d.isSimulated);
      }

      let matchAlarm = true;
      if (alarmFilter !== 'all') {
        const customerNotifs = notifications.filter(n => n.tenantId === c.id && !n.read);
        if (alarmFilter === 'has_alarms') matchAlarm = customerNotifs.length > 0;
        else if (alarmFilter === 'has_critical_alarms') matchAlarm = customerNotifs.some(n => n.severity === 'critical');
      }
      
      return matchSearch && matchRole && matchStatus && matchDevice && matchAlarm;
    }
  ).sort((a, b) => {
    // 1. Admin / Merkez Yönetim her zaman listenin en üstünde yer alır
    const isAAdmin = a.role === 'admin' || a.id === 'usr_admin' || a.id === 'admin';
    const isBAdmin = b.role === 'admin' || b.id === 'usr_admin' || b.id === 'admin';
    if (isAAdmin && !isBAdmin) return -1;
    if (!isAAdmin && isBAdmin) return 1;

    if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (sortBy === 'nameAsc') return a.name.localeCompare(b.name);
    if (sortBy === 'nameDesc') return b.name.localeCompare(a.name);
    return 0;
  });

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

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCustomerIds(new Set(filteredCustomers.map(c => c.id)));
    } else {
      setSelectedCustomerIds(new Set());
    }
  };

  const toggleCustomerSelection = (id: string) => {
    const newSet = new Set(selectedCustomerIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedCustomerIds(newSet);
  };

  const selectedCustomers = customersList.filter(c => selectedCustomerIds.has(c.id));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    const name = newCust.name.trim();
    const email = newCust.email.trim().toLowerCase();
    const password = newCust.password;
    const companyName = newCust.companyName.trim();

    if (!name || !email || !password) {
      setErrorMsg('Lütfen ad, e-posta ve şifre alanlarını doldurun.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Şifre en az 6 karakter olmalıdır.');
      return;
    }

    setIsSubmitting(true);
    try {
      await createNewCustomer({
        name,
        email,
        password,
        companyName: companyName || name,
        role: newCust.role,
      });
      setSuccessMsg(`"${companyName || name}" müşteri hesabı başarıyla oluşturuldu.`);
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
    <div className="space-y-4 md:space-y-5 text-slate-900 dark:text-slate-100">
      {/* Customer Quick Status & Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
        <div className="bg-white dark:bg-[#0f172a] px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Toplam Müşteri</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 hidden sm:block">Kayıtlı hesaplar</p>
          </div>
          <span className="text-lg sm:text-xl font-extrabold text-indigo-600 dark:text-indigo-400 font-mono">
            {customersList.filter((u) => u.role === 'customer').length}
          </span>
        </div>

        <div className="bg-white dark:bg-[#0f172a] px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Atanmış Cihaz</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 hidden sm:block">Müşteri / Toplam</p>
          </div>
          <span className="text-lg sm:text-xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
            {devices.filter((d) => d.tenantId !== 'usr_admin').length} / {devices.length}
          </span>
        </div>

        <div className="bg-white dark:bg-[#0f172a] px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shadow-xs">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">İzleme Modu</p>
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate" title={selectedCustomerForAdmin === 'all' ? 'Genel Görünüm' : customersList.find((c) => c.id === selectedCustomerForAdmin)?.companyName || selectedCustomerForAdmin}>
              {selectedCustomerForAdmin === 'all'
                ? '🌐 Genel Görünüm'
                : customersList.find((c) => c.id === selectedCustomerForAdmin)?.companyName || selectedCustomerForAdmin}
            </p>
          </div>
          {selectedCustomerForAdmin !== 'all' && (
            <button
              onClick={() => setSelectedCustomerForAdmin('all')}
              className="text-[10px] px-2 py-1 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-md border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 font-medium cursor-pointer shrink-0"
            >
              Sıfırla
            </button>
          )}
        </div>
      </div>

      {/* Alert Messages */}
      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Customer List Section */}
      <div className="bg-white dark:bg-[#0f172a] rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4 shadow-sm dark:shadow-none">
        <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3.5 pb-3.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white whitespace-nowrap">
                  Müşteri Listesi & Firma Hesapları
                </h3>
              </div>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full shrink-0">
                {filteredCustomers.length} Müşteri
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Müşterilerinizi yönetin, hesap ayrıntılarını ve atanan saha cihazlarını inceleyin.
            </p>
          </div>

          {/* Bulk Action Header */}
          {selectedCustomerIds.size > 0 && (
            <div className="bg-rose-50/80 dark:bg-rose-500/10 border-b border-rose-100 dark:border-rose-500/20 px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs font-semibold">{selectedCustomerIds.size} müşteri seçildi</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedCustomerIds(new Set())}
                  className="px-3 py-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  Seçimi Temizle
                </button>
                <button
                  onClick={() => setShowBulkAdvancedDelete(true)}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Seçilenleri Sil (Gelişmiş)</span>
                </button>
              </div>
            </div>
          )}

          {/* Action Tools: Adaptive Search with Integrated Filter Icon, CSV, Add Customer */}
          <div className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5 w-full xl:w-auto xl:max-w-2xl ${selectedCustomerIds.size > 0 ? 'mt-4' : ''}`}>
            {/* Search Input with Integrated Filter Button & Popover */}
            <div className="relative flex-1 min-w-[200px] w-full sm:w-72 md:w-80 xl:w-96 transition-all duration-200" ref={filterMenuRef}>
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Müşteri, yetkili veya e-posta ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-9 ${searchTerm ? 'pr-16' : 'pr-10'} py-2 bg-slate-50 dark:bg-slate-900 border ${
                  activeFilterCount > 0
                    ? 'border-indigo-500/60 dark:border-indigo-500/60 ring-1 ring-indigo-500/20'
                    : 'border-slate-200 dark:border-slate-800'
                } rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all`}
              />

              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
                    title="Aramayı Temizle"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Filter Icon Button Inside Search Input */}
                <button
                  type="button"
                  onClick={() => setShowFilterDropdown((prev) => !prev)}
                  className={`relative p-1.5 rounded-lg text-xs transition-all cursor-pointer flex items-center justify-center ${
                    showFilterDropdown
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : activeFilterCount > 0
                      ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 font-semibold'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/80'
                  }`}
                  title={activeFilterCount > 0 ? `${activeFilterCount} aktif filtre uygulandı - Tıkla ve düzenle` : 'Filtreleme ve Sıralama Seçenekleri'}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 bg-indigo-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Filter Popover Dropdown */}
              {showFilterDropdown && (
                <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white dark:bg-[#0f172a] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 z-50 space-y-3.5 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <SlidersHorizontal className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span className="text-xs font-bold text-slate-800 dark:text-white">
                        Filtreler & Sıralama
                      </span>
                      {activeFilterCount > 0 && (
                        <span className="px-1.5 py-0.2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold rounded-full">
                          {activeFilterCount} Aktif
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {activeFilterCount > 0 && (
                        <button
                          type="button"
                          onClick={resetFilters}
                          className="text-[10px] font-medium text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Filtreleri sıfırla"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Sıfırla</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowFilterDropdown(false)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Role Filter */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      Kullanıcı Rolü
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'all', label: 'Tüm Roller' },
                        { id: 'admin', label: 'Yönetici' },
                        { id: 'operator', label: 'Operatör' },
                        { id: 'customer', label: 'Müşteri' },
                      ].map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setRoleFilter(r.id)}
                          className={`text-xs py-1.5 px-2.5 rounded-lg border text-left font-medium transition-all flex items-center justify-between cursor-pointer ${
                            roleFilter === r.id
                              ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-600 dark:text-indigo-400 shadow-2xs font-semibold'
                              : 'bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span>{r.label}</span>
                          {roleFilter === r.id && <Check className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Status Filter */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      Hesap Durumu
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'all', label: 'Tümü' },
                        { id: 'active', label: 'Aktif' },
                        { id: 'suspended', label: 'Askıda' },
                      ].map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setStatusFilter(s.id)}
                          className={`text-xs py-1.5 px-2 rounded-lg border text-center font-medium transition-all cursor-pointer ${
                            statusFilter === s.id
                              ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-600 dark:text-indigo-400 shadow-2xs font-semibold'
                              : 'bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Device Status Filter */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      Cihaz Durumu (Operasyonel)
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'all', label: 'Tümü' },
                        { id: 'has_devices', label: 'Cihazı Olanlar' },
                        { id: 'no_devices', label: 'Cihazı Olmayanlar' },
                        { id: 'has_offline', label: 'Çevrimdışı Cihazı Olanlar' },
                        { id: 'has_critical', label: 'Kritik / Hatalı Cihazlılar' },
                        { id: 'has_simulated', label: 'Sanal Cihazlılar' },
                      ].map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setDeviceFilter(s.id)}
                          className={`text-[10px] py-1.5 px-2 rounded-lg border text-center font-medium transition-all cursor-pointer ${
                            deviceFilter === s.id
                              ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-600 dark:text-indigo-400 shadow-2xs font-semibold'
                              : 'bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Alarm Filter */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      Aktif Alarmlar (Okunmamış)
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'all', label: 'Tümü' },
                        { id: 'has_alarms', label: 'Alarm Var' },
                        { id: 'has_critical_alarms', label: 'Kritik Alarmlar' },
                      ].map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setAlarmFilter(s.id)}
                          className={`text-[10px] py-1.5 px-1.5 rounded-lg border text-center font-medium transition-all cursor-pointer ${
                            alarmFilter === s.id
                              ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-500 text-rose-600 dark:text-rose-400 shadow-2xs font-semibold'
                              : 'bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sort By */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      Sıralama Ölçütü
                    </label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="w-full text-xs font-medium bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-200 transition-all cursor-pointer"
                    >
                      <option value="newest">En Yeni Katılanlar (Varsayılan)</option>
                      <option value="oldest">En Eski Katılanlar</option>
                      <option value="nameAsc">İsim (A-Z)</option>
                      <option value="nameDesc">İsim (Z-A)</option>
                    </select>
                  </div>

                  {/* Footer status */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                    <span>{filteredCustomers.length} müşteri listeleniyor</span>
                    <button
                      type="button"
                      onClick={() => setShowFilterDropdown(false)}
                      className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
                    >
                      Uygula
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* CSV Button */}
              <button
                onClick={handleExportCSV}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-semibold rounded-xl text-xs shadow-xs transition-colors cursor-pointer whitespace-nowrap"
                title="Müşteri listesini CSV formatında dışa aktar"
              >
                <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span className="hidden sm:inline">CSV İndir</span>
              </button>

              {/* New Customer Button */}
              <button
                onClick={() => setShowAddModal(true)}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs shadow-md shadow-indigo-600/25 transition-all cursor-pointer active:scale-95 whitespace-nowrap"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Yeni Müşteri Ekle</span>
              </button>
            </div>
          </div>
        </div>

        {/* Active Filter Badges Bar (shown only when filters are active) */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs py-1 px-0.5">
            <span className="text-[11px] text-slate-400 dark:text-slate-400 flex items-center gap-1 mr-1">
              <Filter className="w-3 h-3 text-indigo-500" />
              <span>Aktif Filtreler:</span>
            </span>

            {roleFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                <span>Rol: {roleFilter === 'admin' ? 'Yönetici' : roleFilter === 'operator' ? 'Operatör' : 'Müşteri'}</span>
                <button type="button" onClick={() => setRoleFilter('all')} className="hover:text-indigo-800 dark:hover:text-indigo-200 cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {statusFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                <span>Durum: {statusFilter === 'active' ? 'Aktif' : 'Askıda'}</span>
                <button type="button" onClick={() => setStatusFilter('all')} className="hover:text-indigo-800 dark:hover:text-indigo-200 cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {sortBy !== 'newest' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                <span>Sıralama: {sortBy === 'oldest' ? 'En Eski' : sortBy === 'nameAsc' ? 'A-Z' : 'Z-A'}</span>
                <button type="button" onClick={() => setSortBy('newest')} className="hover:text-indigo-800 dark:hover:text-indigo-200 cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {deviceFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                <span>Cihaz: {
                  deviceFilter === 'has_devices' ? 'Cihazlılar' :
                  deviceFilter === 'no_devices' ? 'Cihazsızlar' :
                  deviceFilter === 'has_offline' ? 'Çevrimdışı Var' :
                  deviceFilter === 'has_critical' ? 'Kritik Cihaz Var' :
                  deviceFilter === 'has_simulated' ? 'Sanal Cihazlılar' : deviceFilter
                }</span>
                <button type="button" onClick={() => setDeviceFilter('all')} className="hover:text-indigo-800 dark:hover:text-indigo-200 cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {alarmFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                <span>Alarm: {alarmFilter === 'has_alarms' ? 'Aktif' : 'Kritik'}</span>
                <button type="button" onClick={() => setAlarmFilter('all')} className="hover:text-rose-800 dark:hover:text-rose-200 cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={resetFilters}
              className="text-[10px] text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 underline ml-1 cursor-pointer transition-colors"
            >
              Hepsini Temizle
            </button>
          </div>
        )}

        {/* Customer Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider">
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-indigo-600 focus:ring-indigo-500/20 cursor-pointer"
                    checked={filteredCustomers.length > 0 && selectedCustomerIds.size === filteredCustomers.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </th>
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
                  const isSelectedForDashboard = selectedCustomerForAdmin === cust.id;
                  const isSelected = selectedCustomerIds.has(cust.id);

                  return (
                    <tr
                      key={cust.id}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                        isSelectedForDashboard ? 'bg-indigo-50/70 dark:bg-indigo-500/10 border-l-2 border-indigo-500' : ''
                      } ${isSelected ? 'bg-indigo-50/30 dark:bg-indigo-500/5' : ''}`}
                    >
                      <td className="py-4 px-4 w-10">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-indigo-600 focus:ring-indigo-500/20 cursor-pointer"
                          checked={isSelected}
                          onChange={() => toggleCustomerSelection(cust.id)}
                        />
                      </td>
                      <td className="py-4 px-4 font-medium text-slate-800 dark:text-slate-200">
                        <div className="flex items-center gap-3">
                          <CustomerAvatar
                            companyName={cust.companyName}
                            name={cust.name}
                            size="md"
                          />
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                              {cust.companyName || cust.name}
                              {cust.status === 'suspended' && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 uppercase tracking-wider">Askıda</span>
                              )}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">{cust.name}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4 text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                        {cust.email}
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            cust.role === 'admin'
                              ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/20'
                              : cust.role === 'customer'
                              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {cust.role === 'admin' ? 'Sistem Yöneticisi' : 'Müşteri'}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-center">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700/60 rounded-lg text-xs font-semibold">
                          <Cpu className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
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
                                ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30'
                                : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                            }`}
                            title="Bu müşterinin paneline ve cihaz verilerine geçiş yap"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{isSelected ? 'İzleniyor' : 'Panel'}</span>
                          </button>

                          <button
                            onClick={() => setDetailsModalCustomer(cust)}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
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
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
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
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
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
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
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
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
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

      {showBulkAdvancedDelete && (
        <BulkAdvancedCustomerDeleteModal
          customers={selectedCustomers}
          onClose={() => setShowBulkAdvancedDelete(false)}
          onConfirm={async (options) => {
            const res = await fetch(`/api/admin/tenants/bulk-advanced-delete`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tenantIds: Array.from(selectedCustomerIds),
                ...options
              })
            });
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || 'Toplu silme başarısız oldu');
            
            setSelectedCustomerIds(new Set());
            refreshCustomers();
          }}
        />
      )}
    </div>
  );
};
