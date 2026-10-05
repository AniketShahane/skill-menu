# Components: floating glass, one travelling selection, designed states

The pieces that make a Compose app read as a shipped product, as Dash and Flick built them.
The starter ships the combined best version of each in
`templates/starter/app/src/main/java/com/example/starter/ui/components/`. The full source of
the originals is in `examples/sample/ui/` and `examples/flick/sender/`.

Principles live in android-design; this file does not repeat them. Read
`android-design/references/components-and-verification.md §1-4` for patterns, states and
accessibility, and `android-design/references/motion-and-performance.md §6` for the
draw-phase idioms. Where the shipped apps proved that skill wrong, this file says so.

Values marked "Dash's value" or "Flick's value" are product choices. Copy the mechanism, and
pick your own numbers with the same reasoning.

## 1. Float the bottom bar over the content, never in the layout

**Rule.** The tab bar is a sibling drawn over the page host, not a slot in a `Scaffold`.
Pages scroll under it and leave room at their foot.

**Why.** A bar in the layout makes a flat band under the glass, and the glass has nothing to
blur. Dash's Settings and Plan once stopped above the bar, and the band showed
(dash@212cd19: "scroll under the bar like the other tabs").

**How.** Neither app uses `Scaffold`. The root is a `Box`: the page host fills it, the bar is
`Modifier.align(Alignment.BottomCenter)`. The bar hides on pushed pages with an
`AnimatedVisibility` on the push and pop clocks. See `templates/starter/.../ui/StarterApp.kt`.

**Evidence.** dash:ui/navigation/DashNavigation.kt:378,502-514 (`examples/sample/ui/AppNavigation.kt`);
flick:sender/ui/components/FlickBottomNav.kt:80-85.

## 2. Glass is one tint function, a fallback derived from it, and no fill under the blur

**Rule.** Compute the glass tints from one number, "how much of the page shows through".
Derive the flat fallback from the same tints. Paint no fill of your own on a blurred surface.

**Why.** Flick's light nav painted `colors.glass` as a background under the Haze effect, and
the fill hid the blur until flick@e079608 made `navBarFill` transparent. flick@0fa09f1 then
extended the rule to the dock and every blur-backed surface: "the fill would land ON TOP of
the blurred backdrop".
android-design `color-and-theming.md §9` still shows that fill. Treat its `appGlass` snippet
as wrong for blur-backed surfaces: pass `Color.Transparent` when a backdrop effect is set.

**How** (starter `GlassBar.kt`):

```kotlin
internal fun glassHazeTints(colors: AppColors, backdropVisibility: Float): List<Color> {
    val tintOpacity = (1f - backdropVisibility).coerceIn(0f, 1f)
    return if (colors.isLight) listOf(colors.glass.copy(alpha = tintOpacity))
    else {
        // A fixed black floor keeps a blown-out frame beneath from lifting dark glass to grey.
        val body = (tintOpacity - 0.14f) / (1f - 0.14f)
        listOf(Color.Black.copy(alpha = 0.14f), colors.glass.copy(alpha = body.coerceAtLeast(0f)))
    }
}
internal fun glassFallbackTint(colors: AppColors, v: Float): Color =
    glassHazeTints(colors, v).fold(Color.Transparent) { base, tint -> tint.compositeOver(base) }
```

**The alpha of `AppColors.glass` is thrown away.** `glassHazeTints` keeps only its colour;
the coverage comes from `backdropVisibility` (0.40 at the starter's 0.60). So a contrast
test on `colors.glass` at its own 88/90 % alpha does not measure what the bar draws. At 40 %,
light glass over black composites to about #636365, where `onSurfaceDim` (#4A4A63) is about
1.4:1; dark glass over white comes to about #A2A2A6, where `onSurfaceDim` (#B4B4C8) is about
1.25:1 (computed by hand from the starter's palette). Test ink over
`glassFallbackTint(colors, BarBackdropVisibility)` composited over the worst backdrop the bar
can float over. If the app puts photos or video under the bar, raise the coverage until that
test passes.

Layer order, outermost first: tinted shadow → `clip` → `hazeEffect` (or the fallback
background when there is no backdrop) → sheen → rim border.

| | Dash | Flick | Starter (combined) |
|---|---|---|---|
| Backdrop showing through | ~0.50 (tint .50 dark / .52 light) | 0.60 pill, 0.74 dock above it | 0.60 via the function |
| Blur radius | 28 dp | 20 dp | 28 dp |
| Haze input | `HazeInputScale.Fixed(0.5f)` | full | 0.5 |
| Noise | .05 dark / .03 light | .04 | .04 |
| Blur gate | Haze default: API 31+ (Dash's KDoc says 13+, which is wrong) | API 33+ (`TIRAMISU`) | API 33+ |
| Fallback | surface @ .93 | composite of the tints | composite of the tints |
| Rim | vertical gradient, white .32→.05 dark, 1→.40 light | 1 dp `glassBorder` | Dash's gradient |
| Sheen | white .06 dark / .20 light, fading out by 55 % | raking sheen | Dash's |
| Shadow | 20 dp, ink at .5/.55 dark, .2/.26 light | 20 dp, `#260A1533` / `#8C000000` | 20 dp, onSurface .20/.26 light, black .50/.55 dark |

- **Half resolution is free.** "Blurring at half resolution is invisible under a 28 dp radius
  and a quarter of the work" (dash:DashBottomBar.kt:210-211).
- **Blur only on API 33+.** Below that Haze needs a pre-draw listener and RenderScript, and a
  scrolling grid pays for a small pill (flick:FlickBottomNav.kt:132-137).
- **One `hazeSource`, at the route boundary.** Both apps mark the whole page host once. The
  starter's shell owns the `HazeState` and provides it as `LocalBackdrop` to the host and the bar.
- **Stacked glass is graded.** Two glass surfaces directly on top of each other must not read
  as one slab, so the upper one is thinner: Flick's pill 0.60, its dock 0.74
  (flick:FlickBottomNav.kt:545-559).
- **TV glass has no blur.** See `tv.md §9`.

**Evidence.** `examples/flick/sender/FlickBottomNav.kt:490-568`, `examples/flick/sender/Theme.kt:200-279`,
`examples/sample/ui/AppBottomBar.kt (`BarGlassBackground`, `Modifier.barRim`, `Modifier.barSheen`)`.

## 3. Room under the bar is a constant only while the bar cannot grow

**Rule.** A page's bottom padding is the bar's height plus its lift plus a gap, plus the
navigation-bar inset. Use a constant only if nothing in the bar can grow with the font scale.
Otherwise measure it.

**Why.** Dash's bar is a fixed 60 dp, and its labels shrink rather than grow, so a constant
is safe there. Flick's label sits under its icon and "the label's line box scales with the
user's font setting", which at the accessibility end hid the last row under the pill.
android-design `components-and-verification.md` states "chrome height is a measurement"
without the condition; the condition is the rule.

**Watch the inset.** Dash's `BottomBarClearance = 104.dp` leaves the navigation inset out.
On gesture navigation (about 24 dp) that leaves 6 dp. On 3-button navigation (48 dp) the bar's
top sits at 48 + 14 + 60 = 122 dp, so the last 18 dp of content is under the pill. This is
derived from dash:DashBottomBar.kt:102,203 and HomeScreen.kt:118, not observed on a device.

**How.** The starter: `BarClearance = 60 + 14 + 22 = 96.dp`, and `barClearance()` adds
`WindowInsets.navigationBars`. For a bar that can grow (Flick):

```kotlin
@Stable internal class NavMetrics { var height: Dp by mutableStateOf(78.dp) } // nominal, first frame only
internal val LocalNavMetrics = staticCompositionLocalOf { NavMetrics() }
// on the bar: .onSizeChanged { metrics.height = with(density) { it.height.toDp() } }
internal fun navBottomClearance(barHeight: Dp, dockLive: Boolean) =
    barHeight + 16.dp + 22.dp + if (dockLive) 76.dp else 0.dp
```

A bar whose height never changes costs one write and no recomposition.

**Evidence.** `examples/flick/sender/FlickBottomNav.kt:596-633`; dash@212cd19.

## 4. Selection is one shape that travels

**Rule.** Draw one selection capsule for the whole bar and move it. Never give each tab its
own fill that cross-fades.

**Why.** The tab left and the tab reached are the same object moving, which is the claim the
page transition makes at the same moment (flick:FlickBottomNav.kt:87-95).

**How, Dash's way (the starter's).** `TabMotion` is a plain class. Choosing a tab lays the
bar out once: the chosen slot is two units wide, the others one. The capsule's left and
width, each icon's slide and each label's alpha are functions of one `progress` that only
the draw and layer phases read, so the bar never re-measures while the pages slide. The
glide runs `tween(NavMotion.TAB_MILLIS = 400, Easings.Glide = (0.35, 0, 0.15, 1))`, the
pages' own clock. A tab chosen mid-glide switches to a critically damped spring at
`OVERTAKE_STIFFNESS = 1500` and starts from wherever everything is.

**How, Flick's way.** One `Animatable<Rect>` springs (`0.82` damping, `1000` stiffness)
between seat bounds measured with `onGloballyPositioned`. It starts on finger-down, not on
click, and returns if the press is cancelled. Use it when seats are fixed-width and you want
the fill moving before the finger lifts.

The four bugs Dash fixed on the way (dash@1940b64, dash@8098d01):

1. **Icons vanished during a jump across the bar.** Each slot clipped its icon, and mid-glide
   an icon is drawn where it came from. Clip only at the bar.
2. **The chosen icon jumped half a label width.** The label's width was known only after
   layout. Measure every label up front with `rememberTextMeasurer`.
3. **The capsule rim thickened as each glide ended.** A hairline centred on the edge was
   half-clipped while gliding. Draw the rim wholly inside the capsule.
4. **"Activities" showed as "Activitie".** Labels step down together to the largest size
   that fits beside the icon, with a floor of 0.6×.

Tints and bounces stay `State` and are read in `drawBehind { ColorFilter.tint(tint.value) }`
and `graphicsLayer`. Read at composition, Flick's nav recomposed each seat every frame, and a
tint inside a `TextStyle` re-measured the label too (flick:FlickBottomNav.kt:346-363).

**A card flying over the bar.** Shared-element pieces render in the overlay above
everything. While a card is in flight, render the bar in the overlay too, at a higher z, so
the card passes under the glass (dash@29b6156, `renderInSharedTransitionScopeOverlay(zIndexInOverlay = 8f)`).

**Evidence.** `examples/sample/ui/AppBottomBar.kt (`AppBottomBar`, `TabMotion`, `TabCapsule`, `AddItemButton`)`, `examples/sample/test/TabMotionTest.kt`,
`examples/flick/sender/FlickBottomNav.kt:86-282`.

## 5. Cards answer a press with one response, and never a neutral ripple on glass or brand fills

**Rule.** A card gets a press response only when it is clickable. Then:

- If the component already has a built-in press response (Material's `ButtonShapes` morph),
  add no scale on top of it.
- If you combine responses yourself (a scale and a corner morph), drive both from one press on
  one spring, so they land together as one answer (Flick's tile).
- A ripple or a wash may go with either, but only in a colour that reads on the fill. Never
  use a neutral ripple on glass or brand fills.

**Why.** Material's ripple on Flick's glass was "a grey blob" because `onSurface` there is
near-white (flick:FlickBottomNav.kt:386-395). A pill that squares off and also shrinks
"reads as a bug" (flick:sender/ui/components/Buttons.kt:22-30), because Material's morph and
the added scale run on two clocks. Flick's tile does combine a scale, a 26→20 dp corner morph
and a spark-coloured ripple, all from one interaction source: "On a tile the two answer one
touch together" (`examples/flick/sender/VideoTile.kt:543-571`, `Motion.kt` `pressMorph`).
android-design `components-and-verification.md §1` picks the ripple colour per surface but
never says to drop the neutral ripple on glass and brand fills.

**How.**

- **Scale** (Dash): springs to .965 by default; cards .975, pills .95, a FAB .92.
  `indication = null` on the `clickable`.
- **Collect the press off composition** (Flick): `collectIsPressedAsState` inside a
  `@Composable` Modifier factory invalidates the caller twice per touch, because the factory
  has no restart scope of its own. Drive an `Animatable` from `interactions.collect` and read
  it in `graphicsLayer`. The starter's `pressScale` does this (motion lane).
- **Corner morph** (Flick): a tile's corner eases from 26 dp to 20 dp under the finger. A
  pill uses Material `ButtonShapes(RoundedCornerShape(percent = 50), RoundedCornerShape(13.dp))`.
  Use percent corners, not 999 dp: a 999 dp radius sits at "still a pill" for most of the
  morph and then snaps (flick:sender/ui/theme/Shape.kt:38-47).
- **Brand wash** (Flick's nav seat): the brand colour at 0.16 alpha, 20 dp radius, on an
  effects spring, and none on the seat that already carries the fill.
- **A shadow cannot follow a morph.** Keep the elevation on the resting shape.

**Evidence.** `examples/sample/ui/Components.kt (`pressScaleFor`, `AppCard`, `PillButton`)`, `examples/sample/ui/AppMotion.kt (`Modifier.pressScale`)`,
`examples/flick/sender/Motion.kt:271-340`, starter `Cards.kt` (`AppCard`, `PillButton`).

## 6. Media cards: a ratio, honest badges and one spoken line

**Rule.** A card over an image takes an aspect ratio, never a fixed height. It shows only
what is known, and TalkBack hears it as one line.

**How.**

- **Anatomy** (Dash's activity card): a 176 dp map with the type chip and badge on top and
  the title (19 sp Bold, −0.5 tracking) and date at the bottom, over a veil. Below it is a
  strip of numbers. Flick's tile: a still at 179:122 (16:9 compact), a 26 dp corner, a poster
  scrim, a mono badge top-left, a 10.5 sp mono timecode bottom-right, a resume line in the
  accent along the bottom.
- **Withhold, never invent.** A 2160p file with no MediaStore resolution got an "SD" badge,
  and 2.39:1 films at 1920×804 were labelled 720p (flick@7f87444). Unknown metadata now gets
  a "withheld" pill in the same seat, because "a missing badge would read as a tile that
  failed to draw". Classify resolution on the long edge. Show a refused file desaturated,
  not dimmed.
- **One spoken line.** Merge title, day and summary into one `contentDescription`. For a
  dense row, `FlowRow(Modifier.clearAndSetSemantics { text = AnnotatedString(summary) })`
  (dash:ui/activities/ActivityCard.kt:103,287).
- **Ripple over images.** If a tile over artwork ripples, use a light, high-chroma brand
  colour: "only a light, high-chroma ripple survives both a blown-out still and a near-black
  one" (flick:VideoTile.kt:570-573).
- **Cards that fly apart.** When each half of a card flies to its own place on the page, give
  each half its own ground, corners and three-sided edge, or the list keeps an empty outline
  (dash:ActivityCard.kt:95-98, 186-213).

**Evidence.** `examples/sample/ui/ItemCard.kt`, `examples/flick/sender/VideoTile.kt:500-680`.

## 7. The chart kit: draw-phase reveal, geometry built once, a tick per index

**Rule.** A chart reads its entrance progress only in the draw scope, builds its geometry
once per size, and ticks a haptic only when the selected index changes.

**How** (starter `Charts.kt` has the bars and the line; the sparkline, heatmap and splits are
Dash-only, in `examples/sample/ui/Charts.kt (`ItemSparkline`, `ItemHeatmap`)` and the Dash repo's `SplitsCard.kt`):

- **Values arrive in display units, higher is better.** Flip a pace before charting and
  caption the axis ("Faster ↑").
- **Bars** (Dash's values): 5 dp gap, corner `barWidth / 2.2`, track at .12, unselected bars at
  .38, a 1.5 dp halo 2 dp outside the selected bar, a 3 dp minimum for any non-zero value,
  and a stagger where bar *i* grows over `(progress·(n+3) − i) / 3`, 1 100 ms.
- **Line:** cubic control points at 0.42 of the gap, 18 % head-room, grid at 0, .5 and 1, a
  3 dp round stroke, area fill .22 → .02, a 9 dp / 4 dp head dot while drawing in, 1 300 ms.
  Build the path, area and `PathMeasure` in `drawWithCache`. Per frame, `rewind()` two scratch
  paths and `getSegment`.
- **Sparkline** (Dash only): average long series into 12 buckets. "A marathon's forty-odd laps in a
  thumb-sized box is a scribble" (dash:DashCharts.kt:240).
- **Heatmap** (Dash only): 7 rows × 12 weeks, 3 dp gaps, radius .28 of the cell, alpha .3 + .7·strength.
- **Splits** (Dash only): scale bars to the run's own slowest-to-fastest range, 0.3 to 1.0, "so small
  differences stay visible" (dash:ui/detail/SplitsCard.kt:114-117). Fold past 12 rows.
- **The readout** above the chart is a polite live region.

Three fixes the starter makes over Dash's chart code:

1. **Stale selection in the gesture.** Dash's drag handler compares against the `selected` it
   captured when `pointerInput(values)` started, so after the first move it fires a haptic and
   `onSelect` on every event (dash:DashCharts.kt:78-83). Read it through `rememberUpdatedState`.
   Found by reading, not reproduced on a device.
2. **Ease once.** Dash eases the reveal progress and then eases each bar's share again. The
   starter runs the reveal linear and eases each bar once. The iOS port learned the same
   (`ios-app-craft/references/motion-craft.md §1`).
3. **No brush per frame.** Dash's line builds a new gradient for the partial fill on each
   draw-in frame (dash:DashCharts.kt:212). Build it once and pass `alpha` to `drawPath`.

**Evidence.** `examples/sample/ui/Charts.kt`.

## 8. Wheel pickers for precise values

**Rule.** Set a time, length or target on snap-fling wheels, not steppers.

**Why.** With steppers, "reaching 6:52 from 7:00 took a dozen taps" (dash@2f5b44f).

**How** (Dash's values): rows 46 dp, 5 visible, digits in the display face 26/30 sp. A drum
per row: scale `1 − 0.12·d`, alpha `1 − 0.3·d`, `rotationX` 18° per row clamped to ±50°. One
band spans all the wheels of a value: row height + 6 dp tall, 18 dp corner. Edges fade through
a `DstIn` gradient at 0/.32/.68/1. Preset chips sit under the wheels, then a hint line that
turns red and disables Done when the value is invalid (PrecisePickers.kt:248-258).

- `rememberSnapFlingBehavior(state, SnapPosition.Center)`, content padding of two rows.
- Tick `SegmentFrequentTick` only while `isScrollInProgress`, and mark programmatic turns so
  the rows they pass are not choices.
- Hold the wheel's own scroll: a `NestedScrollConnection` returns `available.copy(x = 0f)` from
  `onPostScroll` and `onPostFling`, so the sheet never moves when a wheel hits its end.
- Semantics: `Role.ValuePicker`, `progressBarRangeInfo`, `setProgress`, a spoken
  `stateDescription`.
- Host it in `ModalBottomSheet(onDismissRequest, sheetState =
  rememberModalBottomSheetState(skipPartiallyExpanded = true), sheetGesturesEnabled = false)`, so
  the wheels own vertical drags. `skipPartiallyExpanded` belongs to the state, not the sheet
  (PrecisePickers.kt:243-245). Cancel and Done at least 56 dp tall.

**Evidence.** `examples/sample/ui/WheelPickers.kt`.

## 9. Sheets: stock for a picker, Flick's for a form

**Rule.** Use the stock `ModalBottomSheet` for a simple picker. Use Flick's custom sheet when
the sheet holds a form, a keyboard or sits under floating chrome.

**Flick's sheet** (flick:sender/ui/screens/Sheets.kt:100-470): dismiss at a 35 % drag (at
least 96 dp) or a 500 dp/s fling; 36 dp top corners; 640 dp maximum height; a pinned header
and footer that give way, footer first, when the window cannot fit them plus a 56 dp scroll
minimum; `windowInsetsPadding(ime ∪ navigationBars)` outside the scroll; `paneTitle` and
`isTraversalGroup`; `LocalSheetDepth` so floating chrome steps aside.

**The scrim that swallows the first tap.** A dismissed sheet's scrim stays full-screen for
the length of its exit. Left clickable, it eats the first tap on the app behind.
`enabled = false` does not help: a disabled `clickable` still installs its pointer node and
still consumes (b/239789641). Remove the `clickable` from the chain the moment the sheet
commits to leaving. Swallow input on the sheet's own surface in the `Initial` pass while it
leaves, so a row on a half-gone sheet cannot answer (flick@19aed80). flick@7fa4ce2 removed the
scrim's `clickable` and fixed re-open presses dropped by a conflated `StateFlow`.

**Evidence.** `examples/flick/sender/Sheets.kt:300-400`.

## 10. Pills and live dots

**Rule.** A status pill states one condition. Only a live or working state pulses, and the
pulse stops when animations are off or the window is not resumed.

**How** (Flick's values): 14/9 dp padding, a 7 dp dot, fill = accent at .14. Caution inverts
to a solid fill with dark ink, because the caution hue (amber on light, vermilion on dark)
never clears its floor as ink on the surface it sits on, in any theme (StatusPills.kt:92-96).
The dot breathes alpha .4↔1 and scale .82↔1.18 over 1.6 s on `CubicBezier(.42, 0, .58, 1)`,
drawn unclipped so the swell never moves a neighbour. Read `rememberIsResumed()` before the
early return, so the call shape does not depend on the branch.

**Why the gate.** The dot was "the longest-lived loop in the app": it asked for a frame every
vsync for a two-hour cast (flick:sender/ui/components/StatusPills.kt:42-81).

**Evidence.** `examples/flick/sender/StatusPills.kt`, starter `StatusPill.kt`.

## 11. Screen scaffolding: no Scaffold, insets per page, capped content

- **Edge to edge.** `WindowCompat.setDecorFitsSystemWindows(window, false)` before
  `super.onCreate`, because "early Android 15 otherwise restores stale insets on a reused
  window" (dash:MainActivity.kt:22-29). Then `enableEdgeToEdge`.
- **Insets per page, never globally.** Put `statusBarsPadding()` on the first lazy item, so
  content scrolls under the status bar. Full-bleed heroes put it on their overlay buttons
  only. A tab page's foot is `barClearance()`; a pushed page's is the navigation inset + 24 dp.
  Sides take `safeDrawing.only(Horizontal)` (the starter's default; Flick pads its grid
  viewport with `navigationBarsPadding()` instead, flick:LibraryScreen.kt:474).
- **Lists.** A `LazyColumn` with stable `key`s and a `contentType` per kind. Dash adds
  `LazyLayoutCacheWindow(ahead = 300.dp, behind = 200.dp)` so a fling meets composed cards.
  Headers, pills and advisories go inside the list (Flick: `fullWidth {}` items in the grid),
  so everything scrolls under the bar.
- **Large screens.** Cap reading content at `AppSpace.ReadingWidth = 680.dp`, centred
  (dash:HomeScreen.kt:117). Full-bleed heroes are exempt. Grids reflow with
  `GridCells.Adaptive(minSize = 150.dp)` (Flick's value).
- **Height plans scroll anyway.** Flick's remote sizes its poster at 24 % of the measured
  viewport, 104–192 dp, and always scrolls: "a threshold that opts into scrolling can only be
  right for the font scale, inset depth and title length it was measured against" (flick:NowPlayingScreen.kt:284-300).
- **A pinned primary action** sits outside the scroll in a `Surface(shadowElevation = 10.dp)`
  with `navigationBarsPadding()`. A centred face uses surplus `Spacer(Modifier.weight(1f))`
  and scrolls when it does not fit.

## 12. Loading, empty and error are designed states

- **Placeholders the size of the real card.** Give the real card `heightIn(min = X)` and the
  placeholder `height(X)` from one constant, so nothing moves when data lands. The starter's
  shimmer builds its gradient once in `drawWithCache` and moves it with `translate`; Dash's
  built a new `linearGradient` every frame (dash:ui/DashMotion.kt:411-420). One quiet eyebrow
  line says "Reading your sessions…"; the placeholders say nothing to TalkBack.
- **Seed from a cache.** Start `produceState` from a synchronous cache, so the first frame is
  content and not a placeholder that flips one frame later.
- **Settle heavy cards.** Dash's `Settling` shows an outline of the card's height until the
  page transition settles, then fades the card in over 150 ms, with a 1.2 s safety timeout
  (dash:ui/start/StartRunScreen.kt:201-238).
- **Empty states never fake data.** An icon disc, a title, a body that says what will appear
  and how, one action. Give exact thresholds: "Two runs of at least 400 m are needed for a
  trend."
- **Each empty cause has its own face.** Flick has four (no access, blocked, unreadable,
  nothing chosen), and none borrows another's copy. Hold the empty state through a refresh
  so the screen does not flip: `loading -> showing && itemCount == 0`
  (flick:LibraryScreen.kt:1637-1646).
- **Partial results are an inline advisory.** "Never a full-screen face — the rows it did get
  are real." `AdvisoryCard`: 28 dp corner, 17/16 dp padding, 22 dp icon, an inverted pill action
  at least 48 dp tall (flick:AdvisoryCard.kt:114-209).
- **Error faces are an enum keyed on what actually failed.** Flick's `CastErrorFace` has about
  30. Only a failure the controller marked `retryable` may show Retry, and every face also
  offers a move that is not a retry. An escape ("Play on this phone") appears only when it can
  work (flick:sender/ui/screens/ErrorScreen.kt:105-137).

## 13. Say each number once, and put explanations behind an InfoButton

**Rule.** Each number appears on exactly one card. Explanations live behind a 48 dp info
button that opens a dialog, not in the layout.

**Why.** Dash's Home had 14 readouts answering about 6 questions; tiles repeated the hero
(dash@060f6c9). A second opinion on a number reads as noise. It went to 6.

**How.** Order the page by the questions: what I did, where it is going, what I have ever
done. Put a comparison on the card it compares (a delta chip), not on a new tile. Use static
text, not a count-up, for a value that would mislead by counting. "—" means not available.

**Evidence.** dash:ui/home/HomeScreen.kt:150-158; `examples/sample/ui/InfoButton.kt`.

## 14. Fit text by shrinking or wrapping, never by clipping

- **Numbers:** `autoSize = TextAutoSize.StepBased(minFontSize = 10.sp, maxFontSize = 22.sp,
  stepSize = 1.sp)`, with the unit measured first and the number in what is left, so
  "3:52:10" steps down instead of colliding (dash:ActivityCard.kt:167-171).
- **Groups:** `FlowRow`, so a fourth chip wraps whole instead of crushing into "a column of
  single letters" (dash@8098d01).
- **Labels:** never break a label inside itself. Dash sets `softWrap = false`, because
  `maxLines = 1` had cut "AVG SPEED" to "AVG" and "min/km" to "min/"
  (dash:ActivityCard.kt:162-165). Where a label has room to grow, let it wrap whole: the
  starter's `Eyebrow` wraps, because at font scale 2 "MINUTES THIS WEEK" needs two lines
  (TextFitTest). The shipped apps still ellipsize inside some fixed lockups (Flick's 76 dp nav
  label, Dash's card title). Such a case needs a deliberate exception, and the starter's
  TextFitTest will flag it.
- **Titles:** the starter's `PageTitle` wraps. A long app name or a user-named page at font
  scale 2 takes a second line rather than losing its tail. TextFitTest walks Home, Settings and
  a Detail page with a deliberately long title.
- **Decoration:** drop it at large text. Dash hides its sparkline when `fontScale >= 1.6`.
- **Tab names:** step down together to fit, floor 0.6× (section 4).

## 15. Haptics are named for what the user did

**Rule.** Wrap haptics in named calls, fire them from gesture callbacks only, and give each
gesture one owner.

**How** (starter `Haptics.kt`, from Flick's `FlickTouchHaptics`): `toggle` → ToggleOn/Off;
`choose` → SegmentTick; `step` (wheel/slider) → SegmentFrequentTick; `scrub` (chart) →
TextHandleMove; `tabChange` → ContextClick; `confirm` / `reject`. Ticks are floored at 40 ms,
below which "the actuator cannot separate two pulses". The shell fires `tabChange`, and only
if the tab changed. Reduce-motion does not gate haptics.

**One owner.** Flick's play/pause and seek have no touch haptic because the playback session
already drives the vibrator (grip 12 ms/90, detent 8 ms/60, snap 22 ms/200, confirm 16 ms/140,
flick:sender/net/FlickHaptics.kt:29-41). Cueing both reaches the actuator twice.

## 16. Copy voice

android-design `copy-and-type.md Part 1` holds the audit (Flick: 59 strings, 1 279 → 961 words,
flick@680c9e4). Two refinements from what shipped:

- **An error is problem + fix, plus optionally the one wrong cause the user would chase.**
  The old rule said "no reassurance". Flick ships "%1$s has no decoder for this video track.
  Your network isn't the problem." and "The film itself may be fine — an MP4 copy usually
  plays." Rule out a cause; never apologise.
- **Keep every string in `strings.xml` with a comment on its constraint.** Dash kept copy
  inline in Kotlin; do not copy that.

Examples to calibrate against:

| Kind | Example |
|---|---|
| Empty (Dash) | "Finish a run and it lands here with its map, splits and pace chart." |
| Empty (Flick) | "Nothing to flick yet" |
| Unreadable (Flick) | "Flick couldn't read your gallery" / "…That doesn't mean this phone has no videos — try again in a moment." |
| Blocked (Flick) | "Android won't ask again from here. Turn videos on for Flick in Settings and your library fills itself in." |
| Paired verbs (Dash) | "Finish your run?" → "Finish & save" / "Keep going" |
| Status (Dash) | "Saved on this phone", "Pauses excluded", "includes a signal gap" |
| Loading (Flick) | "READING YOUR LIBRARY…" as an eyebrow |
| Reason (Flick TV) | "Pairing paused" / "…so a phone outside this room can't keep guessing." |

## 17. The scrub bar: lambdas in, draw-only, one end

**Rule.** A scrub bar takes every moving value as a lambda, reads it only in draw or layout,
and ends each scrub exactly once.

**Why.** Flick's session clock ticks about 10 Hz; read in composition, it would recompose the
bar and the frame preview riding on it for the whole of a cast. Its gradient, rebuilt to move
it, made a new shader per draw at pointer rate, up to 240 Hz (PhoneScrubBar.kt:305-311).

**How** (Flick's values, `examples/flick/sender/PhoneScrubBar.kt:101-330`):

- `targetFraction: () -> Float`, `ghostFraction`, `playing`, `bufferedFraction` are lambdas.
  The track swells 13→22 dp and the thumb 6×28→10×40 dp on `Animatable`s read in draw. The
  touch row is 48 dp; the design's grab row was 36.
- One `ScrubEndGate` closes the drag release, a cancelled pointer, TalkBack's `setProgress`
  and a `DisposableEffect` on the bar, so a bar torn out mid-drag still sends its final seek.
- Build gradients once per size in `drawWithCache` and move them with `translate`.
- The played fill is a wave that runs only while the TV reports playing: "a flat bar is a
  claim about the TV", so paused or grabbed it snaps to exactly 0.
- 36 detents ripple under the finger but do not vibrate: the playback session owns the
  vibrator, and both would reach the actuator (§15).

## 18. Symptom → cause → fix

| Symptom | Cause | Fix |
|---|---|---|
| Glass bar looks flat, no blur | A fill painted over the Haze effect, or the bar's `HazeState` has no `hazeSource` | Transparent fill; one source on the page host with the bar's state (§2) |
| Grey band behind the glass | Page stops above the bar | Scroll under it with `barClearance()` (§1) |
| Last row hidden under the pill on some phones | Clearance left out the nav inset, or the bar grew with font scale | Add the inset; measure the bar (§3) |
| Icons vanish mid tab switch | Per-slot clip | Clip only at the bar (§4) |
| Chosen tab icon jumps sideways | Label width known only after layout | Pre-measure labels (§4) |
| Nav recomposes every frame of a switch | Tint read in composition or inside a `TextStyle` | `ColorProducer` / `ColorFilter.tint` in draw (§4) |
| Grey blob on tap | Neutral ripple on glass or brand fill | Scale, morph or brand wash (§5) |
| Card replays its entrance on scroll-back | Reveal keyed per composition | `RevealSession`: once per page identity (motion-system.md) |
| Chart buzzes on every drag event | Selection captured stale in `pointerInput` | `rememberUpdatedState` (§7) |
| First tap after closing a sheet does nothing | Scrim still clickable during exit (b/239789641) | Remove the `clickable` from the chain (§9) |
| Frames requested all through a long session | Live dot or shimmer loop not gated | Gate on reduce-motion and resumed (§10, §12) |
| Content jumps when data lands | Placeholder not the card's size | One height constant for both (§12) |
| "SD" badge on a 4K file | Unknown metadata shown as a claim | Withheld badge; classify on the long edge (§6) |
| Number collides with its unit at large text | Fixed size | `TextAutoSize.StepBased`, unit measured first (§14) |
| Remote stuck scrubbing after the screen swaps mid-drag | Gesture cancelled before `onScrubEnd` | One end gate, also closed on dispose (§17) |
