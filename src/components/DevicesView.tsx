import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Device, TelemetryReading, Site, Zone, DeviceGroup, DeviceHealthSummary, DeviceReplacementRecord } from '../types';
import { useRealtime } from '../context/RealtimeContext';
import { useAuth } from '../context/AuthContext';
import { generateMaskedKey, getStatusColor, formatDateTime, getStatusLabel, formatRelativeTime, isInternalOrControlMetric, getMetricUnit } from '../lib/utils';
import { apiFetch as fetch, safeJson } from '../lib/apiFetch';
import { DeviceHierarchyBar } from './devices/DeviceHierarchyBar';
import { DeviceHealthBadge } from './devices/DeviceHealthBadge';
import { DeviceTagsEditor } from './devices/DeviceTagsEditor';
import { DeviceMaintenanceModal } from './devices/DeviceMaintenanceModal';
import { DeviceReplacementModal } from './devices/DeviceReplacementModal';
import { DevicePowerIcon } from './devices/DevicePowerIcon';
import { HierarchyManagementModal } from './devices/HierarchyManagementModal';
import { BulkDeleteModal } from './common/BulkDeleteModal';
import { ToastNotification } from './common/ToastNotification';
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
  Filter,
  Wrench,
  Tag,
  History,
  FolderTree,
  MapPin,
  LayoutGrid,
  List,
  RotateCcw,
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
    bulkDeleteDevices,
    regenerateApiKey,
    convertToPhysicalDevice,
    triggerTestTelemetry,
    customersList,
    selectedCustomerForAdmin,
  } = useRealtime();
  const { user } = useAuth();

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(
    () => localStorage.getItem('devices_selected_id') || null
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // View Mode (Karo / Liste) with Persistence
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(
    () => (localStorage.getItem('devices_view_mode') as 'list' | 'grid') || 'list'
  );

  // Bulk Selection State
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' | 'loading' | 'pending' } | null>(null);

  // Hierarchy Data & Filter State with Persistence
  const [sites, setSites] = useState<Site[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [healthSummaries, setHealthSummaries] = useState<DeviceHealthSummary[]>([]);
  const [replacementHistory, setReplacementHistory] = useState<DeviceReplacementRecord[]>([]);

  const [selectedSiteId, setSelectedSiteId] = useState<string>(
    () => localStorage.getItem('devices_filter_site') || 'all'
  );
  const [selectedZoneId, setSelectedZoneId] = useState<string>(
    () => localStorage.getItem('devices_filter_zone') || 'all'
  );
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    () => localStorage.getItem('devices_filter_group') || 'all'
  );
  const [selectedTag, setSelectedTag] = useState<string>(
    () => localStorage.getItem('devices_filter_tag') || 'all'
  );

  useEffect(() => {
    if (selectedDeviceId) {
      localStorage.setItem('devices_selected_id', selectedDeviceId);
    } else {
      localStorage.removeItem('devices_selected_id');
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    localStorage.setItem('devices_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem('devices_filter_site', selectedSiteId);
  }, [selectedSiteId]);

  useEffect(() => {
    localStorage.setItem('devices_filter_zone', selectedZoneId);
  }, [selectedZoneId]);

  useEffect(() => {
    localStorage.setItem('devices_filter_group', selectedGroupId);
  }, [selectedGroupId]);

  useEffect(() => {
    localStorage.setItem('devices_filter_tag', selectedTag);
  }, [selectedTag]);

  // Custom User Device Ordering (Persistent)
  const [customDeviceOrder, setCustomDeviceOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('devices_custom_order');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('devices_custom_order', JSON.stringify(customDeviceOrder));
  }, [customDeviceOrder]);

  // Clean up any deleted devices from customDeviceOrder
  useEffect(() => {
    if (customDeviceOrder.length > 0 && devices.length > 0) {
      const existingIds = new Set(devices.map((d) => d.id));
      const cleaned = customDeviceOrder.filter((id) => existingIds.has(id));
      if (cleaned.length !== customDeviceOrder.length) {
        setCustomDeviceOrder(cleaned);
      }
    }
  }, [devices]);

  // Hierarchy management modal
  const [showHierarchyModal, setShowHierarchyModal] = useState(false);

  // Maintenance & Replacement modals
  const [maintenanceDevice, setMaintenanceDevice] = useState<Device | null>(null);
  const [hardwareReplaceDevice, setHardwareReplaceDevice] = useState<Device | null>(null);

  // Fetch Hierarchy Data
  const fetchHierarchyData = useCallback(async () => {
    try {
      const [sitesRes, zonesRes, groupsRes, healthRes, historyRes] = await Promise.all([
        fetch('/api/devices/hierarchy/sites'),
        fetch('/api/devices/hierarchy/zones'),
        fetch('/api/devices/hierarchy/groups'),
        fetch('/api/devices/health-summaries'),
        fetch('/api/devices/replacement-history'),
      ]);

      const sitesData = await safeJson(sitesRes, null);
      if (Array.isArray(sitesData)) setSites(sitesData);

      const zonesData = await safeJson(zonesRes, null);
      if (Array.isArray(zonesData)) setZones(zonesData);

      const groupsData = await safeJson(groupsRes, null);
      if (Array.isArray(groupsData)) setGroups(groupsData);

      const healthData = await safeJson(healthRes, null);
      if (healthData && typeof healthData === 'object') setHealthSummaries(healthData);

      const historyData = await safeJson(historyRes, null);
      if (Array.isArray(historyData)) setReplacementHistory(historyData);
    } catch (err) {
      console.warn('Hiyerarşi verileri yüklenemedi:', err);
    }
  }, []);

  useEffect(() => {
    fetchHierarchyData();
    const interval = setInterval(fetchHierarchyData, 15000);
    return () => clearInterval(interval);
  }, [fetchHierarchyData]);

  // All distinct tags across all devices
  const allTags = useMemo(() => {
    const set = new Set<string>();
    devices.forEach((d) => {
      (d.tags || []).forEach((t) => set.add(t));
    });
    return Array.from(set).sort();
  }, [devices]);

  // Base ranking: 1) Active Real Devices, 2) Real Devices (other), 3) Active Virtual Devices, 4) Passive Virtual Devices
  const getDeviceBaseRank = useCallback((d: Device) => {
    const isReal = !d.isSimulated;
    const isOnline = d.status === 'online';
    if (isReal && isOnline) return 1; // 1. Öncelik: Aktif ve Gerçek Donanım
    if (isReal) return 2;             // 2. Öncelik: Gerçek Donanım (uyarı/bakım/çevrimdışı)
    if (isOnline) return 3;           // 3. Öncelik: Aktif Sanal Cihaz
    return 4;                         // 4. Öncelik: Pasif Sanal Cihaz
  }, []);

  // Filtered devices based on Site, Zone, Group, Tag (Active & Real devices first, stable order, supports custom user ordering)
  const filteredDevices = useMemo(() => {
    const list = devices.filter((d) => {
      if (selectedSiteId !== 'all' && d.siteId !== selectedSiteId) return false;
      if (selectedZoneId !== 'all' && d.zoneId !== selectedZoneId) return false;
      if (selectedGroupId !== 'all' && d.groupId !== selectedGroupId) return false;
      if (selectedTag !== 'all' && !(d.tags || []).includes(selectedTag)) return false;
      return true;
    });

    // If user has defined a custom order, respect it
    if (customDeviceOrder.length > 0) {
      const orderMap = new Map<string, number>(customDeviceOrder.map((id, index) => [id, index]));
      return [...list].sort((a, b) => {
        const hasA = orderMap.has(a.id);
        const hasB = orderMap.has(b.id);
        if (hasA && hasB) {
          return (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0);
        }
        if (hasA) return -1;
        if (hasB) return 1;
        // Fallback for new devices not in custom order: Active & Real first, deterministic name
        const rA = getDeviceBaseRank(a);
        const rB = getDeviceBaseRank(b);
        if (rA !== rB) return rA - rB;
        const nameComp = (a.name || '').localeCompare(b.name || '', 'tr');
        if (nameComp !== 0) return nameComp;
        return (a.id || '').localeCompare(b.id || '');
      });
    }

    // Default sorting: Active & Real first, then stable alphabetical (never jumps on telemetry receipt)
    return [...list].sort((a, b) => {
      const rA = getDeviceBaseRank(a);
      const rB = getDeviceBaseRank(b);
      if (rA !== rB) return rA - rB;
      const nameComp = (a.name || '').localeCompare(b.name || '', 'tr');
      if (nameComp !== 0) return nameComp;
      return (a.id || '').localeCompare(b.id || '');
    });
  }, [devices, selectedSiteId, selectedZoneId, selectedGroupId, selectedTag, customDeviceOrder, getDeviceBaseRank]);

  // Handle Manual Device Reordering (Move Up / Move Down)
  const handleMoveDevice = useCallback((deviceId: string, direction: 'up' | 'down', e: React.MouseEvent) => {
    e.stopPropagation();
    const currentIds = filteredDevices.map((d) => d.id);
    const currentIndex = currentIds.indexOf(deviceId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= currentIds.length) return;

    const newOrder = [...currentIds];
    const temp = newOrder[currentIndex];
    newOrder[currentIndex] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;

    setCustomDeviceOrder(newOrder);
  }, [filteredDevices]);

  // Reset to Default Order (Active & Real Devices First)
  const handleResetDeviceOrder = useCallback(() => {
    setCustomDeviceOrder([]);
    localStorage.removeItem('devices_custom_order');
  }, []);

  // Stable selected device resolution by ID (prevents flapping/disconnect ghosting)
  const selectedDevice = React.useMemo(() => {
    if (selectedDeviceId) {
      const match = devices.find((d) => d.id === selectedDeviceId);
      if (match) return match;
    }
    return filteredDevices[0] || devices[0] || null;
  }, [devices, filteredDevices, selectedDeviceId]);

  // Selected device health summary
  const selectedHealthSummary = useMemo(() => {
    if (!selectedDevice) return null;
    return healthSummaries.find((h) => h.deviceId === selectedDevice.id) || null;
  }, [healthSummaries, selectedDevice?.id]);

  // Handle Maintenance Toggle
  const handleToggleMaintenance = async (enabled: boolean, reason?: string, until?: string) => {
    if (!maintenanceDevice) return;
    const res = await fetch(`/api/devices/${maintenanceDevice.id}/maintenance`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, reason, until }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Bakım modu güncellenemedi.');
    }
    await fetchHierarchyData();
  };

  // Handle Hardware Replace
  const handleHardwareReplace = async (data: any) => {
    if (!hardwareReplaceDevice) return;
    const res = await fetch(`/api/devices/${hardwareReplaceDevice.id}/replace-hardware`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Donanım değişimi gerçekleştirilemedi.');
    }
    await fetchHierarchyData();
  };

  // Handle Save Tags
  const handleSaveTags = async (deviceId: string, tags: string[]) => {
    const res = await fetch(`/api/devices/${deviceId}/tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags }),
    });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Etiketler kaydedilemedi.');
    }
    await fetchHierarchyData();
  };

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
  const [addSiteId, setAddSiteId] = useState<string>('');
  const [addZoneId, setAddZoneId] = useState<string>('');
  const [addGroupId, setAddGroupId] = useState<string>('');
  const [manualApiKey, setManualApiKey] = useState('');
  const [addHeartbeatTimeout, setAddHeartbeatTimeout] = useState<number>(30);
  const [addExpectedInterval, setAddExpectedInterval] = useState<number>(15);
  const [addIntervalMode, setAddIntervalMode] = useState<'auto' | 'manual'>('auto');
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
  const [editSiteId, setEditSiteId] = useState<string>('');
  const [editZoneId, setEditZoneId] = useState<string>('');
  const [editGroupId, setEditGroupId] = useState<string>('');
  const [editRateLimit, setEditRateLimit] = useState(120);
  const [editEncryption, setEditEncryption] = useState('AES-256-GCM');
  const [editStatus, setEditStatus] = useState<Device['status']>('online');
  const [editApiKey, setEditApiKey] = useState('');
  const [editExpectedInterval, setEditExpectedInterval] = useState<number>(5);
  const [editIntervalMode, setEditIntervalMode] = useState<'auto' | 'manual'>('auto');
  const [editAutoDetectedInterval, setEditAutoDetectedInterval] = useState<number | undefined>(undefined);
  const [editHeartbeatTimeout, setEditHeartbeatTimeout] = useState<number>(10);
  const [filterStaleMetrics, setFilterStaleMetrics] = useState<boolean>(false);
  const [editIsSimulated, setEditIsSimulated] = useState<boolean>(false);
  const [editSaveSimulatedDataToDb, setEditSaveSimulatedDataToDb] = useState<boolean>(false);
  const [editSimMetrics, setEditSimMetrics] = useState<string[]>([]);
  const [editCustomSimMetricInput, setEditCustomSimMetricInput] = useState('');

  // Replace Hardware modal state
  const [replacingDevice, setReplacingDevice] = useState<Device | null>(null);
  const [replacePairingCode, setReplacePairingCode] = useState('');
  const [isReplacing, setIsReplacing] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);

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
    const devInterval = activeDevice
      ? (activeDevice.expectedIntervalSeconds || activeDevice.autoDetectedIntervalSeconds || activeDevice.customIntervalSeconds || 5)
      : 5;
    // Kullanıcı Kuralı: Veri gönderim sıklığının 2 katı süresi (Offline & Stale eşiği)
    const devThresholdSec = Math.max(devInterval * 2, 4);
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
          const isFresh = ageSec <= devThresholdSec;
          if (filterStaleMetrics && !isFresh) continue;

          const ageText = ageSec < 60 ? `${ageSec} sn önce` : `${Math.floor(ageSec / 60)} dk önce`;

          metricMap.set(lowerKey, {
            name: mKey,
            latestValue: mVal,
            unit,
            lastTimestamp: lastTs,
            ageText,
            deviceNames: new Set([targetName || targetDevId]),
            isFresh,
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
        const isFresh = ageSec <= devThresholdSec;
        if (filterStaleMetrics && !isFresh) continue;

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
            isFresh,
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
            existing.isFresh = isFresh;
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
        siteId: addSiteId || undefined,
        zoneId: addZoneId || undefined,
        groupId: addGroupId || undefined,
        apiKey: manualApiKey.trim() || undefined,
        expectedIntervalSeconds: addExpectedInterval,
        intervalMode: addIntervalMode,
        customIntervalSeconds: addIntervalMode === 'manual' ? addExpectedInterval : undefined,
        heartbeatTimeoutSeconds: addHeartbeatTimeout || Math.max(addExpectedInterval * 2, 10),
        customHeartbeatTimeoutSeconds: addHeartbeatTimeout || Math.max(addExpectedInterval * 2, 10),
        isSimulated,
        saveSimulatedDataToDb: isSimulated ? saveSimulatedDataToDb : false,
        simulatedMetrics: isSimulated ? addSimMetrics : [],
      });
      setShowAddModal(false);
      setName('');
      setManualApiKey('');
      setAddSiteId('');
      setAddZoneId('');
      setAddGroupId('');
      setAddExpectedInterval(5);
      setAddIntervalMode('auto');
      setAddHeartbeatTimeout(10);
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
    setEditSiteId(dev.siteId || '');
    setEditZoneId(dev.zoneId || '');
    setEditGroupId(dev.groupId || '');
    setEditRateLimit(dev.rateLimitPerMin || 120);
    setEditEncryption(dev.encryptionMethod || 'AES-256-GCM');
    setEditStatus(dev.status || 'online');
    setEditApiKey(dev.apiKey || '');
    const effInterval = dev.expectedIntervalSeconds || dev.autoDetectedIntervalSeconds || dev.customIntervalSeconds || 5;
    setEditExpectedInterval(effInterval);
    setEditIntervalMode(dev.intervalMode || 'auto');
    setEditAutoDetectedInterval(dev.autoDetectedIntervalSeconds);
    setEditHeartbeatTimeout(dev.customHeartbeatTimeoutSeconds || dev.heartbeatTimeoutSeconds || Math.max(effInterval * 2, 10));
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
        siteId: editSiteId || undefined,
        zoneId: editZoneId || undefined,
        groupId: editGroupId || undefined,
        rateLimitPerMin: editRateLimit,
        encryptionMethod: editEncryption,
        status: editStatus,
        apiKey: editApiKey.trim() || undefined,
        expectedIntervalSeconds: editExpectedInterval,
        intervalMode: editIntervalMode,
        customIntervalSeconds: editIntervalMode === 'manual' ? editExpectedInterval : undefined,
        heartbeatTimeoutSeconds: editHeartbeatTimeout || Math.max(editExpectedInterval * 2, 10),
        customHeartbeatTimeoutSeconds: editHeartbeatTimeout || Math.max(editExpectedInterval * 2, 10),
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
  const handleClearDeviceMetrics = async (deviceId: string, staleOnly = false) => {
    const promptMsg = staleOnly
      ? 'Veri gönderim sıklığının 2 katı süresi geçmiş (bayatlamış) metrikler temizlensin mi?'
      : 'Bu cihazın tüm kayıtlı metrik önbelleği sıfırlansın mı?';
    if (!window.confirm(promptMsg)) return;
    setClearingMetrics(true);
    try {
      const res = await fetch(`/api/devices/${deviceId}/clear-metrics?staleOnly=${staleOnly ? 'true' : 'false'}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({ staleOnly }),
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
    setToast({
      message: 'Cihaz ve geçmiş verileri arşiv havuzuna taşınıyor...',
      type: 'loading',
    });
    try {
      const devName = deletingDevice.name || deletingDevice.id;
      await deleteDevice(deletingDevice.id);
      if (selectedDevice?.id === deletingDevice.id) {
        setSelectedDeviceId(null);
      }
      setSelectedDeviceIds((prev) => {
        const next = new Set(prev);
        next.delete(deletingDevice.id);
        return next;
      });
      setDeletingDevice(null);
      setToast({
        message: `"${devName}" cihazı başarıyla silindi ve arşiv havuzuna aktarıldı.`,
        type: 'success',
      });
    } catch (err: any) {
      setToast({
        message: err.message || 'Cihaz silinemedi.',
        type: 'error',
      });
    }
  };

  const handleToggleDeviceSelection = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedDeviceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleSelectAllDevices = () => {
    if (selectedDeviceIds.size === filteredDevices.length && filteredDevices.length > 0) {
      setSelectedDeviceIds(new Set());
    } else {
      setSelectedDeviceIds(new Set(filteredDevices.map((d) => d.id)));
    }
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedDeviceIds.size === 0) return;
    setIsBulkDeleting(true);
    setToast({
      message: `Seçilen ${selectedDeviceIds.size} cihaz ve metrik verileri arşivleniyor...`,
      type: 'loading',
    });
    try {
      const idsToDelete = Array.from(selectedDeviceIds);
      const count = idsToDelete.length;
      await bulkDeleteDevices(idsToDelete);
      if (selectedDeviceId && idsToDelete.includes(selectedDeviceId)) {
        setSelectedDeviceId(null);
      }
      setSelectedDeviceIds(new Set());
      setShowBulkDeleteModal(false);
      setToast({
        message: `Seçilen ${count} adet cihaz başarıyla silindi ve geçmiş telemetrileriyle arşive aktarıldı.`,
        type: 'success',
      });
    } catch (err: any) {
      setToast({
        message: err.message || 'Toplu cihaz silme işlemi başarısız oldu.',
        type: 'error',
      });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleConfirmReplace = async () => {
    if (!replacingDevice || !replacePairingCode.trim()) return;
    setIsReplacing(true);
    setReplaceError(null);
    try {
      const res = await fetch(`/api/devices/${replacingDevice.id}/replace`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({ pairingCode: replacePairingCode.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Donanım değiştirilemedi.');
      }

      setReplacingDevice(null);
      setReplacePairingCode('');
    } catch (err: any) {
      setReplaceError(err.message || 'Bilinmeyen bir hata oluştu.');
    } finally {
      setIsReplacing(false);
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

  const renderIntervalAndHeartbeatSelector = (
    expectedInterval: number,
    setExpectedInterval: (val: number) => void,
    intervalMode: 'auto' | 'manual',
    setIntervalMode: (mode: 'auto' | 'manual') => void,
    autoDetectedInterval?: number,
    heartbeatTimeout?: number,
    setHeartbeatTimeout?: (val: number) => void
  ) => {
    const effectiveTimeout = heartbeatTimeout || Math.max(expectedInterval * 2, 10);

    return (
      <div className="p-4 bg-indigo-50/40 dark:bg-slate-800/40 rounded-2xl border border-indigo-200/70 dark:border-slate-700/80 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h4 className="font-bold text-indigo-700 dark:text-indigo-300 text-xs uppercase tracking-wider">
              Akıllı Veri Gönderim Sıklığı & Watchdog Zaman Aşımı
            </h4>
          </div>

          <div className="flex items-center gap-2">
            {intervalMode === 'auto' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Otomatik Tespit Edildi (Sistem)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                <span>🔒</span>
                Kullanıcı Tarafından Sabitlendi (Manuel)
              </span>
            )}
          </div>
        </div>

        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
          Cihazınızın veri gönderme periyodunu ve bağlantı koptuğunda ne kadar süre sonra <strong>Çevrimdışı (Offline)</strong> alarmı verileceğini belirleyin. Cihaz 5 saniyede bir gönderiyorsa dahi çevrimdışı süresini <strong>60 sn (1 dakika)</strong> gibi güvenli bir eşiğe ayarlayarak Wi-Fi dalgalanmalarındaki gereksiz sahte çevrimdışı alarmlarını engelleyebilirsiniz.
        </p>

        {/* Ayar Kutucuğu - Sıklık ve Çevrimdışı Süresi */}
        <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* 1. Veri Gönderim Sıklığı */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                ⏱️ Veri Gönderim Sıklığı (Saniye):
              </label>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Cihazın normalde ne sıklıkla paket attığı.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min={1}
                    max={86400}
                    value={expectedInterval}
                    onChange={(e) => {
                      const val = Math.max(1, Number(e.target.value));
                      setExpectedInterval(val);
                      setIntervalMode('manual');
                      if (setHeartbeatTimeout && (!heartbeatTimeout || heartbeatTimeout < val)) {
                        setHeartbeatTimeout(Math.max(val * 2, 10));
                      }
                    }}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border-2 border-indigo-500/60 dark:border-indigo-500/60 rounded-xl font-mono text-sm font-bold text-indigo-700 dark:text-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="absolute right-3 top-2.5 text-[11px] text-slate-400 font-mono">sn</span>
                </div>

                {intervalMode === 'manual' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIntervalMode('auto');
                      if (autoDetectedInterval && autoDetectedInterval > 0) {
                        setExpectedInterval(autoDetectedInterval);
                      }
                    }}
                    className="px-2.5 py-2 text-[10px] font-bold rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-700 transition flex items-center gap-1 cursor-pointer"
                    title="Sistemin cihaz sinyallerinden otomatik ölçmesine izin ver"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Oto</span>
                  </button>
                ) : (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/30 px-2 py-2 rounded-xl border border-emerald-500/20 whitespace-nowrap">
                    {autoDetectedInterval ? `${autoDetectedInterval} sn` : 'Ölçülüyor'}
                  </span>
                )}
              </div>
            </div>

            {/* 2. Çevrimdışı Kalma Tolerans Süresi */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-rose-700 dark:text-rose-300">
                🚨 Çevrimdışı (Timeout) Eşiği:
              </label>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Kaç saniye veri gelmezse ÇEVRİMDİŞİ alarmı verilsin.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min={5}
                    max={604800}
                    value={effectiveTimeout}
                    onChange={(e) => {
                      const val = Math.max(5, Number(e.target.value));
                      if (setHeartbeatTimeout) setHeartbeatTimeout(val);
                    }}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border-2 border-rose-500/60 dark:border-rose-500/60 rounded-xl font-mono text-sm font-bold text-rose-700 dark:text-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <span className="absolute right-3 top-2.5 text-[11px] text-slate-400 font-mono">sn</span>
                </div>

                {setHeartbeatTimeout && (
                  <button
                    type="button"
                    onClick={() => {
                      setHeartbeatTimeout(Math.max(expectedInterval * 2, 10));
                    }}
                    className="px-2.5 py-2 text-[10px] font-bold rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 transition cursor-pointer whitespace-nowrap"
                    title="Sıklığın 2 katına eşitle"
                  >
                    2x Yap
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Çevrimdışı Hızlı Seçim Butonları */}
          {setHeartbeatTimeout && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
              <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Hızlı Çevrimdışı (Timeout) Şablonları:
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {[
                  { label: '30 Saniye', val: 30, desc: 'Hızlı Alarm' },
                  { label: '60 Saniye (1 Dk)', val: 60, desc: 'Önerilen Tolerans' },
                  { label: '120 Saniye (2 Dk)', val: 120, desc: 'Wi-Fi Jitter Güvenli' },
                  { label: '300 Saniye (5 Dk)', val: 300, desc: 'Geniş Ağ Toleransı' },
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => setHeartbeatTimeout(item.val)}
                    className={`px-2.5 py-1.5 rounded-lg text-left border transition cursor-pointer text-xs ${
                      effectiveTimeout === item.val
                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-rose-400'
                    }`}
                  >
                    <div className="font-bold">{item.label}</div>
                    <div className={`text-[9px] ${effectiveTimeout === item.val ? 'text-rose-100' : 'text-slate-400'}`}>
                      {item.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Watchdog Durum Özeti */}
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-[11px] flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-600 dark:text-slate-300">
              💡 Özet Durum: Her <strong>{expectedInterval} sn</strong>'de bir veri beklenir. <strong>{effectiveTimeout} sn</strong> boyunca sinyal gelmezse Çevrimdışı uyarısı tetiklenir.
            </span>
          </div>
        </div>

        {/* Hızlı Sıklık Seçim Şablonları */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Hızlı Veri Gönderim Şablonları:
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: '⚡ 5 Saniye', sub: 'Hızlı Canlı Akış', val: 5 },
              { label: '⏱️ 10 Saniye', sub: 'Standart Sensör', val: 10 },
              { label: '🛡️ 30 Saniye', sub: 'Dengeli IoT', val: 30 },
              { label: '📡 60 Saniye', sub: '1 Dakika Periyot', val: 60 },
              { label: '☀️ 300 Saniye', sub: '5 Dk (Sayaç/İklim)', val: 300 },
              { label: '🔋 900 Saniye', sub: '15 Dk (Düşük Güç)', val: 900 },
              { label: '⏳ 3600 Saniye', sub: '1 Saat (Pilli Düğüm)', val: 3600 },
              { label: '📅 86400 Saniye', sub: 'Günde 1 Kez', val: 86400 },
            ].map((p) => {
              const isSelected = expectedInterval === p.val;
              return (
                <button
                  key={p.val}
                  type="button"
                  onClick={() => {
                    setExpectedInterval(p.val);
                    setIntervalMode('manual');
                  }}
                  className={`p-2 rounded-xl text-left border transition cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-500/30'
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
      {/* Hierarchy Filter Bar */}
      <DeviceHierarchyBar
        sites={sites}
        zones={zones}
        groups={groups}
        allTags={allTags}
        selectedSiteId={selectedSiteId}
        onSelectSiteId={setSelectedSiteId}
        selectedZoneId={selectedZoneId}
        onSelectZoneId={setSelectedZoneId}
        selectedGroupId={selectedGroupId}
        onSelectGroupId={setSelectedGroupId}
        selectedTag={selectedTag}
        onSelectTag={setSelectedTag}
        onOpenHierarchyModal={() => setShowHierarchyModal(true)}
      />

      {/* 1. Device List Table */}
      <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
            <div className="p-3.5 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2.5 sm:gap-3 flex-wrap">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <input
                  type="checkbox"
                  checked={filteredDevices.length > 0 && selectedDeviceIds.size === filteredDevices.length}
                  onChange={handleToggleSelectAllDevices}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 cursor-pointer"
                  title="Tümünü Seç / Kaldır"
                />
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <Cpu className="w-4 h-4 text-indigo-500 shrink-0" />
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider truncate">
                    <span className="hidden xs:inline">Kayıtlı </span>Saha Cihazları ({filteredDevices.length} / {devices.length})
                  </h3>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap">
                {/* Karo vs Liste Görünüm Butonları */}
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={`px-2 sm:px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 sm:gap-1.5 transition-all cursor-pointer ${
                      viewMode === 'grid'
                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title="Karo Görünümü (Kartlar)"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Karo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={`px-2 sm:px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 sm:gap-1.5 transition-all cursor-pointer ${
                      viewMode === 'list'
                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title="Liste Görünümü (Satırlar)"
                  >
                    <List className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Liste</span>
                  </button>
                </div>

                {/* Özel Sıralamayı Sıfırlama Butonu */}
                {customDeviceOrder.length > 0 && (
                  <button
                    type="button"
                    onClick={handleResetDeviceOrder}
                    className="px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-all cursor-pointer active:scale-95"
                    title="Özel sıralamayı sıfırla (Varsayılan: Aktif ve Gerçek Donanımlar Önce)"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Sıralamayı Sıfırla</span>
                  </button>
                )}

                {selectedDeviceIds.size > 0 && (
                  <button
                    onClick={() => setShowBulkDeleteModal(true)}
                    className="px-2.5 sm:px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 animate-fadeIn"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span><span className="hidden xs:inline">Seçilenleri </span>Sil ({selectedDeviceIds.size})</span>
                  </button>
                )}
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-2.5 sm:px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 flex items-center gap-1 sm:gap-1.5 transition-all shrink-0 cursor-pointer active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span><span className="hidden xs:inline">Yeni </span>Cihaz<span className="hidden sm:inline"> Ekle</span></span>
                </button>
              </div>
            </div>

            {selectedDeviceIds.size > 0 && (
              <div className="bg-indigo-50/80 dark:bg-indigo-950/40 border-b border-indigo-200/50 dark:border-indigo-800/40 px-4 py-2.5 flex items-center justify-between text-xs text-indigo-900 dark:text-indigo-200">
                <span className="font-medium">
                  <strong>{selectedDeviceIds.size}</strong> cihaz seçildi.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleToggleSelectAllDevices}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    {selectedDeviceIds.size === filteredDevices.length ? 'Seçimi Temizle' : 'Tüm Filtrelenenleri Seç'}
                  </button>
                </div>
              </div>
            )}

            {filteredDevices.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                Seçilen tesis, bölge veya etiket filtresine uygun cihaz bulunamadı.
              </div>
            ) : viewMode === 'grid' ? (
              /* KARO (GRID) GÖRÜNÜMÜ */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 p-3.5 sm:p-5">
                {filteredDevices.map((dev, idx) => {
                  const isSelected = activeDevice?.id === dev.id;
                  const isChecked = selectedDeviceIds.has(dev.id);
                  const colors = getStatusColor(dev.status);
                  const devSite = sites.find((s) => s.id === dev.siteId);
                  const devZone = zones.find((z) => z.id === dev.zoneId);
                  const devGroup = groups.find((g) => g.id === dev.groupId);

                  return (
                    <div
                      key={`${dev.id}_grid_${idx}`}
                      onClick={() => setSelectedDeviceId(dev.id)}
                      className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-2.5 sm:gap-3 relative ${
                        isSelected
                          ? 'bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-500 ring-2 ring-indigo-500/30 shadow-lg'
                          : 'bg-white dark:bg-slate-900/70 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md'
                      }`}
                    >
                      {/* Top Bar: Selection, Status Dot & Controls */}
                      <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => handleToggleDeviceSelection(dev.id, e as any)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 cursor-pointer shrink-0"
                          />
                          <span className="relative flex h-2.5 w-2.5 shrink-0">
                            {dev.status === 'online' && !dev.maintenanceMode && (
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            )}
                            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${dev.maintenanceMode ? 'bg-amber-400' : colors.dot}`}></span>
                          </span>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">
                            <span className="hidden xs:inline">{dev.maintenanceMode ? 'BAKIM MODU' : getStatusLabel(dev.status)}</span>
                            <span className="xs:hidden">{dev.maintenanceMode ? 'BAKIM' : dev.status === 'online' ? 'AKTİF' : 'KAPALI'}</span>
                          </span>
                        </div>

                        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMaintenanceDevice(dev);
                            }}
                            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                              dev.maintenanceMode
                                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse'
                                : 'hidden xs:inline-flex text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 border-transparent'
                            }`}
                            title={dev.maintenanceMode ? 'Bakım Modu Aktif' : 'Bakım Moduna Al'}
                          >
                            <Wrench className="w-3 h-3" />
                          </button>

                          {(() => {
                            const isRealDevice = !dev.isSimulated;
                            const isActive = dev.status === 'online' && dev.dataFlowActive !== false;

                            return (
                              <button
                                type="button"
                                onClick={(e) => handleToggleDeviceStatus(dev, e)}
                                className={`relative inline-flex items-center h-4.5 w-8 rounded-full transition-colors focus:outline-none cursor-pointer ${
                                  isActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                                }`}
                                title={
                                  isRealDevice
                                    ? isActive
                                      ? 'Cihaz akışını durdur'
                                      : 'Cihaz akışını başlat'
                                    : isActive
                                      ? 'Simülasyonu durdur'
                                      : 'Simülasyonu başlat'
                                }
                              >
                                <span
                                  className={`inline-block w-3 h-3 transform rounded-full bg-white transition-transform flex items-center justify-center ${
                                    isActive ? 'translate-x-4' : 'translate-x-0.5'
                                  }`}
                                >
                                  <Power className={`w-1.5 h-1.5 ${isActive ? 'text-emerald-600' : 'text-slate-500'}`} />
                                </span>
                              </button>
                            );
                          })()}

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setHardwareReplaceDevice(dev);
                            }}
                            className="hidden sm:inline-flex p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 cursor-pointer"
                            title="Donanım Değiştir / Kart Göçü"
                          >
                            <RefreshCw className="w-3 h-3" />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEdit(dev);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 cursor-pointer"
                            title="Düzenle"
                          >
                            <Settings className="w-3 h-3" />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingDevice(dev);
                            }}
                            className="hidden xs:inline-flex p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                            title="Sil"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>

                          {/* Sıralama Değiştirme (Yukarı / Aşağı) */}
                          <div className="hidden sm:flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={(e) => handleMoveDevice(dev.id, 'up', e)}
                              className={`p-1 rounded transition-colors ${
                                idx === 0
                                  ? 'opacity-30 cursor-not-allowed text-slate-400'
                                  : 'hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer'
                              }`}
                              title="Cihazı Bir Sıra Yukarı Taşı"
                            >
                              <ChevronUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === filteredDevices.length - 1}
                              onClick={(e) => handleMoveDevice(dev.id, 'down', e)}
                              className={`p-1 rounded transition-colors ${
                                idx === filteredDevices.length - 1
                                  ? 'opacity-30 cursor-not-allowed text-slate-400'
                                  : 'hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer'
                              }`}
                              title="Cihazı Bir Sıra Aşağı Taşı"
                            >
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Device Name with Virtual/Real Icon at the BEGINNING */}
                      <div className="flex items-center gap-2 min-w-0 pt-0.5">
                        {dev.isSimulated ? (
                          <span className="p-1 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-500 shrink-0 inline-flex items-center justify-center" title="Sanal Cihaz (Simülasyon)">
                            <Bot className="w-4 h-4" />
                          </span>
                        ) : (
                          <span className="p-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 shrink-0 inline-flex items-center justify-center" title="Gerçek Donanım (Fiziksel Saha Cihazı)">
                            <Cpu className="w-4 h-4" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate max-w-[130px] xs:max-w-[200px] sm:max-w-none" title={dev.name}>
                            {dev.name}
                          </h4>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[130px] xs:max-w-[200px] sm:max-w-none" title={dev.location || 'Konum belirtilmedi'}>
                            {dev.location || 'Konum belirtilmedi'}
                          </p>
                        </div>
                      </div>

                      {/* Badges: Hierarchy, Owner, Power */}
                      <div className="flex items-center gap-1.5 flex-nowrap overflow-hidden">
                        <DevicePowerIcon device={dev} />
                        {devSite && (
                          <span className="hidden xs:inline-flex px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] font-semibold rounded shrink-0 items-center gap-1 max-w-[90px] truncate">
                            <Building2 className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{devSite.name}</span>
                          </span>
                        )}
                        {devZone && (
                          <span className="hidden sm:inline-flex px-1.5 py-0.5 bg-teal-500/10 text-teal-400 border border-teal-500/20 text-[9px] font-semibold rounded shrink-0 items-center gap-1 max-w-[80px] truncate">
                            <MapPin className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{devZone.name}</span>
                          </span>
                        )}
                        {devGroup && (
                          <span className="hidden md:inline-flex px-1.5 py-0.5 text-[9px] font-semibold rounded shrink-0 items-center gap-1 border border-slate-700/60 bg-slate-800/80 text-slate-300 max-w-[80px] truncate">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: devGroup.color || '#3b82f6' }} />
                            <span className="truncate">{devGroup.name}</span>
                          </span>
                        )}
                        <span className="hidden lg:inline-flex px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 text-[9px] font-semibold rounded shrink-0 items-center gap-1 max-w-[90px] truncate">
                          <Building2 className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{getOwnerName(dev.tenantId)}</span>
                        </span>
                      </div>

                      {/* Footer: IP & Last Signal (No data frequency label, no health score text) */}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 gap-2 min-w-0">
                        <span className="font-mono truncate hidden xs:inline">IP: {dev.ipAddress || '—'}</span>
                        <span className="truncate ml-auto">
                          <span className="hidden xs:inline">Son Sinyal: </span><strong className={dev.status === 'online' ? 'text-emerald-500 font-semibold' : dev.status === 'offline' ? 'text-rose-500 font-semibold' : 'text-amber-500'}>{formatRelativeTime(dev.lastSeen)}</strong>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* LİSTE GÖRÜNÜMÜ */
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80 overflow-x-auto">
                {filteredDevices.map((dev, idx) => {
                  const isSelected = activeDevice?.id === dev.id;
                  const isChecked = selectedDeviceIds.has(dev.id);
                  const colors = getStatusColor(dev.status);
                  const devSite = sites.find((s) => s.id === dev.siteId);
                  const devZone = zones.find((z) => z.id === dev.zoneId);
                  const devGroup = groups.find((g) => g.id === dev.groupId);

                  return (
                    <div
                      key={`${dev.id}_${idx}`}
                      onClick={() => setSelectedDeviceId(dev.id)}
                      className={`p-3 sm:p-4 cursor-pointer transition-colors flex items-center justify-between gap-2.5 sm:gap-4 ${
                        isSelected
                          ? 'bg-indigo-500/10 border-l-4 border-l-indigo-500'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handleToggleDeviceSelection(dev.id, e as any)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 cursor-pointer shrink-0"
                        />
                        <span className="relative flex h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0">
                          {dev.status === 'online' && !dev.maintenanceMode && (
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          )}
                          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 ${dev.maintenanceMode ? 'bg-amber-400' : colors.dot}`}></span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                            {/* Sanal yada Gerçek Cihaz Simgesi Cihaz İsminin Başında */}
                            <div className="flex items-center gap-1.5 min-w-0 shrink-0 xs:shrink">
                              {dev.isSimulated ? (
                                <span className="p-1 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-500 shrink-0 inline-flex items-center justify-center" title="Sanal Cihaz">
                                  <Bot className="w-3.5 h-3.5" />
                                </span>
                              ) : (
                                <span className="p-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 shrink-0 inline-flex items-center justify-center" title="Gerçek Donanım">
                                  <Cpu className="w-3.5 h-3.5" />
                                </span>
                              )}
                              <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate max-w-[95px] xs:max-w-[140px] sm:max-w-[200px] md:max-w-[280px] lg:max-w-none" title={dev.name}>
                                {dev.name}
                              </p>
                            </div>
                            <DevicePowerIcon device={dev} />

                            {devSite && (
                              <span className="hidden sm:inline-flex px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] font-semibold rounded shrink-0 items-center gap-1 max-w-[90px] truncate">
                                <Building2 className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate">{devSite.name}</span>
                              </span>
                            )}
                            {devZone && (
                              <span className="hidden md:inline-flex px-1.5 py-0.5 bg-teal-500/10 text-teal-400 border border-teal-500/20 text-[9px] font-semibold rounded shrink-0 items-center gap-1 max-w-[80px] truncate">
                                <MapPin className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate">{devZone.name}</span>
                              </span>
                            )}
                            {devGroup && (
                              <span className="hidden lg:inline-flex px-1.5 py-0.5 text-[9px] font-semibold rounded shrink-0 items-center gap-1 border border-slate-700/60 bg-slate-800/80 text-slate-300 max-w-[80px] truncate">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: devGroup.color || '#3b82f6' }} />
                                <span className="truncate">{devGroup.name}</span>
                              </span>
                            )}

                            <span className="hidden xl:inline-flex px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] font-semibold rounded shrink-0 items-center gap-1 max-w-[90px] truncate">
                              <Building2 className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">{getOwnerName(dev.tenantId)}</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5 min-w-0">
                            {dev.location ? (
                              <>
                                <span className="truncate max-w-[90px] xs:max-w-[140px] sm:max-w-none">{dev.location}</span>
                                <span className="hidden xs:inline">•</span>
                              </>
                            ) : null}
                            {dev.ipAddress ? (
                              <>
                                <span className="hidden sm:inline font-mono text-[10px]">IP: {dev.ipAddress}</span>
                                <span className="hidden sm:inline">•</span>
                              </>
                            ) : null}
                            <span className="text-[10px] text-slate-400 shrink-0">
                              <span className="hidden xs:inline">Son: </span><strong className={dev.status === 'online' ? 'text-emerald-500 font-semibold' : dev.status === 'offline' ? 'text-rose-500 font-semibold' : 'text-amber-500'}>{formatRelativeTime(dev.lastSeen)}</strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                        {/* Maintenance Mode Toggle Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMaintenanceDevice(dev);
                          }}
                          className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${
                            dev.maintenanceMode
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse'
                              : 'hidden xs:inline-flex text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 border-transparent'
                          }`}
                          title={dev.maintenanceMode ? 'Bakım Modu Aktif (Ayrıntıları gör / kapat)' : 'Bakım Moduna Al (Alarmları sustur)'}
                        >
                          <Wrench className="w-3.5 h-3.5" />
                        </button>

                        {/* On/Off Power Switch Toggle */}
                        {(() => {
                          const isRealDevice = !dev.isSimulated;
                          const isActive = dev.status === 'online' && dev.dataFlowActive !== false;

                          return (
                            <div
                              className="flex items-center bg-slate-100 dark:bg-slate-800/80 px-1 sm:px-1.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700/60 transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={(e) => handleToggleDeviceStatus(dev, e)}
                                className={`relative inline-flex items-center h-5 w-8 sm:w-9 rounded-full transition-colors focus:outline-none cursor-pointer ${
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
                                    isActive ? 'translate-x-3.5 sm:translate-x-4.5' : 'translate-x-0.5'
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

                        {/* Hardware Replacement Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setHardwareReplaceDevice(dev);
                          }}
                          className="hidden sm:inline-flex p-1.5 rounded-xl text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 cursor-pointer"
                          title="Donanım Değiştir / Kart Göçü & Tarihçe"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEdit(dev);
                          }}
                          className="p-1.5 rounded-xl text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 cursor-pointer"
                          title="Cihaz Ayarlarını Düzenle"
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingDevice(dev);
                          }}
                          className="hidden xs:inline-flex p-1.5 rounded-xl text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                          title="Cihazı Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Sıralama Değiştirme (Yukarı / Aşağı) */}
                        <div
                          className="hidden md:flex items-center bg-slate-100 dark:bg-slate-800/80 rounded-xl p-0.5 border border-slate-200 dark:border-slate-700/60"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={(e) => handleMoveDevice(dev.id, 'up', e)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              idx === 0
                                ? 'opacity-30 cursor-not-allowed text-slate-400'
                                : 'hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer'
                            }`}
                            title="Cihazı Bir Sıra Yukarı Taşı"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === filteredDevices.length - 1}
                            onClick={(e) => handleMoveDevice(dev.id, 'down', e)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              idx === filteredDevices.length - 1
                                ? 'opacity-30 cursor-not-allowed text-slate-400'
                                : 'hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer'
                            }`}
                            title="Cihazı Bir Sıra Aşağı Taşı"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active System Metrics Card */}
          <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Activity className="w-4 h-4 text-cyan-500" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  {metricsScope === 'selected' && activeDevice
                    ? `${activeDevice.name} Aktif Metrikleri (${activeSystemMetrics.length})`
                    : `Sistemden Gelen Aktif Metrikler (${activeSystemMetrics.length})`}
                </h3>
              </div>

              {/* Controls: Stale Filter, 2x Cleanup, Reset & Scope Switcher */}
              <div className="flex items-center gap-2 self-start lg:self-auto flex-wrap">
                {metricsScope === 'selected' && activeDevice && (
                  <>
                    {/* Toggle Stale Filter */}
                    <button
                      type="button"
                      onClick={() => setFilterStaleMetrics(!filterStaleMetrics)}
                      className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 border cursor-pointer ${
                        filterStaleMetrics
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-500'
                      }`}
                      title="Veri gönderim sıklığının 2 katından eski olan metrikleri listede gizler"
                    >
                      <Filter className="w-3 h-3" />
                      <span>{filterStaleMetrics ? 'Sadece Canlı (≤2x)' : 'Tümünü Göster'}</span>
                    </button>

                    {/* Prune Stale Metrics (>2x frequency) */}
                    <button
                      type="button"
                      disabled={clearingMetrics}
                      onClick={() => handleClearDeviceMetrics(activeDevice.id, true)}
                      className="px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 disabled:opacity-50 cursor-pointer"
                      title="Veri sıklığının 2 katından eski olan bayatlamış metrikleri temizler"
                    >
                      <RefreshCw className={`w-3 h-3 ${clearingMetrics ? 'animate-spin' : ''}`} />
                      <span>Süresi Dolanları Temizle (2x)</span>
                    </button>

                    {/* Reset All Device Metrics */}
                    <button
                      type="button"
                      disabled={clearingMetrics}
                      onClick={() => handleClearDeviceMetrics(activeDevice.id, false)}
                      className="px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 disabled:opacity-50 cursor-pointer"
                      title="Cihazın kayıtlı tüm metrik önbelleğini sıfırlar"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Önbelleği Sıfırla</span>
                    </button>
                  </>
                )}

                {/* Scope Switcher: Selected Device vs All Devices */}
                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700/60">
                  <button
                    type="button"
                    onClick={() => setMetricsScope('selected')}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
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
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
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
                    ) tarafından iletilen parametreler. Veri gönderim sıklığı:{' '}
                    <strong className="font-mono text-indigo-600 dark:text-indigo-400">
                      {activeDevice.expectedIntervalSeconds || activeDevice.autoDetectedIntervalSeconds || activeDevice.customIntervalSeconds || 5} sn
                    </strong>
                    , canlılık eşiği (2 katı):{' '}
                    <strong className="font-mono text-rose-600 dark:text-rose-400">
                      {Math.max((activeDevice.expectedIntervalSeconds || activeDevice.autoDetectedIntervalSeconds || activeDevice.customIntervalSeconds || 5) * 2, 4)} sn
                    </strong>
                    . Bu süreyi aşan geçmiş metrikler temizlenebilir.
                  </>
                ) : (
                  'Çevrim içi cihazlardan algılanan aktif parametreler'
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
                        : 'bg-amber-500/5 dark:bg-amber-950/20 border-amber-500/30 text-slate-700 dark:text-slate-300 opacity-80'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        m.isFresh ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                      }`}
                    />
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">{m.name}</span>
                    {m.latestValue !== undefined && (
                      <span className="text-[11px] font-semibold text-slate-900 dark:text-white border-l border-slate-200 dark:border-slate-700 pl-2">
                        {m.latestValue} {m.unit}
                      </span>
                    )}
                    {m.ageText && (
                      <span className={`text-[9px] pl-1 ${m.isFresh ? 'text-slate-400 dark:text-slate-500' : 'text-amber-600 dark:text-amber-400 font-semibold'}`}>
                        ({m.ageText} {!m.isFresh ? '• >2x Bayat' : ''})
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

          {/* 3. Selected Device Outputs & Live Terminal */}
          {activeDevice && (
            <div className="space-y-6">
              {/* Tags Editor */}
              <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
                <DeviceTagsEditor
                  tags={activeDevice.tags || []}
                  onSaveTags={(tags) => handleSaveTags(activeDevice.id, tags)}
                />
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
                  <button
                    onClick={() => setShowCodeGuide(!showCodeGuide)}
                    className="px-2.5 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30 text-[10px] font-bold flex items-center gap-1.5 transition cursor-pointer"
                    title="ESP32 & API Entegrasyon Kılavuzu"
                  >
                    <Code className="w-3.5 h-3.5" />
                    <span>{showCodeGuide ? 'Kodu Gizle' : 'ESP32 / API Kodu'}</span>
                  </button>
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
                  <span>Ağ, Konum & Hiyerarşik Yapı</span>
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

                {/* Hierarchy Assignment */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                  <div>
                    <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Tesis (Site)</label>
                    <select
                      value={addSiteId}
                      onChange={(e) => setAddSiteId(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    >
                      <option value="">(Tesis Seçilmedi)</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Bölge (Zone)</label>
                    <select
                      value={addZoneId}
                      onChange={(e) => setAddZoneId(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    >
                      <option value="">(Bölge Seçilmedi)</option>
                      {zones
                        .filter((z) => !addSiteId || z.siteId === addSiteId)
                        .map((z) => (
                          <option key={z.id} value={z.id}>{z.name}</option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Grup</label>
                    <select
                      value={addGroupId}
                      onChange={(e) => setAddGroupId(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    >
                      <option value="">(Grup Seçilmedi)</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
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

              {/* Section 5: Akıllı Veri Gönderim Sıklığı & Watchdog */}
              {renderIntervalAndHeartbeatSelector(
                addExpectedInterval,
                setAddExpectedInterval,
                addIntervalMode,
                setAddIntervalMode,
                undefined,
                addHeartbeatTimeout,
                setAddHeartbeatTimeout
              )}

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

              {/* Section 2: Ağ & Konum Yapılandırması & Hiyerarşi */}
              <div className="p-4 bg-sky-50/30 dark:bg-slate-800/40 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3.5">
                <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400 font-bold text-xs uppercase tracking-wider">
                  <Globe className="w-4 h-4" />
                  <span>Ağ, Konum & Hiyerarşik Yapı</span>
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

                {/* Edit Hierarchy Assignment */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                  <div>
                    <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Tesis (Site)</label>
                    <select
                      value={editSiteId}
                      onChange={(e) => setEditSiteId(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    >
                      <option value="">(Tesis Seçilmedi)</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Bölge (Zone)</label>
                    <select
                      value={editZoneId}
                      onChange={(e) => setEditZoneId(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    >
                      <option value="">(Bölge Seçilmedi)</option>
                      {zones
                        .filter((z) => !editSiteId || z.siteId === editSiteId)
                        .map((z) => (
                          <option key={z.id} value={z.id}>{z.name}</option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Grup</label>
                    <select
                      value={editGroupId}
                      onChange={(e) => setEditGroupId(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    >
                      <option value="">(Grup Seçilmedi)</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
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

              {/* Section 4: Akıllı Veri Gönderim Sıklığı & Watchdog */}
              {renderIntervalAndHeartbeatSelector(
                editExpectedInterval,
                setEditExpectedInterval,
                editIntervalMode,
                setEditIntervalMode,
                editAutoDetectedInterval,
                editHeartbeatTimeout,
                setEditHeartbeatTimeout
              )}

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
        <BulkDeleteModal
          isOpen={!!deletingDevice}
          title="Cihaz Silme Onayı"
          description={`"${deletingDevice.name || deletingDevice.id}" cihazı sistemden silinecek, API anahtarı geçersiz kılınacak ve tüm ayarları ile telemetri geçmişi "Silinen Cihazlar & Arşiv" havuzuna aktarılacaktır.`}
          count={1}
          itemType="Cihaz"
          itemNames={[deletingDevice.name || deletingDevice.id]}
          onConfirm={handleConfirmDelete}
          onClose={() => setDeletingDevice(null)}
        />
      )}

      {/* Bulk Delete Devices Modal */}
      {showBulkDeleteModal && (
        <BulkDeleteModal
          isOpen={showBulkDeleteModal}
          title="Toplu Cihaz Silme Onayı"
          description="Seçilen cihazlar sistemden kaldırılarak API anahtarları iptal edilecek ve tüm geçmiş kayıtlarıyla birlikte arşiv havuzuna aktarılacaktır."
          count={selectedDeviceIds.size}
          itemType="Cihaz"
          onConfirm={handleConfirmBulkDelete}
          onClose={() => setShowBulkDeleteModal(false)}
          isDeleting={isBulkDeleting}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <ToastNotification
          toast={toast}
          onClose={() => setToast(null)}
        />
      )}

      {/* Replace Hardware Modal */}
      {replacingDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-amber-500/30 space-y-4">
            <div className="flex items-center gap-3 text-amber-500">
              <div className="p-3 bg-amber-500/10 rounded-2xl">
                <RefreshCw className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Cihaz Donanımı Değiştir
                </h3>
                <p className="text-xs text-amber-500 font-semibold mt-0.5">Mevcut Veriler ve Ayarlar Korunur</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong>"{replacingDevice.name}"</strong> cihazının fiziksel donanımını (ESP kartını) yenisiyle değiştirmek üzeresiniz. Lütfen yeni cihazın 6 haneli eşleştirme kodunu girin.
            </p>

            {replaceError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {replaceError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
                Yeni Cihaz Eşleştirme Kodu (6 Hane)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={replacePairingCode}
                  onChange={(e) => setReplacePairingCode(e.target.value.toUpperCase())}
                  placeholder="Örn: 924718"
                  className="flex-1 px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-mono tracking-widest text-center focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition"
                  maxLength={6}
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-2">
                Not: Yeni cihazın prize takılı ve Wi-Fi ağına bağlı olması gereklidir (Ağ Keşfi havuzunda beklemelidir).
              </p>
            </div>

            <div className="pt-3 flex justify-end gap-2.5">
              <button
                type="button"
                disabled={isReplacing}
                onClick={() => setReplacingDevice(null)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                İptal
              </button>
              <button
                type="button"
                disabled={isReplacing || replacePairingCode.length !== 6}
                onClick={handleConfirmReplace}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-amber-600/20 flex items-center gap-1.5 cursor-pointer transition"
              >
                {isReplacing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Değiştiriliyor...</span>
                  </>
                ) : (
                  <>
                    <Cpu className="w-3.5 h-3.5" />
                    <span>Donanımı Eşle</span>
                  </>
                )}
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

      {/* Device Maintenance Modal */}
      {maintenanceDevice && (
        <DeviceMaintenanceModal
          device={maintenanceDevice}
          onClose={() => setMaintenanceDevice(null)}
          onToggleMaintenance={handleToggleMaintenance}
        />
      )}

      {/* Device Hardware Replacement Modal */}
      {hardwareReplaceDevice && (
        <DeviceReplacementModal
          device={hardwareReplaceDevice}
          replacementHistory={replacementHistory}
          onClose={() => setHardwareReplaceDevice(null)}
          onReplaceHardware={handleHardwareReplace}
        />
      )}

      {/* Hierarchy Management Modal */}
      {showHierarchyModal && (
        <HierarchyManagementModal
          sites={sites}
          zones={zones}
          groups={groups}
          onClose={() => setShowHierarchyModal(false)}
          onRefresh={fetchHierarchyData}
        />
      )}
    </div>
  );
};
