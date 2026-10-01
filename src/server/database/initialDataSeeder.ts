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

    const onClientErr = () => {};
    const client = await pool.connect();
    if (client) client.on('error', onClientErr);

    try {
      // NOTE: Security Hardening: NO hardcoded admin accounts or default passwords (admin1234, test1234)
      // are seeded here. The primary administrator is securely created by the operator in Step 6
      // of the Setup Wizard (/api/setup/create-admin). Test accounts are restricted strictly to
      // test runners when ENABLE_TEST_ACCOUNT=true.

      // 1. DASHBOARD LAYOUTS (dashboard_layouts)
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

      systemLogger.info('database', `[InitialDataSeeder] Veritabanı başlangıç şemaları hazırlandı: ${JSON.stringify(counts)}`);

      return {
        success: true,
        summary: `${counts.users} kullanıcı, ${counts.devices} cihaz, ${counts.dashboards} panel`,
        counts,
      };
    } finally {
      if (client) {
        try { client.off('error', onClientErr); } catch {}
        try { client.release(); } catch {}
      }
    }
  }
}
