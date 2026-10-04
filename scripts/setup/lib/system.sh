#!/usr/bin/env bash
# ==============================================================================
# NexusNode IoT Cloud - System Inspection & Prerequisites
# scripts/setup/lib/system.sh
# ==============================================================================

detect_system() {
  log_step "1. Sistem ve Donanım Analizi Gerçekleştiriliyor..."

  # Check Root / Sudo privileges
  if [ "$EUID" -eq 0 ]; then
    IS_ROOT=true
    SUDO_CMD=""
  else
    IS_ROOT=false
    if command -v sudo >/dev/null 2>&1; then
      SUDO_CMD="sudo"
    else
      SUDO_CMD=""
    fi
  fi

  # Detect OS
  OS_TYPE="$(uname -s)"
  ARCH="$(uname -m)"
  
  if [ -f /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    OS_NAME="${ID:-unknown}"
    OS_VERSION="${VERSION_ID:-unknown}"
    OS_PRETTY="${PRETTY_NAME:-$OS_TYPE}"
  elif [ "$OS_TYPE" = "Darwin" ]; then
    OS_NAME="macos"
    OS_VERSION="$(sw_vers -productVersion)"
    OS_PRETTY="macOS $OS_VERSION"
  else
    OS_NAME="generic_linux"
    OS_VERSION="unknown"
    OS_PRETTY="$OS_TYPE"
  fi

  log_info "İşletim Sistemi: ${CLR_BOLD}${OS_PRETTY}${CLR_RESET} (${ARCH})"

  # Check RAM
  if [ -f /proc/meminfo ]; then
    TOTAL_MEM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    TOTAL_MEM_MB=$((TOTAL_MEM_KB / 1024))
    log_info "Toplam Bellek: ${CLR_BOLD}${TOTAL_MEM_MB} MB${CLR_RESET}"
    if [ "$TOTAL_MEM_MB" -lt 1800 ]; then
      log_warn "Tavsiye edilen minimum bellek 2048 MB'dır. Mevcut: ${TOTAL_MEM_MB} MB. (Düşük bellekli sistemlerde Swap önerilir)."
    fi
  fi

  # Check Disk Free Space
  if command -v df >/dev/null 2>&1; then
    DISK_AVAIL_MB=$(df -m . | awk 'NR==2 {print $4}')
    log_info "Kullanılabilir Disk Alanı: ${CLR_BOLD}${DISK_AVAIL_MB} MB${CLR_RESET}"
    if [ "$DISK_AVAIL_MB" -lt 5000 ]; then
      log_warn "Kurulum için en az 5 GB boş disk alanı tavsiye edilir. Mevcut: ${DISK_AVAIL_MB} MB."
    fi
  fi

  # Check OpenSSL / Cryptography tool
  if command -v openssl >/dev/null 2>&1; then
    HAS_OPENSSL=true
    log_success "OpenSSL kütüphanesi hazır ($(openssl version | awk '{print $1,$2}'))."
  else
    HAS_OPENSSL=false
    log_warn "OpenSSL bulunamadı. Kriptografik anahtarlar alternatif Node.js/Python motoruyla üretilecek."
  fi

  # Check Docker & Docker Compose
  check_docker_status
}

check_docker_status() {
  if command -v docker >/dev/null 2>&1; then
    HAS_DOCKER=true
    DOCKER_VER=$(docker --version | awk '{print $3}' | tr -d ',')
    log_success "Docker Motoru tespit edildi (v${DOCKER_VER})."
  else
    HAS_DOCKER=false
    log_info "Docker motoru henüz sistemde kurulu değil."
  fi

  if docker compose version >/dev/null 2>&1; then
    HAS_COMPOSE=true
    COMPOSE_VER=$(docker compose version --short 2>/dev/null || echo "v2")
    log_success "Docker Compose eklentisi hazır (${COMPOSE_VER})."
  elif command -v docker-compose >/dev/null 2>&1; then
    HAS_COMPOSE=true
    COMPOSE_VER=$(docker-compose --version | awk '{print $3}' | tr -d ',')
    log_success "Eski docker-compose ikili dosyası hazır (${COMPOSE_VER})."
  else
    HAS_COMPOSE=false
    log_info "Docker Compose eklentisi bulunamadı."
  fi
}

check_port_conflicts() {
  local ports=("$@")
  log_step "2. Ağ ve Port Çakışmaları Denetleniyor..."

  local conflict_found=false
  for port in "${ports[@]}"; do
    if command -v ss >/dev/null 2>&1; then
      if ss -tuln | grep -q ":${port} "; then
        log_warn "Port ${port} şu anda başka bir servis tarafından dinleniyor!"
        conflict_found=true
      fi
    elif command -v netstat >/dev/null 2>&1; then
      if netstat -tuln | grep -q ":${port} "; then
        log_warn "Port ${port} şu anda başka bir servis tarafından dinleniyor!"
        conflict_found=true
      fi
    elif command -v lsof >/dev/null 2>&1; then
      if lsof -i ":${port}" >/dev/null 2>&1; then
        log_warn "Port ${port} şu anda başka bir servis tarafından dinleniyor!"
        conflict_found=true
      fi
    fi
  done

  if [ "$conflict_found" = true ]; then
    log_warn "Bazı portlar (örn. 80, 443 veya 5432) meşgul görünüyor. Mevcut Apache/Nginx veya eski PostgreSQL servislerini durdurmanız gerekebilir."
  else
    log_success "Tüm standart servis portları (80, 443, 3000, 5432) kullanılabilir durumda."
  fi
}
