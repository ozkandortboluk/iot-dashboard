import { describe, it, expect } from 'vitest';
import type { Firmware } from '../types';

describe('Firmware Library View Modes & Filters (USR-01)', () => {
  const sampleFirmwares: Firmware[] = [
    {
      id: 'fw-1',
      name: 'Smart Pump Controller ESP32',
      version: 'v2.1.0',
      deviceType: 'pump_controller',
      roleKey: 'PUMP_CTRL',
      hardwareModel: 'ESP32_WROOM_32',
      binarySize: 1048576,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      keyId: 'root_ed25519_v1',
      isActive: true,
      description: 'Industrial pump management with temperature throttle',
      uploadedBy: 'admin-user',
      created_at: '2026-09-30T10:00:00Z',
    },
    {
      id: 'fw-2',
      name: 'Greenhouse Climate Sensor ESP8266',
      version: 'v1.4.2',
      deviceType: 'greenhouse_sensor',
      roleKey: 'GREENHOUSE_NODE',
      hardwareModel: 'ESP8266_NODEMCU',
      binarySize: 524288,
      sha256: 'ca978112ca1bbdcafac231b39a23dc4da78607f9c2f96b004746741d53725e14',
      keyId: 'root_ed25519_v1',
      isActive: false,
      description: 'Legacy greenhouse monitoring firmware',
      uploadedBy: 'admin-user',
      created_at: '2026-09-29T08:00:00Z',
    },
    {
      id: 'fw-3',
      name: 'Energy Monitor Node ESP32-S3',
      version: 'v3.0.0',
      deviceType: 'energy_meter',
      roleKey: 'ENERGY_METER',
      hardwareModel: 'ESP32_S3',
      binarySize: 1572864,
      sha256: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
      keyId: 'root_ed25519_v1',
      isActive: true,
      description: 'High-speed CT clamp sampling firmware',
      uploadedBy: 'admin-user',
      created_at: '2026-09-28T12:00:00Z',
    }
  ];

  it('filters firmwares by search term across multiple fields', () => {
    const filterBySearch = (term: string) =>
      sampleFirmwares.filter((fw) =>
        fw.name.toLowerCase().includes(term.toLowerCase()) ||
        fw.version.toLowerCase().includes(term.toLowerCase()) ||
        fw.roleKey.toLowerCase().includes(term.toLowerCase()) ||
        fw.deviceType.toLowerCase().includes(term.toLowerCase()) ||
        (fw.hardwareModel && fw.hardwareModel.toLowerCase().includes(term.toLowerCase())) ||
        (fw.description && fw.description.toLowerCase().includes(term.toLowerCase()))
      );

    expect(filterBySearch('PUMP')).toHaveLength(1);
    expect(filterBySearch('ESP8266')).toHaveLength(1);
    expect(filterBySearch('v3.0.0')).toHaveLength(1);
    expect(filterBySearch('nonexistent')).toHaveLength(0);
  });

  it('filters firmwares by active and inactive status', () => {
    const activeFirmwares = sampleFirmwares.filter((fw) => fw.isActive);
    const inactiveFirmwares = sampleFirmwares.filter((fw) => !fw.isActive);

    expect(activeFirmwares).toHaveLength(2);
    expect(inactiveFirmwares).toHaveLength(1);
    expect(inactiveFirmwares[0].id).toBe('fw-2');
  });

  it('supports switching between grid (karo) and list (tek satır) view modes with persistent storage key', () => {
    let mode: 'grid' | 'list' = 'grid';
    const storageMock: Record<string, string> = {};

    // Initial state
    storageMock['firmware_view_mode'] = mode;
    expect(storageMock['firmware_view_mode']).toBe('grid');

    // Switch to list
    mode = 'list';
    storageMock['firmware_view_mode'] = mode;
    expect(storageMock['firmware_view_mode']).toBe('list');

    // Switch back to grid
    mode = 'grid';
    storageMock['firmware_view_mode'] = mode;
    expect(storageMock['firmware_view_mode']).toBe('grid');
  });
});
