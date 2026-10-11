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

# Restore is intentionally blocked until a separately tested, explicit recovery
# workflow can validate the archive, database target and vault-key compatibility.
# The previous implementation only extracted files and incorrectly claimed success.
perform_restore() {
  local ARCHIVE_PATH="${1:-}"
  if [ -z "$ARCHIVE_PATH" ] || [ ! -f "$ARCHIVE_PATH" ]; then
    log_error "Geçerli bir geri yükleme arşivi belirtilmedi."
    return 1
  fi
  if ! tar -tzf "$ARCHIVE_PATH" >/dev/null 2>&1; then
    log_error "Arşiv okunamıyor veya bozuk."
    return 1
  fi
  log_error "Otomatik geri yükleme güvenlik nedeniyle devre dışı: SQL veritabanı ve uygulama volume verileri henüz doğrulanmış bir kurtarma akışıyla geri yüklenmiyor. Mevcut veriler değiştirilmedi."
  return 1
}
