# SwiftUI and UIKit gotchas

Traps that cost Dash real time, each as **symptom → cause → fix**, with enough evidence to
trust it. Every entry is a general rule; Dash names are examples. Where another guide owns a
trap, you get a one-line pointer instead of a repeat. Dash's baseline: iOS 18 floor, Xcode 27
(Swift 6.4 compiler) with the iOS 27 simulator, Swift 5 language mode. Gotchas move with the
SDK, so re-check the version-marked entries whenever the floor or toolchain changes.

Already covered elsewhere (read those first when doing motion or tests):
- `motion-craft.md` §5–7: reads inside `ForEach`/`GeometryReader` closures aren't tracked; a
  view inserted in the same update as an animated change doesn't animate; `if`/`else` in a
  modifier rebuilds the page; observation fan-out; opacity 0 vs 0.001; animatable views that
  rebuild their body every frame. §2/§4: kept pages fire `onAppear` unseen and never fire
  `onDisappear` (use `onFirstShown`, `tabPageShown`). §9–10: an overlay that replaces a push
  posts `.screenChanged` itself, at still moments.
- `shared-element-flights.md`: text offered an animating width re-wraps ("Morning te…").
- `ui-testing.md`: identifier naming, gesture recipes, scrolling an element clear of
  overlays, waiting for a sheet's detent to stop springing before a coordinate tap,
  reach-vs-existence assertions, reading a failure (§12 is the debugging toolkit). Where ids
  survive, ghost copies and debug-overlay opacity are *here*, in §3: `ui-testing.md` §1–2
  points to it.
- `architecture.md` §3: `@ObservationIgnored` registries, off-main derived data, page models
  built filled.

## 1. Observation and identity

- **A "first time" flag computed in `init` goes wrong: count-ups and entrances never play.**
  SwiftUI can build a view struct several times before it appears. A `let first =
  session.firstTime(key)` claims the key on the first build, and the build that actually
  appears sees `false`. Fix: store it with `_x = State(initialValue:)`. `@State` keeps the
  value from the build that created the view's identity and ignores the initial values of
  later re-inits, which is exactly what you want. (Dash: `AnimatedNumber` never counted up on
  pushed pages.)
  ```swift
  @State private var animates: Bool
  init(value: Double, key: String) { _animates = State(initialValue: RevealSession.shared.firstTime(key)) }
  ```
  The same `init` seeding fixes **a cached image that shows a placeholder for one frame**:
  `.task` is asynchronous, so what it sets can land after the first frame. (Apple documents
  `onAppear` as completing before the first rendered frame, but the placeholder body has
  already run by then.) Peek the memory cache synchronously
  (`_image = State(initialValue: cache.peek(key))`; Dash's `RouteThumbnail`). The crossfade for
  images that arrive later is in `motion-craft.md` §2.
- **Content that lands in a non-observable cache (`NSCache`, a static dictionary) never
  shows.** A read from such a cache in `body` is a snapshot, and nothing re-runs when the
  entry arrives. Fix: subscribe to that one load and bump a `@State` (for example `.id(landed)`)
  so the view draws again. (Dash b46db24: a flying map kept the blown-up card render, then
  changed at landing.)
- **"Modifying state during view update", or a body that loops.** Something wrote an
  observed property from `body` or from a geometry callback that fires on every layout. Fix:
  registries that `body` writes to (a flight's "looks", measured frames) go in
  `@ObservationIgnored` properties. The writes then invalidate nothing (`architecture.md` §3).
- **A reset or teardown animates: pages slide or fade back when they should snap.** The
  change ran inside, or alongside, an animated transaction and picked up its animation. Fix:
  ```swift
  var still = Transaction(); still.disablesAnimations = true
  withTransaction(still) { phase = .closed; entries = [] }
  // For a presentation: .transaction(value: isPresented) { $0.disablesAnimations = true }
  ```
- **`.id(x)` is a rebuild switch.** Changing it throws away the subtree's scroll, `@State` and
  `.task`. Use it on purpose: Dash's `.id("\(tab.rawValue)#\(nav.refreshKey(tab))")` rebuilds a
  kept tab when its already-selected tab button is tapped again, which sends the page back to
  the top. Never key an id on something that changes during a transition. For matched
  or zoom sources on kept pages, change the source's id, not the view tree
  (`motion-craft.md` §4).
- **Keep a leaving view in the same structural slot.** Write `if case .run(let id)? =
  (entries.first ?? retiring.first) { Page(id) }`, not separate `if` branches for "showing"
  and "retiring". Then a retiring page is the same view, only no longer shown, and nothing is
  rebuilt mid-close. The `if` rule applies only to conditions that change at runtime: an
  `if #available` branch never flips, so it is safe.
- **Lazy containers build rows only near the viewport and may rebuild them.** A row coming
  back fires `onAppear` again, so its entrance replays unless it is reveal-once. A
  transition can't measure an off-screen end that was never built. Whether a row's own
  `@State` survives scrolling away was not tested in Dash, so don't rely on it. Use a
  non-lazy `VStack` for bounded pages (dashboards, detail pages, anything that is a
  transition end). Keep `LazyVStack` for long lists, and keep a row's "seen" state outside
  the row.
- **A page's first frame is empty, then its content jumps in.** The model was created in
  `.task` or filled from `onAppear`, so the page's first body ran empty. Build it filled
  before the first body. `architecture.md` §3 has the pattern, plus Dash's 195 ms Plan freeze
  and why its share of that freeze is unknown.

## 2. Layout and geometry

- **Every tab's list stops short of the screen bottom.** A custom pager or container clipped
  (`.clipped()`) at its safe-area size cuts scrolling content off above the home indicator.
  Fix: `.ignoresSafeArea(.container, edges: .bottom)` on the pager; a `ScrollView` inside
  still insets its content by the safe area. Pad scroll content by the floating bar's
  clearance (Dash: `BottomBar.clearance` = 104). Two Dash agents hit this independently.
- **A page hosted in a full-screen overlay slides under the status bar.** The overlay
  ignores the safe area, so its content does too. Fix: read the insets from an outer
  `GeometryReader` and give them back with `page().safeAreaPadding(insets)`.
- **Overlay pieces land offset by the status-bar height.** One end was measured in local
  coordinates and the other in window coordinates. Fix: draw overlays with
  `.ignoresSafeArea()`, and measure both ends with `frame(in: .global)`
  (`shared-element-flights.md`, Architecture).
- **A morph's start point drifts while it runs.** The source keeps reporting its frame while
  it is pressed, scaled or leaving. Fix: freeze it once the overlay mounts:
  `onFrame: { if !state.mounted { state.source = $0 } }`.
- **A view vanishes or layout logs NaN.** A zero width or height reached a division or a
  scale. Fix: clamp every interpolated size and every divisor with `max(x, 1)`.
- **Measuring changes the layout, or costs every scroll frame.** A `GeometryReader` takes all
  the space it's offered and moves its child to the top-leading corner. Fix: measure with
  `.onGeometryChange(for:of:action:)`, or `.background { Color.clear.onGeometryChange(…) }`.
  Store the result in `@ObservationIgnored` storage, and measure only while a transition
  needs it. Measuring an element's global frame apart from its own size is covered in
  `shared-element-flights.md`.
- **A scroll-driven centre band is off by exactly the margin.** With
  `.contentMargins(.vertical, m, for: .scrollContent)`, the `.scrollView` coordinate space
  starts below the margin (observed in Dash, where `m` was two rows). Fix:
  `let middle = height / 2 - m`. (Dash: a wheel's lime band was two rows off.)
- **Per-row scroll effects (drum wheels, parallax).** Use `.visualEffect { content, proxy in
  … proxy.frame(in: .scrollView) … }`. The effect reads the row's geometry without affecting
  layout, so there is no `GeometryReader` and no state write per scroll frame.
- **iOS 26+: the top of a page blurs under the status bar.** The soft scroll edge effect blurs
  content there, which would blur Dash's run-page hero map. A flying copy is sharp, so a page
  taking part in a flight would also change at both ends of it. Dash's research flagged this
  before the build, and the fix shipped pre-emptively; neither the blur nor the pop was ever
  measured. Fix:
  `if #available(iOS 26, *) { v.scrollEdgeEffectHidden(true, for: .top) }` on pages whose
  content runs under the bar or takes part in a flight.
  *Measured since (the starter, 27 Sep, iOS 27 simulator, dark):* the page's hero shows a dimmed
  band under the status bar, but the flight landed with no step in that band (per-frame diffs
  fell to 0 in ~1% steps). So hiding it is a choice about looks there, not a fix for a pop.
- **`UIScreen.main` is deprecated in iOS 26.0.** Swift warns only once the deployment target
  reaches 26, so an iOS 18 floor shows nothing. Dash still reads it; the alternative is in the
  closing note of `architecture.md` §11.

## 3. Accessibility, and what XCUITest sees

`ui-testing.md` owns the test side: identifier naming (§2), asserting reach rather than
absence because XCUITest isn't VoiceOver (§4), and what being an accessibility client costs
(§14; `motion-craft.md` §9). This section is the SwiftUI semantics behind them, including
where ids survive, ghost copies and drawn composites, and debug-overlay opacity, all of which
`ui-testing.md` §1–2 points here for.

Pick the container mode on purpose:

| Want | Modifiers | Result |
|---|---|---|
| A screen or card whose parts stay queryable | `.accessibilityElement(children: .contain)` + id | The container has its own element and id; children keep theirs |
| One tappable card read as one sentence | `.accessibilityElement(children: .ignore)` + composed `.accessibilityLabel` | One element; inner ids are gone. The label doubles as a VoiceOver check |
| A label-and-value row | `.accessibilityElement(children: .combine)` | Merged label |

- **Tests can't find children, or "the screen exists" checks break.** An identifier on a
  stack with no element of its own is applied to each of its children, overriding their ids;
  a `.contain` wrapper around a single child can swallow that child's id too (observed once).
  Fix: screen ids on a `.contain` container, a separate id on the `ScrollView`, no
  single-child wrappers. (Dash: the first smoke test couldn't find the tab buttons, and all 5
  E2E tests failed with `Missing "activities_list"`; the rest is in `ui-testing.md` §2.)
- **A card's chart or readout ids vanish.** A `Button` collapses its label into one element.
  Keep the button and give it back its children:
  ```swift
  Button(action: open) { CardBody() }
      .accessibilityElement(children: .contain)
      .accessibilityAddTraits(.isButton)
      .accessibilityIdentifier("weekly_chart_card")
  ```
- **A covered page stays reachable by VoiceOver and by tests.** Three rules combine here:
  1. The nearest `accessibilityHidden` wins, so a child's `.accessibilityHidden(false)` is
     *not* a no-op: it re-exposes that child under a hidden ancestor.
  2. A `.contain` container decides its own visibility, so a hidden flag set above it doesn't
     reach inside.
  3. A `ScrollView` is an element of its own, so hiding the container inside it leaves an
     empty, reachable scroll view.

  Fix: compute one flag that holds every reason a page is covered, publish it in the
  environment (`\.pageCovered = !shown || overlayUp`), and apply it on the page root *and* on
  each `.contain` container (`.hiddenWhenCovered()` in `templates/app/KeptTabPager.swift`).
- **Hiding a `NavigationStack` doesn't hide its pushed pages.** UIKit hosts the destination
  pages, and the stack's own modifiers don't carry into them. Set `\.pageCovered` on each
  `navigationDestination` page, and add `.hiddenWhenCovered()` there too. The same applies to
  `.toolbar(.hidden, for: .navigationBar)`: set it on the root and on every destination.
- **An added escape action makes a page's buttons disappear.** `.accessibilityAction(.escape)`
  on a page that isn't a `.contain` container merges the whole page into one element. Always
  write `.accessibilityElement(children: .contain).accessibilityAction(.escape) { back() }`.
  (Dash's "Back crashes the app": `ui-testing.md` §2.)
- **Custom controls read wrong, and tests can't set them.** Use
  `.accessibilityRepresentation { Slider(value:in:step:) }` or `{ Toggle(isOn:) { label } }`.
  VoiceOver gets adjustable semantics, and tests get `app.sliders[id]` and a toggle value of
  `"1"`/`"0"`. For a slider, make each VoiceOver increment a whole edit that saves (Dash's
  `DashStepSlider`, `DashSwitchStyle`).
- **A drawn composite (a `Canvas`, a sprite) has no parts to find.** Lay a
  `Color.clear.accessibilityElement()` over it with the label, value and id (Dash's
  `running_pet` overlay in `RunMapPet.swift`: "the drawn sprite beneath it stays findable for
  tests").
- **Animation-only copies show up twice.** Flight layers, ghosts and warm-up copies carry the
  real views' ids and labels, so queries match two elements and VoiceOver can reach the
  copy. Mark each one `.accessibilityHidden(true)` (see the flight layer in `examples/card-pieces/ItemDetailHost.swift`,
  the warm-up copies in `RootView.swift`).
- **Don't lean on opacity for hit testing or for hiding from tests.** Whether an opacity-0
  view still takes touches is unsettled (`motion-craft.md` §4 flags Dash's one report as
  unverified), so set `.allowsHitTesting` explicitly wherever opacity hides something. Dash's
  notes also say an opacity-0 view leaves the accessibility tree, but Dash's own failure
  hierarchy (`plan-diag.xcresult`, 27 Sep) lists ids inside kept tab pages parked at
  opacity 0 (x = 1206), so XCUITest can still *find* such views. Those pages were also
  `accessibilityHidden`, yet the whole Plan page was listed while Home showed only its
  `ScrollView`. Neither opacity nor `accessibilityHidden` reliably keeps an element out of
  XCUITest's tree, so in tests assert reach (`ui-testing.md` §4). Debug overlays that tests
  tap sit at opacity 0.05 with a 6 pt font (Dash's `DebugRunReadout`): invisible to a person,
  and clear of whatever opacity 0 does to touches. The exact failure at 0 was never tested.

## 4. Concurrency

- **The app crashes at launch, but only once data exists.** `MainActor.assumeIsolated` traps
  when it is called off the main thread. Here it ran in a callback whose thread the app didn't
  control: a repository observer delivered on its disk queue. Fix: hop first, then assume.
  This avoids spawning a `Task` per callback:
  ```swift
  repo.observeHistory { [weak self] runs in            // called on the disk queue
      DispatchQueue.main.async { MainActor.assumeIsolated { self?.historyChanged(runs) } }
  }
  ```
  Use a bare `assumeIsolated` only where main-thread delivery is documented or configured:
  `DispatchQueue.main` closures; a `CLLocationManager` created on main (its header: callbacks
  arrive on the run loop it was created on); `MLNMapSnapshotter.start`'s completion (header:
  "executed on the main queue"); MapLibre's map-view delegate (not stated in its headers, but
  it is a `UIView` driven from main, and Dash relies on it).
- **"conformance of 'Coordinator' to protocol 'MLNMapViewDelegate' crosses into main
  actor-isolated code and can cause data races"**, with the note "main actor-isolated instance
  method … cannot satisfy nonisolated requirement". An Objective-C SDK delegate is implemented
  on a `@MainActor` coordinator. On Xcode 27 this is a warning in Swift 5 mode and an error in
  Swift 6 mode. Fix (checked clean in both modes):
  ```swift
  import MapLibre   // Dash's LiveMap needs no @preconcurrency for this; RouteMap adds it anyway
  @MainActor final class Coordinator: NSObject, MLNMapViewDelegate {
      // MapLibre calls its delegate on the main thread.
      nonisolated func mapView(_ m: MLNMapView, didFinishLoading style: MLNStyle) {
          MainActor.assumeIsolated { install(style) }
      }
  }
  ```
  Xcode 27's fix-its also offer an isolated conformance (`NSObject, @MainActor
  MLNMapViewDelegate`, plain methods). It typechecks clean in both modes too, but Dash never
  ran it, so its runtime behaviour with an Objective-C caller is unverified.
- **"main actor-isolated static property … can not be referenced from a nonisolated
  context."** For a computed static such as a pinned test clock, this is an **error even in
  Swift 5 mode** (a stored `let` of a `Sendable` type only warns there). Make statics that
  nonisolated code reads `nonisolated static var now`. Formatter caches: on the iOS 27 SDK,
  `DateFormatter` is `Sendable` (`NS_SWIFT_SENDABLE`), so a plain `static let` (or
  `nonisolated static let` in a `@MainActor` type) is enough, and Xcode 27 warns that
  `nonisolated(unsafe)` is unnecessary. Dash still carries `nonisolated(unsafe)` on its
  formatters, which now draws that warning. Pick the language mode per project on purpose
  (`architecture.md` §2).
- **"main actor-isolated static method … cannot be called from outside of the actor"** inside
  `Task.detached`. A static helper on a `@MainActor` type is main-actor isolated, so the
  detached decode can't call it (an error in both modes). Mark decode helpers
  `nonisolated static func` and deliver with `await MainActor.run` (Dash's `PetSprites`;
  sizing in §7). Derived data off main with a generation counter, and guarding delayed
  blocks against stale state, are in `architecture.md` §3.

## 5. Sheets, keyboard, detents, dialogs

- **The keyboard covers a content-height sheet's Save and Cancel.** In Dash, the UI test
  failed as a bare `XCTAssertTrue failed`, and only the failure video showed why. The fix
  (ffeb84c) has four parts: grow to `.large` while the field is focused, scroll the buttons
  into view once the sheet has grown, add a keyboard Done key, and dismiss the keyboard
  interactively.
  ```swift
  @FocusState private var noteFocused: Bool       // the field inside `form`: .focused($noteFocused)
  @State private var contentHeight: CGFloat = 0
  ScrollViewReader { reader in
      ScrollView { form.onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 } }
          .scrollDismissesKeyboard(.interactively)
          .onChange(of: noteFocused) { _, focused in
              guard focused else { return }
              DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {      // after the sheet grew
                  withAnimation { reader.scrollTo("buttons", anchor: .bottom) }
              }
          }
  }
  .toolbar { ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done") { noteFocused = false } } }
  .presentationDetents(noteFocused || contentHeight <= 0 ? [.large] : [.height(contentHeight + 12)])
  ```
- **A sheet opens at one height, then jumps to another.** A fixed detent didn't match the
  content. Measure the content and pass `.height(h)`; before the first measurement, fall back
  to `.large` or `.medium`. Dash's motion check counted these jumps as pops.
- **A custom dialog sits under the floating tab bar, or slides up like a sheet.** An
  `.overlay` inside the page sits below the bar, and a `fullScreenCover` slides up. Fix:
  - Present through `fullScreenCover` with `.presentationBackground(.clear)` and
    `.transaction(value: isPresented) { $0.disablesAnimations = true }`, then draw your own fade
    (`templates/app/FadeDialog.swift`; curve and timing in `motion-craft.md` §1 and §3).
  - Remove the dialog only in the completion of
    `withAnimation(.smooth(duration: 0.22), completionCriteria: .removed) { … } completion: { … }`.
    The default criterion is `.logicallyComplete` (checked in the SDK), which can fire while
    the fade is still in its tail. Dash's earlier ease-in fade lost its last, biggest step that
    way; the fade is now a spring.

## 6. Gestures

- **A custom overlay page has no edge-swipe back, or scrolls, map pans and chart scrubs
  steal it.** SwiftUI has no screen-edge gesture, and a plain `DragGesture` competes with every
  pan inside the page (Dash went straight to UIKit, so the SwiftUI route was never tried).
  Bridge the UIKit recognizer, and make the other pans wait for it:
  ```swift
  struct EdgeBack: UIGestureRecognizerRepresentable {
      let enabled: Bool; let changed: (CGFloat) -> Void; let ended: (Bool) -> Void
      func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }
      func makeUIGestureRecognizer(context: Context) -> UIScreenEdgePanGestureRecognizer {
          let pan = UIScreenEdgePanGestureRecognizer(); pan.edges = .left
          pan.delegate = context.coordinator; return pan
      }
      func updateUIGestureRecognizer(_ r: UIScreenEdgePanGestureRecognizer, context: Context) { r.isEnabled = enabled }
      func handleUIGestureRecognizerAction(_ r: UIScreenEdgePanGestureRecognizer, context: Context) {
          // .began/.changed → changed(progress); .ended → ended(progress > 0.35 || velocity.x > 700);
          // .cancelled/.failed → ended(false)
      }
      final class Coordinator: NSObject, UIGestureRecognizerDelegate {
          func gestureRecognizer(_ g: UIGestureRecognizer, shouldBeRequiredToFailBy o: UIGestureRecognizer) -> Bool {
              o is UIPanGestureRecognizer && !(o is UIScreenEdgePanGestureRecognizer)
          }
      }
  }   // page.gesture(EdgeBack(enabled: canGoBack, changed: …, ended: …))
  ```
- **A page scroll that starts on a slider moves the slider, and a value stays unsaved.** A
  `DragGesture` inside a `ScrollView` takes vertical drags. When the scroll view takes the
  touch over, `onEnded` never fires. Fix: lock the axis before editing, and detect the end
  from `@GestureState`. It resets on end *and* on cancel. (Dash's `DashStepSlider` in
  `SettingsControls.swift`: the saved speed stuck at 1.00× where 0.95× was expected. The code
  landed in 9eb56d4; commit 9bd1e12's message describes the fix, but its diff is an icon.)
  ```swift
  @GestureState private var touching = false
  .gesture(DragGesture(minimumDistance: 0)
      .updating($touching) { _, s, _ in s = true }
      .onChanged { g in
          if !dragging {
              guard abs(g.translation.width) > 6, abs(g.translation.width) > abs(g.translation.height) else { return }
              dragging = true
          }
          set(g.location.x)
      })
  .onChange(of: touching) { _, now in if !now && dragging { dragging = false; commit() } }
  ```
- **Long-press-to-drag rows in a scrolling list loses to the rows' buttons, or dies when
  the row scrolls away.** A SwiftUI long press sequenced with a drag lives on the row, and
  lazy relayout recreates the row. Fix: add a `UILongPressGestureRecognizer` to the ancestor
  `UIScrollView` (a `UIViewRepresentable` whose view walks `superview` in `didMoveToWindow`),
  with a delegate returning `true` for `shouldRecognizeSimultaneouslyWith`. Convert
  `location(in: nil)` into page coordinates, cancel a press on an immovable row with
  `isEnabled = false; isEnabled = true`, and keep the held row under the finger after each
  lazy relayout. Dash's `PlanHoldHook` took about 20 build-and-test rounds to get here.
- **A wheel or snap picker reports values the user never chose.** The first layout and
  programmatic `scrollTo` both pass rows through `onScrollGeometryChange`. Commit only while
  the phase from `onScrollPhaseChange` is `.tracking`, `.interacting` or `.decelerating` (a
  finger or its fling). **Not the SDK's `ScrollPhase.isScrolling`:** that is
  `phase != .idle` (checked by running it on macOS with Xcode 27; the iOS 27 SDK declares the
  same `SwiftUICore` enum), so it is also true in `.animating`, the
  phase of an animated programmatic scroll. Dash shadows it with a file-private
  `var isScrolling: Bool { self == .interacting || self == .decelerating || self == .tracking }`
  in `PrecisePickers.swift`. (Dash: "3 min" was reported where "5 min" was expected.)
- **A pressed state that doesn't swallow the tap:**
  `.simultaneousGesture(DragGesture(minimumDistance: 0).updating($pressed) { _, s, _ in s = true })`
  alongside `.onTapGesture`.
- **Taps near the bottom hit the floating bar, not the row.** In the app, pad scroll content
  by the bar's clearance so every row can scroll clear, and keep the bar
  `.allowsHitTesting(false)` while it animates away or back (Dash: tappable only once the page
  is gone). The test side (`isHittable` lies under a bar): `ui-testing.md` §5.
- **Native zoom pages close on a pull-down at the top.** `navigationTransition(.zoom)` dismisses
  on a downward drag at scroll offset 0. Design for it (tests: `ui-testing.md` §6).

## 7. Images and maps

- **Map renders come out many times too big.** The size was passed in pixels *and* a
  pixel ratio was passed as well. Give the size in points and the scale separately:
  `MLNMapSnapshotOptions(styleURL:camera:size: pointSize)` plus `options.scale = displayScale`.
  Put `w*scale x h*scale`, the theme and a version in the cache key. (Dash's Android
  sibling: maps 14× oversized, a 4837×2475 bitmap for a card.)
- **Hidden frame stalls from big assets.** Never decode in `body`. Decode large bitmaps
  (1254 px sprite sheets, logos) once, off main, downsampled to their display size, and cache
  them. Dash used `UIGraphicsImageRenderer` with `format.scale = 1` in a
  `nonisolated static func`. Use `preparingForDisplay()` for anything shown mid-motion
  (`motion-craft.md` §8). The same mistake on Android cost 60–70 ms frames.
- **`NSCache` can't be enumerated.** Keep a side index of the keys it holds, for searches
  like "widest cached stand-in". Give it a real `totalCostLimit` and per-entry cost
  (w·h·scale²·4 bytes; Dash used 64 MB).
- **A size-keyed image view fires one render per frame when its box animates.** Its
  `.task(id:)` key includes the size. In flights, draw cached images only
  (`shared-element-flights.md`).
- **Map setup lands on the same frame as a fling or a slide.** Run one off-screen snapshot
  at a time, rest about 120 ms between renders, time out at 20 s, and remember failures.
  Pause the queue while a list scrolls
  (`.onScrollPhaseChange { _, p in Snapshots.setPaused(p.isScrolling) }`; here the SDK's
  `isScrolling`, `.animating` included, is what you want) and during transitions (hold
  lengths: `motion-craft.md` §8).
- **Live map tiles stall or fail silently.** Arm a timeout (Dash: 12 s), and handle
  `mapViewDidFailLoadingMap`. Both switch to a local flat style, and a "Retry" control
  restores the real one. Give tests an offline switch that covers live maps too
  (`ui-testing.md` §1, `APP_NO_TILES`). Dash's `DASH_NO_TILES` covers only route snapshots,
  and no test sets it.
- **Follow mode turns itself off.** Region-change callbacks fire for your own camera moves
  too. Tell a user gesture apart by the reason: `regionWillChangeWith reason:` intersected
  with `[.gesturePan, .gesturePinch, .gestureZoomIn, .gestureZoomOut, .gestureOneFingerZoom]`
  (MapLibre).
- **Sending commands to a `UIViewRepresentable`.** Bump a counter on shared `@Observable`
  state (`recenterRequests += 1`). `updateUIView` acts when the counter differs from the last
  value it handled. No Bool that must be reset, and no stale closure captured in `make`.

## 8. Build traps: names and the type checker

- **A new type collides with an existing one.** A feature adds `RunClock`, and the app
  already has one. The result is `invalid redeclaration`, and worse, a script that hides build
  output then runs the *previous* binary. (Dash: "my last two test runs quietly used an old
  build.") Fix: name types by feature (`MetricDelta`, not `Delta`; `ItemPieceClock`), and
  before adding a type run
  `grep -rnE "(struct|class|enum|protocol|actor|typealias) Name\b" App Core` (macOS grep
  honours `\b`). Area prefixes for types and `Color`/`Font` statics, and the post-merge
  duplicate scan: `delivery-process.md` §5. Gating tests on build success:
  `setup-and-tooling.md` §7.
- **Shadowing a framework type** (general Swift, not hit in Dash). An app type named `Tab`,
  `Label`, `Section` or `Group` silently shadows SwiftUI's across the whole module. The errors
  then show up far from the declaration: with an app `enum Tab`, `Tab("Home", systemImage:)`
  fails with "'Tab' cannot be constructed because it has no accessible initializers" (checked
  with a probe). Prefix the name (e.g. `AppTab`).
- **"the compiler is unable to type-check this expression in reasonable time."** Long mixed
  arithmetic in `Canvas` or chart code causes it (Dash: twice, in `Charts.swift` and
  `MetricDetail.swift`). Split the maths into typed intermediate `let`s from the start, and
  keep literals `CGFloat`.

## 9. Debugging aids

- **Log what the effect actually received,** not what the model holds: an
  `NSLog("TAG t=\(t)")` inside the animatable modifier's body. That is how Dash learnt its
  frozen pieces were a tracking bug and not an animation bug: the clock moved and the effect
  never saw it. The `log show` recipe: `setup-and-tooling.md` §5.
- **Why did this body run?** Put `let _ = Self._printChanges()` at the top of `body`. It is
  underscored (debug builds only, may change); it typechecks on the iOS 27 SDK, but Dash
  didn't use it.
- **Everything else has a home:** the accessibility tree as the test sees it, throwaway
  `DiagUITests.swift` probes, the failure video and attachments (`ui-testing.md` §12); a fix
  that "does nothing" because the old binary ran (`setup-and-tooling.md` §7); motion that
  "looks off" (frame gaps and strips, `measuring-motion.md`).
