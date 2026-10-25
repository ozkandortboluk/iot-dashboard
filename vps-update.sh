#!/usr/bin/env bash
# NexusNode VPS Update - v0.5 (Smart Edition - Debian 13 / Docker Compose)
# Run from the project root: sudo bash ./vps-update.sh [--check|--run|--clean|--status|--help]
# Default: manual run. --check is read-only; --run performs update; --clean frees disk.
set -Eeuo pipefail
umask 077
export LC_ALL=C

# Terminal color & style configuration (auto-disabled if output is redirected or NO_COLOR=1)
if [[ -t 1 && "${NO_COLOR:-0}" != 1 ]]; then
  CLR_RESET='\033[0m'
  CLR_BOLD='\033[1m'
  CLR_DIM='\033[2m'
  CLR_RED='\033[0;31m'
  CLR_GREEN='\033[0;32m'
  CLR_YELLOW='\033[0;33m'
  CLR_BLUE='\033[0;34m'
  CLR_MAGENTA='\033[0;35m'
  CLR_CYAN='\033[0;36m'
  CLR_WHITE='\033[1;37m'
else
  CLR_RESET=''
  CLR_BOLD=''
  CLR_DIM=''
  CLR_RED=''
  CLR_GREEN=''
  CLR_YELLOW=''
  CLR_BLUE=''
  CLR_MAGENTA=''
  CLR_CYAN=''
  CLR_WHITE=''
fi

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
MAX_ROLLBACK_KEEP=${NEXUS_MAX_ROLLBACK_KEEP:-3}

MODE=""
FORCE_YES=false
ALLOW_COMPOSE=false
REMOTE_CHECK=true
CLEAN_DRY_RUN=false
CLEAN_DEEP=false
CLEAN_YES=false

STAGE=initial
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OLD_APP_IMAGE=''
OLD_HEAD=''
NEW_HEAD=''
ROLLBACK_SAFE=false
SCHEMA_BEFORE=''

usage() {
  cat <<'EOF'
================================================================================
  NexusNode VPS Akilli Yonetim, Guncelleme & Bakim Araci (vps-update.sh v0.5)
  Debian 13 / Docker Compose Mimarisi Icin Ozel Olarak Gelistirilmistir
================================================================================

KULLANIM:
  sudo bash ./vps-update.sh [MOD] [SEÇENEKLER]

ANA MODLAR:
  --check (Varsayılan)
      Salt okunur (read-only) kapsamli sistem ve guncelleme on denetimi yapar.
      Git agaci, GitHub'daki yeni commit/surum farki, Docker servisleri, Nginx,
      TimescaleDB, HTTPS/API uclari, SSL sertifika gecerliligi, disk alani ve
      son yedek durumunu inceler ve detayli durum karti ile raporlar.
      Hicbir dosya silmez, servisleri durdurmaz veya degistirmez.

  --run [SEÇENEKLER]
      Tam denetimli, guvenli ve akilli guncelleme surecini baslatir:
      1. Git main dali ve calisma agaci dogrulamasi
      2. Uzak GitHub deposu commit farki ve surum karsilastirmasi
      3. Servis saglik ve secret dosya izin kontrolleri
      4. Otomatik dogrulanmis yerel yedek olusturma (systemd + container fallback)
      5. Disk alani kontrolu (gerekirse guvenli build-cache temizligi)
      6. origin/main dalindan guvenli fast-forward birlestirme
      7. Compose degisiklik tespiti, gosterimi ve guvenlik denetimi
      8. Dockerfile ile yeni uygulamanin yalitimli imaj derlemesi
      9. Yalnizca app servisinin sifira yakin kesintiyle yayinlanmasi
      10. Coklu saglik kontrolleri ve basarisizlikta otomatik UI rollback korumasi
      11. Adminer imaj kontrolu, son sistem saglik ve opsiyonel reboot denetimi
      12. Basarili yayin sonrasi otomatik temizlik (Gecici aday silinir, son 3 rollback saklanir)

  --status | --info
      Hizli sistem ve servis ozeti: Calisan konteyner sagligi, Nginx, API durumu,
      disk alani, aktif surum ve son yedek bilgisini 2 saniyede gosterir.

  --clean | --cleanup [SEÇENEKLER]
      VPS uzerinde gereksiz dosyalari, artik derleme ciktilarini, Docker onbelleklerini
      ve birikmis gunlukleri guvenle temizleyerek disk alani kazandirir.

      TEMIZLENEN OGELER:
      • Docker Builder / BuildKit onbellegi (docker builder prune -af)
      • Sahipsiz (dangling) ve etiketsiz (<none>) Docker imajlari
      • Durdurulmus gecici konteynerler ve kullanilmayan Docker aglari
      • Eski gecici aday derleme imajlari (iot-dashboard-app:candidate-*)
      • Eski rollback imajlari (nexusnode-app/adminer-rollback:* -> son 3 tanesi korunur)
      • Host uzerindeki derleme artiklari (dist/, build/, server.js)
      • Node & derleyici onbellekleri (node_modules/.cache, .eslintcache, .tsbuildinfo)
      • Test ve kapsam raporlari (coverage/, .nyc_output/)
      • Debian APT paket arsiv onbellegi (/var/cache/apt/archives)
      • Systemd Journal loglari (7 gunden eski veya 100M uzeri gunlukler vakumlanir)
      • Guncelleme kayitlari (/var/log/nexusnode-update/ -> 14 gunden eskiler)
      • Dondurulmus gecici betikler (/var/lib/nexusnode-update/ -> 7 gunden eskiler)
      • /tmp ve /var/tmp altindaki 7 gunden eski gecici artik dosyalar

  --help | -h
      Bu detayli komut kilavuzunu goruntuler.

SEÇENEKLER & BAYRAKLAR:
  -y, --yes
      Tum interaktif onay sorularini (disk temizligi, reboot vb.) otomatik 'evet' kabul eder.
      Cron gorevleri, CI/CD hatlari ve otomatik komutlar icin uygundur.

  --allow-compose
      Uzak GitHub deposunda docker-compose.yml degisikligi varsa, farki gostererek
      otomatik guncellemeye izin verir (varsayilan: guvenlik icin onay ister).

  --offline, --no-remote
      --check modunda uzak GitHub deposuna baglanmadan yalnizca yerel durumu inceler.

  --dry-run
      --clean modunda simulasyon yapar; hicbir dosya silmeden potansiyel disk kazancini listeler.

  --deep, --all
      --clean modunda derin sistem temizligi yapar (apt autoremove --purge, agresif log vakumu).

  --verbose, -v
      Terminalde tum detayli ciktilari ve log akisini gosterir (NEXUS_VERBOSE=1).

CEVRE DEGISKENLERI:
  NEXUS_SYSTEM_UPDATE=1
      --run calismasi sirasinda Debian isletim sistemi paketlerini (apt upgrade) de gunceller.
  NEXUS_VERBOSE=1
      Terminalde tum detayli log ciktilarini gosterir.

GUVENLIK VE VERI KORUMA GARANTISI:
  • ASLA Docker volume'larini (timescaledb_data, app_data) silmez.
  • ASLA PostgreSQL/TimescaleDB veri tabanini silmez.
  • ASLA yedek arsivlerini (/var/backups/nexusnode/) silmez.
  • ASLA secret anahtarlarini (secrets/, .env) silmez.
  • ASLA aktif calisan uretim konteynerlerini durdurmaz veya silmez.
  • ASLA zorla Git sifirlamasi (git reset --hard / git clean -fd) yapmaz.

ORNEK KULLANIMLAR:
  sudo bash ./vps-update.sh                    # Varsayilan guvenli on kontrol
  sudo bash ./vps-update.sh --status           # 2 saniyede anlik sistem ozeti
  sudo bash ./vps-update.sh --check            # Detayli on denetim ve GitHub fark analizi
  sudo bash ./vps-update.sh --clean            # Standart guvenli disk temizligi
  sudo bash ./vps-update.sh --clean --deep     # Derin sistem & kernel temizligi
  sudo bash ./vps-update.sh --clean --dry-run  # Silmeden temizlik analizi
  sudo bash ./vps-update.sh --run              # Guvenli adim adim canli guncelleme
  sudo bash ./vps-update.sh --run -y           # Onaysiz tam otomatik guncelleme
  sudo bash ./vps-update.sh --run --allow-compose # Compose degisikliklerine izin veren guncelleme
================================================================================
EOF
}

# Smart argument parsing: handles any order of flags and options
ORIG_ARGS=("$@")
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) MODE=--check ;;
    --run) MODE=--run ;;
    --status|--info) MODE=--status ;;
    --clean|--cleanup) MODE=--clean ;;
    -y|--yes) FORCE_YES=true; CLEAN_YES=true ;;
    --dry-run) CLEAN_DRY_RUN=true ;;
    --deep|--all) CLEAN_DEEP=true ;;
    --allow-compose|--force-compose) ALLOW_COMPOSE=true ;;
    --offline|--no-remote) REMOTE_CHECK=false ;;
    --verbose|-v) export NEXUS_VERBOSE=1 ;;
    --help|-h|help) usage; exit 0 ;;
    *)
      if [[ -z "$MODE" ]]; then
        case "$1" in
          check) MODE=--check ;;
          run) MODE=--run ;;
          clean|cleanup) MODE=--clean ;;
          status|info) MODE=--status ;;
          *)
            echo "HATA: Bilinmeyen parametre: $1" >&2
            usage >&2
            exit 2
            ;;
        esac
      else
        echo "HATA: Bilinmeyen secenek: $1" >&2
        usage >&2
        exit 2
      fi
      ;;
  esac
  shift
done
MODE=${MODE:---check}

note() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
fail() { printf '[%s] %bHATA (%s): %s%b\n' "$(date '+%F %T')" "$CLR_RED" "$STAGE" "$*" "$CLR_RESET" >&2; exit 1; }
step() { STAGE="$1"; printf '[%s] %b===== %s =====%b\n' "$(date '+%F %T')" "$CLR_BOLD$CLR_CYAN" "$STAGE" "$CLR_RESET"; }

on_failure() {
  rc=$?
  if (( rc != 0 )); then
    printf '[%s] %bISLEM DURDU: asama=%s, exit=%d. Otomatik DB/OS geri alma YOK.%b\n' "$(date '+%F %T')" "$CLR_RED" "$STAGE" "$rc" "$CLR_RESET"
    if [[ "$MODE" == --run || "$MODE" =~ ^(--clean|--cleanup)$ ]]; then
      if [[ -n "${LOG_FILE:-}" ]]; then note "Log: $LOG_FILE"; fi
      note "Calisan container/volume ve mevcut yedekler otomatik silinmedi."
    fi
  fi
}
trap on_failure EXIT

[[ -d "$REPO/.git" ]] || fail "Git checkout yok: $REPO. Betigi proje ana dizinine koyun."
if [[ $EUID -ne 0 ]]; then
  if [[ "$MODE" == --status ]]; then
    note "Bilgi: Hizli durum ozeti non-root (sudo olmadan) calistiriliyor."
  else
    fail "root yetkisi gerekli: sudo bash ./vps-update.sh $MODE"
  fi
fi
cd "$REPO"

# Make a protected runtime copy for a real update, because a Git fast-forward
# may change vps-update.sh itself if the file is tracked in the repository.
# All original arguments are forwarded. No snapshot is created in --check/--status mode.
if [[ "$MODE" == --run && "${NEXUS_UPDATE_FROZEN:-0}" != 1 ]]; then
  install -d -m 700 -o root -g root "$STATE_ROOT"
  FROZEN_SCRIPT="$STATE_ROOT/source-$STAMP-$$.sh"
  install -o root -g root -m 700 -- "$SCRIPT_SOURCE" "$FROZEN_SCRIPT"
  exec env NEXUS_UPDATE_FROZEN=1 NEXUS_UPDATE_REPO_SNAPSHOT="$REPO" \
    /bin/bash "$FROZEN_SCRIPT" "${ORIG_ARGS[@]}"
fi

# Serialize update or cleanup runs. --check and --status do not create or change files.
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
    # Protected log receives everything; terminal displays milestones, steps, summaries and warnings.
    exec > >(tee -a "$LOG_FILE" | grep --line-buffered -E '^(\[[0-9]{4}-[0-9]{2}-[0-9]{2}|={5,}|[[:space:]]*[•↳✓ℹ⚠✖✨📌🔖💾🛡️📦📝])') 2>&1
  fi
  [[ ! -e "$STATE_ROOT/rollback-needs-review" ]] || fail "Onceki rollback incelenmedi. $STATE_ROOT/rollback-needs-review dosyasini kontrol et."
elif [[ "$MODE" =~ ^(--clean|--cleanup)$ && "$CLEAN_DRY_RUN" != true ]]; then
  command -v flock >/dev/null 2>&1 || true
  if command -v flock >/dev/null 2>&1; then
    install -d -m 700 -o root -g root "$LOG_ROOT" "$STATE_ROOT" 2>/dev/null || true
    if [[ -d "$STATE_ROOT" ]]; then
      exec 9>"$STATE_ROOT/update.lock"
      flock -n 9 || fail "Baska bir VPS guncelleme veya temizlik islemi calisiyor"
    fi
  fi
  if [[ -d "$LOG_ROOT" ]]; then
    LOG_FILE="$LOG_ROOT/clean-$STAMP.log"
    : > "$LOG_FILE" 2>/dev/null || true
    chmod 600 "$LOG_FILE" 2>/dev/null || true
    exec > >(tee -a "$LOG_FILE") 2>&1
  fi
fi

REQUIRED_CMDS=(git df find stat)
if [[ "$MODE" != --status ]]; then
  REQUIRED_CMDS+=(docker curl sha256sum systemctl)
fi
for cmd in "${REQUIRED_CMDS[@]}"; do
  command -v "$cmd" >/dev/null 2>&1 || fail "Komut eksik: $cmd"
done

REPO_OWNER=$(stat -c '%U' "$REPO/.git")
[[ -n "$REPO_OWNER" ]] || fail "Git sahibi belirlenemedi"
repo_git() {
  local readonly_env=()
  if [[ "$MODE" == --check || "$MODE" == --status ]]; then readonly_env=(GIT_OPTIONAL_LOCKS=0); fi
  if [[ "$REPO_OWNER" == root || $EUID -ne 0 || ! $(command -v runuser 2>/dev/null) ]]; then
    env GIT_TERMINAL_PROMPT=0 "${readonly_env[@]}" git -c "safe.directory=$REPO" -C "$REPO" "$@"
  else
    runuser -u "$REPO_OWNER" -- env GIT_TERMINAL_PROMPT=0 "${readonly_env[@]}" \
      git -c "safe.directory=$REPO" -C "$REPO" "$@"
  fi
}

free_kib() { df -Pk "$REPO" | awk 'NR==2 {print $4}'; }
format_kib() {
  local kib="${1:-0}"
  if (( kib >= 1048576 )); then
    awk -v k="$kib" 'BEGIN {printf "%.2f GiB", k/1048576}'
  elif (( kib >= 1024 )); then
    awk -v k="$kib" 'BEGIN {printf "%.1f MiB", k/1024}'
  else
    printf "%d KiB" "$kib"
  fi
}

require_disk() {
  local free required
  free=$(free_kib)
  required=$((MIN_FREE_GIB * 1024 * 1024))
  note "Bos disk: $(format_kib "$free") (${free} KiB) / alt esik: $(format_kib "$required") (${required} KiB)"
  (( free >= required )) || return 1
}

# The updater files may initially be copied into the project root without
# being committed yet. They are the exception to strict Git cleanliness.
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
}

# Smart container health wait with retry window to prevent false failures during transient container boot
check_container_health() {
  local cname="$1" max_wait="${2:-20}" status="" elapsed=0
  while (( elapsed < max_wait )); do
    status=$(docker inspect "$cname" --format '{{.State.Health.Status}}' 2>/dev/null || echo 'not_found')
    if [[ "$status" == "healthy" ]]; then
      return 0
    fi
    if [[ "$status" == "unhealthy" ]]; then
      return 1
    fi
    sleep 2
    elapsed=$(( elapsed + 2 ))
  done
  [[ "$status" == "healthy" ]]
}

check_services() {
  step 'Docker / Nginx / PostgreSQL / API'
  docker compose config --quiet || fail 'Compose config hatali'
  docker info >/dev/null 2>&1 || fail 'Docker calismiyor'
  systemctl is-active --quiet nginx || fail 'Nginx calismiyor'
  systemctl is-active --quiet fail2ban || fail 'Fail2ban calismiyor'

  check_container_health nexus_timescaledb 15 || fail 'PostgreSQL healthy degil'
  check_container_health nexus_app 15 || fail 'NexusNode container healthy degil'

  verify_endpoints || fail 'Uygulama endpoint kontrolleri basarisiz'
  [[ -s secrets/encryption_key && -s secrets/postgres_password ]] || fail 'Secret dosyalari bos/eksik'
  local f mode
  for f in secrets/encryption_key secrets/postgres_password; do
    mode=$(stat -c %a "$f")
    (( (8#$mode & 077) == 0 )) || fail "Secret izinleri guvensiz: $f ($mode)"
  done
  note 'Servisler saglikli; secrets mevcut ve sahibi disindakilere kapali (icerikler okunmadi).'
}

# Resilient endpoint verification with 3 retries and diagnostic reporting
verify_endpoints() {
  local payload="" code="" attempt=1 max_attempts=3
  while (( attempt <= max_attempts )); do
    if payload=$(curl --noproxy '*' -fsS --max-time 12 "$HEALTH_URL" 2>/dev/null) && \
       printf '%s' "$payload" | grep -Eq '"ready"[[:space:]]*:[[:space:]]*true' && \
       printf '%s' "$payload" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"connected"'; then
      code=$(curl --noproxy '*' -sS -o /dev/null -w '%{http_code}' --max-time 12 "$PUBLIC_URL" 2>/dev/null || echo '000')
      if [[ "$code" == 200 ]]; then
        return 0
      fi
    fi
    (( attempt < max_attempts )) && sleep 3
    attempt=$(( attempt + 1 ))
  done
  return 1
}

# Smart SSL/TLS certificate validity check
check_ssl_cert() {
  local cert_file="" days_left=0
  cert_file=$(find /etc/letsencrypt/live -type f -name 'cert.pem' 2>/dev/null | head -1 || true)
  if [[ -n "$cert_file" ]] && command -v openssl >/dev/null 2>&1; then
    local end_date exp_epoch now_epoch
    end_date=$(openssl x509 -enddate -noout -in "$cert_file" 2>/dev/null | cut -d'=' -f2-)
    if [[ -n "$end_date" ]]; then
      exp_epoch=$(date -d "$end_date" +%s 2>/dev/null || true)
      now_epoch=$(date +%s)
      if [[ -n "$exp_epoch" ]]; then
        days_left=$(( (exp_epoch - now_epoch) / 86400 ))
        if (( days_left < 14 )); then
          note "UYARI: SSL sertifikasi $days_left gun icinde sona erecek ($cert_file). 'certbot renew' onerilir."
        else
          note "SSL sertifikasi gecerli: $days_left gun kaldi ($cert_file)."
        fi
      fi
    fi
  else
    note "Let's Encrypt sertifikasi dosya yolundan tespit edilemedi (Nginx proxy uzerinden yonetiliyor olabilir)."
  fi
}

# Smart remote diff, commit counting, and version comparison
check_remote_updates() {
  step 'Uzak GitHub Depo & Surum Karsilastirmasi'
  if [[ "$REMOTE_CHECK" != true ]]; then
    note 'Uzak depo kontrolu kullanici tarafindan atlandi (--offline).'
    return 0
  fi

  local current_ver incoming_ver behind_count ahead_count target_commit
  current_ver=$(grep -E 'APP_VERSION\s*=\s*' "$REPO/src/config/version.ts" 2>/dev/null | cut -d'"' -f2 || echo '')
  if [[ -z "$current_ver" ]]; then
    current_ver=$(grep -E '"version":\s*"' "$REPO/package.json" 2>/dev/null | head -1 | cut -d'"' -f4 || echo 'bilinmiyor')
  fi

  note "Yerel calisan surum : v${current_ver} (Commit: ${OLD_HEAD:0:8})"

  if repo_git fetch --quiet origin main 2>/dev/null; then
    target_commit=$(repo_git rev-parse refs/remotes/origin/main 2>/dev/null || true)
    if [[ -n "$target_commit" ]]; then
      behind_count=$(repo_git rev-list --count "HEAD..$target_commit" 2>/dev/null || echo 0)
      ahead_count=$(repo_git rev-list --count "$target_commit..HEAD" 2>/dev/null || echo 0)

      incoming_ver=$(repo_git show "origin/main:src/config/version.ts" 2>/dev/null | grep -E 'APP_VERSION\s*=\s*' | cut -d'"' -f2 || echo '')
      if [[ -z "$incoming_ver" ]]; then
        incoming_ver=$(repo_git show "origin/main:package.json" 2>/dev/null | grep -E '"version":\s*"' | head -1 | cut -d'"' -f4 || echo '')
      fi

      if (( behind_count > 0 )); then
        note "✨ YENI GUNCELLEME MEVCUT: v${current_ver} -> v${incoming_ver:-${target_commit:0:8}} (${behind_count} yeni commit)"
        note "Gelen son commitler:"
        repo_git log --oneline "HEAD..$target_commit" 2>/dev/null | head -n 5 | while IFS= read -r c_line; do
          note "   • $c_line"
        done

        local migrations
        migrations=$(repo_git diff --name-only "HEAD..$target_commit" 2>/dev/null | grep -E '(migration|migrations/|\.sql$)' || true)
        if [[ -n "$migrations" ]]; then
          note "⚠️ Gelen guncellemede VERITABANI GOCU (migration) tespit edildi:"
          while IFS= read -r m_file; do
            note "   ↳ $m_file"
          done <<< "$migrations"
          note "   Bilgi: Veritabani otomatik rollback kisitlanacak; zorunlu tam yerel yedek alinacak."
        else
          note "ℹ️ Gelen guncelleme veritabani sema gocusu icermiyor (guvenli kod/UI guncellemesi)."
        fi

        local compose_changes
        compose_changes=$(repo_git diff --name-only "HEAD..$target_commit" 2>/dev/null | grep -E '^(docker-compose\.ya?ml|Dockerfile)$' || true)
        if [[ -n "$compose_changes" ]]; then
          note "ℹ️ Altyapi / Docker konfigurasyon degisikligi mevcut: $compose_changes"
        fi
      elif (( ahead_count > 0 )); then
        note "Bilgi: Yerel depo uzaktan ${ahead_count} commit ileride."
      else
        note "✓ SISTEM GUNCEL: Yerel depo GitHub origin/main ile tam senkronize."
      fi
    fi
  else
    note "Uzak GitHub deposuna erisilemedi (cevrimdisi veya ag gecikmesi). Uzak surum kontrolu atlandi."
  fi
}

read_only_report() {
  step 'Disk / APT / SSL / Yedek Denetimi'
  note "Bos disk: $(df -h "$REPO" | awk 'NR==2 {print $4}')"
  if [[ "${NEXUS_VERBOSE:-0}" == 1 ]]; then
    df -h "$REPO"
    docker system df
    apt list --upgradable 2>/dev/null || true
  fi
  check_ssl_cert
  if [[ -f /run/reboot-required ]]; then note 'Yeniden baslatma GEREKLI'; else note 'Yeniden baslatma isareti yok'; fi
  systemctl show nexusnode-local-backup.service -p Result -p ExecMainStatus --no-pager 2>/dev/null || true
  local latest
  latest=$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'yedek-*' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2- || true)
  if [[ -n "$latest" ]]; then
    note "Son yedek: $latest ($(du -sh "$latest" 2>/dev/null | awk '{print $1}'))"
  else
    note 'Son yedek bulunamadi'
  fi
  if ! require_disk; then note "UYARI: ${MIN_FREE_GIB} GiB disk esigi altinda; --run temizlik icin onay ister."; fi
}

confirm() {
  local prompt="$1" answer
  if [[ "$FORCE_YES" == true || "$CLEAN_YES" == true ]]; then
    note "$prompt -> [OTOMATIK EVET: -y/--yes aktif]"
    return 0
  fi
  if [[ ! -r /dev/tty ]]; then
    note 'Onay terminali yok; varsayilan HAYIR.'
    return 1
  fi
  if [[ -t 1 ]]; then
    printf '%b%s [evet/HAYIR]: %b' "$CLR_BOLD$CLR_YELLOW" "$prompt" "$CLR_RESET" > /dev/tty
  else
    printf '%s [evet/HAYIR]: ' "$prompt" > /dev/tty
  fi
  IFS= read -r answer < /dev/tty || return 1
  [[ "$answer" == evet || "$answer" == y || "$answer" == yes || "$answer" == EVET ]]
}

prune_old_rollbacks() {
  local keep="${1:-$MAX_ROLLBACK_KEEP}"
  step "Rollback ve gecici imaj rotasyonu (Guvenlik icin son $keep yukleme saklaniyor)"

  if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
    note 'Docker calismiyor; rollback rotasyonu atlandi.'
    return 0
  fi

  # 1. Gecici aday (candidate) derleme imajlarini temizle
  local cand_imgs
  cand_imgs=$(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -E '^iot-dashboard-app:candidate-' || true)
  if [[ -n "$cand_imgs" ]]; then
    note "Gecici aday derleme imajlari siliniyor..."
    # shellcheck disable=SC2086
    docker rmi $cand_imgs 2>/dev/null || true
  fi

  # 2. App rollback imajlari: son $keep tanesini koru, daha eskileri sil
  local old_app_rb
  old_app_rb=$(docker images --format '{{.CreatedAt}}\t{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -E 'nexusnode-app-rollback:' | sort -r | awk -F'\t' -v k="$keep" 'NR > k {print $2}' || true)
  if [[ -n "$old_app_rb" ]]; then
    note "Son $keep yukleme haricindeki eski app rollback imajlari siliniyor: $(echo "$old_app_rb" | tr '\n' ' ')"
    # shellcheck disable=SC2086
    docker rmi $old_app_rb 2>/dev/null || true
  else
    note "App rollback imajlari guvenli sinirda (son $keep yukleme korundu)."
  fi

  # 3. Adminer rollback imajlari: son $keep tanesini koru, daha eskileri sil
  local old_adminer_rb
  old_adminer_rb=$(docker images --format '{{.CreatedAt}}\t{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -E 'nexusnode-adminer-rollback:' | sort -r | awk -F'\t' -v k="$keep" 'NR > k {print $2}' || true)
  if [[ -n "$old_adminer_rb" ]]; then
    note "Son $keep yukleme haricindeki eski adminer rollback imajlari siliniyor: $(echo "$old_adminer_rb" | tr '\n' ' ')"
    # shellcheck disable=SC2086
    docker rmi $old_adminer_rb 2>/dev/null || true
  else
    note "Adminer rollback imajlari guvenli sinirda (son $keep yukleme korundu)."
  fi
}

clean_disk() {
  step 'Disk Temizligi ve Alan Kazanimi'
  local before_kib after_kib diff_kib
  before_kib=$(free_kib)
  note "Temizlik oncesi bos disk: $(format_kib "$before_kib")"
  note "Mevcut disk durumu: $(df -h "$REPO" 2>/dev/null | awk 'NR==2 {printf "Toplam: %s | Kullanilan: %s | Bos: %s (%s)", $2, $3, $4, $5}')"

  if [[ "$CLEAN_DRY_RUN" == true ]]; then
    step 'Simulasyon Modu (--dry-run) - Temizlenebilir Alan Taramasi'
    note 'Hicbir dosya veya imaj silinmeyecektir; potansiyel temizlik kaynaklari listeleniyor:'

    if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
      note '--- Docker Kaynaklari ve Geri Kazanilabilir Alan ---'
      docker system df 2>/dev/null || true
      local cand_count rb_app_count rb_adm_count
      cand_count=$(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -c -E '^iot-dashboard-app:candidate-' || true)
      rb_app_count=$(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -c -E '^nexusnode-app-rollback:' || true)
      rb_adm_count=$(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -c -E '^nexusnode-adminer-rollback:' || true)
      note "  Gecici aday Docker imajlari       : $cand_count adet (tamami temizlenecek)"
      note "  App rollback Docker imajlari      : $rb_app_count adet (guvenlik icin son $MAX_ROLLBACK_KEEP tanesi korunacak)"
      note "  Adminer rollback Docker imajlari  : $rb_adm_count adet (guvenlik icin son $MAX_ROLLBACK_KEEP tanesi korunacak)"
    fi

    note '--- Proje Ici Derleme ve Onbellek Boyutlari ---'
    local item
    for item in "$REPO/dist" "$REPO/build" "$REPO/node_modules/.cache" "$REPO/coverage" "$REPO/.nyc_output"; do
      if [[ -d "$item" ]]; then
        note "  $(du -sh "$item" 2>/dev/null || true)"
      fi
    done

    if [[ -d /var/cache/apt/archives ]]; then
      note '--- APT Paket Onbellegi ---'
      note "  /var/cache/apt/archives: $(du -sh /var/cache/apt/archives 2>/dev/null || true)"
    fi

    if command -v journalctl >/dev/null 2>&1; then
      note '--- Systemd Journal Log Kullanimi ---'
      journalctl --disk-usage 2>/dev/null || true
    fi

    if [[ -d "$LOG_ROOT" ]]; then
      note "--- Guncelleme Loglari ($LOG_ROOT) ---"
      note "  $(du -sh "$LOG_ROOT" 2>/dev/null || true)"
    fi

    note 'Simulasyon tamamlandi. Hicbir degisiklik yapilmadi.'
    note 'Temizligi uygulamak icin: sudo bash ./vps-update.sh --clean'
    return 0
  fi

  if [[ "$CLEAN_YES" != true && "$FORCE_YES" != true ]]; then
    note 'Bu islem Docker builder onbellegini, sahipsiz imajlari, host derleme kalintilarini,'
    note "APT paket onbellegini, eski sistem gunluklerini ve son $MAX_ROLLBACK_KEEP haricindeki eski rollback imajlarini temizleyecektir."
    note "GUVENCE: Veritabani (TimescaleDB), Docker volume, yedekler, secrets ve son $MAX_ROLLBACK_KEEP yukleme ASLA SILINMEZ."
    confirm 'Disk temizligini baslatmak istiyor musunuz?' || {
      note 'Kullanici onayi verilmedi; temizlik iptal edildi.'
      return 0
    }
  fi

  # 1. Proje Ici Derleme Kalintilari ve Onbellekler
  step 'Temizlik 1/6: Proje derleme ve onbellek kalintilari'
  local target
  for target in "$REPO/dist" "$REPO/build" "$REPO/server.js" "$REPO/node_modules/.cache" \
               "$REPO/.eslintcache" "$REPO/.tsbuildinfo" "$REPO/coverage" "$REPO/.nyc_output"; do
    if [[ -e "$target" ]]; then
      note "Siliniyor: ${target#"$REPO"/}"
      rm -rf "$target" 2>/dev/null || true
    fi
  done
  find "$REPO" -maxdepth 2 -type f \( -name 'npm-debug.log*' -o -name 'yarn-error.log*' -o -name 'pnpm-debug.log*' -o -name 'core.*' \) -delete 2>/dev/null || true
  note 'Proje ici derleme artigi ve onbellek temizligi tamamlandi.'

  # 2. Docker Temizligi
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    step 'Temizlik 2/6: Docker BuildKit onbellegi ve sahipsiz nesneler'
    note 'Docker builder onbellegi temizleniyor (docker builder prune -af)...'
    docker builder prune -af 2>/dev/null || true

    note 'Sahipsiz (dangling) imajlar temizleniyor (docker image prune -f)...'
    docker image prune -f 2>/dev/null || true

    note 'Durdurulmus gecici konteynerler temizleniyor...'
    docker container prune -f 2>/dev/null || true

    note 'Kullanilmayan aglar temizleniyor...'
    docker network prune -f 2>/dev/null || true

    prune_old_rollbacks "$MAX_ROLLBACK_KEEP"
    note 'Docker nesne temizligi tamamlandi.'
  else
    note 'Docker calismiyor; Docker temizligi atlandi.'
  fi

  # 3. APT Paket Onbellegi ve Paketler
  if command -v apt-get >/dev/null 2>&1; then
    step 'Temizlik 3/6: APT paket onbellegi'
    note 'Indirilmis .deb paketleri temizleniyor (apt-get clean & autoclean)...'
    apt-get clean 2>/dev/null || true
    apt-get autoclean 2>/dev/null || true

    if [[ "$CLEAN_DEEP" == true ]]; then
      note 'Derin mod: Kullanilmayan paketler ve eski cekirdekler kaldiriliyor (apt-get autoremove --purge)...'
      export DEBIAN_FRONTEND=noninteractive
      apt-get -y --purge autoremove 2>/dev/null || true
    fi
    note 'APT temizligi tamamlandi.'
  fi

  # 4. Systemd Journal Loglari
  if command -v journalctl >/dev/null 2>&1; then
    step 'Temizlik 4/6: Systemd Journal gunlukleri'
    if [[ "$CLEAN_DEEP" == true ]]; then
      note 'Journal gunlukleri vakumlaniyor (son 3 gun / maks 50M)...'
      journalctl --vacuum-time=3d 2>/dev/null || true
      journalctl --vacuum-size=50M 2>/dev/null || true
    else
      note 'Journal gunlukleri vakumlaniyor (son 7 gun / maks 100M)...'
      journalctl --vacuum-time=7d 2>/dev/null || true
      journalctl --vacuum-size=100M 2>/dev/null || true
    fi
    note 'Journal log temizligi tamamlandi.'
  fi

  # 5. Guncelleme Loglari ve Dondurulmus Betikler
  step 'Temizlik 5/6: Eski guncelleme kayitlari ve gecici betikler'
  if [[ -d "$LOG_ROOT" ]]; then
    local log_days=14
    if [[ "$CLEAN_DEEP" == true ]]; then log_days=7; fi
    note "$LOG_ROOT altinda $log_days gunden eski loglar temizleniyor..."
    find "$LOG_ROOT" -type f \( -name 'update-*.log' -o -name 'clean-*.log' \) -mtime "+$log_days" -delete 2>/dev/null || true
  fi
  if [[ -d "$STATE_ROOT" ]]; then
    local script_days=7
    if [[ "$CLEAN_DEEP" == true ]]; then script_days=3; fi
    note "$STATE_ROOT altinda $script_days gunden eski dondurulmus betikler temizleniyor..."
    find "$STATE_ROOT" -type f -name 'source-*.sh' -mtime "+$script_days" -delete 2>/dev/null || true
  fi

  # 6. /tmp ve /var/tmp Temizligi
  step 'Temizlik 6/6: Eski gecici dosyalar (/tmp, /var/tmp)'
  find /tmp -mindepth 1 -maxdepth 2 -type f -mtime +7 -delete 2>/dev/null || true
  find /var/tmp -mindepth 1 -maxdepth 2 -type f -mtime +7 -delete 2>/dev/null || true

  # Raporlama
  step 'Disk Temizligi Basariyla Tamamlandi'
  after_kib=$(free_kib)
  diff_kib=$(( after_kib - before_kib ))
  note "Temizlik oncesi bos alan : $(format_kib "$before_kib")"
  note "Temizlik sonrasi bos alan: $(format_kib "$after_kib")"
  if (( diff_kib > 0 )); then
    note "KAZANILAN BOS ALAN        : +$(format_kib "$diff_kib")"
  else
    note "Kazanilan bos alan        : Onemli bir degisiklik olmadi (disk zaten temizdi)."
  fi
  note "Guncel Disk Durumu        : $(df -h "$REPO" 2>/dev/null | awk 'NR==2 {printf "Toplam: %s | Kullanilan: %s | Bos: %s (%s)", $2, $3, $4, $5}')"
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    docker system df 2>/dev/null || true
  fi
  note 'TEMIZLIK ISLEMI BASARIYLA BITTI.'
}

prepare_disk() {
  step 'Disk on kosulu'
  if require_disk; then return 0; fi
  note "Yetersiz disk alani (en az ${MIN_FREE_GIB} GiB gerekli)."
  note 'Guvenli disk temizligi yapilmasi oneriliyor.'
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    docker system df 2>/dev/null || true
  fi
  confirm "Disk alani ${MIN_FREE_GIB} GiB altinda. Guvenli disk temizligi calistirilsin mi (volume, image ve yedekleri SILMEZ)?" || \
    fail 'Alan yetersiz; temizlik onaylanmadi.'
  CLEAN_YES=true
  clean_disk
  require_disk || fail "Temizlikten sonra da disk alani yetersiz (en az ${MIN_FREE_GIB} GiB gerekli)"
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
    -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-
}

# Standalone emergency/fallback backup when systemd unit is missing
create_standalone_backup() {
  local target_dir="$1"
  step 'Entegre Kurtarma Yedegi (Direct Database & Vault Backup)'
  install -d -m 700 -o root -g root "$target_dir"
  install -d -m 700 -o root -g root "$target_dir/secrets" "$target_dir/app_data" "$target_dir/config"

  note "PostgreSQL veritabani dump cikariliyor (pg_dump -Fc)..."
  docker exec nexus_timescaledb sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$target_dir/database.dump" || return 1
  [[ -s "$target_dir/database.dump" ]] || return 1

  note "Kritik secrets ve konfigürasyon dosyalari guvenle kopyalaniyor..."
  if [[ -f secrets/encryption_key ]]; then
    install -m 400 -o root -g root secrets/encryption_key "$target_dir/secrets/encryption_key"
  fi
  if [[ -f secrets/postgres_password ]]; then
    install -m 400 -o root -g root secrets/postgres_password "$target_dir/secrets/postgres_password"
  fi
  if [[ -f data/.system_secrets.json ]]; then
    install -m 400 -o root -g root data/.system_secrets.json "$target_dir/app_data/.system_secrets.json"
  elif [[ -f app_data/.system_secrets.json ]]; then
    install -m 400 -o root -g root app_data/.system_secrets.json "$target_dir/app_data/.system_secrets.json"
  fi
  if [[ -f .env ]]; then
    install -m 400 -o root -g root .env "$target_dir/config/.env"
  fi

  note "SHA256 manifest olusturuluyor..."
  (
    cd "$target_dir"
    sha256sum database.dump secrets/encryption_key secrets/postgres_password app_data/.system_secrets.json config/.env > manifest.sha256
    chmod 600 manifest.sha256
  ) || return 1

  note "Entegre kurtarma yedegi basariyla tamamlandi: $target_dir"
  return 0
}

backup_and_validate() {
  step 'Yeni ve dogrulanmis zorunlu yedek'
  install -d -m 700 -o root -g root /var/backups/nexusnode "$BACKUP_ROOT"
  check_private_path /var/backups/nexusnode
  check_private_path "$BACKUP_ROOT"
  local previous latest result exit_status link
  previous=$(latest_backup || true)

  # Check if systemd backup service exists
  if systemctl list-unit-files nexusnode-local-backup.service >/dev/null 2>&1; then
    note 'Systemd yedek servisi tetikleniyor (nexusnode-local-backup.service)...'
    if systemctl start nexusnode-local-backup.service 2>/dev/null; then
      result=$(systemctl show -P Result nexusnode-local-backup.service 2>/dev/null || echo 'fail')
      exit_status=$(systemctl show -P ExecMainStatus nexusnode-local-backup.service 2>/dev/null || echo '1')
      if [[ "$result" == success && "$exit_status" == 0 ]]; then
        latest=$(latest_backup || true)
      fi
    fi
  fi

  # Fallback to direct standalone backup if systemd unit is absent or failed
  if [[ -z "$latest" || "$latest" == "$previous" ]]; then
    note 'Systemd servisi bulunamadi veya calismadi; entegre bagimsiz yedek aliniyor...'
    latest="$BACKUP_ROOT/yedek-$STAMP"
    create_standalone_backup "$latest" || fail 'Hem systemd hem de bagimsiz veritabani yedeklemesi basarisiz oldu!'
  fi

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
  note "Yeni yedek dogrulandi: $latest ($(du -sh "$latest" 2>/dev/null | awk '{print $1}'))"
}

schema_fingerprint() {
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
  check_container_health nexus_timescaledb 15 || fail 'Paket guncellemesi sonrasi TimescaleDB sagliksiz'
  wait_health || fail 'Paket guncellemesi sonrasi web/API sagliksiz'
  note 'APT sonrasi servisler saglikli.'
}

compute_rollback_policy() {
  local changed file
  ROLLBACK_SAFE=true
  changed=$(repo_git diff --name-only "$OLD_HEAD" "$NEW_HEAD") || { ROLLBACK_SAFE=false; return; }
  while IFS= read -r file; do
    [[ -n "$file" ]] || continue
    # Safe UI and configuration paths that allow automatic UI rollback:
    case "$file" in
      src/components/*|src/pages/*|src/styles/*|src/context/*|src/hooks/*|src/types/*|src/utils/*|public/*|index.html|src/App.tsx|src/main.tsx|src/index.css|src/config/version.ts|CHANGELOG.md|package.json|package-lock.json)
        ;;
      *) ROLLBACK_SAFE=false ;;
    esac
  done <<< "$changed"
  if [[ "$ROLLBACK_SAFE" == true ]]; then
    SCHEMA_BEFORE=$(schema_fingerprint || true)
    [[ -n "$SCHEMA_BEFORE" ]] || ROLLBACK_SAFE=false
  fi
  if [[ "$ROLLBACK_SAFE" == true ]]; then
    note "App otomatik rollback uygunluk adayi: EVET (salt UI/kod guncellemesi, deploy sonrasi DB semasi karsilastirilacak)"
  else
    note "App otomatik rollback uygunluk adayi: HAYIR (arka uc sunucu veya veritabani degisikligi tespit edildi; guvenli tam yedek devrede)"
  fi
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
    if check_container_health nexus_app 5 && verify_endpoints; then
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

  # Smart Compose Diff & Volume Protection
  if repo_git diff --name-only "$OLD_HEAD" "$target" | grep -Eq \
    '^(docker-compose\.ya?ml|compose\.ya?ml|compose\.override\.ya?ml)$'; then
    note 'Yeni main Compose yapilandirmasinda degisiklik iceriyor. Degisiklik ozeti:'
    repo_git diff "$OLD_HEAD" "$target" -- docker-compose.yml 2>/dev/null || true

    # Guard against accidental deletion of critical volume bindings
    if repo_git diff "$OLD_HEAD" "$target" -- docker-compose.yml 2>/dev/null | grep -E '^\-\s*timescaledb_data:'; then
      fail 'Kritik veritabani volume (timescaledb_data) silinmesi tespit edildi! Otomatik gecis yasak.'
    fi

    if [[ "$ALLOW_COMPOSE" == true ]]; then
      note "Compose degisikligi --allow-compose parametresi ile onaylandi; devam ediliyor."
    else
      if confirm "Yukaridaki Compose degisikliklerini incelediniz mi? Onaylayip devam etmek istiyor musunuz?"; then
        note "Compose degisikligi onaylandi."
      else
        fail "Compose degisikligi onaylanmadi; guncelleme durduruldu."
      fi
    fi
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

  # Re-validate ignores after fetching remotely editable Dockerfile and .dockerignore
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
    docker rmi "$candidate" 2>/dev/null || true
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

# Smart Summary Card printer
print_summary_card() {
  local title="$1" status_text="$2"
  local free_now total_disk used_pct cur_ver
  free_now=$(df -h "$REPO" 2>/dev/null | awk 'NR==2 {print $4}')
  total_disk=$(df -h "$REPO" 2>/dev/null | awk 'NR==2 {print $2}')
  used_pct=$(df -h "$REPO" 2>/dev/null | awk 'NR==2 {print $5}')
  cur_ver=$(grep -E 'APP_VERSION\s*=\s*' "$REPO/src/config/version.ts" 2>/dev/null | cut -d'"' -f2 || echo '')
  if [[ -z "$cur_ver" ]]; then
    cur_ver=$(grep -E '"version":\s*"' "$REPO/package.json" 2>/dev/null | head -1 | cut -d'"' -f4 || echo '1.49.x')
  fi

  cat <<EOF

================================================================================
  NEXUSNODE VPS YONETIM VE GUNCELLEME RAPORU ($title)
================================================================================
  • Durum           : $status_text
  • Aktif Sürüm     : v$cur_ver (Git: ${OLD_HEAD:0:8})
  • Disk Durumu     : $free_now boş / $total_disk toplam ($used_pct dolu)
  • Docker Durumu   : $(docker ps --filter 'name=nexus_' --format '{{.Names}}: {{.Status}}' 2>/dev/null | tr '\n' ' ' || echo 'Docker kapalı')
  • Web / API       : Nginx $(systemctl is-active nginx 2>/dev/null || echo 'inactive') | Fail2ban $(systemctl is-active fail2ban 2>/dev/null || echo 'inactive')
  • Son Log Kaydı   : ${LOG_FILE:-'Salt okunur mod (log dosyasi tutulmadi)'}
================================================================================
EOF
}

# Quick status check mode (--status / --info)
quick_status() {
  step 'NexusNode Hizli Sistem & Servis Ozeti'
  local cur_ver
  cur_ver=$(grep -E 'APP_VERSION\s*=\s*' "$REPO/src/config/version.ts" 2>/dev/null | cut -d'"' -f2 || echo '')
  if [[ -z "$cur_ver" ]]; then
    cur_ver=$(grep -E '"version":\s*"' "$REPO/package.json" 2>/dev/null | head -1 | cut -d'"' -f4 || echo 'bilinmiyor')
  fi
  note "Sürüm: v$cur_ver | Git: $(repo_git rev-parse --short HEAD 2>/dev/null || echo 'bilinmiyor')"
  note "Disk: $(df -h "$REPO" 2>/dev/null | awk 'NR==2 {printf "Boş: %s, Toplam: %s (%s dolu)", $4, $2, $5}')"

  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    note "Konteynerler:"
    docker ps -a --filter 'name=nexus_' --format '   • {{.Names}}: {{.State}} (Sağlık: {{.Status}})' 2>/dev/null || true
  else
    note "Docker çalışmıyor veya erişilemiyor."
  fi

  note "Sistem Servisleri:"
  note "   • Nginx      : $(systemctl is-active nginx 2>/dev/null || echo 'durmuş')"
  note "   • Fail2ban   : $(systemctl is-active fail2ban 2>/dev/null || echo 'durmuş')"

  local health_code
  health_code=$(curl --noproxy '*' -sS -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" 2>/dev/null || echo '000')
  note "   • API Sağlık : HTTP $health_code ($HEALTH_URL)"

  local latest_bk
  latest_bk=$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'yedek-*' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2- || true)
  if [[ -n "$latest_bk" ]]; then
    note "   • Son Yedek  : $latest_bk ($(du -sh "$latest_bk" 2>/dev/null | awk '{print $1}'))"
  fi

  if [[ -f /run/reboot-required ]]; then
    note "⚠️ Sistem yeniden başlatma (reboot) bekliyor!"
  fi
}

# --- MAIN EXECUTION ROUTER ---

if [[ "$MODE" == --status ]]; then
  quick_status
  exit 0
fi

if [[ "$MODE" =~ ^(--clean|--cleanup)$ ]]; then
  clean_disk
  print_summary_card "TEMIZLIK TAMAMLANDI" "BASARILI (DISK ALANI KAZANILDI)"
  exit 0
fi

check_git
check_services
check_remote_updates

if [[ "$MODE" == --check ]]; then
  read_only_report
  print_summary_card "SALT OKUNUR DENETIM" "SISTEM SAGLIKLI VE GUNCELLEMEYE HAZIR"
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
prune_old_rollbacks "$MAX_ROLLBACK_KEEP"
final_checks
print_summary_card "CANLI GUNCELLEME" "BASARIYLA YAYINLANDI VE AKTIF"
