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

# Execute only the isolated apply block with mocked system commands.
# The full script is never executed with --apply on the host.
python3 - "$PWD/scripts/security/setup-host-security.sh" <<'PY'
import pathlib, subprocess, sys, tempfile
source = pathlib.Path(sys.argv[1]).read_text()
marker = 'if [ "$MODE" = "--apply" ]; then'
assert source.count(marker) == 2, "apply block structure changed; review test extraction"
apply_block = source[source.rfind(marker):]
with tempfile.TemporaryDirectory() as temp:
    events = pathlib.Path(temp) / "events"
    harness = """set -euo pipefail
MODE=--apply
SSH_PORTS=2222
EVENTS="$1"
ufw() {
  printf 'ufw %s\\n' "$*" >> "$EVENTS"
  if [ "${1:-}" = status ]; then echo 'Status: active'; fi
}
systemctl() { printf 'systemctl %s\\n' "$*" >> "$EVENTS"; }
fail2ban-client() {
  printf 'fail2ban-client %s\\n' "$*" >> "$EVENTS"
  return 0
}
""" + apply_block
    result = subprocess.run(["bash", "-c", harness, "mock-test", str(events)], capture_output=True, text=True)
    if result.returncode:
        print(result.stdout, result.stderr, file=sys.stderr)
        sys.exit(result.returncode)
    lines = events.read_text().splitlines()
    assert "ufw allow 2222/tcp" in lines, lines
    assert "ufw allow 80/tcp" in lines, lines
    assert "ufw allow 443/tcp" in lines, lines
    assert lines.index("ufw allow 2222/tcp") < lines.index("ufw allow 80/tcp") < lines.index("ufw allow 443/tcp"), lines
    assert not any(x in lines for x in ("ufw enable", "ufw --force enable", "ufw reset")), lines
    assert "fail2ban-client status sshd" in lines, lines
    print("HOST_SECURITY_MOCK_TEST_OK")
PY
