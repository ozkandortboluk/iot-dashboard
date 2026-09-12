import type pg from 'pg';
import type { Migration } from './types.js';

export const migration003: Migration = {
  version: '003',
  name: 'idempotency_and_composite_pk_constraints',
  up: async (client: pg.PoolClient) => {
    // 1. Ensure composite primary key on telemetry_readings
    try {
      // Check existing primary key
      const pkCheck = await client.query(`
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'telemetry_readings' AND constraint_type = 'PRIMARY KEY';
      `);

      if (pkCheck.rows.length === 0) {
        await client.query(`
          ALTER TABLE telemetry_readings ADD PRIMARY KEY (id, created_at);
        `);
        console.log('[Migration 003] Added Composite Primary Key (id, created_at) to telemetry_readings.');
      }
    } catch (err: any) {
      console.error('[Migration 003] Composite PK setup error:', err?.message || err);
      throw err;
    }

    // 2. Ensure unique constraint on telemetry_packets (device_id, boot_id, sequence)
    try {
      const unqCheck = await client.query(`
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'telemetry_packets'::regclass AND conname = 'unq_telemetry_device_boot_sequence';
      `);

      if (unqCheck.rows.length === 0) {
        await client.query(`
          ALTER TABLE telemetry_packets 
          ADD CONSTRAINT unq_telemetry_device_boot_sequence 
          UNIQUE (device_id, boot_id, sequence);
        `);
        console.log('[Migration 003] Added unique constraint unq_telemetry_device_boot_sequence to telemetry_packets.');
      }
    } catch (err: any) {
      console.error('[Migration 003] Unique constraint on telemetry_packets error:', err?.message || err);
      throw err;
    }

    // 3. Performance Indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_telemetry_readings_dev_metric_time 
      ON telemetry_readings (device_id, metric, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_telemetry_readings_tenant 
      ON telemetry_readings (tenant_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_active_alarms_device 
      ON active_alarms (device_id, state);

      CREATE INDEX IF NOT EXISTS idx_device_commands_device_status 
      ON device_commands (device_id, status);
    `);
  },
  down: async (client: pg.PoolClient) => {
    console.warn('[Migration 003] Down migration invoked.');
  },
};
