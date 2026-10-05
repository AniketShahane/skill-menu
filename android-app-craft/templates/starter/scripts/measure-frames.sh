#!/usr/bin/env bash
# Drives a fixed tour of the app on the phone and reports frame timing from gfxinfo, the refresh
# rates the display actually ran at, and a phase verdict for the janky frames (dash:scripts/measure-frames.sh).
#
#   scripts/measure-frames.sh <label> [tab label ...]     default tabs: Settings Home
#
# Results: .tools/perf/<label>.gfx (gfxinfo + framestats), <label>.modes, <label>.classified.
# Measure the release build after scripts/install-phone.sh (AOT-compiled). Debug numbers and
# emulator numbers are not frame timing: the emulated GPU dominates every frame (dash@ea5137b).
#
# The tour: scroll the start page, visit each tab, open the first item and come back, three
# rounds. Tabs and items are found in the accessibility tree; the tour refuses to tap unless the
# app is the resumed activity, so it never touches another app.
#
# Environment: APP_SERIAL (default APP_PHONE), APP_PACKAGE (default com.example.starter),
# APP_BACK=gesture (default; an edge swipe) or key. An adb BACK key event drops a 120 Hz panel to
# 60 Hz for the rest of the close, a real touch does not (dash@c4ab031), so key-back numbers
# undercount smoothness.
set -euo pipefail
app_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; }
if [[ $# -eq 0 || "${1:-}" == -h || "${1:-}" == --help ]]; then usage; exit 0; fi
# shellcheck source=android-env.sh
source "$app_root/scripts/android-env.sh"
cd "$app_root"

label="$1"
shift
if [[ $# -gt 0 ]]; then tabs=("$@"); else tabs=(Settings Home); fi
package="${APP_PACKAGE:-com.example.starter}"
serial="${APP_SERIAL:-${APP_PHONE:-}}"
[[ -n "$serial" ]] || { echo "No device: set APP_PHONE_SERIAL (see scripts/android-env.sh)." >&2; exit 1; }
out=.tools/perf
mkdir -p "$out"

a() { adb -s "$serial" "$@" </dev/null; }
a get-state >/dev/null 2>&1 || { echo "$serial is not connected." >&2; exit 1; }
if app_is_emulator "$serial"; then
  echo "WARNING: $serial is an emulator. Use these numbers for nothing but a smoke check." >&2
fi

resumed() { a shell dumpsys activity activities 2>/dev/null | grep -qE "(topResumedActivity|mResumedActivity).*$package"; }
guard() {
  if ! resumed; then
    echo "The app left the foreground mid-tour (is the phone unlocked and free?). Stopping; nothing more was tapped." >&2
    exit 1
  fi
}
dump_tree() {
  local attempt
  for attempt in 1 2 3; do
    if a shell uiautomator dump /sdcard/app-ui.xml >/dev/null 2>&1; then
      a exec-out cat /sdcard/app-ui.xml >"$out/ui.xml"
      return 0
    fi
    sleep 1
  done
  return 1
}
# Centre of the first node labelled $1, re-read each time: a bar can re-lay itself out around the
# selected tab, so coordinates from an earlier screen are wrong (dash:scripts/record-transition.sh:28-29).
centre() { dump_tree && python3 scripts/ui_tree.py "$out/ui.xml" --package "$package" "$1"; }

a shell am force-stop "$package"
sleep 1
a shell monkey -p "$package" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 4
if ! resumed; then
  echo "The app is not in the foreground (is the phone unlocked and free?). Nothing was tapped." >&2
  exit 1
fi

read -r width height < <(a shell wm size | awk -F'[ x]' '/Physical/ { print $3, $4 }')
x=$((width / 2)); top=$((height * 3 / 10)); bottom=$((height * 4 / 5)); mid=$((height / 2))

scroll_page() {
  guard; a shell input swipe "$x" "$bottom" "$x" "$top" 350; sleep 1
  guard; a shell input swipe "$x" "$top" "$x" "$bottom" 350; sleep 1.2
}
go_back() {
  guard
  if [[ "${APP_BACK:-gesture}" == key ]]; then
    a shell input keyevent KEYCODE_BACK
  else
    a shell input swipe 2 "$mid" $((width * 2 / 5)) "$mid" 250
  fi
  sleep 1.8
}
tap_label() {
  local cx cy
  read -r cx cy <<<"$(centre "$1" || true)" || true
  if [[ -z "${cx:-}" ]]; then
    echo "  (no '$1' on screen; step skipped)"
    return 0
  fi
  guard; a shell input tap "$cx" "$cy"; sleep 2.2
}

# Refresh rate actually shown, sampled every 0.5 s. Framework mode ids are one-based and the
# SurfaceFlinger ids in the same dump zero-based, "easy to misread as 80 Hz"
# (dash:docs/upgrade-0.9.1/README.md "Measure"); this prints each sample as its rate in Hz.
(
  for _ in $(seq 1 120); do
    a shell dumpsys display 2>/dev/null | python3 -c '
import re, sys
d = sys.stdin.read()
m = re.search(r"mActiveModeId=(\d+)", d)
if m:
    f = re.search(r"\{id=%s,[^}]*?fps=([0-9.]+)" % m.group(1), d)
    print("%s Hz" % round(float(f.group(1))) if f else "mode " + m.group(1))
' || true
    sleep 0.5
  done
) >"$out/$label.modes" &
sampler=$!
trap 'kill "$sampler" 2>/dev/null || true' EXIT

a shell dumpsys gfxinfo "$package" reset >/dev/null
for round in 1 2 3; do
  echo "round $round"
  scroll_page
  for tab in "${tabs[@]}"; do tap_label "$tab"; scroll_page; done
  # The first item by its test tag when the app exposes tags as resource-ids
  # (testTagsAsResourceId); otherwise a point below the page header, guarded like every tap.
  item=""
  if dump_tree; then
    item="$(python3 scripts/ui_tree.py "$out/ui.xml" --package "$package" --match '^item_' | head -n 1 || true)"
  fi
  if [[ -n "$item" ]]; then
    item="${item#*$'\t'}"
    guard; a shell input tap "${item%%$'\t'*}" "${item#*$'\t'}"
  else
    guard; a shell input tap "$x" $((height * 2 / 5))
  fi
  sleep 2.6
  scroll_page
  go_back
done
a shell dumpsys gfxinfo "$package" framestats >"$out/$label.gfx"
kill "$sampler" 2>/dev/null || true

echo "=== $label"
grep -E "Total frames rendered|Janky frames|percentile|Number Missed Vsync|Number Slow UI thread|Number Slow bitmap|Number Slow issue draw|Number Frame deadline missed" \
  "$out/$label.gfx" | head -n 12 || true
echo "display refresh rates seen: $(sort "$out/$label.modes" | uniq -c | tr -s ' ' | tr '\n' ';')"
# framestats keeps only the most recent frames (about 120), so this verdict covers the tour's end.
python3 scripts/frame-classify.py "$out/$label.gfx" | tee "$out/$label.classified" | tail -n 1
