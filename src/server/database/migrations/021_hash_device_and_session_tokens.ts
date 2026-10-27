import type pg from 'pg';
import type { Migration } from './types.js';

/**
 * Migration 021: Hash Device API Keys and User Session Tokens
 *
 * Enforces zero-plaintext credential storage for both Device API Keys and User Sessions.
 * Only cryptographic SHA-256 hashes and non-sensitive prefixes are stored in PostgreSQL.
 * Plaintext keys are wiped from persistent storage.
 */
export const migration021: Migration = {
  version: '021',
  name: 'hash_device_and_session_tokens',
  disableTransaction: true,
  up: async (client: pg.PoolClient) => {
    console.log('[Migration 021] Upgrading user_sessions and devices to hashed token security model...');

    // 1. Upgrade user_sessions table
    await client.query(`
      ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS token_hash VARCHAR(128);
      ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS token_prefix VARCHAR(32);
      ALTER TABLE user_sessions ALTER COLUMN token DROP NOT NULL;
    `);

    // Populate token_hash and token_prefix for any existing sessions
    await client.query(`
      UPDATE user_sessions 
      SET 
        token_hash = encode(sha256(token::bytea), 'hex'),
        token_prefix = substring(token from 1 for 10)
      WHERE token_hash IS NULL AND token IS NOT NULL AND token <> '';
    `);

    // Create indexes and constraints on token_hash
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);
    `);

    // Clean up raw tokens from user_sessions
    await client.query(`
      UPDATE user_sessions SET token = NULL WHERE token_hash IS NOT NULL;
    `);

    // 2. Upgrade devices table: ensure all devices have api_key_hash & api_key_prefix
    await client.query(`
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_hash VARCHAR(128);
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_key_prefix VARCHAR(32);
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS previous_api_key_hash VARCHAR(128);
      ALTER TABLE devices ALTER COLUMN api_key DROP NOT NULL;
    `);

    await client.query(`
      UPDATE devices 
      SET 
        api_key_hash = encode(sha256(api_key::bytea), 'hex'),
        api_key_prefix = substring(api_key from 1 for 12)
      WHERE (api_key_hash IS NULL OR api_key_hash = '') AND api_key IS NOT NULL AND api_key <> '';
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_devices_api_key_hash ON devices(api_key_hash);
    `);

    // Wipe raw plaintext api_key from devices table
    await client.query(`
      UPDATE devices SET api_key = NULL WHERE api_key_hash IS NOT NULL;
    `);

    console.log('[Migration 021] User session tokens and Device API keys successfully hashed and sanitized.');
  },
  down: async (_client: pg.PoolClient) => {
    // No-op for down migration to prevent security regression
  },
};
