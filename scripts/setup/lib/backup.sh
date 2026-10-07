#!/usr/bin/env bash
# ==============================================================================
# NexusNode IoT Cloud - Disaster Recovery, Backup & Restore Utility
# scripts/setup/lib/backup.sh
# ==============================================================================

perform_backup() {
  log_step "Yedekleme İşlemi (Disaster Recovery Backup) Başlatılıyor..."

  local BACKUP_DIR="./backups"
  local TIMESTAMP
  TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
  local BACKUP_ARCHIVE="${BACKUP_DIR}/nexus_backup_${TIMESTAMP}.tar.gz"

  mkdir -p "$BACKUP_DIR"

  # Dump database if container is healthy
  local DB_DUMP_FILE="${BACKUP_DIR}/db_dump_${TIMESTAMP}.sql"
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "nexus_timescaledb"; then
    log_info "TimescaleDB veritabanı yedeği alınıyor (pg_dump)..."
    docker exec nexus_timescaledb pg_dump -U iot_user -d iot_dashboard > "$DB_DUMP_FILE" 2>/dev/null || true
  fi

  log_info "Şifreli Kasa (Vault), veriler ve konfigürasyon arşivleniyor..."
  log_warn "GÜVENLİK SINIRI: Root şifreleme anahtarı (encryption_key) Vault kasası ile aynı düz metin arşive konulmaz! Kök anahtarınızı harici güvenli bir kasada ayrı saklayınız."
  local TARGETS=()
  [ -d "./secrets" ] && TARGETS+=("./secrets")
  [ -d "./data" ] && TARGETS+=("./data")
  [ -f "./.env" ] && TARGETS+=("./.env")
  [ -f "$DB_DUMP_FILE" ] && TARGETS+=("$DB_DUMP_FILE")

  if [ ${#TARGETS[@]} -eq 0 ]; then
    log_warn "Yedeklenecek hiçbir veri bulunamadı."
    return 1
  fi

  # Strictly exclude root master encryption key from the unencrypted archive
  tar --exclude='./secrets/encryption_key' --exclude='data/.vault_key' -czf "$BACKUP_ARCHIVE" "${TARGETS[@]}" 2>/dev/null
  rm -f "$DB_DUMP_FILE"

  local SIZE
  SIZE=$(du -h "$BACKUP_ARCHIVE" | awk '{print $1}')
  log_success "Yedekleme tamamlandı! Dosya: ${CLR_BOLD}${BACKUP_ARCHIVE}${CLR_RESET} (${SIZE})"
}

perform_restore() {
  local ARCHIVE_PATH="$1"
  if [ -z "$ARCHIVE_PATH" ] || [ ! -f "$ARCHIVE_PATH" ]; then
    log_fatal "Geri yüklenecek geçerli bir arşiv dosyası belirtilmedi: '$ARCHIVE_PATH'"
  fi

  log_step "Yedekten Geri Yükleme (Restore) Başlatılıyor: ${ARCHIVE_PATH}..."

  if [ "$NON_INTERACTIVE" != true ]; then
    echo -ne "${CLR_RED}DİKKAT: Mevcut secrets ve data dizinlerinin üzerine yazılacak! Devam edilsin mi? [E/h]: ${CLR_RESET}"
    read -r answer
    case "$answer" in
      [eE][vV][eE][tT]|[yY][eE][sS]|[eE]|[yY])
        ;;
      *)
        log_info "İşlem iptal edildi."
        return 0
        ;;
    esac
  fi

  log_info "Arşiv içeriği ayıklanıyor..."
  tar -xzf "$ARCHIVE_PATH"

  # Restore permissions
  [ -d "./secrets" ] && chmod 700 ./secrets && chmod 600 ./secrets/* 2>/dev/null || true
  [ -d "./data" ] && chmod 755 ./data || true

  log_success "Yedek başarıyla geri yüklendi. Servisleri yeniden başlatmak için './install.sh' çalıştırabilirsiniz."
}
