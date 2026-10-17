
-- ============================================================================
-- NexusNode IoT - Complete Canonical Database Schema (PostgreSQL + TimescaleDB)
-- Single Source of Truth DDL Script
-- ============================================================================

-- 0. EXTENSIONS
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'timescaledb extension not available; proceeding with standard PostgreSQL tables & views.';
END $$;

DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pgcrypto CASCADE;
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp" CASCADE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'crypto extensions notice: %', SQLERRM;
END $$;

-- 1. PROCEDURAL FUNCTIONS
CREATE OR REPLACE FUNCTION fn_update_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_cleanup_expired_records()
RETURNS VOID AS $$
BEGIN
    DELETE FROM device_ws_messages_dedup WHERE expires_at < CURRENT_TIMESTAMP;
    DELETE FROM user_sessions WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_device_last_seen_sync()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE devices 
    SET last_seen = NEW.received_at, 
        status = 'online' 
    WHERE id = NEW.device_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. CORE RELATIONAL TABLES

-- 2.1 USERS
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
    preferences JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(32) DEFAULT 'active',
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at_timestamp();

-- 2.2 DEVICES
CREATE TABLE IF NOT EXISTS devices (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'usr_admin',
    user_id VARCHAR(64) DEFAULT 'usr_admin',
    name VARCHAR(128) NOT NULL,
    device_type VARCHAR(64) NOT NULL DEFAULT 'custom',
    role_key VARCHAR(64) DEFAULT 'device',
    api_key VARCHAR(256),
    api_key_prefix VARCHAR(32),
    api_key_hash VARCHAR(128),
    api_key_expires_at TIMESTAMP WITH TIME ZONE,
    api_key_revoked BOOLEAN DEFAULT FALSE,
    api_key_last_used_at TIMESTAMP WITH TIME ZONE,
    api_key_scopes JSONB DEFAULT '["all"]'::jsonb,
    api_key_rotated_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(32) DEFAULT 'offline',
    location VARCHAR(256),
    ip_address VARCHAR(45),
    mac_address VARCHAR(32),
    hardware_model VARCHAR(64),
    firmware_version VARCHAR(32),
    ota_status VARCHAR(32) DEFAULT 'IDLE',
    ota_target_firmware_id VARCHAR(64),
    ota_progress INT DEFAULT 0,
    ota_error_message TEXT,
    ota_last_check_at TIMESTAMP WITH TIME ZONE,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    rate_limit_per_min INT DEFAULT 120,
    encryption_method VARCHAR(64) DEFAULT 'AES-256-GCM',
    metrics JSONB DEFAULT '{}'::jsonb,
    data_flow_active BOOLEAN DEFAULT TRUE,
    is_simulated BOOLEAN DEFAULT FALSE,
    save_simulated_data_to_db BOOLEAN DEFAULT FALSE,
    simulated_metrics JSONB DEFAULT '[]'::jsonb,
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
    last_telemetry_at TIMESTAMP WITH TIME ZONE,
    last_heartbeat_at TIMESTAMP WITH TIME ZONE,
    last_offline_notified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_devices_tenant_id ON devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_api_key_hash ON devices(api_key_hash);
CREATE INDEX IF NOT EXISTS idx_devices_hardware_model ON devices(hardware_model);
CREATE INDEX IF NOT EXISTS idx_devices_role_key ON devices(role_key);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_devices_last_telemetry_at ON devices(last_telemetry_at);
CREATE INDEX IF NOT EXISTS idx_devices_last_heartbeat_at ON devices(last_heartbeat_at);

-- 2.3 DEVICE WEBSOCKET MESSAGES DEDUPLICATION
CREATE TABLE IF NOT EXISTS device_ws_messages_dedup (
    device_id VARCHAR(64) NOT NULL,
    message_id VARCHAR(128) NOT NULL,
    message_type VARCHAR(32) NOT NULL DEFAULT 'telemetry',
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour'),
    PRIMARY KEY (device_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_device_ws_dedup_expires ON device_ws_messages_dedup(expires_at);

-- 2.4 TELEMETRY PACKETS
CREATE TABLE IF NOT EXISTS telemetry_packets (
    id VARCHAR(128) PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL,
    boot_id VARCHAR(64) DEFAULT 'default' NOT NULL,
    sequence BIGINT NOT NULL,
    idempotency_key VARCHAR(192),
    metric_count INT DEFAULT 0,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unq_telemetry_device_boot_sequence UNIQUE(device_id, boot_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_packets_dev_seq ON telemetry_packets(device_id, sequence);
CREATE INDEX IF NOT EXISTS idx_telemetry_packets_received ON telemetry_packets(received_at DESC);

DROP TRIGGER IF EXISTS trg_telemetry_packet_device_sync ON telemetry_packets;
CREATE TRIGGER trg_telemetry_packet_device_sync
AFTER INSERT ON telemetry_packets
FOR EACH ROW
EXECUTE FUNCTION fn_device_last_seen_sync();

-- 2.5 PHYSICAL TELEMETRY READINGS (TimescaleDB Hypertable)
CREATE TABLE IF NOT EXISTS telemetry_readings (
    id VARCHAR(128) NOT NULL,
    packet_id VARCHAR(128),
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'usr_admin',
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (id, created_at)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_tenant_device_time ON telemetry_readings(tenant_id, device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_tenant_time ON telemetry_readings(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_device_time ON telemetry_readings(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_metric_time ON telemetry_readings(metric, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_time ON telemetry_readings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_packet ON telemetry_readings(packet_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_source ON telemetry_readings(source);

-- TimescaleDB Hypertable Setup & Columnar Compression for telemetry_readings
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('telemetry_readings', 'created_at', chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE);
        
        ALTER TABLE telemetry_readings SET (
            timescaledb.compress,
            timescaledb.compress_segmentby = 'device_id, metric',
            timescaledb.compress_orderby = 'created_at DESC'
        );
        
        PERFORM add_compression_policy('telemetry_readings', INTERVAL '14 days', if_not_exists => TRUE);
        PERFORM add_retention_policy('telemetry_readings', INTERVAL '365 days', if_not_exists => TRUE);
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'telemetry_readings hypertable notice: %', SQLERRM;
END $$;

-- 2.6 SIMULATION TELEMETRY READINGS (TimescaleDB Hypertable)
CREATE TABLE IF NOT EXISTS simulation_telemetry_readings (
    id VARCHAR(128) NOT NULL,
    packet_id VARCHAR(128),
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'usr_admin',
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
    simulation_run_id VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (id, created_at)
);

CREATE INDEX IF NOT EXISTS idx_sim_telemetry_tenant_device_time ON simulation_telemetry_readings(tenant_id, device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sim_telemetry_tenant_time ON simulation_telemetry_readings(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sim_telemetry_device_time ON simulation_telemetry_readings(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sim_telemetry_metric_time ON simulation_telemetry_readings(metric, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sim_telemetry_time ON simulation_telemetry_readings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sim_telemetry_run ON simulation_telemetry_readings(simulation_run_id);
CREATE INDEX IF NOT EXISTS idx_sim_telemetry_packet ON simulation_telemetry_readings(packet_id);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('simulation_telemetry_readings', 'created_at', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
        
        ALTER TABLE simulation_telemetry_readings SET (
            timescaledb.compress,
            timescaledb.compress_segmentby = 'device_id, metric',
            timescaledb.compress_orderby = 'created_at DESC'
        );
        
        PERFORM add_compression_policy('simulation_telemetry_readings', INTERVAL '3 days', if_not_exists => TRUE);
        PERFORM add_retention_policy('simulation_telemetry_readings', INTERVAL '7 days', if_not_exists => TRUE);
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'simulation_telemetry_readings hypertable notice: %', SQLERRM;
END $$;

-- 2.7 THRESHOLD RULES
CREATE TABLE IF NOT EXISTS threshold_rules (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    tenant_id VARCHAR(64) DEFAULT 'usr_admin',
    user_name VARCHAR(128),
    device_id VARCHAR(64) DEFAULT 'all',
    metric_key VARCHAR(64) NOT NULL,
    operator VARCHAR(8) NOT NULL,
    threshold_value DOUBLE PRECISION NOT NULL,
    severity VARCHAR(32) DEFAULT 'warning',
    enabled BOOLEAN DEFAULT TRUE,
    message_template TEXT NOT NULL,
    hysteresis DOUBLE PRECISION DEFAULT 1.0,
    min_breach_duration_sec INT DEFAULT 10,
    repeat_interval_sec INT DEFAULT 300,
    notification_channels JSONB DEFAULT '["app","email"]'::jsonb,
    active_hours VARCHAR(64) DEFAULT '00:00-23:59',
    recipients JSONB DEFAULT '[]'::jsonb,
    silenced_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_threshold_rules_tenant ON threshold_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_threshold_rules_user ON threshold_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_threshold_rules_device ON threshold_rules(device_id);
CREATE INDEX IF NOT EXISTS idx_threshold_rules_metric ON threshold_rules(metric_key);
CREATE INDEX IF NOT EXISTS idx_threshold_rules_enabled ON threshold_rules(enabled);

DROP TRIGGER IF EXISTS trg_threshold_rules_updated_at ON threshold_rules;
CREATE TRIGGER trg_threshold_rules_updated_at
BEFORE UPDATE ON threshold_rules
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at_timestamp();

-- 2.8 ACTIVE ALARMS
CREATE TABLE IF NOT EXISTS active_alarms (
    id VARCHAR(128) PRIMARY KEY,
    rule_id VARCHAR(64) NOT NULL,
    device_id VARCHAR(64) NOT NULL,
    device_name VARCHAR(128) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) DEFAULT 'usr_admin',
    metric_key VARCHAR(64) NOT NULL,
    operator VARCHAR(32) NOT NULL,
    threshold_value DOUBLE PRECISION NOT NULL,
    current_value DOUBLE PRECISION NOT NULL,
    severity VARCHAR(32) NOT NULL,
    state VARCHAR(32) NOT NULL,
    first_breach_at TIMESTAMP WITH TIME ZONE,
    triggered_at TIMESTAMP WITH TIME ZONE,
    last_notified_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by VARCHAR(128),
    silenced_until TIMESTAMP WITH TIME ZONE,
    repeat_count INT DEFAULT 0,
    source VARCHAR(32) DEFAULT 'physical',
    environment VARCHAR(32) DEFAULT 'production',
    is_simulation BOOLEAN DEFAULT FALSE,
    incident_id VARCHAR(128),
    last_evaluated_at TIMESTAMP WITH TIME ZONE,
    message TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_active_alarms_device ON active_alarms(device_id);
CREATE INDEX IF NOT EXISTS idx_active_alarms_rule ON active_alarms(rule_id);
CREATE INDEX IF NOT EXISTS idx_active_alarms_state ON active_alarms(state);
CREATE INDEX IF NOT EXISTS idx_active_alarms_tenant ON active_alarms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_active_alarms_user ON active_alarms(user_id);
CREATE INDEX IF NOT EXISTS idx_active_alarms_triggered ON active_alarms(triggered_at DESC);

DROP TRIGGER IF EXISTS trg_active_alarms_updated_at ON active_alarms;
CREATE TRIGGER trg_active_alarms_updated_at
BEFORE UPDATE ON active_alarms
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at_timestamp();

-- 2.9 ALARM EVENTS (Historical Event Timeline)
CREATE TABLE IF NOT EXISTS alarm_events (
    id VARCHAR(64) PRIMARY KEY,
    alarm_id VARCHAR(64) NOT NULL,
    rule_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64),
    tenant_id VARCHAR(64) DEFAULT 'usr_admin',
    device_id VARCHAR(64) NOT NULL,
    metric_key VARCHAR(64) NOT NULL,
    trigger_value DOUBLE PRECISION NOT NULL,
    threshold_value DOUBLE PRECISION NOT NULL,
    severity VARCHAR(32) NOT NULL,
    event_type VARCHAR(32) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    note TEXT
);

CREATE INDEX IF NOT EXISTS idx_alarm_events_alarm_id ON alarm_events(alarm_id);
CREATE INDEX IF NOT EXISTS idx_alarm_events_device_id ON alarm_events(device_id);
CREATE INDEX IF NOT EXISTS idx_alarm_events_rule_id ON alarm_events(rule_id);
CREATE INDEX IF NOT EXISTS idx_alarm_events_timestamp ON alarm_events(timestamp DESC);

-- 2.10 NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    tenant_id VARCHAR(64) DEFAULT 'usr_admin',
    title VARCHAR(256) NOT NULL,
    message TEXT NOT NULL,
    severity VARCHAR(32) DEFAULT 'info',
    type VARCHAR(64) DEFAULT 'alert',
    source VARCHAR(32) DEFAULT 'system',
    device_id VARCHAR(64),
    device_name VARCHAR(128),
    is_read BOOLEAN DEFAULT FALSE,
    read BOOLEAN DEFAULT FALSE,
    alarm_id VARCHAR(128),
    rule_id VARCHAR(64),
    alarm_state VARCHAR(32),
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by VARCHAR(128),
    repeat_count INT DEFAULT 0,
    current_value DOUBLE PRECISION,
    threshold_value DOUBLE PRECISION,
    event_key VARCHAR(256),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_device ON notifications(device_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_event_key ON notifications (event_key) WHERE event_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- 2.11 AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    tenant_id VARCHAR(64) DEFAULT 'usr_admin',
    user_name VARCHAR(128),
    action VARCHAR(256) NOT NULL,
    resource_type VARCHAR(128) DEFAULT 'system',
    resource_id VARCHAR(128),
    details JSONB,
    ip_address VARCHAR(45),
    severity VARCHAR(32) DEFAULT 'low',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- 2.12 SYSTEM EVENTS
CREATE TABLE IF NOT EXISTS system_events (
    id VARCHAR(64) PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    source VARCHAR(64) NOT NULL,
    severity VARCHAR(32) DEFAULT 'info',
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_system_events_type ON system_events(event_type);
CREATE INDEX IF NOT EXISTS idx_system_events_created_at ON system_events(created_at DESC);

-- 2.13 DEVICE COMMANDS
CREATE TABLE IF NOT EXISTS device_commands (
    id VARCHAR(64) PRIMARY KEY,
    command_id VARCHAR(64),
    tenant_id VARCHAR(64),
    customer_id VARCHAR(64),
    device_id VARCHAR(64),
    user_id VARCHAR(64),
    command VARCHAR(64),
    command_name VARCHAR(64),
    command_type VARCHAR(64) NOT NULL DEFAULT 'GENERAL_COMMAND',
    output_id VARCHAR(64),
    target_pin VARCHAR(32),
    target_state VARCHAR(32),
    value DOUBLE PRECISION,
    value_payload TEXT,
    parameters JSONB DEFAULT '{}'::jsonb,
    result JSONB,
    source VARCHAR(32) DEFAULT 'manual',
    status VARCHAR(32) DEFAULT 'pending',
    priority INT DEFAULT 1,
    ttl_seconds INT DEFAULT 60,
    timeout_seconds INT DEFAULT 300,
    requires_ack BOOLEAN DEFAULT TRUE,
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    idempotency_key VARCHAR(128),
    sent_by VARCHAR(64),
    created_by VARCHAR(128),
    sent_at TIMESTAMP WITH TIME ZONE,
    dispatched_at TIMESTAMP WITH TIME ZONE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    applied_at TIMESTAMP WITH TIME ZONE,
    executed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_device_commands_device_time ON device_commands(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_commands_tenant_time ON device_commands(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_commands_customer_time ON device_commands(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_commands_status ON device_commands(status);
CREATE INDEX IF NOT EXISTS idx_device_commands_idempotency ON device_commands(idempotency_key);

-- 2.12 DISPATCH LOGS
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

CREATE INDEX IF NOT EXISTS idx_dispatch_logs_channel ON dispatch_logs(channel);
CREATE INDEX IF NOT EXISTS idx_dispatch_logs_status ON dispatch_logs(status);
CREATE INDEX IF NOT EXISTS idx_dispatch_logs_sent_at ON dispatch_logs(sent_at DESC);

-- 2.14 USER SESSIONS
CREATE TABLE IF NOT EXISTS user_sessions (
    id VARCHAR(64) PRIMARY KEY,
    token_hash VARCHAR(128),
    token_prefix VARCHAR(32),
    token VARCHAR(128),
    user_id VARCHAR(64),
    user_role VARCHAR(32) DEFAULT 'operator',
    user_email VARCHAR(128),
    user_name VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

-- 2.15 DASHBOARD LAYOUTS
CREATE TABLE IF NOT EXISTS dashboard_layouts (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    title VARCHAR(128) NOT NULL,
    widgets_json JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dashboard_layouts_user ON dashboard_layouts(user_id);

DROP TRIGGER IF EXISTS trg_dashboard_layouts_updated_at ON dashboard_layouts;
CREATE TRIGGER trg_dashboard_layouts_updated_at
BEFORE UPDATE ON dashboard_layouts
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at_timestamp();

-- 2.16 FIRMWARES (OTA Repository)
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

CREATE INDEX IF NOT EXISTS idx_firmwares_type_role ON firmwares(device_type, role_key);
CREATE INDEX IF NOT EXISTS idx_firmwares_version ON firmwares(version);
CREATE INDEX IF NOT EXISTS idx_firmwares_sha256 ON firmwares(sha256);

DROP TRIGGER IF EXISTS trg_firmwares_updated_at ON firmwares;
CREATE TRIGGER trg_firmwares_updated_at
BEFORE UPDATE ON firmwares
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at_timestamp();

-- 2.17 OTA DEPLOYMENT JOBS
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

CREATE INDEX IF NOT EXISTS idx_ota_jobs_device ON ota_deployment_jobs(device_id);
CREATE INDEX IF NOT EXISTS idx_ota_jobs_status ON ota_deployment_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ota_jobs_created ON ota_deployment_jobs(created_at DESC);

DROP TRIGGER IF EXISTS trg_ota_jobs_updated_at ON ota_deployment_jobs;
CREATE TRIGGER trg_ota_jobs_updated_at
BEFORE UPDATE ON ota_deployment_jobs
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at_timestamp();

-- 2.18 SCHEMA MIGRATIONS
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(32) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    execution_time_ms INT DEFAULT 0,
    status VARCHAR(32) DEFAULT 'applied',
    checksum VARCHAR(128),
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON schema_migrations(applied_at DESC);

-- 2.19 SERVICE TOKENS
CREATE TABLE IF NOT EXISTS service_tokens (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    token_prefix VARCHAR(32) NOT NULL,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    user_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_service_tokens_token_hash ON service_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_service_tokens_tenant_id ON service_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_tokens_user_id ON service_tokens(user_id);

-- 2.20 SYSTEM SETTINGS
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(64) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_system_settings_updated_at ON system_settings(updated_at DESC);

-- 3. CONTINUOUS AGGREGATES & ANALYTICAL VIEWS
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        EXECUTE 'CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_hourly_summary WITH (timescaledb.continuous) AS SELECT time_bucket(''1 hour'', created_at) AS bucket, device_id, metric, min(metric_value) AS min_val, max(metric_value) AS max_val, avg(metric_value) AS avg_val, count(*) AS reading_count FROM telemetry_readings WHERE source = ''physical'' OR source IS NULL GROUP BY bucket, device_id, metric WITH NO DATA;';

        EXECUTE 'CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_daily_summary WITH (timescaledb.continuous) AS SELECT time_bucket(''1 day'', created_at) AS bucket, device_id, metric, min(metric_value) AS min_val, max(metric_value) AS max_val, avg(metric_value) AS avg_val, count(*) AS reading_count FROM telemetry_readings WHERE source = ''physical'' OR source IS NULL GROUP BY bucket, device_id, metric WITH NO DATA;';

        PERFORM add_continuous_aggregate_policy('telemetry_hourly_summary',
            start_offset => INTERVAL '30 days',
            end_offset => INTERVAL '1 hour',
            schedule_interval => INTERVAL '15 minutes',
            if_not_exists => TRUE);

        PERFORM add_continuous_aggregate_policy('telemetry_daily_summary',
            start_offset => INTERVAL '365 days',
            end_offset => INTERVAL '1 day',
            schedule_interval => INTERVAL '1 hour',
            if_not_exists => TRUE);

        -- Tier 3: 5-Year Downsampled Continuous Aggregate Retention Policies
        PERFORM add_retention_policy('telemetry_hourly_summary', INTERVAL '730 days', if_not_exists => TRUE);
        PERFORM add_retention_policy('telemetry_daily_summary', INTERVAL '1825 days', if_not_exists => TRUE);
    ELSE
        EXECUTE 'CREATE OR REPLACE VIEW telemetry_hourly_summary AS SELECT date_trunc(''hour'', created_at) AS bucket, device_id, metric, min(metric_value) AS min_val, max(metric_value) AS max_val, avg(metric_value) AS avg_val, count(*) AS reading_count FROM telemetry_readings WHERE source = ''physical'' OR source IS NULL GROUP BY date_trunc(''hour'', created_at), device_id, metric;';

        EXECUTE 'CREATE OR REPLACE VIEW telemetry_daily_summary AS SELECT date_trunc(''day'', created_at) AS bucket, device_id, metric, min(metric_value) AS min_val, max(metric_value) AS max_val, avg(metric_value) AS avg_val, count(*) AS reading_count FROM telemetry_readings WHERE source = ''physical'' OR source IS NULL GROUP BY date_trunc(''day'', created_at), device_id, metric;';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'continuous aggregates view notice: %', SQLERRM;
END $$;

-- Active Device Summary View
CREATE OR REPLACE VIEW v_active_device_summary AS
SELECT 
    d.id AS device_id,
    d.name AS device_name,
    d.device_type,
    d.tenant_id,
    d.user_id,
    d.status,
    d.last_seen,
    d.ip_address,
    d.hardware_model,
    d.firmware_version,
    d.is_simulated,
    COALESCE(alarm_counts.open_alarm_count, 0) AS open_alarm_count
FROM devices d
LEFT JOIN (
    SELECT device_id, COUNT(*) AS open_alarm_count
    FROM active_alarms
    WHERE state = 'OPEN'
    GROUP BY device_id
) alarm_counts ON d.id = alarm_counts.device_id;

-- System Health Administrative Overview View
CREATE OR REPLACE VIEW v_system_health_overview AS
SELECT 
    u.id AS user_id,
    u.name AS user_name,
    u.email,
    u.role,
    u.company_name,
    u.status AS user_status,
    COUNT(DISTINCT d.id) AS total_devices,
    COUNT(DISTINCT CASE WHEN d.status = 'online' THEN d.id END) AS online_devices,
    COUNT(DISTINCT a.id) AS total_active_alarms
FROM users u
LEFT JOIN devices d ON u.id = d.user_id OR u.id = d.tenant_id
LEFT JOIN active_alarms a ON (u.id = a.user_id OR u.id = a.tenant_id) AND a.state = 'OPEN'
GROUP BY u.id, u.name, u.email, u.role, u.company_name, u.status;

-- 4. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN ALTER TABLE telemetry_readings ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE simulation_telemetry_readings ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
ALTER TABLE threshold_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_alarms ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_commands ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS rls_devices_tenant ON devices;
    CREATE POLICY rls_devices_tenant ON devices
        FOR ALL
        USING (
            current_setting('app.is_admin', true) = 'true'
            OR tenant_id = current_setting('app.current_tenant_id', true)
            OR user_id = current_setting('app.current_user_id', true)
        )
        WITH CHECK (
            current_setting('app.is_admin', true) = 'true'
            OR tenant_id = current_setting('app.current_tenant_id', true)
            OR user_id = current_setting('app.current_user_id', true)
        );

    DROP POLICY IF EXISTS rls_telemetry_readings_tenant ON telemetry_readings;
    CREATE POLICY rls_telemetry_readings_tenant ON telemetry_readings
        FOR ALL
        USING (
            current_setting('app.is_admin', true) = 'true'
            OR tenant_id = current_setting('app.current_tenant_id', true)
        )
        WITH CHECK (
            current_setting('app.is_admin', true) = 'true'
            OR tenant_id = current_setting('app.current_tenant_id', true)
        );

    DROP POLICY IF EXISTS rls_simulation_telemetry_tenant ON simulation_telemetry_readings;
    CREATE POLICY rls_simulation_telemetry_tenant ON simulation_telemetry_readings
        FOR ALL
        USING (
            current_setting('app.is_admin', true) = 'true'
            OR tenant_id = current_setting('app.current_tenant_id', true)
        )
        WITH CHECK (
            current_setting('app.is_admin', true) = 'true'
            OR tenant_id = current_setting('app.current_tenant_id', true)
        );

    DROP POLICY IF EXISTS rls_threshold_rules_tenant ON threshold_rules;
    CREATE POLICY rls_threshold_rules_tenant ON threshold_rules
        FOR ALL
        USING (
            current_setting('app.is_admin', true) = 'true'
            OR tenant_id = current_setting('app.current_tenant_id', true)
            OR user_id = current_setting('app.current_user_id', true)
        )
        WITH CHECK (
            current_setting('app.is_admin', true) = 'true'
            OR tenant_id = current_setting('app.current_tenant_id', true)
            OR user_id = current_setting('app.current_user_id', true)
        );

    DROP POLICY IF EXISTS rls_active_alarms_tenant ON active_alarms;
    CREATE POLICY rls_active_alarms_tenant ON active_alarms
        FOR ALL
        USING (
            current_setting('app.is_admin', true) = 'true'
            OR tenant_id = current_setting('app.current_tenant_id', true)
            OR user_id = current_setting('app.current_user_id', true)
        )
        WITH CHECK (
            current_setting('app.is_admin', true) = 'true'
            OR tenant_id = current_setting('app.current_tenant_id', true)
            OR user_id = current_setting('app.current_user_id', true)
        );

    DROP POLICY IF EXISTS rls_notifications_tenant ON notifications;
    CREATE POLICY rls_notifications_tenant ON notifications
        FOR ALL
        USING (
            current_setting('app.is_admin', true) = 'true'
            OR tenant_id = current_setting('app.current_tenant_id', true)
            OR user_id = current_setting('app.current_user_id', true)
        )
        WITH CHECK (
            current_setting('app.is_admin', true) = 'true'
            OR tenant_id = current_setting('app.current_tenant_id', true)
            OR user_id = current_setting('app.current_user_id', true)
        );

    DROP POLICY IF EXISTS rls_device_commands_tenant ON device_commands;
    CREATE POLICY rls_device_commands_tenant ON device_commands
        FOR ALL
        USING (
            current_setting('app.is_admin', true) = 'true'
            OR tenant_id = current_setting('app.current_tenant_id', true)
            OR user_id = current_setting('app.current_user_id', true)
        )
        WITH CHECK (
            current_setting('app.is_admin', true) = 'true'
            OR tenant_id = current_setting('app.current_tenant_id', true)
            OR user_id = current_setting('app.current_user_id', true)
        );
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'RLS policies notice: %', SQLERRM;
END $$;
