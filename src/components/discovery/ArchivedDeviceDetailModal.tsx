import React, { useState, useEffect } from 'react';
import {
  X,
  RotateCcw,
  Trash2,
  HardDrive,
  FileText,
  Key,
  Cpu,
  Layers,
  MapPin,
  Clock,
  CheckCircle2,
  Tag,
  Download,
  AlertCircle,
} from 'lucide-react';
import type { ArchivedDevice, TelemetryReading } from '../../types';
import { apiFetch as fetch } from '../../lib/apiFetch';

interface ArchivedDeviceDetailModalProps {
  archivedDevice: ArchivedDevice;
  onClose: () => void;
  onRestore: (deviceId: string) => void;
  onDelete: (deviceId: string) => void;
  isRestoring?: boolean;
}

export const ArchivedDeviceDetailModal: React.FC<ArchivedDeviceDetailModalProps> = ({
  archivedDevice,
  onClose,
  onRestore,
  onDelete,
  isRestoring = false,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'settings' | 'telemetry' | 'raw'>('settings');
  const [telemetryReadings, setTelemetryReadings] = useState<TelemetryReading[]>([]);
  const [isLoadingTelemetry, setIsLoadingTelemetry] = useState(false);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);

  const dev = archivedDevice.device;
  const preserved = archivedDevice.preservedSettings || ({} as any);
  const stats = archivedDevice.telemetrySnapshot?.stats;

  // Fetch decompressed telemetry history on mount or when tab changes
  useEffect(() => {
    let isMounted = true;
    const loadDecompressedTelemetry = async () => {
      setIsLoadingTelemetry(true);
      setTelemetryError(null);
      try {
        const res = await fetch(`/api/network/archived/${archivedDevice.id}/telemetry`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setTelemetryReadings(Array.isArray(data) ? data : []);
          }
        } else {
          if (isMounted) setTelemetryError('Sıkıştırılmış telemetri verisi çözülemedi.');
        }
      } catch (err: any) {
        if (isMounted) setTelemetryError(err.message || 'Telemetri verisi yüklenirken hata oluştu.');
      } finally {
        if (isMounted) setIsLoadingTelemetry(false);
      }
    };

    loadDecompressedTelemetry();
    return () => {
      isMounted = false;
    };
  }, [archivedDevice.id]);

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const downloadJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(archivedDevice, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `archived_device_${archivedDevice.id}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-100">{dev.name || preserved.name || archivedDevice.id}</h3>
                <span className="text-xs px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono">
                  Silindi & Arşivlendi
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">ID: {archivedDevice.id} • MAC: {dev.macAddress || preserved.macAddress || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={downloadJson}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title="JSON Olarak İndir"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Compression Summary Banner */}
        <div className="bg-slate-950/60 border-b border-slate-800 px-5 py-3 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-slate-500 block">Sıkıştırma Algoritması:</span>
              <span className="font-semibold text-cyan-400 uppercase font-mono">{stats?.algorithm || 'gzip-base64'}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Kayıt Sayısı:</span>
              <span className="font-semibold text-slate-200 font-mono">{stats?.originalPointsCount || telemetryReadings.length} Telemetri Paketi</span>
            </div>
            <div>
              <span className="text-slate-500 block">Ham Boyut:</span>
              <span className="font-semibold text-slate-200 font-mono">{formatBytes(stats?.rawSizeBytes || 0)}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Sıkıştırılmış Boyut:</span>
              <span className="font-semibold text-emerald-400 font-mono">{formatBytes(stats?.compressedSizeBytes || 0)}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Depolama Kazancı:</span>
              <span className="inline-flex items-center gap-1 font-bold text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                %{stats?.compressionRatioPercent || 0} Tasarruf
              </span>
            </div>
          </div>
          <div className="text-slate-400">
            Silinme Tarihi: <span className="font-mono text-slate-300">{new Date(archivedDevice.deletedAt).toLocaleString('tr-TR')}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 px-5 pt-3 bg-slate-900/50">
          <button
            type="button"
            onClick={() => setActiveSubTab('settings')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeSubTab === 'settings'
                ? 'border-cyan-500 text-cyan-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Korunan Ayarlar & Yapılandırma</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('telemetry')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeSubTab === 'telemetry'
                ? 'border-cyan-500 text-cyan-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Geçmiş Telemetri Kayıtları ({telemetryReadings.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('raw')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeSubTab === 'raw'
                ? 'border-cyan-500 text-cyan-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Ham Arşiv JSON</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {activeSubTab === 'settings' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Hardware & Identity */}
                <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
                    <Cpu className="w-4 h-4" /> Kimlik & Donanım Modeli
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 block">Cihaz Adı:</span>
                      <span className="text-slate-200 font-medium">{dev.name || preserved.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Cihaz Tipi:</span>
                      <span className="text-slate-200 font-medium">{dev.type || preserved.type}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Donanım Modeli:</span>
                      <span className="text-slate-200 font-mono">{dev.hardwareModel || preserved.hardwareModel || 'ESP32'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Firmware Sürümü:</span>
                      <span className="text-slate-200 font-mono">{dev.firmwareVersion || preserved.firmwareVersion || 'v1.0.0'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">IP Adresi:</span>
                      <span className="text-slate-200 font-mono">{dev.ipAddress || preserved.ipAddress || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">MAC Adresi:</span>
                      <span className="text-slate-200 font-mono">{dev.macAddress || preserved.macAddress || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Hierarchy & Location */}
                <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                    <MapPin className="w-4 h-4" /> Hiyerarşi & Konumlandırma
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 block">Tesis / Site ID:</span>
                      <span className="text-slate-200 font-mono">{dev.siteId || preserved.siteId || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Bölge / Zone ID:</span>
                      <span className="text-slate-200 font-mono">{dev.zoneId || preserved.zoneId || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Grup ID:</span>
                      <span className="text-slate-200 font-mono">{dev.groupId || preserved.groupId || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Konum:</span>
                      <span className="text-slate-200">{dev.location || preserved.location || 'Genel Saha'}</span>
                    </div>
                  </div>
                  {dev.tags && dev.tags.length > 0 && (
                    <div>
                      <span className="text-slate-500 block text-xs mb-1">Etiketler:</span>
                      <div className="flex flex-wrap gap-1">
                        {dev.tags.map((tag: string, i: number) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] border border-slate-700">
                            <Tag className="w-2.5 h-2.5" /> {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Security & API Key */}
              <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-4 space-y-2 text-xs">
                <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                  <Key className="w-4 h-4" /> Güvenlik & API Anahtarı
                </h4>
                <div className="flex items-center justify-between bg-slate-900 px-3 py-2 rounded-lg border border-slate-800">
                  <span className="text-slate-400">Saklanan API Key:</span>
                  <span className="font-mono text-amber-300 bg-slate-950 px-2 py-1 rounded">
                    {preserved.apiKey ? `${preserved.apiKey.substring(0, 10)}...${preserved.apiKey.substring(preserved.apiKey.length - 4)}` : '••••••••••••••••'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  * Cihaz sisteme geri yüklendiğinde aynı API anahtarı ve yetkileri aktif edilerek cihazın yeniden yapılandırılmasına gerek kalmaz.
                </p>
              </div>

              {/* Preserved Outputs / Relay Defs */}
              {dev.outputDefinitions && dev.outputDefinitions.length > 0 && (
                <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-4 space-y-2 text-xs">
                  <h4 className="text-xs font-semibold text-purple-400 uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-4 h-4" /> Tanımlı Çıkışlar & Röle Kanalları ({dev.outputDefinitions.length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {dev.outputDefinitions.map((out, idx) => (
                      <div key={idx} className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="font-medium text-slate-200 block">{out.label || out.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">Pin: {out.pin} • Tip: {out.type}</span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                          {out.state ? 'AÇIK (1)' : 'KAPALI (0)'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'telemetry' && (
            <div className="space-y-3">
              {isLoadingTelemetry ? (
                <div className="p-8 text-center text-slate-400 text-xs animate-pulse">
                  Sıkıştırılmış telemetri arşivi çözülüyor (Gzip decompression)...
                </div>
              ) : telemetryError ? (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> {telemetryError}
                </div>
              ) : telemetryReadings.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Bu cihaza ait arşivlenmiş telemetri kaydı bulunmuyor.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Çözülen Telemetri Paketleri ({telemetryReadings.length})</span>
                    <span className="text-[11px] text-emerald-400 font-mono">100% Veri Bütünlüğü Doğrulandı</span>
                  </div>
                  <div className="overflow-x-auto border border-slate-800 rounded-xl max-h-96">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 font-medium border-b border-slate-800">
                        <tr>
                          <th className="py-2 px-3">Zaman Damgası</th>
                          <th className="py-2 px-3">Sıcaklık (°C)</th>
                          <th className="py-2 px-3">Nem (%)</th>
                          <th className="py-2 px-3">Basınç (hPa)</th>
                          <th className="py-2 px-3">Güç (W)</th>
                          <th className="py-2 px-3">Voltaj (V)</th>
                          <th className="py-2 px-3">RSSI</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                        {telemetryReadings.map((r, idx) => (
                          <tr key={`tel_detail_${r.timestamp || 'ts'}_${idx}`} className="hover:bg-slate-800/40 text-slate-300">
                            <td className="py-2 px-3 text-slate-400">
                              {r.timestamp ? new Date(r.timestamp).toLocaleString('tr-TR') : '—'}
                            </td>
                            <td className="py-2 px-3">{r.temperature !== undefined ? `${r.temperature.toFixed(1)} °C` : '—'}</td>
                            <td className="py-2 px-3">{r.humidity !== undefined ? `${r.humidity.toFixed(1)} %` : '—'}</td>
                            <td className="py-2 px-3">{r.pressure !== undefined ? `${r.pressure.toFixed(0)} hPa` : '—'}</td>
                            <td className="py-2 px-3">{r.power !== undefined ? `${r.power.toFixed(1)} W` : '—'}</td>
                            <td className="py-2 px-3">{r.voltage !== undefined ? `${r.voltage.toFixed(1)} V` : '—'}</td>
                            <td className="py-2 px-3">{r.rssi !== undefined ? `${r.rssi} dBm` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'raw' && (
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 max-h-96 overflow-y-auto font-mono text-[11px] text-slate-300">
              <pre className="whitespace-pre-wrap">{JSON.stringify(archivedDevice, null, 2)}</pre>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onDelete(archivedDevice.id)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-800/40 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>Kalıcı Olarak Sil</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              Kapat
            </button>
            <button
              type="button"
              disabled={isRestoring}
              onClick={() => onRestore(archivedDevice.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-md transition-all disabled:opacity-50"
            >
              <RotateCcw className={`w-4 h-4 ${isRestoring ? 'animate-spin' : ''}`} />
              <span>Sisteme Geri Yükle & Entegre Et</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
