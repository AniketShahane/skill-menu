# MyApp

A SwiftUI iPhone app started from the ios-app-craft kit: two kept tabs under a floating bar, Home
cards that fly apart into their page (and back, by button or edge swipe), seeded UI tests, and a
motion check that measures every frame.

## Run

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcodegen generate                                   # after every file add, delete or rename
U=$(xcrun simctl create "MyApp Dev" "iPhone 18 Pro") # once; a simulator of your own, by UDID
xcrun simctl boot $U; xcrun simctl bootstatus $U -b
xcodebuild -project MyApp.xcodeproj -scheme MyApp -destination id=$U -derivedDataPath build/dd build -quiet
xcrun simctl install $U build/dd/Build/Products/Debug-iphonesimulator/MyApp.app
SIMCTL_CHILD_APP_SEED_DIR=$PWD/TestData/seed xcrun simctl launch --terminate-running-process $U com.example.myapp -appReset
open -a /Applications/Xcode.app/Contents/Applications/DeviceHub.app   # Xcode 27's simulator viewer
```

Without a seed the app shows the bundled demo cards (`MyApp/Resources/DemoCards.json`). With
`-appReset` and `APP_SEED_DIR` it starts clean from `TestData/seed/`.

## Test

```bash
(cd MyAppCore && swift test)                        # the core, on the Mac, in seconds
scripts/run-ui-tests.sh $U SmokeTests               # UI tests: builds, installs, 10-minute cap per test
PRIVACY="" scripts/run-ui-tests.sh $U               # every UI suite (the starter needs no permissions)
xcodebuild -project MyApp.xcodeproj -scheme MyApp -destination id=$U -derivedDataPath build/dd \
  test -only-testing:MyAppTests                     # app unit tests (the flight's timing table)
```

Screenshots from `snap()` land in `build/ui-shots/`.

### How the tests control the app

| Switch | Effect | Read by |
|---|---|---|
| `-appReset` | Wipes the data directory and the `settings` defaults suite | `LaunchHooks.prepare` |
| `APP_SEED_DIR=<dir>` | Copies that tree into the data directory (`cards.json`) | `LaunchHooks.prepare` |
| `APP_NOW_MILLIS`, `APP_TODAY`, `APP_TZ` | Pins the clock (the seed is made for 15 Jan 2026, New York) | `LaunchHooks.now/today/calendar` |
| `APP_APPEARANCE=LIGHT\|DARK` | Forces the appearance | `AppModel.colorScheme` |
| `APP_OPEN=tab:settings\|card:<id>` | Opens a page at launch, instantly | `Navigator.openDeepLink` |
| `-appNoMotion` | Motion off (the default in UI tests; the motion journey turns it on) | `AppMotion.reduced` |
| `APP_FRAME_LOG=<file>` | Logs every frame and finger lift, and blinks the status-bar beacon | `FrameProbe` |

## Measure motion

```bash
scripts/motion-check.sh --udid $U --project MyApp.xcodeproj --scheme MyAppMotion \
  --test MyAppUITests/MotionJourneyTests --runs 3 --generate "xcodegen generate"
```

It builds Release, records the journey three times, and checks each moment against
`motion-budgets.json` and `motion-baseline.json`. The first time, accept a baseline on purpose
with `--update-baseline` (it refuses while a budget fails). The report is `build/motion/report.md`.
The simulator runs at 60 Hz; check a ProMotion device with Instruments → Animation Hitches.

## Where things are

| Path | What |
|---|---|
| `MyApp/App/` | `MyAppApp` (FrameProbe first), `AppModel`, `Navigator`, `RootView` (the layer order), `BottomBar`, `Theme` |
| `MyApp/Screens/` | Home (cards), Detail (the card's page), Settings (+ About, a native push), Shared (`CardPart` and the views both ends are built from) |
| `MyApp/Kit/` | The kit, used as is: FrameProbe, LaunchHooks, MotionKit, KeptTabPager, GrowMorph, FadeDialog, and `CardFlight/` (the card-pieces engine; `docs/CardFlight.md` says how to wire and tune it) |
| `MyAppCore/` | Foundation-only logic and its tests |
| `MyAppTests/`, `MyAppUITests/` | Unit tests; UI tests (`AppUITestCase`, `MotionTestCase`, smoke, motion journey) |
| `TestData/seed/` | The UI tests' data, in the app's own file format |
| `project.yml` | The only project source (XcodeGen). The `.xcodeproj` is generated and ignored |

## Unverified here

Signing and a real device (`DEVELOPMENT_TEAM` is empty), 120 Hz on ProMotion hardware.
