import type pg from 'pg';
import type { Migration } from './types.js';

export const migration001: Migration = {
  version: '001',
  name: 'core_relational_tables',
  up: async (client: pg.PoolClient) => {
    // 1. Users
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
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
      );
    `);

    // 2. Devices
    await client.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        type VARCHAR(64) NOT NULL,
        device_type VARCHAR(64) DEFAULT 'custom',
        role_key VARCHAR(64) DEFAULT 'device',
        location VARCHAR(128),
        ip VARCHAR(45),
        mac_address VARCHAR(32),
        hardware_model VARCHAR(64),
        firmware_version VARCHAR(32),
        ota_status VARCHAR(32) DEFAULT 'idle',
        ota_target_version VARCHAR(32),
        ota_progress INT DEFAULT 0,
        ota_job_id VARCHAR(64),
        ota_error_message TEXT,
        status VARCHAR(32) DEFAULT 'offline',
        tenant_id VARCHAR(64) DEFAULT 'usr_admin',
        customer_id VARCHAR(64) DEFAULT 'usr_admin',
        user_id VARCHAR(64) DEFAULT 'usr_admin',
        assigned_user_id VARCHAR(64),
        created_by_user_id VARCHAR(64),
        auth_token VARCHAR(256),
        api_key VARCHAR(128),
        encryption_method VARCHAR(32) DEFAULT 'none',
        rate_limit_per_min INT DEFAULT 120,
        heartbeat_timeout_seconds INT DEFAULT 60,
        expected_interval_seconds INT DEFAULT 10,
        interval_mode VARCHAR(32) DEFAULT 'auto',
        custom_interval_seconds INT,
        auto_detected_interval_seconds INT,
        is_simulated BOOLEAN DEFAULT FALSE,
        save_simulated_data_to_db BOOLEAN DEFAULT TRUE,
        simulated_metrics JSONB,
        last_seen TIMESTAMP WITH TIME ZONE,
        metrics JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Telemetry Packets
    await client.query(`
      CREATE TABLE IF NOT EXISTS telemetry_packets (
        id VARCHAR(128) PRIMARY KEY,
        device_id VARCHAR(64) NOT NULL,
        boot_id VARCHAR(64) DEFAULT 'default',
        sequence BIGINT NOT NULL,
        idempotency_key VARCHAR(192),
        metric_count INT DEFAULT 1,
        received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Telemetry Readings (Base Table for Hypertable)
    await client.query(`
      CREATE TABLE IF NOT EXISTS telemetry_readings (
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
      );
    `);

    // 5. Simulation Telemetry Readings (Base Table for Sandbox Hypertable)
    await client.query(`
      CREATE TABLE IF NOT EXISTS simulation_telemetry_readings (
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
      );
    `);

    // 6. Threshold Rules
    await client.query(`
      CREATE TABLE IF NOT EXISTS threshold_rules (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64),
        tenant_id VARCHAR(64) DEFAULT 'usr_admin',
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
        cooldown_period_sec INT DEFAULT 300,
        notify_app BOOLEAN DEFAULT TRUE,
        notify_email BOOLEAN DEFAULT TRUE,
        notify_whatsapp BOOLEAN DEFAULT FALSE,
        notify_telegram BOOLEAN DEFAULT FALSE,
        notify_sms BOOLEAN DEFAULT FALSE,
        notify_webhook BOOLEAN DEFAULT FALSE,
        webhook_url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 7. Active Alarms & Alarm Events
    await client.query(`
      CREATE TABLE IF NOT EXISTS active_alarms (
        id VARCHAR(64) PRIMARY KEY,
        rule_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64),
        tenant_id VARCHAR(64) DEFAULT 'usr_admin',
        device_id VARCHAR(64) NOT NULL,
        metric_key VARCHAR(64) NOT NULL,
        trigger_value NUMERIC NOT NULL,
        threshold_value NUMERIC NOT NULL,
        severity VARCHAR(32) NOT NULL,
        state VARCHAR(32) DEFAULT 'active',
        triggered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        acknowledged BOOLEAN DEFAULT FALSE,
        acknowledged_at TIMESTAMP WITH TIME ZONE,
        acknowledged_by VARCHAR(64),
        note TEXT
      );

      CREATE TABLE IF NOT EXISTS alarm_events (
        id VARCHAR(64) PRIMARY KEY,
        alarm_id VARCHAR(64) NOT NULL,
        rule_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64),
        tenant_id VARCHAR(64) DEFAULT 'usr_admin',
        device_id VARCHAR(64) NOT NULL,
        metric_key VARCHAR(64) NOT NULL,
        trigger_value NUMERIC NOT NULL,
        threshold_value NUMERIC NOT NULL,
        severity VARCHAR(32) NOT NULL,
        event_type VARCHAR(32) NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        note TEXT
      );
    `);

    // 8. Device Commands
    await client.query(`
      CREATE TABLE IF NOT EXISTS device_commands (
        id VARCHAR(64) PRIMARY KEY,
        command_id VARCHAR(64),
        tenant_id VARCHAR(64) DEFAULT 'usr_admin',
        customer_id VARCHAR(64) DEFAULT 'usr_admin',
        device_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) DEFAULT 'usr_admin',
        command VARCHAR(64) NOT NULL,
        output_id VARCHAR(64),
        target_state VARCHAR(32),
        status VARCHAR(32) DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        sent_at TIMESTAMP WITH TIME ZONE,
        acknowledged_at TIMESTAMP WITH TIME ZONE,
        applied_at TIMESTAMP WITH TIME ZONE,
        executed_at TIMESTAMP WITH TIME ZONE,
        error_message TEXT,
        parameters JSONB,
        result JSONB
      );
    `);

    // 9. Notifications, User Sessions, Audit Logs, System Events
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        tenant_id VARCHAR(64) DEFAULT 'usr_admin',
        title VARCHAR(256) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(32) DEFAULT 'info',
        source VARCHAR(64),
        device_id VARCHAR(64),
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_sessions (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        token VARCHAR(512) NOT NULL,
        ip VARCHAR(45),
        user_agent TEXT,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64),
        tenant_id VARCHAR(64) DEFAULT 'usr_admin',
        action VARCHAR(64) NOT NULL,
        resource_type VARCHAR(64) NOT NULL,
        resource_id VARCHAR(64),
        details JSONB,
        ip_address VARCHAR(45),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS system_events (
        id VARCHAR(64) PRIMARY KEY,
        event_type VARCHAR(64) NOT NULL,
        source VARCHAR(64) NOT NULL,
        severity VARCHAR(32) DEFAULT 'info',
        payload JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS device_ws_messages_dedup (
        msg_id VARCHAR(128) PRIMARY KEY,
        device_id VARCHAR(64) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
  },
  down: async (client: pg.PoolClient) => {
    // Non-destructive safe rollback if needed
    console.warn('[Migration 001] Down migration invoked.');
  },
};
