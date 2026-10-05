# Motion craft in SwiftUI

How to make every change on screen a motion that starts from where things are, and keep every
frame of it on time. Each rule here was measured, not guessed. The Dash numbers are there as
evidence, not as targets.

## 0. Before any animation work

- **`CADisableMinimumFrameDurationOnPhone = YES` in the Info.plist.** Without it, iPhone
  caps Core Animation (and so SwiftUI) at 60 Hz, while system transitions run at 120. Your
  custom motion then looks steppy beside them. It must be in the real Info.plist; one
  report says the `INFOPLIST_KEY_` build setting silently drops it. Check the built app:
  `plutil -p <App>.app/Info.plist | grep CADisable`.
- **Build the measurement first** (see `measuring-motion.md`). On the simulator, your eyes
  can't tell a 33 ms frame from a 16 ms one, and "it looks fine" is how the jank shipped.
- **One reduced-motion switch.** One flag that honours
  `UIAccessibility.isReduceMotionEnabled` and a test launch argument. Every animation asks
  it, every custom transition has an instant path, and UI tests run with it on except the
  motion journey.

## 1. Tokens: one vocabulary of curves

Name the curves once, as `Animation` values (`.timingCurve(x1, y1, x2, y2, duration:)`) or
springs, and never write `easeInOut(0.3)` at a call site. Dash kept Android's cubic-beziers
by name:

| Token | Curve | Used for |
|---|---|---|
| glide | (0.35, 0, 0.15, 1) | tab slides, capsule |
| ease | (0.05, 0.7, 0.1, 1) | reveals, count-ups, draw-ins |
| travel | (0.2, 0, 0, 1) | push/pop, morphs |
| flight | (0.25, 1, 0.5, 1) | shared-element pieces |
| fade | (0.33, 1, 0.68, 1) | opacity |

- **Springs for anything interruptible or finger-driven.** `.smooth(duration:)`,
  `.snappy`, `.interactiveSpring(response:dampingFraction:)`. A spring keeps its velocity
  when retargeted; a bezier restarts.
- **A spring from rest is gentlest at its start.** A steep ease-out is front-loaded: `fade(0.2)`
  covers 23% in one 60 Hz frame and 42% in a 33 ms one, such as a heavy tap frame (§3). For a
  full-screen dim, that reads as a pop. Dash's dialog dim went from a measured pop (40% in one
  frame) to smooth by switching `fade(0.2)` to `.smooth(duration: 0.28)`.
- For a pure function of time (to drive many things from one clock), port the curve:
  `UnitCurve.bezier(startControlPoint:endControlPoint:).value(at:)`.
- **Ease once.** If the animation already carries the curve, use the progress raw inside the
  modifier. If you ease inside the modifier (§5), animate linearly. Easing twice compounds
  into a slow start and a sluggish reveal. Dash's chart draw-ins say so in the code:
  `// already on DashEase from the animation`.

## 2. Nothing appears; everything arrives

The user's complaint is "things snap on or appear out of nowhere". The fixes:

- **Insertions get a transition, and state changes that move layout get `withAnimation`.**
  This covers placeholders → content, a section growing open, a card appearing when late
  data arrives, and a list changing when a sync lands. A detached task that assigns a
  result should assign it inside `withAnimation(.smooth(duration: 0.35))`.
- **Reveal once, not every visit.** Entrance animations (rise and fade with a stagger,
  count-ups, chart draw-ins) play the first time a page is shown in a session, and show
  settled after that. Keep a session set of seen keys. Claim the key in `init`, into
  `@State`, so a rebuilt view doesn't replay.
- **An entrance that is stood down still spends its key.** When a page arrives another way,
  skip its entrance: a shared-element flight already is the entrance, and two would stack.
  Still mark the key seen, or the next visit plays it (`ItemPageReveal` in
  `examples/card-pieces/ItemDetailHost.swift`).
- **An entrance waits until the view is really on screen.** When pages are built ahead of
  time (kept tabs, warm-up), `onAppear` fires unseen. Use an `onFirstShown` that waits for
  both `onAppear` and a "page shown" environment value.
- **Late images crossfade.** A thumbnail that gets its image after first render must fade
  it in over whatever stood in (the stand-in stays underneath until the fade ends). Seed
  from the memory cache in `init`, so a cached image is there on frame one.
- **A shimmer marks "no picture yet".** Keep the rule identical in the real view and in any
  flight copy, or the landing frame changes.
- **Numbers change through `contentTransition(.numericText())`** or a count-up, never a
  swap. Reserve the final text's width so nothing beside it moves.
- **A count-up's accessibility label is the final value,** so VoiceOver never reads a number
  mid-count. A value that changes after it has been shown animates from where it is. One
  whose entrance never played just snaps (`AnimatedNumber` in `templates/app/MotionKit.swift`).
- **In a slot that resizes, leave fast and arrive late.** A label leaving a shrinking slot
  must be gone before the slot pushes it over its neighbours. The arriving label waits until
  its slot has mostly grown. Dash's tab bar: removal fades over 70 ms; insertion fades over
  180 ms after a 120 ms delay. Meanwhile the selected capsule glides by
  `matchedGeometryEffect`, which is fine for a small element inside one container. For
  page-level moves, see `shared-element-flights.md`.
- **One motion per navigation, and pages never fade.** Either the page travels (a slide or a
  push) or the tapped thing travels (a card or a button), never both. Slide opaque pages and
  put a flat dim over the covered one. Don't dim between tabs. A half-transparent page
  double-draws and flickers: on Dash's Android reference, the grey scrim between tabs *was*
  the flicker.

## 3. Mount, then move

**Never build a heavy view on the same frame it starts moving.** The build pushes that
frame late, and the motion's front-loaded first step (DashFlight moves 13% in 16 ms)
becomes a visible jump.

- **Tab switch.** Mount the arriving page off screen, parked beside the viewport, then
  start the slide on the next turn (`DispatchQueue.main.async`). Better still, keep pages
  alive (below).
- **Custom morphs and flights.** Put the new content on screen at t = 0, identical to the
  old picture. Start the clock only once it has been drawn.
- **Dialogs.** Wait 30–60 ms (a frame or two) before the fade starts. The tap's own frame
  can be heavy, and the fade's clock runs through it, so the first visible frame shows up
  part-way done. Dash measured 40% of a dim in one frame.
- **Build the first screen, then the rest.** A heavy page that arrives with a motion builds
  only what is above the fold (and what gets measured) on its mount frame. The rest waits a
  turn: a `@State restBuilt` flipped in `onAppear` through `DispatchQueue.main.async`. This
  splits the longest pause before the motion across two still frames, and nobody watches
  below the fold fill in (`examples/card-pieces/ItemDetailHost.swift`).
- **App-wide redraws wait for the motion that asked for them.** A choice that re-renders every
  screen (units, theme, locale), applied in the dialog's tap handler, lands on the fade's
  first frames. Dash lost ~2 frames that way, and the dialog closed with a jump. Apply it
  once the fade is done: `asyncAfter(deadline: .now() + 0.26) { app.units = units }`, or 0
  when motion is reduced.
- **Tear down after landing.** Taking a big view down is a heavy frame too. Keep two flags:
  - `covering` releases returning chrome (the tab bar) as the close starts;
  - `mounted` holds the teardown until the close ends.

  If other motion is still running then, keep the view mounted, invisible and untouchable
  for ~0.3 s more, and remove it in a transaction with `disablesAnimations = true`. Dash's
  `+`-morph close went from 24 ms/s with a 34 ms frame to 0 ms/s and 16.7 ms
  (`StartMorphState.covering`, `ItemLayerState.retiring`).

## 4. Keep pages alive

Rebuilding a tab page on every switch spends the slide's first frames on a build, loses
scroll position and `@State`, and restarts every image load. Instead:

- Build a page the first time it's opened, keep it, and park hidden pages far off screen
  (x = 3 × width). *Unverified* whether a zero-opacity page left in place steals touches and
  scrolls: the swipe one seemed to eat in Dash turned out to be a weak test fling. Parking is
  defensive, and cheap.
- Per page: `.allowsHitTesting(isShown)`, `.accessibilityHidden(!isShown)`, and an
  environment value `tabPageShown`. Work that should stop when a page is left (scanning,
  audio preview, observers) watches that value, not `onDisappear`, which never fires now.
- After launch, while nothing moves, build the other tabs one at a time (450 ms apart), and
  build one copy each of your heaviest pushed page types, unseen. That warms SwiftUI's
  one-time type costs. Dash's first run page open went from 127 to 101 ms.
- **A warm-up copy must not spend real entrances.** Set the reveal registry to `warming`
  while the copy builds. Also give the copy a fake id, no network or map work, and no
  transition ids. Otherwise the user's first real open finds its entrance already played
  (`.warmUp(when:)` in `templates/app/KeptTabPager.swift`).
- Any id or matched-geometry source that exists on several kept pages must be scoped to the
  shown page. Otherwise a transition picks a hidden page's copy. Dash's zoom shrank into a
  hidden tab's card in 60 ms.

## 5. Animate without rebuilding

- **Per frame, only a modifier's `body(content:)` should run.** An `Animatable` view whose
  body builds a big subtree rebuilds it every frame. Dash's Start morph rebuilt the whole
  Start page ~24 times per open. Use `GeometryEffect` for transforms and an animatable
  `Shape` for clips (`animatableData` = progress). Content passed through a modifier is not
  rebuilt.
- **No `if`/`else` around content inside a modifier.** `if p > 0 { content.clip… } else
  { content }` gives the content a new identity when the branch flips. SwiftUI throws the
  page away and builds it again, losing scroll and state, on the first frame of a swipe.
  Always apply the same modifiers, neutral at rest (radius 0, scale 1, a clip shape that
  returns a huge rect when off).
- **One clock for a choreography.** Animate one `Double` linearly
  (`withAnimation(.linear(duration: T)) { clock = T }`). Every piece derives its frame,
  alpha, corners and scale from it through its own small `Animatable` modifier, with the
  easing applied inside. Many independent curves, delays and staggers then stay in exact
  sync, and interruption logic stays simple.
- **Hand the clock down through the environment, from a body that reads it.** Modifiers
  deep in a subtree (paper fade, after-pieces, left-behind bits) read
  `@Environment(\.myClock)` and pass it to an `Animatable` modifier. The environment change
  carries the animation's transaction, so they interpolate per frame.
- **Clip once, around the outside.** Avoid `mask`/`clipShape` with rounded corners on huge
  subtrees during motion where you can; each forces an offscreen pass. When you must (a
  shrinking page), use one clip on the outermost view.
- **No `compositingGroup()` or `drawingGroup()` on moving pieces.** Each is an offscreen
  pass, and `drawingGroup` rasterises, so scaled text blurs. Plain `.opacity` per piece is
  enough. (This comes from Dash's research before the build; it was not measured on its own.)
- **Lay out once, at rest size, and animate the transform.** Anything that changes size in
  motion (a morph, a flight piece) is laid out at its own unscaled size and scaled into the
  moving frame. Text offered an animating width re-wraps or truncates on every frame. Dash's
  button-to-page morph scales both sides to cover the frame. Its flights measure rest size
  apart from the screen frame, because a pressed card is 2.5% smaller
  (`shared-element-flights.md`).

## 6. Observation, identity and insertion rules

These are the three that froze Dash's pieces, each found only by instrumenting.

1. **Read observed state in `body` itself, not inside a `GeometryReader` or `ForEach`
   closure.** Those closures run later, outside the body's observation tracking. The value
   changes, nothing re-runs, and the pieces sit still. Read into locals at the top of
   `body`, then use them inside.
2. **A view inserted in the same update as an animated change does not animate that
   change.** It is created with the end value. Insert first. Start the animation once the
   view has been drawn: have the inserted layer call back from `onAppear`, then start on
   the next turn, with a 2-frame timer as a backstop. `DispatchQueue.main.async` alone was
   not enough; it failed 2 runs in 3.
3. **Observation fan-out.** If every list row reads `state.flight` (or any shared
   property), every row re-evaluates when it changes. Dash had hundreds of modifier bodies
   running on the flight's first and last frames. Read the narrow property first and return
   early (`guard state.flyingId == myId else { return … }`), so every other row depends only
   on that.

Caveat: rule 1, and the environment clock in §5, were inferred from symptom and fix. Their
cause was never isolated. Rule 3 was measured only together with §7's 0.001 fix. All three
are cheap, so follow them anyway.

## 7. Draw before you show

**Core Animation doesn't draw a layer at opacity 0.** A view hidden at 0 and revealed on a
later frame gets rasterised on that frame (text, images). For a whole page, that cost Dash a
40–50 ms frame at landing, mid-motion.

- Hide things that are about to appear mid-motion at **opacity 0.001**, not 0. They get drawn
  while nothing shows, on a frame where nothing moves.
- It must be 0.001 **from the start** (the build frame). Switching from 0 to 0.001 later was
  measured not to help.
- It costs time on the frame it moves to, so put that frame where nothing moves (the tap's
  build frame). The response pause grows (Dash +25 ms) but the motion stays clean.

## 8. Big images and late data

- **An image arriving mid-flight costs its first frame** (texture upload). Dash measured
  33 ms at ~200 ms into a flight. Decode off the main thread (`preparingForDisplay()`) and,
  for the thing most likely opened next, have it in memory before the tap. Dash rendered
  and cached the hero maps of the newest three runs during idle warm-up.
- **Hold background renders during transitions.** Pause snapshot and render queues for the
  length of a push or flight (Dash: 1.0 s push, 0.6 s pop, 0.6 s tab slide), and while a
  list scrolls. Let cached images keep arriving.

## 9. Accessibility changes cost frames, so time them

With an accessibility client running (VoiceOver, Switch Control, and **XCUITest**),
flipping `.accessibilityHidden` on a long list, or posting `.screenChanged`, costs a frame
or two while the tree rebuilds. So:

- Flip on frames where nothing moves: on the tap (the build frame) when a page covers a
  list, and ~150 ms after a close has settled (after the bottom bar lands) when it uncovers.
- Post `.screenChanged` at the same moments, not on "landed" or "closed" while things are
  still moving.

## 10. Custom transitions own their hit testing and accessibility

A custom layer (morph, flight, overlay page) replaces what a `NavigationStack` push did for
free: hiding the list from VoiceOver and taps while covered, screen-change posts (at the still
moments of §9), an escape action, and back refusal while a dialog is up or a close is being
prepared. Keep a generation counter so a stale completion never closes the wrong thing. The
full list: `shared-element-flights.md`, "Everything a NavigationStack push did for free".

## 11. Budgets the numbers taught (Dash, simulator, 60 Hz)

The full budget set, the journey mean and the baseline rules: `measuring-motion.md`.

- **Motion hitch during movement:** Dash's taps and pieces flights reached 0 ms/s once
  fixed. Keep ≤ 20 ms/s per moment and ≤ 7 averaged. Apple rates < 5 good and ≥ 10
  critical.
- **Response stall:** ~90–100 ms for a pushed page, measured with XCUITest's accessibility
  overhead. A real device with no accessibility client is lower.
- **Snaps:** zero. Every "pop" the detector found was either a real bug or a recorder
  artefact, and the recorder ones were eliminated by the beacon.
