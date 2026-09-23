#!/usr/bin/env bash
# Stops the local e2e stack started by scripts/e2e/up.sh.
#   scripts/e2e/down.sh         stop the Next dev server (restart it to pick up env/config changes)
#   scripts/e2e/down.sh --all   also stop local Supabase (data is discarded)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PID_FILE="$ROOT/.e2e/next.pid"
if [ -f "$PID_FILE" ]; then
  # up.sh starts next with job control on, so its process group id is its pid.
  kill -TERM -- "-$(cat "$PID_FILE")" 2>/dev/null || true
  rm -f "$PID_FILE"
fi
if [ "${1:-}" = "--all" ]; then
  (cd "$ROOT" && npx supabase stop --no-backup)
fi
