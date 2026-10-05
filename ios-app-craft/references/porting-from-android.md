# Porting an Android / Compose app to SwiftUI at full parity

The Android app is the spec. Parity means the same numbers from the same data, the same copy,
the same files on disk, and the same motion, curve for curve. The order that worked: build a
reference and port the logic in parallel while the lead builds the shell, commit the contracts,
then every screen area at once, then motion. Dash (about 22.7k lines of Kotlin, 7 areas) had
its reference in about 1 h. 425 of its 427 Kotlin tests were ported with unchanged expectations
and pass (the other 2 were skipped with a written reason, §3), and 6 of 7 areas were merged
about 3.3 h (wall clock) after the goal was set.

Related guides: `delivery-process.md` (worktrees, agents, merges), `architecture.md` (the target
shape), `ui-testing.md` (hooks, seeding), `motion-craft.md`, `shared-element-flights.md` and
`measuring-motion.md`.

## 0. Ground rules

- **The source app is read-only.** Work in a separate worktree and branch, with everything iOS
  under `ios/`. Name the read-only paths in every agent brief. At the end, prove nothing
  changed with the **three-dot** diff in `delivery-process.md` §10 (a two-dot diff against
  `main` reports main's later commits as changes: on Dash today, 36 files under `app/` alone).
- **The source code and its tests win** over the brief, the spec and anyone's memory of the
  app. Follow the code and report the conflict. (A brief asked Dash iOS for a workout-mix card
  that Android had removed. Android's `DashboardTest` asserts that the card is absent.)
- **Signature motion is a parity requirement, not polish.** Never swap in the platform's stock
  version (a native zoom in place of a shared-element flight) and file the difference as a
  gap. Dash did this, and the user's reaction was "You just got rid of the absolutely beautiful
  animations". Fixing it took a full rebuild. If something really can't be matched, ask before
  shipping a stand-in.
- **Gitignore real user data and secrets before the first commit.** Dash's real GPS tracks
  lived in `reference/seed/runs-real/`. Check `git status` for them on every commit.
- **List the platform gaps on day one** (§5) and write them into the README.

## 1. Phase map

| Phase | Who | Delivers | Gate |
|---|---|---|---|
| P1 Reference | one agent on a private emulator, in parallel with P2 | `reference/UI-SPEC*.md`, `screens/`, `motion/`, `seed/` | every capture has been looked at; the index has "easy to miss" notes |
| P2 Core | one agent, in parallel with P1 | logic package, ported tests, `PORTING.md` | `swift test` green; test counts in a table |
| P3 Shell + contracts | lead (the shell is built during P1–P2) | tokens, motion constants, navigator, tab bar, app model, controller skeleton, placeholder screens with their final signatures, UI-test base + smoke test | one committed checkpoint |
| P4 Areas | one agent per area | screens, ported UI suites, screenshots | suite green; at least 2 compare-and-fix passes |
| P5 Merge + E2E | lead | real services wired across areas; end-to-end journeys | full suites green |
| P6 Motion pass | lead | guardrail, fixes, MOTION.md | `motion-check.sh` passes |
| P7 Signature transitions | readers, then critic, engine, builders, review | see `shared-element-flights.md` | strips match the reference; 0 pops |
| P8 Close-out | lead | README differences, list of hardware checks still to do | source diff empty |

Why the lead writes the shell, and the general mechanics of each phase: `delivery-process.md` §2.

## 2. P1: the reference (read-only)

### Spec documents

One agent reads every UI file in full, fanning out to readers by area (Dash: 3), and writes:

| File | Holds |
|---|---|
| `UI-SPEC-foundations.md` | Colour roles in light and dark (hex); brand constants; fonts and type roles (size, weight, line height, letter spacing); corner and spacing scales; borders and glass; every shared component; formatting rules; an icon → SF Symbol table |
| `UI-SPEC-navigation-motion.md` | Every curve, spring (with its SwiftUI conversion), duration and delay, in tables with source lines. Routes and back-stack rules. Host layering and z-order. Page transforms for each motion. Back gesture, tab bar, morphs. Signature-transition tables: parts, fades, corners, z, staggers, timing diagrams. Reveal and count-up rules |
| `UI-SPEC-<area>.md` | The frame. Items from top to bottom, with measurements. Every state: empty, loading, missed, done, long text, other units. An animation inventory. Sheets and dialogs. A test-tag index. Every user-visible string, verbatim. Icon mapping |
| `UI-SPEC.md` | The index, a screenshot table, capture conventions, and "what is easy to miss" |

- **Cite `file:line` for every number**, so a screen agent can check it against the source.
  Write down library defaults that the code leaves implicit (§8).
- **A spec can have every number right and still get the mechanics wrong.** Dash's spec said a
  flying surface's content is laid out once, but the source lays out the map again every
  frame. For a signature interaction, have someone re-read the source (§8).
- **Keep adding to "easy to miss"**, the facts that numbers don't carry. Dash's: the map stays
  light in the dark theme; tab-bar items move with the selection; a cold start flashes the
  empty state before history loads; deleting from the plan sheet has no confirmation.

### Screenshots

Use a private emulator, never the user's phone or a shared emulator.

```sh
avdmanager create avd -n ref -k "system-images;android-35;google_apis;arm64-v8a" -d pixel_7
# in <avd>/config.ini: hw.lcd.width=1080  hw.lcd.height=2400  hw.lcd.density=420
emulator -avd ref -port 5594 -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect &
adb root; adb shell settings put global auto_time 0; adb shell date 092410302026.00  # MMDDhhmmYYYY.ss
adb shell settings put global auto_time_zone 0
adb shell service call alarm 3 s16 America/New_York   # setTimeZone; worked on this API 35 image. AIDL codes can differ elsewhere (unverified): check `adb shell date` prints EDT
adb shell svc power stayon true
adb shell settings put global sysui_demo_allowed 1
for c in enter "clock -e hhmm 1030" "notifications -e visible false" "battery -e level 100 -e plugged false"; do
  adb shell am broadcast -a com.android.systemui.demo -e command $c; done
```

- **Use 1080×2400 at 420 dpi.** That is 411×914 dp (2.625 px per dp), close to the iPhone 17
  Pro's 402×874 pt, so dp → pt at 1:1 lines up. Use a `google_apis` image, because `adb root`
  (needed for `date`) is refused on Play images.
- **Pin the clock and time zone to the seed's "today"**, and set the demo clock to match. Then
  "Yesterday", streaks and week boundaries come out the same on both platforms.
- **Cover everything.** Capture every screen in light and dark, scrolled one step at a time
  (`adb shell input swipe 540 1700 540 700 600`), plus dialogs, sheets, pickers and every state.
  Name files `NN-screen-state-theme.png`. Check each group on a contact sheet as you go
  (paste the images side by side with PIL at 360 px wide).
- **Tap by label, not by coordinates.** Run `uiautomator dump`, find the node by text,
  content-desc or resource-id, and tap the centre of its bounds. Dash's first "card opens the
  run page" recording actually showed a plan card expanding, because the tab bar's items had
  moved.
- **Load seed data** into a debug build with
  `adb exec-in run-as <pkg> sh -c 'cat > <dir>/<f>' < <f>`. Then `am force-stop` the app if it
  only reads its data at process start. Use `exec-in` only with stdin redirected: Dash's
  `adb exec-in run-as <pkg> sh -c 'mkdir -p …'` waited on the terminal's stdin until it was
  killed. Run such commands with `adb shell run-as <pkg> mkdir -p …`.
- **Drive live screens with fake input.** For GPS, a script runs `adb emu geo fix <lon> <lat>`
  once a second.
- **Write down what couldn't be captured, and why**: OAuth in a browser, calendars on an
  emulator with no account, Bluetooth devices. Otherwise someone later assumes it was checked.

### Slow-motion captures

```sh
adb shell settings put global animator_duration_scale 10
adb shell settings put global transition_animation_scale 10
adb shell screenrecord --time-limit 12 --bit-rate 16000000 /sdcard/r.mp4 &   # start 1 s before the action
sleep 1; <tap by label>; sleep 12; adb pull /sdcard/r.mp4 motion/<name>-10x-<theme>.mp4
ffmpeg -v error -y -i <name>.mp4 -vf "fps=20/12,scale=216:-1,tile=10x2" -frames:v 1 <name>-strip.png
# fps = 20 tiles / clip seconds. Dash's fps=2 on a 12 s clip made 24 frames, and the 10x2 tile
# kept only the first 20 (the last 2 s were cut). Afterwards, set both scales back to 1
```

- **Why 10×:** the software-rendered emulator records about 6–30 fps. Slowed 10×, that is one
  sample every 3–17 ms of real motion, which is enough to see the order, the overlap and the
  shape.
- **Take timings from the code, never from the video.** Use the captures for order, overlap,
  z-order and which things move.
- **What to capture:** cold launch with its first reveal, each tab switch, push and pop, each
  morph, expand and collapse, count-ups, and every signature transition in both directions.
  Record looping animations (sprites, confetti) at real speed. Look at each strip straight
  after recording it.

### Seed data

- **Write a deterministic generator** (`make_seed.py --today 2026-09-24 --seed 7`) that writes
  the source's own on-disk formats. Cover every variant: each type, optional blocks present and
  absent, long names, older format versions. Add a few real items and keep them gitignored.
  (Dash's generator wrote only the current run format, v2; its one v1 file was a real run.)
- **Validate the seeds with the source's own validators.** Dash's `SessionPlan` checks every
  field, even the ones a run type ignores. One out-of-range value made the loader silently skip
  the whole file, which looks exactly like a UI bug. Note traps like this in the seed README.
- **Use the same folder for the Android screenshots and the iOS UI tests** (`APP_SEED_DIR`,
  `templates/app/LaunchHooks.swift`). Same data and same date give the same numbers on both.

## 3. P2: the core, file for file

Port file for file, and keep a map table. Keep the type names. Enum cases become lowerCamel,
with `storedValue` equal to the Kotlin `name`, because that is what gets persisted. Use
Foundation only (Dash also used CryptoKit, for SHA-256; `architecture.md` §2).

| Kotlin | Swift |
|---|---|
| `data class` | struct, Equatable/Hashable/Sendable, with `var` fields so `copy(a = …)` becomes a mutated copy |
| `object` | enum with static members; a final class if it holds state |
| `Long` / `Int` / `Float` | `Int64` (millis) / `Int` / `Float`, converting exactly where Kotlin promotes |
| `require(...)` | a trapping `init` plus a throwing `static func validated(...)` carrying the Kotlin message; use the throwing form for untrusted input |
| `internal` | `internal`, reached from tests with `@testable import` |
| `StateFlow` | a property plus `observe(callback)`; the app hops to main |
| `suspend` network I/O | pure request building and parsing; a transport protocol (URLSession live, a stub in tests); blocking calls run off main |
| `SharedPreferences("x")` | `KeyValueStore` over one `UserDefaults(suiteName:)` per preference file, with the same keys; in memory in tests. Dash's core keeps the Android file names as constants (`UnitPreferences.FILE = "run_units"`), but the app opens its own suite names (`dash_units`); only `appearance` matches. Nothing reads these across platforms, so pick either on purpose |
| `SystemClock.elapsedRealtime` | `clock_gettime_nsec_np(CLOCK_MONOTONIC_RAW)`, which also keeps counting through sleep |

**Reproduce JVM semantics before any feature code** (`Support/Kotlin.swift`, `JavaTime.swift`,
`OrgJson.swift`). Give each shim a Swift-only test against values captured on a real JVM.

| Behaviour | JVM | Swift default (checked) | Shim |
|---|---|---|---|
| `Math.round`, `roundToLong` | halves go toward +∞ (−2.5 → −2) | `.rounded()` rounds halves away from 0 (−3) | own function |
| `String.format(Locale.US, "%.2f")` | half-up on the shortest decimal (0.125 → "0.13") | `String(format:)` → "0.12" | round the digits of `"\(x)"` |
| `"$double"` | `1.0E7` | `"\(1e7)"` → `10000000.0` | `doubleToString` |
| `java.util.Random(seed)` | 48-bit LCG | none | bit-exact port. `kotlin.random.Random(seed)` is a different generator; port it separately (Dash had no JVM values for its port; only the test that uses it checks it) |
| `String.hashCode` | UTF-16, Int32 wraps | overflow traps | `&* 31 &+` over `utf16` |
| `floorMod` / `floorDiv` | floor | `%` truncates | own functions |
| `java.time` | explicit zones, DST gap/overlap rules | `Calendar` falls back to the device zone | `LocalDate`, `Instant`, a light zoned type; always pass the zone |
| org.json | insertion order, `11.0` → `11`, `/` → `\/`, Java's number text (`0.1`, `1.0E-7`) | `JSONEncoder` and `JSONSerialization` also write `11` and `\/` by default, but neither keeps insertion order, and their number text differs: `JSONSerialization` writes `0.1` as `0.10000000000000001`, `JSONEncoder` writes `1e-07` (checked on macOS 26.6) | port the library (§4) |

Dash's first test run caught `roundToLong` returning 0 where Kotlin returns 1.

- **Port every test class to an XCTest file of the same name**, with the same numbers and
  tolerances. Put the counts in a table in `PORTING.md` (Dash: 427 Kotlin tests → 447 Swift
  tests, which is 425 ports plus 22 Swift-only). Skip a test only with a written reason (Dash
  skipped 2 that tested real-socket timing against MockWebServer).
- **`PORTING.md`** holds the conventions, the file map, what was not ported and what replaces
  it, a public API summary (the screen agents code against it) and the test table. Gate:
  `swift build && swift test` is green.
- **Write the engine first, then fork the test porting,** so no helper waits on a file nobody
  has written (Dash's 80-minute stall: `delivery-process.md` §2).
- **Choose the Swift language mode deliberately.** Dash used Swift 5 mode for the port to
  avoid strict-concurrency churn (`architecture.md` §2).

## 4. Persistence and sync: byte-compatible

- **Keep the formats and names:** relative paths, file names, format versions and preference
  keys. A file saved on either platform must load on the other, and the existing server must
  accept iOS payloads unchanged. (Preference suites never leave the device, so their names are
  free; Dash renamed most, §3.)
- **Port the serializer rather than using Codable, and prove it.** Decode every file the
  source produced, re-encode it and diff. Dash's only diff was `"error": null`, which Android
  also drops.
- **Know where your port still differs.** Dash's parser goes through JSONSerialization, so an
  object that is parsed and then written again comes out with sorted keys. Build outgoing
  objects in code.
- **Re-check every ported validator and identifier against iOS.** Android's sensor check only
  accepted MAC addresses. CoreBluetooth gives per-device UUIDs instead, so a saved heart-rate
  strap read back as "none".
- **Keep the OAuth redirect that the server registered.** Dash had to listen for
  the redirect the server already had (shaped like `com.example.app://callback`) rather than a
  new scheme.

## 5. Platform differences to decide explicitly

| Capability | Android | iOS | Dash's decision |
|---|---|---|---|
| Third-party music (Spotify) | MediaSession / SDK control | no system API reads or controls another app's player; `MPMusicPlayerController` reaches only the Music app. (Spotify's own iOS SDK, App Remote, can control Spotify; not tried in Dash) | Apple Music gets full control through `MPMusicPlayerController.systemMusicPlayer`. Spotify only ducks, and Settings opens the Spotify app |
| Voice over music | TextToSpeech + audio focus | `AVAudioSession` category `.playback`, mode `.voicePrompt`, options `[.duckOthers, .interruptSpokenAudioAndMixWithOthers]`; `setActive(false, options: .notifyOthersOnDeactivation)` | music from any app ducks; an app playing in the spoken-audio mode (podcasts, audiobooks) is paused instead (SDK header) |
| Ongoing session | foreground service + notification | `UIBackgroundModes` location, audio, bluetooth-central; the location settings are in `architecture.md` §9 | No Live Activity (it needs a widget extension target). Listed as a gap |
| Settings deep links | intents for specific settings pages | the app's own page (`UIApplication.openSettingsURLString`), its notification settings (`openNotificationSettingsURLString`) and, from iOS 18.3, default apps. Nothing reaches Location Services or Bluetooth | the copy tells the user where to go |
| Dialogs and sheets | `AlertDialog`, custom dialogs, `ModalBottomSheet` | `.alert`, `FadeDialog`, `.sheet` with a measured detent: `architecture.md` §4 | Finish and Skip are native alerts; appearance, units, delete and info are in the app's style |
| BLE device id | MAC address | `CBPeripheral.identifier` (a UUID) | validator rewritten |
| Calendar | `CalendarContract` | EventKit `requestFullAccessToEvents()`. Tag the events you create (URL `<scheme>://<kind>/<id>`) and only ever edit tagged ones | |
| OAuth | Custom Tabs | `ASWebAuthenticationSession`, same redirect | |
| Maps | MapLibre Android | MapLibre iOS through SPM; `MLNMapSnapshotter`, cached per size | |
| Blur | Haze | `.ultraThinMaterial` + tint + top sheen + gradient rim | the blur radius can't be tuned to match |

Record every row that differs in the README under "Differences from Android". Record anything
tested only on the simulator under "Not yet verified on hardware".

## 6. Assets, converted by script

- **Fonts:** copy the TTFs. Get their PostScript names with fontTools
  (`TTFont(f)['name'].getDebugName(6)`, so `geist_bold.ttf` → `Geist-Bold`). List the files in
  `UIAppFonts` and use `Font.custom(postScriptName, size:, relativeTo:)`.
- **Colours:** generate one asset-catalog colour set per theme role, light and dark, from the
  spec's hexes. Brand constants that don't change with the theme can stay in code.
- **Images:** vector drawables → SVG imagesets (`pathData` is SVG path syntax);
  `drawable-nodpi` PNGs → single-scale imagesets; Material icons → SF Symbols from the spec's
  table, with a custom asset where no symbol exists (Dash: Bluetooth).
- **App icon:** composite the adaptive icon's foreground over its background colour, with its
  inset (Dash: 12.5%), into a 1024 px PNG.
- **Type:** dp and sp → pt at 1:1; `letterSpacing` → `.tracking`; `tnum` →
  `.monospacedDigit()`; display numbers that must not grow with Dynamic Type get a fixed size.
  `lineHeight` → on iOS 26+, `.lineHeight(.exact(points:))` (SwiftUICore); on an older floor,
  a per-role `.lineSpacing` delta, which adds space only *between* lines: the Compose
  lineHeight minus the font's own line height (CoreText ascent + descent: Geist 1.30 × size,
  Space Grotesk 1.276 × size). Dash's deltas (−1 to 4 pt) are larger than that arithmetic
  (bodyLarge: 4 against 23 − 20.8 = 2.2) and how they were chosen isn't recorded, so check
  multi-line blocks against the reference.

Dash's fonts, colours and icon matched Android on the first build, so the visual passes could
focus on layout.

## 7. Compose → SwiftUI mapping

| Compose | SwiftUI | Gotcha |
|---|---|---|
| `SharedTransitionLayout` + `sharedBounds`/`sharedElement`, keyed `id:part@scope` | The page in an overlay layer, plus a flight layer that draws both ends in window coordinates from one linear clock (`shared-element-flights.md`) | Why not `matchedGeometryEffect` or the native zoom, and why the key keeps its `@scope`: `shared-element-flights.md` |
| `sharedBounds(resizeMode = RemeasureToBounds)` | Lay the look out again in `.frame(w, h)` at each interpolated size | An image crops a cached render. Never scale the bitmap, and never render per size |
| `sharedBounds(resizeMode = ScaleToBounds)`, text | Lay out at the rest size, then `.scaleEffect(frame.w / rest.w, anchor: .topLeading)` | Measure the rest size separately from the global frame, because a pressed card is scaled |
| `skipToLookaheadSize()` | `.frame(width: rest.w, height: rest.h, alignment: .topLeading)` inside the moving clip | This is "measure once, don't lay out again each frame" |
| `clipInOverlayDuringTransition`, corner morph | An animatable `Shape` (`UnevenRoundedRectangle`, radii from the clock) | Use one clip, on the outermost view |
| `renderInSharedTransitionScopeOverlay(zIndexInOverlay)` | ZStack sibling order + `.zIndex` inside the flight layer | The bar goes above the flight layer, so pieces pass under its glass |
| `AnimatedContent(route)` with `togetherWith` slides | Tabs: a kept-page pager with offsets ±W (`templates/app/KeptTabPager.swift`). Pushes: `NavigationStack(path:)`. Custom routes: entries in an overlay layer | `AnimatedContent` disposes the old page. Kept iOS pages must be told when they are hidden (`tabPageShown`), because `onDisappear` never fires |
| `animateContentSize`, `SizeTransform` | Make the state change inside `withAnimation` | |
| `rememberSaveable`, `rememberSaveableStateHolder` | Pages stay mounted, so `@State` and scroll position survive. `.id("tab#token")` resets a tab when it is tapped again. `@SceneStorage` for small choices | Changing an `.id`, or wrapping the view in an `if`, throws the state away |
| `PredictiveBackHandler` | `UIScreenEdgePanGestureRecognizer` through `UIGestureRecognizerRepresentable`, plus an Animatable shrink modifier and `.interactiveSpring`; `.accessibilityAction(.escape)` | Port the numbers (Dash's shrink and commit rule: `shared-element-flights.md`, Back gesture; its "fast flick" is > 700 pt/s, `examples/card-pieces/ItemDetailHost.swift`) |
| `graphicsLayer { translation, scale, alpha }` | `.offset`, `.scaleEffect`, `.opacity` (applied at render time, no relayout); `GeometryEffect` when the value animates per frame | Don't imitate the layer with `compositingGroup`/`drawingGroup` (`motion-craft.md` §5). Dash used plain `.opacity` where Compose had `ModulateAlpha` (from research, not measured on its own) |
| `Animatable.animateTo` in `LaunchedEffect` | `@State` + `withAnimation(curve) { } completion:`, with per-frame values in an Animatable modifier, `GeometryEffect` or `Shape` | Don't insert a view and animate it in the same update (`motion-craft.md` §6) |
| `animate*AsState` / `updateTransition` | `.animation(curve, value:)` / one `@State` progress read by several modifiers | |
| `AnimatedVisibility(enter, exit)` / `Crossfade` | `if` + `.transition(.asymmetric(insertion:removal:))` / `.transition(.opacity)` on an `.id`, or `.contentTransition(.opacity)` | |
| per-character rolling digits | `.contentTransition(.numericText(countsDown:))` | |
| `rememberInfiniteTransition` | `TimelineView(.animation(paused:))` + `Canvas` | Pause it when motion is reduced or the page isn't shown |
| `Canvas`, `drawBehind`, `drawWithCache` | `Canvas { ctx, size in }`, `.background { }` | Dash drew its charts with Canvas rather than Swift Charts, to match the pixels |
| `LazyColumn` | A bounded page → `VStack` in a `ScrollView`. A long list → `LazyVStack`. Sticky headers → `LazyVStack(pinnedViews: [.sectionHeaders])` | A page whose parts are transition ends stays non-lazy, so parts below the fold can still be measured (Dash's run page, Home). A list whose tapped card is on screen can be lazy (Dash's Activities). Lazy rows are recreated, so their entrances must be reveal-once. There is no `LazyLayoutCacheWindow` equivalent |
| `LaunchedEffect(key)` / `DisposableEffect` | `.task(id:)` / `.onAppear` + `.onDisappear`; for kept pages, `.onChange(of: tabPageShown)` | |
| `derivedStateOf`, `snapshotFlow` | Computed `let`s at the top of `body`; `.onChange(of:)` | Read observed state at the top of `body`, not first inside a `GeometryReader` or `ForEach` closure (`motion-craft.md` §6) |
| `CompositionLocal` | `EnvironmentKey` + an `EnvironmentValues` property | It can also carry a per-frame clock to deep modifiers |
| `ViewModel` + `StateFlow.collectAsState` | `@Observable @MainActor final class`; core callbacks hop to main | |
| `WindowInsets`, edge-to-edge | Backgrounds `.ignoresSafeArea()`; content uses `.safeAreaPadding` or `geo.safeAreaInsets` | A page hosted in a layer that ignores the safe area must apply the insets again, or its buttons end up under the status bar |
| `Modifier.preferredFrameRate(High)` | `CADisableMinimumFrameDurationOnPhone = YES` in Info.plist | Without it, custom motion is capped at 60 Hz (`motion-craft.md` §0) |
| `tween(n)` with no easing | `.timingCurve(0.4, 0, 0.2, 1, duration:)` | FastOutSlowIn is Compose's default easing |
| `spring(dampingRatio, stiffness)` (mass 1) | `.spring(response: 2π/√stiffness, dampingFraction: dampingRatio)` | Defaults differ by API: `spring()` uses stiffness 1500, `slideIn` uses 400 |
| drag, long-press-drag, `nestedScroll` | `DragGesture`; for long-press-drag in a list, a `UILongPressGestureRecognizer` on the ancestor `UIScrollView` (recognising simultaneously) plus `.scrollDisabled(dragging)` | Recipes for both, and for the edge pan other pans must wait for: `swiftui-gotchas.md` §6 |
| haptics | `.sensoryFeedback(.selection / .impact(weight:) / .success, trigger:)` | |
| `testTag` | `.accessibilityIdentifier` with the same string, plus `.accessibilityElement(children: .contain)` on containers | Why `.contain`, and where ids survive: `swiftui-gotchas.md` §3, `ui-testing.md` §2 |

## 8. Motion parity

- **Port the constants, not the look.** Put every curve, duration, delay, stagger, spring,
  z-order and alpha rule into one timing enum named after the source constants
  (`static let pieces = 0.48 // PIECES_MILLIS`), as pure functions of t. "Close enough" reads
  as wrong next to the original, because the feel lives in the exact numbers (Dash: 480 ms
  pieces, 220 ms fades, 55 ms stagger).
- **Resolve implicit defaults for the library version you ship.** Examples: `tween()` easing,
  the default springs, the default fades on enter and exit. Read the `-sources.jar` from
  `~/.gradle/caches`, or unzip the `.aar` and run `javap -c -p` on the class. Dash disassembled
  Compose animation 1.11.4 to confirm that the bottom bar's fades were FastOutSlowIn.
- **Carry over the source's navigation rules** into the spec and the navigator (Dash's "one
  motion per navigation" rule: `motion-craft.md` §2).
- **Expect the same classes of bug on both platforms** (likely: each was found on Android
  first, then again on iOS): an image decoded mid-animation, entrances that replay when a view
  is rebuilt, a transition clock that starts before its first frame is drawn. Build in the
  defences from `motion-craft.md` from the start.
- **Treat each signature transition as its own mini-project,** starting with readers who
  re-read the source mechanics (§2) and a critic who reconciles them with the spec. The
  workflow and what its review caught: `delivery-process.md` §9; the build:
  `shared-element-flights.md`.
- **The reference video is not the performance target.** The emulator captures run at low
  frame rates, and iOS must also pass its own budgets (`measuring-motion.md`).

## 9. P3–P5: screens in parallel

The contracts commit, the shared brief, isolation, naming and merge order are in
`delivery-process.md` §2–§6 (with the UI-test base, `templates/uitests/AppUITestCase.swift`).
What a port adds:

- **The brief names the port's inputs:** the read-only source paths, `PORTING.md` as the API
  the screens code against, and the spec, screenshots and motion clips. Each per-area prompt
  names its spec sections, screenshot numbers and the source tests to port.
- **Each area agent:**
  - calls the core, and never re-implements its logic;
  - puts the source's `testTag` strings on its views as identifiers;
  - ports its instrumented tests to an XCUITest suite named after them, says in the doc comment
    which tests it ports, and asserts the source's exact copy;
  - snaps every state in light and dark, runs at least 2 compare-and-fix passes against the
    reference, and checks large text;
  - prefixes its types with the area name (`PlanPieceStep`, `SettingsAppearanceDialog`: the
    names Dash's merge had to rename to, `delivery-process.md` §5), and announces any new
    shared component.

## 10. Verifying parity

| Aspect | How |
|---|---|
| Layout, type, colour, copy | Use the same seed, pinned clock and zone, theme and units on both platforms. Read the iOS snap and the reference PNG side by side, and compare in points (reference px ÷ 2.625, iOS px ÷ 3). The iOS screen is 9 pt narrower (402 vs 411), so full-width text can wrap earlier: check the long-text states. Check light, dark and large text, with at least 2 passes per screen |
| Motion | Make an iOS frame strip at real-time marks (the method is in `measuring-motion.md`) and set it next to the Android strip at 10× those times. Compare order, overlap, z-order and the landing frame |
| Logic | Ported tests with unchanged expectations; Swift-only tests against values captured on the JVM |
| Copy | UI tests assert the source's exact strings |
| Files | Byte-identical round-trips of files the source produced; a format test in the core |
| Timings | The timing enum's names match the source constants; the review checks them against the spec tables |

## 11. Close-out

- **README:** "Differences from Android"; "Not yet verified on hardware" (Dash: network voice,
  a real BLE strap, Apple Music pausing during reflections, a long locked-screen run; its
  `MOTION.md` adds 120 Hz on a ProMotion iPhone); "How the tests control the app".
- **Final checks** (the source diff, secrets and real data, push only when asked):
  `delivery-process.md` §10, §11 and §14. Remove the private emulator (`adb emu kill`,
  `avdmanager delete avd -n ref`) and private simulators.
