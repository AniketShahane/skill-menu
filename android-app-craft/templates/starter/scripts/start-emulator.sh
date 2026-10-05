#!/usr/bin/env bash
# Starts this project's own emulator: a project-local AVD under .tools/avd, on its own port,
# headless, then waits until Android has booted. Never touches another project's emulator.
#
#   scripts/start-emulator.sh                   start in the background and wait for boot
#   scripts/start-emulator.sh --foreground ...  exec the emulator here; extra args pass through
#
# Environment (all optional):
#   APP_EMULATOR_KIND   phone (default) | tv | atd
#   APP_AVD_NAME        default starter_<kind>
#   APP_EMULATOR_PORT   default 5584; the adb id is emulator-<port>
#   APP_EMULATOR_IMAGE  an installed "system-images;android-NN;tag;abi" to use instead
#   APP_EMULATOR_GUI=1  show the emulator window
#   APP_BOOT_TIMEOUT    seconds to wait for boot, default 300
#
# Known-good images on this toolchain (arm64 hosts; x86_64 hosts use the x86_64 twin):
#   phone  system-images;android-35;google_apis;arm64-v8a   Dash's dash_api35, Flick's flick_phone
#   tv     system-images;android-36;google-tv;arm64-v8a     Flick's flick_tv, 1920x1080
#   atd    system-images;android-35;aosp_atd;arm64-v8a      Automated Test Device: headless, fast
# Install a missing one with: sdkmanager "<image>"
set -euo pipefail
app_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; }
if [[ "${1:-}" == -h || "${1:-}" == --help ]]; then usage; exit 0; fi
# shellcheck source=android-env.sh
# Emulator-only: skip looking for the phone, which would query every attached device.
APP_ENV_SKIP_PHONE=1 source "$app_root/scripts/android-env.sh"
: "${ANDROID_HOME:?Install the Android SDK command-line tools and set ANDROID_HOME first.}"
: "${JAVA_HOME:?Install JDK 21 (or 17) and set JAVA_HOME first; avdmanager needs it.}"

foreground=0
if [[ "${1:-}" == --foreground ]]; then foreground=1; shift; fi

kind="${APP_EMULATOR_KIND:-phone}"
avd="${APP_AVD_NAME:-starter_$kind}"
port="${APP_EMULATOR_PORT:-5584}"
serial="emulator-$port"
# Project-local, so `emulator -list-avds` in another project never offers this one, and deleting
# the project deletes its emulator (dash:scripts/start-emulator.sh:7).
export ANDROID_AVD_HOME="$app_root/.tools/avd"

case "$(uname -m)" in
  arm64 | aarch64) abi=arm64-v8a ;;
  *) abi=x86_64 ;;
esac
case "$kind" in
  phone)
    candidates="android-35;google_apis android-36;google_apis android-35;google_apis_playstore android-36;google_apis_playstore"
    device=pixel_7 memory=3072 ;;
  tv)
    candidates="android-36;google-tv android-35;google-tv android-34;google-tv"
    device=tv_1080p memory=2048 ;;
  atd)
    candidates="android-35;aosp_atd android-34;aosp_atd android-33;aosp_atd"
    device=pixel_7 memory=2048 ;;
  *) echo "APP_EMULATOR_KIND must be phone, tv or atd (got '$kind')." >&2; exit 2 ;;
esac

# The image has to be installed on this machine, so look rather than assume.
image="${APP_EMULATOR_IMAGE:-}"
if [[ -z "$image" ]]; then
  for candidate in $candidates; do
    if [[ -d "$ANDROID_HOME/system-images/${candidate%%;*}/${candidate#*;}/$abi" ]]; then
      image="system-images;$candidate;$abi"
      break
    fi
  done
fi
if [[ -z "$image" ]]; then
  echo "No $kind system image is installed under $ANDROID_HOME/system-images. Install one:" >&2
  echo "  sdkmanager \"system-images;${candidates%% *};$abi\"" >&2
  exit 1
fi
image_dir="$ANDROID_HOME/$(echo "$image" | tr ';' '/')"
[[ -d "$image_dir" ]] || { echo "$image is not installed ($image_dir is missing)." >&2; exit 1; }

# A port already in use: fine if it is this AVD, a refusal if it is anyone else's.
if [[ "$(adb -s "$serial" get-state 2>/dev/null || true)" == device ]]; then
  running="$(adb -s "$serial" emu avd name 2>/dev/null | tr -d '\r' | head -n 1 || true)"
  if [[ "$running" == "$avd" ]]; then
    echo "$avd is already running as $serial."
    exit 0
  fi
  echo "$serial is taken by '${running:-another emulator}'. Choose another APP_EMULATOR_PORT." >&2
  exit 1
fi

mkdir -p "$ANDROID_AVD_HOME"
if [[ ! -f "$ANDROID_AVD_HOME/$avd.ini" ]]; then
  echo "Creating $avd from $image ($device)."
  printf 'no\n' | avdmanager create avd -n "$avd" -k "$image" -d "$device" -p "$ANDROID_AVD_HOME/$avd.avd"
fi

# -gpu host: a swiftshader AVD returns black from screencap (Marginalia), which breaks every
# screenshot check. -no-snapshot: each boot starts from a known state.
args=(-avd "$avd" -port "$port" -no-snapshot -no-boot-anim -gpu host -no-audio -memory "$memory" -cores 4)
if [[ "${APP_EMULATOR_GUI:-0}" != 1 ]]; then args+=(-no-window); fi

if [[ "$foreground" -eq 1 ]]; then
  exec emulator "${args[@]}" "$@"
fi

mkdir -p "$app_root/.tools"
log="$app_root/.tools/emulator-$avd.log"
nohup emulator "${args[@]}" "$@" >"$log" 2>&1 &
echo "Booting $avd as $serial (log: $log)."
timeout="${APP_BOOT_TIMEOUT:-300}"
waited=0
until [[ "$(adb -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)" == 1 ]]; do
  if [[ "$waited" -ge "$timeout" ]]; then
    echo "$avd did not finish booting in ${timeout}s; see $log." >&2
    exit 1
  fi
  sleep 2
  waited=$((waited + 2))
done
echo "$avd is up as $serial."
