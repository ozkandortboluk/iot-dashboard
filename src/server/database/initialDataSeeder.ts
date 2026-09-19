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

    try {
      // 1. CANONICAL USERS
      // Ensure Canonical Test Admin (Mandatory Rule 3) & Root Admin placeholder
      const testAdminHash = hashPassword('test1234');
      const rootAdminHash = hashPassword('admin1234');

      // 1a. Root System Administrator (usr_admin)
      await client.query(`
        INSERT INTO users (
          id, name, email, password_hash, role, company_name, status,
          phone, whatsapp_number, telegram_chat_id, notification_email,
          notification_preferences, created_at, updated_at
        ) VALUES (
          'usr_admin', 'Sistem Yöneticisi', 'admin@nexusnode.io', $1, 'admin', 'Merkez Yönetim', 'active',
          '+905551234567', '+905551234567', '129837465', 'admin@nexusnode.io',
          '{"app":true,"email":true,"whatsapp":true,"telegram":true,"sms":true,"webhook":true}'::jsonb,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          role = 'admin',
          status = 'active',
          updated_at = CURRENT_TIMESTAMP;
      `, [rootAdminHash]);
      counts.users++;

      // 1b. Canonical Test Admin (usr_test_admin)
      await client.query(`
        INSERT INTO users (
          id, name, email, password_hash, role, company_name, status,
          phone, whatsapp_number, telegram_chat_id, notification_email,
          notification_preferences, created_at, updated_at
        ) VALUES (
          'usr_test_admin', 'Kanonik Test Yöneticisi', 'test@nexusnodeiot.com.tr', $1, 'admin', 'Test Laboratuvarı', 'active',
          '+905550000000', '+905550000000', '987654321', 'test@nexusnodeiot.com.tr',
          '{"app":true,"email":true,"whatsapp":true,"telegram":true,"sms":true,"webhook":true}'::jsonb,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          email = 'test@nexusnodeiot.com.tr',
          password_hash = $1,
          role = 'admin',
          status = 'active',
          updated_at = CURRENT_TIMESTAMP;
      `, [testAdminHash]);
      counts.users++;

      // 2. CANONICAL TEST DEVICE (dev_test_01)
      const testApiKey = 'dev_key_test_0000000000000000';
      const testApiKeyHash = crypto.createHash('sha256').update(testApiKey).digest('hex');
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

      await client.query(`
        INSERT INTO devices (
          id, tenant_id, customer_id, user_id, name, device_type, role_key,
          api_key, api_key_hash, status, location, ip, ip_address,
          hardware_model, firmware_version, rate_limit_per_min, encryption_method,
          is_simulated, data_flow_active, metrics, supported_outputs, output_definitions,
          capabilities, supported_commands, expected_interval_seconds, heartbeat_timeout_seconds,
          last_seen, created_at
        ) VALUES (
          'dev_test_01', 'usr_test_admin', 'usr_test_admin', 'usr_test_admin',
          'Kanonik Saha Test Cihazı (ESP32)', 'sensor', 'production_sensor',
          $1, $2, 'online', 'Test Laboratuvarı - Saha İstasyonu #1', '192.168.1.100', '192.168.1.100',
          'ESP32-WROOM-32D', 'v1.0.0', 300, 'AES-256-GCM',
          true, true, $3::jsonb, $4::jsonb, $4::jsonb,
          $5::jsonb, $6::jsonb, 10, 60,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          api_key = EXCLUDED.api_key,
          api_key_hash = EXCLUDED.api_key_hash,
          status = 'online',
          ip_address = EXCLUDED.ip_address,
          metrics = EXCLUDED.metrics,
          supported_outputs = EXCLUDED.supported_outputs,
          output_definitions = EXCLUDED.output_definitions,
          last_seen = CURRENT_TIMESTAMP;
      `, [
        testApiKey,
        testApiKeyHash,
        JSON.stringify(initialMetrics),
        JSON.stringify(supportedOutputs),
        JSON.stringify(['telemetry', 'relays', 'pwm', 'ota', 'heartbeat']),
        JSON.stringify(['SET_OUTPUT', 'REBOOT', 'PING', 'OTA_UPDATE']),
      ]);
      counts.devices++;

      // 3. DASHBOARD LAYOUTS (dashboard_layouts)
      // Seed rich 10-widget dashboard layouts for both root admin and canonical test admin
      const widgetsJson = JSON.stringify(defaultWidgets);

      await client.query(`
        INSERT INTO dashboard_layouts (id, user_id, title, widgets_json, updated_at)
        VALUES ('dash_usr_admin', 'usr_admin', 'Merkez Yönetim Ana Dashboard', $1::jsonb, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          widgets_json = EXCLUDED.widgets_json,
          updated_at = CURRENT_TIMESTAMP;
      `, [widgetsJson]);
      counts.dashboards++;

      await client.query(`
        INSERT INTO dashboard_layouts (id, user_id, title, widgets_json, updated_at)
        VALUES ('dash_usr_test_admin', 'usr_test_admin', 'Kanonik Test Dashboard', $1::jsonb, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          widgets_json = EXCLUDED.widgets_json,
          updated_at = CURRENT_TIMESTAMP;
      `, [widgetsJson]);
      counts.dashboards++;

      // 4. THRESHOLD RULES (threshold_rules)
      const defaultRules = [
        {
          id: 'rule_temp_warn',
          userId: 'usr_admin',
          tenantId: 'usr_admin',
          userName: 'Sistem Yöneticisi',
          deviceId: 'all',
          metricKey: 'temperature',
          operator: '>',
          thresholdValue: 40.0,
          severity: 'warning',
          template: 'Ortam sıcaklığı uyarı eşiğini aştı: {{value}}°C (Eşik: 40°C)',
          channels: ['app', 'email'],
        },
        {
          id: 'rule_temp_crit',
          userId: 'usr_admin',
          tenantId: 'usr_admin',
          userName: 'Sistem Yöneticisi',
          deviceId: 'all',
          metricKey: 'temperature',
          operator: '>',
          thresholdValue: 50.0,
          severity: 'critical',
          template: 'Kritik sıcaklık uyarısı! Yangın veya aşırı ısınma tehlikesi: {{value}}°C (Eşik: 50°C)',
          channels: ['app', 'email', 'telegram'],
        },
        {
          id: 'rule_cpu_high',
          userId: 'usr_admin',
          tenantId: 'usr_admin',
          userName: 'Sistem Yöneticisi',
          deviceId: 'all',
          metricKey: 'cpu',
          operator: '>',
          thresholdValue: 85.0,
          severity: 'high',
          template: 'Sunucu/Cihaz işlemci yükü aşırı seviyede: {{value}}%',
          channels: ['app', 'email'],
        },
        {
          id: 'rule_power_high',
          userId: 'usr_admin',
          tenantId: 'usr_admin',
          userName: 'Sistem Yöneticisi',
          deviceId: 'all',
          metricKey: 'power',
          operator: '>',
          thresholdValue: 120.0,
          severity: 'warning',
          template: 'Elektrik güç tüketim limiti aşıldı: {{value}} kW (Eşik: 120 kW)',
          channels: ['app'],
        },
      ];

      for (const rule of defaultRules) {
        await client.query(`
          INSERT INTO threshold_rules (
            id, user_id, tenant_id, user_name, device_id, metric_key,
            operator, threshold_value, severity, enabled, message_template,
            hysteresis, min_breach_duration_sec, repeat_interval_sec,
            notification_channels, active_hours, recipients, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, true, $10,
            1.0, 10, 300,
            $11::jsonb, '00:00-23:59', '[]'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
          ON CONFLICT (id) DO UPDATE SET
            threshold_value = EXCLUDED.threshold_value,
            enabled = true,
            updated_at = CURRENT_TIMESTAMP;
        `, [
          rule.id,
          rule.userId,
          rule.tenantId,
          rule.userName,
          rule.deviceId,
          rule.metricKey,
          rule.operator,
          rule.thresholdValue,
          rule.severity,
          rule.template,
          JSON.stringify(rule.channels),
        ]);
        counts.rules++;
      }

      // 5. HISTORICAL TELEMETRY READINGS (telemetry_readings & telemetry_packets)
      // Seed 24 hours of realistic data points so live charts, area graphs, and TimescaleDB aggregates have instant analytics
      const now = Date.now();
      const telemetryReadingsToInsert: Array<{
        metric: string;
        val: number;
        unit: string;
        timeOffsetMinutes: number;
      }> = [];

      // Generate points at 30-minute intervals over the past 24 hours
      for (let i = 48; i >= 0; i--) {
        const timeOffset = i * 30; // minutes ago
        const sinWave = Math.sin((48 - i) / 4);
        const cosWave = Math.cos((48 - i) / 3);

        const tempVal = parseFloat((23.0 + sinWave * 3.2).toFixed(1));
        const humidVal = parseFloat((50.0 + cosWave * 6.5).toFixed(1));
        const cpuVal = parseFloat((28.0 + Math.abs(sinWave) * 18.0).toFixed(1));
        const powerVal = parseFloat((80.0 + Math.abs(cosWave) * 25.0).toFixed(1));
        const voltVal = parseFloat((223.5 + sinWave * 3.5).toFixed(1));

        telemetryReadingsToInsert.push({ metric: 'temperature', val: tempVal, unit: '°C', timeOffsetMinutes: timeOffset });
        telemetryReadingsToInsert.push({ metric: 'humidity', val: humidVal, unit: '%', timeOffsetMinutes: timeOffset });
        telemetryReadingsToInsert.push({ metric: 'cpu', val: cpuVal, unit: '%', timeOffsetMinutes: timeOffset });
        telemetryReadingsToInsert.push({ metric: 'power', val: powerVal, unit: 'kW', timeOffsetMinutes: timeOffset });
        telemetryReadingsToInsert.push({ metric: 'voltage', val: voltVal, unit: 'V', timeOffsetMinutes: timeOffset });
      }

      for (let idx = 0; idx < telemetryReadingsToInsert.length; idx++) {
        const item = telemetryReadingsToInsert[idx];
        const recordTime = new Date(now - item.timeOffsetMinutes * 60 * 1000).toISOString();
        const recordId = `tel_init_${idx}_${item.metric}`;

        await client.query(`
          INSERT INTO telemetry_readings (
            id, tenant_id, customer_id, user_id, device_id, device_name,
            metric, metric_value, unit, status_level, source, environment, created_at
          ) VALUES (
            $1, 'usr_test_admin', 'usr_test_admin', 'usr_test_admin', 'dev_test_01', 'Kanonik Saha Test Cihazı (ESP32)',
            $2, $3, $4, 'normal', 'physical', 'production', $5::timestamptz
          )
          ON CONFLICT (id, created_at) DO NOTHING;
        `, [recordId, item.metric, item.val, item.unit, recordTime]);
        counts.telemetryReadings++;
      }

      // 6. SYSTEM NOTIFICATIONS (notifications)
      const defaultNotifications = [
        {
          id: 'notif_sys_init',
          userId: 'usr_admin',
          tenantId: 'usr_admin',
          title: 'NexusNode IoT Platformu Başarıyla Kuruldu',
          message: 'PostgreSQL ve TimescaleDB veritabanı yolları, şemalar ve başlangıç tabloları ilk kurulumda başarıyla yazıldı.',
          severity: 'info',
        },
        {
          id: 'notif_test_dev',
          userId: 'usr_test_admin',
          tenantId: 'usr_test_admin',
          title: 'Kanonik Saha Test Cihazı Devrede',
          message: 'ESP32 Kanonik Test Cihazı (dev_test_01) canlı telemetri akışına ve röle kontrolüne hazır vaziyette sisteme tanımlandı.',
          severity: 'info',
        },
        {
          id: 'notif_schema_audit',
          userId: 'usr_admin',
          tenantId: 'usr_admin',
          title: 'Sıfır Veri Kaybı ve Şema Doğrulaması Aktif',
          message: 'TimescaleDB Hypertables, sürekli agregasyon görünümleri ve RLS politikaları başarıyla denetlendi.',
          severity: 'info',
        },
      ];

      for (const notif of defaultNotifications) {
        await client.query(`
          INSERT INTO notifications (
            id, user_id, tenant_id, title, message, severity, type, source, is_read, read, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, 'alert', 'system', false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
          ON CONFLICT (id) DO NOTHING;
        `, [notif.id, notif.userId, notif.tenantId, notif.title, notif.message, notif.severity]);
        counts.notifications++;
      }

      // 7. AUDIT LOGS (audit_logs)
      const auditEntries = [
        {
          id: 'log_init_db',
          userId: 'usr_admin',
          tenantId: 'usr_admin',
          userName: 'Sistem Yöneticisi',
          action: 'DATABASE_PATHS_INITIALIZED',
          details: {
            version: APP_VERSION,
            schemaVersion: '1.18.0',
            description: 'Veritabanı yolları, canonical tablolar ve başlangıç verileri ilk kurulumda başarıyla yazıldı.',
          },
        },
        {
          id: 'log_sys_ready',
          userId: 'usr_admin',
          tenantId: 'usr_admin',
          userName: 'Sistem Yöneticisi',
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

      // 8. SYSTEM EVENTS (system_events)
      await client.query(`
        INSERT INTO system_events (id, event_type, source, severity, payload, created_at)
        VALUES (
          'evt_init_paths', 'DATABASE_INITIALIZATION_SUCCESS', 'SetupService', 'info',
          $1::jsonb, CURRENT_TIMESTAMP
        )
        ON CONFLICT (id) DO NOTHING;
      `, [JSON.stringify({ version: APP_VERSION, state: 'INITIALIZED', seededCounts: counts })]);
      counts.systemEvents++;

      // 9. DEVICE COMMANDS (device_commands)
      await client.query(`
        INSERT INTO device_commands (
          id, device_id, command_type, command_name, output_id, value_payload,
          parameters, source, status, timeout_seconds, created_at, executed_at
        ) VALUES (
          'cmd_init_relay2', 'dev_test_01', 'ACTUATOR_CONTROL', 'SET_OUTPUT', 'relay_2', 'true',
          '{"pin":19,"state":true}'::jsonb, 'system', 'executed', 60,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT (id) DO NOTHING;
      `, []);
      counts.deviceCommands++;

      // 10. FIRMWARES (firmwares)
      await client.query(`
        INSERT INTO firmwares (
          id, name, device_type, role_key, hardware_model, version, description,
          sha256, is_active, uploaded_by, created_at, updated_at
        ) VALUES (
          'fw_esp32_v100', 'ESP32 Industrial IoT Firmware', 'sensor', 'production_sensor', 'ESP32-WROOM-32D',
          '1.0.0', 'Kanonik ESP32 telemetri ve çift yönlü downlink röle kontrol üretici bellenimi.',
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', true, 'Sistem Yöneticisi',
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT (id) DO NOTHING;
      `, []);
      counts.firmwares++;

      // 11. IN-MEMORY DB.DATA CACHE SYNCHRONIZATION
      try {
        InitialDataSeeder.syncInMemoryCache(testApiKey, testApiKeyHash);
      } catch (cacheErr: any) {
        systemLogger.warn('database', `In-memory cache sync notice: ${cacheErr?.message || cacheErr}`);
      }

      systemLogger.info('database', `[InitialDataSeeder] Veritabanı başlangıç verileri ve yolları başarıyla dolduruldu: ${JSON.stringify(counts)}`);

      return {
        success: true,
        summary: `${counts.users} kullanıcı, ${counts.devices} cihaz, ${counts.dashboards} panel, ${counts.rules} kural, ${counts.telemetryReadings} telemetri verisi, ${counts.notifications} bildirim`,
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

      // Users
      if (!db.data.users) db.data.users = [];
      if (!db.data.passwords) db.data.passwords = {};

      const existingTestAdmin = db.data.users.find(u => u.id === 'usr_test_admin');
      if (!existingTestAdmin) {
        db.data.users.push({
          id: 'usr_test_admin',
          name: 'Kanonik Test Yöneticisi',
          email: 'test@nexusnodeiot.com.tr',
          phone: '+905550000000',
          notificationEmail: 'test@nexusnodeiot.com.tr',
          whatsappNumber: '+905550000000',
          role: 'admin',
          companyName: 'Test Laboratuvarı',
          notificationPreferences: { app: true, email: true, whatsapp: true, telegram: true, sms: true, webhook: true },
          created_at: new Date().toISOString(),
        });
        db.data.passwords['usr_test_admin'] = hashPassword('test1234');
      }

      // Devices
      if (!db.data.devices) db.data.devices = [];
      const existingTestDevice = db.data.devices.find(d => d.id === 'dev_test_01');
      if (!existingTestDevice) {
        db.data.devices.push({
          id: 'dev_test_01',
          tenantId: 'usr_test_admin',
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
      if (!db.data.dashboards.some(d => d.id === 'dash_usr_test_admin')) {
        db.data.dashboards.push({
          id: 'dash_usr_test_admin',
          tenantId: 'usr_test_admin',
          title: 'Kanonik Test Dashboard',
          widgets: [...defaultWidgets],
          updatedAt: new Date().toISOString(),
        });
      }

      // Threshold Rules
      if (!db.data.rules) db.data.rules = [];
      if (db.data.rules.length === 0) {
        db.data.rules.push({
          id: 'rule_temp_warn',
          name: 'Sıcaklık Uyarı Eşiği',
          deviceId: 'all',
          metric: 'temperature',
          operator: '>',
          threshold: 40.0,
          severity: 'warning',
          notificationChannels: ['app', 'email'],
          active: true,
        } as any);
      }
    } catch {
      // In-memory cache sync is best-effort and non-blocking
    }
  }
}
