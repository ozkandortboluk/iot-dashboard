/**
 * ============================================================================
 * NexusNode IoT - Canonical Database Schema (Single Source of Truth)
 * ============================================================================
 * Authoritative, declarative blueprint representing the complete relational &
 * time-series database tree for PostgreSQL and TimescaleDB.
 *
 * This file governs:
 *   - Tables (16 Core Relational & Time-Series Entities)
 *   - Columns (Types, Nullability, Defaults, Foreign Keys, Unique Constraints)
 *   - Primary Keys & Composite Indexes
 *   - Stored Functions & Procedural Triggers
 *   - TimescaleDB Hypertables, Chunk Intervals, Compression & Retention Policies
 *   - Continuous Aggregates (Hourly & Daily Materialized Views)
 *   - Analytical Views & Health Dashboards
 *   - Multi-Tenant Row-Level Security (RLS) Policies
 * ============================================================================
 */

export interface ColumnDefinition {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  primaryKey?: boolean;
  unique?: boolean;
  references?: {
    table: string;
    column: string;
    onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
    onUpdate?: 'CASCADE' | 'RESTRICT' | 'NO ACTION';
  };
  check?: string;
  comment?: string;
}

export interface IndexDefinition {
  name: string;
  columns: string[];
  unique?: boolean;
  where?: string;
  type?: 'BTREE' | 'GIN' | 'BRIN' | 'HASH';
}

export interface TriggerDefinition {
  name: string;
  timing: 'BEFORE' | 'AFTER' | 'INSTEAD OF';
  events: ('INSERT' | 'UPDATE' | 'DELETE')[];
  level: 'ROW' | 'STATEMENT';
  functionName: string;
}

export interface ForeignKeyDefinition {
  name: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
  onUpdate?: 'CASCADE' | 'RESTRICT' | 'NO ACTION';
}

export interface CheckConstraintDefinition {
  name: string;
  condition: string;
}

export interface UniqueConstraintDefinition {
  name: string;
  columns: string[];
}

export interface TableDefinition {
  name: string;
  description: string;
  primaryKey: string[];
  columns: ColumnDefinition[];
  indexes: IndexDefinition[];
  triggers?: TriggerDefinition[];
  uniqueConstraints?: UniqueConstraintDefinition[];
  checkConstraints?: CheckConstraintDefinition[];
  foreignKeys?: ForeignKeyDefinition[];
  rlsEnabled?: boolean;
  rlsPolicies?: {
    name: string;
    for: 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
    using: string;
    withCheck?: string;
  }[];
  timescaleHypertable?: {
    timeColumn: string;
    chunkInterval: string;
    compression?: {
      enabled: boolean;
      segmentBy: string[];
      orderBy: string;
      compressAfter: string;
    };
    retention?: {
      enabled: boolean;
      dropAfter: string;
    };
  };
}

export interface FunctionDefinition {
  name: string;
  returns: string;
  language: string;
  body: string;
  description: string;
}

export interface ViewDefinition {
  name: string;
  isMaterialized?: boolean;
  isContinuousAggregate?: boolean;
  query: string;
  fallbackQuery?: string;
  description: string;
  refreshPolicy?: {
    startOffset: string;
    endOffset: string;
    scheduleInterval: string;
  };
  retentionPolicy?: {
    dropAfter: string;
  };
}

export interface CanonicalSchemaContract {
  version: string;
  engine: string;
  extensions: string[];
  tables: Record<string, TableDefinition>;
  functions: Record<string, FunctionDefinition>;
  views: Record<string, ViewDefinition>;
}

/**
 * Declarative Metadata Object: The Master Single Source of Truth
 */
export const CANONICAL_SCHEMA_METADATA: CanonicalSchemaContract = {
  version: '1.18.0',
  engine: 'PostgreSQL 14+ with TimescaleDB Extension',
  extensions: ['timescaledb', 'pgcrypto', 'uuid-ossp'],
  
  functions: {
    fn_update_updated_at_timestamp: {
      name: 'fn_update_updated_at_timestamp',
      returns: 'TRIGGER',
      language: 'plpgsql',
      description: 'Automatically updates updated_at column to CURRENT_TIMESTAMP on row update',
      body: `
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
      `.trim()
    },
    fn_cleanup_expired_records: {
      name: 'fn_cleanup_expired_records',
      returns: 'VOID',
      language: 'plpgsql',
      description: 'Maintenance job removing expired deduplication hashes and invalidated sessions',
      body: `
BEGIN
    DELETE FROM device_ws_messages_dedup WHERE expires_at < CURRENT_TIMESTAMP;
    DELETE FROM user_sessions WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP;
END;
      `.trim()
    },
    fn_device_last_seen_sync: {
      name: 'fn_device_last_seen_sync',
      returns: 'TRIGGER',
      language: 'plpgsql',
      description: 'Updates device last_seen and online status on telemetry packet arrival',
      body: `
BEGIN
    UPDATE devices 
    SET last_seen = NEW.received_at, 
        status = 'online' 
    WHERE id = NEW.device_id;
    RETURN NEW;
END;
      `.trim()
    }
  },

  views: {
    telemetry_hourly_summary: {
      name: 'telemetry_hourly_summary',
      isMaterialized: true,
      isContinuousAggregate: true,
      description: '1-Hour continuous aggregate rollup for physical telemetry readings (TimescaleDB with standard SQL fallback view)',
      query: `
SELECT 
    time_bucket('1 hour', created_at) AS bucket,
    device_id,
    metric,
    min(metric_value) AS min_val,
    max(metric_value) AS max_val,
    avg(metric_value) AS avg_val,
    count(*) AS reading_count
FROM telemetry_readings
WHERE source = 'physical' OR source IS NULL
GROUP BY bucket, device_id, metric
      `.trim(),
      fallbackQuery: `
SELECT 
    date_trunc('hour', created_at) AS bucket,
    device_id,
    metric,
    min(metric_value) AS min_val,
    max(metric_value) AS max_val,
    avg(metric_value) AS avg_val,
    count(*) AS reading_count
FROM telemetry_readings
WHERE source = 'physical' OR source IS NULL
GROUP BY date_trunc('hour', created_at), device_id, metric
      `.trim(),
      refreshPolicy: {
        startOffset: '30 days',
        endOffset: '1 hour',
        scheduleInterval: '15 minutes'
      },
      retentionPolicy: {
        dropAfter: '730 days' // Tier 3: 2-Year Hourly Rollup Retention
      }
    },
    telemetry_daily_summary: {
      name: 'telemetry_daily_summary',
      isMaterialized: true,
      isContinuousAggregate: true,
      description: '1-Day continuous aggregate rollup for physical telemetry readings (TimescaleDB with standard SQL fallback view)',
      query: `
SELECT 
    time_bucket('1 day', created_at) AS bucket,
    device_id,
    metric,
    min(metric_value) AS min_val,
    max(metric_value) AS max_val,
    avg(metric_value) AS avg_val,
    count(*) AS reading_count
FROM telemetry_readings
WHERE source = 'physical' OR source IS NULL
GROUP BY bucket, device_id, metric
      `.trim(),
      fallbackQuery: `
SELECT 
    date_trunc('day', created_at) AS bucket,
    device_id,
    metric,
    min(metric_value) AS min_val,
    max(metric_value) AS max_val,
    avg(metric_value) AS avg_val,
    count(*) AS reading_count
FROM telemetry_readings
WHERE source = 'physical' OR source IS NULL
GROUP BY date_trunc('day', created_at), device_id, metric
      `.trim(),
      refreshPolicy: {
        startOffset: '365 days',
        endOffset: '1 day',
        scheduleInterval: '1 hour'
      },
      retentionPolicy: {
        dropAfter: '1825 days' // Tier 3: 5-Year Daily Rollup Retention (Architectural 5-Year Target)
      }
    },
    v_active_device_summary: {
      name: 'v_active_device_summary',
      isMaterialized: false,
      isContinuousAggregate: false,
      description: 'Real-time aggregated view of registered devices, telemetry status, active alarms, and ownership metadata',
      query: `
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
) alarm_counts ON d.id = alarm_counts.device_id
      `.trim()
    },
    v_system_health_overview: {
      name: 'v_system_health_overview',
      isMaterialized: false,
      isContinuousAggregate: false,
      description: 'System-wide administrative health overview per tenant',
      query: `
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
GROUP BY u.id, u.name, u.email, u.role, u.company_name, u.status
      `.trim()
    }
  },

  tables: {
    // 1. USERS TABLE
    users: {
      name: 'users',
      description: 'System users, operators, administrators, customer profiles, and notification preferences',
      primaryKey: ['id'],
      uniqueConstraints: [
        { name: 'users_email_key', columns: ['email'] }
      ],
      checkConstraints: [
        { name: 'chk_users_role', condition: "role IN ('admin', 'operator', 'customer', 'viewer')" },
        { name: 'chk_users_status', condition: "status IN ('active', 'suspended', 'pending', 'deleted')" }
      ],
      columns: [
        { name: 'id', type: 'VARCHAR(64)', nullable: false, primaryKey: true },
        { name: 'name', type: 'VARCHAR(128)', nullable: false },
        { name: 'email', type: 'VARCHAR(128)', nullable: false, unique: true },
        { name: 'phone', type: 'VARCHAR(32)', nullable: true },
        { name: 'notification_email', type: 'VARCHAR(128)', nullable: true },
        { name: 'whatsapp_number', type: 'VARCHAR(32)', nullable: true },
        { name: 'telegram_chat_id', type: 'VARCHAR(64)', nullable: true },
        { name: 'password_hash', type: 'VARCHAR(256)', nullable: false },
        { name: 'role', type: 'VARCHAR(32)', nullable: false, defaultValue: "'operator'" },
        { name: 'company_name', type: 'VARCHAR(128)', nullable: true },
        { name: 'notification_preferences', type: 'JSONB', nullable: false, defaultValue: '\'{"app":true,"email":true,"whatsapp":true,"telegram":true,"sms":true,"webhook":true}\'::jsonb' },
        { name: 'status', type: 'VARCHAR(32)', nullable: false, defaultValue: "'active'" },
        { name: 'deleted_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' },
        { name: 'updated_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' }
      ],
      indexes: [
        { name: 'idx_users_email', columns: ['email'], unique: true },
        { name: 'idx_users_role', columns: ['role'] },
        { name: 'idx_users_status', columns: ['status'] }
      ],
      triggers: [
        {
          name: 'trg_users_updated_at',
          timing: 'BEFORE',
          events: ['UPDATE'],
          level: 'ROW',
          functionName: 'fn_update_updated_at_timestamp'
        }
      ]
    },

    // 2. DEVICES TABLE
    devices: {
      name: 'devices',
      description: 'IoT Edge hardware registry, communication configs, authentication tokens, and capability descriptors',
      primaryKey: ['id'],
      foreignKeys: [
        { name: 'fk_devices_user_id', columns: ['user_id'], referencedTable: 'users', referencedColumns: ['id'], onDelete: 'SET NULL' }
      ],
      checkConstraints: [
        { name: 'chk_devices_status', condition: "status IN ('online', 'offline', 'warning', 'error')" },
        { name: 'chk_devices_power_source', condition: "power_source IN ('battery', 'mains', 'unknown')" },
        { name: 'chk_devices_rate_limit', condition: "rate_limit_per_min > 0" },
        { name: 'chk_devices_ota_status', condition: "ota_status IN ('IDLE', 'PENDING', 'DOWNLOADING', 'FLASHING', 'VERIFYING', 'REBOOTING', 'SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED', 'ROLLED_BACK', 'idle', 'pending', 'downloading', 'flashing', 'verifying', 'rebooting', 'success', 'failed', 'cancelled', 'expired', 'rolled_back')" }
      ],
      columns: [
        { name: 'id', type: 'VARCHAR(64)', nullable: false, primaryKey: true },
        { name: 'tenant_id', type: 'VARCHAR(64)', nullable: false, defaultValue: "'usr_admin'" },
        { name: 'user_id', type: 'VARCHAR(64)', nullable: true, defaultValue: "'usr_admin'" },
        { name: 'name', type: 'VARCHAR(128)', nullable: false },
        { name: 'device_type', type: 'VARCHAR(64)', nullable: false, defaultValue: "'custom'" },
        { name: 'role_key', type: 'VARCHAR(64)', nullable: true, defaultValue: "'device'" },
        { name: 'api_key', type: 'VARCHAR(256)', nullable: true },
        { name: 'api_key_prefix', type: 'VARCHAR(32)', nullable: true },
        { name: 'api_key_hash', type: 'VARCHAR(128)', nullable: true },
        { name: 'api_key_expires_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'api_key_revoked', type: 'BOOLEAN', nullable: false, defaultValue: 'FALSE' },
        { name: 'api_key_last_used_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'api_key_scopes', type: 'JSONB', nullable: false, defaultValue: '\'["all"]\'::jsonb' },
        { name: 'api_key_rotated_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'status', type: 'VARCHAR(32)', nullable: false, defaultValue: "'offline'" },
        { name: 'location', type: 'VARCHAR(256)', nullable: true },
        { name: 'ip_address', type: 'VARCHAR(45)', nullable: true },
        { name: 'mac_address', type: 'VARCHAR(32)', nullable: true },
        { name: 'hardware_model', type: 'VARCHAR(64)', nullable: true },
        { name: 'firmware_version', type: 'VARCHAR(32)', nullable: true },
        { name: 'ota_status', type: 'VARCHAR(32)', nullable: false, defaultValue: "'IDLE'" },
        { name: 'ota_target_firmware_id', type: 'VARCHAR(64)', nullable: true },
        { name: 'ota_progress', type: 'INT', nullable: false, defaultValue: '0' },
        { name: 'ota_error_message', type: 'TEXT', nullable: true },
        { name: 'ota_last_check_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'last_seen', type: 'TIMESTAMP WITH TIME ZONE', nullable: true, defaultValue: 'CURRENT_TIMESTAMP' },
        { name: 'rate_limit_per_min', type: 'INT', nullable: false, defaultValue: '120' },
        { name: 'encryption_method', type: 'VARCHAR(64)', nullable: false, defaultValue: "'AES-256-GCM'" },
        { name: 'metrics', type: 'JSONB', nullable: false, defaultValue: "'{}'::jsonb" },
        { name: 'data_flow_active', type: 'BOOLEAN', nullable: false, defaultValue: 'TRUE' },
        { name: 'is_simulated', type: 'BOOLEAN', nullable: false, defaultValue: 'FALSE' },
        { name: 'power_source', type: 'VARCHAR(32)', nullable: false, defaultValue: "'mains'" },
        { name: 'battery_level', type: 'INT', nullable: true },
        { name: 'save_simulated_data_to_db', type: 'BOOLEAN', nullable: false, defaultValue: 'FALSE' },
        { name: 'simulated_metrics', type: 'JSONB', nullable: false, defaultValue: "'[]'::jsonb" },
        { name: 'expected_interval_seconds', type: 'INT', nullable: false, defaultValue: '30' },
        { name: 'auto_detected_interval_seconds', type: 'INT', nullable: false, defaultValue: '30' },
        { name: 'heartbeat_timeout_seconds', type: 'INT', nullable: false, defaultValue: '60' },
        { name: 'interval_mode', type: 'VARCHAR(16)', nullable: false, defaultValue: "'auto'" },
        { name: 'custom_interval_seconds', type: 'INT', nullable: true },
        { name: 'recent_intervals', type: 'JSONB', nullable: false, defaultValue: "'[]'::jsonb" },
        { name: 'websocket_connected', type: 'BOOLEAN', nullable: false, defaultValue: 'FALSE' },
        { name: 'last_message_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'last_telemetry_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'last_heartbeat_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'last_offline_notified_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'output_definitions', type: 'JSONB', nullable: false, defaultValue: "'[]'::jsonb" },
        { name: 'capabilities', type: 'JSONB', nullable: false, defaultValue: "'[]'::jsonb" },
        { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' }
      ],
      indexes: [
        { name: 'idx_devices_tenant_id', columns: ['tenant_id'] },
        { name: 'idx_devices_user_id', columns: ['user_id'] },
        { name: 'idx_devices_status', columns: ['status'] },
        { name: 'idx_devices_api_key_hash', columns: ['api_key_hash'] },
        { name: 'idx_devices_hardware_model', columns: ['hardware_model'] },
        { name: 'idx_devices_role_key', columns: ['role_key'] },
        { name: 'idx_devices_last_seen', columns: ['last_seen DESC'] }
      ],
      rlsEnabled: true,
      rlsPolicies: [
        {
          name: 'rls_devices_tenant',
          for: 'ALL',
          using: "current_setting('app.is_admin', true) = 'true' OR tenant_id = current_setting('app.current_tenant_id', true) OR user_id = current_setting('app.current_user_id', true)",
          withCheck: "current_setting('app.is_admin', true) = 'true' OR tenant_id = current_setting('app.current_tenant_id', true) OR user_id = current_setting('app.current_user_id', true)"
        }
      ]
    },

    // 3. DEVICE WEBSOCKET MESSAGES DEDUPLICATION TABLE
    device_ws_messages_dedup: {
      name: 'device_ws_messages_dedup',
      description: 'Distributed atomic idempotency table for high-frequency WebSocket frames & commands',
      primaryKey: ['device_id', 'message_id'],
      columns: [
        { name: 'device_id', type: 'VARCHAR(64)', nullable: false },
        { name: 'message_id', type: 'VARCHAR(128)', nullable: false },
        { name: 'message_type', type: 'VARCHAR(32)', nullable: false, defaultValue: "'telemetry'" },
        { name: 'received_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' },
        { name: 'expires_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: "(CURRENT_TIMESTAMP + INTERVAL '1 hour')" }
      ],
      indexes: [
        { name: 'idx_device_ws_dedup_expires', columns: ['expires_at'] }
      ]
    },

    // 4. TELEMETRY PACKETS TABLE
    telemetry_packets: {
      name: 'telemetry_packets',
      description: 'Packet-level sequence deduplication store for gapless ingestion tracking',
      primaryKey: ['id'],
      uniqueConstraints: [
        { name: 'unq_telemetry_device_boot_sequence', columns: ['device_id', 'boot_id', 'sequence'] }
      ],
      columns: [
        { name: 'id', type: 'VARCHAR(128)', nullable: false, primaryKey: true },
        { name: 'device_id', type: 'VARCHAR(64)', nullable: false },
        { name: 'boot_id', type: 'VARCHAR(64)', nullable: false, defaultValue: "'default'" },
        { name: 'sequence', type: 'BIGINT', nullable: false },
        { name: 'idempotency_key', type: 'VARCHAR(192)', nullable: true },
        { name: 'metric_count', type: 'INT', nullable: false, defaultValue: '0' },
        { name: 'received_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' }
      ],
      indexes: [
        { name: 'unq_telemetry_device_boot_sequence', columns: ['device_id', 'boot_id', 'sequence'], unique: true },
        { name: 'idx_telemetry_packets_dev_seq', columns: ['device_id', 'sequence'] },
        { name: 'idx_telemetry_packets_received', columns: ['received_at DESC'] }
      ],
      triggers: [
        {
          name: 'trg_telemetry_packet_device_sync',
          timing: 'AFTER',
          events: ['INSERT'],
          level: 'ROW',
          functionName: 'fn_device_last_seen_sync'
        }
      ]
    },

    // 5. PHYSICAL TELEMETRY READINGS TABLE (TimescaleDB Hypertable)
    telemetry_readings: {
      name: 'telemetry_readings',
      description: 'High-throughput time-series sensor telemetry data (partitioned hypertable with columnar compression)',
      primaryKey: ['id', 'created_at'],
      checkConstraints: [
        { name: 'chk_telemetry_source', condition: "source IN ('physical', 'simulator', 'gateway', 'replay')" }
      ],
      columns: [
        { name: 'id', type: 'VARCHAR(128)', nullable: false },
        { name: 'packet_id', type: 'VARCHAR(128)', nullable: true },
        { name: 'tenant_id', type: 'VARCHAR(64)', nullable: false, defaultValue: "'usr_admin'" },
        { name: 'device_id', type: 'VARCHAR(64)', nullable: true },
        { name: 'device_name', type: 'VARCHAR(128)', nullable: false },
        { name: 'metric', type: 'VARCHAR(64)', nullable: false },
        { name: 'metric_value', type: 'DOUBLE PRECISION', nullable: false },
        { name: 'unit', type: 'VARCHAR(16)', nullable: false },
        { name: 'status_level', type: 'VARCHAR(32)', nullable: false, defaultValue: "'normal'" },
        { name: 'sequence', type: 'BIGINT', nullable: true },
        { name: 'source', type: 'VARCHAR(32)', nullable: false, defaultValue: "'physical'" },
        { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' }
      ],
      indexes: [
        { name: 'idx_telemetry_tenant_device_time', columns: ['tenant_id', 'device_id', 'created_at DESC'] },
        { name: 'idx_telemetry_tenant_time', columns: ['tenant_id', 'created_at DESC'] },
        { name: 'idx_telemetry_device_time', columns: ['device_id', 'created_at DESC'] },
        { name: 'idx_telemetry_metric_time', columns: ['metric', 'created_at DESC'] },
        { name: 'idx_telemetry_time', columns: ['created_at DESC'] },
        { name: 'idx_telemetry_packet', columns: ['packet_id'] },
        { name: 'idx_telemetry_source', columns: ['source'] }
      ],
      timescaleHypertable: {
        timeColumn: 'created_at',
        chunkInterval: '7 days',
        compression: {
          enabled: true,
          segmentBy: ['device_id', 'metric'],
          orderBy: 'created_at DESC',
          compressAfter: '14 days'
        },
        retention: {
          enabled: true,
          dropAfter: '365 days'
        }
      },
      rlsEnabled: true,
      rlsPolicies: [
        {
          name: 'rls_telemetry_readings_tenant',
          for: 'ALL',
          using: "current_setting('app.is_admin', true) = 'true' OR tenant_id = current_setting('app.current_tenant_id', true)",
          withCheck: "current_setting('app.is_admin', true) = 'true' OR tenant_id = current_setting('app.current_tenant_id', true)"
        }
      ]
    },

    // 6. SIMULATION TELEMETRY READINGS TABLE (TimescaleDB Hypertable)
    simulation_telemetry_readings: {
      name: 'simulation_telemetry_readings',
      description: 'Isolated sandbox time-series telemetry store for virtual simulations and load-testing',
      primaryKey: ['id', 'created_at'],
      checkConstraints: [
        { name: 'chk_sim_source', condition: "source IN ('simulator', 'sandbox', 'virtual')" }
      ],
      columns: [
        { name: 'id', type: 'VARCHAR(128)', nullable: false },
        { name: 'packet_id', type: 'VARCHAR(128)', nullable: true },
        { name: 'tenant_id', type: 'VARCHAR(64)', nullable: false, defaultValue: "'usr_admin'" },
        { name: 'device_id', type: 'VARCHAR(64)', nullable: true },
        { name: 'device_name', type: 'VARCHAR(128)', nullable: false },
        { name: 'metric', type: 'VARCHAR(64)', nullable: false },
        { name: 'metric_value', type: 'DOUBLE PRECISION', nullable: false },
        { name: 'unit', type: 'VARCHAR(16)', nullable: false },
        { name: 'status_level', type: 'VARCHAR(32)', nullable: false, defaultValue: "'normal'" },
        { name: 'sequence', type: 'BIGINT', nullable: true },
        { name: 'source', type: 'VARCHAR(32)', nullable: false, defaultValue: "'simulator'" },
        { name: 'simulation_run_id', type: 'VARCHAR(128)', nullable: true },
        { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' }
      ],
      indexes: [
        { name: 'idx_sim_telemetry_tenant_device_time', columns: ['tenant_id', 'device_id', 'created_at DESC'] },
        { name: 'idx_sim_telemetry_tenant_time', columns: ['tenant_id', 'created_at DESC'] },
        { name: 'idx_sim_telemetry_device_time', columns: ['device_id', 'created_at DESC'] },
        { name: 'idx_sim_telemetry_metric_time', columns: ['metric', 'created_at DESC'] },
        { name: 'idx_sim_telemetry_time', columns: ['created_at DESC'] },
        { name: 'idx_sim_telemetry_run', columns: ['simulation_run_id'] },
        { name: 'idx_sim_telemetry_packet', columns: ['packet_id'] }
      ],
      timescaleHypertable: {
        timeColumn: 'created_at',
        chunkInterval: '1 day',
        compression: {
          enabled: true,
          segmentBy: ['device_id', 'metric'],
          orderBy: 'created_at DESC',
          compressAfter: '3 days'
        },
        retention: {
          enabled: true,
          dropAfter: '7 days'
        }
      },
      rlsEnabled: true,
      rlsPolicies: [
        {
          name: 'rls_simulation_telemetry_tenant',
          for: 'ALL',
          using: "current_setting('app.is_admin', true) = 'true' OR tenant_id = current_setting('app.current_tenant_id', true)",
          withCheck: "current_setting('app.is_admin', true) = 'true' OR tenant_id = current_setting('app.current_tenant_id', true)"
        }
      ]
    },

    // 7. THRESHOLD RULES TABLE
    threshold_rules: {
      name: 'threshold_rules',
      description: 'Configurable alerting rules, hysteresis bounds, active schedules, and escalation recipients',
      primaryKey: ['id'],
      checkConstraints: [
        { name: 'chk_threshold_rules_operator', condition: "operator IN ('>', '>=', '<', '<=', '==', '!=', 'breach_range', 'out_of_range')" },
        { name: 'chk_threshold_rules_severity', condition: "severity IN ('info', 'low', 'medium', 'warning', 'high', 'critical')" }
      ],
      columns: [
        { name: 'id', type: 'VARCHAR(64)', nullable: false, primaryKey: true },
        { name: 'user_id', type: 'VARCHAR(64)', nullable: true },
        { name: 'tenant_id', type: 'VARCHAR(64)', nullable: false, defaultValue: "'usr_admin'" },
        { name: 'user_name', type: 'VARCHAR(128)', nullable: true },
        { name: 'device_id', type: 'VARCHAR(64)', nullable: false, defaultValue: "'all'" },
        { name: 'metric_key', type: 'VARCHAR(64)', nullable: false },
        { name: 'operator', type: 'VARCHAR(8)', nullable: false },
        { name: 'threshold_value', type: 'DOUBLE PRECISION', nullable: false },
        { name: 'severity', type: 'VARCHAR(32)', nullable: false, defaultValue: "'warning'" },
        { name: 'enabled', type: 'BOOLEAN', nullable: false, defaultValue: 'TRUE' },
        { name: 'message_template', type: 'TEXT', nullable: false },
        { name: 'hysteresis', type: 'DOUBLE PRECISION', nullable: false, defaultValue: '1.0' },
        { name: 'min_breach_duration_sec', type: 'INT', nullable: false, defaultValue: '10' },
        { name: 'repeat_interval_sec', type: 'INT', nullable: false, defaultValue: '300' },
        { name: 'notification_channels', type: 'JSONB', nullable: false, defaultValue: '\'["app","email"]\'::jsonb' },
        { name: 'active_hours', type: 'VARCHAR(64)', nullable: false, defaultValue: "'00:00-23:59'" },
        { name: 'recipients', type: 'JSONB', nullable: false, defaultValue: "'[]'::jsonb" },
        { name: 'silenced_until', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' },
        { name: 'updated_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' }
      ],
      indexes: [
        { name: 'idx_threshold_rules_tenant', columns: ['tenant_id'] },
        { name: 'idx_threshold_rules_user', columns: ['user_id'] },
        { name: 'idx_threshold_rules_device', columns: ['device_id'] },
        { name: 'idx_threshold_rules_metric', columns: ['metric_key'] },
        { name: 'idx_threshold_rules_enabled', columns: ['enabled'] }
      ],
      triggers: [
        {
          name: 'trg_threshold_rules_updated_at',
          timing: 'BEFORE',
          events: ['UPDATE'],
          level: 'ROW',
          functionName: 'fn_update_updated_at_timestamp'
        }
      ]
    },

    // 8. ACTIVE ALARMS TABLE
    active_alarms: {
      name: 'active_alarms',
      description: 'Real-time alert incident lifecycle store (OPEN, ACKNOWLEDGED, SILENCED, RESOLVED)',
      primaryKey: ['id'],
      checkConstraints: [
        { name: 'chk_active_alarms_severity', condition: "severity IN ('info', 'low', 'medium', 'warning', 'high', 'critical')" },
        { name: 'chk_active_alarms_state', condition: "state IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'SILENCED', 'MUTED')" }
      ],
      columns: [
        { name: 'id', type: 'VARCHAR(128)', nullable: false, primaryKey: true },
        { name: 'rule_id', type: 'VARCHAR(64)', nullable: false },
        { name: 'device_id', type: 'VARCHAR(64)', nullable: false },
        { name: 'device_name', type: 'VARCHAR(128)', nullable: false },
        { name: 'user_id', type: 'VARCHAR(64)', nullable: false },
        { name: 'tenant_id', type: 'VARCHAR(64)', nullable: true, defaultValue: "'usr_admin'" },
        { name: 'metric_key', type: 'VARCHAR(64)', nullable: false },
        { name: 'operator', type: 'VARCHAR(32)', nullable: false },
        { name: 'threshold_value', type: 'DOUBLE PRECISION', nullable: false },
        { name: 'current_value', type: 'DOUBLE PRECISION', nullable: false },
        { name: 'severity', type: 'VARCHAR(32)', nullable: false },
        { name: 'state', type: 'VARCHAR(32)', nullable: false },
        { name: 'first_breach_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'triggered_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'last_evaluated_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'last_notified_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'resolved_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'acknowledged', type: 'BOOLEAN', nullable: false, defaultValue: 'FALSE' },
        { name: 'acknowledged_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'acknowledged_by', type: 'VARCHAR(128)', nullable: true },
        { name: 'silenced_until', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'repeat_count', type: 'INT', nullable: false, defaultValue: '0' },
        { name: 'source', type: 'VARCHAR(32)', nullable: false, defaultValue: "'physical'" },
        { name: 'environment', type: 'VARCHAR(32)', nullable: false, defaultValue: "'production'" },
        { name: 'is_simulation', type: 'BOOLEAN', nullable: false, defaultValue: 'FALSE' },
        { name: 'incident_id', type: 'VARCHAR(128)', nullable: true },
        { name: 'message', type: 'TEXT', nullable: false },
        { name: 'note', type: 'TEXT', nullable: true },
        { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' },
        { name: 'updated_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' }
      ],
      indexes: [
        { name: 'idx_active_alarms_device', columns: ['device_id'] },
        { name: 'idx_active_alarms_rule', columns: ['rule_id'] },
        { name: 'idx_active_alarms_state', columns: ['state'] },
        { name: 'idx_active_alarms_tenant', columns: ['tenant_id'] },
        { name: 'idx_active_alarms_user', columns: ['user_id'] },
        { name: 'idx_active_alarms_triggered', columns: ['triggered_at DESC'] }
      ],
      triggers: [
        {
          name: 'trg_active_alarms_updated_at',
          timing: 'BEFORE',
          events: ['UPDATE'],
          level: 'ROW',
          functionName: 'fn_update_updated_at_timestamp'
        }
      ]
    },

    // 9. ALARM EVENTS TABLE (Historical Event Timeline)
    alarm_events: {
      name: 'alarm_events',
      description: 'Historical audit log of all alarm state transitions, breaches, acknowledgments, and resolutions',
      primaryKey: ['id'],
      checkConstraints: [
        { name: 'chk_alarm_events_severity', condition: "severity IN ('info', 'low', 'medium', 'warning', 'high', 'critical')" }
      ],
      columns: [
        { name: 'id', type: 'VARCHAR(64)', nullable: false, primaryKey: true },
        { name: 'alarm_id', type: 'VARCHAR(64)', nullable: false },
        { name: 'rule_id', type: 'VARCHAR(64)', nullable: false },
        { name: 'user_id', type: 'VARCHAR(64)', nullable: true },
        { name: 'tenant_id', type: 'VARCHAR(64)', nullable: true, defaultValue: "'usr_admin'" },
        { name: 'device_id', type: 'VARCHAR(64)', nullable: false },
        { name: 'metric_key', type: 'VARCHAR(64)', nullable: false },
        { name: 'trigger_value', type: 'DOUBLE PRECISION', nullable: false },
        { name: 'threshold_value', type: 'DOUBLE PRECISION', nullable: false },
        { name: 'severity', type: 'VARCHAR(32)', nullable: false },
        { name: 'event_type', type: 'VARCHAR(32)', nullable: false },
        { name: 'timestamp', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' },
        { name: 'note', type: 'TEXT', nullable: true }
      ],
      indexes: [
        { name: 'idx_alarm_events_alarm_id', columns: ['alarm_id'] },
        { name: 'idx_alarm_events_device_id', columns: ['device_id'] },
        { name: 'idx_alarm_events_rule_id', columns: ['rule_id'] },
        { name: 'idx_alarm_events_timestamp', columns: ['timestamp DESC'] }
      ]
    },

    // 10. NOTIFICATIONS TABLE
    notifications: {
      name: 'notifications',
      description: 'Dispatched alert notifications and user activity inbox',
      primaryKey: ['id'],
      checkConstraints: [
        { name: 'chk_notifications_severity', condition: "severity IN ('info', 'low', 'medium', 'warning', 'high', 'critical')" }
      ],
      columns: [
        { name: 'id', type: 'VARCHAR(64)', nullable: false, primaryKey: true },
        { name: 'user_id', type: 'VARCHAR(64)', nullable: true },
        { name: 'tenant_id', type: 'VARCHAR(64)', nullable: false, defaultValue: "'usr_admin'" },
        { name: 'title', type: 'VARCHAR(256)', nullable: false },
        { name: 'message', type: 'TEXT', nullable: false },
        { name: 'severity', type: 'VARCHAR(32)', nullable: false, defaultValue: "'info'" },
        { name: 'type', type: 'VARCHAR(64)', nullable: true, defaultValue: "'alert'" },
        { name: 'source', type: 'VARCHAR(32)', nullable: true, defaultValue: "'system'" },
        { name: 'device_id', type: 'VARCHAR(64)', nullable: true },
        { name: 'device_name', type: 'VARCHAR(128)', nullable: true },
        { name: 'is_read', type: 'BOOLEAN', nullable: false, defaultValue: 'FALSE' },
        { name: 'read', type: 'BOOLEAN', nullable: true, defaultValue: 'FALSE' },
        { name: 'alarm_id', type: 'VARCHAR(128)', nullable: true },
        { name: 'rule_id', type: 'VARCHAR(64)', nullable: true },
        { name: 'alarm_state', type: 'VARCHAR(32)', nullable: true },
        { name: 'acknowledged', type: 'BOOLEAN', nullable: false, defaultValue: 'FALSE' },
        { name: 'acknowledged_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'acknowledged_by', type: 'VARCHAR(128)', nullable: true },
        { name: 'repeat_count', type: 'INT', nullable: false, defaultValue: '0' },
        { name: 'current_value', type: 'DOUBLE PRECISION', nullable: true },
        { name: 'threshold_value', type: 'DOUBLE PRECISION', nullable: true },
        { name: 'event_key', type: 'VARCHAR(256)', nullable: true },
        { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' },
        { name: 'updated_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' }
      ],
      indexes: [
        { name: 'idx_notifications_user', columns: ['user_id'] },
        { name: 'idx_notifications_tenant', columns: ['tenant_id'] },
        { name: 'idx_notifications_device', columns: ['device_id'] },
        { name: 'idx_notifications_read', columns: ['is_read'] },
        { name: 'idx_notifications_event_key', columns: ['event_key'], unique: true, where: 'event_key IS NOT NULL' },
        { name: 'idx_notifications_created', columns: ['created_at DESC'] }
      ]
    },

    // 11. AUDIT LOGS TABLE
    audit_logs: {
      name: 'audit_logs',
      description: 'Enterprise immutable system security and user operational audit trail',
      primaryKey: ['id'],
      columns: [
        { name: 'id', type: 'VARCHAR(64)', nullable: false, primaryKey: true },
        { name: 'user_id', type: 'VARCHAR(64)', nullable: true },
        { name: 'tenant_id', type: 'VARCHAR(64)', nullable: true, defaultValue: "'usr_admin'" },
        { name: 'user_name', type: 'VARCHAR(128)', nullable: true },
        { name: 'action', type: 'VARCHAR(256)', nullable: false },
        { name: 'resource_type', type: 'VARCHAR(128)', nullable: true, defaultValue: "'system'" },
        { name: 'resource_id', type: 'VARCHAR(128)', nullable: true },
        { name: 'details', type: 'JSONB', nullable: true },
        { name: 'ip_address', type: 'VARCHAR(45)', nullable: true },
        { name: 'severity', type: 'VARCHAR(32)', nullable: false, defaultValue: "'low'" },
        { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' }
      ],
      indexes: [
        { name: 'idx_audit_logs_user', columns: ['user_id'] },
        { name: 'idx_audit_logs_tenant', columns: ['tenant_id'] },
        { name: 'idx_audit_logs_action', columns: ['action'] },
        { name: 'idx_audit_logs_created', columns: ['created_at DESC'] }
      ]
    },

    // 12. SYSTEM EVENTS TABLE
    system_events: {
      name: 'system_events',
      description: 'Operational system events, hardware health notices, network socket connectivity changes',
      primaryKey: ['id'],
      columns: [
        { name: 'id', type: 'VARCHAR(64)', nullable: false, primaryKey: true },
        { name: 'event_type', type: 'VARCHAR(64)', nullable: false },
        { name: 'source', type: 'VARCHAR(64)', nullable: false },
        { name: 'severity', type: 'VARCHAR(32)', nullable: false, defaultValue: "'info'" },
        { name: 'payload', type: 'JSONB', nullable: true },
        { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' }
      ],
      indexes: [
        { name: 'idx_system_events_type', columns: ['event_type'] },
        { name: 'idx_system_events_created_at', columns: ['created_at DESC'] }
      ]
    },

    // 13. DEVICE COMMANDS TABLE
    device_commands: {
      name: 'device_commands',
      description: 'Asynchronous and synchronous downlink IoT actuator/relay control queue',
      primaryKey: ['id'],
      foreignKeys: [
        { name: 'fk_device_commands_device_id', columns: ['device_id'], referencedTable: 'devices', referencedColumns: ['id'], onDelete: 'CASCADE' }
      ],
      checkConstraints: [
        { name: 'chk_device_commands_status', condition: "status IN ('QUEUED', 'PENDING', 'SENT', 'DELIVERED', 'EXECUTED', 'APPLIED', 'FAILED', 'TIMEOUT', 'CANCELLED', 'REJECTED', 'pending', 'sent', 'delivered', 'executed', 'failed')" }
      ],
      columns: [
        { name: 'id', type: 'VARCHAR(64)', nullable: false, primaryKey: true },
        { name: 'command_id', type: 'VARCHAR(64)', nullable: true },
        { name: 'tenant_id', type: 'VARCHAR(64)', nullable: true },
        { name: 'customer_id', type: 'VARCHAR(64)', nullable: true },
        { name: 'device_id', type: 'VARCHAR(64)', nullable: true, references: { table: 'devices', column: 'id', onDelete: 'CASCADE' } },
        { name: 'user_id', type: 'VARCHAR(64)', nullable: true },
        { name: 'command_type', type: 'VARCHAR(64)', nullable: false },
        { name: 'command_name', type: 'VARCHAR(64)', nullable: true },
        { name: 'output_id', type: 'VARCHAR(64)', nullable: true },
        { name: 'value_payload', type: 'TEXT', nullable: true },
        { name: 'parameters', type: 'JSONB', nullable: false, defaultValue: "'{}'::jsonb" },
        { name: 'source', type: 'VARCHAR(32)', nullable: false, defaultValue: "'manual'" },
        { name: 'status', type: 'VARCHAR(32)', nullable: false, defaultValue: "'pending'" },
        { name: 'sent_by', type: 'VARCHAR(64)', nullable: true },
        { name: 'idempotency_key', type: 'VARCHAR(128)', nullable: true },
        { name: 'timeout_seconds', type: 'INT', nullable: false, defaultValue: '300' },
        { name: 'retry_count', type: 'INT', nullable: false, defaultValue: '0' },
        { name: 'max_retries', type: 'INT', nullable: false, defaultValue: '3' },
        { name: 'sent_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'acknowledged_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'executed_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'applied_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'error_message', type: 'TEXT', nullable: true },
        { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' }
      ],
      indexes: [
        { name: 'idx_device_commands_device_time', columns: ['device_id', 'created_at DESC'] },
        { name: 'idx_device_commands_tenant_time', columns: ['tenant_id', 'created_at DESC'] },
        { name: 'idx_device_commands_customer_time', columns: ['customer_id', 'created_at DESC'] },
        { name: 'idx_device_commands_status', columns: ['status'] },
        { name: 'idx_device_commands_idempotency', columns: ['idempotency_key'] }
      ]
    },

    // 12. DISPATCH LOGS TABLE
    dispatch_logs: {
      name: 'dispatch_logs',
      description: 'Multichannel webhook/email/SMS/WhatsApp/Telegram notification delivery logs and telemetry',
      primaryKey: ['id'],
      columns: [
        { name: 'id', type: 'VARCHAR(64)', nullable: false, primaryKey: true },
        { name: 'tenant_id', type: 'VARCHAR(64)', nullable: true },
        { name: 'user_id', type: 'VARCHAR(64)', nullable: true },
        { name: 'user_name', type: 'VARCHAR(128)', nullable: true },
        { name: 'channel', type: 'VARCHAR(32)', nullable: false },
        { name: 'recipient', type: 'VARCHAR(128)', nullable: false },
        { name: 'title', type: 'VARCHAR(256)', nullable: true },
        { name: 'message', type: 'TEXT', nullable: false },
        { name: 'severity', type: 'VARCHAR(32)', nullable: false, defaultValue: "'info'" },
        { name: 'status', type: 'VARCHAR(32)', nullable: false, defaultValue: "'delivered'" },
        { name: 'latency_ms', type: 'INT', nullable: false, defaultValue: '0' },
        { name: 'error_details', type: 'TEXT', nullable: true },
        { name: 'sent_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' }
      ],
      indexes: [
        { name: 'idx_dispatch_logs_channel', columns: ['channel'] },
        { name: 'idx_dispatch_logs_status', columns: ['status'] },
        { name: 'idx_dispatch_logs_sent_at', columns: ['sent_at DESC'] }
      ]
    },

    // 13. USER SESSIONS TABLE
    user_sessions: {
      name: 'user_sessions',
      description: 'Web & API authentication session tokens stored securely via SHA-256 token hashing',
      primaryKey: ['id'],
      foreignKeys: [
        { name: 'fk_user_sessions_user_id', columns: ['user_id'], referencedTable: 'users', referencedColumns: ['id'], onDelete: 'CASCADE' }
      ],
      columns: [
        { name: 'id', type: 'VARCHAR(64)', nullable: false, primaryKey: true },
        { name: 'token_hash', type: 'VARCHAR(128)', nullable: true },
        { name: 'token_prefix', type: 'VARCHAR(32)', nullable: true },
        { name: 'token', type: 'VARCHAR(128)', nullable: true },
        { name: 'user_id', type: 'VARCHAR(64)', nullable: true },
        { name: 'user_role', type: 'VARCHAR(32)', nullable: true, defaultValue: "'operator'" },
        { name: 'user_email', type: 'VARCHAR(128)', nullable: true },
        { name: 'user_name', type: 'VARCHAR(128)', nullable: true },
        { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' },
        { name: 'expires_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: "(CURRENT_TIMESTAMP + INTERVAL '7 days')" }
      ],
      indexes: [
        { name: 'idx_user_sessions_token_hash', columns: ['token_hash'] },
        { name: 'idx_user_sessions_user_id', columns: ['user_id'] },
        { name: 'idx_user_sessions_expires_at', columns: ['expires_at'] }
      ]
    },

    // 14. DASHBOARD LAYOUTS TABLE
    dashboard_layouts: {
      name: 'dashboard_layouts',
      description: 'User-customized dashboard widget placements, metrics, and visual card configurations',
      primaryKey: ['id'],
      foreignKeys: [
        { name: 'fk_dashboard_layouts_user_id', columns: ['user_id'], referencedTable: 'users', referencedColumns: ['id'], onDelete: 'CASCADE' }
      ],
      columns: [
        { name: 'id', type: 'VARCHAR(64)', nullable: false, primaryKey: true },
        { name: 'user_id', type: 'VARCHAR(64)', nullable: true },
        { name: 'title', type: 'VARCHAR(128)', nullable: false },
        { name: 'widgets_json', type: 'JSONB', nullable: false },
        { name: 'updated_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' }
      ],
      indexes: [
        { name: 'idx_dashboard_layouts_user', columns: ['user_id'] }
      ],
      triggers: [
        {
          name: 'trg_dashboard_layouts_updated_at',
          timing: 'BEFORE',
          events: ['UPDATE'],
          level: 'ROW',
          functionName: 'fn_update_updated_at_timestamp'
        }
      ]
    },

    // 15. FIRMWARES TABLE (OTA Binaries)
    firmwares: {
      name: 'firmwares',
      description: 'Firmware binary repository with cryptographic SHA-256 validation and hardware targeting',
      primaryKey: ['id'],
      columns: [
        { name: 'id', type: 'VARCHAR(64)', nullable: false, primaryKey: true },
        { name: 'name', type: 'VARCHAR(128)', nullable: false },
        { name: 'device_type', type: 'VARCHAR(64)', nullable: false },
        { name: 'role_key', type: 'VARCHAR(64)', nullable: false },
        { name: 'hardware_model', type: 'VARCHAR(64)', nullable: false, defaultValue: "'ALL'" },
        { name: 'version', type: 'VARCHAR(32)', nullable: false },
        { name: 'description', type: 'TEXT', nullable: true },
        { name: 'binary_data', type: 'TEXT', nullable: true },
        { name: 'binary_size', type: 'INT', nullable: false, defaultValue: '0' },
        { name: 'sha256', type: 'VARCHAR(128)', nullable: false },
        { name: 'signature', type: 'TEXT', nullable: true },
        { name: 'file_path', type: 'TEXT', nullable: true },
        { name: 'min_hardware_revision', type: 'VARCHAR(64)', nullable: true },
        { name: 'is_active', type: 'BOOLEAN', nullable: false, defaultValue: 'TRUE' },
        { name: 'uploaded_by', type: 'VARCHAR(128)', nullable: false },
        { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' },
        { name: 'updated_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' }
      ],
      indexes: [
        { name: 'idx_firmwares_type_role', columns: ['device_type', 'role_key'] },
        { name: 'idx_firmwares_version', columns: ['version'] },
        { name: 'idx_firmwares_sha256', columns: ['sha256'] }
      ],
      triggers: [
        {
          name: 'trg_firmwares_updated_at',
          timing: 'BEFORE',
          events: ['UPDATE'],
          level: 'ROW',
          functionName: 'fn_update_updated_at_timestamp'
        }
      ]
    },

    // 16. OTA DEPLOYMENT JOBS TABLE
    ota_deployment_jobs: {
      name: 'ota_deployment_jobs',
      description: 'Over-The-Air firmware deployment campaign execution, progress tracking, and retry state machine',
      primaryKey: ['id'],
      foreignKeys: [
        { name: 'fk_ota_jobs_firmware_id', columns: ['firmware_id'], referencedTable: 'firmwares', referencedColumns: ['id'], onDelete: 'SET NULL' },
        { name: 'fk_ota_jobs_device_id', columns: ['device_id'], referencedTable: 'devices', referencedColumns: ['id'], onDelete: 'SET NULL' }
      ],
      checkConstraints: [
        { name: 'chk_ota_jobs_status', condition: "status IN ('PENDING', 'DOWNLOADING', 'FLASHING', 'CONFIRMING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT', 'pending', 'downloading', 'flashing', 'confirming', 'completed', 'failed', 'cancelled', 'timeout')" }
      ],
      columns: [
        { name: 'id', type: 'VARCHAR(64)', nullable: false, primaryKey: true },
        { name: 'firmware_id', type: 'VARCHAR(64)', nullable: true },
        { name: 'firmware_version', type: 'VARCHAR(32)', nullable: false },
        { name: 'firmware_name', type: 'VARCHAR(128)', nullable: false },
        { name: 'device_id', type: 'VARCHAR(64)', nullable: true },
        { name: 'device_name', type: 'VARCHAR(128)', nullable: false },
        { name: 'device_type', type: 'VARCHAR(64)', nullable: false },
        { name: 'role_key', type: 'VARCHAR(64)', nullable: false },
        { name: 'target_scope', type: 'VARCHAR(32)', nullable: false, defaultValue: "'single'" },
        { name: 'status', type: 'VARCHAR(32)', nullable: false, defaultValue: "'PENDING'" },
        { name: 'progress_percent', type: 'INT', nullable: false, defaultValue: '0' },
        { name: 'error_message', type: 'TEXT', nullable: true },
        { name: 'initiated_by', type: 'VARCHAR(128)', nullable: false },
        { name: 'download_token', type: 'VARCHAR(128)', nullable: true },
        { name: 'expires_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'attempt_count', type: 'INT', nullable: false, defaultValue: '0' },
        { name: 'max_attempts', type: 'INT', nullable: false, defaultValue: '3' },
        { name: 'last_attempt_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'next_retry_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'download_started_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'boot_confirmed_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'completed_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' },
        { name: 'updated_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' }
      ],
      indexes: [
        { name: 'idx_ota_jobs_device', columns: ['device_id'] },
        { name: 'idx_ota_jobs_status', columns: ['status'] },
        { name: 'idx_ota_jobs_created', columns: ['created_at DESC'] }
      ],
      triggers: [
        {
          name: 'trg_ota_jobs_updated_at',
          timing: 'BEFORE',
          events: ['UPDATE'],
          level: 'ROW',
          functionName: 'fn_update_updated_at_timestamp'
        }
      ]
    },

    // 17. SCHEMA MIGRATIONS TABLE
    schema_migrations: {
      name: 'schema_migrations',
      description: 'Audit log of applied database schema migrations, execution times, and cryptographic checksums',
      primaryKey: ['version'],
      columns: [
        { name: 'version', type: 'VARCHAR(32)', nullable: false, primaryKey: true },
        { name: 'name', type: 'VARCHAR(128)', nullable: false },
        { name: 'applied_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' },
        { name: 'execution_time_ms', type: 'INT', nullable: false, defaultValue: '0' },
        { name: 'status', type: 'VARCHAR(32)', nullable: false, defaultValue: "'applied'" },
        { name: 'checksum', type: 'VARCHAR(128)', nullable: true },
        { name: 'error_message', type: 'TEXT', nullable: true }
      ],
      indexes: [
        { name: 'idx_schema_migrations_applied_at', columns: ['applied_at DESC'] }
      ]
    },

    // 18. SERVICE TOKENS TABLE
    service_tokens: {
      name: 'service_tokens',
      description: 'Server-to-server AI Studio service tokens and API credentials',
      primaryKey: ['id'],
      columns: [
        { name: 'id', type: 'VARCHAR(64)', nullable: false, primaryKey: true },
        { name: 'name', type: 'VARCHAR(128)', nullable: false },
        { name: 'token_prefix', type: 'VARCHAR(32)', nullable: false },
        { name: 'token_hash', type: 'VARCHAR(128)', nullable: false, unique: true },
        { name: 'user_id', type: 'VARCHAR(64)', nullable: false },
        { name: 'tenant_id', type: 'VARCHAR(64)', nullable: false },
        { name: 'scopes', type: 'JSONB', nullable: false, defaultValue: "'[]'::jsonb" },
        { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' },
        { name: 'expires_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'last_used_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'revoked_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: true },
        { name: 'is_revoked', type: 'BOOLEAN', nullable: false, defaultValue: 'FALSE' }
      ],
      indexes: [
        { name: 'idx_service_tokens_token_hash', columns: ['token_hash'] },
        { name: 'idx_service_tokens_tenant_id', columns: ['tenant_id'] },
        { name: 'idx_service_tokens_user_id', columns: ['user_id'] }
      ]
    }
  }
};

/**
 * Returns the topologically sorted creation order for canonical tables to respect references.
 */
export function getCanonicalTableCreationOrder(): string[] {
  return [
    'users',
    'devices',
    'device_ws_messages_dedup',
    'telemetry_packets',
    'telemetry_readings',
    'simulation_telemetry_readings',
    'threshold_rules',
    'active_alarms',
    'alarm_events',
    'notifications',
    'audit_logs',
    'system_events',
    'device_commands',
    'dispatch_logs',
    'user_sessions',
    'dashboard_layouts',
    'firmwares',
    'ota_deployment_jobs',
    'schema_migrations',
  ];
}

/**
 * Generates deterministic DDL SQL for a canonical table trigger.
 */
export function generateTriggerDDL(tableName: string, trg: TriggerDefinition): string {
  const eventsStr = trg.events.join(' OR ');
  return `DROP TRIGGER IF EXISTS "${trg.name}" ON "${tableName}";\nCREATE TRIGGER "${trg.name}"\n${trg.timing} ${eventsStr} ON "${tableName}"\nFOR EACH ${trg.level}\nEXECUTE FUNCTION ${trg.functionName}();\n`;
}

/**
 * Generates deterministic, isolated DDL SQL for a single canonical table, including
 * its columns, primary keys, composite indexes, triggers, and TimescaleDB settings if applicable.
 */
export function generateSingleTableDDL(tableName: string): string {
  const table = CANONICAL_SCHEMA_METADATA.tables[tableName];
  if (!table) {
    throw new Error(`Table '${tableName}' is not defined in CANONICAL_SCHEMA_METADATA.`);
  }

  const colDefs = table.columns.map((col) => {
    let def = `    "${col.name}" ${col.type}`;
    if (!col.nullable) {
      def += ' NOT NULL';
    }
    if (col.defaultValue !== undefined) {
      def += ` DEFAULT ${col.defaultValue}`;
    }
    return def;
  });

  if (table.primaryKey && table.primaryKey.length > 0) {
    colDefs.push(`    PRIMARY KEY ("${table.primaryKey.join('", "')}")`);
  }

  let ddl = `CREATE TABLE IF NOT EXISTS "${tableName}" (\n${colDefs.join(',\n')}\n);\n`;

  // Unique Constraints
  if (table.uniqueConstraints && table.uniqueConstraints.length > 0) {
    for (const uq of table.uniqueConstraints) {
      ddl += `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${uq.name}') THEN ALTER TABLE "${tableName}" ADD CONSTRAINT "${uq.name}" UNIQUE ("${uq.columns.join('", "')}"); END IF; END $$;\n`;
    }
  }

  // Check Constraints
  if (table.checkConstraints && table.checkConstraints.length > 0) {
    for (const chk of table.checkConstraints) {
      ddl += `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${chk.name}') THEN ALTER TABLE "${tableName}" ADD CONSTRAINT "${chk.name}" CHECK (${chk.condition}); END IF; END $$;\n`;
    }
  }

  // Foreign Key Constraints
  if (table.foreignKeys && table.foreignKeys.length > 0) {
    for (const fk of table.foreignKeys) {
      ddl += `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${fk.name}') THEN ALTER TABLE "${tableName}" ADD CONSTRAINT "${fk.name}" FOREIGN KEY ("${fk.columns.join('", "')}") REFERENCES "${fk.referencedTable}" ("${fk.referencedColumns.join('", "')}") ON DELETE ${fk.onDelete || 'NO ACTION'}; END IF; END $$;\n`;
    }
  }

  // Indexes
  if (table.indexes && table.indexes.length > 0) {
    for (const idx of table.indexes) {
      const uniqueStr = idx.unique ? 'UNIQUE ' : '';
      const methodStr = idx.type ? ` USING ${idx.type.toLowerCase()}` : '';
      const colList = idx.columns.map((c) => (c.includes(' ') || c.includes('(') ? c : `"${c}"`)).join(', ');
      const whereStr = idx.where ? ` WHERE ${idx.where}` : '';
      ddl += `CREATE ${uniqueStr}INDEX IF NOT EXISTS "${idx.name}" ON "${tableName}"${methodStr} (${colList})${whereStr};\n`;
    }
  }

  // Triggers
  if (table.triggers && table.triggers.length > 0) {
    for (const trg of table.triggers) {
      ddl += generateTriggerDDL(tableName, trg);
    }
  }

  // Timescale Hypertable if configured
  if (table.timescaleHypertable) {
    const timeCol = table.timescaleHypertable.timeColumn;
    const chunkInt = table.timescaleHypertable.chunkInterval;
    ddl += `
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('${tableName}', '${timeCol}', chunk_time_interval => INTERVAL '${chunkInt}', if_not_exists => TRUE);
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '${tableName} hypertable setup notice: %', SQLERRM;
END $$;\n`;
  }

  // Seed Canonical Test Account strictly in test environments if users table was created
  if (tableName === 'users') {
    const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST) || process.env.ENABLE_TEST_ACCOUNT === 'true';
    if (isTestEnv) {
      ddl += `
INSERT INTO users (id, name, email, password_hash, role, company_name, status, created_at)
VALUES (
    'usr_test_admin',
    'Kanonik Test Yöneticisi',
    'test@nexusnodeiot.com.tr',
    '$2b$10$IliwfVRhhq.l39y0sF3qmu/ff6/3GDtHoDXnq9BimrnDqsaIuW/z.',
    'admin',
    'NexusNode Test Laboratuvarı',
    'active',
    CURRENT_TIMESTAMP
)
ON CONFLICT (id) DO NOTHING;\n`;
    }
  }

  // Seed Canonical Test Device if devices table was created and test environment is enabled
  if (tableName === 'devices') {
    const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST) || process.env.ENABLE_TEST_ACCOUNT === 'true';
    if (isTestEnv) {
      ddl += `
INSERT INTO devices (
    id, tenant_id, user_id, name, device_type, role_key,
    api_key, api_key_hash, status, rate_limit_per_min, encryption_method,
    heartbeat_timeout_seconds, expected_interval_seconds, created_at
)
VALUES (
    'dev_test_01',
    'usr_test_admin',
    'usr_test_admin',
    'Kanonik Saha Test Cihazı (ESP32)',
    'ESP32',
    'production_sensor',
    'dev_key_test_0000000000000000',
    'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
    'online',
    300,
    'AES-256-GCM',
    60,
    10,
    CURRENT_TIMESTAMP
)
ON CONFLICT (id) DO NOTHING;\n`;
    }
  }

  return ddl;
}

/**
 * Generates the complete, idempotent, self-healing DDL SQL string for the entire Canonical Schema.
 */
export function generateCanonicalSchemaDDL(): string {
  const testUserDdl = `
-- Canonical Permanent Test Administrator (usr_test_admin)
INSERT INTO users (id, name, email, password_hash, role, company_name, status, created_at)
VALUES (
    'usr_test_admin',
    'Kanonik Test Yöneticisi',
    'test@nexusnodeiot.com.tr',
    '$2b$10$IliwfVRhhq.l39y0sF3qmu/ff6/3GDtHoDXnq9BimrnDqsaIuW/z.',
    'admin',
    'NexusNode Test Laboratuvarı',
    'active',
    CURRENT_TIMESTAMP
)
ON CONFLICT (id) DO UPDATE SET
    status = 'active',
    password_hash = EXCLUDED.password_hash;
`;

  return `
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

${testUserDdl}

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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_devices_tenant_id ON devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_api_key_hash ON devices(api_key_hash);
CREATE INDEX IF NOT EXISTS idx_devices_hardware_model ON devices(hardware_model);
CREATE INDEX IF NOT EXISTS idx_devices_role_key ON devices(role_key);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen DESC);

-- Canonical Permanent Test Device (dev_test_01)
INSERT INTO devices (
    id, tenant_id, user_id, name, device_type, role_key,
    api_key, api_key_hash, status, rate_limit_per_min, encryption_method,
    heartbeat_timeout_seconds, expected_interval_seconds, created_at
)
VALUES (
    'dev_test_01',
    'usr_test_admin',
    'usr_test_admin',
    'Kanonik Saha Test Cihazı (ESP32)',
    'ESP32',
    'production_sensor',
    'dev_key_test_0000000000000000',
    'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
    'online',
    300,
    'AES-256-GCM',
    60,
    10,
    CURRENT_TIMESTAMP
)
ON CONFLICT (id) DO NOTHING;

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
    command_type VARCHAR(64) NOT NULL,
    command_name VARCHAR(64),
    output_id VARCHAR(64),
    value_payload TEXT,
    parameters JSONB DEFAULT '{}'::jsonb,
    source VARCHAR(32) DEFAULT 'manual',
    status VARCHAR(32) DEFAULT 'pending',
    sent_by VARCHAR(64),
    idempotency_key VARCHAR(128),
    timeout_seconds INT DEFAULT 300,
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    sent_at TIMESTAMP WITH TIME ZONE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    executed_at TIMESTAMP WITH TIME ZONE,
    applied_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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

-- 2.13 USER SESSIONS
CREATE TABLE IF NOT EXISTS user_sessions (
    token VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(64),
    user_role VARCHAR(32) DEFAULT 'operator',
    user_email VARCHAR(128),
    user_name VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

-- 2.14 DASHBOARD LAYOUTS
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

-- 2.15 FIRMWARES (OTA Repository)
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

-- 2.16 OTA DEPLOYMENT JOBS
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

-- 2.17 SCHEMA MIGRATIONS
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
`;
}
