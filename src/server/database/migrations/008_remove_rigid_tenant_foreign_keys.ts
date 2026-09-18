import type pg from 'pg';
import type { Migration } from './types.js';

export const migration008: Migration = {
  version: '008',
  name: 'remove_rigid_tenant_foreign_keys',
  up: async (client: pg.PoolClient) => {
    const tablesWithTenantFk = [
      'audit_logs',
      'notifications',
      'active_alarms',
      'alarm_events',
      'device_commands',
      'telemetry_readings',
      'simulation_telemetry_readings',
      'threshold_rules',
      'dispatch_logs',
      'devices',
    ];

    for (const table of tablesWithTenantFk) {
      try {
        const tableCheck = await client.query(
          "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1;",
          [table]
        );
        if (tableCheck.rows.length === 0) {
          continue;
        }

        // Drop any foreign key constraints on tenant_id or user_id that block system/multi-tenant logging
        await client.query(`
          ALTER TABLE IF EXISTS ${table} DROP CONSTRAINT IF EXISTS fk_${table}_tenant_id;
          ALTER TABLE IF EXISTS ${table} DROP CONSTRAINT IF EXISTS fk_${table}_user_id;
          ALTER TABLE IF EXISTS ${table} DROP CONSTRAINT IF EXISTS ${table}_tenant_id_fkey;
          ALTER TABLE IF EXISTS ${table} DROP CONSTRAINT IF EXISTS ${table}_user_id_fkey;
        `);

        // Ensure performance index on tenant_id exists
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_${table}_tenant_id ON ${table} (tenant_id);
        `);
      } catch (err: any) {
        console.warn(`[Migration 008] Non-fatal warning on ${table}:`, err?.message || err);
      }
    }

    // Ensure audit_logs defaults and columns
    await client.query(`
      ALTER TABLE audit_logs ALTER COLUMN tenant_id SET DEFAULT 'usr_admin';
      ALTER TABLE audit_logs ALTER COLUMN resource_type SET DEFAULT 'system';
      ALTER TABLE audit_logs ALTER COLUMN severity SET DEFAULT 'low';
      ALTER TABLE audit_logs ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
    `).catch(() => {});
  },
  down: async (_client: pg.PoolClient) => {
    // Non-destructive
  },
};
