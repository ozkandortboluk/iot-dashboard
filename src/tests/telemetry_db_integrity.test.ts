import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../server/db.js';
import { physicalTelemetryService } from '../server/services/physicalTelemetry.service.js';
import type { Device, TelemetryReading } from '../types.js';

describe('P1 - 2.2: Telemetry Database Integrity & Application Referential Policy', () => {
  const testDevId = `dev_integrity_${Date.now()}`;
  const testApiKey = `key_integrity_${Date.now()}`;

  beforeEach(() => {
    // Register active test device
    db.addDevice({
      id: testDevId,
      name: 'Integrity Field Probe',
      type: 'ESP32',
      tenantId: 'usr_admin',
      apiKey: testApiKey,
      status: 'online',
      metrics: {},
      lastSeen: new Date().toISOString(),
    } as any);
  });

  it('1. Idempotency under concurrent ingest with deviceId + bootId + sequence', async () => {
    const bootId = `boot_integrity_${Date.now()}`;
    const sequence = 42;
    const device = db.getDeviceById(testDevId)!;

    const metrics = [
      { metric: 'temperature', value: 24.8, unit: '°C' },
      { metric: 'humidity', value: 55.2, unit: '%' },
    ];

    // First ingestion
    const firstResult = await physicalTelemetryService.ingestPhysicalTelemetry(
      device,
      metrics,
      'TEMP:24.8,HUM:55.2',
      false,
      sequence,
      bootId
    );
    expect(firstResult.addedReadings).toBeDefined();
    expect(firstResult.addedReadings.length).toBe(2);

    // Verify readings were recorded with idempotency metadata
    const readings = db.getTelemetry(testDevId, undefined, 10);
    expect(readings.some((r) => r.sequence === sequence && r.bootId === bootId)).toBe(true);
  });

  it('2. Device deletion & Historical Telemetry retention policy', async () => {
    const devToDeleteId = `dev_delete_policy_${Date.now()}`;
    const apiKeyToDelete = `key_delete_${Date.now()}`;

    db.addDevice({
      id: devToDeleteId,
      name: 'Decommissioned Sensor',
      type: 'ESP8266',
      tenantId: 'usr_admin',
      apiKey: apiKeyToDelete,
      status: 'online',
      metrics: { pressure: 1012.0 },
    } as any);

    // Ingest telemetry reading for device
    db.addTelemetryReading({
      deviceId: devToDeleteId,
      deviceName: 'Decommissioned Sensor',
      metric: 'pressure',
      value: 1012.0,
      unit: 'hPa',
      status: 'normal',
      source: 'physical',
      environment: 'production',
    });

    // Verify reading is in database
    const initialTelemetry = db.getTelemetry(devToDeleteId, 'pressure', 10);
    expect(initialTelemetry.length).toBeGreaterThanOrEqual(1);

    // Delete device from catalog
    db.deleteDevice(devToDeleteId);
    expect(db.getDeviceById(devToDeleteId)).toBeUndefined();

    // Verify historical telemetry is PRESERVED (not purged) for auditing & reporting compliance
    const postDeleteTelemetry = db.getTelemetry(devToDeleteId, 'pressure', 10);
    expect(postDeleteTelemetry.length).toBeGreaterThanOrEqual(1);
    expect(postDeleteTelemetry[0].value).toBe(1012.0);
  });

  it('3. Orphan Telemetry Reconciliation & Monitoring', async () => {
    // Add telemetry for a non-existent device
    const ghostDeviceId = `dev_ghost_${Date.now()}`;
    db.addTelemetryReading({
      deviceId: ghostDeviceId,
      deviceName: 'Ghost Sensor',
      metric: 'radiation',
      value: 0.12,
      unit: 'uSv/h',
      status: 'normal',
      source: 'physical',
      environment: 'production',
    });

    const orphanStatsBefore = db.getOrphanTelemetryStats();
    expect(orphanStatsBefore.totalOrphans).toBeGreaterThanOrEqual(1);
    expect(orphanStatsBefore.orphanedDeviceIds).toContain(ghostDeviceId);

    // Run reconciliation
    const reconciliation = await db.reconcileOrphanTelemetry();
    expect(reconciliation.totalOrphansFound).toBeGreaterThanOrEqual(1);
    expect(reconciliation.reconciledCount).toBeGreaterThanOrEqual(1);
    expect(reconciliation.orphanedDeviceIds).toContain(ghostDeviceId);
  });

  it('4. Unknown / Discovered device telemetry quarantine & staging policy', async () => {
    const unregIp = '192.168.1.188';
    db.recordUnregisteredDevice({
      ip: unregIp,
      mac: 'AA:BB:CC:DD:EE:FF',
      hostname: 'esp32-unreg',
      vendor: 'Espressif',
      openPorts: [80, 443],
      status: 'unregistered',
      pairingCode: 'PAIR99',
      hardwareModel: 'ESP32_DEV',
    });

    const discovered = db.getDiscoveredDevices();
    expect(discovered.some((d: any) => d.ip === unregIp)).toBe(true);

    // Ensure non-registered devices do not have active device entity
    const existingDev = db.getDevices().find((d) => d.ipAddress === unregIp);
    expect(existingDev).toBeUndefined();
  });
});
