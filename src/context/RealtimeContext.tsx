import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type {
  Device,
  TelemetryReading,
  NotificationItem,
  WidgetConfig,
  DashboardLayout,
  ServerStats,
  User,
} from '../types';
import { useAuth } from './AuthContext';
import { apiFetch as fetch, safeJson } from '../lib/apiFetch';
import { validateAndSanitizeWidgets } from '../lib/widgetValidation';

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

export interface PendingCommandInfo {
  commandId?: string;
  deviceId: string;
  command: string;
  value: any;
  outputPin?: string;
  status: 'pending' | 'applied' | 'failed' | 'timeout';
  timestamp: number;
  error?: string;
}

interface RealtimeContextType {
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  reconnectAttempt: number;
  reconnectCountdown: number;
  reconnectWebSocket: () => void;
  wsLatency: number;
  devices: Device[];
  rawDevices: Device[];
  latestTelemetry: TelemetryReading[];
  physicalTelemetry: TelemetryReading[];
  simulationTelemetry: TelemetryReading[];
  subscribeChannel: (channel: 'physical' | 'simulation') => void;
  unsubscribeChannel: (channel: 'physical' | 'simulation') => void;
  notifications: NotificationItem[];
  unreadCount: number;
  widgets: WidgetConfig[];
  dashboardTitle: string;
  serverStats: ServerStats | null;
  simulatorActive: boolean;
  systemSettings: Record<string, any>;
  getSystemSetting: <T>(key: string, defaultValue?: T) => T;
  updateSystemSetting: (key: string, value: any) => Promise<boolean>;
  selectedCustomerForAdmin: string; // 'all' or customer ID
  setSelectedCustomerForAdmin: (customerId: string) => void;
  customersList: User[];
  refreshCustomers: () => Promise<void>;
  createNewCustomer: (data: { name: string; email: string; password: string; companyName?: string; role?: User['role'] }) => Promise<User>;
  deleteCustomer: (id: string) => Promise<void>;
  refreshDevices: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  deleteAllNotifications: () => Promise<void>;
  saveWidgets: (newWidgets: WidgetConfig[], title?: string) => Promise<void>;
  resetWidgetsToDefault: () => Promise<void>;
  toggleSimulator: () => Promise<void>;
  triggerTestTelemetry: (deviceId: string, metric: string, value: number, unit?: string) => Promise<void>;
  createNewDevice: (data: Partial<Device>) => Promise<Device>;
  updateDevice: (id: string, updates: Partial<Device>) => Promise<Device>;
  deleteDevice: (id: string) => Promise<void>;
  bulkDeleteDevices: (ids: string[]) => Promise<number>;
  regenerateApiKey: (id: string) => Promise<string>;
  convertToPhysicalDevice: (id: string) => Promise<{ device: Device; apiKey: string }>;
  sendControlCommand: (
    deviceId: string,
    command: string,
    value?: any,
    outputPin?: string,
    unit?: string
  ) => Promise<any>;
  pendingCommands: Record<string, PendingCommandInfo>;
  getPendingCommand: (deviceId: string, outputPin?: string) => PendingCommandInfo | null;
  subscribeWsEvent: (event: string, callback: (payload: any) => void) => () => void;
}

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

function cleanFirestoreData<T extends Record<string, any>>(obj: T): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
        cleaned[key] = cleanFirestoreData(val);
      } else {
        cleaned[key] = val;
      }
    }
  }
  return cleaned;
}

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('reconnecting');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [reconnectCountdown, setReconnectCountdown] = useState(0);
  const [pendingCommands, setPendingCommands] = useState<Record<string, PendingCommandInfo>>({});
  const [wsLatency, setWsLatency] = useState(12);
  const [rawDevices, setRawDevices] = useState<Device[]>([]);
  const [rawNotifications, setRawNotifications] = useState<NotificationItem[]>([]);
  const [latestTelemetry, setLatestTelemetry] = useState<TelemetryReading[]>([]);
  const [physicalTelemetry, setPhysicalTelemetry] = useState<TelemetryReading[]>([]);
  const [simulationTelemetry, setSimulationTelemetry] = useState<TelemetryReading[]>([]);
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [dashboardTitle, setDashboardTitle] = useState('Ana Analitik & Saha İzleme Dashboard');
  const [serverStats, setServerStats] = useState<ServerStats | null>(null);
  const [simulatorActive, setSimulatorActive] = useState(true);
  const [systemSettings, setSystemSettings] = useState<Record<string, any>>({});
  const [selectedCustomerForAdmin, setSelectedCustomerForAdmin] = useState<string>('all');
  const [customersList, setCustomersList] = useState<User[]>([]);

  const selectedCustomerForAdminRef = useRef(selectedCustomerForAdmin);
  useEffect(() => {
    selectedCustomerForAdminRef.current = selectedCustomerForAdmin;
  }, [selectedCustomerForAdmin]);

  // Site her açıldığında ve kullanıcı oturum açtığında/değiştiğinde yönetici kendi merkez paneline ('all') yönlendirilir
  useEffect(() => {
    setSelectedCustomerForAdmin('all');
    try {
      localStorage.removeItem('nexus_admin_selected_customer');
    } catch {
      // ignore
    }
  }, [user?.id]);

  // Seçili müşteri silinirse veya listeden kalkarsa yönetici panelini otomatik 'all' (Merkez) görünümüne döndür
  useEffect(() => {
    if (user?.role === 'admin' && selectedCustomerForAdmin !== 'all') {
      const exists = customersList.some((c) => c.id === selectedCustomerForAdmin);
      if (!exists && customersList.length > 0) {
        setSelectedCustomerForAdmin('all');
      }
    }
  }, [customersList, selectedCustomerForAdmin, user?.role]);

  const getPendingCommand = useCallback(
    (deviceId: string, outputPin?: string): PendingCommandInfo | null => {
      const key = `${deviceId}_${outputPin || ''}`;
      return pendingCommands[key] || null;
    },
    [pendingCommands]
  );

  // Synchronous, flicker-free derived devices list based on active customer filter (sorted online first)
  const devices = useMemo(() => {
    if (!user) return [];
    let list: Device[] = [];
    if (user.role === 'admin') {
      if (!selectedCustomerForAdmin || selectedCustomerForAdmin === 'all') {
        list = rawDevices;
      } else {
        const targetUser = customersList.find((c) => c.id === selectedCustomerForAdmin);
        const isTargetAdmin =
          selectedCustomerForAdmin === 'usr_admin' ||
          selectedCustomerForAdmin === 'admin' ||
          selectedCustomerForAdmin === user.id ||
          (targetUser && targetUser.role === 'admin');

        if (isTargetAdmin) {
          const adminIds = new Set(
            customersList
              .filter((c) => c.role === 'admin' || c.id === 'usr_admin' || c.id === 'admin')
              .map((c) => c.id)
          );
          adminIds.add('usr_admin');
          adminIds.add('admin');
          if (user.id) adminIds.add(user.id);
          if (selectedCustomerForAdmin) adminIds.add(selectedCustomerForAdmin);

          list = rawDevices.filter((d) => !d.tenantId || adminIds.has(d.tenantId));
        } else {
          list = rawDevices.filter((d) => d.tenantId === selectedCustomerForAdmin);
        }
      }
    } else {
      list = rawDevices.filter((d) =>
        d.tenantId === user.id ||
        (d as any).userId === user.id ||
        (d as any).customerId === user.id ||
        (d as any).assignedUserId === user.id ||
        (Boolean((user as any).tenantId) && d.tenantId === (user as any).tenantId)
      );
    }

    const getDeviceBaseRank = (d: Device) => {
      const isReal = !d.isSimulated;
      const isOnline = d.status === 'online';
      if (isReal && isOnline) return 1; // 1. Öncelik: Aktif ve Gerçek Donanım
      if (isReal) return 2;             // 2. Öncelik: Gerçek Donanım (uyarı/bakım/çevrimdışı)
      if (isOnline) return 3;           // 3. Öncelik: Aktif Sanal Cihaz
      return 4;                         // 4. Öncelik: Pasif Sanal Cihaz
    };

    return [...list].sort((a, b) => {
      const rA = getDeviceBaseRank(a);
      const rB = getDeviceBaseRank(b);
      if (rA !== rB) return rA - rB;
      const nameComp = (a.name || '').localeCompare(b.name || '', 'tr');
      if (nameComp !== 0) return nameComp;
      return (a.id || '').localeCompare(b.id || '');
    });
  }, [rawDevices, user, selectedCustomerForAdmin, customersList]);

  // Synchronous, flicker-free derived notifications list based on active customer filter
  const notifications = useMemo(() => {
    if (!user) return [];
    if (user.role === 'admin') {
      if (!selectedCustomerForAdmin || selectedCustomerForAdmin === 'all') return rawNotifications;
      const targetUser = customersList.find((c) => c.id === selectedCustomerForAdmin);
      const isTargetAdmin =
        selectedCustomerForAdmin === 'usr_admin' ||
        selectedCustomerForAdmin === 'admin' ||
        selectedCustomerForAdmin === user.id ||
        (targetUser && targetUser.role === 'admin');

      if (isTargetAdmin) {
        const adminIds = new Set(
          customersList
            .filter((c) => c.role === 'admin' || c.id === 'usr_admin' || c.id === 'admin')
            .map((c) => c.id)
        );
        adminIds.add('usr_admin');
        adminIds.add('admin');
        if (user.id) adminIds.add(user.id);
        if (selectedCustomerForAdmin) adminIds.add(selectedCustomerForAdmin);

        return rawNotifications.filter((n) => !n.tenantId || adminIds.has(n.tenantId));
      }
      return rawNotifications.filter((n) => !n.tenantId || n.tenantId === selectedCustomerForAdmin);
    }
    return rawNotifications.filter(
      (n) => !n.tenantId || n.tenantId === user.id || (Boolean((user as any).tenantId) && n.tenantId === (user as any).tenantId)
    );
  }, [rawNotifications, user, selectedCustomerForAdmin, customersList]);

  const socketRef = useRef<WebSocket | null>(null);
  const wsEventListeners = useRef<Map<string, Set<(payload: any) => void>>>(new Map());

  const subscribeWsEvent = useCallback((event: string, callback: (payload: any) => void) => {
    if (!wsEventListeners.current.has(event)) {
      wsEventListeners.current.set(event, new Set());
    }
    wsEventListeners.current.get(event)!.add(callback);
    return () => {
      wsEventListeners.current.get(event)?.delete(callback);
    };
  }, []);

  // Customers List (for Admin/Staff)
  const refreshCustomers = useCallback(async () => {
    if (!user || user.role === 'customer') return;
    try {
      const res = await fetch('/api/admin/tenants?limit=1000');
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const json = await res.json(); const data = Array.isArray(json) ? json : (json.data || []);
        setCustomersList((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
          return data;
        });
      }
    } catch (e) {
      console.error('Customers fetch error:', e);
    }
  }, [user]);

  const createNewCustomer = async (data: {
    name: string;
    email: string;
    password: string;
    companyName?: string;
    role?: User['role'];
  }): Promise<User> => {
    const res = await fetch('/api/admin/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const contentType = res.headers.get('content-type');
    if (res.ok && contentType && contentType.includes('application/json')) {
      const result = await res.json();
      await refreshCustomers();
      return result;
    }
    if (contentType && contentType.includes("application/json")) {
      const errRes = await res.json();
      if (errRes.details && Array.isArray(errRes.details)) {
        const detailMsgs = errRes.details.map((d: any) => d.message || (d.path ? `${d.path.join('.')}: geçersiz` : null)).filter(Boolean);
        throw new Error(detailMsgs.length > 0 ? detailMsgs.join(' ') : (errRes.error || "Doğrulama hatası."));
      }
      throw new Error(errRes.error || "Müşteri hesabı oluşturulamadı.");
    }
    throw new Error("Müşteri hesabı oluşturulamadı.");
  };

  const deleteCustomer = async (id: string) => {
    await fetch(`/api/admin/tenants/${id}/suspend`, { method: 'POST' });
    if (selectedCustomerForAdmin === id) {
      setSelectedCustomerForAdmin('all');
    }
    await refreshCustomers();
  };

  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);

  let quotaWarningLogged = false;
  const isQuotaError = (error: any) =>
    error?.code === 'resource-exhausted' ||
    String(error).includes('Quota exceeded') ||
    String(error).includes('8 RESOURCE_EXHAUSTED');

  const handleQuotaExceeded = useCallback(() => {
    setIsQuotaExceeded(true);
    if (!quotaWarningLogged) {
      quotaWarningLogged = true;
      console.warn('[RealtimeContext] Firestore kotaları doldu. Sistem otomatik REST ve WebSocket canlı veri modunda çalışıyor.');
    }
  }, []);

  const fetchDevices = useCallback(async () => {
    if (!user) return;
    try {
      const url = `/api/devices?userId=${encodeURIComponent(user.id)}`;
      const res = await fetch(url);
      const data = await safeJson<Device[]>(res, []);
      if (Array.isArray(data)) {
        setRawDevices(data);
      }
    } catch {
      // ignore
    }
  }, [user]);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const url = `/api/notifications?userId=${encodeURIComponent(user.id)}`;
      const res = await fetch(url);
      const data = await safeJson<NotificationItem[]>(res, []);
      if (Array.isArray(data)) {
        data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setRawNotifications(data);
      }
    } catch {
      // ignore
    }
  }, [user]);

  const refreshDevices = useCallback(async () => {
    await fetchDevices();
  }, [fetchDevices]);

  // Fetch Users, Devices, Notifications via local API (0 Firestore Reads)
  useEffect(() => {
    if (!user) return;

    if (user.role === 'admin' || user.role === 'operator' || user.role === 'analyst') {
      refreshCustomers();
    }
    fetchDevices();
    fetchNotifications();
  }, [user?.id, user?.role, refreshCustomers, fetchDevices, fetchNotifications]);

  const devicesRef = useRef(devices);
  const notificationsRef = useRef(notifications);
  const isConnectedRef = useRef(isConnected);
  const activeSubscriptionsRef = useRef<Set<'physical' | 'simulation'>>(new Set(['physical', 'simulation']));

  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);
  
  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);
  
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  // Fetch initial & on-demand telemetry history
  const fetchHistory = useCallback(async () => {
    if (!user) return;
    try {
      const queryUser = user.id;
      const targetCust = user.role === 'admin' ? selectedCustomerForAdmin : undefined;
      let url = `/api/telemetry/history?limit=100&userId=${encodeURIComponent(queryUser)}`;
      if (targetCust && targetCust !== 'all') {
        url += `&targetCustomerId=${encodeURIComponent(targetCust)}`;
      }
      const res = await fetch(url);
      const history = await safeJson<TelemetryReading[]>(res, []);
      if (Array.isArray(history) && history.length > 0) {
        const seen = new Set<string>();
        const uniqueHistory: TelemetryReading[] = [];
        for (const h of history) {
          if (h && h.id && !seen.has(h.id)) {
            seen.add(h.id);
            uniqueHistory.push(h);
          }
        }
        // Ensure history is ordered DESCENDING BY TIMESTAMP (newest at index 0)
        uniqueHistory.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        const physicalHistory = uniqueHistory.filter((r) => r.source === 'physical' || (!r.source && r.environment !== 'sandbox'));
        const simHistory = uniqueHistory.filter((r) => r.source === 'simulator' || r.source === 'manual_test' || r.environment === 'sandbox');

        setPhysicalTelemetry(physicalHistory.slice(0, 500));
        setSimulationTelemetry(simHistory.slice(0, 500));
        setLatestTelemetry(uniqueHistory.slice(0, 500));
      } else if (Array.isArray(history) && history.length === 0 && targetCust && targetCust !== 'all') {
        // If selected customer has no historical records yet, clear old customer records
        setPhysicalTelemetry([]);
        setSimulationTelemetry([]);
        setLatestTelemetry([]);
      }

      const simRes = await fetch('/api/simulator/status');
      const simData = await safeJson<{ simulatorActive?: boolean }>(simRes, {});
      if (simData.simulatorActive !== undefined) {
        setSimulatorActive(simData.simulatorActive);
      }
    } catch (err) {
      console.warn('History/Simulator status fetch notice:', err);
    }
  }, [user, selectedCustomerForAdmin]);

  // Re-fetch telemetry history when user or selected customer changes
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // WebSocket for Live Telemetry, Device Updates and Server Stats
  const connectRef = useRef<() => void>();

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: any = null;
    let pingTimer: any = null;
    let watchdogTimer: any = null;
    let countdownInterval: any = null;
    let isCleanedUp = false;
    let retryAttempt = 0;

    const scheduleReconnect = () => {
      if (isCleanedUp) return;
      retryAttempt++;
      setReconnectAttempt(retryAttempt);
      isConnectedRef.current = false;
      setIsConnected(false);
      setConnectionStatus('reconnecting');
      clearInterval(pingTimer);
      clearInterval(watchdogTimer);
      clearTimeout(reconnectTimer);
      if (countdownInterval) clearInterval(countdownInterval);

      // Exponential backoff: min 1.5s, max 15s
      const delaySec = Math.min(15, Math.max(1, Math.round(Math.pow(1.4, Math.min(retryAttempt, 8)))));
      setReconnectCountdown(delaySec);

      let remaining = delaySec;
      countdownInterval = setInterval(() => {
        remaining = Math.max(0, remaining - 1);
        setReconnectCountdown(remaining);
        if (remaining <= 0) {
          clearInterval(countdownInterval);
        }
      }, 1000);

      reconnectTimer = setTimeout(() => {
        if (!isCleanedUp) {
          connect();
        }
      }, delaySec * 1000);
    };

    const connect = () => {
      if (isCleanedUp) return;

      const storedToken = typeof window !== 'undefined'
        ? (sessionStorage.getItem('nexus_session_token') || localStorage.getItem('nexus_session_token'))
        : null;

      // Unauthenticated visitor guard: If not logged in and no session token, do not spam WebSocket 401 attempts
      if (!user && !storedToken) {
        setConnectionStatus('disconnected');
        isConnectedRef.current = false;
        setIsConnected(false);
        return;
      }

      // Close previous instance if exists
      if (ws) {
        try {
          ws.onopen = null;
          ws.onmessage = null;
          ws.onerror = null;
          ws.onclose = null;
          ws.close();
        } catch {
          // ignore
        }
      }

      setConnectionStatus('reconnecting');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      let wsUrl = `${protocol}//${window.location.host}/ws`;
      if (storedToken) {
        wsUrl += `?token=${encodeURIComponent(storedToken)}`;
      }

      try {
        const protocols = storedToken ? ['nexus-token', storedToken] : undefined;
        ws = protocols ? new WebSocket(wsUrl, protocols) : new WebSocket(wsUrl);
        socketRef.current = ws;

        let lastMessageReceivedAt = Date.now();

        ws.onopen = () => {
          if (isCleanedUp) return;
          isConnectedRef.current = true;
          setIsConnected(true);
          setConnectionStatus('connected');
          setReconnectAttempt(0);
          setReconnectCountdown(0);
          retryAttempt = 0;
          if (countdownInterval) clearInterval(countdownInterval);
          lastMessageReceivedAt = Date.now();

          // Send explicit in-band authentication frame for secondary confirmation
          if (storedToken) {
            try {
              ws?.send(JSON.stringify({ event: 'auth', token: storedToken }));
            } catch {}
          }

          // Resubscribe to all active channels (physical, simulation, etc.)
          const channelsToSub = Array.from(activeSubscriptionsRef.current);
          if (channelsToSub.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                event: 'subscribe',
                channels: channelsToSub,
              })
            );
          }

          // Periodic ping for latency calculation & connection keepalive
          if (pingTimer) clearInterval(pingTimer);
          pingTimer = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            }
          }, 5000);

          // Watchdog: If no message or pong received in 25 seconds, reconnect
          if (watchdogTimer) clearInterval(watchdogTimer);
          watchdogTimer = setInterval(() => {
            if (Date.now() - lastMessageReceivedAt > 25000) {
              console.warn('[WebSocket] Bağlantı zaman aşımına uğradı, yeniden bağlanılıyor...');
              if (ws) {
                try {
                  ws.close();
                } catch {}
              }
            }
          }, 10000);
        };

        ws.onmessage = (event) => {
          lastMessageReceivedAt = Date.now();
          try {
            const data = JSON.parse(event.data);

            if (data.event === 'pong') {
              if (data.timestamp) {
                setWsLatency(Math.max(1, Date.now() - Number(data.timestamp)));
              }
            } else if (
              data.event === 'auth:success' ||
              (data.event === 'system:connected' && data.payload?.authenticated)
            ) {
              isConnectedRef.current = true;
              setIsConnected(true);
              setConnectionStatus('connected');
              setReconnectAttempt(0);
              setReconnectCountdown(0);

              // Automatically resubscribe to all active channels upon auth confirmation
              if (ws && ws.readyState === WebSocket.OPEN) {
                const channelsToSub = Array.from(activeSubscriptionsRef.current);
                if (channelsToSub.length > 0) {
                  ws.send(
                    JSON.stringify({
                      event: 'subscribe',
                      channels: channelsToSub,
                    })
                  );
                }
              }
            } else if (data.event === 'auth:failed') {
              console.warn('[WebSocket] Kimlik doğrulama bildirimi:', data.error || 'Oturum doğrulanamadı.');
            } else if (
              data.event === 'telemetry:physical:new' ||
              data.event === 'telemetry:physical:batch' ||
              data.event === 'telemetry:new' ||
              data.event === 'telemetry:batch'
            ) {
              // 1. PHYSICAL TELEMETRY STREAM
              const rawPayload = data.payload;
              const readings: TelemetryReading[] = Array.isArray(rawPayload)
                ? rawPayload
                : rawPayload && typeof rawPayload === 'object' && (rawPayload as TelemetryReading).deviceId
                ? [rawPayload as TelemetryReading]
                : [];

              if (readings.length > 0) {
                const allowedReadings = readings.filter((reading) => {
                  if (!reading || !reading.deviceId) return false;
                  if (user?.role === 'admin' && selectedCustomerForAdmin === 'all') return true;
                  return devicesRef.current.some(
                    (d) => d.id === reading.deviceId || d.apiKey === reading.deviceId
                  );
                });

                if (allowedReadings.length > 0) {
                  // Collect metric updates for physical devices only
                  const deviceUpdatesMap = new Map<string, { lastSeen: string; metrics: Record<string, number> }>();
                  for (const reading of allowedReadings) {
                    if (!reading.metric || typeof reading.value !== 'number' || isNaN(reading.value)) {
                      continue;
                    }

                    const targetDev = devicesRef.current.find(
                      (d) => d.id === reading.deviceId || d.apiKey === reading.deviceId
                    );
                    const devId = targetDev ? targetDev.id : reading.deviceId;

                    const existing = deviceUpdatesMap.get(devId) || {
                      lastSeen: reading.timestamp || new Date().toISOString(),
                      metrics: {},
                    };
                    existing.lastSeen = reading.timestamp || new Date().toISOString();
                    existing.metrics[reading.metric] = reading.value;
                    existing.metrics[reading.metric.toLowerCase()] = reading.value;
                    deviceUpdatesMap.set(devId, existing);
                  }

                  // Batch update devices state once (immutable merge)
                  setRawDevices((prevDevs) => {
                    const updated = prevDevs.map((dev) => {
                      const update =
                        deviceUpdatesMap.get(dev.id) ||
                        (dev.apiKey ? deviceUpdatesMap.get(dev.apiKey) : undefined);
                      if (update) {
                        return {
                          ...dev,
                          lastSeen: dev.dataFlowActive !== false ? update.lastSeen : dev.lastSeen,
                          status: dev.dataFlowActive !== false ? 'online' : dev.status,
                          metrics: {
                            ...(dev.metrics || {}),
                            ...update.metrics,
                          },
                        };
                      }
                      return dev;
                    });
                    devicesRef.current = updated;
                    return updated;
                  });

                  // Update physical telemetry states (isolated from simulation)
                  setPhysicalTelemetry((prev) => {
                    const newIds = new Set(allowedReadings.map((r) => r.id));
                    const filteredPrev = prev.filter((item) => !newIds.has(item.id));
                    return [...allowedReadings, ...filteredPrev].slice(0, 500);
                  });
                  setLatestTelemetry((prev) => {
                    const newIds = new Set(allowedReadings.map((r) => r.id));
                    const filteredPrev = prev.filter((item) => !newIds.has(item.id));
                    return [...allowedReadings, ...filteredPrev].slice(0, 500);
                  });
                }
              }
            } else if (
              data.event === 'telemetry:simulation:new' ||
              data.event === 'telemetry:simulation:batch'
            ) {
              // 2. SIMULATION TELEMETRY STREAM
              const rawPayload = data.payload;
              const readings: TelemetryReading[] = Array.isArray(rawPayload)
                ? rawPayload
                : rawPayload && typeof rawPayload === 'object' && (rawPayload as TelemetryReading).deviceId
                ? [rawPayload as TelemetryReading]
                : [];

              if (readings.length > 0) {
                const allowedReadings = readings.filter((reading) => {
                  if (!reading || !reading.deviceId) return false;
                  if (user?.role === 'admin' && selectedCustomerForAdmin === 'all') return true;
                  return devicesRef.current.some(
                    (d) => d.id === reading.deviceId || d.apiKey === reading.deviceId
                  );
                });

                if (allowedReadings.length > 0) {
                  // Update simulated devices metrics only (NEVER touch physical devices)
                  const simUpdatesMap = new Map<string, { lastSeen: string; metrics: Record<string, number> }>();
                  for (const reading of allowedReadings) {
                    if (!reading.metric || typeof reading.value !== 'number' || isNaN(reading.value)) {
                      continue;
                    }
                    const targetDev = devicesRef.current.find(
                      (d) => (d.id === reading.deviceId || d.apiKey === reading.deviceId)
                    );
                    const devId = targetDev ? targetDev.id : reading.deviceId;

                    const existing = simUpdatesMap.get(devId) || {
                      lastSeen: reading.timestamp || new Date().toISOString(),
                      metrics: {},
                    };
                    existing.lastSeen = reading.timestamp || new Date().toISOString();
                    existing.metrics[reading.metric] = reading.value;
                    existing.metrics[reading.metric.toLowerCase()] = reading.value;
                    simUpdatesMap.set(devId, existing);
                  }

                  if (simUpdatesMap.size > 0) {
                    setRawDevices((prevDevs) => {
                      const updated = prevDevs.map((dev) => {
                        if (!dev.isSimulated) return dev; // Never touch physical hardware
                        const update = simUpdatesMap.get(dev.id) || (dev.apiKey ? simUpdatesMap.get(dev.apiKey) : undefined);
                        if (update) {
                          return {
                            ...dev,
                            lastSeen: dev.dataFlowActive !== false ? update.lastSeen : dev.lastSeen,
                            status: dev.dataFlowActive !== false ? 'online' : dev.status,
                            metrics: {
                              ...(dev.metrics || {}),
                              ...update.metrics,
                            },
                          };
                        }
                        return dev;
                      });
                      devicesRef.current = updated;
                      return updated;
                    });
                  }

                  // Update simulation telemetry state
                  setSimulationTelemetry((prev) => {
                    const newIds = new Set(allowedReadings.map((r) => r.id));
                    const filteredPrev = prev.filter((item) => !newIds.has(item.id));
                    return [...allowedReadings, ...filteredPrev].slice(0, 500);
                  });

                  // Update latestTelemetry state so all dashboard widgets (charts, gauges, metrics, analyzers) update live
                  setLatestTelemetry((prev) => {
                    const newIds = new Set(allowedReadings.map((r) => r.id));
                    const filteredPrev = prev.filter((item) => !newIds.has(item.id));
                    return [...allowedReadings, ...filteredPrev].slice(0, 500);
                  });
                }
              }
            } else if (data.event === 'telemetry:bootstrap') {
              // Initial bootstrap hydration for physical telemetry without triggering false real-time alert/stream spikes
              const rawPayload = data.payload;
              const readings: TelemetryReading[] = Array.isArray(rawPayload) ? rawPayload : [];
              if (readings.length > 0) {
                setPhysicalTelemetry((prev) => {
                  const existingIds = new Set(prev.map((p) => p.id));
                  const newItems = readings.filter((r) => !existingIds.has(r.id));
                  const merged = [...prev, ...newItems];
                  merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                  return merged.slice(0, 500);
                });
                setLatestTelemetry((prev) => {
                  const existingIds = new Set(prev.map((p) => p.id));
                  const newItems = readings.filter((r) => !existingIds.has(r.id));
                  const merged = [...prev, ...newItems];
                  merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                  return merged.slice(0, 500);
                });
              }
            } else if (data.event === 'telemetry:simulation:bootstrap') {
              const rawPayload = data.payload;
              const readings: TelemetryReading[] = Array.isArray(rawPayload) ? rawPayload : [];
              if (readings.length > 0) {
                setSimulationTelemetry((prev) => {
                  const existingIds = new Set(prev.map((p) => p.id));
                  const newItems = readings.filter((r) => !existingIds.has(r.id));
                  const merged = [...prev, ...newItems];
                  merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                  return merged.slice(0, 500);
                });
                setLatestTelemetry((prev) => {
                  const existingIds = new Set(prev.map((p) => p.id));
                  const newItems = readings.filter((r) => !existingIds.has(r.id));
                  const merged = [...prev, ...newItems];
                  merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                  return merged.slice(0, 500);
                });
              }
            } else if (data.event === 'system:connected') {
              setIsConnected(true);
              setConnectionStatus('connected');
              const simActive = data.payload?.simulatorActive !== undefined
                ? data.payload.simulatorActive
                : data.payload?.active;
              if (simActive !== undefined) {
                setSimulatorActive(Boolean(simActive));
              }
              if (data.payload?.systemSettings && typeof data.payload.systemSettings === 'object') {
                setSystemSettings((prev) => ({ ...prev, ...data.payload.systemSettings }));
              }
              if (data.payload?.firestoreQuotaExceeded) {
                handleQuotaExceeded();
              }
            } else if (data.event === 'system:settings:bootstrap') {
              if (data.payload && typeof data.payload === 'object') {
                setSystemSettings((prev) => ({ ...prev, ...data.payload }));
                const simActive = data.payload.simulator_config?.simulatorActive ?? data.payload.simulator_config?.active;
                if (simActive !== undefined) {
                  setSimulatorActive(Boolean(simActive));
                }
              }
            } else if (data.event === 'simulator:updated') {
              const simActive = data.payload?.simulatorActive !== undefined
                ? data.payload.simulatorActive
                : data.payload?.active;
              if (simActive !== undefined) {
                setSimulatorActive(Boolean(simActive));
              }
              window.dispatchEvent(new CustomEvent('nexus:simulator:updated', { detail: data.payload }));
            } else if (data.event === 'system:settings:updated') {
              if (data.payload && data.payload.key) {
                const { key, value, updatedAt } = data.payload;
                setSystemSettings((prev) => {
                  const existing = prev[key];
                  if (existing && typeof existing === 'object' && existing.updatedAt && updatedAt) {
                    if (new Date(updatedAt).getTime() < new Date(existing.updatedAt).getTime()) {
                      return prev; // LWW reject stale
                    }
                  }
                  return {
                    ...prev,
                    [key]: value,
                  };
                });
                if (key === 'simulator_config') {
                  const simActive = value?.simulatorActive ?? value?.active;
                  if (simActive !== undefined) {
                    setSimulatorActive(Boolean(simActive));
                  }
                }
              }
              window.dispatchEvent(new CustomEvent('nexus:system:settings:updated', { detail: data.payload }));
            } else if (data.event === 'user:preferences:updated') {
              window.dispatchEvent(new CustomEvent('nexus:user:preferences:updated', { detail: data.payload }));
            } else if (data.event === 'device:updated') {
              if (data.payload && data.payload.id) {
                setRawDevices((prev) =>
                  prev.map((d) => (d.id === data.payload.id ? { ...d, ...data.payload } : d))
                );
              } else {
                fetchDevices();
              }
            } else if (data.event === 'device:control') {
              if (data.payload && data.payload.deviceId) {
                const { deviceId, pinOrMetric, value } = data.payload;
                setRawDevices((prev) =>
                  prev.map((d) => {
                    if (d.id === deviceId) {
                      return {
                        ...d,
                        metrics: {
                          ...(d.metrics || {}),
                          [pinOrMetric]: value,
                        },
                      };
                    }
                    return d;
                  })
                );
              }
            } else if (data.event === 'device:created') {
              if (data.payload && data.payload.id) {
                const dev = data.payload as Device;
                setRawDevices((prev) => {
                  if (prev.some((d) => d.id === dev.id)) {
                    return prev.map((d) => (d.id === dev.id ? { ...d, ...dev } : d));
                  }
                  return [dev, ...prev];
                });
              } else {
                fetchDevices();
              }
            } else if (data.event === 'device:deleted') {
              const delId = data.payload?.id || data.payload;
              if (delId) {
                setRawDevices((prev) => prev.filter((d) => d.id !== delId));
              } else {
                fetchDevices();
              }
            } else if (data.event === 'devices:updated') {
              if (Array.isArray(data.payload)) {
                setRawDevices(data.payload as Device[]);
              } else {
                fetchDevices();
              }
            } else if (data.event === 'notifications:updated' || data.event === 'notification:new') {
              if (data.event === 'notification:new' && data.payload && typeof data.payload === 'object' && (data.payload as any).id) {
                const item = data.payload as NotificationItem;
                setRawNotifications((prev) => {
                  const idx = prev.findIndex((n) => n.id === item.id);
                  if (idx >= 0) {
                    const updated = [...prev];
                    updated[idx] = item;
                    return updated;
                  }
                  return [item, ...prev].slice(0, 500);
                });
              }
              fetchNotifications();
            } else if (data.event === 'dashboard:layout') {
              if (data.payload && Array.isArray(data.payload.widgets) && data.payload.widgets.length > 0) {
                const currentSelectedCust = selectedCustomerForAdminRef.current;
                const currentTarget =
                  user?.role === 'admin' && currentSelectedCust !== 'all'
                    ? currentSelectedCust
                    : user?.id || 'usr_admin';
                const payloadTenantId = data.payload.tenantId;
                const payloadId = data.payload.id;

                // Strict isolation: only apply layout to this client if it directly targets the currently viewed user/dashboard
                const isExactTarget = (payloadTenantId && payloadTenantId === currentTarget) || payloadId === `dash_${currentTarget}`;
                const isAdminDefaultMatch = user?.role === 'admin' && currentTarget === 'usr_admin' && (payloadId === 'dash_usr_admin' || payloadTenantId === 'usr_admin');

                if (isExactTarget || isAdminDefaultMatch) {
                  const sanitized = validateAndSanitizeWidgets(data.payload.widgets);
                  setWidgets(sanitized);
                  if (data.payload.title) setDashboardTitle(data.payload.title);
                }
              }
            } else if (data.event === 'users:updated') {
              if (Array.isArray(data.payload)) {
                setCustomersList(data.payload);
              } else {
                refreshCustomers();
              }
            } else if (data.event === 'user:deleted') {
              const deletedId = data.payload?.id;
              if (deletedId && selectedCustomerForAdminRef.current === deletedId) {
                setSelectedCustomerForAdmin('all');
              }
              refreshCustomers();
              fetchDevices();
            } else if (
              data.event === 'command:ack' ||
              data.event === 'command:ack_confirmed' ||
              data.event === 'command:executed' ||
              data.event === 'command:acknowledged' ||
              data.event === 'command:status' ||
              data.event === 'command:failed' ||
              data.event === 'device:command:status'
            ) {
              const payload = data.payload || {};
              const cmdId = payload.commandId || payload.id || payload.forMessageId;
              const devId = payload.deviceId;
              const pin = payload.outputPin || payload.pin || payload.command;
              const isFailed =
                data.event === 'command:failed' ||
                payload.status === 'failed' ||
                payload.status === 'rejected' ||
                payload.status === 'timeout';
              const newStatus: 'applied' | 'failed' = isFailed ? 'failed' : 'applied';

              setPendingCommands((prev: Record<string, PendingCommandInfo>) => {
                let changed = false;
                const updated: Record<string, PendingCommandInfo> = { ...prev };
                for (const [key, item] of Object.entries(prev) as [string, PendingCommandInfo][]) {
                  if (
                    (cmdId && item.commandId === cmdId) ||
                    (devId && item.deviceId === devId && (!pin || item.outputPin === pin || item.command === pin))
                  ) {
                    changed = true;
                    updated[key] = {
                      ...item,
                      status: newStatus,
                      error: isFailed ? (payload.error || 'Komut cihaz tarafından reddedildi') : undefined,
                    };
                    setTimeout(() => {
                      setPendingCommands((p) => {
                        const copy = { ...p };
                        delete copy[key];
                        return copy;
                      });
                    }, 3000);
                  }
                }
                return changed ? updated : prev;
              });
            }

            // Dispatch to any dynamically subscribed event listeners
            if (data && data.event) {
              const listeners = wsEventListeners.current.get(data.event);
              if (listeners && listeners.size > 0) {
                listeners.forEach((cb) => {
                  try {
                    cb(data.payload);
                  } catch (err) {
                    console.error('Error in WS subscriber callback:', err);
                  }
                });
              }
            }
          } catch (err) {
            console.error('WebSocket message parsing error:', err);
          }
        };

        ws.onclose = () => {
          if (isCleanedUp) return;
          scheduleReconnect();
        };

        ws.onerror = () => {
          if (isCleanedUp) return;
          scheduleReconnect();
        };
      } catch (err) {
        console.error('[WebSocket] Connection initialization error:', err);
        if (!isCleanedUp) {
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connect, 3000);
        }
      }
    };

    connectRef.current = connect;
    connect();

    // Listen for online/focus events to immediately reconnect if idle or dropped
    const handleOnline = () => {
      console.log('[WebSocket] Ağ yeniden çevrimiçi, bağlanılıyor...');
      connect();
    };

    window.addEventListener('online', handleOnline);

    // Fallback polling: When WebSocket is disconnected, poll REST API every 20 seconds
    const fallbackPollInterval = setInterval(() => {
      if (!isCleanedUp && !isConnectedRef.current && user) {
        fetchDevices();
        fetchHistory();
      }
    }, 20000);

    return () => {
      isCleanedUp = true;
      window.removeEventListener('online', handleOnline);
      clearInterval(fallbackPollInterval);
      clearTimeout(reconnectTimer);
      clearInterval(pingTimer);
      clearInterval(watchdogTimer);
      if (ws) {
        try {
          ws.onopen = null;
          ws.onmessage = null;
          ws.onerror = null;
          ws.onclose = null;
          ws.close();
        } catch {
          // ignore
        }
      }
    };
  }, [user?.id, user?.role]);

  // Firestore listener & fetcher for Dashboard Widgets & Settings
  useEffect(() => {
    if (!user) return;

    const targetUserId =
      user.role === 'admin' && selectedCustomerForAdmin !== 'all'
        ? selectedCustomerForAdmin
        : user.id || 'usr_admin';

    // 1. Initial REST fetch to trigger backend seeding if first time
    fetch(`/api/dashboard/widgets?userId=${encodeURIComponent(targetUserId)}`)
      .then((res) => safeJson<DashboardLayout | null>(res, null))
      .then((data: DashboardLayout | null) => {
        if (data && Array.isArray(data.widgets) && data.widgets.length > 0) {
          const validated = validateAndSanitizeWidgets(data.widgets);
          setWidgets(validated);
          if (data.title) setDashboardTitle(data.title);
        } else if (data && (!data.widgets || data.widgets.length === 0)) {
          // If the backend returned an empty dashboard layout, trigger reset to default layout
          fetch('/api/dashboard/widgets/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: targetUserId }),
          })
            .then((r) => safeJson<DashboardLayout | null>(r, null))
            .then((seeded) => {
              if (seeded && Array.isArray(seeded.widgets) && seeded.widgets.length > 0) {
                setWidgets(validateAndSanitizeWidgets(seeded.widgets));
                if (seeded.title) setDashboardTitle(seeded.title);
              }
            })
            .catch(() => {});
        }
      })
      .catch((err) => {
        console.warn('Dashboard widgets fetch deferred:', err);
      });
  }, [user, selectedCustomerForAdmin]);

  // Action methods
  const markNotificationRead = useCallback(async (id: string) => {
    setRawNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'PUT' });
    } catch (e) {
      console.error('markNotificationRead error:', e);
    }
  }, []);

  const clearAllNotifications = useCallback(async () => {
    setRawNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await fetch('/api/notifications/clear', { method: 'POST' });
    } catch (e) {
      console.error('clearAllNotifications error:', e);
    }
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    let deletedItem: NotificationItem | undefined;
    setRawNotifications((prev) => {
      deletedItem = prev.find((n) => n.id === id);
      return prev.filter((n) => n.id !== id);
    });
    try {
      const res = await fetch(`/api/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        if (deletedItem) {
          const itemToRestore = deletedItem;
          setRawNotifications((prev) => (prev.some((n) => n.id === id) ? prev : [itemToRestore, ...prev]));
        }
        const data = await safeJson<{ error?: string }>(res, {});
        throw new Error(data.error || `Bildirim silinemedi (${res.status})`);
      }
    } catch (e) {
      console.error('deleteNotification error:', e);
      throw e;
    }
  }, []);

  const deleteAllNotifications = useCallback(async () => {
    let previousList: NotificationItem[] = [];
    setRawNotifications((prev) => {
      previousList = prev;
      return [];
    });
    try {
      const res = await fetch('/api/notifications/delete-all', { method: 'POST' });
      if (!res.ok) {
        setRawNotifications(previousList);
        const data = await safeJson<{ error?: string }>(res, {});
        throw new Error(data.error || `Bildirimler silinemedi (${res.status})`);
      }
    } catch (e) {
      console.error('deleteAllNotifications error:', e);
      throw e;
    }
  }, []);

  const saveWidgets = useCallback(async (newWidgets: WidgetConfig[], title?: string) => {
    const validated = validateAndSanitizeWidgets(newWidgets);
    setWidgets(validated);
    if (title) setDashboardTitle(title);

    const targetUserId =
      user?.role === 'admin' && selectedCustomerForAdmin !== 'all'
        ? selectedCustomerForAdmin
        : user?.id || 'usr_admin';

    const newTitle = title || dashboardTitle;

    try {
      await fetch('/api/dashboard/widgets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: targetUserId,
          widgets: validated,
          title: newTitle,
        }),
      });
    } catch (e) {
      console.error('saveWidgets error:', e);
    }
  }, [user, selectedCustomerForAdmin, dashboardTitle]);

  const resetWidgetsToDefault = useCallback(async () => {
    const targetUserId =
      user?.role === 'admin' && selectedCustomerForAdmin !== 'all'
        ? selectedCustomerForAdmin
        : user?.id || 'usr_admin';

    try {
      const res = await fetch('/api/dashboard/widgets/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUserId }),
      });
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data: DashboardLayout = await res.json();
        setWidgets(data.widgets);
        setDashboardTitle(data.title);
      }
    } catch (e) {
      console.error('resetWidgetsToDefault error:', e);
    }
  }, [user, selectedCustomerForAdmin]);

  const toggleSimulator = useCallback(async () => {
    try {
      const res = await fetch('/api/simulator/toggle', { method: 'POST' });
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const json = await res.json();
        const active = json.simulatorActive !== undefined ? json.simulatorActive : (json.data && json.data.simulatorActive);
        if (typeof active === 'boolean') {
          setSimulatorActive(active);
        } else {
          setSimulatorActive((prev) => !prev);
        }
      } else if (res.ok) {
        setSimulatorActive((prev) => !prev);
      }
    } catch (e) {
      console.error('toggleSimulator error:', e);
    }
  }, []);

  const fetchSystemSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/system/settings');
      if (res.ok) {
        const data = await safeJson<{ settings?: Record<string, any> }>(res, {});
        if (data && data.settings) {
          setSystemSettings(data.settings);
          try {
            Object.entries(data.settings).forEach(([k, v]) => {
              localStorage.setItem(`sys_setting_${k}`, JSON.stringify(v));
            });
          } catch {}
          const simActive = data.settings.simulator_config?.simulatorActive ?? data.settings.simulator_config?.active;
          if (simActive !== undefined) {
            setSimulatorActive(Boolean(simActive));
          }
        }
      }
    } catch (e) {
      // quiet fallback
    }
  }, []);

  useEffect(() => {
    fetchSystemSettings();
  }, [fetchSystemSettings, user]);

  const getSystemSetting = useCallback(
    <T,>(key: string, defaultValue?: T): T => {
      const val = systemSettings[key];
      if (val !== undefined && val !== null) {
        return val as T;
      }
      try {
        const local = localStorage.getItem(`sys_setting_${key}`);
        if (local !== null) {
          return JSON.parse(local) as T;
        }
      } catch {}
      return defaultValue as T;
    },
    [systemSettings]
  );

  const updateSystemSetting = useCallback(
    async (key: string, value: any): Promise<boolean> => {
      const now = new Date().toISOString();
      const valWithTimestamp = typeof value === 'object' && value !== null
        ? { ...value, updatedAt: value.updatedAt || now }
        : value;

      // Optimistic update
      setSystemSettings((prev) => ({
        ...prev,
        [key]: valWithTimestamp,
      }));

      try {
        const res = await fetch(`/api/system/settings/${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: valWithTimestamp, updatedAt: now }),
        });
        if (res.ok) {
          return true;
        }
        // Conflict or error, re-fetch authoritative
        fetchSystemSettings();
        return false;
      } catch {
        fetchSystemSettings();
        return false;
      }
    },
    [fetchSystemSettings]
  );

  const subscribeChannel = useCallback((channel: 'physical' | 'simulation') => {
    activeSubscriptionsRef.current.add(channel);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          event: 'subscribe',
          channels: [channel],
        })
      );
    }
  }, []);

  const unsubscribeChannel = useCallback((channel: 'physical' | 'simulation') => {
    activeSubscriptionsRef.current.delete(channel);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          event: 'unsubscribe',
          channels: [channel],
        })
      );
    }
  }, []);

  const triggerTestTelemetry = useCallback(async (deviceId: string, metric: string, value: number, unit?: string) => {
    const dev = devices.find((d) => d.id === deviceId);
    if (!dev) return;

    if (!dev.isSimulated) {
      console.warn('triggerTestTelemetry: Manuel test verisi yalnızca sanal cihazlara gönderilebilir.');
      return;
    }

    try {
      await fetch('/api/simulator/v1/inject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceId: dev.id,
          metric,
          value,
          unit,
        }),
      });
    } catch (e) {
      console.error('triggerTestTelemetry hatası:', e);
    }
  }, [devices]);

  const createNewDevice = useCallback(async (data: Partial<Device>): Promise<Device> => {
    const explicitOwner = data.tenantId || (data as any).userId;
    const targetOwner =
      user?.role === 'admin'
        ? (explicitOwner || (selectedCustomerForAdmin !== 'all' ? selectedCustomerForAdmin : user?.id || 'usr_admin'))
        : user?.id || 'usr_admin';

    const payload = {
      userId: targetOwner,
      tenantId: targetOwner,
      name: data.name,
      type: data.type || 'sensor',
      location: data.location || 'Tanımsız Konum',
      ipAddress: data.ipAddress || '127.0.0.1',
      macAddress: data.macAddress,
      rateLimitPerMin: data.rateLimitPerMin || 120,
      encryptionMethod: data.encryptionMethod || 'AES-256-GCM',
      apiKey: data.apiKey,
      heartbeatTimeoutSeconds: data.heartbeatTimeoutSeconds,
      saveSimulatedDataToDb: data.saveSimulatedDataToDb,
      simulatedMetrics: data.simulatedMetrics,
      isSimulated: data.isSimulated ?? false,
    };

    try {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Cihaz oluşturulamadı');
      }

      const created: Device = await res.json();
      setRawDevices((prev) => {
        const exists = prev.some((d) => d.id === created.id);
        return exists ? prev.map((d) => (d.id === created.id ? created : d)) : [...prev, created];
      });
      await fetchDevices();
      return created;
    } catch (e: any) {
      console.error('createNewDevice error:', e);
      throw new Error(e.message || 'Cihaz oluşturulamadı', { cause: e });
    }
  }, [user, selectedCustomerForAdmin, fetchDevices]);

  const updateDevice = useCallback(async (id: string, updates: Partial<Device>): Promise<Device> => {
    const dev = rawDevices.find((d) => d.id === id);
    if (!dev) throw new Error('Cihaz bulunamadı');
    if (user?.role !== 'admin' && dev.tenantId !== user?.id) {
      throw new Error('Bu cihazı değiştirme yetkiniz yoktur');
    }
    try {
      const res = await fetch(`/api/devices/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Cihaz güncellenemedi');
      }
      const updated: Device = await res.json();
      setRawDevices((prev) => prev.map((d) => (d.id === id ? { ...d, ...updated } : d)));
      fetchDevices().catch(() => {});
      return updated;
    } catch (e: any) {
      console.error('updateDevice error:', e);
      throw new Error(e.message || 'Cihaz güncellenemedi', { cause: e });
    }
  }, [rawDevices, user, fetchDevices]);

  const deleteDevice = useCallback(async (id: string) => {
    const dev = rawDevices.find((d) => d.id === id);
    if (!dev) return;
    if (user?.role !== 'admin' && dev.tenantId !== user?.id) {
      console.error('Yetkisiz silme işlemi yapıldı');
      return;
    }
    try {
      await fetch(`/api/devices/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setRawDevices((prev) => prev.filter((d) => d.id !== id));
    } catch (e) {
      console.error('deleteDevice error:', e);
    }
  }, [rawDevices, user]);

  const bulkDeleteDevices = useCallback(async (ids: string[]): Promise<number> => {
    if (!ids || ids.length === 0) return 0;
    try {
      const res = await fetch('/api/devices/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceIds: ids }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Toplu cihaz silme başarısız oldu');
      }
      const data = await res.json();
      const idSet = new Set(ids);
      setRawDevices((prev) => prev.filter((d) => !idSet.has(d.id)));
      return data.count || ids.length;
    } catch (e: any) {
      console.error('bulkDeleteDevices error:', e);
      throw new Error(e.message || 'Toplu cihaz silme başarısız', { cause: e });
    }
  }, []);

  const regenerateApiKey = useCallback(async (id: string): Promise<string> => {
    const dev = rawDevices.find((d) => d.id === id);
    if (!dev) throw new Error('Cihaz bulunamadı');
    if (user?.role !== 'admin' && dev.tenantId !== user?.id) {
      throw new Error('Yetkisiz işlem');
    }
    try {
      const res = await fetch(`/api/devices/${encodeURIComponent(id)}/regen-key`, { method: 'POST' });
      if (!res.ok) throw new Error('Anahtar yenilenemedi');
      const data = await res.json();
      const newKey = data.apiKey;
      setRawDevices((prev) => prev.map((d) => (d.id === id ? { ...d, apiKey: newKey } : d)));
      return newKey;
    } catch (e: any) {
      console.error('regenerateApiKey error:', e);
      throw new Error(e.message || 'Anahtar yenilenemedi', { cause: e });
    }
  }, [rawDevices, user]);

  const convertToPhysicalDevice = useCallback(async (id: string): Promise<{ device: Device; apiKey: string }> => {
    const dev = rawDevices.find((d) => d.id === id);
    if (!dev) throw new Error('Cihaz bulunamadı');
    if (user?.role !== 'admin') {
      throw new Error('Sanal cihazı gerçek donanıma dönüştürme yetkisi yalnızca yöneticilere (Admin) aittir.');
    }
    try {
      const res = await fetch(`/api/devices/${encodeURIComponent(id)}/convert-to-physical`, { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Dönüştürme işlemi başarısız oldu');
      }
      const data = await res.json();
      const updatedDev: Device = data.device;
      setRawDevices((prev) => prev.map((d) => (d.id === id ? { ...d, ...updatedDev } : d)));
      return { device: updatedDev, apiKey: data.apiKey };
    } catch (e: any) {
      console.error('convertToPhysicalDevice error:', e);
      throw new Error(e.message || 'Cihaz dönüştürülemedi', { cause: e });
    }
  }, [rawDevices, user]);

  const sendControlCommand = useCallback(
    async (deviceId: string, command: string, value?: any, outputPin?: string, unit?: string) => {
      const trackingKey = `${deviceId}_${outputPin || command}`;
      const timestamp = Date.now();

      // Optimistic pending registration
      setPendingCommands((prev) => ({
        ...prev,
        [trackingKey]: {
          deviceId,
          command,
          value,
          outputPin,
          status: 'pending',
          timestamp,
        },
      }));

      // 6-second timeout watchdog
      setTimeout(() => {
        setPendingCommands((prev) => {
          const item = prev[trackingKey];
          if (item && item.timestamp === timestamp && item.status === 'pending') {
            const timedOut = {
              ...item,
              status: 'timeout' as const,
              error: 'Cihaz yanıt vermedi (Zaman aşımı - 6s)',
            };
            setTimeout(() => {
              setPendingCommands((p) => {
                const copy = { ...p };
                if (copy[trackingKey]?.timestamp === timestamp) {
                  delete copy[trackingKey];
                }
                return copy;
              });
            }, 3000);
            return { ...prev, [trackingKey]: timedOut };
          }
          return prev;
        });
      }, 6000);

      try {
        const res = await fetch(`/api/devices/${encodeURIComponent(deviceId)}/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, value, outputPin, unit }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.error || 'Sinyal gönderilemedi';
          setPendingCommands((prev) => ({
            ...prev,
            [trackingKey]: {
              deviceId,
              command,
              value,
              outputPin,
              status: 'failed',
              timestamp,
              error: errMsg,
            },
          }));
          setTimeout(() => {
            setPendingCommands((p) => {
              const copy = { ...p };
              if (copy[trackingKey]?.timestamp === timestamp) {
                delete copy[trackingKey];
              }
              return copy;
            });
          }, 3000);
          throw new Error(errMsg);
        }

        const data = await res.json();
        const cmdId = data.command?.id || data.id;

        // Update tracking with backend commandId
        setPendingCommands((prev) => {
          const current = prev[trackingKey];
          if (current && current.timestamp === timestamp) {
            return {
              ...prev,
              [trackingKey]: {
                ...current,
                commandId: cmdId,
                status: data.command?.status === 'executed' ? 'applied' : current.status,
              },
            };
          }
          return prev;
        });

        return data;
      } catch (e: any) {
        console.error('sendControlCommand error:', e);
        throw e;
      }
    },
    []
  );

  const reconnectWebSocket = useCallback(() => {
    setConnectionStatus('reconnecting');
    setReconnectAttempt(0);
    setReconnectCountdown(0);
    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch (e) {
        // ignore
      }
    }
    if (connectRef.current) {
      connectRef.current();
    }
  }, []);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const contextValue = useMemo(
    () => ({
      isConnected,
      connectionStatus,
      reconnectAttempt,
      reconnectCountdown,
      reconnectWebSocket,
      wsLatency,
      devices,
      rawDevices,
      latestTelemetry,
      physicalTelemetry,
      simulationTelemetry,
      subscribeChannel,
      unsubscribeChannel,
      notifications,
      unreadCount,
      widgets,
      dashboardTitle,
      serverStats,
      simulatorActive,
      selectedCustomerForAdmin,
      setSelectedCustomerForAdmin,
      customersList,
      refreshCustomers,
      createNewCustomer,
      deleteCustomer,
      refreshDevices,
      markNotificationRead,
      clearAllNotifications,
      deleteNotification,
      deleteAllNotifications,
      saveWidgets,
      resetWidgetsToDefault,
      toggleSimulator,
      systemSettings,
      getSystemSetting,
      updateSystemSetting,
      triggerTestTelemetry,
      createNewDevice,
      updateDevice,
      deleteDevice,
      bulkDeleteDevices,
      regenerateApiKey,
      convertToPhysicalDevice,
      sendControlCommand,
      pendingCommands,
      getPendingCommand,
      subscribeWsEvent,
    }),
    [
      isConnected,
      connectionStatus,
      reconnectAttempt,
      reconnectCountdown,
      reconnectWebSocket,
      wsLatency,
      devices,
      rawDevices,
      latestTelemetry,
      physicalTelemetry,
      simulationTelemetry,
      subscribeChannel,
      unsubscribeChannel,
      notifications,
      unreadCount,
      widgets,
      dashboardTitle,
      serverStats,
      simulatorActive,
      systemSettings,
      getSystemSetting,
      updateSystemSetting,
      selectedCustomerForAdmin,
      setSelectedCustomerForAdmin,
      customersList,
      refreshCustomers,
      createNewCustomer,
      deleteCustomer,
      refreshDevices,
      markNotificationRead,
      clearAllNotifications,
      deleteNotification,
      deleteAllNotifications,
      saveWidgets,
      resetWidgetsToDefault,
      toggleSimulator,
      triggerTestTelemetry,
      createNewDevice,
      updateDevice,
      deleteDevice,
      bulkDeleteDevices,
      regenerateApiKey,
      convertToPhysicalDevice,
      sendControlCommand,
      pendingCommands,
      getPendingCommand,
      subscribeWsEvent,
    ]
  );

  return (
    <RealtimeContext.Provider value={contextValue}>
      {children}
    </RealtimeContext.Provider>
  );
};

export const useRealtime = () => {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
};
