#!/usr/bin/env bash
# ==============================================================================
# NexusNode IoT Cloud - Automated Docker Engine & Compose Provisioner
# scripts/setup/lib/docker-installer.sh
# ==============================================================================

ensure_docker_installed() {
  if [ "$HAS_DOCKER" = true ] && [ "$HAS_COMPOSE" = true ]; then
    log_success "Docker ve Docker Compose zaten kurulu, kurulum adımı atlanıyor."
    return 0
  fi

  log_step "Docker & Docker Compose Otomasyonu Başlatılıyor..."

  if [ "$NON_INTERACTIVE" != true ]; then
    echo -ne "${CLR_YELLOW}Sisteminizde Docker veya Compose eksik. Otomatik olarak kurulsun mu? [E/h]: ${CLR_RESET}"
    read -r answer
    case "$answer" in
      [hH][aA][yY][ıI][rR]|[nN][oO]|[hH]|[nN])
        log_warn "Docker kurulumu kullanıcı tarafından iptal edildi. Konteyner başlatılamayabilir."
        return 1
        ;;
      *)
        ;;
    esac
  fi

  log_info "Resmi Docker deposu üzerinden kurulum başlatılıyor..."

  # Install curl if missing
  if ! command -v curl >/dev/null 2>&1; then
    log_info "curl aracı yükleniyor..."
    if [ "$OS_NAME" = "ubuntu" ] || [ "$OS_NAME" = "debian" ]; then
      $SUDO_CMD apt-get update -qq && $SUDO_CMD apt-get install -y -qq curl ca-certificates
    elif [ "$OS_NAME" = "centos" ] || [ "$OS_NAME" = "rhel" ] || [ "$OS_NAME" = "rocky" ] || [ "$OS_NAME" = "almalinux" ]; then
      $SUDO_CMD dnf install -y -q curl ca-certificates || $SUDO_CMD yum install -y -q curl ca-certificates
    fi
  fi

  # Run official get.docker.com script
  log_info "Resmi Docker kurulum betiği çalıştırılıyor (https://get.docker.com)..."
  if curl -fsSL https://get.docker.com | $SUDO_CMD sh; then
    log_success "Docker CE başarıyla kuruldu."
  else
    log_error "Otomatik Docker kurulumu başarısız oldu. Lütfen manuel kurunuz."
    return 1
  fi

  # Start and enable Docker service
  if command -v systemctl >/dev/null 2>&1; then
    log_info "Docker servisi başlatılıyor ve sistem açılışına ekleniyor..."
    $SUDO_CMD systemctl enable --now docker >/dev/null 2>&1 || true
    $SUDO_CMD systemctl start docker >/dev/null 2>&1 || true
  elif command -v service >/dev/null 2>&1; then
    $SUDO_CMD service docker start >/dev/null 2>&1 || true
  fi

  # Add current user to docker group
  if [ -n "$SUDO_USER" ]; then
    TARGET_USER="$SUDO_USER"
  else
    TARGET_USER="$(whoami)"
  fi

  if [ "$TARGET_USER" != "root" ]; then
    log_info "Kullanıcı (${TARGET_USER}) 'docker' grubuna ekleniyor..."
    $SUDO_CMD usermod -aG docker "$TARGET_USER" >/dev/null 2>&1 || true
  fi

  # Re-verify docker
  check_docker_status
}
