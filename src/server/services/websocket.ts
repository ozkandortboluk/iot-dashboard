import type http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { db } from '../db.js';
import type { User, TelemetryReading, Device, DashboardLayout, DeviceCommand } from '../../types.js';
import { deviceAuthService } from './deviceAuth.service.js';
import { telemetryService } from './telemetry.service.js';
import { commandService } from './command.service.js';
import { deviceWsProtocolService } from './deviceWsProtocol.service.js';

export interface AuthenticatedWebSocket extends WebSocket {
  isAuth?: boolean;
  user?: User;
  device?: Device;
  isAlive?: boolean;
  messageCount?: number;
  lastRateReset?: number;
  subscribedChannels?: Set<'physical' | 'simulation'>;
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
    console.warn(`[WebSocket] Tampon sınırı aşıldı, bağlantı kesiliyor (${client.user?.name || client.device?.name || 'Anonim'}) - bufferedAmount: ${client.bufferedAmount} bytes`);
    try {
      client.terminate();
    } catch {
      // Ignore
    }
    return false;
  }

  // Soft limit: Skip non-critical payload if buffer exceeds 512KB
  if (client.bufferedAmount > MAX_BUFFERED_AMOUNT) {
    console.warn(`[WebSocket] Geri basınç (Backpressure) algılandı (${client.user?.name || client.device?.name || 'Anonim'}) - bufferedAmount: ${client.bufferedAmount} bytes. Paket atlanıyor.`);
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

// Strict session token verification helper for WebSocket connections
function resolveUser(token?: string | null): User | null {
  if (!token || typeof token !== 'string' || token.trim() === '') {
    return null;
  }

  const session = db.verifySession(token.trim());
  if (session?.user) {
    return session.user;
  }

  return null;
}

// Physical device API key / Token verification helper for WebSocket connections
function resolveDevice(token?: string | null): Device | null {
  if (!token || typeof token !== 'string' || token.trim() === '') {
    return null;
  }

  const cleanToken = token.trim();
  const dev = db.getDeviceByApiKey(cleanToken);
  if (dev) return dev;

  const devById = db.getDevices().find((d) => (d.id === cleanToken || d.apiKey === cleanToken) && d.apiKey);
  if (devById) return devById;

  return null;
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

    if (user.role === 'admin') {
      db.getAlarms('usr_admin', undefined, { status: 'active' }).then(a => safeSend(ws, JSON.stringify({ event: 'alarms:updated', payload: a })));
    } else {
      db.getAlarms(user.id, user.id, { status: 'active' }).then(a => safeSend(ws, JSON.stringify({ event: 'alarms:updated', payload: a })));
    }

    // Default channels assignment: Connections default to both physical and simulation channels
    if (!ws.subscribedChannels) {
      ws.subscribedChannels = new Set(['physical', 'simulation']);
    }

    const recentTelemetries = db.getTelemetry(undefined, undefined, 50, user.id, user.role === 'admin' ? undefined : user.id);
    if (recentTelemetries && recentTelemetries.length > 0) {
      const physicalTelemetries = recentTelemetries.filter((r) => r.source === 'physical' || (!r.source && r.environment !== 'sandbox'));
      const simTelemetries = recentTelemetries.filter((r) => r.source === 'simulator' || r.source === 'manual_test' || r.environment === 'sandbox');

      if (physicalTelemetries.length > 0 && ws.subscribedChannels.has('physical')) {
        safeSend(ws, JSON.stringify({ event: 'telemetry:bootstrap', payload: physicalTelemetries }));
      }

      if (simTelemetries.length > 0 && ws.subscribedChannels.has('simulation')) {
        safeSend(ws, JSON.stringify({ event: 'telemetry:simulation:bootstrap', payload: simTelemetries }));
      }
    }
  } catch (err) {
    console.error('[WebSocket] Bootstrap veri gönderim hatası:', err);
  }
}

// Broadcast helper function with customer/tenant isolation, channel subscriptions & authentication checks
export function broadcast(event: string, payload: unknown) {
  if (!wss) return;

  const allDevices = db.getDevices();

  (wss.clients as Set<AuthenticatedWebSocket>).forEach((client) => {
    if (client.readyState !== WebSocket.OPEN) return;

    // Unauthenticated clients receive NO protected data broadcasts
    if (!client.isAuth || (!client.user && !client.device)) {
      if (['simulator:updated', 'system:connected', 'ping'].includes(event)) {
        safeSend(client, JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
      }
      return;
    }

    // Direct Downlink Push to Connected Hardware Devices (ESP32/ESP8266/Python IoT Agents)
    if (client.device) {
      if (
        event === 'command:created' ||
        event === 'command:sent' ||
        event === 'command:downlink'
      ) {
        const cmd = (payload && typeof payload === 'object' && (payload as any).command
          ? (payload as any).command
          : payload) as DeviceCommand;

        if (cmd && (cmd.deviceId === client.device.id || cmd.deviceId === client.device.apiKey)) {
          // 1. Unified WebSocket Protocol Envelope Delivery
          deviceWsProtocolService.sendDeviceCommand(client.device.id, cmd);

          // 2. Legacy Downlink Delivery for backward compatibility
          safeSend(
            client,
            JSON.stringify({
              event: 'command:downlink',
              command: {
                id: cmd.id,
                commandId: cmd.commandId || cmd.id,
                command: cmd.command || cmd.commandType,
                commandType: cmd.commandType || cmd.command,
                outputId: cmd.outputId,
                value: cmd.value !== undefined ? cmd.value : cmd.payload,
                payload: cmd.payload,
                parameters: cmd.parameters,
                createdAt: cmd.createdAt || cmd.created_at,
              },
              timestamp: new Date().toISOString(),
            })
          );
        }
      }
      return;
    }

    const clientUser = client.user!;
    const isAdmin = clientUser.role === 'admin';
    const subChannels = client.subscribedChannels || new Set(['physical']);

    // 1. Telemetry broadcasts (Strict Physical vs Simulation Channel Isolation)
    if (
      event === 'telemetry:new' ||
      event === 'telemetry:batch' ||
      event === 'telemetry:physical:new' ||
      event === 'telemetry:physical:batch' ||
      event === 'telemetry:simulation:new' ||
      event === 'telemetry:simulation:batch'
    ) {
      let readings: TelemetryReading[] = [];
      if (Array.isArray(payload)) {
        readings = payload as TelemetryReading[];
      } else if (payload && (payload as TelemetryReading).deviceId) {
        readings = [payload as TelemetryReading];
      }

      if (readings.length === 0) return;

      // Classify readings based on origin
      const isSimEvent = event.startsWith('telemetry:simulation');
      const isPhysEvent = event.startsWith('telemetry:physical');

      const physicalReadings = isSimEvent
        ? []
        : readings.filter(
            (r) => r.source === 'physical' || (!r.source && r.environment !== 'sandbox')
          );

      const simulationReadings = isPhysEvent
        ? []
        : readings.filter(
            (r) => r.source === 'simulator' || r.source === 'manual_test' || r.environment === 'sandbox'
          );

      // Deliver PHYSICAL channel readings (Single event, no duplicates)
      if (physicalReadings.length > 0 && subChannels.has('physical')) {
        let allowedPhysical = physicalReadings;
        if (!isAdmin) {
          allowedPhysical = physicalReadings.filter((r) => {
            const dev = allDevices.find((d) => d.id === r.deviceId);
            return dev && dev.tenantId === clientUser.id;
          });
        }

        if (allowedPhysical.length > 0) {
          const timestamp = new Date().toISOString();
          if (allowedPhysical.length === 1) {
            safeSend(client, JSON.stringify({ event: 'telemetry:physical:new', payload: allowedPhysical[0], timestamp }));
          } else {
            safeSend(client, JSON.stringify({ event: 'telemetry:physical:batch', payload: allowedPhysical, timestamp }));
          }
        }
      }

      // Deliver SIMULATION channel readings
      if (simulationReadings.length > 0 && subChannels.has('simulation')) {
        let allowedSim = simulationReadings;
        if (!isAdmin) {
          allowedSim = simulationReadings.filter((r) => {
            const dev = allDevices.find((d) => d.id === r.deviceId);
            return dev && dev.tenantId === clientUser.id;
          });
        }

        if (allowedSim.length > 0) {
          const timestamp = new Date().toISOString();
          if (allowedSim.length === 1) {
            safeSend(client, JSON.stringify({ event: 'telemetry:simulation:new', payload: allowedSim[0], timestamp }));
          } else {
            safeSend(client, JSON.stringify({ event: 'telemetry:simulation:batch', payload: allowedSim, timestamp }));
          }
        }
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
        if (!dev || dev.tenantId !== clientUser.id) {
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
        if (!dev || dev.tenantId !== clientUser.id) {
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
        if (dev && dev.tenantId !== clientUser.id) {
          return;
        }
      }
      safeSend(client, JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
      return;
    }

    // 4. Notifications update broadcast
    if (event === 'notifications:updated') {
      if (isAdmin) {
        db.getNotifications().then(n => safeSend(client, JSON.stringify({ event, payload: n, timestamp: new Date().toISOString() })));
      } else {
        db.getNotifications(clientUser.id, clientUser.id).then(userNotifs => {
          safeSend(client, JSON.stringify({ event, payload: userNotifs, timestamp: new Date().toISOString() }));
        });
      }
      return;
    }

    if (event === 'notification:new') {
      const notif = payload as any;
      if (notif) {
        if (isAdmin || notif.tenantId === clientUser.id) {
          safeSend(client, JSON.stringify({ event: 'notification:new', payload: notif, timestamp: new Date().toISOString() }));
        }
      }
      return;
    }

    // 5. Commands lifecycle events broadcast (Tenant-isolated for multi-tenant security)
    if (
      event === 'commands:updated' ||
      event === 'command:created' ||
      event === 'command:sent' ||
      event === 'command:acknowledged' ||
      event === 'command:executed' ||
      event === 'command:failed' ||
      event === 'command:expired' ||
      event.startsWith('command:')
    ) {
      if (isAdmin) {
        safeSend(client, JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
        return;
      }

      // Non-admin customer / tenant user: verify device ownership and tenant authorization
      const membershipTenants = (db.data?.tenantMemberships || [])
        .filter((m: any) => m.userId === clientUser.id)
        .map((m: any) => m.tenantId);
      const userTenants = new Set([clientUser.id, ...membershipTenants]);

      const cmdList: any[] = Array.isArray(payload)
        ? payload
        : payload && typeof payload === 'object' && (payload as any).command
        ? [(payload as any).command]
        : payload && typeof payload === 'object'
        ? [payload]
        : [];

      if (cmdList.length === 0) {
        return;
      }

      // Check if command(s) belong to user's authorized tenants or devices
      const authorizedCmds = cmdList.filter((cmd) => {
        if (!cmd) return false;
        if (cmd.tenantId && userTenants.has(cmd.tenantId)) return true;
        if (cmd.customerId && userTenants.has(cmd.customerId)) return true;
        if (cmd.userId && cmd.userId === clientUser.id) return true;

        if (cmd.deviceId) {
          const dev = allDevices.find((d) => d.id === cmd.deviceId || d.apiKey === cmd.deviceId);
          if (dev && dev.tenantId && userTenants.has(dev.tenantId)) return true;
        }
        return false;
      });

      if (authorizedCmds.length === 0) {
        // Not authorized for any command in this payload - drop silently to prevent cross-tenant leak
        return;
      }

      const outgoingPayload = Array.isArray(payload)
        ? authorizedCmds
        : (authorizedCmds.length === 1
            ? (payload && typeof payload === 'object' && (payload as any).command
                ? { ...payload, command: authorizedCmds[0] }
                : authorizedCmds[0])
            : authorizedCmds);

      safeSend(client, JSON.stringify({ event, payload: outgoingPayload, timestamp: new Date().toISOString() }));
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
      } else if (unreg && unreg.tenantId === clientUser.id) {
        safeSend(client, JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
      }
      return;
    }

    // 7. Dashboard Layout broadcast
    if (event === 'dashboard:layout' || event === 'dashboard:updated') {
      const dash = payload as DashboardLayout;
      if (dash && dash.tenantId) {
        if (isAdmin || dash.tenantId === clientUser.id) {
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
        db.getAlarms().then(a => safeSend(client, JSON.stringify({ event, payload: a, timestamp: new Date().toISOString() })));
      } else {
        db.getAlarms(clientUser.id, clientUser.id).then(a => safeSend(client, JSON.stringify({ event, payload: a, timestamp: new Date().toISOString() })));
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

export function broadcastToTenant(tenantId: string, event: string, tenantPayload: unknown, adminPayload?: unknown) {
  if (!wss) return;

  (wss.clients as Set<AuthenticatedWebSocket>).forEach((client) => {
    if (client.readyState !== WebSocket.OPEN) return;
    if (!client.isAuth || !client.user) return;

    if (client.user.role === 'admin') {
      safeSend(client, JSON.stringify({ event, payload: adminPayload !== undefined ? adminPayload : tenantPayload, timestamp: new Date().toISOString() }));
    } else if (client.user.id === tenantId) {
      safeSend(client, JSON.stringify({ event, payload: tenantPayload, timestamp: new Date().toISOString() }));
    }
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
      db.getNotifications().then(n => broadcast('notifications:updated', n));
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
    ws.user = undefined;
    ws.messageCount = 0;
    ws.lastRateReset = Date.now();

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Check if token exists in Authorization header, Sec-WebSocket-Protocol, or Query parameter (for microcontrollers)
    let connectionToken: string | null = null;
    if (req?.headers?.authorization) {
      const authHeader = req.headers.authorization;
      connectionToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
    } else if (req?.headers?.['x-api-key']) {
      connectionToken = String(req.headers['x-api-key']).trim();
    } else if (req?.headers?.['sec-websocket-protocol']) {
      connectionToken = String(req.headers['sec-websocket-protocol']).split(',')[0].trim();
    } else if (req?.url) {
      try {
        const parsedUrl = new URL(req.url, 'http://127.0.0.1');
        connectionToken = parsedUrl.searchParams.get('token') || parsedUrl.searchParams.get('apiKey') || parsedUrl.searchParams.get('api_key');
      } catch {
        // ignore
      }
    }

    if (connectionToken) {
      const verifiedUser = resolveUser(connectionToken);
      if (verifiedUser) {
        ws.isAuth = true;
        ws.user = verifiedUser;
      } else {
        const verifiedDevice = resolveDevice(connectionToken);
        if (verifiedDevice) {
          ws.isAuth = true;
          ws.device = verifiedDevice;
          deviceWsProtocolService.registerDeviceSocket(verifiedDevice.id, ws);
        }
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
          authenticated: ws.isAuth,
          user: ws.user ? { id: ws.user.id, name: ws.user.name, role: ws.user.role } : null,
          device: ws.device ? { id: ws.device.id, name: ws.device.name } : null,
        },
      })
    );

    // Push initial bootstrap data ONLY if user is authenticated
    if (ws.isAuth && ws.user) {
      sendBootstrapData(ws, ws.user);
    } else if (ws.isAuth && ws.device) {
      commandService.getAndDeliverPendingCommands(ws.device.id).then((pendingCmds) => {
        if (pendingCmds.length > 0) {
          safeSend(
            ws,
            JSON.stringify({
              event: 'command:downlink',
              commands: pendingCmds,
              timestamp: new Date().toISOString(),
            })
          );
        }
      });
    }

    ws.on('message', async (data) => {
      ws.isAlive = true;

      // Rate limiting check
      const now = Date.now();
      if (!ws.lastRateReset || now - ws.lastRateReset > WS_RATE_LIMIT_WINDOW_MS) {
        ws.lastRateReset = now;
        ws.messageCount = 0;
      }
      ws.messageCount = (ws.messageCount || 0) + 1;

      if (ws.messageCount > WS_MAX_MESSAGES_PER_WINDOW) {
        console.warn(`[WebSocket] Hız sınırı aşıldı: ${ws.user?.name || ws.device?.name || 'Anonim'}`);
        safeSend(ws, JSON.stringify({ event: 'error', error: 'Mesaj sınırı aşıldı.' }));
        return;
      }

      try {
        const parsed = JSON.parse(data.toString());

        // =========================================================================
        // UNIFIED IOT DEVICE WEBSOCKET PROTOCOL DISPATCHER
        // Handles { type, deviceId, messageId, timestamp, data } for ESP8266/ESP32/Python
        // =========================================================================
        const UNIFIED_MESSAGE_TYPES = ['hello', 'telemetry', 'command', 'ack', 'event', 'ping', 'pong'];
        if (
          parsed &&
          typeof parsed === 'object' &&
          typeof parsed.type === 'string' &&
          UNIFIED_MESSAGE_TYPES.includes(parsed.type) &&
          parsed.deviceId &&
          parsed.messageId
        ) {
          await deviceWsProtocolService.handleDeviceMessage(ws, parsed);
          return;
        }

        // Authentication message from client (supports User Session Token or Device API Key)
        if (parsed.event === 'auth' || parsed.type === 'auth') {
          const token = parsed.token || parsed.sessionToken || parsed.apiKey;
          const verifiedUser = resolveUser(token);

          if (verifiedUser) {
            ws.isAuth = true;
            ws.user = verifiedUser;
            ws.device = undefined;
            console.log(`[WebSocket] Kullanıcı oturumu doğrulandı: ${verifiedUser.name} (${verifiedUser.role})`);
            safeSend(
              ws,
              JSON.stringify({
                event: 'auth:success',
                payload: { user: verifiedUser },
              })
            );

            // Bootstrap fresh data for this authenticated user
            sendBootstrapData(ws, verifiedUser);
            return;
          }

          const verifiedDevice = resolveDevice(token);
          if (verifiedDevice) {
            ws.isAuth = true;
            ws.device = verifiedDevice;
            ws.user = undefined;
            deviceWsProtocolService.registerDeviceSocket(verifiedDevice.id, ws);
            console.log(`[WebSocket] Saha Cihazı doğrulandı: ${verifiedDevice.name} (${verifiedDevice.id})`);
            safeSend(
              ws,
              JSON.stringify({
                event: 'auth:success',
                payload: {
                  type: 'device',
                  deviceId: verifiedDevice.id,
                  deviceName: verifiedDevice.name,
                  status: 'online',
                },
              })
            );

            // Claim and deliver any queued pending commands immediately to this connected device
            commandService.getAndDeliverPendingCommands(verifiedDevice.id).then((pendingCmds) => {
              if (pendingCmds.length > 0) {
                safeSend(
                  ws,
                  JSON.stringify({
                    event: 'command:downlink',
                    commands: pendingCmds,
                    timestamp: new Date().toISOString(),
                  })
                );
              }
            });
            return;
          }

          ws.isAuth = false;
          ws.user = undefined;
          ws.device = undefined;
          console.warn(`[WebSocket] Doğrulama başarısız: Geçersiz veya süresi dolmuş oturum anahtarı/cihaz token'ı.`);
          safeSend(
            ws,
            JSON.stringify({
              event: 'auth:failed',
              error: 'Geçersiz veya süresi dolmuş anahtar/token.',
            })
          );
          return;
        }

        // Hardware Device Command ACK Handler: { event: "command:ack", commandId: "...", status: "received"|"executed"|"failed", result?: ..., error?: ... }
        if (
          parsed.event === 'command:ack' ||
          parsed.event === 'command:status' ||
          parsed.event === 'device:command_ack' ||
          parsed.type === 'command:ack'
        ) {
          let verifiedDevId: string | null = null;

          if (ws.device) {
            verifiedDevId = ws.device.id;
          } else if (parsed.token || parsed.apiKey) {
            const dev = resolveDevice(parsed.token || parsed.apiKey);
            if (dev) verifiedDevId = dev.id;
          } else if (ws.user) {
            // If sender is an authenticated web user (e.g. admin or device owner acknowledging on behalf of simulator)
            const targetDevId = parsed.deviceId;
            if (targetDevId) {
              const dev = db.getDevices().find((d) => d.id === targetDevId);
              if (dev && (ws.user.role === 'admin' || dev.tenantId === ws.user.id)) {
                verifiedDevId = dev.id;
              }
            }
          }

          if (!verifiedDevId) {
            safeSend(
              ws,
              JSON.stringify({
                event: 'error',
                error: 'Yetkisiz erişim: Komut onayı (ACK) için geçerli cihaz kimlik doğrulaması gereklidir.',
              })
            );
            return;
          }

          const cmdId = parsed.commandId || parsed.id || parsed.commandIds;
          const status = parsed.status || 'acknowledged'; // 'received' | 'executed' | 'failed'
          const result = parsed.result;
          const error = parsed.error || parsed.errorMessage;
          const finalRes = result !== undefined ? result : (error ? { error } : undefined);

          const updatedCount = await commandService.handleCommandAck(
            verifiedDevId,
            cmdId,
            status,
            finalRes
          );

          safeSend(
            ws,
            JSON.stringify({
              event: 'command:ack_confirmed',
              commandId: cmdId,
              status,
              acknowledgedCount: updatedCount,
              timestamp: new Date().toISOString(),
            })
          );
          return;
        }

        // Hardware Device Command Polling Handler: { event: "command:poll" }
        if (
          parsed.event === 'command:poll' ||
          parsed.event === 'device:commands:get' ||
          parsed.type === 'command:poll'
        ) {
          const targetDevice = ws.device || (parsed.token ? resolveDevice(parsed.token) : null);
          if (targetDevice) {
            const pendingCmds = await commandService.getAndDeliverPendingCommands(targetDevice.id);
            safeSend(
              ws,
              JSON.stringify({
                event: 'command:downlink',
                commands: pendingCmds,
                timestamp: new Date().toISOString(),
              })
            );
            return;
          }
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

        // Channel Subscription handler: { event: "subscribe", channels: ["physical"] | ["simulation"] | ["physical", "simulation"] }
        if (parsed.event === 'subscribe' || parsed.type === 'subscribe') {
          const requestedChannels: string[] = Array.isArray(parsed.channels)
            ? parsed.channels
            : typeof parsed.channel === 'string'
            ? [parsed.channel]
            : [];

          if (!ws.subscribedChannels) {
            ws.subscribedChannels = new Set(['physical', 'simulation']);
          }

          const approvedChannels: string[] = [];
          for (const ch of requestedChannels) {
            if (ch === 'physical' || ch === 'simulation') {
              ws.subscribedChannels.add(ch);
              approvedChannels.push(ch);
            }
          }

          safeSend(
            ws,
            JSON.stringify({
              event: 'subscribed',
              channels: Array.from(ws.subscribedChannels),
              timestamp: new Date().toISOString(),
            })
          );
          return;
        }

        // Channel Unsubscription handler: { event: "unsubscribe", channels: ["simulation"] }
        if (parsed.event === 'unsubscribe' || parsed.type === 'unsubscribe') {
          const toUnsub: string[] = Array.isArray(parsed.channels)
            ? parsed.channels
            : typeof parsed.channel === 'string'
            ? [parsed.channel]
            : [];

          if (ws.subscribedChannels) {
            for (const ch of toUnsub) {
              if (ch === 'physical' || ch === 'simulation') {
                ws.subscribedChannels.delete(ch);
              }
            }
          }

          safeSend(
            ws,
            JSON.stringify({
              event: 'unsubscribed',
              channels: Array.from(ws.subscribedChannels || []),
              timestamp: new Date().toISOString(),
            })
          );
          return;
        }

        // Telemetry Ingestion via WebSocket (Supports telemetry:ingest, telemetry:send, device:telemetry)
        if (
          parsed.event === 'telemetry:ingest' ||
          parsed.event === 'telemetry:send' ||
          parsed.event === 'device:telemetry'
        ) {
          const ackEvent = parsed.event ? `${parsed.event}:ack` : 'telemetry:ack';
          const { parseTelemetryPayload, buildPacketAck } = await import('../utils/telemetry.parser.js');
          const parsedPayload = parseTelemetryPayload(parsed.payload || parsed);

          const authResult = deviceAuthService.authenticateDevice(parsedPayload);
          if (authResult.success && authResult.device) {
            const device = authResult.device;
            telemetryService
              .ingestTelemetry(
                device,
                parsedPayload.metricsToProcess,
                parsedPayload.finalFormattedPacket,
                authResult.devInfoUpdated,
                parsedPayload.sequence
              )
              .then(async ({ addedReadings, writeAck }) => {
                const commands = await commandService.getAndDeliverPendingCommands(device.id);
                const packetAck = buildPacketAck({
                  sequence: parsedPayload.sequence,
                  receivedCount: parsedPayload.metricsToProcess.length,
                  addedReadingsCount: addedReadings.length,
                  writeAck,
                  deviceId: device.id,
                });

                safeSend(
                  ws,
                  JSON.stringify({
                    event: ackEvent,
                    payload: packetAck,
                    commands,
                  })
                );
              })
              .catch((err) => {
                console.error('[WebSocket] Ingest Error:', err);
                const packetAck = buildPacketAck({
                  sequence: parsedPayload.sequence,
                  receivedCount: parsedPayload.metricsToProcess.length,
                  addedReadingsCount: 0,
                  writeAck: {
                    persisted: false,
                    engine: 'Internal Server Error',
                    persistedCount: 0,
                    queuedForRetryCount: 0,
                    status: 'FAILED',
                  },
                  error: 'İç sunucu işleme hatası',
                });

                safeSend(
                  ws,
                  JSON.stringify({
                    event: ackEvent,
                    payload: packetAck,
                  })
                );
              });
          } else {
            const packetAck = buildPacketAck({
              sequence: parsedPayload.sequence,
              receivedCount: parsedPayload.metricsToProcess.length,
              addedReadingsCount: 0,
              writeAck: {
                persisted: false,
                engine: 'Authentication Failed',
                persistedCount: 0,
                queuedForRetryCount: 0,
                status: 'AUTH_FAILED',
              },
              error: authResult.errorResponse?.error || 'Doğrulama başarısız',
            });

            safeSend(
              ws,
              JSON.stringify({
                event: ackEvent,
                payload: packetAck,
              })
            );
          }
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
      if (ws.device) {
        deviceWsProtocolService.unregisterDeviceSocket(ws.device.id, ws);
      }
    });
  });

  return wss;
}

/**
 * Sends a command to a connected device via the Unified WebSocket Protocol.
 */
export function sendDeviceCommandViaWs(deviceId: string, command: DeviceCommand | any): boolean {
  return deviceWsProtocolService.sendDeviceCommand(deviceId, command);
}

/**
 * Checks if a device is currently connected via WebSocket.
 */
export function isDeviceConnectedViaWs(deviceId: string): boolean {
  return deviceWsProtocolService.isDeviceConnected(deviceId);
}

/**
 * Sends an OTA command to a connected device via WebSocket.
 */
export function sendOtaCommandViaWs(
  deviceId: string,
  version: string,
  downloadUrl: string,
  checksum?: string
): boolean {
  return deviceWsProtocolService.sendOtaCommand(deviceId, version, downloadUrl, checksum);
}
