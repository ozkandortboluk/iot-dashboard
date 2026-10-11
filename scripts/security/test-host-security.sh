#!/usr/bin/env bash
# Static safety regression checks. Never runs --apply or modifies host security.
set -euo pipefail
cd "$(dirname "$0")/../.."
script=scripts/security/setup-host-security.sh
bash -n "$script"
python3 - "$script" <<'PY'
import pathlib, sys
s = pathlib.Path(sys.argv[1]).read_text()
checks = {
    "explicit root check": 'if [ "${EUID}" -ne 0 ]' in s,
    "explicit console confirmation": 'I_HAVE_CONSOLE_ACCESS' in s,
    "ssh rules before web rules": 'ufw allow "$port/tcp"' in s and s.index('ufw allow "$port/tcp"') < s.index('ufw allow 80/tcp') < s.index('ufw allow 443/tcp'),
    "no automatic ufw enable": not any(line.strip().startswith(('ufw enable', 'yes | ufw enable', 'ufw --force enable')) for line in s.splitlines()),
    "no firewall reset": not any(line.strip().startswith('ufw reset') for line in s.splitlines()),
    "sshd jail verified": 'fail2ban-client status sshd' in s,
    "fail2ban config validated": 'fail2ban-client -t' in s,
}
for label, passed in checks.items():
    print(("PASS" if passed else "FAIL") + ": " + label)
if not all(checks.values()):
    sys.exit(1)
PY
echo "HOST_SECURITY_STATIC_TEST_OK"
