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
  QrCode,
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
  const [isSearching, setIsSearching] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredNetworkDevice[]>([]);
  const [foundDevice, setFoundDevice] = useState<DiscoveredNetworkDevice | null>(null);
  
  const [registering, setRegistering] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [selectedTenant, setSelectedTenant] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('Merkez Tesis');
  
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

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 lg:space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <Radio className="w-8 h-8 text-indigo-500" />
            Cihaz Keşfi ve Eşleştirme
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Ağda tespit edilen fiziksel donanımları güvenli eşleştirme koduyla hesabınıza bağlayın.
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
                onClick={() => setIsScanningQR(true)}
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
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 outline-none dark:text-white"
                  />
                </div>
                
                {user?.role === 'admin' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Hedef Müşteri (Tenant)</label>
                    <select
                      value={selectedTenant}
                      onChange={(e) => setSelectedTenant(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 outline-none dark:text-white"
                    >
                      <option value="">Seçiniz...</option>
                      {customersList?.map(c => (
                        <option key={c.id} value={c.id}>{c.companyName} ({c.name})</option>
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
                 <div className="text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-md">
                   {discoveredDevices.length} Bekleyen
                 </div>
               </div>
               <div className="flex-1 overflow-y-auto p-2">
                 {discoveredDevices.length === 0 ? (
                   <div className="h-full flex flex-col items-center justify-center text-slate-400">
                     <Wifi className="w-12 h-12 mb-3 opacity-20" />
                     <p className="text-sm">Eşleştirme bekleyen cihaz yok.</p>
                   </div>
                 ) : (
                   <div className="space-y-2 p-2">
                     {discoveredDevices.map((d, i) => (
                       <div key={i} className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 rounded-xl flex items-center justify-between hover:border-indigo-500/30 transition">
                         <div>
                           <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                             {d.hardwareModel || d.hostname || 'Bilinmeyen Cihaz'}
                             {d.pairingCode && (
                               <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 px-1.5 py-0.5 rounded font-mono">
                                 Kod: {d.pairingCode}
                               </span>
                             )}
                           </div>
                           <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
                             IP: {d.ip} • MAC: {d.mac}
                           </div>
                           <div className="text-xs text-slate-400 mt-1">
                             Sürüm: {d.firmwareVersion || '?'} | Son sinyal: {d.lastSeen ? new Date(d.lastSeen).toLocaleTimeString() : '-'}
                           </div>
                         </div>
                         <button 
                           onClick={() => setPairingCode(d.pairingCode || '')}
                           className="text-indigo-600 hover:text-indigo-500 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 p-2 rounded-lg transition"
                           title="Eşleştir"
                         >
                           <Key className="w-5 h-5" />
                         </button>
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
                  <p>Kod eşleştiğinde, cihaz kriptografik olarak yalnızca sizin hesabınıza (Tenant) bağlanır. Başkaları IP/MAC taramasıyla cihazınızı çalamaz.</p>
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {isScanningQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <QrCode className="w-5 h-5 text-indigo-500" />
                Cihaz Kare Kodunu Okutun
              </h3>
              <button
                onClick={() => setIsScanningQR(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg transition"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 relative bg-black flex justify-center items-center aspect-square">
              <div className="absolute inset-0 overflow-hidden">
                <Scanner
                  onScan={(detectedCodes) => {
                    if (detectedCodes && detectedCodes.length > 0) {
                      handleQRScan(detectedCodes[0].rawValue);
                    }
                  }}
                  onError={(error) => console.error('QR Scan Error:', error)}
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
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
              Kameranızı cihazın üzerindeki veya kullanım kılavuzundaki QR koda hizalayın.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
