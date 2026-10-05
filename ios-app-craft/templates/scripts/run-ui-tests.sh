#!/usr/bin/env bash
# run-ui-tests.sh: runs XCUITest suites on one simulator, set up the way a test process cannot:
# boots it, builds for testing, installs the app, grants its privacy permissions, optionally
# drives a simulated location route, pins the status bar, then runs the suites with a per-test
# time cap and keeps the result bundle.
#
#   scripts/run-ui-tests.sh <simulator-udid | simulator-name> [Suite ...]
#   (no suites: the whole UI test target)
#
# Wire in: put it in <project>/scripts/, chmod +x, and set the defaults below once per app (or
# pass any of them as environment variables). Needs Xcode, and XcodeGen if there is a
# project.yml. Screenshots from AppUITestCase.snap land in build/ui-shots/.
#
# Lessons it encodes:
# - A test process cannot grant permissions or move the simulator, so a script does it. Grants
#   apply to an installed app: build and install first, then grant, then test-without-building.
# - Use one private simulator per project (and per agent): a shared one gets its apps,
#   permissions and location changed under the tests. Create it once:
#     xcrun simctl create "MyApp Test iPhone" "iPhone 17 Pro"
# - Cap every test (TIME_CAP): a hung test fails in minutes, not after an hour of silence.
# - No parallel testing: clones of the simulator get neither the grants nor the route.
# - xcode-select often points at the Command Line Tools, which have no simulators: DEVELOPER_DIR
#   is set to Xcode unless you set it.
# - A fixed status bar (9:41, full battery) keeps screenshots comparable run to run.
set -euo pipefail
export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ---- Per-app settings -------------------------------------------------------------------------
PROJECT=${PROJECT:-MyApp.xcodeproj}
SCHEME=${SCHEME:-MyApp}
CONFIGURATION=${CONFIGURATION:-Debug}
APP_NAME=${APP_NAME:-MyApp}                 # the .app product name
UI_TEST_TARGET=${UI_TEST_TARGET:-MyAppUITests}
BUNDLE_ID=${BUNDLE_ID:-com.example.myapp}
# simctl privacy services to grant, space separated ("" for none). See `xcrun simctl privacy help`:
# all calendar contacts-limited contacts location location-always photos-add photos
# media-library microphone motion reminders siri.
PRIVACY=${PRIVACY-location-always}
# One lap of a simulated route, "lat,lon lat,lon ..." with the first point repeated last, driven
# ROUTE_LAPS times at ROUTE_SPEED m/s. Empty: no route.
ROUTE=${ROUTE:-}
ROUTE_SPEED=${ROUTE_SPEED:-3}
ROUTE_LAPS=${ROUTE_LAPS:-4}
TIME_CAP=${TIME_CAP:-600}                   # seconds per test
STATUS_BAR=${STATUS_BAR:-1}                 # 1: pin 9:41 and a full battery while testing
DERIVED=${DERIVED:-$ROOT/build/dd}
RESULTS=${RESULTS:-$ROOT/build/results}
# -----------------------------------------------------------------------------------------------

usage="usage: run-ui-tests.sh <simulator-udid | simulator-name> [Suite ...]
  Suites run from $UI_TEST_TARGET (all of it when none are named). The per-app settings at the
  top of this script can also be given as environment variables (SCHEME=..., PRIVACY=..., ROUTE=...)."
case ${1:-} in
  -h|--help) echo "$usage"; exit 0 ;;
  ""|-*) echo "$usage" >&2; exit 2 ;;
esac
TARGET=$1
shift

# A UDID as given; otherwise the first available simulator with exactly this name.
resolve_udid() {
  local want=$1
  if [[ $want =~ ^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$ ]]; then
    echo "$want"
    return
  fi
  xcrun simctl list devices available | awk -v name="$want" '
    { line = $0; sub(/^[ \t]+/, "", line)
      if (index(line, name " (") == 1) {
        rest = substr(line, length(name) + 3)
        print substr(rest, 1, index(rest, ")") - 1)
        exit
      } }'
}
UDID=$(resolve_udid "$TARGET")
if [[ -z "$UDID" ]]; then
  echo "No available simulator named \"$TARGET\". Create a private one:" >&2
  echo "  xcrun simctl create \"$TARGET\" \"iPhone 17 Pro\"" >&2
  exit 2
fi

cleanup() {
  if [[ -n "$ROUTE" ]]; then xcrun simctl location "$UDID" clear >/dev/null 2>&1 || true; fi
  if [[ "$STATUS_BAR" == 1 ]]; then xcrun simctl status_bar "$UDID" clear >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b >/dev/null

cd "$ROOT"
if [[ -f project.yml ]]; then
  command -v xcodegen >/dev/null || { echo "project.yml needs XcodeGen: brew install xcodegen" >&2; exit 1; }
  xcodegen generate >/dev/null
fi

echo "building $SCHEME ($CONFIGURATION) for $UDID"
# -quiet may print "error: the following command failed with exit code 0 but produced no further
# output": a tool that printed only a warning. The exit code is what counts, and set -e checks it.
xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration "$CONFIGURATION" -destination "id=$UDID" \
  -derivedDataPath "$DERIVED" build-for-testing -quiet

# Installed before the grants: privacy settings attach to an installed bundle.
APP_PATH="$DERIVED/Build/Products/$CONFIGURATION-iphonesimulator/$APP_NAME.app"
[[ -d "$APP_PATH" ]] || { echo "No app at $APP_PATH (check APP_NAME and CONFIGURATION)" >&2; exit 1; }
xcrun simctl install "$UDID" "$APP_PATH"
for service in $PRIVACY; do
  xcrun simctl privacy "$UDID" grant "$service" "$BUNDLE_ID"
done

if [[ "$STATUS_BAR" == 1 ]]; then
  xcrun simctl status_bar "$UDID" override --time 9:41 --batteryState charged --batteryLevel 100 \
    --cellularBars 4 --wifiBars 3 >/dev/null 2>&1 || true
fi

if [[ -n "$ROUTE" ]]; then
  read -r -a LAP <<< "$ROUTE"
  WAYPOINTS=("${LAP[@]}")
  # Later laps skip the first point: it is the previous lap's last.
  for ((lap = 1; lap < ROUTE_LAPS; lap++)); do WAYPOINTS+=("${LAP[@]:1}"); done
  xcrun simctl location "$UDID" clear >/dev/null 2>&1 || true
  xcrun simctl location "$UDID" start --speed="$ROUTE_SPEED" --interval=1 "${WAYPOINTS[@]}"
  echo "route: ${#WAYPOINTS[@]} waypoints at $ROUTE_SPEED m/s"
fi

ONLY=()
if (( $# == 0 )); then
  ONLY+=("-only-testing:$UI_TEST_TARGET")
else
  for suite in "$@"; do ONLY+=("-only-testing:$UI_TEST_TARGET/$suite"); done
fi

mkdir -p "$RESULTS"
BUNDLE="$RESULTS/ui-$(date +%Y%m%d-%H%M%S).xcresult"
set +e
xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration "$CONFIGURATION" -destination "id=$UDID" \
  -derivedDataPath "$DERIVED" test-without-building -parallel-testing-enabled NO \
  -test-timeouts-enabled YES -default-test-execution-time-allowance "$TIME_CAP" \
  -maximum-test-execution-time-allowance "$TIME_CAP" -resultBundlePath "$BUNDLE" "${ONLY[@]}"
STATUS=$?
set -e
echo "result bundle: $BUNDLE"
echo "screenshots:   $ROOT/build/ui-shots"
exit $STATUS
