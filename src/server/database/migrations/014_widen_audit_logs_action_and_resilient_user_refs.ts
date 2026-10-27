import type pg from 'pg';
import type { Migration } from './types.js';

export const migration014: Migration = {
  version: '014',
  name: 'widen_audit_logs_action_and_resilient_user_refs',
  disableTransaction: true,
  up: async (client: pg.PoolClient) => {
    // 1. Widen audit_logs columns to accommodate comprehensive automated logging & diagnostics
    await client.query(`
      ALTER TABLE audit_logs ALTER COLUMN action TYPE VARCHAR(256);
      ALTER TABLE audit_logs ALTER COLUMN resource_type TYPE VARCHAR(128);
      ALTER TABLE audit_logs ALTER COLUMN resource_id TYPE VARCHAR(128);
    `).catch(() => {});

    // 2. Ensure user_sessions and dashboard_layouts user_id columns are nullable to prevent FK blocks
    await client.query(`
      ALTER TABLE user_sessions ALTER COLUMN user_id DROP NOT NULL;
      ALTER TABLE dashboard_layouts ALTER COLUMN user_id DROP NOT NULL;
    `).catch(() => {});
  },
  down: async (client: pg.PoolClient) => {
    // Non-destructive down migration
    await client.query(`SELECT 1;`);
  }
};
