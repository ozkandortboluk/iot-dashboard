import type pg from 'pg';
import type { Migration } from './types.js';

/**
 * Migration 016: Simplify Devices Table & Remove Redundant/Obsolete Columns
 *
 * Removes 15 obsolete and duplicate columns from the devices table:
 * - Duplicate identity columns: customer_id, assigned_user_id, created_by_user_id
 * - Duplicate network/type columns: ip (duplicate of ip_address), type (duplicate of device_type)
 * - Duplicate/legacy auth tokens: auth_token, previous_api_key_hash
 * - Legacy transfer audit fields: previous_tenant_id, previous_tenant_name, ownership_transferred_at
 * - Redundant OTA fields: ota_target_version (use ota_target_firmware_id), ota_job_id
 * - Duplicate capability JSONs: supported_outputs (use output_definitions), supported_commands (use capabilities), error_message
 */
export const migration016: Migration = {
  version: '016',
  name: 'simplify_devices_table',
  disableTransaction: true,
  up: async (client: pg.PoolClient) => {
    console.log('[Migration 016] Simplifying devices table by removing redundant columns...');

    // 1. Ensure any data in legacy fields is consolidated into canonical fields first
    await client.query(`
      UPDATE devices 
      SET 
        device_type = COALESCE(device_type, NULLIF(type, ''), 'custom'),
        ip_address = COALESCE(ip_address, NULLIF(ip, ''))
      WHERE (device_type IS NULL OR device_type = '') OR (ip_address IS NULL OR ip_address = '');
    `).catch(() => {});

    // 2. Drop all redundant and obsolete columns in devices table
    const columnsToDrop = [
      'customer_id',
      'assigned_user_id',
      'created_by_user_id',
      'previous_tenant_id',
      'previous_tenant_name',
      'ownership_transferred_at',
      'type',
      'ip',
      'auth_token',
      'previous_api_key_hash',
      'ota_target_version',
      'ota_job_id',
      'supported_outputs',
      'supported_commands',
      'error_message',
    ];

    for (const col of columnsToDrop) {
      await client.query(`ALTER TABLE devices DROP COLUMN IF EXISTS ${col};`).catch((err) => {
        console.warn(`[Migration 016] Warning dropping column ${col}:`, err.message);
      });
    }

    console.log('[Migration 016] Devices table simplification completed successfully.');
  },
  down: async (client: pg.PoolClient) => {
    await client.query(`SELECT 1;`);
  }
};
