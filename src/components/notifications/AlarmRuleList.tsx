import React, { useState, useEffect } from 'react';
import { useUserPreference } from '../../hooks/useUserPreference';
import {
  Sliders,
  Plus,
  Edit3,
  Trash2,
  Bell,
  Clock,
  Smartphone,
  Mail,
  MessageSquare,
  Globe,
  Search,
  Check,
  X,
  Flame,
  AlertTriangle,
  Info,
  Shield,
  Activity,
  User as UserIcon,
  CheckSquare,
  Square,
  RefreshCw,
} from 'lucide-react';
import type { ThresholdRule, Device, Customer, NotificationChannel } from '../../types';
import { METRIC_DICTIONARY } from './types';
import { BulkDeleteModal } from '../common/BulkDeleteModal';

interface AlarmRuleListProps {
  rules: ThresholdRule[];
  devices: Device[];
  customersList?: Customer[];
  currentUserRole?: string;
  onOpenNewRule: () => void;
  onEditRule: (rule: ThresholdRule) => void;
  onDelete?: (ruleId: string) => Promise<void>;
  onRequestDeleteRule?: (rule: ThresholdRule) => void;
  onToggleRule: (ruleId: string, enabled: boolean) => Promise<void>;
  onBulkDelete?: (ruleIds: string[]) => Promise<void>;
  onBulkDeleteRules?: (ruleIds: string[]) => Promise<void>;
}

export const AlarmRuleList: React.FC<AlarmRuleListProps> = ({
  rules,
  devices,
  customersList = [],
  currentUserRole,
  onOpenNewRule,
  onEditRule,
  onDelete,
  onRequestDeleteRule,
  onToggleRule,
  onBulkDelete,
  onBulkDeleteRules,
}) => {
  const effectiveBulkDelete = onBulkDelete || onBulkDeleteRules;

  // Filters with Database & User Persistence
  const [searchTerm, setSearchTerm] = useUserPreference<string>('rules_filter_search', '');
  const [selectedDeviceFilter, setSelectedDeviceFilter] = useUserPreference<string>('rules_filter_device', 'all');
  const [selectedSeverityFilter, setSelectedSeverityFilter] = useUserPreference<string>('rules_filter_severity', 'all');

  // Bulk Selection States
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Single Delete State
  const [ruleToDelete, setRuleToDelete] = useState<ThresholdRule | null>(null);
  const [isSingleDeleting, setIsSingleDeleting] = useState(false);

  const filteredRules = rules.filter((r) => {
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchesMetric = r.metricKey?.toLowerCase().includes(q);
      const matchesMsg = r.messageTemplate?.toLowerCase().includes(q);
      const matchesDev = r.deviceId?.toLowerCase().includes(q);
      if (!matchesMetric && !matchesMsg && !matchesDev) return false;
    }
    if (selectedDeviceFilter !== 'all' && r.deviceId !== selectedDeviceFilter) {
      return false;
    }
    if (selectedSeverityFilter !== 'all' && r.severity !== selectedSeverityFilter) {
      return false;
    }
    return true;
  });

  const handleToggleSelectRule = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedRuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedRuleIds.size === filteredRules.length && filteredRules.length > 0) {
      setSelectedRuleIds(new Set());
    } else {
      setSelectedRuleIds(new Set(filteredRules.map((r) => r.id)));
    }
  };

  const handleConfirmBulkDelete = async () => {
    if (!effectiveBulkDelete || selectedRuleIds.size === 0) return;
    setIsBulkDeleting(true);
    try {
      await effectiveBulkDelete(Array.from(selectedRuleIds));
      setSelectedRuleIds(new Set());
      setShowBulkDeleteModal(false);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleConfirmSingleDelete = async () => {
    if (!ruleToDelete) return;
    setIsSingleDeleting(true);
    try {
      if (onDelete) {
        await onDelete(ruleToDelete.id);
      } else if (onRequestDeleteRule) {
        onRequestDeleteRule(ruleToDelete);
      }
      setRuleToDelete(null);
    } finally {
      setIsSingleDeleting(false);
    }
  };

  const selectedRulesList = filteredRules.filter((r) => selectedRuleIds.has(r.id));
  const selectedRulePreviews = selectedRulesList.map((r) => `${r.metricKey} ${r.operator} ${r.thresholdValue} (${r.deviceId === 'all' ? 'Global' : r.deviceId})`);

  const getChannelIcon = (ch: NotificationChannel) => {
    switch (ch) {
      case 'whatsapp':
        return <Smartphone className="w-3.5 h-3.5 text-emerald-500" title="WhatsApp" />;
      case 'telegram':
        return <MessageSquare className="w-3.5 h-3.5 text-sky-500" title="Telegram" />;
      case 'email':
        return <Mail className="w-3.5 h-3.5 text-indigo-500" title="E-posta" />;
      case 'sms':
        return <Smartphone className="w-3.5 h-3.5 text-amber-500" title="SMS" />;
      case 'webhook':
        return <Globe className="w-3.5 h-3.5 text-purple-500" title="Webhook" />;
      default:
        return <Bell className="w-3.5 h-3.5 text-slate-500" title="Web / Uygulama" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20">
            <Flame className="w-3 h-3 text-rose-500" />
            <span>Kritik</span>
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
            <AlertTriangle className="w-3 h-3 text-amber-500" />
            <span>Uyarı</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20">
            <Info className="w-3 h-3 text-blue-500" />
            <span>Bilgi</span>
          </span>
        );
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      {/* Header Bar */}
      <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Eşik ve Alarm Kuralları</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {filteredRules.length} Kural
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Saha telemetrisi için tetikleyici koşullar, bekleme süreleri ve çok kanallı bildirim hedefleri.
              </p>
            </div>
          </div>

          <button
            onClick={onOpenNewRule}
            className="flex items-center justify-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs shadow-md shadow-indigo-600/20 transition-all cursor-pointer active:scale-95 self-stretch sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Alarm Kuralı Ekle</span>
          </button>
        </div>

        {/* Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Metrik, cihaz veya mesaj ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div>
            <select
              value={selectedDeviceFilter}
              onChange={(e) => setSelectedDeviceFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              <option value="all">Tüm Cihazlar</option>
              <option value="all_global">Global Kurallar (Tüm Cihazlar)</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedSeverityFilter}
              onChange={(e) => setSelectedSeverityFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              <option value="all">Tüm Önem Seviyeleri</option>
              <option value="critical">Kritik Kurallar</option>
              <option value="warning">Uyarı Kuralları</option>
              <option value="info">Bilgi Kuralları</option>
            </select>
          </div>
        </div>

        {/* Bulk Action Bar */}
        {selectedRuleIds.size > 0 && (
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/60 rounded-xl flex items-center justify-between flex-wrap gap-2.5 animate-in fade-in">
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-900 dark:text-indigo-200">
              <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>
                <strong>{selectedRuleIds.size}</strong> / {filteredRules.length} kural seçildi.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleSelectAll}
                className="px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:underline cursor-pointer"
              >
                {selectedRuleIds.size === filteredRules.length ? 'Seçimi Temizle' : 'Tümünü Seç'}
              </button>
              {effectiveBulkDelete && (
                <button
                  type="button"
                  onClick={() => setShowBulkDeleteModal(true)}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold shadow-md shadow-rose-600/20 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Seçilenleri Sil ({selectedRuleIds.size})</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Rules List / Table */}
      {filteredRules.length === 0 ? (
        <div className="py-12 px-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 mx-auto flex items-center justify-center mb-3">
            <Sliders className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">Henüz Kural Tanımlanmamış</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Saha sensörlerinizin sıcaklık, basınç, CPU ve voltaj değerlerini otomatik izlemek için 4 adımlı sihirbazla kural oluşturun.
          </p>
          <button
            onClick={onOpenNewRule}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>İlk Kuralı Oluştur</span>
          </button>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={filteredRules.length > 0 && selectedRuleIds.size === filteredRules.length}
                      onChange={handleToggleSelectAll}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 cursor-pointer"
                      title="Tümünü Seç / Kaldır"
                    />
                  </th>
                  <th className="py-3 px-3 w-12 text-center">Durum</th>
                  <th className="py-3 px-4">Koşul & Metrik</th>
                  <th className="py-3 px-4">Hedef Cihaz</th>
                  <th className="py-3 px-4">Bekleme / Histerezis</th>
                  <th className="py-3 px-4">Kanallar & Alıcılar</th>
                  <th className="py-3 px-4">Şablon Mesajı</th>
                  <th className="py-3 px-4 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredRules.map((rule, idx) => {
                  const targetDev = devices.find((d) => d.id === rule.deviceId);
                  const unit = METRIC_DICTIONARY[rule.metricKey?.toLowerCase()]?.unit || '';
                  const isChecked = selectedRuleIds.has(rule.id);

                  return (
                    <tr
                      key={`rule_desk_${rule.id}_${idx}`}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                        isChecked ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : !rule.enabled ? 'opacity-60 bg-slate-50/40 dark:bg-slate-900/40' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handleToggleSelectRule(rule.id, e as any)}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 cursor-pointer"
                        />
                      </td>

                      {/* Durum Toggle */}
                      <td className="py-3.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => onToggleRule(rule.id, !rule.enabled)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            rule.enabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                          }`}
                          title={rule.enabled ? 'Kuralı Devre Dışı Bırak' : 'Kuralı Aktif Et'}
                        >
                          <span
                            aria-hidden="true"
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              rule.enabled ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </td>

                      {/* Koşul & Metrik */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                          <span className="font-mono text-sm text-indigo-600 dark:text-indigo-400">
                            {rule.metricKey}
                          </span>
                          <span className="text-slate-500 font-semibold">{rule.operator}</span>
                          <span className="text-slate-900 dark:text-white font-extrabold text-sm">
                            {rule.thresholdValue}
                            {unit}
                          </span>
                        </div>
                        <div className="mt-1">{getSeverityBadge(rule.severity)}</div>
                      </td>

                      {/* Hedef Cihaz */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          {rule.deviceId === 'all' ? (
                            <span className="text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                              <Shield className="w-3.5 h-3.5" />
                              Tüm Cihazlar (Global)
                            </span>
                          ) : (
                            targetDev?.name || rule.deviceId
                          )}
                        </div>
                        {rule.deviceId !== 'all' && (
                          <div className="text-[11px] text-slate-400 font-mono">ID: {rule.deviceId}</div>
                        )}
                      </td>

                      {/* Bekleme / Histerezis */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        <div className="flex items-center gap-1 text-[11px]">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>İhlal: {rule.minBreachDurationSeconds ?? 0}s</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Histerezis: ±{rule.hysteresis ?? 0}
                          {unit}
                        </div>
                      </td>

                      {/* Kanallar */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1 flex-wrap">
                          {(rule.notificationChannels || ['app']).map((ch) => (
                            <span
                              key={ch}
                              className="p-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 inline-flex items-center justify-center"
                            >
                              {getChannelIcon(ch)}
                            </span>
                          ))}
                        </div>
                        {rule.recipients && rule.recipients.length > 0 && (
                          <div className="text-[10px] text-slate-400 mt-1 truncate max-w-xs">
                            {rule.recipients.join(', ')}
                          </div>
                        )}
                      </td>

                      {/* Şablon Mesajı */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2" title={rule.messageTemplate}>
                          {rule.messageTemplate || '-'}
                        </p>
                      </td>

                      {/* İşlemler */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => onEditRule(rule)}
                            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                            title="Düzenle"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setRuleToDelete(rule)}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 transition-colors cursor-pointer"
                            title="Kuralı Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View (lg altı) */}
          <div className="block lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {filteredRules.map((rule, idx) => {
              const targetDev = devices.find((d) => d.id === rule.deviceId);
              const unit = METRIC_DICTIONARY[rule.metricKey?.toLowerCase()]?.unit || '';
              const isChecked = selectedRuleIds.has(rule.id);

              return (
                <div
                  key={`rule_mob_${rule.id}_${idx}`}
                  className={`p-4 space-y-3 ${
                    isChecked
                      ? 'bg-indigo-50/40 dark:bg-indigo-950/20'
                      : !rule.enabled
                      ? 'opacity-60 bg-slate-50/40 dark:bg-slate-900/40'
                      : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => handleToggleSelectRule(rule.id, e as any)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 cursor-pointer"
                      />
                      <button
                        type="button"
                        onClick={() => onToggleRule(rule.id, !rule.enabled)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          rule.enabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            rule.enabled ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                      {getSeverityBadge(rule.severity)}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onEditRule(rule)}
                        className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        title="Düzenle"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setRuleToDelete(rule)}
                        className="p-1.5 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 cursor-pointer"
                        title="Kuralı Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span className="font-mono text-indigo-600 dark:text-indigo-400">{rule.metricKey}</span>
                      <span className="text-slate-500">{rule.operator}</span>
                      <span>
                        {rule.thresholdValue}
                        {unit}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Hedef:{' '}
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {rule.deviceId === 'all' ? 'Tüm Cihazlar (Global)' : targetDev?.name || rule.deviceId}
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1">
                    <p className="text-slate-700 dark:text-slate-300 line-clamp-2 italic">
                      "{rule.messageTemplate || '-'}"
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                      <span>İhlal: {rule.minBreachDurationSeconds ?? 0}s</span>
                      <div className="flex items-center gap-1">
                        {(rule.notificationChannels || ['app']).map((ch) => (
                          <span key={ch}>{getChannelIcon(ch)}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Single Rule Delete Modal */}
      {ruleToDelete && (
        <BulkDeleteModal
          isOpen={Boolean(ruleToDelete)}
          title="Alarm Kuralını Silme Onayı"
          itemCount={1}
          itemLabel="alarm kuralını"
          itemsPreview={[`${ruleToDelete.metricKey} ${ruleToDelete.operator} ${ruleToDelete.thresholdValue} (${ruleToDelete.deviceId === 'all' ? 'Global' : ruleToDelete.deviceId})`]}
          isDeleting={isSingleDeleting}
          onClose={() => setRuleToDelete(null)}
          onConfirm={handleConfirmSingleDelete}
          description={
            <p>
              <strong>"{ruleToDelete.metricKey} {ruleToDelete.operator} {ruleToDelete.thresholdValue}"</strong> kuralı kalıcı olarak silinecektir. Bu kurala bağlı telemetri kontrolü ve alarm tetikleme derhal sonlandırılacaktır.
            </p>
          }
        />
      )}

      {/* Bulk Delete Rules Modal */}
      <BulkDeleteModal
        isOpen={showBulkDeleteModal}
        title="Toplu Alarm Kuralı Silme Onayı"
        itemCount={selectedRuleIds.size}
        itemLabel="alarm kuralını"
        itemsPreview={selectedRulePreviews}
        isDeleting={isBulkDeleting}
        onClose={() => setShowBulkDeleteModal(false)}
        onConfirm={handleConfirmBulkDelete}
        description={
          <p>
            Seçilen <strong>{selectedRuleIds.size}</strong> adet alarm kuralı sistemden tamamen silinecektir. Silinen kurallar için telemetri eşik kontrolü ve otomatik bildirim gönderimi derhal durdurulacaktır.
          </p>
        }
      />
    </div>
  );
};

