#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="${WORKING_MEMORY_STUDIO_SOURCE_APP_DIR:-$SKILL_DIR/assets/working-memory-viewer}"

fail() {
  echo "$*" >&2
  exit 1
}

[ -d "$APP_DIR" ] || fail "Missing working-memory Studio asset directory: $APP_DIR"

required_paths=(
  package.json
  package-lock.json
  server-start.mjs
  docs/interactive-working-memory.md
  src/app/studio/page.tsx
  src/app/api/studio/health/route.ts
  src/lib/runtime-config.ts
  src/lib/interactive-memory/paths.ts
  tests/interactive-memory-calendar.test.ts
  vitest.config.ts
)

for required_path in "${required_paths[@]}"; do
  [ -e "$APP_DIR/$required_path" ] || fail "Missing packaged Studio path: $required_path"
done

generated_path="$(
  find "$APP_DIR" \
    \( -name node_modules -o -name .next -o -name coverage -o -name tsconfig.tsbuildinfo \) \
    -print -quit
)"

[ -z "$generated_path" ] || fail "Packaged Studio contains generated path: $generated_path"

secret_path="$(
  find "$APP_DIR" \
    \( -name '*.log' -o -name '*.env' -o -name 'credentials*' \) \
    -print -quit
)"

[ -z "$secret_path" ] || fail "Packaged Studio contains disallowed path: $secret_path"

for script_path in "$SCRIPT_DIR"/*.sh; do
  bash -n "$script_path"
done

command -v node >/dev/null 2>&1 || fail "node is required to validate package metadata."

node "$SCRIPT_DIR/validate-studio-package.mjs" "$APP_DIR/package.json"

echo "Working-memory Studio package validation passed: $APP_DIR"
