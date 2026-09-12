import type pg from 'pg';
import type { Migration } from './types.js';

export const migration004: Migration = {
  version: '004',
  name: 'multitenant_columns_and_integrity',
  up: async (client: pg.PoolClient) => {
    // 1. Ensure tenant_id column exists on all relevant tables
    const tenantColumns = [
      { table: 'devices', column: 'tenant_id', type: "VARCHAR(64) DEFAULT 'usr_admin'" },
      { table: 'telemetry_readings', column: 'tenant_id', type: "VARCHAR(64) DEFAULT 'usr_admin'" },
      { table: 'simulation_telemetry_readings', column: 'tenant_id', type: "VARCHAR(64) DEFAULT 'usr_admin'" },
      { table: 'active_alarms', column: 'tenant_id', type: "VARCHAR(64) DEFAULT 'usr_admin'" },
      { table: 'alarm_events', column: 'tenant_id', type: "VARCHAR(64) DEFAULT 'usr_admin'" },
      { table: 'threshold_rules', column: 'tenant_id', type: "VARCHAR(64) DEFAULT 'usr_admin'" },
      { table: 'device_commands', column: 'tenant_id', type: "VARCHAR(64) DEFAULT 'usr_admin'" },
      { table: 'notifications', column: 'tenant_id', type: "VARCHAR(64) DEFAULT 'usr_admin'" },
      { table: 'audit_logs', column: 'tenant_id', type: "VARCHAR(64) DEFAULT 'usr_admin'" },
    ];

    for (const item of tenantColumns) {
      try {
        await client.query(`
          ALTER TABLE ${item.table} ADD COLUMN IF NOT EXISTS ${item.column} ${item.type};
        `);
      } catch (err: any) {
        console.warn(`[Migration 004] ALTER TABLE ${item.table} ADD COLUMN ${item.column} notice:`, err?.message || err);
      }
    }

    // 2. Ensure root admin user exists
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
  },
  down: async (client: pg.PoolClient) => {
    console.warn('[Migration 004] Down migration invoked.');
  },
};
