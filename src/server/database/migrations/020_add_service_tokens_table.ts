import type pg from 'pg';
import type { Migration } from './types.js';

/**
 * Migration 020: Add Service Tokens Table
 *
 * Creates table for server-to-server AI Studio and external API integration service credentials.
 * Plaintext service tokens (nxs_srv_...) are NEVER stored; only cryptographically secure SHA-256 hashes are stored.
 */
export const migration020: Migration = {
  version: '020',
  name: 'add_service_tokens_table',
  disableTransaction: true,
  up: async (client: pg.PoolClient) => {
    console.log('[Migration 020] Creating service_tokens table and indexes...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS service_tokens (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        token_prefix VARCHAR(32) NOT NULL,
        token_hash VARCHAR(128) NOT NULL UNIQUE,
        user_id VARCHAR(64) NOT NULL,
        tenant_id VARCHAR(64) NOT NULL,
        scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMPTZ,
        last_used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        is_revoked BOOLEAN NOT NULL DEFAULT FALSE
      );

      CREATE INDEX IF NOT EXISTS idx_service_tokens_token_hash ON service_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_service_tokens_tenant_id ON service_tokens(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_service_tokens_user_id ON service_tokens(user_id);
    `);
  },
  down: async (client: pg.PoolClient) => {
    await client.query(`DROP TABLE IF EXISTS service_tokens;`);
  },
};
