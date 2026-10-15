# DR-01 / DR-02 — Production backup and recovery acceptance

Status: **PARTIAL IMPLEMENTATION — DO NOT DEPLOY THIS BRANCH WITHOUT THE PRE-DEPLOY COPY.** No production restore has been executed or verified. Keep the PR in draft.

## Verified from repository and the operator's VPS mounts (2026-10-15)

- PostgreSQL: `iot-dashboard_timescaledb_data` mounted at `/var/lib/postgresql/data`.
- Application state: `iot-dashboard_app_data` mounted at `/app/data`. Vault's encrypted `.system_secrets.json` belongs here.
- Host secrets: `./secrets/encryption_key` and `./secrets/postgres_password` bind-mounted from the VPS project directory. Never commit, log, or paste their contents.
- Historical application-generated SQL backups: `/app/backups` was **not** mounted; historical firmware files: `/app/uploads/firmware` was **not** mounted. Both were exposed to container recreation.
- Installer `./install.sh --backup` creates `./backups/nexus_backup_*.tar.gz` (SQL + `/app/data`), but deliberately **excludes** root encryption key and PostgreSQL bootstrap secret. `./install.sh --restore` is intentionally disabled.
- `./install.sh --restore-check` only checks archive format, not an actual restored database.
- The SQL backup UI checks structure/marker, not a successful DB restore. Its backup is **not** a complete disaster-recovery bundle.
- The 2026-10-12 `deploy-backup-*` directory seen on the VPS contained only metadata (20 KB). Other unseen backups might exist.

## This branch

- Stores application-generated SQL backups in the existing `/app/data/backups` persistent volume in production.
- Stores firmware binaries in the existing `/app/data/uploads/firmware` persistent volume in production, supporting old `/app/uploads/firmware/<id>.bin` metadata paths **after a one-time copy**.
- Prevents legacy web restore from modifying a *live production DB* until maintenance-window recovery, complete backup validation, and isolated restore testing are implemented.
- No longer labels a structural SQL check as 100% disaster recovery readiness.
- Does not rotate any existing keys, reset DB, create volumes, or run a restore.

## Mandatory **before first deployment** of this branch

Run from `/opt/iot-dashboard/iot-dashboard` **while the old app container is still running and before `docker compose up -d --build`**. First inspect source and target file counts:

```bash
docker compose exec -T app sh -c '
  for d in /app/backups /app/uploads/firmware /app/data/backups /app/data/uploads/firmware; do
    echo "$d:"
    if [ -d "$d" ]; then find "$d" -type f | wc -l; else echo MISSING; fi
  done
'
```

If old files exist, copy them (non-destructive; `-n` does not overwrite existing files):

```bash
docker compose exec -T app sh -c '
  set -eu
  mkdir -p /app/data/backups /app/data/uploads/firmware
  if [ -d /app/backups ]; then cp -an /app/backups/. /app/data/backups/; fi
  if [ -d /app/uploads/firmware ]; then cp -an /app/uploads/firmware/. /app/data/uploads/firmware/; fi
'
```

**Verify every migrated file by byte size and SHA-256 before deployment.** If any differ or cannot be copied, stop; do not recreate the app container. When uncertain, copy the complete container's historical paths to a protected host location before deployment. This branch must not be deployed by a blind `git pull && docker compose up -d --build` without this first-time migration.

## Backups required for genuine recovery

1. A PostgreSQL **consistent** dump (including TimescaleDB hypertable rows, tenant records, identities, schema and roles/extensions provisioning notes). Use PostgreSQL 16-compatible utilities.
2. An application volume snapshot covering Vault, metadata and persisted firmware. Prefer a coordinated backup, with writers quiesced or a documented consistency boundary.
3. Separately encrypted offline copies of the **existing** root encryption key, PostgreSQL bootstrap credential, `.env`, and any OTA signing identity/trust-chain material. Do not regenerate a key when encrypted data already exists.
4. SHA-256 manifest of every archive and an off-VPS encrypted copy with retention controls and restrictive permissions.
5. A tested isolated restore to a disposable PostgreSQL/TimescaleDB environment. Validate users, tenants, devices, telemetry/hypertables, firmware hash/signatures, Vault decryptability and app readiness. Confirm the original VPS is unchanged.

The `pg_dump` command's success and a matching checksum demonstrate *backup completion/integrity*, **not restorability**. Do not promise zero data loss: acceptable RPO depends on backup frequency and telemetry ingested after the last backup.

## Remaining acceptance work (DR-01 / DR-02)

- Implement a host-side pre-update backup script that collects the DB, app_data, required host config/secrets safely, verifies checksums, fails closed, and retains copies outside the VPS.
- Support scheduled encrypted off-host backups, failure alerting, pruning *only after* a successful verified backup, and disk space monitoring.
- Build a separately tested **offline restore tool** with explicit target checks, dry-run validation, clean isolated DB restore, version/extension compatibility checks and firmware + Vault restore evidence. Never auto-run restore on production.
- Cover first deployment migration, container recreate, host replacement, key mismatch, corrupt/truncated archives, interrupted backup, and backup restore consistency in real integration tests.
- Inventory other non-database artifacts (uploads, logs, certificates, host Nginx and installed job schedules) before claiming full disaster-recovery coverage.
- Existing test `src/tests/backup_restore_migration_upgrade.test.ts` uses mock/legacy JSON paths; it does not prove a complete production restore.

Until the above tests pass on disposable infrastructure, mark **DR-01 and DR-02 OPEN**, and keep this PR draft.
