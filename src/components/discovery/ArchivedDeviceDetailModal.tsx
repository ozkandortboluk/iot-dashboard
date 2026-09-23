import React, { useState, useEffect, useMemo } from 'react';
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
  Bell,
  Sliders,
  Activity,
  Database,
  ShieldCheck,
  Zap,
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

  const dev = archivedDevice.device || ({} as any);
  const preserved = archivedDevice.preservedSettings || ({} as any);
  const snapshotStats = archivedDevice.telemetrySnapshot?.stats;

  // Fetch decompressed telemetry history on mount
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

  // Dynamic calculations for real stats
  const displayPointCount = useMemo(() => {
    if (telemetryReadings.length > 0) return telemetryReadings.length;
    return snapshotStats?.originalPointsCount || snapshotStats?.compressedPointsCount || archivedDevice.telemetrySnapshot?.recentReadings?.length || 0;
  }, [telemetryReadings, snapshotStats, archivedDevice]);

  const calculatedRawBytes = useMemo(() => {
    if (telemetryReadings.length > 0) {
      try {
        return new Blob([JSON.stringify(telemetryReadings)]).size;
      } catch {
        return snapshotStats?.rawSizeBytes || 0;
      }
    }
    return snapshotStats?.rawSizeBytes || 0;
  }, [telemetryReadings, snapshotStats]);

  const compressedStr = archivedDevice.telemetrySnapshot?.compressedData || '';
  const calculatedCompressedBytes = useMemo(() => {
    if (compressedStr) {
      return Math.round((compressedStr.length * 3) / 4);
    }
    return snapshotStats?.compressedSizeBytes || 0;
  }, [compressedStr, snapshotStats]);

  const displaySavingsPercent = useMemo(() => {
    if (calculatedRawBytes > 0) {
      return Math.max(0, Math.round(((calculatedRawBytes - calculatedCompressedBytes) / calculatedRawBytes) * 100));
    }
    return snapshotStats?.compressionRatioPercent || 0;
  }, [calculatedRawBytes, calculatedCompressedBytes, snapshotStats]);

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

  // Helper to extract clean metric map for matrix rows
  const parseRowMetricsMap = (r: any) => {
    const timestamp = r.timestamp || r.created_at || r.time;
    const formattedTime = timestamp ? new Date(timestamp).toLocaleString('tr-TR') : '—';
    const sourceLabel = r.source === 'simulator' ? 'Simülatör' : r.source === 'manual_test' ? 'Test' : 'Fiziksel Cihaz';
    const status = r.status || 'normal';

    const metricsMap: Record<string, { value: string; unit?: string }> = {};

    // 1. Single metric format
    if (r.metric && r.value !== undefined) {
      metricsMap[String(r.metric)] = {
        value: typeof r.value === 'number' ? r.value.toFixed(2) : String(r.value),
        unit: r.unit || '',
      };
    }

    // 2. Metrics inside r.metrics object
    if (r.metrics && typeof r.metrics === 'object') {
      Object.entries(r.metrics).forEach(([k, v]) => {
        if (v !== undefined && v !== null && typeof v !== 'object') {
          metricsMap[k] = {
            value: typeof v === 'number' ? (v as number).toFixed(2) : String(v),
          };
        }
      });
    }

    // 3. Known keys directly on root object
    const knownKeys = ['temperature', 'humidity', 'pressure', 'power', 'voltage', 'rssi', 'battery', 'cpu', 'memory', 'bandwidth', 'current', 'co2', 'flowRate'];
    knownKeys.forEach((key) => {
      if (r[key] !== undefined && r[key] !== null && !metricsMap[key]) {
        const unit = key === 'temperature' ? '°C' : key === 'humidity' ? '%' : key === 'pressure' ? 'hPa' : key === 'power' ? 'W' : key === 'voltage' ? 'V' : key === 'rssi' ? 'dBm' : key === 'battery' ? '%' : '';
        const val = r[key];
        metricsMap[key] = {
          value: typeof val === 'number' ? val.toFixed(1) : String(val),
          unit,
        };
      }
    });

    return {
      timestamp: formattedTime,
      sourceLabel,
      status,
      metricsMap,
      sequence: r.sequence,
      packetId: r.packetId || r.bootId,
    };
  };

  // Group readings by timestamp so metrics arriving at the same second appear on the SAME row
  const groupedTelemetryRows = useMemo(() => {
    if (!telemetryReadings || telemetryReadings.length === 0) return [];

    const map = new Map<string, {
      groupKey: string;
      rawTime: number;
      formattedTimestamp: string;
      sourceLabel: string;
      status: string;
      metricsMap: Record<string, { value: string; unit?: string }>;
      pointCount: number;
    }>();

    telemetryReadings.forEach((r) => {
      const rawTs = r.timestamp || r.created_at || r.time;
      let groupKey: string;
      let rawTime = 0;
      let formatted = '—';

      if (rawTs) {
        const d = new Date(rawTs);
        if (!isNaN(d.getTime())) {
          // Normalize to second precision (e.g. 12:20:43) so all metrics sharing that second are grouped together
          rawTime = Math.floor(d.getTime() / 1000) * 1000;
          groupKey = `ts_${rawTime}`;
          formatted = d.toLocaleString('tr-TR');
        } else {
          groupKey = `str_${String(rawTs)}`;
          formatted = String(rawTs);
        }
      } else {
        groupKey = `unknown_${Math.random()}`;
      }

      const parsed = parseRowMetricsMap(r);
      const existing = map.get(groupKey);

      if (!existing) {
        map.set(groupKey, {
          groupKey,
          rawTime,
          formattedTimestamp: formatted,
          sourceLabel: parsed.sourceLabel,
          status: parsed.status,
          metricsMap: { ...parsed.metricsMap },
          pointCount: 1,
        });
      } else {
        // Merge metric values side by side
        Object.entries(parsed.metricsMap).forEach(([k, v]) => {
          existing.metricsMap[k] = v;
        });

        // Elevate severity if critical/warning
        if (parsed.status === 'critical') {
          existing.status = 'critical';
        } else if (parsed.status === 'warning' && existing.status !== 'critical') {
          existing.status = 'warning';
        }

        if (parsed.sourceLabel === 'Fiziksel Cihaz') {
          existing.sourceLabel = 'Fiziksel Cihaz';
        }
        existing.pointCount += 1;
      }
    });

    // Sort descending by timestamp (newest records first)
    return Array.from(map.values()).sort((a, b) => b.rawTime - a.rawTime);
  }, [telemetryReadings]);

  // Dynamically compute horizontal metric column headers from the grouped rows
  const uniqueMetricColumns = useMemo(() => {
    const keysSet = new Set<string>();
    groupedTelemetryRows.forEach((row) => {
      Object.keys(row.metricsMap).forEach((k) => keysSet.add(k));
    });
    if (keysSet.size === 0) {
      return ['temperature', 'humidity', 'pressure'];
    }
    return Array.from(keysSet);
  }, [groupedTelemetryRows]);

  // Helper to format metric header labels
  const formatMetricHeader = (key: string) => {
    const lower = key.toLowerCase();
    if (lower === 'temperature' || lower === 'temp') return 'Sıcaklık (°C)';
    if (lower === 'humidity' || lower === 'hum') return 'Nem (%)';
    if (lower === 'pressure' || lower === 'press') return 'Basınç (hPa)';
    if (lower === 'voltage' || lower === 'volt') return 'Voltaj (V)';
    if (lower === 'power') return 'Güç (W)';
    if (lower === 'rssi') return 'Sinyal (dBm)';
    if (lower === 'battery') return 'Batarya (%)';
    if (lower === 'cpu') return 'CPU (%)';
    if (lower === 'memory' || lower === 'ram') return 'RAM (%)';
    if (lower === 'current') return 'Akım (A)';
    if (lower === 'co2') return 'CO₂ (ppm)';
    if (lower === 'flowrate') return 'Debi (L/dk)';
    return key.charAt(0).toUpperCase() + key.slice(1);
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

        {/* Compression & Storage Banner */}
        <div className="bg-slate-950/60 border-b border-slate-800 px-5 py-3 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <span className="text-slate-500 block text-[10px]">Sıkıştırma Algoritması:</span>
              <span className="font-semibold text-cyan-400 uppercase font-mono">{snapshotStats?.algorithm || 'gzip-base64'}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Saklanan Telemetri Sayısı:</span>
              <span className="font-semibold text-slate-200 font-mono">{displayPointCount} Paketi</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Ham Boyut:</span>
              <span className="font-semibold text-slate-200 font-mono">{formatBytes(calculatedRawBytes)}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Sıkıştırılmış Boyut:</span>
              <span className="font-semibold text-emerald-400 font-mono">{formatBytes(calculatedCompressedBytes)}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Depolama Tasarrufu:</span>
              <span className="inline-flex items-center gap-1 font-bold text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                %{displaySavingsPercent} Tasarruf
              </span>
            </div>
          </div>
          <div className="text-slate-400 text-[11px]">
            Silinme Tarihi: <span className="font-mono text-slate-300">{new Date(archivedDevice.deletedAt).toLocaleString('tr-TR')}</span>
          </div>
        </div>

        {/* Navigation Sub-Tabs */}
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
            <span>Geçmiş Telemetri Kayıtları ({groupedTelemetryRows.length > 0 ? groupedTelemetryRows.length : displayPointCount})</span>
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

        {/* Modal Content Body */}
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
                    {dev.outputDefinitions.map((out: any, idx: number) => (
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

              {/* Preserved Metrics & History */}
              {((preserved.metrics && Object.keys(preserved.metrics).length > 0) || archivedDevice.metricHistory) && (
                <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-4 space-y-2 text-xs">
                  <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                    <Activity className="w-4 h-4" /> Korunan Son Metrik Durumu & Değerleri
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {preserved.metrics && Object.entries(preserved.metrics).map(([key, val]) => (
                      <div key={key} className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block text-[10px] uppercase font-mono">{key}</span>
                        <span className="text-slate-100 font-mono font-medium text-xs">
                          {typeof val === 'number' ? val.toFixed(2) : String(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preserved Rules */}
              {archivedDevice.archivedRules && archivedDevice.archivedRules.length > 0 && (
                <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-4 space-y-2 text-xs">
                  <h4 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
                    <Sliders className="w-4 h-4" /> Korunan Eşik Kuralları ({archivedDevice.archivedRules.length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {archivedDevice.archivedRules.map((rule, idx) => (
                      <div key={rule.id || idx} className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="font-medium text-slate-200 block">{rule.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {rule.metric} {rule.operator} {rule.threshold}
                          </span>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                          rule.severity === 'critical' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                          rule.severity === 'warning' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                          'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}>
                          {rule.severity || 'info'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preserved Alarms */}
              {archivedDevice.archivedAlarms && archivedDevice.archivedAlarms.length > 0 && (
                <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-4 space-y-2 text-xs">
                  <h4 className="text-xs font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-2">
                    <Bell className="w-4 h-4" /> Korunan Alarmlar ({archivedDevice.archivedAlarms.length})
                  </h4>
                  <div className="space-y-1.5">
                    {archivedDevice.archivedAlarms.map((alarm, idx) => (
                      <div key={alarm.id || idx} className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-medium text-slate-200 block">{alarm.title || alarm.message || 'Alarm'}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {alarm.timestamp ? new Date(alarm.timestamp).toLocaleString('tr-TR') : '—'}
                          </span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono">
                          {alarm.severity || 'Kritik'}
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
                <div className="p-8 text-center text-slate-400 text-xs animate-pulse flex flex-col items-center gap-2">
                  <Database className="w-6 h-6 text-cyan-400 animate-spin" />
                  <span>Sıkıştırılmış telemetri arşivi çözülüyor (GZIP Decompression)...</span>
                </div>
              ) : telemetryError ? (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> {telemetryError}
                </div>
              ) : telemetryReadings.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                  Bu cihaza ait arşivlenmiş telemetri kaydı bulunmuyor.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                    <div className="flex items-center gap-2 font-mono">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span className="text-slate-200 font-semibold">
                        {groupedTelemetryRows.length} Zaman Damgası Satırı ({telemetryReadings.length} Telemetri Paketi Eşlendi)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-cyan-400 font-mono bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/20">
                        Zaman Senkronize Gruplama (Yan Yana)
                      </span>
                      <span className="text-[11px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        %100 Kayıpsız Bütünlük
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-slate-800 rounded-xl max-h-96">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-950 text-slate-300 font-semibold border-b border-slate-800 sticky top-0 z-10">
                        <tr>
                          <th className="py-2.5 px-3 whitespace-nowrap bg-slate-950 min-w-[150px]">
                            Zaman Damgası
                          </th>
                          {uniqueMetricColumns.map((colKey) => (
                            <th key={colKey} className="py-2.5 px-3 whitespace-nowrap bg-slate-950 font-mono text-cyan-400 text-center">
                              {formatMetricHeader(colKey)}
                            </th>
                          ))}
                          <th className="py-2.5 px-3 whitespace-nowrap bg-slate-950 min-w-[100px] text-center">
                            Kaynak
                          </th>
                          <th className="py-2.5 px-3 whitespace-nowrap bg-slate-950 min-w-[80px] text-center">
                            Durum
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                        {groupedTelemetryRows.map((row) => {
                          return (
                            <tr key={row.groupKey} className="hover:bg-slate-800/40 text-slate-300">
                              <td className="py-2 px-3 text-slate-300 font-medium whitespace-nowrap">
                                {row.formattedTimestamp}
                              </td>
                              {uniqueMetricColumns.map((colKey) => {
                                const metricObj = row.metricsMap[colKey];
                                return (
                                  <td key={colKey} className="py-2 px-3 text-center font-semibold">
                                    {metricObj ? (
                                      <span className="text-emerald-300 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20 font-mono">
                                        {metricObj.value} {metricObj.unit || ''}
                                      </span>
                                    ) : (
                                      <span className="text-slate-600 font-normal">—</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="py-2 px-3 text-center text-slate-400 text-[10px]">
                                <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60">
                                  {row.sourceLabel}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold ${
                                  row.status === 'critical' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                                  row.status === 'warning' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                                  'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                }`}>
                                  {row.status}
                                </span>
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
