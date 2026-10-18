#!/usr/bin/env bash
# NexusNode VPS Update - v0.3 (Debian 13 / Docker Compose)
# Run from the project root: sudo bash ./vps-update.sh --check|--run
# Default: manual run. --check is read-only; --run performs the gated update.
set -Eeuo pipefail
umask 077
export LC_ALL=C

# In normal use, the updater lives in the checkout root. During --run it is
# re-executed from a protected root-only snapshot to prevent Git updating the
# in-flight script while an upgrade is in progress.
SCRIPT_SOURCE=$(readlink -f -- "${BASH_SOURCE[0]}")
REPO=${NEXUS_UPDATE_REPO_SNAPSHOT:-$(dirname -- "$SCRIPT_SOURCE")}
BACKUP_ROOT=/var/backups/nexusnode/gunluk
LOG_ROOT=/var/log/nexusnode-update
STATE_ROOT=/var/lib/nexusnode-update
MIN_FREE_GIB=6
APP_IMAGE=iot-dashboard-app:latest
HEALTH_URL=http://127.0.0.1:3000/api/health/ready
PUBLIC_URL=https://nexusnodeiot.com.tr/
MODE=${1:---check}
STAGE=initial
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OLD_APP_IMAGE=''
OLD_HEAD=''
NEW_HEAD=''
ROLLBACK_SAFE=false
SCHEMA_BEFORE=''

usage() {
  cat <<'EOF'
Usage (from project root): sudo bash ./vps-update.sh [--check|--run|--help]
  --check  Read-only preflight checks; no apt update, pulls, backups or cleanup.
  --run    Verified backup, Git main fast-forward, rebuild/deploy and health checks.
           Debian APT updates are disabled by default.
  System updates: sudo env NEXUS_SYSTEM_UPDATE=1 bash ./vps-update.sh --run
  Verbose output: sudo env NEXUS_VERBOSE=1 bash ./vps-update.sh --run
Safety: never updates TimescaleDB image; never deletes volumes, backup files,
        secrets or old production images. No forced Git reset/clean.
EOF
}
case "$MODE" in
  --help|-h) usage; exit 0 ;;
  --check|--run) [[ $# -le 1 ]] || { usage >&2; exit 2; } ;;
  *) usage >&2; exit 2 ;;
esac

note() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
fail() { note "HATA ($STAGE): $*" >&2; exit 1; }
step() { STAGE="$1"; note "===== $STAGE ====="; }
on_failure() {
  rc=$?
  if (( rc != 0 )); then
    note "GUNCELLEME DURDU: asama=$STAGE, exit=$rc. Otomatik DB/OS geri alma YOK."
    if [[ "$MODE" == --run ]]; then
      if [[ -n "${LOG_FILE:-}" ]]; then note "Log: $LOG_FILE"; fi
      note "Calisan container/volume ve mevcut yedekler otomatik silinmedi."
    fi
  fi
}
trap on_failure EXIT

[[ -d "$REPO/.git" ]] || fail "Git checkout yok: $REPO. Betigi proje ana dizinine koyun."
[[ $EUID -eq 0 ]] || fail "root gerekli: sudo bash ./vps-update.sh $MODE"
cd "$REPO"
note "Proje dizini: $REPO"

# Make a protected runtime copy for a real update, because a Git fast-forward
# may change vps-update.sh itself if the file is tracked in the repository.
# No snapshot is created in --check mode; that mode stays read-only.
if [[ "$MODE" == --run && "${NEXUS_UPDATE_FROZEN:-0}" != 1 ]]; then
  install -d -m 700 -o root -g root "$STATE_ROOT"
  FROZEN_SCRIPT="$STATE_ROOT/source-$STAMP-$$.sh"
  install -o root -g root -m 700 -- "$SCRIPT_SOURCE" "$FROZEN_SCRIPT"
  exec env NEXUS_UPDATE_FROZEN=1 NEXUS_UPDATE_REPO_SNAPSHOT="$REPO" \
    /bin/bash "$FROZEN_SCRIPT" "$MODE"
fi

# Serialize real update runs. --check does not create or change files.
if [[ "$MODE" == --run ]]; then
  command -v flock >/dev/null || fail "flock bulunamadi"
  install -d -m 700 -o root -g root "$LOG_ROOT" "$STATE_ROOT"
  exec 9>"$STATE_ROOT/update.lock"
  flock -n 9 || fail "Baska bir VPS update calisiyor"
  LOG_FILE="$LOG_ROOT/update-$STAMP.log"
  : > "$LOG_FILE"
  chmod 600 "$LOG_FILE"
  if [[ "${NEXUS_VERBOSE:-0}" == 1 ]]; then
    exec > >(tee -a "$LOG_FILE") 2>&1
  else
    # All output is saved in the protected log; terminal only shows milestones.
    exec > >(tee -a "$LOG_FILE" | grep --line-buffered -E '^\[[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\]') 2>&1
  fi
  [[ ! -e "$STATE_ROOT/rollback-needs-review" ]] || fail "Onceki rollback incelenmedi. $STATE_ROOT/rollback-needs-review dosyasini kontrol et."
fi

for cmd in git docker curl df find sha256sum systemctl stat; do
  command -v "$cmd" >/dev/null 2>&1 || fail "Komut eksik: $cmd"
done

REPO_OWNER=$(stat -c '%U' "$REPO/.git")
[[ -n "$REPO_OWNER" ]] || fail "Git sahibi belirlenemedi"
repo_git() {
  local readonly_env=()
  if [[ "$MODE" == --check ]]; then readonly_env=(GIT_OPTIONAL_LOCKS=0); fi
  if [[ "$REPO_OWNER" == root ]]; then
    env GIT_TERMINAL_PROMPT=0 "${readonly_env[@]}" git -c "safe.directory=$REPO" -C "$REPO" "$@"
  else
    runuser -u "$REPO_OWNER" -- env GIT_TERMINAL_PROMPT=0 "${readonly_env[@]}" \
      git -C "$REPO" "$@"
  fi
}

free_kib() { df -Pk "$REPO" | awk 'NR==2 {print $4}'; }
require_disk() {
  local free required
  free=$(free_kib)
  required=$((MIN_FREE_GIB * 1024 * 1024))
  note "Bos disk: ${free} KiB / alt esik: ${required} KiB"
  (( free >= required )) || return 1
}

# The two updater files may initially be copied into the project root without
# being committed yet. They are the ONLY exception to strict Git cleanliness.
# In particular, all other untracked scratch files still stop --run.
unexpected_git_changes() {
  local raw line
  raw=$(repo_git status --porcelain=v1 --untracked-files=all) || return 1
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    case "$line" in
      '?? vps-update.sh'|'?? VPS-UPDATE-KULLANIM.md') ;;
      *) printf '%s\n' "$line" ;;
    esac
  done <<< "$raw"
}

check_git() {
  step 'Git / main / yerel degisiklikler'
  [[ $(repo_git branch --show-current) == main ]] || fail 'Git dali main degil'
  repo_git rev-parse --verify HEAD >/dev/null || fail 'HEAD okunamadi'
  OLD_HEAD=$(repo_git rev-parse HEAD)
  note "Git HEAD: $OLD_HEAD"
  local changes
  changes=$(unexpected_git_changes) || fail 'Git status hatasi'
  if [[ -n "$changes" ]]; then
    printf '%s\n' "$changes"
    if [[ "$MODE" == --run ]]; then
      fail 'Git agaci temiz degil (updater dosyalari haric). Hicbir dosya otomatik silinmez/tasinmaz.'
    fi
    note 'UYARI: Git agacinda updater disinda degisiklik var; --run burada duracaktir.'
  else
    note 'Git agaci temiz veya yalnizca yeni updater dosyalari takip disi.'
  fi
  [[ -f .dockerignore ]] || fail '.dockerignore eksik'
  local x
  for x in 'secrets/' '.env' 'data/' '*.sql' '*.dump'; do
    grep -Fxq -- "$x" .dockerignore || fail ".dockerignore korumasi eksik: $x"
  done
  if grep -Eq '^![^#]*(secrets/|\.env|data/)' .dockerignore; then
    fail '.dockerignore hassas yollar icin ters kural (!) iceriyor'
  fi
  # Root may be a different owner; all writes are performed as checkout owner.
}

check_services() {
  step 'Docker / Nginx / PostgreSQL / API'
  docker compose config --quiet || fail 'Compose config hatali'
  docker info >/dev/null 2>&1 || fail 'Docker calismiyor'
  systemctl is-active --quiet nginx || fail 'Nginx calismiyor'
  systemctl is-active --quiet fail2ban || fail 'Fail2ban calismiyor'
  docker inspect nexus_timescaledb --format '{{.State.Health.Status}}' | grep -qx healthy || fail 'PostgreSQL healthy degil'
  docker inspect nexus_app --format '{{.State.Health.Status}}' | grep -qx healthy || fail 'NexusNode container healthy degil'
  verify_endpoints || fail 'Uygulama endpoint kontrolleri basarisiz'
  [[ -s secrets/encryption_key && -s secrets/postgres_password ]] || fail 'Secret dosyalari bos/eksik'
  local f mode
  for f in secrets/encryption_key secrets/postgres_password; do
    mode=$(stat -c %a "$f")
    (( (8#$mode & 077) == 0 )) || fail "Secret izinleri guvensiz: $f ($mode)"
  done
  note 'Servisler saglikli; secrets mevcut ve sahibi disindakilere kapali (icerikler okunmadi).'
}

verify_endpoints() {
  local payload code
  payload=$(curl --noproxy '*' -fsS --max-time 12 "$HEALTH_URL") || return 1
  printf '%s' "$payload" | grep -Eq '"ready"[[:space:]]*:[[:space:]]*true' || return 1
  printf '%s' "$payload" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"connected"' || return 1
  code=$(curl --noproxy '*' -sS -o /dev/null -w '%{http_code}' --max-time 12 "$PUBLIC_URL") || return 1
  [[ "$code" == 200 ]] || return 1
}

read_only_report() {
  step 'Disk / APT / yedek'
  note "Bos disk: $(df -h "$REPO" | awk 'NR==2 {print $4}')"
  if [[ "${NEXUS_VERBOSE:-0}" == 1 ]]; then
    df -h "$REPO"
    docker system df
    apt list --upgradable 2>/dev/null || true
  fi
  if [[ -f /run/reboot-required ]]; then note 'Yeniden baslatma GEREKLI'; else note 'Yeniden baslatma isareti yok'; fi
  systemctl show nexusnode-local-backup.service -p Result -p ExecMainStatus --no-pager
  local latest
  latest=$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'yedek-*' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2- || true)
  if [[ -n "$latest" ]]; then
    note "Son yedek: $latest"
  else
    note 'Son yedek bulunamadi'
  fi
  if ! require_disk; then note "UYARI: ${MIN_FREE_GIB} GiB disk esigi altinda; --run temizlik icin onay ister."; fi
}

confirm() {
  local prompt="$1" answer
  if [[ ! -r /dev/tty ]]; then
    note 'Onay terminali yok; varsayilan HAYIR.'
    return 1
  fi
  printf '%s [evet/HAYIR]: ' "$prompt" > /dev/tty
  IFS= read -r answer < /dev/tty || return 1
  [[ "$answer" == evet ]]
}

prepare_disk() {
  step 'Disk on kosulu'
  if require_disk; then return 0; fi
  note 'Yetersiz disk alani. Yalnizca kullanilmayan Docker build cache temizligi oneriliyor.'
  docker system df
  confirm 'docker builder prune -af calissin mi (volume, image ve yedekleri SILMEZ)?' || \
    fail 'Alan yetersiz; temizlik onaylanmadi.'
  docker builder prune -af || fail 'Build cache temizligi basarisiz'
  require_disk || fail 'Temizlikten sonra da disk alani yetersiz'
}

check_private_path() {
  local p="$1" mode uid
  [[ ! -L "$p" && -e "$p" ]] || fail "Yedek dosyasi yok veya symlink: $p"
  uid=$(stat -c %u "$p")
  mode=$(stat -c %a "$p")
  [[ "$uid" == 0 ]] || fail "Yedek root sahipliginde degil: $p"
  (( (8#$mode & 077) == 0 )) || fail "Yedek izinleri genis: $p (mode=$mode); root-only olmali"
}

latest_backup() {
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'yedek-*' \
    -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-
}

backup_and_validate() {
  step 'Yeni ve dogrulanmis zorunlu yedek'
  [[ -d "$BACKUP_ROOT" && ! -L "$BACKUP_ROOT" ]] || fail 'Yedek dizini eksik/symlink'
  check_private_path /var/backups/nexusnode
  check_private_path "$BACKUP_ROOT"
  local previous latest result exit_status link
  previous=$(latest_backup || true)
  note 'Yeni oneshot yerel yedek servisi tetikleniyor.'
  systemctl start nexusnode-local-backup.service || fail 'Yedek servisi calistirilamadi'
  result=$(systemctl show -P Result nexusnode-local-backup.service)
  exit_status=$(systemctl show -P ExecMainStatus nexusnode-local-backup.service)
  [[ "$result" == success && "$exit_status" == 0 ]] || fail "Yedek servisi hatali: Result=$result status=$exit_status"
  latest=$(latest_backup || true)
  [[ -n "$latest" && "$latest" != "$previous" ]] || fail 'Yeni yedek klasoru olusmadi'
  [[ "$latest" == "$BACKUP_ROOT"/yedek-* ]] || fail 'Beklenmeyen yedek yolu'
  check_private_path "$latest"
  for link in "$latest"/secrets/encryption_key "$latest"/secrets/postgres_password \
    "$latest"/app_data/.system_secrets.json "$latest"/config/.env \
    "$latest"/database.dump "$latest"/manifest.sha256; do
    [[ -s "$link" ]] || fail "Yedek bileseni eksik/bos: ${link#"$latest"/}"
    check_private_path "$link"
  done
  if find "$latest" -type l -print -quit | grep -q .; then
    fail 'Yedekte symlink var; beklenmedik hedeflere guvenilemez'
  fi
  local required
  for required in database.dump secrets/encryption_key secrets/postgres_password \
    app_data/.system_secrets.json config/.env; do
    grep -Fq -- "$required" "$latest/manifest.sha256" || fail "Manifest dosyayi kapsamiyor: $required"
  done
  (cd "$latest" && sha256sum -c --status manifest.sha256) || fail 'Yedek SHA256 tutarsiz'
  docker exec -i nexus_timescaledb pg_restore --list < "$latest/database.dump" > /dev/null || \
    fail 'PostgreSQL dump okunamadi'
  note "Yeni yedek dogrulandi: $latest"
  note 'UYARI: Tam geri yukleme testi ayrica gerekli; bu kontrol geri yukleme kaniti degil.'
}

schema_fingerprint() {
  # Only used as a conservative rollback guard; failure disables automatic rollback.
  local result
  result=$(docker exec nexus_timescaledb sh -c \
    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --schema-only --no-owner --no-acl' \
    2>/dev/null | sed '/^--/d' | sha256sum | awk '{print $1}') || return 1
  [[ "$result" =~ ^[0-9a-f]{64}$ ]] || return 1
  printf '%s' "$result"
}

apt_upgrade() {
  step 'Debian paket guncellemeleri'
  export DEBIAN_FRONTEND=noninteractive APT_LISTCHANGES_FRONTEND=none NEEDRESTART_MODE=l
  apt-get update || fail 'APT indeks guncellemesi hatali'
  local simulation
  simulation=$(apt-get -s upgrade) || fail 'APT simule upgrade hatali'
  if grep -q '^Remv ' <<< "$simulation"; then
    fail 'APT paket kaldirmak istiyor; guncelleme durduruldu'
  fi
  printf '%s\n' "$simulation" | grep -E '^(Inst|Remv) ' || true
  apt-get -y --no-remove \
    -o Dpkg::Options::=--force-confdef \
    -o Dpkg::Options::=--force-confold \
    upgrade || fail 'APT upgrade basarisiz. Otomatik APT rollback yapilmadi.'
  systemctl is-active --quiet docker || fail 'Paket guncellemesinden sonra Docker durmus'
  systemctl is-active --quiet nginx || fail 'Paket guncellemesinden sonra Nginx durmus'
  docker inspect nexus_timescaledb --format '{{.State.Health.Status}}' | grep -qx healthy || \
    fail 'Paket guncellemesi sonrasi TimescaleDB sagliksiz'
  wait_health || fail 'Paket guncellemesi sonrasi web/API sagliksiz'
  note 'APT sonrasi servisler saglikli.'
}

compute_rollback_policy() {
  local changed file
  ROLLBACK_SAFE=true
  changed=$(repo_git diff --name-only "$OLD_HEAD" "$NEW_HEAD") || { ROLLBACK_SAFE=false; return; }
  while IFS= read -r file; do
    [[ -n "$file" ]] || continue
    # Strict allowlist: only frontend/static assets can be safely code-rolled-back,
    # plus an unchanged DB schema fingerprint after deployment.
    case "$file" in
      src/components/*|src/pages/*|src/styles/*|public/*|index.html|src/App.tsx|src/main.tsx|src/index.css)
        ;;
      *) ROLLBACK_SAFE=false ;;
    esac
  done <<< "$changed"
  if [[ "$ROLLBACK_SAFE" == true ]]; then
    SCHEMA_BEFORE=$(schema_fingerprint || true)
    [[ -n "$SCHEMA_BEFORE" ]] || ROLLBACK_SAFE=false
  fi
  note "App otomatik rollback uygunluk adayi: $ROLLBACK_SAFE (deploy sonrasi DB semasi da karsilastirilacak)"
}

restore_previous_app_if_safe() {
  local after
  if [[ "$ROLLBACK_SAFE" != true || -z "$OLD_APP_IMAGE" ]]; then
    note 'Otomatik rollback yasak: kod/veritabani riski veya eksik eski imaj.'
    return 1
  fi
  after=$(schema_fingerprint || true)
  if [[ -z "$after" || "$after" != "$SCHEMA_BEFORE" ]]; then
    note 'DB semasi degismis veya okunamiyor; otomatik rollback yasak.'
    return 1
  fi
  note 'Guvenli UI-only geri donus deneniyor (yalnizca app container).'
  docker image tag "$OLD_APP_IMAGE" "$APP_IMAGE" || return 1
  docker compose up -d --no-deps --no-build --force-recreate app || return 1
  wait_health || return 1
  printf '%s\n' "From: $OLD_HEAD" "To: $NEW_HEAD" "Time: $STAMP" > "$STATE_ROOT/rollback-needs-review"
  note 'App eski imaja donduruldu. Git kodu ileri surumde; manuel inceleme gerekiyor.'
}

wait_health() {
  local attempt
  for attempt in $(seq 1 24); do
    if [[ $(docker inspect nexus_app --format '{{.State.Health.Status}}' 2>/dev/null || true) == healthy ]] && \
       verify_endpoints; then
      note "App/API/HTTPS saglikli (deneme $attempt)."
      return 0
    fi
    sleep 5
  done
  return 1
}

upgrade_app() {
  step 'Git origin/main fast-forward + uygulama build'
  local previous_db_image current_db_image
  previous_db_image=$(docker compose config --images | grep -E '^timescale/timescaledb:' | head -1) || \
    fail 'TimescaleDB image etiketi okunamadi'
  repo_git fetch origin main || fail 'Git fetch basarisiz'
  local target
  target=$(repo_git rev-parse refs/remotes/origin/main) || fail 'origin/main bulunamadi'
  repo_git merge-base --is-ancestor "$OLD_HEAD" "$target" || \
    fail 'Git main fast-forward degil (divergence); force/reset yasak'
  # Compose service wiring, especially DB volumes/secrets, needs separate review.
  # Do not merge an unknown production Compose change automatically.
  if repo_git diff --name-only "$OLD_HEAD" "$target" | grep -Eq \
    '^(docker-compose\.ya?ml|compose\.ya?ml|compose\.override\.ya?ml)$'; then
    fail 'Yeni main Compose yapilandirmasini degistiriyor; manuel inceleme gerekli.'
  fi
  repo_git merge --ff-only origin/main || fail 'Git fast-forward basarisiz'
  NEW_HEAD=$(repo_git rev-parse HEAD)
  note "Git guncellendi: $OLD_HEAD -> $NEW_HEAD"
  current_db_image=$(docker compose config --images | grep -E '^timescale/timescaledb:' | head -1) || \
    fail 'Git sonrasi TimescaleDB image etiketi okunamadi'
  [[ "$previous_db_image" == "$current_db_image" ]] || \
    fail 'Git yeni TimescaleDB imaj etiketi getiriyor; ayrica onay olmadan otomatik yayin YASAK'
  [[ -z $(unexpected_git_changes) ]] || \
    fail 'Git update sonrasi updater disinda yeni/yerel dosyalar goruldu'
  # Re-validate ignores after fetching remotely editable Dockerfile and .dockerignore.
  local x
  for x in 'secrets/' '.env' 'data/' '*.sql' '*.dump'; do
    grep -Fxq -- "$x" .dockerignore || fail "Yeni .dockerignore tehlikeli: $x eksik"
  done
  if grep -Eq '^![^#]*(secrets/|\.env|data/)' .dockerignore; then
    fail 'Yeni .dockerignore hassas yollar icin ters kural (!) iceriyor'
  fi
  compute_rollback_policy
  OLD_APP_IMAGE=$(docker inspect nexus_app --format '{{.Image}}') || fail 'Eski app imaji okunamadi'
  docker image tag "$OLD_APP_IMAGE" "nexusnode-app-rollback:$STAMP" || fail 'Rollback imaji korunamadi'
  require_disk || fail 'App build oncesi disk alani yetersiz'
  local candidate="iot-dashboard-app:candidate-$STAMP"
  docker build --pull -t "$candidate" -f Dockerfile . || \
    fail 'Build basarisiz; eski canli app container korunuyor.'
  docker image tag "$candidate" "$APP_IMAGE" || fail 'Yeni app tag basarisiz; eski container aktif'
  step 'NexusNode uygulama yayini'
  local deployed=true running_image
  docker compose up -d --no-deps --no-build --force-recreate app || deployed=false
  if [[ "$deployed" == true ]] && wait_health; then
    note 'Yeni app yayinlandi; health testleri gecti.'
  else
    note 'Yeni app saglik testi basarisiz; rollback uygunlugu kontrol ediliyor.'
    running_image=$(docker inspect nexus_app --format '{{.Image}}' 2>/dev/null || true)
    if [[ "$running_image" == "$OLD_APP_IMAGE" ]]; then
      docker image tag "$OLD_APP_IMAGE" "$APP_IMAGE" || fail 'Eski app tag yeniden baglanamadi'
      fail 'Yeni app hic aktive edilemedi; eski container calisiyor ve imaj etiketi geri alindi.'
    fi
    if restore_previous_app_if_safe; then
      fail 'Yeni app basarisiz; eski uygulama guvenle geri getirildi. Git incelemesi gerekli.'
    fi
    fail 'Yeni app basarisiz; otomatik geri donus guvenli degil. DB/app manuel kurtarma gerekli.'
  fi
}

upgrade_adminer() {
  step 'Sabit surumlu Adminer Docker imaji'
  local image old
  image=$(docker compose config --images | grep -E '^adminer:' | head -1) || \
    fail 'Adminer imaj etiketi bulunamadi'
  [[ -n "$image" ]] || fail 'Adminer imaji bos'
  old=$(docker inspect nexus_adminer --format '{{.Image}}') || fail 'Eski Adminer imaji okunamadi'
  docker image tag "$old" "nexusnode-adminer-rollback:$STAMP" || fail 'Adminer rollback etiketi olusmadi'
  docker compose pull adminer || fail 'Adminer pull basarisiz; mevcut calisan container korunuyor'
  if ! docker compose up -d --no-deps --no-build adminer; then
    note 'Adminer deploy hatasi, onceki imajla geri donuluyor.'
    docker image tag "$old" "$image" || fail 'Adminer eski imaja tag edilemedi'
    docker compose up -d --no-deps --no-build --force-recreate adminer || \
      fail 'Adminer rollback basarisiz'
    fail 'Adminer update geri alindi; kontrol et'
  fi
  local code
  code=$(curl --noproxy '*' -sS -o /dev/null -w '%{http_code}' --max-time 12 http://127.0.0.1:8080/ || true)
  if [[ ! "$code" =~ ^(200|301|302|303)$ ]]; then
    docker image tag "$old" "$image" || fail 'Adminer sagliksiz ve tag rollback basarisiz'
    docker compose up -d --no-deps --no-build --force-recreate adminer || \
      fail 'Adminer sagliksiz; rollback basarisiz'
    fail "Adminer HTTP $code; eski imaja geri donuldu"
  fi
  note "Adminer saglikli (HTTP $code); imaj etiketi: $image"
}

final_checks() {
  step 'Son sistem sagligi'
  nginx -t || fail 'Nginx config testi hatali'
  systemctl is-active --quiet fail2ban || fail 'Fail2ban calismiyor'
  check_services
  note 'Reboot gereksinimi kontrol ediliyor.'
  if [[ -e /run/reboot-required ]]; then
    note 'REBOOT GEREKLI: yeniden baslatma onaysiz yapilmayacak.'
    if confirm 'VPS simdi yeniden baslatilsin mi? SSH baglantisi kopacak'; then
      note 'VPS yeniden baslatma onaylandi. Boot sonrasi yeniden vps-update --check calistirin.'
      systemctl reboot || fail 'Reboot komutu basarisiz'
    else
      note 'Reboot ertelendi. Kernel/paket degisikliklerinin bir kismi aktif olmayabilir.'
    fi
  else
    note 'Reboot bayragi yok.'
  fi
  note 'GUNCELLEME BASARILI.'
}

check_git
check_services
if [[ "$MODE" == --check ]]; then
  read_only_report
  note 'SALT OKUNUR KONTROL BITTI. Gercek guncelleme icin: sudo bash ./vps-update.sh --run'
  exit 0
fi
# Fresh backup must precede any cleanup, package change, pull or deploy.
(( $(free_kib) >= 1024 * 1024 )) || fail 'Yeni yedek olusturmak icin en az 1 GiB alan gerekli'
backup_and_validate
prepare_disk
if [[ "${NEXUS_SYSTEM_UPDATE:-0}" == 1 ]]; then
  apt_upgrade
  prepare_disk
else
  note 'Debian paket guncellemesi atlandi (istege bagli: NEXUS_SYSTEM_UPDATE=1).'
fi
upgrade_app
upgrade_adminer
final_checks
