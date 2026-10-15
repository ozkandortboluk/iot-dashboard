#!/usr/bin/env bash
# Runs as root from systemd, never from an HTTP request.
# First creates a verified local backup, then optionally copies an encrypted
# archive to a pre-provisioned destination. Does not prune any backup.
set -Eeuo pipefail
umask 077

ROOT=${NEXUS_DR_PROJECT_ROOT:-/opt/iot-dashboard/iot-dashboard}
BASE=/var/backups/nexusnode
DAILY="$BASE/gunluk"
APP_VOLUME=iot-dashboard_app_data
RECIPIENTS=/etc/nexusnode/dr-recipients.txt
EXTERNAL_DISK=/mnt/nexusnode-backup
PREFIX=NexusNode-DR/production

die(){ echo "DR TRANSFER ERROR: $*" >&2; exit 1; }
command -v docker >/dev/null || die 'docker missing'
command -v python3 >/dev/null || die 'python3 missing'
APP_DATA=$(docker volume inspect -f '{{.Mountpoint}}' "$APP_VOLUME") || die 'app volume missing'
[[ -d "$APP_DATA" && ! -L "$APP_DATA" ]] || die 'invalid app volume'
CHOICE_FILE="$APP_DATA/.dr_destination.json"
STATUS_FILE="$APP_DATA/.dr_delivery_status.json"
CAPS_FILE="$APP_DATA/.dr_capabilities.json"

# No arbitrary command, path, URL or remote is ever read from the app.
# The app may only select one of these fixed destination names.
DEST=$(python3 - "$CHOICE_FILE" <<'PY'
import json,os,sys
p=sys.argv[1]
try:
    if os.path.islink(p): raise ValueError('symlink')
    with open(p) as f: o=json.load(f)
    d=o.get('destination')
    if type(d)!=str or d not in ('local','disk','gdrive','dropbox','sftp'):
        raise ValueError('invalid destination')
    print(d)
except FileNotFoundError: print('local')
except Exception: sys.exit('Invalid backup destination config')
PY
) || die 'destination selection invalid'

# Publish capability status (only approved names; never credentials).
READY='["local"'
if [[ -d "$EXTERNAL_DISK" ]] && mountpoint -q "$EXTERNAL_DISK" &&
  [[ ! -L "$EXTERNAL_DISK" ]] && [[ "$(stat -c %u "$EXTERNAL_DISK")" = 0 ]] &&
  [[ "$(stat -c %d "$EXTERNAL_DISK")" != "$(stat -c %d "$BASE")" ]]; then READY+=',"disk"'; fi
if command -v rclone >/dev/null; then
  for remote in gdrive dropbox sftp; do
    if rclone listremotes 2>/dev/null | grep -Fxq "$remote:"; then READY+=',"'"$remote"'"'; fi
  done
fi
READY+=']'
CAP_TMP=$(mktemp "$APP_DATA/.dr_capabilities.XXXXXXXX")
printf '{"ready":%s}\n' "$READY" > "$CAP_TMP"
chmod 644 "$CAP_TMP"
mv -f "$CAP_TMP" "$CAPS_FILE"

# Provisioning changes can be reflected in the dashboard without producing
# any backup or touching old archives.
if [[ "${1:-}" = '--refresh' && "$#" -eq 1 ]]; then
  echo 'DR capabilities refreshed (no backup created).'
  exit 0
fi
[[ "$#" -eq 0 ]] || die 'usage: deliver-selected-backup.sh [--refresh]'

report(){
  local outcome="$1"
  local tmp
  tmp=$(mktemp "$APP_DATA/.dr_status.XXXXXXXX")
  printf '{"destination":"%s","timestamp":"%s","result":"%s"}\n' "$DEST" "$(date -u +%FT%TZ)" "$outcome" > "$tmp"
  chmod 644 "$tmp"; mv -f "$tmp" "$STATUS_FILE"
}
# Create a new, confirmed local backup before any remote-destination failure.
BEFORE=$(find "$DAILY" -mindepth 1 -maxdepth 1 -type d -name 'yedek-*' -printf '%f\n' 2>/dev/null | LC_ALL=C sort)
if ! /usr/local/sbin/nexusnode-local-backup; then
  report failed; die 'local backup failed'
fi
if [[ "$DEST" = local ]]; then report success; exit 0; fi

# Do not silently fall back to local when an explicitly selected remote fails.
# The verified local copy already exists and is preserved.
if ! python3 - "$DEST" "$READY" <<'PY'
import json,sys
sys.exit(0 if sys.argv[1] in json.loads(sys.argv[2]) else 1)
PY
then report failed; die 'selected destination not configured; verified local backup preserved'; fi
[[ -s "$RECIPIENTS" && ! -L "$RECIPIENTS" ]] || { report failed; die 'offline age public recipient missing'; }
command -v age >/dev/null || { report failed; die 'age missing'; }
LATEST=$(find "$DAILY" -mindepth 1 -maxdepth 1 -type d -name 'yedek-*' -printf '%T@ %p\n' | sort -rn | head -n1 | cut -d' ' -f2-)
[[ -n "$LATEST" && -s "$LATEST/manifest.sha256" && ! -L "$LATEST" ]] || { report failed; die 'backup missing'; }
AFTER=$(find "$DAILY" -mindepth 1 -maxdepth 1 -type d -name 'yedek-*' -printf '%f\n' 2>/dev/null | LC_ALL=C sort)
[[ "$AFTER" != "$BEFORE" ]] || { report failed; die 'new backup was not created'; }
(cd "$LATEST" && sha256sum -c manifest.sha256 >/dev/null) || { report failed; die 'local backup corrupt'; }
TMP=$(mktemp -d "$BASE/.delivery-XXXXXXXX")
cleanup(){ [[ "$TMP" = "$BASE/.delivery-"* ]] && rm -rf -- "$TMP"; }
trap cleanup EXIT
NAME=$(basename "$LATEST").tar.gz.age
tar -C "$LATEST" -czf "$TMP/bundle.tar.gz" . || { report failed; die 'archive failed'; }
age -R "$RECIPIENTS" -o "$TMP/$NAME" "$TMP/bundle.tar.gz" || { report failed; die 'encryption failed'; }
HASH=$(sha256sum "$TMP/$NAME" | awk '{print $1}')

if [[ "$DEST" = disk ]]; then
  [[ -d "$EXTERNAL_DISK" && ! -L "$EXTERNAL_DISK" ]] &&
    mountpoint -q "$EXTERNAL_DISK" &&
    [[ "$(stat -c %d "$EXTERNAL_DISK")" != "$(stat -c %d "$BASE")" ]] ||
    { report failed; die 'external drive no longer mounted'; }
  install -d -m 700 "$EXTERNAL_DISK/NexusNode-DR"
  TARGET="$EXTERNAL_DISK/NexusNode-DR/$NAME"
  [[ ! -e "$TARGET" && ! -L "$TARGET" ]] || { report failed; die 'destination already exists'; }
  install -m 600 "$TMP/$NAME" "$TARGET" || { report failed; die 'disk copy failed'; }
  ACTUAL=$(sha256sum "$TARGET" | awk '{print $1}')
else
  command -v rclone >/dev/null || { report failed; die 'rclone missing'; }
  # Remote names are exact, never supplied by HTTP requests.
  REMOTE="$DEST:$PREFIX/$NAME"
  rclone copyto "$TMP/$NAME" "$REMOTE" || { report failed; die 'remote upload failed'; }
  ACTUAL=$(rclone cat "$REMOTE" | sha256sum | awk '{print $1}') || { report failed; die 'remote readback failed'; }
fi
[[ "$HASH" = "$ACTUAL" ]] || { report failed; die 'remote sha256 differs'; }
report success
echo "DR encrypted copy verified at selected destination: $DEST"
