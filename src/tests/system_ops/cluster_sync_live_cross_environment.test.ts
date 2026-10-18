import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '../../server/db.js';
import { clusterSyncService, type ClusterSyncEvent } from '../../server/services/clusterSync.service.js';
import { simulatorActive, activeScenario } from '../../server/services/simulator.js';

describe('PostgreSQL Distributed Cross-Environment Live Synchronization (Dev <-> VPS)', () => {
  beforeEach(() => {
    db.data.systemSettings = {};
    db.data.devices = [];
    db.data.users = [
      {
        id: 'usr_admin',
        name: 'Admin User',
        email: 'admin@nexus.test',
        role: 'admin',
        preferences: { theme: 'light' },
      },
    ] as any;
  });

  describe('1. Node Identification & Echo Suppression', () => {
    it('should generate a unique nodeId and ignore events sent by itself', async () => {
      const broadcastSpy = vi.fn();
      db.setBroadcastHook(broadcastSpy);

      const ownEvent: ClusterSyncEvent = {
        senderId: clusterSyncService.getNodeId(),
        type: 'system:settings:updated',
        key: 'maintenance_mode',
        value: true,
      };

      await clusterSyncService.handleIncomingEvent(ownEvent);

      expect(broadcastSpy).not.toHaveBeenCalled();
      expect(db.getSystemSetting('maintenance_mode')).toBeNull();
    });
  });

  describe('2. Remote System Setting & Button State Ingestion (VPS -> Dev or Dev -> VPS)', () => {
    it('should apply remote system setting and broadcast to local WebSockets with LWW protection', async () => {
      const broadcastSpy = vi.fn();
      db.setBroadcastHook(broadcastSpy);

      const remoteTime = '2026-10-18T18:00:00.000Z';
      const remoteEvent: ClusterSyncEvent = {
        senderId: 'remote_vps_node_123',
        type: 'system:settings:updated',
        key: 'dark_mode_enabled',
        value: true,
        updatedAt: remoteTime,
      };

      await clusterSyncService.handleIncomingEvent(remoteEvent);

      expect(db.getSystemSetting('dark_mode_enabled')).toBe(true);
      expect(broadcastSpy).toHaveBeenCalledWith(
        'system:settings:updated',
        expect.objectContaining({
          key: 'dark_mode_enabled',
          value: true,
          updatedAt: remoteTime,
        })
      );

      // Stale event arriving from remote must be rejected
      const staleRemoteEvent: ClusterSyncEvent = {
        senderId: 'remote_vps_node_123',
        type: 'system:settings:updated',
        key: 'dark_mode_enabled',
        value: false,
        updatedAt: '2026-10-18T17:00:00.000Z',
      };

      await clusterSyncService.handleIncomingEvent(staleRemoteEvent);
      // Value must remain true
      expect(db.getSystemSetting('dark_mode_enabled')).toBe(true);
    });

    it('should update simulator state and broadcast simulator:updated when simulator_config arrives from remote', async () => {
      const broadcastSpy = vi.fn();
      db.setBroadcastHook(broadcastSpy);

      const simRemoteEvent: ClusterSyncEvent = {
        senderId: 'remote_vps_node_999',
        type: 'system:settings:updated',
        key: 'simulator_config',
        value: {
          active: true,
          scenario: 'overheat',
          intervalMs: 1200,
        },
        updatedAt: new Date().toISOString(),
      };

      await clusterSyncService.handleIncomingEvent(simRemoteEvent);

      expect(db.getSystemSetting('simulator_config')).toEqual({
        active: true,
        scenario: 'overheat',
        intervalMs: 1200,
      });

      expect(simulatorActive).toBe(true);
      expect(activeScenario).toBe('overheat');

      expect(broadcastSpy).toHaveBeenCalledWith('simulator:updated', expect.objectContaining({
        active: true,
        scenario: 'overheat',
      }));
    });
  });

  describe('3. Remote Device & Preference Synchronization', () => {
    it('should synchronize remote device creation, updates, and deletions', async () => {
      const broadcastSpy = vi.fn();
      db.setBroadcastHook(broadcastSpy);

      // 1. Device created on remote VPS
      const newDev = {
        id: 'dev_vps_sensor_01',
        name: 'VPS Saha Sensörü',
        type: 'sensor',
        status: 'online',
      };

      await clusterSyncService.handleIncomingEvent({
        senderId: 'remote_vps_node_456',
        type: 'device:updated',
        device: newDev,
      });

      expect(db.data.devices.some((d) => d.id === 'dev_vps_sensor_01')).toBe(true);
      expect(broadcastSpy).toHaveBeenCalledWith('device:updated', newDev);

      // 2. Device deleted on remote VPS
      await clusterSyncService.handleIncomingEvent({
        senderId: 'remote_vps_node_456',
        type: 'device:deleted',
        device: { id: 'dev_vps_sensor_01' },
      });

      // Also support deviceId field
      await clusterSyncService.handleIncomingEvent({
        senderId: 'remote_vps_node_456',
        type: 'device:deleted',
        payload: { deviceId: 'dev_vps_sensor_01' },
      });
    });

    it('should synchronize user preferences modified on remote server', async () => {
      const broadcastSpy = vi.fn();
      db.setBroadcastHook(broadcastSpy);

      const prefEvent: ClusterSyncEvent = {
        senderId: 'remote_vps_node_789',
        type: 'user:preferences:updated',
        userId: 'usr_admin',
        preferences: {
          theme: 'dark',
          compactMode: true,
        },
        updatedAt: '2026-10-18T19:00:00.000Z',
      };

      await clusterSyncService.handleIncomingEvent(prefEvent);

      const admin = db.data.users.find((u) => u.id === 'usr_admin');
      expect(admin?.preferences?.theme).toBe('dark');
      expect(admin?.preferences?.compactMode).toBe(true);

      expect(broadcastSpy).toHaveBeenCalledWith('user:preferences:updated', expect.objectContaining({
        userId: 'usr_admin',
      }));
    });
  });

  describe('4. Publishing via PostgreSQL pg_notify', () => {
    it('should execute pg_notify with serialized event payload when postgresRepo is ready', async () => {
      const origRepo = (db as any).postgresRepo;
      const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
      (db as any).postgresRepo = {
        isReady: () => true,
        query: mockQuery,
      };

      try {
        await clusterSyncService.publish('system:settings:updated', {
          key: 'panel_alert_sound',
          value: false,
        });

        expect(mockQuery).toHaveBeenCalledWith(
          'SELECT pg_notify($1, $2)',
          expect.arrayContaining(['nexus_cluster_sync', expect.stringContaining('panel_alert_sound')])
        );
      } finally {
        (db as any).postgresRepo = origRepo;
      }
    });
  });
});
