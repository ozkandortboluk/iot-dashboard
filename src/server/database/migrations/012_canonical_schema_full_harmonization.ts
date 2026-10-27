import type pg from 'pg';
import type { Migration } from './types.js';
import { generateCanonicalSchemaDDL } from '../canonicalSchema.js';

/**
 * Migration 012: Full Canonical Database Schema Harmonization
 *
 * Enforces strict alignment with the Canonical Schema (Single Source of Truth).
 * Idempotently verifies and provisions:
 * - All 19 standard and timeseries tables
 * - All required columns and default values
 * - Missing triggers, indexes, and continuous aggregates
 * - Full constraint synchronization
 */
export const migration012: Migration = {
  version: '012',
  name: 'canonical_schema_full_harmonization',
  disableTransaction: true,
  async up(client: pg.PoolClient): Promise<void> {
    console.log('[Migration 012] Starting Full Canonical Schema Harmonization...');

    // 1. Execute Canonical DDL
    await client.query(generateCanonicalSchemaDDL());

    // 2. Perform automated column healing for any legacy schemas
    await client.query(`
      DO $$
      BEGIN
        -- Ensure alarm_events table exists
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

        -- Ensure system_events table exists
        CREATE TABLE IF NOT EXISTS system_events (
          id VARCHAR(64) PRIMARY KEY,
          event_type VARCHAR(64) NOT NULL,
          source VARCHAR(64) NOT NULL,
          severity VARCHAR(32) DEFAULT 'info',
          payload JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Devices table full column verification
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS customer_id VARCHAR(64) DEFAULT 'usr_admin';
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS user_id VARCHAR(64) DEFAULT 'usr_admin';
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS assigned_user_id VARCHAR(64);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(64);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS previous_tenant_id VARCHAR(64);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS previous_tenant_name VARCHAR(128);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS ownership_transferred_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS type VARCHAR(64);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS role_key VARCHAR(64) DEFAULT 'device';
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_prefix VARCHAR(32);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_hash VARCHAR(128);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS previous_api_key_hash VARCHAR(128);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS auth_token VARCHAR(128);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_expires_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_revoked BOOLEAN DEFAULT FALSE;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_last_used_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_scopes JSONB DEFAULT '["all"]'::jsonb;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_rotated_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS ip VARCHAR(45);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS hardware_model VARCHAR(64);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS firmware_version VARCHAR(32);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_status VARCHAR(32) DEFAULT 'IDLE';
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_target_firmware_id VARCHAR(64);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_target_version VARCHAR(32);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_progress INT DEFAULT 0;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS error_message TEXT;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_last_check_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS ota_job_id VARCHAR(64);
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN DEFAULT FALSE;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS save_simulated_data_to_db BOOLEAN DEFAULT FALSE;
        ALTER TABLE devices ADD COLUMN IF NOT EXISTS simulated_metrics JSONB DEFAULT '[]'::jsonb;
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

        -- Active alarms columns verification
        ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS incident_id VARCHAR(128);
        ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS trigger_value DOUBLE PRECISION;
        ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS first_breach_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS last_evaluated_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS acknowledged BOOLEAN DEFAULT FALSE;
        ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS acknowledged_by VARCHAR(128);
        ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS silenced_until TIMESTAMP WITH TIME ZONE;
        ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS repeat_count INT DEFAULT 0;
        ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS source VARCHAR(32) DEFAULT 'physical';
        ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS environment VARCHAR(32) DEFAULT 'production';
        ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS is_simulation BOOLEAN DEFAULT FALSE;
        ALTER TABLE active_alarms ADD COLUMN IF NOT EXISTS note TEXT;

        -- Notifications columns verification
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type VARCHAR(64) DEFAULT 'alert';
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS source VARCHAR(32) DEFAULT 'system';
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read BOOLEAN DEFAULT FALSE;
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS alarm_id VARCHAR(128);
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS rule_id VARCHAR(64);
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS alarm_state VARCHAR(32);
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS acknowledged BOOLEAN DEFAULT FALSE;
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS acknowledged_by VARCHAR(128);
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS repeat_count INT DEFAULT 0;
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS current_value DOUBLE PRECISION;
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS threshold_value DOUBLE PRECISION;
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

        -- Audit logs columns verification
        ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'usr_admin';
        ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource_type VARCHAR(64) DEFAULT 'system';
        ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource_id VARCHAR(64);
        ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details JSONB;

        -- Device commands columns verification
        ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS command_id VARCHAR(64);
        ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS customer_id VARCHAR(64);
        ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);
        ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS command_name VARCHAR(64);
        ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS command_type VARCHAR(64) DEFAULT 'GENERAL_COMMAND';
        ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS output_id VARCHAR(64);
        ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS target_pin VARCHAR(32);
        ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS target_state VARCHAR(32);
        ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS value DOUBLE PRECISION;
        ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS value_payload TEXT;
        ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS parameters JSONB DEFAULT '{}'::jsonb;
        ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS result JSONB;
        ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS source VARCHAR(32) DEFAULT 'manual';
        ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS priority INT DEFAULT 1;
        ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS ttl_seconds INT DEFAULT 60;
        ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS requires_ack BOOLEAN DEFAULT TRUE;
        ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS sent_by VARCHAR(64);
        ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS created_by VARCHAR(128);
        ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS applied_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS executed_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

      END $$;
    `);

    console.log('[Migration 012] Full Canonical Schema Harmonization completed successfully.');
  },
};
