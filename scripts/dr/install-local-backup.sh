#!/usr/bin/env bash
# Called from install.sh only after Docker app and DB healthchecks have passed.
# Idempotent. Never alters previous backups or Docker state.
set -Eeuo pipefail
umask 077
die(){ printf 'LOCAL DR SETUP FAILED: %s\n' "$*" >&2; exit 1; }
[[ "${EUID:-$(id -u)}" -eq 0 ]] || die 'run as root'
for tool in systemctl systemd-analyze install stat docker; do
  command -v "$tool" >/dev/null || die "missing $tool"
done
[[ -d /run/systemd/system ]] || die 'systemd is not running'
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
[[ -f "$ROOT/docker-compose.yml" && -f "$ROOT/scripts/dr/local-backup.sh" ]] || die 'project backup sources missing'
[[ ! -L "$ROOT/scripts/dr/local-backup.sh" ]] || die 'backup source is a symlink'
[[ ! -L "$ROOT/scripts/dr/systemd/nexusnode-local-backup.service" && ! -L "$ROOT/scripts/dr/systemd/nexusnode-local-backup.timer" ]] || die 'systemd source is a symlink'

# Guard the existing user's configured service from silently being overwritten.
for unit in nexusnode-local-backup.service nexusnode-local-backup.timer; do
  target="/etc/systemd/system/$unit"
  if [[ -e "$target" || -L "$target" ]]; then
    [[ -f "$target" && ! -L "$target" && "$(stat -c %u "$target")" = 0 ]] || die "$target is not a safe root-owned regular file"
  fi
done
[[ ! -L /usr/local/sbin/nexusnode-local-backup ]] || die 'backup executable is a symlink'
install -d -o root -g root -m 700 /etc/nexusnode
[[ ! -L /etc/nexusnode && "$(stat -c %u /etc/nexusnode)" = 0 ]] || die 'unsafe config folder'

# Read root-only project path from an environment file, never from a user writable unit.
if [[ -e /etc/nexusnode/local-backup.env ]]; then
  [[ -f /etc/nexusnode/local-backup.env && ! -L /etc/nexusnode/local-backup.env &&
    "$(stat -c %u /etc/nexusnode/local-backup.env)" = 0 ]] || die 'unsafe environment file'
fi
printf 'NEXUS_DR_PROJECT_ROOT=%s\n' "$ROOT" > /etc/nexusnode/local-backup.env
chmod 600 /etc/nexusnode/local-backup.env

install -o root -g root -m 700 "$ROOT/scripts/dr/local-backup.sh" /usr/local/sbin/nexusnode-local-backup
install -o root -g root -m 644 "$ROOT/scripts/dr/systemd/nexusnode-local-backup.service" /etc/systemd/system/nexusnode-local-backup.service
install -o root -g root -m 644 "$ROOT/scripts/dr/systemd/nexusnode-local-backup.timer" /etc/systemd/system/nexusnode-local-backup.timer

systemd-analyze verify /etc/systemd/system/nexusnode-local-backup.service /etc/systemd/system/nexusnode-local-backup.timer || die 'invalid systemd units'
systemctl daemon-reload

# Require a successful *first* local backup before marking backup scheduling healthy.
# An already active timer was previously installed/validated: do not make another
# unnecessary archive during routine installer reruns.
if ! systemctl is-active --quiet nexusnode-local-backup.timer; then
  echo '[NexusNode DR] İlk kurtarma yedeği oluşturuluyor...'
  /usr/local/sbin/nexusnode-local-backup || die 'initial local backup failed; timer not enabled'
fi
systemctl enable --now nexusnode-local-backup.timer || die 'timer enable failed'
systemctl is-enabled --quiet nexusnode-local-backup.timer || die 'timer not enabled'
systemctl is-active --quiet nexusnode-local-backup.timer || die 'timer not active'
echo '[NexusNode DR] Local daily backup timer active. Backups under /var/backups/nexusnode/gunluk; never automatically pruned.'
