import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '../../server/db.js';
import {
  initSimulator,
  setSimulatorActive,
  setSimulatorConfig,
  simulatorActive,
  simulatorIntervalMs,
  activeScenario,
} from '../../server/services/simulator.js';

describe('Authoritative System Settings & User Preferences Multi-Session Persistence Suite', () => {
  beforeEach(() => {
    // Reset test in-memory state
    db.data.systemSettings = {};
    db.data.users = [
      {
        id: 'usr_alice',
        name: 'Alice Admin',
        email: 'alice@nexusnodeiot.com.tr',
        role: 'admin',
        created_at: new Date().toISOString(),
        preferences: {
          theme: 'dark',
          updatedAt: '2026-10-18T10:00:00.000Z',
        },
      },
      {
        id: 'usr_bob',
        name: 'Bob Operator',
        email: 'bob@nexusnodeiot.com.tr',
        role: 'operator',
        created_at: new Date().toISOString(),
        preferences: {
          theme: 'light',
          updatedAt: '2026-10-18T10:00:00.000Z',
        },
      },
    ] as any;
  });

  describe('1. System Settings Persistence & LWW Resolution', () => {
    it('should save and retrieve system settings in database', async () => {
      const broadcastSpy = vi.fn();
      db.setBroadcastHook(broadcastSpy);

      const success = await db.saveSystemSetting('telemetry_rate_limit', { maxPerMin: 120 });
      expect(success).toBe(true);

      const retrieved = db.getSystemSetting<{ maxPerMin: number }>('telemetry_rate_limit');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.maxPerMin).toBe(120);

      expect(broadcastSpy).toHaveBeenCalledWith(
        'system:settings:updated',
        expect.objectContaining({
          key: 'telemetry_rate_limit',
          value: { maxPerMin: 120 },
        })
      );
    });

    it('should enforce Last-Write-Wins (LWW): reject older timestamps and accept newer timestamps', async () => {
      const time1 = '2026-10-18T12:00:00.000Z';
      const time2 = '2026-10-18T11:00:00.000Z'; // 1 hour earlier (stale)
      const time3 = '2026-10-18T13:00:00.000Z'; // 1 hour later (newer)

      // Step 1: Write initial setting with time1
      await db.saveSystemSetting('system_mode', { mode: 'maintenance', updatedAt: time1 }, time1);
      expect(db.getSystemSetting('system_mode')).toEqual({ mode: 'maintenance', updatedAt: time1 });

      // Step 2: Attempt stale write with time2 (older)
      const staleResult = await db.saveSystemSetting('system_mode', { mode: 'active', updatedAt: time2 }, time2);
      expect(staleResult).toBe(false);
      // Value must remain the time1 value
      expect(db.getSystemSetting('system_mode')).toEqual({ mode: 'maintenance', updatedAt: time1 });

      // Step 3: Write newer setting with time3
      const newerResult = await db.saveSystemSetting('system_mode', { mode: 'active', updatedAt: time3 }, time3);
      expect(newerResult).toBe(true);
      expect(db.getSystemSetting('system_mode')).toEqual({ mode: 'active', updatedAt: time3 });
    });
  });

  describe('2. Simulator Configuration Update-Resilience Across Restarts', () => {
    it('should restore simulator active state and scenario from persisted database setting on initSimulator', async () => {
      // Admin configures and saves simulator settings
      const adminConfig = {
        active: true,
        intervalMs: 1500,
        activeScenario: 'overheat',
        anomalyProbability: 0.15,
        updatedAt: new Date().toISOString(),
      };
      await db.saveSystemSetting('simulator_config', adminConfig);

      // Simulate server reboot / container restart
      setSimulatorActive(false);
      expect(simulatorActive).toBe(false);

      // System boots up and calls initSimulator()
      const bootedActive = initSimulator();
      expect(bootedActive).toBe(true);
      expect(simulatorActive).toBe(true);
      expect(simulatorIntervalMs).toBe(1500);
      expect(activeScenario).toBe('overheat');
    });

    it('should respect admin turning simulator OFF and retain OFF state after restart', async () => {
      const adminConfig = {
        active: false,
        intervalMs: 3000,
        activeScenario: 'normal',
        updatedAt: new Date().toISOString(),
      };
      await db.saveSystemSetting('simulator_config', adminConfig);

      initSimulator();
      expect(simulatorActive).toBe(false);
    });
  });

  describe('3. Per-User Isolation & Real-Time Multi-Session Synchronization', () => {
    it('should isolate preferences between different users', async () => {
      await db.updateUserProfile('usr_alice', {
        preferences: {
          theme: 'dark',
          buttonStates: { autoScroll: true, compactView: false },
          updatedAt: '2026-10-18T14:00:00.000Z',
        },
      });

      await db.updateUserProfile('usr_bob', {
        preferences: {
          theme: 'light',
          buttonStates: { autoScroll: false, compactView: true },
          updatedAt: '2026-10-18T14:00:00.000Z',
        },
      });

      const alice = db.data.users.find((u) => u.id === 'usr_alice');
      const bob = db.data.users.find((u) => u.id === 'usr_bob');

      expect(alice?.preferences?.theme).toBe('dark');
      expect(alice?.preferences?.buttonStates?.autoScroll).toBe(true);
      expect(bob?.preferences?.theme).toBe('light');
      expect(bob?.preferences?.buttonStates?.autoScroll).toBe(false);
    });

    it('should resolve concurrent multi-session edits via Last-Write-Wins and broadcast live event', async () => {
      const broadcastSpy = vi.fn();
      db.setBroadcastHook(broadcastSpy);

      // Session 1 writes at 15:00:00
      await db.updateUserProfile('usr_alice', {
        preferences: {
          theme: 'dark',
          refreshIntervalSec: 10,
          updatedAt: '2026-10-18T15:00:00.000Z',
        },
      });

      let alice = db.data.users.find((u) => u.id === 'usr_alice');
      expect(alice?.preferences?.theme).toBe('dark');
      expect(alice?.preferences?.refreshIntervalSec).toBe(10);

      // Session 2 on another device/tab writes newer change at 15:05:00
      await db.updateUserProfile('usr_alice', {
        preferences: {
          theme: 'light',
          refreshIntervalSec: 5,
          updatedAt: '2026-10-18T15:05:00.000Z',
        },
      });

      alice = db.data.users.find((u) => u.id === 'usr_alice');
      expect(alice?.preferences?.theme).toBe('light');
      expect(alice?.preferences?.refreshIntervalSec).toBe(5);

      // Delayed packet from Session 1 arriving late (stale timestamp 15:02:00)
      await db.updateUserProfile('usr_alice', {
        preferences: {
          theme: 'dark', // Older value must NOT overwrite light
          newKey: 'added_from_session_1', // Missing key CAN be filled in
          updatedAt: '2026-10-18T15:02:00.000Z',
        },
      });

      alice = db.data.users.find((u) => u.id === 'usr_alice');
      expect(alice?.preferences?.theme).toBe('light'); // Preserved from newer session!
      expect(alice?.preferences?.newKey).toBe('added_from_session_1');

      // Verify broadcast called for multi-session real-time propagation
      expect(broadcastSpy).toHaveBeenCalledWith(
        'user:preferences:updated',
        expect.objectContaining({
          userId: 'usr_alice',
        })
      );
    });
  });
});
