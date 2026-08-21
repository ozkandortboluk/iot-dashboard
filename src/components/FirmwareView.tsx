import React, { useState, useEffect } from 'react';
import {
  Cpu,
  DownloadCloud,
  UploadCloud,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Trash2,
  Copy,
  FileText,
  Check,
  ShieldCheck,
  Layers,
  Radio,
  Search,
  Plus,
  ArrowRight,
  Filter,
  HardDrive,
  Info,
} from 'lucide-react';
import type { Firmware, OtaDeploymentJob, Device, User } from '../types';

interface FirmwareViewProps {
  currentUser: User;
  devices: Device[];
  onRefreshDevices?: () => void;
}

export const FirmwareView: React.FC<FirmwareViewProps> = ({
  currentUser,
  devices,
  onRefreshDevices,
}) => {
  const isAdmin = currentUser.role === 'admin';
  const [activeTab, setActiveTab] = useState<'library' | 'deploy' | 'jobs'>('library');

  const [firmwares, setFirmwares] = useState<Firmware[]>([]);
  const [otaJobs, setOtaJobs] = useState<OtaDeploymentJob[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadDeviceType, setUploadDeviceType] = useState('pump_controller');
  const [uploadRoleKey, setUploadRoleKey] = useState('PUMP_CTRL');
  const [uploadHardwareModel, setUploadHardwareModel] = useState('ESP32_WROOM_32');
  const [uploadVersion, setUploadVersion] = useState('v1.0.0');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Deployment Wizard State
  const [selectedFirmwareId, setSelectedFirmwareId] = useState<string>('');
  const [targetScope, setTargetScope] = useState<'single' | 'selected' | 'role_key' | 'device_type'>('role_key');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [singleDeviceId, setSingleDeviceId] = useState<string>('');
  const [targetRoleValue, setTargetRoleValue] = useState<string>('');
  const [targetTypeValue, setTargetTypeValue] = useState<string>('');
  const [deploying, setDeploying] = useState(false);

  // Copy SHA State
  const [copiedSha, setCopiedSha] = useState<string | null>(null);

  // Status Filter State for Jobs Tab
  const [jobStatusFilter, setJobStatusFilter] = useState<string>('all');
  const [jobSearch, setJobSearch] = useState<string>('');

  const fetchFirmwares = async () => {
    try {
      const token = localStorage.getItem('auth_token') || '';
      const res = await fetch('/api/firmwares', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFirmwares(data);
      }
    } catch (err) {
      console.error('Firmware çekme hatası:', err);
    }
  };

  const fetchOtaJobs = async () => {
    try {
      const token = localStorage.getItem('auth_token') || '';
      const res = await fetch('/api/ota/jobs', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOtaJobs(data);
      }
    } catch (err) {
      console.error('OTA işleri çekme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFirmwares();
    fetchOtaJobs();

    const interval = setInterval(() => {
      fetchOtaJobs();
      if (onRefreshDevices) onRefreshDevices();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadName || !uploadDeviceType || !uploadRoleKey || !uploadVersion) {
      setActionMessage({ type: 'error', text: 'Lütfen zorunlu alanları doldurun.' });
      return;
    }

    setUploading(true);
    setActionMessage(null);

    try {
      let binaryDataStr = '';
      if (uploadFile) {
        const buffer = await uploadFile.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        binaryDataStr = btoa(binary);
      } else {
        // Fallback demo binary payload if no file provided
        binaryDataStr = btoa(`DUMMY_ESP32_BINARY_${uploadVersion}_ROLE_${uploadRoleKey}`);
      }

      const token = localStorage.getItem('auth_token') || '';
      const res = await fetch('/api/firmwares', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: uploadName,
          deviceType: uploadDeviceType,
          roleKey: uploadRoleKey,
          hardwareModel: uploadHardwareModel,
          version: uploadVersion,
          description: uploadDescription,
          binaryData: binaryDataStr,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setActionMessage({ type: 'success', text: `Firmware '${data.name}' (${data.version}) yüklendi!` });
        setShowUploadModal(false);
        setUploadName('');
        setUploadDescription('');
        setUploadFile(null);
        fetchFirmwares();
      } else {
        setActionMessage({ type: 'error', text: data.error || 'Firmware yüklenemedi.' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: 'Yükleme sırasında hata oluştu: ' + (err.message || err) });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFirmware = async (id: string, name: string) => {
    if (!window.confirm(`'${name}' firmware dosyasını silmek istediğinize emin misiniz?`)) return;

    try {
      const token = localStorage.getItem('auth_token') || '';
      const res = await fetch(`/api/firmwares/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setActionMessage({ type: 'success', text: `'${name}' silindi.` });
        fetchFirmwares();
      } else {
        const err = await res.json();
        setActionMessage({ type: 'error', text: err.error || 'Silinemedi.' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Silme hatası.' });
    }
  };

  const handleDeployOta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFirmwareId) {
      setActionMessage({ type: 'error', text: 'Lütfen bir Firmware seçin.' });
      return;
    }

    setDeploying(true);
    setActionMessage(null);

    try {
      const fw = firmwares.find((f) => f.id === selectedFirmwareId);
      const token = localStorage.getItem('auth_token') || '';

      let payloadTargetIds: any = undefined;
      let payloadTargetValue: any = undefined;

      if (targetScope === 'single') {
        payloadTargetIds = [singleDeviceId];
      } else if (targetScope === 'selected') {
        payloadTargetIds = selectedDeviceIds;
      } else if (targetScope === 'role_key') {
        payloadTargetValue = targetRoleValue || fw?.roleKey;
      } else if (targetScope === 'device_type') {
        payloadTargetValue = targetTypeValue || fw?.deviceType;
      }

      const res = await fetch('/api/ota/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firmwareId: selectedFirmwareId,
          targetScope,
          targetIds: payloadTargetIds,
          targetValue: payloadTargetValue,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setActionMessage({ type: 'success', text: data.message });
        fetchOtaJobs();
        if (onRefreshDevices) onRefreshDevices();
        setActiveTab('jobs');
      } else {
        setActionMessage({ type: 'error', text: data.error || 'OTA güncellemesi başlatılamadı.' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'OTA dağıtım hatası.' });
    } finally {
      setDeploying(false);
    }
  };

  const handleCancelOta = async (deviceId: string) => {
    try {
      const token = localStorage.getItem('auth_token') || '';
      const res = await fetch('/api/ota/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ deviceIds: [deviceId] }),
      });
      if (res.ok) {
        setActionMessage({ type: 'success', text: 'OTA güncellemesi iptal edildi.' });
        fetchOtaJobs();
        if (onRefreshDevices) onRefreshDevices();
      }
    } catch (err) {
      console.error('Cancel error:', err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSha(text);
    setTimeout(() => setCopiedSha(null), 2000);
  };

  const selectedFirmware = firmwares.find((f) => f.id === selectedFirmwareId);

  // Compute stats
  const activeCount = devices.filter((d) => d.otaStatus === 'PENDING' || d.otaStatus === 'DOWNLOADING').length;
  const successCount = devices.filter((d) => d.otaStatus === 'SUCCESS').length;
  const failedCount = devices.filter((d) => d.otaStatus === 'FAILED').length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-900/50 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-400 via-blue-600 to-transparent pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-600/30 border border-indigo-500/40 rounded-xl text-indigo-300">
                <Cpu className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  Multi-Firmware & OTA Yönetim Merkezi
                </h1>
                <p className="text-slate-300 text-sm mt-1">
                  ESP8266 & ESP32 donanımları için çoklu sürüm yönetimi, cihaz görev kimliği (role_key) eşleştirmeli OTA güncellemeleri
                </p>
              </div>
            </div>
          </div>

          {isAdmin && (
            <button
              id="btn-upload-firmware-modal"
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl shadow-lg shadow-indigo-600/30 transition-all duration-200"
            >
              <UploadCloud className="w-5 h-5" />
              Yeni Firmware Yükle
            </button>
          )}
        </div>

        {/* Quick Stat Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-indigo-900/40 text-xs">
          <div className="bg-slate-900/60 border border-indigo-900/30 rounded-xl p-3">
            <span className="text-slate-400 block mb-1">Kütüphanedeki Firmware'ler</span>
            <span className="text-xl font-bold text-white">{firmwares.length} Adet</span>
          </div>
          <div className="bg-slate-900/60 border border-amber-900/30 rounded-xl p-3">
            <span className="text-amber-400 block mb-1">Aktif OTA İşlemleri</span>
            <span className="text-xl font-bold text-amber-300">{activeCount} Cihaz</span>
          </div>
          <div className="bg-slate-900/60 border border-emerald-900/30 rounded-xl p-3">
            <span className="text-emerald-400 block mb-1">Başarılı Güncellemeler</span>
            <span className="text-xl font-bold text-emerald-300">{successCount} Cihaz</span>
          </div>
          <div className="bg-slate-900/60 border border-rose-900/30 rounded-xl p-3">
            <span className="text-rose-400 block mb-1">Başarısız OTA Denemeleri</span>
            <span className="text-xl font-bold text-rose-300">{failedCount} Cihaz</span>
          </div>
        </div>
      </div>

      {/* Action Messages */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-sm ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
              : 'bg-rose-950/40 border-rose-800 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-rose-400" />}
            <span>{actionMessage.text}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-xs opacity-70 hover:opacity-100">
            Kapat
          </button>
        </div>
      )}

      {/* Tabs Bar */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2">
        <button
          id="tab-firmware-library"
          onClick={() => setActiveTab('library')}
          className={`px-5 py-3 font-medium text-sm border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'library'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <HardDrive className="w-4 h-4" />
          Firmware Kütüphanesi ({firmwares.length})
        </button>

        {isAdmin && (
          <button
            id="tab-ota-deploy"
            onClick={() => setActiveTab('deploy')}
            className={`px-5 py-3 font-medium text-sm border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'deploy'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Radio className="w-4 h-4" />
            OTA Dağıtım & Hedefleme Sihirbazı
          </button>
        )}

        <button
          id="tab-ota-jobs"
          onClick={() => setActiveTab('jobs')}
          className={`px-5 py-3 font-medium text-sm border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'jobs'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Layers className="w-4 h-4" />
          Canlı OTA Durumları & Cihaz Takibi ({devices.length})
          {activeCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-slate-950 animate-pulse">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: FIRMWARE LIBRARY */}
      {activeTab === 'library' && (
        <div className="space-y-4">
          {firmwares.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center">
              <Cpu className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Henüz Firmware Yüklenmemiş</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
                Sistemde ESP8266 veya ESP32 donanımları için kayıtlı firmware ikili dosyası (.bin) bulunmuyor. Yeni bir firmware yükleyerek OTA güncellemelerine başlayabilirsiniz.
              </p>
              {isAdmin && (
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-medium text-sm hover:bg-indigo-500"
                >
                  <Plus className="w-4 h-4" />
                  İlk Firmware'i Yükle
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {firmwares.map((fw) => {
                const matchingDeviceCount = devices.filter(
                  (d) => (d.roleKey || '').toUpperCase() === fw.roleKey.toUpperCase()
                ).length;

                return (
                  <div
                    key={fw.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <span className="inline-block px-2.5 py-0.5 text-xs font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded-md mb-1.5">
                            {fw.version}
                          </span>
                          <h3 className="text-base font-bold text-slate-900 dark:text-white line-clamp-1">{fw.name}</h3>
                        </div>
                        {fw.isActive ? (
                          <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400 rounded-full border border-emerald-300 dark:border-emerald-800">
                            Aktif
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 rounded-full">
                            Pasif
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 line-clamp-2">
                        {fw.description || 'Açıklama girilmemiş.'}
                      </p>

                      <div className="space-y-2 text-xs bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 mb-4">
                        <div className="flex justify-between">
                          <span className="text-slate-500 dark:text-slate-400">Görev Kimliği (Role Key):</span>
                          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{fw.roleKey}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 dark:text-slate-400">Cihaz Tipi (Device Type):</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{fw.deviceType}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 dark:text-slate-400">Donanım Modeli:</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{fw.hardwareModel || 'ESP32 / ESP8266'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 dark:text-slate-400">Dosya Boyutu:</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {(fw.binarySize / 1024).toFixed(1)} KB ({fw.binarySize} B)
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-700">
                          <span className="text-slate-500 dark:text-slate-400">SHA-256 Hash:</span>
                          <button
                            onClick={() => copyToClipboard(fw.sha256)}
                            className="flex items-center gap-1 font-mono text-[10px] text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 truncate max-w-[140px]"
                            title="SHA-256 doğrulama kodunu kopyala"
                          >
                            <span className="truncate">{fw.sha256.substring(0, 12)}...</span>
                            {copiedSha === fw.sha256 ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>

                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between mb-4">
                        <span>Eşleşen Cihaz Sayısı:</span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">{matchingDeviceCount} Cihaz</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <a
                        href={`/api/firmwares/${fw.id}/download`}
                        download
                        className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg text-center flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <DownloadCloud className="w-3.5 h-3.5" />
                        İndir (.bin)
                      </a>

                      {isAdmin && (
                        <>
                          <button
                            onClick={() => {
                              setSelectedFirmwareId(fw.id);
                              setTargetRoleValue(fw.roleKey);
                              setTargetTypeValue(fw.deviceType);
                              setActiveTab('deploy');
                            }}
                            className="py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Radio className="w-3.5 h-3.5" />
                            OTA Dağıt
                          </button>

                          <button
                            onClick={() => handleDeleteFirmware(fw.id, fw.name)}
                            className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                            title="Firmware'i Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: OTA DEPLOYMENT WIZARD */}
      {activeTab === 'deploy' && isAdmin && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm max-w-4xl mx-auto space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Radio className="w-6 h-6 text-indigo-600" />
              OTA Güncelleme Dağıtım Sihirbazı
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Hedef cihaz grubunu seçin. Yalnızca firmware'in <code className="text-indigo-600 dark:text-indigo-400 font-bold">role_key</code> ve <code className="text-indigo-600 dark:text-indigo-400 font-bold">device_type</code> değerleri ile uyumlu donanımlar güncellenecektir.
            </p>
          </div>

          <form onSubmit={handleDeployOta} className="space-y-6">
            {/* Step 1: Select Firmware */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                1. Dağıtılacak Firmware'i Seçin
              </label>
              <select
                value={selectedFirmwareId}
                onChange={(e) => {
                  setSelectedFirmwareId(e.target.value);
                  const fw = firmwares.find((f) => f.id === e.target.value);
                  if (fw) {
                    setTargetRoleValue(fw.roleKey);
                    setTargetTypeValue(fw.deviceType);
                  }
                }}
                required
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">-- Lütfen Firmware Seçin --</option>
                {firmwares.map((fw) => (
                  <option key={fw.id} value={fw.id}>
                    {fw.name} ({fw.version}) - Role Key: [{fw.roleKey}] - Model: {fw.hardwareModel}
                  </option>
                ))}
              </select>
            </div>

            {selectedFirmware && (
              <div className="p-4 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl flex items-start gap-3 text-xs text-indigo-900 dark:text-indigo-200">
                <Info className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-sm block mb-1">Seçilen Firmware Detayı:</span>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono">
                    <div>Versiyon: <strong>{selectedFirmware.version}</strong></div>
                    <div>Role Key: <strong>{selectedFirmware.roleKey}</strong></div>
                    <div>Cihaz Tipi: <strong>{selectedFirmware.deviceType}</strong></div>
                    <div>SHA-256: <strong>{selectedFirmware.sha256.substring(0, 10)}...</strong></div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Target Scope Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                2. Hedef Kapsamı ve Filtreleme Seçin
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label
                  className={`p-4 border rounded-xl cursor-pointer flex items-start gap-3 transition-all ${
                    targetScope === 'role_key'
                      ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="targetScope"
                    value="role_key"
                    checked={targetScope === 'role_key'}
                    onChange={() => setTargetScope('role_key')}
                    className="mt-1 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="font-bold text-sm text-slate-900 dark:text-white block">
                      Aynı Görev Kimliğine (Role Key) Sahip Tüm Cihazlar
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Örnek: "{selectedFirmware?.roleKey || 'PUMP_CTRL'}" görevini yürüten tüm ESP kartları
                    </span>
                  </div>
                </label>

                <label
                  className={`p-4 border rounded-xl cursor-pointer flex items-start gap-3 transition-all ${
                    targetScope === 'device_type'
                      ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="targetScope"
                    value="device_type"
                    checked={targetScope === 'device_type'}
                    onChange={() => setTargetScope('device_type')}
                    className="mt-1 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="font-bold text-sm text-slate-900 dark:text-white block">
                      Cihaz Tipi (Device Type) Bazında
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Örnek: Tüm "{selectedFirmware?.deviceType || 'pump_controller'}" sınıfı cihazlar
                    </span>
                  </div>
                </label>

                <label
                  className={`p-4 border rounded-xl cursor-pointer flex items-start gap-3 transition-all ${
                    targetScope === 'single'
                      ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="targetScope"
                    value="single"
                    checked={targetScope === 'single'}
                    onChange={() => setTargetScope('single')}
                    className="mt-1 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="font-bold text-sm text-slate-900 dark:text-white block">
                      Tek Bir Özel Cihaz
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Yalnızca seçtiğiniz tek bir ESP cihazını günceller
                    </span>
                  </div>
                </label>

                <label
                  className={`p-4 border rounded-xl cursor-pointer flex items-start gap-3 transition-all ${
                    targetScope === 'selected'
                      ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="targetScope"
                    value="selected"
                    checked={targetScope === 'selected'}
                    onChange={() => setTargetScope('selected')}
                    className="mt-1 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="font-bold text-sm text-slate-900 dark:text-white block">
                      Manuel Seçilen Çoklu Cihazlar
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Listeden işaretlediğiniz cihazlara OTA gönderir
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Scope Inputs */}
            {targetScope === 'single' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Hedef Cihazı Seçin:
                </label>
                <select
                  value={singleDeviceId}
                  onChange={(e) => setSingleDeviceId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm"
                  required
                >
                  <option value="">-- Cihaz Seçiniz --</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.ipAddress}) - Role Key: [{d.roleKey || 'TANIMSIZ'}] - Sürüm: {d.firmwareVersion || 'v1.0'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {targetScope === 'selected' && (
              <div className="space-y-2 max-h-60 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50 dark:bg-slate-800/40">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-2">
                  Güncellenecek Cihazları İşaretleyin:
                </span>
                {devices.map((d) => {
                  const isChecked = selectedDeviceIds.includes(d.id);
                  return (
                    <label key={d.id} className="flex items-center justify-between p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs cursor-pointer">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDeviceIds([...selectedDeviceIds, d.id]);
                            } else {
                              setSelectedDeviceIds(selectedDeviceIds.filter((id) => id !== d.id));
                            }
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="font-bold text-slate-900 dark:text-white">{d.name}</span>
                        <span className="text-slate-500">({d.ipAddress})</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded">
                          Role: {d.roleKey || 'YOK'}
                        </span>
                        <span className="text-slate-500">{d.firmwareVersion || 'v1.0'}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Submit Action Button */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="submit"
                disabled={deploying || !selectedFirmwareId}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 text-sm transition-all"
              >
                {deploying ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    OTA Dağıtılıyor...
                  </>
                ) : (
                  <>
                    <Radio className="w-4 h-4" />
                    OTA Güncellemesini Şimdi Başlat
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: LIVE OTA STATUS & JOBS TRACKING */}
      {activeTab === 'jobs' && (
        <div className="space-y-4">
          {/* Search & Filter Header */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800 rounded-2xl">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Cihaz adı, Role Key veya IP ara..."
                value={jobSearch}
                onChange={(e) => setJobSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={jobStatusFilter}
                onChange={(e) => setJobStatusFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none"
              >
                <option value="all">Tüm Durumlar</option>
                <option value="PENDING">Bekliyor (PENDING)</option>
                <option value="DOWNLOADING">İndiriliyor (DOWNLOADING)</option>
                <option value="SUCCESS">Güncellendi (SUCCESS)</option>
                <option value="FAILED">Başarısız (FAILED)</option>
              </select>

              <button
                onClick={() => {
                  fetchOtaJobs();
                  if (onRefreshDevices) onRefreshDevices();
                }}
                className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-slate-700 dark:text-slate-300"
                title="Yenile"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Devices Live OTA Progress Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 uppercase font-bold tracking-wider">
                  <tr>
                    <th className="px-4 py-3.5">Cihaz / IP</th>
                    <th className="px-4 py-3.5">Görev Kimliği (Role Key)</th>
                    <th className="px-4 py-3.5">Mevcut / Hedef Sürüm</th>
                    <th className="px-4 py-3.5">Canlı OTA Durumu</th>
                    <th className="px-4 py-3.5">İlerleme (%)</th>
                    <th className="px-4 py-3.5">Son Sinyal</th>
                    <th className="px-4 py-3.5 text-right">Eylemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {devices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        Sistemde kayıtlı cihaz bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    devices
                      .filter((d) => {
                        if (jobStatusFilter !== 'all' && (d.otaStatus || 'IDLE') !== jobStatusFilter) return false;
                        if (
                          jobSearch &&
                          !d.name.toLowerCase().includes(jobSearch.toLowerCase()) &&
                          !d.ipAddress.includes(jobSearch) &&
                          !(d.roleKey || '').toLowerCase().includes(jobSearch.toLowerCase())
                        ) {
                          return false;
                        }
                        return true;
                      })
                      .map((d) => {
                        const targetFw = d.otaTargetFirmwareId
                          ? firmwares.find((f) => f.id === d.otaTargetFirmwareId)
                          : undefined;

                        return (
                          <tr key={d.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-4 py-3 font-medium">
                              <div className="font-bold text-slate-900 dark:text-white">{d.name}</div>
                              <div className="text-[11px] text-slate-500 font-mono">{d.ipAddress || '127.0.0.1'}</div>
                            </td>

                            <td className="px-4 py-3">
                              <span className="inline-block px-2 py-0.5 rounded font-mono font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60">
                                {d.roleKey || 'PUMP_CTRL'}
                              </span>
                              <div className="text-[10px] text-slate-400 mt-0.5">{d.deviceType || d.type}</div>
                            </td>

                            <td className="px-4 py-3 font-mono">
                              <div className="flex items-center gap-1">
                                <span className="text-slate-600 dark:text-slate-400">{d.firmwareVersion || 'v1.0.0'}</span>
                                {targetFw && (
                                  <>
                                    <ArrowRight className="w-3 h-3 text-indigo-500" />
                                    <span className="font-bold text-indigo-600 dark:text-indigo-400">{targetFw.version}</span>
                                  </>
                                )}
                              </div>
                            </td>

                            <td className="px-4 py-3">
                              {d.otaStatus === 'PENDING' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                  <Clock className="w-3.5 h-3.5 animate-pulse" />
                                  Bekliyor
                                </span>
                              )}
                              {d.otaStatus === 'DOWNLOADING' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  İndiriliyor (%{d.otaProgress || 0})
                                </span>
                              )}
                              {d.otaStatus === 'SUCCESS' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                  Güncellendi
                                </span>
                              )}
                              {d.otaStatus === 'FAILED' && (
                                <span
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800"
                                  title={d.otaErrorMessage || 'Hata'}
                                >
                                  <XCircle className="w-3.5 h-3.5 text-rose-500" />
                                  Başarısız
                                </span>
                              )}
                              {(!d.otaStatus || d.otaStatus === 'IDLE') && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-slate-500 bg-slate-100 dark:bg-slate-800">
                                  Boşta (Idle)
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-3">
                              {d.otaStatus === 'DOWNLOADING' || d.otaStatus === 'PENDING' ? (
                                <div className="w-32">
                                  <div className="flex justify-between text-[10px] text-slate-500 mb-1 font-mono">
                                    <span>%{d.otaProgress || 0}</span>
                                  </div>
                                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                                      style={{ width: `${d.otaProgress || 0}%` }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-400 font-mono">-</span>
                              )}
                            </td>

                            <td className="px-4 py-3 text-slate-500 text-[11px]">
                              {d.lastSeen ? new Date(d.lastSeen).toLocaleTimeString() : 'Bilinmiyor'}
                            </td>

                            <td className="px-4 py-3 text-right">
                              {isAdmin && (d.otaStatus === 'PENDING' || d.otaStatus === 'DOWNLOADING') && (
                                <button
                                  onClick={() => handleCancelOta(d.id)}
                                  className="px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                                >
                                  İptal Et
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* UPLOAD MODAL */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-indigo-600" />
                Yeni Firmware Yükle (ESP8266 / ESP32)
              </h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleFileUpload} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Firmware Adı / Tanımı *
                </label>
                <input
                  type="text"
                  placeholder="Örn: Saha Pompa Kontrolörü Sürüm 1.2.0"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Cihaz Tipi (deviceType) *
                  </label>
                  <input
                    type="text"
                    placeholder="Örn: pump_controller"
                    value={uploadDeviceType}
                    onChange={(e) => setUploadDeviceType(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Görev Kimliği (roleKey) *
                  </label>
                  <input
                    type="text"
                    placeholder="Örn: PUMP_CTRL"
                    value={uploadRoleKey}
                    onChange={(e) => setUploadRoleKey(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Donanım Modeli
                  </label>
                  <select
                    value={uploadHardwareModel}
                    onChange={(e) => setUploadHardwareModel(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="ESP32_WROOM_32">ESP32 WROOM 32</option>
                    <option value="ESP8266_NODEMCU">ESP8266 NodeMCU</option>
                    <option value="ESP32_S3">ESP32-S3 / C3</option>
                    <option value="ALL">Tüm Donanımlar (ALL)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Sürüm Kodu (Version) *
                  </label>
                  <input
                    type="text"
                    placeholder="Örn: v1.2.0"
                    value={uploadVersion}
                    onChange={(e) => setUploadVersion(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Açıklama / Değişiklik Notları
                </label>
                <textarea
                  rows={2}
                  placeholder="Bu sürümde yapılan düzeltmeler..."
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Binary (.bin) Dosyası Seçin
                </label>
                <input
                  type="file"
                  accept=".bin,.hex,.elf"
                  onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  SHA-256 doğrulama kodu dosya yüklendiğinde otomatik hesaplanacaktır.
                </span>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-medium"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-1.5"
                >
                  {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                  Yüklemeyi Tamamla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
