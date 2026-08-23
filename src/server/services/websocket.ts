import type http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { db } from '../db.js';
import type { User, TelemetryReading, Device, DashboardLayout } from '../../types.js';
import { deviceAuthService } from './deviceAuth.service.js';
import { telemetryService } from './telemetry.service.js';
import { commandService } from './command.service.js';

export interface AuthenticatedWebSocket extends WebSocket {
  isAuth?: boolean;
  user?: User;
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

    // Default channels assignment if not already set
    if (!ws.subscribedChannels) {
      ws.subscribedChannels = user.role === 'admin'
        ? new Set(['physical', 'simulation'])
        : new Set(['physical']);
    }

    const recentTelemetries = db.getTelemetry(undefined, undefined, 50, user.id, user.role === 'admin' ? undefined : user.id);
    if (recentTelemetries && recentTelemetries.length > 0) {
      const physicalTelemetries = recentTelemetries.filter((r) => r.source === 'physical' || (!r.source && r.environment !== 'sandbox'));
      const simTelemetries = recentTelemetries.filter((r) => r.source === 'simulator' || r.source === 'manual_test' || r.environment === 'sandbox');

      if (physicalTelemetries.length > 0 && ws.subscribedChannels.has('physical')) {
        safeSend(ws, JSON.stringify({ event: 'telemetry:physical:batch', payload: physicalTelemetries }));
        safeSend(ws, JSON.stringify({ event: 'telemetry:batch', payload: physicalTelemetries }));
      }

      if (simTelemetries.length > 0 && user.role === 'admin' && ws.subscribedChannels.has('simulation')) {
        safeSend(ws, JSON.stringify({ event: 'telemetry:simulation:batch', payload: simTelemetries }));
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
    if (!client.isAuth || !client.user) {
      if (['simulator:updated', 'system:connected', 'ping'].includes(event)) {
        safeSend(client, JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
      }
      return;
    }

    const clientUser = client.user;
    const isAdmin = clientUser.role === 'admin';
    const subChannels = client.subscribedChannels || (isAdmin ? new Set(['physical', 'simulation']) : new Set(['physical']));

    // 1. Telemetry broadcasts (Strict Physical vs Simulation Channel Isolation)
    if (
      event === 'telemetry:new' ||
      event === 'telemetry:batch' ||
      event === 'telemetry:physical:new' ||
      event === 'telemetry:physical:batch' ||
      event === 'telemetry:simulation:new' ||
      event === 'telemetry:simulation:batch' ||
      event === 'simulator:batch' ||
      event === 'simulator:telemetry'
    ) {
      let readings: TelemetryReading[] = [];
      if (Array.isArray(payload)) {
        readings = payload as TelemetryReading[];
      } else if (payload && (payload as TelemetryReading).deviceId) {
        readings = [payload as TelemetryReading];
      }

      if (readings.length === 0) return;

      // Classify readings based on origin
      const isSimEvent = event.startsWith('telemetry:simulation') || event.startsWith('simulator:');
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

      // Deliver PHYSICAL channel readings
      if (physicalReadings.length > 0 && subChannels.has('physical')) {
        let allowedPhysical = physicalReadings;
        if (!isAdmin) {
          allowedPhysical = physicalReadings.filter((r) => {
            const dev = allDevices.find((d) => d.id === r.deviceId);
            return dev && dev.userId === clientUser.id;
          });
        }

        if (allowedPhysical.length > 0) {
          const timestamp = new Date().toISOString();
          if (allowedPhysical.length === 1) {
            safeSend(client, JSON.stringify({ event: 'telemetry:physical:new', payload: allowedPhysical[0], timestamp }));
            safeSend(client, JSON.stringify({ event: 'telemetry:new', payload: allowedPhysical[0], timestamp }));
          } else {
            safeSend(client, JSON.stringify({ event: 'telemetry:physical:batch', payload: allowedPhysical, timestamp }));
            safeSend(client, JSON.stringify({ event: 'telemetry:batch', payload: allowedPhysical, timestamp }));
          }
        }
      }

      // Deliver SIMULATION channel readings
      // 1. KURAL / STRICT TENANT ISOLATION: Non-admins NEVER receive simulation readings.
      // Admins receive simulation readings ONLY if subscribed to 'simulation'.
      if (simulationReadings.length > 0 && isAdmin && subChannels.has('simulation')) {
        const timestamp = new Date().toISOString();
        if (simulationReadings.length === 1) {
          safeSend(client, JSON.stringify({ event: 'telemetry:simulation:new', payload: simulationReadings[0], timestamp }));
          safeSend(client, JSON.stringify({ event: 'simulator:telemetry', payload: simulationReadings[0], timestamp }));
          safeSend(client, JSON.stringify({ event: 'telemetry:new', payload: simulationReadings[0], timestamp }));
        } else {
          safeSend(client, JSON.stringify({ event: 'telemetry:simulation:batch', payload: simulationReadings, timestamp }));
          safeSend(client, JSON.stringify({ event: 'simulator:batch', payload: simulationReadings, timestamp }));
          safeSend(client, JSON.stringify({ event: 'telemetry:batch', payload: simulationReadings, timestamp }));
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
    ws.user = undefined;
    ws.messageCount = 0;
    ws.lastRateReset = Date.now();

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Check if valid session token exists in URL query params
    if (req?.url) {
      try {
        const urlObj = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
        const token = urlObj.searchParams.get('token');

        if (token) {
          const verifiedUser = resolveUser(token);
          if (verifiedUser) {
            ws.isAuth = true;
            ws.user = verifiedUser;
            console.log(`[WebSocket] URL token ile anında doğrulandı: ${verifiedUser.name} (${verifiedUser.role})`);
          }
        }
      } catch {
        // Ignore parse error
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
        },
      })
    );

    // Push initial bootstrap data ONLY if user is authenticated
    if (ws.isAuth && ws.user) {
      sendBootstrapData(ws, ws.user);
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
        console.warn(`[WebSocket] Hız sınırı aşıldı: ${ws.user?.name || 'Anonim'}`);
        safeSend(ws, JSON.stringify({ event: 'error', error: 'Mesaj sınırı aşıldı.' }));
        return;
      }

      try {
        const parsed = JSON.parse(data.toString());

        // Authentication message from client (REQUIRES VALID SESSION TOKEN ONLY)
        if (parsed.event === 'auth' || parsed.type === 'auth') {
          const token = parsed.token || parsed.sessionToken;
          const verifiedUser = resolveUser(token);

          if (verifiedUser) {
            ws.isAuth = true;
            ws.user = verifiedUser;
            console.log(`[WebSocket] Kimlik başarıyla doğrulandı: ${verifiedUser.name} (${verifiedUser.role})`);
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
            ws.isAuth = false;
            ws.user = undefined;
            console.warn(`[WebSocket] Doğrulama başarısız: Geçersiz veya süresi dolmuş oturum anahtarı.`);
            safeSend(
              ws,
              JSON.stringify({
                event: 'auth:failed',
                error: 'Geçersiz veya süresi dolmuş oturum anahtarı.',
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

        // Channel Subscription handler: { event: "subscribe", channels: ["physical"] | ["simulation"] | ["physical", "simulation"] }
        if (parsed.event === 'subscribe' || parsed.type === 'subscribe') {
          const requestedChannels: string[] = Array.isArray(parsed.channels)
            ? parsed.channels
            : typeof parsed.channel === 'string'
            ? [parsed.channel]
            : [];

          if (!ws.subscribedChannels) {
            ws.subscribedChannels = ws.user?.role === 'admin'
              ? new Set(['physical', 'simulation'])
              : new Set(['physical']);
          }

          const approvedChannels: string[] = [];
          for (const ch of requestedChannels) {
            if (ch === 'physical') {
              ws.subscribedChannels.add('physical');
              approvedChannels.push('physical');
            } else if (ch === 'simulation') {
              // 1. Kural: Simülasyon kanalı YALNIZCA yöneticilere açıktır.
              if (ws.user?.role === 'admin') {
                ws.subscribedChannels.add('simulation');
                approvedChannels.push('simulation');
              } else {
                console.warn(`[WebSocket] Müşteri kullanıcısı (${ws.user?.name || ws.user?.id || 'Anonim'}) yetkisiz simülasyon kanalına abone olmaya çalıştı. Güvenlik nedeniyle reddedildi.`);
              }
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
              .then(({ addedReadings, writeAck }) => {
                const commands = commandService.getAndDeliverPendingCommands(device.id);
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
      // Clean disconnect
    });
  });

  return wss;
}
