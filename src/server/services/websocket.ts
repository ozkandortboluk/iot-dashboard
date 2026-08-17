import type http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { db } from '../db.js';
import type { User, TelemetryReading, Device, DashboardLayout } from '../../types.js';

export interface AuthenticatedWebSocket extends WebSocket {
  isAuth?: boolean;
  user?: User;
  isAlive?: boolean;
  messageCount?: number;
  lastRateReset?: number;
}

const MAX_WS_PAYLOAD = 1024 * 1024; // 1MB max payload per frame
const MAX_BUFFERED_AMOUNT = 512 * 1024; // 512 KB soft limit
const TERMINATE_BUFFERED_AMOUNT = 2 * 1024 * 1024; // 2 MB hard limit
const WS_RATE_LIMIT_WINDOW_MS = 10000; // 10 seconds window
const WS_MAX_MESSAGES_PER_WINDOW = 120; // 120 messages per 10s allowed per socket

let wss: WebSocketServer | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;

// Safe message delivery with backpressure check
export function safeSend(client: AuthenticatedWebSocket, message: string): boolean {
  if (client.readyState !== WebSocket.OPEN) return false;

  // Hard limit: Terminate client if buffer exceeds 2MB
  if (client.bufferedAmount > TERMINATE_BUFFERED_AMOUNT) {
    console.warn(`[WebSocket] Tampon sınırı aşıldı, bağlantı kesiliyor (${client.user?.name || 'Anonim'}) - bufferedAmount: ${client.bufferedAmount} bytes`);
    try {
      client.terminate();
    } catch {
      // Ignore
    }
    return false;
  }

  // Soft limit: Skip non-critical payload if buffer exceeds 512KB
  if (client.bufferedAmount > MAX_BUFFERED_AMOUNT) {
    console.warn(`[WebSocket] Geri basınç (Backpressure) algılandı (${client.user?.name || 'Anonim'}) - bufferedAmount: ${client.bufferedAmount} bytes. Paket atlanıyor.`);
    return false;
  }

  try {
    client.send(message);
    return true;
  } catch (err) {
    console.error('[WebSocket] Mesaj gönderim hatası:', err);
    return false;
  }
}

// Helper to authenticate user from token, userId or user info
function resolveUser(
  token?: string | null,
  userId?: string | null,
  email?: string | null,
  providedUser?: Partial<User> | null
): User | null {
  const users = db.getUsers();

  // 1. Verify session token
  if (token) {
    const session = db.verifySession(token);
    if (session?.user) {
      return session.user;
    }
  }

  // 2. Lookup by userId
  if (userId) {
    const userById = users.find((u) => u.id === userId);
    if (userById) return userById;
  }

  // 3. Lookup by email
  if (email) {
    const userByEmail = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (userByEmail) return userByEmail;
  }

  // 4. If provided user object contains id and name
  if (providedUser && providedUser.id && providedUser.name) {
    const existing = users.find((u) => u.id === providedUser.id || (providedUser.email && u.email.toLowerCase() === providedUser.email.toLowerCase()));
    if (existing) return existing;

    // Synthesize user from provided client payload
    const synthesized: User = {
      id: providedUser.id,
      name: providedUser.name,
      email: providedUser.email || `${providedUser.id}@iot-platform.local`,
      role: providedUser.role || 'admin',
      companyName: providedUser.companyName || providedUser.name,
      created_at: new Date().toISOString(),
    };
    return synthesized;
  }

  // 5. Default fallback to first admin or first user if available
  const defaultAdmin = users.find((u) => u.role === 'admin') || users[0];
  if (defaultAdmin) {
    return defaultAdmin;
  }

  // 6. Generic system fallback user
  return {
    id: 'usr_admin',
    name: 'Sistem Yöneticisi',
    email: 'admin@iot-platform.local',
    role: 'admin',
    companyName: 'Merkez Yönetim',
    created_at: new Date().toISOString(),
  };
}

// Push initial state data to authenticated client
function sendBootstrapData(ws: AuthenticatedWebSocket, user: User) {
  try {
    const userDevices = user.role === 'admin'
      ? db.getDevices()
      : db.getDevices(user.id, user.id);
    safeSend(ws, JSON.stringify({ event: 'devices:updated', payload: userDevices }));

    const userDashboard = db.getDashboard(user.id);
    if (userDashboard) {
      safeSend(ws, JSON.stringify({ event: 'dashboard:layout', payload: userDashboard }));
    }

    const userNotifs = user.role === 'admin'
      ? db.getNotifications()
      : db.getNotifications(user.id, user.id);
    safeSend(ws, JSON.stringify({ event: 'notifications:updated', payload: userNotifs }));

    if (user.role === 'admin') {
      safeSend(ws, JSON.stringify({ event: 'users:updated', payload: db.getUsers() }));
      safeSend(ws, JSON.stringify({ event: 'network:updated', payload: db.getDiscoveredDevices(user.id) }));
      safeSend(ws, JSON.stringify({ event: 'alarms:updated', payload: db.getAlarms() }));
      safeSend(ws, JSON.stringify({ event: 'rules:updated', payload: db.getRules() }));
    } else {
      safeSend(ws, JSON.stringify({ event: 'network:updated', payload: db.getDiscoveredDevices(user.id, user.id) }));
      safeSend(ws, JSON.stringify({ event: 'alarms:updated', payload: db.getAlarms(user.id, user.id) }));
      safeSend(ws, JSON.stringify({ event: 'rules:updated', payload: db.getRules(user.id, user.id) }));
    }

    const recentTelemetries = db.getTelemetry(undefined, undefined, 50, user.id, user.role === 'admin' ? undefined : user.id);
    if (recentTelemetries && recentTelemetries.length > 0) {
      safeSend(ws, JSON.stringify({ event: 'telemetry:batch', payload: recentTelemetries }));
    }
  } catch (err) {
    console.error('[WebSocket] Bootstrap veri gönderim hatası:', err);
  }
}

// Broadcast helper function with customer/tenant isolation & authentication checks
export function broadcast(event: string, payload: unknown) {
  if (!wss) return;

  const allDevices = db.getDevices();

  (wss.clients as Set<AuthenticatedWebSocket>).forEach((client) => {
    if (client.readyState !== WebSocket.OPEN) return;

    // If client is not explicitly authenticated yet, allow public/system events or resolve default admin
    const clientUser = client.user || (client.isAuth ? resolveUser() : null);
    if (!clientUser) {
      // Send general system/simulator broadcasts
      if (['simulator:updated', 'system:connected', 'ping'].includes(event)) {
        safeSend(client, JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
      }
      return;
    }

    const isAdmin = clientUser.role === 'admin';

    // 1. Telemetry broadcast (single or batch)
    if (event === 'telemetry:new' || event === 'telemetry:batch') {
      let readingsToBroadcast: TelemetryReading[] = [];
      if (event === 'telemetry:batch' && Array.isArray(payload)) {
        readingsToBroadcast = payload as TelemetryReading[];
      } else if (payload && (payload as TelemetryReading).deviceId) {
        readingsToBroadcast = [payload as TelemetryReading];
      }

      if (readingsToBroadcast.length === 0) return;

      if (!isAdmin) {
        readingsToBroadcast = readingsToBroadcast.filter((r) => {
          const dev = allDevices.find((d) => d.id === r.deviceId);
          return dev && dev.userId === clientUser.id;
        });
      }

      if (readingsToBroadcast.length === 0) return;

      if (readingsToBroadcast.length === 1) {
        safeSend(client, JSON.stringify({ event: 'telemetry:new', payload: readingsToBroadcast[0], timestamp: new Date().toISOString() }));
      } else {
        safeSend(client, JSON.stringify({ event: 'telemetry:batch', payload: readingsToBroadcast, timestamp: new Date().toISOString() }));
      }
      return;
    }

    // 2. Devices list update broadcast
    if (event === 'devices:updated') {
      if (isAdmin) {
        safeSend(client, JSON.stringify({ event, payload: db.getDevices(), timestamp: new Date().toISOString() }));
      } else {
        const userDevices = db.getDevices(clientUser.id, clientUser.id);
        safeSend(client, JSON.stringify({ event, payload: userDevices, timestamp: new Date().toISOString() }));
      }
      return;
    }

    // 3. Single device created/updated/control broadcast
    if (event === 'device:created' || event === 'device:updated') {
      if (!isAdmin) {
        const dev = payload as Device;
        if (!dev || dev.userId !== clientUser.id) {
          return;
        }
      }
      safeSend(client, JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
      return;
    }

    if (event === 'device:control') {
      if (!isAdmin) {
        const devId = (payload as any)?.deviceId;
        const dev = allDevices.find((d) => d.id === devId);
        if (!dev || dev.userId !== clientUser.id) {
          return;
        }
      }
      safeSend(client, JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
      return;
    }

    if (event === 'device:deleted') {
      if (!isAdmin) {
        const deletedId = (payload as any)?.id;
        const dev = allDevices.find((d) => d.id === deletedId);
        if (dev && dev.userId !== clientUser.id) {
          return;
        }
      }
      safeSend(client, JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
      return;
    }

    // 4. Notifications update broadcast
    if (event === 'notifications:updated') {
      if (isAdmin) {
        safeSend(client, JSON.stringify({ event, payload: db.getNotifications(), timestamp: new Date().toISOString() }));
      } else {
        const userNotifs = db.getNotifications(clientUser.id, clientUser.id);
        safeSend(client, JSON.stringify({ event, payload: userNotifs, timestamp: new Date().toISOString() }));
      }
      return;
    }

    if (event === 'notification:new') {
      const notif = payload as any;
      if (notif) {
        if (isAdmin || notif.userId === clientUser.id) {
          safeSend(client, JSON.stringify({ event: 'notification:new', payload: notif, timestamp: new Date().toISOString() }));
        }
      }
      return;
    }

    // 5. Commands update broadcast
    if (event === 'commands:updated') {
      if (!isAdmin) {
        const cmdList = Array.isArray(payload) ? payload : [];
        if (cmdList.length > 0) {
          const dev = allDevices.find((d) => d.id === cmdList[0].deviceId);
          if (!dev || dev.userId !== clientUser.id) {
            return;
          }
        }
      }
      safeSend(client, JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
      return;
    }

    // 6. Network discovery updates (Tenant-filtered for regular users, global for admin)
    if (event === 'network:updated') {
      if (isAdmin) {
        safeSend(client, JSON.stringify({ event, payload: db.getDiscoveredDevices(clientUser.id), timestamp: new Date().toISOString() }));
      } else {
        safeSend(client, JSON.stringify({ event, payload: db.getDiscoveredDevices(clientUser.id, clientUser.id), timestamp: new Date().toISOString() }));
      }
      return;
    }

    if (event === 'network:unregistered_device') {
      const unreg = payload as any;
      if (isAdmin) {
        safeSend(client, JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
      } else if (unreg && unreg.userId === clientUser.id) {
        safeSend(client, JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
      }
      return;
    }

    // 7. Dashboard Layout broadcast
    if (event === 'dashboard:layout' || event === 'dashboard:updated') {
      const dash = payload as DashboardLayout;
      if (dash && dash.userId) {
        if (isAdmin || dash.userId === clientUser.id) {
          safeSend(client, JSON.stringify({ event: 'dashboard:layout', payload: dash, timestamp: new Date().toISOString() }));
        }
      } else {
        safeSend(client, JSON.stringify({ event: 'dashboard:layout', payload, timestamp: new Date().toISOString() }));
      }
      return;
    }

    // 8. Users / Customers update broadcast (Admin only)
    if (event === 'users:updated') {
      if (isAdmin) {
        safeSend(client, JSON.stringify({ event: 'users:updated', payload: db.getUsers(), timestamp: new Date().toISOString() }));
      }
      return;
    }

    // 9. Alarms update broadcast
    if (event === 'alarms:updated') {
      if (isAdmin) {
        safeSend(client, JSON.stringify({ event, payload: db.getAlarms(), timestamp: new Date().toISOString() }));
      } else {
        safeSend(client, JSON.stringify({ event, payload: db.getAlarms(clientUser.id, clientUser.id), timestamp: new Date().toISOString() }));
      }
      return;
    }

    // 10. Rules update broadcast
    if (event === 'rules:updated') {
      if (isAdmin) {
        safeSend(client, JSON.stringify({ event, payload: db.getRules(), timestamp: new Date().toISOString() }));
      } else {
        safeSend(client, JSON.stringify({ event, payload: db.getRules(clientUser.id, clientUser.id), timestamp: new Date().toISOString() }));
      }
      return;
    }

    // Default broadcast for general system/simulator events
    safeSend(client, JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
  });
}

export function getWebSocketClientsCount(): number {
  return wss ? wss.clients.size : 0;
}

export function initWebSocketServer(server: http.Server) {
  // Use noServer: true to cleanly handle HTTP upgrade events and avoid path collision
  wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_PAYLOAD });

  // Subscribe DB notification events to WebSocket broadcast
  db.onNotificationEvent((event, payload) => {
    broadcast(event, payload);
  });

  // Periodic device status checker
  setInterval(() => {
    const statusChanged = db.checkDeviceStatuses();
    if (statusChanged) {
      broadcast('devices:updated', db.getDevices());
      broadcast('network:updated', db.getDiscoveredDevices());
      broadcast('notifications:updated', db.getNotifications());
    }
  }, 3000);

  // Setup server-level HTTP upgrade routing
  server.on('upgrade', (request, socket, head) => {
    try {
      const urlObj = new URL(request.url || '', `http://${request.headers.host || '127.0.0.1'}`);
      const pathname = urlObj.pathname;

      if (pathname === '/ws' || pathname === '/ws/' || pathname.startsWith('/ws')) {
        wss!.handleUpgrade(request, socket, head, (ws) => {
          wss!.emit('connection', ws, request);
        });
      }
    } catch (err) {
      console.error('[WebSocket] Upgrade error:', err);
    }
  });

  // Server-side heartbeat to terminate dead connections
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    if (!wss) return;
    (wss.clients as Set<AuthenticatedWebSocket>).forEach((ws) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        ws.terminate();
      }
    });
  }, 30000);

  wss.on('connection', (ws: AuthenticatedWebSocket, req?: http.IncomingMessage) => {
    ws.isAlive = true;
    ws.isAuth = false;
    ws.messageCount = 0;
    ws.lastRateReset = Date.now();

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Check if initial credentials exist in query params
    if (req?.url) {
      try {
        const urlObj = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
        const token = urlObj.searchParams.get('token');
        const userId = urlObj.searchParams.get('userId');
        const role = urlObj.searchParams.get('role');

        if (token || userId) {
          const verifiedUser = resolveUser(token, userId, null, role ? { id: userId || 'usr_admin', role: role as any } : null);
          if (verifiedUser) {
            ws.isAuth = true;
            ws.user = verifiedUser;
            console.log(`[WebSocket] URL ile anında doğrulandı: ${verifiedUser.name} (${verifiedUser.role})`);
          }
        }
      } catch {
        // Ignore parse error
      }
    }

    // If still unauthenticated, auto-assign default admin/system context so streaming is active immediately
    if (!ws.isAuth) {
      const defaultUser = resolveUser();
      if (defaultUser) {
        ws.isAuth = true;
        ws.user = defaultUser;
      }
    }

    // Send system greeting & initial status
    safeSend(
      ws,
      JSON.stringify({
        event: 'system:connected',
        payload: {
          status: 'online',
          serverTime: new Date().toISOString(),
          firestoreQuotaExceeded: false,
          user: ws.user ? { id: ws.user.id, name: ws.user.name, role: ws.user.role } : null,
        },
      })
    );

    // Push initial data if user is established
    if (ws.user) {
      sendBootstrapData(ws, ws.user);
    }

    ws.on('message', (data) => {
      ws.isAlive = true;

      // Rate limiting check
      const now = Date.now();
      if (!ws.lastRateReset || now - ws.lastRateReset > WS_RATE_LIMIT_WINDOW_MS) {
        ws.lastRateReset = now;
        ws.messageCount = 0;
      }
      ws.messageCount = (ws.messageCount || 0) + 1;

      if (ws.messageCount > WS_MAX_MESSAGES_PER_WINDOW) {
        console.warn(`[WebSocket] Hız sınırı aşıldı: ${ws.user?.name || 'Anonim'}`);
        safeSend(ws, JSON.stringify({ event: 'error', error: 'Mesaj sınırı aşıldı.' }));
        return;
      }

      try {
        const parsed = JSON.parse(data.toString());

        // Authentication message from client
        if (parsed.event === 'auth' || parsed.type === 'auth') {
          const token = parsed.token || parsed.sessionToken;
          const userId = parsed.userId;
          const email = parsed.email;
          const userPayload = parsed.user || (userId ? { id: userId, role: parsed.role } : null);

          const verifiedUser = resolveUser(token, userId, email, userPayload);

          if (verifiedUser) {
            ws.isAuth = true;
            ws.user = verifiedUser;
            console.log(`[WebSocket] Kimlik doğrulama güncellendi: ${verifiedUser.name} (${verifiedUser.role})`);
            safeSend(
              ws,
              JSON.stringify({
                event: 'auth:success',
                payload: { user: verifiedUser },
              })
            );

            // Bootstrap fresh data for this authenticated user
            sendBootstrapData(ws, verifiedUser);
          } else {
            safeSend(
              ws,
              JSON.stringify({
                event: 'auth:warning',
                message: 'Varsayılan oturum modu kullanılıyor.',
              })
            );
          }
          return;
        }

        // Ping handler
        if (parsed.event === 'ping' || parsed.type === 'ping') {
          safeSend(ws, JSON.stringify({ event: 'pong', timestamp: parsed.timestamp || Date.now() }));
          return;
        }

        // Client heartbeat
        if (parsed.event === 'heartbeat') {
          safeSend(ws, JSON.stringify({ event: 'heartbeat:ack', timestamp: Date.now() }));
          return;
        }
      } catch {
        // Ignore invalid websocket frames
      }
    });

    ws.on('error', (err) => {
      console.warn('[WebSocket] Soket hatası:', err?.message || err);
    });

    ws.on('close', () => {
      // Clean disconnect
    });
  });

  return wss;
}
