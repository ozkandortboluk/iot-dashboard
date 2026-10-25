import { describe, it, expect, vi, beforeEach } from 'vitest';
import { systemLogger } from '../../server/services/systemLogger.service.js';
import { physicalTelemetryService } from '../../server/services/physicalTelemetry.service.js';
import { isScannerOrProbingPath } from '../../server/utils/spaFallbackGuard.js';
import { db } from '../../server/db.js';
import type { Device } from '../../types.js';

describe('Telemetry & Scanner HTTP Log Noise Suppression Test Suite', () => {
  let infoSpy: any;
  let warnSpy: any;

  beforeEach(() => {
    infoSpy = vi.spyOn(systemLogger, 'info').mockImplementation(() => undefined as any);
    warnSpy = vi.spyOn(systemLogger, 'warn').mockImplementation(() => undefined as any);
  });

  describe('1. Physical Telemetry Ingestion Log Noise Prevention', () => {
    it('logs telemetry start when device was offline or newly transmitting', async () => {
      const mockDevice: Device = {
        id: 'dev_test_probe_01',
        name: 'ESP32-Field-Probe',
        type: 'esp32',
        status: 'offline',
        isSimulated: false,
        metrics: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tenantId: 'usr_admin',
      } as any;

      // Mock DB methods
      vi.spyOn(db, 'addTelemetryBatchAsync').mockResolvedValueOnce({
        persisted: true,
        readings: [
          {
            id: 'tel_1',
            deviceId: mockDevice.id,
            deviceName: mockDevice.name,
            metric: 'temperature',
            value: 24.5,
            timestamp: new Date().toISOString(),
          },
        ],
      } as any);

      vi.spyOn(db, 'processDeviceTelemetryArrival').mockResolvedValueOnce({
        ...mockDevice,
        status: 'online',
        lastSeen: new Date().toISOString(),
        expectedIntervalSeconds: 30,
        autoDetectedIntervalSeconds: 30,
        heartbeatTimeoutSeconds: 60,
      } as any);

      vi.spyOn(db, 'updateDevice').mockResolvedValueOnce(mockDevice as any);

      await physicalTelemetryService.ingestPhysicalTelemetry(
        mockDevice,
        [{ metric: 'temperature', value: 24.5, unit: '°C' }],
        'temperature:24.5'
      );

      // Telemetry stream start MUST be logged
      expect(infoSpy).toHaveBeenCalledWith(
        'telemetry',
        expect.stringContaining('Saha telemetri akışı başladı'),
        expect.objectContaining({
          deviceId: mockDevice.id,
        }),
        'physical_telemetry_service'
      );
    });

    it('suppresses routine telemetry logs when device is already online', async () => {
      infoSpy.mockClear();

      const mockDevice: Device = {
        id: 'dev_test_probe_02',
        name: 'ESP32-Field-Probe-2',
        type: 'esp32',
        status: 'online',
        lastSeen: new Date().toISOString(),
        lastTelemetryAt: new Date().toISOString(),
        isSimulated: false,
        metrics: { temperature: 24.5 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tenantId: 'usr_admin',
      } as any;

      vi.spyOn(db, 'addTelemetryBatchAsync').mockResolvedValueOnce({
        persisted: true,
        readings: [
          {
            id: 'tel_2',
            deviceId: mockDevice.id,
            deviceName: mockDevice.name,
            metric: 'temperature',
            value: 24.8,
            timestamp: new Date().toISOString(),
          },
        ],
      } as any);

      vi.spyOn(db, 'processDeviceTelemetryArrival').mockResolvedValueOnce({
        ...mockDevice,
        status: 'online',
        lastSeen: new Date().toISOString(),
      } as any);

      vi.spyOn(db, 'updateDevice').mockResolvedValueOnce(mockDevice as any);

      await physicalTelemetryService.ingestPhysicalTelemetry(
        mockDevice,
        [{ metric: 'temperature', value: 24.8, unit: '°C' }],
        'temperature:24.8'
      );

      // Routine telemetry packet MUST NOT call systemLogger.info
      expect(infoSpy).not.toHaveBeenCalledWith(
        'telemetry',
        expect.anything(),
        expect.anything(),
        'physical_telemetry_service'
      );
    });
  });

  describe('2. Scanner Probes Identification & Guarding', () => {
    it('accurately detects cloud credential, env, database, and control panel probes as scanner paths', () => {
      const probes = [
        '/env',
        '/env.txt',
        '/env.js',
        '/env-config.js',
        '/firebase-key.json',
        '/firebase-adminsdk.json',
        '/keyfile.json',
        '/key.json',
        '/application_default_credentials.json',
        '/google-key.json',
        '/google-credentials.json',
        '/credentials.json',
        '/credentials.ini',
        '/credentials',
        '/gcp-sa.json',
        '/gcp-credentials.json',
        '/gcp-key.json',
        '/sa.json',
        '/service-account.json',
        '/_profiler/phpinfo',
        '/phpinfo',
        '/vendor/composer/installed.json',
        '/settings.json',
        '/sentry.properties',
        '/secrets.json',
        '/runtime-config.js',
        '/index.js',
        '/app.js',
        '/app.config.js',
        '/database.sql',
        '/dump.sql.gz',
        '/dump.sql',
        '/db.sql',
        '/backup.sql',
        '/swagger.json',
        '/administrator/',
        '/docker-compose.prod.yml',
        '/Dockerfile',
        '/mcp.json',
        '/enhancecp',
        '/latest/meta-data',
        '/computeMetadata/v1/',
        '/debug.log',
        '/server.log',
        '/.gitignore',
        '/page%00.php',
        '/page%0a.html',
      ];

      for (const p of probes) {
        expect(isScannerOrProbingPath(p), `Failed for path: ${p}`).toBe(true);
      }
    });

    it('allows legitimate static assets and SPA routes without false positives', () => {
      const legitimate = [
        '/',
        '/dashboard',
        '/devices',
        '/devices/dev_01',
        '/login',
        '/setup',
        '/recovery',
        '/settings',
        '/account',
        '/robots.txt',
        '/sitemap.xml',
        '/favicon.ico',
        '/favicon.svg',
        '/site.webmanifest',
        '/assets/index.js',
      ];

      for (const p of legitimate) {
        expect(isScannerOrProbingPath(p)).toBe(false);
      }
    });
  });
});
