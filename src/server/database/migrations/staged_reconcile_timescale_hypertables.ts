/**
 * STAGED MIGRATION — NOT ACTIVE
 *
 * This file is deliberately NOT imported into migrationRunner.ALL_MIGRATIONS.
 * Migration 023 can fail on populated non-hypertable telemetry tables, so it
 * must not execute during production startup or automatic database setup.
 * Enable only after isolated PostgreSQL/Timescale integration verification
 * and a reviewed data-preserving conversion/rollback plan.
 *
 * Retained here so the unfinished migration branch can be retired safely.
 */
import type pg from 'pg';
import type { Migration } from './types.js';

/**
 * Repairs TimescaleDB setup for databases where migration 002 incorrectly
 * treated a working extension as unavailable. Historical migrations stay frozen.
 */
export const migration023: Migration = {
  version: '023',
  name: 'reconcile_timescale_hypertables',
  disableTransaction: true,
  up: async (client: pg.PoolClient) => {
    const extension = await client.query(
      "SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'"
    );
    if (!extension.rowCount) {
      if (process.env.REQUIRE_TIMESCALE === 'true') {
        throw new Error('[Migration 023] TimescaleDB is required but not installed');
      }
      console.warn('[Migration 023] TimescaleDB not installed; keeping standard PostgreSQL tables.');
      return;
    }

    const api = await client.query(
      "SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_hypertable' AND pg_function_is_visible(oid)) AS available"
    );
    if (!api.rows[0]?.available) {
      throw new Error('[Migration 023] TimescaleDB installed but create_hypertable is unavailable');
    }

    for (const [table, interval] of [
      ['telemetry_readings', '7 days'],
      ['simulation_telemetry_readings', '1 day'],
    ]) {
      const existing = await client.query(
        'SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_schema = current_schema() AND hypertable_name = $1',
        [table]
      );
      if (existing.rowCount) continue;

      const tableExists = await client.query('SELECT to_regclass($1) AS relation', [table]);
      if (!tableExists.rows[0]?.relation) {
        throw new Error(`[Migration 023] Missing telemetry table: ${table}`);
      }

      // Never silently rewrite a populated production table. A data-preserving
      // conversion needs a separately reviewed maintenance window.
      const data = await client.query(`SELECT EXISTS (SELECT 1 FROM "${table}" LIMIT 1) AS populated`);
      if (data.rows[0]?.populated) {
        throw new Error(`[Migration 023] ${table} contains data; manual data-preserving hypertable conversion required`);
      }

      await client.query(
        'SELECT create_hypertable($1::regclass, $2::name, chunk_time_interval => $3::interval, if_not_exists => TRUE)',
        [table, 'created_at', interval]
      );
      console.log(`[Migration 023] Converted ${table} into a TimescaleDB hypertable.`);
    }
  },
};
