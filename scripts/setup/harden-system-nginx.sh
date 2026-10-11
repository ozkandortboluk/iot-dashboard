#!/usr/bin/env bash
# Apply host Nginx hardening only to an existing NexusNode site configuration.
# No changes to Docker proxy, TLS certificates, or other virtual hosts.
set -euo pipefail

SITE="/etc/nginx/sites-available/iot-dashboard"
if [ ! -f "$SITE" ]; then
  echo "[Nginx] Sistem Nginx site dosyasi yok; atlandi."
  exit 0
fi
if ! command -v nginx >/dev/null 2>&1 || ! command -v python3 >/dev/null 2>&1; then
  echo "[Nginx] nginx veya python3 bulunamadi; atlandi."
  exit 0
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "[Nginx] Sistem Nginx guvenlik kurulumu icin root gerekli." >&2
  exit 1
fi

backup=""
rollback() {
  if [ -n "$backup" ] && [ -f "$backup" ]; then
    cp -p "$backup" "$SITE"
    nginx -t >/dev/null 2>&1 && (systemctl reload nginx || true)
  fi
}
trap rollback ERR

backup=$(python3 - "$SITE" <<'PY'
import sys
import shutil
from datetime import datetime
from pathlib import Path
p = Path(sys.argv[1])
s = p.read_text()
tag = '    # NexusNode application'
signature = '    # NexusNode host Nginx sensitive-path protection'
legacy_signature = '    # Block sensitive files before proxying to the application.'
rules = r'''    # NexusNode host Nginx sensitive-path protection
    location ~ (^|/)\.(?!well-known(?:/|$)) {
        return 404;
    }

    location ~* ^/(?:wp-config\.php|composer\.(?:json|lock)|package(?:-lock)?\.json|docker-compose\.ya?ml)$ {
        return 404;
    }

'''
if signature in s or legacy_signature in s:
    print('')
elif s.count(tag) != 1:
    raise SystemExit('NexusNode HTTPS location bulunamadi veya belirsiz; degisiklik yok.')
else:
    backup = p.with_name(p.name + '.bak-' + datetime.now().strftime('%Y%m%d-%H%M%S%f'))
    shutil.copy2(p, backup)
    p.write_text(s.replace(tag, rules + tag, 1))
    print(backup)
PY
)
if [ -z "$backup" ]; then
  echo "[Nginx] Koruma zaten mevcut."
  exit 0
fi
nginx -t
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet nginx; then
  systemctl reload nginx
fi
trap - ERR
echo "[Nginx] Hassas dosya korumasi uygulandi. Yedek: $backup"
