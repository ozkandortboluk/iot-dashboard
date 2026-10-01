# Deployment / Security Map

## Runtime / Docker / proxy / health
Primary: `server.ts`, `docker-compose.yml`, `Dockerfile`, `docker/nginx/nginx.conf`, `src/components/DeploymentView.tsx`.
Tests/gates: `docker_postgres_proxy_ws.test.ts`, `graceful_shutdown.test.ts`, `scripts/smoke-test.mjs`, `verify-bundle-parity.ts`, `.github/workflows/ci.yml`.

## Secrets / startup security
Primary: `src/server/services/systemSecrets.service.ts`, `systemKeys.service.ts`, `src/server/utils/crypto.ts`, `startupSecurityPolicy.ts`, `src/server/routes/secrets.ts`.
Tests: `system_secrets_vault.test.ts`, `system_keys_lifecycle.test.ts`, `startup_security_policy.test.ts`.

Production secret/deployment değişikliğinde Docker mount/env/UID izinleri ve restart kalıcılığı birlikte değerlendirilir.
