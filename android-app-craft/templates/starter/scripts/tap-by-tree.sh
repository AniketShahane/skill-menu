#!/usr/bin/env bash
# Taps controls found in the device's accessibility tree, never at guessed coordinates, and only
# while this app has window focus (flick:docs/store/codec-matrix-test.sh). A stray tap from an
# earlier session once escaped into other apps; a reordered list cannot make these taps hit the
# wrong item.
#
#   scripts/tap-by-tree.sh --list                every labelled node: label<TAB>x<TAB>y
#   scripts/tap-by-tree.sh <label> [label ...]   tap each in turn; the tree is re-read before each
#   scripts/tap-by-tree.sh --each REGEX          tap every node whose label matches, one at a
#                                                time, pressing back after each
#
# A label is a content description, else the text, else the resource-id (exact match first, then
# case-insensitive, then substring). Environment: APP_SERIAL (default APP_PHONE), APP_PACKAGE
# (default com.example.starter), APP_TAP_PAUSE seconds after each tap (default 1.5).
# Exits 1 without tapping when the app is not the focused window.
set -euo pipefail
app_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; }
if [[ $# -eq 0 || "${1:-}" == -h || "${1:-}" == --help ]]; then usage; exit 0; fi
# shellcheck source=android-env.sh
source "$app_root/scripts/android-env.sh"
cd "$app_root"

package="${APP_PACKAGE:-com.example.starter}"
serial="${APP_SERIAL:-${APP_PHONE:-}}"
[[ -n "$serial" ]] || { echo "No device: set APP_SERIAL, or APP_PHONE_SERIAL for the phone." >&2; exit 1; }
pause="${APP_TAP_PAUSE:-1.5}"
out=.tools/ui
mkdir -p "$out"

# Every adb call reads /dev/null: inside a loop, adb would otherwise eat the loop's input.
a() { adb -s "$serial" "$@" </dev/null; }
a get-state >/dev/null 2>&1 || { echo "$serial is not connected." >&2; exit 1; }

focused() { a shell "dumpsys window | grep -m1 mCurrentFocus" 2>/dev/null | tr -d '\r' || true; }
guard() {
  local now
  now="$(focused)"
  if [[ "$now" != *"$package"* ]]; then
    echo "REFUSED: $package is not focused (${now:-no focus}). Nothing was tapped." >&2
    return 1
  fi
}
# uiautomator refuses to dump while the screen is still animating, so try a few times.
dump_tree() {
  local attempt
  for attempt in 1 2 3; do
    if a shell uiautomator dump /sdcard/app-ui.xml >/dev/null 2>&1; then
      a exec-out cat /sdcard/app-ui.xml >"$out/tree.xml"
      return 0
    fi
    sleep 1
  done
  echo "uiautomator could not dump the screen." >&2
  return 1
}
tap_at() { guard && a shell input tap "$1" "$2" && sleep "$pause"; }

# A screensaver or a dozing screen steals focus and reads as a failure it is not
# (flick:docs/store/codec-matrix-test.sh:39-41).
a shell input keyevent KEYCODE_WAKEUP

case "$1" in
  --list)
    dump_tree
    python3 "$app_root/scripts/ui_tree.py" "$out/tree.xml" --package "$package"
    ;;
  --each)
    pattern="${2:?--each needs a regular expression}"
    dump_tree
    python3 "$app_root/scripts/ui_tree.py" "$out/tree.xml" --package "$package" --match "$pattern" >"$out/targets.txt"
    # Read up front into an array, never piped into the loop (flick:docs/store/codec-matrix-test.sh:65-67).
    targets=()
    while IFS= read -r line; do targets+=("$line"); done <"$out/targets.txt"
    if [[ ${#targets[@]} -eq 0 ]]; then echo "Nothing on screen matches /$pattern/." >&2; exit 1; fi
    for entry in "${targets[@]}"; do
      label="${entry%%$'\t'*}"
      rest="${entry#*$'\t'}"
      echo "tap: $label"
      tap_at "${rest%%$'\t'*}" "${rest#*$'\t'}" || exit 1
      a shell input keyevent KEYCODE_BACK
      sleep "$pause"
    done
    ;;
  *)
    for label in "$@"; do
      dump_tree
      read -r x y <<<"$(python3 "$app_root/scripts/ui_tree.py" "$out/tree.xml" --package "$package" "$label")" || true
      if [[ -z "${x:-}" || -z "${y:-}" ]]; then
        echo "Not on screen: '$label'. Labels available: scripts/tap-by-tree.sh --list" >&2
        exit 1
      fi
      echo "tap: $label ($x, $y)"
      tap_at "$x" "$y" || exit 1
      unset x y
    done
    ;;
esac
