import React, { useState, useEffect } from 'react';
import {
  X,
  QrCode,
  Key,
  Network,
  Cpu,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  ArrowRight,
  ArrowLeft,
  Building2,
  MapPin,
  FolderTree,
  Tag,
  Sparkles,
  RefreshCw,
  Camera,
  Layers,
} from 'lucide-react';
import type {
  DiscoveredNetworkDevice,
  PairingMethod,
  CollisionCheckResult,
  PairDeviceRequest,
  Site,
  Zone,
  DeviceGroup,
  User,
} from '../../types';

interface ProvisioningWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPairSuccess: () => void;
  initialDevice?: DiscoveredNetworkDevice | null;
  currentUser: User;
  sites: Site[];
  zones: Zone[];
  groups: DeviceGroup[];
  allUsers?: User[];
}

export const ProvisioningWizardModal: React.FC<ProvisioningWizardModalProps> = ({
  isOpen,
  onClose,
  onPairSuccess,
  initialDevice,
  currentUser,
  sites,
  zones,
  groups,
  allUsers = [],
}) => {
  if (!isOpen) return null;
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [method, setMethod] = useState<PairingMethod>('pairing_code');

  // Form State
  const [deviceName, setDeviceName] = useState('');
  const [deviceType, setDeviceType] = useState('ESP32');
  const [ipAddress, setIpAddress] = useState('');
  const [macAddress, setMacAddress] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [location, setLocation] = useState('Merkez Tesis');

  // Hierarchy & Tenant
  const [selectedTenantId, setSelectedTenantId] = useState(currentUser.role === 'admin' ? '' : currentUser.id);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [customApiKey, setCustomApiKey] = useState('');

  // Duplicate Check & Strategy
  const [isCheckingCollision, setIsCheckingCollision] = useState(false);
  const [collisionResult, setCollisionResult] = useState<CollisionCheckResult | null>(null);
  const [collisionStrategy, setCollisionStrategy] = useState<'reject' | 'update_existing' | 'replace_hardware' | 'force_unique'>('force_unique');
  const [targetDeviceIdToReplace, setTargetDeviceIdToReplace] = useState('');

  // Pair Execution State
  const [isPairing, setIsPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [pairedResult, setPairedResult] = useState<{
    device?: any;
    apiKey?: string;
    message?: string;
  } | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // QR Simulation
  const [isCameraActive, setIsCameraActive] = useState(false);

  // Initialize from props
  useEffect(() => {
    if (initialDevice) {
      setMethod('network_scan');
      setDeviceName(initialDevice.hostname || `Düğüm-${initialDevice.mac.replace(/:/g, '').slice(-4)}`);
      setIpAddress(initialDevice.ip);
      setMacAddress(initialDevice.mac);
      if (initialDevice.pairingCode) setPairingCode(initialDevice.pairingCode);
      if (initialDevice.hardwareModel) setDeviceType(initialDevice.hardwareModel);
      setCustomApiKey('');
    } else {
      setDeviceName('');
      setIpAddress('');
      setMacAddress('');
      setPairingCode('');
      setDeviceType('ESP32');
      setCustomApiKey('');
    }
  }, [initialDevice, isOpen]);

  // Filtered Hierarchy
  const availableSites = sites.filter((s) => !selectedTenantId || s.tenantId === selectedTenantId);
  const availableZones = zones.filter((z) => (!selectedTenantId || z.tenantId === selectedTenantId) && (!selectedSiteId || z.siteId === selectedSiteId));
  const availableGroups = groups.filter((g) => (!selectedTenantId || g.tenantId === selectedTenantId) && (!selectedZoneId || g.zoneId === selectedZoneId));


  // STEP 1 -> STEP 2 (Collision Check)
  const handleProceedToStep2 = async () => {
    if (!deviceName.trim()) {
      setPairError('Lütfen cihaz için bir isim giriniz.');
      return;
    }
    setPairError(null);
    setIsCheckingCollision(true);

    try {
      const targetTenant = currentUser.role === 'admin' ? (selectedTenantId || currentUser.id) : currentUser.id;
      const res = await fetch('/api/network/check-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: deviceName.trim(),
          mac: macAddress.trim() || undefined,
          ip: ipAddress.trim() || undefined,
          tenantId: targetTenant,
        }),
      });

      if (!res.ok) throw new Error('Kimlik çakışma kontrolü yapılamadı.');
      const data: CollisionCheckResult = await res.json();
      setCollisionResult(data);

      if (data.hasCollision) {
        if (data.collisionType === 'mac') {
          setCollisionStrategy('replace_hardware');
          if (data.conflictingDevices[0]) {
            setTargetDeviceIdToReplace(data.conflictingDevices[0].id);
          }
        } else if (data.collisionType === 'name') {
          setCollisionStrategy('force_unique');
        } else {
          setCollisionStrategy('update_existing');
        }
      } else {
        setCollisionStrategy('force_unique');
      }

      setStep(2);
    } catch (err: any) {
      setPairError(err.message || 'Hata oluştu');
    } finally {
      setIsCheckingCollision(false);
    }
  };

  // STEP 2 -> STEP 3
  const handleProceedToStep3 = () => {
    setStep(3);
  };

  // STEP 3 -> STEP 4 (Pair Device)
  const handleExecutePairing = async () => {
    setIsPairing(true);
    setPairError(null);

    try {
      const targetTenant = currentUser.role === 'admin' ? (selectedTenantId || currentUser.id) : currentUser.id;

      const payload: PairDeviceRequest = {
        name: deviceName.trim(),
        type: deviceType,
        location: location.trim() || 'Merkez Tesis',
        ipAddress: ipAddress.trim() || undefined,
        macAddress: macAddress.trim() || undefined,
        pairingCode: pairingCode.trim() || undefined,
        method,
        tenantId: targetTenant,
        siteId: selectedSiteId || undefined,
        zoneId: selectedZoneId || undefined,
        groupId: selectedGroupId || undefined,
        tags,
        apiKey: customApiKey.trim() || undefined,
        collisionStrategy,
        targetDeviceIdToReplace: collisionStrategy === 'replace_hardware' ? targetDeviceIdToReplace : undefined,
      };

      const res = await fetch('/api/network/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Cihaz eşleştirme işlemi başarısız oldu.');
      }

      setPairedResult({
        device: data.device,
        apiKey: data.device?.apiKey,
        message: data.message,
      });

      setStep(4);
      onPairSuccess();
    } catch (err: any) {
      setPairError(err.message || 'Eşleştirme sırasında bir hata meydana geldi.');
    } finally {
      setIsPairing(false);
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleCopyKey = () => {
    if (pairedResult?.apiKey) {
      navigator.clipboard.writeText(pairedResult.apiKey);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const [cameraPermissionGranted, setCameraPermissionGranted] = useState<boolean | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const handleSimulateQrScan = async () => {
    setIsCameraActive(true);
    setCameraError(null);

    if (navigator?.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        setCameraPermissionGranted(true);
        stream.getTracks().forEach((track) => track.stop());
      } catch (err: any) {
        console.warn('[Camera Permission]', err);
        setCameraPermissionGranted(false);
        setCameraError(err?.message || 'Kamera izni reddedildi veya kameraya erişilemedi.');
      }
    }

    setTimeout(() => {
      const demoMac = `3C:71:BF:${Math.floor(Math.random() * 89 + 10)}:${Math.floor(Math.random() * 89 + 10)}:${Math.floor(Math.random() * 89 + 10)}`;
      const demoCode = Math.floor(100000 + Math.random() * 900000).toString();
      setMacAddress(demoMac);
      setPairingCode(demoCode);
      setDeviceName(`ESP32-QR-${demoMac.slice(-5).replace(':', '')}`);
      setIpAddress(`192.168.1.${Math.floor(Math.random() * 150 + 50)}`);
      setIsCameraActive(false);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-100 text-base">Cihaz Eşleştirme ve Provizyon Sihirbazı</h2>
              <p className="text-xs text-slate-400">Tek adımda donanım eşleştirme, çakışma çözümü ve yetkilendirme</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="grid grid-cols-4 border-b border-slate-800 bg-slate-950/40 text-xs">
          <div className={`p-3 text-center font-medium border-b-2 transition-colors ${step === 1 ? 'border-cyan-500 text-cyan-400 bg-cyan-950/20' : step > 1 ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-500'}`}>
            1. Yöntem & Kimlik
          </div>
          <div className={`p-3 text-center font-medium border-b-2 transition-colors ${step === 2 ? 'border-cyan-500 text-cyan-400 bg-cyan-950/20' : step > 2 ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-500'}`}>
            2. Çakışma Analizi
          </div>
          <div className={`p-3 text-center font-medium border-b-2 transition-colors ${step === 3 ? 'border-cyan-500 text-cyan-400 bg-cyan-950/20' : step > 3 ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-500'}`}>
            3. Hiyerarşi & Konum
          </div>
          <div className={`p-3 text-center font-medium border-b-2 transition-colors ${step === 4 ? 'border-cyan-500 text-cyan-400 bg-cyan-950/20' : 'border-transparent text-slate-500'}`}>
            4. Yetkilendirme
          </div>
        </div>

        {/* Error Notification */}
        {pairError && (
          <div className="m-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{pairError}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* STEP 1: METHOD & IDENTIFIERS */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Eşleştirme Yöntemi Seçiniz
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setMethod('pairing_code')}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between gap-2 transition-all ${method === 'pairing_code' ? 'bg-cyan-950/40 border-cyan-500 text-cyan-300 shadow-sm' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                  >
                    <Key className="w-5 h-5" />
                    <div>
                      <div className="text-xs font-bold">6 Haneli Kod</div>
                      <div className="text-[10px] text-slate-500">Ekran / PIN Eşleşme</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMethod('qr_scan')}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between gap-2 transition-all ${method === 'qr_scan' ? 'bg-cyan-950/40 border-cyan-500 text-cyan-300 shadow-sm' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                  >
                    <QrCode className="w-5 h-5" />
                    <div>
                      <div className="text-xs font-bold">Kare Kod (QR)</div>
                      <div className="text-[10px] text-slate-500">Kamera ile Tara</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMethod('network_scan')}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between gap-2 transition-all ${method === 'network_scan' ? 'bg-cyan-950/40 border-cyan-500 text-cyan-300 shadow-sm' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                  >
                    <Network className="w-5 h-5" />
                    <div>
                      <div className="text-xs font-bold">Ağ Keşfi</div>
                      <div className="text-[10px] text-slate-500">Subnet Taraması</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMethod('manual')}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between gap-2 transition-all ${method === 'manual' ? 'bg-cyan-950/40 border-cyan-500 text-cyan-300 shadow-sm' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                  >
                    <Cpu className="w-5 h-5" />
                    <div>
                      <div className="text-xs font-bold">Manuel Giriş</div>
                      <div className="text-[10px] text-slate-500">IP / MAC Doğrudan</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* QR Camera Simulation & Permission Request */}
              {method === 'qr_scan' && (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center space-y-3">
                  <div className="w-16 h-16 mx-auto rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                    <Camera className={`w-8 h-8 ${isCameraActive ? 'animate-pulse' : ''}`} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-200">Cihaz Üzerindeki QR Kodu Okutun</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">Kamera akışından donanım kimliği ve MAC adresi çözümlenir.</p>

                    {/* Camera Permission Request Active Warning Banner */}
                    <div className="mt-2.5 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-left text-[11px] text-amber-300 space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-amber-400">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                        <span>Kamera Erişim İzni Uyarısı (Etkin)</span>
                      </div>
                      <p className="text-[10px] text-amber-200/90 leading-relaxed">
                        QR kod taraması yapabilmek için tarayıcınız kamera erişim izni talep eder. Lütfen beliren popup penceresinde "İzin Ver" butonuna tıklayınız.
                      </p>
                    </div>

                    {cameraError && (
                      <div className="mt-2 p-2 bg-rose-500/20 border border-rose-500/30 rounded text-[11px] text-rose-300">
                        ⚠️ {cameraError}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleSimulateQrScan}
                    disabled={isCameraActive}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 mx-auto"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    {isCameraActive ? 'Kamera İzni İsteniyor & Okunuyor...' : 'Kamera İzni Al & QR Tara'}
                  </button>
                </div>
              )}

              {/* Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Cihaz Adı <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Örn: Kazan Dairesi ESP32"
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Donanım Türü</label>
                  <select
                    value={deviceType}
                    onChange={(e) => setDeviceType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="ESP32">ESP32 (NodeMCU / DevKit)</option>
                    <option value="ESP8266">ESP8266 (NodeMCU v2/v3)</option>
                    <option value="RaspberryPi">Raspberry Pi (Linux IoT Agent)</option>
                    <option value="Arduino">Arduino Ethernet / MKR</option>
                    <option value="GenericGateway">Endüstriyel Modbus Gateway</option>
                  </select>
                </div>

                {method === 'pairing_code' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">6 Haneli Geçici Eşleşme Kodu</label>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="123456"
                      value={pairingCode}
                      onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-cyan-400 font-mono tracking-widest font-bold focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">MAC Adresi</label>
                  <input
                    type="text"
                    placeholder="Örn: 24:6F:28:AB:CD:EF"
                    value={macAddress}
                    onChange={(e) => setMacAddress(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">IP Adresi</label>
                  <input
                    type="text"
                    placeholder="Örn: 192.168.1.150"
                    value={ipAddress}
                    onChange={(e) => setIpAddress(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Fiziksel Konum Açıklaması</label>
                  <input
                    type="text"
                    placeholder="Örn: Kat 2 Pano 4"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Cihaz API Token / Kimlik Anahtarı <span className="text-slate-500 font-normal">(Opsiyonel)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Örn: nex_... (Boş bırakılırsa cihazın gönderdiği token algılanır veya yeni üretilir)"
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Boş bırakırsanız sistem cihazın gönderdiği donanım tokenini kullanır veya güvenli bir kriptografik token üretir.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: COLLISION ANALYSIS & RESOLUTION */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2 mb-2">
                  {collisionResult?.hasCollision ? (
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  )}
                  <h3 className="font-semibold text-slate-100 text-sm">
                    {collisionResult?.hasCollision ? 'Kimlik Çakışması Tespit Edildi' : 'Kimlik Doğrulandı (Temiz)'}
                  </h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{collisionResult?.message}</p>
              </div>

              {collisionResult?.hasCollision && (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Çakışma Çözüm Stratejisi Seçin:
                  </label>

                  <div className="space-y-2">
                    <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${collisionStrategy === 'replace_hardware' ? 'bg-cyan-950/40 border-cyan-500' : 'bg-slate-950/60 border-slate-800'}`}>
                      <input
                        type="radio"
                        name="strategy"
                        value="replace_hardware"
                        checked={collisionStrategy === 'replace_hardware'}
                        onChange={() => setCollisionStrategy('replace_hardware')}
                        className="mt-1 text-cyan-500 focus:ring-0"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-slate-200 block">Donanım Değişimi Yap (Replace Hardware)</span>
                        <span className="text-slate-400 block mt-0.5">
                          Eski arızalı donanımı bu yeni cihazla değiştirir, tüm geçmiş telemetri ve yapılandırmayı korur.
                        </span>
                      </div>
                    </label>

                    <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${collisionStrategy === 'update_existing' ? 'bg-cyan-950/40 border-cyan-500' : 'bg-slate-950/60 border-slate-800'}`}>
                      <input
                        type="radio"
                        name="strategy"
                        value="update_existing"
                        checked={collisionStrategy === 'update_existing'}
                        onChange={() => setCollisionStrategy('update_existing')}
                        className="mt-1 text-cyan-500 focus:ring-0"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-slate-200 block">Mevcut Cihazı Güncelle (Update Existing)</span>
                        <span className="text-slate-400 block mt-0.5">
                          Aynı MAC/IP'ye sahip mevcut kaydın ağ adreslerini ve konumunu günceller.
                        </span>
                      </div>
                    </label>

                    <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${collisionStrategy === 'force_unique' ? 'bg-cyan-950/40 border-cyan-500' : 'bg-slate-950/60 border-slate-800'}`}>
                      <input
                        type="radio"
                        name="strategy"
                        value="force_unique"
                        checked={collisionStrategy === 'force_unique'}
                        onChange={() => setCollisionStrategy('force_unique')}
                        className="mt-1 text-cyan-500 focus:ring-0"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-slate-200 block">Yeni ve Benzersiz Olarak Kaydet (Force Unique)</span>
                        <span className="text-slate-400 block mt-0.5">
                          Çakışan isim varsa otomatik numaralandırarak (`Örn: Cihaz (1)`) bağımsız yeni cihaz açar.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: HIERARCHY & TENANT ASSIGNMENT */}
          {step === 3 && (
            <div className="space-y-4">
              {currentUser.role === 'admin' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                    Müşteri / Tenant Ataması
                  </label>
                  <select
                    value={selectedTenantId}
                    onChange={(e) => {
                      setSelectedTenantId(e.target.value);
                      setSelectedSiteId('');
                      setSelectedZoneId('');
                      setSelectedGroupId('');
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">Merkez Yönetim (Genel Sistem)</option>
                    {allUsers.filter((u) => u.role !== 'admin').map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.companyName || u.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-cyan-400" /> Tesis / Site
                  </label>
                  <select
                    value={selectedSiteId}
                    onChange={(e) => {
                      setSelectedSiteId(e.target.value);
                      setSelectedZoneId('');
                      setSelectedGroupId('');
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">Tesis Seçilmedi</option>
                    {availableSites.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-purple-400" /> Bölge / Zone
                  </label>
                  <select
                    value={selectedZoneId}
                    onChange={(e) => {
                      setSelectedZoneId(e.target.value);
                      setSelectedGroupId('');
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">Bölge Seçilmedi</option>
                    {availableZones.map((z) => (
                      <option key={z.id} value={z.id}>{z.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                    <FolderTree className="w-3.5 h-3.5 text-emerald-400" /> Cihaz Grubu
                  </label>
                  <select
                    value={selectedGroupId}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">Grup Seçilmedi</option>
                    {availableGroups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tags Editor */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-amber-400" /> Etiketler (Tags)
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Örn: kritik, sensor, enerji..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                  >
                    Ekle
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-cyan-950/60 border border-cyan-800/60 text-cyan-300 text-xs font-mono"
                    >
                      #{tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        aria-label={`Etiketi kaldır: ${tag}`}
                        className="hover:text-red-400 ml-1"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {tags.length === 0 && (
                    <span className="text-slate-500 text-xs italic">Henüz etiket eklenmedi.</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: SUCCESS & PROVISIONING KEY */}
          {step === 4 && (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h3 className="font-bold text-slate-100 text-base">Cihaz Başarıyla Eşleştirildi ve Yetkilendirildi!</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Donanım NexusNode IoT platformuna kaydedildi. Aşağıdaki API anahtarını cihaza tanımlayarak telemetri göndermeye başlayabilirsiniz.
                </p>
              </div>

              {(() => {
                const displayKey = pairedResult?.apiKey || pairedResult?.device?.apiKey;
                if (!displayKey || displayKey === '__USE_CACHED_TOKEN__') {
                  return (
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-left text-xs text-slate-400">
                      Cihaz anahtarı başarıyla yapılandırıldı ve arka planda güvenle saklandı.
                    </div>
                  );
                }
                return (
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-left space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                        Cihaz Özel API Anahtarı (x-api-key)
                      </span>
                      <span className="text-[10px] text-emerald-400 font-medium">Aktif ve Hazır</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-slate-900 px-3 py-2 rounded-lg text-xs font-mono text-cyan-400 border border-slate-800 select-all truncate">
                        {displayKey}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(displayKey);
                          setIsCopied(true);
                          setTimeout(() => setIsCopied(false), 2500);
                        }}
                        className="px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
                      >
                        {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        <span>{isCopied ? 'Kopyalandı' : 'Kopyala'}</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Bu anahtarı cihazınızın kodundaki veya firmware ayarlarındaki <code className="text-slate-400">x-api-key</code> başlığına ekleyin.
                    </p>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div>
            {step > 1 && step < 4 && (
              <button
                type="button"
                onClick={() => setStep((step - 1) as any)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Geri</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step < 4 && (
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition-colors"
              >
                İptal
              </button>
            )}

            {step === 1 && (
              <button
                type="button"
                onClick={handleProceedToStep2}
                disabled={isCheckingCollision}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 transition-colors disabled:opacity-50"
              >
                <span>{isCheckingCollision ? 'Kontrol Ediliyor...' : 'Doğrula & İlerle'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {step === 2 && (
              <button
                type="button"
                onClick={handleProceedToStep3}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 transition-colors"
              >
                <span>Hiyerarşi & Atamaya Geç</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                onClick={handleExecutePairing}
                disabled={isPairing}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition-all disabled:opacity-50 shadow-md"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isPairing ? 'Provizyon Yapılıyor...' : 'Provizyonu Tamamla'}</span>
              </button>
            )}

            {step === 4 && (
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-lg text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 transition-colors"
              >
                Kapat & Listeye Dön
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
