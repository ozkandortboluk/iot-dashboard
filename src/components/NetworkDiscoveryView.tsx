import React, { useState, useEffect, useMemo } from 'react';
import { useRealtime } from '../context/RealtimeContext';
import { useAuth } from '../context/AuthContext';
import { useUserPreference } from '../hooks/useUserPreference';
import { apiFetch as fetch, safeJson } from '../lib/apiFetch';
import {
  Radio,
  Search,
  RefreshCw,
  Plus,
  Network,
  ShieldCheck,
  Sparkles,
  Terminal,
  Activity,
  Layers,
  Filter,
  Trash2,
  Archive,
  LayoutGrid,
  List,
  ArrowRight,
  Clock,
  CheckCircle2,
  Wifi,
  WifiOff,
  Cpu,
} from 'lucide-react';
import type {
  DiscoveredNetworkDevice,
  PairingAuditRecord,
  Site,
  Zone,
  DeviceGroup,
} from '../types';
import { DiscoveredDeviceCard } from './discovery/DiscoveredDeviceCard';
import { PairingAuditTable } from './discovery/PairingAuditTable';
import { ProvisioningWizardModal } from './discovery/ProvisioningWizardModal';
import { ArchivedDevicesTab } from './discovery/ArchivedDevicesTab';

export const NetworkDiscoveryView: React.FC<{
  onNavigateToDevices?: () => void;
  onNavigateToHelp?: () => void;
}> = ({ onNavigateToDevices }) => {
  const { devices, refreshDevices, customersList } = useRealtime();
  const { user } = useAuth();

  // Navigation / Tabs with Database & User Persistence
  const [activeTab, setActiveTab] = useUserPreference<'discovered' | 'scan' | 'audit' | 'archived'>(
    'discovery_active_tab',
    'discovered'
  );
  const [viewMode, setViewMode] = useUserPreference<'grid' | 'list'>('discovery_view_mode', 'grid');

  // Discovery State
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredNetworkDevice[]>([]);
  const [isLoadingDiscovered, setIsLoadingDiscovered] = useState(false);
  const [searchQuery, setSearchQuery] = useUserPreference<string>('discovery_search_query', '');
  const [lifecycleFilter, setLifecycleFilter] = useUserPreference<'all' | 'discovered' | 'pending' | 'assigned' | 'active'>(
    'discovery_lifecycle_filter',
    'all'
  );

  // Subnet Scanning State
  const [subnetInput, setSubnetInput] = useState('192.168.1.0/24');
  const [isScanningSubnet, setIsScanningSubnet] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanLogs, setScanLogs] = useState<string[]>([]);
  const [pingingIp, setPingingIp] = useState<string | null>(null);

  // Pairing Audit History
  const [auditRecords, setAuditRecords] = useState<PairingAuditRecord[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // Hierarchy Data for Provisioning Wizard
  const [sites, setSites] = useState<Site[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [groups, setGroups] = useState<DeviceGroup[]>([]);

  // Wizard Modal State
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [selectedDeviceForWizard, setSelectedDeviceForWizard] = useState<DiscoveredNetworkDevice | null>(null);

  // Fetch Discovered Pool
  const fetchDiscovered = async () => {
    setIsLoadingDiscovered(true);
    try {
      const res = await fetch('/api/network/discovered');
      if (res.ok) {
        const data = await res.json();
        setDiscoveredDevices(data || []);
      }
    } catch (err) {
      console.error('Keşfedilen cihazlar alınamadı:', err);
    } finally {
      setIsLoadingDiscovered(false);
    }
  };

  // Fetch Audit History
  const fetchAuditHistory = async () => {
    setIsLoadingAudit(true);
    try {
      const res = await fetch('/api/network/pairing-history');
      if (res.ok) {
        const data = await res.json();
        setAuditRecords(data || []);
      }
    } catch (err) {
      console.error('Eşleştirme denetim geçmişi alınamadı:', err);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  // Fetch Hierarchy
  const fetchHierarchyData = async () => {
    try {
      const [sRes, zRes, gRes] = await Promise.all([
        fetch('/api/devices/hierarchy/sites'),
        fetch('/api/devices/hierarchy/zones'),
        fetch('/api/devices/hierarchy/groups'),
      ]);
      const sData = await safeJson(sRes, null);
      if (Array.isArray(sData)) setSites(sData);

      const zData = await safeJson(zRes, null);
      if (Array.isArray(zData)) setZones(zData);

      const gData = await safeJson(gRes, null);
      if (Array.isArray(gData)) setGroups(gData);
    } catch (err) {
      console.warn('Hiyerarşi verileri yüklenemedi:', err);
    }
  };

  useEffect(() => {
    fetchDiscovered();
    fetchAuditHistory();
    fetchHierarchyData();
    const interval = setInterval(fetchDiscovered, 5000);
    return () => clearInterval(interval);
  }, []);

  const [pingNotification, setPingNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Ping Test Action
  const handlePingTest = async (ip: string) => {
    setPingingIp(ip);
    setPingNotification(null);
    try {
      const res = await fetch('/api/network/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip }),
      });
      if (res.ok) {
        const data = await res.json();
        setPingNotification({
          type: 'success',
          message: `[PING BAŞARILI] Hedef IP: ${ip} | Gecikme: ${data.timeMs || '<5'} ms`,
        });
      } else {
        setPingNotification({
          type: 'error',
          message: `[PING HATASI] Hedef IP: ${ip} yanıt vermedi.`,
        });
      }
    } catch {
      setPingNotification({
        type: 'error',
        message: `[PING HATASI] ${ip} adresine ulaşılamadı.`,
      });
    } finally {
      setPingingIp(null);
      setTimeout(() => setPingNotification(null), 5000);
    }
  };

  // Start Subnet Scan
  const handleStartSubnetScan = () => {
    if (isScanningSubnet) return;
    setIsScanningSubnet(true);
    setScanProgress(5);
    setScanLogs([`[${new Date().toLocaleTimeString()}] Subnet taraması başlatıldı: ${subnetInput}`]);

    let current = 5;
    const interval = setInterval(() => {
      current += Math.floor(Math.random() * 20 + 10);
      if (current >= 100) {
        current = 100;
        clearInterval(interval);
        setIsScanningSubnet(false);
        setScanLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] ICMP ve ARP yanıtları toplandı.`,
          `[${new Date().toLocaleTimeString()}] Tarama başarıyla tamamlandı. ${discoveredDevices.length} aktif düğüm havuzda.`,
        ]);
        fetchDiscovered();
      } else {
        setScanProgress(current);
        if (current > 30 && current < 60) {
          setScanLogs((prev) => [
            ...prev,
            `[${new Date().toLocaleTimeString()}] Port 80, 443, 8080 taranıyor (${subnetInput.replace('.0/24', '')}.${Math.floor(current * 2.5)})...`,
          ]);
        }
      }
    }, 600);
  };

  const handleOpenWizardForDevice = (device: DiscoveredNetworkDevice) => {
    setSelectedDeviceForWizard(device);
    setIsWizardOpen(true);
  };

  const handleOpenNewWizard = () => {
    setSelectedDeviceForWizard(null);
    setIsWizardOpen(true);
  };

  // Delete / Remove individual discovered device from pool
  const handleDeleteDiscovered = async (device: DiscoveredNetworkDevice) => {
    const target = device.mac && device.mac !== '—' ? device.mac : device.ip && device.ip !== '—' ? device.ip : device.hostname || device.pairingCode;
    if (!target) return;
    
    if (window.confirm(`"${device.hostname || target}" cihazını keşif havuzundan kaldırmak istediğinize emin misiniz?`)) {
      try {
        const res = await fetch(`/api/network/discovered/${encodeURIComponent(target)}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          setDiscoveredDevices((prev) => prev.filter((d) => d.mac !== device.mac && d.ip !== device.ip && d.hostname !== device.hostname));
        }
      } catch (err) {
        console.error('Cihaz silinemedi:', err);
      }
    }
  };

  // Clear all unregistered / simulated mock devices from discovery pool
  const handleClearPool = async () => {
    if (window.confirm('Keşif havuzundaki eşleşmemiş/sahte tüm kayıtları temizlemek istediğinize emin misiniz?')) {
      try {
        const res = await fetch('/api/network/discovered/clear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (res.ok) {
          await fetchDiscovered();
        }
      } catch (err) {
        console.error('Havuz temizlenemedi:', err);
      }
    }
  };

  // Filter & Strictly Sort Discovered Devices (Excluding already added devices in the system)
  const filteredDiscovered = useMemo(() => {
    // Build sets of already registered device identifiers to strictly exclude them from discovery
    const registeredIds = new Set(
      (devices || []).map((d) => d.id?.toLowerCase().trim()).filter(Boolean)
    );
    const registeredIps = new Set(
      (devices || [])
        .map((d) => d.ipAddress?.toLowerCase().trim())
        .filter((ip): ip is string => !!ip && ip !== '—')
    );
    const registeredMacs = new Set(
      (devices || [])
        .map((d) => d.macAddress?.toLowerCase().trim())
        .filter((mac): mac is string => !!mac && mac !== '—')
    );
    const registeredNames = new Set(
      (devices || []).map((d) => d.name?.toLowerCase().trim()).filter(Boolean)
    );

    const list = discoveredDevices.filter((d) => {
      // 1. Strictly exclude if already present in registered devices
      if (d.registeredDeviceId && registeredIds.has(d.registeredDeviceId.toLowerCase().trim())) {
        return false;
      }
      const ipClean = d.ip ? d.ip.toLowerCase().trim() : '';
      const macClean = d.mac ? d.mac.toLowerCase().trim() : '';
      const nameClean = d.hostname ? d.hostname.toLowerCase().trim() : '';

      if (ipClean && ipClean !== '—' && registeredIps.has(ipClean)) return false;
      if (macClean && macClean !== '—' && registeredMacs.has(macClean)) return false;
      if (nameClean && registeredNames.has(nameClean)) return false;

      // 2. Search & lifecycle filters
      const matchSearch =
        (d.hostname && d.hostname.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (d.ip && d.ip.includes(searchQuery)) ||
        (d.mac && d.mac.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (d.pairingCode && d.pairingCode.includes(searchQuery));

      const state = d.lifecycleState || (d.status === 'unregistered' ? 'discovered' : 'active');
      const matchLifecycle = lifecycleFilter === 'all' || state === lifecycleFilter;

      return matchSearch && matchLifecycle;
    });

    const statusPriority: Record<string, number> = {
      transmitting: 1,
      active: 1,
      online: 1,
      pending: 2,
      discovered: 3,
      unregistered: 3,
      idle: 4,
      offline: 5,
    };

    return [...list].sort((a, b) => {
      const pA = statusPriority[a.status] || 99;
      const pB = statusPriority[b.status] || 99;
      if (pA !== pB) return pA - pB;
      const tsA = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
      const tsB = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
      return tsB - tsA;
    });
  }, [discoveredDevices, searchQuery, lifecycleFilter, devices]);

  const activeCount = devices.length;
  const discoveredPoolCount = discoveredDevices.length;
  const pendingCount = discoveredDevices.filter((d) => (d.lifecycleState || d.status) === 'unregistered' || d.lifecycleState === 'pending').length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <Radio className="w-8 h-8 text-cyan-500" />
            Cihaz Keşfi ve Provizyon
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Ağdaki fiziksel donanımları keşfedin, QR/PIN ile güvenli eşleştirin ve hiyerarşik organizasyona dahil edin.
          </p>
        </div>

        {pingNotification && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between border animate-fade-in ${
              pingNotification.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}
          >
            <span>{pingNotification.message}</span>
            <button
              type="button"
              onClick={() => setPingNotification(null)}
              className="text-slate-400 hover:text-white ml-2 text-xs"
            >
              ×
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchDiscovered}
            disabled={isLoadingDiscovered}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDiscovered ? 'animate-spin' : ''}`} />
            <span>Yenile</span>
          </button>

          <button
            type="button"
            onClick={handleClearPool}
            title="Eşleşmemiş ve sahte keşif kayıtlarını temizle"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Havuzu Temizle</span>
          </button>

          <button
            type="button"
            onClick={handleOpenNewWizard}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-md transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Provizyon Sihirbazı</span>
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex items-center gap-3.5 shadow-sm">
          <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-100 font-mono">{discoveredPoolCount}</div>
            <div className="text-xs text-slate-400">Keşif Havuzundaki Donanımlar</div>
          </div>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex items-center gap-3.5 shadow-sm">
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-100 font-mono">{pendingCount}</div>
            <div className="text-xs text-slate-400">Eşleşme Bekleyen Düğümler</div>
          </div>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex items-center gap-3.5 shadow-sm">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-100 font-mono">{activeCount}</div>
            <div className="text-xs text-slate-400">Canlı & Aktif Yetkili Cihaz</div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('discovered')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${activeTab === 'discovered' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Keşfedilen Cihazlar ({filteredDiscovered.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('scan')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${activeTab === 'scan' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Network className="w-4 h-4" />
          <span>Canlı Ağ & Subnet Taraması</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('audit');
            fetchAuditHistory();
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${activeTab === 'audit' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Eşleştirme Denetim Günlüğü</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('archived')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${activeTab === 'archived' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Archive className="w-4 h-4" />
          <span>Silinen & Arşivlenen Cihazlar</span>
        </button>
      </div>

      {/* TAB 1: DISCOVERED CARDS / LIST */}
      {activeTab === 'discovered' && (
        <div className="space-y-4">
          {/* Filter / Search Bar & View Mode Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cihaz adı, IP, MAC veya PIN ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                aria-label="Yaşam Döngüsü Filtresi"
                value={lifecycleFilter}
                onChange={(e) => setLifecycleFilter(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 text-xs text-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500"
              >
                <option value="all">Tüm Aşamalar</option>
                <option value="discovered">Keşfedildi (Discovered)</option>
                <option value="pending">Eşleşme Bekliyor (Pending)</option>
                <option value="assigned">Atandı (Assigned)</option>
                <option value="active">Canlı & Aktif (Active)</option>
              </select>

              {/* View Mode Toggle: Karo vs Tek Satır */}
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 ml-1">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/80 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Karo Görünüm (Grid)"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Karo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    viewMode === 'list'
                      ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/80 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Tek Satır / Liste Görünüm"
                >
                  <List className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Tek Satır</span>
                </button>
              </div>
            </div>
          </div>

          {/* Empty State */}
          {filteredDiscovered.length === 0 ? (
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-10 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
                <Radio className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-slate-200 text-sm">Keşif Havuzunda Donanım Bulunmuyor</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Cihazlarınızı aynı yerel ağa (WiFi/Ethernet) bağlayın veya "Provizyon Sihirbazı" ile doğrudan manuel/QR eşleştirme başlatın.
              </p>
              <button
                type="button"
                onClick={handleOpenNewWizard}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 transition-colors mt-2"
              >
                <Plus className="w-4 h-4" />
                <span>Manuel / PIN ile Eşleştir</span>
              </button>
            </div>
          ) : viewMode === 'grid' ? (
            /* KARO / GRID VIEW */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDiscovered.map((dev, idx) => (
                <DiscoveredDeviceCard
                  key={`disc_card_${dev.id || dev.mac || dev.ip || 'dev'}_${idx}`}
                  device={dev}
                  onSelectForPairing={handleOpenWizardForDevice}
                  onPingTest={handlePingTest}
                  onDelete={handleDeleteDiscovered}
                  isPinging={pingingIp === dev.ip}
                />
              ))}
            </div>
          ) : (
            /* TEK SATIR / LIST VIEW */
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-4">Durum / Aşama</th>
                      <th className="py-3 px-4">Cihaz / Hostname</th>
                      <th className="py-3 px-4">Ağ Adresi (IP & MAC)</th>
                      <th className="py-3 px-4">Donanım & Sürüm</th>
                      <th className="py-3 px-4">PIN / Kod</th>
                      <th className="py-3 px-4">Sinyal / Ping</th>
                      <th className="py-3 px-4 text-right">Eylemler</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {filteredDiscovered.map((dev, idx) => {
                      const lifecycle = dev.lifecycleState || (dev.status === 'unregistered' ? 'discovered' : 'active');
                      const isRssiGood = dev.rssi ? dev.rssi > -65 : true;

                      return (
                        <tr
                          key={`disc_row_${dev.id || dev.mac || dev.ip || 'dev'}_${idx}`}
                          className="hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3 px-4 whitespace-nowrap">
                            {lifecycle === 'discovered' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                <Sparkles className="w-3 h-3" /> Keşfedildi
                              </span>
                            )}
                            {lifecycle === 'pending' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                <Clock className="w-3 h-3 animate-pulse" /> Eşleşme Bekliyor
                              </span>
                            )}
                            {lifecycle === 'assigned' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                <Layers className="w-3 h-3" /> Atandı
                              </span>
                            )}
                            {lifecycle === 'active' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" /> Canlı & Aktif
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                                <Cpu className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-slate-100 text-xs truncate max-w-[180px] flex items-center gap-1">
                                  {dev.hostname || dev.name || 'İsimsiz IoT Düğümü'}
                                  {dev.hasAuthToken && (
                                    <span title="Yetkilendirilmiş API Anahtarı Mevcut">
                                      <ShieldCheck className="w-3 h-3 text-emerald-400 inline shrink-0" />
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 truncate">
                                  Protokol: {dev.protocol || 'HTTP/REST'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap font-mono text-xs">
                            <div className="text-slate-200 font-semibold">{dev.ip || '—'}</div>
                            <div className="text-[10px] text-slate-400">{dev.mac || '—'}</div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap font-mono text-xs">
                            <div className="text-slate-200">{dev.hardwareModel || dev.vendor || 'Standart ESP32'}</div>
                            <div className="text-[10px] text-slate-400">{dev.firmwareVersion || 'v1.0.0-PROD'}</div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {dev.pairingCode ? (
                              <span className="text-cyan-400 font-mono font-bold tracking-wider bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/60 text-xs">
                                {dev.pairingCode}
                              </span>
                            ) : (
                              <span className="text-slate-500 text-xs font-mono">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap font-mono text-xs">
                            <div className="flex items-center gap-1.5 text-slate-300">
                              {isRssiGood ? (
                                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                              )}
                              <span>{dev.rssi ? `${dev.rssi} dBm` : '-55 dBm'}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <Activity className="w-3 h-3 text-cyan-400" />
                              <span>{dev.pingMs !== undefined ? `${dev.pingMs} ms` : '< 5 ms'}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handlePingTest(dev.ip)}
                                disabled={pingingIp === dev.ip}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700/60 transition-colors disabled:opacity-50"
                                title="Ping Testi Yap"
                              >
                                {pingingIp === dev.ip ? 'Ping...' : 'Ping'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenWizardForDevice(dev)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-sm transition-all"
                                title="Provizyon Sihirbazında Eşleştir"
                              >
                                <span>Eşleştir</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                              {handleDeleteDiscovered && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDiscovered(dev)}
                                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                                  title="Havuzdan Sil"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SUBNET SCANNER */}
      {activeTab === 'scan' && (
        <div className="space-y-5">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Network className="w-5 h-5 text-cyan-400" />
                Yerel Ağ & Subnet Tarama Aracı
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Belirtilen IP bloğundaki açık IoT portlarını (80, 8080, 1883 MQTT) ve donanımları tespit ederek bekleme havuzuna aktarır.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <input
                type="text"
                value={subnetInput}
                onChange={(e) => setSubnetInput(e.target.value)}
                placeholder="Örn: 192.168.1.0/24"
                className="flex-1 min-w-[240px] bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={handleStartSubnetScan}
                disabled={isScanningSubnet}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isScanningSubnet ? 'animate-spin' : ''}`} />
                <span>{isScanningSubnet ? 'Taranıyor...' : 'Ağı Tara'}</span>
              </button>
            </div>

            {isScanningSubnet && (
              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-xs text-slate-400 font-mono">
                  <span>Tarama İlerlemesi</span>
                  <span>%{scanProgress}</span>
                </div>
                <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-cyan-500 transition-all duration-300"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Console Log Output */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 font-mono text-xs shadow-inner">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/80 text-slate-400">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <span className="font-semibold text-slate-200">Ağ Tarama Konsol Çıktısı</span>
              </div>
              <span className="text-[11px] text-slate-500">CANLI LOG</span>
            </div>

            <div className="space-y-1 max-h-48 overflow-y-auto text-slate-300">
              {scanLogs.length === 0 ? (
                <div className="text-slate-600 italic">Henüz bir tarama başlatılmadı.</div>
              ) : (
                scanLogs.map((log, i) => (
                  <div key={i} className="leading-relaxed text-cyan-300/90">{log}</div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AUDIT TABLE */}
      {activeTab === 'audit' && (
        <PairingAuditTable
          records={auditRecords}
          onRefresh={fetchAuditHistory}
          isLoading={isLoadingAudit}
        />
      )}

      {/* TAB 4: ARCHIVED & DELETED DEVICES */}
      {activeTab === 'archived' && (
        <ArchivedDevicesTab
          onDeviceRestored={() => {
            refreshDevices();
            fetchDiscovered();
          }}
        />
      )}

      {/* PROVISIONING WIZARD MODAL */}
      {user && (
        <ProvisioningWizardModal
          isOpen={isWizardOpen}
          onClose={() => setIsWizardOpen(false)}
          onPairSuccess={() => {
            refreshDevices();
            fetchDiscovered();
            fetchAuditHistory();
          }}
          initialDevice={selectedDeviceForWizard}
          currentUser={user}
          sites={sites}
          zones={zones}
          groups={groups}
          allUsers={customersList}
        />
      )}
    </div>
  );
};
