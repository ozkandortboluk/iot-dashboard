#!/usr/bin/env node
/**
 * One-shot JWT Vault bootstrap. Never extract/evaluate portions of a compiled
 * application bundle: import the Vault service through the normal build graph.
 *
 * Run only in an explicitly provisioned maintenance container with the Vault
 * data volume and encryption_key secret mounted.
 */
import { randomBytes } from 'node:crypto';
import { systemSecretsService } from '../src/server/services/systemSecrets.service.js';

async function main(): Promise<void> {
  const existing = systemSecretsService.getSecret('authentication.jwt_secret')
    || systemSecretsService.getSecret('jwt_secret');

  if (existing) {
    console.log('JWT already present in Vault; preserved.');
    return;
  }

  const secret = randomBytes(32).toString('base64url');
  await systemSecretsService.setSecret('authentication.jwt_secret', secret, {
    category: 'authentication',
    label: 'JWT Secret',
    description: 'Production JWT authentication secret',
    isSensitive: true,
    updatedBy: 'vault_bootstrap_cli',
  });

  if (systemSecretsService.getSecret('authentication.jwt_secret') !== secret) {
    throw new Error('Vault JWT verification failed');
  }
  console.log('JWT written to Vault and verified (value not displayed).');
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error('[VAULT BOOTSTRAP ERROR]', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  },
);
