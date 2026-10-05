# App architecture for a premium SwiftUI app

The skeleton that lets every later rule (kept pages, flights, measurement, deterministic
tests) land without a rewrite. Put it in place before the first real screen and before fanning
out to parallel agents (`delivery-process.md`). Each choice exists because the naive version
cost Dash frames, flaky tests or merge conflicts. Floor: iOS 18, for `onScrollPhaseChange`,
zoom transitions (`matchedTransitionSource`, `.navigationTransition(.zoom)`),
`UIGestureRecognizerRepresentable` and the two-value `onGeometryChange`. `@Observable` and
`withAnimation { } completion: { }` need only iOS 17.

Templates: `templates/project.yml` (which spells `App` as `MyApp`: `MyAppCore`,
`MyAppMotion`), `templates/app/{LaunchHooks,KeptTabPager,MotionKit,GrowMorph,FadeDialog}.swift`,
`templates/uitests/AppUITestCase.swift`. A working layer engine is in `examples/card-pieces/`.
**Starting from nothing:** `templates/scripts/new-app.sh Name dir` copies `templates/starter/`
(this skeleton, built: AppModel, Navigator, the RootView layer order, a floating bar, theme
tokens, a Foundation-only core, seeded smoke and motion tests) plus the kit. It generates the
project, then builds and runs the smoke tests on a new private simulator.

## 1. Layout

```
ios/
  project.yml              XcodeGen: App, AppTests, AppUITests. Schemes: App, and AppMotion
                           (Release, no debugger, no coverage, UI tests only)
  Config/App.xcconfig      #include? "../Secrets.xcconfig"  (example committed, real one ignored)
  AppCore/                 SwiftPM, Foundation only: domain rules, formatting, codecs, statistics,
                           state machines, repositories, request build/parse, timing tables + tests
  App/
    App/                   @main App, AppModel, LaunchHooks, FrameProbe
    Navigation/            Routes + Navigator, RootView (pager, layers, deep links), BottomBar,
                           <X>Layer.swift + <X>Pieces.swift for each custom transition
    Screens/<Area>/        <Area>Host.swift, its views, <Area>Model.swift if the area has state
    Components/            shared cards, Canvas charts, pickers, cached thumbnails, dialogs
    Theme/                 colour + type roles, Motion (tokens, reduced, reveal-once), Format
    Services/              per OS service: protocol, live implementation, DEBUG scripted fake
    Resources/             Assets.xcassets (colour roles, LaunchBackground), Fonts/
  AppTests/                unit tests on fakes with a hand-moved clock
  AppUITests/              base case, one suite per area, EndToEnd, Motion
  seed/                    fixture files in the app's own on-disk format, plus their generator
  scripts/                 run-ui-tests.sh, motion-check.sh, motion_report.py
  motion-budgets.json, motion-baseline.json, MOTION.md, README.md
  build/                   gitignored: DerivedData per purpose, ui-shots/, motion/
```

- **Keep reads of the app model and navigator in `<Area>Host`.** It owns the area's sheets
  and dialogs and passes values and closures down. Why: a screen that takes plain data can be
  built anywhere. Dash warmed `RunDetailScreen(record: copy, …, onBack: {})` unseen, and its
  flight looks reuse the same view code. Dash's page screens follow this; a few leaf views
  (Settings' voice, heart-rate and coach cards, `ItemRow`) still read the model directly.

## 2. Logic in a Foundation-only package

Every decision lives in `AppCore`; the app target only adapts Apple frameworks and draws.
`Package.swift`: tools 6.0, `platforms: [.iOS(.v18), .macOS(.v15)]`, one library, a test
target with `resources: [.copy("Resources")]` for fixtures.

- **Why:** `swift test` runs on macOS with no simulator (Dash: 447 tests in 1.25 s,
  re-run 27 Sep). Screen agents build against one stable API and can't each re-implement a
  rule differently. A port can be checked test for test against the original suite.
- **No third-party code, no SwiftUI/UIKit/CoreLocation imports** (CryptoKit is fine). A type
  that needs a framework gets a protocol in the core and an implementation in `App/Services`.
  Public API is what the app needs; internals stay `internal`, reached by `@testable import`.
- **Network:** building and parsing requests is pure and tested; sending goes through a
  transport protocol (e.g. `SyncTransport`, `SpeechTransport`). The live one is a blocking
  `URLSession` call, which Foundation lets live in the core; tests pass stubs. Callers run it
  off the main thread.
- **Streams become a property plus an observe method** (Dash: `history` +
  `observeHistory(_:)`, from Kotlin's StateFlow). The repository takes a `callbackQueue`
  (main in the app, a private queue in the core tests) and documents which queue each
  callback arrives on. Dash's `observeHistory` fires on the disk queue, so the app hops (§3).
- **Generated content** (phrase banks) comes from a script, never hand-edited.
- **Motion timing tables are pure functions of t** (`alpha(part, end, t)`, stagger delays),
  so they can be tested against the reference without a view. Dash's `ItemPieceTiming` is
  pure but sits in the app target (it uses SwiftUI's `UnitCurve`) and has no tests; only
  `PetMotion` made it into the core with tests. To test a table, move it to the core with a
  plain cubic-bezier function in place of `UnitCurve`.
- **Language mode is a choice; state it.** Dash used `swiftLanguageModes: [.v5]` in the
  package and `SWIFT_VERSION: 5.0` in the app to keep strict-concurrency churn out of a port;
  Swift 6 mode was not tried. For a new app, decide deliberately. The `templates/app` and
  `templates/uitests` files and the §3 snippet typecheck clean in both modes
  (`swiftc -typecheck -swift-version 5|6` against the iOS 18 simulator target).

## 3. The app model

```swift
@MainActor @Observable final class AppModel {
    @ObservationIgnored let prefs = UserDefaultsStore(suiteName: "settings")!
    var units: Units { didSet { UnitPrefs.save(prefs, units) } }   // a preference saves itself
    private(set) var items: [Item] = []
    private(set) var stats: Stats?
    private(set) var loaded = false                                 // "loading" vs "empty"
    @ObservationIgnored private(set) lazy var planPage = PlanModel(attachedTo: self)
    @ObservationIgnored private var statsGeneration = 0
    init() {
        LaunchHooks.prepare(dataDirectory: Self.dataDirectory, defaultsSuites: Self.suites)  // first
        units = UnitPrefs.load(prefs)
        Repository.shared.observe { [weak self] items in   // arrives on the disk queue
            DispatchQueue.main.async { MainActor.assumeIsolated { self?.itemsChanged(items) } }
        }
    }
    private func itemsChanged(_ new: [Item]) {
        items = new
        statsGeneration += 1
        let generation = statsGeneration, today = LaunchHooks.today
        Task.detached(priority: .userInitiated) {
            let computed = Stats.compute(new, today: today)
            await MainActor.run {
                guard generation == self.statsGeneration else { return }   // a newer load won
                withAnimation(AppMotion.reduced ? nil : .smooth(duration: 0.35)) {
                    self.stats = computed; self.loaded = true
                }
            }
        }
    }
}
```

- **One `@MainActor @Observable final class`,** `@State` in the `App`, injected with
  `.environment(app)`. The root applies `.preferredColorScheme`; `scenePhase == .active`
  triggers foreground sync. Screen-specific state goes in area models.
- **`@ObservationIgnored` on everything that isn't UI state:** stores, services,
  repositories, caches, closures, generation counters, measured-frame dictionaries.
  Observation tracks every stored property, so a frames dictionary written from
  `onGeometryChange`, or a look registered from `body`, would invalidate its readers on every
  write, or loop.
- **Derived data as in the snippet:** off the main actor, generation-guarded (a stale result
  never wins), applied inside `withAnimation` (numbers ease in, not jump).
- **A `loaded` flag separate from the data:** shimmer until it's true, the empty state only
  after. The Android reference flashed "Your first run starts here" on cold start, before its
  history had loaded.
- **A page whose first frame must be complete gets its model built already filled:** a lazy
  property on the app model, filled from data in memory, not in `onAppear` or `.task`. An
  empty list that fills a frame later jumps its scroll. Dash's Plan week arrived empty and
  jumped; its tab switch showed 195–210 ms worst frames until this fix and kept pages landed
  together, so the share of each is unknown.
- **While a page model has writes in flight, ignore external reloads of the same data**
  (`guard pendingWrites == 0`, Dash `PlanModel.weeklyChanged`). Otherwise a sync echo puts the
  old value back under the user's finger.
- **Guard every async completion** (`asyncAfter`, animation completions, detached work) with
  a generation captured at the start. A late completion from a cancelled open otherwise tears
  down the next one.
- **Clocks.** Every "now", "today" and time zone comes from one place that honours the
  pinned test clock (`LaunchHooks.now/today/timeZone`), and that place is not main-actor
  isolated, so formatters and background work can read it: a plain enum as in the template,
  or `nonisolated static` on a `@MainActor` model as Dash's `AppModel.now` is. One stray
  `Date()` makes "Today"/"Yesterday", streaks and week edges flaky.
  Durations use `clock_gettime_nsec_np(CLOCK_MONOTONIC_RAW)`: it counts through device sleep
  (unlike `CLOCK_UPTIME_RAW`/`mach_absolute_time`) and ignores wall-clock changes, like
  Android's `elapsedRealtime` (`man clock_gettime`).

## 4. Navigation

Own the navigation state in an `@Observable` navigator. Choose the mechanism by what the
transition must do:

| Destination | Mechanism | Why |
|---|---|---|
| Tabs | Your own kept-alive pager (`KeptTabPager`) | `TabView` cuts between tabs and gives no say over when a page is built (platform behaviour; Dash never tried it). Dash's first pager rebuilt the page on every switch: Plan's slide cost 70–117 ms/s of whole-window hitch, and Settings' worst frames were 171–190 ms. Kept pages then measured 0 ms/s motion hitch (a different metric; `motion-craft.md` §4) |
| Plain page from a card or row, one piece | `NavigationStack(path:)` + `.navigationTransition(.zoom(sourceID:in:))` | Native, cheap, free back swipe and accessibility |
| Card flying apart into a page, `+` growing into a page | An overlay layer above the stack (`shared-element-flights.md`, `GrowMorph`) | A push removes the source from the window, so there is nothing to fly between |
| Full-screen mode (live recording, player) | A sibling of the whole tree; the tree fades to 0 and stays alive | Tabs keep their scroll and state for when the mode ends |
| Short input; confirmation | `.sheet` + `.presentationDetents([.height(measured)])` (`.large` while typing); `.alert` if plain, `FadeDialog` if it must look like the app | Dash: `.alert` for Finish and Skip; appearance, units, delete and info dialogs in the app's style |

**Navigator state:** `tab`, `path: [Route]`, one flag or state object per overlay layer
(`showStart`, `detailLayer`), `direction`, `arriving`, `leaving` and `refreshToken[tab]`.
Methods: `switchTab`, `push`, `pop`, `open<X>`, `close<X>`, `popToRoot`, and one `back()`
that pops the topmost thing: layer sub-entry (full map), then layer page, then `path`.

- **One `NavigationStack` at the root, wrapping the pager, not one per tab.** A tab switch
  clears one path, layers above the stack also cover pushed pages, and the bar (a sibling
  above the stack) simply leaves while `path` is non-empty.
- **`switchTab(target)`:** clear `path`. Re-selecting the shown tab bumps its `refreshToken`
  (the page's `.id("tab#token")` changes, so it rebuilds at the top). Otherwise set
  `arriving = target` so the page mounts parked beside the screen, and on the next main turn
  set `leaving = tab` and run `withAnimation(glide) { tab = target; arriving = nil }
  completion: { leaving = nil }`, holding background renders for the slide. Under reduced
  motion, switch instantly. Why: the build lands on a frame where nothing moves
  (`motion-craft.md` §3–4).
- **Pager per page:** `frame(screen)`, an opaque `background(paper)` (or it shows its
  neighbour mid-slide), `.id(refresh)`, `offset` (0 shown, ±W sliding, 3W parked), `opacity`,
  `zIndex`, `allowsHitTesting(shown)`, `accessibilityHidden(!shown || covered)` stated on each
  page (the nearest one wins), and the environment keys of §5.
- **Kept pages** (rules and Dash's numbers: `motion-craft.md` §4). The pager's `.task` waits
  1.6 s after launch, then mounts the other tabs one at a time, 450 ms apart, only while
  nothing moves; then it builds one unseen copy of each heavy pushed or layer page type and
  prefetches what the next tap most likely needs (`motion-craft.md` §8). Stop-work watches
  `\.tabPageShown`, not `onDisappear`, and ids that act as transition ends exist only on the
  shown page: `matchedTransitionSource(id: shown ? id : "hidden:" + id, in: ns)`, changing
  the id, not the view tree.

**Root z-order, bottom to top** (explicit ZStack siblings, not ad hoc `zIndex`):

| # | Layer | Notes |
|---|---|---|
| 1 | `NavigationStack { Pager }` | Pushed back and dimmed when a page rises over it. Hit testing off and accessibility hidden while covered |
| 2 | Under-flight layer | Card ends with no page end to meet, drawn in place beneath the arriving page |
| 3 | Detail layer | The page and its own small stack (full map). Owns the edge swipe and `.accessibilityAction(.escape)` |
| 4 | Flight layer | Pieces in the air, above both pages |
| 5 | Bottom bar | Above the pieces, so they pass under its glass. Leaves with the first moving frame and returns half way through a close, but becomes tappable only once the page is gone |
| 6 | Morph layer | The `+` travels over the bar as it grows |
| — | Full-screen mode | A sibling of 1–6, whose group fades to 0 under it |

- **A custom layer re-provides what a push gave for free** (full list:
  `shared-element-flights.md`). The architectural part: pages UIKit hosts for the stack don't
  inherit its modifiers, so set `\.pageCovered` and add `.hiddenWhenCovered()` on each page
  container.
- **When a mode ends into a page, put the page in place underneath first,** with animations
  disabled (`Transaction.disablesAnimations`), then fade the mode out; never push it on top.
  Dash opens the run summary instantly in the layer under the fading run screen.
- **Deep links:** `APP_OPEN=tab:2|item:<id>|metric:<k>|compose` is handled in the root's
  `.task`, opening layer pages with `instant: true`. A rendering test then opens any page
  directly, and the same parser can later serve a real URL scheme (Dash's doesn't yet: its
  custom scheme is only the sign-in callback).

## 5. Environment keys

An `EnvironmentValues` property declared with `@Entry` (as the templates do; Dash wrote a
private `EnvironmentKey` for each), whose doc comment says exactly when it is false or nil.
Keys carry *where a view sits* (which page, covered, which transition role); data comes from
`@Environment(AppModel.self)`.

| Key (generic) | Set by | Meaning |
|---|---|---|
| `tabPageShown` (default `true`) | pager, warm-up | false on kept hidden tabs and warm-up copies. `onFirstShown` and stop-work watch it |
| `pageCovered` | pager, each pushed page | another tab, the morph or a layer is over this page; read by `hiddenWhenCovered()` |
| `zoomNamespace` | root | the `Namespace.ID` for native zoom sources (nil: no zoom here) |
| `detailLayer`, `layerClock` | root, layer | the layer's state object; the per-frame clock struct (Dash `ItemPieceClock`: time, opening, pieces, flying, closeFrom) |
| `pieceScope`, `pieceRole` | pager and pushed list pages, flight layer | the list page a card is on (nil: no flight from here); `.live` or `.look` (`shared-element-flights.md`) |

- **The default is the value that is safe outside the context** (`tabPageShown = true`: a
  view with no pager above it still plays its entrance). Set a key on the container that
  knows; a view never guesses its context from geometry or ids.
- **The per-frame clock goes through the environment,** from a body that reads it, into
  `Animatable` modifiers. Deep modifiers then interpolate with no body re-runs
  (`motion-craft.md` §5).

## 6. Persistence

- **Where:**
  - User data goes in Application Support. Set `isExcludedFromBackup` only on what can be
    restored another way. Dash excluded its whole data directory (runs and weekly plan) to
    mirror Android's `noBackupFilesDir`, so a new phone starts empty unless synced; make that
    choice on purpose.
  - Regenerable renders go in `Caches/`, with a version in the key and a file cap (Dash: 120).
- **Every write is `Data.write(to:options: .atomic)`,** on one serial `DispatchQueue` per
  repository, never on main. A crash mid-write then leaves the old file, not half a file.
  Porting from Android's `AtomicFile`: also read a leftover `.bak` in preference to the file.
- **In-progress and final files:** a process can die after the final atomic write and before
  the checkpoint is removed. On launch, the final file always wins over the checkpoint, and a
  checkpoint with no final file is recovered and marked as interrupted (Dash
  `RunRepository.initialize`).
- **Observers reach observed state on main, in order:**
  `DispatchQueue.main.async { MainActor.assumeIsolated { … } }` (the crash it prevents:
  `swiftui-gotchas.md` §4). This keeps FIFO order with other main-queue work, which
  `Task { @MainActor in }` does not promise, and `assumeIsolated` traps if you are wrong
  about the thread. In Swift 5 mode the compiler stays silent when a repository runs a
  main-actor closure on its own queue (checked with `swiftc -typecheck`), so the trap is the
  only guard. A callback that may already be on main branches on `Thread.isMainThread`
  instead of always hopping, so its update lands in the same frame (Dash `SyncService`).
- **Preferences:** a `KeyValueStore` protocol with `UserDefaultsStore(suiteName:)` and
  `InMemoryKeyValueStore`, all in the core (UserDefaults is Foundation). The app opens one
  suite per domain; tests use the in-memory store. Keep one list of suite names so reset
  can't miss one.
- **Tokens belong in the Keychain.** Not in `UserDefaults`. If you use the Keychain, reset must clear it
  too, because items outlive an app reinstall (platform behaviour).
  `LaunchHooks.prepare` doesn't clear it; add `SecItemDelete` per class.
- **Formats that must match another platform or a server:** port its serializer rather than
  using `Codable`, and test byte-for-byte round trips (`porting-from-android.md`).
- **Render cache:** `NSCache` with a byte `totalCostLimit` plus files in `Caches/`, keyed and
  sized as in `swiftui-gotchas.md` §7. Views peek it synchronously in `init`
  (`motion-craft.md` §2, §8).
- **Writing into the user's own data** (calendar events, contacts): tag everything you create
  and only ever edit or delete tagged items (e.g. an event URL `<scheme>://weekly/<id>`;
  `porting-from-android.md` §5).

## 7. Theme and motion tokens

- **Colour roles in the asset catalog** (Paper, Ink, Muted, Accent, Outline; light and
  dark); brand constants that never change with theme in code. Launch colour:
  `setup-and-tooling.md` §2.
- **Type roles as an enum** (`font`, `tracking`, `lineSpacing`) applied by one modifier
  (`.appType(.bodyLarge)`). `Font.custom(name, size:, relativeTo:)` scales with Dynamic Type;
  `fixedSize:` only for display numbers whose box must not grow (check at the largest
  accessibility size); `.monospacedDigit()` on every role that shows changing numbers. Fonts
  in `UIAppFonts`. Spacing and corner scales are named constants: one place per spec value.
- **Motion:** named curves and springs, one `reduced` flag (test flag or Reduce Motion),
  press style, reveal-once, `onFirstShown`, count-up, in one file
  (`templates/app/MotionKit.swift`; tokens in `motion-craft.md` §1). Non-view code
  (navigator, layer state machines) reads the same `reduced`, so the whole app agrees.
- **Appearance:** a stored preference, overridable by `APP_APPEARANCE`, applied at the root.
  Non-view state that draws per theme (flight looks, render keys) gets `dark` pushed in from
  `.onChange(of: colorScheme, initial: true)`.

## 8. Services behind protocols, with fakes

- **One protocol per OS or hardware service** (Dash: `LocationSource`, `HeartRateScanning`,
  `MusicControlling`, `RunVoice`): a live implementation plus a scripted fake under
  `#if DEBUG`.
- **Controllers are built from an environment struct** of protocols and closures (`location`,
  monotonic `clock`, `wallClock`, `repository`, `makeVoice`, `autoTick`, …) whose
  `static func live()` returns scripted fakes when a launch env var asks (`APP_FAKE_RUN=1`).
  UI tests then drive the real controller, engine and persistence with only the sensor input
  fake. Unit tests pass a manual clock with `autoTick = false` (`ui-testing.md` §11).
- **Never scatter `if fake { return }` through a controller.** In Dash that version caused
  merge conflicts in `RunController.swift` twice and bypassed the real engine, voice and
  saving; the protocol fake needed one line in `live()`.
- **Create hardware managers lazily,** e.g. `CBCentralManager(delegate:queue: .main,
  options: [CBCentralManagerOptionShowPowerAlertKey: false])` only once a sensor is saved or a
  scan starts, so no permission prompt fires at launch. Create managers on main (or pass
  `queue: .main`), mark delegate methods `nonisolated` and wrap them in
  `MainActor.assumeIsolated`.
- **Identity, paid APIs and maps** have their own guides: BLE ids and ported validators in
  `porting-from-android.md` §4; keys from the gitignored xcconfig in `setup-and-tooling.md`
  §3, blanked in tests by `APP_NO_<X>_KEY=1` (`ui-testing.md` §1); tile timeouts and the
  offline fallback in `swiftui-gotchas.md` §7. Draw your overlay (route, pins) even when
  tiles fail, and fit the camera only after the style has loaded.

## 9. Background modes

- **Declare only what you use, and turn it on only while needed.** Dash's `UIBackgroundModes`
  are `location` (recording), `audio` (spoken cues, screen off) and `bluetooth-central` (a
  heart-rate strap). Keep work going with the screen off through these modes, not by
  disabling the idle timer.
- **Location for tracking:** `activityType = .fitness`, `kCLLocationAccuracyBest`,
  `kCLDistanceFilterNone`, `pausesLocationUpdatesAutomatically = false`. Set
  `allowsBackgroundLocationUpdates` and `showsBackgroundLocationIndicator` true in `start()`,
  and `allowsBackgroundLocationUpdates` false in `stop()` (Dash leaves the indicator flag
  alone); the blue pill tells the user you're recording. Ask
  `requestWhenInUseAuthorization` first, then
  `requestTemporaryFullAccuracyAuthorization(withPurposeKey:)` (with
  `NSLocationTemporaryUsageDescriptionDictionary`) if the user chose approximate location.
- **Spoken audio over music** and the other platform choices: `porting-from-android.md` §5.
  Usage strings say what the user gets: `setup-and-tooling.md` §2.
- **Unverified in Dash:** a long locked-screen run on hardware; no Live Activity. List such
  gaps in the README (`porting-from-android.md` §5).

## 10. Test hooks built into the app

The switches, what each does and why are in `ui-testing.md` §1; this section is where they
live in the app. Read them at one seam, first in the app model's `init`, before any store is
opened, plus the root's `.task` for the deep link. `templates/app/LaunchHooks.swift` covers
reset (data directory and defaults suites, not the Keychain: §6), seed, clock, appearance and
the deep link; `-appNoMotion` is read by `MotionKit`, `APP_FRAME_LOG` by `FrameProbe`. Add
units, fakes, offline switches and readouts to the same seam as the app grows.

- **Only hardware fakes and readouts go behind `#if DEBUG`.** The motion check builds
  Release, so reset, seed, clock, deep link and `APP_FRAME_LOG` must work there; each does
  nothing unless its switch is set. (Dash's heart-rate fake is not DEBUG-gated and ships in
  Release; gate yours.)
- **Seeds** (plain files in the app's own format, from a deterministic generator) and the
  **runner script** (permission grants, simulated routes: what a test process can't do) are
  in `ui-testing.md` §1 and §7.

## 11. Order of landing

Project and secrets (`setup-and-tooling.md`) → core package green under `swift test` →
AppModel with LaunchHooks, seed generator and pinned clock → theme and MotionKit → navigator,
kept pager and a root ZStack with an empty slot per layer, plus the deep-link parser → UI-test
base case and a smoke test → FrameProbe and the motion journey (baseline once 2–3 screens
exist) → README "How the tests control the app" listing every hook. Only then fan out to
screen agents.

Open: Dash reads `UIScreen.main` in places (deprecated in iOS 26; works only for a
single-window iPhone app). In a new app, read the scene's screen or the geometry the view is
given.
