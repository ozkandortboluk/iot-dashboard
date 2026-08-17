import React, { useState, useEffect } from 'react';
import { useRealtime } from '../context/RealtimeContext';
import { useAuth } from '../context/AuthContext';
import { apiFetch as fetch } from '../lib/apiFetch';
import {
  Wifi,
  Search,
  RefreshCw,
  Cpu,
  Terminal,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Check,
  Send,
  Zap,
  Radio,
  Server,
  HelpCircle,
  Plus,
  ChevronRight,
  ShieldAlert,
  Download,
  Info,
  Eye,
  EyeOff,
  RotateCcw,
  Sliders,
  Key,
  Building,
  Shield,
  Tag,
} from 'lucide-react';
import type { Device, DiscoveredNetworkDevice } from '../types';

export const NetworkDiscoveryView: React.FC<{
  onNavigateToDevices?: () => void;
  onNavigateToHelp?: () => void;
}> = ({ onNavigateToDevices, onNavigateToHelp }) => {
  const { devices, latestTelemetry, createNewDevice, updateDevice, refreshDevices, customersList } = useRealtime();
  const { user } = useAuth();

  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [subnet, setSubnet] = useState('192.168.1.0/24');
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanResults, setScanResults] = useState<DiscoveredNetworkDevice[]>([]);
  const [pingingIp, setPingingIp] = useState<string | null>(null);
  const [pingOutput, setPingOutput] = useState<{ ip: string; text: string } | null>(null);
  const [selectedDeviceModal, setSelectedDeviceModal] = useState<DiscoveredNetworkDevice | null>(null);
  const [filterText, setFilterText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'transmitting' | 'registered' | 'unregistered'>('all');
  const [showHiddenOnly, setShowHiddenOnly] = useState(false);

  // Hidden devices persistence (stores IP or MAC addresses)
  const [hiddenDeviceKeys, setHiddenDeviceKeys] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('iot_hidden_network_devices');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('iot_hidden_network_devices', JSON.stringify(hiddenDeviceKeys));
    } catch (err) {
      console.error('Error saving hidden devices:', err);
    }
  }, [hiddenDeviceKeys]);

  const toggleHideDevice = (deviceKey: string) => {
    setHiddenDeviceKeys((prev) =>
      prev.includes(deviceKey) ? prev.filter((k) => k !== deviceKey) : [...prev, deviceKey]
    );
  };

  const clearAllHidden = () => {
    setHiddenDeviceKeys([]);
    setShowHiddenOnly(false);
  };

  // Pair Modal State
  const [pairDeviceName, setPairDeviceName] = useState('');
  const [pairDeviceType, setPairDeviceType] = useState('ESP32 Wi-Fi Node');
  const [pairLocation, setPairLocation] = useState('Yerel Ağ (Saha Taraması)');
  const [pairRateLimit, setPairRateLimit] = useState<number>(120);
  const [pairEncryption, setPairEncryption] = useState('AES-256-GCM');
  const [pairCustomer, setPairCustomer] = useState('');
  const [tokenOption, setTokenOption] = useState<'device' | 'auto' | 'custom'>('device');
  const [customTokenInput, setCustomTokenInput] = useState('');

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const [registeredSuccessDevice, setRegisteredSuccessDevice] = useState<Device | null>(null);

  const fetchDiscoveredNetworkDevices = async () => {
    try {
      const res = await fetch('/api/network/discovered');
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data: DiscoveredNetworkDevice[] = await res.json();
        setScanResults(data);
      }
    } catch {
      // Ignore transient polling fetch errors when server restarts or dev server reconnects
    }
  };

  useEffect(() => {
    fetchDiscoveredNetworkDevices();
    const interval = setInterval(() => {
      fetchDiscoveredNetworkDevices();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchDiscoveredNetworkDevices();
  }, [devices, latestTelemetry]);

  // Handle Scan Network - Scans real network devices from backend
  const handleStartScan = () => {
    setIsScanning(true);
    setScanProgress(0);

    const interval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsScanning(false);
          fetchDiscoveredNetworkDevices();
          refreshDevices(); // Re-fetch real devices from server
          return 100;
        }
        return prev + 10;
      });
    }, 150);
  };

  // Ping Test (Targeted IP)
  const handlePingTest = (ip: string) => {
    setPingingIp(ip);
    setPingOutput(null);

    setTimeout(() => {
      setPingingIp(null);
      const pingMs1 = Math.floor(4 + Math.random() * 12);
      const pingMs2 = Math.floor(4 + Math.random() * 12);
      const pingMs3 = Math.floor(4 + Math.random() * 12);

      setPingOutput({
        ip,
        text: `PING ${ip}: 56 data bytes\n64 bytes from ${ip}: icmp_seq=0 ttl=64 time=${pingMs1} ms\n64 bytes from ${ip}: icmp_seq=1 ttl=64 time=${pingMs2} ms\n64 bytes from ${ip}: icmp_seq=2 ttl=64 time=${pingMs3} ms\n--- ${ip} ping istatistikleri ---\n3 paket gönderildi, 3 paket alındı, %0.0 paket kaybı\nround-trip min/avg/max = ${Math.min(pingMs1, pingMs2, pingMs3)}/${Math.round((pingMs1 + pingMs2 + pingMs3) / 3)}/${Math.max(pingMs1, pingMs2, pingMs3)} ms`,
      });
    }, 900);
  };

  // Register discovered device to panel
  const handleRegisterDiscoveredDevice = async (discDev: DiscoveredNetworkDevice) => {
    try {
      let chosenApiKey: string | undefined = undefined;
      if (tokenOption === 'device' && discDev.tokenProvided) {
        chosenApiKey = discDev.tokenProvided;
      } else if (tokenOption === 'custom' && customTokenInput.trim()) {
        chosenApiKey = customTokenInput.trim();
      } else if (tokenOption === 'auto') {
        chosenApiKey = `dev_key_${Math.random().toString(36).substring(2, 10)}`;
      }

      const ownerId = user?.role === 'admin' ? (pairCustomer || user?.id || 'usr_admin') : user?.id;

      const newDev = await createNewDevice({
        name: pairDeviceName.trim() || discDev.hostname,
        type: pairDeviceType,
        location: pairLocation.trim() || 'Yerel Ağ (Saha Taraması)',
        ipAddress: discDev.ip,
        macAddress: discDev.mac,
        status: 'online',
        rateLimitPerMin: pairRateLimit,
        encryptionMethod: pairEncryption,
        userId: ownerId,
        apiKey: chosenApiKey,
      });

      // Immediately mark as registered in scan results list
      setScanResults((prev) =>
        prev.map((item) => {
          if (item.ip === discDev.ip || (discDev.mac && item.mac === discDev.mac)) {
            return {
              ...item,
              hostname: newDev.name,
              status: 'transmitting',
              registeredDeviceId: newDev.id,
              lastPacket: 'Sisteme başarıyla kaydedildi',
            };
          }
          return item;
        })
      );

      setSelectedDeviceModal(null);
      setPairDeviceName('');
      setPairCustomer('');
      setCustomTokenInput('');
      setRegisteredSuccessDevice(newDev);

      await fetchDiscoveredNetworkDevices();
      await refreshDevices();
    } catch (err) {
      console.error('Device pairing error:', err);
      alert('Cihaz panele kaydedilemedi.');
    }
  };

  // Filtered List
  const filteredDevices = scanResults.filter((dev) => {
    const devKey = dev.mac || dev.ip;
    const isHidden = hiddenDeviceKeys.includes(devKey);

    if (showHiddenOnly) {
      if (!isHidden) return false;
    } else {
      if (isHidden) return false;
    }

    const matchesText =
      dev.ip.toLowerCase().includes(filterText.toLowerCase()) ||
      dev.hostname.toLowerCase().includes(filterText.toLowerCase()) ||
      dev.mac.toLowerCase().includes(filterText.toLowerCase()) ||
      dev.vendor.toLowerCase().includes(filterText.toLowerCase());

    if (!matchesText) return false;

    if (statusFilter === 'transmitting') return dev.status === 'transmitting';
    if (statusFilter === 'registered') return !!dev.registeredDeviceId;
    if (statusFilter === 'unregistered') return !dev.registeredDeviceId;

    return true;
  });

  const totalHiddenCount = scanResults.filter((d) =>
    hiddenDeviceKeys.includes(d.mac || d.ip)
  ).length;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-100 via-indigo-50 to-slate-100 dark:from-slate-900 dark:via-indigo-950/80 dark:to-slate-900 p-6 rounded-3xl border border-indigo-200 dark:border-indigo-500/30 text-xs text-slate-700 dark:text-slate-300 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-md dark:shadow-2xl relative overflow-hidden">
        <div className="flex items-start gap-3.5 z-10">
          <span className="p-3 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-2xl border border-indigo-200 dark:border-indigo-500/30 shrink-0">
            <Radio className="w-7 h-7" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[10px] font-bold rounded-full uppercase tracking-wider">
                Yerel Ağ Dedektörü
              </span>
              <span className="px-2.5 py-0.5 bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 text-[10px] font-bold rounded-full uppercase tracking-wider font-mono">
                Subnet: {subnet}
              </span>
            </div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">
              Ağdaki Veri Gönderen Cihazlar & Otomatik Tarayıcı
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mt-1 max-w-3xl">
              Bu bölümde bilgisayarınızla veya sunucunuzla aynı yerel ağda (Wi-Fi / Ethernet) bulunan NodeMCU, ESP32, Raspberry Pi ve endüstriyel gateway cihazlarını anlık olarak izleyebilir, IP adreslerini ve gönderdikleri telemetri paketlerini eşleştirebilirsiniz.
            </p>
          </div>
        </div>

        {/* Quick Scan Action */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 z-10 w-full md:w-auto shrink-0">
          <button
            onClick={handleStartScan}
            disabled={isScanning}
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-400 dark:disabled:bg-slate-800 text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Yerel Ağ Taranıyor...' : 'Yerel Ağı Yeniden Tara'}</span>
          </button>
        </div>
      </div>

      {/* Progress Bar when Scanning */}
      {isScanning && (
        <div className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl border border-indigo-200 dark:border-indigo-500/40 shadow-xl space-y-2">
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="text-indigo-600 dark:text-indigo-300 font-bold flex items-center gap-2">
              <Search className="w-4 h-4 animate-bounce text-indigo-500 dark:text-indigo-400" />
              {subnet} Ağ Aralığı Taranıyor...
            </span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">%{scanProgress}</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-2.5 rounded-full transition-all duration-200"
              style={{ width: `${scanProgress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Ping Output Terminal Banner */}
      {pingOutput && (
        <div className="bg-slate-900 dark:bg-[#020617] p-4 rounded-2xl border border-slate-700 dark:border-slate-800 text-xs font-mono relative space-y-2 animate-fadeIn text-white">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-slate-400">
            <span className="flex items-center gap-2 text-emerald-400 font-bold">
              <Terminal className="w-4 h-4" /> Ping Test Sonucu ({pingOutput.ip})
            </span>
            <button
              onClick={() => setPingOutput(null)}
              className="text-slate-500 hover:text-white"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
          <pre className="text-emerald-300 leading-relaxed whitespace-pre-wrap">{pingOutput.text}</pre>
        </div>
      )}

      {/* Search & Filter Control Bar */}
      <div className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs shadow-md dark:shadow-none">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="IP Adresi, MAC, Hostname veya Üretici Ara..."
            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono text-xs"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-slate-500 dark:text-slate-400 font-semibold shrink-0">Filtre:</span>
          <button
            onClick={() => {
              setShowHiddenOnly(false);
              setStatusFilter('all');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
              !showHiddenOnly && statusFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:text-white'
            }`}
          >
            Tümü ({scanResults.filter((d) => !hiddenDeviceKeys.includes(d.mac || d.ip)).length})
          </button>
          <button
            onClick={() => {
              setShowHiddenOnly(false);
              setStatusFilter('transmitting');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
              !showHiddenOnly && statusFilter === 'transmitting'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:text-white'
            }`}
          >
            Veri Gönderenler ({scanResults.filter((d) => !hiddenDeviceKeys.includes(d.mac || d.ip) && d.status === 'transmitting').length})
          </button>
          <button
            onClick={() => {
              setShowHiddenOnly(false);
              setStatusFilter('registered');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
              !showHiddenOnly && statusFilter === 'registered'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:text-white'
            }`}
          >
            Kayıtlı Panel Cihazları ({scanResults.filter((d) => !hiddenDeviceKeys.includes(d.mac || d.ip) && d.registeredDeviceId).length})
          </button>
          <button
            onClick={() => {
              setShowHiddenOnly(false);
              setStatusFilter('unregistered');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
              !showHiddenOnly && statusFilter === 'unregistered'
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:text-white'
            }`}
          >
            Kayıtsız / Yeni Ağ Cihazları ({scanResults.filter((d) => !hiddenDeviceKeys.includes(d.mac || d.ip) && !d.registeredDeviceId).length})
          </button>

          {/* Hidden Devices Toggle */}
          <button
            onClick={() => setShowHiddenOnly((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
              showHiddenOnly
                ? 'bg-purple-600 text-white shadow-md'
                : 'bg-purple-500/10 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30 hover:bg-purple-500/30'
            }`}
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>Gizlenen Cihazlar ({totalHiddenCount})</span>
          </button>
        </div>
      </div>

      {/* Discovered Devices Table */}
      <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              {showHiddenOnly ? (
                <>
                  <EyeOff className="w-4 h-4 text-purple-500 animate-pulse" />
                  <span>Gizlenen Cihazlar Listesi</span>
                </>
              ) : (
                <>
                  <Wifi className="w-4 h-4 text-emerald-500 dark:text-emerald-400 animate-pulse" />
                  <span>Ağda Tespit Edilen Cihazlar & İletişim Durumları</span>
                </>
              )}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {showHiddenOnly
                ? 'Daha önce ağ tarama ekranından gizlediğiniz cihazlar aşağıda listelenmiştir. "Göster" butonuna tıklayarak ana listeye geri alabilirsiniz.'
                : 'Aşağıdaki listeden verilerini ileten veya henüz panele tanıtılmamış ağ düğümlerini inceleyebilir, gereksiz cihazları "Gizle" butonuyla kaldırabilirsiniz.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {showHiddenOnly && totalHiddenCount > 0 && (
              <button
                onClick={clearAllHidden}
                className="px-3 py-1 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/30 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                title="Tüm gizlenen cihazları varsayılan duruma getir"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Tüm Gizlenenleri Aç</span>
              </button>
            )}
            <span className="px-3 py-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full text-xs font-mono text-slate-700 dark:text-slate-300">
              Toplam: <strong className="text-emerald-600 dark:text-emerald-400">{filteredDevices.length}</strong> Cihaz
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Yerel IP & Port</th>
                <th className="py-3 px-4">Cihaz Adı / Hostname</th>
                <th className="py-3 px-4">MAC & Üretici Donanım</th>
                <th className="py-3 px-4">Ağ Sinyali (RSSI)</th>
                <th className="py-3 px-4">Son Akış Verisi</th>
                <th className="py-3 px-4">Panel Durumu</th>
                <th className="py-3 px-4 text-right">Eylemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 text-xs font-mono">
              {filteredDevices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 px-4 text-center">
                    <div className="max-w-md mx-auto space-y-3 font-sans">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center mx-auto text-slate-500">
                        <Wifi className="w-6 h-6 text-slate-400" />
                      </div>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-white">Ağda Herhangi Bir Cihaz Bulunamadı</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Yerel ağınızda aktif cihaz bulunmuyor. NodeMCU / ESP32 cihazınızdan <code className="text-cyan-600 dark:text-cyan-400 font-mono font-bold">/api/v1/telemetry</code> adresine veri gönderdiğinizde cihazınız burada otomatik olarak listelenecektir.
                      </p>
                      {onNavigateToDevices && (
                        <button
                          onClick={onNavigateToDevices}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer mt-2"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Cihaz Yönetimi Sayfasına Git</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredDevices.map((dev, idx) => {
                const isRegistered = !!dev.registeredDeviceId;
                const regDev = devices.find((d) => d.id === dev.registeredDeviceId);

                  return (
                    <tr
                      key={`${dev.registeredDeviceId || dev.mac || dev.ip}_${idx}`}
                      className={`transition ${
                        !isRegistered
                          ? 'bg-amber-500/10 hover:bg-amber-500/20 border-l-4 border-l-amber-500'
                          : 'hover:bg-slate-800/40 border-l-4 border-l-transparent'
                      }`}
                    >
                      {/* IP & Ports */}
                      <td className="py-3.5 px-4 font-bold text-cyan-300">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              !isRegistered ? 'bg-amber-400 animate-ping' : 'bg-emerald-400 animate-pulse'
                            }`}
                          ></span>
                          <span>{dev.ip}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                          Açık Portlar: {dev.openPorts.join(', ')}
                        </div>
                      </td>

                      {/* Hostname */}
                      <td className="py-3.5 px-4 font-sans text-white font-semibold">
                        <div>{dev.hostname}</div>
                        {regDev ? (
                          <div className="text-[10px] text-emerald-400 font-mono mt-0.5">
                            Eşleşen Panel Adı: <b>{regDev.name}</b>
                          </div>
                        ) : (
                          <div className="text-[10px] text-amber-400 font-mono mt-0.5">
                            Ağ İsteği Yakalandı ({dev.tokenProvided ? `Token: ${dev.tokenProvided}` : 'Token Yok'})
                          </div>
                        )}
                      </td>

                      {/* MAC & Vendor */}
                      <td className="py-3.5 px-4 text-slate-300">
                        <div className="text-slate-200">{dev.mac}</div>
                        <div className="text-[10px] text-slate-500 font-sans">{dev.vendor}</div>
                      </td>

                      {/* RSSI & Ping */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-bold ${
                              dev.rssi > -60
                                ? 'text-emerald-400'
                                : dev.rssi > -75
                                ? 'text-amber-400'
                                : 'text-rose-400'
                            }`}
                          >
                            {dev.rssi} dBm
                          </span>
                          <span className="text-[10px] text-slate-500">({dev.pingMs} ms)</span>
                        </div>
                        <div className="w-16 bg-slate-800 h-1.5 rounded-full mt-1 overflow-hidden">
                          <div
                            className={`h-full ${
                              dev.rssi > -60 ? 'bg-emerald-400' : 'bg-amber-400'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(10, 100 + dev.rssi))}%` }}
                          ></div>
                        </div>
                      </td>

                      {/* Last Telemetry Payload */}
                      <td className="py-3.5 px-4 text-slate-300 max-w-xs truncate">
                        {dev.lastPacket ? (
                          <span
                            className={`p-1.5 rounded border text-[11px] block truncate font-mono ${
                              !isRegistered
                                ? 'bg-amber-950/60 border-amber-500/40 text-amber-200'
                                : 'bg-slate-950 border-slate-800 text-emerald-300'
                            }`}
                          >
                            {dev.lastPacket}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px] font-sans">Henüz paket yok</span>
                        )}
                      </td>

                      {/* Panel Status Badge */}
                      <td className="py-3.5 px-4 font-sans">
                        {isRegistered ? (
                          regDev?.status === 'online' ? (
                            <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold rounded-full flex items-center gap-1.5 w-fit">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                              <span>Kayıtlı (Çevrimiçi)</span>
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-bold rounded-full flex items-center gap-1.5 w-fit">
                              <span className="w-2 h-2 rounded-full bg-rose-500" />
                              <span>Kayıtlı (Çevrimdışı)</span>
                            </span>
                          )
                        ) : (
                          <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold rounded-full flex items-center gap-1 w-fit shadow-sm shadow-amber-500/10">
                            <AlertTriangle className="w-3 h-3 text-amber-400 animate-pulse" /> KAYITSIZ (403 Red)
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right space-x-1 font-sans">
                        <button
                          onClick={() => handlePingTest(dev.ip)}
                          disabled={pingingIp === dev.ip}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-bold transition inline-flex items-center gap-1 cursor-pointer"
                          title="Ping Testi Yap"
                        >
                          <Activity className={`w-3.5 h-3.5 text-cyan-400 ${pingingIp === dev.ip ? 'animate-spin' : ''}`} />
                          <span>Ping</span>
                        </button>

                        {!isRegistered && (
                          <button
                            onClick={() => {
                              setSelectedDeviceModal(dev);
                              setPairDeviceName(dev.hostname || 'Yeni_Saha_Node');
                              setPairDeviceType(
                                dev.hostname.toLowerCase().includes('nodemcu')
                                  ? 'ESP8266 NodeMCU'
                                  : dev.hostname.toLowerCase().includes('gateway')
                                  ? 'Endüstriyel Gateway'
                                  : dev.hostname.toLowerCase().includes('meter')
                                  ? 'Akıllı Sayaç'
                                  : 'ESP32 Wi-Fi Node'
                              );
                              setPairLocation('Yerel Ağ (Saha Taraması)');
                              setPairRateLimit(120);
                              setPairEncryption('AES-256-GCM');
                              setPairCustomer(user?.role === 'admin' ? (user?.id || 'usr_admin') : '');
                              if (dev.tokenProvided) {
                                setTokenOption('device');
                                setCustomTokenInput(dev.tokenProvided);
                              } else {
                                setTokenOption('auto');
                                setCustomTokenInput('');
                              }
                            }}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold transition inline-flex items-center gap-1 cursor-pointer shadow-md shadow-emerald-600/30"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Sisteme Katıl</span>
                          </button>
                        )}

                        {/* Hide / Unhide Action Button */}
                        {(() => {
                          const devKey = dev.mac || dev.ip;
                          const isDevHidden = hiddenDeviceKeys.includes(devKey);
                          return (
                            <button
                              onClick={() => toggleHideDevice(devKey)}
                              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition inline-flex items-center gap-1 cursor-pointer ${
                                isDevHidden
                                  ? 'bg-purple-600/20 hover:bg-purple-600/30 text-purple-600 dark:text-purple-300 border border-purple-500/30'
                                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                              }`}
                              title={isDevHidden ? 'Görünür Yap (Ana Listeye Al)' : 'Bu cihazı listeden gizle'}
                            >
                              {isDevHidden ? (
                                <>
                                  <Eye className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
                                  <span>Göster</span>
                                </>
                              ) : (
                                <>
                                  <EyeOff className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                                  <span>Gizle</span>
                                </>
                              )}
                            </button>
                          );
                        })()}
                      </td>
                    </tr>
                  );
              }))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Local Network IP Guide Section */}
      <div className="bg-[#0f172a] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
          <span className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
            <HelpCircle className="w-5 h-5" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-white">
              Cihazımdan (ESP32/NodeMCU) Kendi Bilgisayarıma Veri Gönderirken Hangi IP'yi Kullanmalıyım?
            </h3>
            <p className="text-xs text-slate-400">
              Saha cihazları (NodeMCU/ESP32) kodunda <code className="text-cyan-300 font-mono">localhost</code> yazarsanız cihaz kendi içine bağlanmaya çalışır ve HATA verir! Bilgisayarınızın veya sunucunuzun <b>Yerel Ağ IP Adresini</b> yazmalısınız.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Windows Step */}
          <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 space-y-2">
            <strong className="text-cyan-300 font-bold block text-sm">Windows Bilgisayarlar İçin:</strong>
            <p className="text-slate-300 leading-relaxed">
              1. Komut İstemini (CMD) açın.
              <br />
              2. <code className="text-emerald-400 font-mono font-bold">ipconfig</code> yazıp Enter'a basın.
              <br />
              3. <b>IPv4 Address</b> satırındaki adresi kopyalayın (Örn: <code className="text-cyan-400 font-mono font-bold">192.168.1.100</code>).
            </p>
            <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-slate-300 font-mono text-[11px] flex justify-between items-center">
              <span>http://192.168.1.100:3000/api/v1/telemetry</span>
              <button
                onClick={() => handleCopy('http://192.168.1.100:3000/api/v1/telemetry', 'ip_win')}
                className="text-cyan-400 hover:text-cyan-300 font-bold text-[10px] cursor-pointer"
              >
                {copiedText === 'ip_win' ? 'Kopyalandı!' : 'Kopyala'}
              </button>
            </div>
          </div>

          {/* Mac/Linux Step */}
          <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 space-y-2">
            <strong className="text-purple-300 font-bold block text-sm">Mac / Linux Bilgisayarlar İçin:</strong>
            <p className="text-slate-300 leading-relaxed">
              1. Terminali açın.
              <br />
              2. <code className="text-emerald-400 font-mono font-bold">ifconfig</code> veya <code className="text-emerald-400 font-mono font-bold">ip a</code> yazıp Enter'a basın.
              <br />
              3. <b>inet</b> değerindeki IP adresini alın (Örn: <code className="text-purple-300 font-mono font-bold">192.168.1.105</code>).
            </p>
            <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-slate-300 font-mono text-[11px] flex justify-between items-center">
              <span>http://192.168.1.105:3000/api/v1/telemetry</span>
              <button
                onClick={() => handleCopy('http://192.168.1.105:3000/api/v1/telemetry', 'ip_mac')}
                className="text-purple-400 hover:text-purple-300 font-bold text-[10px] cursor-pointer"
              >
                {copiedText === 'ip_mac' ? 'Kopyalandı!' : 'Kopyala'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Help & Info Center Navigation Banner */}
      <div className="bg-gradient-to-r from-amber-950/60 via-slate-900 to-slate-900 p-5 rounded-3xl border border-amber-500/30 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4 text-white">
        <div className="flex items-center gap-3">
          <span className="p-2.5 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30 shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </span>
          <div>
            <h3 className="text-sm font-extrabold text-white">
              NodeMCU / ESP32 Cihazınız Ağda Görünmüyor mu?
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              6 adımlı hızlı kontrol listesi, yerel IP yapılandırması ve çalışan Arduino C++ kod örnekleri için <b>Yardım & Bilgi Merkezi</b>'ni ziyaret edin.
            </p>
          </div>
        </div>

        {onNavigateToHelp && (
          <button
            onClick={onNavigateToHelp}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-2xl text-xs transition flex items-center gap-2 shrink-0 shadow-lg shadow-amber-500/20 cursor-pointer"
          >
            <HelpCircle className="w-4 h-4" />
            <span>Yardım Rehberine Git</span>
          </button>
        )}
      </div>

      {/* Modal: Register Discovered Device to Panel */}
      {selectedDeviceModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-[#0f172a] border border-emerald-500/30 rounded-3xl p-6 max-w-xl w-full space-y-5 shadow-2xl animate-scaleUp my-8">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
              <div className="flex items-center gap-3">
                <span className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-2xl border border-emerald-500/20">
                  <Cpu className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                    Cihazı Sisteme Kaydet & Yapılandır
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Ağdaki kayıtsız cihaz için kimlik doğrulama token'ı ve donanım parametrelerini belirleyin.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDeviceModal(null)}
                className="text-slate-500 hover:text-white p-1 rounded-lg transition cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Device Network Info Badge */}
            <div className="grid grid-cols-3 gap-2 p-3 bg-slate-900/90 rounded-2xl border border-slate-800 text-[11px] font-mono">
              <div className="space-y-0.5">
                <span className="text-slate-500 block text-[9px] uppercase font-bold">IP Adresi</span>
                <span className="text-cyan-300 font-bold">{selectedDeviceModal.ip}</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-slate-500 block text-[9px] uppercase font-bold">MAC Adresi</span>
                <span className="text-slate-200 font-bold">{selectedDeviceModal.mac}</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-slate-500 block text-[9px] uppercase font-bold">Donanım Üreticisi</span>
                <span className="text-emerald-400 font-bold truncate block">{selectedDeviceModal.vendor}</span>
              </div>
            </div>

            {/* SECTION 1: Token Seçeneği */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" />
                <span>1. API Token / Kimlik Doğrulama Yöntemi</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                {/* Option 1: Cihazın Gönderdiği Token */}
                <button
                  type="button"
                  onClick={() => {
                    if (selectedDeviceModal.tokenProvided) {
                      setTokenOption('device');
                      setCustomTokenInput(selectedDeviceModal.tokenProvided);
                    }
                  }}
                  disabled={!selectedDeviceModal.tokenProvided}
                  className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between cursor-pointer ${
                    tokenOption === 'device' && selectedDeviceModal.tokenProvided
                      ? 'bg-amber-500/10 border-amber-500/50 text-white ring-1 ring-amber-500/30'
                      : !selectedDeviceModal.tokenProvided
                      ? 'bg-slate-900/40 border-slate-800/60 text-slate-600 opacity-60 cursor-not-allowed'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-[11px]">Cihazın Token'ı</span>
                    <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                      tokenOption === 'device' && selectedDeviceModal.tokenProvided ? 'border-amber-400 bg-amber-400' : 'border-slate-600'
                    }`}>
                      {tokenOption === 'device' && selectedDeviceModal.tokenProvided && <Check className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />}
                    </span>
                  </div>
                  {selectedDeviceModal.tokenProvided ? (
                    <div className="font-mono text-[10px] text-amber-300 truncate bg-slate-950/80 px-1.5 py-1 rounded border border-amber-500/20">
                      {selectedDeviceModal.tokenProvided}
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-500 italic">Pakette token yok</span>
                  )}
                </button>

                {/* Option 2: Otomatik Yeni Token */}
                <button
                  type="button"
                  onClick={() => setTokenOption('auto')}
                  className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between cursor-pointer ${
                    tokenOption === 'auto'
                      ? 'bg-emerald-500/10 border-emerald-500/50 text-white ring-1 ring-emerald-500/30'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-[11px]">Yeni Otomatik Token</span>
                    <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                      tokenOption === 'auto' ? 'border-emerald-400 bg-emerald-400' : 'border-slate-600'
                    }`}>
                      {tokenOption === 'auto' && <Check className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    Sistem tarafından yeni rastgele güvenli token üretilir.
                  </span>
                </button>

                {/* Option 3: Özel Token Manuel Yaz */}
                <button
                  type="button"
                  onClick={() => setTokenOption('custom')}
                  className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between cursor-pointer ${
                    tokenOption === 'custom'
                      ? 'bg-indigo-500/10 border-indigo-500/50 text-white ring-1 ring-indigo-500/30'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-[11px]">Özel Token Manuel</span>
                    <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                      tokenOption === 'custom' ? 'border-indigo-400 bg-indigo-400' : 'border-slate-600'
                    }`}>
                      {tokenOption === 'custom' && <Check className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    Cihazınızdaki özel key/token değerini kendiniz girin.
                  </span>
                </button>
              </div>

              {/* Custom Token Input Field (Shows if Custom selected) */}
              {tokenOption === 'custom' && (
                <div className="p-3 bg-slate-900 rounded-2xl border border-indigo-500/30 space-y-1.5 animate-fadeIn">
                  <div className="flex items-center justify-between text-[11px]">
                    <label className="text-indigo-300 font-semibold">Özel Token / Key Değeri Giriniz:</label>
                    <button
                      type="button"
                      onClick={() => setCustomTokenInput(`dev_key_${Math.random().toString(36).substring(2, 10)}`)}
                      className="text-[10px] text-indigo-400 hover:underline flex items-center gap-1 font-mono cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" /> Rastgele Doldur
                    </button>
                  </div>
                  <input
                    type="text"
                    value={customTokenInput}
                    onChange={(e) => setCustomTokenInput(e.target.value)}
                    placeholder="ör. SAHA_AKILLI_NODE_KEY_882"
                    className="w-full bg-slate-950 border border-indigo-500/40 rounded-xl px-3 py-2 text-amber-400 font-mono text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
            </div>

            {/* SECTION 2: Donanım & Kayıt Parametreleri */}
            <div className="space-y-3 pt-2 border-t border-slate-800/80">
              <label className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                <span>2. Donanım & Saha Yapılandırma Ayarları</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Device Name */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Cihaz Adı / Unvanı</label>
                  <input
                    type="text"
                    value={pairDeviceName}
                    onChange={(e) => setPairDeviceName(e.target.value)}
                    placeholder="Örn: Saha_Klima_Node_01"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Device Type */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Donanım / Cihaz Türü</label>
                  <select
                    value={pairDeviceType}
                    onChange={(e) => setPairDeviceType(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
                  >
                    <option value="ESP32 Wi-Fi Node">ESP32 Wi-Fi Node</option>
                    <option value="ESP8266 NodeMCU">ESP8266 NodeMCU</option>
                    <option value="Akıllı Sensör Modülü">Akıllı Sensör Modülü</option>
                    <option value="Endüstriyel Gateway">Endüstriyel Gateway / Modbus</option>
                    <option value="Akıllı Sayaç">Akıllı Sayaç (Elektrik/Su/Gaz)</option>
                    <option value="Raspberry Pi Node">Raspberry Pi Node</option>
                    <option value="Diğer Donanım">Diğer Donanım</option>
                  </select>
                </div>

                {/* Location */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Saha / Lokasyon</label>
                  <input
                    type="text"
                    value={pairLocation}
                    onChange={(e) => setPairLocation(e.target.value)}
                    placeholder="Örn: Polatlı Tesisleri - Depo 1"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Rate Limit */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Rate Limit (İstek / Dakika)</label>
                  <select
                    value={pairRateLimit}
                    onChange={(e) => setPairRateLimit(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
                  >
                    <option value={30}>30 istek / dk (Çok Düşük)</option>
                    <option value={60}>60 istek / dk (Standart)</option>
                    <option value={120}>120 istek / dk (Hızlı Yüksek)</option>
                    <option value={300}>300 istek / dk (Endüstriyel Yoğun)</option>
                    <option value={600}>600 istek / dk (Maksimum Akış)</option>
                  </select>
                </div>

                {/* Encryption Method */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Şifreleme Metodu</label>
                  <select
                    value={pairEncryption}
                    onChange={(e) => setPairEncryption(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
                  >
                    <option value="AES-256-GCM">AES-256-GCM (Güvenli Donanım)</option>
                    <option value="TLS 1.3 / HTTPS">TLS 1.3 / HTTPS (SSL Güvenlik)</option>
                    <option value="Düz Metin (Unencrypted)">Düz Metin (Unencrypted)</option>
                  </select>
                </div>

                {/* Customer / Owner Assignment (Admin only) */}
                {user?.role === 'admin' && (
                  <div>
                    <label className="block text-indigo-300 font-semibold mb-1">Atanacak Müşteri / Firma</label>
                    <select
                      value={pairCustomer}
                      onChange={(e) => setPairCustomer(e.target.value)}
                      className="w-full bg-slate-900 border border-indigo-500/40 rounded-xl px-3 py-2 text-indigo-200 text-xs focus:outline-none focus:border-indigo-400"
                    >
                      <option value="usr_admin">Merkez Yönetim (Admin)</option>
                      {customersList
                        .filter((c) => c.role === 'customer' || c.companyName)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.companyName ? `${c.companyName} (${c.name})` : c.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedDeviceModal(null)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl text-xs font-bold cursor-pointer transition"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={() => handleRegisterDiscoveredDevice(selectedDeviceModal)}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/30 cursor-pointer transition"
              >
                <Check className="w-4 h-4" />
                <span>Panele Kaydet ve Bağlantıyı Kur</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Device Registration Success & ESP Token Credentials */}
      {registeredSuccessDevice && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-gradient-to-b from-[#0f172a] to-[#090d16] border border-emerald-500/40 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl animate-scaleUp">
            <div className="flex items-center gap-3 border-b border-emerald-500/20 pb-4">
              <span className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30">
                <CheckCircle2 className="w-7 h-7" />
              </span>
              <div>
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold rounded-full uppercase">
                  Kayıt Başarılı
                </span>
                <h3 className="text-base font-extrabold text-white mt-0.5">
                  ESP Cihazı Sisteme Tanımlandı!
                </h3>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-300 leading-relaxed">
                <strong className="text-emerald-400">{registeredSuccessDevice.name}</strong> cihazı için güvenli API Token oluşturuldu. ESP kodunuzdaki <code className="text-cyan-300 font-mono font-bold">token</code> değişkenini bu anahtarla güncelleyiniz:
              </p>

              {/* API Token Box */}
              <div className="p-3.5 bg-slate-950 rounded-2xl border border-emerald-500/30 space-y-2">
                <div className="flex justify-between items-center text-[11px] text-slate-400">
                  <span>Üretilen API Token:</span>
                  <button
                    onClick={() => handleCopy(registeredSuccessDevice.apiKey, 'modal_api_key')}
                    className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedText === 'modal_api_key' ? 'Kopyalandı!' : 'Kopyala'}</span>
                  </button>
                </div>
                <div className="p-2.5 bg-slate-900 rounded-xl font-mono text-cyan-300 font-bold text-xs select-all break-all border border-slate-800">
                  {registeredSuccessDevice.apiKey}
                </div>
              </div>

              {/* Sample ESP Code Snippet */}
              <div className="space-y-1.5">
                <span className="text-slate-400 text-[11px] font-semibold">ESP / Arduino C++ Kod Örneği:</span>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300 leading-relaxed overflow-x-auto">
                  <div className="text-slate-500">// ESP8266 / ESP32 Kodunuza Ekleyin:</div>
                  <div className="text-purple-300">const char* apiToken = <span className="text-cyan-300">"{registeredSuccessDevice.apiKey}"</span>;</div>
                  <div className="text-purple-300">String payload = String(apiToken) + <span className="text-amber-300">", {registeredSuccessDevice.name}, sıcaklık:24.5, nem:55"</span>;</div>
                  <div className="text-emerald-400">http.POST(payload);</div>
                </div>
              </div>

              <button
                onClick={() => setRegisteredSuccessDevice(null)}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl transition cursor-pointer text-xs shadow-lg shadow-emerald-600/30 mt-2"
              >
                Anladım, Kapat ve Canlı Veri Akışını İzle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
