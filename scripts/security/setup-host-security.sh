#!/usr/bin/env bash
# Opt-in host-security preflight. No firewall or SSH changes are made.
set -euo pipefail
export LC_ALL=C

if [ "${1:-}" != "--check" ]; then
  echo "Usage: bash scripts/security/setup-host-security.sh --check" >&2
  echo "Read-only check; host changes require a separately reviewed procedure." >&2
  exit 2
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
