#!/usr/bin/env bash
# Cron entrypoint for unattended ask-queue runs: run.sh sweep | run.sh replies
# One run at a time (flock), fail-closed guard hook, dontAsk permissions, logs in $ASK_QUEUE_HOME/logs.
set -euo pipefail

MODE="${1:-}"
case "$MODE" in
  sweep | replies) ;;
  *)
    echo "usage: run.sh sweep|replies" >&2
    exit 64
    ;;
esac

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AQ="$SKILL_DIR/scripts/aq.mjs"
export ASK_QUEUE_HOME="${ASK_QUEUE_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/ask-queue}"
# cron starts with a minimal PATH; add the usual install locations for node and claude.
export PATH="$HOME/.local/bin:$HOME/.claude/local:/usr/local/bin:$PATH"

CLAUDE_BIN="${ASK_QUEUE_CLAUDE_BIN:-$(command -v claude || true)}"
if [ -z "$CLAUDE_BIN" ] || [ ! -x "$CLAUDE_BIN" ]; then
  echo "claude CLI not found; set ASK_QUEUE_CLAUDE_BIN" >&2
  exit 1
fi
SELF_DM="$(node "$AQ" config get slack.selfDmId 2>/dev/null | tr -d '"' || true)"
if [ -z "$SELF_DM" ] || [ "$SELF_DM" = "null" ]; then
  echo "ask-queue is not set up (no slack.selfDmId); say \"set up ask queue\" in claude first" >&2
  exit 1
fi

mkdir -p "$ASK_QUEUE_HOME/logs" "$ASK_QUEUE_HOME/tmp"
LOG="$ASK_QUEUE_HOME/logs/$(date +%F).log"

exec 9>"$ASK_QUEUE_HOME/.lock"
if ! flock -n 9; then
  echo "$(date -Is) $MODE skipped: another run holds the lock" >>"$LOG"
  exit 0
fi

MODEL="$(node "$AQ" config get "models.$MODE" | tr -d '"')"
if [ -z "$MODEL" ] || [ "$MODEL" = "null" ]; then
  MODEL="sonnet"
fi

SETTINGS="$ASK_QUEUE_HOME/tmp/headless-settings.json"
node "$AQ" settings >"$SETTINGS"

PROMPT="Run the ask-queue skill in ${MODE} mode. This is an unattended run: nobody will answer in this chat, so never ask here; decide, record, and finish.
Skill directory: $SKILL_DIR (read $SKILL_DIR/SKILL.md first, then the references it lists for ${MODE} mode).
Data directory (your working directory): $ASK_QUEUE_HOME
State CLI: node $AQ <command>"

cd "$ASK_QUEUE_HOME"
echo "=== $(date -Is) $MODE start (model $MODEL)" >>"$LOG"
set +e
timeout "${ASK_QUEUE_TIMEOUT_SECONDS:-1800}" "$CLAUDE_BIN" -p "$PROMPT" \
  --model "$MODEL" \
  --permission-mode dontAsk \
  --settings "$SETTINGS" \
  --add-dir "$SKILL_DIR" \
  --disallowedTools WebFetch WebSearch \
  --output-format text >>"$LOG" 2>&1
STATUS=$?
set -e
echo "=== $(date -Is) $MODE end (exit $STATUS)" >>"$LOG"
exit "$STATUS"
