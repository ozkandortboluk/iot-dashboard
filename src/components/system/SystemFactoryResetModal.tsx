import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Key,
  X,
  Check,
  AlertTriangle,
  RotateCcw,
  Eye,
  EyeOff,
  Cpu,
  Database,
  Users,
  LayoutDashboard,
  BellRing,
  GitBranch,
  Terminal,
  Settings,
  HardDrive,
  FileCode,
  Flame,
  CheckCircle2,
  Lock,
  Send,
  Layers,
  Sparkles,
  Info,
  Compass,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { apiFetch as fetch } from '../../lib/apiFetch';
import { useRealtime } from '../../context/RealtimeContext';

interface SystemFactoryResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export type ResetMode = 'unconfigured' | 'factory' | 'granular';

export const SystemFactoryResetModal: React.FC<SystemFactoryResetModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { refreshData } = useRealtime();

  // Reset Primary Mode:
  // 1. 'unconfigured': Out-of-the-box fresh onboarding (User request: returns system completely to uninstalled state, wipes usr_admin, restarts setup wizard)
  // 2. 'factory': Operational factory reset (wipes operational entities, preserves usr_admin)
  // 3. 'granular': Custom selective layers
  const [resetMode, setResetMode] = useState<ResetMode>('unconfigured');

  // Granular Reset Targets State
  const [wipeDevices, setWipeDevices] = useState(true);
  const [wipeTelemetry, setWipeTelemetry] = useState(true);
  const [wipeUsers, setWipeUsers] = useState(true);
  const [wipeDashboards, setWipeDashboards] = useState(true);
  const [wipeAlarms, setWipeAlarms] = useState(true);
  const [wipeAutomations, setWipeAutomations] = useState(true);
  const [wipeFirmwares, setWipeFirmwares] = useState(false);
  const [wipeServiceTokens, setWipeServiceTokens] = useState(true);
  const [wipeDeviceCommands, setWipeDeviceCommands] = useState(true);
  const [wipeSystemSettings, setWipeSystemSettings] = useState(true);
  const [wipeAuditLogs, setWipeAuditLogs] = useState(true);

  // Authentication & Confirmation State
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  // Password verification feedback state
  const [passwordVerificationStatus, setPasswordVerificationStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [passwordVerificationMessage, setPasswordVerificationMessage] = useState<string>('');

  // Execution State
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successResult, setSuccessResult] = useState<any>(null);

  // Synchronize state when resetMode changes
  const handleSelectMode = (mode: ResetMode) => {
    setResetMode(mode);
    setErrorMsg('');
    if (mode === 'unconfigured') {
      setWipeDevices(true);
      setWipeTelemetry(true);
      setWipeUsers(true);
      setWipeDashboards(true);
      setWipeAlarms(true);
      setWipeAutomations(true);
      setWipeFirmwares(true);
      setWipeServiceTokens(true);
      setWipeDeviceCommands(true);
      setWipeSystemSettings(true);
      setWipeAuditLogs(true);
    } else if (mode === 'factory') {
      setWipeDevices(true);
      setWipeTelemetry(true);
      setWipeUsers(true);
      setWipeDashboards(true);
      setWipeAlarms(true);
      setWipeAutomations(true);
      setWipeFirmwares(false);
      setWipeServiceTokens(false);
      setWipeDeviceCommands(true);
      setWipeSystemSettings(false);
      setWipeAuditLogs(false);
    }
  };

  // Verify admin password on debounced user typing
  useEffect(() => {
    if (!adminPassword.trim() || adminPassword.trim().length < 4) {
      setPasswordVerificationStatus('idle');
      setPasswordVerificationMessage('');
      return;
    }

    const timer = setTimeout(async () => {
      setPasswordVerificationStatus('checking');
      try {
        const res = await fetch('/api/system/verify-encryption-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminPassword: adminPassword.trim() }),
        });
        const data = await res.json();
        if (data.valid) {
          setPasswordVerificationStatus('valid');
          setPasswordVerificationMessage('Yönetici parolası doğrulandı.');
        } else {
          setPasswordVerificationStatus('invalid');
          setPasswordVerificationMessage(data.reason || 'Geçersiz yönetici parolası.');
        }
      } catch {
        setPasswordVerificationStatus('idle');
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [adminPassword]);

  if (!isOpen) return null;

  const wipeToUnconfigured = resetMode === 'unconfigured';
  const wipeAll = resetMode === 'factory' || resetMode === 'unconfigured';

  const validUnconfiguredPhrases = [
    'SIFIRDAN BAŞLAT',
    'SIFIRDAN BASLAT',
    'SIFIRDAN KURULUM',
    'ILK HALINE DONDUR',
    'İLK HALİNE DÖNDÜR',
    'SIFIRLA',
    'SIFIRDAN',
  ];

  const validFactoryPhrases = [
    'FABRİKA AYARLARI',
    'FABRIKA AYARLARI',
    'SIFIRLA',
  ];

  const rawConfirm = confirmText.trim();
  const trUpper = rawConfirm.toLocaleUpperCase('tr-TR');
  const enUpper = rawConfirm.toUpperCase();

  const isConfirmValid =
    resetMode === 'unconfigured'
      ? validUnconfiguredPhrases.some((p) => p === trUpper || p === enUpper)
      : resetMode === 'factory'
      ? validFactoryPhrases.some((p) => p === trUpper || p === enUpper)
      : rawConfirm.length > 0;

  const hasSelectedTarget =
    resetMode === 'unconfigured' ||
    resetMode === 'factory' ||
    wipeDevices ||
    wipeTelemetry ||
    wipeUsers ||
    wipeDashboards ||
    wipeAlarms ||
    wipeAutomations ||
    wipeFirmwares ||
    wipeServiceTokens ||
    wipeDeviceCommands ||
    wipeSystemSettings ||
    wipeAuditLogs;

  const isFormValid =
    adminPassword.trim().length >= 4 &&
    hasSelectedTarget &&
    isConfirmValid &&
    passwordVerificationStatus !== 'invalid';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || loading) return;

    setErrorMsg('');
    setLoading(true);

    try {
      const res = await fetch('/api/system/factory-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminPassword: adminPassword.trim(),
          confirmText: confirmText.trim(),
          wipeToUnconfigured,
          wipeAll,
          wipeDevices: wipeToUnconfigured || wipeAll || wipeDevices,
          wipeTelemetry: wipeToUnconfigured || wipeAll || wipeTelemetry,
          wipeUsers: wipeToUnconfigured || wipeAll || wipeUsers,
          wipeDashboards: wipeToUnconfigured || wipeAll || wipeDashboards,
          wipeAlarms: wipeToUnconfigured || wipeAll || wipeAlarms,
          wipeAutomations: wipeToUnconfigured || wipeAll || wipeAutomations,
          wipeFirmwares: wipeToUnconfigured || wipeFirmwares,
          wipeServiceTokens: wipeToUnconfigured || wipeServiceTokens,
          wipeDeviceCommands: wipeToUnconfigured || wipeAll || wipeDeviceCommands,
          wipeSystemSettings: wipeToUnconfigured || wipeSystemSettings,
          wipeAuditLogs: wipeToUnconfigured || wipeAuditLogs,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Sıfırlama işlemi gerçekleştirilemedi.');
      }

      setSuccessResult({
        ...data,
        wipeToUnconfigured,
        resetMode,
      });

      if (typeof refreshData === 'function') {
        refreshData();
      }
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Sistem sıfırlanırken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#0b1329] border border-rose-200 dark:border-rose-900/60 rounded-3xl shadow-2xl overflow-hidden my-6">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-100 dark:border-slate-800/80 bg-rose-50/50 dark:bg-rose-950/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-rose-600 to-amber-600 text-white shadow-md shadow-rose-600/20">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Sistem Sıfırlama & Fabrika Ayarları</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                  Kritik Operasyon
                </span>
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Kasa Şifreleme Anahtarı (Vault Encryption Key) doğrulamalı güvenli sıfırlama
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        {successResult ? (
          <div className="p-6 sm:p-8 text-center space-y-5">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center mx-auto shadow-lg animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {successResult.wipeToUnconfigured
                  ? 'Sistem Tamamen İlk Kurulmamış Haline Döndürüldü!'
                  : 'Sıfırlama İşlemi Başarıyla Tamamlandı'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                {successResult.wipeToUnconfigured
                  ? 'Yönetici (usr_admin) dahil tüm hesaplar, oturumlar, tablolar, cihazlar ve kilitler temizlendi. Sistem sıfırdan ilk açılış (İlk Kurulum Sihirbazı) durumuna getirildi.'
                  : 'Seçilen veri katmanları veritabanından (PostgreSQL / TimescaleDB) ve bellekten temizlendi. Sistem yöneticisi (usr_admin) korunarak temiz çalışma alanı oluşturuldu.'}
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900/80 rounded-2xl border border-slate-200 dark:border-slate-800 text-left text-xs space-y-2 max-w-md mx-auto">
              <div className="font-semibold text-slate-700 dark:text-slate-300 pb-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span>Sıfırlama Modu:</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  {successResult.wipeToUnconfigured ? 'SIFIRDAN KURULUM (OOBE)' : 'STANDART TEMİZLİK'}
                </span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Kullanıcı Hesapları:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {successResult.wipeToUnconfigured ? '0 (Tümü Silindi)' : '1 (usr_admin korundu)'}
                </span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Kalan Cihaz Sayısı:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">0</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Sistem Durumu:</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">
                  {successResult.wipeToUnconfigured ? 'Kurulum Bekleniyor (SETUP)' : 'Hazır (READY)'}
                </span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Sonraki Adım:</span>
                <span className="font-bold text-rose-600 dark:text-rose-400">
                  {successResult.wipeToUnconfigured ? 'İlk Kurulum Sihirbazı Açılacak' : 'Dashboard Yenilenecek'}
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-center gap-3">
              <button
                onClick={() => {
                  onClose();
                  // Clean redirect to launch the fresh Setup Wizard immediately
                  window.location.href = '/';
                }}
                className="px-6 py-2.5 bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-lg cursor-pointer flex items-center gap-2"
              >
                <span>{successResult.wipeToUnconfigured ? 'Kurulum Sihirbazını Şimdi Başlat' : 'Arayüzü Yenile & Kapat'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 sm:space-y-5">
            
            {/* Warning Callout */}
            <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 dark:text-amber-300 leading-relaxed">
                <strong>Geri Alınamaz Operasyon:</strong> Seçilen veri katmanları veritabanından kalıcı olarak temizlenir.
                İşlemi onaylamak için sunucu kök <strong>Kasa Şifreleme Anahtarınızı (Encryption Key)</strong> girmeniz zorunludur.
              </div>
            </div>

            {errorMsg && (
              <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-2xl text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* RESET MODE SELECTOR CARDS */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-rose-500" />
                  <span>Sıfırlama Kapsamı & Modu Seçin:</span>
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {resetMode === 'unconfigured' ? 'Sıfırdan Başlat (Tümü Temizlenir)' : resetMode === 'factory' ? 'usr_admin Korunur' : 'Özel Katmanlar'}
                </span>
              </div>

              <div className="space-y-2.5">
                
                {/* MODE 1: COMPLETE OUT-OF-THE-BOX RESET (User Request: "Sistemi tamamen ilk kurulmamış haline dönecek şekilde sıfırdan başlamak isteyenler için") */}
                <div
                  onClick={() => handleSelectMode('unconfigured')}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                    resetMode === 'unconfigured'
                      ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-600 dark:border-rose-500 shadow-md ring-2 ring-rose-500/20'
                      : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`p-2.5 rounded-xl transition-colors ${
                        resetMode === 'unconfigured'
                          ? 'bg-gradient-to-tr from-rose-600 to-amber-600 text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}>
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                            Sistemi Tamamen İlk Kurulmamış Haline Döndür
                          </h3>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-rose-600 text-white shadow-2xs">
                            Sıfırdan Başlat
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-snug">
                          <strong>Sıfırdan başlamak isteyenler için:</strong> Yönetici (<code className="text-rose-600 dark:text-rose-400 font-mono font-bold">usr_admin</code>) dahil tüm kullanıcı hesapları, oturum tokenları, cihazlar, telemetri, paneller, alarmlar ve kurulum kilitleri silinir. Sistem doğrudan <strong>İlk Kurulum Sihirbazı</strong>&apos;na geri döner.
                        </p>
                      </div>
                    </div>
                    <input
                      type="radio"
                      name="resetMode"
                      checked={resetMode === 'unconfigured'}
                      onChange={() => handleSelectMode('unconfigured')}
                      className="w-4 h-4 text-rose-600 focus:ring-rose-500 border-slate-300 dark:border-slate-700 cursor-pointer shrink-0 mt-1"
                    />
                  </div>
                </div>

                {/* MODE 2: OPERATIONAL FACTORY RESET (Preserves usr_admin) */}
                <div
                  onClick={() => handleSelectMode('factory')}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    resetMode === 'factory'
                      ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-500 dark:border-amber-600 shadow-sm ring-1 ring-amber-500/20'
                      : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-xl transition-colors ${
                        resetMode === 'factory'
                          ? 'bg-amber-500 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}>
                        <Flame className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                            Standart Fabrika Sıfırlaması (Operasyonel Temizlik)
                          </h3>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            usr_admin Korunur
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                          Cihazlar, telemetri, müşteri hesapları, paneller ve alarmlar temizlenir; <strong>yönetici hesabı (usr_admin) ve giriş şifreniz korunur</strong>.
                        </p>
                      </div>
                    </div>
                    <input
                      type="radio"
                      name="resetMode"
                      checked={resetMode === 'factory'}
                      onChange={() => handleSelectMode('factory')}
                      className="w-4 h-4 text-amber-600 focus:ring-amber-500 border-slate-300 dark:border-slate-700 cursor-pointer shrink-0 mt-1"
                    />
                  </div>
                </div>

                {/* MODE 3: GRANULAR SELECTIVE LAYERS */}
                <div
                  onClick={() => handleSelectMode('granular')}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                    resetMode === 'granular'
                      ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-500 dark:border-indigo-600 shadow-sm ring-1 ring-indigo-500/20'
                      : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-xl transition-colors ${
                        resetMode === 'granular'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}>
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                            Özelleştirilebilir Katman Sıfırlaması
                          </h3>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-indigo-100 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            Modüler Seçim
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                          Yalnızca belirlediğiniz modülleri (örn: sadece telemetri veya sadece cihazlar) silin; diğer veriler aynen korunur.
                        </p>
                      </div>
                    </div>
                    <input
                      type="radio"
                      name="resetMode"
                      checked={resetMode === 'granular'}
                      onChange={() => handleSelectMode('granular')}
                      className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 cursor-pointer shrink-0 mt-1"
                    />
                  </div>
                </div>

              </div>
            </div>

            {/* Granular Selective Targets Grid (Editable in 'granular' mode, locked as all-inclusive in other modes) */}
            <div className={`space-y-2 pt-1 ${resetMode !== 'granular' ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  {resetMode === 'unconfigured'
                    ? 'Sıfırdan Kurulumda Temizlenecek Tüm Katmanlar (11/11 Kilitli)'
                    : resetMode === 'factory'
                    ? 'Fabrika Ayarlarında Temizlenecek Operasyonel Katmanlar'
                    : 'Temizlenecek Veri Katmanlarını Seçin:'}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  {resetMode === 'granular' ? 'İstediğiniz kutucukları işaretleyin' : '(Mod tarafından otomatik belirlenir)'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                {[
                  {
                    id: 'wipeDevices',
                    label: 'Cihazlar & Saha Hiyerarşisi',
                    desc: 'Kayıtlı donanımlar, gruplar ve bölgeler',
                    icon: Cpu,
                    checked: resetMode === 'unconfigured' || resetMode === 'factory' || wipeDevices,
                    setter: setWipeDevices,
                  },
                  {
                    id: 'wipeTelemetry',
                    label: 'Telemetri & Ölçüm Geçmişi',
                    desc: 'TimescaleDB hypertable kayıtları & paketler',
                    icon: Database,
                    checked: resetMode === 'unconfigured' || resetMode === 'factory' || wipeTelemetry,
                    setter: setWipeTelemetry,
                  },
                  {
                    id: 'wipeDashboards',
                    label: 'Dashboard Ekranları & Widgetlar',
                    desc: 'Özel widget düzenleri sıfırlanır, varsayılana döner',
                    icon: LayoutDashboard,
                    checked: resetMode === 'unconfigured' || resetMode === 'factory' || wipeDashboards,
                    setter: setWipeDashboards,
                  },
                  {
                    id: 'wipeAlarms',
                    label: 'Alarm Kuralları & Olaylar',
                    desc: 'Eşik kuralları, bildirimler ve kuyruk',
                    icon: BellRing,
                    checked: resetMode === 'unconfigured' || resetMode === 'factory' || wipeAlarms,
                    setter: setWipeAlarms,
                  },
                  {
                    id: 'wipeUsers',
                    label: 'Müşteri & Kullanıcı Hesapları',
                    desc: resetMode === 'unconfigured' ? 'Tüm hesaplar (usr_admin dahil) silinir' : 'Müşteriler silinir (usr_admin korunur)',
                    icon: Users,
                    checked: resetMode === 'unconfigured' || resetMode === 'factory' || wipeUsers,
                    setter: setWipeUsers,
                  },
                  {
                    id: 'wipeAutomations',
                    label: 'Otomasyon Senaryoları',
                    desc: 'Kural motoru ve tetikleyici komutlar',
                    icon: GitBranch,
                    checked: resetMode === 'unconfigured' || resetMode === 'factory' || wipeAutomations,
                    setter: setWipeAutomations,
                  },
                  {
                    id: 'wipeFirmwares',
                    label: 'Firmware & OTA Dağıtımları',
                    desc: 'Yüklenen ikili dosyalar ve işler',
                    icon: FileCode,
                    checked: resetMode === 'unconfigured' || wipeFirmwares,
                    setter: setWipeFirmwares,
                  },
                  {
                    id: 'wipeServiceTokens',
                    label: 'API & Servis Jetonları',
                    desc: 'Dış entegrasyon ve AI Studio servis jetonları',
                    icon: Key,
                    checked: resetMode === 'unconfigured' || wipeServiceTokens,
                    setter: setWipeServiceTokens,
                  },
                  {
                    id: 'wipeDeviceCommands',
                    label: 'Cihaz Komut & Çıkış Kayıtları',
                    desc: 'Downlink komut kuyruğu ve soket geçmişi',
                    icon: Send,
                    checked: resetMode === 'unconfigured' || resetMode === 'factory' || wipeDeviceCommands,
                    setter: setWipeDeviceCommands,
                  },
                  {
                    id: 'wipeSystemSettings',
                    label: 'Sistem & Mail Ayarları',
                    desc: 'SMTP ayarları ve saklama ilkeleri',
                    icon: Settings,
                    checked: resetMode === 'unconfigured' || wipeSystemSettings,
                    setter: setWipeSystemSettings,
                  },
                  {
                    id: 'wipeAuditLogs',
                    label: 'Güvenlik & Audit Logları',
                    desc: 'Geçmiş erişim denetim kayıtları',
                    icon: Terminal,
                    checked: resetMode === 'unconfigured' || wipeAuditLogs,
                    setter: setWipeAuditLogs,
                  },
                ].map((target) => {
                  const Icon = target.icon;
                  return (
                    <label
                      key={target.id}
                      className={`flex items-start gap-2.5 p-2 rounded-xl border transition-colors ${
                        resetMode === 'granular' ? 'cursor-pointer' : 'cursor-default'
                      } ${
                        target.checked
                          ? 'bg-rose-50/60 dark:bg-rose-950/25 border-rose-300 dark:border-rose-900/60'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={target.checked}
                        onChange={(e) => {
                          if (resetMode === 'granular') {
                            target.setter(e.target.checked);
                          }
                        }}
                        disabled={resetMode !== 'granular'}
                        className="mt-0.5 w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300 dark:border-slate-700 cursor-pointer disabled:opacity-70"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                          <Icon className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400 shrink-0" />
                          <span className="truncate">{target.label}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                          {target.desc}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Authorization Section: Admin Password */}
            <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-indigo-500" />
                    <span>Yönetici Parolası (Admin Password Re-Auth)</span>
                  </label>
                  
                  {/* Status Badge */}
                  {passwordVerificationStatus === 'checking' && (
                    <span className="text-[10px] text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-ping" />
                      Doğrulanıyor...
                    </span>
                  )}
                  {passwordVerificationStatus === 'valid' && (
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                      <Check className="w-3 h-3" />
                      Parola Doğrulandı
                    </span>
                  )}
                  {passwordVerificationStatus === 'invalid' && (
                    <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full border border-rose-200 dark:border-rose-800">
                      <X className="w-3 h-3" />
                      Hatalı Parola
                    </span>
                  )}
                </div>

                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Mevcut yönetici parolanızı giriniz"
                    className={`w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border text-xs rounded-xl pr-10 font-mono transition-colors ${
                      passwordVerificationStatus === 'valid'
                        ? 'border-emerald-500 dark:border-emerald-600 focus:ring-emerald-500'
                        : passwordVerificationStatus === 'invalid'
                        ? 'border-rose-500 dark:border-rose-600 focus:ring-rose-500'
                        : 'border-slate-300 dark:border-slate-700 focus:ring-indigo-500'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Güvenlik kuralı: Kök şifreleme anahtarları (ENCRYPTION_KEY) asla web arayüzünde girilmez. Sıfırlama işlemi mevcut yönetici oturumu re-authentication ile yürütülür.
                </p>
              </div>

              {/* Confirmation Text Input */}
              <div className="space-y-1.5 pt-1">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {resetMode === 'unconfigured' ? (
                      <span>Onay Metni: Büyük harflerle <strong className="text-rose-600 dark:text-rose-400 font-mono">&quot;SIFIRDAN KURULUM&quot;</strong> veya <strong className="text-rose-600 dark:text-rose-400 font-mono">&quot;SIFIRLA&quot;</strong> yazın</span>
                    ) : resetMode === 'factory' ? (
                      <span>Onay Metni: Büyük harflerle <strong className="text-amber-600 dark:text-amber-400 font-mono">&quot;FABRİKA AYARLARI&quot;</strong> veya <strong className="text-amber-600 dark:text-amber-400 font-mono">&quot;SIFIRLA&quot;</strong> yazın</span>
                    ) : (
                      <span>Onay Metni: Büyük harflerle <strong className="text-indigo-600 dark:text-indigo-400 font-mono">&quot;SIFIRLA&quot;</strong> yazın</span>
                    )}
                  </label>

                  {/* Quick-fill buttons */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400">Hızlı Doldur:</span>
                    {resetMode === 'unconfigured' && (
                      <button
                        type="button"
                        onClick={() => setConfirmText('SIFIRDAN KURULUM')}
                        className="px-2 py-0.5 bg-rose-100 hover:bg-rose-200 dark:bg-rose-950/60 dark:hover:bg-rose-900 text-rose-700 dark:text-rose-300 text-[10px] font-bold rounded cursor-pointer transition"
                      >
                        SIFIRDAN KURULUM
                      </button>
                    )}
                    {resetMode === 'factory' && (
                      <button
                        type="button"
                        onClick={() => setConfirmText('FABRİKA AYARLARI')}
                        className="px-2 py-0.5 bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900 text-amber-700 dark:text-amber-300 text-[10px] font-bold rounded cursor-pointer transition"
                      >
                        FABRİKA AYARLARI
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setConfirmText('SIFIRLA')}
                      className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold rounded cursor-pointer transition"
                    >
                      SIFIRLA
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={
                    resetMode === 'unconfigured'
                      ? 'SIFIRDAN KURULUM'
                      : resetMode === 'factory'
                      ? 'FABRİKA AYARLARI'
                      : 'SIFIRLA'
                  }
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs rounded-xl font-mono tracking-wider focus:ring-rose-500 uppercase"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                İptal
              </button>
              
              <button
                type="submit"
                disabled={!isFormValid || loading}
                className={`px-5 py-2.5 text-xs font-bold rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-md ${
                  !isFormValid || loading
                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed shadow-none'
                    : resetMode === 'unconfigured'
                    ? 'bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-rose-600/30 active:scale-95'
                    : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/25 active:scale-95'
                }`}
              >
                {loading ? (
                  <>
                    <RotateCcw className="w-4 h-4 animate-spin" />
                    <span>Sistem Sıfırlanıyor...</span>
                  </>
                ) : (
                  <>
                    {resetMode === 'unconfigured' ? (
                      <Sparkles className="w-4 h-4" />
                    ) : (
                      <Flame className="w-4 h-4" />
                    )}
                    <span>
                      {resetMode === 'unconfigured'
                        ? 'Sistemi Sıfırdan Başlat (İlk Haline Döndür)'
                        : resetMode === 'factory'
                        ? 'Fabrika Sıfırlamasını Başlat'
                        : 'Seçili Katmanları Sıfırla'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
