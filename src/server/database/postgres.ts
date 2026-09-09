import type { Pool } from 'pg';
import type {
  User,
  Device,
  TelemetryReading,
  ThresholdRule,
  ActiveAlarm,
  NotificationItem,
  DashboardLayout,
  AuditLog,
  DeviceCommand,
  DeviceCommandStatus,
  UserSession,
  DispatchLogItem,
  Firmware,
  OtaDeploymentJob,
} from '../../types.js';


export class PostgresRepository {
  private pool: Pool | null = null;
  private isConnected = false;
  private connectionErrorNotified = false;
  private lastTestedAt?: string;

  constructor(pool?: Pool | null) {
    if (pool) {
      this.pool = pool;
    }
  }

  public setPool(pool: Pool | null) {
    this.pool = pool;
    this.isConnected = false;
    this.connectionErrorNotified = false;
    this.isSchemaEnsured = false;
  }

  public setConnected(connected: boolean) {
    this.isConnected = connected;
    if (connected) {
      this.connectionErrorNotified = false;
      this.lastTestedAt = new Date().toISOString();
      this.ensureTelemetrySchema(true).catch((err) => {
        console.warn('[PostgreSQL Auto Schema Ensure Warning]:', err?.message || err);
      });
    }
  }

  public getPool(): Pool | null {
    return this.pool;
  }

  public isReady(): boolean {
    return !!this.pool && this.isConnected;
  }

  public async getPoolAndPerformanceStats(): Promise<{
    totalCount: number;
    idleCount: number;
    waitingCount: number;
    maxConnections: number;
    queryLatencyMs: number;
    status: 'healthy' | 'degraded' | 'unhealthy';
    activeQueriesCount: number;
    databaseSizeBytes?: string;
  }> {
    if (!this.pool) {
      return {
        totalCount: 0,
        idleCount: 0,
        waitingCount: 0,
        maxConnections: 0,
        queryLatencyMs: -1,
        status: 'unhealthy',
        activeQueriesCount: 0,
      };
    }

    const t0 = performance.now();
    let queryLatencyMs = 0;
    let activeQueriesCount = 0;
    let databaseSizeBytes = '0';

    try {
      await this.pool.query('SELECT 1;');
      queryLatencyMs = Math.round((performance.now() - t0) * 100) / 100;

      const statsRes = await this.pool.query(`
        SELECT 
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_queries,
          pg_database_size(current_database()) as db_size;
      `);
      activeQueriesCount = parseInt(statsRes.rows[0]?.active_queries || '0', 10);
      databaseSizeBytes = statsRes.rows[0]?.db_size || '0';
    } catch {
      queryLatencyMs = -1;
    }

    return {
      totalCount: (this.pool as any).totalCount || 0,
      idleCount: (this.pool as any).idleCount || 0,
      waitingCount: (this.pool as any).waitingCount || 0,
      maxConnections: (this.pool as any).options?.max || 20,
      queryLatencyMs,
      status: queryLatencyMs >= 0 && queryLatencyMs < 200 ? 'healthy' : (queryLatencyMs >= 200 ? 'degraded' : 'unhealthy'),
      activeQueriesCount,
      databaseSizeBytes,
    };
  }

  public async checkDatabaseVersion(): Promise<{
    postgresVersion: string;
    isTimescaleInstalled: boolean;
    timescaleVersion?: string;
    isCompatible: boolean;
    warnings: string[];
  }> {
    if (!this.pool) {
      return {
        postgresVersion: 'unknown',
        isTimescaleInstalled: false,
        isCompatible: false,
        warnings: ['PostgreSQL pool is not initialized.'],
      };
    }

    const warnings: string[] = [];
    let pgVersionStr = '';
    let isTimescale = false;
    let timescaleVersion: string | undefined;

    try {
      const res = await this.pool.query('SELECT version();');
      pgVersionStr = res.rows[0]?.version || '';
      
      const match = pgVersionStr.match(/PostgreSQL (\d+)/i);
      const majorVersion = match ? parseInt(match[1], 10) : 0;
      if (majorVersion > 0 && majorVersion < 15) {
        warnings.push(`PostgreSQL version ${majorVersion} detected. Production recommended version is >= 15.`);
      }
    } catch (err: any) {
      warnings.push(`Failed to query PostgreSQL version: ${err?.message || err}`);
    }

    try {
      const extRes = await this.pool.query(
        "SELECT extname, extversion FROM pg_extension WHERE extname = 'timescaledb';"
      );
      if (extRes.rows.length > 0) {
        isTimescale = true;
        timescaleVersion = extRes.rows[0].extversion;
        const tsMatch = timescaleVersion?.match(/^(\d+)\.(\d+)/);
        if (tsMatch) {
          const tsMajor = parseInt(tsMatch[1], 10);
          const tsMinor = parseInt(tsMatch[2], 10);
          if (tsMajor < 2 || (tsMajor === 2 && tsMinor < 11)) {
            warnings.push(`TimescaleDB version ${timescaleVersion} detected. Production recommended version is >= 2.11.`);
          }
        }
      } else {
        warnings.push('TimescaleDB extension is not enabled in this database. Running in standard PostgreSQL mode.');
      }
    } catch (err: any) {
      warnings.push(`Could not query pg_extension: ${err?.message || err}`);
    }

    return {
      postgresVersion: pgVersionStr,
      isTimescaleInstalled: isTimescale,
      timescaleVersion,
      isCompatible: warnings.length === 0,
      warnings,
    };
  }

  public async checkIfAdminExists(): Promise<boolean> {
    if (!this.pool) return false;
    try {
      const res = await this.pool.query("SELECT 1 FROM users WHERE role = 'admin' AND (deleted_at IS NULL) LIMIT 1;");
      return (res.rowCount || 0) > 0;
    } catch {
      return false;
    }
  }

  private isSchemaEnsured = false;
  private isRecoveringSchema = false;

  public async ensureTelemetrySchema(force = false): Promise<void> {
    if (!this.pool || (this.isSchemaEnsured && !force)) return;
    try {
      const statements = [
        // 1. Users Table & Columns
        `CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(128) NOT NULL,
          email VARCHAR(128) UNIQUE NOT NULL,
          phone VARCHAR(32),
          notification_email VARCHAR(128),
          whatsapp_number VARCHAR(32),
          telegram_chat_id VARCHAR(64),
          password_hash VARCHAR(256) NOT NULL,
          role VARCHAR(32) DEFAULT 'operator',
          company_name VARCHAR(128),
          notification_preferences JSONB DEFAULT '{"app":true,"email":true,"whatsapp":true,"telegram":true,"sms":true,"webhook":true}'::jsonb,
          status VARCHAR(32) DEFAULT 'active',
          deleted_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'active';`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32);`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_email VARCHAR(128);`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(32);`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(64);`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name VARCHAR(128);`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"app":true,"email":true,"whatsapp":true,"telegram":true,"sms":true,"webhook":true}'::jsonb;`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(32) DEFAULT 'operator';`,

        // 1b. Seed Canonical Root Admin (usr_admin)
        `INSERT INTO users (id, name, email, password_hash, role, company_name, status, created_at)
        VALUES (
          'usr_admin', 
          'Sistem Yöneticisi', 
          'admin@nexusnode.io', 
          '$2a$10$B50m1l26vD8LhJqZ8XyqA.v2a00qQGq7cR/8v4M7sF2D3Q4s7rD9K', 
          'admin', 
          'Merkez Yönetim', 
          'active', 
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (id) DO NOTHING;`,

        // 2. Devices Table & Columns (Enforcing Canonical tenant_id & Ownership Audit)
        `CREATE TABLE IF NOT EXISTS devices (
          id VARCHAR(64) PRIMARY KEY,
          tenant_id VARCHAR(64) NOT NULL DEFAULT 'usr_admin',
          user_id VARCHAR(64) DEFAULT 'usr_admin',
          previous_tenant_id VARCHAR(64),
          previous_tenant_name VARCHAR(128),
          ownership_transferred_at TIMESTAMP WITH TIME ZONE,
          name VARCHAR(128) NOT NULL,
          device_type VARCHAR(32) NOT NULL,
          api_key VARCHAR(128),
          api_key_prefix VARCHAR(32),
          api_key_hash VARCHAR(128),
          status VARCHAR(32) DEFAULT 'online',
          location VARCHAR(256),
          ip_address VARCHAR(45),
          mac_address VARCHAR(32),
          last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          rate_limit_per_min INT DEFAULT 120,
          encryption_method VARCHAR(64) DEFAULT 'AES-256-GCM',
          metrics JSONB DEFAULT '{}'::jsonb,
          data_flow_active BOOLEAN DEFAULT TRUE,
          is_simulated BOOLEAN DEFAULT FALSE,
          save_simulated_data_to_db BOOLEAN DEFAULT FALSE,
          simulated_metrics JSONB DEFAULT '[]'::jsonb,
          role_key VARCHAR(64),
          hardware_model VARCHAR(64),
          firmware_version VARCHAR(32),
          ota_status VARCHAR(32) DEFAULT 'IDLE',
          ota_target_firmware_id VARCHAR(64),
          ota_progress INT DEFAULT 0,
          ota_error_message TEXT,
          ota_last_check_at TIMESTAMP WITH TIME ZONE,
          expected_interval_seconds INT DEFAULT 30,
          auto_detected_interval_seconds INT DEFAULT 30,
          heartbeat_timeout_seconds INT DEFAULT 60,
          interval_mode VARCHAR(16) DEFAULT 'auto',
          custom_interval_seconds INT,
          recent_intervals JSONB DEFAULT '[]'::jsonb,
          websocket_connected BOOLEAN DEFAULT FALSE,
          last_message_at TIMESTAMP WITH TIME ZONE,
          output_definitions JSONB DEFAULT '[]'::jsonb,
          capabilities JSONB DEFAULT '[]'::jsonb,
          supported_outputs JSONB DEFAULT '[]'::jsonb,
          supported_commands JSONB DEFAULT '[]'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'usr_admin';`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS user_id VARCHAR(64) DEFAULT 'usr_admin';`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS previous_tenant_id VARCHAR(64);`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS previous_tenant_name VARCHAR(128);`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS ownership_transferred_at TIMESTAMP WITH TIME ZONE;`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS role_key VARCHAR(64);`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS hardware_model VARCHAR(64);`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS firmware_version VARCHAR(32);`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_prefix VARCHAR(32);`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_hash VARCHAR(128);`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN DEFAULT FALSE;`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS save_simulated_data_to_db BOOLEAN DEFAULT FALSE;`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS simulated_metrics JSONB DEFAULT '[]'::jsonb;`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_status VARCHAR(32) DEFAULT 'IDLE';`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_target_firmware_id VARCHAR(64);`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_progress INT DEFAULT 0;`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_error_message TEXT;`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_last_check_at TIMESTAMP WITH TIME ZONE;`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS expected_interval_seconds INT DEFAULT 30;`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS auto_detected_interval_seconds INT DEFAULT 30;`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS heartbeat_timeout_seconds INT DEFAULT 60;`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS interval_mode VARCHAR(16) DEFAULT 'auto';`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS custom_interval_seconds INT;`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS recent_intervals JSONB DEFAULT '[]'::jsonb;`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS websocket_connected BOOLEAN DEFAULT FALSE;`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMP WITH TIME ZONE;`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS output_definitions JSONB DEFAULT '[]'::jsonb;`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '[]'::jsonb;`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS supported_outputs JSONB DEFAULT '[]'::jsonb;`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS supported_commands JSONB DEFAULT '[]'::jsonb;`,

        // Canonical Data Hygiene & Foreign Key Attachment with ON DELETE SET DEFAULT
        `UPDATE devices SET tenant_id = 'usr_admin' WHERE tenant_id IS NULL OR tenant_id = '';`,
        `UPDATE devices SET user_id = tenant_id WHERE user_id IS NULL OR user_id = '';`,
        `UPDATE devices SET tenant_id = 'usr_admin' WHERE tenant_id NOT IN (SELECT id FROM users);`,
        `UPDATE devices SET user_id = tenant_id WHERE user_id NOT IN (SELECT id FROM users);`,
        `DO $$ 
        BEGIN
            -- Clean up old direct fk constraints if present
            ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_user_id_fkey;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints 
                WHERE table_name = 'devices' AND constraint_name = 'fk_devices_tenant_id'
            ) THEN
                ALTER TABLE devices ADD CONSTRAINT fk_devices_tenant_id FOREIGN KEY (tenant_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET DEFAULT;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints 
                WHERE table_name = 'devices' AND constraint_name = 'fk_devices_user_id'
            ) THEN
                ALTER TABLE devices ADD CONSTRAINT fk_devices_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET DEFAULT;
            END IF;
        END $$;`,

        // 3. Telemetry Packets & Readings
        `CREATE TABLE IF NOT EXISTS telemetry_packets (
          id VARCHAR(192) PRIMARY KEY,
          device_id VARCHAR(64) NOT NULL,
          boot_id VARCHAR(64) DEFAULT 'default' NOT NULL,
          sequence BIGINT NOT NULL,
          idempotency_key VARCHAR(192),
          metric_count INTEGER DEFAULT 1,
          received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
        );`,
        `CREATE TABLE IF NOT EXISTS device_ws_messages_dedup (
          device_id VARCHAR(64) NOT NULL,
          message_id VARCHAR(128) NOT NULL,
          message_type VARCHAR(32) NOT NULL,
          received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          PRIMARY KEY (device_id, message_id)
        );`,
        `CREATE INDEX IF NOT EXISTS idx_device_ws_dedup_expires ON device_ws_messages_dedup(expires_at);`,
        `CREATE TABLE IF NOT EXISTS telemetry_readings (
          id VARCHAR(128) NOT NULL,
          packet_id VARCHAR(128),
          tenant_id VARCHAR(64) DEFAULT 'usr_admin',
          customer_id VARCHAR(64) DEFAULT 'usr_admin',
          user_id VARCHAR(64) DEFAULT 'usr_admin',
          device_id VARCHAR(64),
          device_name VARCHAR(128) NOT NULL,
          metric VARCHAR(64) NOT NULL,
          metric_value DOUBLE PRECISION NOT NULL,
          unit VARCHAR(16) NOT NULL,
          status_level VARCHAR(32) DEFAULT 'normal',
          sequence BIGINT,
          boot_id VARCHAR(64) DEFAULT 'default',
          idempotency_key VARCHAR(192),
          source VARCHAR(32) DEFAULT 'physical',
          environment VARCHAR(32) DEFAULT 'production',
          simulation_run_id VARCHAR(128),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
          PRIMARY KEY (id, created_at)
        );`,
        `CREATE TABLE IF NOT EXISTS simulation_telemetry_readings (
          id VARCHAR(128) NOT NULL,
          packet_id VARCHAR(128),
          tenant_id VARCHAR(64) DEFAULT 'usr_admin',
          customer_id VARCHAR(64) DEFAULT 'usr_admin',
          user_id VARCHAR(64) DEFAULT 'usr_admin',
          device_id VARCHAR(64),
          device_name VARCHAR(128) NOT NULL,
          metric VARCHAR(64) NOT NULL,
          metric_value DOUBLE PRECISION NOT NULL,
          unit VARCHAR(16) NOT NULL,
          status_level VARCHAR(32) DEFAULT 'normal',
          sequence BIGINT,
          boot_id VARCHAR(64) DEFAULT 'default',
          idempotency_key VARCHAR(192),
          source VARCHAR(32) DEFAULT 'simulator',
          environment VARCHAR(32) DEFAULT 'sandbox',
          simulation_run_id VARCHAR(128),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
          PRIMARY KEY (id, created_at)
        );`,
        `ALTER TABLE telemetry_packets ADD COLUMN IF NOT EXISTS boot_id VARCHAR(64) DEFAULT 'default';`,
        `ALTER TABLE telemetry_packets ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(192);`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_telemetry_packets_idempotency ON telemetry_packets(device_id, boot_id, sequence);`,
        `ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'usr_admin';`,
        `ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS customer_id VARCHAR(64) DEFAULT 'usr_admin';`,
        `ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS user_id VARCHAR(64) DEFAULT 'usr_admin';`,
        `ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS packet_id VARCHAR(128);`,
        `ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS sequence BIGINT;`,
        `ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS boot_id VARCHAR(64) DEFAULT 'default';`,
        `ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(192);`,
        `ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS source VARCHAR(32) DEFAULT 'physical';`,
        `ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS environment VARCHAR(32) DEFAULT 'production';`,
        `ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS simulation_run_id VARCHAR(128);`,
        `ALTER TABLE simulation_telemetry_readings ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'usr_admin';`,
        `ALTER TABLE simulation_telemetry_readings ADD COLUMN IF NOT EXISTS customer_id VARCHAR(64) DEFAULT 'usr_admin';`,
        `ALTER TABLE simulation_telemetry_readings ADD COLUMN IF NOT EXISTS user_id VARCHAR(64) DEFAULT 'usr_admin';`,
        `ALTER TABLE simulation_telemetry_readings ADD COLUMN IF NOT EXISTS packet_id VARCHAR(128);`,
        `ALTER TABLE simulation_telemetry_readings ADD COLUMN IF NOT EXISTS sequence BIGINT;`,
        `ALTER TABLE simulation_telemetry_readings ADD COLUMN IF NOT EXISTS boot_id VARCHAR(64) DEFAULT 'default';`,
        `ALTER TABLE simulation_telemetry_readings ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(192);`,
        `ALTER TABLE simulation_telemetry_readings ADD COLUMN IF NOT EXISTS source VARCHAR(32) DEFAULT 'simulator';`,
        `ALTER TABLE simulation_telemetry_readings ADD COLUMN IF NOT EXISTS environment VARCHAR(32) DEFAULT 'sandbox';`,
        `ALTER TABLE simulation_telemetry_readings ADD COLUMN IF NOT EXISTS simulation_run_id VARCHAR(128);`,
        `CREATE INDEX IF NOT EXISTS idx_telemetry_tenant_device_time ON telemetry_readings(tenant_id, device_id, created_at DESC);`,
        `CREATE INDEX IF NOT EXISTS idx_telemetry_customer_device_time ON telemetry_readings(customer_id, device_id, created_at DESC);`,
        `CREATE INDEX IF NOT EXISTS idx_sim_telemetry_tenant_device_time ON simulation_telemetry_readings(tenant_id, device_id, created_at DESC);`,
        `CREATE INDEX IF NOT EXISTS idx_sim_telemetry_customer_device_time ON simulation_telemetry_readings(customer_id, device_id, created_at DESC);`,

        // 4. Threshold Rules
        `CREATE TABLE IF NOT EXISTS threshold_rules (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64),
          user_name VARCHAR(128),
          device_id VARCHAR(64) DEFAULT 'all',
          metric_key VARCHAR(64) NOT NULL,
          operator VARCHAR(8) NOT NULL,
          threshold_value NUMERIC NOT NULL,
          severity VARCHAR(32) DEFAULT 'warning',
          enabled BOOLEAN DEFAULT TRUE,
          message_template TEXT,
          hysteresis NUMERIC DEFAULT 0,
          min_breach_duration_sec INT DEFAULT 0,
          repeat_interval_sec INT DEFAULT 0,
          notification_channels JSONB DEFAULT '["app"]'::jsonb,
          active_hours JSONB,
          recipients JSONB,
          silenced_until TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );`,
        `ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);`,
        `ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);`,
        `ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS user_name VARCHAR(128);`,
        `ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS device_id VARCHAR(64) DEFAULT 'all';`,
        `ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS metric_key VARCHAR(64);`,
        `ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS operator VARCHAR(8);`,
        `ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS threshold_value NUMERIC;`,
        `ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS severity VARCHAR(32) DEFAULT 'warning';`,
        `ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE;`,
        `ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS message_template TEXT;`,
        `ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS hysteresis NUMERIC DEFAULT 0;`,
        `ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS min_breach_duration_sec INT DEFAULT 0;`,
        `ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS repeat_interval_sec INT DEFAULT 0;`,
        `ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS notification_channels JSONB DEFAULT '["app"]'::jsonb;`,
        `ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS active_hours JSONB;`,
        `ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS recipients JSONB;`,
        `ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS silenced_until TIMESTAMP WITH TIME ZONE;`,
        `ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`,
        `ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`,

        // 5. Active Alarms
        `CREATE TABLE IF NOT EXISTS active_alarms (
          id VARCHAR(128) PRIMARY KEY,
          incident_id VARCHAR(128),
          last_evaluated_at TIMESTAMP WITH TIME ZONE,
          rule_id VARCHAR(64) REFERENCES threshold_rules(id) ON DELETE CASCADE,
          device_id VARCHAR(64),
          device_name VARCHAR(128) NOT NULL,
          user_id VARCHAR(64),
          metric_key VARCHAR(64) NOT NULL,
          operator VARCHAR(16) NOT NULL,
          threshold_value NUMERIC NOT NULL,
          current_value NUMERIC NOT NULL,
          severity VARCHAR(32) DEFAULT 'warning',
          state VARCHAR(32) DEFAULT 'TRIGGERED',
          first_breach_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          triggered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          last_notified_at TIMESTAMP WITH TIME ZONE,
          resolved_at TIMESTAMP WITH TIME ZONE,
          acknowledged BOOLEAN DEFAULT FALSE,
          acknowledged_at TIMESTAMP WITH TIME ZONE,
          acknowledged_by VARCHAR(128),
          silenced_until TIMESTAMP WITH TIME ZONE,
          repeat_count INT DEFAULT 0,
          message TEXT,
          source VARCHAR(32) DEFAULT 'physical',
          environment VARCHAR(32) DEFAULT 'production',
          is_simulation BOOLEAN DEFAULT FALSE,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );`,
        `ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);`,
        `ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS source VARCHAR(32) DEFAULT 'physical';`,
        `ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS environment VARCHAR(32) DEFAULT 'production';`,
        `ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS is_simulation BOOLEAN DEFAULT FALSE;`,
        `ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS incident_id VARCHAR(128);`,
        `ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS last_evaluated_at TIMESTAMP WITH TIME ZONE;`,
        `ALTER TABLE active_alarms ALTER COLUMN operator TYPE VARCHAR(32);`,

        // 5.5 Alarm Events
        `CREATE TABLE IF NOT EXISTS alarm_events (
          id VARCHAR(128) PRIMARY KEY,
          incident_id VARCHAR(128) NOT NULL,
          alarm_id VARCHAR(128) NOT NULL,
          rule_id VARCHAR(64) NOT NULL,
          device_id VARCHAR(64) NOT NULL,
          tenant_id VARCHAR(64) NOT NULL,
          event_type VARCHAR(32) NOT NULL,
          message TEXT,
          triggered_by VARCHAR(128),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE INDEX IF NOT EXISTS idx_alarm_events_incident ON alarm_events(incident_id);`,
        `CREATE INDEX IF NOT EXISTS idx_alarm_events_alarm ON alarm_events(alarm_id);`,

        // 6. Dashboard Layouts
        `CREATE TABLE IF NOT EXISTS dashboard_layouts (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64),
          title VARCHAR(128) NOT NULL,
          widgets_json JSONB NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );`,
        `ALTER TABLE dashboard_layouts ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);`,
        `ALTER TABLE dashboard_layouts ADD COLUMN IF NOT EXISTS title VARCHAR(128) DEFAULT 'Özel Dashboard';`,

        // 7. Notifications
        `CREATE TABLE IF NOT EXISTS notifications (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64),
          title VARCHAR(256) NOT NULL,
          message TEXT NOT NULL,
          severity VARCHAR(32) DEFAULT 'info',
          device_id VARCHAR(64),
          device_name VARCHAR(128),
          is_read BOOLEAN DEFAULT FALSE,
          alarm_id VARCHAR(128),
          rule_id VARCHAR(64),
          alarm_state VARCHAR(32),
          acknowledged BOOLEAN DEFAULT FALSE,
          acknowledged_at TIMESTAMP WITH TIME ZONE,
          acknowledged_by VARCHAR(128),
          repeat_count INT DEFAULT 0,
          current_value NUMERIC,
          threshold_value NUMERIC,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );`,
        `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);`,
        `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS alarm_id VARCHAR(128);`,
        `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS rule_id VARCHAR(64);`,
        `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS alarm_state VARCHAR(32);`,
        `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS acknowledged BOOLEAN DEFAULT FALSE;`,
        `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMP WITH TIME ZONE;`,
        `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS acknowledged_by VARCHAR(128);`,
        `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS repeat_count INT DEFAULT 0;`,
        `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS current_value NUMERIC;`,
        `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS threshold_value NUMERIC;`,

        // 8. Audit Logs
        `CREATE TABLE IF NOT EXISTS audit_logs (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64),
          user_name VARCHAR(128),
          action TEXT NOT NULL,
          ip_address VARCHAR(64),
          severity VARCHAR(32) DEFAULT 'low',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );`,
        `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);`,
        `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_name VARCHAR(128);`,

        // 9. User Sessions
        `CREATE TABLE IF NOT EXISTS user_sessions (
          token VARCHAR(128) PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL,
          user_role VARCHAR(32) NOT NULL,
          user_email VARCHAR(128) NOT NULL,
          user_name VARCHAR(128) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL
        );`,
        `ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);`,

        // 10. Dispatch Logs
        `CREATE TABLE IF NOT EXISTS dispatch_logs (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64),
          user_name VARCHAR(128),
          channel VARCHAR(32) NOT NULL,
          recipient VARCHAR(128) NOT NULL,
          title VARCHAR(256),
          message TEXT NOT NULL,
          severity VARCHAR(32) DEFAULT 'info',
          status VARCHAR(32) DEFAULT 'delivered',
          attempt_count INT DEFAULT 1,
          latency_ms INT DEFAULT 0,
          error_details TEXT,
          sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );`,
        `ALTER TABLE dispatch_logs ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);`,
        `ALTER TABLE dispatch_logs ADD COLUMN IF NOT EXISTS user_name VARCHAR(128);`,

        // 11. Firmwares & OTA Jobs
        `CREATE TABLE IF NOT EXISTS firmwares (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(128) NOT NULL,
          device_type VARCHAR(64) NOT NULL,
          role_key VARCHAR(64) DEFAULT 'ALL',
          hardware_model VARCHAR(64) DEFAULT 'ALL',
          version VARCHAR(32) NOT NULL,
          description TEXT,
          binary_data BYTEA,
          binary_size BIGINT DEFAULT 0,
          sha256 VARCHAR(64) NOT NULL,
          signature TEXT,
          file_path TEXT,
          min_hardware_revision VARCHAR(32),
          is_active BOOLEAN DEFAULT TRUE,
          uploaded_by VARCHAR(128) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );`,
        `ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS signature TEXT;`,
        `ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS file_path TEXT;`,
        `CREATE TABLE IF NOT EXISTS ota_deployment_jobs (
          id VARCHAR(64) PRIMARY KEY,
          firmware_id VARCHAR(64) REFERENCES firmwares(id) ON DELETE CASCADE,
          firmware_version VARCHAR(32) NOT NULL,
          firmware_name VARCHAR(128) NOT NULL,
          device_id VARCHAR(64) REFERENCES devices(id) ON DELETE CASCADE,
          device_name VARCHAR(128) NOT NULL,
          device_type VARCHAR(64) NOT NULL,
          role_key VARCHAR(64) NOT NULL,
          target_scope VARCHAR(32) DEFAULT 'single',
          status VARCHAR(32) DEFAULT 'PENDING',
          progress_percent INT DEFAULT 0,
          error_message TEXT,
          initiated_by VARCHAR(128) NOT NULL,
          download_token VARCHAR(128),
          expires_at TIMESTAMP WITH TIME ZONE,
          attempt_count INT DEFAULT 0,
          max_attempts INT DEFAULT 3,
          last_attempt_at TIMESTAMP WITH TIME ZONE,
          next_retry_at TIMESTAMP WITH TIME ZONE,
          download_started_at TIMESTAMP WITH TIME ZONE,
          boot_confirmed_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP WITH TIME ZONE
        );`,
        `ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS download_token VARCHAR(128);`,
        `ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;`,
        `ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS attempt_count INT DEFAULT 0;`,
        `ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS max_attempts INT DEFAULT 3;`,
        `ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP WITH TIME ZONE;`,
        `ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP WITH TIME ZONE;`,
        `ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS download_started_at TIMESTAMP WITH TIME ZONE;`,
        `ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS boot_confirmed_at TIMESTAMP WITH TIME ZONE;`
      ];

      for (const stmt of statements) {
        try {
          await this.pool.query(stmt);
        } catch {
          // ignore individual DDL notices
        }
      }
      this.isSchemaEnsured = true;
    } catch (err: any) {
      console.warn('[PostgreSQL ensureTelemetrySchema Warning]:', err?.message || err);
    }
  }

  /**
   * Runs parameterized query against PostgreSQL pool.
   * Throws an error on execution failure or when connection is not ready,
   * ensuring caller services (e.g. Telemetry Ingestion) can reliably detect write failures and retry.
   */
  public async query(text: string, params: any[] = []): Promise<any> {
    if (!this.pool || !this.isConnected) {
      throw new Error('PostgreSQL veritabanı bağlantısı hazır veya aktif değil');
    }
    try {
      return await this.pool.query(text, params);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isMissingColumnOrTable =
        err?.code === '42703' || // undefined_column
        err?.code === '42P01' || // undefined_table
        errMsg.includes('does not exist');

      if (isMissingColumnOrTable && !this.isRecoveringSchema && this.pool) {
        this.isRecoveringSchema = true;
        try {
          console.warn(`[PostgreSQL Otomatik Onarım]: Eksik kolon/tablo tespit edildi (${errMsg}), şema eşitlenip sorgu tekrarlanıyor...`);
          await this.ensureTelemetrySchema(true);
          return await this.pool.query(text, params);
        } catch (retryErr: any) {
          console.warn('[PostgreSQL Otomatik Onarım Tekrar Hatası]:', retryErr?.message || retryErr);
        } finally {
          this.isRecoveringSchema = false;
        }
      }

      const isDevicesFkError =
        (err?.code === '23503' || errMsg.includes('foreign key constraint')) &&
        (errMsg.includes('devices_user_id_fkey') || (errMsg.includes('table "devices"') && errMsg.includes('user_id')));

      if (isDevicesFkError && !this.isRecoveringSchema && this.pool) {
        this.isRecoveringSchema = true;
        try {
          console.warn(`[PostgreSQL Otomatik Onarım]: Cihaz yabancı anahtar kısıtı tespit edildi (${errMsg}), kısıt kaldırılarak sorgu tekrarlanıyor...`);
          await this.pool.query(`ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_user_id_fkey;`);
          await this.pool.query(`
            DO $$ 
            DECLARE 
                r RECORD;
            BEGIN
                FOR r IN (
                    SELECT constraint_name 
                    FROM information_schema.table_constraints 
                    WHERE table_name = 'devices' 
                    AND constraint_type = 'FOREIGN KEY'
                    AND constraint_name LIKE '%user%'
                ) LOOP
                    EXECUTE 'ALTER TABLE devices DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
                END LOOP;
            END $$;
          `);
          return await this.pool.query(text, params);
        } catch (retryErr: any) {
          console.warn('[PostgreSQL Cihaz Kısıt Kaldırma Tekrar Hatası]:', retryErr?.message || retryErr);
        } finally {
          this.isRecoveringSchema = false;
        }
      }

      const isConnectionIssue =
        errMsg.includes('timeout') ||
        errMsg.includes('Connection terminated') ||
        errMsg.includes('ECONNREFUSED') ||
        errMsg.includes('ETIMEDOUT') ||
        errMsg.includes('57P01') ||
        errMsg.includes('08006') ||
        errMsg.includes('Connection closed') ||
        errMsg.includes('client has already been released');

      if (isConnectionIssue) {
        this.isConnected = false;
        console.warn(`[PostgreSQL Bağlantı Kesintisi Tespit Edildi]: ${errMsg}. Bellek içi veritabanına sorunsuz geçiş yapılıyor.`);
      } else {
        console.warn(`[PostgreSQL Query Error]: ${errMsg}`);
      }
      throw err;
    }
  }

  // ==========================================
  // USERS & PASSWORDS
  // ==========================================
  public async saveUser(user: User, passwordHash?: string): Promise<void> {
    if (!this.pool) return;
    await this.ensureTelemetrySchema();
    const sql = `
      INSERT INTO users (
        id, name, email, phone, notification_email, whatsapp_number, 
        telegram_chat_id, password_hash, role, company_name, 
        notification_preferences, status, deleted_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        notification_email = EXCLUDED.notification_email,
        whatsapp_number = EXCLUDED.whatsapp_number,
        telegram_chat_id = EXCLUDED.telegram_chat_id,
        password_hash = CASE WHEN EXCLUDED.password_hash = '__pending__' THEN users.password_hash ELSE EXCLUDED.password_hash END,
        role = EXCLUDED.role,
        company_name = EXCLUDED.company_name,
        notification_preferences = EXCLUDED.notification_preferences,
        status = EXCLUDED.status,
        deleted_at = EXCLUDED.deleted_at,
        updated_at = CURRENT_TIMESTAMP;
    `;
    await this.query(sql, [
      user.id,
      user.name,
      user.email,
      user.phone || null,
      user.notificationEmail || null,
      user.whatsappNumber || null,
      user.telegramChatId || null,
      passwordHash || '__pending__',
      user.role || 'customer',
      user.companyName || null,
      JSON.stringify(user.notificationPreferences || {}),
      user.status || 'active',
      user.deletedAt || null,
      user.created_at || new Date().toISOString(),
      user.updatedAt || new Date().toISOString(),
    ]);
  }

  public async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    if (!this.pool) return;
    await this.query(`UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;`, [
      passwordHash,
      userId,
    ]);
  }

  public async deleteUser(userId: string): Promise<void> {
    if (!this.pool) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // 1. Cihaz Sahipliğini Koruma & Kanonik Sistem Yöneticisine Aktarım:
      // Kullanıcı silindiğinde cihaz korunur, ancak kimsesiz / belirsiz kalmaması için
      // kanonik olarak 'usr_admin' (Merkez Yönetim) hesabına devredilir ve geçmiş kayıtları saklanır.
      await client.query(`
        UPDATE devices
        SET 
          previous_tenant_id = $1,
          previous_tenant_name = COALESCE((SELECT name FROM users WHERE id = $1 LIMIT 1), 'Eski Müşteri'),
          ownership_transferred_at = NOW(),
          tenant_id = 'usr_admin',
          user_id = 'usr_admin',
          location = CASE 
            WHEN location IS NULL OR location = '' OR location = 'Varsayılan' 
            THEN 'Merkez Depo (Eski Müşteri: ' || COALESCE((SELECT name FROM users WHERE id = $1 LIMIT 1), $1) || ')'
            ELSE location 
          END
        WHERE tenant_id = $1 OR user_id = $1;
      `, [userId]);

      // 2. Kullanıcının oturumlarını temizle
      await client.query(`DELETE FROM user_sessions WHERE user_id = $1;`, [userId]);

      // 3. Kullanıcıyı sil (Artık hiçbir cihaz bu kullanıcıya bağlı olmadığı için FK ihlali oluşmaz)
      await client.query(`DELETE FROM users WHERE id = $1;`, [userId]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  public async softDeleteUser(userId: string): Promise<void> {
    if (!this.pool) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE users SET status = 'suspended', deleted_at = NOW() WHERE id = $1;`, [userId]);
      // Silme veya askıya alma durumlarında ek temizlik (örneğin oturumların temizlenmesi) eklenebilir.
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // ==========================================
  // DEVICES
  // ==========================================
  public async saveDevice(dev: Device): Promise<void> {
    if (!this.pool) return;
    await this.ensureTelemetrySchema();

    // Canonical Tenant Doğrulaması: Boş veya tanımsız tenantId kesinlikle 'usr_admin'e yönlendirilir
    const canonicalTenantId = (dev.tenantId || (dev as any).userId || '').trim() || 'usr_admin';

    const sql = `
      INSERT INTO devices (
        id, tenant_id, user_id, previous_tenant_id, previous_tenant_name, ownership_transferred_at,
        name, device_type, api_key, api_key_prefix, api_key_hash, status, location, 
        ip_address, mac_address, last_seen, rate_limit_per_min, 
        encryption_method, metrics, data_flow_active, is_simulated, 
        save_simulated_data_to_db, simulated_metrics, role_key, hardware_model, firmware_version,
        ota_status, ota_target_firmware_id, ota_progress, ota_error_message, ota_last_check_at,
        expected_interval_seconds, auto_detected_interval_seconds, heartbeat_timeout_seconds,
        interval_mode, custom_interval_seconds, recent_intervals,
        websocket_connected, last_message_at, output_definitions, capabilities, supported_outputs, supported_commands,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 
        $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, 
        $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44
      )
      ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        user_id = EXCLUDED.user_id,
        previous_tenant_id = COALESCE(EXCLUDED.previous_tenant_id, devices.previous_tenant_id),
        previous_tenant_name = COALESCE(EXCLUDED.previous_tenant_name, devices.previous_tenant_name),
        ownership_transferred_at = COALESCE(EXCLUDED.ownership_transferred_at, devices.ownership_transferred_at),
        name = EXCLUDED.name,
        device_type = EXCLUDED.device_type,
        api_key = EXCLUDED.api_key,
        api_key_prefix = EXCLUDED.api_key_prefix,
        api_key_hash = EXCLUDED.api_key_hash,
        status = EXCLUDED.status,
        location = EXCLUDED.location,
        ip_address = EXCLUDED.ip_address,
        mac_address = EXCLUDED.mac_address,
        last_seen = EXCLUDED.last_seen,
        rate_limit_per_min = EXCLUDED.rate_limit_per_min,
        encryption_method = EXCLUDED.encryption_method,
        metrics = EXCLUDED.metrics,
        data_flow_active = EXCLUDED.data_flow_active,
        is_simulated = EXCLUDED.is_simulated,
        save_simulated_data_to_db = EXCLUDED.save_simulated_data_to_db,
        simulated_metrics = EXCLUDED.simulated_metrics,
        role_key = EXCLUDED.role_key,
        hardware_model = EXCLUDED.hardware_model,
        firmware_version = EXCLUDED.firmware_version,
        ota_status = EXCLUDED.ota_status,
        ota_target_firmware_id = EXCLUDED.ota_target_firmware_id,
        ota_progress = EXCLUDED.ota_progress,
        ota_error_message = EXCLUDED.ota_error_message,
        ota_last_check_at = EXCLUDED.ota_last_check_at,
        expected_interval_seconds = EXCLUDED.expected_interval_seconds,
        auto_detected_interval_seconds = EXCLUDED.auto_detected_interval_seconds,
        heartbeat_timeout_seconds = EXCLUDED.heartbeat_timeout_seconds,
        interval_mode = EXCLUDED.interval_mode,
        custom_interval_seconds = EXCLUDED.custom_interval_seconds,
        recent_intervals = EXCLUDED.recent_intervals,
        websocket_connected = EXCLUDED.websocket_connected,
        last_message_at = COALESCE(EXCLUDED.last_message_at, devices.last_message_at),
        output_definitions = EXCLUDED.output_definitions,
        capabilities = EXCLUDED.capabilities,
        supported_outputs = EXCLUDED.supported_outputs,
        supported_commands = EXCLUDED.supported_commands;
    `;
    const params = [
      dev.id,
      canonicalTenantId,
      canonicalTenantId,
      dev.previousTenantId || null,
      dev.previousTenantName || null,
      dev.ownershipTransferredAt || null,
      dev.name,
      dev.deviceType || dev.type || 'sensor',
      dev.apiKey || null,
      dev.apiKeyPrefix || null,
      dev.apiKeyHash || null,
      dev.status || 'online',
      dev.location || null,
      dev.ipAddress || null,
      dev.macAddress || null,
      dev.lastSeen || new Date().toISOString(),
      dev.rateLimitPerMin || 120,
      dev.encryptionMethod || 'AES-256-GCM',
      JSON.stringify(dev.metrics || {}),
      dev.dataFlowActive !== false,
      Boolean(dev.isSimulated),
      Boolean(dev.saveSimulatedDataToDb),
      JSON.stringify(dev.simulatedMetrics || []),
      dev.roleKey || null,
      dev.hardwareModel || null,
      dev.firmwareVersion || null,
      dev.otaStatus || 'IDLE',
      dev.otaTargetFirmwareId || null,
      dev.otaProgress || 0,
      dev.otaErrorMessage || null,
      dev.otaLastCheckAt || null,
      dev.expectedIntervalSeconds || 30,
      dev.autoDetectedIntervalSeconds || 30,
      dev.heartbeatTimeoutSeconds || 60,
      dev.intervalMode || 'auto',
      dev.customIntervalSeconds || null,
      JSON.stringify(dev.recentIntervals || []),
      Boolean(dev.websocketConnected),
      dev.lastMessageAt || null,
      JSON.stringify(dev.outputDefinitions || []),
      JSON.stringify(dev.capabilities || []),
      JSON.stringify(dev.supportedOutputs || []),
      JSON.stringify(dev.supportedCommands || []),
      new Date().toISOString(),
    ];

    try {
      await this.query(sql, params);
    } catch (saveErr: any) {
      const errMsg = saveErr?.message || String(saveErr);
      if (errMsg.includes('fk_devices_tenant_id') || errMsg.includes('devices_user_id_fkey') || (errMsg.includes('foreign key') && errMsg.includes('devices'))) {
        try {
          // Fallback: Belirtilen tenant_id veritabanında yoksa, 'usr_admin' garantisi altında 'usr_admin'e yönlendir ve kaydet
          if (this.pool) {
            await this.pool.query(`
              INSERT INTO users (id, name, email, password_hash, role, company_name, status, created_at)
              VALUES ('usr_admin', 'Sistem Yöneticisi', 'admin@nexusnode.io', '$2a$10$B50m1l26vD8LhJqZ8XyqA.v2a00qQGq7cR/8v4M7sF2D3Q4s7rD9K', 'admin', 'Merkez Yönetim', 'active', CURRENT_TIMESTAMP)
              ON CONFLICT (id) DO NOTHING;
            `);
          }
          const fallbackParams = [...params];
          fallbackParams[1] = 'usr_admin';
          fallbackParams[2] = 'usr_admin';
          await this.query(sql, fallbackParams);
          return;
        } catch (retryErr: any) {
          console.warn('[PostgreSQL saveDevice fallback error]:', retryErr?.message || retryErr);
        }
      }
      throw saveErr;
    }
  }

  public async deleteDevice(deviceId: string): Promise<void> {
    if (!this.pool) return;
    await this.query(`DELETE FROM devices WHERE id = $1;`, [deviceId]);
  }

  public mapDeviceRow(r: any): Device {
    return {
      id: r.id,
      tenantId: r.tenant_id || r.user_id || 'usr_admin',
      userId: r.tenant_id || r.user_id || 'usr_admin',
      previousTenantId: r.previous_tenant_id || undefined,
      previousTenantName: r.previous_tenant_name || undefined,
      ownershipTransferredAt: r.ownership_transferred_at ? new Date(r.ownership_transferred_at).toISOString() : undefined,
      name: r.name,
      type: r.device_type,
      deviceType: r.device_type,
      roleKey: r.role_key || undefined,
      hardwareModel: r.hardware_model || undefined,
      firmwareVersion: r.firmware_version || undefined,
      apiKey: r.api_key || '',
      apiKeyPrefix: r.api_key_prefix || (r.api_key ? r.api_key.substring(0, 12) : undefined),
      apiKeyHash: r.api_key_hash,
      status: r.status || 'online',
      location: r.location || '',
      ipAddress: r.ip_address || '',
      macAddress: r.mac_address || '',
      lastSeen: r.last_seen ? new Date(r.last_seen).toISOString() : new Date().toISOString(),
      rateLimitPerMin: r.rate_limit_per_min || 120,
      encryptionMethod: r.encryption_method || 'AES-256-GCM',
      metrics: typeof r.metrics === 'string' ? JSON.parse(r.metrics) : r.metrics || {},
      dataFlowActive: r.data_flow_active !== false,
      isSimulated: r.is_simulated !== undefined && r.is_simulated !== null ? Boolean(r.is_simulated) : (r.name?.includes('[Sanal]') || r.id?.startsWith('dev_0') || r.id?.startsWith('sim_')),
      saveSimulatedDataToDb: Boolean(r.save_simulated_data_to_db),
      simulatedMetrics: Array.isArray(r.simulated_metrics) ? r.simulated_metrics : (typeof r.simulated_metrics === 'string' ? JSON.parse(r.simulated_metrics) : undefined),
      otaStatus: r.ota_status || 'IDLE',
      otaTargetFirmwareId: r.ota_target_firmware_id || undefined,
      otaProgress: r.ota_progress || 0,
      otaErrorMessage: r.ota_error_message || undefined,
      otaLastCheckAt: r.ota_last_check_at ? new Date(r.ota_last_check_at).toISOString() : undefined,
      expectedIntervalSeconds: r.expected_interval_seconds ? Number(r.expected_interval_seconds) : 30,
      autoDetectedIntervalSeconds: r.auto_detected_interval_seconds ? Number(r.auto_detected_interval_seconds) : 30,
      heartbeatTimeoutSeconds: r.heartbeat_timeout_seconds ? Number(r.heartbeat_timeout_seconds) : 60,
      intervalMode: r.interval_mode || 'auto',
      customIntervalSeconds: r.custom_interval_seconds ? Number(r.custom_interval_seconds) : undefined,
      recentIntervals: Array.isArray(r.recent_intervals) ? r.recent_intervals : (typeof r.recent_intervals === 'string' ? JSON.parse(r.recent_intervals) : []),
      websocketConnected: Boolean(r.websocket_connected),
      lastMessageAt: r.last_message_at ? new Date(r.last_message_at).toISOString() : undefined,
      outputDefinitions: Array.isArray(r.output_definitions) ? r.output_definitions : (typeof r.output_definitions === 'string' ? JSON.parse(r.output_definitions) : undefined),
      capabilities: Array.isArray(r.capabilities) ? r.capabilities : (typeof r.capabilities === 'string' ? JSON.parse(r.capabilities) : undefined),
      supportedOutputs: Array.isArray(r.supported_outputs) ? r.supported_outputs : (typeof r.supported_outputs === 'string' ? JSON.parse(r.supported_outputs) : undefined),
      supportedCommands: Array.isArray(r.supported_commands) ? r.supported_commands : (typeof r.supported_commands === 'string' ? JSON.parse(r.supported_commands) : undefined),
    };
  }

  public async getDeviceById(id: string): Promise<Device | null> {
    if (!this.pool || !id) return null;
    try {
      const res = await this.query(`SELECT * FROM devices WHERE id = $1 LIMIT 1;`, [id]);
      if (res.rows && res.rows.length > 0) {
        return this.mapDeviceRow(res.rows[0]);
      }
      return null;
    } catch (err: any) {
      console.error(`[PostgreSQL] getDeviceById error for ${id}:`, err.message || err);
      return null;
    }
  }

  public async getDeviceByApiKey(apiKey: string): Promise<Device | null> {
    if (!this.pool || !apiKey) return null;
    try {
      const res = await this.query(`SELECT * FROM devices WHERE api_key = $1 OR api_key_hash = $1 LIMIT 1;`, [apiKey]);
      if (res.rows && res.rows.length > 0) {
        return this.mapDeviceRow(res.rows[0]);
      }
      return null;
    } catch (err: any) {
      console.error(`[PostgreSQL] getDeviceByApiKey error:`, err.message || err);
      return null;
    }
  }

  public async updateDeviceWsStatus(
    deviceId: string,
    isConnected: boolean,
    status?: string,
    lastSeenIso?: string,
    lastMessageAtIso?: string
  ): Promise<void> {
    if (!this.pool || !deviceId) return;
    const now = new Date().toISOString();
    const seen = lastSeenIso || now;
    const msgAt = lastMessageAtIso || (isConnected ? now : null);
    try {
      await this.query(
        `UPDATE devices
         SET websocket_connected = $2,
             status = COALESCE($3, status),
             last_seen = COALESCE($4::timestamptz, last_seen),
             last_message_at = COALESCE($5::timestamptz, last_message_at)
         WHERE id = $1;`,
        [deviceId, isConnected, status || (isConnected ? 'online' : 'offline'), seen, msgAt]
      );
    } catch (err: any) {
      console.error(`[PostgreSQL] updateDeviceWsStatus error for ${deviceId}:`, err.message || err);
    }
  }

  public async updateDeviceOutputsAndMetrics(
    deviceId: string,
    metrics: Record<string, any>,
    outputDefinitions?: any[],
    lastSeenIso?: string
  ): Promise<void> {
    if (!this.pool || !deviceId) return;
    const seen = lastSeenIso || new Date().toISOString();
    try {
      await this.query(
        `UPDATE devices
         SET metrics = $2::jsonb,
             output_definitions = COALESCE($3::jsonb, output_definitions),
             last_seen = COALESCE($4::timestamptz, last_seen)
         WHERE id = $1;`,
        [deviceId, JSON.stringify(metrics || {}), outputDefinitions ? JSON.stringify(outputDefinitions) : null, seen]
      );
    } catch (err: any) {
      console.error(`[PostgreSQL] updateDeviceOutputsAndMetrics error for ${deviceId}:`, err.message || err);
    }
  }

  public async updateDeviceHelloInfo(
    deviceId: string,
    info: {
      firmwareVersion?: string;
      hardwareModel?: string;
      ipAddress?: string;
      macAddress?: string;
      status?: string;
      websocketConnected?: boolean;
      lastSeen?: string;
    }
  ): Promise<void> {
    if (!this.pool || !deviceId) return;
    const seen = info.lastSeen || new Date().toISOString();
    try {
      await this.query(
        `UPDATE devices
         SET firmware_version = COALESCE($2, firmware_version),
             hardware_model = COALESCE($3, hardware_model),
             ip_address = COALESCE($4, ip_address),
             mac_address = COALESCE($5, mac_address),
             status = COALESCE($6, status),
             websocket_connected = COALESCE($7, websocket_connected),
             last_seen = COALESCE($8::timestamptz, last_seen)
         WHERE id = $1;`,
        [
          deviceId,
          info.firmwareVersion || null,
          info.hardwareModel || null,
          info.ipAddress || null,
          info.macAddress || null,
          info.status || 'online',
          info.websocketConnected !== undefined ? info.websocketConnected : true,
          seen,
        ]
      );
    } catch (err: any) {
      console.error(`[PostgreSQL] updateDeviceHelloInfo error for ${deviceId}:`, err.message || err);
    }
  }

  // ==========================================
  // TELEMETRY READINGS (Physical & Simulation Hypertable Isolation)
  // ==========================================
  public async saveTelemetry(reading: TelemetryReading): Promise<{ success: boolean; rowCount: number }> {
    if (!this.pool || !this.isConnected) {
      throw new Error('PostgreSQL veritabanı bağlantısı aktif değil');
    }
    const isSimulation = reading.source === 'simulator' || reading.environment === 'sandbox';
    const targetTable = isSimulation ? 'simulation_telemetry_readings' : 'telemetry_readings';
    const tenantId = reading.tenantId || reading.customerId || reading.tenantId || 'usr_admin';
    const customerId = reading.customerId || reading.tenantId || reading.tenantId || 'usr_admin';
    const userId = reading.tenantId || customerId || tenantId || 'usr_admin';
    const bootId = reading.bootId || 'default';
    const idempotencyKey = reading.idempotencyKey || (
      reading.sequence !== undefined && reading.sequence !== null && reading.deviceId
        ? `${reading.deviceId}:${bootId}:${reading.sequence}`
        : null
    );

    const sql = `
      INSERT INTO ${targetTable} (
        id, packet_id, tenant_id, customer_id, user_id, device_id, device_name, metric, metric_value, unit, status_level, sequence, boot_id, idempotency_key, source, environment, simulation_run_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT DO NOTHING;
    `;
    const res = await this.query(sql, [
      reading.id,
      reading.packetId || null,
      tenantId,
      customerId,
      userId,
      reading.deviceId,
      reading.deviceName || reading.deviceId,
      reading.metric,
      Number(reading.value),
      reading.unit || '',
      reading.status || 'normal',
      reading.sequence ?? null,
      bootId,
      idempotencyKey,
      reading.source || (isSimulation ? 'simulator' : 'physical'),
      reading.environment || (isSimulation ? 'sandbox' : 'production'),
      reading.simulationRunId || null,
      reading.timestamp || new Date().toISOString(),
    ]);
    const rowCount = typeof res?.rowCount === 'number' ? res.rowCount : 1;
    return {
      success: true,
      rowCount,
    };
  }

  public async saveTelemetryBatch(readings: TelemetryReading[]): Promise<number> {
    const res = await this.saveTelemetryBatchInTransaction(readings);
    return res.rowCount;
  }

  public async savePhysicalTelemetryBatchInTransaction(readings: TelemetryReading[]): Promise<{ success: boolean; rowCount: number; duplicateSkipped?: boolean }> {
    const enforced = readings.map((r) => ({
      ...r,
      source: 'physical' as const,
      environment: 'production' as const,
    }));
    return this.saveTelemetryBatchInTransaction(enforced);
  }

  public async saveSimulationTelemetryBatchInTransaction(readings: TelemetryReading[]): Promise<{ success: boolean; rowCount: number; duplicateSkipped?: boolean }> {
    const enforced = readings.map((r) => ({
      ...r,
      source: 'simulator' as const,
      environment: 'sandbox' as const,
    }));
    return this.saveTelemetryBatchInTransaction(enforced);
  }

  public async saveTelemetryBatchInTransaction(readings: TelemetryReading[]): Promise<{ success: boolean; rowCount: number; duplicateSkipped?: boolean }> {
    if (!this.pool || !this.isConnected) {
      throw new Error('PostgreSQL veritabanı bağlantısı aktif değil');
    }
    if (!readings || readings.length === 0) return { success: true, rowCount: 0 };

    const first = readings[0];
    const isSimulation = first?.source === 'simulator' || first?.environment === 'sandbox';
    const targetTable = isSimulation ? 'simulation_telemetry_readings' : 'telemetry_readings';

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const deviceId = first.deviceId;
      const sequence = first.sequence;
      const bootId = first.bootId || 'default';
      const idempotencyKey = first.idempotencyKey || (
        deviceId && sequence !== undefined && sequence !== null
          ? `${deviceId}:${bootId}:${sequence}`
          : null
      );
      let packetId: string | null = first.packetId || null;

      // Packet-Level Idempotency Deduplication for Physical Telemetry Packets (deviceId + bootId + sequence)
      if (!isSimulation && deviceId && sequence !== undefined && sequence !== null) {
        packetId = packetId || `pkt_${deviceId}_boot_${bootId}_seq_${sequence}`;
        const packetSql = `
          INSERT INTO telemetry_packets (id, device_id, boot_id, sequence, idempotency_key, metric_count, received_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (device_id, boot_id, sequence) DO NOTHING
          RETURNING id;
        `;
        const pktRes = await client.query(packetSql, [
          packetId,
          deviceId,
          bootId,
          sequence,
          idempotencyKey,
          readings.length,
          first.timestamp || new Date().toISOString(),
        ]);

        if (!pktRes.rows || pktRes.rows.length === 0) {
          // Conflict occurred: Packet with (deviceId, bootId, sequence) was already processed!
          await client.query('COMMIT');
          console.log(`[Telemetry Packet Deduplication] Paket Atlandı: Cihaz=${deviceId}, BootId=${bootId}, Sequence=${sequence} daha önce işlenmiş.`);
          return { success: true, rowCount: 0, duplicateSkipped: true };
        }
      }

      const chunkSize = 100;
      let totalInserted = 0;

      for (let i = 0; i < readings.length; i += chunkSize) {
        const chunk = readings.slice(i, i + chunkSize);
        const valueTuples: string[] = [];
        const params: any[] = [];
        let paramIdx = 1;

        for (const r of chunk) {
          const tenantId = r.tenantId || r.customerId || r.tenantId || 'usr_admin';
          const customerId = r.customerId || r.tenantId || r.tenantId || 'usr_admin';
          const userId = r.tenantId || customerId || tenantId || 'usr_admin';
          const rBootId = r.bootId || bootId;
          const rIdempotencyKey = r.idempotencyKey || (
            r.deviceId && r.sequence !== undefined && r.sequence !== null
              ? `${r.deviceId}:${rBootId}:${r.sequence}`
              : null
          );

          valueTuples.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, $${paramIdx + 9}, $${paramIdx + 10}, $${paramIdx + 11}, $${paramIdx + 12}, $${paramIdx + 13}, $${paramIdx + 14}, $${paramIdx + 15}, $${paramIdx + 16}, $${paramIdx + 17})`);
          params.push(
            r.id,
            packetId,
            tenantId,
            customerId,
            userId,
            r.deviceId,
            r.deviceName || r.deviceId,
            r.metric,
            Number(r.value),
            r.unit || '',
            r.status || 'normal',
            r.sequence ?? null,
            rBootId,
            rIdempotencyKey,
            r.source || (isSimulation ? 'simulator' : 'physical'),
            r.environment || (isSimulation ? 'sandbox' : 'production'),
            r.simulationRunId || null,
            r.timestamp || new Date().toISOString()
          );
          paramIdx += 18;
        }

        const sql = `
          INSERT INTO ${targetTable} (
            id, packet_id, tenant_id, customer_id, user_id, device_id, device_name, metric, metric_value, unit, status_level, sequence, boot_id, idempotency_key, source, environment, simulation_run_id, created_at
          ) VALUES ${valueTuples.join(', ')}
          ON CONFLICT DO NOTHING;
        `;

        const res = await client.query(sql, params);
        totalInserted += res?.rowCount ?? chunk.length;
      }

      await client.query('COMMIT');
      return { success: true, rowCount: totalInserted };
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      console.warn(`[PostgreSQL Transaction Rollback] Batch telemetry insertion failed (${targetTable}): ${err?.message || err}`);
      throw err;
    } finally {
      client.release();
    }
  }

  // ==========================================
  // THRESHOLD RULES
  // ==========================================
  public async saveRule(rule: ThresholdRule): Promise<void> {
    if (!this.pool) return;
    await this.ensureTelemetrySchema();
    const sql = `
      INSERT INTO threshold_rules (
        id, user_id, user_name, device_id, metric_key, operator, threshold_value,
        severity, enabled, message_template, hysteresis, min_breach_duration_sec,
        repeat_interval_sec, notification_channels, active_hours, recipients, silenced_until,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        user_name = EXCLUDED.user_name,
        device_id = EXCLUDED.device_id,
        metric_key = EXCLUDED.metric_key,
        operator = EXCLUDED.operator,
        threshold_value = EXCLUDED.threshold_value,
        severity = EXCLUDED.severity,
        enabled = EXCLUDED.enabled,
        message_template = EXCLUDED.message_template,
        hysteresis = EXCLUDED.hysteresis,
        min_breach_duration_sec = EXCLUDED.min_breach_duration_sec,
        repeat_interval_sec = EXCLUDED.repeat_interval_sec,
        notification_channels = EXCLUDED.notification_channels,
        active_hours = EXCLUDED.active_hours,
        recipients = EXCLUDED.recipients,
        silenced_until = EXCLUDED.silenced_until,
        updated_at = CURRENT_TIMESTAMP;
    `;
    const params = [
      rule.id,
      rule.tenantId || null,
      rule.userName || null,
      rule.deviceId || 'all',
      rule.metricKey,
      rule.operator,
      Number(rule.thresholdValue),
      rule.severity || 'warning',
      rule.enabled !== false,
      rule.messageTemplate || '',
      rule.hysteresis || 1.0,
      rule.minBreachDurationSeconds || 10,
      rule.repeatIntervalSeconds || 300,
      JSON.stringify(rule.notificationChannels || ['app']),
      rule.activeHours || '00:00-23:59',
      JSON.stringify(rule.recipients || []),
      rule.disabledUntil || null,
      new Date().toISOString(),
      rule.updatedAt || new Date().toISOString(),
    ];

    try {
      await this.query(sql, params);
    } catch (err: any) {
      if (err?.message?.includes('column') || err?.message?.includes('does not exist')) {
        await this.ensureTelemetrySchema(true);
        await this.query(sql, params);
      } else {
        throw err;
      }
    }
  }

  public async deleteRule(ruleId: string): Promise<void> {
    if (!this.pool) return;
    await this.query(`DELETE FROM threshold_rules WHERE id = $1;`, [ruleId]);
  }

  // ==========================================
  // ACTIVE ALARMS
  // ==========================================
  public async saveAlarm(alarm: ActiveAlarm): Promise<void> {
    if (!this.pool) return;
    const sql = `
      INSERT INTO active_alarms (
        id, incident_id, last_evaluated_at, rule_id, device_id, device_name, user_id, metric_key, operator,
        threshold_value, current_value, severity, state, first_breach_at,
        triggered_at, last_notified_at, resolved_at, acknowledged,
        acknowledged_at, acknowledged_by, silenced_until, repeat_count, message, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
      ON CONFLICT (id) DO UPDATE SET
        incident_id = EXCLUDED.incident_id,
        last_evaluated_at = EXCLUDED.last_evaluated_at,
        state = EXCLUDED.state,
        current_value = EXCLUDED.current_value,
        last_notified_at = EXCLUDED.last_notified_at,
        resolved_at = EXCLUDED.resolved_at,
        acknowledged = EXCLUDED.acknowledged,
        acknowledged_at = EXCLUDED.acknowledged_at,
        acknowledged_by = EXCLUDED.acknowledged_by,
        silenced_until = EXCLUDED.silenced_until,
        repeat_count = EXCLUDED.repeat_count,
        message = EXCLUDED.message,
        updated_at = CURRENT_TIMESTAMP;
    `;
    await this.query(sql, [
      alarm.id,
      alarm.incidentId || null,
      alarm.lastEvaluatedAt || null,
      alarm.ruleId,
      alarm.deviceId,
      alarm.deviceName,
      alarm.tenantId,
      alarm.metricKey,
      alarm.operator,
      alarm.thresholdValue,
      alarm.currentValue,
      alarm.severity,
      alarm.state,
      alarm.firstBreachAt || null,
      alarm.triggeredAt || null,
      alarm.lastNotifiedAt || null,
      alarm.resolvedAt || null,
      Boolean(alarm.acknowledged),
      alarm.acknowledgedAt || null,
      alarm.acknowledgedBy || null,
      alarm.silencedUntil || null,
      alarm.repeatCount || 0,
      alarm.message || '',
      alarm.updatedAt || new Date().toISOString(),
    ]);
  }

  // ==========================================
  // NOTIFICATIONS
  // ==========================================
  public async saveNotification(n: NotificationItem): Promise<void> {
    if (!this.pool) return;
    const sql = `
      INSERT INTO notifications (
        id, user_id, title, message, severity, device_id, device_name,
        is_read, alarm_id, rule_id, alarm_state, acknowledged,
        acknowledged_at, acknowledged_by, repeat_count, current_value, threshold_value, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (id) DO UPDATE SET
        is_read = EXCLUDED.is_read,
        message = EXCLUDED.message,
        alarm_state = EXCLUDED.alarm_state,
        acknowledged = EXCLUDED.acknowledged,
        repeat_count = EXCLUDED.repeat_count;
    `;
    await this.query(sql, [
      n.id,
      n.tenantId,
      n.title,
      n.message,
      n.severity || 'info',
      n.deviceId || null,
      n.deviceName || null,
      Boolean(n.read),
      n.alarmId || null,
      n.ruleId || null,
      n.alarmState || null,
      Boolean(n.acknowledged),
      n.acknowledgedAt || null,
      n.acknowledgedBy || null,
      n.repeatCount || 0,
      n.currentValue ?? null,
      n.thresholdValue ?? null,
      n.timestamp || new Date().toISOString(),
    ]);
  }

  public async markNotificationRead(id: string): Promise<void> {
    if (!this.pool) return;
    await this.query(`UPDATE notifications SET is_read = TRUE WHERE id = $1;`, [id]);
  }

  public async markAllNotificationsRead(userId?: string): Promise<void> {
    if (!this.pool) return;
    if (userId && userId !== 'usr_admin') {
      await this.query(`UPDATE notifications SET is_read = TRUE WHERE user_id = $1;`, [userId]);
    } else {
      await this.query(`UPDATE notifications SET is_read = TRUE;`);
    }
  }

  // ==========================================
  // DASHBOARD LAYOUTS
  // ==========================================
  public async saveDashboard(dash: DashboardLayout): Promise<void> {
    if (!this.pool) return;
    const sql = `
      INSERT INTO dashboard_layouts (
        id, user_id, title, widgets_json, updated_at
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        widgets_json = EXCLUDED.widgets_json,
        updated_at = CURRENT_TIMESTAMP;
    `;
    await this.query(sql, [
      dash.id,
      dash.tenantId,
      dash.title || 'Özel Dashboard',
      JSON.stringify(dash.widgets || []),
      dash.updatedAt || new Date().toISOString(),
    ]);
  }

  // ==========================================
  // AUDIT LOGS
  // ==========================================
  public async saveAuditLog(log: AuditLog): Promise<void> {
    if (!this.pool) return;
    const sql = `
      INSERT INTO audit_logs (id, user_id, user_name, action, ip_address, severity, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING;
    `;
    await this.query(sql, [
      log.id,
      log.tenantId || null,
      log.userName || null,
      log.action,
      log.ip || null,
      log.severity || 'low',
      log.timestamp || new Date().toISOString(),
    ]);
  }

  // ==========================================
  // DEVICE COMMANDS (Full PostgreSQL Command Engine)
  // ==========================================
  private mapDeviceCommandRow(r: any): DeviceCommand {
    const cmdId = r.command_id || r.id;
    const createdAtIso = r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString();
    const sentAtIso = r.sent_at ? new Date(r.sent_at).toISOString() : (r.status === 'sent' || r.status === 'claimed' ? (r.executed_at ? new Date(r.executed_at).toISOString() : undefined) : undefined);
    const ackAtIso = r.acknowledged_at ? new Date(r.acknowledged_at).toISOString() : ((r.status === 'acknowledged' || r.status === 'executed') ? (r.executed_at ? new Date(r.executed_at).toISOString() : undefined) : undefined);
    const execAtIso = r.executed_at ? new Date(r.executed_at).toISOString() : undefined;
    const val = r.value_payload !== null && r.value_payload !== undefined ? r.value_payload : (r.parameters?.value ?? r.parameters?.payload ?? '');

    return {
      id: r.id,
      commandId: cmdId,
      tenantId: r.tenant_id || undefined,
      customerId: r.customer_id || r.tenant_id || undefined,
      deviceId: r.device_id,
      deviceName: r.device_name || undefined,
      userId: r.user_id || r.sent_by || undefined,
      commandType: r.command_type || r.command_name || 'GENERAL_COMMAND',
      command: r.command_name || r.command_type || 'GENERAL_COMMAND',
      outputId: r.output_id || r.parameters?.outputId || undefined,
      value: val,
      payload: r.parameters?.payload ?? val,
      source: r.source || r.sent_by || 'manual',
      status: r.status || 'pending',
      createdAt: createdAtIso,
      created_at: createdAtIso,
      sentAt: sentAtIso,
      sent_at: sentAtIso,
      claimed_at: (r.status === 'claimed' || r.status === 'sent') ? execAtIso : undefined,
      delivered_at: execAtIso,
      acknowledgedAt: ackAtIso,
      acknowledged_at: ackAtIso,
      appliedAt: r.applied_at ? new Date(r.applied_at).toISOString() : undefined,
      applied_at: r.applied_at ? new Date(r.applied_at).toISOString() : undefined,
      executedAt: execAtIso,
      executed_at: execAtIso,
      errorMessage: r.error_message || r.parameters?.errorMessage || undefined,
      error_message: r.error_message || r.parameters?.errorMessage || undefined,
      idempotencyKey: r.idempotency_key || undefined,
      idempotency_key: r.idempotency_key || undefined,
      timeoutSeconds: r.timeout_seconds !== null && r.timeout_seconds !== undefined ? Number(r.timeout_seconds) : 300,
      retryCount: r.retry_count !== null && r.retry_count !== undefined ? Number(r.retry_count) : 0,
      maxRetries: r.max_retries !== null && r.max_retries !== undefined ? Number(r.max_retries) : 3,
      parameters: r.parameters,
      result: r.parameters?.result,
    };
  }

  public async saveCommand(cmd: Partial<DeviceCommand> & { deviceId: string }): Promise<DeviceCommand> {
    if (!this.pool) {
      throw new Error('PostgreSQL pool not initialized');
    }

    const idempotencyKey = cmd.idempotencyKey || cmd.idempotency_key;
    if (idempotencyKey) {
      try {
        const existing = await this.query(
          `SELECT * FROM device_commands 
           WHERE device_id = $1 AND idempotency_key = $2 AND created_at > NOW() - INTERVAL '1 hour'
           LIMIT 1;`,
          [cmd.deviceId, idempotencyKey]
        );
        if (existing?.rows && existing.rows.length > 0) {
          return this.mapDeviceCommandRow(existing.rows[0]);
        }
      } catch (idempErr) {
        console.warn('[PostgreSQL] Idempotency lookup error:', idempErr);
      }
    }

    const id = cmd.id || cmd.commandId || `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const commandId = cmd.commandId || id;
    const tenantId = cmd.tenantId || cmd.customerId || null;
    const customerId = cmd.customerId || cmd.tenantId || null;
    const userId = cmd.userId || null;
    const commandType = cmd.commandType || cmd.command || 'GENERAL_COMMAND';
    const commandName = cmd.command || cmd.commandType || 'GENERAL_COMMAND';
    const outputId = cmd.outputId || (cmd.parameters?.outputId ? String(cmd.parameters.outputId) : null);
    const valPayload = cmd.value !== undefined ? String(cmd.value) : (cmd.payload !== undefined ? String(cmd.payload) : null);
    const source = cmd.source || 'manual';
    const status = cmd.status || 'queued';
    const timeoutSeconds = cmd.timeoutSeconds || 300;
    const retryCount = cmd.retryCount || 0;
    const maxRetries = cmd.maxRetries || 3;
    const createdAt = cmd.createdAt || cmd.created_at || new Date().toISOString();
    const sentAt = cmd.sentAt || cmd.sent_at || (status === 'sent' || status === 'claimed' ? new Date().toISOString() : null);
    const acknowledgedAt = cmd.acknowledgedAt || cmd.acknowledged_at || (status === 'acknowledged' ? new Date().toISOString() : null);
    const appliedAt = cmd.appliedAt || cmd.applied_at || (status === 'applied' || status === 'executed' ? new Date().toISOString() : null);
    const executedAt = cmd.executedAt || cmd.executed_at || (status === 'executed' || status === 'applied' ? new Date().toISOString() : null);
    const errorMessage = cmd.errorMessage || cmd.error_message || null;

    // 1. Output Superseding Protection: If a new command targets an outputId, cancel older pending/sent commands for that same output
    if (outputId && (status === 'pending' || status === 'queued')) {
      try {
        await this.query(
          `UPDATE device_commands 
           SET status = 'cancelled', executed_at = CURRENT_TIMESTAMP, error_message = 'Yeni çıkış komutu ile geçersiz kılındı (Superseded)'
           WHERE device_id = $1 AND output_id = $2 AND status IN ('queued', 'pending', 'sent', 'claimed');`,
          [cmd.deviceId, outputId]
        );
      } catch (err: any) {
        console.warn('[PostgreSQL] Output command superseding warning:', err?.message || err);
      }
    }

    // 2. Queue Limit Protection: Cap pending commands per device to max 30
    try {
      await this.query(
        `UPDATE device_commands 
         SET status = 'cancelled', executed_at = CURRENT_TIMESTAMP, error_message = 'Kuyruk sınırını aştığı için iptal edildi (Maks. 30 komut)'
         WHERE id IN (
           SELECT id FROM device_commands
           WHERE device_id = $1 AND status IN ('queued', 'pending', 'sent')
           ORDER BY created_at ASC
           OFFSET 29
         );`,
        [cmd.deviceId]
      );
    } catch {
      // Ignore queue limit cleanup errors
    }

    const paramsObj = {
      payload: cmd.payload !== undefined ? cmd.payload : valPayload,
      value: cmd.value !== undefined ? cmd.value : valPayload,
      outputId: outputId,
      result: cmd.result,
      errorMessage: errorMessage,
      ...(typeof cmd.parameters === 'object' && cmd.parameters !== null ? cmd.parameters : {}),
    };

    const sql = `
      INSERT INTO device_commands (
        id, command_id, tenant_id, customer_id, device_id, user_id,
        command_type, command_name, output_id, value_payload, parameters,
        source, status, sent_by, created_at, sent_at, acknowledged_at, applied_at, executed_at, error_message,
        idempotency_key, timeout_seconds, retry_count, max_retries
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
      ON CONFLICT (id) DO UPDATE SET
        tenant_id = COALESCE(EXCLUDED.tenant_id, device_commands.tenant_id),
        customer_id = COALESCE(EXCLUDED.customer_id, device_commands.customer_id),
        user_id = COALESCE(EXCLUDED.user_id, device_commands.user_id),
        command_type = EXCLUDED.command_type,
        command_name = EXCLUDED.command_name,
        output_id = COALESCE(EXCLUDED.output_id, device_commands.output_id),
        value_payload = COALESCE(EXCLUDED.value_payload, device_commands.value_payload),
        parameters = EXCLUDED.parameters,
        source = EXCLUDED.source,
        status = EXCLUDED.status,
        sent_at = COALESCE(EXCLUDED.sent_at, device_commands.sent_at),
        acknowledged_at = COALESCE(EXCLUDED.acknowledged_at, device_commands.acknowledged_at),
        applied_at = COALESCE(EXCLUDED.applied_at, device_commands.applied_at),
        executed_at = COALESCE(EXCLUDED.executed_at, device_commands.executed_at),
        error_message = COALESCE(EXCLUDED.error_message, device_commands.error_message),
        retry_count = EXCLUDED.retry_count
      RETURNING *;
    `;

    const res = await this.query(sql, [
      id, commandId, tenantId, customerId, cmd.deviceId, userId,
      commandType, commandName, outputId, valPayload, JSON.stringify(paramsObj),
      source, status, userId || source, createdAt, sentAt, acknowledgedAt, appliedAt, executedAt, errorMessage,
      idempotencyKey || null, timeoutSeconds, retryCount, maxRetries
    ]);

    return this.mapDeviceCommandRow(res.rows[0]);
  }

  public async getCommands(deviceId: string, tenantId?: string, limit: number = 100): Promise<DeviceCommand[]> {
    if (!this.pool) return [];
    let sql = `SELECT * FROM device_commands WHERE device_id = $1`;
    const params: any[] = [deviceId];

    if (tenantId && tenantId !== 'all') {
      sql += ` AND (tenant_id = $2 OR customer_id = $2)`;
      params.push(tenantId);
      sql += ` ORDER BY created_at DESC LIMIT $3`;
      params.push(limit);
    } else {
      sql += ` ORDER BY created_at DESC LIMIT $2`;
      params.push(limit);
    }

    const res = await this.query(sql, params);
    return res.rows.map(r => this.mapDeviceCommandRow(r));
  }

  public async getPendingCommands(deviceId: string): Promise<DeviceCommand[]> {
    if (!this.pool) return [];
    const res = await this.query(
      `SELECT * FROM device_commands WHERE device_id = $1 AND status IN ('pending', 'sent') ORDER BY created_at ASC LIMIT 20`,
      [deviceId]
    );
    return res.rows.map(r => this.mapDeviceCommandRow(r));
  }

  /**
   * Atomically claims pending commands in PostgreSQL to prevent duplicate execution across polling threads.
   * Transitions status from 'pending' -> 'sent' (and 'claimed').
   * Reclaims any previously 'sent'/'claimed' command whose lease expired (>60s) without an ACK.
   */
  public async claimPendingCommands(deviceId: string, limit: number = 20, leaseSeconds: number = 60): Promise<DeviceCommand[]> {
    if (!this.pool || !deviceId) return [];
    const sql = `
      UPDATE device_commands
      SET status = 'sent',
          sent_at = CURRENT_TIMESTAMP,
          executed_at = CURRENT_TIMESTAMP,
          retry_count = COALESCE(retry_count, 0) + 1
      WHERE id IN (
        SELECT id FROM device_commands
        WHERE device_id = $1 
          AND (
            status IN ('queued', 'pending') 
            OR ((status = 'sent' OR status = 'claimed') AND executed_at < CURRENT_TIMESTAMP - ($3 || ' seconds')::INTERVAL)
          )
          AND status NOT IN ('acknowledged', 'applied', 'executed', 'failed', 'timeout', 'expired', 'cancelled')
          AND (retry_count IS NULL OR retry_count < COALESCE(max_retries, 3))
        ORDER BY created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *;
    `;
    try {
      const res = await this.query(sql, [deviceId, limit, leaseSeconds]);
      return res.rows.map(r => this.mapDeviceCommandRow(r));
    } catch (err: any) {
      console.error('[PostgreSQL] claimPendingCommands error:', err.message || err);
      return [];
    }
  }

  /**
   * Transitions a claimed or pending command to 'acknowledged', 'applied', 'executed' or 'failed' when the device confirms execution.
   * Mandates matching both commandId AND deviceId for strict device security isolation.
   */
  public async acknowledgeCommand(
    deviceId: string,
    commandId: string,
    status: 'acknowledged' | 'applied' | 'failed' | 'executed' | 'cancelled' | 'expired' | 'timeout' = 'acknowledged',
    result?: any,
    errorMessage?: string
  ): Promise<DeviceCommand | null> {
    if (!this.pool || !commandId || !deviceId) return null;
    const sql = `
      UPDATE device_commands
      SET status = $3,
          acknowledged_at = CASE WHEN $3 IN ('acknowledged', 'applied', 'executed') THEN COALESCE(acknowledged_at, CURRENT_TIMESTAMP) ELSE acknowledged_at END,
          applied_at = CASE WHEN $3 IN ('applied', 'executed') THEN CURRENT_TIMESTAMP ELSE applied_at END,
          executed_at = CURRENT_TIMESTAMP,
          error_message = COALESCE($5, error_message),
          parameters = CASE 
            WHEN $4::text IS NOT NULL THEN jsonb_set(COALESCE(parameters, '{}'::jsonb), '{result}', $4::jsonb)
            ELSE parameters
          END
      WHERE (id = $1 OR command_id = $1) AND device_id = $2
      RETURNING *;
    `;
    try {
      const res = await this.query(sql, [
        commandId,
        deviceId,
        status,
        result !== undefined ? JSON.stringify(result) : null,
        errorMessage || null
      ]);
      if (res && res.rows && res.rows.length > 0) {
        return this.mapDeviceCommandRow(res.rows[0]);
      }
      return null;
    } catch (err: any) {
      console.error('[PostgreSQL] acknowledgeCommand error:', err.message || err);
      return null;
    }
  }

  public async updateCommandStatus(
    deviceId: string,
    commandId: string,
    status: DeviceCommandStatus,
    errorMessage?: string
  ): Promise<DeviceCommand | null> {
    if (!this.pool || !commandId || !deviceId) return null;
    const sql = `
      UPDATE device_commands
      SET status = $3,
          error_message = COALESCE($4, error_message),
          executed_at = CASE WHEN $3 IN ('applied', 'executed', 'failed', 'cancelled', 'timeout', 'expired') THEN CURRENT_TIMESTAMP ELSE executed_at END
      WHERE (id = $1 OR command_id = $1) AND device_id = $2
      RETURNING *;
    `;
    try {
      const res = await this.query(sql, [commandId, deviceId, status, errorMessage || null]);
      if (res && res.rows && res.rows.length > 0) {
        return this.mapDeviceCommandRow(res.rows[0]);
      }
      return null;
    } catch (err: any) {
      console.error('[PostgreSQL] updateCommandStatus error:', err.message || err);
      return null;
    }
  }

  public async expireStaleCommands(timeoutSeconds = 600): Promise<DeviceCommand[]> {
    if (!this.pool) return [];
    const sql = `
      UPDATE device_commands
      SET status = 'timeout',
          executed_at = CURRENT_TIMESTAMP,
          error_message = 'Komut zaman aşımına uğradı (cihaz yanıt vermedi / süresi doldu)'
      WHERE status IN ('queued', 'pending', 'sent', 'claimed')
        AND created_at < CURRENT_TIMESTAMP - (COALESCE(timeout_seconds, $1) || ' seconds')::INTERVAL
      RETURNING *;
    `;
    try {
      const res = await this.query(sql, [timeoutSeconds]);
      return (res?.rows || []).map((r: any) => this.mapDeviceCommandRow(r));
    } catch (err: any) {
      console.error('[PostgreSQL] expireStaleCommands error:', err.message || err);
      return [];
    }
  }

  public async markCommandsDelivered(commandIds: string[]): Promise<void> {
    if (!this.pool || !commandIds.length) return;
    await this.query(
      `UPDATE device_commands SET status = 'claimed', executed_at = CURRENT_TIMESTAMP WHERE id = ANY($1::text[]) AND status = 'pending';`,
      [commandIds]
    );
  }

  public async getCommandById(commandId: string, tenantId?: string): Promise<DeviceCommand | null> {
    if (!this.pool || !commandId) return null;
    let sql = `SELECT * FROM device_commands WHERE (id = $1 OR command_id = $1)`;
    const params: any[] = [commandId];

    if (tenantId && tenantId !== 'all') {
      sql += ` AND (tenant_id = $2 OR customer_id = $2)`;
      params.push(tenantId);
    }
    sql += ` LIMIT 1`;

    const res = await this.query(sql, params);
    if (!res.rows.length) return null;
    return this.mapDeviceCommandRow(res.rows[0]);
  }

  public async cancelCommand(commandId: string, tenantId?: string): Promise<DeviceCommand | null> {
    if (!this.pool || !commandId) return null;
    let sql = `
      UPDATE device_commands 
      SET status = 'cancelled', 
          executed_at = CURRENT_TIMESTAMP, 
          error_message = 'Kullanıcı tarafından iptal edildi'
      WHERE (id = $1 OR command_id = $1) AND status IN ('pending', 'sent', 'claimed')
    `;
    const params: any[] = [commandId];

    if (tenantId && tenantId !== 'all') {
      sql += ` AND (tenant_id = $2 OR customer_id = $2)`;
      params.push(tenantId);
    }
    sql += ` RETURNING *;`;

    const res = await this.query(sql, params);
    if (res && res.rows && res.rows.length > 0) {
      return this.mapDeviceCommandRow(res.rows[0]);
    }
    return null;
  }

  // ==========================================
  // USER SESSIONS
  // ==========================================
  public async deleteUserSessions(userId: string): Promise<void> {
    if (!this.pool) return;
    await this.query(`DELETE FROM user_sessions WHERE user_id = $1`, [userId]);
  }

  public async saveSession(session: UserSession): Promise<void> {
    if (!this.pool) return;
    const sql = `
      INSERT INTO user_sessions (token, user_id, user_role, user_email, user_name, created_at, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (token) DO UPDATE SET expires_at = EXCLUDED.expires_at;
    `;
    await this.query(sql, [
      session.token,
      session.userId,
      session.userRole,
      session.userEmail,
      session.userName,
      session.createdAt || new Date().toISOString(),
      session.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    ]);
  }

  public async deleteSession(token: string): Promise<void> {
    if (!this.pool) return;
    await this.query(`DELETE FROM user_sessions WHERE token = $1;`, [token]);
  }

  // ==========================================
  // DISPATCH LOGS
  // ==========================================
  public async saveDispatchLog(log: DispatchLogItem): Promise<void> {
    if (!this.pool) return;
    const sql = `
      INSERT INTO dispatch_logs (
        id, user_id, user_name, channel, recipient, title, message, severity, status, latency_ms, error_details, sent_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO NOTHING;
    `;
    await this.query(sql, [
      log.id,
      log.tenantId || null,
      log.userName || null,
      log.channel,
      log.recipient,
      log.title || null,
      log.message,
      log.severity || 'info',
      log.status || 'delivered',
      log.latencyMs || 0,
      log.errorDetails || null,
      log.sentAt || new Date().toISOString(),
    ]);
  }

  // ==========================================
  // DATA RETENTION & CLEANUP
  // ==========================================
  public async deleteOldRecords(options: {
    telemetryDays?: number;
    resolvedAlarmsDays?: number;
    readNotificationsDays?: number;
    auditLogsDays?: number;
    dispatchLogsDays?: number;
    deviceCommandsDays?: number;
  }): Promise<{
    telemetry: number;
    alarms: number;
    notifications: number;
    auditLogs: number;
    dispatchLogs: number;
    deviceCommands: number;
    total: number;
  }> {
    const counts = {
      telemetry: 0,
      alarms: 0,
      notifications: 0,
      auditLogs: 0,
      dispatchLogs: 0,
      deviceCommands: 0,
      total: 0,
    };

    if (!this.pool || !this.isConnected) return counts;

    try {
      // 1. Telemetry readings (Both physical and simulation hypertables)
      if (options.telemetryDays && options.telemetryDays > 0) {
        const resPhysical = await this.query(
          `DELETE FROM telemetry_readings WHERE created_at < NOW() - ($1 * INTERVAL '1 day');`,
          [options.telemetryDays]
        );
        const resSim = await this.query(
          `DELETE FROM simulation_telemetry_readings WHERE created_at < NOW() - ($1 * INTERVAL '1 day');`,
          [options.telemetryDays]
        );
        counts.telemetry = (resPhysical?.rowCount || 0) + (resSim?.rowCount || 0);
      }

      // 2. Resolved Alarms
      if (options.resolvedAlarmsDays && options.resolvedAlarmsDays > 0) {
        const res = await this.query(
          `DELETE FROM active_alarms WHERE state = 'RESOLVED' AND (resolved_at < NOW() - ($1 * INTERVAL '1 day') OR (resolved_at IS NULL AND updated_at < NOW() - ($1 * INTERVAL '1 day')));`,
          [options.resolvedAlarmsDays]
        );
        counts.alarms = res?.rowCount || 0;
      }

      // 3. Read Notifications
      if (options.readNotificationsDays && options.readNotificationsDays > 0) {
        const res = await this.query(
          `DELETE FROM notifications WHERE is_read = TRUE AND created_at < NOW() - ($1 * INTERVAL '1 day');`,
          [options.readNotificationsDays]
        );
        counts.notifications = res?.rowCount || 0;
      }

      // 4. Audit Logs
      if (options.auditLogsDays && options.auditLogsDays > 0) {
        const res = await this.query(
          `DELETE FROM audit_logs WHERE created_at < NOW() - ($1 * INTERVAL '1 day');`,
          [options.auditLogsDays]
        );
        counts.auditLogs = res?.rowCount || 0;
      }

      // 5. Dispatch Logs
      if (options.dispatchLogsDays && options.dispatchLogsDays > 0) {
        const res = await this.query(
          `DELETE FROM dispatch_logs WHERE sent_at < NOW() - ($1 * INTERVAL '1 day');`,
          [options.dispatchLogsDays]
        );
        counts.dispatchLogs = res?.rowCount || 0;
      }

      // 6. Device Commands (Delivered or Failed)
      if (options.deviceCommandsDays && options.deviceCommandsDays > 0) {
        const res = await this.query(
          `DELETE FROM device_commands WHERE status IN ('delivered', 'failed', 'expired') AND created_at < NOW() - ($1 * INTERVAL '1 day');`,
          [options.deviceCommandsDays]
        );
        counts.deviceCommands = res?.rowCount || 0;
      }

      counts.total =
        counts.telemetry +
        counts.alarms +
        counts.notifications +
        counts.auditLogs +
        counts.dispatchLogs +
        counts.deviceCommands;
    } catch (err: any) {
      console.warn('[PostgreSQL Retention Cleanup Error]:', err.message || err);
    }

    return counts;
  }

  public async deleteSimulatedRecords(): Promise<{
    telemetry: number;
    alarms: number;
    notifications: number;
    deviceCommands: number;
    total: number;
  }> {
    const counts = {
      telemetry: 0,
      alarms: 0,
      notifications: 0,
      deviceCommands: 0,
      total: 0,
    };

    if (!this.pool || !this.isConnected) return counts;

    try {
      // 1. Telemetry readings: Purge dedicated simulation hypertable + any legacy simulation rows
      const simTelRes = await this.query(`DELETE FROM simulation_telemetry_readings;`);
      const legacyTelRes = await this.query(`
        DELETE FROM telemetry_readings 
        WHERE source = 'simulator' 
           OR environment = 'sandbox'
           OR device_id IN (SELECT id FROM devices WHERE is_simulated = TRUE)
           OR device_id LIKE 'sim_%';
      `);
      counts.telemetry = (simTelRes?.rowCount || 0) + (legacyTelRes?.rowCount || 0);

      // 2. Active/Resolved Alarms
      const alarmRes = await this.query(`
        DELETE FROM active_alarms 
        WHERE device_id IN (SELECT id FROM devices WHERE is_simulated = TRUE)
           OR device_id LIKE 'sim_%';
      `);
      counts.alarms = alarmRes?.rowCount || 0;

      // 3. Notifications
      const notifRes = await this.query(`
        DELETE FROM notifications 
        WHERE device_id IN (SELECT id FROM devices WHERE is_simulated = TRUE)
           OR device_id LIKE 'sim_%';
      `);
      counts.notifications = notifRes?.rowCount || 0;

      // 4. Device Commands
      const cmdRes = await this.query(`
        DELETE FROM device_commands 
        WHERE device_id IN (SELECT id FROM devices WHERE is_simulated = TRUE)
           OR device_id LIKE 'sim_%';
      `);
      counts.deviceCommands = cmdRes?.rowCount || 0;

      counts.total = counts.telemetry + counts.alarms + counts.notifications + counts.deviceCommands;
    } catch (err: any) {
      console.warn('[PostgreSQL Simulated Data Cleanup Error]:', err.message || err);
    }

    return counts;
  }


  // ==========================================
  // HYDRATION: LOAD FROM POSTGRES INTO IN-MEMORY
  // ==========================================
  public async hydrateFromPostgres(): Promise<{
    users: User[];
    passwords: Record<string, string>;
    devices: Device[];
    rules: ThresholdRule[];
    alarms: ActiveAlarm[];
    dashboards: DashboardLayout[];
    sessions?: any[];
  } | null> {

    if (!this.pool) return null;
    try {
      // 1. Users (Fast path: if tables already exist, load immediately; otherwise ensure schema on demand)
      let usersRes: any;
      try {
        usersRes = await this.query(`SELECT * FROM users ORDER BY created_at ASC;`);
      } catch {
        await this.ensureTelemetrySchema();
        usersRes = await this.query(`SELECT * FROM users ORDER BY created_at ASC;`);
      }
      const users: User[] = [];
      const passwords: Record<string, string> = {};

      if (usersRes?.rows) {
        usersRes.rows.forEach((r: any) => {
          users.push({
            id: r.id,
            name: r.name,
            email: r.email,
            phone: r.phone || undefined,
            notificationEmail: r.notification_email || undefined,
            whatsappNumber: r.whatsapp_number || undefined,
            telegramChatId: r.telegram_chat_id || undefined,
            role: r.role,
            companyName: r.company_name || undefined,
            notificationPreferences: typeof r.notification_preferences === 'string' 
              ? JSON.parse(r.notification_preferences) 
              : r.notification_preferences || undefined,
            status: r.status || 'active',
            deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : undefined,
            created_at: new Date(r.created_at).toISOString(),
            updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
          });
          if (r.password_hash) {
            passwords[r.id] = r.password_hash;
          }
        });
      }

      // 2. Devices
      const devRes = await this.query(`SELECT * FROM devices ORDER BY created_at ASC;`);
      const devices: Device[] = [];
      if (devRes?.rows) {
        devRes.rows.forEach((r: any) => {
          devices.push(this.mapDeviceRow(r));
        });
      }

      // 3. Rules
      const ruleRes = await this.query(`SELECT * FROM threshold_rules ORDER BY created_at ASC;`);
      const rules: ThresholdRule[] = [];
      if (ruleRes?.rows) {
        ruleRes.rows.forEach((r: any) => {
          rules.push({
            id: r.id,
            tenantId: r.user_id || 'usr_admin',
            userName: r.user_name || 'Yönetici',
            deviceId: r.device_id || 'all',
            metricKey: r.metric_key,
            operator: r.operator,
            thresholdValue: Number(r.threshold_value),
            severity: r.severity || 'warning',
            enabled: r.enabled !== false,
            messageTemplate: r.message_template || '',
            hysteresis: Number(r.hysteresis || 1),
            minBreachDurationSeconds: r.min_breach_duration_sec || 10,
            repeatIntervalSeconds: r.repeat_interval_sec || 300,
            notificationChannels: typeof r.notification_channels === 'string' ? JSON.parse(r.notification_channels) : r.notification_channels || ['app'],
            activeHours: r.active_hours || '00:00-23:59',
            recipients: typeof r.recipients === 'string' ? JSON.parse(r.recipients) : r.recipients || [],
            disabledUntil: r.silenced_until ? new Date(r.silenced_until).toISOString() : undefined,
            updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
          });
        });
      }

      // 4. Active Alarms
      const alarmRes = await this.query(`SELECT * FROM active_alarms ORDER BY updated_at DESC LIMIT 50;`);
      const alarms: ActiveAlarm[] = [];
      if (alarmRes?.rows) {
        alarmRes.rows.forEach((r: any) => {
          alarms.push({
            id: r.id,
            incidentId: r.incident_id || undefined,
            lastEvaluatedAt: r.last_evaluated_at ? new Date(r.last_evaluated_at).toISOString() : undefined,
            ruleId: r.rule_id,
            deviceId: r.device_id,
            deviceName: r.device_name,
            tenantId: r.user_id,
            metricKey: r.metric_key,
            operator: r.operator,
            thresholdValue: Number(r.threshold_value),
            currentValue: Number(r.current_value),
            severity: r.severity,
            state: r.state,
            firstBreachAt: r.first_breach_at ? new Date(r.first_breach_at).toISOString() : undefined,
            triggeredAt: r.triggered_at ? new Date(r.triggered_at).toISOString() : undefined,
            lastNotifiedAt: r.last_notified_at ? new Date(r.last_notified_at).toISOString() : undefined,
            resolvedAt: r.resolved_at ? new Date(r.resolved_at).toISOString() : undefined,
            acknowledged: Boolean(r.acknowledged),
            acknowledgedAt: r.acknowledged_at ? new Date(r.acknowledged_at).toISOString() : undefined,
            acknowledgedBy: r.acknowledged_by || undefined,
            silencedUntil: r.silenced_until ? new Date(r.silenced_until).toISOString() : undefined,
            repeatCount: r.repeat_count || 0,
            message: r.message,
            updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
          });
        });
      }

      // 5. Dashboards
      const dashRes = await this.query(`SELECT * FROM dashboard_layouts ORDER BY updated_at DESC;`);
      const dashboards: DashboardLayout[] = [];
      if (dashRes?.rows) {
        dashRes.rows.forEach((r: any) => {
          dashboards.push({
            id: r.id,
            tenantId: r.user_id,
            title: r.title || 'Kullanıcı Dashboard',
            widgets: typeof r.widgets_json === 'string' ? JSON.parse(r.widgets_json) : r.widgets_json || [],
            updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
          });
        });
      }

                                    // 11. User Sessions
      const sessRes = await this.query(`SELECT * FROM user_sessions WHERE expires_at > NOW();`);
      const sessions: UserSession[] = [];
      if (sessRes?.rows) {
        sessRes.rows.forEach((r: any) => {
          sessions.push({
            token: r.token,
            userId: r.user_id,
            userRole: r.user_role,
            userEmail: r.user_email,
            userName: r.user_name,
            createdAt: new Date(r.created_at).toISOString(),
            expiresAt: new Date(r.expires_at).toISOString(),
          });
        });
      }

                  return {
        users,
        passwords,
        devices,
        rules,
        alarms,
        dashboards,
        sessions,
      };
    } catch (err: any) {
      console.warn('[PostgreSQL Hydration Error]:', err.message || err);
      return null;
    }
  }

  // ==========================================
  // FIRMWARE & OTA POSTGRES REPOSITORY METHODS
  // ==========================================
  public async saveFirmware(fw: Firmware): Promise<void> {
    if (!this.pool) return;
    const sql = `
      INSERT INTO firmwares (
        id, name, device_type, role_key, hardware_model, version, description,
        binary_data, binary_size, sha256, signature, file_path, min_hardware_revision,
        is_active, uploaded_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        device_type = EXCLUDED.device_type,
        role_key = EXCLUDED.role_key,
        hardware_model = EXCLUDED.hardware_model,
        version = EXCLUDED.version,
        description = EXCLUDED.description,
        binary_data = EXCLUDED.binary_data,
        binary_size = EXCLUDED.binary_size,
        sha256 = EXCLUDED.sha256,
        signature = EXCLUDED.signature,
        file_path = EXCLUDED.file_path,
        min_hardware_revision = EXCLUDED.min_hardware_revision,
        is_active = EXCLUDED.is_active,
        uploaded_by = EXCLUDED.uploaded_by,
        updated_at = EXCLUDED.updated_at;
    `;
    const now = new Date().toISOString();
    await this.query(sql, [
      fw.id,
      fw.name,
      fw.deviceType,
      fw.roleKey,
      fw.hardwareModel || 'ALL',
      fw.version,
      fw.description || null,
      fw.binaryData || null,
      fw.binarySize || 0,
      fw.sha256,
      fw.signature || null,
      fw.filePath || null,
      fw.minHardwareRevision || null,
      fw.isActive !== false,
      fw.uploadedBy,
      fw.created_at || now,
      now,

    ]);
  }

  public async deleteFirmware(id: string): Promise<void> {
    if (!this.pool) return;
    await this.query(`DELETE FROM firmwares WHERE id = $1;`, [id]);
  }

  public async saveOtaJob(job: OtaDeploymentJob): Promise<void> {
    if (!this.pool) return;
    const sql = `
      INSERT INTO ota_deployment_jobs (
        id, firmware_id, firmware_version, firmware_name, device_id, device_name,
        device_type, role_key, target_scope, status, progress_percent, error_message,
        initiated_by, download_token, expires_at, attempt_count, max_attempts,
        last_attempt_at, next_retry_at, download_started_at, boot_confirmed_at,
        created_at, updated_at, completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        progress_percent = EXCLUDED.progress_percent,
        error_message = EXCLUDED.error_message,
        download_token = EXCLUDED.download_token,
        expires_at = EXCLUDED.expires_at,
        attempt_count = EXCLUDED.attempt_count,
        max_attempts = EXCLUDED.max_attempts,
        last_attempt_at = EXCLUDED.last_attempt_at,
        next_retry_at = EXCLUDED.next_retry_at,
        download_started_at = EXCLUDED.download_started_at,
        boot_confirmed_at = EXCLUDED.boot_confirmed_at,
        updated_at = EXCLUDED.updated_at,
        completed_at = EXCLUDED.completed_at;
    `;
    const now = new Date().toISOString();
    await this.query(sql, [
      job.id,
      job.firmwareId,
      job.firmwareVersion,
      job.firmwareName,
      job.deviceId,
      job.deviceName,
      job.deviceType,
      job.roleKey,
      job.targetScope || 'single',
      job.status || 'PENDING',
      job.progressPercent || 0,
      job.errorMessage || null,
      job.initiatedBy,
      job.downloadToken || null,
      job.expiresAt || null,
      job.attemptCount || 0,
      job.maxAttempts || 3,
      job.lastAttemptAt || null,
      job.nextRetryAt || null,
      job.downloadStartedAt || null,
      job.bootConfirmedAt || null,
      job.created_at || now,
      now,
      job.completedAt || null,
    ]);
  }


  // ==========================================
  // FULL SEED / SYNC-ALL TO POSTGRES
  // ==========================================
  public async syncAllToPostgres(data: {
    users: User[];
    passwords: Record<string, string>;
    devices: Device[];
    rules: ThresholdRule[];
    dashboards: DashboardLayout[];
    notifications: NotificationItem[];
    auditLogs: AuditLog[];
    sessions?: UserSession[];
    dispatchLogs?: DispatchLogItem[];
    commands?: DeviceCommand[];
  }): Promise<{ success: boolean; counts: Record<string, number> }> {
    if (!this.pool) {
      return { success: false, counts: {} };
    }
    await this.ensureTelemetrySchema();

    const counts: Record<string, number> = {
      users: 0,
      devices: 0,
      rules: 0,
      dashboards: 0,
      notifications: 0,
      telemetry: 0,
      auditLogs: 0,
      sessions: 0,
      dispatchLogs: 0,
      commands: 0,
    };

    // 1. Users
    for (const u of data.users) {
      await this.saveUser(u, data.passwords[u.id]);
      counts.users++;
    }

    // 2. Devices
    for (const d of data.devices) {
      await this.saveDevice(d);
      counts.devices++;
    }

    // 3. Rules
    for (const r of data.rules) {
      await this.saveRule(r);
      counts.rules++;
    }

    // 4. Dashboards
    for (const dash of data.dashboards) {
      await this.saveDashboard(dash);
      counts.dashboards++;
    }

    // 5. Notifications
    for (const n of data.notifications) {
      await this.saveNotification(n);
      counts.notifications++;
    }

    // 6. Audit Logs
    for (const l of data.auditLogs) {
      await this.saveAuditLog(l);
      counts.auditLogs++;
    }

    // 7. Telemetry (Skipped: Real-time telemetry is synced continuously)
    // 8. Dispatch Logs
    if (data.dispatchLogs) {
      for (const dl of data.dispatchLogs.slice(0, 100)) {
        await this.saveDispatchLog(dl);
        counts.dispatchLogs++;
      }
    }

    // 9. Commands
    if (data.commands) {
      for (const c of data.commands) {
        await this.saveCommand(c);
        counts.commands++;
      }
    }

    // 10. Sessions
    if (data.sessions) {
      for (const s of data.sessions) {
        await this.saveSession(s);
        counts.sessions++;
      }
    }

    return { success: true, counts };
  }

  /**
   * PostgreSQL RLS (Row Level Security) uyumlu, tenant bağlamında izole sorgu çalıştırır.
   * "Fail-closed" izolasyonu sebebiyle, tenant belirtilmezse RLS politikaları hiçbir veriyi döndürmez.
   */
  
  public async getAlarms(tenantId?: string): Promise<any[]> {
    if (!this.pool) return [];
    let sql = `SELECT * FROM active_alarms`;
    const params: any[] = [];
    if (tenantId && tenantId !== 'usr_admin' && tenantId !== 'all') {
      sql += ` WHERE tenant_id = $1`;
      params.push(tenantId);
    }
    sql += ` ORDER BY updated_at DESC LIMIT 200`;
    const res = await this.query(sql, params);
    return res.rows.map(r => ({
      id: r.id,
      incidentId: r.incident_id,
      lastEvaluatedAt: r.last_evaluated_at,
      ruleId: r.rule_id,
      deviceId: r.device_id,
      deviceName: r.device_name,
      tenantId: r.tenant_id,
      metricKey: r.metric_key,
      operator: r.operator,
      thresholdValue: r.threshold_value,
      currentValue: r.current_value,
      severity: r.severity,
      state: r.state,
      firstBreachAt: r.first_breach_at,
      triggeredAt: r.triggered_at,
      lastNotifiedAt: r.last_notified_at,
      resolvedAt: r.resolved_at,
      acknowledged: r.acknowledged,
      acknowledgedAt: r.acknowledged_at,
      acknowledgedBy: r.acknowledged_by,
      silencedUntil: r.silenced_until,
      repeatCount: r.repeat_count,
      message: r.message,
      updatedAt: r.updated_at,
      userId: r.user_id,
      source: r.source,
      environment: r.environment,
      isSimulation: r.is_simulation
    }));
  }

  public async getAlarmEvents(tenantId?: string, incidentId?: string, alarmId?: string, deviceId?: string): Promise<any[]> {
    if (!this.pool) return [];
    let sql = `SELECT * FROM alarm_events WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;

    if (tenantId && tenantId !== 'usr_admin' && tenantId !== 'all') {
      sql += ` AND tenant_id = $${idx++}`;
      params.push(tenantId);
    }
    if (incidentId) {
      sql += ` AND incident_id = $${idx++}`;
      params.push(incidentId);
    }
    if (alarmId) {
      sql += ` AND alarm_id = $${idx++}`;
      params.push(alarmId);
    }
    if (deviceId) {
      sql += ` AND device_id = $${idx++}`;
      params.push(deviceId);
    }
    sql += ` ORDER BY created_at DESC LIMIT 200`;
    const res = await this.query(sql, params);
    return res.rows.map(r => ({
      id: r.id,
      incidentId: r.incident_id,
      alarmId: r.alarm_id,
      deviceId: r.device_id,
      deviceName: r.device_name,
      tenantId: r.tenant_id,
      eventType: r.event_type,
      alarmState: r.alarm_state,
      metricKey: r.metric_key,
      value: r.value,
      message: r.message,
      createdAt: r.created_at,
      metadata: r.metadata,
      source: r.source,
      isSimulation: r.is_simulation,
      environment: r.environment
    }));
  }

  public async getNotifications(tenantId?: string): Promise<any[]> {
    if (!this.pool) return [];
    let sql = `SELECT * FROM notifications`;
    const params: any[] = [];
    if (tenantId && tenantId !== 'usr_admin' && tenantId !== 'all') {
      sql += ` WHERE tenant_id = $1`;
      params.push(tenantId);
    }
    sql += ` ORDER BY created_at DESC LIMIT 100`;
    const res = await this.query(sql, params);
    return res.rows.map(r => ({
      id: r.id,
      tenantId: r.tenant_id,
      userId: r.user_id,
      type: r.type,
      title: r.title,
      message: r.message,
      read: r.is_read,
      createdAt: r.created_at,
      alarmId: r.alarm_id,
      ruleId: r.rule_id,
      alarmState: r.alarm_state
    }));
  }

  public async getDispatchLogs(tenantId?: string): Promise<any[]> {
    if (!this.pool) return [];
    let sql = `SELECT * FROM dispatch_logs`;
    const params: any[] = [];
    if (tenantId && tenantId !== 'usr_admin' && tenantId !== 'all') {
      sql += ` WHERE tenant_id = $1`;
      params.push(tenantId);
    }
    sql += ` ORDER BY sent_at DESC LIMIT 100`;
    const res = await this.query(sql, params);
    return res.rows.map(r => ({
      id: r.id,
      ruleId: r.rule_id,
      alarmId: r.alarm_id,
      tenantId: r.tenant_id,
      userId: r.user_id,
      userName: r.user_name,
      channel: r.channel,
      recipient: r.recipient,
      status: r.status,
      error: r.error,
      sentAt: r.sent_at
    }));
  }

  public async queryWithTenant(tenantId: string, isAdmin: boolean, text: string, params: any[] = []): Promise<any> {
    if (!this.pool || !this.isConnected) {
      throw new Error('PostgreSQL veritabanı bağlantısı hazır veya aktif değil');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = $1`, [tenantId]);
      await client.query(`SET LOCAL app.is_admin = $1`, [isAdmin ? 'true' : 'false']);
      const result = await client.query(text, params);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Atomically checks and records an incoming WebSocket message for deduplication across multiple instances.
   * Returns true if message is NEW (successfully recorded), or false if it is a DUPLICATE.
   */
  public async checkAndRecordWsMessage(
    deviceId: string,
    messageId: string,
    messageType: string,
    ttlMs: number = 600000
  ): Promise<boolean> {
    if (!this.pool || !this.isConnected) return true;
    try {
      const expiresAt = new Date(Date.now() + ttlMs).toISOString();
      const sql = `
        INSERT INTO device_ws_messages_dedup (device_id, message_id, message_type, expires_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (device_id, message_id) DO NOTHING
        RETURNING device_id;
      `;
      const res = await this.query(sql, [deviceId, messageId, messageType, expiresAt]);
      return res.rowCount !== null && res.rowCount > 0;
    } catch (err: any) {
      console.warn(`[PostgresRepository] checkAndRecordWsMessage error (${deviceId}/${messageId}):`, err?.message || err);
      return true; // Fallback to allowing message if DB error
    }
  }

  /**
   * Clean up expired message records from the deduplication table.
   */
  public async cleanupExpiredWsMessages(): Promise<void> {
    if (!this.pool || !this.isConnected) return;
    try {
      await this.query(`DELETE FROM device_ws_messages_dedup WHERE expires_at < NOW()`);
    } catch (err: any) {
      console.warn('[PostgresRepository] cleanupExpiredWsMessages error:', err?.message || err);
    }
  }
}
