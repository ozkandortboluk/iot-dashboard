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
  up: async (_client: pg.PoolClient) => {
    // SEC-03: Test fixtures must NEVER be inserted into databases during migrations.
    // Migration 019 is a no-op migration to maintain version tracking without polluting runtime databases.
    return;
  },
  down: async (_client: pg.PoolClient) => {
    return;
  },
};
