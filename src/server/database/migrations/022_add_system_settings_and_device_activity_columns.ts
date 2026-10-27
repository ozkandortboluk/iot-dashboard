import type pg from 'pg';
import type { Migration } from './types.js';

/**
 * Migration 022: Add System Settings Table & Canonical Device Activity Columns
 *
 * Establishes versioned canonical authority for:
 * 1. system_settings table (stores encrypted system configurations and operational parameters)
 * 2. devices tracking columns: last_telemetry_at, last_heartbeat_at, last_offline_notified_at
 * 3. notifications routing column: event_key
 * 4. Required indexes for high-frequency activity querying
 */
export const migration022: Migration = {
  version: '022',
  name: 'add_system_settings_and_device_activity_columns',
  disableTransaction: true,
  canonicalChecksum: 'a73f8e4b2d1c905e6fa083b4c12d98ef',
  acceptedHistoricalChecksums: ['a73f8e4b2d1c905e6fa083b4c12d98ef'],
  up: async (client: pg.PoolClient) => {
    console.log('[Migration 022] Applying canonical system_settings table and device activity columns...');

    // 1. Create system_settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(64) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_system_settings_updated_at ON system_settings(updated_at DESC);
    `);

    // 2. Add device activity & notification tracking columns
    await client.query(`
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_telemetry_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_offline_notified_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_key VARCHAR(256);
    `);

    // 3. Create performance indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_devices_last_telemetry_at ON devices(last_telemetry_at);
      CREATE INDEX IF NOT EXISTS idx_devices_last_heartbeat_at ON devices(last_heartbeat_at);
      CREATE INDEX IF NOT EXISTS idx_notifications_event_key ON notifications(event_key);
    `);

    console.log('[Migration 022] System settings and device activity schema successfully applied.');
  },
  down: async (client: pg.PoolClient) => {
    await client.query(`DROP TABLE IF EXISTS system_settings;`);
  },
};
