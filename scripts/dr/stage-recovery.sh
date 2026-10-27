#!/usr/bin/env bash
# Offline recovery staging ONLY. Never extracts directly into the live installation.
# Recovery key must be held on an isolated trusted recovery machine.
set -Eeuo pipefail
umask 077
[ "$#" -eq 3 ] || { echo 'usage: stage-recovery.sh <archive.age> <offline-identity> <empty-recovery-parent>' >&2; exit 2; }
ARCHIVE="$1"; IDENTITY="$2"; PARENT="$3"
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
for cmd in age python3 node mktemp; do command -v "$cmd" >/dev/null || { echo "missing $cmd" >&2; exit 1; }; done
[ -s "$ARCHIVE" ] && [ -s "$IDENTITY" ] || { echo 'archive or identity not found' >&2; exit 1; }
[ -d "$PARENT" ] && [ ! -L "$PARENT" ] || { echo 'parent must exist and must not be a link' >&2; exit 1; }
PARENT=$(cd "$PARENT" && pwd -P)
case "$PARENT" in
  /opt/iot-dashboard*|/var/lib/docker*|/etc*|/root|/home/*|/) echo 'unsafe recovery parent' >&2; exit 1 ;;
esac
[ -z "$(find "$PARENT" -mindepth 1 -maxdepth 1 -print -quit)" ] || {
  echo 'recovery parent must be EMPTY' >&2; exit 1;
}
WORK=$(mktemp -d "$PARENT/.recovery.XXXXXXXX")
cleanup(){ local rc=$?; trap - EXIT; if [ "$rc" -ne 0 ]; then rm -rf -- "$WORK"; fi; exit "$rc"; }
trap cleanup EXIT
chmod 700 "$WORK"
age --decrypt --identity "$IDENTITY" --output "$WORK/bundle.tar.gz" "$ARCHIVE"
mkdir -m 700 "$WORK/verified"
python3 "$ROOT/scripts/dr/archive.py" verify "$WORK/bundle.tar.gz" --extract "$WORK/verified"
node "$ROOT/scripts/dr/verify-vault.cjs" "$WORK/verified/host_secrets/encryption_key" "$WORK/verified/app_data/.system_secrets.json"
rm -f "$WORK/bundle.tar.gz"
chmod 700 "$WORK/verified"
mv "$WORK/verified" "$PARENT/recovery-data"
rmdir "$WORK"
trap - EXIT
echo "Recovery data staged in $PARENT/recovery-data (secret material: access restricted)."
echo 'Never copy the staged secrets into GitHub. Use a separate disposable DB and app volume to test before live recovery.'
