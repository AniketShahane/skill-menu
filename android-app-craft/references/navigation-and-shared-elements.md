# Navigation and shared elements

How one page gives way to the next, and how a tapped card flies into the page it opens. The
curve and spring vocabulary is in `motion-system.md`; frame measurement is in `performance.md`.

The working code is in the starter's `ui/nav/` package
(`templates/starter/app/src/main/java/com/example/starter/ui/nav/`): `Route.kt`, `NavMotion.kt`
(pure Kotlin), `Navigator.kt`, `AppNavHost.kt`, `SharedPiece.kt`. Its JVM tests are
`NavMotionTest` and `NavigatorTest`. The shipped originals are
`examples/sample/ui/NavMotion.kt`, `examples/sample/ui/AppNavigation.kt` and
`examples/sample/test/NavMotionTest.kt`; Flick's container transforms are in
`examples/flick/sender/NowPlayingBar.kt` and `examples/flick/sender/VideoTile.kt`.

android-design `motion-and-performance.md` §7 has the hoisting and latching rules and a
route-motion table. Its "routes cross-dissolve" advice is wrong for whole pages; see §4 here
and correction 2 in `android-design-corrections.md`.

---

## 1. One motion per navigation

**Rule.** In any navigation, either the page travels or the tapped thing travels. Never both.

**Why.** A page that slides while a shared element flies out of it tears the two apart: the
element leaves the page it belongs to, lands where the page is not, and the page catches up
afterwards. Dash's run page slid up while its map flew in the overlay, and the hero's buttons
were hidden under the overlay for the whole flight (dash@42b59ff). Flick's hero and container
arms drop every translation for the same reason (flick:sender/.../FlickApp.kt:357-377).
Do not copy the rest of Flick's phone shell: under reduced motion it still uses
`EnterTransition.None togetherWith ExitTransition.None` (FlickApp.kt:350-351), and its HERO arm
cross-fades whole pages on `fastEffectsSpec` (FlickApp.kt:357-360). Those are the patterns
`motion-system.md` §11 and §4 here forbid. Copy the receiver's `cut()` and Dash's opaque slides.

**How.** Five motions, in `PageMotion`:

| Motion | Pages | Enter / exit | Spec (Dash's numbers) |
|---|---|---|---|
| `TAB_FORWARD` / `TAB_BACK` | side by side, edge to edge | slide in ±width / out ∓width | `tween(400, Glide)`; `spring(1, 1500)` on an overtake |
| `PUSH` | new page rises over the old | in from +height / old drifts −height/12 | `tween(340, Travel)` |
| `POP` | top page falls away | old falls to +height / new from −height/12 | `tween(320, Travel)` |
| `MORPH` | neither moves | zero-distance slides that hold both pages composed | `tween(500, Travel)` holds both pages; pieces fly `tween(480, Flight)` (`PIECES_MILLIS`) |

Dash's `MORPH_BOUNDS_MILLIS` (400, on Travel) is used only by its + button's container transform
(§8). The starter flies its pieces for `MORPH_BOUNDS_MILLIS = 400` on Flight, 80 ms shorter than
Dash's pieces.

The 1/12 parallax reads as depth and never uncovers an edge of the page behind. Tabs get none:
they are side by side, not stacked.

**Evidence.** `examples/sample/ui/NavMotion.kt (`PageMotion`, `NavMotion.dims`, `NavMotion.paintsOwnGround`)`;
`examples/sample/ui/AppNavigation.kt (`AppNavHost`)`.

---

## 2. Every decision lives in NavMotion, a pure tested rules object

**Rule.** Which motion, how long, which page dims, which page paints its ground, which pair of
keys may match and whether a page arrives settled are all functions of the two routes, in one
Compose-free object. The host only reads them.

**Why.** "The tests read exactly what the app runs rather than a description of it" (dash
NavMotion.kt:104-108). NavMotionTest's header names the two bug classes: "two things moving at
once when only one should, or an animation being cut off by something shorter than itself.
Neither is visible in a screenshot" (`examples/sample/test/NavMotionTest.kt (class KDoc)`). Flick's
`routeMotion` table has the same intent but is private inside `FlickApp.kt`, so it cannot be
tested (flick:sender/.../FlickApp.kt:726-739). Copy Dash's shape.

**How.** The starter's `NavMotion`:

| Function | Answers | Invariant tested |
|---|---|---|
| `motion(from, to, direction, morphable)` | which `PageMotion` | same whichever way round the pair is given |
| `durationMillis(motion)` | how long | every duration in 150..600 ms; MORPH > PUSH |
| `morphId(from, to)` / `showsCards(route)` | which item flies, if any | a pair that can fly only ever moves as MORPH |
| `sharedScope(route, stack)` | the namespace a page's pieces register in: a card page's own key, a Detail's opener | the card end and the page end agree, from every card page |
| `sharedKey(id, part, scope)` | the key both ends register | differs across card pages and across parts |
| `dims` / `scrims` / `pageDim(dark)` | which page darkens, and how much | exactly one page dims; tabs and morphs never scrim |
| `paintsBackground` / `fadesGround` | which page paints the app ground | exactly one while stacked; both tabs while sliding |
| `arrivesSettled(page, arrivedFrom)` | whether its entrance may play | a tab reached by navigating arrives settled; of the tabs, only the first screen assembles itself; a pushed page keeps its entrance |
| `overtakes(since, animatorScale)` | whether a tab tap cuts a slide short | scaled by the system animation speed |

Constants that must agree are tested together: `MORPH_BOUNDS_MILLIS (400) < MORPH_MILLIS (500)`;
`PAGE_ARRIVE_DELAY_MILLIS + PIECE_FADE_MILLIS (200 + 220) ≤ MORPH_MILLIS`;
`PIECE_LEAVE_MILLIS (150) < PIECE_FADE_MILLIS (220)`.

### Adding a tab or a page

There is one list of tabs, `Route.tabs`. The bar is built from it (`StarterApp`), the navigator
slides in its order, and the JVM journeys are generated from it. Everything else a new route needs
is below; the compiler catches the first two groups, the tests catch the rest.

**Adding a tab** (say `Route.Habits`):

1. **`Route.kt`:** a `data object Habits : Tab` with a unique `key` (`"tab:habits"`). Put it in
   `Route.tabs` at its place in the bar. Add it to `encode` and `decode`. Without `decode`, a
   restore after process death drops the stack back to the first tab.
2. **Its label and glyph:** add a string to `res/values/strings.xml` (`tab_habits`), then add a
   branch to `tabLabel` and `tabIcon` in `ui/StarterApp.kt`. Both `when`s have no `else`, so the
   app does not compile until they are there. Draw the glyph in `AppIcons`, on the same stroke
   as the others.
3. **Its page:** add a branch to the `when (route)` in `StarterApp`'s `AppNavHost` lambda. This
   `when` is exhaustive too.
4. **Cards:** if the tab shows cards that open a Detail, add it to `NavMotion.showsCards`. Its
   cards then name keys with `Modifier.sharedPiece(item.id, "title")`, exactly as Home's do.
5. **`Tags`:** a tag on its scrolling list (`Tags.HabitsList`), so tests can find the page.
6. **Tests:**
   - `NavMotionTest`: nothing to add. `journeys` and the card-key test are generated from
     `Route.tabs` and `showsCards`. Run it.
   - `NavigatorTest`: add a case if the new tab changes what back does (back from any tab but the
     first goes to the first).
   - `TextFitTest.pages`: add the page, so it is checked at every font scale.
   - `NavigationFlowTest`: it finds tabs by label (`tab(R.string.tab_settings)`), never by
     position, so it keeps working. Add a visit to the new tab if it has a flow worth proving.
7. **Tours:** add the label to `TAB_LABELS` in the baseline-profile generator
   (`baselineprofile/.../StarterBaselineProfileGenerator.kt`) and to the default `tabs=(…)` in
   `scripts/measure-frames.sh`. Neither fails when a tab is missing; they silently skip it.

**Adding a pushed page** (say `Route.Stats(id)` or a second Detail kind):

1. **`Route.kt`:** a `data class` implementing `Route` (not `Tab`), with a `key` that includes its
   arguments, plus `encode` / `decode`.
2. **Its page:** a branch in `StarterApp`'s `when (route)`. It opens with `navigator.go(route)`
   and closes with `navigator.back()`. It pushes and pops by itself; nothing else is needed.
3. **If it shows cards that open a Detail:** add it to `showsCards`. `sharedScope` then gives its
   cards its own key, and a Detail opened from it names it as the opener. `isPageEnd` is
   `route is Route.Detail`, so a pushed card page stays the card's end.
4. **If it is opened from a card (a new flying page kind):** extend `morphId` and `isPageEnd` to
   it and give it a branch in `sharedScope`. Add its pairs to `NavMotionTest`.
5. **`Tags`**, **`TextFitTest.pages`**, and a `NavigationFlowTest` step if it has a flow.

---

## 3. The host

**Rule.** One `AnimatedContent` inside one `SharedTransitionLayout`, keyed on the route's
identity, with every per-frame value read in a layer or draw lambda.

**How.** `AppNavHost` is a port of `examples/sample/ui/AppNavigation.kt (`AppNavHost`)`. What each part
is for:

- **`contentKey = { it.key }`** so a route's arguments can change without a transition.
- **`SizeTransform(clip = false)`**, or the default clips and anchors top-start.
- **`targetContentZIndex = depth`**, so a pushed page is above its parent and a popping page
  stays above the page it uncovers.
- **Partner.** A leaving page animates against what is now current; the current page against
  `navigator.previous`, which only the navigator remembers. Latch per-page decisions with
  `remember(saveKey, leaving)`: a page still leaving would otherwise be re-paired with whatever
  is chosen next (dash:DashNavigation.kt:422-428).
- **`SaveableStateHolder` keyed `"route#serial"`.** Going back finds the scroll position it left;
  opening the same route again gets a new serial and starts at the top. Remove every key that
  has left the stack in a `SideEffect` (dash:DashNavigation.kt:486-495; dash
  docs/upgrade-0.9.4/README.md:49-58).
- **`preferredFrameRate(FrameRateCategory.High)`** on the host. On Android 15+ Compose votes a
  frame rate per invalidation; without a preference the platform may finish transitions at
  60 Hz once the finger lifts (dash docs/upgrade-0.9.1/README.md:30-33). It is a stable,
  non-experimental API in Compose 1.11 and 1.12 (checked in the ui jar). Leave it off screens
  that stay up for an hour.
- **`hazeSource`** on the page host, exposed as `LocalBackdrop`. One source only: a second draws
  the pages into the blur twice. If the shell provides `LocalBackdrop`, the host sources into it.
- **`RevealSession(route.key)`** around each page, with `LocalArrivesSettled` provided, so
  entrances play once per identity and never while a tab slides in (`motion-system.md` §4).
- **Overtakes.** A tab chosen before the last slide ended finishes on `spring(1f, 1500f)`.
  Compose hands the interrupted page a spring whatever its spec; on the slow-starting glide the
  arriving page would still be leaving the far edge, and a bare band opens between them
  (`examples/sample/ui/NavMotion.kt (`NavMotion.OVERTAKE_STIFFNESS`)`).
- **No heavy work while a transition runs.** Dash pauses map renders while
  `transition.isRunning` (dash:DashNavigation.kt:452-453). Anything `remember`ed inside a page is
  built on the frame it starts moving; hoist it (android-design motion-and-performance.md §7).
- **`chrome` slot** for the floating bar, inside the shared-transition scope (§9).

---

## 4. Never fade whole pages: slide opaque, dim with one rectangle

**Rule.** Pages stay fully opaque. The page being covered gets one flat `drawRect` of near-black
over it, drawn inside the page's own layer. Never fade a whole page with the default compositing.

**Why.** Alpha below one on a whole page of text, maps and glass renders it into a full-screen
offscreen buffer every frame. On a 1440×3120 screen that was Dash's single biggest source of
slow draw commands. Replacing it cut slow issue-draw commands 39 → 25, p90 18 → 15 ms and p99
30 → 24 ms (dash@c9323c7; `examples/sample/ui/NavMotion.kt (`NavMotion.dimAmount`)`).

**How.**
```kotlin
.drawWithContent {
    if (sliding) drawRect(ground)                    // only while it travels
    drawContent()
    val shade = if (covered) dim else 0f             // dim: transition.animateFloat, read here
    if (shade > .004f) drawRect(dimInk, alpha = shade)
}
```
- **Strength (Dash's):** 0.32 in dark, 0.12 in light. Near-black at a third reads as the page
  receding; over a light page it reads as a grey flash.
- **Exactly one page dims.** A pop dims the page being uncovered (it brightens as it is
  revealed); every other move dims the page leaving.
- **Ask the right question.** "Is this a tab switch" means *both ends* are tabs. Dash asked "am I
  and the live page both tabs", which for the live page is itself, so no pop ever dimmed
  (dash:NavMotion.kt:414-430).
- **No dim between tabs.** They are side by side. The grey that swept over the page leaving was
  most of what users called "the flicker between tabs" (dash@1940b64).
- **No dim under a morph.** The page's ground fading in already says "covered"; a scrim under it
  flashed dark on back — the lower screen dipped 11 luma levels, 0 after the fix (dash@ea5137b).
- **Grounds.** Screens paint no background; the host paints the app ground once. A page paints
  its own ground only while it slides. Two opaque grounds is a wasted full-screen fill per frame;
  none lets the page below show through. Both tab pages paint while sliding, because a third tab
  cutting in turns the middle page round over the first (dash:NavMotion.kt:496-512).
- **Smaller fades** (a section, a piece) use `CompositingStrategy.ModulateAlpha`, which multiplies
  alpha into each draw op with no buffer. Drop the layer once settled. The price is that draws
  which overlap inside the faded subtree show through each other while it is part-faded.
- **The one sanctioned whole-page fade** is the starter's Detail content during a MORPH: 200 ms to
  420 ms, on `ModulateAlpha`, so no buffer (`AppNavHost`, the `contentShown` layer). It is short and
  covers a page whose sections do not overlap. Dash is stricter and fades each section of the page
  by itself (`afterRunPieces`); do that instead when
  a page has layered content.

---

## 5. Predictive back shrinks the top page under the thumb

**Rule.** During a back swipe only the page being swiped away transforms, driven straight from
the gesture's progress. Commit on an eased tween; cancel on a spring.

**How (Dash's numbers).** Progress eased on `Arrive`. Scale `1 − 0.08·eased`, `translationX =
28 dp·eased`, clip `RoundedCornerShape(28 dp·eased)`, all inside the page's `graphicsLayer`, so
the dim rectangle is carried and clipped with it.
```kotlin
PredictiveBackHandler(enabled = navigator.canGoBack) { events ->
    try {
        events.collect { backProgress.snapTo(it.progress) }
        navigator.back()
        backProgress.animateTo(0f, tween(NavMotion.BACK_SETTLE_MILLIS, easing = Easings.Arrive))  // 280
    } catch (cancelled: CancellationException) {
        // The cancel cancels this coroutine, so settle outside it, then let the cancel through.
        withContext(NonCancellable) { backProgress.animateTo(0f, Springs.Snappy) }
        throw cancelled
    }
}
```
**The cancel spring needs `NonCancellable`.** When the user lets go without committing,
activity-compose 1.10.1 calls `OnBackInstance.cancel()`, which cancels the event channel and then
`job.cancel()` on the coroutine running this lambda (checked in the aar with javap). A bare
`animateTo` in the `catch` runs in a cancelled job and throws at its first frame. The page then
stays shrunk, offset and rounded until the next swipe. Dash has the bare form
(`examples/sample/ui/AppNavigation.kt (`PredictiveBackShrink`)`); it never shows, because Dash targets 35 without the
flag below and receives no progress events. The starter targets 36 with the flag, so it needs the
fix. **Test a cancelled swipe:** swipe in from the edge, go half way, drag back and let go. The page
must spring back to full size and square corners.
Flick uses a plain `BackHandler` with no progress motion (flick:FlickApp.kt:306-329); Dash's is
the one to copy (dash:DashNavigation.kt:363-371, 454-465).

**Caveat.** Progress events need targetSdk 36 or `android:enableOnBackInvokedCallback="true"`.
Dash targets 35 with no flag; test the swipe on a real phone before calling it done.

---

## 6. The tab strip's capsule rides the page's clock

**Rule.** The selected-tab capsule glides on the same curve and clock as the pages, from wherever
everything currently is, and is drawn in the draw phase.

**Why.** Dash fixed three bugs at once (dash@1940b64): icons vanished mid-jump because slots
clipped them; an icon jumped half a label's width because label widths were known only after
layout; the leaving label cut out in one frame.

**How (Dash's `TabMotion`).** A plain class holding the capsule's left and width, each icon's
origin and each label's opacity. `select(i)` captures where everything is *now*, so a re-tap
mid-glide never jumps. Pre-measure every label with a `TextMeasurer`. Drive it with
`animate(0f, 1f, tween(TAB_MILLIS, Glide))`, or the overtake spring (threshold 0.001). The chosen
label fades in over progress 0.3 → 0.8; others are gone by 0.3. Slots take their final widths at
once (`examples/sample/ui/AppBottomBar.kt (`TabMotion.select`, `TabCapsule`)`; `examples/sample/test/TabMotionTest.kt`).

Start the indicator from the click handler, not from route state. Flick's nav fill was two frames
behind the finger, and a `launch` from the click moves it a whole frame ahead of the route it
causes. Flick also moved the fill to `fastSpatialSpec`, which is 53 % of the way home at 50 ms
against 28 % for the default spring (flick@a0ebf75). The change is `select(i)` plus
`launch { animate(…) }` inside the tab's `onClick`, with the route read back as the authority.

**Known gap.** Dash's `TabMotion` and the starter's `GlassBar` still start from route state
(`LaunchedEffect(current)`, `examples/sample/ui/AppBottomBar.kt (`TabMotion.select`)`; `LaunchedEffect(selected)`
in the starter's `ui/components/GlassBar.kt`). Port Flick's change when the bar feels late.

---

## 7. Card → page: piece by piece

**Rule.** Don't grow the card as one container. Each piece of the card (image, title, numbers,
chip) flies to its own place on the page. What only the page has arrives once the pieces are
nearly home.

**How the rules fit together** (Dash's run card, `examples/sample/ui/AppNavigation.kt (`ItemPiece`)`):

- **Keys are namespaced by the card page, fixed from the first composition.** Keys match on text
  alone. The same run on Home and on Activities matched itself, and every run flew across an
  ordinary tab switch (dash@42b59ff). So each key carries a scope: a card page's own key, and for
  the Detail, the key of the card page it was opened from (`NavMotion.sharedScope(route, stack)`,
  `examples/sample/ui/NavMotion.kt (`NavMotion.pieceScope`)`). The scope must be something each page can say from its
  very first frame: "a gate that only opens once the transition is under way opens a frame too
  late" (dash:NavMotion.kt:397-412). The starter's host asks `sharedScope` once per entry, with
  `remember(saveKey)`, while the Detail is still on the stack above its opener, and keeps the
  answer for the pop, when the stack no longer says. It provides it as `LocalPieceScope`.
  `NavMotion.sharedKey(id, part, scope)` is `"$part:$id@$scope"`.
- **A Detail opened from two tabs.** A screen must never name its opener. If the Detail says
  `Route.Home` and the same Detail is also opened from a second card tab, the second tab's card
  registers under its own name, the Detail under Home's, and the keys never match. The motion
  is still MORPH, so neither page moves and nothing flies: the page just fades its ground in, a
  flat cut. No test fails, because the keys are built inside the screens. The fix is Dash's: the
  Detail's scope is whichever page is below it on the stack. In the starter, both ends call
  `Modifier.sharedPiece(item.id, "title")` and the host fills in the scope.
  `NavMotionTest` (`a card and the detail it opens name the same key, from every card page`)
  checks both ends for every tab in `showsCards`. Marginalia reached the same design from the
  other side: its reader route carries the surface it was opened from, and every key starts with
  it (`library/42/hero`, `foryou/42/hero`; marginalia@87b6510).
- **One key, one surface.** Marginalia's For You recommended the same items its Library showed,
  and a find-similar sheet showed them again in a separate hierarchy. One `hero-<id>` on two
  surfaces at once crashed the shared-bounds pass, and the transition was removed. It came back
  with the launching surface in every key (marginalia@87b6510). When an item can appear twice on
  one page, put the surface in `part`.
- **For a surface, only the page's end fades.** Both ends are drawn in the overlay. For a surface
  (a map, a panel), the card's end stays opaque underneath; the page's end is drawn over it
  (`zIndexInOverlay` +1) and fades in. Two half-faded copies of a map let the list show through
  its middle (dash@184fd2f). Dash's text pieces cross-fade both ends
  (`examples/sample/ui/NavMotion.kt (`NavMotion.isDestinationEnd`)`). The starter applies the page-end-only rule to every
  piece, text included; that is simpler and has shown no gap.
- **Fade pieces yourself with `ModulateAlpha`**, with `enter = None, exit = None` on the shared
  bounds. The shared-bounds fade "renders a part-faded piece into an offscreen buffer every
  frame — for the map, one the width of the phone" (dash:DashNavigation.kt:650-663).
- **Leave faster than you arrive.** Page look arrives over 220 ms, leaves over 150 ms, so there is
  always more of one look than of the gap, and the front-loaded flight is not a pale card when it
  lands (dash:NavMotion.kt:142-154).
- **Only the pair in flight carries fades, corners and layout holds.** Otherwise "a tab switch or
  a push over Home … lasted as long as a flight" (dash@63e27f0). Latch "which item is flying"
  when the page starts to arrive or leave.
- **`scaleToBounds` over `RemeasureToBounds`**, unless re-layout *is* the effect.
  `RemeasureToBounds` re-measured Dash's whole start page every frame of a 460 ms transform
  (dash docs/upgrade-0.9.1/README.md:68-70). Dash's surfaces (map, panel) fly with
  `RemeasureToBounds`, but only the map's contents
  re-lay out, because its growing box is the zoom. The panel's contents are held at their landing
  size with `skipToLookaheadSize` (`DashNavigation.kt:701-708`; dash@c4ab031). Text: `FillWidth` + `CenterStart` so the line never
  re-wraps; different words in the same place: `None` at full line width, crossfading.
- **Hold layout in flight** with `skipToLookaheadSize(inFlight)`: ~30 text measures a frame
  otherwise (dash@c4ab031). **Remember the `inFlight` lambda**: the default is made afresh on
  every call and compared by identity, so every recomposition re-measured the piece
  (dash:DashNavigation.kt:683-690).
- **Name the overlay z-order.** A piece with no number sorts *below* every numbered one, children
  included, so a title inside a lifted map drew underneath it (dash@184fd2f; tested in
  NavMotionTest.kt `words and the chip ride above both ends of every surface`).
- **What only the page has** arrives at `PIECES/2 + i·55 ms` (buttons `i·45`) and is all in place
  by 800 ms. What only the card has leaves in
  90 ms and returns after 300 ms.
- **Close is not open in reverse.** Time pieces by which *side* they are on, not by whether they
  are arriving. Timed by arriving, Dash drew the card at 3× its size for 270 ms (dash@07d337d).
- **Colour through the gap.** Lime part-way over near-black is olive; Dash's dark panel swaps in
  60 ms, linear (dash:NavMotion.kt:181-186).

**The starter's version** is one helper, `Modifier.sharedPiece(id, part)`: `sharedBounds`, enter/exit
None, `scaleToBounds(FillWidth)`, bounds on `tween(MORPH_BOUNDS_MILLIS, Flight)`, the page's end
fading on `ModulateAlpha` and held with `skipToLookaheadSize`, only while morphing. The host fades
the Detail's ground in over 220 ms (one `drawRect`), and the rest of its content from 200 ms to
420 ms, so the page arrives as the pieces land.
```kotlin
// Any card page, on the card's title:
Modifier.sharedPiece(item.id, "title")
// Detail, on the page's title. The same id and part; the host supplies the scope
// (the card page's key on both ends), so neither screen names a route:
Modifier.sharedPiece(id, "title")
```
A page with no scope (a page without cards, or a Detail pushed from one) registers nothing, so
its pieces are plain layout.
Pass `shape` when the seat is rounded: the overlay copy bypasses every ancestor clip, so a piece
from a rounded seat flies as a hard rectangle without one (flick@a0ebf75).

---

## 8. Container transforms

**Rule.** When one surface becomes another (a button into a page, a dock into a remote, a tile
into a hero), the bounds must finish inside the transition, the corner must be home before the
bounds are, and the arriving end must be opaque from its first frame.

**Dash's "+" button → start page** (`examples/sample/ui/AppNavigation.kt (`PlusButtonContainerTransform`)`) is the older,
cross-fading form; do not copy its fades. `sharedBounds` with bounds `tween(400, Travel)`,
`scaleToBounds(Crop, Center)`, `OverlayClip(shape)`, `enter = fadeIn(tween(200, delay 90))`,
`exit = fadeOut(130)` (`DashNavigation.kt:844-845`). Both ends are part-transparent from 90 to
130 ms, and a shared-bounds fade renders offscreen (§7). What is worth copying: heavy cards on the
start page compose only after the transform, holding their outlines meanwhile (dash
docs/upgrade-0.9.4/README.md:79-80). Flick's dock → remote, below, is the one to copy.

**Flick's dock → remote** (`examples/flick/sender/NowPlayingBar.kt:213-321`): the scheme's
spatial spring retimed to 0.75 (`retimed()`), `Rect.VisibilityThreshold`, `enter = None` so the
arrival is opaque from frame 1, and only the end being *left* fades out. **The corner is a
function of the container's height**: it reaches the card's radius at 70 % of the growth
(`CornerResolve`), so it is home before the bounds and "cannot drift out of step with them":

```kotlin
override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
    val grown = ((size.height - barHeightPx) / spanPx).coerceIn(0f, 1f)   // spanPx = travel × 0.7
    val radius = barRadiusPx + (cardRadiusPx - barRadiusPx) * grown
    return Outline.Rounded(RoundRect(0f, 0f, size.width, size.height, CornerRadius(radius)))
}
```
Dash animates a second float for its corners on the flight's own curve and relies on sharing a
clock; Flick's is the better technique.

**Flick's tile → hero frame** (`examples/flick/sender/VideoTile.kt:309-475`): out on
`spring(NoBouncy, StiffnessMediumLow, Rect.VisibilityThreshold)`, back on stiffness 800 ("settles
in about seven tenths of the time"). Direction is read off the geometry (`frameReturning`: the
target is smaller), so an interrupted return sent forward picks the outward spring by itself. The
corner holds its full radius below 25 % of the window height (`CornerHold`).

**Name every shared spring's visibility threshold.** A spec with none falls back to 0.01 px per
edge, and the overlay copy is handed back when the spring *ends*: a window-sized return looked
landed at ~250 ms and did not terminate for ~750 ms (`examples/flick/sender/VideoTile.kt:309-331`).
A tween ends at its duration and needs none.

**Glass comes back by fading, not by snapping.** Flick's dock glass snapped back on after the Now
Playing card minimized. The fix keeps the Haze node attached through the flight and cross-fades
its alpha against the flat tint as the shared transition hands the bar back (flick@f4e6b78).

**A card and a page of nearly equal width.** When the two are within about a tenth of each other in
width, the container's scale is very nearly 1, so the page is cropped rather than scaled, and at
the end it "snaps into its zoomed out form". No choice of scale fixes it. Dash's hero borrows the
card's wider render for the flight and backs the box out, so the map zooms out the whole way
(dash@e1a6afc).

**Springs or tweens here?** Flick's springs retarget beautifully, but they force hold constants
derived by hand from settle times. The dock morph has a 450 ms surface hold, a 675 ms latch and a
135 ms bar handoff (`examples/flick/sender/Motion.kt:74-81`). The hero return adds a 560 ms hold
for the bottom stack (`HeroLandMs`, flick:sender/.../FlickApp.kt:680-689). Dash's tweens let a test prove the bounds end inside the
morph. For a multi-part flight, use tweens; for a single surface a finger may re-aim, a spring
with a named threshold.

---

## 9. Lift floating chrome into the overlay while a card flies

**Rule.** While a card flies, the floating bar joins the shared-element overlay above every
piece. Otherwise it stays in the normal tree.

**Why.** The overlay draws over the host's whole content. A card low on a list, partly behind
the glass, took off *over* the bar and came home over it, and the bar's own rise back was hidden
behind the landing card (dash@29b6156; `examples/sample/ui/NavMotion.kt (`NavMotion.CHROME_OVERLAY_Z`)`).

**How.** Put the bar in `AppNavHost(chrome = { … })` and give it `Modifier.aboveFlights()`, which
applies `renderInSharedTransitionScopeOverlay(zIndexInOverlay = NavMotion.CHROME_OVERLAY_Z)`
(8, above every piece) only while a MORPH runs. The modifier is remembered, not rebuilt per
composition. On the way back, return the bar as the pieces land (Dash: after `PIECES/2`), not
over the page's sections while they fade.

**The starter differs in two ways.** Its bar is a sibling drawn after `AppNavHost`, outside the
shared-transition layout, so it is always above the overlay and needs no `aboveFlights()`. It
also hides under every pushed page, so it is never in the air with a card. And it applies no
return delay: the bar rises on the pop clock. Put the bar in the `chrome` slot with
`aboveFlights()` if it must blur a flight, and port a bar-return delay (wait for the pieces to land) if it hides during one.

---

## Symptom → cause → fix

| Symptom | Cause | Fix |
|---|---|---|
| The page slides while the card flies; the two tear apart | two motions in one navigation | MORPH holds both pages still; only pieces move (§1) |
| A transition ends with a jump | shared bounds outlast the transition holding them | `MORPH_BOUNDS_MILLIS < MORPH_MILLIS`, tested (§2) |
| Every item on a tab flies during a tab switch | keys not namespaced by card page | `NavMotion.sharedScope` + `sharedKey(id, part, scope)` (§7) |
| A Detail opened from a second card tab cuts instead of flying | the Detail names one opener in its key | take the scope from the page below it on the stack; never name a route in a screen (§7) |
| The pair matches but flies from nowhere | namespace decided after the transition began | fix it from the page's first composition (§7) |
| Crash in the shared-bounds pass | one key on two surfaces at once (Marginalia) | put the launching surface in the key (marginalia@87b6510; §7) |
| Transitions drop frames, "slow issue draw commands" | whole-page alpha → offscreen buffer | opaque pages, one `drawRect` dim (§4) |
| Grey flicker between tabs | a dim swept over a side-by-side tab | `scrims` false for tab ↔ tab (§4) |
| Nothing dims on the way back | dim rule compared the live page with itself | ask whether *both ends* are tabs (§4) |
| Dark flash under a morph on back | a scrim under the fading page ground | no scrim for MORPH (§4) |
| A bare band between two tab pages on a fast re-tap | slow-start curve against the interrupted page's spring | overtake spring 1500 for both pages (§3) |
| Tab capsule jumps on a mid-glide re-tap | glide restarts from the resting position | capture current positions in `select` (§6) |
| Scroll position lost on back | page state not saved per entry | `SaveableStateHolder` keyed `route#serial` (§3) |
| Back swipe shows no progress on a device | targetSdk ≤ 35 without the manifest flag | target 36 or set `enableOnBackInvokedCallback` (§5) |
| After a cancelled back swipe the page stays shrunk | the cancel spring runs in the cancelled handler job | `withContext(NonCancellable)` around it, then rethrow (§5) |
| Two half-faded maps; the list shows through | both ends fading | card end opaque underneath, page end fades over it (§7) |
| A flying title draws under its map | unnumbered overlay z sorts below numbered | name every piece's `zIndexInOverlay` (§7) |
| A flying card re-measures every frame | `RemeasureToBounds`, or a fresh `inFlight` lambda | `scaleToBounds`; `skipToLookaheadSize(rememberInFlight)` (§7) |
| A tab switch lasts as long as a flight | every card carries flight fades | fades only on the pair in flight (§7) |
| The copy flies as a hard rectangle | overlay bypasses ancestor clips | pass the seat's shape as `OverlayClip` (§7, §8) |
| The corner snaps at the end of a transform | corner on its own clock, finishing after the bounds | corner as a function of height, home at 70 % (§8) |
| The shared copy lingers after it has landed | spring without a visibility threshold | `Rect.VisibilityThreshold` (§8) |
| Glass pops back on after a morph | Haze detached for the flight | keep `hazeEffect` attached; cross-fade it against the flat tint (flick@f4e6b78; §8) |
| Card and page of near-equal width snap at the end | container scale ≈1 crops instead of scaling | borrow the card's render and back the box out (dash@e1a6afc; §8) |
| A new tab is missing from the bar, or slides the wrong way | a second tab list beside `Route.tabs` | build the bar from `Route.tabs`; follow the checklist (§2) |
| A card takes off over the floating bar | overlay draws above chrome | `aboveFlights()` on the bar (§9) |
