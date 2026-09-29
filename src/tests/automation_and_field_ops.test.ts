import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../server/db.js';
import { AutomationEngine } from '../server/services/automation.engine.js';
import { parseProductionTelemetryPayload, parseLegacyTelemetryPayload } from '../server/utils/telemetry.parser.js';
import type { Device, Automation, TelemetryReading, DiscoveredNetworkDevice } from '../types.js';

describe('Automation Engine, Telemetry Ingestion & Field Operations (Roadmap 3.3)', () => {
  const automationEngine = new AutomationEngine();
  const testTenant = 'tenant_field_ops_01';

  const createReading = (
    overrides: Partial<TelemetryReading> & { id: string; deviceId: string; metric: string; value: number }
  ): TelemetryReading => ({
    deviceName: 'Test Device',
    unit: '°C',
    status: 'normal',
    source: 'physical',
    environment: 'production',
    timestamp: new Date().toISOString(),
    ...overrides,
  });

  const testDevice: Device = {
    id: 'dev_field_ops_esp32_01',
    name: 'Saha ESP32 Pompa İstasyonu',
    status: 'online',
    isSimulated: false,
    apiKey: 'nex_field_test_key_789',
    tenantId: testTenant,
    location: 'Sera 1',
    ipAddress: '192.168.1.105',
    macAddress: 'AA:BB:CC:DD:EE:01',
    rateLimitPerMin: 60,
    encryptionMethod: 'none',
    lastSeen: new Date().toISOString(),
    type: 'sensor',
    outputDefinitions: [{ id: 'RELAY_1', name: 'Röle 1', pin: 2, type: 'relay' }],
    metrics: {
      temperature: 24,
      pressure: 1.5,
    },
  };

  const testTargetDevice: Device = {
    id: 'dev_field_ops_valve_02',
    name: 'Saha Vana Kontrolörü',
    status: 'online',
    isSimulated: false,
    apiKey: 'nex_field_target_key_999',
    tenantId: testTenant,
    location: 'Sera 1',
    ipAddress: '192.168.1.106',
    rateLimitPerMin: 60,
    encryptionMethod: 'none',
    lastSeen: new Date().toISOString(),
    type: 'valve',
    outputDefinitions: [{ id: 'VALVE_1', name: 'Vana 1', pin: 4, type: 'relay' }],
    metrics: {},
  };

  beforeEach(() => {
    // Reset devices
    const existing = db.getDevices().filter(d => d.id !== testDevice.id && d.id !== testTargetDevice.id);
    db.data.devices = [...existing, { ...testDevice }, { ...testTargetDevice }];
    // Reset automations
    db.data.automations = [];
    // Reset commands for test devices
    if (db.data.commands) {
      db.data.commands = db.data.commands.filter(
        c => c.deviceId !== testDevice.id && c.deviceId !== testTargetDevice.id
      );
    }
  });

  describe('1. Automation Engine Evaluation & Cooldown', () => {
    it('should trigger an action when a telemetry metric meets condition (GREATER_THAN)', () => {
      const autoRule: Automation = {
        id: 'auto_high_temp_shutoff',
        name: 'Yüksek Sıcaklık Vana Kapatma',
        enabled: true,
        tenantId: testTenant,
        trigger: {
          deviceId: testDevice.id,
          metric: 'temperature',
          condition: 'GREATER_THAN',
          value: 35,
        },
        action: {
          deviceId: testTargetDevice.id,
          commandPayload: { command: 'VALVE_1', value: '0' },
        },
        createdAt: new Date().toISOString(),
      };

      db.data.automations = [autoRule];

      // Telemetry reading below threshold -> no trigger
      const normalReading = createReading({
        id: 'read_1',
        deviceId: testDevice.id,
        metric: 'temperature',
        value: 30,
        unit: '°C',
      });
      automationEngine.evaluateAutomations(normalReading);
      const targetCmdsBefore = (db.data.commands || []).filter(c => c.deviceId === testTargetDevice.id);
      expect(targetCmdsBefore.length).toBe(0);

      // Telemetry reading above threshold -> triggers action
      const highReading = createReading({
        id: 'read_2',
        deviceId: testDevice.id,
        metric: 'temperature',
        value: 38.5,
        unit: '°C',
      });
      automationEngine.evaluateAutomations(highReading);

      // Command should be queued for target device
      const targetCmdsAfter = (db.data.commands || []).filter(c => c.deviceId === testTargetDevice.id);
      expect(targetCmdsAfter.length).toBe(1);
      const createdCmd = targetCmdsAfter[0];
      expect(createdCmd.deviceId).toBe(testTargetDevice.id);
      expect(createdCmd.userId || (createdCmd as any).issuerId).toBe('system_automation');
    });

    it('should respect 60-second debounce/cooldown and prevent duplicate rapid triggers', () => {
      const autoRule: Automation = {
        id: 'auto_cooldown_test',
        name: 'Basınç Düşüş Alarmı',
        enabled: true,
        tenantId: testTenant,
        trigger: {
          deviceId: testDevice.id,
          metric: 'pressure',
          condition: 'LESS_THAN',
          value: 2.0,
        },
        action: {
          deviceId: testTargetDevice.id,
          commandPayload: { command: 'BOOST_PUMP', value: '1' },
        },
        createdAt: new Date().toISOString(),
      };

      db.data.automations = [autoRule];

      const lowPressure = createReading({
        id: 'read_low_1',
        deviceId: testDevice.id,
        metric: 'pressure',
        value: 1.2,
        unit: 'bar',
      });

      // First evaluation -> triggers
      automationEngine.evaluateAutomations(lowPressure);
      const targetCmds1 = (db.data.commands || []).filter(c => c.deviceId === testTargetDevice.id);
      expect(targetCmds1.length).toBe(1);

      // Immediate second evaluation -> debounced (no second command created)
      automationEngine.evaluateAutomations(lowPressure);
      const targetCmds2 = (db.data.commands || []).filter(c => c.deviceId === testTargetDevice.id);
      expect(targetCmds2.length).toBe(1);
    });

    it('should NOT trigger when automation is disabled (enabled: false)', () => {
      const disabledRule: Automation = {
        id: 'auto_disabled_test',
        name: 'Devre Dışı Otomasyon',
        enabled: false,
        tenantId: testTenant,
        trigger: {
          deviceId: testDevice.id,
          metric: 'temperature',
          condition: 'GREATER_THAN',
          value: 20,
        },
        action: {
          deviceId: testTargetDevice.id,
          commandPayload: { command: 'ALERT', value: '1' },
        },
        createdAt: new Date().toISOString(),
      };

      db.data.automations = [disabledRule];

      const reading = createReading({
        id: 'read_dis_1',
        deviceId: testDevice.id,
        metric: 'temperature',
        value: 50,
        unit: '°C',
      });

      automationEngine.evaluateAutomations(reading);
      const targetCmds = (db.data.commands || []).filter(c => c.deviceId === testTargetDevice.id);
      expect(targetCmds.length).toBe(0);
    });
  });

  describe('2. Telemetry Parser & Multi-Format Ingestion', () => {
    it('should correctly parse compact comma-separated text payload (/api/v1/telemetry)', () => {
      const mockReq = {
        method: 'POST',
        headers: {
          'content-type': 'text/plain',
          'x-forwarded-for': '192.168.1.105',
        },
        body: 'nex_field_test_key_789, Saha_Cihazi_01, sicaklik:28.4, nem:62.5, basinc:1013.2',
        query: {},
      } as any;

      const parsed = parseProductionTelemetryPayload(mockReq);

      expect(parsed.token).toBe('nex_field_test_key_789');
      expect(parsed.deviceNameFromPayload).toBe('Saha_Cihazi_01');
      expect(parsed.metricsToProcess.length).toBe(3);

      const metricsMap = Object.fromEntries(parsed.metricsToProcess.map(m => [m.metric, m.value]));
      expect(metricsMap['sicaklik']).toBe(28.4);
      expect(metricsMap['nem']).toBe(62.5);
      expect(metricsMap['basinc']).toBe(1013.2);
    });

    it('should correctly parse structured JSON telemetry payload', () => {
      const mockReq = {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'nex_field_test_key_789',
        },
        body: {
          deviceId: testDevice.id,
          metrics: {
            temperature: 32.1,
          },
          sequence: 142,
          bootId: 'boot_uuid_999',
        },
        query: {},
      } as any;

      const parsed = parseProductionTelemetryPayload(mockReq);

      expect(parsed.token).toBe('nex_field_test_key_789');
      expect(parsed.deviceIdFromPayload).toBe(testDevice.id);
      expect(parsed.sequence).toBe(142);
      expect(parsed.bootId).toBe('boot_uuid_999');
      expect(parsed.metricsToProcess.length).toBe(1);
      expect(parsed.metricsToProcess[0].metric).toBe('temperature');
      expect(parsed.metricsToProcess[0].value).toBe(32.1);
    });

    it('should support legacy multi-metric dictionary format', () => {
      const mockReq = {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: {
          apiKey: 'nex_field_test_key_789',
          temperature: 29.5,
          humidity: 55,
          flowRate: 12.8,
        },
        query: {},
      } as any;

      const parsed = parseLegacyTelemetryPayload(mockReq);
      expect(parsed.token).toBe('nex_field_test_key_789');
      expect(parsed.metricsToProcess.length).toBe(3);
    });
  });

  describe('3. Device Discovery, Pairing & Hardware Replacement', () => {
    it('should replace a damaged device with a newly discovered hardware unit while preserving device ID and metadata', async () => {
      // 1. New replacement hardware unit connects to LAN and announces pairing code
      const newDiscoveredUnit: DiscoveredNetworkDevice = {
        id: 'disc_unit_99',
        name: 'ESP32-New-Replacement',
        ip: '192.168.1.199',
        mac: 'FF:EE:DD:CC:BB:AA',
        pairingCode: 'PAIR-8844',
        model: 'ESP32_WROOM_32D',
        hardwareModel: 'ESP32_WROOM_32D',
        firmwareVersion: 'v1.4.0',
        discoveredAt: new Date().toISOString(),
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      } as any;

      db.recordUnregisteredDevice(newDiscoveredUnit as any);

      // Verify discovered pool contains the unit
      const discovered = db.getDiscoveredDevices('usr_test_admin').find(d => d.mac === 'FF:EE:DD:CC:BB:AA' || (d as any).pairingCode === 'PAIR-8844');
      expect(discovered).toBeDefined();
      expect(discovered?.mac).toBe('FF:EE:DD:CC:BB:AA');

      // 2. Perform replacement operation on the target device
      const updates = {
        macAddress: discovered!.mac,
        ipAddress: discovered!.ip,
        hardwareModel: discovered!.hardwareModel,
        firmwareVersion: discovered!.firmwareVersion,
      };

      const updatedDev = await db.updateDevice(testDevice.id, updates);

      // Verify device ID, apiKey, location, and tenantId remain unchanged
      expect(updatedDev.id).toBe(testDevice.id);
      expect(updatedDev.apiKey).toBe(testDevice.apiKey);
      expect(updatedDev.tenantId).toBe(testDevice.tenantId);
      expect(updatedDev.location).toBe(testDevice.location);

      // Verify hardware MAC, IP and firmware were updated to the replacement unit
      expect(updatedDev.macAddress).toBe('FF:EE:DD:CC:BB:AA');
      expect(updatedDev.ipAddress).toBe('192.168.1.199');
      expect(updatedDev.hardwareModel).toBe('ESP32_WROOM_32D');
      expect(updatedDev.firmwareVersion).toBe('v1.4.0');

      // 3. Remove paired device from discovery pool
      db.removeUnregisteredDevice(newDiscoveredUnit.mac);
      const remainingDiscovered = db.getDiscoveredDevices().find(d => d.pairingCode === 'PAIR-8844');
      expect(remainingDiscovered).toBeUndefined();
    });
  });

  describe('4. Mobile Critical Flows & Edge Handling', () => {
    it('should process mobile/edge client telemetry submissions with custom user-agent and connection metadata', () => {
      const mockMobileReq = {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'NexusNode-FieldApp/2.4 (Android 14; Mobile; ESP-BLE-Bridge)',
          'x-api-key': 'nex_field_test_key_789',
          'x-client-platform': 'mobile-field-pwa',
        },
        body: {
          deviceId: testDevice.id,
          metrics: {
            battery_level: 88,
          },
          timestamp: new Date().toISOString(),
        },
        query: {},
      } as any;

      const parsed = parseProductionTelemetryPayload(mockMobileReq);
      expect(parsed.token).toBe('nex_field_test_key_789');
      expect(parsed.metricsToProcess.length).toBe(1);
      expect(parsed.metricsToProcess[0].metric).toBe('battery_level');
      expect(parsed.metricsToProcess[0].value).toBe(88);
    });

    it('should safely process queued batch telemetry readings sent during reconnection', () => {
      const batchTelemetry = [
        { metric: 'temperature', value: 24.1, timestamp: new Date(Date.now() - 30000).toISOString() },
        { metric: 'humidity', value: 62.4, timestamp: new Date(Date.now() - 20000).toISOString() },
        { metric: 'pressure', value: 1.013, timestamp: new Date(Date.now() - 10000).toISOString() },
      ];

      for (const item of batchTelemetry) {
        const reading = createReading({
          id: `read_batch_${Date.now()}_${Math.random()}`,
          deviceId: testDevice.id,
          metric: item.metric,
          value: item.value,
          timestamp: item.timestamp,
        });
        db.addTelemetryReading(reading);
      }

      const readings = db.getTelemetry(testDevice.id);
      expect(readings.length).toBeGreaterThanOrEqual(3);
      const metricsFound = readings.map(r => r.metric);
      expect(metricsFound).toContain('temperature');
      expect(metricsFound).toContain('humidity');
      expect(metricsFound).toContain('pressure');
    });
  });
});
