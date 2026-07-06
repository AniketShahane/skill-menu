#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_APP_DIR="${WORKING_MEMORY_STUDIO_SOURCE_APP_DIR:-$SKILL_DIR/assets/working-memory-viewer}"

default_install_dir() {
  local cache_home="${XDG_CACHE_HOME:-${HOME:-/tmp}/.cache}"
  printf '%s\n' "$cache_home/working-memory/studio-app"
}

APP_DIR="${WORKING_MEMORY_STUDIO_APP_DIR:-${WORKING_MEMORY_STUDIO_INSTALL_DIR:-$(default_install_dir)}}"

[ -f "$SOURCE_APP_DIR/package.json" ] || {
  echo "Missing working-memory Studio source package: $SOURCE_APP_DIR" >&2
  exit 1
}

command -v npm >/dev/null 2>&1 || {
  echo "npm is required to install the working-memory Studio." >&2
  exit 1
}
command -v node >/dev/null 2>&1 || {
  echo "node is required to install the working-memory Studio." >&2
  exit 1
}

SOURCE_FINGERPRINT="$(node "$SCRIPT_DIR/studio-source-fingerprint.mjs" "$SOURCE_APP_DIR")"
FINGERPRINT_FILE="$APP_DIR/.working-memory-studio-source.sha256"

if [ -n "${WORKING_MEMORY_STUDIO_APP_DIR:-}" ]; then
  [ -f "$APP_DIR/package.json" ] || {
    echo "Missing working-memory Studio package: $APP_DIR" >&2
    exit 1
  }
else
  case "$APP_DIR" in
    "" | "/")
      echo "Refusing to install Studio into unsafe path: $APP_DIR" >&2
      exit 1
      ;;
  esac
  SOURCE_REAL="$(cd "$SOURCE_APP_DIR" && pwd -P)"
  APP_PARENT="$(dirname "$APP_DIR")"
  mkdir -p "$APP_PARENT"
  APP_REAL_PARENT="$(cd "$APP_PARENT" && pwd -P)"
  APP_REAL="$APP_REAL_PARENT/$(basename "$APP_DIR")"
  if [ "$APP_REAL" = "$SOURCE_REAL" ]; then
    echo "Refusing to install Studio over the packaged source asset: $APP_DIR" >&2
    exit 1
  fi
  rm -rf "$APP_DIR"
  mkdir -p "$APP_DIR"
  tar -C "$SOURCE_APP_DIR" \
    --exclude='./node_modules' \
    --exclude='./.next' \
    --exclude='./coverage' \
    --exclude='./tsconfig.tsbuildinfo' \
    -cf - . | tar -C "$APP_DIR" -xf -
fi

cd "$APP_DIR"

if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

if [ -z "${WORKING_MEMORY_STUDIO_APP_DIR:-}" ]; then
  printf '%s\n' "$SOURCE_FINGERPRINT" > "$FINGERPRINT_FILE"
fi

echo "Working-memory Studio installed: $APP_DIR"
