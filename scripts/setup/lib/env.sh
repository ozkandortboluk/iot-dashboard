#!/usr/bin/env bash
# ==============================================================================
# NexusNode IoT Cloud - Automated Environment Configuration (.env Manager)
# scripts/setup/lib/env.sh
# ==============================================================================

ensure_env_configured() {
  log_step "4. Ortam Değişkenleri (.env) Yapılandırılıyor..."

  local ENV_FILE="./.env"
  local ENV_EXAMPLE="./.env.example"

  if [ ! -f "$ENV_FILE" ]; then
    if [ -f "$ENV_EXAMPLE" ]; then
      cp "$ENV_EXAMPLE" "$ENV_FILE"
      log_info ".env.example dosyasından yeni .env oluşturuldu."
    else
      touch "$ENV_FILE"
    fi
  else
    log_info "Mevcut .env dosyası tespit edildi, ayarlar senkronize ediliyor..."
  fi

  # Helper to set or update key in .env
  set_env_var() {
    local key="$1"
    local val="$2"
    if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
      # Use awk or perl to avoid sed escaping issues with special characters
      local escaped_val
      escaped_val=$(printf '%s\n' "$val" | sed -e 's/[\/&]/\\&/g')
      sed -i.bak "s/^${key}=.*/${key}=${escaped_val}/" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
    else
      echo "${key}=${val}" >> "$ENV_FILE"
    fi
  }

  # Ensure production VPS profile
  set_env_var "APP_ENV" "vps"
  set_env_var "VPS_PRODUCTION" "true"
  set_env_var "DB_ENGINE" "postgres"
  set_env_var "POSTGRES_USER" "iot_user"
  set_env_var "POSTGRES_DB" "iot_dashboard"

  # Database Bootstrap Password for TimescaleDB container initialization only
  # Canonical runtime database password is stored securely in Central Security Vault (database.password).
  # Redundant plaintext POSTGRES_PASSWORD and password-bearing DATABASE_URL are not leaked into .env.
  if [ -n "$PG_GENERATED_PASS" ]; then
    set_env_var "POSTGRES_INIT_PASSWORD" "$PG_GENERATED_PASS"
  fi

  # Clean up legacy plaintext database password entries from .env if present
  if [ -f "$ENV_FILE" ]; then
    sed -i.bak '/^POSTGRES_PASSWORD=/d' "$ENV_FILE" 2>/dev/null || true
    sed -i.bak '/^DATABASE_URL=.*:[^@]*@/d' "$ENV_FILE" 2>/dev/null || true
    rm -f "${ENV_FILE}.bak"
  fi

  # Set Domain & Base URL if supplied
  if [ -n "$SETUP_DOMAIN" ]; then
    local PROTOCOL="https"
    if [ "$HTTP_ONLY" = true ]; then
      PROTOCOL="http"
    fi
    set_env_var "APP_BASE_URL" "${PROTOCOL}://${SETUP_DOMAIN}"
    set_env_var "CLIENT_ORIGIN" "${PROTOCOL}://${SETUP_DOMAIN}"
    log_success "Domain yapılandırıldı: ${PROTOCOL}://${SETUP_DOMAIN}"
  fi

  # Notification Email if supplied
  if [ -n "$SETUP_EMAIL" ]; then
    set_env_var "EMAIL_FROM" "$SETUP_EMAIL"
  fi

  log_success ".env dosyası güvenli üretim parametreleriyle güncellendi."
}
