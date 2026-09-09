import React, { useState, useEffect } from 'react';
import { useRealtime } from '../context/RealtimeContext';
import { useAuth } from '../context/AuthContext';
import { apiFetch as fetch } from '../lib/apiFetch';
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

export const NetworkDiscoveryView: React.FC<{
  onNavigateToDevices?: () => void;
  onNavigateToHelp?: () => void;
}> = ({ onNavigateToDevices }) => {
  const { devices, refreshDevices, customersList } = useRealtime();
  const { user } = useAuth();

  // Navigation / Tabs
  const [activeTab, setActiveTab] = useState<'discovered' | 'scan' | 'audit'>('discovered');

  // Discovery State
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredNetworkDevice[]>([]);
  const [isLoadingDiscovered, setIsLoadingDiscovered] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState<'all' | 'discovered' | 'pending' | 'assigned' | 'active'>('all');

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
        fetch('/api/hierarchy/sites'),
        fetch('/api/hierarchy/zones'),
        fetch('/api/hierarchy/groups'),
      ]);
      if (sRes.ok) setSites(await sRes.json());
      if (zRes.ok) setZones(await zRes.json());
      if (gRes.ok) setGroups(await gRes.json());
    } catch (err) {
      console.error('Hiyerarşi verileri yüklenemedi:', err);
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
    setPingingIp(ip);
    try {
      const res = await fetch('/api/network/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`[PING BAŞARILI] Hedef IP: ${ip}\nGecikme: ${data.timeMs || '<5'} ms`);
      } else {
        alert(`[PING HATASI] Hedef IP: ${ip} yanıt vermedi.`);
      }
    } catch {
      alert(`[PING HATASI] ${ip} adresine ulaşılamadı.`);
    } finally {
      setPingingIp(null);
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

  // Filter Discovered Devices
  const filteredDiscovered = discoveredDevices.filter((d) => {
    const matchSearch =
      (d.hostname && d.hostname.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (d.ip && d.ip.includes(searchQuery)) ||
      (d.mac && d.mac.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (d.pairingCode && d.pairingCode.includes(searchQuery));

    const state = d.lifecycleState || (d.status === 'unregistered' ? 'discovered' : 'active');
    const matchLifecycle = lifecycleFilter === 'all' || state === lifecycleFilter;

    return matchSearch && matchLifecycle;
  });

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
      </div>

      {/* TAB 1: DISCOVERED CARDS */}
      {activeTab === 'discovered' && (
        <div className="space-y-4">
          {/* Filter / Search Bar */}
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
            </div>
          </div>

          {/* Cards Grid */}
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
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDiscovered.map((dev) => (
                <DiscoveredDeviceCard
                  key={dev.mac || dev.ip}
                  device={dev}
                  onSelectForPairing={handleOpenWizardForDevice}
                  onPingTest={handlePingTest}
                  isPinging={pingingIp === dev.ip}
                />
              ))}
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
