import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../server/db.js';
import { tenantSecurityService } from '../../server/services/tenantSecurity.service.js';
import type { Device, User } from '../../types.js';

describe('P1 - 2.4: Multi-Tenant Negative Security Matrix (Rule 1 Enforcement)', () => {
  const customerA: User = {
    id: 'usr_customer_a',
    email: 'customer_a@example.com',
    name: 'Customer A Org',
    role: 'customer',
    created_at: new Date().toISOString(),
  };

  const customerB: User = {
    id: 'usr_customer_b',
    email: 'customer_b@example.com',
    name: 'Customer B Org',
    role: 'customer',
    created_at: new Date().toISOString(),
  };

  const adminUser: User = {
    id: 'usr_test_admin',
    email: 'admin@example.com',
    name: 'Platform Root Admin',
    role: 'admin',
    created_at: new Date().toISOString(),
  };

  const deviceA: Device = {
    id: 'dev_tenant_a_sensor',
    name: 'Customer A Pump Sensor',
    type: 'ESP32',
    tenantId: 'usr_customer_a',
    apiKey: 'key_customer_a_123',
    status: 'online',
    metrics: { flow_rate: 15.2 },
  } as any;

  const deviceB: Device = {
    id: 'dev_tenant_b_sensor',
    name: 'Customer B Solar Inverter',
    type: 'ESP32',
    tenantId: 'usr_customer_b',
    apiKey: 'key_customer_b_456',
    status: 'online',
    metrics: { power_kw: 4.8 },
  } as any;

  beforeEach(() => {
    db.addDevice(deviceA);
    db.addDevice(deviceB);
  });

  it('1. Tenant A CANNOT access or read Tenant B devices (canUserAccessDevice = false)', () => {
    const canAccess = tenantSecurityService.canUserAccessDevice(customerA, deviceB, []);
    expect(canAccess).toBe(false);

    const filteredDevices = tenantSecurityService.filterDevicesForUser(customerA, [deviceA, deviceB], []);
    expect(filteredDevices.length).toBe(1);
    expect(filteredDevices[0].id).toBe('dev_tenant_a_sensor');
    expect(filteredDevices.some((d) => d.id === 'dev_tenant_b_sensor')).toBe(false);
  });

  it('2. Tenant B CANNOT access or read Tenant A devices (canUserAccessDevice = false)', () => {
    const canAccess = tenantSecurityService.canUserAccessDevice(customerB, deviceA, []);
    expect(canAccess).toBe(false);

    const filteredDevices = tenantSecurityService.filterDevicesForUser(customerB, [deviceA, deviceB], []);
    expect(filteredDevices.length).toBe(1);
    expect(filteredDevices[0].id).toBe('dev_tenant_b_sensor');
    expect(filteredDevices.some((d) => d.id === 'dev_tenant_a_sensor')).toBe(false);
  });

  it('3. Admin CAN access all tenant devices', () => {
    expect(tenantSecurityService.canUserAccessDevice(adminUser, deviceA, [])).toBe(true);
    expect(tenantSecurityService.canUserAccessDevice(adminUser, deviceB, [])).toBe(true);

    const adminDevices = tenantSecurityService.filterDevicesForUser(adminUser, [deviceA, deviceB], []);
    expect(adminDevices.length).toBe(2);
  });

  it('4. Rule 1: Virtual device and simulation management is EXCLUSIVELY allowed for ADMIN', () => {
    // Customers cannot perform simulation or configure virtual devices
    expect(tenantSecurityService.isSimulatorAllowed(customerA)).toBe(false);
    expect(tenantSecurityService.isSimulatorAllowed(customerB)).toBe(false);
    expect(tenantSecurityService.canUserPerformSimulation(customerA)).toBe(false);
    expect(tenantSecurityService.canUserPerformSimulation(customerB)).toBe(false);

    // Admin is allowed
    expect(tenantSecurityService.isSimulatorAllowed(adminUser)).toBe(true);
    expect(tenantSecurityService.canUserPerformSimulation(adminUser)).toBe(true);
  });

  it('5. Tenant ID guessing / forgery prevention during device creation', () => {
    // If Customer A tries to specify Tenant B id when creating device, system enforces canonical user id
    const resolution = tenantSecurityService.validateAndResolveDeviceOwnership(
      'usr_customer_b',
      customerA,
      []
    );
    expect(resolution.canonicalTenantId).toBe('usr_customer_a');
  });

  it('6. Tenant Telemetry & Command Query Isolation in DB Layer', () => {
    // Add telemetry for both devices
    db.addTelemetryReading({
      deviceId: deviceA.id,
      deviceName: deviceA.name,
      metric: 'flow_rate',
      value: 15.2,
      unit: 'L/min',
      status: 'normal',
      source: 'physical',
      environment: 'production',
    });

    db.addTelemetryReading({
      deviceId: deviceB.id,
      deviceName: deviceB.name,
      metric: 'power_kw',
      value: 4.8,
      unit: 'kW',
      status: 'normal',
      source: 'physical',
      environment: 'production',
    });

    // Customer A querying telemetry
    const customerATelemetry = db.getTelemetry(undefined, undefined, 50, customerA.id, customerA.id);
    expect(customerATelemetry.every((r) => r.deviceId === deviceA.id || !r.deviceId)).toBe(true);
    expect(customerATelemetry.some((r) => r.deviceId === deviceB.id)).toBe(false);
  });
});
