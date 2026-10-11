#!/usr/bin/env bash
# Opt-in host-security preflight. No firewall or SSH changes are made.
set -euo pipefail
export LC_ALL=C

MODE="${1:-}"
if [ "$MODE" != "--check" ] && [ "$MODE" != "--apply" ]; then
  echo "Usage: bash scripts/security/setup-host-security.sh --check|--apply" >&2
  exit 2
fi
if [ "$MODE" = "--apply" ]; then
  if [ "${EUID}" -ne 0 ]; then echo "ERROR: --apply requires root" >&2; exit 1; fi
  if [ "${NEXUS_HOST_SECURITY_CONFIRM:-}" != "I_HAVE_CONSOLE_ACCESS" ]; then
    echo "ERROR: Set NEXUS_HOST_SECURITY_CONFIRM=I_HAVE_CONSOLE_ACCESS only after verifying provider console access" >&2
    exit 1
  fi
fi

if [ ! -r /etc/os-release ]; then
  echo "ERROR: Cannot identify host OS" >&2
  exit 1
fi
. /etc/os-release
case "${ID:-}" in
  debian|ubuntu) ;;
  *) echo "ERROR: Unsupported OS: ${ID:-unknown}" >&2; exit 1 ;;
esac

if ! command -v sshd >/dev/null 2>&1 && [ ! -x /usr/sbin/sshd ]; then
  echo "ERROR: OpenSSH server not found; cannot determine SSH port" >&2
  exit 1
fi
SSHD_BIN=$(command -v sshd || printf /usr/sbin/sshd)
if ! SSH_PORTS=$("$SSHD_BIN" -T 2>/dev/null | awk '$1=="port" {print $2}'); then
  echo "ERROR: sshd -T failed; inspect SSH configuration" >&2
  exit 1
fi
if [ -z "$SSH_PORTS" ]; then
  echo "ERROR: No SSH port discovered" >&2
  exit 1
fi
echo "SSH listening port configuration:"
printf '%s\n' "$SSH_PORTS"
echo "UFW:"
if command -v ufw >/dev/null 2>&1; then
  ufw status | head -n 3
else
  echo "not installed"
fi
echo "Fail2ban:"
if command -v systemctl >/dev/null 2>&1; then
  systemctl is-active fail2ban 2>/dev/null || true
fi
echo "No changes applied. Verify alternate SSH/console access before any firewall activation."

if [ "$MODE" = "--apply" ]; then
  if ! command -v apt-get >/dev/null 2>&1; then echo "ERROR: apt-get required" >&2; exit 1; fi
  if ! command -v ufw >/dev/null 2>&1 || ! command -v fail2ban-client >/dev/null 2>&1; then
    echo "Installing missing UFW / Fail2ban packages..."
    DEBIAN_FRONTEND=noninteractive apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y ufw fail2ban
  fi
  # Preserve any existing firewall rules and fail2ban configuration.
  for port in $SSH_PORTS; do
    case "$port" in *[!0-9]*|'') echo "ERROR: Invalid SSH port" >&2; exit 1 ;; esac
    if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then echo "ERROR: Invalid SSH port" >&2; exit 1; fi
    ufw allow "$port/tcp"
  done
  ufw allow 80/tcp
  ufw allow 443/tcp
  if ! ufw status | grep -q '^Status: active'; then
    echo "UFW is inactive. Activation requires a separate manual console-side action."
    echo "After verifying SSH rules and alternate access, run: sudo ufw enable"
  fi
  systemctl enable --now fail2ban
  echo "Host rules prepared; existing rules preserved. No automatic UFW activation."
fi
