# Safe PostgreSQL connection credential rotation

## Scope and safety boundary

The System Secrets panel can safely rotate the application's connection credentials only when the candidate connection is already valid and points at the existing database endpoint. It does not alter PostgreSQL roles, role passwords, create/rename databases, copy data, or change Docker Compose bootstrap settings.

The POSTGRES_USER, POSTGRES_DB, and POSTGRES_PASSWORD_FILE values in Compose are initialization inputs for a new PostgreSQL data directory; changing them is not a reliable way to rename a role/database or rotate a password on an already initialized TimescaleDB volume. In particular, replacing secrets/postgres_password alone does not change the password stored for an existing PostgreSQL role; the role must be changed on the server, then the application's Vault credential must be updated and tested.

## Changes in this PR

- The legacy `POST /api/database/rotate-password` and `POST /api/database/switch-target` endpoints return `410 Gone`. The app no longer changes PostgreSQL role passwords in place or switches to a different data source through these unverified flows.
- Prepare a least-privilege PostgreSQL role through an operator-controlled database maintenance procedure, then use System Secrets to save its credentials only for the existing host, port, and database after the read-only preflight succeeds.
- Database target changes remain unavailable until a dedicated maintenance workflow can prove target identity and data continuity, verify a restorable backup, drain writes, and validate rollback.
- A candidate PostgreSQL URL is tested before it can replace the active URL.
- A failed candidate test no longer persists the candidate URL or marks a healthy active connection as disconnected.
- Production URL persistence removes the URL password; the encrypted System Secrets Vault remains the authoritative password source.
- Saving a URL or switching the active database engine now requires a successful connection test.
- Saving database credentials from System Secrets first probes the candidate with a short-lived connection, then requires the core NexusNode tables (users, devices, telemetry_readings) to exist.
- If applying the candidate fails to establish the active application pool, the handler attempts to restore the previous Vault/runtime configuration and reconnect to the previous endpoint. A failed rollback returns an explicit maintenance warning.
- The credential form rejects host, port, and database-name changes. These alter the data source, not merely the credentials, and must not be hidden inside a general “Save all” action.
- The admin connection-test endpoint is allowed to run after initial setup; the setup wizard itself remains locked. The route is admin-authenticated and rate-limited.

## Supported rotation procedure

1. Take a fresh database backup and verify it can be read/restored in an isolated environment.
2. For a reversible rotation, create a new least-privilege application role and grant it the required schema/table/sequence privileges. Avoid changing the active role's password in place: that invalidates the old credential and means application-side rollback cannot restore connectivity by itself. If an in-place password change is unavoidable, schedule a maintenance window and have a DBA ready to restore the previous PostgreSQL role password. The panel does not execute ALTER ROLE.
3. In System Secrets, enter the already-valid candidate username/password for the same host, port, and database. Keep the password field masked to preserve the current secret when not rotating it.
4. Save. The application probes the candidate first; failed authentication or missing core tables must leave the previous settings intact.
5. Confirm /api/health/ready, write/read paths, device telemetry ingestion, notifications, and backup jobs. Keep the old PostgreSQL role until this validation period passes.
6. Revoke the old role only after successful verification and after confirming no other service still uses it.

## Database-name changes

A database-name change is deliberately not performed by the generic credential form. Connecting successfully to another database—even one that has the same table names—does not prove that it contains the correct customer, device, telemetry, notification, migration, and audit data.

A future dedicated maintenance workflow must:
- require an explicit maintenance window and a fresh verified backup;
- create a durable operation record and acquire a single-writer maintenance lock;
- validate target identity, schema/migration state, required extensions, table/sequence privileges, and a data-continuity fingerprint before switching;
- drain application writes/queues and connections safely;
- keep the old endpoint and credentials available for rollback;
- change one authoritative runtime configuration source, recycle the pool, and verify readiness plus application-level read/write probes;
- automatically restore the prior configuration if validation fails, while never deleting the old database or role;
- avoid Docker socket access from the web app and avoid placing secrets in command arguments, URLs, logs, audit records, or Git.

If the intended operation is to rename the PostgreSQL database itself, that is a PostgreSQL maintenance operation requiring connection draining and server-side privileges; it is not equivalent to changing the app's configured database name.

## Validation status

Tests were added/updated for local execution. Per project policy, no GitHub Actions or GitHub-hosted tests were run. Run the relevant tests, type-check, lint, and build locally (Windows/Antigravity or a controlled VPS test environment) before considering merge. This PR does not merge or deploy to production.
