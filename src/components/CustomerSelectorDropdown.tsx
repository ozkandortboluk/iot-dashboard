import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  ChevronDown,
  Search,
  Check,
  Globe,
  X,
  Building2,
  Cpu,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CustomerAvatar } from './CustomerAvatar';

interface CustomerOption {
  id: string;
  name: string;
  email?: string;
  companyName?: string;
  phone?: string;
  status?: string;
  deviceCount?: number;
}

interface CustomerSelectorDropdownProps {
  customers: CustomerOption[];
  selectedCustomerId: string;
  onSelectCustomer: (customerId: string) => void;
  totalDevicesCount?: number;
}

export const CustomerSelectorDropdown: React.FC<CustomerSelectorDropdownProps> = ({
  customers,
  selectedCustomerId,
  onSelectCustomer,
  totalDevicesCount,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const query = searchQuery.toLocaleLowerCase('tr-TR');
    return customers.filter((c) => {
      const company = (c.companyName || '').toLocaleLowerCase('tr-TR');
      const name = (c.name || '').toLocaleLowerCase('tr-TR');
      const email = (c.email || '').toLocaleLowerCase('tr-TR');
      const id = (c.id || '').toLocaleLowerCase('tr-TR');
      return company.includes(query) || name.includes(query) || email.includes(query) || id.includes(query);
    });
  }, [customers, searchQuery]);

  const selectedCustomer = useMemo(() => {
    if (selectedCustomerId === 'all') return null;
    return customers.find((c) => c.id === selectedCustomerId) || null;
  }, [customers, selectedCustomerId]);

  const handleSelect = (id: string) => {
    onSelectCustomer(id);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 xs:gap-2 px-2 py-1.5 xs:px-2.5 xs:py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-sm ${
          isOpen
            ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-400 dark:border-indigo-500 text-indigo-900 dark:text-indigo-200 ring-2 ring-indigo-500/20'
            : selectedCustomerId !== 'all'
            ? 'bg-white dark:bg-slate-900 border-indigo-300 dark:border-indigo-500/40 text-slate-900 dark:text-slate-100 hover:border-indigo-400 dark:hover:border-indigo-400'
            : 'bg-slate-100/90 dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-600'
        }`}
        title={
          selectedCustomer
            ? `Seçili Müşteri: ${selectedCustomer.companyName || selectedCustomer.name}`
            : 'Tüm Müşteriler (Filtresiz Saha Görünümü)'
        }
      >
        {/* Avatar */}
        {selectedCustomer ? (
          <CustomerAvatar
            companyName={selectedCustomer.companyName}
            name={selectedCustomer.name}
            size="xs"
          />
        ) : (
          <CustomerAvatar isGlobal size="xs" />
        )}

        {/* Selected Label */}
        <span className="truncate max-w-[85px] xs:max-w-[115px] sm:max-w-[150px] md:max-w-[180px] font-bold">
          {selectedCustomer ? selectedCustomer.companyName || selectedCustomer.name : 'Tüm Müşteriler'}
        </span>

        {/* Chevron */}
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : ''
          }`}
        />
      </button>

      {/* Dropdown Popover */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute left-0 mt-1.5 w-72 sm:w-80 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 shadow-2xl z-50 overflow-hidden flex flex-col max-h-[420px]"
          >
            {/* Popover Header with Search */}
            <div className="p-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 absolute left-3 text-slate-400 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Müşteri, şirket veya e-posta ara..."
                  className="w-full pl-8 pr-7 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Quick Option: All Customers */}
            <div className="p-1.5 border-b border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => handleSelect('all')}
                className={`w-full flex items-center justify-between p-2 rounded-xl text-xs font-semibold transition-colors group cursor-pointer ${
                  selectedCustomerId === 'all'
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <CustomerAvatar isGlobal size="sm" />
                  <div className="text-left min-w-0">
                    <p className="font-bold truncate text-xs">Tüm Müşteriler (Global)</p>
                    <p className="text-[10px] text-slate-400 truncate">Filtreleme yok, tüm saha cihazları</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {totalDevicesCount !== undefined && (
                    <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-mono font-bold">
                      {totalDevicesCount} Cihaz
                    </span>
                  )}
                  {selectedCustomerId === 'all' && (
                    <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  )}
                </div>
              </button>
            </div>

            {/* Customer List */}
            <div className="overflow-y-auto flex-1 p-1.5 space-y-1">
              <div className="px-2 py-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <span>Müşteriler ({filteredCustomers.length})</span>
                {selectedCustomerId !== 'all' && (
                  <button
                    onClick={() => handleSelect('all')}
                    className="text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                  >
                    Filtreyi Temizle
                  </button>
                )}
              </div>

              {filteredCustomers.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  <Building2 className="w-6 h-6 mx-auto mb-1 text-slate-300 dark:text-slate-600" />
                  <p>Aramanızla eşleşen müşteri bulunamadı.</p>
                </div>
              ) : (
                filteredCustomers.map((cust) => {
                  const isSelected = selectedCustomerId === cust.id;
                  const displayName = cust.companyName || cust.name || 'İsimsiz Müşteri';
                  const secondaryInfo = cust.email || cust.id;

                  return (
                    <button
                      key={cust.id}
                      type="button"
                      onClick={() => handleSelect(cust.id)}
                      className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-all group cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800/40 shadow-sm'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CustomerAvatar
                          companyName={cust.companyName}
                          name={cust.name}
                          size="sm"
                        />
                        <div className="text-left min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-bold truncate text-xs text-slate-900 dark:text-slate-100">
                              {displayName}
                            </p>
                            {cust.status === 'suspended' && (
                              <span className="px-1 py-0.2 rounded bg-rose-500/10 text-rose-500 text-[9px] font-bold">
                                Askıda
                              </span>
                            )}
                          </div>
                          {secondaryInfo && (
                            <p className="text-[10px] text-slate-400 truncate mt-0.5">
                              {secondaryInfo}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {cust.deviceCount !== undefined && (
                          <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-mono font-medium">
                            {cust.deviceCount} Cihaz
                          </span>
                        )}
                        {isSelected && (
                          <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer Summary */}
            <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3 text-slate-400" />
                Toplam {customers.length} müşteri kayıtlı
              </span>
              <span className="text-[9px] text-slate-400">
                Esc ile kapat
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
