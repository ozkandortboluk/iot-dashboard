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

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

interface RealtimeContextType {
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  reconnectWebSocket: () => void;
  wsLatency: number;
  devices: Device[];
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
  selectedCustomerForAdmin: string; // 'all' or customer ID
  setSelectedCustomerForAdmin: (customerId: string) => void;
  customersList: User[];
  refreshCustomers: () => Promise<void>;
  createNewCustomer: (data: { name: string; email: string; password: string; companyName?: string; role?: User['role'] }) => Promise<User>;
  deleteCustomer: (id: string) => Promise<void>;
  refreshDevices: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  saveWidgets: (newWidgets: WidgetConfig[], title?: string) => Promise<void>;
  resetWidgetsToDefault: () => Promise<void>;
  toggleSimulator: () => Promise<void>;
  triggerTestTelemetry: (deviceId: string, metric: string, value: number, unit?: string) => Promise<void>;
  createNewDevice: (data: Partial<Device>) => Promise<Device>;
  updateDevice: (id: string, updates: Partial<Device>) => Promise<Device>;
  deleteDevice: (id: string) => Promise<void>;
  regenerateApiKey: (id: string) => Promise<string>;
  convertToPhysicalDevice: (id: string) => Promise<{ device: Device; apiKey: string }>;
  sendControlCommand: (
    deviceId: string,
    command: string,
    value?: any,
    outputPin?: string,
    unit?: string
  ) => Promise<any>;
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
  const [selectedCustomerForAdmin, setSelectedCustomerForAdmin] = useState<string>('all');
  const [customersList, setCustomersList] = useState<User[]>([]);

  const selectedCustomerForAdminRef = useRef(selectedCustomerForAdmin);
  useEffect(() => {
    selectedCustomerForAdminRef.current = selectedCustomerForAdmin;
  }, [selectedCustomerForAdmin]);

  // Synchronous, flicker-free derived devices list based on active customer filter
  const devices = useMemo(() => {
    if (!user) return [];
    if (user.role === 'admin') {
      if (!selectedCustomerForAdmin || selectedCustomerForAdmin === 'all') return rawDevices;
      return rawDevices.filter((d) => d.tenantId === selectedCustomerForAdmin);
    }
    return rawDevices.filter((d) => d.tenantId === user.id);
  }, [rawDevices, user, selectedCustomerForAdmin]);

  // Synchronous, flicker-free derived notifications list based on active customer filter
  const notifications = useMemo(() => {
    if (!user) return [];
    if (user.role === 'admin') {
      if (!selectedCustomerForAdmin || selectedCustomerForAdmin === 'all') return rawNotifications;
      return rawNotifications.filter((n) => !n.tenantId || n.tenantId === selectedCustomerForAdmin);
    }
    return rawNotifications.filter((n) => !n.tenantId || n.tenantId === user.id);
  }, [rawNotifications, user, selectedCustomerForAdmin]);

  const socketRef = useRef<WebSocket | null>(null);

  // Customers List (for Admin)
  const refreshCustomers = useCallback(async () => {
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
  }, []);

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
      if (errRes.details) {
        throw new Error(errRes.details.map((d: any) => d.message).join(", "));
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

    refreshCustomers(); 
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

  // WebSocket for Live Telemetry, Device Updates and Server Stats
  const connectRef = useRef<() => void>();

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: any = null;
    let pingTimer: any = null;
    let watchdogTimer: any = null;
    let isCleanedUp = false;

    // Fetch initial telemetry history & simulator status
    const fetchHistory = async () => {
      if (!user) return;
      try {
        const queryUser = user.id;
        const targetCust = user.role === 'admin' ? selectedCustomerForAdmin : undefined;
        let url = `/api/telemetry/history?limit=100&userId=${encodeURIComponent(queryUser)}`;
        if (targetCust) {
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

          if (physicalHistory.length > 0) {
            setPhysicalTelemetry((prev) => {
              const merged = [...prev, ...physicalHistory];
              const unique = Array.from(
                new Map(merged.map((item) => [item.id, item])).values()
              );
              return unique
                .sort(
                  (a, b) =>
                    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                )
                .slice(0, 500);
            });
          }

          if (simHistory.length > 0) {
            setSimulationTelemetry((prev) => {
              const merged = [...prev, ...simHistory];
              const unique = Array.from(
                new Map(merged.map((item) => [item.id, item])).values()
              );
              return unique
                .sort(
                  (a, b) =>
                    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                )
                .slice(0, 500);
            });
          }

          if (uniqueHistory.length > 0) {
            setLatestTelemetry((prev) => {
              const merged = [...prev, ...uniqueHistory];
              const unique = Array.from(
                new Map(merged.map((item) => [item.id, item])).values()
              );
              return unique
                .sort(
                  (a, b) =>
                    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                )
                .slice(0, 500);
            });
          }
        }

        const simRes = await fetch('/api/simulator/status');
        const simData = await safeJson<{ simulatorActive?: boolean }>(simRes, {});
        if (simData.simulatorActive !== undefined) {
          setSimulatorActive(simData.simulatorActive);
        }
      } catch (err) {
        console.warn('History/Simulator status fetch notice:', err);
      }
    };
    fetchHistory();

    const connect = () => {
      if (isCleanedUp) return;

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
      const token = localStorage.getItem('dashboard_token') || '';
      const userId = user?.id || '';
      const role = user?.role || '';
      const query = `?token=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`;
      const wsUrl = `${protocol}//${window.location.host}/ws${query}`;

      try {
        ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        let lastMessageReceivedAt = Date.now();

        ws.onopen = () => {
          if (isCleanedUp) return;
          isConnectedRef.current = true;
          setIsConnected(true);
          setConnectionStatus('connected');
          lastMessageReceivedAt = Date.now();

          // Authenticate WebSocket connection immediately with user session
          const currentToken = localStorage.getItem('dashboard_token') || '';
          const authPayload = {
            type: 'auth',
            event: 'auth',
            token: currentToken,
            userId: user?.id || 'usr_admin',
            role: user?.role || 'admin',
            email: user?.email || '',
            user: user
              ? {
                  id: user.id,
                  name: user.name,
                  email: user.email,
                  role: user.role,
                  companyName: user.companyName,
                }
              : null,
          };

          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(authPayload));

            // Resubscribe to all active channels (physical, simulation, etc.)
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
            } else if (data.event === 'auth:success') {
              setIsConnected(true);
              setConnectionStatus('connected');

              // Automatically resubscribe to all active channels (physical & simulation) upon auth confirmation
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
              if (data.payload && data.payload.simulatorActive !== undefined) {
                setSimulatorActive(data.payload.simulatorActive);
              }
              if (data.payload?.firestoreQuotaExceeded) {
                handleQuotaExceeded();
              }
            } else if (data.event === 'simulator:updated') {
              if (data.payload && data.payload.simulatorActive !== undefined) {
                setSimulatorActive(data.payload.simulatorActive);
              }
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
                const currentTarget =
                  user?.role === 'admin' && selectedCustomerForAdmin !== 'all'
                    ? selectedCustomerForAdmin
                    : user?.id || 'usr_admin';
                if (
                  !data.payload.tenantId ||
                  data.payload.tenantId === currentTarget ||
                  (user?.role === 'admin' && currentTarget === 'usr_admin' && (data.payload.tenantId === 'usr_admin' || !data.payload.tenantId))
                ) {
                  setWidgets(data.payload.widgets);
                  if (data.payload.title) setDashboardTitle(data.payload.title);
                }
              }
            } else if (data.event === 'users:updated') {
              if (Array.isArray(data.payload)) {
                setCustomersList(data.payload);
              } else {
                refreshCustomers();
              }
            }
          } catch (err) {
            console.error('WebSocket message parsing error:', err);
          }
        };

        ws.onclose = () => {
          if (isCleanedUp) return;
          isConnectedRef.current = false;
          setIsConnected(false);
          setConnectionStatus('reconnecting');
          clearInterval(pingTimer);
          clearInterval(watchdogTimer);
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connect, 2500);
        };

        ws.onerror = () => {
          if (isCleanedUp) return;
          setConnectionStatus('reconnecting');
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

    // Fallback polling: When disconnected, poll REST API every 6 seconds
    const fallbackPollInterval = setInterval(() => {
      if (!isCleanedUp && !isConnectedRef.current && user) {
        fetchDevices();
        fetchHistory();
      }
    }, 6000);

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
      .then((res) => res.json())
      .then((data: DashboardLayout) => {
        if (data && Array.isArray(data.widgets) && data.widgets.length > 0) {
          setWidgets(data.widgets);
          if (data.title) setDashboardTitle(data.title);
        }
      })
      .catch((err) => console.error('Error fetching dashboard widgets:', err));
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

  const saveWidgets = useCallback(async (newWidgets: WidgetConfig[], title?: string) => {
    setWidgets(newWidgets);
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
          widgets: newWidgets,
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
        const json = await res.json(); const data = Array.isArray(json) ? json : (json.data || []);
        setSimulatorActive(data.simulatorActive);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

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
    const targetOwner =
      user?.role === 'admin'
        ? (data.tenantId || (selectedCustomerForAdmin !== 'all' ? selectedCustomerForAdmin : user?.id || 'usr_admin'))
        : user?.id || 'usr_admin';

    const payload = {
      userId: targetOwner,
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
      return updated;
    } catch (e: any) {
      console.error('updateDevice error:', e);
      throw new Error(e.message || 'Cihaz güncellenemedi', { cause: e });
    }
  }, [rawDevices, user]);

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

  const regenerateApiKey = useCallback(async (id: string): Promise<string> => {
    const dev = rawDevices.find((d) => d.id === id);
    if (!dev) throw new Error('Cihaz bulunamadı');
    if (user?.role !== 'admin' && dev.tenantId !== user?.id) {
      throw new Error('Yetkisiz işlem');
    }
    try {
      const res = await fetch(`/api/devices/${encodeURIComponent(id)}/regen-key`, { method: 'POST' });
      if (!res.ok) throw new Error('Anahtar yenilenemedi');
      const json = await res.json(); const data = Array.isArray(json) ? json : (json.data || []);
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
      const json = await res.json(); const data = Array.isArray(json) ? json : (json.data || []);
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
      try {
        const res = await fetch(`/api/devices/${encodeURIComponent(deviceId)}/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, value, outputPin, unit }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Sinyal gönderilemedi');
        }

        const json = await res.json(); const data = Array.isArray(json) ? json : (json.data || []);
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
      reconnectWebSocket,
      wsLatency,
      devices,
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
      saveWidgets,
      resetWidgetsToDefault,
      toggleSimulator,
      triggerTestTelemetry,
      createNewDevice,
      updateDevice,
      deleteDevice,
      regenerateApiKey,
      convertToPhysicalDevice,
      sendControlCommand,
    }),
    [
      isConnected,
      connectionStatus,
      reconnectWebSocket,
      wsLatency,
      devices,
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
      saveWidgets,
      resetWidgetsToDefault,
      toggleSimulator,
      triggerTestTelemetry,
      createNewDevice,
      updateDevice,
      deleteDevice,
      regenerateApiKey,
      convertToPhysicalDevice,
      sendControlCommand,
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
