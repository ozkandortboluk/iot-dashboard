import crypto from 'node:crypto';
import type pg from 'pg';
import { db } from '../db.js';
import { DatabaseState, type Device } from '../../types.js';
import { systemLogger } from './systemLogger.service.js';
import { isTestOrEphemeralArtifact } from '../database/postgres.js';

export interface ClusterSyncEvent {
  senderId: string;
  type: string;
  key?: string;
  value?: any;
  updatedAt?: string;
  device?: any;
  deviceId?: string;
  deviceIds?: string[];
  userId?: string;
  preferences?: any;
  payload?: any;
  isRestore?: boolean;
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
  // Tombstone registry to strictly prevent deleted devices from being resurrected by stale packets or echoes
  private deletedDeviceTombstones: Map<string, number> = new Map();

  public getNodeId(): string {
    return this.nodeId;
  }

  public getIsListening(): boolean {
    return this.isListening;
  }

  /**
   * Check whether a device has been marked as deleted.
   * If checkTimestamp is provided, returns true only if device was deleted on or after that timestamp.
   */
  public isDeviceDeleted(deviceId: string, checkTimestamp?: string | number): boolean {
    if (!deviceId) return false;
    const deletedAt = this.deletedDeviceTombstones.get(deviceId);
    if (!deletedAt) return false;
    if (checkTimestamp) {
      const checkTime = new Date(checkTimestamp).getTime();
      return checkTime <= deletedAt;
    }
    return true;
  }

  /**
   * Record a device deletion tombstone with timestamp.
   * Prunes entries older than 7 days to keep memory footprint bounded.
   */
  public recordDeviceDeletion(deviceId: string, deletedAt?: number): void {
    if (!deviceId) return;
    this.deletedDeviceTombstones.set(deviceId, deletedAt || Date.now());

    // Housekeeping: prune old tombstones (> 7 days)
    if (this.deletedDeviceTombstones.size > 200) {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (const [id, ts] of this.deletedDeviceTombstones.entries()) {
        if (ts < cutoff) {
          this.deletedDeviceTombstones.delete(id);
        }
      }
    }
  }

  /**
   * Remove device from tombstone registry (e.g. when explicit undelete/restore is triggered).
   */
  public clearDeviceTombstone(deviceId: string): void {
    if (!deviceId) return;
    this.deletedDeviceTombstones.delete(deviceId);
  }

  /**
   * Verify if a system setting has meaningful changes compared to current in-memory value.
   */
  public hasSettingChanged(key: string, newValue: any): boolean {
    const current = db.data.systemSettings?.[key];
    if (current === undefined && newValue === undefined) return false;
    if (current === newValue) return false;
    try {
      return JSON.stringify(current) !== JSON.stringify(newValue);
    } catch {
      return true;
    }
  }

  /**
   * Verify if device configuration or critical operational state has changed.
   */
  public hasDeviceChanged(existingDev: any, newDev: any): boolean {
    if (!existingDev) return true;
    const fields: (keyof Device)[] = [
      'name',
      'status',
      'type',
      'deviceType',
      'tenantId',
      'userId',
      'location',
      'ipAddress',
      'macAddress',
      'hardwareModel',
      'firmwareVersion',
      'otaStatus',
      'otaProgress',
      'rateLimitPerMin',
      'intervalMode',
      'expectedIntervalSeconds',
      'heartbeatTimeoutSeconds',
      'customIntervalSeconds',
      'isSimulated',
      'saveSimulatedDataToDb',
      'dataFlowActive',
      'powerSource',
    ];
    for (const f of fields) {
      if (newDev[f] !== undefined && existingDev[f] !== newDev[f]) {
        return true;
      }
    }
    if (newDev.outputDefinitions && JSON.stringify(existingDev.outputDefinitions) !== JSON.stringify(newDev.outputDefinitions)) {
      return true;
    }
    if (newDev.capabilities && JSON.stringify(existingDev.capabilities) !== JSON.stringify(newDev.capabilities)) {
      return true;
    }
    if (newDev.tags && JSON.stringify(existingDev.tags) !== JSON.stringify(newDev.tags)) {
      return true;
    }
    return false;
  }

  /**
   * Verify if user preferences actually changed.
   */
  public hasPreferencesChanged(user: any, newPrefs: any): boolean {
    if (!user || !user.preferences) return true;
    try {
      return JSON.stringify(user.preferences) !== JSON.stringify({ ...user.preferences, ...newPrefs });
    } catch {
      return true;
    }
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
   * Only logs and triggers broadcasts when ACTUAL data modifications occur.
   */
  public async handleIncomingEvent(event: ClusterSyncEvent): Promise<void> {
    if (!event || event.senderId === this.nodeId) {
      return; // Ignore own echoes
    }

    switch (event.type) {
      case 'system:settings:updated': {
        const { key, value, updatedAt } = event;
        if (!key || value === undefined) return;

        const incomingTime = updatedAt ? new Date(updatedAt).getTime() : Date.now();
        const existingTime = (db as any).systemSettingsTimestamps?.[key]
          ? new Date((db as any).systemSettingsTimestamps[key]).getTime()
          : 0;

        // Last-Write-Wins: Reject stale writes
        if (existingTime > 0 && incomingTime < existingTime) {
          return;
        }

        // Noise suppression: Only act if setting value actually changed
        if (!this.hasSettingChanged(key, value)) {
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

        db.saveData(db.data);
        db.broadcast('system:settings:updated', { key, value, updatedAt });
        systemLogger.info('system', `[ClusterSync] Sistem ayarı senkronize edildi: ${key}`);
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
          if (!this.hasPreferencesChanged(user, preferences)) {
            return; // No change, skip logging and broadcast
          }
          user.preferences = {
            ...(user.preferences || {}),
            ...preferences,
          };
          db.saveData(db.data);
          db.broadcast('user:preferences:updated', { userId, preferences, updatedAt });
          systemLogger.info('system', `[ClusterSync] Kullanıcı tercihleri senkronize edildi: ${userId}`);
        }
        break;
      }

      case 'device:updated': {
        const dev = event.device || event.payload?.device;
        if (!dev || !dev.id) return;

        const incomingTime = event.updatedAt
          ? new Date(event.updatedAt).getTime()
          : (dev.updatedAt ? new Date(dev.updatedAt).getTime() : Date.now());

        // 1. Tombstone check: If device was deleted, strictly prevent resurrection
        if (this.isDeviceDeleted(dev.id, incomingTime) && !event.isRestore && !(dev as any).isRestoring) {
          return;
        }

        const idx = db.data.devices.findIndex((d) => d.id === dev.id);
        if (idx >= 0) {
          const existingDev = db.data.devices[idx];
          const existingTime = existingDev.updatedAt ? new Date(existingDev.updatedAt).getTime() : 0;

          // Last-Write-Wins: Reject stale writes
          if (existingTime > 0 && incomingTime < existingTime) {
            return;
          }

          // Noise suppression: Check if device actually changed
          if (!this.hasDeviceChanged(existingDev, dev)) {
            return; // Unchanged data, silently ignore
          }

          db.data.devices[idx] = {
            ...existingDev,
            ...dev,
            updatedAt: new Date(incomingTime).toISOString(),
          };
        } else {
          // New device from cluster (or explicitly restored device)
          if (event.isRestore || (dev as any).isRestoring) {
            this.clearDeviceTombstone(dev.id);
          }
          db.data.devices.push({
            ...dev,
            updatedAt: new Date(incomingTime).toISOString(),
          });
        }

        db.saveData(db.data);
        db.broadcast('device:updated', dev);
        systemLogger.info('system', `[ClusterSync] Cihaz senkronize edildi: ${dev.name || dev.id}`);
        break;
      }

      case 'device:deleted': {
        const targetId = event.deviceId || event.device?.id || event.payload?.deviceId || event.payload?.id;
        if (!targetId) return;

        // Record tombstone so this device is never resurrected
        this.recordDeviceDeletion(targetId);

        const idx = db.data.devices.findIndex((d) => d.id === targetId);
        if (idx >= 0) {
          const removed = db.data.devices.splice(idx, 1)[0];
          if (!db.data.archivedDevices) db.data.archivedDevices = [];
          if (db.deviceRepository && typeof db.deviceRepository.createArchivedRecord === 'function') {
            db.deviceRepository.createArchivedRecord(removed, undefined, 'Küme Eş Zamanlama', 'Uzak Düğüm Tarafından Silindi')
              .then((archivedRecord: any) => {
                db.data.archivedDevices = [
                  archivedRecord,
                  ...db.data.archivedDevices.filter((a: any) => (a.id || a.device?.id) !== removed.id),
                ];
                db.saveData(db.data);
              }).catch(() => {});
          } else {
            db.saveData(db.data);
          }
        }

        // Clean up rules, active alarms, and telemetry cache
        if (db.data.rules) {
          db.data.rules = db.data.rules.filter((r: any) => r.deviceId !== targetId);
        }
        if (db.data.activeAlarms) {
          db.data.activeAlarms = db.data.activeAlarms.filter((a: any) => a.deviceId !== targetId);
        }
        if (db.telemetryRepository?.latestTelemetryCache) {
          delete db.telemetryRepository.latestTelemetryCache[targetId];
        }

        db.saveData(db.data);
        db.broadcast('device:deleted', { id: targetId });
        db.broadcast('devices:updated', db.data.devices);
        systemLogger.info('system', `[ClusterSync] Cihaz silme eş zamanlandı: ${targetId}`);
        break;
      }

      case 'devices:deleted': {
        const targetIds: string[] = event.deviceIds || event.payload?.deviceIds || [];
        if (!Array.isArray(targetIds) || targetIds.length === 0) return;

        const targetSet = new Set(targetIds);
        for (const id of targetIds) {
          this.recordDeviceDeletion(id);
        }

        const removedDevices: any[] = [];
        db.data.devices = db.data.devices.filter((d) => {
          if (targetSet.has(d.id)) {
            removedDevices.push(d);
            return false;
          }
          return true;
        });

        if (!db.data.archivedDevices) db.data.archivedDevices = [];
        for (const removed of removedDevices) {
          if (db.deviceRepository && typeof db.deviceRepository.createArchivedRecord === 'function') {
            db.deviceRepository.createArchivedRecord(removed, undefined, 'Küme Eş Zamanlama', 'Uzak Düğüm Tarafından Toplu Silindi')
              .then((archivedRecord: any) => {
                db.data.archivedDevices = [
                  archivedRecord,
                  ...db.data.archivedDevices.filter((a: any) => (a.id || a.device?.id) !== removed.id),
                ];
              }).catch(() => {});
          }
        }

        if (db.data.rules) {
          db.data.rules = db.data.rules.filter((r: any) => !targetSet.has(r.deviceId));
        }
        if (db.data.activeAlarms) {
          db.data.activeAlarms = db.data.activeAlarms.filter((a: any) => !targetSet.has(a.deviceId));
        }
        if (db.telemetryRepository?.latestTelemetryCache) {
          for (const id of targetIds) {
            delete db.telemetryRepository.latestTelemetryCache[id];
          }
        }

        db.saveData(db.data);
        for (const id of targetIds) {
          db.broadcast('device:deleted', { id });
        }
        db.broadcast('devices:updated', db.data.devices);
        systemLogger.info('system', `[ClusterSync] Toplu cihaz silme eş zamanlandı: ${targetIds.length} cihaz`);
        break;
      }

      case 'devices:reload': {
        try {
          const hydrated = await db.postgresRepo?.hydrateFromPostgres();
          if (hydrated?.devices) {
            db.data.devices = hydrated.devices;
            db.saveData(db.data);
            db.broadcast('devices:updated', db.data.devices);
            systemLogger.info('system', `[ClusterSync] Cihazlar PostgreSQL veritabanından yeniden yüklendi (${hydrated.devices.length} cihaz)`);
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

      // Execute catch-up sync to fetch any settings or devices updated while offline
      this.catchUpSync();
      this.startHeartbeatCatchUp();

    } catch (err: any) {
      this.isConnecting = false;
      this.cleanupListener();
      this.scheduleReconnect();
    }
  }

  /**
   * Catch up on any settings or devices modified in PostgreSQL since the last sync time.
   * Compares values to ensure zero duplicate notifications or broadcasts if state is already identical.
   */
  public async catchUpSync(): Promise<void> {
    if (!db.postgresRepo?.isReady()) return;
    try {
      // 1. Settings catch-up
      const res = await db.postgresRepo.query(
        `SELECT key, value, updated_at FROM system_settings WHERE updated_at > $1 ORDER BY updated_at ASC;`,
        [this.lastCatchUpAt]
      );

      let maxSettingTime = new Date(this.lastCatchUpAt).getTime();
      let updatedSettingsCount = 0;

      if (res?.rows && res.rows.length > 0) {
        for (const row of res.rows) {
          const rowTime = new Date(row.updated_at).getTime();
          if (rowTime > maxSettingTime) maxSettingTime = rowTime;

          let val = row.value;
          if (typeof val === 'string') {
            try { val = JSON.parse(val); } catch {}
          }

          if (this.hasSettingChanged(row.key, val)) {
            updatedSettingsCount++;
            await this.handleIncomingEvent({
              senderId: 'remote_sync_catchup',
              type: 'system:settings:updated',
              key: row.key,
              value: val,
              updatedAt: new Date(row.updated_at).toISOString(),
            });
          }
        }
      }
      this.lastCatchUpAt = new Date(Math.max(Date.now(), maxSettingTime)).toISOString();

      // 2. Active devices reconciliation against PostgreSQL devices table
      const activeDevsRes = await db.postgresRepo.query(`SELECT id FROM devices;`);
      if (activeDevsRes?.rows) {
        const activeIds = new Set(activeDevsRes.rows.map((r: any) => r.id));
        const orphanDevices = db.data.devices.filter(
          (d) => !activeIds.has(d.id) && !isTestOrEphemeralArtifact(d.id)
        );
        if (orphanDevices.length > 0) {
          const orphanIds = orphanDevices.map((d) => d.id);
          for (const id of orphanIds) {
            this.recordDeviceDeletion(id);
          }
          db.data.devices = db.data.devices.filter((d) => activeIds.has(d.id) || isTestOrEphemeralArtifact(d.id));
          db.saveData(db.data);
          for (const id of orphanIds) {
            db.broadcast('device:deleted', { id });
          }
          db.broadcast('devices:updated', db.data.devices);
          systemLogger.info('system', `[ClusterSync] Eş zamanlama mutabakatı: ${orphanIds.length} silinmiş cihaz temizlendi.`);
        }
      }

      if (updatedSettingsCount > 0) {
        console.log(`[ClusterSync] Yakalama senkronizasyonu tamamlandı: ${updatedSettingsCount} ayar güncellendi.`);
      }
    } catch (err: any) {
      console.warn('[ClusterSync] catchUpSync uyarısı:', err?.message || err);
    }
  }

  private startHeartbeatCatchUp() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    // Periodically run catch-up every 120 seconds as a safety net (PostgreSQL LISTEN/NOTIFY handles instant real-time events)
    this.heartbeatTimer = setInterval(() => {
      if (this.isListening && db.postgresRepo?.isReady()) {
        this.catchUpSync();
      }
    }, 120000);
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
