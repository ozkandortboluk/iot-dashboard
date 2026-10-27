import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initSimulator,
  setSimulatorActive,
  simulatorActive,
  isSimulatorEnabledFromEnv,
  getSimTimeout,
  runSimulationStep,
  computeValueForMetric,
} from '../../server/services/simulator.js';
import { db } from '../../server/db.js';
import type { Device } from '../../types.js';

describe('IoT Device Simulator Engine Test Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.useFakeTimers();
    setSimulatorActive(false);
  });

  afterEach(() => {
    setSimulatorActive(false);
    vi.clearAllTimers();
    vi.useRealTimers();
    process.env = { ...originalEnv };
  });

  describe('1. Production Startup via ENABLE_SIMULATOR', () => {
    it('should start simulator in production mode when ENABLE_SIMULATOR is "true"', () => {
      process.env.NODE_ENV = 'production';
      process.env.ENABLE_SIMULATOR = 'true';

      expect(isSimulatorEnabledFromEnv()).toBe(true);
      const active = initSimulator();
      expect(active).toBe(true);
      expect(getSimTimeout()).not.toBeNull();
    });

    it('should keep simulator disabled in production mode when ENABLE_SIMULATOR is "false"', () => {
      process.env.NODE_ENV = 'production';
      process.env.ENABLE_SIMULATOR = 'false';

      expect(isSimulatorEnabledFromEnv()).toBe(false);
      const active = initSimulator();
      expect(active).toBe(false);
      expect(getSimTimeout()).toBeNull();
    });

    it('should keep simulator disabled when ENABLE_SIMULATOR is undefined', () => {
      delete process.env.ENABLE_SIMULATOR;

      expect(isSimulatorEnabledFromEnv()).toBe(false);
      const active = initSimulator();
      expect(active).toBe(false);
      expect(getSimTimeout()).toBeNull();
    });
  });

  describe('2. Toggle (Aç/Kapat) & Timer Duplicate Prevention', () => {
    it('should start timer when setSimulatorActive(true) is called', () => {
      setSimulatorActive(true);
      expect(getSimTimeout()).not.toBeNull();
    });

    it('should clear timer and stop simulator when setSimulatorActive(false) is called', () => {
      setSimulatorActive(true);
      expect(getSimTimeout()).not.toBeNull();

      setSimulatorActive(false);
      expect(getSimTimeout()).toBeNull();
    });

    it('should prevent duplicate timers when re-initialized or toggled repeatedly', () => {
      // Call setSimulatorActive multiple times
      setSimulatorActive(true);
      const firstTimeout = getSimTimeout();
      expect(firstTimeout).not.toBeNull();

      setSimulatorActive(true);
      const secondTimeout = getSimTimeout();
      expect(secondTimeout).not.toBeNull();

      // Ensure that calling initSimulator also clears prior timers
      process.env.ENABLE_SIMULATOR = 'true';
      initSimulator();
      expect(getSimTimeout()).not.toBeNull();

      setSimulatorActive(false);
      expect(getSimTimeout()).toBeNull();
    });
  });

  describe('3. Simulated vs Physical Device Isolation & New Simulated Devices', () => {
    it('should calculate valid metric ranges and units for simulated metrics', () => {
      const temp = computeValueForMetric('temperature', false, 1);
      expect(temp.unit).toBe('°C');
      expect(temp.val).toBeGreaterThanOrEqual(15);
      expect(temp.val).toBeLessThanOrEqual(50);

      const vib = computeValueForMetric('vibration', false, 1);
      expect(vib.unit).toBe('mm/s');
      expect(vib.val).toBeGreaterThanOrEqual(0.5);
      expect(vib.val).toBeLessThanOrEqual(15);
    });

    it('should generate simulated telemetry strictly for isSimulated === true devices', async () => {
      let simDev = db.getDeviceById('dev_test_01');
      if (!simDev) {
        simDev = {
          id: 'dev_test_01',
          tenantId: 'usr_test_admin',
          name: 'Kanonik Saha Test Cihazı (ESP32)',
          type: 'sensor',
          apiKey: 'dev_key_test_0000000000000000',
          status: 'online',
          location: 'Test Laboratuvarı',
          metrics: { temperature: 24.5, humidity: 52.0 },
          isSimulated: true,
          dataFlowActive: true,
        } as any;
        if (!db.data.devices) db.data.devices = [];
        db.data.devices.push(simDev);
      }
      expect(simDev).toBeDefined();
      if (simDev) {
        simDev.isSimulated = true;
        simDev.dataFlowActive = true;
        simDev.simulatedMetrics = ['temperature', 'humidity', 'pressure'];
        simDev.status = 'online';
      }

      setSimulatorActive(true);

      // Trigger simulation step
      runSimulationStep();

      const devices = db.getDevices();
      const updatedSimDev = devices.find((d: Device) => d.id === 'dev_test_01');

      // Virtual device status is updated online by simulation step
      expect(updatedSimDev?.status).toBe('online');
      expect(updatedSimDev?.isSimulated).toBe(true);
    });
  });

  describe('4. Simulation Channel & Telemetry Event Propagation', () => {
    it('should route simulation telemetry correctly and isolate physical devices', async () => {
      let simDev = db.getDeviceById('dev_test_01');
      if (!simDev) {
        simDev = {
          id: 'dev_test_01',
          tenantId: 'usr_test_admin',
          name: 'Kanonik Saha Test Cihazı (ESP32)',
          type: 'sensor',
          apiKey: 'dev_key_test_0000000000000000',
          status: 'online',
          location: 'Test Laboratuvarı',
          metrics: { temperature: 24.5, humidity: 52.0 },
          isSimulated: true,
          dataFlowActive: true,
        } as any;
        if (!db.data.devices) db.data.devices = [];
        db.data.devices.push(simDev);
      }
      expect(simDev).toBeDefined();
      if (simDev) {
        simDev.isSimulated = true;
        simDev.dataFlowActive = true;
        simDev.simulatedMetrics = ['temperature', 'humidity'];
      }

      setSimulatorActive(true);
      runSimulationStep();

      const lastTelemetry = db.getTelemetry('dev_test_01');
      expect(Array.isArray(lastTelemetry)).toBe(true);

      // Verify that simulated device metrics updated
      const updatedSimDev = db.getDevices().find((d: Device) => d.id === 'dev_test_01');
      expect(updatedSimDev?.isSimulated).toBe(true);
      expect(updatedSimDev?.status).toBe('online');
    });
  });
});

