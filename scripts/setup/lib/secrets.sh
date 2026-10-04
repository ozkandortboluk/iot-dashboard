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
    # Fallback to pseudo-random
    date +%s%N | sha256sum | head -c $((bytes * 2))
  fi
}

generate_ed25519_key() {
  local target_file="$1"
  if command -v openssl >/dev/null 2>&1 && openssl genpkey -algorithm ed25519 -help >/dev/null 2>&1; then
    openssl genpkey -algorithm ed25519 -out "$target_file" 2>/dev/null
  elif command -v node >/dev/null 2>&1; then
    node -e "
      const { generateKeyPairSync } = require('crypto');
      const { privateKey } = generateKeyPairSync('ed25519', {
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });
      require('fs').writeFileSync('$target_file', privateKey);
    "
  else
    # Minimal dummy key fallback if neither is available (should be replaced in production)
    generate_random_hex 32 > "$target_file"
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
  local ENC_KEY_FILE="${SECRETS_DIR}/encryption_key"
  if [ -s "$ENC_KEY_FILE" ]; then
    log_info "Vault Root Anahtarı mevcut (${ENC_KEY_FILE}) [KORUNDU]."
  else
    local ROOT_KEY
    ROOT_KEY=$(generate_random_hex 32)
    printf "%s" "$ROOT_KEY" > "$ENC_KEY_FILE"
    chmod 600 "$ENC_KEY_FILE"
    log_success "Yeni 256-bit AES Vault Root Anahtarı üretildi (${ENC_KEY_FILE})."
  fi

  # 2. JWT & Session Secret (/run/secrets/jwt_secret)
  local JWT_KEY_FILE="${SECRETS_DIR}/jwt_secret"
  if [ -s "$JWT_KEY_FILE" ]; then
    log_info "JWT İmzalama Anahtarı mevcut (${JWT_KEY_FILE}) [KORUNDU]."
  else
    local JWT_KEY
    JWT_KEY=$(generate_random_hex 32)
    printf "%s" "$JWT_KEY" > "$JWT_KEY_FILE"
    chmod 600 "$JWT_KEY_FILE"
    log_success "Yeni JWT Secret anahtarı üretildi (${JWT_KEY_FILE})."
  fi

  # 3. OTA Firmware Ed25519 Signing Private Key (/run/secrets/ota_signing_key)
  local OTA_KEY_FILE="${SECRETS_DIR}/ota_signing_key"
  if [ -s "$OTA_KEY_FILE" ]; then
    log_info "OTA Ed25519 İmzalama Anahtarı mevcut (${OTA_KEY_FILE}) [KORUNDU]."
  else
    generate_ed25519_key "$OTA_KEY_FILE"
    chmod 600 "$OTA_KEY_FILE"
    log_success "Yeni Ed25519 Firmware İmzalama Anahtarı üretildi (${OTA_KEY_FILE})."
  fi

  # 4. TimescaleDB / PostgreSQL Bootstrap Password
  local PG_PASS_FILE="${SECRETS_DIR}/postgres_password"
  if [ -s "$PG_PASS_FILE" ]; then
    PG_GENERATED_PASS=$(cat "$PG_PASS_FILE")
    log_info "Veritabanı bootstrap parolası mevcut [KORUNDU]."
  else
    PG_GENERATED_PASS=$(generate_random_hex 24)
    printf "%s" "$PG_GENERATED_PASS" > "$PG_PASS_FILE"
    chmod 600 "$PG_PASS_FILE"
    log_success "Yeni yüksek entropili veritabanı parolası üretildi."
  fi
}
