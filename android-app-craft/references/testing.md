# Testing: the pyramid, the harness, and what counts as evidence

How Dash and Flick test design, motion and flows, and how the starter ports it. Read this before
writing the first test of a new app, and again before writing "tested" in a release note.

The starter ships the harness: `templates/starter/app/src/androidTest/java/com/example/starter/`
(`StarterTestRunner`, `EmulatorSupport`, `NavigationFlowTest`, `TextFitTest`, `MotionClockTest`).
The JVM rule tests live with the lanes that own the rules (theme and motion tests under
`app/src/test/`). The scripts that run the suites are in `templates/starter/scripts/`.

Principles android-design already covers are linked, not repeated: tests as design gates
(`android-design/references/components-and-verification.md §5`) and the on-device playbook
(`§6`). Where the apps proved that playbook wrong, this file says so.

---

## 1. The pyramid has three layers, and each catches what the others cannot

| Layer | Runs on | Time | Catches | Starter / examples |
|---|---|---|---|---|
| JVM rule tests | the laptop | seconds | a wrong decision: two things moving at once, a curve that leaps, ink under 4.5:1, a prefs file leaking to backup | theme and motion lanes' `app/src/test/`; `examples/sample/test/`, `examples/flick/test/` |
| Compose component tests | any device | seconds | a wrong render: text that clips at 2.0, a focus walk that loses its owner, an animation that overshoots or never lands | `TextFitTest`, `MotionClockTest`; `examples/flick/androidTest/` |
| Full-activity emulator flows | this project's AVD | minutes | a wrong app: navigation, persistence, recreation, the bar covering a button | `NavigationFlowTest`; `examples/sample/androidTest/` |

- **Why three:** Dash has 572 JVM `@Test`s and Flick 1,933 (plus 161 instrumented), at the
  commits in `examples/README.md`. Once understood, both apps' worst motion bugs could be pinned
  on the JVM with no device, though finding them took a device: Dash's from a phone-recorded frame
  strip (dash@42b59ff), Flick's 24 Hz pin on a TV. Dash's NavMotionTest KDoc: "Every
  animation bug this file was written for came from one of two mistakes: two things moving at
  once when only one should, or an animation being cut off by something shorter than itself.
  Neither is visible in a screenshot and neither needs a device" (examples/sample/test/NavMotionTest.kt (class KDoc)).
- **How:** put every decision you can in a pure function, and test it on the JVM. Render only
  what must be rendered. Save the emulator for what needs the whole app.

## 2. JVM tests pin design and motion rules

### 2.1 Motion decisions are pure functions with invariants

- **Rule:** the page-transition table is `NavMotion.motion(from, to, direction, morphable)`, and
  its tests assert invariants over every route pair, not examples.
- **Why:** Dash's "snapping" transition was an easing curve plus 420 ms bounds inside a 320 ms
  pop. A frame strip from `scripts/record-transition.sh` found it ("every bug above was found by
  looking at one", dash@42b59ff). The table test came afterwards, so the rules cannot drift back
  ("This is the test that would have caught the reported bug", DashEasingTest.kt:11).
- **How:** assert, for every pair: exactly one page dims; every shared pair is a MORPH; every
  duration is in 150..600 ms; every fade ends before its transition does. See
  `references/navigation-and-shared-elements.md` for the rules themselves.
- **Evidence:** examples/sample/test/NavMotionTest.kt (duration, shared-bounds and dimming tests).

### 2.2 Easing curves are asserted by shape

- **Rule:** write each curve's character down as numbers, so reaching for the wrong one has to
  come and argue with a test first.
- **Why:** emphasized-decelerate is "45 % of the way through in its first twentieth", so a card
  growing into a page on it "looked like a cut" (commit 42b59ff).
- **How** (starter `app/src/test/java/com/example/starter/ui/motion/EasingShapeTest.kt:43-61`,
  ported from examples/sample/test/EasingTest.kt (`enter really is front-loaded`), where the curves are `DashEase` /
  `DashTravel`):
  ```kotlin
  assertTrue(Easings.Arrive.transform(.05f) > .35f)   // decelerate is front-loaded
  assertTrue(Easings.Travel.transform(.05f) < .10f)   // travel starts gently
  assertTrue(Easings.Travel.transform(.2f) < .60f)
  assertTrue(Easings.Travel.transform(.75f) > .90f)   // and still lands softly
  ```
  Also compute the furthest a 1,440 px page moves in one 120 Hz frame and cap it (Dash:
  `glide < 100f`, DashEasingTest.kt:102-126).

### 2.3 Contrast and elevation are arithmetic

- **Rule:** every ink role clears 4.5:1 on every surface it can sit on, including composited
  fills; a raised surface is lighter than the surface under it in dark.
- **Why:** Flick's dark theme shipped with elevation inverted (1.017:1, flick@b2a3a8f), and three
  accent-on-inverse-ground defects at 1.45, 1.31 and 2.09:1 had already shipped
  (flick@a0ebf75). Nothing failed until `FlickColorsTest` existed. (A separate lesson,
  flick@7f87444: a 50 % whole-key opacity pulled the TV's paused key to 2.72:1; test the composite.)
- **How:** the theme lane's `PaletteContrastTest`; helpers (`luminance`, `contrast`, `over`) and
  a ratchet of floors are in examples/flick/test/FlickColorsTest.kt:116-171, 575-602. Details in
  `references/theme-and-type.md`.

### 2.4 Plate tests hold the cold-start window to the palette

- **Rule:** read `res/values*/themes.xml` off disk in a JVM test and compare its window
  background to the Kotlin palette's canvas.
- **Why:** the first frame is painted by the platform from XML before Compose runs; if it
  disagrees, every cold start flashes the wrong color. Dash has no `values-night` plate, so its
  light-mode cold start probably opens dark (read from the XML, not yet seen on a device).
- **Evidence:** examples/flick/test/ThemePlateTest.kt; `references/theme-and-type.md`.

### 2.5 Backup exclusions are checked in both directions

- **Rule:** parse the real `res/xml/backup_rules.xml` and `data_extraction_rules.xml`, scan every
  `getSharedPreferences("…")` in `src/main`, and fail on (a) a secret-bearing store that is not
  excluded and (b) a classification naming a store nothing opens.
- **Why:** Flick's prefs names live in Kotlin and the exclusions in XML, "coupled by nothing but
  two identical string literals". The first version only checked (a); a sort preference was then
  written into a store under a rationale "describing a `flick_library_sort` that did not exist
  yet — and the suite stayed green" (commit 79b7c83).
- **How:** copy examples/flick/test/BackupExclusionsTest.kt as soon as the app has one prefs file.

### 2.6 Performance invariants with no visible symptom

A memo that stops memoizing still answers correctly. Assert identity (`assertSame`). This is
android-design's rule (`components-and-verification.md §5`); keep it.

## 3. Compose component tests

- **Rule:** render one screen or component inside the real `AppTheme` with fake state, and
  assert behaviour, not pixels, unless the behaviour *is* pixels.
- **Use the v2 rules.** In Compose 1.12 `androidx.compose.ui.test.junit4.createComposeRule` is
  deprecated in favour of `…junit4.v2.createComposeRule`, which runs effects on a
  `StandardTestDispatcher` (queued, not immediate). The starter uses v2 throughout, as Flick does.
  Verified with `javap` on ui-test-junit4 1.12.0.
- **Font scale by density override**, not by shell:
  ```kotlin
  val base = LocalDensity.current
  CompositionLocalProvider(LocalDensity provides Density(base.density, fontScale = 2f)) { AppTheme { Screen() } }
  ```
  Fast, needs no shell, and runs on any device (flick:receiver/androidTest/SettingsScreenFocusTest.kt:200-215).
  It does not recreate the activity; keep one shell pass for that (§7).
- **Focus walks** for D-pad or keyboard surfaces: press `Key.DirectionDown` through every row,
  and after each step assert exactly one tagged control is focused and its painted ring stays
  inside the viewport; then walk back up. Details and values: `references/tv.md`;
  code: examples/flick/androidTest/SettingsScreenFocusTest.kt:78-255.
- **Name tests as sentences** so a failure reads as a bug report
  (`aRevealRisesIntoPlaceOnceAndStops`).

## 4. Motion tests run on a frozen clock at forced duration scale

- **Rule:** measure motion at exact instants and assert three things: it moves, it only moves
  one way, and it lands exactly. Then assert reduced motion lands at once.
- **Why:** "the ring swells then settles" becomes numbers instead of taste. And the device's
  animator scale is not guaranteed: `scripts/test-emulator.sh` sets it to 0 for the run
  (`--no-window-animation`, §5), and at 0 every animation lands on frame one and every motion
  assertion passes on nothing. So motion tests force their own scale.
- **How** (starter `MotionClockTest.kt`; flick:receiver/androidTest/HeardRingMotionTest.kt:57-72,134-137):
  ```kotlin
  @get:Rule val compose = createComposeRule(
      effectContext = object : MotionDurationScale { override val scaleFactor = 1f })
  @Before fun freeze() { compose.mainClock.autoAdvance = false }
  private fun advanceTo(t0: Long, ms: Long) {
      val left = ms - (compose.mainClock.currentTime - t0)
      if (left > 0) compose.mainClock.advanceTimeBy(left, ignoreFrameDuration = true)
  }
  ```
  - Provide `LocalReducedMotion` explicitly **both ways**. The live setting reads the device's
    animator scale, which is 0 under either runner and unknown under a bare `am instrument`;
    leaving it to the app tests whichever the device happens to say.
  - **Model reduced motion the way a device makes it:** scale 0 *and* the flag. Compose scales
    every finite spec by the animator scale, so the starter's `Reveal`, draw-ins and count-ups
    land at once through the scale; the flag only parks loops and swaps `AnimatedContent` for a
    one-frame cut. The starter's rule reads the scale from a field
    (`override val scaleFactor: Float get() = durationScale`), so one class covers both.
  - Read a `State<Float>` progress directly; read a moving element's `boundsInRoot` (it includes
    `graphicsLayer` translation and scale); read pixels with `onRoot().captureToImage()`.
  - Capturing forces a draw at the current instant, so a draw-phase count-up can be read through
    its `format` lambda (the starter's AnimatedNumber case).
  - Hold expected values as constants in the test, not read from production, "so a regressed
    constant cannot move the expectation with it" (HeardRingMotionTest.kt companion).
  - Save a filmstrip, `<test>_<ms>.png`, when a pixel test fails; the strip is the bug report.
    The app cannot write `/data/local/tmp/` itself; save to `getExternalFilesDir(null)`, then copy
    the file there through the shell (`EmulatorSupport.shell("cp … /data/local/tmp/")`). Under
    the script the original also stays; `connectedAndroidTest` deletes it with the app.
- **Budgets at a frame rate:** step a `TargetBasedAnimation` by the frame period and cap the
  largest step (Flick's 24 Hz TV: max step ≤ 0.101 of the span per film frame,
  examples/flick/test/MotionTokensTest.kt:22-40).
- **Real-clock loops** (a looping illustration): toggle `settings put global
  animator_duration_scale` through `EmulatorSupport.withSetting`, which restores the exact prior
  value, and count frame writes with `Snapshot.registerApplyObserver` to prove the loop stops
  outside RESUMED (examples/sample/androidTest/LoopMotionTest.kt (`theShimmerStopsWritingFramesOnceTheActivityIsNotResumed`)).

## 5. Full-activity flows run on this project's emulator, under a custom runner

- **Rule:** one AVD per project on a fixed port. The script refuses any AVD but this project's
  (`adb emu avd name`); in-test guards refuse any physical device (they cannot tell one emulator
  from another).
- **Why:** mock location, permission resets and fixtures must never reach the user's phone or
  another project's emulator. Dash's `requireEmulator()` and the script's `adb emu avd name`
  check make that structural (dash:scripts/test-emulator.sh:5-10).
- **How:**
  - `testInstrumentationRunner = "com.example.starter.StarterTestRunner"`. Its `onCreate` runs
    before the app's `Application`, so a paid or network backend is off before the first screen
    (e.g. a paid text-to-speech client's `networkAllowed = false`).
  - **Animations off, from the repo, on both runners.** `testOptions { animationsDisabled = true }`
    reaches only `./gradlew connectedAndroidTest`: AGP hands it to the UTP instrumentation driver
    (`setNoWindowAnimation`), which a direct `am instrument` never goes through. So the script
    passes `am instrument --no-window-animation`, which sets the window, transition and animator
    scales to 0 for the run and restores them afterwards. Dash's script calls `am instrument`
    without it (dash:scripts/test-emulator.sh:27-35), so its flows ran at whatever scale the AVD
    had; Flick runs `connectedDebugAndroidTest`, the one path where the Gradle flag applies.
  - `scripts/test-emulator.sh` builds, installs both APKs with `install -r` (no data reset), then
    runs **one class at a time** with `am instrument -w -r --no-window-animation -e class …` into a log per class
    (`.tools/test-logs/`) and checks each ends in `OK (n tests)`. A failure names its suite. It
    finds classes by file name, so keep **one test class per `*Test.kt` file**.
  - Every mutating helper calls `EmulatorSupport.requireEmulator()`
    (`Build.HARDWARE` ranchu/goldfish, or an `sdk_gphone` / `emulator` model or fingerprint).
  - **Know the runner's data rule.** The script never uninstalls; `connectedAndroidTest`
    uninstalls the app, and its data, when the run ends. On an emulator with history the suites
    depend on (§6), run the script.
  - **A permission flow is repeatable only if the grant is truly reset.** `pm revoke` alone leaves
    the "don't ask again" flags, and the system dialog never shows. Dash resets both before its
    permission class, emulator only (dash:scripts/test-emulator.sh:17-26):
    ```bash
    adb -s "$serial" shell pm revoke "$package" android.permission.ACCESS_FINE_LOCATION
    adb -s "$serial" shell pm clear-permission-flags "$package" android.permission.ACCESS_FINE_LOCATION user-set user-fixed
    ```
- **Reach nodes the way a finger would, without a finger.** `EmulatorSupport.reveal(tag)`
  scrolls whichever page list is showing until the item is composed, scrolls it into view, then
  lifts it clear of the floating bar through the nearest `ScrollBy` semantics action. After
  Dash's production UI landed, three emulator classes failed on test assumptions, not app bugs:
  "taps landing under the floating bottom bar, lazy-list scrolling, a dialog root"
  (dash:docs/upgrade-0.9/validation.json). 0.9.1 added: "a prefetched item exists before it is
  placed; a dialog button must not make the page list scroll". Fix the shared helper, not each
  test.

## 6. Tests leave the user's state exactly as they found it

- **Rule:** snapshot every preference file (and a hash of every data file) before a test,
  restore after, assert they match, and delete only fixtures the test created.
- **Why:** the emulator accumulates realistic history that later suites depend on, and a test
  that resets data hides the bugs only old data shows. "Tests isolate their fixtures and
  preserve existing saved runs; no app-data reset" (dash:scripts/test-emulator.sh:15).
- **How:**
  - `RuleChain.outerRule(EmulatorSupport.userStatePreserved()).around(compose)`. Outside the
    activity rule, so the guard runs before launch and the restore after the activity is gone.
  - Restore through the SharedPreferences API, not by copying files: the app runs in the test
    process and caches each file in memory, so a file written underneath it is overwritten by the
    next save.
  - The same rule hashes every file under `files/`, `no_backup/` and `databases/` before the test
    and fails if one that existed was changed or deleted (`EmulatorSupport.snapshotDataFiles`;
    SQLite's `-wal`/`-shm` sidecars and profileinstaller's markers are skipped). Where the app's own
    launch legitimately rewrites a file, compare rows through the repository instead. Data layers:
    `references/data-and-state.md`.
  - Fixtures carry a unique id (`upgrade-legacy-${UUID}`); `@After` asserts each delete.
  - Keep one **file-format upgrade test**: write a file in the oldest format the app ever
    shipped, open it, assert its values, use the new features, and assert the file is still
    byte-identical (examples/sample/androidTest/UpgradeFlowTest.kt (`viewingAnUpgradedItemDoesNotMigrateOrRewriteTheLegacyFile`)).

## 7. Text fits at every font scale

- **Rule:** every line of text fits its box at font scale 1.0, 1.3 and 2.0 on a 360 dp phone.
- **How:** for each text node, invoke `SemanticsActions.GetTextLayoutResult` and fail on
  `didOverflowHeight` (also true for an ellipsized line) or any line wider than its box + 1 px.
  Collect every problem, then assert once, so one run lists them all
  (examples/sample/androidTest/LongTextLayoutTest.kt (`everyLineFitsItsBoxAtTheLargestFontScale`); starter `TextFitTest.kt`).
  - Scan the **unmerged** tree, or a line inside a card is hidden by the card's merged node.
  - Scroll each page list a screen at a time; a lazy item below the fold is never composed.
  - Use extreme fixtures: Dash's is a six-hour ultra at 104.876 km, "where a short run never reaches".
- **Use both methods:** the density override for the matrix (seconds), and one end-to-end pass
  with `settings put system font_scale 2` (restoring the prior value, and `settings delete` when
  it was unset) to exercise real configuration and activity recreation.
- **Limit:** a number painted with `drawText` exposes no text layout, so this test cannot see it.
- **android-design says 1.8** (`components-and-verification.md §6`). Both apps test 1.0 / 1.3 /
  2.0 (dash LongRunLayoutTest.kt:73; flick:docs/design/redesign-plan.md:217). Use 2.0.

## 8. Driving a real device from the accessibility tree, with a focus guard

- **Rule:** never tap guessed coordinates. Dump the tree, read the bounds, check your app is
  focused, then tap the centre.
- **Why:** "a stray tap in an earlier session escaped into other apps"
  (flick:docs/store/codec-matrix-test.sh:12-14). Dash's `record-transition.sh` still taps fixed
  coordinates that are "only right from a freshly launched app sitting on Home".
- **How:** the starter ships it as `scripts/tap-by-tree.sh` (with `scripts/ui_tree.py`):
  `--list` prints every labelled node with its centre, `<label>` taps it, and it exits without
  tapping unless the app has window focus. The mechanism, from Flick
  (flick:docs/store/codec-matrix-test.sh:20-68, trimmed):
  ```zsh
  PHONE=${APP_PHONE_SERIAL:?set APP_PHONE_SERIAL — run: adb devices}
  TV=${APP_TV_SERIAL:-$PHONE}                       # a phone-only app has no second device
  focused() { adb -s $PHONE shell "dumpsys window | grep -m1 mCurrentFocus" }
  guard() { [[ "$(focused)" == *com.example.starter* ]] || { echo "REFUSED: $(focused)"; return 1 } }
  adb -s $TV shell input keyevent KEYCODE_WAKEUP   # the device whose screensaver steals focus (Flick: the TV)
  adb -s $PHONE shell uiautomator dump /sdcard/tree.xml >/dev/null
  adb -s $PHONE shell cat /sdcard/tree.xml > "$OUT/tree.xml"
  python3 - "$OUT/tree.xml" > "$OUT/targets.txt" <<'PY'
  import re, sys
  x = open(sys.argv[1]).read()
  for m in re.finditer(r'content-desc="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', x):
      print(f"{m.group(1)}\t{(int(m.group(2))+int(m.group(4)))//2}\t{(int(m.group(3))+int(m.group(5)))//2}")
  PY
  targets=("${(@f)$(cat "$OUT/targets.txt")}")   # read up front: adb swallows a piped loop's stdin
  for t in $targets; do guard || continue; …; done
  ```
- **Read the list into an array first.** Piped into `while read`, adb inherits the loop's stdin
  and eats the remaining lines; Flick's matrix "silently tested one clip and reported a clean
  pass" (codec-matrix-test.sh:65-67).
- **Take verdicts from logs, not the screen** where the screen cannot show failure: Flick
  decided PASS / SILENT / FAIL from `logcat -d` because "silence is a failure the picture cannot
  reveal".
- android-design's `uiautomator dump /dev/tty` recipe (§6) works for a glance; for anything
  scripted, dump to a file, parse, and guard.

## 9. Screenshots

| Need | Method | Note |
|---|---|---|
| In a test, kept after the run | `EmulatorSupport.screencap(name)` → `/data/local/tmp/starter-shots/` | `connectedAndroidTest` uninstalls the app with its storage; the script does not, but `/data/local/tmp` is safe under both |
| In a test, per frame | `onRoot().captureToImage()` → PNG in `getExternalFilesDir(null)`, shell-copied to `/data/local/tmp/` | the frozen-clock filmstrip; a Gradle run deletes the original with the app |
| Ad hoc | `adb exec-out screencap -p > shot.png` | **black** on a headless AVD with `-gpu swiftshader_indirect`; boot with `-gpu host` or read `uiautomator dump` instead (Marginalia) |
| Release notes | emulator, synthetic data, light and dark, `01-home-light.png …` | real-phone captures stay private (dash:docs/upgrade-0.9/phone-install.json) |
| Store | composited and redacted by script | Play rejects over 2:1; `references/delivery-process.md` |
| A transition | `scripts/record-transition.sh` → contact sheet at 25 fps | `references/performance.md` |

- Write ad hoc captures to the scratchpad or `.tools/` (gitignored), never into the repo tree.
- android-design says "screenshot the real screen on real hardware" (SKILL.md, workflow step 7).
  Look on hardware; **publish** from the emulator or from redacted captures.

## 10. The apostrophe trap

- **Rule:** pick one apostrophe per app, use it in `strings.xml`, and use the same one in test
  assertions.
- **Why:** a Flick test asserted a message written with a typographic `’`; every shipped string
  used ASCII `\'` (25 in the receiver's `strings.xml`), so `onNodeWithText` matched nothing and
  the test failed on a message that rendered perfectly. It was the only U+2019 in either module's
  instrumentation sources; after the fix the receiver suite passed 97/97, twice (commit 47cf4b6).
- **Correction:** android-design mandates `’` (`SKILL.md:189`, `copy-and-type.md:65`). The shipped apps use ASCII.
  Either is fine; mixing them is the bug. Check with `rg -n '\x{2019}' app/src/androidTest`.

## 11. Evidence has limits; write them down

- **Rule:** every validation record names what was **not** proven, and says which path a number
  came from: A (real hardware), B (emulator: layout and visuals only), C (reasoned, unmeasured).
  Never present C as A (`components-and-verification.md §6`).
- **Examples to copy:**
  - "The sender instrumentation suite ran on the TV device, not on an Android phone … must not
    be presented as evidence that those cross-device paths passed"
    (flick:docs/implementation.md:63-76).
  - "Evidence limits: the emulator audio output was muted …" (dash:docs/TESTING.md).
  - "The zero-error lint line above is no longer true of the tree, and the drift is not this
    feature's" (flick:docs/implementation.md:25). Lint is toolchain-relative: new checks turn it
    red on untouched files. Record that as drift, don't blame the feature.
  - A compiled test APK is not a device pass (flick:docs/design/redesign-plan.md:256-266).
- **Isolate the variable before writing "impossible".** A correct measurement can carry a wrong
  conclusion; run the arm that would falsify it first. Flick's research record keeps the raw
  `pm list features` output next to the verdict it settled (flick:research/README.md).

## 12. Symptom → cause → fix

| Symptom | Cause | Fix |
|---|---|---|
| A motion test passes but the animation is visibly wrong | the device scale is 0, so everything landed on frame one | `effectContext = object : MotionDurationScale { override val scaleFactor = 1f }`; provide `LocalReducedMotion` explicitly |
| Every full-motion case behaves like reduced motion | the app read the live animator scale, which the runner set to 0 | provide `LocalReducedMotion provides false` in the test |
| Flows animate under the script but not under Gradle (or the reverse) | `animationsDisabled` reaches only `connectedAndroidTest` | `am instrument --no-window-animation` in the script |
| `test-emulator.sh` fails before any test runs | `lintDebug` error, e.g. NonObservableLocale from `Locale.getDefault()` in a composable | `LocalLocale.current.platformLocale` (starter HomeScreen.kt) |
| A permission test never sees the system dialog | only `pm revoke` ran; the user-set / user-fixed flags remain | `pm clear-permission-flags … user-set user-fixed`, emulator only |
| The emulator's history is gone after a test run | `connectedAndroidTest` uninstalled the app | run `scripts/test-emulator.sh` (`install -r`, no uninstall) |
| A reduced-motion test still sees the entrance play | only the flag was set; finite specs follow the duration scale | set the rule's scale to 0 as well |
| `waitForIdle` times out on a screen with a shimmer or loop | an infinite animation keeps the clock busy | provide `LocalReducedMotion provides true` so loops park |
| A click lands on a tab instead of the button | the node is "displayed" under the floating glass bar | `EmulatorSupport.reveal` / `clearOfBottomBar` |
| `onNodeWithTag` finds nothing on a long page | the lazy item below the fold is not composed | scroll the page list to the node first (`performScrollToNode`) |
| A dialog button makes the page scroll | the helper scrolled before checking the node was shown | check `assertIsDisplayed` first; skip the bar nudge when there is more than one root |
| A text test passes but a line is cut in a card | the scan used the merged tree | scan `useUnmergedTree = true` |
| An assertion on visible copy fails though the copy renders | `’` in the test, `'` in `strings.xml` | one apostrophe per app |
| A later suite fails on odd data | an earlier test reset or left preferences | `userStatePreserved()` outside the activity rule; assert restore |
| The shell font-scale test leaves the device at 2.0 | the prior value was "null" and was written back as a string, or never restored | `withSetting`: delete when the prior value was unset, restore in `finally` |
| `screencap` returns a black PNG | headless AVD on `swiftshader_indirect` | `-gpu host`, or verify from `uiautomator dump` |
| A device script "passed" after testing one item | adb swallowed the piped loop's stdin | read targets into an array first |
| A scripted tap opened another app | no focus check before the tap | guard on `mCurrentFocus` / `topResumedActivity` |
| A TV test failed as a decoder error | the screensaver took focus | send `KEYCODE_WAKEUP` first |
| Tests pass once, flake on re-run | a redundant tap raced the app's own automatic step | remove the extra tap; wait on state, not time (dash:docs/TESTING.md) |
| `BUILD SUCCESSFUL in 1s` after a change | nothing compiled | check the compile task executed |
