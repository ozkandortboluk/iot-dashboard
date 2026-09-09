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
    status VARCHAR(32) DEFAULT 'active',
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ensure users columns exist on existing databases
DO $$
BEGIN
    ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'active';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_email VARCHAR(128);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(32);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(64);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name VARCHAR(128);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"app":true,"email":true,"whatsapp":true,"telegram":true,"sms":true,"webhook":true}'::jsonb;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'users table alter notice: %', SQLERRM;
END $$;

-- 2b. Canonical Root System Administrator & Fallback Tenant (usr_admin)
INSERT INTO users (id, name, email, password_hash, role, company_name, status, created_at)
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
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS devices (
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
);

-- Ensure columns exist for existing databases & establish canonical foreign keys
DO $$
BEGIN
    ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_user_id_fkey;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'usr_admin';
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS user_id VARCHAR(64) DEFAULT 'usr_admin';
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS previous_tenant_id VARCHAR(64);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS previous_tenant_name VARCHAR(128);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS ownership_transferred_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS role_key VARCHAR(64);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS hardware_model VARCHAR(64);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS firmware_version VARCHAR(32);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_prefix VARCHAR(32);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_hash VARCHAR(128);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN DEFAULT FALSE;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS save_simulated_data_to_db BOOLEAN DEFAULT FALSE;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS simulated_metrics JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_status VARCHAR(32) DEFAULT 'IDLE';
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_target_firmware_id VARCHAR(64);
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_progress INT DEFAULT 0;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_error_message TEXT;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_last_check_at TIMESTAMP WITH TIME ZONE;
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
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_expires_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_revoked BOOLEAN DEFAULT FALSE;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_last_used_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_scopes JSONB DEFAULT '["all"]'::jsonb;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_rotated_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS previous_api_key_hash VARCHAR(128);

    -- Canonical data cleanup: resolve any null or orphaned references to usr_admin
    UPDATE devices SET tenant_id = 'usr_admin' WHERE tenant_id IS NULL OR tenant_id = '';
    UPDATE devices SET user_id = tenant_id WHERE user_id IS NULL OR user_id = '';
    UPDATE devices SET tenant_id = 'usr_admin' WHERE tenant_id NOT IN (SELECT id FROM users);
    UPDATE devices SET user_id = tenant_id WHERE user_id NOT IN (SELECT id FROM users);

    -- Enforce foreign keys with ON UPDATE CASCADE ON DELETE SET DEFAULT
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
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'devices table alter notice: %', SQLERRM;
END $$;

-- 2c. Device WebSocket Messages Deduplication Table (Multi-instance atomic idempotency)
CREATE TABLE IF NOT EXISTS device_ws_messages_dedup (
    device_id VARCHAR(64) NOT NULL,
    message_id VARCHAR(128) NOT NULL,
    message_type VARCHAR(32) NOT NULL,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (device_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_device_ws_dedup_expires ON device_ws_messages_dedup(expires_at);

-- 3a. Telemetry Packets Table (Packet-Level Sequence Deduplication Table)
CREATE TABLE IF NOT EXISTS telemetry_packets (
    id VARCHAR(128) PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL,
    boot_id VARCHAR(64) DEFAULT 'default' NOT NULL,
    sequence BIGINT NOT NULL,
    metric_count INT DEFAULT 0,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unq_telemetry_device_boot_sequence UNIQUE(device_id, boot_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_packets_dev_seq ON telemetry_packets(device_id, sequence);

-- Ensure telemetry hypertables and deduplication tables do not have foreign key constraints to devices
-- (Prevents hypertable chunk deadlocks and foreign key violation errors on high-throughput time-series ingestion)
DO $$
BEGIN
    ALTER TABLE telemetry_packets DROP CONSTRAINT IF EXISTS unq_telemetry_device_sequence CASCADE;
    ALTER TABLE telemetry_readings DROP CONSTRAINT IF EXISTS telemetry_readings_device_id_fkey CASCADE;
    ALTER TABLE simulation_telemetry_readings DROP CONSTRAINT IF EXISTS simulation_telemetry_readings_device_id_fkey CASCADE;
    ALTER TABLE telemetry_packets DROP CONSTRAINT IF EXISTS telemetry_packets_device_id_fkey CASCADE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'telemetry foreign key cleanup notice: %', SQLERRM;
END $$;

-- 3b. Physical Telemetry Table (TimescaleDB Hypertable Base with Composite Primary Key for Deduplication & Partitioning)
CREATE TABLE IF NOT EXISTS telemetry_readings (
    id VARCHAR(128) NOT NULL,
    packet_id VARCHAR(128),
    tenant_id VARCHAR(64) NOT NULL,
    customer_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    device_id VARCHAR(64),
    device_name VARCHAR(128) NOT NULL,
    metric VARCHAR(64) NOT NULL,
    metric_value DOUBLE PRECISION NOT NULL,
    unit VARCHAR(16) NOT NULL,
    status_level VARCHAR(32) DEFAULT 'normal',
    sequence BIGINT,
    source VARCHAR(32) DEFAULT 'physical',
    environment VARCHAR(32) DEFAULT 'production',
    simulation_run_id VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (id, created_at)
);

-- Ensure tenant_id, customer_id, user_id, packet_id, sequence, source, environment and simulation_run_id columns exist on telemetry_readings
DO $$
BEGIN
    ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);
    ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS customer_id VARCHAR(64);
    ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);
    ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS packet_id VARCHAR(128);
    ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS sequence BIGINT;
    ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS source VARCHAR(32) DEFAULT 'physical';
    ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS environment VARCHAR(32) DEFAULT 'production';
    ALTER TABLE telemetry_readings ADD COLUMN IF NOT EXISTS simulation_run_id VARCHAR(128);
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'telemetry_readings columns setup notice: %', SQLERRM;
END $$;

-- Drop invalid hypertable unique index if previously created
DROP INDEX IF EXISTS idx_telemetry_device_seq_metric;

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

-- Backfill tenant_id and customer_id from devices table if available
DO $$
BEGIN
    UPDATE telemetry_readings t
    SET tenant_id = COALESCE(d.user_id, ''),
        customer_id = COALESCE(d.user_id, ''),
        user_id = COALESCE(d.user_id, '')
    FROM devices d
    WHERE t.device_id = d.id AND (t.tenant_id IS NULL OR t.tenant_id = '');
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'telemetry_readings backfill notice: %', SQLERRM;
END $$;

-- Tenant and Device Composite Indexes for High Performance Time-Series Lookups
CREATE INDEX IF NOT EXISTS idx_telemetry_tenant_device_time ON telemetry_readings(tenant_id, device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_customer_device_time ON telemetry_readings(customer_id, device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_tenant_time ON telemetry_readings(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_customer_time ON telemetry_readings(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_device_time ON telemetry_readings(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_metric_time ON telemetry_readings(metric, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_time ON telemetry_readings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_packet ON telemetry_readings(packet_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_source_env ON telemetry_readings(source, environment);

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

-- PostgreSQL Row Level Security (RLS) for telemetry_readings
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
        RAISE NOTICE 'telemetry_readings RLS policy notice: %', SQLERRM;
END $$;

-- 3c. Simulation / Virtual Sandbox Telemetry Table (Completely Isolated Hypertable)
CREATE TABLE IF NOT EXISTS simulation_telemetry_readings (
    id VARCHAR(128) NOT NULL,
    packet_id VARCHAR(128),
    tenant_id VARCHAR(64) NOT NULL,
    customer_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    device_id VARCHAR(64),
    device_name VARCHAR(128) NOT NULL,
    metric VARCHAR(64) NOT NULL,
    metric_value DOUBLE PRECISION NOT NULL,
    unit VARCHAR(16) NOT NULL,
    status_level VARCHAR(32) DEFAULT 'normal',
    sequence BIGINT,
    source VARCHAR(32) DEFAULT 'simulator',
    environment VARCHAR(32) DEFAULT 'sandbox',
    simulation_run_id VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (id, created_at)
);

DO $$
BEGIN
    ALTER TABLE simulation_telemetry_readings ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) NOT NULL;
    ALTER TABLE simulation_telemetry_readings ADD COLUMN IF NOT EXISTS customer_id VARCHAR(64) NOT NULL;
    ALTER TABLE simulation_telemetry_readings ADD COLUMN IF NOT EXISTS user_id VARCHAR(64) NOT NULL;
    ALTER TABLE simulation_telemetry_readings ADD COLUMN IF NOT EXISTS packet_id VARCHAR(128);
    ALTER TABLE simulation_telemetry_readings ADD COLUMN IF NOT EXISTS sequence BIGINT;
    ALTER TABLE simulation_telemetry_readings ADD COLUMN IF NOT EXISTS source VARCHAR(32) DEFAULT 'simulator';
    ALTER TABLE simulation_telemetry_readings ADD COLUMN IF NOT EXISTS environment VARCHAR(32) DEFAULT 'sandbox';
    ALTER TABLE simulation_telemetry_readings ADD COLUMN IF NOT EXISTS simulation_run_id VARCHAR(128);
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'simulation_telemetry_readings columns setup notice: %', SQLERRM;
END $$;

-- Backfill simulation tenant_id
DO $$
BEGIN
    UPDATE simulation_telemetry_readings s
    SET tenant_id = COALESCE(d.user_id, ''),
        customer_id = COALESCE(d.user_id, ''),
        user_id = COALESCE(d.user_id, '')
    FROM devices d
    WHERE s.device_id = d.id AND (s.tenant_id IS NULL OR s.tenant_id = '');
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'simulation_telemetry_readings backfill notice: %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS idx_sim_telemetry_tenant_device_time ON simulation_telemetry_readings(tenant_id, device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sim_telemetry_customer_device_time ON simulation_telemetry_readings(customer_id, device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sim_telemetry_tenant_time ON simulation_telemetry_readings(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sim_telemetry_customer_time ON simulation_telemetry_readings(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sim_telemetry_device_time ON simulation_telemetry_readings(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sim_telemetry_metric_time ON simulation_telemetry_readings(metric, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sim_telemetry_time ON simulation_telemetry_readings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sim_telemetry_run ON simulation_telemetry_readings(simulation_run_id);
CREATE INDEX IF NOT EXISTS idx_sim_telemetry_packet ON simulation_telemetry_readings(packet_id);

-- Convert Simulation Table to Hypertable (TimescaleDB)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('simulation_telemetry_readings', 'created_at', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
    END IF;
END $$;

-- Enable TimescaleDB Columnar Compression Policy for Simulation
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        ALTER TABLE simulation_telemetry_readings SET (
            timescaledb.compress,
            timescaledb.compress_segmentby = 'device_id, metric',
            timescaledb.compress_orderby = 'created_at DESC'
        );
        PERFORM add_compression_policy('simulation_telemetry_readings', INTERVAL '3 days', if_not_exists => TRUE);
        PERFORM add_retention_policy('simulation_telemetry_readings', INTERVAL '7 days', if_not_exists => TRUE);
    END IF;
END $$;

-- PostgreSQL Row Level Security (RLS) for simulation_telemetry_readings
ALTER TABLE simulation_telemetry_readings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
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
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'simulation_telemetry_readings RLS policy notice: %', SQLERRM;
END $$;

-- 4. Continuous Aggregates (Hourly & Daily Materialized Views / Standard Views Fallback - Strictly Physical Telemetry)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        EXECUTE 'CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_hourly_summary WITH (timescaledb.continuous) AS SELECT time_bucket(''1 hour'', created_at) AS bucket, device_id, metric, min(metric_value) AS min_val, max(metric_value) AS max_val, avg(metric_value) AS avg_val, count(*) AS reading_count FROM telemetry_readings WHERE source = ''physical'' OR source IS NULL GROUP BY bucket, device_id, metric WITH NO DATA;';

        EXECUTE 'CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_daily_summary WITH (timescaledb.continuous) AS SELECT time_bucket(''1 day'', created_at) AS bucket, device_id, metric, min(metric_value) AS min_val, max(metric_value) AS max_val, avg(metric_value) AS avg_val, count(*) AS reading_count FROM telemetry_readings WHERE source = ''physical'' OR source IS NULL GROUP BY bucket, device_id, metric WITH NO DATA;';
    ELSE
        EXECUTE 'CREATE OR REPLACE VIEW telemetry_hourly_summary AS SELECT date_trunc(''hour'', created_at) AS bucket, device_id, metric, min(metric_value) AS min_val, max(metric_value) AS max_val, avg(metric_value) AS avg_val, count(*) AS reading_count FROM telemetry_readings WHERE source = ''physical'' OR source IS NULL GROUP BY date_trunc(''hour'', created_at), device_id, metric;';

        EXECUTE 'CREATE OR REPLACE VIEW telemetry_daily_summary AS SELECT date_trunc(''day'', created_at) AS bucket, device_id, metric, min(metric_value) AS min_val, max(metric_value) AS max_val, avg(metric_value) AS avg_val, count(*) AS reading_count FROM telemetry_readings WHERE source = ''physical'' OR source IS NULL GROUP BY date_trunc(''day'', created_at), device_id, metric;';
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
    command_id VARCHAR(64),
    tenant_id VARCHAR(64),
    customer_id VARCHAR(64),
    device_id VARCHAR(64) REFERENCES devices(id) ON DELETE CASCADE,
    user_id VARCHAR(64),
    command_type VARCHAR(64) NOT NULL,
    command_name VARCHAR(64),
    output_id VARCHAR(64),
    value_payload TEXT,
    parameters JSONB DEFAULT '{}'::jsonb,
    source VARCHAR(32) DEFAULT 'manual',
    status VARCHAR(32) DEFAULT 'pending',
    sent_by VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP WITH TIME ZONE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    executed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT
);

ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS command_id VARCHAR(64);
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS customer_id VARCHAR(64);
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS command_type VARCHAR(64);
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS output_id VARCHAR(64);
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS value_payload TEXT;
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS source VARCHAR(32) DEFAULT 'manual';
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS timeout_seconds INT DEFAULT 300;
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS max_retries INT DEFAULT 3;
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS applied_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_device_commands_device_time ON device_commands(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_commands_tenant_time ON device_commands(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_commands_customer_time ON device_commands(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_commands_status ON device_commands(status);
CREATE INDEX IF NOT EXISTS idx_device_commands_idempotency ON device_commands(idempotency_key);

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
ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

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
ALTER TABLE devices ADD COLUMN IF NOT EXISTS role_key VARCHAR(64);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS hardware_model VARCHAR(64);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS firmware_version VARCHAR(32);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_status VARCHAR(32) DEFAULT 'IDLE';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_target_firmware_id VARCHAR(64);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_progress INT DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_error_message TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_last_check_at TIMESTAMP WITH TIME ZONE;

-- 6. Firmware Binaries & Multi-Version OTA Repository
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

ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS signature TEXT;
ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS file_path TEXT;

CREATE INDEX IF NOT EXISTS idx_firmwares_type_role ON firmwares(device_type, role_key);

-- 7. OTA Deployment Jobs Tracking
CREATE TABLE IF NOT EXISTS ota_deployment_jobs (
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
);

ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS download_token VARCHAR(128);
ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS attempt_count INT DEFAULT 0;
ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS max_attempts INT DEFAULT 3;
ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS download_started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS boot_confirmed_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_ota_jobs_device ON ota_deployment_jobs(device_id);
CREATE INDEX IF NOT EXISTS idx_ota_jobs_status ON ota_deployment_jobs(status);

ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

`;


