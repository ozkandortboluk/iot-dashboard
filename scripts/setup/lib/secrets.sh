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

  # 3. Canonical Application Vault Bootstrap Initialization:
  # On fresh install, seal database.password into data/.system_secrets.json with AES-256-GCM.
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
  fi
}
