import type pg from 'pg';
import type { Migration } from './types.js';

/**
 * Migration 017: Simplify Telemetry Readings Tables & Remove Redundant Columns
 *
 * Removes obsolete and duplicate columns from telemetry_readings and simulation_telemetry_readings:
 * - Duplicate identity columns: customer_id, user_id (tenant_id is the canonical tenant owner)
 * - Redundant static environment column: environment (source indicates physical vs simulator)
 * - Redundant field in physical telemetry: simulation_run_id (only applicable to simulation sandbox)
 * - Drops obsolete indices on customer_id and environment
 */
export const migration017: Migration = {
  version: '017',
  name: 'simplify_telemetry_readings_table',
  disableTransaction: true,
  up: async (client: pg.PoolClient) => {
    console.log('[Migration 017] Simplifying telemetry_readings and simulation_telemetry_readings tables...');

    // 1. Drop redundant indices first
    const indicesToDrop = [
      'idx_telemetry_customer_device_time',
      'idx_telemetry_customer_time',
      'idx_telemetry_source_env',
      'idx_sim_telemetry_customer_device_time',
      'idx_sim_telemetry_customer_time',
    ];

    for (const idx of indicesToDrop) {
      await client.query(`DROP INDEX IF EXISTS ${idx};`).catch((err) => {
        console.warn(`[Migration 017] Warning dropping index ${idx}:`, err.message);
      });
    }

    // 2. Drop redundant columns from telemetry_readings
    const telemetryColsToDrop = ['customer_id', 'user_id', 'environment', 'simulation_run_id'];
    for (const col of telemetryColsToDrop) {
      await client.query(`ALTER TABLE telemetry_readings DROP COLUMN IF EXISTS ${col};`).catch((err) => {
        console.warn(`[Migration 017] Warning dropping column ${col} from telemetry_readings:`, err.message);
      });
    }

    // 3. Drop redundant columns from simulation_telemetry_readings
    const simTelemetryColsToDrop = ['customer_id', 'user_id', 'environment'];
    for (const col of simTelemetryColsToDrop) {
      await client.query(`ALTER TABLE simulation_telemetry_readings DROP COLUMN IF EXISTS ${col};`).catch((err) => {
        console.warn(`[Migration 017] Warning dropping column ${col} from simulation_telemetry_readings:`, err.message);
      });
    }

    console.log('[Migration 017] Telemetry readings tables simplification completed successfully.');
  },
  down: async (client: pg.PoolClient) => {
    await client.query(`SELECT 1;`);
  }
};
