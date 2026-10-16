#!/usr/bin/env bash
# NexusNode encrypted offsite disaster recovery (DR-01 / DR-02).
set -Eeuo pipefail
umask 077
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
SCRIPTS="$ROOT/scripts/dr"
CONFIG="${DR_CONFIG_FILE:-/etc/nexusnode/dr.conf}"
if [ -f "$CONFIG" ]; then
  [ "$(stat -c %u "$CONFIG")" = 0 ] || { echo 'DR config must be root-owned' >&2; exit 1; }
  [ "$(( 8#$(stat -c %a "$CONFIG") & 8#022 ))" -eq 0 ] || { echo 'DR config insecure' >&2; exit 1; }
  # shellcheck disable=SC1090
  source "$CONFIG"
fi
DR_BACKUP_DIR="${DR_BACKUP_DIR:-/var/backups/nexusnode}"
DR_RECIPIENTS_FILE="${DR_RECIPIENTS_FILE:-/etc/nexusnode/dr-recipients.txt}"
DR_OFFSITE_REMOTE="${DR_OFFSITE_REMOTE:-}"
DR_LOCAL_KEEP="${DR_LOCAL_KEEP:-7}"
DR_MIN_FREE_MB="${DR_MIN_FREE_MB:-1024}"
DR_DB_CONTAINER="${DR_DB_CONTAINER:-nexus_timescaledb}"
DR_APP_CONTAINER="${DR_APP_CONTAINER:-nexus_app}"
WORK_DIR=''
die(){ echo "Nexus DR FAILED: $*" >&2; exit 1; }
check(){ command -v "$1" >/dev/null || die "missing $1"; }
finish(){
  local rc=$?
  trap - EXIT
  if [ -n "$WORK_DIR" ] && [ -d "$WORK_DIR" ]; then rm -rf -- "$WORK_DIR"; fi
  if [ "$rc" -ne 0 ]; then
    logger -t nexus-dr -p user.err 'Nexus DR failed: inspect unit journal' 2>/dev/null || true
    if [ -n "${DR_ALERT_EMAIL:-}" ] && command -v mail >/dev/null; then
      echo 'NexusNode backup failed; inspect journalctl -u nexus-dr.service' | mail -s 'Nexus DR failure' "$DR_ALERT_EMAIL" || true
    fi
  fi
  exit "$rc"
}
trap finish EXIT
work(){ WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/nexus-dr.XXXXXXXX"); chmod 700 "$WORK_DIR"; }
crypto(){ check age; check python3; check sha256sum; }
vault(){
  local stage="$1"
  if command -v node >/dev/null; then
    node "$SCRIPTS/verify-vault.cjs" "$stage/host_secrets/encryption_key" "$stage/app_data/.system_secrets.json"
  else
    check docker
    docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true \
      -v "$stage:/recovery:ro" -v "$SCRIPTS/verify-vault.cjs:/verify-vault.cjs:ro" \
      node:22-bookworm-slim node /verify-vault.cjs /recovery/host_secrets/encryption_key /recovery/app_data/.system_secrets.json
  fi
}
decrypt(){
  [ -s "$1" ] && [ -s "$2" ] || die 'missing ciphertext or offline identity'
  age --decrypt --identity "$2" --output "$3" "$1" || die 'age decryption failed'
  python3 "$SCRIPTS/archive.py" verify "$3" || die 'archive manifest invalid'
}
backup(){
  local local_only=0
  if [ "${1:-}" = '--local-only' ]; then local_only=1; shift; fi
  [ "$#" -eq 0 ] || die 'usage: backup [--local-only]'
  crypto; check docker; check tar; check flock
  [ -s "$DR_RECIPIENTS_FILE" ] || die 'missing age public recipients'
  [ -s "$ROOT/secrets/encryption_key" ] && [ -s "$ROOT/secrets/postgres_password" ] && [ -s "$ROOT/.env" ] || die 'missing host secrets'
  if [ "$local_only" -eq 0 ]; then
    check rclone
    [[ "$DR_OFFSITE_REMOTE" =~ ^[A-Za-z0-9_-]+:.+ ]] || die 'offsite rclone destination required'
  fi
  mkdir -p -m 700 "$DR_BACKUP_DIR"; chmod 700 "$DR_BACKUP_DIR"
  [[ "$DR_MIN_FREE_MB" =~ ^[0-9]+$ ]] || die 'invalid free-space threshold'
  [ "$(df -Pm "$DR_BACKUP_DIR" | awk 'NR==2{print $4}')" -ge "$DR_MIN_FREE_MB" ] || die 'insufficient disk space'
  exec 9>"$DR_BACKUP_DIR/.backup.lock"
  flock -n 9 || die 'backup lock already held'
  [ "$(docker inspect -f '{{.State.Running}}' "$DR_DB_CONTAINER")" = true ] || die 'DB not running'
  [ "$(docker inspect -f '{{.State.Running}}' "$DR_APP_CONTAINER")" = true ] || die 'app not running'
  work
  local stage="$WORK_DIR/stage" stamp out plain encrypted hash remote actual expected rev
  mkdir -p -m 700 "$stage/app_data" "$stage/host_secrets" "$stage/host_config" "$stage/legacy"
  stamp="$(date -u +%Y%m%dT%H%M%SZ)-$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  out="$DR_BACKUP_DIR/nexus-dr-$stamp.tar.gz.age"
  plain="$WORK_DIR/bundle.tar.gz"; encrypted="$out.part"
  # pg_dump takes a transactionally consistent DB snapshot while writers remain active.
  docker exec "$DR_DB_CONTAINER" sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -Z6 --no-owner --no-acl' > "$stage/db.dump" || die 'pg_dump failed'
  [ -s "$stage/db.dump" ] || die 'empty pg_dump'
  docker exec -i "$DR_DB_CONTAINER" pg_restore -l < "$stage/db.dump" > "$WORK_DIR/db.toc" || die 'invalid pg_dump TOC'
  grep -Eq '(TABLE|TABLE DATA)' "$WORK_DIR/db.toc" || die 'no tables in dump'
  docker exec "$DR_APP_CONTAINER" sh -c "tar -C /app/data --exclude='./backups' -cf - ." > "$WORK_DIR/app-data.tar" || die 'app volume capture failed'
  python3 "$SCRIPTS/archive.py" extract-app "$WORK_DIR/app-data.tar" --extract "$stage/app_data" || die 'unsafe app archive'
  rm "$WORK_DIR/app-data.tar"
  # Capture old ephemeral paths BEFORE the old container is recreated.
  local pair src dst
  for pair in 'backups:app_backups' 'uploads/firmware:firmware' 'uploads/keys:ota_keys'; do
    src="${pair%%:*}"; dst="${pair#*:}"
    if docker exec "$DR_APP_CONTAINER" sh -c "test -d '/app/$src'" >/dev/null 2>&1; then
      mkdir -p -m 700 "$stage/legacy/$dst"
      docker exec "$DR_APP_CONTAINER" sh -c "tar -C '/app/$src' -cf - ." > "$WORK_DIR/legacy.tar" || die 'legacy capture failed'
      python3 "$SCRIPTS/archive.py" extract-app "$WORK_DIR/legacy.tar" --extract "$stage/legacy/$dst" || die 'unsafe legacy data'
      rm "$WORK_DIR/legacy.tar"
    fi
  done
  install -m 600 "$ROOT/secrets/encryption_key" "$stage/host_secrets/encryption_key"
  install -m 600 "$ROOT/secrets/postgres_password" "$stage/host_secrets/postgres_password"
  install -m 600 "$ROOT/.env" "$stage/host_config/.env"
  install -m 600 "$ROOT/docker-compose.yml" "$stage/host_config/docker-compose.yml"
  [ ! -f "$ROOT/docker/nginx/nginx.conf" ] || install -m 600 "$ROOT/docker/nginx/nginx.conf" "$stage/host_config/nginx-compose.conf"
  [ ! -f /etc/nginx/sites-available/iot-dashboard ] || install -m 600 /etc/nginx/sites-available/iot-dashboard "$stage/host_config/nginx-host.conf"
  vault "$stage" || die 'Vault root key fails AES-GCM authentication'
  rev=$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || printf unknown)
  python3 "$SCRIPTS/archive.py" manifest "$stage" --metadata-json '{"git_commit":"'"$rev"'","database":"pg_dump-custom","source":"nexusnode"}' || die 'manifest failed'
  tar -C "$stage" -czf "$plain" db.dump app_data legacy host_secrets host_config manifest.json || die 'tar creation failed'
  python3 "$SCRIPTS/archive.py" verify "$plain" || die 'archive verification failed'
  age -R "$DR_RECIPIENTS_FILE" -o "$encrypted" "$plain" || die 'encryption failed'
  [ -s "$encrypted" ] || die 'encrypted archive is empty'
  chmod 600 "$encrypted"
  mv -n "$encrypted" "$out" || die 'cannot finalize encrypted archive'
  hash="$out.sha256"
  (cd "$DR_BACKUP_DIR" && sha256sum "$(basename "$out")") > "$hash.part"
  chmod 600 "$hash.part"; mv -n "$hash.part" "$hash"
  (cd "$DR_BACKUP_DIR" && sha256sum -c "$(basename "$hash")") >/dev/null || die 'local ciphertext hash mismatch'
  if [ "$local_only" -eq 0 ]; then
    remote="${DR_OFFSITE_REMOTE%/}/$(basename "$out")"
    rclone copyto "$out" "$remote" || die 'offsite copy failed'
    expected=$(sha256sum "$out" | awk '{print $1}')
    actual=$(rclone cat "$remote" | sha256sum | awk '{print $1}') || die 'remote read-back failed'
    [ "$expected" = "$actual" ] || die 'remote ciphertext hash mismatch'
    rclone copyto "$hash" "$remote.sha256" || die 'offsite checksum copy failed'
    # No automatic deletion: retention is managed only after independent
    # restore and offsite durability verification. Protected archives stay put.
    echo 'Encrypted offsite copy verified by remote SHA-256 read-back.'
  else
    echo 'WARNING: emergency local-only archive is not an offsite backup.'
  fi
  echo "Nexus DR bundle created: $out"
}
verify(){
  [ "$#" -eq 2 ] || die 'usage: verify <encrypted-age> <offline-identity>'
  crypto; work
  decrypt "$1" "$2" "$WORK_DIR/bundle.tar.gz"
  mkdir -m 700 "$WORK_DIR/recovered"
  python3 "$SCRIPTS/archive.py" verify "$WORK_DIR/bundle.tar.gz" --extract "$WORK_DIR/recovered"
  vault "$WORK_DIR/recovered"
  echo 'Encrypted archive and Vault verified; a DB restore test is a separate step.'
}
restore_test(){
  [ "$#" -eq 3 ] || die 'usage: restore-test <archive.age> <identity> <test-container>'
  local archive="$1" identity="$2" target="$3" name=nexus_dr_restore_test hc
  [[ "$target" =~ ^nexus_dr_test_[A-Za-z0-9_-]+$ ]] || die 'restore target must be nexus_dr_test_*'
  [ "$(docker inspect -f '{{index .Config.Labels "com.nexusnode.dr.isolated"}}' "$target")" = true ] || die 'isolated target label missing'
  [ "$(docker inspect -f '{{.State.Running}}' "$target")" = true ] || die 'test target not running'
  crypto; work
  decrypt "$archive" "$identity" "$WORK_DIR/bundle.tar.gz"
  mkdir -m 700 "$WORK_DIR/recovered"
  python3 "$SCRIPTS/archive.py" verify "$WORK_DIR/bundle.tar.gz" --extract "$WORK_DIR/recovered"
  vault "$WORK_DIR/recovered"
  [ "$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$target")" = none ] || die 'restore test container must have no network'
  # An isolated label alone is insufficient: refuse any container that mounts
  # an unlabeled or host-backed PostgreSQL data directory.
  local test_volume
  test_volume=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{if eq .Type "volume"}}{{.Name}}{{end}}{{end}}{{end}}' "$target")
  [ -n "$test_volume" ] || die 'restore target must use a named test volume'
  [ "$(docker volume inspect -f '{{index .Labels "com.nexusnode.dr.isolated"}}' "$test_volume")" = true ] || die 'restore target volume is not isolated'
  if docker exec "$target" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname='$name'" | grep -qx 1; then
    die 'restore test database exists; supply a new disposable container'
  fi
  # Cluster-global roles are not contained in a regular pg_dump. Timescale
  # background-job metadata refers to the original application role.
  # This NOLOGIN placeholder exists only in the disposable test cluster.
  if ! docker exec "$target" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -Atqc "SELECT 1 FROM pg_roles WHERE rolname='iot_user'" | grep -qx 1; then
    docker exec "$target" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c 'CREATE ROLE iot_user NOLOGIN' >/dev/null
  fi
  docker exec "$target" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c "CREATE DATABASE $name" >/dev/null
  docker exec "$target" psql -v ON_ERROR_STOP=1 -U postgres -d "$name" -c 'CREATE EXTENSION IF NOT EXISTS timescaledb' >/dev/null
  docker exec "$target" psql -v ON_ERROR_STOP=1 -U postgres -d "$name" -c 'SELECT timescaledb_pre_restore()' >/dev/null
  if ! docker exec -i "$target" pg_restore --verbose --exit-on-error --no-owner --no-acl -U postgres -d "$name" \
    < "$WORK_DIR/recovered/db.dump" > "$WORK_DIR/restore.log" 2>&1; then
    docker exec "$target" psql -U postgres -d "$name" -c 'SELECT timescaledb_post_restore()' >/dev/null 2>&1 || true
    die 'isolated pg_restore failed'
  fi
  docker exec "$target" psql -v ON_ERROR_STOP=1 -U postgres -d "$name" -c 'SELECT timescaledb_post_restore()' >/dev/null
  docker exec "$target" psql -v ON_ERROR_STOP=1 -U postgres -d "$name" -Atqc \
    "SELECT 'users='||(SELECT count(*) FROM users), 'devices='||(SELECT count(*) FROM devices)" || die 'restored core entities unavailable'
  hc=$(docker exec "$target" psql -v ON_ERROR_STOP=1 -U postgres -d "$name" -Atqc \
    'SELECT count(*) FROM timescaledb_information.hypertables') || die 'hypertable verification failed'
  [ "$hc" -ge 1 ] || die 'no restored Timescale hypertables'
  echo 'Isolated Timescale restore, table counts, hypertables and Vault decryption verified.'
}
alert(){
  logger -t nexus-dr -p user.err 'NexusNode scheduled DR backup failed' || true
  if [ -n "${DR_ALERT_EMAIL:-}" ] && command -v mail >/dev/null; then
    echo 'NexusNode backup failed; inspect journalctl -u nexus-dr.service' | mail -s 'NexusNode DR failure' "$DR_ALERT_EMAIL" || true
  fi
}
action="${1:-}"; if [ "$#" -gt 0 ]; then shift; fi
case "$action" in
  backup) backup "$@";; verify) verify "$@";; restore-test) restore_test "$@";; alert) alert;;
  *) die 'usage: nexus-dr.sh backup [--local-only] | verify <age> <identity> | restore-test <age> <identity> <isolated> | alert';;
esac
