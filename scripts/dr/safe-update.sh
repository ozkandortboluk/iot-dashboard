#!/usr/bin/env bash
# Fail-closed production update: backup offsite before altering the running app.
set -Eeuo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
cd "$ROOT"
git diff --quiet && git diff --cached --quiet || { echo 'Tracked changes require review' >&2; exit 1; }
"$ROOT/scripts/dr/nexus-dr.sh" backup
"$ROOT/scripts/dr/prepare-persistence.sh"
git pull --ff-only
docker compose config >/dev/null
docker compose up -d --build
curl --fail --silent --show-error --max-time 12 http://127.0.0.1:3000/api/health/ready >/dev/null || { echo 'Readiness failed; manual investigation required' >&2; exit 1; }
echo 'Update complete following offsite verified encrypted backup.'
