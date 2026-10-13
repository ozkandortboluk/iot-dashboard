import type pg from 'pg';
import type { Migration } from './types.js';

export const migration002: Migration = {
  version: '002',
  name: 'timescale_hypertables',
  disableTransaction: true,
  canonicalChecksum: 'ebef955ae78cd1c312e43f19f8eabb2e',
  acceptedHistoricalChecksums: ['ebef955ae78cd1c312e43f19f8eabb2e'],
  up: async (client: pg.PoolClient) => {
    // 0. Ensure no stale aborted transaction on the client connection
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore
    }

    // 1. Detect TimescaleDB using its catalog and supported hypertable API.
    // timescaledb_version() is not provided by TimescaleDB 2.30.1.
    let hasTimescale = false;
    let timescaleVersion = '';

    try {
      let extCheck = await client.query("SELECT extversion FROM pg_extension WHERE extname = 'timescaledb';");
      if (extCheck.rows.length === 0) {
        await client.query('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;');
        extCheck = await client.query("SELECT extversion FROM pg_extension WHERE extname = 'timescaledb';");
      }
      if (extCheck.rows.length > 0) {
        timescaleVersion = extCheck.rows[0].extversion;
        const apiCheck = await client.query(
          "SELECT to_regprocedure('create_hypertable(regclass,name,boolean,boolean)') IS NOT NULL AS available"
        );
        // Function signatures differ between TimescaleDB releases; use pg_proc
        // to verify API presence without invoking a mutating function.
        const procCheck = await client.query(
          "SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_hypertable' AND pg_function_is_visible(oid)) AS available"
        );
        hasTimescale = Boolean(apiCheck.rows[0]?.available || procCheck.rows[0]?.available);
        if (hasTimescale) console.log(`[Migration 002] TimescaleDB extension v${timescaleVersion} is available.`);
        else console.warn('[Migration 002] TimescaleDB extension exists but create_hypertable API is unavailable.');
      }
    } catch (err: any) {
      console.warn('[Migration 002] TimescaleDB detection error:', err?.message || err);
      hasTimescale = false;
    }

    if (!hasTimescale) {
      if (process.env.REQUIRE_TIMESCALE === 'true') {
        const fatalErr = new Error('[Migration 002 FATAL] REQUIRE_TIMESCALE is set to true, but TimescaleDB extension could not be loaded or verified.');
        console.error(fatalErr.message);
        throw fatalErr;
      }
      console.log('[Migration 002] Running in standard PostgreSQL mode (TimescaleDB extension unavailable or not installed).');
      return;
    }

    // 2. Convert telemetry_readings into hypertable (7 days interval)
    try {
      let alreadyHypertable = false;
      try {
        const htCheck = await client.query(`
          SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'telemetry_readings';
        `);
        alreadyHypertable = htCheck.rows.length > 0;
      } catch {
        // timescaledb_information view may not exist on older versions, fallback to create_hypertable if_not_exists
      }

      if (!alreadyHypertable) {
        await client.query(`
          SELECT create_hypertable('telemetry_readings', 'created_at', chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE);
        `);
        console.log('[Migration 002] telemetry_readings converted to hypertable with 7-day chunk interval.');
      } else {
        console.log('[Migration 002] telemetry_readings is already a TimescaleDB hypertable.');
      }
    } catch (err: any) {
      const isAlready =
        err?.message?.includes('already a hypertable') ||
        err?.message?.includes('is already partitioned');
      if (!isAlready) {
        console.error('[Migration 002 FATAL] Failed to create hypertable for telemetry_readings:', err?.message || err);
        throw err;
      }
    }

    // 3. Convert simulation_telemetry_readings into hypertable (1 day interval)
    try {
      let alreadyHypertable = false;
      try {
        const htCheck = await client.query(`
          SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'simulation_telemetry_readings';
        `);
        alreadyHypertable = htCheck.rows.length > 0;
      } catch {
        // fallback
      }

      if (!alreadyHypertable) {
        await client.query(`
          SELECT create_hypertable('simulation_telemetry_readings', 'created_at', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
        `);
        console.log('[Migration 002] simulation_telemetry_readings converted to hypertable with 1-day chunk interval.');
      } else {
        console.log('[Migration 002] simulation_telemetry_readings is already a TimescaleDB hypertable.');
      }
    } catch (err: any) {
      const isAlready =
        err?.message?.includes('already a hypertable') ||
        err?.message?.includes('is already partitioned');
      if (!isAlready) {
        console.error('[Migration 002 FATAL] Failed to create hypertable for simulation_telemetry_readings:', err?.message || err);
        throw err;
      }
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
      const isIgnorable =
        err?.message?.includes('already exists') ||
        err?.message?.includes('unsupported') ||
        err?.message?.includes('license');
      if (isIgnorable) {
        console.warn('[Migration 002] Compression policy notice (skipping):', err?.message || err);
      } else {
        console.error('[Migration 002 FATAL] Compression configuration failed on TimescaleDB:', err?.message || err);
        throw err;
      }
    }
  },
  down: async (_client: pg.PoolClient) => {
    console.warn('[Migration 002] Down migration invoked.');
  },
};
