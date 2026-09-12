import type pg from 'pg';
import type { Migration } from './types.js';

export const migration004: Migration = {
  version: '004',
  name: 'multitenant_columns_and_integrity',
  up: async (client: pg.PoolClient) => {
    // 1. Ensure root admin user exists (do this first for FK integrity)
    await client.query(`
      INSERT INTO users (id, name, email, password_hash, role, company_name, status, created_at)
      VALUES (
        'usr_admin',
        'Sistem Yöneticisi',
        'admin@nexusnode.io',
        '$2a$10$B50m1l26vD8LhJqZ8XyqA.v2a00qQGq7cR/8v4M7sF2D3Q4s7rD9K',
        'admin',
        'Merkez Yönetim',
        'active',
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (id) DO NOTHING;
    `);

    // 2. Ensure tenant_id column exists on all relevant tables and backfill
    const tenantColumns = [
      { table: 'devices', column: 'tenant_id' },
      { table: 'telemetry_readings', column: 'tenant_id' },
      { table: 'simulation_telemetry_readings', column: 'tenant_id' },
      { table: 'active_alarms', column: 'tenant_id' },
      { table: 'alarm_events', column: 'tenant_id' },
      { table: 'threshold_rules', column: 'tenant_id' },
      { table: 'device_commands', column: 'tenant_id' },
      { table: 'notifications', column: 'tenant_id' },
      { table: 'audit_logs', column: 'tenant_id' },
    ];

    for (const item of tenantColumns) {
      try {
        // Add column if not exists (without default to prevent future silent bugs)
        await client.query(`
          ALTER TABLE ${item.table} ADD COLUMN IF NOT EXISTS ${item.column} VARCHAR(64);
        `);
        
        // Backfill existing rows that have NULL tenant_id
        await client.query(`
          UPDATE ${item.table} SET ${item.column} = 'usr_admin' WHERE ${item.column} IS NULL;
        `);

        // Remove the default if it was added previously, and enforce NOT NULL
        await client.query(`
          ALTER TABLE ${item.table} ALTER COLUMN ${item.column} DROP DEFAULT;
          ALTER TABLE ${item.table} ALTER COLUMN ${item.column} SET NOT NULL;
        `);

        // Add Foreign Key (if it's not a hypertable with issues, wait, foreign keys on hypertables to regular tables are supported)
        const fkName = `fk_${item.table}_tenant_id`;
        const fkCheck = await client.query(`
          SELECT 1 FROM pg_constraint WHERE conname = $1
        `, [fkName]);

        if (fkCheck.rows.length === 0) {
           await client.query(`
             ALTER TABLE ${item.table} ADD CONSTRAINT ${fkName} FOREIGN KEY (${item.column}) REFERENCES users(id) ON DELETE CASCADE;
           `);
        }
      } catch (err: any) {
        console.error(`[Migration 004] ALTER TABLE ${item.table} ADD COLUMN/FK ${item.column} error:`, err?.message || err);
        throw err;
      }
    }
  },
  down: async (client: pg.PoolClient) => {
    console.warn('[Migration 004] Down migration invoked.');
  },
};
