#!/usr/bin/env bash
# ==============================================================================
# NexusNode IoT Cloud - Cryptographic Secrets & Docker Secrets Generator
# scripts/setup/lib/secrets.sh
# ==============================================================================

generate_random_hex() {
  local bytes="${1:-32}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$bytes"
  elif command -v node >/dev/null 2>&1; then
    node -e "console.log(require('crypto').randomBytes($bytes).toString('hex'))"
  elif [ -r /dev/urandom ]; then
    head -c "$bytes" /dev/urandom | xxd -p -c "$bytes" 2>/dev/null || od -An -tx1 -N"$bytes" /dev/urandom | tr -d ' \n'
  else
    # Cryptographic RNG failed - strictly fail-closed! Never use pseudo-random fallback (e.g. date + sha256sum).
    echo "[HATA] Kriptografik güvenli rastgele sayı üreteci (CSPRNG: openssl / node / /dev/urandom) bulunamadı! Kurulum durduruldu." >&2
    exit 1
  fi
}

ensure_secrets_initialized() {
  log_step "3. Kriptografik Kasa (Vault) ve Docker Secret Dosyaları Hazırlanıyor..."

  local SECRETS_DIR="./secrets"
  local DATA_DIR="./data"
  local LOGS_DIR="./logs"
  local CERTS_DIR="./docker/certs"

  mkdir -p "$SECRETS_DIR" "$DATA_DIR" "$LOGS_DIR" "$CERTS_DIR"
  chmod 700 "$SECRETS_DIR"
  chmod 755 "$DATA_DIR" "$LOGS_DIR" "$CERTS_DIR"

  # 1. Root Encryption Key (AES-256-GCM Vault Root: /run/secrets/encryption_key)
  # Tek kullanıcı tarafından yönetilen root-of-trust anahtarı.
  local ENC_KEY_FILE="${SECRETS_DIR}/encryption_key"
  local VAULT_DATA_FILE="${DATA_DIR}/.system_secrets.json"

  # SECURITY GATE: If restored encrypted Vault exists without root key, NEVER generate a new random key!
  if [ ! -s "$ENC_KEY_FILE" ] && [ ! -s "${DATA_DIR}/.vault_key" ] && [ -s "$VAULT_DATA_FILE" ]; then
    echo "" >&2
    echo "==========================================================================================" >&2
    echo "❌ [KRİTİK GÜVENLİK HATASI] Restore Edilmiş Güvenlik Kasası Mevcut Ama ENCRYPTION_KEY Yok!" >&2
    echo "------------------------------------------------------------------------------------------" >&2
    echo "'${VAULT_DATA_FILE}' dosyası şifreli veriler içermektedir." >&2
    echo "Yeni bir root key üretilmesi mevcut şifreli verilerin kalıcı olarak çözülemez hale gelmesine yol açar." >&2
    echo "Lütfen bu yedek ile kullanılan orijinal ENCRYPTION_KEY'i '${ENC_KEY_FILE}' konumuna geri yükleyin." >&2
    echo "==========================================================================================" >&2
    exit 1
  fi

  if [ -s "$ENC_KEY_FILE" ]; then
    log_info "Vault Root Anahtarı mevcut (${ENC_KEY_FILE}) [KORUNDU]."
  else
    local ROOT_KEY
    ROOT_KEY=$(generate_random_hex 32)
    printf "%s" "$ROOT_KEY" > "$ENC_KEY_FILE"
    chmod 600 "$ENC_KEY_FILE"
    log_success "Yeni 256-bit AES Vault Root Anahtarı üretildi (${ENC_KEY_FILE})."
  fi

  # 2. TimescaleDB / PostgreSQL Bootstrap Password (/run/secrets/postgres_password)
  # Yalnız bootstrap amacıyla kullanılır; mirror db_password oluşturulmaz.
  local PG_PASS_FILE="${SECRETS_DIR}/postgres_password"
  local DB_PASS_FILE="${SECRETS_DIR}/db_password"
  if [ -s "$PG_PASS_FILE" ]; then
    PG_GENERATED_PASS=$(cat "$PG_PASS_FILE")
    log_info "Veritabanı bootstrap parolası mevcut [KORUNDU]."
  elif [ -s "$DB_PASS_FILE" ]; then
    PG_GENERATED_PASS=$(cat "$DB_PASS_FILE")
    printf "%s" "$PG_GENERATED_PASS" > "$PG_PASS_FILE"
    chmod 600 "$PG_PASS_FILE"
    log_info "Legacy veritabanı bootstrap parolası aktarıldı (${PG_PASS_FILE}) [KORUNDU]."
  else
    PG_GENERATED_PASS=$(generate_random_hex 24)
    printf "%s" "$PG_GENERATED_PASS" > "$PG_PASS_FILE"
    chmod 600 "$PG_PASS_FILE"
    log_success "Yeni yüksek entropili veritabanı parolası üretildi."
  fi
}
