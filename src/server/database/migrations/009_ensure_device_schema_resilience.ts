import type pg from 'pg';
import type { Migration } from './types.js';

export const migration009: Migration = {
  version: '009',
  name: 'ensure_device_schema_resilience',
  up: async (client: pg.PoolClient) => {
    // 1. Ensure all device dual-columns and attributes exist
    await client.query(`
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS type VARCHAR(32) DEFAULT 'sensor';
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_type VARCHAR(32) DEFAULT 'sensor';
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS ip VARCHAR(45);
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS data_flow_active BOOLEAN DEFAULT TRUE;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS customer_id VARCHAR(64) DEFAULT 'usr_admin';
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'usr_admin';
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS user_id VARCHAR(64) DEFAULT 'usr_admin';
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'offline';
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS role_key VARCHAR(64) DEFAULT 'device';
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS rate_limit_per_min INT DEFAULT 120;
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS encryption_method VARCHAR(32) DEFAULT 'AES-256-GCM';
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS metrics JSONB DEFAULT '{}'::jsonb;
    `);

    // 2. Drop any legacy NOT NULL constraints that can cause ingestion crashes on older/newer schema variants
    await client.query(`
      ALTER TABLE devices ALTER COLUMN type DROP NOT NULL;
      ALTER TABLE devices ALTER COLUMN device_type DROP NOT NULL;
      ALTER TABLE devices ALTER COLUMN ip DROP NOT NULL;
      ALTER TABLE devices ALTER COLUMN ip_address DROP NOT NULL;
      ALTER TABLE devices ALTER COLUMN customer_id DROP NOT NULL;
      ALTER TABLE devices ALTER COLUMN role_key DROP NOT NULL;
      ALTER TABLE devices ALTER COLUMN status DROP NOT NULL;
      ALTER TABLE devices ALTER COLUMN data_flow_active DROP NOT NULL;

      ALTER TABLE devices ALTER COLUMN type SET DEFAULT 'sensor';
      ALTER TABLE devices ALTER COLUMN device_type SET DEFAULT 'sensor';
      ALTER TABLE devices ALTER COLUMN status SET DEFAULT 'offline';
      ALTER TABLE devices ALTER COLUMN data_flow_active SET DEFAULT TRUE;
      ALTER TABLE devices ALTER COLUMN role_key SET DEFAULT 'device';
    `).catch((err) => {
      console.warn('[Migration 009] Warning altering columns:', err?.message || err);
    });

    // 3. Bidirectional data synchronization between type <-> device_type and ip <-> ip_address
    await client.query(`
      UPDATE devices 
      SET type = COALESCE(NULLIF(type, ''), NULLIF(device_type, ''), 'sensor') 
      WHERE type IS NULL OR type = '';

      UPDATE devices 
      SET device_type = COALESCE(NULLIF(device_type, ''), NULLIF(type, ''), 'sensor') 
      WHERE device_type IS NULL OR device_type = '';

      UPDATE devices 
      SET ip = COALESCE(NULLIF(ip, ''), NULLIF(ip_address, '')) 
      WHERE (ip IS NULL OR ip = '') AND ip_address IS NOT NULL AND ip_address != '';

      UPDATE devices 
      SET ip_address = COALESCE(NULLIF(ip_address, ''), NULLIF(ip, '')) 
      WHERE (ip_address IS NULL OR ip_address = '') AND ip IS NOT NULL AND ip != '';

      UPDATE devices 
      SET tenant_id = 'usr_admin' 
      WHERE tenant_id IS NULL OR tenant_id = '';

      UPDATE devices 
      SET user_id = 'usr_admin' 
      WHERE user_id IS NULL OR user_id = '';

      UPDATE devices 
      SET data_flow_active = TRUE 
      WHERE data_flow_active IS NULL;
    `);

    // 4. Performance indices
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_devices_type ON devices (type);
      CREATE INDEX IF NOT EXISTS idx_devices_device_type ON devices (device_type);
      CREATE INDEX IF NOT EXISTS idx_devices_ip_address ON devices (ip_address);
      CREATE INDEX IF NOT EXISTS idx_devices_ip ON devices (ip);
      CREATE INDEX IF NOT EXISTS idx_devices_api_key_hash ON devices (api_key_hash);
    `).catch(() => {});
  },
  down: async (_client: pg.PoolClient) => {
    // Non-destructive
  },
};
