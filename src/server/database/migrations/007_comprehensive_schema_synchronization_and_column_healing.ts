import type pg from 'pg';
import type { Migration } from './types.js';

export const migration007: Migration = {
  version: '007',
  name: 'comprehensive_schema_synchronization_and_column_healing',
  disableTransaction: true,
  up: async (client: pg.PoolClient) => {
    // 1. DEVICES Table Column Completeness
    await client.query(`
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS ip VARCHAR(45);
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS mac_address VARCHAR(32);
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS data_flow_active BOOLEAN DEFAULT TRUE;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS auth_token VARCHAR(128);
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key VARCHAR(256);
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_prefix VARCHAR(32);
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_hash VARCHAR(128);
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS customer_id VARCHAR(64) DEFAULT 'usr_admin';
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS type VARCHAR(32);
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN DEFAULT FALSE;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS save_simulated_data_to_db BOOLEAN DEFAULT FALSE;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS simulated_metrics JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS role_key VARCHAR(64);
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS hardware_model VARCHAR(64);
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS firmware_version VARCHAR(32);
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_status VARCHAR(32) DEFAULT 'IDLE';
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_target_firmware_id VARCHAR(64);
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_target_version VARCHAR(32);
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_progress INT DEFAULT 0;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_error_message TEXT;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_last_check_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_job_id VARCHAR(64);
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS expected_interval_seconds INT DEFAULT 30;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS auto_detected_interval_seconds INT DEFAULT 30;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS heartbeat_timeout_seconds INT DEFAULT 60;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS interval_mode VARCHAR(16) DEFAULT 'auto';
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS custom_interval_seconds INT;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS recent_intervals JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS websocket_connected BOOLEAN DEFAULT FALSE;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS output_definitions JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS supported_outputs JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS supported_commands JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS assigned_user_id VARCHAR(64);
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(64);
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS previous_api_key_hash VARCHAR(128);

      -- Synchronize ip and ip_address
      UPDATE devices SET ip_address = ip WHERE (ip_address IS NULL OR ip_address = '') AND (ip IS NOT NULL AND ip != '');
      UPDATE devices SET ip = ip_address WHERE (ip IS NULL OR ip = '') AND (ip_address IS NOT NULL AND ip_address != '');
      UPDATE devices SET type = device_type WHERE (type IS NULL OR type = '') AND (device_type IS NOT NULL AND device_type != '');
      UPDATE devices SET device_type = type WHERE (device_type IS NULL OR device_type = '') AND (type IS NOT NULL AND type != '');
      UPDATE devices SET data_flow_active = TRUE WHERE data_flow_active IS NULL;
    `);

    // 2. ACTIVE_ALARMS Table Column Completeness
    await client.query(`
      ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS device_name VARCHAR(128) DEFAULT '';
      ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS operator VARCHAR(32) DEFAULT '>';
      ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS current_value NUMERIC DEFAULT 0;
      ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS first_breach_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS silenced_until TIMESTAMP WITH TIME ZONE;
      ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS repeat_count INT DEFAULT 0;
      ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS message TEXT;
      ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS note TEXT;
      ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS trigger_value NUMERIC;
      ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS incident_id VARCHAR(128);
      ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS last_evaluated_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS is_simulation BOOLEAN DEFAULT FALSE;
      ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS source VARCHAR(32) DEFAULT 'physical';
      ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS environment VARCHAR(32) DEFAULT 'production';
      ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS acknowledged_by VARCHAR(128);
      ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

      UPDATE active_alarms SET current_value = trigger_value WHERE current_value = 0 AND trigger_value IS NOT NULL;
      UPDATE active_alarms SET trigger_value = current_value WHERE trigger_value IS NULL AND current_value IS NOT NULL;
    `);

    // 3. NOTIFICATIONS Table Column Completeness
    await client.query(`
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS severity VARCHAR(32) DEFAULT 'info';
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS device_name VARCHAR(128);
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS acknowledged BOOLEAN DEFAULT FALSE;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS acknowledged_by VARCHAR(128);
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS repeat_count INT DEFAULT 0;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS current_value NUMERIC;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS threshold_value NUMERIC;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read BOOLEAN DEFAULT FALSE;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type VARCHAR(64) DEFAULT 'alert';
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS source VARCHAR(32) DEFAULT 'system';
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS alarm_id VARCHAR(128);
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS rule_id VARCHAR(64);
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS alarm_state VARCHAR(32);
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

      UPDATE notifications SET read = is_read WHERE read IS NULL;
      UPDATE notifications SET is_read = read WHERE is_read IS NULL;
    `);

    // 4. DEVICE_COMMANDS Table Column Completeness
    await client.query(`
      ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS command_type VARCHAR(64) DEFAULT 'GENERAL_COMMAND';
      ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS command_name VARCHAR(64);
      ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS command VARCHAR(64);
      ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS value_payload TEXT;
      ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS sent_by VARCHAR(64);
      ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;
      ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS max_retries INT DEFAULT 3;
      ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS applied_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS executed_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS error_message TEXT;
      ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);
      ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS timeout_seconds INT DEFAULT 300;
      ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS output_id VARCHAR(64);
      ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS parameters JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS result JSONB;
      ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS target_state VARCHAR(64);

      UPDATE device_commands SET command = command_name WHERE (command IS NULL OR command = '') AND (command_name IS NOT NULL AND command_name != '');
      UPDATE device_commands SET command_name = command WHERE (command_name IS NULL OR command_name = '') AND (command_name IS NOT NULL AND command_name != '');
      UPDATE device_commands SET command_type = 'GENERAL_COMMAND' WHERE command_type IS NULL OR command_type = '';
    `);

    // 5. DISPATCH_LOGS Table Column Completeness
    await client.query(`
      CREATE TABLE IF NOT EXISTS dispatch_logs (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64),
        user_id VARCHAR(64),
        user_name VARCHAR(128),
        channel VARCHAR(32) NOT NULL,
        recipient VARCHAR(128) NOT NULL,
        title VARCHAR(256),
        message TEXT NOT NULL,
        severity VARCHAR(32) DEFAULT 'info',
        status VARCHAR(32) DEFAULT 'delivered',
        latency_ms INT DEFAULT 0,
        error_details TEXT,
        sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE dispatch_logs ADD COLUMN IF NOT EXISTS severity VARCHAR(32) DEFAULT 'info';
      ALTER TABLE dispatch_logs ADD COLUMN IF NOT EXISTS attempt_count INT DEFAULT 1;
      ALTER TABLE dispatch_logs ADD COLUMN IF NOT EXISTS latency_ms INT DEFAULT 0;
      ALTER TABLE dispatch_logs ADD COLUMN IF NOT EXISTS error_details TEXT;
      ALTER TABLE dispatch_logs ADD COLUMN IF NOT EXISTS title VARCHAR(256);
      ALTER TABLE dispatch_logs ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);
      ALTER TABLE dispatch_logs ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);
      ALTER TABLE dispatch_logs ADD COLUMN IF NOT EXISTS user_name VARCHAR(128);
    `);

    // 6. AUDIT_LOGS Table Column Completeness
    await client.query(`
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource_type VARCHAR(64) DEFAULT 'system';
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource_id VARCHAR(64);
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details JSONB;
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS severity VARCHAR(32) DEFAULT 'low';
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'usr_admin';
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_name VARCHAR(128);
    `);

    // 7. SYSTEM_EVENTS Table Column Completeness
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_events (
        id VARCHAR(128) PRIMARY KEY,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        level VARCHAR(32) NOT NULL,
        category VARCHAR(64) NOT NULL,
        message TEXT NOT NULL,
        details TEXT,
        source VARCHAR(64) DEFAULT 'system',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        event_type VARCHAR(64),
        payload JSONB,
        severity VARCHAR(32) DEFAULT 'info'
      );

      ALTER TABLE system_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE system_events ADD COLUMN IF NOT EXISTS event_type VARCHAR(64);
      ALTER TABLE system_events ADD COLUMN IF NOT EXISTS payload JSONB;
      ALTER TABLE system_events ADD COLUMN IF NOT EXISTS severity VARCHAR(32) DEFAULT 'info';
      ALTER TABLE system_events ADD COLUMN IF NOT EXISTS level VARCHAR(32) DEFAULT 'info';
      ALTER TABLE system_events ADD COLUMN IF NOT EXISTS category VARCHAR(64) DEFAULT 'system';
      ALTER TABLE system_events ADD COLUMN IF NOT EXISTS message TEXT DEFAULT '';
      ALTER TABLE system_events ADD COLUMN IF NOT EXISTS details TEXT;
      ALTER TABLE system_events ADD COLUMN IF NOT EXISTS source VARCHAR(64) DEFAULT 'system';
      ALTER TABLE system_events ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    `);

    // 8. THRESHOLD_RULES Table Column Completeness
    await client.query(`
      ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS hysteresis NUMERIC DEFAULT 0;
      ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS min_breach_duration_sec INT DEFAULT 0;
      ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS repeat_interval_sec INT DEFAULT 0;
      ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS notification_channels JSONB DEFAULT '["app"]'::jsonb;
      ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS active_hours VARCHAR(64) DEFAULT '00:00-23:59';
      ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS recipients JSONB;
      ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS silenced_until TIMESTAMP WITH TIME ZONE;
      ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS user_name VARCHAR(128);
      ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS device_id VARCHAR(64) DEFAULT 'all';
      ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS message_template TEXT;
    `);

    // 9. FIRMWARES & OTA JOBS Table Column Completeness
    await client.query(`
      CREATE TABLE IF NOT EXISTS firmwares (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        device_type VARCHAR(64) NOT NULL,
        role_key VARCHAR(64) NOT NULL,
        hardware_model VARCHAR(64) DEFAULT 'ALL',
        version VARCHAR(32) NOT NULL,
        description TEXT,
        binary_data TEXT,
        binary_size INT DEFAULT 0,
        sha256 VARCHAR(128) NOT NULL,
        signature TEXT,
        file_path TEXT,
        min_hardware_revision VARCHAR(64),
        is_active BOOLEAN DEFAULT TRUE,
        uploaded_by VARCHAR(128) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ota_deployment_jobs (
        id VARCHAR(64) PRIMARY KEY,
        firmware_id VARCHAR(64),
        firmware_version VARCHAR(32) NOT NULL,
        firmware_name VARCHAR(128) NOT NULL,
        device_id VARCHAR(64),
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
        completed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS role_key VARCHAR(64) DEFAULT 'ALL';
      ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS hardware_model VARCHAR(64) DEFAULT 'ALL';
      ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS binary_data BYTEA;
      ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS binary_size BIGINT DEFAULT 0;
      ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS signature TEXT;
      ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS file_path TEXT;
      ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS min_hardware_revision VARCHAR(32);
      ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

      ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS download_token VARCHAR(128);
      ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS attempt_count INT DEFAULT 0;
      ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS max_attempts INT DEFAULT 3;
      ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS download_started_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS boot_confirmed_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;
    `);

    // 10. Performance Indexes on Common Query Fields
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_devices_ip ON devices(ip);
      CREATE INDEX IF NOT EXISTS idx_devices_ip_address ON devices(ip_address);
      CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
      CREATE INDEX IF NOT EXISTS idx_active_alarms_tenant ON active_alarms(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_active_alarms_device ON active_alarms(device_id);
      CREATE INDEX IF NOT EXISTS idx_active_alarms_state ON active_alarms(state);
      CREATE INDEX IF NOT EXISTS idx_notifications_tenant_created ON notifications(tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_device_commands_device_status ON device_commands(device_id, status);
    `).catch(() => {});
  },
  down: async (_client: pg.PoolClient) => {
    // Non-destructive rollback
  }
};
