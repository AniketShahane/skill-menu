#!/usr/bin/env bash
# Records a 15 s Perfetto trace of the app on the phone while you (or a driver script) perform
# one gesture, with Compose composition tracing switched on (dash:scripts/trace-phone.sh).
#
#   scripts/trace-phone.sh <label>
#
# The trace lands in .tools/perf/<label>.perfetto-trace; open it at https://ui.perfetto.dev.
# Composable names appear only in a build made with -PappTracing=true (runtime-tracing and the
# Perfetto binary in the APK); without it you still get HWUI, scheduling and frame-timeline data.
# The manifest's <profileable android:shell="true"/> is what lets a release build be traced.
# Environment: APP_SERIAL (default APP_PHONE), APP_PACKAGE (default com.example.starter).
set -euo pipefail
app_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; }
if [[ $# -eq 0 || "${1:-}" == -h || "${1:-}" == --help ]]; then usage; exit 0; fi
# shellcheck source=android-env.sh
source "$app_root/scripts/android-env.sh"
cd "$app_root"

label="$1"
package="${APP_PACKAGE:-com.example.starter}"
serial="${APP_SERIAL:-${APP_PHONE:-}}"
[[ -n "$serial" ]] || { echo "No device: set APP_PHONE_SERIAL (see scripts/android-env.sh)." >&2; exit 1; }
remote="/data/misc/perfetto-traces/app-$label.perfetto-trace"

adb -s "$serial" get-state >/dev/null 2>&1 || { echo "$serial is not connected." >&2; exit 1; }
if ! adb -s "$serial" shell dumpsys activity activities 2>/dev/null |
  grep -qE "(topResumedActivity|mResumedActivity).*$package"; then
  echo "$package must be the resumed activity on $serial." >&2
  exit 1
fi
mkdir -p .tools/perf

# Composition tracing (androidx.tracing.perfetto); harmless when already on or not bundled.
adb -s "$serial" shell am broadcast -a androidx.tracing.perfetto.action.ENABLE_TRACING \
  "$package/androidx.tracing.perfetto.TracingReceiver" </dev/null >/dev/null 2>&1 || true

echo "Recording 15 s: perform the gesture now."
sed -E "s|^([[:space:]]*atrace_apps:).*|\\1 \"$package\"|" scripts/trace.pbtxt |
  adb -s "$serial" shell perfetto -c - --txt -o "$remote"
adb -s "$serial" pull "$remote" ".tools/perf/$label.perfetto-trace" >/dev/null
adb -s "$serial" shell rm -f "$remote" </dev/null || true
echo "Saved .tools/perf/$label.perfetto-trace"
