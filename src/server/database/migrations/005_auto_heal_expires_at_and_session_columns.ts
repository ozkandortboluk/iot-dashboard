import type pg from 'pg';
import type { Migration } from './types.js';

export const migration005: Migration = {
  version: '005',
  name: 'auto_heal_expires_at_and_session_columns',
  up: async (client: pg.PoolClient) => {
    // 1. user_sessions table column resilience
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        token VARCHAR(128) PRIMARY KEY,
        user_id VARCHAR(64),
        user_role VARCHAR(32) DEFAULT 'operator',
        user_email VARCHAR(128),
        user_name VARCHAR(128),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days')
      );

      ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days');
      ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);
      ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS user_role VARCHAR(32) DEFAULT 'operator';
      ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS user_email VARCHAR(128);
      ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS user_name VARCHAR(128);

      UPDATE user_sessions 
      SET expires_at = CURRENT_TIMESTAMP + INTERVAL '7 days' 
      WHERE expires_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
    `);

    // 2. device_ws_messages_dedup table column resilience
    await client.query(`
      CREATE TABLE IF NOT EXISTS device_ws_messages_dedup (
        device_id VARCHAR(64) NOT NULL,
        message_id VARCHAR(128) NOT NULL,
        message_type VARCHAR(32) NOT NULL DEFAULT 'telemetry',
        received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour'),
        PRIMARY KEY (device_id, message_id)
      );

      ALTER TABLE device_ws_messages_dedup ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour');
      ALTER TABLE device_ws_messages_dedup ADD COLUMN IF NOT EXISTS received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE device_ws_messages_dedup ADD COLUMN IF NOT EXISTS message_type VARCHAR(32) DEFAULT 'telemetry';

      UPDATE device_ws_messages_dedup 
      SET expires_at = CURRENT_TIMESTAMP + INTERVAL '1 hour' 
      WHERE expires_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_device_ws_dedup_expires ON device_ws_messages_dedup(expires_at);
    `);

    // 3. devices table token & expiration columns
    await client.query(`
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_expires_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_revoked BOOLEAN DEFAULT FALSE;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_last_used_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_scopes JSONB DEFAULT '["all"]'::jsonb;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_rotated_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS previous_api_key_hash VARCHAR(128);
    `);

    // 4. ota_deployment_jobs table
    await client.query(`
      ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE ota_deployment_jobs ADD COLUMN IF NOT EXISTS download_token VARCHAR(128);
    `);

    // 5. audit_logs fallback default for tenant_id to prevent null-constraint issues
    await client.query(`
      ALTER TABLE audit_logs ALTER COLUMN tenant_id SET DEFAULT 'usr_admin';
      UPDATE audit_logs SET tenant_id = 'usr_admin' WHERE tenant_id IS NULL;
    `);
  },
};
