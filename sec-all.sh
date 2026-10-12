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
# Aggregate status codes only: never print client IPs, raw URLs, queries or tokens.
# Match common scanner targets, not ordinary vendor-*.js assets.
# Nginx standard combined log format: $7=request-target, $9=HTTP status.
echo 'SEC-08 suspicious request counts (current and previous access logs):'
sudo awk '
  {
    p=$7
    sub(/[?].*$/, "", p)
    gsub(/%2[fF]/, "/", p)
    gsub(/[/]+/, "/", p)
    if (p ~ /(^|[/])(wp-login[.]php|xmlrpc[.]php|wp-admin|phpmyadmin|cgi-bin|actuator)([/]|$)/ ||
        p ~ /(^|[/])[.](env|git)([/]|[.]|$)/ ||
        p ~ /(^|[/])vendor[/]phpunit([/]|$)/) {
      count[$9]++
      total++
    }
  }
  END {
    if (!total) print "No matching suspicious requests in scanned logs"
    else for (status in count) printf "suspicious requests HTTP %s: %d\n", status, count[status]
  }
' /var/log/nginx/access.log /var/log/nginx/access.log.1 2>/dev/null || true

echo 'SEC-08 live SPA probe regression (loopback only; no external requests):'
if command -v curl >/dev/null 2>&1; then
  for probe in '/wp-login.php' '/xmlrpc.php' '//xmlrpc.php?rsd' '///wp-login.php' '/cgi-bin/test.cgi' '/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php' '/%78mlrpc.php?rsd'; do
    code=$(curl --path-as-is --noproxy '*' --max-time 5 --silent --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:3000$probe" 2>/dev/null) || code='000'
    case "$code" in
      404) printf '[PASS] HTTP %s %s\n' "$code" "$probe" ;;
      000) printf '[WARN] App unavailable %s\n' "$probe" ;;
      *) printf '[ALERT] Unexpected HTTP %s %s\n' "$code" "$probe" ;;
    esac
  done
else
  echo '[WARN] curl unavailable; skipping live probes'
fi
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
