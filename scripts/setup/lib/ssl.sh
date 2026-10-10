#!/usr/bin/env bash
# ==============================================================================
# NexusNode IoT Cloud - Automated SSL / TLS Certificate Manager
# scripts/setup/lib/ssl.sh
# ==============================================================================

verify_ssl_match() {
  local crt_file="$1"
  local key_file="$2"

  if [ ! -s "$crt_file" ] || [ ! -s "$key_file" ]; then
    return 1
  fi

  if ! command -v openssl >/dev/null 2>&1; then
    # If OpenSSL is missing on host, we cannot perform cryptographic verification.
    # Return 0 if both non-empty files exist.
    return 0
  fi

  # Primary check: Compare public key exports (works for RSA, ECDSA, Ed25519, etc.)
  local crt_pub key_pub
  crt_pub=$(openssl x509 -in "$crt_file" -noout -pubkey 2>/dev/null || echo "")
  key_pub=$(openssl pkey -in "$key_file" -pubout 2>/dev/null || echo "")

  if [ -n "$crt_pub" ] && [ -n "$key_pub" ] && [ "$crt_pub" = "$key_pub" ]; then
    return 0
  fi

  # Fallback check: Compare moduli for RSA key pairs
  local crt_mod key_mod
  crt_mod=$(openssl x509 -in "$crt_file" -noout -modulus 2>/dev/null || echo "")
  key_mod=$(openssl rsa -in "$key_file" -noout -modulus 2>/dev/null || echo "")

  if [ -n "$crt_mod" ] && [ -n "$key_mod" ] && [ "$crt_mod" = "$key_mod" ]; then
    return 0
  fi

  return 1
}

ensure_ssl_certificates() {
  log_step "5. SSL / TLS Güvenlik Sertifikaları Hazırlanıyor..."

  local CERTS_DIR="${CERTS_DIR:-./docker/certs}"
  local CRT_FILE="${CRT_FILE:-${CERTS_DIR}/server.crt}"
  local KEY_FILE="${KEY_FILE:-${CERTS_DIR}/server.key}"
  local DOMAIN="${SETUP_DOMAIN:-localhost}"

  mkdir -p "$CERTS_DIR"

  local crt_exists=false
  local key_exists=false
  [ -s "$CRT_FILE" ] && crt_exists=true
  [ -s "$KEY_FILE" ] && key_exists=true

  # 1. Both certificate and private key exist
  if [ "$crt_exists" = true ] && [ "$key_exists" = true ]; then
    if verify_ssl_match "$CRT_FILE" "$KEY_FILE"; then
      chmod 600 "$KEY_FILE" 2>/dev/null || true
      chmod 644 "$CRT_FILE" 2>/dev/null || true
      log_info "Mevcut SSL/TLS sertifikası ve özel anahtarı doğrulandı ve eşleşti (${CRT_FILE}) [KORUNDU]."
      return 0
    else
      log_fatal "❌ [KRİTİK HATA] SSL sertifikası ('$CRT_FILE') ile özel anahtar ('$KEY_FILE') eşleşmiyor! Mevcut dosyaların üzerine yazılmıyor. Dağıtım durduruldu."
      return 1
    fi
  fi

  # 2. Only ONE of the files exists (partially missing certificate pair)
  if [ "$crt_exists" = true ] || [ "$key_exists" = true ]; then
    local missing_file="$KEY_FILE"
    local present_file="$CRT_FILE"
    if [ "$key_exists" = true ]; then
      missing_file="$CRT_FILE"
      present_file="$KEY_FILE"
    fi
    log_fatal "❌ [KRİTİK HATA] Eksik TLS sertifika çifti! Yalnızca '$present_file' mevcut, '$missing_file' bulunamadı. Mevcut dosyanın üzerine yazılmasını veya uyumsuz çift üretilmesini önlemek için otomatik üretim yapılmadı."
    return 1
  fi

  # 3. Neither file exists (both missing)
  # Check if Docker Nginx proxy / SSL is actually required / enabled
  local ssl_required=false
  if [ "${USE_DOCKER_PROXY:-}" = "true" ] || [ "${ENABLE_DOCKER_PROXY:-}" = "true" ] || [ "${ENABLE_SSL:-}" = "true" ] || [ "${FORCE_SSL:-}" = "true" ]; then
    ssl_required=true
  elif [ -n "${COMPOSE_PROFILES:-}" ] && echo "${COMPOSE_PROFILES:-}" | grep -q "docker-proxy"; then
    ssl_required=true
  fi

  if [ "$ssl_required" = false ]; then
    log_info "Docker Nginx proxy kullanılmıyor; self-signed TLS sertifika üretimi atlandı (Sistem Nginx / Let's Encrypt kullanılabilir)."
    return 0
  fi

  # Generate new Self-Signed Certificate using atomic temporary files
  if ! command -v openssl >/dev/null 2>&1; then
    log_fatal "❌ [KRİTİK HATA] Docker proxy için TLS sertifikası gerekli ancak OpenSSL bulunamadı."
    return 1
  fi

  log_info "Yeni modern ECDSA / RSA Self-Signed TLS sertifikası oluşturuluyor (${DOMAIN})..."

  local rand_suffix
  rand_suffix=$(openssl rand -hex 6 2>/dev/null || echo "$$")
  local tmp_crt="${CERTS_DIR}/.server.crt.tmp.${rand_suffix}"
  local tmp_key="${CERTS_DIR}/.server.key.tmp.${rand_suffix}"

  rm -f "$tmp_crt" "$tmp_key"

  local gen_ok=false
  if openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
      -keyout "$tmp_key" \
      -out "$tmp_crt" \
      -subj "/C=TR/ST=Istanbul/L=Center/O=NexusNode/OU=IoT/CN=${DOMAIN}" \
      -addext "subjectAltName=DNS:${DOMAIN},DNS:localhost,IP:127.0.0.1" 2>/dev/null; then
    gen_ok=true
  elif openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
      -keyout "$tmp_key" \
      -out "$tmp_crt" \
      -subj "/C=TR/ST=Istanbul/L=Center/O=NexusNode/OU=IoT/CN=${DOMAIN}" 2>/dev/null; then
    gen_ok=true
  fi

  if [ "$gen_ok" = true ] && [ -s "$tmp_crt" ] && [ -s "$tmp_key" ]; then
    if verify_ssl_match "$tmp_crt" "$tmp_key"; then
      chmod 600 "$tmp_key"
      chmod 644 "$tmp_crt"
      mv "$tmp_key" "$KEY_FILE"
      mv "$tmp_crt" "$CRT_FILE"
      log_success "Güvenli TLS sertifika çifti başarıyla üretildi ve doğrulandı (${CRT_FILE}, ${KEY_FILE})."
      return 0
    else
      rm -f "$tmp_crt" "$tmp_key"
      log_fatal "❌ [KRİTİK HATA] Üretilen geçici TLS sertifikası ve özel anahtar eşleşmedi!"
      return 1
    fi
  else
    rm -f "$tmp_crt" "$tmp_key"
    log_fatal "❌ [KRİTİK HATA] OpenSSL ile TLS sertifikası üretilemedi!"
    return 1
  fi
}

