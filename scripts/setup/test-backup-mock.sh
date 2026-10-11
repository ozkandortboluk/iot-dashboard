#!/usr/bin/env bash
# Isolated backup regression tests. Never invokes the real Docker daemon.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
source "$ROOT/scripts/setup/lib/backup.sh"
log_step() { :; }
log_info() { :; }
log_warn() { :; }
log_error() { :; }
log_success() { :; }

docker() {
  case "${1:-} ${2:-}" in
    "inspect nexus_timescaledb"|"inspect nexus_app") return 0 ;;
    "exec nexus_timescaledb")
      if [ "$SCENARIO" = dump_failure ]; then return 1; fi
      printf '%s\n' '-- mock SQL dump' 'CREATE TABLE sample(id int);'
      ;;
    "cp nexus_app:/app/data/.")
      if [ "$SCENARIO" = copy_failure ]; then return 1; fi
      mkdir -p "$3"
      printf 'encrypted test data\n' > "$3/.system_secrets.json"
      ;;
    *) echo "Unexpected Docker call: $*" >&2; return 1 ;;
  esac
}

for SCENARIO in dump_failure copy_failure success; do
  TEST_DIR=$(mktemp -d)
  (
    cd "$TEST_DIR"
    if [ "$SCENARIO" = success ]; then
      perform_backup
      mapfile -t archives < <(find backups -maxdepth 1 -name '*.tar.gz')
      [ "${#archives[@]}" -eq 1 ]
      tar -tzf "${archives[0]}" | grep -qx 'db_dump.sql'
      tar -tzf "${archives[0]}" | grep -qx 'app_data/.system_secrets.json'
      [ "$(stat -c '%a' "${archives[0]}")" = 600 ]
    else
      if perform_backup; then
        echo "FAIL: $SCENARIO unexpectedly succeeded" >&2
        exit 1
      fi
      [ -z "$(find backups -maxdepth 1 -name '*.tar.gz' -print -quit)" ]
      [ -z "$(find backups -maxdepth 1 -name '*.part' -print -quit)" ]
    fi
  )
  rm -rf "$TEST_DIR"
  echo "PASS: $SCENARIO"
done
echo "BACKUP_MOCK_TEST_OK"
