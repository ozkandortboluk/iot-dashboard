-- ============================================================================
-- PostgreSQL & TimescaleDB Production Migration Script
-- Industrial IoT Real-Time Telemetry, Alarm & Compression Engine
-- ============================================================================

-- 1. Enable TimescaleDB Extension (if available in PostgreSQL instance)
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- 2. Base Relational Schema
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    email VARCHAR(128) UNIQUE NOT NULL,
    phone VARCHAR(32),
    notification_email VARCHAR(128),
    whatsapp_number VARCHAR(32),
    telegram_chat_id VARCHAR(64),
    password_hash VARCHAR(256) NOT NULL,
    role VARCHAR(32) DEFAULT 'operator' NOT NULL,
    company_name VARCHAR(128),
    notification_preferences JSONB DEFAULT '{"app":true,"email":true,"whatsapp":true,"telegram":true,"sms":true,"webhook":true}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devices (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'usr_admin',
    user_id VARCHAR(64) DEFAULT 'usr_admin',
    previous_tenant_id VARCHAR(64),
    previous_tenant_name VARCHAR(128),
    ownership_transferred_at TIMESTAMP WITH TIME ZONE,
    name VARCHAR(128) NOT NULL,
    device_type VARCHAR(32) NOT NULL,
    api_key VARCHAR(128) UNIQUE NOT NULL,
    status VARCHAR(32) DEFAULT 'online',
    location VARCHAR(256),
    ip_address VARCHAR(45),
    mac_address VARCHAR(32),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    rate_limit_per_min INT DEFAULT 120,
    encryption_method VARCHAR(64) DEFAULT 'AES-256-GCM',
    metrics JSONB DEFAULT '{}'::jsonb,
    data_flow_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Telemetry Table (Hypertable Base)
CREATE TABLE IF NOT EXISTS telemetry_readings (
    id VARCHAR(128) NOT NULL,
    packet_id VARCHAR(128),
    tenant_id VARCHAR(64) NOT NULL,
    device_id VARCHAR(64),
    device_name VARCHAR(128) NOT NULL,
    metric VARCHAR(64) NOT NULL,
    metric_value DOUBLE PRECISION NOT NULL,
    unit VARCHAR(16) NOT NULL,
    status_level VARCHAR(32) DEFAULT 'normal',
    sequence BIGINT,
    source VARCHAR(32) DEFAULT 'physical',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (id, created_at)
);

-- Ensure tenant_id exists on telemetry_readings
DO $$
BEGIN
    ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) NOT NULL;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'telemetry_readings tenant columns setup notice: %', SQLERRM;
END $$;

-- Ensure Composite Primary Key (id, created_at) on existing telemetry_readings tables for ON CONFLICT support
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

-- Primary composite indexes for multi-tenant and time-series range lookups
CREATE INDEX IF NOT EXISTS idx_telemetry_tenant_device_time ON telemetry_readings(tenant_id, device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_tenant_time ON telemetry_readings(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_device_time ON telemetry_readings(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_metric_time ON telemetry_readings(metric, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_time ON telemetry_readings(created_at DESC);

-- PostgreSQL Row Level Security (RLS)
ALTER TABLE telemetry_readings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
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
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'telemetry_readings RLS notice: %', SQLERRM;
END $$;

-- 4. Convert telemetry_readings into a TimescaleDB Hypertable
-- Partitioned into 7-day chunks by default for optimal memory caching and IO performance
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('telemetry_readings', 'created_at', chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE);
    END IF;
END $$;

-- 5. TimescaleDB Columnar Compression Policy
-- Segments data by device_id and metric, compressed order by created_at DESC (up to 92% disk space reduction)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        ALTER TABLE telemetry_readings SET (
            timescaledb.compress,
            timescaledb.compress_segmentby = 'device_id, metric',
            timescaledb.compress_orderby = 'created_at DESC'
        );
        PERFORM add_compression_policy('telemetry_readings', INTERVAL '14 days', if_not_exists => TRUE);
    END IF;
END $$;

-- 6. TimescaleDB Continuous Aggregates (Materialized Real-Time Views)
-- Hourly Downsampling Summary
CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_hourly_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', created_at) AS bucket,
    device_id,
    metric,
    min(metric_value) AS min_val,
    max(metric_value) AS max_val,
    avg(metric_value) AS avg_val,
    count(*) AS reading_count
FROM telemetry_readings
GROUP BY bucket, device_id, metric
WITH NO DATA;

-- Daily Downsampling Summary
CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_daily_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', created_at) AS bucket,
    device_id,
    metric,
    min(metric_value) AS min_val,
    max(metric_value) AS max_val,
    avg(metric_value) AS avg_val,
    count(*) AS reading_count
FROM telemetry_readings
GROUP BY bucket, device_id, metric
WITH NO DATA;

-- 7. Continuous Aggregate Refresh Policies
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
    END IF;
END $$;

-- 8. Data Retention Policies (Tiered Storage Architecture)
-- Tier 2: Purging of raw telemetry older than 365 days (1 year)
-- Tier 3: Retention of continuous aggregates (2 years hourly, 5 years daily)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM add_retention_policy('telemetry_readings', INTERVAL '365 days', if_not_exists => TRUE);
        PERFORM add_retention_policy('telemetry_hourly_summary', INTERVAL '730 days', if_not_exists => TRUE);
        PERFORM add_retention_policy('telemetry_daily_summary', INTERVAL '1825 days', if_not_exists => TRUE);
    END IF;
END $$;

-- 9. Active Alarms & State Tracking Table
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

-- 10. Dashboard Layouts & Widgets
CREATE TABLE IF NOT EXISTS dashboard_layouts (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(128) NOT NULL,
    widgets_json JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Threshold Rules
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

-- 12. Notifications
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

-- 13. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    user_name VARCHAR(128),
    action VARCHAR(256) NOT NULL,
    ip_address VARCHAR(45),
    severity VARCHAR(32) DEFAULT 'low',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 14. Dispatch Logs
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
