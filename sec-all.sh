#!/usr/bin/env bash
# NexusNode SEC-ALL — read-only diagnostics
set -u
export LC_ALL=C
section() { printf '\n========== %s ==========\n' "$1"; }
run() { printf '\n$'; printf ' %q' "$@"; printf '\n'; "$@" 2>&1 || echo '[WARN] Command failed or unavailable'; }
section 'SEC-01 Ports / UFW / Fail2ban'
run sudo ss -lntup
run sudo ufw status verbose
run docker compose ps
run sudo fail2ban-client status
section 'SEC-02 Firewall / NAT'
run sudo iptables -S FORWARD
run sudo iptables -S DOCKER-USER
run sudo iptables -t nat -S DOCKER
run sudo iptables -S DOCKER
run sudo ip6tables -S FORWARD
section 'SEC-03 Docker packages and settings'
run docker version --format 'Server: {{.Server.Version}}'
run dpkg-query -W -f='${Package} ${Version}\n' docker.io containerd
run apt-cache policy docker.io docker-ce
run docker info --format 'Server={{.ServerVersion}} LiveRestore={{.LiveRestoreEnabled}}'
if sudo test -f /etc/docker/daemon.json; then echo 'daemon.json exists (contents withheld: may contain sensitive settings)'; else echo 'daemon.json not found'; fi
section 'SEC-04 Security package status'
run bash -c "apt changelog docker.io 2>/dev/null | sed -n '1,35p'"
run bash -c "apt list --upgradable 2>/dev/null | grep -E 'docker|containerd|runc' || true"
section 'SEC-05 Docker network'
run docker network inspect bridge --format 'Driver={{.Driver}} Internal={{.Internal}} Options={{json .Options}}'
section 'SEC-06 Kernel network settings'
for f in /proc/sys/net/ipv4/conf/*/route_localnet; do printf '%s = ' "$f"; cat "$f"; done
printf 'ip_forward = '; cat /proc/sys/net/ipv4/ip_forward
run sudo iptables --version
section 'SEC-07 Network interfaces and published ports'
run ip -4 addr show dev ens192
run docker network ls
run docker compose ps --format 'table {{.Service}}\t{{.Ports}}'
section 'SEC-08 Nginx suspicious requests / errors'
run sudo ls -lh /var/log/nginx/
# Only paths/status are extracted; avoid collecting full request lines with cookies, tokens, or IPs.
sudo awk 'BEGIN{IGNORECASE=1} {p=$7; if(p ~ /(wp-login|xmlrpc|wp-admin|\.env|\.git|phpmyadmin|cgi-bin|actuator|vendor)/) {split($4,t,":"); count[p" status=" $9]++}} END{for(k in count) print count[k], k}' /var/log/nginx/access.log 2>/dev/null | sort -nr | head -40 || true
# Error log can contain secrets or identifiers: only count severity lines.
sudo awk '{if ($0 ~ /\[error\]/) e++; if ($0 ~ /\[crit\]/) c++; if ($0 ~ /\[alert\]/) a++} END {printf "nginx errors=%d critical=%d alerts=%d\n",e,c,a}' /var/log/nginx/error.log 2>/dev/null || true
section 'SEC-09 Security updates / patch posture (cached APT metadata)'
echo 'NOTE: Uses existing APT package lists; does NOT run apt update, upgrade, or install.'
run bash -c "apt list --upgradable 2>/dev/null | sed -n '1,100p'"
run bash -c "apt-get -s upgrade 2>/dev/null | grep -E '^(Inst|Remv|Conf) ' | head -80 || true"
echo 'Security repository configuration (source URLs only):'
run bash -c "apt-cache policy | grep -E -i 'security\.debian\.org|trixie-security' | head -30 || true"
echo 'Security-related package versions and candidates:'
for pkg in openssl openssh-server nginx docker.io containerd runc linux-image-amd64; do
  echo "--- $pkg ---"
  apt-cache policy "$pkg" 2>/dev/null | sed -n '1,7p'
done
echo 'Automatic security update service status:'
if command -v systemctl >/dev/null 2>&1; then
  systemctl is-enabled apt-daily-upgrade.timer 2>/dev/null || true
  systemctl is-active apt-daily-upgrade.timer 2>/dev/null || true
fi
echo 'NOTE: APT upgrade simulation is not a vulnerability scan; review Debian security advisories separately.'
section 'DONE — READ ONLY'
