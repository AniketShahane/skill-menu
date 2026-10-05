#!/usr/bin/env bash
# Installs the release build on the personal phone without losing its data, then compiles it
# ahead of time so the first minutes are not spent in the JIT (dash:scripts/install-phone.sh).
#
#   scripts/install-phone.sh [apk]      default app/build/outputs/apk/release/app-release.apk
#   scripts/install-phone.sh --backup   only take the run-as backup, install nothing
#
# Build first: ./gradlew :app:assembleRelease. The phone comes from APP_PHONE (see
# scripts/android-env.sh). Optional: APP_BUSY_SERVICE, a service class whose running state means
# "the user is in the middle of something" (Dash: its RunService); APP_BACKUP_PATHS, the app-data
# folders to back up (default: files shared_prefs databases no_backup datastore).
#
# This never uninstalls and never clears data. The release build is signed with the same local
# debug key as debug builds on purpose, so `install -r` over either keeps everything. If install
# reports INSTALL_FAILED_UPDATE_INCOMPATIBLE the signatures differ: stop and export the data from
# inside the app first. Uninstalling to "fix" it deletes the user's data.
set -euo pipefail
app_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; }
if [[ "${1:-}" == -h || "${1:-}" == --help ]]; then usage; exit 0; fi
# shellcheck source=android-env.sh
source "$app_root/scripts/android-env.sh"
cd "$app_root"

package="com.example.starter"
serial="${APP_PHONE:?No phone chosen. Set APP_PHONE_SERIAL (see scripts/android-env.sh) and connect the phone.}"
backup_only=0
if [[ "${1:-}" == --backup ]]; then backup_only=1; shift; fi
apk="${1:-app/build/outputs/apk/release/app-release.apk}"

a() { adb -s "$serial" "$@" </dev/null; }
a get-state >/dev/null 2>&1 || { echo "Phone $serial is not connected." >&2; exit 1; }
if [[ "$backup_only" -eq 0 && ! -f "$apk" ]]; then
  echo "No APK at $apk. Build it with ./gradlew :app:assembleRelease" >&2
  exit 1
fi
if [[ -n "${APP_BUSY_SERVICE:-}" ]] &&
  a shell dumpsys activity services "$package" 2>/dev/null | grep -q "$APP_BUSY_SERVICE"; then
  echo "$APP_BUSY_SERVICE is running on the phone. Let it finish before installing." >&2
  exit 1
fi

flags() { a shell dumpsys package "$package" 2>/dev/null | grep -E "versionName|pkgFlags" || true; }
echo "Installed before:"
flags

# run-as works only while the installed build is debuggable, so the backup is taken now or never:
# once a release build is on the phone, this path is closed for good (dash:scripts/install-phone.sh:18-27).
mkdir -p .tools
if a shell dumpsys package "$package" 2>/dev/null | grep -q "DEBUGGABLE"; then
  wanted="${APP_BACKUP_PATHS:-files shared_prefs databases no_backup datastore}"
  # One string: adb joins its arguments with spaces, so the device shell does the quoting.
  present="$(a shell "run-as $package sh -c 'for p in $wanted; do [ -e \"\$p\" ] && echo \"\$p\"; done'" 2>/dev/null |
    tr -d '\r' | tr '\n' ' ' || true)"
  if [[ -n "${present// /}" ]]; then
    backup=".tools/phone-backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$backup"
    # shellcheck disable=SC2086 # the folder list is meant to split
    adb -s "$serial" exec-out run-as "$package" tar -cf - $present </dev/null >"$backup/app-data.tar"
    echo "Backed up ${present}to $backup/app-data.tar ($(tar -tf "$backup/app-data.tar" | wc -l | tr -d ' ') entries)."
  else
    echo "The debuggable install has no app data to back up."
  fi
elif a shell pm path "$package" >/dev/null 2>&1; then
  echo "Installed build is not debuggable: no run-as backup is possible. Its data stays in place across install -r."
else
  echo "$package is not installed yet."
fi
if [[ "$backup_only" -eq 1 ]]; then exit 0; fi

if ! result="$(a install -r "$apk" 2>&1)"; then
  echo "$result" >&2
  echo "Install failed. Do NOT uninstall: that deletes the user's data." >&2
  exit 1
fi
echo "$result" | tail -n 1

echo "Compiling ahead of time (about a minute)..."
a shell cmd package compile -m speed -f "$package"
echo "Installed after:"
flags
if a shell dumpsys package "$package" 2>/dev/null | grep -q "DEBUGGABLE"; then
  echo "WARNING: the installed build is DEBUGGABLE. Its frames do not represent the app; install the release APK." >&2
fi
a shell dumpsys package dexopt 2>/dev/null | grep -A3 "$package" | grep -m1 "status" || true
