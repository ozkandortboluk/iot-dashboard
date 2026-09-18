import type pg from 'pg';
import type { Migration } from './types.js';

export const migration002: Migration = {
  version: '002',
  name: 'timescale_hypertables',
  up: async (client: pg.PoolClient) => {
    // 1. Check if TimescaleDB extension is available and functional
    let hasTimescale = false;
    try {
      // Check if extension is already registered in pg_extension
      const extCheck = await client.query("SELECT extversion FROM pg_extension WHERE extname = 'timescaledb';");
      if (extCheck.rows.length > 0) {
        // Extension entry exists in database catalog; verify that the C shared library is accessible
        try {
          await client.query('SELECT timescaledb_version();');
          hasTimescale = true;
        } catch (libErr: any) {
          console.warn('[Migration 002] TimescaleDB extension registered in catalog but library failed to load:', libErr?.message || libErr);
          // Attempt to update the extension to the current container library version
          try {
            await client.query('ALTER EXTENSION timescaledb UPDATE;');
            await client.query('SELECT timescaledb_version();');
            hasTimescale = true;
            console.log('[Migration 002] Successfully updated TimescaleDB extension to current library.');
          } catch (updErr: any) {
            console.warn('[Migration 002] ALTER EXTENSION timescaledb UPDATE failed:', updErr?.message || updErr);
            // Attempt to drop broken catalog entry and recreate with current library
            try {
              console.log('[Migration 002] Attempting to drop broken timescaledb extension catalog entry and reinstall...');
              await client.query('DROP EXTENSION IF EXISTS timescaledb CASCADE;');
              await client.query('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;');
              await client.query('SELECT timescaledb_version();');
              hasTimescale = true;
              console.log('[Migration 002] Successfully reinstalled TimescaleDB extension.');
            } catch (dropErr: any) {
              console.warn('[Migration 002] Recreating TimescaleDB extension was not possible:', dropErr?.message || dropErr);
              hasTimescale = false;
            }
          }
        }
      } else {
        // Extension not in catalog, attempt fresh installation
        try {
          await client.query('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;');
          await client.query('SELECT timescaledb_version();');
          hasTimescale = true;
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
        const fatalErr = new Error(`[Migration 002 FATAL] REQUIRE_TIMESCALE is set to true, but TimescaleDB extension could not be loaded or verified.`);
        console.error(fatalErr.message);
        throw fatalErr;
      }
      console.log('[Migration 002] Running in standard PostgreSQL mode (TimescaleDB extension unavailable, mismatched, or not installed).');
      return;
    }

    // 2. Convert telemetry_readings into hypertable (7 days interval)
    try {
      await client.query(`
        SELECT create_hypertable('telemetry_readings', 'created_at', chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE);
      `);
      console.log('[Migration 002] telemetry_readings hypertable verified with 7-day chunk interval.');
    } catch (err: any) {
      console.error('[Migration 002] create_hypertable on telemetry_readings error:', err?.message || err);
      throw err;
    }

    // 3. Convert simulation_telemetry_readings into hypertable (1 day interval)
    try {
      await client.query(`
        SELECT create_hypertable('simulation_telemetry_readings', 'created_at', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
      `);
      console.log('[Migration 002] simulation_telemetry_readings hypertable verified with 1-day chunk interval.');
    } catch (err: any) {
      console.error('[Migration 002] create_hypertable on simulation_telemetry_readings error:', err?.message || err);
      throw err;
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
      console.warn('[Migration 002] Compression policy setup notice (may be unsupported by current Timescale license/version):', err?.message || err);
    }
  },
  down: async (client: pg.PoolClient) => {
    console.warn('[Migration 002] Down migration invoked.');
  },
};
