#!/usr/bin/env bash
# Builds, then runs the device suites on THIS project's emulator only, one class at a time,
# each into its own log, and fails if any class did not end in "OK (n tests)".
#
#   scripts/test-emulator.sh                  every *Test.kt with an @Test under app/src/androidTest
#   scripts/test-emulator.sh HomeFlowTest ... only these classes (simple or fully qualified names)
#
# Environment: APP_EMULATOR_PORT (default 5584), APP_AVD_NAME (default starter_phone),
# APP_TEST_RELEASE=1 to test the non-debuggable, R8-optimised release build (-PappTestRelease=true;
# shrinking and renaming stay off in it, so it does not test keep rules).
# Start the emulator first with scripts/start-emulator.sh. Logs land in .tools/test-logs/.
#
# Installs with `install -r` and never clears app data: the suites save and restore the state
# they touch, so the emulator keeps the history later suites rely on.
set -euo pipefail
app_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; }
if [[ "${1:-}" == -h || "${1:-}" == --help ]]; then usage; exit 0; fi
# shellcheck source=android-env.sh
# Emulator-only: skip looking for the phone, which would query every attached device.
APP_ENV_SKIP_PHONE=1 source "$app_root/scripts/android-env.sh"
cd "$app_root"

package="com.example.starter"
runner="$package.test/$package.StarterTestRunner"
serial="emulator-${APP_EMULATOR_PORT:-5584}"
expected_avd="${APP_AVD_NAME:-starter_phone}"

# Mock data, permission resets and fixtures must never reach the phone or another project's
# emulator, so the AVD is checked by name before anything is installed (dash:scripts/test-emulator.sh:5-10).
actual_avd="$(adb -s "$serial" emu avd name 2>/dev/null | tr -d '\r' | head -n 1 || true)"
if [[ "$actual_avd" != "$expected_avd" ]]; then
  echo "Refusing to run: $serial is '${actual_avd:-not connected}', not the dedicated $expected_avd emulator." >&2
  exit 1
fi

if [[ "${APP_TEST_RELEASE:-0}" == 1 ]]; then
  variant=release
  ./gradlew -PappTestRelease=true :app:assembleRelease :app:assembleReleaseAndroidTest :app:testReleaseUnitTest
else
  variant=debug
  ./gradlew :app:assembleDebug :app:assembleDebugAndroidTest :app:testDebugUnitTest :app:lintDebug
fi
adb -s "$serial" install -r "app/build/outputs/apk/$variant/app-$variant.apk"
adb -s "$serial" install -r "app/build/outputs/apk/androidTest/$variant/app-$variant-androidTest.apk"

# The class list is read into an array up front. Never pipe a list into a loop that runs adb:
# adb inherits the loop's stdin and swallows the remaining lines, which once tested one item
# and reported a clean pass (flick:docs/store/codec-matrix-test.sh:65-67).
classes=()
if [[ $# -gt 0 ]]; then
  for name in "$@"; do
    if [[ "$name" == *.* ]]; then classes+=("$name"); else classes+=("$package.$name"); fi
  done
else
  while IFS= read -r file; do
    if ! grep -q '@Test' "$file"; then continue; fi
    pkg_line="$(grep -m1 '^package ' "$file" | awk '{ print $2 }' || true)"
    classes+=("${pkg_line:-$package}.$(basename "$file" .kt)")
  done < <(find app/src/androidTest -name '*Test.kt' 2>/dev/null | sort)
fi
if [[ ${#classes[@]} -eq 0 ]]; then
  echo "No *Test.kt classes under app/src/androidTest." >&2
  exit 1
fi

mkdir -p .tools/test-logs
failed=()
for class in "${classes[@]}"; do
  log=".tools/test-logs/${class##*.}.log"
  echo "=== $class"
  # AGP's testOptions.animationsDisabled reaches only `./gradlew connected*AndroidTest`, which
  # drives the run through its own test platform. This script calls am instrument itself, so it
  # asks for the same thing here: all three animator scales at 0 for the run, restored after.
  adb -s "$serial" shell am instrument -w -r --no-window-animation -e class "$class" "$runner" </dev/null |
    tee "$log" || true
  if ! grep -q '^OK (' "$log"; then failed+=("$class"); fi
done

echo
if [[ ${#failed[@]} -gt 0 ]]; then
  echo "FAILED (${#failed[@]} of ${#classes[@]}): ${failed[*]}" >&2
  echo "Logs: .tools/test-logs/" >&2
  exit 1
fi
echo "All ${#classes[@]} classes passed on $expected_avd ($variant)."
