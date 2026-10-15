# DR operational runbook (DR-01 and DR-02)

**Status: code prepared in draft PR #18; a manual isolated PostgreSQL/TimescaleDB restore from the live VPS backup succeeded on 2026-10-15 (23 public tables, 2 hypertables, 7 core table counts matched). All 9 backed-up Vault records decrypted and the recovered OTA Ed25519 private key passed sign/verify. Google Drive offsite and whole-machine/app/firmware restore are NOT yet proven. Do not deploy until remaining gates pass.**

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


## Google Drive encrypted offsite setup (pending acceptance)

Google Drive is a storage destination for **age-encrypted** recovery archives, not a store for private age identities. The private age identity must be created and kept **outside** the VPS and outside the same Drive account (two independent protected copies). Copy only the age public recipient to the VPS. Never commit the private identity, Vault encryption key, rclone config file, Google client secret, or Google OAuth token.

**Google Drive OAuth:** The rclone shared Google OAuth client ID is being retired during 2026, so create a dedicated Google Cloud project with the Drive API enabled and an OAuth **Desktop app** client ID and secret. For long-running backups, switch the OAuth audience/publishing state from **Testing** to **In production** for a permitted personal application; otherwise a refresh token can expire after seven days. Follow the rclone vendor guide: https://rclone.org/drive/#making-your-own-client-id . Use the least-privilege `drive.file` scope (rclone can access the files/folders it creates, rather than all existing Drive documents). The Google account should be dedicated to backups where practical.

Run `sudo rclone config` so the headless backup service and manual `sudo rclone` calls both use `/root/.config/rclone/rclone.conf`. Create a remote named `gdrive`, backend `drive`, enter your own client ID/secret, scope `drive.file`, no service account, no advanced changes, and **N** for browser authentication on the VPS. Follow the headless prompt to authorize using `rclone authorize` on a separate trusted machine with a browser and rclone, then paste the token **only into the SSH terminal**, never into chat or logs. Alternatively connect an SSH local tunnel forwarding port 53682 and complete the OAuth callback in the local browser. See https://rclone.org/remote_setup/ .

Restrict the root rclone config to root (mode 0600), check `sudo rclone listremotes` (names only), then test a **non-sensitive** tiny file upload/download to `gdrive:NexusNode-DR/connection-test.txt` and validate a SHA-256 readback. Use `rclone copyto` for a specific file; never `rclone sync` for the remote backup directory. Do not share `rclone config show`, because it can expose OAuth credentials.

Once a public recipient has been transferred to `/etc/nexusnode/dr-recipients.txt` and validated, create root-owned mode-0600 `/etc/nexusnode/dr.conf` with `DR_RECIPIENTS_FILE=/etc/nexusnode/dr-recipients.txt` and `DR_OFFSITE_REMOTE=gdrive:NexusNode-DR/production` (plus the local retention/free-space settings above). First run a controlled encrypted backup and confirm the script's **remote SHA-256 readback**, independent off-VPS download/decrypt with the private age identity, and an isolated restore. Only then enable the systemd timer and fail-closed update path. Drive OAuth access and a public age recipient alone do not establish a recoverable backup.

## Isolated recovery drill

On disposable infrastructure with no production volumes or production networking, start a PostgreSQL 16 / TimescaleDB 2.30.1 test container named nexus_dr_test_pg16, with Docker label com.nexusnode.dr.isolated=true. Using an offline age identity, run:

  bash scripts/dr/nexus-dr.sh verify /secure/archive.age /secure/offline-identity
  bash scripts/dr/nexus-dr.sh restore-test /secure/archive.age /secure/offline-identity nexus_dr_test_pg16

The restore tool refuses a production name, unlabeled containers and pre-existing recovery DBs. It checks restore success, Timescale hypertables, core database tables and Vault authentication. Afterward verify all restored telemetry/device/tenant data, firmware SHA-256, OTA root-of-trust signatures, restored application volume and login/readiness using an isolated app deployment.

## Operational limits

The DB dump is transactionally consistent, but hot app-volume file copies are not a single atomic snapshot with the database. For critical recovery, quiesce writes during capture or use a coordinated filesystem snapshot. The achievable RPO depends on backup frequency; zero data loss is not promised. Offsite backups should be immutable/retained by the provider.

An app UI SQL backup is not a full disaster-recovery bundle. The installer full restore remains intentionally disabled; never auto-restore production. No encrypted backup can be recovered without the correct offline private identity and the captured original Vault key. An independent host image/infra inventory is also needed for host TLS/DNS/firewall/SSH credentials and other resources outside app_data.

DR-01 and DR-02 remain OPEN until isolated CI, live-server-safe test and complete machine-loss recovery drill pass.
## Offline recovery staging

On an isolated recovery computer, after moving the encrypted archive and accessing the offline age identity, create a dedicated *empty* directory outside the live application tree. Run: bash scripts/dr/stage-recovery.sh /secure/archive.age /secure/offline-identity /var/tmp/nexus-dr-clean-room . The staging command validates the manifest and Vault decryption before writing recovery-data, refuses known production paths, and does not touch the running VPS. Keep the staged root key, PostgreSQL bootstrap credential and configuration private (mode 0600).

Only then perform an isolated database restoration and compare recovered user, tenant, device, telemetry/hypertable data, firmware hashes and OTA signatures. A production recovery remains a manual incident-response change with an explicit maintenance window and rollback plan.
