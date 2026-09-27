#!/usr/bin/env bash
# Installs the ask-queue skill into ~/.claude/skills/ask-queue and initializes the data directory.
# Personal data lives outside this repo, in $ASK_QUEUE_HOME (default ~/.local/share/ask-queue).
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ "$(basename "$SKILL_DIR")" = "ask-queue" ] || {
  echo "Expected to run from an ask-queue skill directory, got: $SKILL_DIR" >&2
  exit 1
}
command -v node >/dev/null || {
  echo "Node.js 20+ is required." >&2
  exit 1
}

TARGET_DIR="${ASK_QUEUE_SKILL_INSTALL_DIR:-${CLAUDE_HOME:-$HOME/.claude}/skills/ask-queue}"
SOURCE_REAL="$(cd "$SKILL_DIR" && pwd -P)"

if [ -e "$TARGET_DIR" ] && [ "$(cd "$TARGET_DIR" && pwd -P)" = "$SOURCE_REAL" ]; then
  echo "ask-queue is already installed at $TARGET_DIR"
else
  TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ask-queue-install.XXXXXX")"
  trap 'rm -rf "$TMP_DIR"' EXIT
  (cd "$(dirname "$SKILL_DIR")" && tar --exclude='*.log' --exclude='*.local.*' -cf - ask-queue) |
    (cd "$TMP_DIR" && tar -xf -)
  mkdir -p "$(dirname "$TARGET_DIR")"
  rm -rf "$TARGET_DIR"
  mv "$TMP_DIR/ask-queue" "$TARGET_DIR"
  chmod +x "$TARGET_DIR"/scripts/*.sh
  echo "Installed ask-queue to $TARGET_DIR"
fi

node "$TARGET_DIR/scripts/aq.mjs" init >/dev/null
echo "Data directory: ${ASK_QUEUE_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/ask-queue}"
echo
echo "Next: open claude on this machine and say \"set up ask queue\"."
