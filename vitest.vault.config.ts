import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    setupFiles: ['src/tests/vault-test-setup.ts'],
    env: { NODE_ENV: 'test', VITEST: 'true' },
    include: [
      'src/tests/system_secrets_vault.test.ts',
      'src/tests/vault_canonical_single_source.test.ts',
      'src/tests/master_key_persistence.test.ts',
      'src/tests/nginx_scanner_protection.test.ts',
      'src/tests/trust_proxy_policy.test.ts',
      'src/tests/http_origin_security.test.ts',
      'src/tests/ws_upgrade_path.test.ts',
    ],
  },
});
