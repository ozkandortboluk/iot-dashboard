import type { Device, TelemetryReading } from '../types';

export type WidgetDataStatus = 'live' | 'delayed' | 'stale' | 'offline' | 'no_data';

export interface WidgetFreshnessInfo {
  status: WidgetDataStatus;
  label: string; // 'Canlı' | 'Gecikmeli' | 'Eski veri' | 'Çevrimdışı' | 'Veri yok'
  description: string;
  dotColorClass: string;
  pingColorClass: string;
  badgeBgClass: string;
  textColorClass: string;
  borderColorClass: string;
  icon: string; // '🟢' | '🟡' | '🟠' | '🔴' | '⚪'
  lastSeenText: string;
  elapsedSeconds: number | null;
  expectedIntervalSeconds: number;
  deviceName: string;
  isStaleValue: boolean;
  tooltip: string;
  hasMetricsReceived: boolean;
  metricCount: number;
  availableMetrics: string[];
  metricFlowStatus: 'active' | 'delayed' | 'stalled' | 'none';
}

export function formatElapsedDuration(seconds: number | null): string {
  if (seconds === null || isNaN(seconds) || seconds < 0) return 'Bilinmiyor';
  if (seconds < 5) return 'Az önce';
  if (seconds < 60) return `${Math.floor(seconds)} sn önce`;
  const minutes = Math.floor(seconds / 60);
  const remSec = Math.floor(seconds % 60);
  if (minutes < 60) {
    return remSec > 0 ? `${minutes} dk ${remSec} sn önce` : `${minutes} dk önce`;
  }
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return `${hours} sa ${remMin} dk önce`;
}

export interface CalculateFreshnessParams {
  deviceId?: string;
  device?: Device | null;
  metricKey?: string;
  devices: Device[];
  telemetry: TelemetryReading[];
}

export function calculateWidgetFreshness({
  deviceId,
  device,
  metricKey,
  devices,
  telemetry,
}: CalculateFreshnessParams): WidgetFreshnessInfo {
  const isSpecificDeviceConfigured = Boolean(device || (deviceId && deviceId !== 'all'));

  const targetDevice: Device | null =
    device ||
    (deviceId && deviceId !== 'all'
      ? devices.find((d) => d.id === deviceId || d.apiKey === deviceId) || null
      : null);

  const deviceName = !isSpecificDeviceConfigured
    ? 'Tüm Saha Cihazları'
    : targetDevice
    ? targetDevice.name
    : `Kayıp Cihaz (${deviceId})`;

  const expectedIntervalSeconds =
    targetDevice?.expectedIntervalSeconds ||
    targetDevice?.customIntervalSeconds ||
    targetDevice?.autoDetectedIntervalSeconds ||
    10;

  // 1. Check if specific device is missing/deleted from loaded devices list
  if (isSpecificDeviceConfigured && !targetDevice && devices.length > 0) {
    return {
      status: 'offline',
      label: 'Çevrimdışı',
      description: 'Cihaz bağlantısı yok (Cihaz bulunamadı)',
      dotColorClass: 'bg-rose-500',
      pingColorClass: 'bg-rose-400',
      badgeBgClass: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
      textColorClass: 'text-rose-500',
      borderColorClass: 'border-rose-500/30',
      icon: '🔴',
      lastSeenText: 'Bağlantı Yok',
      elapsedSeconds: null,
      expectedIntervalSeconds,
      deviceName,
      isStaleValue: false,
      tooltip: `🔴 Çevrimdışı — Cihaz bulunamadı (${deviceName})`,
      hasMetricsReceived: false,
      metricCount: 0,
      availableMetrics: [],
      metricFlowStatus: 'none',
    };
  }

  // 2. Check if specific device is explicitly offline or dataflow suspended
  if (targetDevice && (targetDevice.status === 'offline' || targetDevice.dataFlowActive === false)) {
    const elapsed = targetDevice.lastSeen
      ? Math.max(0, Math.floor((Date.now() - new Date(targetDevice.lastSeen).getTime()) / 1000))
      : null;
    const lastSeenText = formatElapsedDuration(elapsed);
    const reason = targetDevice.dataFlowActive === false
      ? 'Veri akışı duraklatıldı'
      : 'Cihaz bağlantısı yok, metrik alınmıyor';

    const devMetrics = targetDevice.metrics ? Object.keys(targetDevice.metrics) : [];

    return {
      status: 'offline',
      label: 'Çevrimdışı',
      description: reason,
      dotColorClass: 'bg-rose-500',
      pingColorClass: 'bg-rose-400',
      badgeBgClass: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
      textColorClass: 'text-rose-500',
      borderColorClass: 'border-rose-500/30',
      icon: '🔴',
      lastSeenText,
      elapsedSeconds: elapsed,
      expectedIntervalSeconds,
      deviceName,
      isStaleValue: false,
      tooltip: `🔴 Çevrimdışı — ${reason} (${deviceName} • Son metrik: ${lastSeenText})`,
      hasMetricsReceived: devMetrics.length > 0 || Boolean(targetDevice.lastSeen),
      metricCount: devMetrics.length,
      availableMetrics: devMetrics,
      metricFlowStatus: 'none',
    };
  }

  // 3. If "all" devices, check if there are any online devices at all
  if (!isSpecificDeviceConfigured) {
    const hasAnyOnline = devices.some((d) => d.status === 'online' && d.dataFlowActive !== false);
    if (!hasAnyOnline && devices.length > 0) {
      return {
        status: 'offline',
        label: 'Çevrimdışı',
        description: 'Tüm saha cihazları çevrimdışı, metrik alınmıyor',
        dotColorClass: 'bg-rose-500',
        pingColorClass: 'bg-rose-400',
        badgeBgClass: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
        textColorClass: 'text-rose-500',
        borderColorClass: 'border-rose-500/30',
        icon: '🔴',
        lastSeenText: 'Aktif Cihaz Yok',
        elapsedSeconds: null,
        expectedIntervalSeconds,
        deviceName,
        isStaleValue: false,
        tooltip: '🔴 Çevrimdışı — sistemdeki tüm cihazlar çevrimdışı',
        hasMetricsReceived: false,
        metricCount: 0,
        availableMetrics: [],
        metricFlowStatus: 'none',
      };
    }
  }

  // 4. Gather telemetry readings for this device (not isolated to a single metricKey)
  const filtered = telemetry.filter((t) => {
    if (!t) return false;
    if (isSpecificDeviceConfigured && targetDevice) {
      const matchDevice =
        t.deviceId === targetDevice.id ||
        t.deviceId === targetDevice.apiKey ||
        (t.deviceName && targetDevice.name && t.deviceName.toLowerCase() === targetDevice.name.toLowerCase());
      if (!matchDevice) return false;
    } else if (isSpecificDeviceConfigured && deviceId) {
      if (t.deviceId !== deviceId) return false;
    }
    // Note: We evaluate whether ANY metrics are arriving from this device/system
    return true;
  });

  // Collect distinct metrics currently received or registered on the device
  const telemetryMetricNames = filtered.map((r) => r.metric).filter(Boolean);
  const deviceMetricNames = targetDevice?.metrics ? Object.keys(targetDevice.metrics) : [];
  const availableMetrics = Array.from(new Set([...telemetryMetricNames, ...deviceMetricNames]));
  const metricCount = availableMetrics.length;
  const hasMetricsReceived = metricCount > 0 || filtered.length > 0;

  // Sort telemetry readings by timestamp (newest first)
  const sorted = [...filtered].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const latestTelemetryItem = sorted[0];
  const telemetryTimestamp = latestTelemetryItem?.timestamp
    ? new Date(latestTelemetryItem.timestamp).getTime()
    : 0;

  const deviceLastSeenTimestamp = targetDevice?.lastSeen
    ? new Date(targetDevice.lastSeen).getTime()
    : 0;

  // Determine effective timestamp of most recently received metric / data
  let latestTime = 0;
  if (isSpecificDeviceConfigured) {
    latestTime = Math.max(telemetryTimestamp, deviceLastSeenTimestamp);
  } else {
    if (telemetryTimestamp > 0) {
      latestTime = telemetryTimestamp;
    } else {
      const onlineDevs = devices.filter((d) => d.status === 'online' && d.lastSeen);
      latestTime = onlineDevs.reduce((max, d) => Math.max(max, new Date(d.lastSeen).getTime()), 0);
    }
  }

  // 5. If no valid timestamp exists or no metrics received at all -> No data (⚪ Veri yok)
  if (latestTime <= 0 || isNaN(latestTime) || (!hasMetricsReceived && latestTime === 0)) {
    return {
      status: 'no_data',
      label: 'Veri yok',
      description: 'Cihazdan henüz hiç metrik alınmamış',
      dotColorClass: 'bg-slate-400 dark:bg-slate-500',
      pingColorClass: 'bg-slate-300',
      badgeBgClass: 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20',
      textColorClass: 'text-slate-400 dark:text-slate-500',
      borderColorClass: 'border-slate-400/30',
      icon: '⚪',
      lastSeenText: 'Metrik Yok',
      elapsedSeconds: null,
      expectedIntervalSeconds,
      deviceName,
      isStaleValue: false,
      tooltip: `⚪ Veri yok — Cihazdan henüz hiç metrik alınmamış (${deviceName})`,
      hasMetricsReceived: false,
      metricCount: 0,
      availableMetrics: [],
      metricFlowStatus: 'none',
    };
  }

  // Valid timestamp found: compute real-time elapsed seconds
  const now = Date.now();
  const elapsedSeconds = Math.max(0, Math.floor((now - latestTime) / 1000));
  const lastSeenText = formatElapsedDuration(elapsedSeconds);

  // Dynamic interval thresholds
  const delayThreshold = Math.max(Math.round(expectedIntervalSeconds * 2), 20);
  const staleTimeThreshold = Math.max(Math.round(expectedIntervalSeconds * 4), 60);
  const heartbeatTimeout = targetDevice?.heartbeatTimeoutSeconds || Math.max(Math.round(expectedIntervalSeconds * 6), 120);

  // Tier 1: 🔴 Çevrimdışı (Offline)
  // Heartbeat timeout exceeded or lost connection
  if (elapsedSeconds > heartbeatTimeout) {
    const offlineReason = `Cihaz bağlantısı koptu, metrik alınmıyor (Zaman aşımı: ${lastSeenText})`;
    return {
      status: 'offline',
      label: 'Çevrimdışı',
      description: offlineReason,
      dotColorClass: 'bg-rose-500',
      pingColorClass: 'bg-rose-400',
      badgeBgClass: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
      textColorClass: 'text-rose-500',
      borderColorClass: 'border-rose-500/30',
      icon: '🔴',
      lastSeenText,
      elapsedSeconds,
      expectedIntervalSeconds,
      deviceName,
      isStaleValue: false,
      tooltip: `🔴 Çevrimdışı — ${offlineReason} (${deviceName})`,
      hasMetricsReceived,
      metricCount,
      availableMetrics,
      metricFlowStatus: 'none',
    };
  }

  // Tier 2: 🟠 Eski Veri (Stale)
  // Device connected, but no new metric data has arrived for a prolonged time (> staleTimeThreshold)
  if (elapsedSeconds > staleTimeThreshold) {
    const reasonDesc = 'Cihaz bağlantılı görünse bile uzun süredir yeni metrik alınmıyor';

    return {
      status: 'stale',
      label: 'Eski veri',
      description: reasonDesc,
      dotColorClass: 'bg-orange-500',
      pingColorClass: 'bg-orange-400',
      badgeBgClass: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      textColorClass: 'text-orange-500',
      borderColorClass: 'border-orange-500/30',
      icon: '🟠',
      lastSeenText,
      elapsedSeconds,
      expectedIntervalSeconds,
      deviceName,
      isStaleValue: false,
      tooltip: `🟠 Eski veri — ${reasonDesc} (${deviceName} • Son metrik: ${lastSeenText} • Beklenen: ~${expectedIntervalSeconds} sn)`,
      hasMetricsReceived,
      metricCount,
      availableMetrics,
      metricFlowStatus: 'stalled',
    };
  }

  // Tier 3: 🟡 Gecikmeli (Delayed)
  // Metrics haven't arrived within expected period (> delayThreshold)
  if (elapsedSeconds > delayThreshold) {
    return {
      status: 'delayed',
      label: 'Gecikmeli',
      description: 'Cihazdan metrik akışı gecikti',
      dotColorClass: 'bg-amber-400',
      pingColorClass: 'bg-amber-300',
      badgeBgClass: 'bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/20',
      textColorClass: 'text-amber-500 dark:text-amber-400',
      borderColorClass: 'border-amber-500/30',
      icon: '🟡',
      lastSeenText,
      elapsedSeconds,
      expectedIntervalSeconds,
      deviceName,
      isStaleValue: false,
      tooltip: `🟡 Gecikmeli — Cihazdan metrik akışı gecikti (${deviceName} • Son metrik: ${lastSeenText} • Beklenen: ~${expectedIntervalSeconds} sn)`,
      hasMetricsReceived,
      metricCount,
      availableMetrics,
      metricFlowStatus: 'delayed',
    };
  }

  // Tier 4: 🟢 Canlı (Live)
  // Metrics are arriving on time (<= delayThreshold)
  return {
    status: 'live',
    label: 'Canlı',
    description: 'Cihazdan metrikler düzenli alınıyor',
    dotColorClass: 'bg-emerald-500',
    pingColorClass: 'bg-emerald-400',
    badgeBgClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    textColorClass: 'text-emerald-600 dark:text-emerald-400',
    borderColorClass: 'border-emerald-500/30',
    icon: '🟢',
    lastSeenText,
    elapsedSeconds,
    expectedIntervalSeconds,
    deviceName,
    isStaleValue: false,
    tooltip: `🟢 Canlı — Cihazdan düzenli metrik akışı alınıyor (${deviceName} • Son metrik: ${lastSeenText} • Beklenen: ~${expectedIntervalSeconds} sn)`,
    hasMetricsReceived,
    metricCount,
    availableMetrics,
    metricFlowStatus: 'active',
  };
}
