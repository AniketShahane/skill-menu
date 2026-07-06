#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_APP_DIR="${WORKING_MEMORY_STUDIO_SOURCE_APP_DIR:-$SKILL_DIR/assets/working-memory-viewer}"

# Workspace-local defaults (WORKING_MEMORY_ENABLE_DIRECT_DEPLOY, WORKING_MEMORY_AGENT_CWD,
# WORKING_MEMORY_CLAUDE_BIN, ...). Only fills in vars the caller didn't already set, so any
# explicit override still wins. Without this, restarts triggered by a fingerprint/config
# mismatch (e.g. a `command -v claude` resolution that differs from a prior invocation) would
# silently fall back to library defaults and disable direct deploy.
STUDIO_LOCAL_DEFAULTS="${WORKING_MEMORY_STUDIO_LOCAL_DEFAULTS:-$SCRIPT_DIR/ensure-studio.local.sh}"
if [ -f "$STUDIO_LOCAL_DEFAULTS" ]; then
  # shellcheck disable=SC1090
  source "$STUDIO_LOCAL_DEFAULTS"
fi
default_install_dir() {
  local cache_home="${XDG_CACHE_HOME:-${HOME:-/tmp}/.cache}"
  printf '%s\n' "$cache_home/working-memory/studio-app"
}
APP_DIR="${WORKING_MEMORY_STUDIO_APP_DIR:-${WORKING_MEMORY_STUDIO_INSTALL_DIR:-$(default_install_dir)}}"
PORT="${WORKING_MEMORY_STUDIO_PORT:-3020}"
HOST="${WORKING_MEMORY_STUDIO_HOST:-127.0.0.1}"
if [ -n "${XDG_RUNTIME_DIR:-}" ]; then
  DEFAULT_RUNTIME_BASE="$XDG_RUNTIME_DIR/working-memory-studio"
else
  DEFAULT_RUNTIME_BASE="${TMPDIR:-/tmp}/working-memory-studio-${UID:-user}"
fi
RUNTIME_DIR="${WORKING_MEMORY_STUDIO_RUNTIME_DIR:-$DEFAULT_RUNTIME_BASE}"
PID_FILE="${RUNTIME_DIR}/studio-${PORT}.pid"
LOG_FILE="${RUNTIME_DIR}/studio-${PORT}.log"
STUDIO_URL="http://${HOST}:${PORT}/studio"
CURRENT_URL="http://${HOST}:${PORT}/api/studio/current"
HEALTH_URL="http://${HOST}:${PORT}/api/studio/health"

default_memory_dir() {
  local data_home="${XDG_DATA_HOME:-${HOME:-/tmp}/.local/share}"
  printf '%s\n' "$data_home/working-memory/Interactive Working Memory"
}

default_timezone() {
  node -e 'console.log(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")'
}

export INTERACTIVE_MEMORY_DIR="${INTERACTIVE_MEMORY_DIR:-$(default_memory_dir)}"
command -v node >/dev/null 2>&1 || {
  echo "node is required to run the working-memory Studio." >&2
  exit 1
}
export WORKING_MEMORY_TIMEZONE="${WORKING_MEMORY_TIMEZONE:-$(default_timezone)}"
export WORKING_MEMORY_STUDIO_HOST="$HOST"

resolve_claude_bin() {
  if [ -n "${WORKING_MEMORY_CLAUDE_BIN:-}" ]; then
    printf '%s\n' "$WORKING_MEMORY_CLAUDE_BIN"
    return
  fi
  command -v claude 2>/dev/null || true
}
export WORKING_MEMORY_CLAUDE_BIN="$(resolve_claude_bin)"

mkdir -p "$RUNTIME_DIR" "$INTERACTIVE_MEMORY_DIR"
chmod 700 "$RUNTIME_DIR" "$INTERACTIVE_MEMORY_DIR" 2>/dev/null || true

fail() {
  echo "$*" >&2
  exit 1
}

expected_direct_deploy() {
  case "${WORKING_MEMORY_ENABLE_DIRECT_DEPLOY:-}" in
    1|true|TRUE|True|yes|YES|Yes|on|ON|On) printf 'true\n' ;;
    *) printf 'false\n' ;;
  esac
}

studio_ready() {
  local health_payload current_payload expected_agent_cwd
  health_payload="$(curl -fsS --max-time 2 "$HEALTH_URL" 2>/dev/null)" || return 1
  expected_agent_cwd="${WORKING_MEMORY_AGENT_CWD:-${WORKING_MEMORY_ROOT_DIR:-}}"
  node - "$health_payload" "$INTERACTIVE_MEMORY_DIR" "$WORKING_MEMORY_TIMEZONE" "$(expected_direct_deploy)" "$expected_agent_cwd" "$WORKING_MEMORY_CLAUDE_BIN" <<'NODE' >/dev/null 2>&1 || return 1
const path = require("node:path");
const payload = JSON.parse(process.argv[2]);
const expectedArchive = path.resolve(process.argv[3]);
const expectedTimezone = process.argv[4];
const expectedDirectDeploy = process.argv[5] === "true";
const expectedAgentCwd = process.argv[6] ? path.resolve(process.argv[6]) : "";
const expectedClaudeBin = process.argv[7] || "";
const config = payload.config || {};
const actualArchive = config.interactiveMemoryDir
  ? path.resolve(config.interactiveMemoryDir)
  : "";
const actualAgentCwd = config.agentCwd ? path.resolve(config.agentCwd) : "";
const agentCwdMatches = expectedAgentCwd ? actualAgentCwd === expectedAgentCwd : true;
const claudeBinMatches = expectedClaudeBin ? config.claudeBin === expectedClaudeBin : true;
process.exit(
  actualArchive === expectedArchive &&
    config.timezone === expectedTimezone &&
    Boolean(config.directDeployEnabled) === expectedDirectDeploy &&
    agentCwdMatches &&
    claudeBinMatches
    ? 0
    : 1,
);
NODE
  current_payload="$(curl -fsS --max-time 2 "$CURRENT_URL" 2>/dev/null)" || return 1
  node -e 'const payload = JSON.parse(process.argv[1]); process.exit(payload.settings?.schemaVersion === 1 ? 0 : 1);' "$current_payload" >/dev/null 2>&1
}

studio_health_responds() {
  curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1
}

pid_alive() {
  [ -s "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" >/dev/null 2>&1
}

stop_pid_managed_studio() {
  local pid
  pid="$(cat "$PID_FILE")"

  kill "$pid" >/dev/null 2>&1 || true

  for _ in {1..20}; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      rm -f "$PID_FILE"
      return 0
    fi
    sleep 0.5
  done

  kill -9 "$pid" >/dev/null 2>&1 || true
  rm -f "$PID_FILE"
}

needs_install() {
  if [ ! -x "$APP_DIR/node_modules/.bin/next" ]; then
    return 0
  fi
  if [ -n "${WORKING_MEMORY_STUDIO_APP_DIR:-}" ]; then
    return 1
  fi

  local fingerprint_file="$APP_DIR/.working-memory-studio-source.sha256"
  [ -s "$fingerprint_file" ] || return 0

  local current_fingerprint installed_fingerprint
  current_fingerprint="$(node "$SCRIPT_DIR/studio-source-fingerprint.mjs" "$SOURCE_APP_DIR")"
  installed_fingerprint="$(cat "$fingerprint_file")"
  [ "$current_fingerprint" != "$installed_fingerprint" ]
}

port_in_use() {
  if command -v ss >/dev/null 2>&1; then
    ss -tln 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${PORT}$"
    return
  fi

  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi

  if command -v netstat >/dev/null 2>&1; then
    netstat -an 2>/dev/null | grep -Eq "[.:]${PORT}[[:space:]].*LISTEN"
    return
  fi

  return 1
}

wait_for_studio() {
  local attempt
  for attempt in {1..60}; do
    if studio_ready; then
      return 0
    fi
    if [ "$attempt" -gt 2 ] && [ -s "$PID_FILE" ] && ! pid_alive; then
      return 1
    fi
    sleep 1
  done
  return 1
}

start_dev_server() {
  cd "$APP_DIR"
  {
    echo "Working-memory studio starting"
    echo "App: $APP_DIR"
    echo "Archive: $INTERACTIVE_MEMORY_DIR"
    echo "URL: $STUDIO_URL"
  } >> "$LOG_FILE"

  if command -v setsid >/dev/null 2>&1; then
    setsid env INTERACTIVE_MEMORY_DIR="$INTERACTIVE_MEMORY_DIR" WORKING_MEMORY_CLAUDE_BIN="$WORKING_MEMORY_CLAUDE_BIN" ./node_modules/.bin/next dev -H "$HOST" -p "$PORT" </dev/null >> "$LOG_FILE" 2>&1 &
  else
    env INTERACTIVE_MEMORY_DIR="$INTERACTIVE_MEMORY_DIR" WORKING_MEMORY_CLAUDE_BIN="$WORKING_MEMORY_CLAUDE_BIN" ./node_modules/.bin/next dev -H "$HOST" -p "$PORT" </dev/null >> "$LOG_FILE" 2>&1 &
  fi
  echo "$!" > "$PID_FILE"
}

[ -f "$SOURCE_APP_DIR/package.json" ] || fail "Missing working-memory Studio source package: $SOURCE_APP_DIR"

if needs_install; then
  if pid_alive; then
    echo "Stopping working-memory studio before refreshing cached install: $STUDIO_URL"
    stop_pid_managed_studio
  fi
  "$SCRIPT_DIR/install-studio.sh"
fi

[ -f "$APP_DIR/package.json" ] || fail "Missing installed working-memory Studio package: $APP_DIR"

if studio_ready; then
  echo "Working-memory studio already running: $STUDIO_URL"
  echo "Archive: $INTERACTIVE_MEMORY_DIR"
  exit 0
fi

if pid_alive; then
  if studio_health_responds; then
    echo "Restarting working-memory studio to apply current configuration: $STUDIO_URL"
    stop_pid_managed_studio
  elif wait_for_studio; then
    echo "Working-memory studio ready: $STUDIO_URL"
    echo "Archive: $INTERACTIVE_MEMORY_DIR"
    exit 0
  else
    echo "Working-memory studio process is running but did not become ready: $STUDIO_URL" >&2
    echo "PID: $PID_FILE" >&2
    echo "Log: $LOG_FILE" >&2
    tail -80 "$LOG_FILE" >&2 || true
    exit 1
  fi
fi

if port_in_use; then
  echo "Port ${PORT} is occupied, but ${CURRENT_URL} did not respond as the studio." >&2
  echo "Stop the other process or set WORKING_MEMORY_STUDIO_PORT." >&2
  exit 1
fi

start_dev_server

if wait_for_studio; then
  echo "Working-memory studio ready: $STUDIO_URL"
  echo "Archive: $INTERACTIVE_MEMORY_DIR"
  echo "PID: $PID_FILE"
  echo "Log: $LOG_FILE"
  exit 0
fi

echo "Working-memory studio failed to become ready: $STUDIO_URL" >&2
echo "PID: $PID_FILE" >&2
echo "Log: $LOG_FILE" >&2
tail -80 "$LOG_FILE" >&2 || true
exit 1
