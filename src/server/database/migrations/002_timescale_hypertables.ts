import type pg from 'pg';
import type { Migration } from './types.js';

export const migration002: Migration = {
  version: '002',
  name: 'timescale_hypertables',
  disableTransaction: true,
  up: async (client: pg.PoolClient) => {
    // 0. Ensure no stale aborted transaction on the client connection
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore
    }

    // 1. Check if TimescaleDB extension is available and functional
    let hasTimescale = false;
    let timescaleVersion = '';

    try {
      const extCheck = await client.query("SELECT extversion FROM pg_extension WHERE extname = 'timescaledb';");
      if (extCheck.rows.length > 0) {
        try {
          const vRes = await client.query('SELECT timescaledb_version();');
          hasTimescale = true;
          timescaleVersion = vRes.rows[0]?.timescaledb_version || extCheck.rows[0]?.extversion;
          console.log(`[Migration 002] TimescaleDB extension v${timescaleVersion} is functional.`);
        } catch (libErr: any) {
          console.warn('[Migration 002] TimescaleDB extension in catalog but library call failed:', libErr?.message || libErr);
          try {
            await client.query('ALTER EXTENSION timescaledb UPDATE;');
            const vRes = await client.query('SELECT timescaledb_version();');
            hasTimescale = true;
            timescaleVersion = vRes.rows[0]?.timescaledb_version || '';
            console.log(`[Migration 002] Successfully updated TimescaleDB extension to v${timescaleVersion}.`);
          } catch (updErr: any) {
            console.warn('[Migration 002] ALTER EXTENSION timescaledb UPDATE failed:', updErr?.message || updErr);
            hasTimescale = false;
          }
        }
      } else {
        // Extension not in catalog, attempt installation
        try {
          await client.query('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;');
          const vRes = await client.query('SELECT timescaledb_version();');
          hasTimescale = true;
          timescaleVersion = vRes.rows[0]?.timescaledb_version || '';
          console.log(`[Migration 002] Successfully installed TimescaleDB extension v${timescaleVersion}.`);
        } catch (createErr: any) {
          console.warn('[Migration 002] CREATE EXTENSION timescaledb failed:', createErr?.message || createErr);
          hasTimescale = false;
        }
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
      // Check if already registered as hypertable
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
      console.warn('[Migration 002] create_hypertable telemetry_readings notice:', err?.message || err);
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
      console.warn('[Migration 002] create_hypertable simulation_telemetry_readings notice:', err?.message || err);
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
      console.warn('[Migration 002] Compression policy notice (skipping, may be unsupported by community license or already configured):', err?.message || err);
    }
  },
  down: async (client: pg.PoolClient) => {
    console.warn('[Migration 002] Down migration invoked.');
  },
};
