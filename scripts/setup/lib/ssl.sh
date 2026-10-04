#!/usr/bin/env bash
# ==============================================================================
# NexusNode IoT Cloud - Automated SSL / TLS Certificate Manager
# scripts/setup/lib/ssl.sh
# ==============================================================================

ensure_ssl_certificates() {
  log_step "5. SSL / TLS Güvenlik Sertifikaları Hazırlanıyor..."

  local CERTS_DIR="./docker/certs"
  local CRT_FILE="${CERTS_DIR}/server.crt"
  local KEY_FILE="${CERTS_DIR}/server.key"
  local DOMAIN="${SETUP_DOMAIN:-localhost}"

  mkdir -p "$CERTS_DIR"

  # Check if valid certificates already exist
  if [ -s "$CRT_FILE" ] && [ -s "$KEY_FILE" ]; then
    log_info "Mevcut SSL sertifikaları tespit edildi (${CRT_FILE}) [KORUNDU]."
    return 0
  fi

  # Generate Self-Signed Certificate with SAN (Subject Alternative Name)
  log_info "Yeni modern ECDSA / RSA Self-Signed TLS sertifikası oluşturuluyor (${DOMAIN})..."

  if command -v openssl >/dev/null 2>&1; then
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
      -keyout "$KEY_FILE" \
      -out "$CRT_FILE" \
      -subj "/C=TR/ST=Istanbul/L=Center/O=NexusNode/OU=IoT/CN=${DOMAIN}" \
      -addext "subjectAltName=DNS:${DOMAIN},DNS:localhost,IP:127.0.0.1" 2>/dev/null || \
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
      -keyout "$KEY_FILE" \
      -out "$CRT_FILE" \
      -subj "/C=TR/ST=Istanbul/L=Center/O=NexusNode/OU=IoT/CN=${DOMAIN}" 2>/dev/null

    chmod 600 "$KEY_FILE"
    chmod 644 "$CRT_FILE"
    log_success "Güvenli TLS sertifikaları başarıyla üretildi (${CRT_FILE}, ${KEY_FILE})."
  else
    log_warn "OpenSSL bulunamadığı için SSL sertifikası üretilemedi. HTTP modunda çalışılacak."
  fi
}
