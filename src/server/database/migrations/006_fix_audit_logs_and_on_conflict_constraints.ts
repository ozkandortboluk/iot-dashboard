import type pg from 'pg';
import type { Migration } from './types.js';

export const migration006: Migration = {
  version: '006',
  name: 'fix_audit_logs_and_on_conflict_constraints',
  disableTransaction: true,
  up: async (client: pg.PoolClient) => {
    // 1. audit_logs table resilience: remove strict NOT NULL from resource_type and provide default
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) DEFAULT 'usr_admin',
        user_id VARCHAR(64),
        user_name VARCHAR(128),
        action VARCHAR(256) NOT NULL,
        resource_type VARCHAR(64) DEFAULT 'system',
        resource_id VARCHAR(64),
        details JSONB,
        ip_address VARCHAR(45),
        severity VARCHAR(32) DEFAULT 'low',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource_type VARCHAR(64) DEFAULT 'system';
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_name VARCHAR(128);
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS severity VARCHAR(32) DEFAULT 'low';
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details JSONB;
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource_id VARCHAR(64);
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);

      ALTER TABLE audit_logs ALTER COLUMN resource_type DROP NOT NULL;
      ALTER TABLE audit_logs ALTER COLUMN resource_type SET DEFAULT 'system';
      UPDATE audit_logs SET resource_type = 'system' WHERE resource_type IS NULL;
    `);

    // 2. device_ws_messages_dedup table resilience: ensure message_id column and unique constraint for ON CONFLICT
    await client.query(`
      ALTER TABLE device_ws_messages_dedup ADD COLUMN IF NOT EXISTS message_id VARCHAR(128);
      UPDATE device_ws_messages_dedup SET message_id = msg_id WHERE message_id IS NULL AND msg_id IS NOT NULL;
      ALTER TABLE device_ws_messages_dedup ALTER COLUMN msg_id SET DEFAULT gen_random_uuid()::text;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'unq_device_ws_dedup'
        ) THEN
          ALTER TABLE device_ws_messages_dedup ADD CONSTRAINT unq_device_ws_dedup UNIQUE (device_id, message_id);
        END IF;
      END;
      $$;

      CREATE UNIQUE INDEX IF NOT EXISTS unq_device_ws_dedup_idx ON device_ws_messages_dedup (device_id, message_id);
    `);

    // 3. user_sessions table resilience: ensure token unique constraint and id default
    await client.query(`
      ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS id VARCHAR(64);
      ALTER TABLE user_sessions ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'unq_user_sessions_token'
        ) THEN
          ALTER TABLE user_sessions ADD CONSTRAINT unq_user_sessions_token UNIQUE (token);
        END IF;
      END;
      $$;

      CREATE UNIQUE INDEX IF NOT EXISTS unq_user_sessions_token_idx ON user_sessions (token);
    `);

    // 4. system_events table resilience: ensure timestamp, level, category, message, details columns
    await client.query(`
      ALTER TABLE system_events ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE system_events ADD COLUMN IF NOT EXISTS level VARCHAR(32) DEFAULT 'info';
      ALTER TABLE system_events ADD COLUMN IF NOT EXISTS category VARCHAR(64) DEFAULT 'system';
      ALTER TABLE system_events ADD COLUMN IF NOT EXISTS message TEXT DEFAULT '';
      ALTER TABLE system_events ADD COLUMN IF NOT EXISTS details TEXT;
      ALTER TABLE system_events ALTER COLUMN event_type DROP NOT NULL;
      ALTER TABLE system_events ALTER COLUMN source DROP NOT NULL;
      ALTER TABLE system_events ALTER COLUMN source SET DEFAULT 'system';
    `);
  },
};
