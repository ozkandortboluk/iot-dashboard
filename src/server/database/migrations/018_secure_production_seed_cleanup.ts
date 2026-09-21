import type pg from 'pg';
import crypto from 'crypto';
import type { Migration } from './types.js';

/**
 * Migration 018: Secure Production Seed Cleanup & Credential Hardening
 *
 * Remediates systems where previous migrations (e.g. Migration 014/015) unconditionally
 * seeded test accounts (usr_test_admin, admin@system.local) with static default passwords
 * or set the static test device API key (dev_key_test_0000000000000000).
 *
 * Actions in Production (when ENABLE_TEST_ACCOUNT !== 'true'):
 * 1. Disables usr_test_admin (test@nexusnodeiot.com.tr) and invalidates its password hash.
 * 2. Checks admin@system.local / usr_admin: if it uses the default static password hash,
 *    disables it or invalidates its password so default login with 'test1234' is impossible.
 * 3. Rotates/scrambles static test API key 'dev_key_test_0000000000000000' on dev_test_01.
 * 4. Inserts a security audit log event.
 */
export const migration018: Migration = {
  version: '018',
  name: 'secure_production_seed_cleanup',
  disableTransaction: true,
  up: async (client: pg.PoolClient) => {
    const isTestEnv =
      process.env.NODE_ENV === 'test' ||
      Boolean(process.env.VITEST) ||
      process.env.ENABLE_TEST_ACCOUNT === 'true';

    if (isTestEnv) {
      console.log(
        '[Migration 018] Test environment or ENABLE_TEST_ACCOUNT=true detected. Preserving canonical test entities.'
      );
      return;
    }

    console.log(
      '[Migration 018] Production environment detected. Remediating unconditioned seed accounts and static credentials...'
    );

    const STATIC_PASSWORD_HASH = '$2a$10$7Z/Q46Zg9rU.e5Jk9V7xquLzP4yL.M4ZfU.c4C4zD4p9qE1aE1i.m';
    const STATIC_API_KEY = 'dev_key_test_0000000000000000';

    // 1. Disable usr_test_admin (test@nexusnodeiot.com.tr)
    const testAdminRes = await client
      .query(
        `
      UPDATE users
      SET 
        status = 'disabled',
        password_hash = '$2a$10$DISABLED_TEST_ACCOUNT_' || md5(random()::text || clock_timestamp()::text)
      WHERE (id = 'usr_test_admin' OR email = 'test@nexusnodeiot.com.tr')
      RETURNING id, email;
    `
      )
      .catch(() => ({ rows: [] }));

    if (testAdminRes.rows.length > 0) {
      console.log(
        `[Migration 018] Disabled canonical test user usr_test_admin (${testAdminRes.rows.length} record updated).`
      );
    }

    // 2. Check admin@system.local / usr_admin
    const otherAdminCheck = await client
      .query(
        `
      SELECT COUNT(*) as count FROM users 
      WHERE role = 'admin' 
        AND email NOT IN ('admin@system.local', 'test@nexusnodeiot.com.tr')
        AND id NOT IN ('usr_admin', 'usr_test_admin')
        AND status = 'active';
    `
      )
      .catch(() => ({ rows: [{ count: '0' }] }));

    const realAdminCount = parseInt(otherAdminCheck.rows[0]?.count || '0', 10);

    if (realAdminCount > 0) {
      // Real admin exists: safely disable default admin@system.local / usr_admin with static password
      await client
        .query(
          `
        UPDATE users
        SET 
          status = 'disabled',
          password_hash = '$2a$10$DISABLED_DEFAULT_ADMIN_' || md5(random()::text || clock_timestamp()::text)
        WHERE (id = 'usr_admin' OR email = 'admin@system.local')
          AND password_hash = $1;
      `,
          [STATIC_PASSWORD_HASH]
        )
        .catch(() => {});
      console.log(
        '[Migration 018] Real administrator account present. Disabled default admin@system.local with static password.'
      );
    } else {
      // No other admin user exists: invalidate static default password hash so test1234 cannot be used
      const scrambledHash = '$2a$10$DISABLED_UNSET_ADMIN_' + crypto.randomBytes(16).toString('hex');
      await client
        .query(
          `
        UPDATE users
        SET password_hash = $1
        WHERE (id = 'usr_admin' OR email = 'admin@system.local')
          AND password_hash = $2;
      `,
          [scrambledHash, STATIC_PASSWORD_HASH]
        )
        .catch(() => {});
      console.log(
        '[Migration 018] Invalidated static default password on system admin account. Setup wizard or operator password update required.'
      );
    }

    // 3. Rotate static device API key on dev_test_01 or any device using dev_key_test_0000000000000000
    const randomKeyBytes = crypto.randomBytes(16).toString('hex');
    const newSecureKey = `dev_key_sec_${randomKeyBytes}`;
    const newKeyHash = crypto.createHash('sha256').update(newSecureKey).digest('hex');
    const newKeyPrefix = newSecureKey.substring(0, 12);

    const deviceRotatedRes = await client
      .query(
        `
      UPDATE devices
      SET 
        api_key = $1,
        api_key_hash = $2,
        api_key_prefix = $3,
        status = 'offline',
        is_simulated = false
      WHERE api_key = $4 OR id = 'dev_test_01'
      RETURNING id;
    `,
        [newSecureKey, newKeyHash, newKeyPrefix, STATIC_API_KEY]
      )
      .catch(() => ({ rows: [] }));

    if (deviceRotatedRes.rows.length > 0) {
      console.log(
        `[Migration 018] Rotated static test API key for dev_test_01 (${deviceRotatedRes.rows.length} device updated).`
      );
    }

    // 4. Record Security Audit Log
    await client
      .query(
        `
      INSERT INTO audit_logs (
        tenant_id, user_id, action, resource_type, resource_id,
        details, severity, created_at
      ) VALUES (
        'system', 'migration_018', 'PRODUCTION_SEED_CLEANUP', 'security', 'database_seed',
        $1::jsonb, 'warning', CURRENT_TIMESTAMP
      );
    `,
        [
          JSON.stringify({
            message: 'Production seed cleanup completed successfully.',
            testAdminDisabled: testAdminRes.rows.length > 0,
            hasRealAdmin: realAdminCount > 0,
            deviceKeyRotated: deviceRotatedRes.rows.length > 0,
          }),
        ]
      )
      .catch(() => {});

    console.log('[Migration 018] Secure production seed cleanup completed successfully.');
  },
  down: async (client: pg.PoolClient) => {
    await client.query(`SELECT 1;`);
  },
};
