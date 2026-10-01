# Database Map

## Runtime / PostgreSQL / SSH tunnel
Primary: `src/server/config/runtimeEnvironment.ts`, `src/server/database/connection.ts`, `src/server/services/sshTunnel.service.ts`, `src/server/routes/sshTunnel.ts`.
Secondary: `src/server/database/postgres.ts`, `src/server/db.ts`, `.env.example`, `docker-compose.yml`.
Flow: runtime → connection resolver → dev/AI Studio tunnel only when allowed → PG pool. VPS production must not silently reroute to loopback.
Tests: `runtime_auth_environment.test.ts`, `runtime_auth_isolation.test.ts`, `ssh_host_key_pinning.test.ts`, `docker_postgres_proxy_ws.test.ts`.

## Migration / schema / readiness
Primary: `src/server/database/migrations/migrationRunner.ts`, `postgres.ts`, `canonicalSchema.ts`, `schemaAuditor.ts`.
Secondary: `dataMaintenance.ts`, `databaseAutoHealer.service.ts`, `src/db/schema.ts`, `ddl.sql`, `src/db/timescaledb.sql`, `scripts/verify-schema-drift.ts`.
Tests: `migration_runner_and_schema_drift.test.ts`, `real_postgres_migrations.test.ts`, `db03_db04_migration_readiness_and_session_integrity.test.ts`, `production_db_ready_lifecycle.test.ts`.

## Backup / DB UI
Start: `src/components/database/ScheduledBackupsPanel.tsx`, `src/components/DatabaseDataView.tsx`, `src/server/routes/system.ts`.
Test: `src/tests/backup_restore_migration_upgrade.test.ts`.
