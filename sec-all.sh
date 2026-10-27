#!/usr/bin/env bash
# Concise read-only audit; --verbose preserves the full SEC-01..SEC-09 checks.
set -u
export LC_ALL=C
if [ "$#" -gt 1 ]; then echo 'Usage: sec-all.sh [--verbose|--self-test]' >&2; exit 2; fi
if [ "$#" -eq 1 ] && [ "$1" = '--self-test' ]; then
  # Local smoke tests for summary parser; does not touch Docker or network.
  sample=$(printf '[PASS] HTTP 404 /xmlrpc.php\n[PASS] HTTP 404 //xmlrpc.php?rsd\n')
  [ "$(grep -c '^\[PASS\] HTTP 404 ' <<< "$sample")" -eq 2 ] &&
  ! grep -Eq '^\[(WARN|ALERT)\]' <<< "$sample" &&
  printf 'PASS: summary parser smoke tests\n'
  exit $?
fi
if [ "$#" -eq 0 ]; then
  # Keep verbose output in memory only; no log file or secrets written to disk.
  details=$(bash "$0" --verbose 2>&1)
  rc=$?
  pass=0; warn=0; fail=0
  result() {
    printf '%-7s %-5s %-27s %s\n' "$1" "$2" "$3" "$4"
    case "$2" in PASS) pass=$((pass+1));; WARN) warn=$((warn+1));; FAIL) fail=$((fail+1));; esac
  }
  section_ok() { grep -Fq "========== $1 " <<< "$details"; }
  printf 'NexusNode | Security audit (read-only)\n'
  printf '%-7s %-5s %-27s %s\n' 'SECTION' 'STATE' 'CHECK' 'RESULT'
  if ! section_ok SEC-01; then
    result SEC-01 WARN 'Firewall / SSH' 'Audit incomplete'
  elif ! command -v ufw >/dev/null || ! ufw status 2>/dev/null | grep -q '^Status: active'; then
    result SEC-01 FAIL 'Firewall / SSH' 'UFW inactive or unavailable'
  elif ! fail2ban-client status 2>/dev/null | grep -q sshd; then
    result SEC-01 WARN 'Firewall / SSH' 'SSH jail not confirmed'
  else
    result SEC-01 PASS 'Firewall / SSH' 'UFW active; SSH jail detected'
  fi
  if ! section_ok SEC-02 || ! iptables -S DOCKER-USER >/dev/null 2>&1; then
    result SEC-02 WARN 'Firewall / NAT' 'Rules unavailable'
  else
    result SEC-02 WARN 'Firewall / NAT' 'Docker rules require manual review'
  fi
  if section_ok SEC-03 && docker version --format '{{.Server.Version}}' >/dev/null 2>&1; then
    result SEC-03 PASS 'Docker engine' 'Running; version collected'
  else
    result SEC-03 WARN 'Docker engine' 'Version not confirmed'
  fi
  if section_ok SEC-04 && apt-cache policy docker.io 2>/dev/null | grep -q 'Installed:'; then
    result SEC-04 PASS 'Docker security packages' 'APT metadata available (not CVE scan)'
  else
    result SEC-04 WARN 'Docker security packages' 'Package metadata unavailable'
  fi
  if section_ok SEC-05 && docker network inspect bridge >/dev/null 2>&1; then
    result SEC-05 PASS 'Docker network' 'Bridge inspected'
  else
    result SEC-05 WARN 'Docker network' 'Bridge not inspected'
  fi
  if ! section_ok SEC-06 || [ "$(cat /proc/sys/net/ipv4/conf/all/route_localnet 2>/dev/null)" != 0 ]; then
    result SEC-06 WARN 'Kernel network settings' 'route_localnet not confirmed safe'
  else
    result SEC-06 PASS 'Kernel network settings' 'Global route_localnet=0'
  fi
  ports=$(docker compose ps --format '{{.Service}} {{.Ports}}' 2>/dev/null) || ports=''
  if ! section_ok SEC-07 || [ -z "$ports" ]; then
    result SEC-07 WARN 'Published ports' 'Bindings not confirmed'
  elif printf '%s\n' "$ports" | grep -Eq '0[.]0[.]0[.]0:(3000|5432|8080)|\[::\]:(3000|5432|8080)'; then
    result SEC-07 FAIL 'Published ports' 'Sensitive service exposed on all interfaces'
  elif printf '%s\n' "$ports" | grep -q '127.0.0.1:3000' &&
       printf '%s\n' "$ports" | grep -q '127.0.0.1:5432' &&
       printf '%s\n' "$ports" | grep -q '127.0.0.1:8080'; then
    result SEC-07 PASS 'Published ports' 'App / DB / Adminer loopback-only'
  else
    result SEC-07 WARN 'Published ports' 'Unexpected or missing bindings'
  fi
  sec08=$(sed -n '/========== SEC-08 /,/========== SEC-09 /p' <<< "$details")
  if ! section_ok SEC-08; then
    result SEC-08 WARN 'SPA security probes' 'Audit incomplete'
  elif grep -q '^\[ALERT\]' <<< "$sec08"; then
    result SEC-08 FAIL 'SPA security probes' 'Unexpected response; see --verbose'
  elif grep -q '^\[WARN\]' <<< "$sec08"; then
    result SEC-08 WARN 'SPA security probes' 'Some probes unavailable'
  else
    n=$(grep -c '^\[PASS\] HTTP 404 ' <<< "$sec08" || true)
    if [ "$n" -eq 7 ]; then
      result SEC-08 PASS 'SPA security probes' '7/7 returned HTTP 404'
    else
      result SEC-08 WARN 'SPA security probes' "$n/7 confirmed"
    fi
  fi
  updates=$(apt list --upgradable 2>/dev/null | grep -c 'upgradable from:' || true)
  if ! section_ok SEC-09; then
    result SEC-09 WARN 'Security updates' 'Audit incomplete'
  elif [ "$updates" -gt 0 ]; then
    result SEC-09 WARN 'Security updates' "$updates update(s) in cached APT lists"
  else
    result SEC-09 PASS 'Security updates' 'No pending updates in cached lists'
  fi
  for id in SEC-10 SEC-11 SEC-12; do
    line=$(grep -E "^\\[(PASS|WARN|FAIL)\\] $id " <<< "$details" | tail -1)
    if [ -z "$line" ]; then result "$id" WARN 'Additional security check' 'Result unavailable'; continue; fi
    state=$(printf '%s\n' "$line" | cut -d']' -f1 | tr -d '[')
    note=$(printf '%s\n' "$line" | cut -d' ' -f3-)
    case "$id" in
      SEC-10) label='Nginx / TLS certificate';;
      SEC-11) label='Secret file permissions';;
      SEC-12) label='App / DB readiness';;
    esac
    result "$id" "$state" "$label" "$note"
  done
  printf '\nSummary: %d PASS | %d WARN | %d FAIL\n' "$pass" "$warn" "$fail"
  printf 'Details: sudo bash sec-all.sh --verbose\n'
  if [ "$rc" -ne 0 ]; then echo 'WARN: detailed audit exited abnormally'; exit 2; fi
  if [ "$fail" -gt 0 ]; then exit 1; fi
  if [ "$warn" -gt 0 ]; then exit 2; fi
  exit 0
fi
if [ "$1" != '--verbose' ]; then echo 'Unknown option' >&2; exit 2; fi
# Original detailed diagnostics below. All checks remain read-only.
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
section 'SEC-10 Nginx configuration and TLS certificate'
if ! nginx -t >/dev/null 2>&1; then
  echo '[WARN] SEC-10 Nginx configuration check unavailable or failed'
else
  cert=''
  for candidate in /etc/letsencrypt/live/nexusnodeiot.com.tr/fullchain.pem /etc/letsencrypt/live/www.nexusnodeiot.com.tr/fullchain.pem docker/certs/server.crt; do
    if [ -r "$candidate" ]; then cert="$candidate"; break; fi
  done
  if [ -z "$cert" ]; then
    echo '[WARN] SEC-10 Certificate path not found'
  elif ! openssl x509 -in "$cert" -noout -checkend 0 >/dev/null 2>&1; then
    echo '[FAIL] SEC-10 Certificate expired or unreadable'
  elif ! openssl x509 -in "$cert" -noout -checkend 2592000 >/dev/null 2>&1; then
    echo '[WARN] SEC-10 Certificate expires within 30 days'
  else
    echo '[PASS] SEC-10 Nginx valid; certificate valid for 30+ days'
  fi
fi
section 'SEC-11 Secret permissions (no secret contents read)'
checked=0; insecure=0
for f in secrets/encryption_key secrets/postgres_password; do
  if [ -f "$f" ]; then
    checked=$((checked+1))
    mode=$(stat -c '%a' "$f" 2>/dev/null) || mode=''
    if [ -z "$mode" ]; then insecure=2; break; fi
    if [ $((8#$mode & 077)) -ne 0 ]; then insecure=1; fi
  fi
done
if [ "$insecure" -eq 1 ]; then
  echo '[FAIL] SEC-11 Secret files readable by group or others'
elif [ "$insecure" -eq 2 ] || [ "$checked" -ne 2 ]; then
  echo '[WARN] SEC-11 Secret file or permission unavailable'
else
  echo '[PASS] SEC-11 Both secret files have owner-only permissions'
fi
section 'SEC-12 Application / database readiness'
ready=$(curl --noproxy '*' --silent --max-time 5 http://127.0.0.1:3000/api/health/ready 2>/dev/null) || ready=''
if [ -z "$ready" ]; then
  echo '[FAIL] SEC-12 Readiness endpoint unreachable'
elif printf '%s' "$ready" | grep -Eq '"ready"[[:space:]]*:[[:space:]]*true' &&
     printf '%s' "$ready" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"connected"'; then
  echo '[PASS] SEC-12 Application ready; database connected'
else
  echo '[WARN] SEC-12 Readiness not confirmed'
fi
section 'DONE — READ ONLY'
