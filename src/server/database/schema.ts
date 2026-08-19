export const postgresSchemaSQL = `
-- ============================================================================
-- PostgreSQL & TimescaleDB Production Database Schema
-- Industrial IoT Real-Time Telemetry, Alarm & Compression Engine
-- ============================================================================

-- 1. Enable TimescaleDB Extension (if available and permitted)
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'timescaledb extension could not be created. Proceeding without it.';
END $$;

-- 2. Base Relational Tables
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devices (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ensure columns exist for existing databases
DO $$
BEGIN
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_prefix VARCHAR(32);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_hash VARCHAR(128);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN DEFAULT FALSE;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS save_simulated_data_to_db BOOLEAN DEFAULT FALSE;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS simulated_metrics JSONB DEFAULT '[]'::jsonb;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'devices table alter notice: %', SQLERRM;
END $$;

-- 3. Telemetry Table (TimescaleDB Hypertable Base with Composite Primary Key for Deduplication & Partitioning)
CREATE TABLE IF NOT EXISTS telemetry_readings (
    id VARCHAR(128) NOT NULL,
    device_id VARCHAR(64) REFERENCES devices(id) ON DELETE CASCADE,
    device_name VARCHAR(128) NOT NULL,
    metric VARCHAR(64) NOT NULL,
    metric_value DOUBLE PRECISION NOT NULL,
    unit VARCHAR(16) NOT NULL,
    status_level VARCHAR(32) DEFAULT 'normal',
    sequence BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (id, created_at)
);

-- Ensure sequence column and indexes exist on telemetry_readings
DO $$
BEGIN
    ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS sequence BIGINT;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'telemetry_readings sequence column setup notice: %', SQLERRM;
END $$;

-- Ensure Composite Primary Key (id, created_at) on existing telemetry_readings instances for ON CONFLICT support
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'telemetry_readings'::regclass 
        AND contype = 'p'
    ) THEN
        ALTER TABLE telemetry_readings ADD PRIMARY KEY (id, created_at);
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'telemetry_readings primary key setup notice: %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS idx_telemetry_device_time ON telemetry_readings(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_metric_time ON telemetry_readings(metric, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_time ON telemetry_readings(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_telemetry_device_seq_metric ON telemetry_readings(device_id, sequence, metric) WHERE sequence IS NOT NULL;

-- Convert to Hypertable (TimescaleDB)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('telemetry_readings', 'created_at', chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE);
    END IF;
END $$;

-- Enable TimescaleDB Columnar Compression Policy (Segmented by device and metric)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        ALTER TABLE telemetry_readings SET (
            timescaledb.compress,
            timescaledb.compress_segmentby = 'device_id, metric',
            timescaledb.compress_orderby = 'created_at DESC'
        );
        PERFORM add_compression_policy('telemetry_readings', INTERVAL '7 days', if_not_exists => TRUE);
    END IF;
END $$;

-- 4. Continuous Aggregates (Hourly & Daily Materialized Views / Standard Views Fallback)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        EXECUTE 'CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_hourly_summary WITH (timescaledb.continuous) AS SELECT time_bucket(''1 hour'', created_at) AS bucket, device_id, metric, min(metric_value) AS min_val, max(metric_value) AS max_val, avg(metric_value) AS avg_val, count(*) AS reading_count FROM telemetry_readings GROUP BY bucket, device_id, metric WITH NO DATA;';

        EXECUTE 'CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_daily_summary WITH (timescaledb.continuous) AS SELECT time_bucket(''1 day'', created_at) AS bucket, device_id, metric, min(metric_value) AS min_val, max(metric_value) AS max_val, avg(metric_value) AS avg_val, count(*) AS reading_count FROM telemetry_readings GROUP BY bucket, device_id, metric WITH NO DATA;';
    ELSE
        EXECUTE 'CREATE OR REPLACE VIEW telemetry_hourly_summary AS SELECT date_trunc(''hour'', created_at) AS bucket, device_id, metric, min(metric_value) AS min_val, max(metric_value) AS max_val, avg(metric_value) AS avg_val, count(*) AS reading_count FROM telemetry_readings GROUP BY date_trunc(''hour'', created_at), device_id, metric;';

        EXECUTE 'CREATE OR REPLACE VIEW telemetry_daily_summary AS SELECT date_trunc(''day'', created_at) AS bucket, device_id, metric, min(metric_value) AS min_val, max(metric_value) AS max_val, avg(metric_value) AS avg_val, count(*) AS reading_count FROM telemetry_readings GROUP BY date_trunc(''day'', created_at), device_id, metric;';
    END IF;
END $$;

-- Continuous Aggregate Refresh Policies
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
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

        PERFORM add_retention_policy('telemetry_readings', INTERVAL '90 days', if_not_exists => TRUE);
    END IF;
END $$;

-- 5. Additional System Tables
CREATE TABLE IF NOT EXISTS active_alarms (
    id VARCHAR(128) PRIMARY KEY,
    rule_id VARCHAR(64) NOT NULL,
    device_id VARCHAR(64) NOT NULL,
    device_name VARCHAR(128) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    metric_key VARCHAR(64) NOT NULL,
    operator VARCHAR(8) NOT NULL,
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
    message TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dashboard_layouts (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(128) NOT NULL,
    widgets_json JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS threshold_rules (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
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
    current_value DOUBLE PRECISION,
    threshold_value DOUBLE PRECISION,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    user_name VARCHAR(128),
    action VARCHAR(256) NOT NULL,
    ip_address VARCHAR(45),
    severity VARCHAR(32) DEFAULT 'low',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS device_commands (
    id VARCHAR(64) PRIMARY KEY,
    device_id VARCHAR(64) REFERENCES devices(id) ON DELETE CASCADE,
    command_name VARCHAR(64) NOT NULL,
    parameters JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(32) DEFAULT 'queued',
    sent_by VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    executed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS dispatch_logs (
    id VARCHAR(64) PRIMARY KEY,
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

CREATE TABLE IF NOT EXISTS user_sessions (
    token VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    user_role VARCHAR(32),
    user_email VARCHAR(128),
    user_name VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Safe Column Migrations for Existing Tables
ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);
ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS user_name VARCHAR(128);
ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS device_id VARCHAR(64) DEFAULT 'all';
ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS hysteresis DOUBLE PRECISION DEFAULT 1.0;
ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS min_breach_duration_sec INT DEFAULT 10;
ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS repeat_interval_sec INT DEFAULT 300;
ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS notification_channels JSONB DEFAULT '["app","email"]'::jsonb;
ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS active_hours VARCHAR(64) DEFAULT '00:00-23:59';
ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS recipients JSONB DEFAULT '[]'::jsonb;
ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS silenced_until TIMESTAMP WITH TIME ZONE;

ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);
ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS first_breach_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS triggered_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS acknowledged BOOLEAN DEFAULT FALSE;
ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS acknowledged_by VARCHAR(128);
ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS silenced_until TIMESTAMP WITH TIME ZONE;
ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS repeat_count INT DEFAULT 0;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS device_id VARCHAR(64);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS device_name VARCHAR(128);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS alarm_id VARCHAR(128);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS rule_id VARCHAR(64);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS alarm_state VARCHAR(32);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS acknowledged BOOLEAN DEFAULT FALSE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS acknowledged_by VARCHAR(128);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS repeat_count INT DEFAULT 0;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS current_value DOUBLE PRECISION;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS threshold_value DOUBLE PRECISION;

ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_email VARCHAR(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name VARCHAR(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"app":true,"email":true,"whatsapp":true,"telegram":true,"sms":true,"webhook":true}'::jsonb;

ALTER TABLE devices ADD COLUMN IF NOT EXISTS encryption_method VARCHAR(64) DEFAULT 'AES-256-GCM';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS metrics JSONB DEFAULT '{}'::jsonb;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS data_flow_active BOOLEAN DEFAULT TRUE;
`;

