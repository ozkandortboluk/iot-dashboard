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

detect_existing_installation() {
  local SECRETS_DIR="./secrets"
  local DATA_DIR="./data"

  # 1. Check local secret files
  if [ -s "${SECRETS_DIR}/postgres_password" ] || [ -s "${SECRETS_DIR}/db_password" ]; then
    return 0
  fi
  # 2. Check local vault file containing secrets
  if [ -s "${DATA_DIR}/.system_secrets.json" ] && grep -q '"secrets"' "${DATA_DIR}/.system_secrets.json" 2>/dev/null; then
    return 0
  fi

  # 3. Check Docker volumes and containers
  if command -v docker >/dev/null 2>&1; then
    if docker volume ls -q 2>/dev/null | grep -qE '(^|_)timescaledb_data$'; then
      return 0
    fi
    if docker volume ls -q 2>/dev/null | grep -qE '(^|_)app_data$'; then
      return 0
    fi
    if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qE '^nexus_(timescaledb|app)$'; then
      return 0
    fi
  fi

  return 1
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

  # --------------------------------------------------------------------------
  # 1. Root Encryption Key (AES-256-GCM Vault Root: /run/secrets/encryption_key)
  # --------------------------------------------------------------------------
  if [ ! -s "$ENC_KEY_FILE" ] && [ "$IS_EXISTING" = true ] && ([ -s "$VAULT_DATA_FILE" ] || (command -v docker >/dev/null 2>&1 && docker volume ls -q 2>/dev/null | grep -qE '(^|_)app_data$')); then
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
  if command -v docker >/dev/null 2>&1; then
    local APP_DATA_VOL
    APP_DATA_VOL=$(docker volume ls -q 2>/dev/null | grep -E '(^|_)app_data$' | head -n1 || true)
    if [ -n "$APP_DATA_VOL" ]; then
      TEMP_APP_DATA_VAULT=$(mktemp 2>/dev/null || echo "/tmp/.app_data_vault_$$.json")
      docker run --rm -v "${APP_DATA_VOL}:/vdata:ro" -v "$(dirname "$TEMP_APP_DATA_VAULT"):/tmpout" alpine:latest sh -c "if [ -s /vdata/.system_secrets.json ]; then cp /vdata/.system_secrets.json /tmpout/$(basename "$TEMP_APP_DATA_VAULT"); chmod 600 /tmpout/$(basename "$TEMP_APP_DATA_VAULT"); else rm -f /tmpout/$(basename "$TEMP_APP_DATA_VAULT"); fi" 2>/dev/null || rm -f "$TEMP_APP_DATA_VAULT"
      if [ ! -s "$TEMP_APP_DATA_VAULT" ]; then
        rm -f "$TEMP_APP_DATA_VAULT"
        TEMP_APP_DATA_VAULT=""
      fi
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
    # Instead, recover database.password from Authoritative Security Vault (prioritizing app_data Docker volume over host).
    log_info "Mevcut sistem yükseltmesi tespit edildi. Veritabanı parolası yetkili Vault kasasından kurtarılıyor..."
    
    local RECOVERY_SUCCESS=false
    local CANDIDATE_VAULTS=""
    if [ -n "$TEMP_APP_DATA_VAULT" ] && [ -s "$TEMP_APP_DATA_VAULT" ]; then
      CANDIDATE_VAULTS="${TEMP_APP_DATA_VAULT},${VAULT_DATA_FILE}"
    else
      CANDIDATE_VAULTS="${VAULT_DATA_FILE}"
    fi

    if command -v node >/dev/null 2>&1; then
      node -e "
        const fs = require('fs');
        const crypto = require('crypto');
        try {
          const encKeyRaw = fs.readFileSync('$ENC_KEY_FILE', 'utf8').trim();
          if (!/^[0-9a-fA-F]{64}$/.test(encKeyRaw)) {
            throw new Error('Geçersiz ENCRYPTION_KEY formatı: Root key 64 hex karakter olmalıdır.');
          }
          const rootKey = Buffer.from(encKeyRaw, 'hex');
          
          const candidates = '$CANDIDATE_VAULTS'.split(',').map(s => s.trim()).filter(Boolean);
          let decryptedPassword = '';
          let lastErr = '';

          for (const vaultPath of candidates) {
            if (!fs.existsSync(vaultPath)) continue;
            try {
              const vaultData = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
              const dbRecord = vaultData?.secrets?.['database.password'];
              if (!dbRecord || !dbRecord.encryptedValue) {
                lastErr = 'Vault içinde database.password kaydı yok (' + vaultPath + ')';
                continue;
              }

              const cipherText = dbRecord.encryptedValue;
              const parts = cipherText.split(':');
              if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') {
                lastErr = 'Bilinmeyen şifreli veri formatı (' + vaultPath + ')';
                continue;
              }

              const iv = Buffer.from(parts[2], 'hex');
              const authTag = Buffer.from(parts[3], 'hex');
              const encData = parts[4];

              const decipher = crypto.createDecipheriv('aes-256-gcm', rootKey, iv);
              decipher.setAuthTag(authTag);
              let dec = decipher.update(encData, 'hex', 'utf8');
              dec += decipher.final('utf8');

              if (dec && dec.trim().length > 0) {
                decryptedPassword = dec.trim();
                break;
              }
            } catch (err) {
              lastErr = err.message;
              continue;
            }
          }

          if (!decryptedPassword) {
            throw new Error(lastErr || 'Hiçbir Vault kaynağından parola çözülemedi.');
          }

          const tempTarget = '${PG_PASS_FILE}.tmp.' + crypto.randomBytes(4).toString('hex');
          fs.writeFileSync(tempTarget, decryptedPassword, { mode: 0o600 });
          fs.chmodSync(tempTarget, 0o600);
          fs.renameSync(tempTarget, '$PG_PASS_FILE');
          fs.chmodSync('$PG_PASS_FILE', 0o600);
          process.exit(0);
        } catch (e) {
          console.error('[HATA] ' + e.message);
          process.exit(1);
        }
      " 2>/dev/null && RECOVERY_SUCCESS=true || RECOVERY_SUCCESS=false
    fi

    # Clean up temp volume extraction file
    if [ -n "$TEMP_APP_DATA_VAULT" ] && [ -f "$TEMP_APP_DATA_VAULT" ]; then
      rm -f "$TEMP_APP_DATA_VAULT"
    fi

    if [ "$RECOVERY_SUCCESS" = true ] && [ -s "$PG_PASS_FILE" ]; then
      chmod 600 "$PG_PASS_FILE"
      log_success "Veritabanı bootstrap parolası Vault kasasından başarıyla kurtarıldı (${PG_PASS_FILE})."
    else
      echo "" >&2
      echo "==========================================================================================" >&2
      echo "❌ [KRİTİK GÜVENLİK HATASI] Mevcut Veritabanı Kurulumu Tespit Edildi Fakat Parola Kurtarılamadı!" >&2
      echo "------------------------------------------------------------------------------------------" >&2
      echo "Mevcut TimescaleDB volume veya kurulumu mevcut ancak '${PG_PASS_FILE}' bulunamadı." >&2
      echo "Veri kaybını ve yetkisiz erişim hatalarını önlemek için otomatik yeni parola üretilmedi (fail-closed)." >&2
      echo "Vault içindeki 'database.password' anahtarı kurtarılamadı." >&2
      echo "Lütfen geçerli '${ENC_KEY_FILE}' ve Vault kasasını sağlayın veya '${PG_PASS_FILE}' dosyasını manuel yerleştirin." >&2
      echo "==========================================================================================" >&2
      exit 1
    fi
  else
    # FRESH INSTALLATION: Generate secure random password
    # Clean up temp volume extraction file if any
    if [ -n "$TEMP_APP_DATA_VAULT" ] && [ -f "$TEMP_APP_DATA_VAULT" ]; then
      rm -f "$TEMP_APP_DATA_VAULT"
    fi

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
    if [ "$IS_EXISTING" = false ] && [ -s "$VAULT_DATA_FILE" ] && command -v docker >/dev/null 2>&1; then
      local APP_DATA_VOL
      APP_DATA_VOL=$(docker volume ls -q 2>/dev/null | grep -E '(^|_)app_data$' | head -n1 || true)
      if [ -n "$APP_DATA_VOL" ]; then
        docker run --rm -v "${APP_DATA_VOL}:/vdata" -v "$(pwd)/data:/hostdata:ro" alpine:latest sh -c "if [ ! -s /vdata/.system_secrets.json ]; then cp /hostdata/.system_secrets.json /vdata/.system_secrets.json; chmod 600 /vdata/.system_secrets.json; fi" 2>/dev/null || true
      fi
    fi
  fi
}

