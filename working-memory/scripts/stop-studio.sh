#!/usr/bin/env bash
set -euo pipefail

PORT="${WORKING_MEMORY_STUDIO_PORT:-3020}"
if [ -n "${XDG_RUNTIME_DIR:-}" ]; then
  DEFAULT_RUNTIME_BASE="$XDG_RUNTIME_DIR/working-memory-studio"
else
  DEFAULT_RUNTIME_BASE="${TMPDIR:-/tmp}/working-memory-studio-${UID:-user}"
fi
RUNTIME_DIR="${WORKING_MEMORY_STUDIO_RUNTIME_DIR:-$DEFAULT_RUNTIME_BASE}"
PID_FILE="${RUNTIME_DIR}/studio-${PORT}.pid"

if [ ! -s "$PID_FILE" ]; then
  echo "No PID-managed working-memory studio found for port ${PORT}."
  exit 0
fi

PID="$(cat "$PID_FILE")"

if ! kill -0 "$PID" >/dev/null 2>&1; then
  rm -f "$PID_FILE"
  echo "Removed stale working-memory studio PID file: $PID_FILE"
  exit 0
fi

kill "$PID"

for _ in {1..20}; do
  if ! kill -0 "$PID" >/dev/null 2>&1; then
    rm -f "$PID_FILE"
    echo "Stopped working-memory studio on port ${PORT}."
    exit 0
  fi
  sleep 0.5
done

kill -9 "$PID" >/dev/null 2>&1 || true
rm -f "$PID_FILE"
echo "Force-stopped working-memory studio on port ${PORT}."
