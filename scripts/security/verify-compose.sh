#!/usr/bin/env bash
# Non-destructive Compose validation. Does not start containers.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v docker >/dev/null || { echo "Docker CLI is required" >&2; exit 1; }
docker compose version >/dev/null || { echo "Docker Compose plugin is required" >&2; exit 1; }
echo "Checking base and opt-in hardening configuration..."
# Secrets are file-backed; files must exist to validate on a prepared host.
docker compose -f docker-compose.yml -f docker-compose.hardened.yml config --quiet
echo "Compose syntax valid. This does NOT prove runtime compatibility or security."
