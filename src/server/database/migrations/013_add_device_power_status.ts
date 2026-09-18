import type pg from 'pg';
import type { Migration } from './types.js';

export const migration013: Migration = {
  version: '013',
  name: 'add_device_power_status',
  disableTransaction: true,
  up: async (client: pg.PoolClient) => {
    await client.query(`
      ALTER TABLE devices 
      ADD COLUMN IF NOT EXISTS power_source VARCHAR(32) DEFAULT 'mains' NOT NULL,
      ADD COLUMN IF NOT EXISTS battery_level INT;
    `);
    
    // Add check constraint for power_source
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_devices_power_source'
        ) THEN
          ALTER TABLE devices
          ADD CONSTRAINT chk_devices_power_source CHECK (power_source IN ('battery', 'mains', 'unknown'));
        END IF;
      END
      $$;
    `);
  },
  down: async (client: pg.PoolClient) => {
    await client.query(`
      ALTER TABLE devices DROP CONSTRAINT IF EXISTS chk_devices_power_source;
      ALTER TABLE devices DROP COLUMN IF EXISTS power_source;
      ALTER TABLE devices DROP COLUMN IF EXISTS battery_level;
    `);
  }
};

