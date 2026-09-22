import type pg from 'pg';
import type { Migration } from './types.js';

/**
 * Migration 019: Restore & Guarantee Canonical Test Administrator and Device
 *
 * Ensures that the canonical administrator account (usr_test_admin / test@nexusnodeiot.com.tr)
 * and canonical field device (dev_test_01 / dev_key_test_0000000000000000) are ALWAYS
 * active, correctly hashed with 'test1234', and available in PostgreSQL.
 */
export const migration019: Migration = {
  version: '019',
  name: 'restore_canonical_test_entities',
  disableTransaction: true,
  up: async (client: pg.PoolClient) => {
    const isTestOrDev =
      process.env.NODE_ENV !== 'production' ||
      Boolean(process.env.VITEST) ||
      process.env.ENABLE_TEST_ACCOUNT === 'true';

    if (!isTestOrDev) {
      console.log(
        '[Migration 019] Production environment detected (NODE_ENV=production). Skipping canonical test entities restoration.'
      );
      return;
    }

    console.log('[Migration 019] Restoring and guaranteeing canonical test administrator and device...');

    const CANONICAL_PASSWORD_HASH = '$2b$10$IliwfVRhhq.l39y0sF3qmu/ff6/3GDtHoDXnq9BimrnDqsaIuW/z.';
    const CANONICAL_API_KEY = 'dev_key_test_0000000000000000';
    const CANONICAL_KEY_HASH = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';

    // 1. Ensure usr_test_admin (test@nexusnodeiot.com.tr)
    await client.query(
      `
      INSERT INTO users (
        id, name, email, password_hash, role, company_name, status, created_at, updated_at
      )
      VALUES (
        'usr_test_admin',
        'Kanonik Test Yöneticisi',
        'test@nexusnodeiot.com.tr',
        $1,
        'admin',
        'NexusNode Test Laboratuvarı',
        'active',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (id) DO UPDATE SET
        email = 'test@nexusnodeiot.com.tr',
        password_hash = $1,
        role = 'admin',
        status = 'active',
        deleted_at = NULL,
        updated_at = CURRENT_TIMESTAMP;
      `,
      [CANONICAL_PASSWORD_HASH]
    );

    // 2. Ensure default admin (admin@system.local) as secondary system account
    await client.query(
      `
      INSERT INTO users (
        id, name, email, password_hash, role, company_name, status, created_at, updated_at
      )
      VALUES (
        'usr_admin',
        'Sistem Yöneticisi',
        'admin@system.local',
        $1,
        'admin',
        'Merkez Sistem',
        'active',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (id) DO UPDATE SET
        status = 'active',
        password_hash = COALESCE(users.password_hash, $1),
        deleted_at = NULL,
        updated_at = CURRENT_TIMESTAMP;
      `,
      [CANONICAL_PASSWORD_HASH]
    );

    // 3. Ensure dev_test_01
    await client.query(
      `
      INSERT INTO devices (
        id, tenant_id, user_id, name, device_type, role_key,
        api_key, api_key_hash, api_key_prefix, status, rate_limit_per_min,
        encryption_method, heartbeat_timeout_seconds, expected_interval_seconds, created_at
      )
      VALUES (
        'dev_test_01',
        'usr_test_admin',
        'usr_test_admin',
        'Kanonik Saha Test Cihazı (ESP32)',
        'ESP32',
        'production_sensor',
        $1,
        $2,
        'dev_key_test',
        'online',
        300,
        'AES-256-GCM',
        60,
        10,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (id) DO UPDATE SET
        api_key = $1,
        api_key_hash = $2,
        api_key_prefix = 'dev_key_test',
        status = 'online',
        updated_at = CURRENT_TIMESTAMP;
      `,
      [CANONICAL_API_KEY, CANONICAL_KEY_HASH]
    );

    console.log('[Migration 019] Canonical test entities successfully guaranteed in PostgreSQL.');
  },
  down: async (client: pg.PoolClient) => {
    await client.query(`SELECT 1;`);
  },
};
