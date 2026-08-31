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
  UserPlus,
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
  QrCode,
  UserCheck,
  MapPin,
  Layers,
} from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';
import type { Device, DiscoveredNetworkDevice } from '../types';

export const NetworkDiscoveryView: React.FC<{
  onNavigateToDevices?: () => void;
  onNavigateToHelp?: () => void;
}> = ({ onNavigateToDevices, onNavigateToHelp }) => {
  const { devices, createNewDevice, refreshDevices, customersList } = useRealtime();
  const { user } = useAuth();
  
  const [pairingCode, setPairingCode] = useState('');
  const [isScanningQR, setIsScanningQR] = useState(false);
  const [qrScanError, setQrScanError] = useState<string | null>(null);
  const [manualQrCode, setManualQrCode] = useState('');
  const [scannerKey, setScannerKey] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredNetworkDevice[]>([]);
  const [foundDevice, setFoundDevice] = useState<DiscoveredNetworkDevice | null>(null);
  
  const [registering, setRegistering] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [selectedTenant, setSelectedTenant] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('Merkez Tesis');

  // Modal for assigning unregistered device directly to user/tenant
  const [assignModalDevice, setAssignModalDevice] = useState<DiscoveredNetworkDevice | null>(null);
  const [assignName, setAssignName] = useState('');
  const [assignType, setAssignType] = useState('ESP32');
  const [assignTenantId, setAssignTenantId] = useState('');
  const [assignLocation, setAssignLocation] = useState('Merkez Tesis');
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignSuccessMessage, setAssignSuccessMessage] = useState<string | null>(null);
  
  const fetchDiscovered = async () => {
    try {
      const res = await fetch('/api/network/discovered');
      if (res.ok) {
        const data = await res.json();
        setDiscoveredDevices(data.filter((d: any) => d.status === 'unregistered'));
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchDiscovered();
    const intv = setInterval(fetchDiscovered, 3000);
    return () => clearInterval(intv);
  }, []);

  const handleSearch = (codeToSearch?: string) => {
    const code = typeof codeToSearch === 'string' ? codeToSearch : pairingCode.trim();
    if (!code) return;
    setIsSearching(true);
    
    setTimeout(() => {
      // Find device in pending list
      const explicitMatch = discoveredDevices.find((d) => d.pairingCode === code);
      
      if (explicitMatch) {
        setFoundDevice(explicitMatch);
        setDeviceName(explicitMatch.hostname || 'Yeni ESP Cihazı');
      } else {
        alert('Bu eşleştirme koduyla bekleyen bir cihaz bulunamadı. Cihazın açık ve internete bağlı olduğundan emin olun.');
        setFoundDevice(null);
      }
      setIsSearching(false);
    }, 800);
  };

  const handleQRScan = (text: string) => {
    if (!text) return;
    let code = text;
    try {
       const url = new URL(text);
       if (url.searchParams.has('code')) code = url.searchParams.get('code') || text;
    } catch(e) {}
    try {
       const obj = JSON.parse(text);
       if (obj.pairingCode) code = obj.pairingCode;
    } catch(e) {}
    
    setPairingCode(code);
    setIsScanningQR(false);
    handleSearch(code);
  };

  const handleRegister = async () => {
    if (!foundDevice) return;
    setRegistering(true);
    
    try {
      const payload = {
        name: deviceName || foundDevice.hostname || 'Yeni Cihaz',
        type: foundDevice.vendor || 'ESP32',
        location: selectedLocation,
        ipAddress: foundDevice.ip,
        macAddress: foundDevice.mac,
        userId: user?.role === 'admin' ? selectedTenant : user?.id,
        apiKey: '__USE_CACHED_TOKEN__',
        rateLimitPerMin: 120,
        encryptionMethod: 'AES-256-GCM',
        isSimulated: false
      };
      
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        alert('Cihaz başarıyla eklendi ve hesabınızla eşleştirildi!');
        setFoundDevice(null);
        setPairingCode('');
        refreshDevices();
        fetchDiscovered();
        if (onNavigateToDevices) onNavigateToDevices();
      } else {
        const data = await res.json();
        alert('Hata: ' + (data.error || 'Cihaz eklenemedi.'));
      }
    } catch (err) {
      alert('Ağ hatası oluştu.');
    } finally {
      setRegistering(false);
    }
  };

  // Open modal to assign a specific device directly
  const openAssignModal = (dev: DiscoveredNetworkDevice) => {
    setAssignModalDevice(dev);
    setAssignName(dev.hostname || dev.hardwareModel || 'Yeni ESP Cihazı');
    setAssignType(dev.vendor || dev.hardwareModel || 'ESP32');
    setAssignLocation('Merkez Tesis');
    // Default to current user or first customer
    setAssignTenantId(user?.id || '');
    setAssignSuccessMessage(null);
  };

  const handleDirectAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignModalDevice) return;
    setAssignLoading(true);

    try {
      const payload = {
        name: assignName.trim() || assignModalDevice.hostname || 'Yeni ESP Cihazı',
        type: assignType.trim() || 'ESP32',
        location: assignLocation.trim() || 'Merkez Tesis',
        ipAddress: assignModalDevice.ip,
        macAddress: assignModalDevice.mac,
        userId: assignTenantId || user?.id,
        apiKey: '__USE_CACHED_TOKEN__',
        rateLimitPerMin: 120,
        encryptionMethod: 'AES-256-GCM',
        isSimulated: false,
      };

      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setAssignSuccessMessage('Cihaz başarıyla seçilen kullanıcıya atandı ve sisteme kaydedildi!');
        refreshDevices();
        fetchDiscovered();
        setTimeout(() => {
          setAssignModalDevice(null);
          setAssignSuccessMessage(null);
        }, 1200);
      } else {
        const data = await res.json();
        alert('Hata: ' + (data.error || 'Cihaz kullanıcıya atanamadı.'));
      }
    } catch (err) {
      alert('Ağ hatası oluştu. Lütfen tekrar deneyin.');
    } finally {
      setAssignLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 lg:space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <Radio className="w-8 h-8 text-indigo-500" />
            Cihaz Keşfi ve Eşleştirme
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Ağda tespit edilen fiziksel donanımları güvenli eşleştirme koduyla hesabınıza bağlayın veya doğrudan bir kullanıcıya atayın.
          </p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sol Taraf: Arama ve Eşleştirme */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Eşleştirme Kodu ile Cihaz Bul</h2>
            <div className="flex gap-3">
              <input
                type="text"
                value={pairingCode}
                onChange={(e) => setPairingCode(e.target.value)}
                placeholder="Örn: 482913"
                className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-lg font-mono text-center tracking-widest focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button
                onClick={() => {
                  setQrScanError(null);
                  setManualQrCode('');
                  setIsScanningQR(true);
                }}
                title="Kare Kod (QR) Okut"
                className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 rounded-xl font-medium transition flex items-center justify-center"
              >
                <QrCode className="w-5 h-5" />
              </button>
              <button
                onClick={() => handleSearch()}
                disabled={isSearching || !pairingCode.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-500 text-white px-6 rounded-xl font-medium transition flex items-center gap-2 shrink-0"
              >
                {isSearching ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                Bul
              </button>
            </div>
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              * Cihazınızı ilk kez enerjiye bağladığınızda seri port ekranında veya yapılandırma sayfasında gösterilen tek kullanımlık 6 haneli eşleştirme kodunu girin veya cihaz üzerindeki Kare Kodu okutun.
            </p>
          </div>

          {foundDevice && (
            <div className="bg-white dark:bg-slate-900 border border-emerald-500/30 rounded-2xl p-6 shadow-sm ring-1 ring-emerald-500/10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Cihaz Bulundu!</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Cihaz kimliği doğrulandı ve eşleşmeye hazır.</p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Cihaz Modeli</div>
                    <div className="font-medium text-slate-900 dark:text-white text-sm">{foundDevice.hardwareModel || foundDevice.vendor}</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Rol / Görev</div>
                    <div className="font-medium text-slate-900 dark:text-white text-sm">{foundDevice.roleKey || 'GENEL_GOREV'}</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Yazılım Sürümü</div>
                    <div className="font-medium text-slate-900 dark:text-white text-sm">{foundDevice.firmwareVersion || 'v1.0.0'}</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Son Görülme</div>
                    <div className="font-medium text-slate-900 dark:text-white text-sm">{foundDevice.lastSeen ? new Date(foundDevice.lastSeen).toLocaleTimeString() : '-'}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                <h4 className="font-semibold text-slate-900 dark:text-white">Cihazı Hesaba Kaydet</h4>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Cihaz Adı</label>
                  <input
                    type="text"
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 outline-none dark:text-white text-sm"
                  />
                </div>
                
                {user?.role === 'admin' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Hedef Müşteri / Kullanıcı</label>
                    <select
                      value={selectedTenant}
                      onChange={(e) => setSelectedTenant(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 outline-none dark:text-white text-sm"
                    >
                      <option value="">Seçiniz...</option>
                      <option value={user.id}>Yönetici (Kendim) - {user.name}</option>
                      {customersList?.map(c => (
                        <option key={c.id} value={c.id}>{c.companyName ? `${c.companyName} (${c.name})` : c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  onClick={handleRegister}
                  disabled={registering || (user?.role === 'admin' && !selectedTenant)}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-500 text-white font-medium py-3 rounded-xl transition flex items-center justify-center gap-2"
                >
                  {registering ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                  Cihazı Hesabıma Ekle
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sağ Taraf: Admin Bekleyen Cihazlar veya Bilgi */}
        <div className="space-y-6">
          {user?.role === 'admin' || user?.role === 'operator' ? (
             <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col h-[600px]">
               <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                 <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                   <Server className="w-5 h-5 text-indigo-500" />
                   Havuzdaki Kayıtsız Cihazlar
                 </h2>
                 <div className="flex items-center gap-2">
                   <button
                     onClick={fetchDiscovered}
                     className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                     title="Yenile"
                   >
                     <RefreshCw className="w-4 h-4" />
                   </button>
                   <div className="text-xs font-semibold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800/40">
                     {discoveredDevices.length} Bekleyen
                   </div>
                 </div>
               </div>
               <div className="flex-1 overflow-y-auto p-3">
                 {discoveredDevices.length === 0 ? (
                   <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                     <Wifi className="w-12 h-12 mb-3 opacity-20" />
                     <p className="text-sm font-medium">Eşleştirme bekleyen kayıtsız cihaz bulunmuyor.</p>
                     <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">Ağdaki ESP cihazınız ilk verisini veya katılım isteğini gönderdiğinde burada listelenecektir.</p>
                   </div>
                 ) : (
                   <div className="space-y-3">
                     {discoveredDevices.map((d, i) => (
                       <div key={i} className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-indigo-500/40 transition">
                         <div className="space-y-1">
                           <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                             <span>{d.hardwareModel || d.hostname || 'Bilinmeyen ESP'}</span>
                             {d.pairingCode && (
                               <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded font-mono font-bold">
                                 Kod: {d.pairingCode}
                               </span>
                             )}
                             <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded font-medium">
                               Kayıtsız
                             </span>
                           </div>
                           <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                             IP: <span className="text-slate-700 dark:text-slate-300">{d.ip}</span> • MAC: <span className="text-slate-700 dark:text-slate-300">{d.mac}</span>
                           </div>
                           <div className="text-xs text-slate-400">
                             Sürüm: {d.firmwareVersion || 'v1.0'} | Son sinyal: {d.lastSeen ? new Date(d.lastSeen).toLocaleTimeString() : '-'}
                           </div>
                         </div>
                         <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                           {/* Kullanıcıya Ekle / Ata Butonu */}
                           <button 
                             onClick={() => openAssignModal(d)}
                             className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 rounded-lg shadow-sm transition"
                             title="Bu cihazı seçilen bir kullanıcıya/müşteriye ata ve sisteme ekle"
                           >
                             <UserPlus className="w-3.5 h-3.5" />
                             <span>Kullanıcıya Ekle</span>
                           </button>

                           {/* Kodu Sol Forma Aktar */}
                           <button 
                             onClick={() => {
                               setPairingCode(d.pairingCode || '');
                               if (d.pairingCode) handleSearch(d.pairingCode);
                             }}
                             className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/40 rounded-lg transition"
                             title="Eşleştirme kodunu sol arama kutusuna aktar"
                           >
                             <Key className="w-3.5 h-3.5" />
                             <span className="hidden sm:inline">Kodu Aktar</span>
                           </button>
                         </div>
                       </div>
                     ))}
                   </div>
                 )}
               </div>
             </div>
          ) : (
            <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-indigo-500" />
                Cihaz Eşleştirme Nasıl Çalışır?
              </h3>
              <ul className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">1</div>
                  <p>ESP/IoT cihazınızı yerel ağınıza (Wi-Fi) bağlayın.</p>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">2</div>
                  <p>Cihaz otomatik olarak merkezi sunucuya bir "Katılım (Announce)" paketi gönderir ve havuzda beklemeye başlar.</p>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">3</div>
                  <p>Cihaz ekranında, seri port konsolunda veya kutu etiketinde yazan <strong>6 Haneli Eşleştirme Kodunu</strong> sol tarafa girin.</p>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">4</div>
                  <p>Kod eşleştiğinde veya Admin tarafından kullanıcıya atandığında, cihaz kriptografik olarak doğrudan hedeflenen kullanıcının hesabına bağlanır.</p>
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Admin Cihazı Kullanıcıya Ekle & Ata Modalı */}
      {assignModalDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-lg">Cihazı Kullanıcıya Ekle & Ata</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Havuzdaki kayıtsız cihazı doğrudan hedef hesaba bağlayın.</p>
                </div>
              </div>
              <button
                onClick={() => setAssignModalDevice(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg transition"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {assignSuccessMessage ? (
              <div className="p-8 flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="text-lg font-bold text-slate-900 dark:text-white">İşlem Başarılı!</h4>
                <p className="text-sm text-slate-600 dark:text-slate-300">{assignSuccessMessage}</p>
              </div>
            ) : (
              <form onSubmit={handleDirectAssign} className="p-6 space-y-4">
                {/* Cihaz Donanım Özeti */}
                <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Cihaz Donanım Bilgisi</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-slate-400">IP:</span> <span className="font-mono font-medium text-slate-700 dark:text-slate-200">{assignModalDevice.ip}</span></div>
                    <div><span className="text-slate-400">MAC:</span> <span className="font-mono font-medium text-slate-700 dark:text-slate-200">{assignModalDevice.mac}</span></div>
                    <div><span className="text-slate-400">Model:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{assignModalDevice.hardwareModel || assignModalDevice.vendor || 'ESP32'}</span></div>
                    {assignModalDevice.pairingCode && (
                      <div><span className="text-slate-400">Kod:</span> <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{assignModalDevice.pairingCode}</span></div>
                    )}
                  </div>
                </div>

                {/* Hedef Kullanıcı / Müşteri Seçimi */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-indigo-500" />
                    Hedef Müşteri / Kullanıcı Hesabı <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={assignTenantId}
                    onChange={(e) => setAssignTenantId(e.target.value)}
                    required
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                  >
                    {user && (
                      <option value={user.id}>
                        Yönetici (Kendim) - {user.name} ({user.email})
                      </option>
                    )}
                    {customersList?.filter(c => c.id !== user?.id).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.companyName ? `${c.companyName} — ` : ''}{c.name} ({c.email})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Cihaz Adı */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-indigo-500" />
                    Cihaz Adı / Tanımı <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={assignName}
                    onChange={(e) => setAssignName(e.target.value)}
                    placeholder="Örn: Hat-1 ESP32 Telemetri Modülü"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Cihaz Türü */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-indigo-500" />
                      Cihaz Tipi
                    </label>
                    <select
                      value={assignType}
                      onChange={(e) => setAssignType(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                    >
                      <option value="ESP32">ESP32 (Wi-Fi + BLE)</option>
                      <option value="NodeMCU">NodeMCU (ESP8266)</option>
                      <option value="STM32">STM32 IoT Gateway</option>
                      <option value="Raspberry Pi">Raspberry Pi Edge</option>
                      <option value="Arduino">Arduino IoT</option>
                    </select>
                  </div>

                  {/* Konum */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                      Kurulum Konumu
                    </label>
                    <input
                      type="text"
                      value={assignLocation}
                      onChange={(e) => setAssignLocation(e.target.value)}
                      placeholder="Örn: Fabrika Kat-2"
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                    />
                  </div>
                </div>

                <div className="pt-3 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setAssignModalDevice(null)}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition"
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    disabled={assignLoading || !assignName.trim() || !assignTenantId}
                    className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl shadow-md transition flex items-center justify-center gap-2"
                  >
                    {assignLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                    Kullanıcıya Ata ve Kaydet
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {isScanningQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <QrCode className="w-5 h-5 text-indigo-500" />
                Cihaz Kare Kodunu Okutun
              </h3>
              <button
                onClick={() => {
                  setIsScanningQR(false);
                  setQrScanError(null);
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg transition"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="p-4 relative bg-black flex justify-center items-center aspect-square overflow-hidden">
              {qrScanError ? (
                <div className="absolute inset-0 bg-slate-900 p-6 flex flex-col items-center justify-center text-center space-y-4">
                  <ShieldAlert className="w-12 h-12 text-amber-500 animate-pulse" />
                  <div className="space-y-1">
                    <h4 className="font-semibold text-white text-base">Kamera İzni Reddedildi veya Erişilemedi</h4>
                    <p className="text-xs text-slate-300 max-w-xs leading-relaxed">
                      {qrScanError}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setQrScanError(null);
                      setScannerKey((k) => k + 1);
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-4 py-2.5 rounded-xl font-medium transition flex items-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Kamerayı Tekrar Dene
                  </button>
                </div>
              ) : (
                <>
                  <div className="absolute inset-0 overflow-hidden" key={scannerKey}>
                    <Scanner
                      onScan={(detectedCodes) => {
                        if (detectedCodes && detectedCodes.length > 0) {
                          handleQRScan(detectedCodes[0].rawValue);
                        }
                      }}
                      onError={(error: any) => {
                        console.warn('QR Scan Error:', error);
                        let msg = 'Kamera erişim hatası oluştu.';
                        const str = typeof error === 'object' ? JSON.stringify(error) : String(error);
                        if (
                          str.includes('permission-denied') ||
                          str.includes('Permission dismissed') ||
                          str.includes('NotAllowedError') ||
                          str.includes('Permission denied')
                        ) {
                          msg = 'Kamera erişim izni verilmedi veya kapatıldı. Tarayıcınızdan kamera iznini onaylayın veya QR kod / Eşleştirme kodunu aşağıya elle girin.';
                        } else if (str.includes('NotFoundError') || str.includes('DevicesNotFoundError')) {
                          msg = 'Cihazınızda aktif bir kamera bulunamadı.';
                        } else if (str.includes('NotReadableError') || str.includes('TrackStartError')) {
                          msg = 'Kamera başka bir uygulama veya sekme tarafından kullanılıyor.';
                        }
                        setQrScanError(msg);
                      }}
                      formats={['qr_code']}
                      components={{
                        audio: false,
                        tracker: true,
                        finder: false,
                      }}
                      styles={{
                        container: { width: '100%', height: '100%' },
                      }}
                    />
                  </div>
                  {/* Overlay targeting frame */}
                  <div className="absolute inset-8 border-2 border-indigo-500/50 rounded-3xl pointer-events-none">
                    <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-indigo-500 rounded-tl-2xl"></div>
                    <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-indigo-500 rounded-tr-2xl"></div>
                    <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-indigo-500 rounded-bl-2xl"></div>
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-indigo-500 rounded-br-2xl"></div>
                  </div>
                </>
              )}
            </div>

            {/* Manual QR / Code Fallback Input inside Modal */}
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="text-center text-xs text-slate-500 dark:text-slate-400">
                Kameranızı cihaz üzerindeki QR koda hizalayın veya kodu elle yazın:
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualQrCode}
                  onChange={(e) => setManualQrCode(e.target.value)}
                  placeholder="Kare kod veya eşleştirme kodu (Örn: 482913)"
                  className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && manualQrCode.trim()) {
                      handleQRScan(manualQrCode.trim());
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (manualQrCode.trim()) {
                      handleQRScan(manualQrCode.trim());
                    }
                  }}
                  disabled={!manualQrCode.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-semibold transition shrink-0"
                >
                  Kod Kullan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
