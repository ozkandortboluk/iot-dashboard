#!/usr/bin/env bash
# Non-destructive, root-only local recovery snapshots for NexusNode.
# Never rotates/prunes baseline, archived, or earlier daily backups.
set -Eeuo pipefail
umask 077

fail() { printf 'YEDEK HATASI: %s\n' "$*" >&2; exit 1; }
[[ "${EUID:-$(id -u)}" -eq 0 ]] || fail 'root yetkisi gerekli'
for cmd in docker flock sha256sum find sort xargs mktemp df stat install du sed; do
  command -v "$cmd" >/dev/null || fail "eksik arac: $cmd"
done

ROOT=/opt/iot-dashboard/iot-dashboard
BASE=/var/backups/nexusnode
DAILY="$BASE/gunluk"
DB=nexus_timescaledb
APP=nexus_app

[[ -d "$BASE" && ! -L "$BASE" && "$(stat -c %u "$BASE")" = 0 ]] || fail 'yedek ana klasoru root-owned ve gercek dizin olmali'
install -d -o root -g root -m 700 "$DAILY"
[[ ! -L "$DAILY" && "$(stat -c %u "$DAILY")" = 0 ]] || fail 'gunluk yedek klasoru guvensiz'
chmod 700 "$DAILY"
exec 9>"$DAILY/.backup.lock"
flock -n 9 || fail 'baska bir yedekleme calisiyor'

FREE_MB=$(df -Pm "$DAILY" | awk 'NR == 2 {print $4}')
[[ "$FREE_MB" =~ ^[0-9]+$ ]] || fail 'disk alani okunamadi'
(( FREE_MB >= 2048 )) || fail 'en az 2 GB bos disk alani gerekli'

[[ "$(docker inspect -f '{{.State.Running}}' "$DB")" = true ]] || fail 'veritabani calismiyor'
[[ "$(docker inspect -f '{{.State.Running}}' "$APP")" = true ]] || fail 'uygulama calismiyor'
[[ "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$DB")" = timescaledb ]] || fail 'yanlis DB container'
[[ "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$APP")" = app ]] || fail 'yanlis uygulama container'
[[ "$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "$DB")" = iot-dashboard_timescaledb_data ]] || fail 'beklenmeyen DB volume'
[[ "$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Name}}{{end}}{{end}}' "$APP")" = iot-dashboard_app_data ]] || fail 'beklenmeyen app volume'
for f in "$ROOT/secrets/encryption_key" "$ROOT/secrets/postgres_password" "$ROOT/.env" "$ROOT/docker-compose.yml"; do
  [[ -f "$f" && -s "$f" && ! -L "$f" ]] || fail 'zorunlu konfigurasyon veya secret yok'
done

STAGE=$(mktemp -d "$DAILY/.staging-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXXXX")
cleanup() {
  local code=$?
  trap - EXIT
  if [[ -n "${STAGE:-}" && "$STAGE" = "$DAILY/.staging-"* && -d "$STAGE" ]]; then
    rm -rf -- "$STAGE"  # Only an incomplete directory created by this invocation.
  fi
  exit "$code"
}
trap cleanup EXIT
mkdir -m 700 "$STAGE/app_data" "$STAGE/secrets" "$STAGE/config" "$STAGE/legacy"

echo '===== TUTARLI POSTGRESQL YEDEGI ====='
docker exec "$DB" sh -ec '
  test "$POSTGRES_DB" = iot_dashboard
  test "$POSTGRES_USER" = iot_user
  exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -Z 6 --no-owner --no-acl
' > "$STAGE/database.dump"
[[ -s "$STAGE/database.dump" ]] || fail 'bos PostgreSQL yedegi'
docker exec -i "$DB" pg_restore -l < "$STAGE/database.dump" > /dev/null || fail 'PostgreSQL dump okunamiyor'

echo '===== UYGULAMA VERILERI ====='
docker cp "$APP:/app/data/." "$STAGE/app_data/" >/dev/null
[[ -s "$STAGE/app_data/.system_secrets.json" ]] || fail 'Vault dosyasi yedekte yok'

# Older releases stored backups, firmware and OTA keyring files outside the persistent volume.
for mapping in 'backups:backups' 'uploads/firmware:firmware' 'uploads/keys:keys'; do
  source_dir=${mapping%%:*}
  target_dir=${mapping#*:}
  if docker exec "$APP" test -d "/app/$source_dir" >/dev/null 2>&1; then
    mkdir -m 700 "$STAGE/legacy/$target_dir"
    docker cp "$APP:/app/$source_dir/." "$STAGE/legacy/$target_dir/" >/dev/null
  fi
done

install -m 600 "$ROOT/secrets/encryption_key" "$STAGE/secrets/encryption_key"
install -m 600 "$ROOT/secrets/postgres_password" "$STAGE/secrets/postgres_password"
install -m 600 "$ROOT/.env" "$STAGE/config/.env"
install -m 600 "$ROOT/docker-compose.yml" "$STAGE/config/docker-compose.yml"

# Refuse links, so the archive inventory contains only actual file bytes and directories.
if find "$STAGE" -type l -print -quit | grep -q .; then
  fail 'uygulama verisinde sembolik bag bulundu, manuel inceleme gerekli'
fi

echo '===== DOSYA BUTUNLUGU ====='
(
  cd "$STAGE"
  find . -type f ! -name manifest.sha256 -print0 | LC_ALL=C sort -z |
    xargs -0 -r sha256sum > manifest.sha256
  test -s manifest.sha256
  sha256sum -c manifest.sha256 > /dev/null
)

NAME="yedek-$(basename "$STAGE" | sed 's/^\.staging-//')"
DEST="$DAILY/$NAME"
[[ ! -e "$DEST" && ! -L "$DEST" ]] || fail 'hedef yedek zaten var'
mv -T -- "$STAGE" "$DEST"
STAGE=''

printf 'YEREL YEDEK BASARILI: %s\n' "$DEST"
du -sh "$DEST"
echo 'Eski yedeklere veya arsiv/ klasorune dokunulmadi.'
echo 'UYARI: Bu yedek VPS uzerindedir; sunucu/disk kaybina karsi koruma saglamaz.'
