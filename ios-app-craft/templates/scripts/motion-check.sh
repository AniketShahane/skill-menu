#!/usr/bin/env bash
# motion-check.sh: the motion guardrail. It builds the app in Release and runs the motion journey
# RUNS times on one simulator, recording the screen while the app logs every frame. Then it measures
# each moment against motion-budgets.json and the accepted numbers in motion-baseline.json.
#
#   scripts/motion-check.sh --udid <simulator> --project App.xcodeproj --scheme AppMotion \
#       --test AppUITests/MotionJourneyTests [--runs 3] [--update-baseline] [--skip-build]
#   (--workspace App.xcworkspace instead of --project; --help for every option)
#
# Exit 0: every moment is inside its budget and nothing got worse than the baseline.
# The report goes to build/motion/report.md (and is printed). Each run's logs, recording and result
# bundle go to build/motion/runs/<n>/.
#
# Wire in: put this script and motion_report.py side by side. motion-budgets.json and
# motion-baseline.json sit next to the project (or pass --budgets/--baseline). Commit both; ignore
# build/. The app needs FrameProbe and the UI tests need MotionTestCase, with the same prefix as
# --env-prefix (default APP_). Make a scheme just for this: the UI test target only, Test action in
# Release, "Debug executable" off, no coverage (XcodeGen: test.config Release, debugEnabled false,
# gatherCoverageData false). Needs Xcode, ffmpeg (brew install ffmpeg) and python3 with numpy.
#
# Lessons it encodes:
# - Measure a Release build with no debugger attached. A Debug build's frames are not the ones
#   users see.
# - Use a simulator of your own. Another session's tests on it end up in the recording.
# - Keep everything around the app still: a fixed status bar, no simulated location.
# - One simulator and no parallel testing. A cloned simulator runs the journey off camera.
# - Start the recorder before the app, and take the video's zero from the recorder's own "started"
#   line, polled every 2 ms. The report lines video and logs up by it.
# - Several runs, reported as the median: the simulator drops a frame now and then at random.
# - The simulator runs at 60 Hz, and XCUITest makes the app answer accessibility reads, so these
#   numbers are pessimistic 60 Hz numbers. Check a ProMotion device with Instruments' Animation
#   Hitches before shipping.
set -euo pipefail

usage() {
  cat <<'EOF'
usage: motion-check.sh --udid UDID (--project P.xcodeproj | --workspace W.xcworkspace) --scheme S --test ID [options]

  --udid UDID          simulator to use: one nobody else is using
  --project PATH       the .xcodeproj (or --workspace PATH for an .xcworkspace)
  --scheme NAME        a scheme whose Test action is Release, debugger off, no coverage
  --test ID            -only-testing identifier, e.g. AppUITests/MotionJourneyTests
  --runs N             journeys to record; the report takes the median (default 3)
  --update-baseline    accept today's numbers as the new baseline (only if every budget holds)
  --skip-build         reuse the last build
  --generate CMD       run before building, in the project folder (e.g. "xcodegen generate")
  --env-prefix P       prefix of the kit's variables (default APP_: APP_MOTION_DIR, APP_FRAME_LOG)
  --budgets FILE       default: motion-budgets.json next to the project
  --baseline FILE      default: motion-baseline.json next to the project
  --out DIR            default: build/motion next to the project
  --timeout SECONDS    per journey (default 900)
EOF
}

# A Command Line Tools xcode-select has no simulators. Use Xcode unless told otherwise.
if [[ -z ${DEVELOPER_DIR:-} ]] && xcode-select -p 2>/dev/null | grep -q CommandLineTools; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi

fail() { echo "motion-check: $*" >&2; exit 2; }

UDID= PROJECT= WORKSPACE= SCHEME= TEST= GENERATE= BUDGETS= BASELINE= OUT=
RUNS=3 UPDATE=0 BUILD=1 PREFIX=APP_ TIMEOUT=900
while (( $# )); do
  case $1 in
    --update-baseline) UPDATE=1; shift; continue ;;
    --skip-build) BUILD=0; shift; continue ;;
    -h|--help) usage; exit 0 ;;
    --udid|--project|--workspace|--scheme|--test|--runs|--generate|--env-prefix|--budgets|--baseline|--out|--timeout)
      [[ -n ${2:-} ]] || fail "$1 needs a value" ;;
    *) echo "motion-check: unknown option $1" >&2; usage >&2; exit 2 ;;
  esac
  case $1 in
    --udid) UDID=$2 ;;
    --project) PROJECT=$2 ;;
    --workspace) WORKSPACE=$2 ;;
    --scheme) SCHEME=$2 ;;
    --test) TEST=$2 ;;
    --runs) RUNS=$2 ;;
    --generate) GENERATE=$2 ;;
    --env-prefix) PREFIX=$2 ;;
    --budgets) BUDGETS=$2 ;;
    --baseline) BASELINE=$2 ;;
    --out) OUT=$2 ;;
    --timeout) TIMEOUT=$2 ;;
  esac
  shift 2
done

[[ -n $UDID && -n $SCHEME && -n $TEST ]] || { usage >&2; exit 2; }
[[ -n $PROJECT || -n $WORKSPACE ]] || fail "give --project or --workspace"
[[ $RUNS =~ ^[1-9][0-9]*$ ]] || fail "--runs must be a whole number of at least 1"
[[ $TIMEOUT =~ ^[1-9][0-9]*$ ]] || fail "--timeout is in whole seconds"

abs() { (cd "$(dirname "$1")" && echo "$PWD/$(basename "$1")"); }
if [[ -n $WORKSPACE ]]; then
  [[ -d $WORKSPACE ]] || fail "no workspace at $WORKSPACE"
  WORKSPACE=$(abs "$WORKSPACE"); ROOT=$(dirname "$WORKSPACE"); CONTAINER=(-workspace "$WORKSPACE")
else
  [[ -d $PROJECT ]] || fail "no project at $PROJECT"
  PROJECT=$(abs "$PROJECT"); ROOT=$(dirname "$PROJECT"); CONTAINER=(-project "$PROJECT")
fi
KIT=$(cd "$(dirname "$0")" && pwd)
BUDGETS=${BUDGETS:-$ROOT/motion-budgets.json}
BASELINE=${BASELINE:-$ROOT/motion-baseline.json}
OUT=${OUT:-$ROOT/build/motion}
# Absolute: the simulator's processes write here, from a different working directory.
mkdir -p "$OUT" && OUT=$(cd "$OUT" && pwd)
DD=$ROOT/build/dd-motion
[[ -f $BUDGETS ]] || fail "no budgets at $BUDGETS (start from the kit's motion-budgets.json)"
[[ -f $KIT/motion_report.py ]] || fail "motion_report.py must sit next to this script"
for tool in ffmpeg ffprobe python3; do
  command -v "$tool" >/dev/null || fail "$tool is not installed (brew install ffmpeg; python3 from Xcode or brew)"
done
python3 -c 'import numpy' 2>/dev/null || fail "python3 needs numpy (pip3 install numpy)"

# The device's name and runtime go into the baseline, so numbers from another device are never
# compared as if they were the same.
DEVICE=$(xcrun simctl list devices -j | python3 -c '
import json, sys
for runtime, devices in json.load(sys.stdin)["devices"].items():
    for d in devices:
        if d["udid"] == sys.argv[1]:
            print(d["name"] + " / " + runtime.rsplit(".", 1)[-1])
' "$UDID")
[[ -n $DEVICE ]] || fail "$UDID is not a simulator on this Mac (xcrun simctl list devices)"

REC=
cleanup() {
  if [[ -n $REC ]]; then kill -INT "$REC" 2>/dev/null || true; wait "$REC" 2>/dev/null || true; REC=; fi
  xcrun simctl status_bar "$UDID" clear >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT TERM

xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b >/dev/null
# Nothing else on screen moves: no simulated route, a fixed status bar.
xcrun simctl location "$UDID" clear >/dev/null 2>&1 || true
xcrun simctl status_bar "$UDID" override --time 9:41 --batteryState charged --batteryLevel 100 \
  --cellularBars 4 --wifiBars 3 >/dev/null 2>&1 || true

if (( BUILD )); then
  if [[ -n $GENERATE ]]; then (cd "$ROOT" && eval "$GENERATE") >/dev/null; fi
  # Release: the frames users see, not a debug build's.
  xcodebuild "${CONTAINER[@]}" -scheme "$SCHEME" -configuration Release -destination "id=$UDID" \
    -derivedDataPath "$DD" build-for-testing -quiet
fi

rm -rf "$OUT/runs"
mkdir -p "$OUT/runs"
for i in $(seq 1 "$RUNS"); do
  RUN=$OUT/runs/$i
  mkdir -p "$RUN"
  rm -f "$OUT/frames.log" "$OUT/marks.log"
  xcrun simctl io "$UDID" recordVideo --codec=h264 --force "$RUN/screen.mp4" >"$RUN/record.log" 2>&1 &
  REC=$!
  # recordVideo prints "Recording started" once it has its first frame. That wall time is the video's
  # zero. One process polls every 2 ms, so neither the poll nor a process start skews it.
  python3 - "$RUN/record.log" >"$RUN/video_start" <<'PY'
import sys, time
deadline = time.time() + 15
while time.time() < deadline:
    try:
        with open(sys.argv[1]) as f:
            if "Recording started" in f.read():
                print(f"{time.time():.6f}")
                sys.exit(0)
    except FileNotFoundError:
        pass
    time.sleep(0.002)
sys.exit(f"the screen recorder never started (see {sys.argv[1]})")
PY
  set +e
  env "TEST_RUNNER_${PREFIX}MOTION_DIR=$OUT" \
    xcodebuild "${CONTAINER[@]}" -scheme "$SCHEME" -configuration Release -destination "id=$UDID" \
    -derivedDataPath "$DD" test-without-building "-only-testing:$TEST" -parallel-testing-enabled NO \
    -test-timeouts-enabled YES -maximum-test-execution-time-allowance "$TIMEOUT" \
    -resultBundlePath "$RUN/result.xcresult" >"$RUN/xcodebuild.log" 2>&1
  STATUS=$?
  set -e
  kill -INT "$REC"; wait "$REC" 2>/dev/null || true; REC=
  if (( STATUS != 0 )); then
    grep -E "error:|failed|Missing|Still on screen" "$RUN/xcodebuild.log" | head -20 >&2 || true
    echo "motion-check: the journey failed on run $i (log: $RUN/xcodebuild.log, result: $RUN/result.xcresult)" >&2
    exit 1
  fi
  [[ -s $OUT/marks.log ]] || fail "no $OUT/marks.log: MotionTestCase wrote its marks elsewhere (check ${PREFIX}MOTION_DIR and motionDirectory)"
  [[ -s $OUT/frames.log ]] || fail "no $OUT/frames.log: the app did not log frames (check FrameProbe.envKey and that startIfRequested() runs at launch)"
  cp "$OUT/frames.log" "$OUT/marks.log" "$RUN/"
  echo "run $i recorded"
done

cleanup
REPORT=(--runs "$OUT/runs" --budgets "$BUDGETS" --baseline "$BASELINE" --out "$OUT/report.md" --device "$DEVICE")
if (( UPDATE )); then REPORT+=(--update-baseline); fi
python3 "$KIT/motion_report.py" "${REPORT[@]}" || {
  s=$?
  (( s == 1 )) && echo "motion-check: look at a failing moment with $KIT/frame_strip.py $OUT/runs/1 <moment> --label" >&2
  exit $s
}
