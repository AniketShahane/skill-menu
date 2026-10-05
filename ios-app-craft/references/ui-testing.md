# End-to-end UI testing a SwiftUI app with XCUITest

How to make XCUITest a trustworthy, affordable check on a SwiftUI app. Every test starts from a
known world, finds elements the way VoiceOver does, touches the screen the way a thumb does, and
when it fails, the result bundle says why. Dash evidence (114 functional UI tests plus one
motion journey, 76 app unit tests, 447 core tests, all green) is there to show why each rule
exists; the numbers are not targets.

Templates: `templates/uitests/AppUITestCase.swift` (base class), `templates/app/LaunchHooks.swift`
(the app side of the contract), `templates/scripts/run-ui-tests.sh` (runner),
`templates/uitests/MotionTestCase.swift` (motion journey).

## 0. Layers: put each check where it is cheapest

| Layer | Covers | Dash cost |
|---|---|---|
| Core package (`swift test`, host) | All pure logic: engines, formatters, plan rules | 447 tests in seconds |
| App unit tests (`@testable import App`) | Controllers and view models via fake services and a manual clock; permission logic | 76 tests |
| UI tests | Wiring, persistence across relaunch, rendering at extremes, journeys, screenshot tours | 114 tests, 52 min |
| One real-hardware-path UI test | Real CoreLocation on a `simctl` route, permissions, the real save | 1 test |
| Motion journey (Release, recorded) | Frame timing and pops, measured rather than asserted inline | `measuring-motion.md` |

A UI test costs about 27 s; a logic check costs microseconds. If an assertion doesn't need
pixels, a relaunch or cross-screen wiring, move it down a layer.

## 1. The launch contract (build it before the first screen)

The app reads every switch at **one seam**: the app model's `init`, before any store opens
(`LaunchHooks.prepare(dataDirectory:defaultsSuites:)`), plus the root view's `.task` for deep
links. Document the whole contract in the base test class's header comment.

| Switch | Effect | Why |
|---|---|---|
| `-appReset` | Delete the data dir, every `UserDefaults` suite by name, and keychain items if the app keeps any | Anything that survives leaks into the next test. The keychain survives reinstall, and `LaunchHooks.prepare` doesn't clear it: add a `SecItemDelete` per item class (Dash kept nothing there) |
| `APP_SEED_DIR=<Mac path>` | Copy production-format files into the data dir | The simulator reads the Mac's disk; the seed also exercises the real decoder |
| `APP_TODAY`, `APP_NOW_MILLIS`, `APP_TZ` (+ process `TZ`) | Pin the calendar | "Yesterday", streaks, week bounds, done/missed all depend on the date |
| `-appNoMotion` | Reduced flag, OR'd with `isReduceMotionEnabled` | Settled, deterministic screens; quick idle waits |
| `APP_APPEARANCE`, `APP_UNITS`; `-AppleLanguages (en) -AppleLocale en_US` | Override preferences after load | Every machine renders the same page. *Unverified:* the locale arguments are the standard argument-domain override, but neither Dash nor the template passes them (Dash relied on the simulator's en_US) |
| `APP_OPEN=kind:arg` (`tab:2`, `item:<id>`) | Open a page at launch with `instant: true` | Page tests and shots skip navigation; journeys still tap |
| `APP_FAKE_<SERVICE>=<state>` (`found`, `none`, `failed`, `denied`, `off`) | Scripted fake, `#if DEBUG` | Hardware and services the simulator lacks |
| `APP_FAIL_<X>=1`, `APP_<X>_NOTICE=…`, `APP_SYNC_URL=https://127.0.0.1:9` | Force error and denied states; the URL is a dead port | Unhappy paths are as testable as the happy one |
| `APP_NO_<PAID>_KEY=1` | Blank the API key | Same state on every machine, key or not |
| `APP_NO_TILES=1` | Offline stand-ins for maps, remote images, avatars | No `sleep(4)` for tiles; online and offline shots match. *Dash only half did this:* its switch covers route snapshots, no test sets it, and two tests still `sleep(4)` |
| `APP_DEBUG_<X>=1` | Near-invisible readout and controls | Assert internal state without depending on the design |
| `APP_FRAME_LOG=<path>` | Frame probe | `measuring-motion.md` |

- **Seed in the app's own on-disk format, from a deterministic generator** (`--today`,
  `--seed`, every variant; the generator rules are in `porting-from-android.md`, "Seed data").
  Add **one test that the whole seed loaded**, by count and every id (Dash: `"17 runs · "` and
  all 17 ids). Dash's seed README records why: `SessionPlan` checks every field, and one
  out-of-range value silently drops the whole run file, which then looks like a UI bug, not a
  seed error. Keep real user data gitignored, behind an opt-in flag. Assert against the seed's
  values, not reference screenshots: Dash's reference shots held 3 real runs that weren't in the
  seed (113.6 vs 124.8 km).
- **Pin the calendar only.** Route every `now`, `today` and zone through the seam. Monotonic
  clocks stay real, so timers and animations run. *Likely, not proven:* also put `TZ` in
  `launchEnvironment`, since a stray `DateFormatter` or `Calendar` on `TimeZone.current` bypasses
  the seam. Dash set it in one suite only; the template sets both `APP_TZ` and `TZ`.
- **The reduced flag also stops perpetual motion** (`repeatForever`, `TimelineView`, shimmers).
  XCUITest waits for idle after every action (2554 times in one Dash run), so looping motion
  lengthens every step. *Likely, not measured:* Dash gated two of its three `repeatForever`
  loops (the route-thumbnail shimmer slipped through) and never measured the ungated cost.
- **Fakes sit behind the same protocol seam as the real services** (`architecture.md` §8). They
  drive the *real* controller, engine and persistence, with only the input scripted. **Pace fake
  states in seconds:** a wait polls about once a second (§3), so a state that lasts less can be
  missed. Dash's scripted heart-rate scan first moved on within 0.5–1.8 s, and tests failed
  with `Missing heart_rate_search_empty` (the "Searching nearby…" state). It now searches for
  4 s before sensors appear (1.5 s before "nothing found").
- **Two locks on paid APIs:** the key-hiding flag, plus a guard in the paid path that refuses to
  run under `-appReset` or when `XCTestConfigurationFilePath` is set.
- **Debug overlays sit at opacity 0.05, not 0** (why: `swiftui-gotchas.md` §3). Dash's run
  readout: font size 6, ids such as `debug_run_status`.
- **Test-only anchors** are for controls whose accessibility frame lies (3D wheels, custom
  sliders). Add an invisible element with `.accessibilityHidden(!LaunchHooks.flag("NoMotion"))`,
  so VoiceOver users never meet it, and compute coordinate taps from it.
- **Values from outside the test:** `TEST_RUNNER_<NAME>` in xcodebuild's environment reaches the
  test runner (not the app) with the prefix stripped, so forward it into `launchEnvironment`;
  `SIMCTL_CHILD_<NAME>` does the same for `simctl launch` when showing the app to a person
  (`setup-and-tooling.md` §6).

## 2. Identifiers and state

- **Naming:** `<screen>_<kind>_<entityId>`, with ids from the seed (`activity_<id>`,
  `planned_face_<id>`, `plan_day_<yyyy-mm-dd>`); actions are `<entity>_<verb>_<id>`. When
  porting, reuse the source app's test tags verbatim. Prefixes keep `firstMatch` on the right
  screen when kept pages show the same entity.
- **Where ids survive** (a `.contain` screen container plus a separate id on its `ScrollView`;
  ids on plain stacks, single-child wrappers, whole-card `Button`s and
  `.accessibilityAction(.escape)` swallowing children; drawn composites; ghosts and covered
  pages hidden) is in `swiftui-gotchas.md` §3. What it means for tests:
  - Check a screen by its container id (`home_screen`); scroll its `ScrollView` id (`home_list`).
  - When a card is one sentence (`.ignore` plus a composed label), assert the label
    (`hasPrefix("Morning tempo, Yesterday, 7.48 km · 40:00")`): it also checks what VoiceOver
    says.
  - A missing element can masquerade as an app bug: Dash's "back crashes the app" was really
    `Failed to tap detail_back: No matches found` (an escape action had merged the page).
- **Expose state through VoiceOver's channels, never colours:** the `.isSelected` trait,
  `.accessibilityValue` status words ("Done", "Missed"), and a native `Toggle`'s `"1"`/`"0"`.
  Assert `isSelected` and `value`.
- **Queries:**
  - Your own elements, type-agnostic: `app.descendants(matching: .any)[id].firstMatch` (SwiftUI
    changes an element's type when you refactor).
  - System UI, typed: `app.alerts["Finish your run?"].buttons["Finish & save"].firstMatch` (Dash
    added `.firstMatch` to alert buttons after a failure there; *likely* a duplicate match, the
    cause wasn't recorded). Menu items: `app.buttons[label]` (menus can drop your id).
  - Lists: `NSPredicate(format: "identifier BEGINSWITH %@", "activity_")`; read generated ids
    back from `.identifier`. Containment proves structure without coordinates:
    `el("plan_day_\(d)").descendants(matching: .any)["planned_run_\(id)"]`.
  - Never hard-code bar x positions: the selected tab widens.

## 3. The base class

`AppUITestCase` is `@MainActor` (the SDK marks XCUIApplication and XCUIElement `@MainActor`;
Swift 6 mode enforces it) and sets `continueAfterFailure = false`. It provides:
- `launch(…)`: reset, seed, pinned clock and zone, appearance, motion, deep link, extra env and
  arguments; `relaunchKeepingData()` for persistence tests.
- Finding and waiting: `el`, `idle`, `waitUntil` (poll any condition), `waitFor`,
  `waitForHittable`, `waitUnreachable` (reach, §4), `waitForAbsence` (only for things really
  removed), `waitForValue`, `waitStill` (sheets and detents spring into place).
- `reveal`/`tapRevealed`, `scrollToTop`, `snap`, `answerSystemAlerts`.

`MotionTestCase` inherits it, so the motion journey launches with the same seed and clock.
Forward `file: StaticString = #filePath, line: UInt = #line` through every helper you add, so
failures point at the caller, and `snap` before asserting on a path that can fail.

**Every wait checks once straight away** (the template does). On Xcode 27, `waitForExistence`
makes its first check 1.00–1.08 s after it starts (mean 1.04 s over all 606 waits in Dash's
full run) and never returns before that check, so a wait for an element already on screen
still costs a second. In Dash's log: `Waiting 10.0s for "run_details"` at 8.75 s, first check
at 9.82 s. A bare `exists` takes ~0.08 s (median, same log). `XCTNSPredicateExpectation` waits
the same way (a wait for `exists == 0` started at 17.68 s first checked at 18.77 s).

## 4. exists, isHittable, and what a thumb reaches

| Property | True means | It does not mean |
|---|---|---|
| `exists` | In UIKit's automation tree | On screen, or visible to VoiceOver. Dash's failure hierarchy listed a kept Plan page parked at x = 1206, and a covered page's header. |
| `isHittable` | Has a hit point inside the window | The tap reaches it. A floating bar on top takes the tap; carousel items outside the window can say true. |
| `frame` | Screen coordinates (the window's, for a full-screen iPhone app), now | Settled: a sheet may still be springing |

- **Assert "covered" by reach, never by absence.** XCUITest reads UIKit's automation elements,
  which still include views VoiceOver no longer sees, so `waitForNonExistence` on a covered child
  fails even when the app is right. Use the template's `waitUnreachable(el("home_screen"))`
  (gone, or not hittable), or `XCTAssertFalse(el("nav_home").isHittable)` for a one-off check.
- **Assert "on screen" with frames:** `app.windows.firstMatch.frame.contains(e.frame)`.

## 5. Reveal before every tap

XCUITest taps a point. When the element sits under a floating tab bar or FAB, `isHittable` is
still true but the bar takes the tap, and the failure surfaces steps later. So `reveal` scrolls
until the frame lies inside `[scroll.minY + topClearance, window.maxY − bottomClearance]`. Dash
used 60–70 pt at the top and 110–200 pt at the bottom, per bar.
- It drags by the distance needed, capped at 300 pt, with a slow press-drag at x ≈ 0.9 (clear of
  controls and reorder edge bands).
- It picks the direction from the element's position and caps the tries at 14. An element taller
  than the band only needs its top on screen.

**Never call `app.tap()`.** It taps the window's centre; in Dash, that finished a live run. **On
composite cards, tap a dedicated sub-target** (the header text): a centre tap on Dash's Home
chart picked a week instead of opening the card.

## 6. Gestures that behave like a thumb

| Need | Gesture | Why |
|---|---|---|
| Exact scroll | `p.press(forDuration: 0.05, thenDragTo: p.withOffset(CGVector(dx: 0, dy: dy)), withVelocity: .slow, thenHoldForDuration: 0.1)`, `p` at dx 0.9–0.95 | `swipeUp` flings a velocity-dependent distance |
| Fling / coarse scroll | `swipeUp(velocity: .fast)` | A hand-rolled press-drag "fling" was too weak: "Home won't scroll" was the test's fault |
| Back | `app.coordinate(withNormalizedOffset: CGVector(dx: 0.005, dy: 0.5)).press(forDuration: 0.05, thenDragTo: <dx 0.9>, withVelocity: .fast, thenHoldForDuration: 0)` | A held or slow drag runs a different path in interactive pop and custom back |
| Drag and drop | `press(forDuration: 0.9, thenDragTo: to, withVelocity: .slow, thenHoldForDuration: 0.4)`, with the source centred first | The hold lets the drop target register |
| Carousel | Horizontal drag clamped to ±300 pt with a hold, until the card's frame is inside the window | `isHittable` can't be trusted there |
| Slider | `adjust(toNormalizedSliderPosition:)`, or a tap at `inset + i/(n−1)·(width − 2·inset)` | `XCUIElement` has no `increment()`/`decrement()` (none in the Xcode 27 SDK on any platform): "has no member increment" |
| Wheel | `adjust(toPickerWheelValue:)` for UIPickerView; a custom wheel takes a tap at `anchor.midY ± rowHeight` | A 3D drum's frame includes its rows |
| Chart | `coordinate(withNormalizedOffset: CGVector(dx: 0.03, dy: 0.5)).tap()`; scrub by press-dragging from 0.9 to 0.0 | |
| Dismiss a sheet | `sheet.swipeDown(velocity: .fast)`, or tap the dim at (0.5, 0.15) | |
| Type | Tap the field, `typeText`, then tap the next button **with the keyboard still up** | It exposes buttons the keyboard covers |

Keep drags out of the bottom ~220 pt (Dash's margin, which also clears the bar): a drag at the
home indicator sends the app home. A pull-down at the top of a `.navigationTransition(.zoom)`
page dismisses it, so leave it by the edge swipe.

## 7. The runner script: what a test process cannot do

`run-ui-tests.sh <udid|name> [Suite…]` runs, in order: boot + `simctl bootstatus -b` →
`xcodegen generate` → `build-for-testing` → `simctl install` → `simctl privacy <udid> grant
<service> <bundle>` → status-bar override (`--time 9:41 …`, so shots compare) → route →
`test-without-building`.

A test process can't grant permissions or move the simulator, grants attach to an *installed*
bundle, and a shut-down device fails both grants and tests. The simctl recipes, the service
list, the route command and the exact errors are in `setup-and-tooling.md` §4–5. What the tests
depend on:

- **Permissions:** grant ahead. For a denied state, `revoke` before launch (simctl warns a
  permission change can terminate a running app), or use a fake. Keep `answerSystemAlerts` (an
  `addUIInterruptionMonitor`) as a fallback, listing the titles your alerts use (Dash:
  `"Allow While Using App"`, `"Allow Once"`, `"Allow"` for location; `"Allow Full Access"`,
  `"Allow"`, `"OK"` for calendar). It fires only on the *next interaction* with the app, so make
  that one harmless.
- **Location:** the route is global: any test that starts tracking gets fixes (§8).
- **Time caps, always:** `-test-timeouts-enabled YES -default-test-execution-time-allowance 600
  -maximum-test-execution-time-allowance 600`. Uncapped, one Dash test stuck on `Timed out while
  evaluating UI query` held the full UI run for ~35 hours (`delivery-process.md` §7). A test's
  own `executionTimeAllowance` (default 10 min, rounded up to whole minutes, enforced only with
  timeouts on) can't exceed the maximum, so with both at 600 no test gets longer: raise the
  maximum when one needs it.
- **Run serially** (`-parallel-testing-enabled NO`): clones get neither the grants nor the
  route, and host-path writes (shots, marks) would collide. Keep `-resultBundlePath`.
- **Private simulator, quiet machine:** judge runs by exit code, not xcodebuild noise, and
  don't build while a suite runs (Dash put one "flaky" failure down to a build running
  alongside).
- **Loop:** iterate on one test (`-only-testing:AppUITests/Suite/testName`), then the suites the
  change touches; before merging, smoke, then the full suite.

## 8. Relaunch, persistence, side effects

- **To test persistence, relaunch without `-appReset`** and drop the one-shot env: the seed dir
  (re-seeding overwrites what the test saved), deep links, forced notices, injected tokens.
- **Before `terminate()`, wait for the write to land.** Poll a readout, or wait for the UI change
  that follows the save. Dash's `sleep(1)` worked but is the weak form.
- **Finish what you start.** With location granted, a Dash Start test began a *real* run, and the
  relaunch landed on a recovered-run summary.

## 9. Rendering at extremes, and screenshot tours

- **Every screen suite also runs:** dark; large text (`-UIPreferredContentSizeCategoryName
  UICTContentSizeCategoryAccessibilityM`); the worst-case fixture; and a reach check on covered
  pages. Layout breaks and VoiceOver leaks show up only there.
- **Assert large text by geometry, not pixel diffs:** `panel.contains(value.frame.insetBy(dx: 1,
  dy: 1))`, `XCTAssertFalse(a.frame.intersects(b.frame))`, key controls `isHittable`. Dash ran
  its ultra fixture (5:47:12, 104.88 km) in 4 units × 2 text sizes.
- **Verify a theme switch by pixels.** Average the brightness of a page-margin strip from
  `XCUIScreen.main.screenshot()`: below 0.2 is dark, above 0.8 is light. Check it live and after a
  relaunch. An accessibility value can say "Dark" while the page still renders light.
- **Loop themes and units inside one test,** with `terminate()` between; mind the cap (Dash's
  slowest test took 136 s).
- **`snap(name)`** writes `build/ui-shots/<name>.png` straight to the Mac, plus a `.keepAlways`
  attachment. Name shots `<screen>-<state>-<theme>[-large]`. When porting, embed the reference
  number (`start-24-light` ↔ `24-start-light.png`). `idle(0.5…1.5)` before a snap only when
  motion is on or a sheet just presented. A Dash run left 250 PNGs.
- **Review each tour as one contact sheet per theme** (stitched with PIL): one look, not 40 files.

## 10. Journeys across every screen

Run **smoke** first (2 tests, 17.6 s: the launch shows the main chrome; each tab switches and
reports `isSelected`), which catches a broken launch before a 50-minute run. Then the per-area
suites, then **end-to-end journeys** through the real controller with scripted input and real
persistence:
- empty install → start, pause/resume, finish → summary → lists → open → delete → empty;
- plan → Start loads it → run → marked done;
- one setting (units) reaching every page;
- tours in light and dark.

Dash's area suites passed against placeholders; only the journeys proved the screens connected.

- **Tap only what is visible and clear of overlays.** When a thumb-realistic test fails, fix the
  app. Dash's keyboard covered a sheet's Cancel and Save; the fix grew the sheet, scrolled the
  buttons into view and added a Done key.
- **Compute expected numbers with independent arithmetic** (SI conversions in the test), so the
  app's formatter is never its own oracle.
- **Normalise system time strings:** iOS puts U+202F before AM/PM (`("Start, 6:00 PM") is not
  equal to ("Start, 6:00 PM")`). Use `.replacingOccurrences(of: "\u{202F}", with: " ")`.
- **System sign-in sheets:** point `APP_FAKE_SIGNIN` at a fake authorize URL and use an ephemeral
  session (Dash: SwiftUI's `webAuthenticationSession.authenticate(using:callback:
  preferredBrowserSession: .ephemeral, additionalHeaderFields:)`, with
  `ASWebAuthenticationSessionError.canceledLogin` treated as no error). Its Cancel appears as
  `app.buttons["Cancel"]`; allow ~15 s. Assert that cancelling shows no error.

## 11. Unit tests for the app layer

Build controllers from an environment of protocols and closures (`architecture.md` §8): a fake
location source with `answer(access)`, a `TestClock` for monotonic and wall time, `autoTick =
false` driven by `tickNow()`, a temp-directory repository with callbacks on main, and no voice
(`makeVoice` returns nil). Ninety seconds of running, pause and resume, checkpoint recovery and
every permission answer then run instantly and deterministically. Permission logic, cue timing,
recovery and view-model rules belong here, not in UI tests.

## 12. Reading a failure: look before theorising

Most Dash failures were test assumptions, accessibility semantics or load noise, not app bugs.

1. **Failure text:** `xcrun xcresulttool get test-results summary --path R.xcresult` →
   `.testFailures[].failureText`.
2. **Attachments:** `xcrun xcresulttool export attachments --path R.xcresult --output-path out
   [--only-failures]`; `manifest.json` maps exported files to names. A failed query attaches,
   flagged as the failure's (checked on Xcode 27 against Dash's `plan-diag.xcresult`):
   - **"App UI hierarchy"** `.txt`: the whole automation tree with frames, ids, labels, values
     and traits. Grep it for your id first.
   - **"UI Snapshot"**: the same tree as a keyed-archive binary plist, *not* a screenshot.

   The full export adds a **"Debug description"** `.txt` of the query chain (one per attempt,
   not flagged as the failure's), the screen recording (`.mp4`) and your snaps. Dash's bundle
   held no automatic failure screenshot, so for the end state:
   `ffmpeg -sseof -4 -i rec.mp4 -frames:v 1 end.png` (how Dash saw the keyboard covering Save).
3. **In the test:** print `app.debugDescription`, filtered to your prefix, before editing a query.
4. **Crash:** the newest `~/Library/Logs/DiagnosticReports/<App>-*.ips` is JSON after its first
   line. Print the thread with `"triggered": true`: each frame's `symbol`, `sourceFile` and
   `sourceLine` (when symbolicated), and `usedImages[imageIndex].name`. Dash went straight to
   `closure #1 in AppModel.init()`.
5. **Logic and saved state:** tag it with `NSLog("TAG …")` and read the preferences plists; the
   `log show` and container recipes are in `setup-and-tooling.md` §5.
6. **Reproduce** in a throwaway `DiagUITests.swift` that prints `DIAG <label> <time>`. Delete it
   before committing.
7. **Rerun the failing test alone,** on a quiet machine, before believing it.

## 13. Flakes: symptom → cause → fix

| Symptom | Cause | Fix |
|---|---|---|
| Wrong page opens; failure comes later | Tap landed on a floating bar | `reveal` into the clear band |
| Not found after a scroll | `swipeUp` overshot | Slow press-drag of the needed distance |
| Coordinate tap in a sheet hits the wrong row | Sheet still springing | `waitStill(anchor)` first |
| Intermediate state never seen | Fake moved on in < 1 s | Pace fake states in seconds |
| Equal-looking strings differ | U+202F in times | Normalise |
| Relaunch lands on a "recovered" screen | A real flow was left running | Finish flows before relaunching |
| Saved data gone after relaunch | Reset or seed passed again, or killed mid-write | `relaunchKeepingData`; wait for the write |
| Screenshots differ between machines | Tiles, a real key, the Mac's zone, the status bar | `APP_NO_TILES`, key flag, `TZ`, status-bar override |
| Passes alone, fails in the suite | Building at the same time, or a shared simulator | Quiet machine, private simulator |
| App goes home mid-test | Drag in the bottom ~220 pt | Start drags higher |
| Covered page "still exists" | XCUITest reads UIKit automation elements | Assert `hittable == false` |
| Menu item not found by id | Menus drop identifiers | `app.buttons[label]` |
| A run hangs for hours | No per-test cap | Timeouts on in the runner |
| A fix "doesn't work" | The old binary ran after a compile error | Grep the build output for `error:` first |

## 14. What the harness costs

- **Time:** 114 Dash tests took 3141 s serially. That is 169 launches at ~4.5 s each (the first
  query at t = 4.58 s), ~27 s per test, and 136 s for the slowest. So: one launch per test where
  possible, deep links instead of navigation, variants looped inside a test, logic in the lower
  layers.
- **Accessibility is on.** XCUITest is an accessibility client, so every action and query costs
  the app main-thread time (Dash: 42% of main-thread samples in accessibility, ~33 ms per tap),
  and accessibility flips cost frames. Never judge performance from functional tests; the
  harness floor and timed windows are in `measuring-motion.md`, the flips in `motion-craft.md`
  §9.

## 15. The motion journey

One test, launched with motion on, walks every animated moment and marks it for the frame log
and screen recording; it runs on its own Release scheme, several times, fails on budgets, and
keeps queries outside the timed windows. See `measuring-motion.md` and
`templates/uitests/MotionTestCase.swift`. Functional suites stay on `-appNoMotion`.

## 16. Not covered in Dash (unverified; add next time)

- **Backgrounding and process death mid-flow:** `XCUIDevice.shared.press(.home)`, `app.activate()`,
  `terminate()` mid-flow, then relaunch (Dash covers recovery only in unit tests).
- **Accessibility audit:** `try app.performAccessibilityAudit()` on each main page.
- **Notification permission:** `simctl privacy` has no such service; use the monitor or a fake.
- **Smoothness at 120 Hz on a device:** `XCTHitchMetric(application: app)` (iOS 26+), or
  Instruments → Animation Hitches.
- **Parallel clones:** only once shots and marks are written per clone.
