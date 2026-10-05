# Setup and tooling

The machine, the project file, the simulators and the shell. None of this is craft, but in
Dash every item here cost at least one failed step, and several cost an hour: a stale
binary measured twice, a hung suite with nobody watching it, ~20 tool calls spent finding the
simulator window. Do it right on day one and it stays out of the way.

Templates: `templates/project.yml`, `templates/Config/App.xcconfig`,
`templates/Secrets.example.xcconfig`, `templates/scripts/run-ui-tests.sh`,
`templates/scripts/motion-check.sh`. The app-side hooks that the launch recipes below rely on
are in `architecture.md` §10 and `templates/app/LaunchHooks.swift`. For a new app, run
`templates/scripts/new-app.sh Name dir [--bundle-id id] [--no-sim]`. It does §2–§4 and §7 for you:
it copies `templates/starter/` and the kit, renames, runs XcodeGen, creates a private
"Name Dev" simulator, builds, and runs the smoke tests.

## 0. Survey the machine first

```bash
xcode-select -p                                   # CommandLineTools? then see §1
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcodebuild -version
xcrun simctl list runtimes                        # which iOS runtimes exist
xcrun simctl list devices                         # whose devices exist; don't touch them
command -v xcodegen || brew install xcodegen
command -v ffmpeg ffprobe                         # needed by the motion kit
python3 -c 'import numpy'                         # so is numpy (motion_report.py)
```

- **Note the other sessions' simulators** (Dash found "Dash iPhone QA", "Beam iPhone QA" and
  "beam-ios-alpha" on the machine). They are not yours: never erase, delete or install on
  them, and never use `booted`.
- **Missing runtime:** `xcodebuild -downloadPlatform iOS` (the flag is in Xcode 27's
  `xcodebuild -help`; never run in Dash, which had the runtimes).

## 1. Toolchain: always DEVELOPER_DIR

`xcode-select` can point at `/Library/Developer/CommandLineTools` (it did on Dash's machine).
Then:
- `xcodebuild` fails with "requires Xcode, but active developer directory ... is a command
  line tools instance";
- `xcrun simctl` fails with `xcrun: error: unable to find utility "simctl", not a developer
  tool or in PATH` (`xctrace` likewise).

No `sudo xcode-select -s` needed. Scripts start with
`export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}`; every
interactive command re-exports it (shell state doesn't persist between tool calls); every
parallel agent's brief states it, or each agent rediscovers the failure.

## 2. The project: XcodeGen, never a hand-edited .pbxproj

`project.yml` is the only project source; gitignore the generated `<App>.xcodeproj/`. Why:
9 merges of 7 parallel Dash branches produced zero project-file conflicts, adding a file is
just creating it, and every plist key, scheme and package is reviewable in one file.

**Regenerate** (`xcodegen generate -q`) after every file add, delete or rename, and after
every merge, checkout or rebase. A stale project gives `Build input file cannot be found:
.../Placeholders.swift` for a deleted file (seen in Dash), or `cannot find 'X' in scope` for a
new one (expected, since the file isn't compiled; not seen in Dash). Scripts regenerate
before every build.

### What project.yml holds (template: `templates/project.yml`, where `App` is `MyApp`)

| Part | Setting | Why |
|---|---|---|
| App target | `sources: [App]`, `info.path` + `info.properties`, `configFiles` for Debug and Release | Plist keys live in YAML; the xcconfig brings in secrets |
| Logic package | `packages: AppCore: path: AppCore` | `swift test` in seconds, no simulator (`architecture.md` §2) |
| Remote package | `url:` + a version rule (Dash: MapLibre `from: "6.8.0"`) | See the Package.resolved note below |
| Unit tests | `bundle.unit-test`, `GENERATE_INFOPLIST_FILE: YES` | |
| UI tests | `bundle.ui-testing`, `TEST_TARGET_NAME: App` | |
| Scheme `App` | Build all three; test both test targets; `gatherCoverageData: false` | No coverage unless someone will read it |
| Scheme `AppMotion` | Build App + UI tests; `test: config: Release, debugEnabled: false, gatherCoverageData: false`; UI-test target only | Measure the frames users see. Debug builds and an attached debugger change frame timing (Apple's advice for performance tests) |
| Versions | `MARKETING_VERSION`, `CURRENT_PROJECT_VERSION` in `settings.base`, referenced from the plist | One place to bump |

- **Everything the motion journey needs must exist in Release.** `#if DEBUG` code (Dash's
  `FakeRunDriver`, the debug readout) is absent from the `AppMotion` build, so reset, seed,
  clock, deep link and frame log are launch-env hooks that work in Release; only hardware
  fakes and readouts sit behind `#if DEBUG` (`architecture.md` §10).
- **Package.resolved is not committed.** With a generated project it lives inside the
  gitignored `.xcodeproj` (Dash: `Dash.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/`).
  So `from:` floats to the newest release below the next major on a fresh checkout: Dash's
  `from: "6.8.0"` resolved to MapLibre 6.31.0. Use `exactVersion:` when reproducibility
  matters. (Dash never saw a break from the float; this is a precaution, not a measured fix.)

### Info.plist keys to set on day one

| Key | Value / note |
|---|---|
| `CADisableMinimumFrameDurationOnPhone` | `true`, in `info.properties`. Without it a ProMotion iPhone holds custom animation to 60 Hz, and the 60 Hz simulator never shows it. Why, and the `INFOPLIST_KEY_` caveat: `motion-craft.md` §0 |
| `UILaunchScreen: UIColorName: LaunchBackground` | A colour set in the asset catalog, matching the first screen's background, so the launch doesn't flash |
| `CFBundleShortVersionString` / `CFBundleVersion` | `$(MARKETING_VERSION)` / `$(CURRENT_PROJECT_VERSION)` |
| `UIAppFonts` | Font file names (Dash: `geist_regular.ttf`, …), with the files under the target's sources |
| `NS*UsageDescription` | One per permission, saying what the user gets. iOS 17+ calendar uses `NSCalendarsFullAccessUsageDescription` / `NSCalendarsWriteOnlyAccessUsageDescription` |
| `UIBackgroundModes` | Only what you use (Dash: `location, audio, bluetooth-central`) |
| `CFBundleURLTypes` | The OAuth callback scheme, if any |
| `ITSAppUsesNonExemptEncryption` | `false`, unless you use non-exempt encryption |
| Secret keys | `API_KEY: $(API_KEY)`, from the xcconfig (§3) |

Check the *built* plist, not the YAML:
`plutil -p build/dd/Build/Products/Debug-iphonesimulator/App.app/Info.plist | grep -E 'CADisable|UIAppFonts'`.

## 3. Secrets: a gitignored xcconfig

```
Config/App.xcconfig          (committed)   API_KEY =
                                           #include? "../Secrets.xcconfig"
Secrets.example.xcconfig     (committed)   API_KEY = your-api-key
Secrets.xcconfig             (gitignored)  API_KEY = <real key>
project.yml  info.properties:  API_KEY: $(API_KEY)
```

- **`#include?` (with the `?`)** lets a clean checkout build with an empty key. The app must
  then work, or say plainly why not; Dash falls back to a built-in feature.
- **Read it** with `Bundle.main.object(forInfoDictionaryKey: "API_KEY") as? String`. Treat
  both empty and anything starting with `$(` as "no key". The literal `$(API_KEY)` shows up
  when the xcconfig isn't applied (trim, then
  `raw.hasPrefix("$(") ? "" : raw`).
- **In an xcconfig, `//` starts a comment,** even inside a value: `URL = https://example.com`
  builds as `https:` (checked with `-showBuildSettings`). Write `https:/$()/example.com`.
- **`git worktree add` does not copy gitignored files.** After a merge in a fresh worktree,
  Dash's Settings said the API key was missing. Copy `Secrets.xcconfig` into every new worktree
  yourself.
- **Verify the key reached the build without printing it:**
  `plutil -extract API_KEY raw <App>.app/Info.plist | wc -c` (0: key missing; 1: empty;
  more than 1: set). Never echo a secret into a log or transcript.
- **Private data and the pre-push scan** (gitignore real user data before the first commit;
  scan every unpushed commit for the key's exact value): `delivery-process.md` §10 and §14.
- **This keeps the key out of git, not out of the app.** An Info.plist value is readable by
  anyone with the IPA. For a paid key in a shipped app, put a server in front of it.

## 4. Simulators: private, one per workstream

```bash
U=$(xcrun simctl create "MyApp Port" "iPhone 17 Pro" com.apple.CoreSimulator.SimRuntime.iOS-27-0)
echo "$U port" >> "$SCRATCH/sims.txt"              # record it; you will delete it
xcrun simctl boot "$U" 2>/dev/null; xcrun simctl bootstatus "$U" -b
xcodebuild ... -destination "id=$U" ...            # always by id
# at the end:
while read -r u _; do xcrun simctl delete "$u"; done < "$SCRATCH/sims.txt"
```

- **One per agent/worktree, named `<App> <area>`,** so a human (and other sessions) can tell
  whose it is. Shared simulators get apps reinstalled, permissions changed and routes started
  under your tests. On Dash's Android side, another session installed its own, older build
  (0.10.0) on the shared emulator mid-session.
- **Target by `id=`, never `name=`/`OS=`.** The default device set differs per runtime (iOS
  27 ships "iPhone 18 Pro", not "iPhone 17 Pro"). `name=iPhone 17 Pro,OS=27.0` matched nothing,
  and xcodebuild reported the misleading "Unable to find a device ... My Mac's macOS platform
  doesn't match".
- **Never use `booted` in scripts.** With several simulators booted, simctl "will choose one of
  them" (its own help text).
- **Boot and wait before anything else.** On a shut-down device:
  - a test run fails with "Simulator device failed to launch ...xctrunner ... Unknown
    application display identifier";
  - `privacy grant` fails with "SimError code=405 Unable to lookup in current state:
    Shutdown".
- **Run tests serially** on your one device (why, and the flag: `ui-testing.md` §7).
  XcodeGen schemes already default to `parallelizable = "NO"`.
- **They are big.** Dash's port simulator reached 5.6 GB. Shut down the ones you aren't using,
  and delete them all at the end. Keep one named project simulator only if the user will go on
  testing; write its UDID in the README or memory.
- **Never `simctl erase all` or `delete all`.** They destroy other sessions' devices.
  `delete unavailable` removes only devices the current Xcode's SDKs can't run, so it is safe
  on a one-Xcode machine (Dash's). With a second Xcode installed, it may also delete devices
  that the other Xcode still runs (untested).
- **Prefer per-launch settings to device settings in tests.** Launch args like
  `-UIPreferredContentSizeCategoryName UICTContentSizeCategoryAccessibilityM` and an
  `APP_APPEARANCE` env var last one launch. `simctl ui <udid> appearance dark` and
  `content_size` persist on the device and leak into the next test.

## 5. simctl recipes

| Need | Command | Notes |
|---|---|---|
| Install | `xcrun simctl install $U build/dd/Build/Products/Debug-iphonesimulator/App.app` | Before any grant |
| Grant permission | `xcrun simctl privacy $U grant location-always $B` | Services: `all calendar contacts-limited contacts location location-always photos-add photos media-library microphone motion reminders siri`. Bluetooth and notifications are not grantable, so use a fake or an interruption monitor (`ui-testing.md`). A grant may kill the running app, so grant before launch |
| Drive a route | `xcrun simctl location $U start --speed=3 --interval=1 37.3349,-122.0090 37.3317,-122.0302 …` | Default speed is **20 m/s**. For laps, repeat the waypoints minus the first. `clear` in an `EXIT` trap, or the location keeps moving after you |
| Fixed point | `xcrun simctl location $U set 40.78,-73.96` | |
| Fixed status bar | `xcrun simctl status_bar $U override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3` | For screenshots and motion recordings. It outlives your script until `status_bar $U clear`, so clear it before showing the user |
| Deep link | `xcrun simctl openurl $U 'myapp://item/42'` | |
| Screenshot | `xcrun simctl io $U screenshot shot.png` | Then Read the PNG to look at it |
| Record | `xcrun simctl io $U recordVideo --codec=h264 --force out.mp4 2>rec.err &` | Wait for "Recording started" on stderr. Stop with `kill -INT $pid; wait $pid` (it finalises the file). Default codec is HEVC. It saves only changed frames: read `measuring-motion.md` before analysing |
| App logs | `xcrun simctl spawn $U log show --last 2m --style compact --predicate 'eventMessage CONTAINS "TAG"'` | Needs `NSLog`/`Logger` with a unique TAG. `log show` prints default level and up; add `--info --debug` for `Logger.info`/`.debug`. `print` goes to stdout, not the log: use `simctl launch --console-pty` for that |
| App files | `xcrun simctl get_app_container $U $B data` | Preferences are at `Library/Preferences/<suite>.plist` |
| Keychain | `xcrun simctl keychain $U reset` | The keychain survives uninstall, so a "clean install" isn't (iOS behaviour; Dash has no Keychain use, so untested there) |
| Wipe device | `xcrun simctl shutdown $U; xcrun simctl erase $U` | Only on your own device |
| Crash | `ls -t ~/Library/Logs/DiagnosticReports/App-*.ips` | Reading it: `ui-testing.md` §12 |

- **`simctl privacy grant` hides missing usage strings.** Its help warns that it "can mask
  bugs". Trigger each permission prompt once without the grant, by hand or in one test.
- **The simulator's processes see the Mac's file system.** Pass a repo path in an env var and
  the app reads seed files from it or writes a frame log to it (Dash: `DASH_SEED_DIR`,
  FrameProbe's log). You don't need to dig in containers.

## 6. Showing the app to the user

**Xcode 27 has no Simulator.app** (`open -a Simulator`: "Unable to find application named
Simulator"). The viewer is `/Applications/Xcode.app/Contents/Applications/DeviceHub.app`
(`com.apple.dt.Devices`).
- `--args -CurrentDeviceUDID $U` is ignored, and DeviceHub doesn't remember your pick: on
  reopen it showed another session's device again.
- Its window title kept the other device's name after the switch. Check with a screenshot,
  not the title.
- Older Xcode: `open -a Simulator --args -CurrentDeviceUDID $U` (from memory, not re-verified).

```bash
U=<udid>; B=com.example.myapp
xcrun simctl boot $U 2>/dev/null; xcrun simctl bootstatus $U -b
xcodegen generate -q
xcodebuild -project App.xcodeproj -scheme App -destination id=$U -derivedDataPath build/dd build -quiet || exit 1
xcrun simctl install $U build/dd/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl privacy $U grant location $B
xcrun simctl status_bar $U clear; xcrun simctl location $U clear
SIMCTL_CHILD_APP_SEED_DIR=$PWD/seed xcrun simctl launch --terminate-running-process $U $B -appReset
open -a /Applications/Xcode.app/Contents/Applications/DeviceHub.app
```

- **`SIMCTL_CHILD_<NAME>=value`** puts `<NAME>` into the app's environment (simctl's own
  help). Arguments after the bundle id reach `ProcessInfo.arguments`; only `-key value` pairs
  also land in the defaults argument domain, so a lone flag like `-appReset` is read from
  `arguments`. The user then sees a full app (Dash: 17 runs and a week's plan), not an empty
  first launch.
- **If the seed is dated,** also pin the clock (`APP_NOW_MILLIS`, `APP_TODAY`, `APP_TZ`), or
  "this week" views may be empty on a later day.
- **To reopen later,** relaunch without `-appReset`. The data stays.
- **Pick your row in DeviceHub's list through Accessibility.** This AX path worked on Xcode
  27.0 and is brittle across versions:

```applescript
tell application "System Events" to tell process "DeviceHub"
  set w to window 1
  repeat with r in rows of outline 1 of scroll area 1 of group 1 of splitter group 1 of group 1 of splitter group 1 of group 1 of w
    try
      if value of static text 1 of UI element 1 of r is "MyApp Port" then select r
    end try
  end repeat
end tell
```

- **Verify what the user sees** with `screencapture -x /tmp/s.png` (needs Screen Recording
  permission), then Read the image.
- **Don't raise DeviceHub over the user's terminal while they may be typing.** Tell them:
  "Cmd+Tab → Device Hub, pick <device name> in the left list". Then say what to tap, and what
  can't work in the simulator: no GPS without a route, no Bluetooth, no Apple Music.
- **No window needed:** screenshots via `simctl io screenshot` show the user a screen without
  any viewer.

## 7. Build, install, grant, test

Order: `build-for-testing` → `simctl install` → `simctl privacy grant` → `status_bar
override` / `location start` → `test-without-building`, in
`templates/scripts/run-ui-tests.sh`. Why a script, grants, routes, per-test time caps, serial
runs and not building during a suite: `ui-testing.md` §7. Background runs, watchers and
judging progress over hours: `delivery-process.md` §8.

- **A failed build leaves the old binary in DerivedData,** and `test-without-building` runs it
  without complaint. Dash measured stale code twice this way ("Name clash: the app already has
  a RunClock type. So my last two test runs quietly used an old build"). Use `set -e`, never
  send a build to `/dev/null` without checking its exit code, and treat `--skip-build` as a
  hazard.

## 8. Reading results: noise versus signal

These appear on passing runs. Ignore them:

| Line | Meaning |
|---|---|
| `IDELaunchParametersSnapshot: debugger version lookup failed for path '<nil>': noURL` / `no debugger version` | Every app launch in a UI test |
| `Failure collecting diagnostics from simulator: Process exited with error 72: xcrun: error: unable to find utility "simctl"` | End of every Dash test run, even with `DEVELOPER_DIR` exported. If *your own* `simctl` call prints `unable to find utility "simctl"`, `DEVELOPER_DIR` is missing |
| `error: the following command failed with exit code 0 but produced no further output` (with `-quiet`) | A tool printed only a warning. The exit code is what counts |

Not noise, but not failures:
- `<unknown>:0: warning: ... This method can cause UI unresponsiveness if invoked on the main
  thread` (`CLLocationManager`) or `... AVAudioSession_iOS.mm:978 This method can lead to UI
  unresponsiveness if called on the main thread`. These are real main-thread calls, listed
  under `runtimeWarnings` in `xcresulttool get test-results summary`. Fix them when they sit on
  a motion path.

**Signal:** the exit code; the final `** BUILD|TEST|TEST EXECUTE SUCCEEDED|FAILED **` line
(`test-without-building` prints `TEST EXECUTE`); and **`Restarting after unexpected exit,
crash, or test timeout`**, meaning a test crashed or hung. The "Executed 0 tests, with 0
failures" lines after it describe the relaunch, not the run: Dash's 26 Sep full-suite log,
where the real-location test died about 3 minutes in, ended with exactly that, then
`** TEST EXECUTE FAILED **`. Grepping for `error` alone gets it wrong:

```bash
grep -E '^\*\* (BUILD|TEST|TEST EXECUTE) (SUCCEEDED|FAILED) \*\*|Restarting after unexpected exit|Test Case .* failed \(' build/ui.log
xcrun xcresulttool get test-results summary --path build/results/ui.xcresult | python3 -c \
  'import json,sys; d=json.load(sys.stdin); print(d["result"], d["passedTests"], "passed", d["failedTests"], "failed", d["skippedTests"], "skipped")'
```

- **Pass `-resultBundlePath` with a fresh, timestamped path;** xcodebuild won't reuse an
  existing one. Without the flag, the bundle lands in `<derivedData>/Logs/Test/`.
- **Compare the passed count with the count you expect** (Dash on 26 Sep: 113 UI, 76 unit,
  447 core; the 27 Sep full UI run executed 114). "Passed" with fewer tests is a failure.
- For failure triage (failure messages, attachments, the last frame of the recording), see
  `ui-testing.md`.

## 9. DerivedData and disk

- **Give each worktree its own `-derivedDataPath`,** and each configuration its own inside it:
  `build/dd` (Debug), `build/dd-motion` (Release); gitignore `build/`. The product path is then
  fixed for `simctl install`, parallel agents never share caches, Debug and Release don't
  evict each other, and deleting `build/` frees everything. (Default otherwise:
  `~/Library/Developer/Xcode/DerivedData/<Project>-<hash>/`, shared with the Xcode GUI.)
- **Sizes (Dash, measured):** `dd` 462 MB, `dd-motion` 513 MB, motion recordings 577 MB,
  screenshots 107 MB, the port simulator 5.6 GB. Times seven parallel areas is an estimated
  tens of GB (not measured).
- **Each fresh DerivedData resolves the SPM packages again,** a network fetch (MapLibre is a
  binary). Pointing `-clonedSourcePackagesDirPath` at one folder outside the worktrees could
  share them; a per-worktree path like `build/spm` would not. Unverified in Dash.

## 10. macOS shell traps

| Trap | Symptom | Instead |
|---|---|---|
| BSD `sed` has no `\b` | No error and no match. Dash's renames were silently skipped, and the build failed | `perl -pi -e 's/\bOld\b/New/g' files` |
| BSD `sed -i` needs a suffix argument | `invalid command code` | `sed -i '' 's/a/b/' f`, or perl |
| No `timeout`/`gtimeout` | `command not found` | `perl -e 'alarm shift; exec @ARGV' 600 cmd args` (exit 142 on expiry); for tests, xcodebuild's own time allowances |
| `date -d` | `illegal option -- d` | `date -v-15M +%Y-%m-%dT%H:%M:%S`; parse with `date -j -f` |
| `find -newermt '-15 minutes'` in Claude Code's shell | `bfs: error: ... Invalid timestamp` (there `find` is a shell function running bfs; `/usr/bin/find` accepts it) | `find . -mmin -15` |
| `stat -c` | `illegal option -- c` | `stat -f '%z %Sm' f` |
| zsh aborts on an unmatched glob | `no matches found: --include=*.kt`, and the command never runs | Quote it: `--include='*.kt'` |
| zsh doesn't word-split `$VAR` | `L="a b"; for x in $L` loops once, over "a b" | Use an array, or `${=L}`; write scripts in bash |
| zsh arrays are 1-based | `${A[1]}` is the first element (bash: `${A[0]}`) | Be explicit about which shell a script targets (`#!/usr/bin/env bash`) |
| `/bin/bash` is 3.2 | No `mapfile`, `declare -A` or `${x,,}` | Write bash-3.2 scripts, as the templates are |

## 11. Confirm an API against this SDK

Before building on an API you remember, check that it exists with that signature in the
installed SDK:

```bash
SDK=$(xcrun --sdk iphonesimulator --show-sdk-path)
# SwiftUI*.framework matches SwiftUI and SwiftUICore: much of SwiftUI (Spring, visualEffect,
# contentTransition, KeyframeAnimator) is declared in SwiftUICore, so grepping SwiftUI alone
# reports "missing" for APIs that exist.
grep -n 'func onScrollGeometryChange' "$SDK"/System/Library/Frameworks/SwiftUI*.framework/Modules/*.swiftmodule/arm64-apple-ios-simulator.swiftinterface
# Stronger: typecheck a probe file at your deployment target (catches availability too).
xcrun --sdk iphonesimulator swiftc -typecheck -target arm64-apple-ios18.0-simulator probe.swift
```

For Apple's documentation as JSON (abstract, declarations, availability), fetch
`https://developer.apple.com/tutorials/data/documentation/<framework>/<symbol>.json`, for
example `.../metrickit/hitchtimemetric.json`. Dash's research pass read docs this way (URL
pattern re-checked 27 Sep 2026).

## 12. Clean up (part of "done")

1. `status_bar clear` and `location clear` on every device you touched (Dash's
   `run-ui-tests.sh` clears the route in an `EXIT` trap; the template also clears the status
   bar). Kill recorders (`pkill -INT -f recordVideo`) and any `until` loops.
2. Delete the per-area simulators from your recorded list; keep one only as §4 says.
3. Worktree removal, the source-untouched check (a **three-dot** diff; two-dot misreports once
   main moves) and the rest of the wrap-up: `delivery-process.md` §10 and §13. A removed
   worktree takes its gitignored `build/` and `Secrets.xcconfig` with it.
4. New tooling lessons go in `lessons-log.md`.

**Out of scope here (not done in Dash):** installing on a real iPhone. It needs a
`DEVELOPMENT_TEAM`, signing and a provisioning profile. The template leaves
`DEVELOPMENT_TEAM: ""`, which is fine for the simulator only.
