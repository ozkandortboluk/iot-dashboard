#!/usr/bin/env bash
# ==============================================================================
# NexusNode IoT Cloud - Enterprise Zero-Touch All-in-One Installer
# https://github.com/nexusnode-iot
# ==============================================================================
set -e

# Change directory to project root
cd "$(dirname "$0")" || exit 1

# ------------------------------------------------------------------------------
# Early Git Self-Update Hook before sourcing libraries
# Ensures that on './install.sh --update', any newly pulled setup scripts and libraries
# are sourced and executed in the very same run, preventing stale in-memory code.
# ------------------------------------------------------------------------------
if [[ " $* " =~ [[:space:]]--update[[:space:]] ]] && [ "${_NEXUS_UPDATE_RELOADED:-0}" != "1" ]; then
  if [ -d ".git" ] && command -v git >/dev/null 2>&1; then
    echo "[NexusNode Update] Git deposundan güncellemeler kontrol ediliyor (git pull)..."
    if git pull --ff-only 2>/dev/null; then
      echo "[NexusNode Update] Kod tabanı başarıyla güncellendi. Yeni kodlarla yükleyici yeniden başlatılıyor..."
      export _NEXUS_UPDATE_RELOADED=1
      exec "$0" "$@"
    else
      echo "[NexusNode Update] Git pull tamamlanamadı veya yerel değişiklikler mevcut; mevcut kod tabanıyla devam ediliyor."
    fi
  fi
fi

# Source Helper Libraries
SCRIPT_DIR="./scripts/setup/lib"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/colors.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/system.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/docker-installer.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/secrets.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/env.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/ssl.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/backup.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/plugins.sh"

# Global Configuration & Default Flags
NON_INTERACTIVE=false
INIT_ONLY=false
CHECK_ONLY=false
HTTP_ONLY=false
DO_BACKUP=false
DO_RESTORE=false
DO_UPDATE=false
DO_STATUS=false
RESTORE_FILE=""
SETUP_DOMAIN=""
SETUP_EMAIL=""

# Print CLI Help
show_help() {
  print_banner
  cat << EOF

${CLR_BOLD}KULLANIM:${CLR_RESET}
  ./install.sh [SEÇENEKLER]

${CLR_BOLD}SEÇENEKLER:${CLR_RESET}
  -q, --quick              Tam otomatik sessiz kurulum (Soruları sormaz, varsayılan güvenli ayarlarla kurar)
  -d, --domain <alan_adi>  Web paneli için alan adı (örn: iot.sirketim.com)
  -e, --email <eposta>     Sistem bildirimleri ve SSL sertifikası için e-posta adresi
  --http-only              SSL (443) yerine yalnızca HTTP (80) portunu yapılandırır
  --init-only              Yalnızca secrets, .env ve dizinleri hazırlar, Docker konteynerlerini başlatmaz
  --check                  Yalnızca sistem gereksinimlerini ve port çakışmalarını denetler
  --status                 Çalışan servislerin durumunu ve sağlık raporunu gösterir
  --backup                 Tüm veritabanı, vault kasası ve ayarları zaman damgalı arşiv olarak yedekler
  --restore <arsiv.tar.gz> Alınan yedekten tüm sistemi geri yükler
  --update                 Git güncellemelerini çeker (mevcutsa), secret migration ve docker compose doğrulamasını tamamlayıp konteynerleri günceller
  -h, --help               Bu yardım mesajını gösterir

${CLR_BOLD}ÖRNEKLER:${CLR_RESET}
  ./install.sh --quick
  ./install.sh --domain iot.example.com --email admin@example.com
  ./install.sh --backup
  ./install.sh --status
EOF
}

# Parse Command-Line Arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    -q|--quick)
      NON_INTERACTIVE=true
      shift
      ;;
    -d|--domain)
      SETUP_DOMAIN="$2"
      shift 2
      ;;
    -e|--email)
      SETUP_EMAIL="$2"
      shift 2
      ;;
    --http-only)
      HTTP_ONLY=true
      shift
      ;;
    --init-only)
      INIT_ONLY=true
      shift
      ;;
    --check)
      CHECK_ONLY=true
      shift
      ;;
    --status)
      DO_STATUS=true
      shift
      ;;
    --backup)
      DO_BACKUP=true
      shift
      ;;
    --restore)
      DO_RESTORE=true
      RESTORE_FILE="$2"
      shift 2
      ;;
    --update)
      DO_UPDATE=true
      shift
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      log_error "Bilinmeyen parametre: '$1'"
      echo "Yardım için: ./install.sh --help"
      exit 1
      ;;
  esac
done

# Execute Status Check if Requested
if [ "$DO_STATUS" = true ]; then
  print_banner
  log_step "NexusNode IoT Servis Durum Denetimi..."
  if command -v docker >/dev/null 2>&1; then
    docker ps --filter "name=nexus_" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo ""
    log_info "Kasa Durumu:"
    if [ -f "./secrets/encryption_key" ]; then
      log_success "Vault Root Anahtarı (/secrets/encryption_key): MEVCUT ve GÜVENLİ"
    else
      log_warn "Vault Root Anahtarı henüz oluşturulmamış."
    fi
  else
    log_error "Docker kurulu değil veya erişilemiyor."
  fi
  exit 0
fi

# Execute Backup if Requested
if [ "$DO_BACKUP" = true ]; then
  print_banner
  perform_backup
  exit $?
fi

# Execute Restore if Requested
if [ "$DO_RESTORE" = true ]; then
  print_banner
  perform_restore "$RESTORE_FILE"
  exit $?
fi

# Main Setup Workflow
print_banner
log_info "NexusNode IoT Kurulum Sihirbazı Başlatıldı."

if [ "$DO_UPDATE" = true ]; then
  log_step "NexusNode IoT Güncelleme ve Dağıtım Akışı Başlatılıyor..."
fi

# 1. Plugin Pre-Install Hook
run_setup_hooks "pre-install"

# 2. System Diagnostics
detect_system
check_port_conflicts 80 443 3000 5432

if [ "$CHECK_ONLY" = true ]; then
  log_success "Sistem denetimi tamamlandı. Donanım ve ortam kuruluma uygundur."
  exit 0
fi

# 3. Docker Provisioning (Skipped if --init-only)
if [ "$INIT_ONLY" = false ]; then
  ensure_docker_installed
fi

# 4. Secrets & Vault Initialization
ensure_secrets_initialized

# 5. Environment (.env) Setup
ensure_env_configured

# 6. SSL / TLS Setup
if [ "$HTTP_ONLY" = false ]; then
  ensure_ssl_certificates
fi

# 7. Plugin Pre-Start Hook
run_setup_hooks "pre-start"

# If Init-Only requested, exit cleanly here
if [ "$INIT_ONLY" = true ]; then
  log_success "Tüm secretlar, .env ve dizinler başarıyla hazırlandı (--init-only modunda tamamlandı)."
  exit 0
fi

# 8. Docker Compose Orchestration
log_step "6. Docker Konteynerleri Doğrulanıyor ve Başlatılıyor..."

# Select compose command
if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  log_fatal "Docker Compose bulunamadı. Lütfen Docker Compose eklentisini yükleyiniz."
  exit 1
fi

# Verify secrets readiness before starting containers
if [ ! -s "./secrets/encryption_key" ] || [ ! -s "./secrets/postgres_password" ]; then
  echo "" >&2
  echo "==========================================================================================" >&2
  echo "❌ [KRİTİK DOCKER SECRET EKSİK] Docker Compose Başlatılamaz!" >&2
  echo "------------------------------------------------------------------------------------------" >&2
  echo "Docker Compose mimarisi aşağıdaki secret dosyalarının diskte bulunmasını şart koşar:" >&2
  [ ! -s "./secrets/encryption_key" ] && echo "  - ./secrets/encryption_key [EKSİK]" >&2
  [ ! -s "./secrets/postgres_password" ] && echo "  - ./secrets/postgres_password [EKSİK]" >&2
  echo "" >&2
  echo "Bu dosyalar olmadan 'docker compose up -d --build' çalıştırılamaz." >&2
  echo "Lütfen kurulum sihirbazını çalıştırarak secret yönetimini tamamlayın: ./install.sh --update" >&2
  echo "==========================================================================================" >&2
  exit 1
fi

# Validate Docker Compose configuration
log_info "Docker Compose yapılandırması doğrulanıyor (${COMPOSE_CMD} config)..."
if [ "$IS_ROOT" = false ] && ! groups | grep -q "docker"; then
  $SUDO_CMD $COMPOSE_CMD config >/dev/null || { log_fatal "Docker Compose yapılandırma doğrulaması başarısız oldu!"; exit 1; }
else
  $COMPOSE_CMD config >/dev/null || { log_fatal "Docker Compose yapılandırma doğrulaması başarısız oldu!"; exit 1; }
fi
log_success "Docker Compose yapılandırması ve secret bağlamları doğrulandı."

# Build and start services
if [ "$DO_UPDATE" = true ]; then
  log_info "Konteynerler güncelleniyor ve yeniden derleniyor: ${COMPOSE_CMD} up -d --build..."
else
  log_info "Konteynerler arka planda başlatılıyor: ${COMPOSE_CMD} up -d --build..."
fi

if [ "$IS_ROOT" = false ] && ! groups | grep -q "docker"; then
  $SUDO_CMD $COMPOSE_CMD up -d --build
else
  $COMPOSE_CMD up -d --build
fi

# 9. Healthcheck Watcher
log_step "7. Servis Sağlık Denetimleri (Healthcheck) Doğrulanıyor..."
SERVICES=("nexus_timescaledb" "nexus_app" "nexus_proxy")
MAX_WAIT_SECONDS=60
START_TIME=$(date +%s)

for svc in "${SERVICES[@]}"; do
  log_info "Servis bekleniyor: ${CLR_BOLD}${svc}${CLR_RESET}..."
  while true; do
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))

    if [ "$ELAPSED" -gt "$MAX_WAIT_SECONDS" ]; then
      log_warn "Servis (${svc}) beklenen sürede healthy durumuna geçmedi. Loglar için: docker logs ${svc}"
      break
    fi

    STATUS=$(docker inspect --format='{{json .State.Health.Status}}' "$svc" 2>/dev/null || echo "\"running\"")
    if [ "$STATUS" = "\"healthy\"" ] || [ "$STATUS" = "\"running\"" ]; then
      log_success "Servis çalışıyor ve sağlıklı: ${svc}"
      break
    fi

    sleep 2
  done
done

# 10. Plugin Post-Start Hook
run_setup_hooks "post-start"

# 11. Final Success Summary
HOST_IP=$(curl -s https://api.ipify.org 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
ACCESS_URL="http://${HOST_IP}"
if [ -n "$SETUP_DOMAIN" ]; then
  ACCESS_URL="https://${SETUP_DOMAIN}"
fi

cat << EOF

${CLR_GREEN}${CLR_BOLD}==============================================================================${CLR_RESET}
${CLR_GREEN}${CLR_BOLD}  🎉 TEBRİKLER! NEXUSNODE IOT CLOUD BAŞARIYLA KURULDU VE YAYINDA!${CLR_RESET}
${CLR_GREEN}${CLR_BOLD}==============================================================================${CLR_RESET}

${CLR_BOLD}🌐 Web Arayüzü Erişim Adresi:${CLR_RESET}
   ${CLR_CYAN}${CLR_BOLD}${ACCESS_URL}${CLR_RESET} (veya yerel: http://localhost)

${CLR_BOLD}🔐 Güvenlik Mimarisi & Kasa Durumu:${CLR_RESET}
   - Vault Root Anahtarı: ${CLR_GREEN}secrets/encryption_key (Docker Secret: /run/secrets/encryption_key)${CLR_RESET}
   - Güvenlik Kasası:     ${CLR_GREEN}Security Vault (AES-256-GCM - Tüm hassas veriler kasa içinde)${CLR_RESET}
   - Veritabanı:          ${CLR_GREEN}TimescaleDB 2.30.1 / PostgreSQL 16 (İzole Ağ)${CLR_RESET}

${CLR_BOLD}⚡ Faydalı Yönetim Komutları:${CLR_RESET}
   - Canlı Logları İzleme:  ${CLR_YELLOW}docker compose logs -f${CLR_RESET}
   - Servis Durumunu Görme: ${CLR_YELLOW}./install.sh --status${CLR_RESET}
   - Tam Yedek Alma:        ${CLR_YELLOW}./install.sh --backup${CLR_RESET}
   - Yeniden Başlatma:      ${CLR_YELLOW}docker compose restart${CLR_RESET}

${CLR_BOLD}👤 İlk Kullanıcı Kaydı (Onboarding):${CLR_RESET}
   Web arayüzüne ilk girişinizde oluşturacağınız kullanıcı otomatik olarak
   ${CLR_BOLD}Root / SuperAdmin${CLR_RESET} yetkileriyle sisteme kaydedilecektir.

EOF
