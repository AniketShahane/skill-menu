#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILL_NAME="$(basename "$SKILL_DIR")"

if [ "$SKILL_NAME" != "working-memory" ]; then
  echo "Expected to run from a working-memory skill directory, got: $SKILL_DIR" >&2
  exit 1
fi

if [ -z "${HOME:-}" ]; then
  echo "HOME is required to install the working-memory skill." >&2
  exit 1
fi

SOURCE_REAL="$(cd "$SKILL_DIR" && pwd -P)"

AGENT=""
for arg in "$@"; do
  case "$arg" in
    --claude)
      AGENT="claude"
      ;;
    --codex)
      AGENT="codex"
      ;;
  esac
done

if [ -z "$AGENT" ]; then
  AGENT="${WORKING_MEMORY_INSTALL_AGENT:-}"
fi

if [ -z "$AGENT" ]; then
  # Path-based inference for the un-flagged, un-configured case. The
  # fallback (source tree under neither ~/.claude nor ~/.codex, e.g. a
  # fresh git clone) defaults to Claude: this repo is Claude-Code-first.
  case "$SOURCE_REAL" in
    *"/.claude/skills/working-memory")
      AGENT="claude"
      ;;
    *"/.codex/skills/working-memory")
      AGENT="codex"
      ;;
    *)
      AGENT="claude"
      ;;
  esac
fi

case "$AGENT" in
  claude)
    TARGET_ROOT="${CLAUDE_HOME:-$HOME/.claude}/skills"
    AGENT_LABEL="Claude"
    ;;
  codex)
    TARGET_ROOT="${CODEX_HOME:-$HOME/.codex}/skills"
    AGENT_LABEL="Codex"
    ;;
  *)
    echo "Unknown agent: $AGENT (expected 'claude' or 'codex')" >&2
    exit 1
    ;;
esac
TARGET_DIR="${WORKING_MEMORY_SKILL_INSTALL_DIR:-$TARGET_ROOT/working-memory}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/working-memory-skill-install.XXXXXX")"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$TARGET_ROOT"

TARGET_PARENT="$(dirname "$TARGET_DIR")"
mkdir -p "$TARGET_PARENT"
TARGET_REAL_PARENT="$(cd "$TARGET_PARENT" && pwd -P)"
TARGET_REAL="$TARGET_REAL_PARENT/$(basename "$TARGET_DIR")"

if [ -e "$TARGET_DIR" ] && [ "$(cd "$TARGET_DIR" && pwd -P)" = "$SOURCE_REAL" ]; then
  echo "Working-memory skill is already installed at $TARGET_DIR"
  exit 0
fi

(
  cd "$(dirname "$SKILL_DIR")"
  tar \
    --exclude='working-memory/assets/working-memory-viewer/node_modules' \
    --exclude='working-memory/assets/working-memory-viewer/.next' \
    --exclude='working-memory/assets/working-memory-viewer/coverage' \
    --exclude='working-memory/assets/working-memory-viewer/tsconfig.tsbuildinfo' \
    --exclude='working-memory/assets/daily-notes' \
    --exclude='*.local.sh' \
    --exclude='*.local.json' \
    --exclude='*.log' \
    -cf - working-memory
) | (
  cd "$TMP_DIR"
  tar -xf -
)

rm -rf "$TARGET_DIR"
mv "$TMP_DIR/working-memory" "$TARGET_DIR"

echo "Installed working-memory skill to $TARGET_DIR"
echo "Run it by asking $AGENT_LABEL to use the working-memory skill."
