#!/usr/bin/env bash
# Records one transition and lays its frames out side by side, because a transition that "looks
# wrong" is nearly impossible to describe and trivial to see as a strip of stills. Every animation
# bug Dash fixed after its script existed was found this way: a card already full size in the first frame, a page that
# faded instead of growing, a map that changed shape after the transition ended
# (dash:scripts/record-transition.sh:2-6).
#
#   scripts/record-transition.sh <name> [step ...]
#
# Steps run in order once recording has started; with none, perform the gesture yourself:
#   tap:<label>   tap the node with that label, found in the accessibility tree (focus-guarded)
#   back          a back-edge swipe (a real touch, so the panel stays at 120 Hz)
#   key-back      an adb BACK key event (drops a 120 Hz panel to 60 Hz: dash@c4ab031)
#   wait:<sec>    pause
# Example: scripts/record-transition.sh open tap:Settings wait:1 tap:Home
#
# Writes .tools/transitions/<name>.mp4 and <name>.png (the contact sheet). Needs ffmpeg.
# Environment: APP_SERIAL (default APP_PHONE; the emulator is fine for looking, at 5x or 10x
# animator scale), APP_PACKAGE (default com.example.starter), APP_RECORD_SECONDS (default: 6 with
# no steps, else 3 plus 4 per tap, 2 per back or key-back and each wait's seconds; a tap spends
# about 2 s on `uiautomator dump` before it lands, so tap + back needs about 9 s).
set -euo pipefail
app_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; }
if [[ $# -eq 0 || "${1:-}" == -h || "${1:-}" == --help ]]; then usage; exit 0; fi
# shellcheck source=android-env.sh
source "$app_root/scripts/android-env.sh"
cd "$app_root"

name="$1"
shift
package="${APP_PACKAGE:-com.example.starter}"
serial="${APP_SERIAL:-${APP_PHONE:-}}"
[[ -n "$serial" ]] || { echo "No device: set APP_SERIAL, or APP_PHONE_SERIAL for the phone." >&2; exit 1; }
if [[ -n "${APP_RECORD_SECONDS:-}" ]]; then
  seconds="$APP_RECORD_SECONDS"
elif [[ $# -eq 0 ]]; then
  seconds=6
else
  seconds="$(printf '%s\n' "$@" | awk '
    /^tap:/ { t += 4; next }
    /^(back|key-back)$/ { t += 2; next }
    /^wait:/ { sub(/^wait:/, ""); t += $0 + 0; next }
    END { t += 3; s = int(t); if (s < t) s++; if (s > 180) s = 180; print s }')"
fi
out=.tools/transitions
mkdir -p "$out"

a() { adb -s "$serial" "$@" </dev/null; }
a get-state >/dev/null 2>&1 || { echo "$serial is not connected." >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg lays the frames out: brew install ffmpeg" >&2; exit 1; }
if [[ "$(a shell "dumpsys window | grep -m1 mCurrentFocus" 2>/dev/null || true)" != *"$package"* ]]; then
  echo "$package is not the focused window on $serial. Open it on the screen to record." >&2
  exit 1
fi

# Half the panel in each direction, rounded to even: the encoder's limit on a 1440x3120 phone is
# what Dash's 720x1560 was, and a fixed size would stretch any other aspect ratio.
read -r width height < <(a shell wm size | awk -F'[ x]' '/Physical/ { print $3, $4 }')
size="$(( width / 4 * 2 ))x$(( height / 4 * 2 ))"

run_step() {
  case "$1" in
    tap:*) APP_SERIAL="$serial" APP_PACKAGE="$package" scripts/tap-by-tree.sh "${1#tap:}" ;;
    back) a shell input swipe 2 $((height / 2)) $((width * 2 / 5)) $((height / 2)) 250 ;;
    key-back) a shell input keyevent KEYCODE_BACK ;;
    wait:*) sleep "${1#wait:}" ;;
    *) echo "Unknown step '$1'. Try tap:<label>, back, key-back, wait:<seconds>." >&2; return 1 ;;
  esac
}

remote=/sdcard/app-transition.mp4
a shell screenrecord --size "$size" --bit-rate 12000000 --time-limit "$seconds" "$remote" &
recorder=$!
sleep 1.2
if [[ $# -eq 0 ]]; then echo "Recording ${seconds}s: perform the transition now."; fi
for step in "$@"; do run_step "$step"; done
wait "$recorder" || true
sleep 1
a pull "$remote" "$out/$name.mp4" >/dev/null
a shell rm -f "$remote" || true

# One still every 40 ms, eight to a row. A 300-440 ms transition is six to eleven frames, so one
# that is over in two has been cut short and one that never changes has not started
# (dash:scripts/record-transition.sh:60-61).
frames="$out/.frames"
rm -rf "$frames"
mkdir -p "$frames"
ffmpeg -v error -i "$out/$name.mp4" -vf "fps=25,scale=240:-1" -start_number 0 -y "$frames/f%03d.png"
count="$(find "$frames" -name 'f*.png' | wc -l | tr -d ' ')"
rows=$(( (count + 7) / 8 ))
ffmpeg -v error -y -framerate 1 -i "$frames/f%03d.png" -frames:v 1 \
  -filter_complex "tile=8x${rows}:margin=6:padding=6:color=0x303030" "$out/$name.png"
rm -rf "$frames"
echo "$count frames -> $out/$name.png"
