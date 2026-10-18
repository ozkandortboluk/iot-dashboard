import type http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { db } from '../db.js';
import type { User, TelemetryReading, Device, DashboardLayout, DeviceCommand } from '../../types.js';
import { deviceAuthService } from './deviceAuth.service.js';
import { telemetryService } from './telemetry.service.js';
import { commandService } from './command.service.js';
import { deviceWsProtocolService } from './deviceWsProtocol.service.js';
import { tenantSecurityService } from './tenantSecurity.service.js';
import { systemLogger } from './systemLogger.service.js';
import { isAllowedWsOrigin } from '../utils/corsOrigins.js';
import { parseWebSocketUpgradeUrl } from '../utils/wsUpgradePath.js';
export { isAllowedWsOrigin };

export interface AuthenticatedWebSocket extends WebSocket {
  isAuth?: boolean;
  user?: User;
  device?: Device;
  isAlive?: boolean;
  messageCount?: number;
  lastRateReset?: number;
  subscribedChannels?: Set<'physical' | 'simulation'>;
  sessionToken?: string;
  sessionId?: string;
}

const MAX_WS_PAYLOAD = 1024 * 1024; // 1MB max payload per frame
const MAX_BUFFERED_AMOUNT = 512 * 1024; // 512 KB soft limit
const TERMINATE_BUFFERED_AMOUNT = 2 * 1024 * 1024; // 2 MB hard limit
const WS_RATE_LIMIT_WINDOW_MS = 10000; // 10 seconds window
const WS_MAX_MESSAGES_PER_WINDOW = 120; // 120 messages per 10s allowed per socket

let wss: WebSocketServer | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
let watchdogInterval: NodeJS.Timeout | null = null;

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
async function resolveUser(token?: string | null): Promise<User | null> {
  if (!token || typeof token !== 'string' || token.trim() === '') {
    return null;
  }

  const clean = token.trim();
  // Fail-closed: in production, verify strictly against PostgreSQL authoritative state
  if ((process.env.NODE_ENV === 'production' || process.env.VPS_PRODUCTION === 'true') && !db.postgresRepo?.isReady()) {
    return null;
  }

  const session = await db.verifySessionAsync(clean);
  if (session?.user && (session.user.status === 'active' || !session.user.status) && session.user.status !== 'suspended' && !session.user.deletedAt) {
    return session.user;
  }

  return null;
}

// Physical device API key / Token verification helper for WebSocket connections
async function resolveDevice(token?: string | null, updateLastUsed = true): Promise<Device | null> {
  if (!token || typeof token !== 'string' || token.trim() === '') {
    return null;
  }

  const cleanToken = token.trim();
  // Fail-closed: in production, verify strictly against PostgreSQL authoritative state
  if ((process.env.NODE_ENV === 'production' || process.env.VPS_PRODUCTION === 'true') && !db.postgresRepo?.isReady()) {
    return null;
  }

  // Authoritative check against PostgreSQL if ready, fallback to in-memory in dev
  let foundDev: Device | null = null;
  if (db.postgresRepo?.isReady()) {
    foundDev = await db.postgresRepo.getDeviceByApiKey(cleanToken).catch(() => null);
  }
  // Production must not accept a stale in-memory device after PostgreSQL rejects its key.
  if (!foundDev && process.env.NODE_ENV !== 'production' && process.env.VPS_PRODUCTION !== 'true') {
    foundDev = db.getDeviceByApiKey(cleanToken) || null;
  }
  if (!foundDev) return null;

  // 1. API Key Revocation Check
  if (foundDev.apiKeyRevoked === true) {
    console.warn(`[WebSocket Auth] Cihaz API anahtarı iptal edilmiş (Revoked): ${foundDev.id} (${foundDev.name})`);
    return null;
  }

  // 2. API Key Expiry Check
  if (foundDev.apiKeyExpiresAt && (!Number.isFinite(new Date(foundDev.apiKeyExpiresAt).getTime()) || new Date(foundDev.apiKeyExpiresAt).getTime() <= Date.now())) {
    console.warn(`[WebSocket Auth] Cihaz API anahtarının süresi dolmuş (Expired): ${foundDev.id} (${foundDev.name})`);
    return null;
  }

  // 3. Update Last-Used Timestamp
  if (updateLastUsed) {
    foundDev.apiKeyLastUsedAt = new Date().toISOString();
    db.updateDevice(foundDev.id, { apiKeyLastUsedAt: foundDev.apiKeyLastUsedAt });
  }

  return foundDev;
}

/**
 * Actively disconnects any open WebSocket connections associated with a specific user.
 * Used during user session termination, password reset, role downgrade, suspension, or deletion.
 */
export function terminateUserSockets(userId: string, codeOrReason: number | string = 1008, maybeReason?: string): void {
  if (!wss) return;
  const code = typeof codeOrReason === 'number' ? codeOrReason : 1008;
  const reason = typeof codeOrReason === 'string' ? codeOrReason : (maybeReason || 'Session terminated');
  (wss.clients as Set<AuthenticatedWebSocket>).forEach((ws) => {
    if (ws.user?.id === userId) {
      try {
        ws.close(code, reason);
      } catch {
        ws.terminate();
      }
    }
  });
}

/**
 * Actively disconnects any open WebSocket connections associated with a specific device.
 * Used during API key revocation, rotation, or security lockouts.
 */
export function terminateDeviceSockets(deviceId: string, codeOrReason: number | string = 1008, maybeReason?: string): void {
  if (!wss) return;
  const code = typeof codeOrReason === 'number' ? codeOrReason : 1008;
  const reason = typeof codeOrReason === 'string' ? codeOrReason : (maybeReason || 'API key revoked');
  (wss.clients as Set<AuthenticatedWebSocket>).forEach((ws) => {
    if (ws.device?.id === deviceId) {
      try {
        ws.close(code, reason);
      } catch {
        ws.terminate();
      }
    }
  });
}

// Push initial state data to authenticated client
async function sendBootstrapData(ws: AuthenticatedWebSocket, user: User) {
  try {
    const userDevices = user.role === 'admin'
      ? db.getDevices()
      : db.getDevices(user.id, user.id);
    safeSend(ws, JSON.stringify({ event: 'devices:updated', payload: userDevices }));

    const userDashboard = await db.getDashboard(user.id);
    if (userDashboard) {
      safeSend(ws, JSON.stringify({ event: 'dashboard:layout', payload: userDashboard }));
    }

    if (user.role === 'admin') {
      db.getAlarms('usr_admin', undefined, { status: 'active' }).then(a => safeSend(ws, JSON.stringify({ event: 'alarms:updated', payload: a }))).catch((err: any) => console.error("[WebSocket DB Error]:", err.message || err));
    } else {
      db.getAlarms(user.id, user.id, { status: 'active' }).then(a => safeSend(ws, JSON.stringify({ event: 'alarms:updated', payload: a }))).catch((err: any) => console.error("[WebSocket DB Error]:", err.message || err));
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
  const tenantMemberships = db.data?.tenantMemberships || [];

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
    // Send single unified protocol frame only - no duplicate legacy frame to avoid race conditions!
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
          // Unified WebSocket Protocol Envelope Delivery (Single authoritative downlink)
          deviceWsProtocolService.sendDeviceCommand(client.device.id, cmd);
        }
      }
      return;
    }

    const clientUser = client.user!;
    const isAdmin = tenantSecurityService.isAdminUser(clientUser);
    const subChannels = client.subscribedChannels || new Set(['physical']);

    // 1. Telemetry broadcasts (Strict Physical vs Simulation Channel Isolation + Canonical Tenant Isolation)
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
            return dev && tenantSecurityService.canUserAccessDevice(clientUser, dev, tenantMemberships);
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
            return dev && tenantSecurityService.canUserAccessDevice(clientUser, dev, tenantMemberships);
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

    // 2. Devices list update broadcast (Canonical Tenant Filtering)
    if (event === 'devices:updated') {
      const filteredDevices = tenantSecurityService.filterDevicesForUser(clientUser, allDevices, tenantMemberships);
      safeSend(client, JSON.stringify({ event, payload: filteredDevices, timestamp: new Date().toISOString() }));
      return;
    }

    // 3. Single device created/updated/control/deleted broadcast (Canonical Tenant Filtering)
    if (event === 'device:created' || event === 'device:updated') {
      const dev = payload as Device;
      if (!isAdmin && !tenantSecurityService.canUserAccessDevice(clientUser, dev, tenantMemberships)) {
        return;
      }
      safeSend(client, JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
      return;
    }

    if (event === 'device:control') {
      const devId = (payload as any)?.deviceId;
      const dev = allDevices.find((d) => d.id === devId);
      if (!isAdmin && !tenantSecurityService.canUserAccessDevice(clientUser, dev, tenantMemberships)) {
        return;
      }
      safeSend(client, JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
      return;
    }

    if (event === 'device:deleted') {
      const deletedId = (payload as any)?.id;
      const dev = allDevices.find((d) => d.id === deletedId);
      if (!isAdmin && dev && !tenantSecurityService.canUserAccessDevice(clientUser, dev, tenantMemberships)) {
        return;
      }
      safeSend(client, JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
      return;
    }

    // 3b. Device status, hello, event, output changed broadcasts (Canonical Tenant Filtering)
    if (
      event === 'device:status' ||
      event === 'device:hello' ||
      event === 'device:event' ||
      event === 'device:output:changed' ||
      event.startsWith('device:ota:')
    ) {
      const targetDevId = (payload as any)?.deviceId || (payload as any)?.id;
      if (targetDevId) {
        const dev = allDevices.find((d) => d.id === targetDevId);
        if (!isAdmin && !tenantSecurityService.canUserAccessDevice(clientUser, dev, tenantMemberships)) {
          return;
        }
      }
      safeSend(client, JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
      return;
    }

    // 4. Notifications update broadcast
    if (event === 'notifications:updated') {
      if (isAdmin) {
        db.getNotifications().then(n => safeSend(client, JSON.stringify({ event, payload: n, timestamp: new Date().toISOString() }))).catch((err: any) => console.error("[WebSocket DB Error]:", err.message || err));
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

    // 5. Commands lifecycle events broadcast (Canonical Tenant-isolated for multi-tenant security)
    if (
      event === 'commands:updated' ||
      event === 'command:created' ||
      event === 'command:sent' ||
      event === 'command:acknowledged' ||
      event === 'command:executed' ||
      event === 'command:failed' ||
      event === 'command:expired' ||
      event === 'command:ack_confirmed' ||
      event.startsWith('command:')
    ) {
      if (isAdmin) {
        safeSend(client, JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
        return;
      }

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
        if (cmd.deviceId) {
          const dev = allDevices.find((d) => d.id === cmd.deviceId || d.apiKey === cmd.deviceId);
          if (dev && tenantSecurityService.canUserAccessDevice(clientUser, dev, tenantMemberships)) return true;
        }
        if (cmd.tenantId && cmd.tenantId === clientUser.id) return true;
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
      // Only administrators can discover unregistered physical devices
      if (isAdmin) {
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

    // 8a. Scoped User Profile update broadcast (Only to self or admin)
    if (event === 'user:profile:updated') {
      const p = payload as any;
      if (isAdmin || (p && p.userId === clientUser.id)) {
        safeSend(client, JSON.stringify({ event: 'user:profile:updated', payload, timestamp: new Date().toISOString() }));
      }
      return;
    }

    // 8b. OTA Updates broadcast (Tenant-filtered for regular users, global for admin)
    if (event === 'ota:updated') {
      if (isAdmin) {
        safeSend(client, JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
      } else {
        const jobs = ((payload as any)?.jobs || []).filter((j: any) => {
          const dev = allDevices.find((d) => d.id === j.deviceId);
          return dev && tenantSecurityService.canUserAccessDevice(clientUser, dev, tenantMemberships);
        });
        safeSend(client, JSON.stringify({ event, payload: { jobs }, timestamp: new Date().toISOString() }));
      }
      return;
    }

    // 9. Alarms update broadcast
    if (event === 'alarms:updated') {
      if (isAdmin) {
        db.getAlarms().then(a => safeSend(client, JSON.stringify({ event, payload: a, timestamp: new Date().toISOString() }))).catch((err: any) => console.error("[WebSocket DB Error]:", err.message || err));
      } else {
        db.getAlarms(clientUser.id, clientUser.id).then(a => safeSend(client, JSON.stringify({ event, payload: a, timestamp: new Date().toISOString() }))).catch((err: any) => console.error("[WebSocket DB Error]:", err.message || err));
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

    // 11. Notification queue & dispatch logs (Strict Admin only / Tenant isolation)
    if (event === 'notification-queue:updated' || event === 'dispatch-logs:updated' || event === 'system:events:updated' || event === 'system:event') {
      if (isAdmin) {
        safeSend(client, JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
      }
      return;
    }

    // 12. Firmware events (Admin only for management, filtered for devices/customers)
    if (event.startsWith('firmware:') || event === 'firmwares:updated') {
      if (isAdmin) {
        safeSend(client, JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
      }
      return;
    }

    // 13. System and User Settings Multi-Session Live Synchronization
    if (event === 'user:preferences:updated') {
      const p = payload as any;
      if (p && p.userId === clientUser.id) {
        safeSend(client, JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
      }
      return;
    }

    // Explicitly whitelisted general events
    if (
      event === 'system:settings:updated' ||
      event === 'simulator:updated' ||
      event === 'simulator:status' ||
      event === 'system:health'
    ) {
      safeSend(client, JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
      return;
    }

    // SEC-04: Drop unwhitelisted or unknown broadcast events to prevent accidental cross-tenant data leaks
    return;
  });
}

// Bind database broadcast hook for real-time decoupled event delivery
setImmediate(() => {
  if (typeof db !== 'undefined' && db && typeof db.setBroadcastHook === 'function') {
    db.setBroadcastHook(broadcast);
  }
});

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

export function stopWebSocketServer() {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
  }
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (wss) {
    try {
      (wss.clients as Set<AuthenticatedWebSocket>).forEach((client) => {
        try {
          client.close(1001, 'Server shutting down');
          client.terminate();
        } catch {}
      });
      wss.close();
    } catch {
      // ignore
    }
    wss = null;
  }
}

/**
 * SEC-06: Terminates other active WebSocket connections for a given user ID, preserving current session.
 */
export function terminateUserOtherSockets(userId: string, keepTokenOrId: string, code = 1008, reason = 'Other sessions revoked'): void {
  if (!wss || !userId) return;
  const cleanKeep = keepTokenOrId ? keepTokenOrId.trim() : '';
  (wss.clients as Set<AuthenticatedWebSocket>).forEach((client) => {
    if (client.user && client.user.id === userId) {
      if (client.sessionToken !== cleanKeep && client.sessionId !== cleanKeep) {
        try {
          client.close(code, reason);
          client.terminate();
        } catch {}
      }
    }
  });
}

/**
 * SEC-06: Terminates active WebSocket connections for a specific session token or session ID.
 */
export function terminateSessionSocket(tokenOrId: string, code = 1008, reason = 'Session logged out'): void {
  if (!wss || !tokenOrId) return;
  const clean = tokenOrId.trim();
  (wss.clients as Set<AuthenticatedWebSocket>).forEach((client) => {
    if (client.sessionToken === clean || client.sessionId === clean) {
      try {
        client.close(code, reason);
        client.terminate();
      } catch {}
    }
  });
}

export function initWebSocketServer(server: http.Server) {
  // Use noServer: true to cleanly handle HTTP upgrade events and avoid path collision
  wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_WS_PAYLOAD,
    handleProtocols: (protocols) => {
      // Never reflect a credential supplied as a subprotocol into the response headers.
      if (protocols.has('nexus-token')) return 'nexus-token';
      return false;
    },
  });
  wss.on('error', (err: any) => {
    systemLogger.error('websocket', 'WebSocket sunucu hatası', err?.message || err);
  });

  // Subscribe DB notification events to WebSocket broadcast
  db.onNotificationEvent((event, payload) => {
    broadcast(event, payload);
  });

  // Subscribe systemLogger live events to real-time WebSocket broadcast
  systemLogger.onLog((event) => {
    broadcast('system:event', event);
  });

  // Centralized periodic device watchdog status checker (Fixed 10s cadence, independent of UI/API queries)
  if (watchdogInterval) clearInterval(watchdogInterval);
  watchdogInterval = setInterval(async () => {
    try {
      const statusChanged = await db.checkDeviceStatuses();
      if (statusChanged) {
        broadcast('devices:updated', db.getDevices());
        broadcast('network:updated', db.getDiscoveredDevices());
        const n = await db.getNotifications();
        broadcast('notifications:updated', n);
      }
    } catch (err: any) {
      console.error('[WebSocket DB Error]:', err?.message || err);
    }
  }, 10000);

  // Setup server-level HTTP upgrade routing
  server.on('upgrade', async (request, socket, head) => {
    socket.on('error', (err: any) => {
      systemLogger.warn('websocket', 'İstemci socket upgrade hatası', err?.message || err);
    });
    try {
      const origin = request.headers?.origin as string | undefined;
      if (origin && !isAllowedWsOrigin(origin)) {
        console.warn(`[WebSocket Security] Cross-Site WebSocket Hijacking attempt blocked from origin: ${origin}`);
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      // Parse relative upgrade targets against a fixed base, never an untrusted Host header.
      const urlObj = parseWebSocketUpgradeUrl(request.url);

      if (urlObj) {
        let connectionToken: string | null = null;

        // 1. Extract Token from Cookie, Authorization header, X-API-KEY, Sec-WebSocket-Protocol, or Query string
        if (request.headers?.cookie) {
          const match = request.headers.cookie.match(/nexus_session_token=([^;]+)/);
          if (match && match[1]) {
            connectionToken = decodeURIComponent(match[1]).trim();
          }
        }
        if (!connectionToken && request.headers?.authorization) {
          const authHeader = request.headers.authorization;
          connectionToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
        } else if (!connectionToken && request.headers?.['x-api-key']) {
          connectionToken = String(request.headers['x-api-key']).trim();
        } else if (!connectionToken && request.headers?.['sec-websocket-protocol']) {
          const rawProtocols = String(request.headers['sec-websocket-protocol'])
            .split(',')
            .map((p) => p.trim());
          for (const p of rawProtocols) {
            if (p !== 'nexus-token' && p !== 'bearer' && p !== 'nexus-auth' && p.length > 5) {
              connectionToken = p;
              break;
            }
          }
          if (!connectionToken && rawProtocols[0] && rawProtocols[0] !== 'nexus-token') {
            connectionToken = rawProtocols[0];
          }
        }
        // Resilient fallback: Support query token (?token=... or ?apiKey=...) for IoT hardware devices
        // and browser iframe environments where headers and third-party cookies are restricted
        if (!connectionToken) {
          const queryToken = urlObj.searchParams.get('token') || urlObj.searchParams.get('apiKey');
          if (queryToken && queryToken.trim()) {
            connectionToken = queryToken.trim();
          }
        }

        // 2. Validate Token
        let user = null;
        let device = null;
        if (connectionToken) {
          user = await resolveUser(connectionToken);
          if (!user) {
            device = await resolveDevice(connectionToken);
          }
        }

        // Strict 401 Unauthorized for Unauthenticated or Invalid WebSocket Upgrade Requests
        if (!user && !device) {
          socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
          socket.destroy();
          return;
        }

        // Strict Fail-Closed Check in Production:
        // When in production (or strict maintenance mode), PostgreSQL must be READY before accepting authenticated WebSocket connections.
        if ((process.env.NODE_ENV === 'production' || process.env.VPS_PRODUCTION === 'true') && !db.postgresRepo?.isReady()) {
          console.warn('[WebSocket Security] WebSocket upgrade reddedildi (503 Service Unavailable): PostgreSQL üretim modunda hazır değil.');
          socket.write('HTTP/1.1 503 Service Unavailable\r\nRetry-After: 5\r\n\r\n');
          socket.destroy();
          return;
        }

        wss!.handleUpgrade(request, socket, head, (ws: AuthenticatedWebSocket) => {
          ws.isAuth = Boolean(user || device);
          ws.user = user || undefined;
          ws.device = device || undefined;
          ws.sessionToken = connectionToken || undefined;
          wss!.emit('connection', ws, request);
        });
      } else {
        // Reject unsupported upgrade paths instead of leaving sockets open.
        socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
        socket.destroy();
      }
    } catch (err) {
      console.error('[WebSocket] Upgrade error:', err);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  });

  // Server-side heartbeat to terminate dead connections and revoke invalidated sessions (SEC-06)
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(async () => {
    if (!wss) return;
    for (const ws of Array.from(wss.clients as Set<AuthenticatedWebSocket>)) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;

      // Periodic security validation of active sessions and accounts
      if (ws.user) {
        // SEC-06: Authoritatively verify session token against database/state
        if (!ws.sessionToken) {
          try { ws.close(1008, 'Session credentials missing'); ws.terminate(); } catch {}
          continue;
        }
        if (ws.sessionToken) {
          try {
            const verifiedSession = await db.verifySessionAsync(ws.sessionToken);
            if (!verifiedSession || !verifiedSession.user) {
              try { ws.close(1008, 'Session revoked or expired'); ws.terminate(); } catch {}
              continue;
            }
          } catch {
            try { ws.close(1008, 'Session verification failed'); ws.terminate(); } catch {}
            continue;
          }
        }

        // Authoritatively verify user status and non-deleted state
        let currentUser: any;
        try {
          const users = await db.getUsersAsync();
          currentUser = users.find((u: any) => u.id === ws.user!.id);
        } catch {
          // Production must not authorize an account using stale in-memory state.
          if (process.env.NODE_ENV === 'production' || process.env.VPS_PRODUCTION === 'true') {
            try { ws.close(1008, 'Account verification failed'); ws.terminate(); } catch {}
            continue;
          }
          currentUser = db.getUsers().find((u: any) => u.id === ws.user!.id);
        }
        if (!currentUser || currentUser.status === 'suspended' || currentUser.deletedAt) {
          try { ws.close(1008, 'Account suspended or deleted'); ws.terminate(); } catch {}
          continue;
        }
        // Dynamic role synchronization
        if (ws.user.role !== currentUser.role) {
          ws.user = { ...currentUser };
        }
      }

      // Device credentials can be revoked after the handshake; revalidate each heartbeat.
      if (ws.device) {
        if (!ws.sessionToken) {
          try { ws.close(1008, 'Device credentials missing'); ws.terminate(); } catch {}
          continue;
        }
        try {
          const currentDevice = await resolveDevice(ws.sessionToken, false);
          if (!currentDevice || currentDevice.id !== ws.device.id) {
            try { ws.close(1008, 'Device credentials revoked or expired'); ws.terminate(); } catch {}
            continue;
          }
          ws.device = currentDevice;
        } catch {
          try { ws.close(1008, 'Device verification failed'); ws.terminate(); } catch {}
          continue;
        }
      }

      try {
        ws.ping();
      } catch {
        ws.terminate();
      }
    }
  }, 30000);

  wss.on('connection', (ws: AuthenticatedWebSocket, req?: http.IncomingMessage) => {
    ws.isAlive = true;
    ws.messageCount = 0;
    ws.lastRateReset = Date.now();

    ws.on('pong', () => {
      ws.isAlive = true;
      if (ws.device?.id) {
        deviceWsProtocolService.handleDevicePong(ws.device.id);
      }
    });

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

    // If connection was already authenticated during HTTP Upgrade (via HttpOnly session cookie or token),
    // immediately confirm auth:success so client transitions to connected without double-auth race conditions
    if (ws.isAuth && ws.user) {
      safeSend(
        ws,
        JSON.stringify({
          event: 'auth:success',
          payload: { user: ws.user, authenticated: true, source: 'handshake' },
        })
      );
      sendBootstrapData(ws, ws.user);
    } else if (ws.isAuth && ws.device) {
      deviceWsProtocolService.registerDeviceSocket(ws.device.id, ws);
      safeSend(
        ws,
        JSON.stringify({
          event: 'auth:success',
          payload: {
            type: 'device',
            deviceId: ws.device.id,
            deviceName: ws.device.name,
            status: 'online',
            source: 'handshake',
          },
        })
      );
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

          // 1. Explicit token provided in message
          if (token && typeof token === 'string' && token.trim()) {
            const verifiedUser = await resolveUser(token);
            if (verifiedUser) {
              ws.isAuth = true;
              ws.user = verifiedUser;
              ws.device = undefined;
              ws.sessionToken = token.trim();
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

            const verifiedDevice = await resolveDevice(token);
            if (verifiedDevice) {
              ws.isAuth = true;
              ws.device = verifiedDevice;
              ws.user = undefined;
              ws.sessionToken = token.trim();
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
          }

          // 2. If token in message is absent/empty BUT connection was ALREADY authenticated on HTTP Upgrade (HttpOnly cookie)
          if (ws.isAuth && ws.user) {
            safeSend(
              ws,
              JSON.stringify({
                event: 'auth:success',
                payload: { user: ws.user, authenticated: true, source: 'session_cookie' },
              })
            );
            return;
          }

          if (ws.isAuth && ws.device) {
            safeSend(
              ws,
              JSON.stringify({
                event: 'auth:success',
                payload: {
                  type: 'device',
                  deviceId: ws.device.id,
                  deviceName: ws.device.name,
                  status: 'online',
                  source: 'handshake',
                },
              })
            );
            return;
          }

          // 3. Neither message token nor cookie authentication succeeded
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
            const dev = await resolveDevice(parsed.token || parsed.apiKey);
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
          const targetDevice = ws.device || (parsed.token ? await resolveDevice(parsed.token) : null);
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
  checksum?: string,
  extraSecurity?: { signature?: string; keyId?: string; bootNonce?: string; downloadToken?: string }
): boolean {
  return deviceWsProtocolService.sendOtaCommand(deviceId, version, downloadUrl, checksum, extraSecurity);
}
