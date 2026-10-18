import crypto from 'node:crypto';
import type pg from 'pg';
import { db } from '../db.js';
import { DatabaseState } from '../../types.js';
import { systemLogger } from './systemLogger.service.js';

export interface ClusterSyncEvent {
  senderId: string;
  type: string;
  key?: string;
  value?: any;
  updatedAt?: string;
  device?: any;
  userId?: string;
  preferences?: any;
  payload?: any;
}

export class ClusterSyncService {
  private nodeId: string = `node_${process.env.NODE_ENV === 'production' ? 'prod' : 'dev'}_${crypto.randomBytes(4).toString('hex')}`;
  private listenerClient: pg.PoolClient | null = null;
  private isListening: boolean = false;
  private isConnecting: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private channelName: string = 'nexus_cluster_sync';
  private lastCatchUpAt: string = new Date(Date.now() - 60000).toISOString();

  public getNodeId(): string {
    return this.nodeId;
  }

  public getIsListening(): boolean {
    return this.isListening;
  }

  /**
   * Publish an event to the shared PostgreSQL cluster channel.
   * Both Local Development and Remote VPS listen on this channel for real-time state parity.
   */
  public async publish(type: string, data: Record<string, any>): Promise<void> {
    if (!db.postgresRepo?.isReady()) {
      return;
    }

    try {
      const event: ClusterSyncEvent = {
        senderId: this.nodeId,
        type,
        updatedAt: data.updatedAt || new Date().toISOString(),
        ...data,
      };

      const serialized = JSON.stringify(event);

      // PostgreSQL NOTIFY has an 8000 byte limit. If payload exceeds 7500 bytes,
      // dispatch a lightweight reload instruction instead of the full payload.
      if (serialized.length > 7500) {
        const reloadEvent: ClusterSyncEvent = {
          senderId: this.nodeId,
          type: `${type}:reload`,
          key: data.key,
          updatedAt: event.updatedAt,
        };
        await db.postgresRepo.query('SELECT pg_notify($1, $2)', [this.channelName, JSON.stringify(reloadEvent)]);
      } else {
        await db.postgresRepo.query('SELECT pg_notify($1, $2)', [this.channelName, serialized]);
      }
    } catch (err: any) {
      console.warn('[ClusterSync] pg_notify uyarısı:', err?.message || err);
    }
  }

  /**
   * Handle incoming cluster synchronization event from a remote node (Dev <-> VPS).
   */
  public async handleIncomingEvent(event: ClusterSyncEvent): Promise<void> {
    if (!event || event.senderId === this.nodeId) {
      return; // Ignore own echoes
    }

    systemLogger.info('system', `[ClusterSync] Eş zamanlama olayı alındı: ${event.type} (Node: ${event.senderId})`);

    switch (event.type) {
      case 'system:settings:updated': {
        const { key, value, updatedAt } = event;
        if (!key || value === undefined) return;

        const incomingTime = updatedAt ? new Date(updatedAt).getTime() : Date.now();
        const existingTime = (db as any).systemSettingsTimestamps?.[key]
          ? new Date((db as any).systemSettingsTimestamps[key]).getTime()
          : 0;

        // Last-Write-Wins: Reject stale writes
        if (incomingTime < existingTime) {
          return;
        }

        if (!db.data.systemSettings) {
          db.data.systemSettings = {};
        }
        db.data.systemSettings[key] = value;
        if ((db as any).systemSettingsTimestamps) {
          (db as any).systemSettingsTimestamps[key] = updatedAt || new Date().toISOString();
        }

        // Special handling for simulator configuration and state
        if (key === 'simulator_config') {
          try {
            const { setSimulatorConfig } = await import('./simulator.js');
            setSimulatorConfig(value);
          } catch {}
          db.broadcast('simulator:updated', value);
        }

        // Broadcast to all WebSocket clients connected to this node
        db.broadcast('system:settings:updated', { key, value, updatedAt });
        break;
      }

      case 'system:settings:updated:reload': {
        if (event.key) {
          try {
            const val = await db.postgresRepo?.getSystemSetting(event.key);
            if (val !== null && val !== undefined) {
              await this.handleIncomingEvent({
                senderId: event.senderId,
                type: 'system:settings:updated',
                key: event.key,
                value: val,
                updatedAt: event.updatedAt,
              });
            }
          } catch {}
        }
        break;
      }

      case 'user:preferences:updated': {
        const { userId, preferences, updatedAt } = event;
        if (!userId || !preferences) return;
        const user = db.data.users.find((u) => u.id === userId);
        if (user) {
          user.preferences = {
            ...(user.preferences || {}),
            ...preferences,
          };
          db.broadcast('user:preferences:updated', { userId, preferences, updatedAt });
        }
        break;
      }

      case 'device:updated': {
        const { device } = event;
        if (device && device.id) {
          const idx = db.data.devices.findIndex((d) => d.id === device.id);
          if (idx >= 0) {
            db.data.devices[idx] = { ...db.data.devices[idx], ...device };
          } else {
            db.data.devices.push(device);
          }
          db.broadcast('device:updated', device);
        }
        break;
      }

      case 'devices:reload': {
        try {
          const hydrated = await db.postgresRepo?.hydrateFromPostgres();
          if (hydrated?.devices) {
            db.data.devices = hydrated.devices;
            db.broadcast('devices:updated', db.data.devices);
          }
        } catch {}
        break;
      }

      default: {
        // Forward generic cluster event to local broadcast hook if matching
        if (event.payload) {
          db.broadcast(event.type, event.payload);
        }
        break;
      }
    }
  }

  /**
   * Start listening on the PostgreSQL Pub/Sub channel.
   * Acquires a dedicated connection from the pool and handles reconnection automatically.
   */
  public async startListener(): Promise<void> {
    if (this.isListening || this.isConnecting || !db.postgresRepo?.isReady()) {
      return;
    }

    const pool = db.postgresRepo.getPool();
    if (!pool) return;

    this.isConnecting = true;
    try {
      const client = await pool.connect();
      this.listenerClient = client;
      this.isListening = true;
      this.isConnecting = false;

      await client.query(`LISTEN ${this.channelName}`);
      console.log(`[ClusterSync] PostgreSQL küme eş zamanlama dinleyicisi aktif (${this.nodeId}). Kanal: ${this.channelName}`);

      client.on('notification', (msg) => {
        if (msg.channel === this.channelName && msg.payload) {
          try {
            const parsed = JSON.parse(msg.payload);
            this.handleIncomingEvent(parsed);
          } catch (e) {
            console.warn('[ClusterSync] JSON bildirim ayrıştırma hatası:', e);
          }
        }
      });

      client.on('error', (err) => {
        console.warn('[ClusterSync] Dinleyici istemci bağlantı hatası:', err?.message || err);
        this.cleanupListener();
        this.scheduleReconnect();
      });

      client.on('end', () => {
        console.log('[ClusterSync] Dinleyici istemci bağlantısı sonlandı.');
        this.cleanupListener();
        this.scheduleReconnect();
      });

      // Execute catch-up sync to fetch any settings updated while offline
      this.catchUpSync();
      this.startHeartbeatCatchUp();

    } catch (err: any) {
      this.isConnecting = false;
      this.cleanupListener();
      this.scheduleReconnect();
    }
  }

  /**
   * Catch up on any settings modified in PostgreSQL since the last sync time.
   */
  public async catchUpSync(): Promise<void> {
    if (!db.postgresRepo?.isReady()) return;
    try {
      const res = await db.postgresRepo.query(
        `SELECT key, value, updated_at FROM system_settings WHERE updated_at > $1 ORDER BY updated_at ASC;`,
        [this.lastCatchUpAt]
      );
      this.lastCatchUpAt = new Date().toISOString();

      if (res?.rows && res.rows.length > 0) {
        for (const row of res.rows) {
          let val = row.value;
          if (typeof val === 'string') {
            try { val = JSON.parse(val); } catch {}
          }
          await this.handleIncomingEvent({
            senderId: 'remote_sync_catchup',
            type: 'system:settings:updated',
            key: row.key,
            value: val,
            updatedAt: new Date(row.updated_at).toISOString(),
          });
        }
        console.log(`[ClusterSync] Yakalama senkronizasyonu tamamlandı: ${res.rows.length} ayar güncellendi.`);
      }
    } catch {}
  }

  private startHeartbeatCatchUp() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    // Periodically run catch-up every 60 seconds as a safety net
    this.heartbeatTimer = setInterval(() => {
      if (this.isListening && db.postgresRepo?.isReady()) {
        this.catchUpSync();
      }
    }, 60000);
  }

  public cleanupListener() {
    this.isListening = false;
    this.isConnecting = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.listenerClient) {
      try {
        this.listenerClient.removeAllListeners('notification');
        this.listenerClient.removeAllListeners('error');
        this.listenerClient.removeAllListeners('end');
        this.listenerClient.release();
      } catch {}
      this.listenerClient = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (db.postgresRepo?.isReady()) {
        this.startListener();
      }
    }, 5000);
  }
}

export const clusterSyncService = new ClusterSyncService();
