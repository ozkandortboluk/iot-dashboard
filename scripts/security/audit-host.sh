#!/usr/bin/env bash
# Read-only host and Docker security assessment. Does not modify firewall or services.
set -euo pipefail
export LC_ALL=C
echo "NexusNode security preflight — $(date -u +%FT%TZ)"
echo "WARNING: Do not publish raw output without reviewing addresses, usernames and process arguments."
echo "== Host =="
uname -srm
if command -v systemctl >/dev/null; then
  for svc in ssh sshd nginx fail2ban; do
    systemctl is-active "$svc" 2>/dev/null || true
  done
fi
echo "== Listeners =="
ss -lnt 2>/dev/null || true
echo "== Firewall =="
if command -v ufw >/dev/null; then ufw status verbose || true; fi
if command -v nft >/dev/null; then
  echo "nftables available; review rules manually (not printed to avoid sensitive data)"
fi
echo "== Docker services =="
if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
  echo "== Container isolation flags =="
  ids=$(docker ps -q)
  if [ -n "$ids" ]; then
    # No secrets or environment values printed.
    docker inspect --format '{{.Name}} user={{.Config.User}} privileged={{.HostConfig.Privileged}} network={{.HostConfig.NetworkMode}} readonly={{.HostConfig.ReadonlyRootfs}} cap_add={{json .HostConfig.CapAdd}} security_opt={{json .HostConfig.SecurityOpt}}' $ids
  fi
else
  echo "Docker unavailable or permission denied"
fi
echo "== Outbound policy =="
echo "Review host OUTPUT and Docker FORWARD/DOCKER-USER/nftables chains; UFW alone may not cover Docker forwarding."
echo "No changes applied."
