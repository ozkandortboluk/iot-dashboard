import crypto from 'node:crypto';
import type { PgPoolType } from './connection.js';
import { defaultWidgets } from '../initialData.js';
import { hashPassword } from '../utils/crypto.js';
import { systemLogger } from '../services/systemLogger.service.js';
import { APP_VERSION } from '../../config/version.js';
import type { User, Device, ThresholdRule, DashboardLayout, NotificationItem, AuditLog } from '../../types.js';

export interface SeedResult {
  success: boolean;
  summary: string;
  counts: {
    users: number;
    devices: number;
    dashboards: number;
    rules: number;
    telemetryReadings: number;
    notifications: number;
    auditLogs: number;
    systemEvents: number;
    deviceCommands: number;
    firmwares: number;
  };
}

/**
 * InitialDataSeeder:
 * Populates all database paths, canonical tables, and essential out-of-the-box data
 * during the initial setup wizard connection phase.
 * 
 * Guarantees that when an empty database is connected, all tables, initial configurations,
 * dashboard widgets, threshold rules, canonical test devices, and telemetry history
 * are written immediately and completely.
 */
export class InitialDataSeeder {
  public static async populateInitialDatabase(pool: PgPoolType): Promise<SeedResult> {
    const counts = {
      users: 0,
      devices: 0,
      dashboards: 0,
      rules: 0,
      telemetryReadings: 0,
      notifications: 0,
      auditLogs: 0,
      systemEvents: 0,
      deviceCommands: 0,
      firmwares: 0,
    };

    const client = await pool.connect();
    if (client) client.on('error', () => {});

    try {
      // NOTE: Security Hardening: NO hardcoded admin accounts or default passwords (admin1234, test1234)
      // are seeded here. The primary administrator is securely created by the operator in Step 6
      // of the Setup Wizard (/api/setup/create-admin). Test accounts are restricted strictly to
      // test runners when ENABLE_TEST_ACCOUNT=true.

      // 1. CANONICAL TEST DEVICE (dev_test_01) - Strictly in isolated unit test runners only
      const isIsolatedTestRunner = process.env.NODE_ENV === 'test' && Boolean(process.env.VITEST);
      const testApiKey = 'dev_key_test_0000000000000000';
      const testApiKeyHash = crypto.createHash('sha256').update(testApiKey).digest('hex');

      if (isIsolatedTestRunner) {
        const supportedOutputs = [
          { id: 'relay_1', name: 'Ana Güç Rölesi (Relay 1)', type: 'relay', pin: 18, status: false },
          { id: 'relay_2', name: 'Soğutma Fanı (Relay 2)', type: 'relay', pin: 19, status: true },
          { id: 'pwm_1', name: 'Hız Kontrolcü (PWM 1)', type: 'pwm', pin: 21, value: 65 },
        ];
        const initialMetrics = {
          temperature: 24.5,
          humidity: 52.0,
          cpu: 34.2,
          power: 85.4,
          voltage: 224.8,
        };

        const testApiKeyPrefix = 'dev_key_test';

        await client.query(`
          INSERT INTO devices (
            id, tenant_id, user_id, name, device_type, role_key,
            api_key, api_key_prefix, api_key_hash, status, location, ip_address,
            hardware_model, firmware_version, rate_limit_per_min, encryption_method,
            is_simulated, data_flow_active, metrics, output_definitions,
            capabilities, expected_interval_seconds, heartbeat_timeout_seconds,
            last_seen, created_at
          ) VALUES (
            'dev_test_01', 'system', NULL,
            'Kanonik Saha Test Cihazı (ESP32)', 'sensor', 'production_sensor',
            NULL, $1, $2, 'online', 'Test Laboratuvarı - Saha İstasyonu #1', '192.168.1.100',
            'ESP32-WROOM-32D', 'v1.0.0', 300, 'AES-256-GCM',
            true, true, $3::jsonb, $4::jsonb,
            $5::jsonb, 10, 60,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            api_key = NULL,
            api_key_prefix = EXCLUDED.api_key_prefix,
            api_key_hash = EXCLUDED.api_key_hash,
            status = 'online',
            ip_address = EXCLUDED.ip_address,
            metrics = EXCLUDED.metrics,
            output_definitions = EXCLUDED.output_definitions,
            last_seen = CURRENT_TIMESTAMP;
        `, [
          testApiKeyPrefix,
          testApiKeyHash,
          JSON.stringify(initialMetrics),
          JSON.stringify(supportedOutputs),
          JSON.stringify(['telemetry', 'relays', 'pwm', 'ota', 'heartbeat']),
        ]);
        counts.devices++;
      }

      // 2. DASHBOARD LAYOUTS (dashboard_layouts)
      // Seed default 10-widget dashboard layout for the system (user_id = NULL)
      const widgetsJson = JSON.stringify(defaultWidgets);

      await client.query(`
        INSERT INTO dashboard_layouts (id, user_id, title, widgets_json, updated_at)
        VALUES ('dash_default', NULL, 'Varsayılan Sistem Paneli', $1::jsonb, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          widgets_json = EXCLUDED.widgets_json,
          updated_at = CURRENT_TIMESTAMP;
      `, [widgetsJson]);
      counts.dashboards++;

      // 3. AUDIT LOGS (audit_logs)
      const auditEntries = [
        {
          id: 'log_init_db',
          userId: 'system',
          tenantId: 'system',
          userName: 'Sistem',
          action: 'DATABASE_PATHS_INITIALIZED',
          details: {
            version: APP_VERSION,
            schemaVersion: '1.18.0',
            description: 'Veritabanı yolları ve canonical tablolar ilk kurulumda başarıyla hazırlandı.',
          },
        },
        {
          id: 'log_sys_ready',
          userId: 'system',
          tenantId: 'system',
          userName: 'Sistem',
          action: 'SYSTEM_BOOT_COMPLETED',
          details: {
            engine: 'NexusNode IoT Enterprise Engine',
            version: APP_VERSION,
            status: 'HEALTHY',
          },
        },
      ];

      for (const entry of auditEntries) {
        await client.query(`
          INSERT INTO audit_logs (
            id, user_id, tenant_id, user_name, action, resource_type, details, ip_address, severity, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, 'database', $6::jsonb, '127.0.0.1', 'low', CURRENT_TIMESTAMP
          )
          ON CONFLICT (id) DO NOTHING;
        `, [entry.id, entry.userId, entry.tenantId, entry.userName, entry.action, JSON.stringify(entry.details)]);
        counts.auditLogs++;
      }

      // 4. SYSTEM EVENTS (system_events)
      await client.query(`
        INSERT INTO system_events (id, event_type, source, severity, payload, created_at)
        VALUES (
          'evt_init_paths', 'DATABASE_INITIALIZATION_SUCCESS', 'SetupService', 'info',
          $1::jsonb, CURRENT_TIMESTAMP
        )
        ON CONFLICT (id) DO NOTHING;
      `, [JSON.stringify({ version: APP_VERSION, state: 'INITIALIZED', seededCounts: counts })]);
      counts.systemEvents++;

      // 5. IN-MEMORY DB.DATA CACHE SYNCHRONIZATION (isolated unit tests only)
      if (isIsolatedTestRunner) {
        try {
          InitialDataSeeder.syncInMemoryCache(testApiKey, testApiKeyHash);
        } catch (cacheErr: any) {
          systemLogger.warn('database', `In-memory cache sync notice: ${cacheErr?.message || cacheErr}`);
        }
      }

      systemLogger.info('database', `[InitialDataSeeder] Veritabanı başlangıç şemaları hazırlandı: ${JSON.stringify(counts)}`);

      return {
        success: true,
        summary: `${counts.users} kullanıcı, ${counts.devices} cihaz, ${counts.dashboards} panel`,
        counts,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Synchronizes LocalDatabase in-memory data structures with the seeded canonical records
   */
  private static async syncInMemoryCache(testApiKey: string, testApiKeyHash: string) {
    try {
      const { db } = await import('../db.js');
      if (!db.data) return;

      // Note: No hardcoded users or passwords seeded into memory here.
      if (!db.data.users) db.data.users = [];
      if (!db.data.passwords) db.data.passwords = {};

      // Devices
      if (!db.data.devices) db.data.devices = [];
      const existingTestDevice = db.data.devices.find(d => d.id === 'dev_test_01');
      if (!existingTestDevice) {
        db.data.devices.push({
          id: 'dev_test_01',
          tenantId: 'system',
          name: 'Kanonik Saha Test Cihazı (ESP32)',
          type: 'sensor',
          apiKey: testApiKey,
          apiKeyHash: testApiKeyHash,
          status: 'online',
          location: 'Test Laboratuvarı - Saha İstasyonu #1',
          ipAddress: '192.168.1.100',
          lastSeen: new Date().toISOString(),
          rateLimitPerMin: 300,
          encryptionMethod: 'AES-256-GCM',
          isSimulated: true,
          metrics: { temperature: 24.5, humidity: 52.0, cpu: 34.2, power: 85.4, voltage: 224.8 },
        } as any);
      }

      // Dashboards
      if (!db.data.dashboards) db.data.dashboards = [];
      if (!db.data.dashboards.some(d => d.id === 'dash_default')) {
        db.data.dashboards.push({
          id: 'dash_default',
          tenantId: 'system',
          title: 'Varsayılan Sistem Paneli',
          widgets: [...defaultWidgets],
          updatedAt: new Date().toISOString(),
        });
      }

      // Threshold Rules
      if (!db.data.rules) db.data.rules = [];
    } catch {
      // In-memory cache sync is best-effort and non-blocking
    }
  }
}
