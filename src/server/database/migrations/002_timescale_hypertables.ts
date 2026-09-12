import type pg from 'pg';
import type { Migration } from './types.js';

export const migration002: Migration = {
  version: '002',
  name: 'timescale_hypertables',
  up: async (client: pg.PoolClient) => {
    // 1. Check if TimescaleDB extension is available
    let hasTimescale = false;
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;');
      hasTimescale = true;
    } catch (err: any) {
      console.warn('[Migration 002] TimescaleDB extension could not be enabled:', err?.message || err);
    }

    if (!hasTimescale) {
      console.log('[Migration 002] Running in standard PostgreSQL mode (TimescaleDB unavailable).');
      return;
    }

    // 2. Convert telemetry_readings into hypertable (7 days interval)
    try {
      await client.query(`
        SELECT create_hypertable('telemetry_readings', 'created_at', chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE);
      `);
      console.log('[Migration 002] telemetry_readings hypertable verified with 7-day chunk interval.');
    } catch (err: any) {
      console.warn('[Migration 002] create_hypertable on telemetry_readings notice:', err?.message || err);
    }

    // 3. Convert simulation_telemetry_readings into hypertable (1 day interval)
    try {
      await client.query(`
        SELECT create_hypertable('simulation_telemetry_readings', 'created_at', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
      `);
      console.log('[Migration 002] simulation_telemetry_readings hypertable verified with 1-day chunk interval.');
    } catch (err: any) {
      console.warn('[Migration 002] create_hypertable on simulation_telemetry_readings notice:', err?.message || err);
    }

    // 4. Configure compression policies on TimescaleDB if supported
    try {
      await client.query(`
        ALTER TABLE telemetry_readings SET (
          timescaledb.compress,
          timescaledb.compress_segmentby = 'device_id, metric',
          timescaledb.compress_orderby = 'created_at DESC'
        );
      `);
      await client.query(`
        SELECT add_compression_policy('telemetry_readings', INTERVAL '7 days', if_not_exists => TRUE);
      `);
      console.log('[Migration 002] Compression policy enabled on telemetry_readings (7 days).');
    } catch (err: any) {
      // Compression might already be enabled or not supported in some PG configurations
      console.log('[Migration 002] Notice on compression policy setup:', err?.message || err);
    }
  },
  down: async (client: pg.PoolClient) => {
    console.warn('[Migration 002] Down migration invoked.');
  },
};
