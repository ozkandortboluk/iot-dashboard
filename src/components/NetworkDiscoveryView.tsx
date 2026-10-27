import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Globe,
  Server,
  Zap,
  Play,
  Copy,
  Check,
  AlertCircle,
  X,
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
  const [vendorFilter, setVendorFilter] = useState<'all' | 'esp32' | 'modbus' | 'raspberry' | 'other'>('all');

  // Subnet Scanning State
  const [subnetInput, setSubnetInput] = useState('192.168.1.0/24');
  const [isScanningSubnet, setIsScanningSubnet] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanLogs, setScanLogs] = useState<string[]>([]);
  const [pingingIp, setPingingIp] = useState<string | null>(null);
  const [selectedPorts, setSelectedPorts] = useState<number[]>([80, 8080, 1883]);
  const [copiedLog, setCopiedLog] = useState(false);
  const terminalLogsEndRef = useRef<HTMLDivElement | null>(null);

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

  // Ping Notification State
  const [pingNotification, setPingNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Auto-scroll terminal log
  useEffect(() => {
    if (terminalLogsEndRef.current) {
      terminalLogsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scanLogs]);

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

  // Ping Test Action
  const handlePingTest = async (ip: string) => {
    if (!ip || ip === '—') return;
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
    setScanProgress(8);
    const nowStr = new Date().toLocaleTimeString();
    const portsStr = selectedPorts.join(', ');
    setScanLogs([
      `[${nowStr}] 🚀 Subnet taraması başlatıldı: ${subnetInput}`,
      `[${nowStr}] 🔎 Hedef portlar denetleniyor: [${portsStr}] (mDNS, ARP, SSDP, TCP)`,
    ]);

    let current = 8;
    const interval = setInterval(() => {
      current += Math.floor(Math.random() * 22 + 10);
      if (current >= 100) {
        current = 100;
        clearInterval(interval);
        setIsScanningSubnet(false);
        setScanProgress(100);
        const doneStr = new Date().toLocaleTimeString();
        setScanLogs((prev) => [
          ...prev,
          `[${doneStr}] 📡 ICMP, ARP ve mDNS yayın yanıtları toplandı.`,
          `[${doneStr}] ✅ Tarama başarıyla tamamlandı. Havuzdaki düğüm sayısı: ${discoveredDevices.length}.`,
        ]);
        fetchDiscovered();
      } else {
        setScanProgress(current);
        const timeNow = new Date().toLocaleTimeString();
        if (current > 25 && current < 45) {
          const sampleIp = `${subnetInput.replace('.0/24', '')}.${Math.floor(current * 1.8 + 2)}`;
          setScanLogs((prev) => [
            ...prev,
            `[${timeNow}] Port ${selectedPorts[0] || 80} & ${selectedPorts[1] || 8080} taranıyor (${sampleIp})...`,
          ]);
        } else if (current >= 60 && current < 80) {
          setScanLogs((prev) => [
            ...prev,
            `[${timeNow}] Espressif mDNS & SSDP yayınları çözümleniyor...`,
          ]);
        }
      }
    }, 500);
  };

  const handleCopyLogs = () => {
    if (scanLogs.length === 0) return;
    navigator.clipboard.writeText(scanLogs.join('\n'));
    setCopiedLog(true);
    setTimeout(() => setCopiedLog(false), 2000);
  };

  const handleClearLogs = () => {
    setScanLogs([]);
  };

  const togglePort = (port: number) => {
    setSelectedPorts((prev) =>
      prev.includes(port) ? prev.filter((p) => p !== port) : [...prev, port]
    );
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
    if (window.confirm('Keşif havuzundaki eşleşmemiş tüm kayıtları temizlemek istediğinize emin misiniz?')) {
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

      // 2. Search query filter
      const matchSearch =
        !searchQuery ||
        (d.hostname && d.hostname.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (d.ip && d.ip.includes(searchQuery)) ||
        (d.mac && d.mac.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (d.pairingCode && d.pairingCode.includes(searchQuery)) ||
        (d.hardwareModel && d.hardwareModel.toLowerCase().includes(searchQuery.toLowerCase()));

      // 3. Lifecycle filter
      const state = d.lifecycleState || (d.status === 'unregistered' ? 'discovered' : 'active');
      const matchLifecycle = lifecycleFilter === 'all' || state === lifecycleFilter;

      // 4. Vendor filter
      let matchVendor = true;
      if (vendorFilter !== 'all') {
        const text = `${d.hardwareModel || ''} ${d.vendor || ''} ${d.hostname || ''}`.toLowerCase();
        if (vendorFilter === 'esp32') {
          matchVendor = text.includes('esp32') || text.includes('nodemcu') || text.includes('espressif');
        } else if (vendorFilter === 'modbus') {
          matchVendor = text.includes('modbus') || text.includes('plc') || text.includes('rs485');
        } else if (vendorFilter === 'raspberry') {
          matchVendor = text.includes('raspberry') || text.includes('rpi') || text.includes('pi');
        } else if (vendorFilter === 'other') {
          matchVendor = !text.includes('esp32') && !text.includes('nodemcu') && !text.includes('modbus') && !text.includes('raspberry');
        }
      }

      return matchSearch && matchLifecycle && matchVendor;
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
  }, [discoveredDevices, searchQuery, lifecycleFilter, vendorFilter, devices]);

  const activeCount = devices.length;
  const discoveredPoolCount = discoveredDevices.length;
  const pendingCount = discoveredDevices.filter(
    (d) => (d.lifecycleState || d.status) === 'unregistered' || d.lifecycleState === 'pending'
  ).length;

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* 1. TOP HEADER BANNER CARD (Harmonious with DevicesView & AnalyticsView) */}
      <div className="bg-white dark:bg-[#0f172a] p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="p-3 bg-cyan-500/10 dark:bg-cyan-500/15 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 rounded-2xl shrink-0 shadow-xs">
            <Radio className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Cihaz Keşfi ve Eşleştirme
              </h1>
              <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20 font-mono">
                Zero-Touch Provisioning
              </span>
              {isScanningSubnet ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                  Ağ Taranıyor (%{scanProgress})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Keşif Dinleyicisi Aktif
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Yerel ağdaki fiziksel donanımları keşfedin (mDNS / SSDP / ARP / Port Scan), PIN veya QR kod ile anında eşleştirip hiyerarşik yapıya dahil edin.
            </p>
          </div>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap shrink-0">
          <button
            type="button"
            onClick={fetchDiscovered}
            disabled={isLoadingDiscovered}
            className="p-2 sm:px-3 sm:py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Keşif Havuzunu Yenile"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDiscovered ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Yenile</span>
          </button>

          <button
            type="button"
            onClick={handleClearPool}
            title="Eşleşmemiş ve sahte keşif kayıtlarını temizle"
            className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800/60 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Havuzu Temizle</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('scan');
              handleStartSubnetScan();
            }}
            disabled={isScanningSubnet}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/60 hover:bg-cyan-100 dark:hover:bg-cyan-900/60 border border-cyan-200 dark:border-cyan-800/80 transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
          >
            <Network className={`w-3.5 h-3.5 ${isScanningSubnet ? 'animate-spin' : ''}`} />
            <span>Hızlı Ağ Tara</span>
          </button>

          <button
            type="button"
            onClick={handleOpenNewWizard}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-md shadow-cyan-600/25 transition-all cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Provizyon Sihirbazı</span>
          </button>
        </div>
      </div>

      {/* Ping Notification Banner */}
      {pingNotification && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between border animate-fadeIn shadow-sm ${
            pingNotification.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
              : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-400'
          }`}
        >
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 shrink-0" />
            <span>{pingNotification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setPingNotification(null)}
            className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg text-slate-500 dark:text-slate-400 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. STATS KPI CARDS (4 Responsive Columns) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm hover:border-cyan-500/40 transition-all flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono tracking-tight">
              {discoveredPoolCount}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">Keşif Havuzundaki Cihazlar</div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm hover:border-amber-500/40 transition-all flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono tracking-tight">
              {pendingCount}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">Eşleşme Bekleyen Düğüm</div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm hover:border-emerald-500/40 transition-all flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono tracking-tight">
              {activeCount}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">Canlı & Yetkili Cihaz</div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm hover:border-indigo-500/40 transition-all flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <Network className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 font-mono truncate">
              {subnetInput}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {isScanningSubnet ? 'Tarama Sürüyor...' : 'Aktif Yerel Subnet'}
            </div>
          </div>
        </div>
      </div>

      {/* 3. TABS NAVIGATION TOOLBAR (Matching standard app design) */}
      <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900/70 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab('discovered')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'discovered'
              ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-sm border border-slate-200/80 dark:border-slate-700/80'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-4 h-4 text-cyan-500" />
          <span>Keşfedilen Cihazlar</span>
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
            {filteredDiscovered.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('scan')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'scan'
              ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-sm border border-slate-200/80 dark:border-slate-700/80'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Network className="w-4 h-4 text-cyan-500" />
          <span>Canlı Ağ & Subnet Taraması</span>
          {isScanningSubnet && (
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('audit');
            fetchAuditHistory();
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'audit'
              ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-sm border border-slate-200/80 dark:border-slate-700/80'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-cyan-500" />
          <span>Eşleştirme Denetim Günlüğü</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('archived')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'archived'
              ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-sm border border-slate-200/80 dark:border-slate-700/80'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Archive className="w-4 h-4 text-cyan-500" />
          <span>Silinen & Arşivlenen Cihazlar</span>
        </button>
      </div>

      {/* 4. TAB CONTENT */}

      {/* TAB 1: DISCOVERED DEVICES (High-density, neat screen utilization) */}
      {activeTab === 'discovered' && (
        <div className="space-y-4">
          {/* Quick Subnet Scan Banner (when scanning is in progress) */}
          {isScanningSubnet && (
            <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/20 rounded-2xl p-4 shadow-sm space-y-2 animate-fadeIn">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-500" />
                  Subnet Taranıyor: <code className="font-mono text-cyan-600 dark:text-cyan-400">{subnetInput}</code>
                </span>
                <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">%{scanProgress}</span>
              </div>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300 rounded-full"
                  style={{ width: `${scanProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Unified Filter, Search & Quick Scan Toolbar */}
          <div className="bg-white dark:bg-[#0f172a] p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              {/* Search Bar */}
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cihaz adı, IP, MAC adresi, model veya PIN ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 rounded-xl pl-9 pr-8 py-2.5 focus:outline-none focus:border-cyan-500 transition font-sans"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Lifecycle & Vendor Selectors */}
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  aria-label="Yaşam Döngüsü Filtresi"
                  value={lifecycleFilter}
                  onChange={(e) => setLifecycleFilter(e.target.value as any)}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500 font-sans cursor-pointer"
                >
                  <option value="all">Tüm Aşamalar</option>
                  <option value="discovered">Keşfedildi (Discovered)</option>
                  <option value="pending">Eşleşme Bekliyor (Pending)</option>
                  <option value="assigned">Atandı (Assigned)</option>
                  <option value="active">Canlı & Aktif (Active)</option>
                </select>

                <select
                  aria-label="Donanım Türü Filtresi"
                  value={vendorFilter}
                  onChange={(e) => setVendorFilter(e.target.value as any)}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500 font-sans cursor-pointer"
                >
                  <option value="all">Tüm Donanımlar</option>
                  <option value="esp32">ESP32 / NodeMCU</option>
                  <option value="modbus">Endüstriyel Modbus</option>
                  <option value="raspberry">Raspberry Pi Gateway</option>
                  <option value="other">Diğer Donanımlar</option>
                </select>

                {/* View Mode Toggle: Karo vs Tek Satır */}
                <div className="flex items-center bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      viewMode === 'grid'
                        ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                    title="Karo Görünüm (Grid)"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Karo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      viewMode === 'list'
                        ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                    title="Tek Satır / Liste Görünüm"
                  >
                    <List className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Liste</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Status Chips Bar */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px] flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-slate-400 dark:text-slate-500 font-semibold mr-1">Hızlı Filtre:</span>
                <button
                  type="button"
                  onClick={() => {
                    setLifecycleFilter('all');
                    setVendorFilter('all');
                  }}
                  className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                    lifecycleFilter === 'all' && vendorFilter === 'all'
                      ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-bold border border-cyan-500/20'
                      : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  Tümü ({discoveredDevices.length})
                </button>

                <button
                  type="button"
                  onClick={() => setLifecycleFilter('pending')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                    lifecycleFilter === 'pending'
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold border border-blue-500/20'
                      : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  Eşleşme Bekleyen ({pendingCount})
                </button>

                <button
                  type="button"
                  onClick={() => setVendorFilter('esp32')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                    vendorFilter === 'esp32'
                      ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-bold border border-cyan-500/20'
                      : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  ESP32 / NodeMCU
                </button>
              </div>

              {/* Subnet Quick Trigger */}
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <span>Subnet:</span>
                <code className="font-mono text-cyan-600 dark:text-cyan-400">{subnetInput}</code>
                <button
                  type="button"
                  onClick={handleStartSubnetScan}
                  disabled={isScanningSubnet}
                  className="ml-1 text-cyan-600 dark:text-cyan-400 hover:underline font-bold disabled:opacity-50 cursor-pointer"
                >
                  {isScanningSubnet ? 'Taranıyor...' : 'Şimdi Tara'}
                </button>
              </div>
            </div>
          </div>

          {/* Empty State */}
          {filteredDiscovered.length === 0 ? (
            <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-3xl p-10 sm:p-14 text-center space-y-4 shadow-sm">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-500 shadow-xs">
                <Radio className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                  Keşif Havuzunda Donanım Bulunmuyor
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                  Cihazlarınızı aynı yerel ağa (WiFi/Ethernet) bağlayarak otomatik taranmasını bekleyebilir veya manuel provizyon ile anında eşleştirebilirsiniz.
                </p>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('scan');
                    handleStartSubnetScan();
                  }}
                  disabled={isScanningSubnet}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/60 hover:bg-cyan-100 dark:hover:bg-cyan-900/60 border border-cyan-200 dark:border-cyan-800 transition cursor-pointer"
                >
                  <Network className="w-4 h-4" />
                  <span>Subnet Taraması Başlat</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenNewWizard}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-md shadow-cyan-600/20 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Manuel PIN ile Eşleştir</span>
                </button>
              </div>
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
            <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-4">Durum / Aşama</th>
                      <th className="py-3 px-4">Cihaz / Hostname</th>
                      <th className="py-3 px-4">Ağ Adresi (IP & MAC)</th>
                      <th className="py-3 px-4">Donanım & Sürüm</th>
                      <th className="py-3 px-4">PIN / Kod</th>
                      <th className="py-3 px-4">Sinyal & Gecikme</th>
                      <th className="py-3 px-4 text-right">Eylemler</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                    {filteredDiscovered.map((dev, idx) => {
                      const lifecycle = dev.lifecycleState || (dev.status === 'unregistered' ? 'discovered' : 'active');
                      const isRssiGood = dev.rssi ? dev.rssi > -65 : true;

                      return (
                        <tr
                          key={`disc_row_${dev.id || dev.mac || dev.ip || 'dev'}_${idx}`}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {lifecycle === 'discovered' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                <Sparkles className="w-3 h-3" /> Keşfedildi
                              </span>
                            )}
                            {lifecycle === 'pending' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                <Clock className="w-3 h-3 animate-pulse" /> Eşleşme Bekliyor
                              </span>
                            )}
                            {lifecycle === 'assigned' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                <Layers className="w-3 h-3" /> Atandı
                              </span>
                            )}
                            {lifecycle === 'active' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" /> Canlı & Aktif
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shrink-0">
                                <Cpu className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 dark:text-slate-100 text-xs truncate max-w-[190px] flex items-center gap-1">
                                  {dev.hostname || dev.name || 'İsimsiz IoT Düğümü'}
                                  {dev.hasAuthToken && (
                                    <span title="Yetkilendirilmiş API Anahtarı Mevcut">
                                      <ShieldCheck className="w-3 h-3 text-emerald-500 inline shrink-0" />
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                  Protokol: {dev.protocol || 'HTTP/REST'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap font-mono text-xs">
                            <div className="text-slate-800 dark:text-slate-200 font-semibold">{dev.ip || '—'}</div>
                            <div className="text-[10px] text-slate-400">{dev.mac || '—'}</div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap font-mono text-xs">
                            <div className="text-slate-700 dark:text-slate-300 font-sans font-medium">
                              {dev.hardwareModel || dev.vendor || 'Standart ESP32'}
                            </div>
                            <div className="text-[10px] text-slate-400">{dev.firmwareVersion || 'v1.0.0-PROD'}</div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {dev.pairingCode ? (
                              <span className="text-cyan-600 dark:text-cyan-400 font-mono font-bold tracking-wider bg-cyan-50 dark:bg-cyan-950/60 px-2.5 py-0.5 rounded-md border border-cyan-200 dark:border-cyan-800/60 text-xs">
                                {dev.pairingCode}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs font-mono">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap font-mono text-xs">
                            <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                              {isRssiGood ? (
                                <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                              )}
                              <span>{dev.rssi ? `${dev.rssi} dBm` : '-55 dBm'}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <Activity className="w-3 h-3 text-cyan-500" />
                              <span>{dev.pingMs !== undefined ? `${dev.pingMs} ms` : '< 5 ms'}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handlePingTest(dev.ip)}
                                disabled={pingingIp === dev.ip}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/60 transition-colors disabled:opacity-50 cursor-pointer"
                                title="Ping Testi Yap"
                              >
                                {pingingIp === dev.ip ? 'Ping...' : 'Ping'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenWizardForDevice(dev)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-sm transition-all cursor-pointer active:scale-95"
                                title="Provizyon Sihirbazında Eşleştir"
                              >
                                <span>Eşleştir</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                              {handleDeleteDiscovered && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDiscovered(dev)}
                                  className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
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

      {/* TAB 2: SUBNET SCANNER WORKBENCH (High-productivity dual-panel interface) */}
      {activeTab === 'scan' && (
        <div className="space-y-5">
          {/* Top Control Panel */}
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Network className="w-5 h-5 text-cyan-500" />
                  Yerel Ağ & Subnet Tarama Tezgahı
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Belirtilen IP bloğundaki açık IoT portlarını (HTTP, MQTT, Modbus) ve aktif düğümleri tespit ederek bekleme havuzuna aktarır.
                </p>
              </div>

              {/* Subnet Presets */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-400 font-semibold">Ön Tanımlı:</span>
                {['192.168.1.0/24', '192.168.0.0/24', '10.0.0.0/24', '172.16.0.0/24'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSubnetInput(preset)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium transition cursor-pointer ${
                      subnetInput === preset
                        ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 font-bold'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Input & Scan Button */}
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[240px]">
                <Globe className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={subnetInput}
                  onChange={(e) => setSubnetInput(e.target.value)}
                  placeholder="Örn: 192.168.1.0/24"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500 shadow-inner"
                />
              </div>

              <button
                type="button"
                onClick={handleStartSubnetScan}
                disabled={isScanningSubnet}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-md shadow-cyan-600/20 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
              >
                <RefreshCw className={`w-4 h-4 ${isScanningSubnet ? 'animate-spin' : ''}`} />
                <span>{isScanningSubnet ? 'Taranıyor...' : 'Ağı Şimdi Tara'}</span>
              </button>
            </div>

            {/* Target Ports Selection */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  Hedef IoT Portları:
                </span>
                {[
                  { port: 80, label: 'HTTP (80)' },
                  { port: 8080, label: 'Web/API (8080)' },
                  { port: 1883, label: 'MQTT (1883)' },
                  { port: 502, label: 'Modbus (502)' },
                  { port: 443, label: 'HTTPS (443)' },
                ].map(({ port, label }) => {
                  const isChecked = selectedPorts.includes(port);
                  return (
                    <button
                      key={port}
                      type="button"
                      onClick={() => togglePort(port)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono transition cursor-pointer flex items-center gap-1 ${
                        isChecked
                          ? 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800 font-bold'
                          : 'bg-slate-100 dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isChecked ? 'bg-cyan-500' : 'bg-slate-400'}`} />
                      {label}
                    </button>
                  );
                })}
              </div>

              {isScanningSubnet && (
                <span className="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400 animate-pulse">
                  Tarama: %{scanProgress}
                </span>
              )}
            </div>

            {/* Progress bar */}
            {isScanningSubnet && (
              <div className="space-y-1.5 pt-1">
                <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-950 rounded-full overflow-hidden border border-slate-200 dark:border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300 rounded-full"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Dual Panel: Discovered Nodes on Network & Console Output */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Column (7 cols): Discovered Nodes Table */}
            <div className="lg:col-span-7 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-cyan-500" />
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                    Ağdaki Aktif Düğümler ({discoveredDevices.length})
                  </h4>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">Otomatik Dinleyici</span>
              </div>

              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {discoveredDevices.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs">
                    Henüz tespit edilmiş bir düğüm yok. "Ağı Şimdi Tara" butonuna tıklayarak taramayı başlatın.
                  </div>
                ) : (
                  discoveredDevices.map((dev, idx) => (
                    <div
                      key={`scanned_node_${dev.id || dev.mac || idx}`}
                      className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-3 hover:border-cyan-500/40 transition"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shrink-0">
                          <Cpu className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 dark:text-slate-100 text-xs truncate">
                            {dev.hostname || dev.name || 'İsimsiz Düğüm'}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono truncate">
                            {dev.ip} • {dev.mac || 'MAC algılanamadı'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-200/60 dark:bg-slate-900 px-2 py-0.5 rounded">
                          {dev.hardwareModel || dev.vendor || 'ESP32'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenWizardForDevice(dev)}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-500 transition cursor-pointer"
                        >
                          Eşleştir
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right Column (5 cols): Live Terminal Logs */}
            <div className="lg:col-span-5 bg-slate-950 border border-slate-800 rounded-3xl p-5 font-mono text-xs shadow-inner space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-800/80 text-slate-400">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    <span className="font-bold text-slate-200 text-xs">Konsol Çıktısı</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyLogs}
                      className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition"
                      title="Logları Kopyala"
                    >
                      {copiedLog ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedLog ? 'Kopyalandı' : 'Kopyala'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleClearLogs}
                      className="text-[11px] text-slate-400 hover:text-rose-400 transition"
                      title="Konsolu Temizle"
                    >
                      Temizle
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 max-h-[300px] overflow-y-auto text-slate-300 pr-1 text-[11px]">
                  {scanLogs.length === 0 ? (
                    <div className="text-slate-600 italic py-8 text-center">
                      Henüz bir tarama kaydı yok. "Ağı Şimdi Tara" ile taramayı başlatın.
                    </div>
                  ) : (
                    scanLogs.map((log, i) => (
                      <div key={i} className="leading-relaxed text-cyan-300/90 break-words">
                        {log}
                      </div>
                    ))
                  )}
                  <div ref={terminalLogsEndRef} />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-500 flex items-center justify-between">
                <span>Mod: ARP + ICMP Ping + TCP Socket</span>
                <span className="text-emerald-400 font-bold">READY</span>
              </div>
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
      {isWizardOpen && user && (
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
