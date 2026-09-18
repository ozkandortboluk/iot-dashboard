import type pg from 'pg';
import type { Migration } from './types.js';

export const migration011: Migration = {
  version: '011',
  name: 'fix_threshold_rules_active_hours_json_syntax',
  async up(client: pg.PoolClient): Promise<void> {
    // 1. Ensure threshold_rules table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS threshold_rules (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64),
        tenant_id VARCHAR(64),
        user_name VARCHAR(128),
        device_id VARCHAR(64) DEFAULT 'all',
        metric_key VARCHAR(64) NOT NULL,
        operator VARCHAR(8) NOT NULL,
        threshold_value NUMERIC NOT NULL,
        severity VARCHAR(32) DEFAULT 'warning',
        enabled BOOLEAN DEFAULT TRUE,
        message_template TEXT,
        hysteresis NUMERIC DEFAULT 0,
        min_breach_duration_sec INT DEFAULT 0,
        repeat_interval_sec INT DEFAULT 0,
        notification_channels JSONB DEFAULT '["app"]'::jsonb,
        active_hours VARCHAR(64) DEFAULT '00:00-23:59',
        recipients JSONB DEFAULT '[]'::jsonb,
        silenced_until TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Fix active_hours column type if it is JSON or JSONB to VARCHAR(64)
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'threshold_rules' 
            AND column_name = 'active_hours' 
            AND data_type IN ('json', 'jsonb')
        ) THEN
          ALTER TABLE threshold_rules ALTER COLUMN active_hours TYPE VARCHAR(64) USING (
            CASE 
              WHEN active_hours IS NULL THEN '00:00-23:59'
              ELSE active_hours::text
            END
          );
        END IF;
      END $$;
    `);

    // 3. Ensure column active_hours exists with VARCHAR(64) and default
    await client.query(`
      ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS active_hours VARCHAR(64) DEFAULT '00:00-23:59';
    `);

    await client.query(`
      UPDATE threshold_rules 
      SET active_hours = '00:00-23:59' 
      WHERE active_hours IS NULL OR active_hours = '' OR active_hours = '""';
    `).catch(() => {});

    // 4. Ensure tenant_id is nullable or populated
    await client.query(`
      ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64);
      ALTER TABLE threshold_rules ALTER COLUMN tenant_id DROP NOT NULL;
      UPDATE threshold_rules SET tenant_id = user_id WHERE (tenant_id IS NULL OR tenant_id = '') AND user_id IS NOT NULL;
    `).catch(() => {});

    // 5. Ensure notification_channels and recipients are JSONB
    await client.query(`
      ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS notification_channels JSONB DEFAULT '["app"]'::jsonb;
      ALTER TABLE threshold_rules ADD COLUMN IF NOT EXISTS recipients JSONB DEFAULT '[]'::jsonb;
    `);
  },

  async down(_client: pg.PoolClient): Promise<void> {
    // Non-destructive down migration: preserve data
  }
};
