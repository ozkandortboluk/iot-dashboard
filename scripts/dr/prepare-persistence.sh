#!/usr/bin/env bash
# Run before first recreate of the old application container.
set -Eeuo pipefail
APP="${DR_APP_CONTAINER:-nexus_app}"
[ "$(docker inspect -f '{{.State.Running}}' "$APP")" = true ] || { echo 'Old container must still run' >&2; exit 1; }
docker exec "$APP" sh -eu -c '
for pair in "backups backups" "uploads/firmware uploads/firmware"; do
  set -- $pair
  src="/app/$1"; dst="/app/data/$2"
  [ -d "$src" ] || continue
  mkdir -p "$dst"
  find "$src" -type f -exec sh -eu -c '\''
    src="$1"; dst="$2"; shift 2
    for f do
      rel=${f#"$src"/}
      mkdir -p "$dst/$(dirname "$rel")"
      if [ ! -e "$dst/$rel" ]; then cp -p "$f" "$dst/$rel"; fi
      cmp -s "$f" "$dst/$rel" || { echo "Migrated file mismatch" >&2; exit 1; }
    done
  '\'' sh "$src" "$dst" {} +
done
'
echo 'Legacy files copied without overwrite and verified byte-for-byte.'
