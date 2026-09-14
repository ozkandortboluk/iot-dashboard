import { describe, it, expect } from 'vitest';
import { SmartIntervalService } from '../server/services/smartInterval.service.js';
import { TenantSecurityService } from '../server/services/tenantSecurity.service.js';
import type { Device, User } from '../types.js';

function createMockDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: 'mock_dev',
    tenantId: 'tenant_default',
    name: 'Mock Device',
    type: 'sensor',
    location: 'Test Lab',
    ipAddress: '192.168.1.100',
    status: 'online',
    lastSeen: new Date().toISOString(),
    apiKey: 'test_key',
    rateLimitPerMin: 60,
    encryptionMethod: 'AES-256-GCM',
    expectedIntervalSeconds: overrides.expectedIntervalSeconds ?? 30,
    heartbeatTimeoutSeconds: overrides.heartbeatTimeoutSeconds ?? ((overrides.expectedIntervalSeconds ?? 30) * 2),
    isSimulated: false,
    metrics: {},
    ...overrides,
  };
}

describe('SmartIntervalService - Watchdog and Dynamic Frequency Engine', () => {
  const service = new SmartIntervalService();

  it('calculates consistent 2x timeout and synchronizes heartbeatTimeoutSeconds', () => {
    const dev: Partial<Device> = {
      expectedIntervalSeconds: 15,
      intervalMode: 'auto',
    };
    const timeouts = service.calculateDeviceTimeouts(dev);
    expect(timeouts.expectedIntervalSeconds).toBe(15);
    expect(timeouts.offlineTimeoutSeconds).toBe(30); // 15 * 2
    expect(timeouts.heartbeatTimeoutSeconds).toBe(30); // Exactly matched to offline timeout
  });

  it('enforces minimum 10 seconds network tolerance for very fast intervals', () => {
    const dev: Partial<Device> = {
      expectedIntervalSeconds: 3,
      intervalMode: 'auto',
    };
    const timeouts = service.calculateDeviceTimeouts(dev);
    expect(timeouts.expectedIntervalSeconds).toBe(3);
    // 3 * 2 = 6, but minimum tolerance is 10s
    expect(timeouts.offlineTimeoutSeconds).toBe(10);
    expect(timeouts.heartbeatTimeoutSeconds).toBe(10);
  });

  it('does NOT count offline or sleep duration towards telemetry sending frequency', () => {
    const baseTime = 1700000000000;
    const dev = createMockDevice({
      id: 'test_dev_01',
      tenantId: 'tenant_1',
      name: 'Field Sensor',
      status: 'offline', // Was offline
      lastSeen: new Date(baseTime - 3600000).toISOString(), // 1 hour ago
      expectedIntervalSeconds: 10,
      autoDetectedIntervalSeconds: 10,
      recentIntervals: [10, 10, 10],
    });

    // Device wakes up from 1 hour offline and sends telemetry
    service.processDeviceTelemetryArrival(dev, baseTime);

    // Device status should immediately become online
    expect(dev.status).toBe('online');
    // Expected interval should NOT become 3600s! It should maintain valid interval
    expect(dev.expectedIntervalSeconds).toBe(10);
    // Recent intervals should NOT contain 3600s
    expect(dev.recentIntervals).not.toContain(3600);
  });

  it('filters burst jitter and trims min/max outliers over rolling window', () => {
    let now = 1700000000000;
    const dev = createMockDevice({
      id: 'test_dev_02',
      tenantId: 'tenant_1',
      name: 'Outlier Test Device',
      status: 'online',
      lastSeen: new Date(now).toISOString(),
      expectedIntervalSeconds: 10,
      autoDetectedIntervalSeconds: 10,
      intervalMode: 'auto',
      recentIntervals: [],
    });

    // Send 5 packets with some network anomalies (e.g. 10s, 11s, 9s, 45s outlier, 10s)
    const deltas = [10, 11, 9, 45, 10];
    for (const d of deltas) {
      now += d * 1000;
      service.processDeviceTelemetryArrival(dev, now);
    }

    // Outlier 45 was in samples, but trimmed mean filtered it out
    expect(dev.recentIntervals?.length).toBe(5);
    // Auto detected interval should be around 10s, not skewed by 45s
    expect(dev.autoDetectedIntervalSeconds).toBeGreaterThanOrEqual(9);
    expect(dev.autoDetectedIntervalSeconds).toBeLessThanOrEqual(12);
  });

  it('strictly respects user manual interval settings even when device sends at different frequency', () => {
    let now = 1700000000000;
    const dev = createMockDevice({
      id: 'test_dev_manual',
      tenantId: 'tenant_1',
      name: 'Manual Interval Device',
      status: 'online',
      lastSeen: new Date(now).toISOString(),
      expectedIntervalSeconds: 60, // User set 60s
      customIntervalSeconds: 60,
      intervalMode: 'manual',
      recentIntervals: [],
    });

    // Device sends packets every 5 seconds (rapid pulses)
    for (let i = 0; i < 5; i++) {
      now += 5000;
      service.processDeviceTelemetryArrival(dev, now);
    }

    // Expected interval MUST stay at the user's manual setting (60s)
    expect(dev.expectedIntervalSeconds).toBe(60);
    expect(dev.customIntervalSeconds).toBe(60);
    expect(dev.intervalMode).toBe('manual');
    // Offline threshold should be 2 * 60 = 120s
    expect(dev.heartbeatTimeoutSeconds).toBe(120);
  });

  it('preserves user-configured heartbeatTimeoutSeconds (e.g. 60s) even when telemetry arrives rapidly every 5s', () => {
    let now = 1700000000000;
    const dev = createMockDevice({
      id: 'test_dev_rapid_5s',
      tenantId: 'tenant_1',
      name: 'Rapid 5s Sensor With 60s Timeout',
      status: 'online',
      lastSeen: new Date(now).toISOString(),
      expectedIntervalSeconds: 5,
      heartbeatTimeoutSeconds: 60, // User explicitly set 1 minute timeout
      intervalMode: 'auto',
      recentIntervals: [],
    });

    // Device sends 5 packets every 5 seconds
    for (let i = 0; i < 5; i++) {
      now += 5000;
      service.processDeviceTelemetryArrival(dev, now);
    }

    // Expected interval is around 5s
    expect(dev.expectedIntervalSeconds).toBe(5);
    // CRITICAL: heartbeatTimeoutSeconds must NOT collapse to 5*2=10s, it must stay at 60s!
    expect(dev.heartbeatTimeoutSeconds).toBe(60);

    // Watchdog evaluation at 15s after last packet: must STILL BE ONLINE (not offline!)
    const watchdogResult15s = service.evaluateDeviceWatchdog(dev, now + 15000);
    expect(watchdogResult15s.newStatus).toBe('online');
    expect(watchdogResult15s.isConfirmedOffline).toBe(false);

    // Watchdog evaluation at 65s after last packet: now becomes offline
    const watchdogResult65s = service.evaluateDeviceWatchdog(dev, now + 65000);
    expect(watchdogResult65s.newStatus).toBe('offline');
  });

  it('evaluates device watchdog to mark device offline after 2x interval has elapsed', () => {
    const now = 1700000000000;
    const dev = createMockDevice({
      id: 'test_dev_watchdog',
      tenantId: 'tenant_1',
      name: 'Watchdog Test',
      status: 'online',
      expectedIntervalSeconds: 20, // 2x threshold = 40s
      lastSeen: new Date(now - 45000).toISOString(), // 45s ago (> 40s)
      dataFlowActive: true,
    });

    const result = service.evaluateDeviceWatchdog(dev, now);
    expect(result.newStatus).toBe('offline');
    expect(result.changed).toBe(true);
    expect(dev.status).toBe('offline');
  });

  it('filters live metrics cache without touching historical database records', () => {
    const now = 1700000000000;
    const dev = createMockDevice({
      id: 'test_dev_cache',
      tenantId: 'tenant_1',
      name: 'Cache Test',
      status: 'offline',
      expectedIntervalSeconds: 10, // 2x = 20s
      lastSeen: new Date(now - 30000).toISOString(), // 30s ago (> 20s)
      metrics: {
        temperature: 25.4,
        humidity: 60,
      },
    });

    const result = service.filterLiveMetricsCache(dev, true, now);
    expect(result.cleanedCount).toBe(2);
    expect(result.remainingCount).toBe(0);
    expect(Object.keys(dev.metrics || {}).length).toBe(0);
  });

  it('rejects sub-cycle micro-bursts (<= 3s) from corrupting established intervals', () => {
    let now = 1700000000000;
    const dev = createMockDevice({
      id: 'test_dev_burst',
      tenantId: 'tenant_1',
      name: 'Burst Protected Device',
      status: 'online',
      lastSeen: new Date(now).toISOString(),
      expectedIntervalSeconds: 30,
      autoDetectedIntervalSeconds: 30,
      intervalMode: 'auto',
      recentIntervals: [30, 29, 31],
    });

    // Simulate rapid sub-packet burst (e.g., 2 sensors sent separately in 2 seconds)
    now += 2000;
    service.processDeviceTelemetryArrival(dev, now);

    // Recent intervals should NOT have been polluted with the 2-second burst
    expect(dev.recentIntervals).toEqual([30, 29, 31]);
    expect(dev.expectedIntervalSeconds).toBe(30);

    // Next regular cycle arrives at 30s
    now += 30000;
    service.processDeviceTelemetryArrival(dev, now);
    expect(dev.recentIntervals?.length).toBe(4);
    expect(dev.recentIntervals?.[dev.recentIntervals.length - 1]).toBe(30);
  });

  it('provides network jitter grace buffer before confirming offline status', () => {
    const now = 1700000000000;
    const dev = createMockDevice({
      id: 'test_dev_grace',
      tenantId: 'tenant_1',
      name: 'Grace Test Device',
      status: 'online',
      expectedIntervalSeconds: 15, // 2x timeout = 30s, grace buffer = 8s -> confirmed = 38s
      lastSeen: new Date(now - 32000).toISOString(), // 32s elapsed (> 30s but < 38s)
    });

    const result = service.evaluateDeviceWatchdog(dev, now);
    expect(result.newStatus).toBe('offline');
    // Jitter grace buffer is still active, so isConfirmedOffline is false
    expect(result.isConfirmedOffline).toBe(false);

    // After grace threshold passes (42s > 38s)
    const confirmedResult = service.evaluateDeviceWatchdog(dev, now + 10000);
    expect(confirmedResult.isConfirmedOffline).toBe(true);
  });
});

describe('TenantSecurityService - Strict Isolation Rules', () => {
  const security = new TenantSecurityService();

  const adminUser: User = {
    id: 'admin_1',
    name: 'Platform Admin',
    email: 'admin@system.local',
    role: 'admin',
    created_at: new Date().toISOString(),
  };

  const customerA: User = {
    id: 'cust_A',
    name: 'Customer A',
    email: 'a@company.com',
    role: 'operator',
    created_at: new Date().toISOString(),
  };

  const customerB: User = {
    id: 'cust_B',
    name: 'Customer B',
    email: 'b@company.com',
    role: 'operator',
    created_at: new Date().toISOString(),
  };

  const deviceOfA = createMockDevice({
    id: 'dev_A',
    tenantId: 'cust_A',
    name: 'Device A',
  });

  it('allows administrator to access all devices across all tenants', () => {
    expect(security.canUserAccessDevice(adminUser, deviceOfA)).toBe(true);
  });

  it('allows device owner to access their own device', () => {
    expect(security.canUserAccessDevice(customerA, deviceOfA)).toBe(true);
  });

  it('strictly forbids Customer B from accessing Customer A device', () => {
    expect(security.canUserAccessDevice(customerB, deviceOfA)).toBe(false);
  });

  it('strictly restricts simulation operations to administrator', () => {
    expect(security.canUserPerformSimulation(adminUser)).toBe(true);
    expect(security.canUserPerformSimulation(customerA)).toBe(false);
    expect(security.canUserPerformSimulation(customerB)).toBe(false);
  });

  it('filters device list strictly by user ownership for non-admin', () => {
    const devices: Device[] = [
      deviceOfA,
      createMockDevice({ id: 'dev_B', tenantId: 'cust_B', name: 'Device B' }),
    ];

    const adminView = security.filterAccessibleDevices(adminUser, devices);
    expect(adminView.length).toBe(2);

    const custAView = security.filterAccessibleDevices(customerA, devices);
    expect(custAView.length).toBe(1);
    expect(custAView[0].id).toBe('dev_A');

    const custBView = security.filterAccessibleDevices(customerB, devices);
    expect(custBView.length).toBe(1);
    expect(custBView[0].id).toBe('dev_B');
  });
});
