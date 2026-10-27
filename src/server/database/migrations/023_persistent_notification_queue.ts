import type pg from 'pg';
import type { Migration } from './types.js';

/** Adds the durable, lease-based queue used by production notification workers. */
export const migration023: Migration = {
  version: '023',
  name: 'persistent_notification_queue',
  disableTransaction: true,
  up: async (client: pg.PoolClient) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_queue (
        id VARCHAR(128) PRIMARY KEY,
        notification_id VARCHAR(64),
        rule_id VARCHAR(64),
        tenant_id VARCHAR(64) NOT NULL,
        user_name VARCHAR(128),
        channel VARCHAR(32) NOT NULL CHECK (channel IN ('email', 'sms', 'webhook', 'whatsapp', 'telegram')),
        recipient TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        severity VARCHAR(32) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'processing', 'sent', 'delivered', 'failed', 'retrying')),
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
        last_attempt_at TIMESTAMPTZ,
        next_retry_at TIMESTAMPTZ,
        lease_owner VARCHAR(160),
        lease_until TIMESTAMPTZ,
        error_details TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_notification_queue_ready
        ON notification_queue (next_retry_at, created_at, id)
        WHERE status IN ('pending', 'retrying');
      CREATE INDEX IF NOT EXISTS idx_notification_queue_expired_lease
        ON notification_queue (lease_until, created_at, id)
        WHERE status = 'processing';
      CREATE INDEX IF NOT EXISTS idx_notification_queue_tenant_created
        ON notification_queue (tenant_id, created_at DESC, id DESC);
    `);
  },
};
