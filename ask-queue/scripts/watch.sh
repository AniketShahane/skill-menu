#!/usr/bin/env bash
# Keeps the Slack watcher (watch.mjs) running. Crontab runs this every minute: if the watcher is
# already up, flock makes this a no-op; if it died, it starts again.
#   * * * * *  $HOME/.claude/skills/ask-queue/scripts/watch.sh
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export ASK_QUEUE_HOME="${ASK_QUEUE_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/ask-queue}"
export PATH="$HOME/.local/bin:$HOME/.claude/local:/usr/local/bin:/usr/bin:/bin:$PATH"
mkdir -p "$ASK_QUEUE_HOME/logs"

FLAGS=""
node -e 'process.exit(typeof WebSocket === "undefined" ? 1 : 0)' 2>/dev/null || FLAGS="--experimental-websocket"
# flock holds the lock while the watcher runs; -o keeps it out of the watcher, so the sessions and
# replies checks it starts never hold it after the watcher dies. Already running: exit quietly.
exec flock -n -o "$ASK_QUEUE_HOME/.watch.lock" node $FLAGS --no-warnings "$SKILL_DIR/scripts/watch.mjs" \
  >>"$ASK_QUEUE_HOME/logs/watch-$(date +%F).log" 2>&1
