#!/usr/bin/env bash
# ==============================================================================
# NexusNode IoT Cloud - Disaster Recovery, Backup & Restore Utility
# scripts/setup/lib/backup.sh
# ==============================================================================

perform_backup() {
  log_step "Yedekleme başlatılıyor..."
  local dir="./backups" stamp archive stage ok=false
  stamp=$(date +"%Y%m%d_%H%M%S")
  archive="$dir/nexus_backup_$stamp.tar.gz"
  mkdir -p "$dir" || return 1
  stage=$(mktemp -d "$dir/.backup-stage.XXXXXXXX") || return 1
  chmod 700 "$stage"
  if ! docker inspect nexus_timescaledb >/dev/null 2>&1 ||
     ! docker inspect nexus_app >/dev/null 2>&1; then
    log_error "Veritabanı veya uygulama konteyneri bulunamadı."
  elif ! docker exec nexus_timescaledb pg_dump -U iot_user -d iot_dashboard > "$stage/db_dump.sql"; then
    log_error "pg_dump başarısız."
  elif [ ! -s "$stage/db_dump.sql" ]; then
    log_error "pg_dump boş dosya oluşturdu."
  elif ! mkdir -p "$stage/app_data" ||
       ! docker cp nexus_app:/app/data/. "$stage/app_data/"; then
    log_error "Uygulama volume verileri kopyalanamadı."
  else
    log_warn "Ana şifreleme anahtarı ve PostgreSQL parolası arşive alınmaz; ayrı güvenli yedek gerekir."
    # Store only the SQL dump and app volume snapshot; never include plaintext host secrets.
    if (umask 077; tar -C "$stage" -czf "$PWD/${archive#./}.part" db_dump.sql app_data) &&
       tar -tzf "$archive.part" >/dev/null &&
       mv "$archive.part" "$archive"; then
      chmod 600 "$archive"
      ok=true
    fi
  fi
  rm -f "$archive.part"
  rm -rf "$stage"
  if [ "$ok" != true ]; then
    log_error "Yedekleme başarısız; eksik arşiv bırakılmadı."
    return 1
  fi
  log_success "Yedekleme tamamlandı: $archive"
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
