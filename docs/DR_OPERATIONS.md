# DR operational runbook (DR-01 and DR-02)

**Status: code prepared in draft PR #18; no VPS restore drill has been performed. Do not deploy until all acceptance gates pass.**

## Backup coverage and trust

The recovery script scripts/dr/nexus-dr.sh backs up a PostgreSQL 16 / TimescaleDB database with consistent pg_dump custom format, the persistent app volume (Vault, metadata and firmware), historic ephemeral application backups and firmware, plus original root encryption key, PostgreSQL bootstrap password, .env and Compose/Nginx configuration. Every file is hashed in a manifest and the Vault records are AES-256-GCM authenticated with the original root key.

The entire bundle, including secrets, is encrypted using age recipients. Retain the *private* age identity OFF the VPS, in two independent secure places; only the public recipient may go to the server. Rclone offsite destination must be independent of the VPS. A remote copy is read back and SHA-256 verified. The emergency --local-only mode does not satisfy safe-update.

## VPS setup, only in a planned change window

1. Install age, rclone and Python 3; confirm free disk capacity for staging and an independent offsite rclone remote. Keep a provider snapshot independently.
2. On an offline trusted machine generate identity with: age-keygen -o recovery-identity.txt . Export public recipient with: age-keygen -y recovery-identity.txt . Put only the public recipient at /etc/nexusnode/dr-recipients.txt on the VPS.
3. Create root-owned mode 0600 /etc/nexusnode/dr.conf with DR_BACKUP_DIR=/var/backups/nexusnode, DR_RECIPIENTS_FILE=/etc/nexusnode/dr-recipients.txt, DR_OFFSITE_REMOTE=your-remote:nexusnode/production, DR_LOCAL_KEEP=7 and DR_MIN_FREE_MB=2048. Set DR_ALERT_EMAIL only after configuring and testing a local mail transport.
4. BEFORE recreating the old app container, preserve the old container's /app/backups and /app/uploads/firmware paths: first run sudo bash scripts/dr/nexus-dr.sh backup and check verified offsite copy; then run sudo bash scripts/dr/prepare-persistence.sh (non-overwriting, byte-verified migration); run the backup again.
5. Install service/timer/alert units from scripts/dr/systemd to /etc/systemd/system, run systemctl daemon-reload and systemctl enable --now nexus-dr.timer. Trigger and verify the service, offsite read-back and a deliberate failure notification test. The systemd journal remains the only alert if mail is not configured.
6. After proven recovery, use sudo bash scripts/dr/safe-update.sh instead of an unguarded git pull + docker compose up --build.

## Isolated recovery drill

On disposable infrastructure with no production volumes or production networking, start a PostgreSQL 16 / TimescaleDB 2.30.1 test container named nexus_dr_test_pg16, with Docker label com.nexusnode.dr.isolated=true. Using an offline age identity, run:

  bash scripts/dr/nexus-dr.sh verify /secure/archive.age /secure/offline-identity
  bash scripts/dr/nexus-dr.sh restore-test /secure/archive.age /secure/offline-identity nexus_dr_test_pg16

The restore tool refuses a production name, unlabeled containers and pre-existing recovery DBs. It checks restore success, Timescale hypertables, core database tables and Vault authentication. Afterward verify all restored telemetry/device/tenant data, firmware SHA-256, OTA root-of-trust signatures, restored application volume and login/readiness using an isolated app deployment.

## Operational limits

The DB dump is transactionally consistent, but hot app-volume file copies are not a single atomic snapshot with the database. For critical recovery, quiesce writes during capture or use a coordinated filesystem snapshot. The achievable RPO depends on backup frequency; zero data loss is not promised. Offsite backups should be immutable/retained by the provider.

An app UI SQL backup is not a full disaster-recovery bundle. The installer full restore remains intentionally disabled; never auto-restore production. No encrypted backup can be recovered without the correct offline private identity and the captured original Vault key. An independent host image/infra inventory is also needed for host TLS/DNS/firewall/SSH credentials and other resources outside app_data.

DR-01 and DR-02 remain OPEN until isolated CI, live-server-safe test and complete machine-loss recovery drill pass.