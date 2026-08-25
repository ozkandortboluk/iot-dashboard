import React, { useState, useEffect } from 'react';
import type { Device, TelemetryReading } from '../types';
import { useRealtime } from '../context/RealtimeContext';
import { useAuth } from '../context/AuthContext';
import { generateMaskedKey, getStatusColor, formatDateTime, getStatusLabel, formatRelativeTime, isInternalOrControlMetric, getMetricUnit } from '../lib/utils';
import { apiFetch as fetch } from '../lib/apiFetch';
import {
  Cpu,
  Plus,
  Shield,
  Key,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  Terminal,
  Send,
  Code,
  Code2,
  Lock,
  Globe,
  Building2,
  UserCheck,
  Settings,
  AlertTriangle,
  Maximize2,
  Minimize2,
  Play,
  Pause,
  Radio,
  Activity,
  X,
  Bot,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  ArrowRight,
  Power,
  Database,
} from 'lucide-react';

export const DevicesView: React.FC<{ onNavigateToHelp?: () => void }> = ({ onNavigateToHelp }) => {
  const {
    devices,
    latestTelemetry,
    physicalTelemetry,
    simulationTelemetry,
    createNewDevice,
    updateDevice,
    deleteDevice,
    regenerateApiKey,
    convertToPhysicalDevice,
    triggerTestTelemetry,
    customersList,
    selectedCustomerForAdmin,
  } = useRealtime();
  const { user } = useAuth();

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Stable selected device resolution by ID (prevents flapping/disconnect ghosting)
  const selectedDevice = React.useMemo(() => {
    if (selectedDeviceId) {
      const match = devices.find((d) => d.id === selectedDeviceId);
      if (match) return match;
    }
    return devices[0] || null;
  }, [devices, selectedDeviceId]);

  // Conversion state
  const [convertingDevice, setConvertingDevice] = useState<Device | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionSuccessInfo, setConversionSuccessInfo] = useState<{ device: Device; apiKey: string } | null>(null);

  // New device form modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<Device['type']>('sensor');
  const [location, setLocation] = useState('');
  const [ipAddress, setIpAddress] = useState('192.168.1.150');
  const [targetOwnerId, setTargetOwnerId] = useState<string>('usr_admin');
  const [manualApiKey, setManualApiKey] = useState('');
  const [addHeartbeatTimeout, setAddHeartbeatTimeout] = useState<number>(300);
  const [isSimulated, setIsSimulated] = useState<boolean>(false);
  const [saveSimulatedDataToDb, setSaveSimulatedDataToDb] = useState<boolean>(false);
  const [addSimMetrics, setAddSimMetrics] = useState<string[]>(['l1', 'l2', 'l3', 'ri', 'rc', 'p']);
  const [addCustomSimMetricInput, setAddCustomSimMetricInput] = useState('');

  // Edit device modal state
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<Device['type']>('sensor');
  const [editLocation, setEditLocation] = useState('');
  const [editIpAddress, setEditIpAddress] = useState('');
  const [editOwnerId, setEditOwnerId] = useState('');
  const [editRateLimit, setEditRateLimit] = useState(120);
  const [editEncryption, setEditEncryption] = useState('AES-256-GCM');
  const [editStatus, setEditStatus] = useState<Device['status']>('online');
  const [editApiKey, setEditApiKey] = useState('');
  const [editHeartbeatTimeout, setEditHeartbeatTimeout] = useState<number>(300);
  const [editIsSimulated, setEditIsSimulated] = useState<boolean>(false);
  const [editSaveSimulatedDataToDb, setEditSaveSimulatedDataToDb] = useState<boolean>(false);
  const [editSimMetrics, setEditSimMetrics] = useState<string[]>([]);
  const [editCustomSimMetricInput, setEditCustomSimMetricInput] = useState('');

  // Quick inline token editor state for active device security card
  const [isEditingTokenInline, setIsEditingTokenInline] = useState(false);
  const [inlineTokenInput, setInlineTokenInput] = useState('');
  const [tokenSaveSuccess, setTokenSaveSuccess] = useState(false);

  // Delete confirmation modal state
  const [deletingDevice, setDeletingDevice] = useState<Device | null>(null);

  // Live Terminal State
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [rawPayloadInput, setRawPayloadInput] = useState('');
  const [isFullscreenTerminal, setIsFullscreenTerminal] = useState(false);
  const [isTerminalPaused, setIsTerminalPaused] = useState(false);
  const [frozenLogs, setFrozenLogs] = useState<TelemetryReading[] | null>(null);
  const [terminalFilterMode, setTerminalFilterMode] = useState<'all' | 'selected'>('all');
  const [clearedLogsAt, setClearedLogsAt] = useState<number>(0);
  const [lastResponse, setLastResponse] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [activeCodeTab, setActiveCodeTab] = useState<'esp32_ping' | 'curl_ping' | 'curl_telemetry' | 'python'>('esp32_ping');
  const [showCodeGuide, setShowCodeGuide] = useState(false);
  const [metricsScope, setMetricsScope] = useState<'selected' | 'all'>('selected');

  const activeDevice = selectedDevice;

  // Active System Metrics: Strictly isolates to the active selected device (or all devices if toggled)
  const activeSystemMetrics = React.useMemo(() => {
    const metricMap = new Map<string, {
      name: string;
      latestValue?: number | string;
      unit?: string;
      lastTimestamp?: string;
      ageText?: string;
      deviceNames: Set<string>;
      isFresh: boolean;
      isFromTelemetryStream: boolean;
    }>();

    const now = Date.now();
    const RECENCY_WINDOW_MS = 10 * 60 * 1000; // 10 minutes window

    if (metricsScope === 'selected' && activeDevice) {
      // 1. STRICT SELECTED DEVICE ISOLATION:
      // Real physical hardware devices ONLY query physicalTelemetry.
      // Virtual/simulated devices ONLY query simulationTelemetry.
      const targetDevId = activeDevice.id;
      const targetApiKey = activeDevice.apiKey;
      const targetName = activeDevice.name;

      const isPhysical = !activeDevice.isSimulated;
      const telemetrySource = isPhysical ? physicalTelemetry : simulationTelemetry;

      // 1. Seed from activeDevice.metrics (ensures all reported metrics are immediately available as initial state)
      if (activeDevice.metrics && typeof activeDevice.metrics === 'object') {
        for (const [mKey, mVal] of Object.entries(activeDevice.metrics)) {
          if (!mKey || isInternalOrControlMetric(mKey) || typeof mVal !== 'number' || isNaN(mVal)) continue;
          const lowerKey = mKey.toLowerCase();
          const unit = getMetricUnit(mKey);
          const lastTs = activeDevice.lastSeen || new Date().toISOString();
          const ageSec = Math.max(0, Math.floor((now - new Date(lastTs).getTime()) / 1000));
          const ageText = ageSec < 60 ? `${ageSec} sn önce` : `${Math.floor(ageSec / 60)} dk önce`;

          metricMap.set(lowerKey, {
            name: mKey,
            latestValue: mVal,
            unit,
            lastTimestamp: lastTs,
            ageText,
            deviceNames: new Set([targetName || targetDevId]),
            isFresh: ageSec < 180,
            isFromTelemetryStream: false,
          });
        }
      }

      // 2. Overlay from telemetrySource stream for authoritative per-metric readings, timestamps, and units
      for (const t of telemetrySource) {
        if (!t || !t.metric || isInternalOrControlMetric(t.metric)) continue;

        const isMatch =
          t.deviceId === targetDevId ||
          (targetApiKey && t.deviceId === targetApiKey) ||
          (targetName && t.deviceName === targetName);

        if (!isMatch) continue;

        const ts = t.timestamp ? new Date(t.timestamp).getTime() : 0;
        if (!ts || now - ts > RECENCY_WINDOW_MS) continue;

        const lowerKey = t.metric.toLowerCase();
        const ageSec = Math.max(0, Math.floor((now - ts) / 1000));
        const ageText = ageSec < 60 ? `${ageSec} sn önce` : `${Math.floor(ageSec / 60)} dk önce`;

        const existing = metricMap.get(lowerKey);
        if (!existing || !existing.isFromTelemetryStream) {
          metricMap.set(lowerKey, {
            name: t.metric,
            latestValue: t.value,
            unit: t.unit || getMetricUnit(t.metric),
            lastTimestamp: t.timestamp,
            ageText,
            deviceNames: new Set([targetName || targetDevId]),
            isFresh: ageSec < 180,
            isFromTelemetryStream: true,
          });
        } else {
          const existingTs = existing.lastTimestamp ? new Date(existing.lastTimestamp).getTime() : 0;
          if (ts >= existingTs) {
            existing.name = t.metric;
            existing.latestValue = t.value;
            if (t.unit) existing.unit = t.unit;
            existing.lastTimestamp = t.timestamp;
            existing.ageText = ageText;
            existing.isFresh = ageSec < 180;
          }
        }
      }
    } else {
      // 2. ALL DEVICES AGGREGATION MODE (Only user's visible online devices)
      const onlineDevices = devices.filter((d) => d.status === 'online' && d.dataFlowActive !== false);
      const onlineDevIds = new Set(onlineDevices.map((d) => d.id));
      const onlineDevTokens = new Set(onlineDevices.map((d) => d.apiKey).filter(Boolean));
      const onlineDevNames = new Set(onlineDevices.map((d) => d.name).filter(Boolean));

      const telemetryPool: TelemetryReading[] = [
        ...physicalTelemetry,
        ...simulationTelemetry,
      ];

      for (const t of telemetryPool) {
        if (!t || !t.metric || isInternalOrControlMetric(t.metric)) continue;

        const isFromOnlineDev =
          onlineDevIds.has(t.deviceId) ||
          onlineDevTokens.has(t.deviceId) ||
          onlineDevNames.has(t.deviceName);

        if (!isFromOnlineDev) continue;

        const ts = t.timestamp ? new Date(t.timestamp).getTime() : 0;
        if (!ts || now - ts > RECENCY_WINDOW_MS) continue;

        const lowerKey = t.metric.toLowerCase();
        const ageSec = Math.max(0, Math.floor((now - ts) / 1000));
        const ageText = ageSec < 60 ? `${ageSec} sn önce` : `${Math.floor(ageSec / 60)} dk önce`;

        const existing = metricMap.get(lowerKey);
        if (!existing) {
          metricMap.set(lowerKey, {
            name: t.metric,
            latestValue: t.value,
            unit: t.unit || '',
            lastTimestamp: t.timestamp,
            ageText,
            deviceNames: new Set([t.deviceName || t.deviceId]),
            isFresh: ageSec < 120,
            isFromTelemetryStream: true,
          });
        } else {
          existing.deviceNames.add(t.deviceName || t.deviceId);
          const existingTs = existing.lastTimestamp ? new Date(existing.lastTimestamp).getTime() : 0;
          if (ts > existingTs) {
            existing.latestValue = t.value;
            if (t.unit) existing.unit = t.unit;
            existing.lastTimestamp = t.timestamp;
            existing.ageText = ageText;
            existing.isFresh = ageSec < 120;
          }
        }
      }
    }

    return Array.from(metricMap.values()).sort((a, b) => {
      const tA = a.lastTimestamp ? new Date(a.lastTimestamp).getTime() : 0;
      const tB = b.lastTimestamp ? new Date(b.lastTimestamp).getTime() : 0;
      return tB - tA;
    });
  }, [metricsScope, activeDevice, physicalTelemetry, simulationTelemetry, devices]);

  const getFilteredTerminalLogs = () => {
    let list: TelemetryReading[] = [];

    if (terminalFilterMode === 'selected' && activeDevice) {
      if (activeDevice.isSimulated) {
        list = simulationTelemetry.filter(
          (t) =>
            t.deviceId === activeDevice.id ||
            t.deviceId === activeDevice.apiKey ||
            t.deviceName === activeDevice.name
        );
      } else {
        list = physicalTelemetry.filter(
          (t) =>
            t.deviceId === activeDevice.id ||
            t.deviceId === activeDevice.apiKey ||
            t.deviceName === activeDevice.name ||
            (activeDevice.apiKey && t.rawPayload?.includes(activeDevice.apiKey)) ||
            (activeDevice.name && t.rawPayload?.includes(activeDevice.name))
        );
      }
    } else {
      // 'all' mode: combine physical and simulation (if admin)
      list = user?.role === 'admin'
        ? [...physicalTelemetry, ...simulationTelemetry]
        : [...physicalTelemetry];
    }

    if (clearedLogsAt > 0) {
      list = list.filter((t) => {
        const ts = t.timestamp ? new Date(t.timestamp).getTime() : 0;
        return ts >= clearedLogsAt;
      });
    }

    return list;
  };

  const groupLogsByPacket = (logs: TelemetryReading[]) => {
    const result: Array<{
      id: string;
      deviceId: string;
      deviceName: string;
      timestamp: string;
      rawPayload?: string;
      sequence?: number;
      source?: string;
      environment?: string;
      simulationRunId?: string;
      metrics: Array<{
        metric: string;
        value: number;
        unit: string;
        status: 'normal' | 'warning' | 'critical';
      }>;
      overallStatus: 'normal' | 'warning' | 'critical';
    }> = [];

    const map = new Map<string, (typeof result)[0]>();

    for (const log of logs) {
      if (!log || !log.metric) continue;

      // Grouping key:
      // When sequence is provided: deviceId + sequence
      // Otherwise: deviceId + second-resolution timestamp + rawPayload
      const timeStr = log.timestamp ? new Date(log.timestamp).toISOString() : 'no_time';
      const timeSec = timeStr.substring(0, 19); // YYYY-MM-DDTHH:mm:ss
      const key =
        log.sequence !== undefined && log.sequence !== null
          ? `${log.deviceId}_seq_${log.sequence}`
          : `${log.deviceId}_${timeSec}_${log.rawPayload || ''}`;

      let pkt = map.get(key);
      if (!pkt) {
        pkt = {
          id: log.id || `${log.deviceId}_${timeStr}`,
          deviceId: log.deviceId,
          deviceName: log.deviceName || log.deviceId,
          timestamp: log.timestamp || new Date().toISOString(),
          rawPayload: log.rawPayload,
          sequence: log.sequence,
          source: log.source,
          environment: log.environment,
          simulationRunId: log.simulationRunId,
          metrics: [],
          overallStatus: log.status || 'normal',
        };
        map.set(key, pkt);
        result.push(pkt);
      }

      if (!pkt.metrics.some((m) => m.metric.toLowerCase() === log.metric.toLowerCase())) {
        pkt.metrics.push({
          metric: log.metric,
          value: log.value,
          unit: log.unit || '',
          status: log.status || 'normal',
        });
      }

      if (log.status === 'critical') pkt.overallStatus = 'critical';
      else if (log.status === 'warning' && pkt.overallStatus !== 'critical') {
        pkt.overallStatus = 'warning';
      }
    }

    // Sort newest packets first deterministically
    return result.sort((a, b) => {
      const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      if (tB !== tA) return tB - tA;
      return (b.sequence || 0) - (a.sequence || 0);
    });
  };

  const handleTogglePause = () => {
    if (!isTerminalPaused) {
      setFrozenLogs(getFilteredTerminalLogs());
      setIsTerminalPaused(true);
    } else {
      setFrozenLogs(null);
      setIsTerminalPaused(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    try {
      const ownerId = user?.role === 'admin' ? targetOwnerId : user?.id;
      const dev = await createNewDevice({
        name,
        type,
        location,
        ipAddress,
        userId: ownerId,
        apiKey: manualApiKey.trim() || undefined,
        heartbeatTimeoutSeconds: addHeartbeatTimeout,
        isSimulated,
        saveSimulatedDataToDb: isSimulated ? saveSimulatedDataToDb : false,
        simulatedMetrics: isSimulated ? addSimMetrics : [],
      });
      setShowAddModal(false);
      setName('');
      setManualApiKey('');
      setAddHeartbeatTimeout(300);
      setIsSimulated(false);
      setSaveSimulatedDataToDb(false);
      setSelectedDeviceId(dev.id);
    } catch (err) {
      alert('Cihaz eklenemedi');
    }
  };

  const handleOpenEdit = (dev: Device) => {
    setEditingDevice(dev);
    setEditName(dev.name || '');
    setEditType(dev.type || 'sensor');
    setEditLocation(dev.location || '');
    setEditIpAddress(dev.ipAddress || '');
    setEditOwnerId(dev.tenantId || 'usr_admin');
    setEditRateLimit(dev.rateLimitPerMin || 120);
    setEditEncryption(dev.encryptionMethod || 'AES-256-GCM');
    setEditStatus(dev.status || 'online');
    setEditApiKey(dev.apiKey || '');
    setEditHeartbeatTimeout(dev.heartbeatTimeoutSeconds || 300);
    setEditIsSimulated(dev.isSimulated ?? false);
    setEditSaveSimulatedDataToDb(dev.saveSimulatedDataToDb ?? false);
    setEditSimMetrics(dev.simulatedMetrics || (dev.isSimulated ? ['l1', 'l2', 'l3', 'ri', 'rc', 'p'] : ['l1', 'l2', 'l3', 'ri', 'rc', 'p']));
    setEditCustomSimMetricInput('');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    if (!editingDevice) return;
    try {
      const targetOwner = editOwnerId || 'usr_admin';
      const updated = await updateDevice(editingDevice.id, {
        name: editName,
        type: editType,
        location: editLocation,
        ipAddress: editIpAddress,
        tenantId: targetOwner,
        userId: targetOwner,
        rateLimitPerMin: editRateLimit,
        encryptionMethod: editEncryption,
        status: editStatus,
        apiKey: editApiKey.trim() || undefined,
        heartbeatTimeoutSeconds: editHeartbeatTimeout,
        isSimulated: editIsSimulated,
        saveSimulatedDataToDb: editIsSimulated ? editSaveSimulatedDataToDb : false,
        simulatedMetrics: editIsSimulated ? editSimMetrics : [],
      });
      setEditingDevice(null);
      if (selectedDevice?.id === editingDevice.id) {
        setSelectedDeviceId(updated.id);
      }
    } catch (err) {
      alert('Cihaz ayarları güncellenemedi.');
    }
  };

  const handleStartInlineEditToken = () => {
    if (!activeDevice) return;
    setInlineTokenInput(activeDevice.apiKey);
    setIsEditingTokenInline(true);
  };

  const handleSaveInlineToken = async () => {
    if (!activeDevice || !inlineTokenInput.trim()) return;
    try {
      const updated = await updateDevice(activeDevice.id, {
        apiKey: inlineTokenInput.trim(),
      });
      setSelectedDeviceId(updated.id);
      setIsEditingTokenInline(false);
      setTokenSaveSuccess(true);
      setTimeout(() => setTokenSaveSuccess(false), 3000);
    } catch (err) {
      alert('Manuel token güncellenemedi.');
    }
  };

  const handleConfirmConvertToPhysical = async () => {
    if (!convertingDevice) return;
    setIsConverting(true);
    try {
      const result = await convertToPhysicalDevice(convertingDevice.id);
      setConvertingDevice(null);
      if (selectedDevice?.id === convertingDevice.id) {
        setSelectedDeviceId(result.device.id);
      }
      setConversionSuccessInfo(result);
    } catch (err: any) {
      alert(err.message || 'Cihaz dönüştürülemedi.');
    } finally {
      setIsConverting(false);
    }
  };

  const [clearingMetrics, setClearingMetrics] = useState(false);
  const handleClearDeviceMetrics = async (deviceId: string) => {
    if (!window.confirm('Bu cihazın kayıtlı metrik önbelleği temizlensin mi?')) return;
    setClearingMetrics(true);
    try {
      const res = await fetch(`/api/devices/${deviceId}/clear-metrics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.device && selectedDevice?.id === deviceId) {
          setSelectedDeviceId(data.device.id);
        }
      }
    } catch (err) {
      console.error('Metrikler temizlenirken hata oluştu:', err);
    } finally {
      setClearingMetrics(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingDevice) return;
    try {
      await deleteDevice(deletingDevice.id);
      if (selectedDevice?.id === deletingDevice.id) {
        setSelectedDeviceId(null);
      }
      setDeletingDevice(null);
    } catch (err) {
      alert('Cihaz silinemedi.');
    }
  };

  const getOwnerName = (userId: string) => {
    if (!userId || userId === 'usr_admin' || userId === 'admin') {
      return 'Merkez Yönetim';
    }
    const owner = customersList.find((c) => c.id === userId);
    return owner ? (owner.companyName || owner.name) : 'Merkez Yönetim';
  };

  // Auto-sync rawPayloadInput default when activeDevice changes
  React.useEffect(() => {
    if (activeDevice) {
      setRawPayloadInput(`${activeDevice.apiKey}, ${activeDevice.name}, sıcaklık:37.5, nem:85`);
    }
  }, [activeDevice?.id, activeDevice?.apiKey, activeDevice?.name]);

  const handleSendRawPayload = async (overridePayload?: string) => {
    const payloadToSend = overridePayload || rawPayloadInput;
    if (!payloadToSend) return;
    setIsSending(true);
    try {
      const res = await fetch('/api/v1/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: payloadToSend,
      });
      const data = await res.json();
      setLastResponse(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setLastResponse(`Hata: ${err?.message || 'Sunucuya bağlanılamadı.'}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleDeviceStatus = async (dev: Device, e: React.MouseEvent) => {
    e.stopPropagation();

    const isCurrentlyActive = dev.status === 'online' && dev.dataFlowActive !== false;
    const newStatus: Device['status'] = isCurrentlyActive ? 'offline' : 'online';
    const newDataFlow = !isCurrentlyActive;

    await updateDevice(dev.id, {
      status: newStatus,
      dataFlowActive: newDataFlow,
    });
  };

  const renderSimulatedMetricsSelector = (
    isSim: boolean,
    metricsList: string[],
    setMetricsList: React.Dispatch<React.SetStateAction<string[]>>,
    customInput: string,
    setCustomInput: React.Dispatch<React.SetStateAction<string>>
  ) => {
    if (!isSim) return null;

    const handleAddMetric = () => {
      const trimmed = customInput.trim().toLowerCase();
      if (trimmed && !metricsList.includes(trimmed)) {
        setMetricsList([...metricsList, trimmed]);
        setCustomInput('');
      }
    };

    const presets = [
      { label: '⚡ Reaktif Güç Analizörü (l1, l2, l3, ri, rc, p)', metrics: ['l1', 'l2', 'l3', 'ri', 'rc', 'p', 'pct_ri', 'pct_rc'], color: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 border border-amber-500/20' },
      { label: '🌡️ Çevre Sensörü', metrics: ['temperature', 'humidity', 'pressure', 'co2_ppm'], color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/20' },
      { label: '⚡ Akıllı Sayaç', metrics: ['power', 'voltage', 'current', 'frequency'], color: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 border border-blue-500/20' },
      { label: '💻 Sunucu / Düğüm', metrics: ['cpu', 'memory', 'bandwidth'], color: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 hover:bg-purple-500/20 border border-purple-500/20' },
    ];

    return (
      <div className="p-4 bg-cyan-500/5 dark:bg-cyan-950/30 rounded-2xl border border-cyan-500/20 space-y-3">
        <div className="flex items-center justify-between">
          <label className="font-bold text-cyan-800 dark:text-cyan-300 flex items-center gap-1.5 text-xs">
            <Bot className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span>Sanal Veri Metrik İfadeleri (Simülatör İçin)</span>
          </label>
          <span className="text-[10px] px-2.5 py-0.5 font-mono font-bold bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 rounded-full border border-cyan-500/30">
            {metricsList.length} Metrik Seçili
          </span>
        </div>

        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
          Simülatör bu cihaz için canlı veri üretirken seçtiğiniz metrik ifadelerini rastgele yayınlayacaktır. Hazır şablonlardan seçebilir veya özel metrik ekleyebilirsiniz:
        </p>

        {/* Preset Buttons */}
        <div>
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-wider">
            Hazır Şablon Ekle:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setMetricsList(p.metrics)}
                className={`px-2.5 py-1 text-[11px] rounded-xl font-medium transition cursor-pointer ${p.color}`}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setMetricsList([])}
              className="px-2.5 py-1 text-[11px] rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 border border-rose-500/20 font-medium transition cursor-pointer"
            >
              Temizle
            </button>
          </div>
        </div>

        {/* Selected Metrics Chips */}
        <div>
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block mb-1 uppercase tracking-wider">
            Aktif Yayınlanacak Metrikler:
          </span>
          <div className="flex flex-wrap gap-1.5 p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 min-h-[42px] items-center">
            {metricsList.length === 0 ? (
              <span className="text-[11px] text-slate-400 italic px-1">
                Henüz metrik seçilmedi (Varsayılan tip metrikleri üretilecek)
              </span>
            ) : (
              metricsList.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-cyan-500/15 text-cyan-900 dark:text-cyan-200 rounded-lg text-xs font-mono font-bold border border-cyan-500/30"
                >
                  {m}
                  <button
                    type="button"
                    onClick={() => setMetricsList((prev) => prev.filter((x) => x !== m))}
                    className="hover:text-rose-500 dark:hover:text-rose-400 cursor-pointer ml-0.5 transition"
                    title="Metriği Kaldır"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        {/* Custom Metric Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddMetric();
              }
            }}
            placeholder="Özel metrik adı yazın (Örn: voltage_l1, flow_rate, rpm...)"
            className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 focus:outline-none dark:text-white"
          />
          <button
            type="button"
            onClick={handleAddMetric}
            className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition cursor-pointer shrink-0 shadow-md shadow-cyan-600/20 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Ekle
          </button>
        </div>
      </div>
    );
  };

  const renderHeartbeatSelector = (
    timeoutSec: number,
    setTimeoutSec: (val: number) => void
  ) => {
    const presets = [
      { label: '⚡ 30 Saniye', sub: 'Hızlı Test', val: 30 },
      { label: '⏱️ 1 Dakika', sub: 'Sık Veri', val: 60 },
      { label: '🛡️ 5 Dakika', sub: 'Standart IoT', val: 300 },
      { label: '📡 15 Dakika', sub: 'Güneş / Sayaç', val: 900 },
      { label: '🔋 1 Saat', sub: 'Düşük Güç', val: 3600 },
      { label: '⏳ 6 Saat', sub: 'Geniş Aralık', val: 21600 },
      { label: '📅 24 Saat', sub: 'Günde 1 Kez', val: 86400 },
    ];

    return (
      <div className="p-4 bg-indigo-50/30 dark:bg-slate-800/40 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <label className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 text-xs">
            <Radio className="w-4 h-4" />
            <span>Sinyal & Heartbeat Toleransı (Çevrimdışı Olma Süresi)</span>
          </label>
          <span className="text-[10px] px-2.5 py-0.5 font-mono font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 rounded-full border border-indigo-500/30">
            {timeoutSec >= 3600
              ? `${(timeoutSec / 3600).toFixed(1).replace('.0', '')} Saat`
              : `${Math.round(timeoutSec / 60)} Dk (${timeoutSec} sn)`}
          </span>
        </div>

        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
          Cihazınızın veri gönderme periyoduna göre tolerans belirleyin (Örn: Saatte 1 gönderen pilli cihazlar için <strong>1 Saat</strong>). Cihaz zaman aşımına uğrayıp Çevrimdışı olsa bile, yeni veri veya <code>/api/telemetry/ping</code> sinyali geldiğinde <strong>otomatik olarak Çevrimiçi</strong> olur.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {presets.map((p) => {
            const isSelected = timeoutSec === p.val;
            return (
              <button
                key={p.val}
                type="button"
                onClick={() => setTimeoutSec(p.val)}
                className={`p-2 rounded-xl text-left border transition cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/20 ring-2 ring-indigo-500/30'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-400'
                }`}
              >
                <div className="text-xs font-bold">{p.label}</div>
                <div className={`text-[10px] ${isSelected ? 'text-indigo-100' : 'text-slate-400'}`}>
                  {p.sub}
                </div>
              </button>
            );
          })}
        </div>

        <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 shrink-0">
            Özel Süre (Saniye):
          </label>
          <input
            type="number"
            min={10}
            max={604800}
            value={timeoutSec}
            onChange={(e) => setTimeoutSec(Math.max(10, Number(e.target.value)))}
            className="w-32 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-xs font-bold dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
          <span className="text-[10px] text-slate-400">
            {timeoutSec >= 3600
              ? `≈ ${(timeoutSec / 3600).toFixed(2)} saat`
              : `≈ ${(timeoutSec / 60).toFixed(1)} dakika`}
          </span>
        </div>
      </div>
    );
  };

  const curlExample = activeDevice
    ? `curl -X POST "${window.location.origin}/api/v1/telemetry" \\
  -H "Content-Type: text/plain" \\
  -d "${activeDevice.apiKey}, ${activeDevice.name}, sıcaklık:37.5, nem:85"`
    : '';

  const curlPingExample = activeDevice
    ? `curl -X POST "${window.location.origin}/api/telemetry/ping" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${activeDevice.apiKey}" \\
  -d '{"deviceId":"${activeDevice.id}","ping":1}'`
    : '';

  const pythonExample = activeDevice
    ? `import requests

url = "${window.location.origin}/api/v1/telemetry"
# Format: TOKEN, CİHAZ_ADI, METRİK1:DEĞER1, METRİK2:DEĞER2
payload = "${activeDevice.apiKey}, ${activeDevice.name}, sıcaklık:37.5, nem:85"

response = requests.post(url, data=payload, headers={"Content-Type": "text/plain"})
print("Status:", response.status_code)
print("Response:", response.json())`
    : '';

  const espPingExample = activeDevice
    ? `// ESP32 Düşük Güçlü Periyodik Ping / Heartbeat Örneği (Sinyal Periyodu: ${
        (activeDevice.heartbeatTimeoutSeconds || 300) >= 3600
          ? `${((activeDevice.heartbeatTimeoutSeconds || 300) / 3600).toFixed(1)} Saat`
          : `${Math.round((activeDevice.heartbeatTimeoutSeconds || 300) / 60)} Dakika`
      })
#include <WiFi.h>
#include <HTTPClient.h>

void sendHeartbeat() {
  HTTPClient http;
  http.begin("${window.location.origin}/api/telemetry/ping");
  http.addHeader("X-API-Key", "${activeDevice.apiKey}");
  http.addHeader("Content-Type", "application/json");

  String payload = "{\\"deviceId\\":\\"${activeDevice.id}\\",\\"ping\\":1,\\"rssi\\":" + String(WiFi.RSSI()) + "}";
  int httpCode = http.POST(payload);
  
  if (httpCode == 200) {
    Serial.println(">>> Heartbeat onaylandı! Cihaz Çevrimiçi.");
  }
  http.end();
}`
    : '';

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#0f172a] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Cpu className="w-5 h-5 text-indigo-400" />
            <span>Cihaz Yönetimi & Uzaktan Ingestion API</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Farklı cihazlardan (IoT sensörler, sunucular, sayaçlar) güvenli veri toplama ve API anahtarı yönetimi
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-bold shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Yeni Cihaz Kaydet</span>
        </button>
      </div>


      <div className="grid grid-cols-12 gap-6">
        {/* Device List Table & System Metrics */}
        <div className="col-span-12 lg:col-span-7 space-y-6">
          <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Kayıtlı Saha Cihazları ({devices.length})
              </h3>
              <span className="text-[11px] text-slate-500">Seçmek için satıra tıklayın</span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/80 overflow-x-auto">
              {devices.map((dev, idx) => {
                const isSelected = activeDevice?.id === dev.id;
                const colors = getStatusColor(dev.status);
                return (
                  <div
                    key={`${dev.id}_${idx}`}
                    onClick={() => setSelectedDeviceId(dev.id)}
                    className={`p-4 cursor-pointer transition-colors flex items-center justify-between gap-4 ${
                      isSelected
                        ? 'bg-indigo-500/10 border-l-4 border-l-indigo-500'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="relative flex h-3 w-3 shrink-0">
                        {dev.status === 'online' && (
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        )}
                        <span className={`relative inline-flex rounded-full h-3 w-3 ${colors.dot}`}></span>
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-xs text-slate-900 dark:text-white truncate">
                            {dev.name}
                          </p>
                          {dev.isSimulated ? (
                            <>
                              <span className="px-1.5 py-0.5 bg-cyan-500/10 text-cyan-500 dark:text-cyan-400 border border-cyan-500/30 text-[9px] font-extrabold rounded shrink-0 flex items-center gap-1">
                                <Bot className="w-2.5 h-2.5" />
                                <span>SANAL CİHAZ</span>
                              </span>
                              {dev.saveSimulatedDataToDb && (
                                <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[9px] font-extrabold rounded shrink-0 flex items-center gap-1" title="Sanal Cihaz Verileri Veritabanına Kaydediliyor">
                                  <Database className="w-2.5 h-2.5" />
                                  <span>DB KAYDI AKTİF</span>
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[9px] font-extrabold rounded shrink-0 flex items-center gap-1">
                              <Cpu className="w-2.5 h-2.5" />
                              <span>GERÇEK DONANIM</span>
                            </span>
                          )}
                          <span className="px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] font-semibold rounded shrink-0 flex items-center gap-1">
                            <Building2 className="w-2.5 h-2.5" />
                            <span>{getOwnerName(dev.tenantId)}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          <span>{dev.location}</span>
                          <span>•</span>
                          <span className="font-mono text-[10px]">IP: {dev.ipAddress}</span>
                          <span>•</span>
                          <span className="text-[10px] text-slate-400">
                            Son Sinyal: <strong className={dev.status === 'online' ? 'text-emerald-500 font-semibold' : dev.status === 'offline' ? 'text-rose-500 font-semibold' : 'text-amber-500'}>{formatRelativeTime(dev.lastSeen)}</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* On/Off Power Switch Toggle */}
                      {(() => {
                        const isRealDevice = !dev.isSimulated;
                        const isActive = dev.status === 'online' && dev.dataFlowActive !== false;

                        return (
                          <div
                            className="flex items-center bg-slate-100 dark:bg-slate-800/80 px-1.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700/60 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={(e) => handleToggleDeviceStatus(dev, e)}
                              className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors focus:outline-none cursor-pointer ${
                                isActive
                                  ? 'bg-emerald-500 shadow-xs'
                                  : 'bg-slate-300 dark:bg-slate-600'
                              }`}
                              title={
                                isRealDevice
                                  ? isActive
                                    ? 'Gerçek cihaz akışını durdur (Çevrimdışı Yap)'
                                    : 'Gerçek cihaz akışını başlat (Çevrimiçi Yap)'
                                  : isActive
                                    ? 'Sanal cihazı kapat (Simülasyonu durdur)'
                                    : 'Sanal cihazı aç (Simülasyonu başlat)'
                              }
                            >
                              <span
                                className={`inline-block w-3.5 h-3.5 transform rounded-full bg-white transition-transform shadow-xs flex items-center justify-center ${
                                  isActive ? 'translate-x-4.5' : 'translate-x-0.5'
                                }`}
                              >
                                <Power
                                  className={`w-2 h-2 ${
                                    isActive ? 'text-emerald-600' : 'text-slate-500'
                                  }`}
                                />
                              </span>
                            </button>
                          </div>
                        );
                      })()}

                      {user?.role === 'admin' && dev.isSimulated && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConvertingDevice(dev);
                          }}
                          className="p-1.5 rounded-xl text-cyan-500 hover:text-emerald-400 hover:bg-cyan-500/10 transition"
                          title="Sanal Cihazı Gerçek Donanıma Dönüştür (Yeni Fiziksel API Key Üretir)"
                        >
                          <Cpu className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEdit(dev);
                        }}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10"
                        title="Cihaz Ayarlarını Düzenle"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          regenerateApiKey(dev.id);
                        }}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                        title="API Key Yenile"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingDevice(dev);
                        }}
                        className="p-1.5 rounded-xl text-rose-400 hover:bg-rose-500/10"
                        title="Cihazı Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active System Metrics Card */}
          <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 gap-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-500" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  {metricsScope === 'selected' && activeDevice
                    ? `${activeDevice.name} Aktif Metrikleri (${activeSystemMetrics.length})`
                    : `Sistemden Gelen Aktif Metrikler (${activeSystemMetrics.length})`}
                </h3>
              </div>

              {/* Controls: Clear Metrics & Scope Switcher */}
              <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                {metricsScope === 'selected' && activeDevice && (
                  <button
                    type="button"
                    disabled={clearingMetrics}
                    onClick={() => handleClearDeviceMetrics(activeDevice.id)}
                    className="px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 disabled:opacity-50"
                    title="Cihazın kayıtlı eski metrik önbelleğini sıfırlar"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{clearingMetrics ? 'Temizleniyor...' : 'Önbelleği Sıfırla'}</span>
                  </button>
                )}

                {/* Scope Switcher: Selected Device vs All Devices */}
                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700/60">
                  <button
                    type="button"
                    onClick={() => setMetricsScope('selected')}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 ${
                      metricsScope === 'selected'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title={activeDevice ? `${activeDevice.name} cihazına ait parametreleri filtrele` : 'Seçili cihaz'}
                  >
                    <Cpu className="w-3 h-3" />
                    <span>Seçili Cihaz {activeDevice ? `(${activeDevice.name})` : ''}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMetricsScope('all')}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 ${
                      metricsScope === 'all'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title="Tüm kayıtlı cihazların metriklerini göster"
                  >
                    <Activity className="w-3 h-3" />
                    <span>Tüm Cihazlar</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>
                {metricsScope === 'selected' && activeDevice ? (
                  <>
                    <strong className="text-slate-800 dark:text-slate-200">{activeDevice.name}</strong> (
                    {activeDevice.isSimulated ? 'Sanal Simülasyon Cihazı' : 'Fiziksel Saha Donanımı'}
                    ) tarafından son 10 dakikada iletilen canlı parametreler
                  </>
                ) : (
                  'Çevrim içi cihazlardan son 10 dakikada algılanan canlı parametreler'
                )}
              </span>
            </div>

            {activeSystemMetrics.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {activeSystemMetrics.map((m) => (
                  <div
                    key={m.name}
                    className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 text-xs font-mono shadow-xs transition-colors ${
                      m.isFresh
                        ? 'bg-emerald-500/5 dark:bg-emerald-950/20 border-emerald-500/30 text-slate-800 dark:text-slate-100'
                        : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        m.isFresh ? 'bg-emerald-500 animate-pulse' : 'bg-cyan-500'
                      }`}
                    />
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">{m.name}</span>
                    {m.latestValue !== undefined && (
                      <span className="text-[11px] font-semibold text-slate-900 dark:text-white border-l border-slate-200 dark:border-slate-700 pl-2">
                        {m.latestValue} {m.unit}
                      </span>
                    )}
                    {m.ageText && (
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 pl-1">
                        ({m.ageText})
                      </span>
                    )}
                    {metricsScope === 'all' && m.deviceNames.size > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-sans font-medium">
                        {Array.from(m.deviceNames).join(', ')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic py-2">
                {metricsScope === 'selected' && activeDevice
                  ? `"${activeDevice.name}" için son 10 dakika içinde aktif telemetri verisi algılanmadı.`
                  : 'Son 10 dakika içinde aktif metrik verisi algılanmadı.'}
              </p>
            )}
          </div>
        </div>

        {/* Selected Device Details & Live Test Panel */}
        {activeDevice && (
          <div className="col-span-12 lg:col-span-5 space-y-6">
            {/* Device Security Card */}
            <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                    API Güvenlik Kimliği
                  </h3>
                </div>
                <span className="text-[10px] px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 font-bold rounded-full border border-emerald-500/20">
                  {activeDevice.encryptionMethod}
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    X-API-Key Başlığı (Token)
                  </label>
                  {tokenSaveSuccess && (
                    <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 animate-pulse">
                      <Check className="w-3 h-3" /> Token Güncellendi
                    </span>
                  )}
                </div>

                {isEditingTokenInline ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={inlineTokenInput}
                        onChange={(e) => setInlineTokenInput(e.target.value)}
                        placeholder="Manuel Token Girin"
                        className="flex-1 px-3 py-2 rounded-2xl bg-slate-900 border border-emerald-500/50 font-mono text-xs text-amber-400 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <button
                        onClick={handleSaveInlineToken}
                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-bold shadow-lg shadow-emerald-600/20 flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Kaydet</span>
                      </button>
                      <button
                        onClick={() => setIsEditingTokenInline(false)}
                        className="p-2 text-slate-400 hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-2xl text-xs"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-400">
                        Cihaz üzerindeki token ile aynı değeri girin.
                      </span>
                      <button
                        onClick={() => setInlineTokenInput(`dev_key_${Math.random().toString(36).substring(2, 10)}`)}
                        className="text-indigo-400 font-semibold hover:underline flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" /> Rastgele
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={activeDevice.apiKey}
                        className="flex-1 px-3 py-2 rounded-2xl bg-slate-100 dark:bg-[#020617] border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-800 dark:text-slate-200 font-semibold"
                      />
                      <button
                        onClick={() => handleCopy(activeDevice.apiKey)}
                        className="p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-bold shadow-lg shadow-indigo-600/20"
                        title="Kopyala"
                      >
                        {copiedKey === activeDevice.apiKey ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={handleStartInlineEditToken}
                        className="px-3 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 dark:text-amber-400 border border-amber-500/30 rounded-2xl text-xs font-bold flex items-center gap-1 transition"
                        title="Manuel Token Tanımla"
                      >
                        <Key className="w-3.5 h-3.5" />
                        <span>Manuel Token</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Cihaza uzaktan erişilemiyorsa "Manuel Token" butonuna basarak cihaza çakılmış token'ı tanımlayabilirsiniz.
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-slate-500 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <span>Rate Limit:</span>{' '}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {activeDevice.rateLimitPerMin} req/dk
                  </strong>
                </div>
                <div>
                  <span>Son Ping:</span>{' '}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {formatDateTime(activeDevice.lastSeen)}
                  </strong>
                </div>
                <div>
                  <span>Heartbeat Toleransı:</span>{' '}
                  <strong className="text-indigo-600 dark:text-indigo-400">
                    {(activeDevice.heartbeatTimeoutSeconds || 300) >= 3600
                      ? `${((activeDevice.heartbeatTimeoutSeconds || 300) / 3600).toFixed(1).replace('.0', '')} Saat`
                      : `${Math.round((activeDevice.heartbeatTimeoutSeconds || 300) / 60)} Dk`}
                  </strong>
                </div>
              </div>

              {/* Heartbeat Status Notice */}
              <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-[10px] text-slate-600 dark:text-slate-300 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Radio className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="truncate">
                    Cihaz zaman aşımına uğrarsa çevrimdışı olur; yeni veri veya ping ile <strong>otomatik çevrimiçi</strong> açılır.
                  </span>
                </div>
                <button
                  onClick={() => setShowCodeGuide(!showCodeGuide)}
                  className="px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold rounded-lg shrink-0 cursor-pointer flex items-center gap-1"
                >
                  <Code className="w-3 h-3" />
                  <span>{showCodeGuide ? 'Kodu Gizle' : 'ESP32 / API Kodu'}</span>
                </button>
              </div>

              {activeDevice.isSimulated && (
                <div className="bg-cyan-500/10 rounded-2xl p-3 border border-cyan-500/30 text-xs space-y-1.5 mt-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-cyan-800 dark:text-cyan-300 flex items-center gap-1.5 text-[11px]">
                      <Bot className="w-3.5 h-3.5 text-cyan-500" /> Sanal Simülatör Metrikleri
                    </span>
                    <div className="flex items-center gap-2">
                      {user?.role === 'admin' && (
                        <button
                          onClick={() => setConvertingDevice(activeDevice)}
                          className="px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 rounded-lg text-[10px] flex items-center gap-1 font-bold cursor-pointer transition"
                          title="Sanal Cihazı Gerçek Fiziksel Donanıma Dönüştür"
                        >
                          <Cpu className="w-3 h-3 text-emerald-500" />
                          <span>Fiziksel Donanıma Dönüştür</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenEdit(activeDevice)}
                        className="text-[10px] text-cyan-700 dark:text-cyan-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                      >
                        <Settings className="w-3 h-3" /> Metrikleri Düzenle
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {activeDevice.simulatedMetrics && activeDevice.simulatedMetrics.length > 0 ? (
                      activeDevice.simulatedMetrics.map((m) => (
                        <span key={m} className="px-2 py-0.5 bg-cyan-500/20 text-cyan-900 dark:text-cyan-200 font-mono text-[10px] font-bold rounded-md border border-cyan-500/30">
                          {m}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                        Varsayılan {activeDevice.type} metrikleri üretiliyor
                      </span>
                    )}
                  </div>
                  <div className="pt-1.5 border-t border-cyan-500/20 flex items-center justify-between text-[10px]">
                    <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1 font-medium">
                      <Database className={`w-3 h-3 ${activeDevice.saveSimulatedDataToDb ? 'text-amber-500' : 'text-slate-400'}`} />
                      Veritabanı Yazma:
                    </span>
                    <span className={`font-bold px-2 py-0.5 rounded-full ${activeDevice.saveSimulatedDataToDb ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30' : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                      {activeDevice.saveSimulatedDataToDb ? 'Aktif (DB\'ye Yazılıyor)' : 'Pasif (Sadece RAM)'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Live Terminal & Telemetry Ingestion Console */}
            <div className="bg-[#020617] text-slate-200 rounded-3xl p-6 border border-slate-800 shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-1">
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIsTerminalOpen(!isTerminalOpen)}>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isTerminalOpen ? 'bg-emerald-400' : 'bg-slate-500'}`}></span>
                    <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isTerminalOpen ? 'bg-emerald-500' : 'bg-slate-600'}`}></span>
                  </span>
                  <div>
                    <h3 className="text-xs font-bold text-white flex items-center gap-1.5 font-mono">
                      <Terminal className="w-4 h-4 text-cyan-400" />
                      ANLIK KONSOL / TERMINAL
                    </h3>
                    <p className="text-[10px] text-slate-400 font-sans">
                      Cihaz: <strong className="text-cyan-300">{activeDevice.name}</strong>
                      {!isTerminalOpen && <span className="ml-2 text-slate-500">(Kapalı - Açmak için tıklayın)</span>}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {isTerminalOpen && (
                    <>
                      {/* Filter Mode Selector */}
                      <div className="flex items-center bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setTerminalFilterMode('all')}
                          className={`px-2 py-1 rounded-lg font-bold transition ${
                            terminalFilterMode === 'all'
                              ? 'bg-cyan-500 text-black shadow'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Tüm Cihazlar
                        </button>
                        <button
                          type="button"
                          onClick={() => setTerminalFilterMode('selected')}
                          className={`px-2 py-1 rounded-lg font-bold transition ${
                            terminalFilterMode === 'selected'
                              ? 'bg-cyan-500 text-black shadow'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Seçili Cihaz
                        </button>
                      </div>

                      <button
                        onClick={handleTogglePause}
                        className={`p-1.5 rounded-xl text-[10px] font-bold flex items-center gap-1 border transition ${
                          isTerminalPaused
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                        title={isTerminalPaused ? 'Akışı Başlat' : 'Akışı Duraklat'}
                      >
                        {isTerminalPaused ? <Play className="w-3 h-3 text-amber-400" /> : <Pause className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={() => {
                          setClearedLogsAt(Date.now());
                          setFrozenLogs(null);
                        }}
                        className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded-xl border border-slate-800 text-[10px]"
                        title="Terminali Temizle"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setIsFullscreenTerminal(true)}
                        className="p-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 rounded-xl border border-cyan-500/30 text-[10px] font-bold flex items-center gap-1"
                        title="Tam Ekran Terminal"
                      >
                        <Maximize2 className="w-3 h-3" />
                        <span>Tam Ekran</span>
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setIsTerminalOpen(!isTerminalOpen)}
                    className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-cyan-400 rounded-xl border border-slate-800 text-[10px] font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    {isTerminalOpen ? (
                      <>
                        <span>Konsolu Kapat</span>
                        <ChevronUp className="w-3.5 h-3.5" />
                      </>
                    ) : (
                      <>
                        <span>Konsolu Aç</span>
                        <ChevronDown className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>

              {isTerminalOpen && (
                <>
                  {/* Terminal Log Output Window */}
                  <div className="my-2 h-56 overflow-y-auto space-y-2 text-[11px] font-mono pr-1 scrollbar-thin scrollbar-thumb-slate-800 pt-3 border-t border-slate-800/80">
                    {(() => {
                      const filteredLogs = isTerminalPaused && frozenLogs ? frozenLogs : getFilteredTerminalLogs();
                      const packetLogs = groupLogsByPacket(filteredLogs);

                      if (packetLogs.length === 0) {
                        return (
                          <div className="text-slate-600 text-center pt-12 space-y-2">
                            <Terminal className="w-8 h-8 mx-auto opacity-30 text-cyan-400" />
                            <p className="text-[11px]">
                              {isTerminalPaused
                                ? 'Akış duraklatıldı. Başlat butonuna tıklayın.'
                                : 'Anlık paket verisi bekleniyor veya henüz paket gelmedi...'}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              Aşağıdaki test alanından saha formatında paket gönderebilirsiniz.
                            </p>
                          </div>
                        );
                      }

                      return packetLogs.map((pkt, idx) => (
                        <div
                          key={`${pkt.id}_${idx}`}
                          className="p-2 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-1 hover:border-cyan-500/30 transition"
                        >
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-emerald-400 font-bold flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              [POST /api/v1/telemetry] 201 OK • {pkt.deviceName}
                              {pkt.sequence !== undefined && pkt.sequence !== null && (
                                <span className="text-[9px] px-1 py-0.2 bg-emerald-500/20 text-emerald-300 rounded font-mono border border-emerald-500/30">
                                  #{pkt.sequence}
                                </span>
                              )}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {pkt.source === 'simulator' ? (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                  Simülatör
                                </span>
                              ) : pkt.source === 'manual_test' ? (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  Manuel Test
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                  Fiziki Donanım
                                </span>
                              )}
                              <span className="text-slate-500">{new Date(pkt.timestamp).toLocaleTimeString()}</span>
                            </div>
                          </div>

                          <div className="text-amber-300 font-mono text-[10px] bg-black/50 p-1.5 rounded-xl border border-amber-500/20 truncate">
                            &gt; {pkt.rawPayload || `${pkt.deviceName}, ${pkt.metrics.map((m) => `${m.metric}:${m.value}`).join(', ')}`}
                          </div>

                          <div className="flex flex-wrap items-center justify-between text-[10px] gap-1 pt-0.5">
                            <div className="flex flex-wrap items-center gap-1.5 text-slate-300">
                              <span>Cihaz: <strong className="text-cyan-300">{pkt.deviceName}</strong></span>
                              <span className="text-slate-600">|</span>
                              <div className="flex flex-wrap items-center gap-1">
                                {pkt.metrics.map((m, mIdx) => (
                                  <span key={mIdx} className="inline-flex items-center gap-0.5 bg-slate-800/80 px-1.5 py-0.2 rounded text-[9px] border border-slate-700/50">
                                    <span className="text-slate-400">{m.metric}:</span>
                                    <strong className="text-white">{m.value} {m.unit}</strong>
                                  </span>
                                ))}
                              </div>
                            </div>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                pkt.overallStatus === 'critical'
                                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                  : pkt.overallStatus === 'warning'
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
                              }`}
                            >
                              {pkt.overallStatus.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>

                  {/* Raw Payload Field Sender Form */}
                  <div className="pt-3 border-t border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="font-semibold text-slate-300">Saha Paketi Gönder (Format: TOKEN, CİHAZ, metrik:değer)</span>
                    </div>

                    <div className="space-y-2">
                      <input
                        type="text"
                        value={rawPayloadInput}
                        onChange={(e) => setRawPayloadInput(e.target.value)}
                        placeholder="TOKEN, CİHAZ_ADI, sıcaklık:37.5, nem:85"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-2xl font-mono text-xs text-amber-300 focus:outline-none focus:border-cyan-500"
                      />

                      {/* Quick Preset Buttons */}
                      <div className="flex flex-wrap gap-1.5 text-[10px]">
                        <button
                          type="button"
                          onClick={() =>
                            setRawPayloadInput(`${activeDevice.apiKey}, ${activeDevice.name}, sıcaklık:38.5, nem:82`)
                          }
                          className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800"
                        >
                          🌡️ Sıcaklık & Nem
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setRawPayloadInput(`${activeDevice.apiKey}, ${activeDevice.name}, power:74.8, voltaj:220`)
                          }
                          className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800"
                        >
                          ⚡ Güç & Voltaj
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setRawPayloadInput(`${activeDevice.apiKey}, ${activeDevice.name}, cpu:68, memory:75`)
                          }
                          className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800"
                        >
                          💻 CPU & Ram
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setRawPayloadInput(`${activeDevice.apiKey}, ${activeDevice.name}, sıcaklık:96.4, nem:98`)
                          }
                          className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30 font-bold"
                        >
                          🚨 Kritik Seviye
                        </button>
                      </div>

                      <button
                        onClick={() => handleSendRawPayload()}
                        disabled={isSending}
                        className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/20 text-xs transition"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{isSending ? 'Saha Paketi Gönderiliyor...' : 'Saha Paketi POST Et (HTTP 201)'}</span>
                      </button>

                      {lastResponse && (
                        <div className="p-3 bg-black rounded-2xl border border-slate-800 text-[10px] font-mono text-emerald-400 overflow-x-auto max-h-32">
                          <pre>{lastResponse}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Code Integration & ESP32 Heartbeat Guides */}
            {showCodeGuide && (
              <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4 animate-fade-in">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Code className="w-4 h-4 text-indigo-500" />
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                        Saha Cihazı Entegrasyonu & Heartbeat Kılavuzu
                      </h3>
                      <p className="text-[10px] text-slate-500">
                        Cihaz: <strong className="text-indigo-600 dark:text-indigo-400">{activeDevice.name}</strong> | API Token: <code className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">{activeDevice.apiKey}</code>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-[10px]">
                    <button
                      onClick={() => setActiveCodeTab('esp32_ping')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition ${
                        activeCodeTab === 'esp32_ping'
                          ? 'bg-indigo-600 text-white shadow'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      ⚡ ESP32 Heartbeat
                    </button>
                    <button
                      onClick={() => setActiveCodeTab('curl_ping')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition ${
                        activeCodeTab === 'curl_ping'
                          ? 'bg-indigo-600 text-white shadow'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      📡 cURL Ping
                    </button>
                    <button
                      onClick={() => setActiveCodeTab('curl_telemetry')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition ${
                        activeCodeTab === 'curl_telemetry'
                          ? 'bg-indigo-600 text-white shadow'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      📊 cURL Telemetri
                    </button>
                    <button
                      onClick={() => setActiveCodeTab('python')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition ${
                        activeCodeTab === 'python'
                          ? 'bg-indigo-600 text-white shadow'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      🐍 Python
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <pre className="p-4 bg-slate-950 text-slate-200 rounded-2xl border border-slate-800 font-mono text-xs overflow-x-auto leading-relaxed">
                    {activeCodeTab === 'esp32_ping' && espPingExample}
                    {activeCodeTab === 'curl_ping' && curlPingExample}
                    {activeCodeTab === 'curl_telemetry' && curlExample}
                    {activeCodeTab === 'python' && pythonExample}
                  </pre>
                  <button
                    onClick={() => {
                      const text =
                        activeCodeTab === 'esp32_ping'
                          ? espPingExample
                          : activeCodeTab === 'curl_ping'
                          ? curlPingExample
                          : activeCodeTab === 'curl_telemetry'
                          ? curlExample
                          : pythonExample;
                      handleCopy(text);
                    }}
                    className="absolute top-3 right-3 px-2.5 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-white rounded-xl text-[10px] font-bold flex items-center gap-1 backdrop-blur border border-slate-700 cursor-pointer shadow-lg"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Kodu Kopyala</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add New Device Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 rounded-2xl border border-cyan-500/20">
                  <Plus className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Yeni Saha Cihazı Kaydı
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Sisteme yeni bir fiziki donanım veya sanal simülatör cihazı ekleyin.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddDevice} className="space-y-5 text-xs text-slate-800 dark:text-slate-200">
              {/* Section 1: Device Mode Selector (Admin only) */}
              {user?.role === 'admin' && (
                <div className="p-4 bg-cyan-50/30 dark:bg-slate-800/40 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3.5">
                  <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400 font-bold text-xs uppercase tracking-wider">
                    <Bot className="w-4 h-4" />
                    <span>Cihaz Donanım Tipi & Modu <span className="text-rose-500">*</span></span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setIsSimulated(false)}
                      className={`p-3 rounded-2xl border text-left transition cursor-pointer flex items-start gap-2.5 ${
                        !isSimulated
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-400 font-bold ring-2 ring-emerald-500/30'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <Cpu className={`w-5 h-5 shrink-0 mt-0.5 ${!isSimulated ? 'text-emerald-600 dark:text-emerald-400' : ''}`} />
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">Gerçek Donanım</p>
                        <p className="text-[10px] font-normal text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                          Fiziki cihaz (ESP32, PLC vb.). Simülatör sahte veri üretmez.
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsSimulated(true)}
                      className={`p-3 rounded-2xl border text-left transition cursor-pointer flex items-start gap-2.5 ${
                        isSimulated
                          ? 'bg-cyan-500/10 border-cyan-500 text-cyan-700 dark:text-cyan-300 font-bold ring-2 ring-cyan-500/30'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <Bot className={`w-5 h-5 shrink-0 mt-0.5 ${isSimulated ? 'text-cyan-600 dark:text-cyan-400' : ''}`} />
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">Sanal Cihaz (Simülatör)</p>
                        <p className="text-[10px] font-normal text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                          Simülatör test cihazı. İsme <strong className="text-cyan-600 dark:text-cyan-300">[Sanal]</strong> etiketi eklenir.
                        </p>
                      </div>
                    </button>
                  </div>

                  {/* Simulated DB Persistence Toggle */}
                  {isSimulated && (
                    <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800">
                      <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <Database className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-bold text-slate-900 dark:text-white">
                              Sanal Cihaz Verilerini Veritabanına Kaydet
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                              Normalde sanal cihaz verileri veritabanına yazılmaz. Bu ayar aktif olduğunda telemetri ve alarmlar veritabanına kaydedilir (Test için).
                            </p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={saveSimulatedDataToDb}
                            onChange={(e) => setSaveSimulatedDataToDb(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-slate-600 peer-checked:bg-amber-500"></div>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Simulated Metrics Configuration */}
                  {renderSimulatedMetricsSelector(
                    isSimulated,
                    addSimMetrics,
                    setAddSimMetrics,
                    addCustomSimMetricInput,
                    setAddCustomSimMetricInput
                  )}
                </div>
              )}

              {/* Section 2: Basic Info */}
              <div className="p-4 bg-indigo-50/30 dark:bg-slate-800/40 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3.5">
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-xs uppercase tracking-wider">
                  <Cpu className="w-4 h-4" />
                  <span>Temel Cihaz Tanımı</span>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    Cihaz / İstasyon Adı <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="ör. Ankara Rüzgar Santrali #2"
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:text-white font-medium transition"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Cihaz Türü</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as Device['type'])}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:text-white font-medium cursor-pointer"
                  >
                    <option value="sensor">🌱 Çevre & İklim Sensörü</option>
                    <option value="server">🖥️ Sunucu / Düğüm</option>
                    <option value="meter">⚡ Akıllı Sayaç</option>
                    <option value="inverter">☀️ Enerji İnvertörü</option>
                    <option value="gateway">📡 Ağ Geçidi / Gateway</option>
                  </select>
                </div>
              </div>

              {/* Section 3: Network & Location */}
              <div className="p-4 bg-sky-50/30 dark:bg-slate-800/40 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3.5">
                <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400 font-bold text-xs uppercase tracking-wider">
                  <Globe className="w-4 h-4" />
                  <span>Ağ & Konum Yapılandırması</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Fiziksel Lokasyon</label>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="ör. Ankara / Polatlı GES"
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 dark:text-white font-medium transition"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">IP Adresi</label>
                    <input
                      type="text"
                      value={ipAddress}
                      onChange={(e) => setIpAddress(e.target.value)}
                      placeholder="192.168.1.100"
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 dark:text-white font-mono font-medium transition"
                    />
                  </div>
                </div>
              </div>

              {/* Section 4: Token & Security */}
              <div className="p-4 bg-emerald-50/30 dark:bg-slate-800/40 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3.5">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs uppercase tracking-wider">
                  <Shield className="w-4 h-4" />
                  <span>Güvenlik & X-API-Key</span>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span>Manuel Token / API Key <span className="text-slate-400 font-normal">(İsteğe Bağlı)</span></span>
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono">Örn: DEV_SAHA_KEY_882</span>
                  </label>
                  <input
                    type="text"
                    value={manualApiKey}
                    onChange={(e) => setManualApiKey(e.target.value)}
                    placeholder="Cihazdaki mevcut token'ı yazın (Boşsa otomatik üretilir)"
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-amber-500/30 rounded-xl font-mono text-amber-600 dark:text-amber-400 font-semibold text-xs focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 dark:text-white transition"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    💡 Cihaza uzaktan ulaşılamıyorsa, cihaz yazılımındaki sabit token'ı buraya manuel tanımlayabilirsiniz.
                  </p>
                </div>
              </div>

              {/* Section 5: Sinyal & Heartbeat Toleransı */}
              {renderHeartbeatSelector(addHeartbeatTimeout, setAddHeartbeatTimeout)}

              {/* Section 6: Admin Customer Assignment */}
              {user?.role === 'admin' && (
                <div className="p-4 bg-purple-50/50 dark:bg-purple-950/20 rounded-2xl border border-purple-200/60 dark:border-purple-800/40 space-y-2">
                  <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 font-bold text-xs uppercase tracking-wider">
                    <Building2 className="w-4 h-4" />
                    <span>Atanacak Müşteri / Firma</span>
                  </div>
                  <select
                    value={targetOwnerId}
                    onChange={(e) => setTargetOwnerId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-700/60 rounded-xl focus:ring-2 focus:ring-purple-500 font-medium text-slate-800 dark:text-purple-200 cursor-pointer"
                  >
                    <option value="usr_admin">🏛️ Merkez Yönetim (Yönetici)</option>
                    {customersList
                      .filter((c) => c.role === 'customer' || c.companyName)
                      .map((cust) => (
                        <option key={cust.id} value={cust.id}>
                          🏢 {cust.companyName || cust.name} ({cust.name})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Actions */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-5 py-2.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-bold text-slate-700 dark:text-slate-300 transition cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold shadow-lg shadow-cyan-600/25 transition cursor-pointer flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Kaydet & Key Üret</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Device Settings Modal */}
      {editingDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl border border-indigo-500/20">
                  <Settings className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      Cihaz Ayarlarını Düzenle
                    </h3>
                    <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full border border-slate-200 dark:border-slate-700">
                      {editingDevice.id}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    <strong>{editingDevice.name}</strong> parametrelerini ve ağ yapılandırmasını güncelleyin.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingDevice(null)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-5 text-xs text-slate-800 dark:text-slate-200">
              {/* Section 1: Temel Bilgiler */}
              <div className="p-4 bg-indigo-50/30 dark:bg-slate-800/40 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3.5">
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-xs uppercase tracking-wider">
                  <Cpu className="w-4 h-4" />
                  <span>Temel Bilgiler</span>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    Cihaz Adı <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="ör. NodeMCU-ESP8266-Saha-01"
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:text-white transition font-medium text-slate-900"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Cihaz Türü</label>
                    <select
                      value={editType}
                      onChange={(e) => setEditType(e.target.value as Device['type'])}
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:text-white font-medium cursor-pointer"
                    >
                      <option value="sensor">🌱 Çevre & İklim Sensörü</option>
                      <option value="server">🖥️ Sunucu / Düğüm</option>
                      <option value="meter">⚡ Akıllı Sayaç</option>
                      <option value="inverter">☀️ Enerji İnvertörü</option>
                      <option value="gateway">📡 Ağ Geçidi / Gateway</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Çalışma Durumu</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as Device['status'])}
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:text-white font-medium cursor-pointer"
                    >
                      <option value="online">🟢 Online (Aktif Veri Akışı)</option>
                      <option value="offline">⚪ Offline (Bağlantı Yok)</option>
                      <option value="warning">🟡 Uyarı (Eşik Aşıldı)</option>
                      <option value="critical">🔴 Kritik (Arıza / Aşırı Yük)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 1.5: Donanım Modu & Simülatör Metrikleri (Admin only) */}
              {user?.role === 'admin' && (
                <div className="p-4 bg-cyan-50/30 dark:bg-slate-800/40 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3.5">
                  <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400 font-bold text-xs uppercase tracking-wider">
                    <Bot className="w-4 h-4" />
                    <span>Donanım Modu & Simülasyon Ayarları</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setEditIsSimulated(false)}
                      className={`p-3 rounded-2xl border text-left transition cursor-pointer flex items-start gap-2.5 ${
                        !editIsSimulated
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-400 font-bold ring-2 ring-emerald-500/30'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <Cpu className={`w-5 h-5 shrink-0 mt-0.5 ${!editIsSimulated ? 'text-emerald-600 dark:text-emerald-400' : ''}`} />
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">Gerçek Donanım</p>
                        <p className="text-[10px] font-normal text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                          Fiziki cihaz. Simülatör sahte veri üretmez.
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditIsSimulated(true)}
                      className={`p-3 rounded-2xl border text-left transition cursor-pointer flex items-start gap-2.5 ${
                        editIsSimulated
                          ? 'bg-cyan-500/10 border-cyan-500 text-cyan-700 dark:text-cyan-300 font-bold ring-2 ring-cyan-500/30'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <Bot className={`w-5 h-5 shrink-0 mt-0.5 ${editIsSimulated ? 'text-cyan-600 dark:text-cyan-400' : ''}`} />
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">Sanal Cihaz (Simülatör)</p>
                        <p className="text-[10px] font-normal text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                          Simülatör otomatik canlı telemetri üretir.
                        </p>
                      </div>
                    </button>
                  </div>

                  {/* Simulated DB Persistence Toggle */}
                  {editIsSimulated && (
                    <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800">
                      <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <Database className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-bold text-slate-900 dark:text-white">
                              Sanal Cihaz Verilerini Veritabanına Kaydet
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                              Normalde sanal cihaz verileri veritabanına yazılmaz. Bu ayar aktif olduğunda telemetri ve alarmlar veritabanına kaydedilir (Test için).
                            </p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={editSaveSimulatedDataToDb}
                            onChange={(e) => setEditSaveSimulatedDataToDb(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-slate-600 peer-checked:bg-amber-500"></div>
                        </label>
                      </div>
                    </div>
                  )}

                  {renderSimulatedMetricsSelector(
                    editIsSimulated,
                    editSimMetrics,
                    setEditSimMetrics,
                    editCustomSimMetricInput,
                    setEditCustomSimMetricInput
                  )}
                </div>
              )}

              {/* Section 2: Ağ & Konum Yapılandırması */}
              <div className="p-4 bg-sky-50/30 dark:bg-slate-800/40 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3.5">
                <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400 font-bold text-xs uppercase tracking-wider">
                  <Globe className="w-4 h-4" />
                  <span>Ağ & Konum Yapılandırması</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Fiziksel Lokasyon</label>
                    <input
                      type="text"
                      value={editLocation}
                      onChange={(e) => setEditLocation(e.target.value)}
                      placeholder="ör. İstanbul / Fabrika-1 Blok B"
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 dark:text-white transition font-medium"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">IP Adresi</label>
                    <input
                      type="text"
                      value={editIpAddress}
                      onChange={(e) => setEditIpAddress(e.target.value)}
                      placeholder="192.168.1.100"
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 dark:text-white font-mono font-medium transition"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Güvenlik & Performans */}
              <div className="p-4 bg-emerald-50/30 dark:bg-slate-800/40 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3.5">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs uppercase tracking-wider">
                  <Shield className="w-4 h-4" />
                  <span>Güvenlik & İstek Sınırları</span>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    X-API-Key / Token (Manuel Değiştirilebilir)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editApiKey}
                      onChange={(e) => setEditApiKey(e.target.value)}
                      placeholder="ör. dev_key_saha_881"
                      className="flex-1 px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500/30 font-mono text-xs font-semibold text-amber-600 dark:text-amber-400"
                    />
                    <button
                      type="button"
                      onClick={() => setEditApiKey(`dev_key_${Math.random().toString(36).substring(2, 10)}`)}
                      className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-semibold text-xs transition flex items-center gap-1.5 shrink-0 border border-slate-200 dark:border-slate-700 cursor-pointer"
                      title="Rastgele Token Üret"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Rastgele Üret</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    💡 Sahadaki fiziksel cihaza ulaşılamıyorsa, cihaz yazılımındaki mevcut token ile eşleşecek şekilde buradan manuel tanımlayabilirsiniz.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Rate Limit (İstek / Dakika)</label>
                    <input
                      type="number"
                      min={10}
                      max={1000}
                      value={editRateLimit}
                      onChange={(e) => setEditRateLimit(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 dark:text-white font-mono font-medium transition"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Şifreleme Standardı</label>
                    <select
                      value={editEncryption}
                      onChange={(e) => setEditEncryption(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 dark:text-white font-medium cursor-pointer"
                    >
                      <option value="AES-256-GCM">🔒 AES-256-GCM (Endüstriyel)</option>
                      <option value="RSA-4096">🔑 RSA-4096 (Asimetrik)</option>
                      <option value="TLS 1.3 mTLS">🛡️ TLS 1.3 mTLS (Çift Yönlü)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 4: Sinyal & Heartbeat Toleransı */}
              {renderHeartbeatSelector(editHeartbeatTimeout, setEditHeartbeatTimeout)}

              {/* Section 5: Müşteri / Firma Sorumlusu (Admin Only) */}
              {user?.role === 'admin' && (
                <div className="p-4 bg-purple-50/50 dark:bg-purple-950/20 rounded-2xl border border-purple-200/60 dark:border-purple-800/40 space-y-2">
                  <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 font-bold text-xs uppercase tracking-wider">
                    <Building2 className="w-4 h-4" />
                    <span>Sorumlu Müşteri / Firma Atama</span>
                  </div>
                  <select
                    value={editOwnerId}
                    onChange={(e) => setEditOwnerId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-700/60 rounded-xl focus:ring-2 focus:ring-purple-500 font-medium text-slate-800 dark:text-purple-200 cursor-pointer"
                  >
                    <option value="usr_admin">🏛️ Merkez Yönetim (Yönetici)</option>
                    {customersList
                      .filter((c) => c.role === 'customer' || c.companyName)
                      .map((cust) => (
                        <option key={cust.id} value={cust.id}>
                          🏢 {cust.companyName || cust.name} ({cust.email})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Modal Actions */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingDevice(null)}
                  className="px-5 py-2.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-bold text-slate-700 dark:text-slate-300 transition cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/25 transition cursor-pointer flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Değişiklikleri Kaydet</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Convert to Physical Hardware Confirmation Modal */}
      {convertingDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-emerald-500/30 space-y-4">
            <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
              <div className="p-3 bg-emerald-500/10 rounded-2xl">
                <Cpu className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Sanal Cihazı Gerçek Donanıma Dönüştür
                </h3>
                <p className="text-xs text-emerald-500 font-semibold mt-0.5">Yönetici Yetkisi ile Dönüştürme</p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-emerald-50/40 dark:bg-slate-800/50 p-4 rounded-2xl border border-emerald-500/20">
              <p>
                <strong>"{convertingDevice.name}"</strong> sanal simülatör cihazını gerçek fiziksel donanıma dönüştürmek üzeresiniz.
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-500 dark:text-slate-400 pt-1 text-[11px]">
                <li>Cihazın sanal simülasyon bayrağı kapatılır ve simülatör veri üretimi durur.</li>
                <li>İsimdeki <code className="text-cyan-600 dark:text-cyan-400">[Sanal]</code> etiketi kaldırılır.</li>
                <li><strong>Yeni bir Fiziksel API Anahtarı (X-API-Key)</strong> üretilir.</li>
                <li>Eski simülasyon metrikleri sıfırlanır ve gerçek donanım beklenir.</li>
                <li>Güvenlik ve denetim loguna (Audit Log) işlem kaydedilir.</li>
              </ul>
            </div>

            <div className="pt-3 flex justify-end gap-2.5">
              <button
                type="button"
                disabled={isConverting}
                onClick={() => setConvertingDevice(null)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={isConverting}
                onClick={handleConfirmConvertToPhysical}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 cursor-pointer"
              >
                {isConverting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Dönüştürülüyor...</span>
                  </>
                ) : (
                  <>
                    <Cpu className="w-3.5 h-3.5" />
                    <span>Fiziksel Donanıma Çevir</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conversion Success & New Physical Key Modal */}
      {conversionSuccessInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-emerald-500/40 space-y-4">
            <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
              <div className="p-3 bg-emerald-500/10 rounded-2xl">
                <Check className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Cihaz Başarıyla Gerçek Donanıma Dönüştürüldü!
                </h3>
                <p className="text-xs text-emerald-500 font-semibold mt-0.5">
                  "{conversionSuccessInfo.device.name}" artık gerçek bir IoT donanımıdır.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Cihaza özel yeni fiziksel API anahtarı atanmıştır. Lütfen bu anahtarı sahadaki ESP32/ESP8266 veya mikrodenetleyicinize yükleyiniz:
            </p>

            <div className="p-3.5 bg-slate-950 text-emerald-400 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span>YENİ FİZİKSEL API ANAHTARI (X-API-Key):</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(conversionSuccessInfo.apiKey);
                    setCopiedKey(conversionSuccessInfo.apiKey);
                    setTimeout(() => setCopiedKey(null), 2500);
                  }}
                  className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-bold cursor-pointer"
                >
                  {copiedKey === conversionSuccessInfo.apiKey ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" /> Kopyalandı
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" /> Kopyala
                    </>
                  )}
                </button>
              </div>
              <p className="font-mono text-xs font-bold break-all selection:bg-emerald-500 selection:text-black">
                {conversionSuccessInfo.apiKey}
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setConversionSuccessInfo(null)}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 cursor-pointer"
              >
                Tamam, Anladım
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Device Confirmation Modal */}
      {deletingDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-rose-500/30 space-y-4">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="p-3 bg-rose-500/10 rounded-2xl">
                <AlertTriangle className="w-6 h-6 text-rose-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Cihaz Silme Onayı
                </h3>
                <p className="text-xs text-rose-400 font-semibold mt-0.5">Yönetici Onayı Gereklidir</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong>"{deletingDevice.name}"</strong> cihazını sistemden tamamen silmek istediğinizden emin misiniz? Bu işlem cihazın X-API-Key anahtarını iptal edecek ve veri akışını durduracaktır.
            </p>

            <div className="pt-3 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeletingDevice(null)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-600/20 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Evet, Cihazı Sil</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Screen Live Terminal Modal */}
      {isFullscreenTerminal && activeDevice && (
        <div className="fixed inset-0 z-50 bg-[#020617] text-slate-200 flex flex-col p-6 space-y-4 font-mono animate-fadeIn">
          {/* Modal Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-cyan-400" />
                  SAHA CİHAZLARI ANLIK SERİ PORT & INGESTION TERMINALI
                </h2>
                <p className="text-xs text-slate-400 font-sans">
                  Filtre: <strong className="text-cyan-300">{activeDevice.name}</strong> ({activeDevice.id}) • IP: {activeDevice.ipAddress}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setTerminalFilterMode('all')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    terminalFilterMode === 'all'
                      ? 'bg-cyan-500 text-black shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Tüm Cihazlar
                </button>
                <button
                  type="button"
                  onClick={() => setTerminalFilterMode('selected')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    terminalFilterMode === 'selected'
                      ? 'bg-cyan-500 text-black shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Seçili Cihaz
                </button>
              </div>

              <button
                onClick={handleTogglePause}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition ${
                  isTerminalPaused
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                {isTerminalPaused ? <Play className="w-3.5 h-3.5 text-amber-400" /> : <Pause className="w-3.5 h-3.5" />}
                <span>{isTerminalPaused ? 'Devam Et' : 'Duraklat'}</span>
              </button>
              <button
                onClick={() => {
                  setClearedLogsAt(Date.now());
                  setFrozenLogs(null);
                }}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded-xl border border-slate-800 text-xs flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Temizle</span>
              </button>
              <button
                onClick={() => setIsFullscreenTerminal(false)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs"
                title="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Expanded Terminal Output Console */}
          <div className="flex-1 overflow-y-auto space-y-2 p-4 bg-black/60 rounded-3xl border border-slate-800 text-xs">
            {(() => {
              const logs = isTerminalPaused && frozenLogs ? frozenLogs : getFilteredTerminalLogs();
              const packetLogs = groupLogsByPacket(logs);

              if (packetLogs.length === 0) {
                return (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-3">
                    <Radio className="w-12 h-12 opacity-30 text-cyan-400 animate-pulse" />
                    <p className="text-sm font-semibold">Anlık Paket Akışı Bekleniyor...</p>
                    <p className="text-xs text-slate-500 font-sans">
                      Aşağıdaki komut satırından saha formatında test paketleri gönderebilirsiniz.
                    </p>
                  </div>
                );
              }

              return packetLogs.map((pkt, idx) => (
                <div key={`${pkt.id}_${idx}`} className="p-3 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-2 hover:border-cyan-500/40 transition">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      [INGESTION PKT RECV] HTTP 201 Created • {pkt.deviceName}
                    </span>
                    <div className="flex items-center gap-2">
                      {pkt.source === 'simulator' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          Simülatör
                        </span>
                      ) : pkt.source === 'manual_test' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Manuel Test
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                          Fiziki Donanım
                        </span>
                      )}
                      <span className="text-slate-500">{pkt.timestamp ? new Date(pkt.timestamp).toLocaleString() : '-'}</span>
                    </div>
                  </div>

                  <div className="p-2 bg-black text-amber-300 rounded-xl border border-amber-500/30 text-xs font-mono font-semibold break-all">
                    &gt; {pkt.rawPayload || `${pkt.deviceName}, ${pkt.metrics.map((m) => `${m.metric}:${m.value}`).join(', ')}`}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300 pt-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <span>Cihaz: <strong className="text-cyan-300">{pkt.deviceName}</strong></span>
                      <span className="text-slate-700">|</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {pkt.metrics.map((m, mIdx) => (
                          <span key={mIdx} className="inline-flex items-center gap-1 bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700/80 text-xs">
                            <span className="text-slate-400">{m.metric}:</span>
                            <strong className="text-amber-400">{m.value} {m.unit}</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      pkt.overallStatus === 'critical' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                      pkt.overallStatus === 'warning' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                      'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}>
                      {pkt.overallStatus.toUpperCase()}
                    </span>
                  </div>
                </div>
              ));
            })()}
          </div>

          {/* Terminal Command Line Input */}
          <div className="p-4 bg-slate-900 rounded-3xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 font-sans">
              <span>Saha Cihazı Veri Paketi Gönderim Konsolu</span>
              <span className="text-cyan-400 font-mono">Format: TOKEN, CİHAZ_ADI, metrik1:değer1, metrik2:değer2</span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={rawPayloadInput}
                onChange={(e) => setRawPayloadInput(e.target.value)}
                className="flex-1 px-4 py-3 bg-black border border-slate-800 rounded-2xl text-amber-300 font-mono text-xs focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={() => handleSendRawPayload()}
                disabled={isSending}
                className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-2xl font-bold flex items-center gap-2 text-xs shadow-lg shadow-cyan-600/20 shrink-0"
              >
                <Send className="w-4 h-4" />
                <span>Paketi POST Et</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
