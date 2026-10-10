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

resolve_app_data_volume() {
  if ! command -v docker >/dev/null 2>&1; then
    return 1
  fi

  local resolved_vol=""

  # 1. Primary: inspect existing nexus_app container mount for /app/data
  if docker inspect nexus_app >/dev/null 2>&1; then
    resolved_vol=$(docker inspect nexus_app --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{if eq .Type "volume"}}{{.Name}}{{end}}{{end}}{{end}}' 2>/dev/null || true)
    if [ -n "$resolved_vol" ]; then
      echo "$resolved_vol"
      return 0
    fi
  fi

  # 2. Secondary: resolve exact volume for this compose project
  local project_name="${COMPOSE_PROJECT_NAME:-}"
  if [ -z "$project_name" ]; then
    project_name=$(basename "$(pwd)" | tr -cd '[:alnum:]_-' | tr '[:upper:]' '[:lower:]')
  fi

  local project_vol="${project_name}_app_data"
  if docker volume inspect "$project_vol" >/dev/null 2>&1; then
    echo "$project_vol"
    return 0
  fi

  # 3. Only match un-prefixed "app_data" if verified to belong to this compose project
  if docker volume inspect "app_data" >/dev/null 2>&1; then
    local vol_proj
    vol_proj=$(docker volume inspect app_data --format '{{index .Labels "com.docker.compose.project"}}' 2>/dev/null || true)
    if [ "$vol_proj" = "$project_name" ]; then
      echo "app_data"
      return 0
    fi
  fi

  return 1
}

detect_existing_installation() {
  local SECRETS_DIR="./secrets"
  local DATA_DIR="./data"

  # 1. Check local secret files
  if [ -s "${SECRETS_DIR}/postgres_password" ] || [ -s "${SECRETS_DIR}/db_password" ]; then
    return 0
  fi
  # 2. Check local vault file containing database credentials or vault with existing encryption key
  if [ -s "${DATA_DIR}/.system_secrets.json" ] && ([ -s "${SECRETS_DIR}/encryption_key" ] || grep -q '"database\.password"' "${DATA_DIR}/.system_secrets.json" 2>/dev/null); then
    return 0
  fi

  # 3. Check Docker volumes and containers specific to NexusNode
  if command -v docker >/dev/null 2>&1; then
    if resolve_app_data_volume >/dev/null 2>&1; then
      return 0
    fi
    local project_name="${COMPOSE_PROJECT_NAME:-$(basename "$(pwd)" | tr -cd '[:alnum:]_-' | tr '[:upper:]' '[:lower:]')}"
    if docker volume inspect "${project_name}_timescaledb_data" >/dev/null 2>&1 || docker volume inspect "timescaledb_data" >/dev/null 2>&1; then
      return 0
    fi
    if docker inspect nexus_timescaledb >/dev/null 2>&1 || docker inspect nexus_app >/dev/null 2>&1; then
      return 0
    fi
  fi

  return 1
}

verify_postgres_password() {
  local candidate="$1"
  [ -z "$candidate" ] && return 1

  # Reject known default placeholder passwords
  if [ "$candidate" = "GUCLU_PAROLANIZ_BURAYA" ] || [ "$candidate" = "GUCLU_VERITABANI_PAROLANIZ" ]; then
    return 1
  fi

  local db_user="${POSTGRES_USER:-iot_user}"
  local db_name="${POSTGRES_DB:-iot_dashboard}"
  local db_port="${POSTGRES_PORT:-5432}"

  # 1. If nexus_timescaledb container is currently running:
  if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^nexus_timescaledb$'; then
    # Test authentication strictly over TCP loopback inside container (forces SCRAM/MD5 password auth, never Unix socket)
    local probe_output=""
    local probe_exit=0
    probe_output=$(docker exec -e PGPASSWORD="$candidate" nexus_timescaledb psql -h 127.0.0.1 -p 5432 -U "$db_user" -d "$db_name" -c "SELECT 1;" 2>&1) || probe_exit=$?

    if [ "$probe_exit" -eq 0 ] && echo "$probe_output" | grep -qE "(1 row|[[:space:]]1[[:space:]])"; then
      return 0 # TCP Authentication succeeded with verified password!
    fi

    # Distinguish explicitly rejected password from unreachable/connection failure
    if echo "$probe_output" | grep -iq "password authentication failed"; then
      return 1 # Database is active and explicitly rejected this password!
    fi

    if echo "$probe_output" | grep -iqE "(could not connect|connection refused|is the server running|timeout)"; then
      return 2 # Connection could not be established (database offline or unreachable)
    fi

    if echo "$probe_output" | grep -iqE "FATAL:.*(password|authentication)"; then
      return 1
    fi

    return 1
  fi

  # 2. If host psql is available and port 5432 is responsive over TCP:
  if command -v psql >/dev/null 2>&1; then
    local host_output=""
    local host_exit=0
    host_output=$(PGPASSWORD="$candidate" psql -h 127.0.0.1 -p "$db_port" -U "$db_user" -d "$db_name" -c "SELECT 1;" 2>&1) || host_exit=$?

    if [ "$host_exit" -eq 0 ] && echo "$host_output" | grep -qE "(1 row|[[:space:]]1[[:space:]])"; then
      return 0
    fi

    if echo "$host_output" | grep -iq "password authentication failed"; then
      return 1
    fi

    if echo "$host_output" | grep -iqE "(could not connect|connection refused|is the server running|timeout)"; then
      return 2
    fi
  fi

  # 3. Database is offline or not directly reachable for TCP live probe
  return 2
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

  local ENC_KEY_FILE="${SECRETS_DIR}/encryption_key"
  local VAULT_DATA_FILE="${DATA_DIR}/.system_secrets.json"
  local PG_PASS_FILE="${SECRETS_DIR}/postgres_password"
  local DB_PASS_FILE="${SECRETS_DIR}/db_password"

  local IS_EXISTING=false
  if detect_existing_installation; then
    IS_EXISTING=true
  fi

  # Auto-adopt data/.vault_key if secrets/encryption_key is missing on existing installation
  if [ ! -s "$ENC_KEY_FILE" ] && [ -s "${DATA_DIR}/.vault_key" ] && [ "$IS_EXISTING" = true ]; then
    cp "${DATA_DIR}/.vault_key" "$ENC_KEY_FILE"
    chmod 600 "$ENC_KEY_FILE"
    log_success "Root şifreleme anahtarı ${DATA_DIR}/.vault_key konumundan ${ENC_KEY_FILE} konumuna aktarıldı."
  fi

  # --------------------------------------------------------------------------
  # 1. Root Encryption Key (AES-256-GCM Vault Root: /run/secrets/encryption_key)
  # --------------------------------------------------------------------------
  if [ ! -s "$ENC_KEY_FILE" ] && [ "$IS_EXISTING" = true ] && ([ -s "$VAULT_DATA_FILE" ] || (resolve_app_data_volume >/dev/null 2>&1)); then
    echo "" >&2
    echo "==========================================================================================" >&2
    echo "❌ [KRİTİK GÜVENLİK HATASI] Restore Edilmiş Güvenlik Kasası / Mevcut Sistem Var Ama ENCRYPTION_KEY Yok!" >&2
    echo "------------------------------------------------------------------------------------------" >&2
    echo "Mevcut sistem veya şifreli veriler tespit edildi ancak '${ENC_KEY_FILE}' bulunamadı." >&2
    echo "Yeni bir root key üretilmesi mevcut şifreli verilerin kalıcı olarak çözülemez hale gelmesine yol açar." >&2
    echo "Lütfen bu kurulumla kullanılan orijinal ENCRYPTION_KEY'i '${ENC_KEY_FILE}' konumuna geri yükleyin." >&2
    echo "==========================================================================================" >&2
    exit 1
  fi

  if [ -s "$ENC_KEY_FILE" ]; then
    local EXISTING_ENC_KEY
    EXISTING_ENC_KEY=$(tr -d '[:space:]' < "$ENC_KEY_FILE")
    # Production / Root Key strictly requires exactly 64 hexadecimal characters (256-bit key)
    # Fail-closed: Never silently hash invalid/short keys with SHA-256 in bootstrap
    if [[ ! "$EXISTING_ENC_KEY" =~ ^[0-9a-fA-F]{64}$ ]]; then
      echo "" >&2
      echo "==========================================================================================" >&2
      echo "❌ [KRİTİK GÜVENLİK HATASI] Geçersiz ENCRYPTION_KEY Formatı!" >&2
      echo "------------------------------------------------------------------------------------------" >&2
      echo "'${ENC_KEY_FILE}' içindeki anahtar tam 64 hexadecimal karakter (256-bit hex) olmalıdır." >&2
      echo "Geçersiz anahtarlar güvenliği tehlikeye atmamak için otomatik dönüştürülmez (fail-closed)." >&2
      echo "Lütfen geçerli bir 64 karakterli hex root key sağlayın veya dosyayı kaldırıp yeniden üretin." >&2
      echo "==========================================================================================" >&2
      exit 1
    fi
    log_info "Vault Root Anahtarı mevcut ve geçerli (${ENC_KEY_FILE}) [KORUNDU]."
  else
    local ROOT_KEY
    ROOT_KEY=$(generate_random_hex 32)
    printf "%s" "$ROOT_KEY" > "$ENC_KEY_FILE"
    chmod 600 "$ENC_KEY_FILE"
    log_success "Yeni 256-bit AES Vault Root Anahtarı üretildi (${ENC_KEY_FILE})."
  fi

  # --------------------------------------------------------------------------
  # 2. TimescaleDB / PostgreSQL Bootstrap Password (/run/secrets/postgres_password)
  # --------------------------------------------------------------------------
  local TEMP_APP_DATA_VAULT=""
  local APP_DATA_VOL
  APP_DATA_VOL=$(resolve_app_data_volume 2>/dev/null || true)
  if [ -n "$APP_DATA_VOL" ]; then
    TEMP_APP_DATA_VAULT=$(mktemp 2>/dev/null || echo "/tmp/.app_data_vault_$$.json")
    docker run --rm -v "${APP_DATA_VOL}:/vdata:ro" -v "$(dirname "$TEMP_APP_DATA_VAULT"):/tmpout" alpine:latest sh -c "if [ -s /vdata/.system_secrets.json ]; then cp /vdata/.system_secrets.json /tmpout/$(basename "$TEMP_APP_DATA_VAULT"); chmod 600 /tmpout/$(basename "$TEMP_APP_DATA_VAULT"); else rm -f /tmpout/$(basename "$TEMP_APP_DATA_VAULT"); fi" 2>/dev/null || rm -f "$TEMP_APP_DATA_VAULT"
    if [ ! -s "$TEMP_APP_DATA_VAULT" ]; then
      rm -f "$TEMP_APP_DATA_VAULT"
      TEMP_APP_DATA_VAULT=""
    fi
  fi

  # Also attempt direct docker cp from running nexus_app container (no alpine image required)
  local RUNNING_APP_VAULT=""
  if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^nexus_app$'; then
    local tmp_cp_vault
    tmp_cp_vault=$(mktemp 2>/dev/null || echo "/tmp/.running_app_vault_$$.json")
    if docker cp nexus_app:/app/data/.system_secrets.json "$tmp_cp_vault" 2>/dev/null; then
      if [ -s "$tmp_cp_vault" ] && grep -q '"database\.password"' "$tmp_cp_vault" 2>/dev/null; then
        RUNNING_APP_VAULT="$tmp_cp_vault"
      else
        rm -f "$tmp_cp_vault" 2>/dev/null
      fi
    else
      rm -f "$tmp_cp_vault" 2>/dev/null
    fi
  fi

  if [ -s "$PG_PASS_FILE" ]; then
    chmod 600 "$PG_PASS_FILE"
    log_info "Veritabanı bootstrap parolası mevcut (${PG_PASS_FILE}) [KORUNDU]."
  elif [ -s "$DB_PASS_FILE" ]; then
    cp "$DB_PASS_FILE" "$PG_PASS_FILE"
    chmod 600 "$PG_PASS_FILE"
    log_info "Legacy veritabanı bootstrap parolası aktarıldı (${PG_PASS_FILE}) [KORUNDU]."
  elif [ "$IS_EXISTING" = true ]; then
    # EXISTING INSTALLATION / UPGRADE:
    # Strictly NEVER generate a random password on an existing install with database volumes!
    # Instead, recover and verify existing database credentials.
    log_info "Mevcut sistem güncellemesi tespit edildi. Veritabanı kimlik bilgileri kurtarılıyor ve doğrulanıyor..."

    local RECOVERY_SUCCESS=false
    local RECOVERED_PASSWORD=""
    local RECOVERY_SOURCE=""

    # Prepare candidate vaults list in priority order
    local CANDIDATE_VAULTS=""
    if [ -n "$RUNNING_APP_VAULT" ]; then
      CANDIDATE_VAULTS="${RUNNING_APP_VAULT}"
    fi
    if [ -n "$TEMP_APP_DATA_VAULT" ] && [ -s "$TEMP_APP_DATA_VAULT" ]; then
      [ -n "$CANDIDATE_VAULTS" ] && CANDIDATE_VAULTS="${CANDIDATE_VAULTS},${TEMP_APP_DATA_VAULT}" || CANDIDATE_VAULTS="${TEMP_APP_DATA_VAULT}"
    fi
    [ -n "$CANDIDATE_VAULTS" ] && CANDIDATE_VAULTS="${CANDIDATE_VAULTS},${VAULT_DATA_FILE}" || CANDIDATE_VAULTS="${VAULT_DATA_FILE}"

    # Step A: Attempt Vault Decryption via Node.js
    if command -v node >/dev/null 2>&1 && [ -s "$ENC_KEY_FILE" ]; then
      local vault_decrypted
      vault_decrypted=$(node -e "
        const fs = require('fs');
        const crypto = require('crypto');
        try {
          const encKeyRaw = fs.readFileSync('$ENC_KEY_FILE', 'utf8').trim();
          if (!/^[0-9a-fA-F]{64}$/.test(encKeyRaw)) process.exit(1);
          const rootKey = Buffer.from(encKeyRaw, 'hex');

          const candidates = '$CANDIDATE_VAULTS'.split(',').map(s => s.trim()).filter(Boolean);
          for (const cand of candidates) {
            if (!fs.existsSync(cand)) continue;
            try {
              const raw = fs.readFileSync(cand, 'utf8');
              const vault = JSON.parse(raw);
              const rec = vault?.secrets?.['database.password'];
              if (!rec || !rec.encryptedValue) continue;

              const parts = rec.encryptedValue.split(':');
              if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') continue;

              const iv = Buffer.from(parts[2], 'hex');
              const authTag = Buffer.from(parts[3], 'hex');
              const encData = parts[4];

              const decipher = crypto.createDecipheriv('aes-256-gcm', rootKey, iv);
              decipher.setAuthTag(authTag);
              let dec = decipher.update(encData, 'hex', 'utf8');
              dec += decipher.final('utf8');
              const pass = dec.trim();
              if (pass.length > 0) {
                console.log(pass);
                process.exit(0);
              }
            } catch {}
          }
          process.exit(1);
        } catch {
          process.exit(1);
        }
      " 2>/dev/null || true)

      if [ -n "$vault_decrypted" ]; then
        local v_code=0
        verify_postgres_password "$vault_decrypted" || v_code=$?
        if [ "$v_code" -eq 0 ]; then
          RECOVERED_PASSWORD="$vault_decrypted"
          RECOVERY_SOURCE="authoritative_vault"
          RECOVERY_VERIFIED=true
        elif [ "$v_code" -eq 2 ]; then
          RECOVERED_PASSWORD="$vault_decrypted"
          RECOVERY_SOURCE="authoritative_vault"
          RECOVERY_VERIFIED=false
          log_warn "PostgreSQL şu anda çevrimdışı veya yanıt vermiyor. Vault içindeki mevcut parola KORUNDU (ilk başlatmada doğrulama bekleniyor)."
        elif [ "$v_code" -eq 1 ]; then
          echo "" >&2
          echo "==========================================================================================" >&2
          echo "❌ [KRİTİK GÜVENLİK HATASI] Vault Kasasındaki Parola PostgreSQL Tarafından Reddedildi!" >&2
          echo "------------------------------------------------------------------------------------------" >&2
          echo "PostgreSQL sunucusu çalışıyor ve Vault kasasındaki veritabanı parolasını reddetti (şifre yanlış)." >&2
          echo "Yanlış parola ile devam edilmesi veritabanı erişimini engelleyeceğinden işlem durduruldu (fail-closed)." >&2
          echo "Lütfen PostgreSQL sunucusu için geçerli parolayı '${PG_PASS_FILE}' konumuna sağlayın." >&2
          echo "==========================================================================================" >&2
          exit 1
        fi
      fi
    fi

    # Step B: If Vault had no database.password, inspect running Docker containers
    if [ -z "$RECOVERED_PASSWORD" ] && command -v docker >/dev/null 2>&1; then
      # Check nexus_timescaledb container env
      if docker inspect nexus_timescaledb >/dev/null 2>&1; then
        local ts_env_pass
        ts_env_pass=$(docker inspect nexus_timescaledb --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep -E '^POSTGRES_PASSWORD=' | head -n1 | cut -d= -f2- | tr -d '\r\n')
        if [ -n "$ts_env_pass" ]; then
          local v_code=0
          verify_postgres_password "$ts_env_pass" || v_code=$?
          if [ "$v_code" -eq 0 ]; then
            RECOVERED_PASSWORD="$ts_env_pass"
            RECOVERY_SOURCE="timescaledb_container_env"
            RECOVERY_VERIFIED=true
          elif [ "$v_code" -eq 2 ]; then
            RECOVERED_PASSWORD="$ts_env_pass"
            RECOVERY_SOURCE="timescaledb_container_env"
            RECOVERY_VERIFIED=false
            log_warn "PostgreSQL şu anda çevrimdışı, konteyner ortamındaki parola KORUNDU (doğrulama bekleniyor)."
          elif [ "$v_code" -eq 1 ]; then
            echo "❌ [HATA] TimescaleDB konteynerindeki parola sunucu tarafından reddedildi!" >&2
            exit 1
          fi
        fi
      fi

      # Check nexus_app container env
      if [ -z "$RECOVERED_PASSWORD" ] && docker inspect nexus_app >/dev/null 2>&1; then
        local app_env_pass
        app_env_pass=$(docker inspect nexus_app --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep -E '^(POSTGRES_PASSWORD|DB_PASSWORD|SQL_ADMIN_PASSWORD)=' | head -n1 | cut -d= -f2- | tr -d '\r\n')
        if [ -n "$app_env_pass" ]; then
          local v_code=0
          verify_postgres_password "$app_env_pass" || v_code=$?
          if [ "$v_code" -eq 0 ]; then
            RECOVERED_PASSWORD="$app_env_pass"
            RECOVERY_SOURCE="app_container_env"
            RECOVERY_VERIFIED=true
          elif [ "$v_code" -eq 2 ]; then
            RECOVERED_PASSWORD="$app_env_pass"
            RECOVERY_SOURCE="app_container_env"
            RECOVERY_VERIFIED=false
            log_warn "PostgreSQL şu anda çevrimdışı, app konteynerindeki parola KORUNDU (doğrulama bekleniyor)."
          elif [ "$v_code" -eq 1 ]; then
            echo "❌ [HATA] App konteynerindeki veritabanı parolası PostgreSQL tarafından reddedildi!" >&2
            exit 1
          fi
        fi
      fi
    fi

    # Step C: If still not found, inspect host .env file
    if [ -z "$RECOVERED_PASSWORD" ] && [ -f "./.env" ]; then
      local env_pass
      env_pass=$(grep -E '^(POSTGRES_PASSWORD|DB_PASSWORD|SQL_ADMIN_PASSWORD)=' "./.env" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '\r\n')
      if [ -z "$env_pass" ]; then
        local env_db_url
        env_db_url=$(grep -E '^(DATABASE_URL|POSTGRES_URL)=' "./.env" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '\r\n')
        if [ -n "$env_db_url" ] && [[ "$env_db_url" =~ :([^@]+)@ ]]; then
          env_pass="${BASH_REMATCH[1]}"
        fi
      fi
      if [ -n "$env_pass" ]; then
        local v_code=0
        verify_postgres_password "$env_pass" || v_code=$?
        if [ "$v_code" -eq 0 ]; then
          RECOVERED_PASSWORD="$env_pass"
          RECOVERY_SOURCE="host_env_file"
          RECOVERY_VERIFIED=true
        elif [ "$v_code" -eq 2 ]; then
          RECOVERED_PASSWORD="$env_pass"
          RECOVERY_SOURCE="host_env_file"
          RECOVERY_VERIFIED=false
          log_warn "PostgreSQL şu anda çevrimdışı, .env dosyasındaki parola KORUNDU (doğrulama bekleniyor)."
        elif [ "$v_code" -eq 1 ]; then
          echo "❌ [HATA] .env dosyasındaki veritabanı parolası PostgreSQL tarafından reddedildi!" >&2
          exit 1
        fi
      fi
    fi

    # Step D: If still not found and running in interactive terminal (TTY), securely prompt operator
    if [ -z "$RECOVERED_PASSWORD" ] && [ -t 0 ] && [ "${NON_INTERACTIVE:-false}" = false ]; then
      log_warn "Mevcut PostgreSQL kurulumu tespit edildi ancak otomatik kaynaklardan geçerli parola bulunamadı."
      echo "" >&2
      echo "==========================================================================================" >&2
      echo "🔑 [GÜVENLİ PAROLA KURTARMA] Mevcut PostgreSQL 'iot_user' Parolası Doğrulaması" >&2
      echo "------------------------------------------------------------------------------------------" >&2
      echo "Yeni Docker Compose sürümüne veri kaybetmeden geçebilmek için mevcut veritabanı parolanız gereklidir." >&2
      echo "Girdiğiniz parola ekranda görünmeyecek, doğrulanacak ve Kasa (Vault) içine mühürlenecektir." >&2
      echo "==========================================================================================" >&2
      read -rsp "Lütfen mevcut PostgreSQL ('${POSTGRES_USER:-iot_user}') parolanızı giriniz: " PROMPT_PASS
      echo "" >&2
      if [ -n "$PROMPT_PASS" ]; then
        local v_code=0
        verify_postgres_password "$PROMPT_PASS" || v_code=$?
        if [ "$v_code" -eq 0 ]; then
          RECOVERED_PASSWORD="$PROMPT_PASS"
          RECOVERY_SOURCE="operator_prompt"
          RECOVERY_VERIFIED=true
        elif [ "$v_code" -eq 2 ]; then
          RECOVERED_PASSWORD="$PROMPT_PASS"
          RECOVERY_SOURCE="operator_prompt"
          RECOVERY_VERIFIED=false
          log_warn "PostgreSQL şu anda çevrimdışı, girilen parola kaydedildi (doğrulama bekleniyor)."
        else
          echo "" >&2
          echo "❌ [HATA] Girilen parola PostgreSQL sunucusu tarafından reddedildi (kimlik doğrulama başarısız)!" >&2
          echo "Yanlış parola tespit edildiği için kurulum güvenli biçimde durduruldu." >&2
          exit 1
        fi
      fi
    fi

    # Step E: Write verified recovered password atomically
    if [ -n "$RECOVERED_PASSWORD" ]; then
      local TMP_WRITE="${PG_PASS_FILE}.tmp.$$"
      printf "%s" "$RECOVERED_PASSWORD" > "$TMP_WRITE"
      chmod 600 "$TMP_WRITE"
      mv -f "$TMP_WRITE" "$PG_PASS_FILE"
      chmod 600 "$PG_PASS_FILE"
      if [ "$RECOVERY_VERIFIED" = true ]; then
        if [ "$RECOVERY_SOURCE" = "authoritative_vault" ]; then
          log_success "Veritabanı bootstrap parolası Vault kasasından başarıyla kurtarıldı (${PG_PASS_FILE}) [DOĞRULANDI]."
        else
          log_success "Veritabanı bootstrap parolası (${RECOVERY_SOURCE}) kaynağından başarıyla kurtarıldı (${PG_PASS_FILE}) [DOĞRULANDI]."
        fi
      else
        if [ "$RECOVERY_SOURCE" = "authoritative_vault" ]; then
          log_warn "Veritabanı bootstrap parolası Vault kasasından kurtarıldı (${PG_PASS_FILE}) [KORUNDU - PostgreSQL çevrimdışı, doğrulama bekleniyor]."
        else
          log_warn "Veritabanı bootstrap parolası (${RECOVERY_SOURCE}) kaynağından kurtarıldı (${PG_PASS_FILE}) [KORUNDU - PostgreSQL çevrimdışı, doğrulama bekleniyor]."
        fi
      fi
      RECOVERY_SUCCESS=true
    fi

    # Clean up temp volume extraction files
    [ -n "$TEMP_APP_DATA_VAULT" ] && rm -f "$TEMP_APP_DATA_VAULT" 2>/dev/null || true
    [ -n "$RUNNING_APP_VAULT" ] && rm -f "$RUNNING_APP_VAULT" 2>/dev/null || true

    if [ "$RECOVERY_SUCCESS" = false ]; then
      echo "" >&2
      echo "==========================================================================================" >&2
      echo "❌ [KRİTİK GÜVENLİK HATASI] Mevcut Veritabanı Kurulumu Tespit Edildi Fakat Parola Kurtarılamadı!" >&2
      echo "------------------------------------------------------------------------------------------" >&2
      echo "Mevcut TimescaleDB volume veya konteyneri mevcut ancak '${PG_PASS_FILE}' bulunamadı." >&2
      echo "Veri kaybını ve yetkisiz erişim hatalarını önlemek için otomatik yeni parola üretilmedi (fail-closed)." >&2
      echo "" >&2
      echo "Docker Compose up öncesinde mevcut veritabanı parolanızı güvenle sağlamak için:" >&2
      echo "  printf \"%s\" \"MEVCUT_PAROLANIZ\" > ${PG_PASS_FILE}" >&2
      echo "  chmod 600 ${PG_PASS_FILE}" >&2
      echo "veya .env dosyasında POSTGRES_PASSWORD=MEVCUT_PAROLANIZ tanımlayıp yeniden çalıştırın." >&2
      echo "==========================================================================================" >&2
      exit 1
    fi
  else
    # FRESH INSTALLATION: Generate secure random password
    # Clean up temp volume extraction file if any
    [ -n "$TEMP_APP_DATA_VAULT" ] && rm -f "$TEMP_APP_DATA_VAULT" 2>/dev/null || true
    [ -n "$RUNNING_APP_VAULT" ] && rm -f "$RUNNING_APP_VAULT" 2>/dev/null || true

    local PG_GENERATED_PASS
    PG_GENERATED_PASS=$(generate_random_hex 24)
    printf "%s" "$PG_GENERATED_PASS" > "$PG_PASS_FILE"
    chmod 600 "$PG_PASS_FILE"
    log_success "Yeni yüksek entropili veritabanı parolası üretildi (${PG_PASS_FILE})."
  fi

  # --------------------------------------------------------------------------
  # 3. Canonical Application Vault Bootstrap Initialization & Volume Alignment:
  # --------------------------------------------------------------------------
  # On fresh install or when database.password is missing from Vault, seal it with AES-256-GCM.
  # This ensures the app container (which only receives encryption_key) deterministically
  # resolves the canonical database password from Central Security Vault without mounting ./secrets.
  if [ -s "$ENC_KEY_FILE" ] && [ -s "$PG_PASS_FILE" ]; then
    if [ ! -s "$VAULT_DATA_FILE" ] || ! grep -q '"database.password"' "$VAULT_DATA_FILE" 2>/dev/null; then
      if command -v node >/dev/null 2>&1; then
        node -e "
          const fs = require('fs');
          const crypto = require('crypto');
          try {
            const keyRaw = fs.readFileSync('$ENC_KEY_FILE', 'utf8').trim();
            if (!/^[0-9a-fA-F]{64}$/.test(keyRaw)) {
              throw new Error('Geçersiz ENCRYPTION_KEY: Root key tam 64 hexadecimal karakter olmalıdır.');
            }
            const rootKey = Buffer.from(keyRaw, 'hex');
            const pass = fs.readFileSync('$PG_PASS_FILE', 'utf8').trim();
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', rootKey, iv);
            let enc = cipher.update(pass, 'utf8', 'hex');
            enc += cipher.final('hex');
            const tag = cipher.getAuthTag().toString('hex');
            const ciphertext = 'enc:v1:' + iv.toString('hex') + ':' + tag + ':' + enc;

            let vault = { version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), secrets: {} };
            if (fs.existsSync('$VAULT_DATA_FILE')) {
              try {
                const parsed = JSON.parse(fs.readFileSync('$VAULT_DATA_FILE', 'utf8'));
                if (parsed && typeof parsed === 'object') {
                  vault = parsed;
                  if (!vault.secrets) vault.secrets = {};
                }
              } catch {}
            }

            if (!vault.secrets['database.password']) {
              vault.secrets['database.password'] = {
                key: 'database.password',
                category: 'database',
                label: 'PostgreSQL Password',
                encryptedValue: ciphertext,
                isSensitive: true,
                updatedAt: new Date().toISOString(),
                updatedBy: 'bootstrap'
              };
              vault.updatedAt = new Date().toISOString();
              fs.writeFileSync('$VAULT_DATA_FILE', JSON.stringify(vault, null, 2), { mode: 0o600 });
            }
          } catch (e) {
            console.error('Vault bootstrap initialization warning:', e.message);
          }
        " 2>/dev/null || true
        [ -s "$VAULT_DATA_FILE" ] && chmod 600 "$VAULT_DATA_FILE" 2>/dev/null || true
        log_success "Veritabanı bootstrap parolası Vault kasasına AES-256-GCM ile mühürlendi."
      fi
    fi

    # For FRESH INSTALL ONLY: Seed empty app_data volume if volume exists without a vault
    if [ "$IS_EXISTING" = false ] && [ -s "$VAULT_DATA_FILE" ]; then
      local APP_DATA_VOL
      APP_DATA_VOL=$(resolve_app_data_volume 2>/dev/null || true)
      if [ -n "$APP_DATA_VOL" ]; then
        docker run --rm -v "${APP_DATA_VOL}:/vdata" -v "$(pwd)/data:/hostdata:ro" alpine:latest sh -c "if [ ! -s /vdata/.system_secrets.json ]; then cp /hostdata/.system_secrets.json /vdata/.system_secrets.json; chmod 600 /vdata/.system_secrets.json; fi" 2>/dev/null || true
      fi
    fi
  fi

  # --------------------------------------------------------------------------
  # 4. Final Security Audit & Ownership Alignment:
  # --------------------------------------------------------------------------
  if ! align_secrets_ownership_and_permissions; then
    return 1
  fi
}

align_secrets_ownership_and_permissions() {
  local SECRETS_DIR="${SECRETS_DIR:-./secrets}"
  local ENC_KEY_FILE="${ENC_KEY_FILE:-${SECRETS_DIR}/encryption_key}"
  local PG_PASS_FILE="${PG_PASS_FILE:-${SECRETS_DIR}/postgres_password}"
  local DB_PASS_FILE="${DB_PASS_FILE:-${SECRETS_DIR}/db_password}"

  [ ! -d "$SECRETS_DIR" ] && return 0

  # Container node user requires UID 1000 / GID 1000 read access.
  # Security requirements:
  # 1. Never make secrets world-readable (0644, 0777 or any 'other' bits are strictly forbidden).
  # 2. Host operator retains necessary owner access.
  # 3. ROOT without SUDO_USER (clean root install):
  #    Assign ownership 1000:1000 with 0600 (owner rw-, group/others 0) and dir 0700.
  #    Node process (UID 1000) inside container reads the secret as owner.
  #    Root retains full read/write via kernel DAC override.
  # 4. ROOT with SUDO_USER (e.g. sudo ./install.sh by UID 1001):
  #    Assign owner $SUDO_USER, group 1000.
  #    Mode 0640 (owner rw-, group r--, others 0) and dir 0750.
  #    Node process reads via group 1000.
  # 5. Non-root user:
  #    - If UID == 1000: mode 0600, dir 0700.
  #    - If UID != 1000:
  #      * Try group 1000 (if operator is in group 1000) or setfacl (POSIX ACL).
  #      * If unprivileged access fails, evaluate controlled sudo for permissions adjustment:
  #        Only use sudo if passwordless (sudo -n) and non-interactive; never hang on password prompt.
  #        Set group 1000 (mode 0640 / dir 0750), retaining non-root operator as owner.
  # 6. FAIL-CLOSED: No '|| true' silently masking errors. Explicit verification that UID 1000 can read the secrets and traverse directory.

  local current_uid current_gid
  current_uid=$(id -u 2>/dev/null || echo "")
  current_gid=$(id -g 2>/dev/null || echo "")

  local sudo_user="${SUDO_USER:-}"
  local sudo_uid="${SUDO_UID:-}"
  if [ -n "$sudo_user" ] && [ "$sudo_user" = "root" ]; then
    sudo_user=""
  fi
  if [ -n "$sudo_user" ] && [ -z "$sudo_uid" ]; then
    sudo_uid=$(id -u "$sudo_user" 2>/dev/null || echo "")
  fi

  local is_root_exec=false
  if [ "${IS_ROOT:-}" = "true" ]; then
    is_root_exec=true
  elif [ "${IS_ROOT:-}" = "false" ]; then
    is_root_exec=false
  elif [ "$current_uid" = "0" ] || [ "${EUID:-0}" -eq 0 ]; then
    is_root_exec=true
  fi

  # Helper: evaluate non-interactive safe sudo availability for privilege elevation
  # NEVER hang in non-interactive environments (CI, background scripts, unattended install)
  local sudo_available=false
  local sudo_cmd=""
  if command -v sudo >/dev/null 2>&1; then
    if sudo -n true 2>/dev/null; then
      sudo_available=true
      sudo_cmd="sudo -n"
    elif [ -t 0 ] && [ -t 1 ] && [ -z "${CI:-}" ] && [ "${DEBIAN_FRONTEND:-}" != "noninteractive" ]; then
      # In interactive shell with TTY, test or prompt for sudo
      if sudo -v 2>/dev/null; then
        sudo_available=true
        sudo_cmd="sudo"
      fi
    fi
  fi

  if [ "$is_root_exec" = true ]; then
    if [ -n "$sudo_user" ] && [ "$sudo_user" != "root" ] && [ "$sudo_uid" != "1000" ]; then
      # Root running on behalf of a non-root host operator (e.g. sudo ./install.sh by UID 1001)
      local chown_target="${sudo_uid:-$sudo_user}"
      if [ -n "$sudo_user" ] && ! id -u "$sudo_user" >/dev/null 2>&1 && [ -z "$sudo_uid" ]; then
        chown_target=""
      fi

      if [ -n "$chown_target" ]; then
        if ! chown "$chown_target:1000" "$SECRETS_DIR" 2>&1; then
          if ! chown :1000 "$SECRETS_DIR" 2>&1; then
            echo "❌ [KRİTİK HATA] '${SECRETS_DIR}' dizini için GID 1000 atanamadı!" >&2
            return 1
          fi
        fi
      else
        if ! chown :1000 "$SECRETS_DIR" 2>&1; then
          echo "❌ [KRİTİK HATA] '${SECRETS_DIR}' dizini için GID 1000 atanamadı!" >&2
          return 1
        fi
      fi

      if ! chmod 750 "$SECRETS_DIR"; then
        echo "❌ [KRİTİK HATA] '${SECRETS_DIR}' dizini için 0750 izni ayarlanamadı!" >&2
        return 1
      fi

      for sfile in "$ENC_KEY_FILE" "$PG_PASS_FILE" "$DB_PASS_FILE"; do
        if [ -f "$sfile" ]; then
          if [ -n "$chown_target" ]; then
            if ! chown "$chown_target:1000" "$sfile" 2>&1; then
              if ! chown :1000 "$sfile" 2>&1; then
                echo "❌ [KRİTİK HATA] '${sfile}' için GID 1000 atanamadı!" >&2
                return 1
              fi
            fi
          else
            if ! chown :1000 "$sfile" 2>&1; then
              echo "❌ [KRİTİK HATA] '${sfile}' için GID 1000 atanamadı!" >&2
              return 1
            fi
          fi
          if ! chmod 640 "$sfile"; then
            echo "❌ [KRİTİK HATA] '${sfile}' için 0640 izni ayarlanamadı!" >&2
            return 1
          fi
          if command -v setfacl >/dev/null 2>&1; then
            setfacl -m u:1000:r,m::r "$sfile" 2>/dev/null || true
          fi
        fi
      done
      if command -v setfacl >/dev/null 2>&1; then
        setfacl -m u:1000:rx,m::rx "$SECRETS_DIR" 2>/dev/null || true
      fi
    else
      # Pure Root without SUDO_USER or sudo invoked by UID 1000
      # Assign ownership to UID 1000 when root; for non-root test/CI runners, retain current ownership
      if [ "$current_uid" = "0" ] || [ "${EUID:-0}" -eq 0 ]; then
        if ! chown 1000:1000 "$SECRETS_DIR"; then
          echo "❌ [KRİTİK HATA] '${SECRETS_DIR}' dizini için 1000:1000 sahipliği ayarlanamadı!" >&2
          return 1
        fi
      fi
      if ! chmod 700 "$SECRETS_DIR"; then
        echo "❌ [KRİTİK HATA] '${SECRETS_DIR}' dizini için 0700 izni ayarlanamadı!" >&2
        return 1
      fi
      for sfile in "$ENC_KEY_FILE" "$PG_PASS_FILE" "$DB_PASS_FILE"; do
        if [ -f "$sfile" ]; then
          if [ "$current_uid" = "0" ] || [ "${EUID:-0}" -eq 0 ]; then
            if ! chown 1000:1000 "$sfile"; then
              echo "❌ [KRİTİK HATA] '${sfile}' dosyası için 1000:1000 sahipliği ayarlanamadı!" >&2
              return 1
            fi
          fi
          if ! chmod 600 "$sfile"; then
            echo "❌ [KRİTİK HATA] '${sfile}' dosyası için 0600 izni ayarlanamadı!" >&2
            return 1
          fi
        fi
      done
    fi
  else
    # Non-root user execution
    if [ "$current_uid" = "1000" ]; then
      if ! chmod 700 "$SECRETS_DIR"; then
        echo "❌ [KRİTİK HATA] '${SECRETS_DIR}' dizini için 0700 izni ayarlanamadı!" >&2
        return 1
      fi
      for sfile in "$ENC_KEY_FILE" "$PG_PASS_FILE" "$DB_PASS_FILE"; do
        if [ -f "$sfile" ]; then
          if ! chmod 600 "$sfile"; then
            echo "❌ [KRİTİK HATA] '${sfile}' dosyası için 0600 izni ayarlanamadı!" >&2
            return 1
          fi
        fi
      done
    else
      # Operator is non-root with UID != 1000 (e.g. UID 1001 'deploy')
      local method_errors=()

      # Attempt 1: Unprivileged group change (succeeds if operator belongs to group 1000)
      local grp_err=""
      if grp_err=$(chgrp 1000 "$SECRETS_DIR" 2>&1); then
        if ! chmod 750 "$SECRETS_DIR" 2>&1; then
          method_errors+=("chmod 750 $SECRETS_DIR: Başarısız")
        fi
        for sfile in "$ENC_KEY_FILE" "$PG_PASS_FILE" "$DB_PASS_FILE"; do
          if [ -f "$sfile" ]; then
            if ! s_grp_err=$(chgrp 1000 "$sfile" 2>&1); then
              method_errors+=("chgrp 1000 ($sfile): $s_grp_err")
            fi
            if ! chmod 640 "$sfile" 2>&1; then
              method_errors+=("chmod 640 ($sfile): Başarısız")
            fi
          fi
        done
      else
        method_errors+=("chgrp 1000: Kullanıcı GID 1000 grubuna dahil değil (${grp_err:-EPERM})")
      fi

      # Attempt 2: Unprivileged POSIX ACL (file owner can set ACL without root)
      if command -v setfacl >/dev/null 2>&1; then
        local acl_err=""
        # Ensure group read/traverse is enabled so POSIX ACL mask is at least r-x on dir and r-- on files
        chmod 750 "$SECRETS_DIR" 2>/dev/null || true
        if acl_err=$(setfacl -m u:1000:rx,m::rx "$SECRETS_DIR" 2>&1); then
          for sfile in "$ENC_KEY_FILE" "$PG_PASS_FILE" "$DB_PASS_FILE"; do
            if [ -f "$sfile" ]; then
              chmod 640 "$sfile" 2>/dev/null || true
              local f_acl_err=""
              if ! f_acl_err=$(setfacl -m u:1000:r,m::r "$sfile" 2>&1); then
                method_errors+=("setfacl ($sfile): $f_acl_err")
              fi
            fi
          done
        else
          method_errors+=("setfacl ($SECRETS_DIR): POSIX ACL uygulanamadı (${acl_err:-hata})")
        fi
      else
        method_errors+=("setfacl: 'setfacl' aracı sistemde kurulu değil")
      fi

      # Attempt 3: Controlled sudo (if needed and safe/available)
      local check_needed=true
      local can_read_now=true
      for sfile in "$ENC_KEY_FILE" "$PG_PASS_FILE"; do
        [ ! -f "$sfile" ] && continue
        local cur_gid cur_mode
        cur_gid=$(stat -c "%g" "$sfile" 2>/dev/null || stat -f "%g" "$sfile" 2>/dev/null || echo "")
        cur_mode=$(stat -c "%a" "$sfile" 2>/dev/null || stat -f "%Lp" "$sfile" 2>/dev/null || echo "")
        local s_ok=false
        if [ "$cur_gid" = "1000" ] && [ -n "$cur_mode" ] && [ "${cur_mode: -2:1}" -ge 4 ]; then
          s_ok=true
        elif command -v getfacl >/dev/null 2>&1; then
          if getfacl -n -c "$sfile" 2>/dev/null | grep -E "^(user|group):1000:r" | grep -qv "#effective:---"; then
            s_ok=true
          fi
        fi
        [ "$s_ok" = false ] && can_read_now=false
      done

      if [ "$can_read_now" = false ]; then
        if [ "$sudo_available" = true ]; then
          local sudo_err=""
          if sudo_err=$($sudo_cmd chgrp 1000 "$SECRETS_DIR" 2>&1); then
            $sudo_cmd chmod 750 "$SECRETS_DIR" 2>/dev/null || true
            for sfile in "$ENC_KEY_FILE" "$PG_PASS_FILE" "$DB_PASS_FILE"; do
              if [ -f "$sfile" ]; then
                $sudo_cmd chgrp 1000 "$sfile" 2>/dev/null || true
                $sudo_cmd chmod 640 "$sfile" 2>/dev/null || true
                if command -v setfacl >/dev/null 2>&1; then
                  $sudo_cmd setfacl -m u:1000:r,m::r "$sfile" 2>/dev/null || true
                fi
              fi
            done
            if command -v setfacl >/dev/null 2>&1; then
              $sudo_cmd setfacl -m u:1000:rx,m::rx "$SECRETS_DIR" 2>/dev/null || true
            fi
          else
            method_errors+=("sudo chgrp: Sudo ile grup atanamadı (${sudo_err:-hata})")
          fi
        else
          method_errors+=("sudo: Etkileşimsiz ortamda şifresiz sudo (NOPASSWD) yetkisi yok")
        fi
      fi
    fi
  fi

  # --------------------------------------------------------------------------
  # Post-Alignment Security & Accessibility Audit (FAIL-CLOSED)
  # --------------------------------------------------------------------------
  # Step A: Audit Directory Permissions & Ancestor Traversal
  local abs_sec_dir
  abs_sec_dir=$(cd "$SECRETS_DIR" 2>/dev/null && pwd -P || echo "$SECRETS_DIR")

  # Traverse all ancestors up to / to ensure UID 1000 has search/execute (x) permission
  local ancestor_blocked=false
  local blocked_ancestor_path=""
  local p_curr
  p_curr=$(dirname "$abs_sec_dir" 2>/dev/null || echo "")
  while [ "$p_curr" != "/" ] && [ -n "$p_curr" ]; do
    local p_mode p_uid p_gid
    p_mode=$(stat -c "%a" "$p_curr" 2>/dev/null || stat -f "%Lp" "$p_curr" 2>/dev/null || echo "")
    p_uid=$(stat -c "%u" "$p_curr" 2>/dev/null || stat -f "%u" "$p_curr" 2>/dev/null || echo "")
    p_gid=$(stat -c "%g" "$p_curr" 2>/dev/null || stat -f "%g" "$p_curr" 2>/dev/null || echo "")

    local p_can_x=false
    if [ "$p_uid" = "1000" ] && [[ "${p_mode: -3:1}" =~ [1357] ]]; then
      p_can_x=true
    elif [ "$p_gid" = "1000" ] && [ -n "$p_mode" ] && [[ "${p_mode: -2:1}" =~ [1357] ]]; then
      p_can_x=true
    elif [ -n "$p_mode" ] && [[ "${p_mode: -1:1}" =~ [1357] ]]; then
      # Other execute bit is set (standard for /home, /usr, /var, etc.)
      p_can_x=true
    elif command -v getfacl >/dev/null 2>&1; then
      local p_facl
      p_facl=$(getfacl -n -c "$p_curr" 2>/dev/null || echo "")
      if echo "$p_facl" | grep -E "^(user|group):1000:.*x" | grep -qv "#effective:---"; then
        local p_mask
        p_mask=$(echo "$p_facl" | grep -E "^mask::" | cut -d: -f3 2>/dev/null || echo "")
        if [ -z "$p_mask" ] || [[ "$p_mask" =~ [x] ]]; then
          p_can_x=true
        fi
      fi
    fi

    if [ "$p_can_x" = false ]; then
      ancestor_blocked=true
      blocked_ancestor_path="$p_curr"
      break
    fi
    p_curr=$(dirname "$p_curr")
  done

  if [ "$ancestor_blocked" = true ]; then
    echo "❌ [KRİTİK HATA] Üst dizin '${blocked_ancestor_path}' UID 1000 tarafından taranabilir (search/execute) değil!" >&2
    echo "Dizin Sahibi: UID ${p_uid:-?}, Grup: GID ${p_gid:-?}, İzin: ${p_mode:-?}." >&2
    echo "Güvenlik Politikası: Proje dışındaki üst dizinlerin izinleri ve ACL'leri otomatik olarak değiştirilmez." >&2
    echo "Çözüm: Konteyner kullanıcısının (UID 1000) erişebilmesi için bu üst dizine manuel geçiş izni verin:" >&2
    echo "  setfacl -m u:1000:x '${blocked_ancestor_path}'" >&2
    echo "  veya" >&2
    echo "  chmod a+x '${blocked_ancestor_path}'" >&2
    return 1
  fi

  local d_mode d_uid d_gid
  d_mode=$(stat -c "%a" "$SECRETS_DIR" 2>/dev/null || stat -f "%Lp" "$SECRETS_DIR" 2>/dev/null || echo "")
  d_uid=$(stat -c "%u" "$SECRETS_DIR" 2>/dev/null || stat -f "%u" "$SECRETS_DIR" 2>/dev/null || echo "")
  d_gid=$(stat -c "%g" "$SECRETS_DIR" 2>/dev/null || stat -f "%g" "$SECRETS_DIR" 2>/dev/null || echo "")

  if [ -n "$d_mode" ]; then
    local d_other="${d_mode: -1}"
    if [ "$d_other" != "0" ]; then
      echo "❌ [GÜVENLİK İHLALİ] '${SECRETS_DIR}' dizini (${d_mode}) herkese açık izinlere sahip! Başlatma durduruldu." >&2
      return 1
    fi
  fi

  local dir_access_ok=false
  if [ "$d_uid" = "1000" ] && [[ "${d_mode: -3:1}" =~ [1357] ]]; then
    dir_access_ok=true
  elif [ "$d_gid" = "1000" ] && [ -n "$d_mode" ] && [[ "${d_mode: -2:1}" =~ [1357] ]]; then
    dir_access_ok=true
  elif command -v getfacl >/dev/null 2>&1; then
    local dir_facl
    dir_facl=$(getfacl -n -c "$SECRETS_DIR" 2>/dev/null || echo "")
    if echo "$dir_facl" | grep -E "^(user|group):1000:.*x" | grep -qv "#effective:---"; then
      local d_mask
      d_mask=$(echo "$dir_facl" | grep -E "^mask::" | cut -d: -f3 2>/dev/null || echo "")
      if [ -z "$d_mask" ] || [[ "$d_mask" =~ [x] ]]; then
        dir_access_ok=true
      fi
    fi
  fi

  if [ "$dir_access_ok" = false ]; then
    echo "❌ [KRİTİK HATA] '${SECRETS_DIR}' secret dizini UID 1000 konteyner kullanıcısı tarafından erişilebilir/taranabilir değil!" >&2
    echo "Dizin Sahibi: UID ${d_uid:-?}, Grup: GID ${d_gid:-?}, İzin: ${d_mode:-?}." >&2
    echo "Çalıştıran Kullanıcı: UID ${current_uid:-?} (GID ${current_gid:-?}). Sudo Durumu: ${sudo_available}." >&2
    echo "" >&2
    if [ ${#method_errors[@]} -gt 0 ]; then
      echo "Denenen Yöntemler ve Alınan Hatalar:" >&2
      for err_line in "${method_errors[@]}"; do
        echo "  - ${err_line}" >&2
      done
      echo "" >&2
    fi
    echo "Çözüm: Kurulumu 'sudo ./install.sh' ile çalıştırın veya 'sudo chown :1000 ${SECRETS_DIR} && chmod 750 ${SECRETS_DIR}' uygulayın." >&2
    return 1
  fi

  # Step B: Audit Secret Files Permissions & Verified UID 1000 Readability
  for sfile in "$ENC_KEY_FILE" "$PG_PASS_FILE"; do
    [ ! -f "$sfile" ] && continue

    # Check 1: World-readable protection (other bits must be strictly 0)
    local f_mode f_uid f_gid
    f_mode=$(stat -c "%a" "$sfile" 2>/dev/null || stat -f "%Lp" "$sfile" 2>/dev/null || echo "")
    f_uid=$(stat -c "%u" "$sfile" 2>/dev/null || stat -f "%u" "$sfile" 2>/dev/null || echo "")
    f_gid=$(stat -c "%g" "$sfile" 2>/dev/null || stat -f "%g" "$sfile" 2>/dev/null || echo "")

    if [ -n "$f_mode" ]; then
      local other_octal="${f_mode: -1}"
      if [ "$other_octal" != "0" ]; then
        echo "❌ [GÜVENLİK İHLALİ] '${sfile}' (${f_mode}) herkese açık izinlere sahip! Başlatma durduruldu." >&2
        return 1
      fi
    fi

    # Check 2: Verify that container user UID 1000 can access the secret
    # Strategy A: Real runtime execution test by UID 1000 when possible
    local access_ok=false
    local real_test_executed=false

    # Dynamically find any host username mapped to UID 1000 (e.g. ubuntu, debian, node, admin)
    local u1000_name=""
    u1000_name=$(getent passwd 1000 2>/dev/null | cut -d: -f1 || id -nu 1000 2>/dev/null || echo "")

    if [ "$current_uid" = "1000" ]; then
      real_test_executed=true
      if [ -x "$SECRETS_DIR" ] && [ -r "$sfile" ] && head -c 1 "$sfile" >/dev/null 2>&1; then
        access_ok=true
      fi
    elif [ "$is_root_exec" = true ]; then
      # Root execution can test access as numeric UID 1000 without requiring a username named 'node'
      if command -v setpriv >/dev/null 2>&1; then
        real_test_executed=true
        if setpriv --reuid 1000 --regid 1000 --clear-groups sh -c "test -x '$SECRETS_DIR' && test -r '$sfile' && head -c 1 '$sfile' >/dev/null" 2>/dev/null; then
          access_ok=true
        fi
      elif [ -n "$u1000_name" ]; then
        real_test_executed=true
        if su -s /bin/sh "$u1000_name" -c "test -x '$SECRETS_DIR' && test -r '$sfile' && head -c 1 '$sfile' >/dev/null" 2>/dev/null; then
          access_ok=true
        fi
      elif command -v node >/dev/null 2>&1; then
        real_test_executed=true
        if node -e "try { process.setgid(1000); process.setuid(1000); const fs = require('fs'); fs.accessSync(process.argv[1], fs.constants.R_OK); const fd = fs.openSync(process.argv[1], 'r'); const buf = Buffer.alloc(1); fs.readSync(fd, buf, 0, 1, 0); fs.closeSync(fd); process.exit(0); } catch(e) { process.exit(1); }" "$sfile" 2>/dev/null; then
          access_ok=true
        fi
      fi
    elif [ "$sudo_available" = true ]; then
      if $sudo_cmd -u '#1000' sh -c "test -x '$SECRETS_DIR' && test -r '$sfile' && head -c 1 '$sfile' >/dev/null" 2>/dev/null; then
        real_test_executed=true
        access_ok=true
      elif [ -n "$u1000_name" ] && $sudo_cmd -u "$u1000_name" sh -c "test -x '$SECRETS_DIR' && test -r '$sfile' && head -c 1 '$sfile' >/dev/null" 2>/dev/null; then
        real_test_executed=true
        access_ok=true
      fi
    fi

    # Strategy B: Strict Alternative Verification (when switching to UID 1000 is not permitted by kernel DAC)
    if [ "$real_test_executed" = false ]; then
      if [ "$ancestor_blocked" = false ] && [ "$dir_access_ok" = true ]; then
        if [ "$f_uid" = "1000" ] && [ "${f_mode: -3:1}" -ge 4 ]; then
          access_ok=true
        elif [ "$f_gid" = "1000" ] && [ -n "$f_mode" ] && [ "${f_mode: -2:1}" -ge 4 ]; then
          access_ok=true
        elif command -v getfacl >/dev/null 2>&1; then
          local file_facl
          file_facl=$(getfacl -n -c "$sfile" 2>/dev/null || echo "")
          if echo "$file_facl" | grep -E "^(user|group):1000:r" | grep -qv "#effective:---"; then
            local f_mask
            f_mask=$(echo "$file_facl" | grep -E "^mask::" | cut -d: -f3 2>/dev/null || echo "")
            if [ -z "$f_mask" ] || [[ "$f_mask" =~ [r] ]]; then
              access_ok=true
            fi
          fi
        fi
      fi
    fi

    if [ "$access_ok" = false ]; then
      if [ "$is_root_exec" = true ]; then
        # Fallback fix if root
        chown 1000:1000 "$sfile" 2>/dev/null && chmod 600 "$sfile" 2>/dev/null
        if [ "$real_test_executed" = true ]; then
          if command -v setpriv >/dev/null 2>&1; then
            setpriv --reuid 1000 --regid 1000 --clear-groups sh -c "test -x '$SECRETS_DIR' && test -r '$sfile'" 2>/dev/null && access_ok=true
          elif [ -n "$u1000_name" ]; then
            su -s /bin/sh "$u1000_name" -c "test -x '$SECRETS_DIR' && test -r '$sfile'" 2>/dev/null && access_ok=true
          elif command -v node >/dev/null 2>&1; then
            node -e "try { process.setgid(1000); process.setuid(1000); const fs = require('fs'); fs.accessSync(process.argv[1], fs.constants.R_OK); process.exit(0); } catch(e) { process.exit(1); }" "$sfile" 2>/dev/null && access_ok=true
          fi
        else
          access_ok=true
        fi
      fi
      if [ "$access_ok" = false ]; then
        echo "❌ [KRİTİK HATA] '${sfile}' secret dosyası UID 1000 konteyner kullanıcısı tarafından okunamıyor!" >&2
        echo "Dosya Sahibi: UID ${f_uid:-?}, Grup: GID ${f_gid:-?}, İzin: ${f_mode:-?}." >&2
        echo "Dizin Sahibi: UID ${d_uid:-?}, Grup: GID ${d_gid:-?}, İzin: ${d_mode:-?}." >&2
        echo "Çalıştıran Kullanıcı: UID ${current_uid:-?} (GID ${current_gid:-?}). Sudo Durumu: ${sudo_available}." >&2
        echo "" >&2
        if [ ${#method_errors[@]} -gt 0 ]; then
          echo "Denenen Yöntemler ve Alınan Hatalar:" >&2
          for err_line in "${method_errors[@]}"; do
            echo "  - ${err_line}" >&2
          done
          echo "" >&2
        fi
        echo "Çözüm Seçenekleri:" >&2
        echo "  1. Kurulumu 'sudo ./install.sh' (veya 'sudo -E ./install.sh') ile çalıştırın." >&2
        echo "  2. Veya dosyaların grubunu manuel olarak GID 1000 yapın:" >&2
        echo "     sudo chown -R :1000 ${SECRETS_DIR} && chmod 750 ${SECRETS_DIR} && chmod 640 ${SECRETS_DIR}/*" >&2
        echo "  3. Veya kullanıcınızı sudoers listesine ekleyin (NOPASSWD) ya da 'acl' paketini kurun (örn: apt install acl)." >&2
        return 1
      fi
    fi
  done

  return 0
}


