# Android TV with Compose: visible focus, a safe area, and a frame budget

How Flick's TV receiver (Compose for TV, Google TV Streamer) was built, as rules for a new TV
app. A TV is its own component system, not a big phone: there is no touch, the panel crops
its own edges, the viewer sits 3 m away, and while a film plays the display runs at the film's
frame rate. android-design says almost nothing about TV (`material-expressive.md:47-49` only),
so this file is the reference.

Full source: `examples/flick/receiver/` (`TvFocus.kt`, `Dimens.kt`, `Motion.kt`, `Type.kt`,
`GlassPanel.kt`, `Ink.kt`, `RefreshRatePolicy.kt`, `RefreshRateHelper.kt`) and
`examples/flick/androidTest/SettingsScreenFocusTest.kt`. Values marked "Flick's value" are its
choices. The geometry rules are general.

## 1. Use tv-material's theme, and declare the TV in the manifest

**Rule.** Theme a TV app with `androidx.tv.material3.MaterialTheme` (`androidx.tv:tv-material`,
Flick pins 1.1.0). Do not wrap `MaterialExpressiveTheme` around it.

**Why.** tv-material's components carry TV focus behaviour. Flick's design doc claimed it
wrapped `MaterialExpressiveTheme` outside the TV theme; the code never did. The doc was wrong
for two months: the claim was added in flick@958b17a and removed from
receiver-expressive-spec.md only in flick@a6bda78, and docs/design/design-tokens.md:212-213
still says it. Check the code, not the doc.

**How.**

- Opt in with `-opt-in=androidx.tv.material3.ExperimentalTvMaterial3Api`.
- Manifest: `android.software.leanback` required, `android.hardware.touchscreen` not required,
  an `android:banner`, and a `LEANBACK_LAUNCHER` category on the one activity.
- A single-palette TV app can use a flat `object` of colours with no CompositionLocal palette
  (`FlickColor` in `examples/flick/receiver/Color.kt`; `FlickTvTheme` builds a
  `darkColorScheme` from it in Theme.kt:47-76). There is one theme, so nothing needs to switch.
- tv-material's `Text` takes its colour in composition. For an animated colour, use a
  `BasicText` with a `ColorProducer` (Flick's `InkText`), or the text recomposes every frame.

**Evidence.** flick:receiver/src/main/AndroidManifest.xml:33-45; `examples/flick/receiver/Ink.kt:23-54`.

## 2. Design against a 960 × 540 dp canvas

**Rule.** Size everything for 960 × 540 dp. That is a 1080p panel at density 2.0.

**Why.** A TV has *less* height than a phone, not more: a TV dp is physically large, so few fit.
Type and chrome that assumed room to spare overflowed it. Mono labels came out at 6–8 sp when
the 1920 px mockup was divided by 2 (flick@1ed8281).

**How.** Shrink content, keep gaps. Flick cut component sizes about 20 % and left the spacing
scale alone; the freed pixels became whitespace. After overscan the budget is
`UsableWidth = 864.dp` and `UsableHeight = 486.dp`. These are budgets to add a column up
against, "not sizes to hand to `height()`".

**Evidence.** `examples/flick/receiver/Dimens.kt:1-60`.

## 3. Keep everything inside the overscan safe area, rings included

**Rule.** Inset every full-screen surface by 5 % of the live viewport: 48 × 27 dp on 1080p.
The outermost focusable keeps a further 10 dp `FocusRingReserve` from that edge.

**Why.** The panel does not show what falls outside it. Flick's pair column overflowed its
safe area and rendered empty pills while every semantics test still passed. That prompted
`TvSafeAreaContainmentTest` (flick@1ed8281).

**How.**

```kotlin
@Composable fun rememberTvSafeAreaPadding(): PaddingValues {
    val c = LocalConfiguration.current
    val h = (c.screenWidthDp.coerceAtLeast(0) * 0.05f).dp
    val v = (c.screenHeightDp.coerceAtLeast(0) * 0.05f).dp
    return if (h == 0.dp || v == 0.dp) PaddingValues(48.dp, 27.dp) else PaddingValues(h, v)
}
@Composable fun Modifier.tvOverscanSafeArea(): Modifier = padding(rememberTvSafeAreaPadding())
```

**The reserve, derived.** A focused control is scaled by 1.06 and its ring is painted outside
it, so nothing in layout reserves that room. The extent past the control's own edge is
`1.06 × (offset 4.5 + width/2 1 + contour 1) + 0.03 × side` = 6.89 dp + 3 % of the side. 10 dp
covers any control up to about 103 dp tall. Flick's `Dimens.kt` comment still says "~139 dp";
that predates the contour, and the math in `TvFocus.kt:101-118` is the current one.

**Evidence.** flick:receiver/ui/theme/Theme.kt:87-92; `examples/flick/receiver/Dimens.kt:34-64`.

## 4. Ten-foot type: floors, weights and positive tracking

**Rule.** Nothing a viewer must read goes below 14 sp or below Medium weight. Tracking is
looser than on a phone, never tighter.

**Why.** Tight tracking that flatters type at arm's length closes the counters at 3 m. An
earlier 24 sp reading-copy clamp collapsed seven roles onto one size. It was replaced by a
14 sp floor (flick@958b17a; `examples/flick/receiver/Type.kt:40-43`), leaving an 18/16/15 sp
reading hierarchy (flick:docs/design/design-tokens.md:128-131). Separately, a 24 sp detail
line hard-coded under 22 sp headings inverted the handshake card's hierarchy until
flick@df2e816.

**How** (flick:receiver/ui/theme/Type.kt:40-72):

| Floor | Value |
|---|---|
| Minimum size | 14 sp; body default 16 sp |
| Minimum weight | Medium (Light and Regular are out) |
| Display tracking | no tighter than −0.02 em (the phone's −0.045 em is not it) |
| UI tracking | +0.005 em, never negative |
| Line height | ≥ 1.3 × size; reading copy ≥ 1.4 × |
| Numerals | `fontFeatureSettings = "tnum, zero"`: fixed digit advance, slashed zero for codes typed into a phone. Both are no-ops on the bundled Geist Mono, which is already monospaced with a slashed zero; they are insurance for a font swap. If you swap faces, check the new font exposes them (Type.kt:66-77) |

The style helpers clamp their arguments, so no screen can pass a phone-tight number under the
floor. Bundle the fonts in `res/font`: a TV whose Play Services font catalogue lags renders
the platform default silently.

## 5. The focus ring is detached and painted, never laid out

**Rule.** Show focus with a ring drawn outside the control, a small lift, and slightly rounder
corners. Draw it; never add it to layout.

**Why.** A laid-out ring reflows the row when focus moves. Painted, focusing never moves a
neighbour.

**How** (Flick's values):

| State | Look |
|---|---|
| Focused | amber ring `#FFB61E`, 2 dp stroke, 4.5 dp outside the bounds, with a 1 dp dark contour `#CC02040A` either side; scale 1.06; corners grow 4 dp |
| Selected | fill `#2EFFB61E` + selected border, no ring |
| Unfocused | fill `#2494BEFF` + outline |
| Disabled | 38 % alpha |
| Pressed | 0.98, or 1.02 while focused (a dip in the lift, not the lift dropped) |

- The ring blooms in: it fades up while growing from 0.6 of its offset to the full offset, never
  past it, so the reserve stays the worst case.
- The contour exists because the ring is the one decoration drawn off its control: over the
  film, amber measured 1.2:1 against the frame under a pill.
- On an amber control the ring is white (`FocusRingOnSpark`); amber on amber vanishes.
- Fill, stroke and corner arrive as `State` and are read in `drawWithCache` (`flickPlate`). Read
  in composition, an easing corner rebuilt the modifier chain, re-cut the clip and republished
  the beacon once a frame.
- A container never clips a focused child: `GlassPanel` has no clip, because the ring must survive.

**Modifier order** (flick:receiver/ui/components/TvFocus.kt:809-870):

```kotlin
modifier
    .focusRequester(requester)
    .semantics(mergeDescendants = true) { role = Role.Button; selected = isSelected }
    .focusBeacon(ringShape, ringColor)                 // publishes to a group host, if any
    .graphicsLayer { scaleX = lift.value; scaleY = lift.value; alpha = enabledAlpha.value }
    .flickFocusRing(visible = !hosted, shape = ringShape, progress = { presence.value })  // after the scale, before the clip
    .clip(shape)                                        // the base shape, not the eased one
    .flickPlate(shape, fill, stroke, strokeWidth, cornerGrowth)
    .focusProperties { if (!shellInteractive) canFocus = false }
    .clickable(interactionSource, indication = null, role = Role.Button, onClick = onClick)
    .padding(contentPadding)
```

`clickable` maps DPAD_CENTER and ENTER to a click for a focused element.

**Evidence.** `examples/flick/receiver/TvFocus.kt:90-150, 242-298, 728-888`.

## 6. One travelling ring per focus group

**Rule.** Inside a coherent group (the transport row, a side panel, a settings column), draw one
ring that glides between members. Install one host per group, never one for a whole screen.

**Why.** A ring that vanishes at one control and pops in at the next reads as two things. A
ring that flies between unrelated regions "reads as a bug, not as travel".

**How** (`FocusBeaconHost`, flick:TvFocus.kt:439-700):

- Members publish their pre-scale bounds from a `Modifier.Node` that is both
  `GlobalPositionAwareModifierNode` and `FocusEventModifierNode`; they suppress their own ring.
- Past 320 dp of travel the ring fades out in place and blooms at the destination.
- Drive the flight from `(owner, bounds)` only. Keyed on the whole beacon, each corner frame
  republished it, cancelled the bloom and left the ring stranded at part opacity.
- Build the ring pre-scale and scale it by the lift, so one radius stays concentric at any
  aspect ratio. The mean-inset alternative put a 34.5 dp corner on an 800 × 69 dp row that
  needed 22.5 dp.
- Give the host its own render node with a bare `.graphicsLayer()`. Without it every frame of
  the flight re-recorded the display list of every glyph in the panel.

## 7. Land focus deliberately, every time

**Rule.** Every screen puts focus on exactly one control when it appears. When the focused
thing goes away, focus has a planned landing. "Nowhere" is not an option.

**How.**

- **Retry the request for a few frames.** A `FocusRequester` fired before its node is placed
  throws, and the remote steers nothing:

  ```kotlin
  suspend fun landTvFocus(preferred: FocusRequester, fallback: FocusRequester, held: () -> Boolean) {
      repeat(4) { if (held()) return; runCatching { preferred.requestFocus() }; withFrameNanos { } }
      if (!held()) runCatching { fallback.requestFocus() }  // a control the surface is certain to have
  }
  ```

  Four frames is about 67 ms at 60 Hz: long enough for a placement pass, short enough that a
  requester that never attaches cannot spin.
- **After a delete, land on a neighbour.** The row below, else the row above, else the pane's
  Back key. A `LazyColumn` item that goes away takes focus with it. As a pure function:
  `settingsFocusReturnAfterForget(phones, keyId)` (flick:receiver/ui/screens/SettingsScreen.kt:256-292).
- **Retained or exiting surfaces cannot take focus:** `focusProperties { canFocus = false }`,
  or DPAD_CENTER lands on a row the viewer can no longer see.
- **Contain a side panel:** `focusProperties { canFocus = open; onExit = { if (open) cancelFocusChange() } }`
  (flick@c96573b).
- **Make a panel a sibling of the bar, not a child.** Nested inside the bar's
  `AnimatedVisibility`, hiding the bar force-closed the panel (flick@7f87444). Hand focus into the
  panel and back to the control that opened it with `landTvFocus`.

## 8. Own each D-pad key narrowly

**Rule.** Intercept a key at the Activity only in the state where it has no navigation meaning.
Everywhere else, let Compose's focus system have it.

**Why.** Flick consumed left and right as 10 s seeks whenever a cast was active. A horizontal
transport row could only be walked vertically, and the ±10 keys in it could never take focus
(flick@7f87444).

**How** (flick:receiver/TvRemoteKeyPolicy.kt, a pure function with its own tests):

- Horizontal keys seek only when the chrome is hidden or the scrub bar itself holds focus:
  `tvRemoteHorizontalSeeks(chromeVisible, scrubFocused) = !chromeVisible || scrubFocused`.
- A key-down claimed as a seek captures the whole D-pad until its own key-up, so an auto-hide
  or a focus move cannot split one press into two meanings. Swallow both halves of a crossing
  press, so Compose never sees a key-up without its key-down.
- A held key emits on every 4th repeat, in capped pulses of 10, 20 then 30 s.
- Dedicated media keys fall through to Media3's `MediaSession`. Intercepting them double-handles
  the button.

## 9. TV motion: Expressive stiffness, TV damping

**Rule.** Keep the Expressive scheme's stiffnesses and raise only the damping. Focus geometry
damps at 0.85, panel geometry at 0.8, effects at 1.0. The floor is for geometry the viewer
watches settle. The seek reconcile is a separate, retargetable spring (0.72 damping,
`StiffnessMediumLow`, `syncSpring`), because a held D-pad re-aims it mid-flight; panel bounds
travel also uses `StiffnessMediumLow` (Motion.kt:280-296).

**Why.** "The bounce that reads as energy in the hand reads as instability at 55 inches." And
the ring reserve (section 3) has no overshoot budget: at 0.85 the peak excursion is about 0.6 %,
which the reserve absorbs.

**How** (flick:receiver/ui/theme/Motion.kt:211-275):

| Spec | Damping | Stiffness | Use |
|---|---|---|---|
| `focusSpatial` | 0.85 | 800 | focus lift, press, beacon travel |
| `flickSettleSpatial` | 0.8 | 800 | glyph morphs, chips |
| `panelSpatial` | 0.8 | 380 | a whole panel arriving |
| `stateEffects` | 1.0 | 1600 | every colour, alpha, fill |
| `fastStateEffects` | 1.0 | 3800 | exits, which lead with the fade |

Transcribe the stiffnesses once, in one `Motion.kt`, and write no `spring(...)` or `tween(...)`
anywhere else. Reading `MaterialTheme.motionScheme` would hand back the phone's damping.
Observe reduce-motion live with a `ContentObserver` on `ANIMATOR_DURATION_SCALE`; it is a live
setting on TV. Under reduced motion the lift is 1.0 and the ring appears without flying.

## 10. The 24 Hz fence: design motion for the film's frame rate

**Rule.** While a film is on screen, the display runs at the film's cadence: a frame is 41.67 ms.
Motion over a film is alpha only, sized to that step, with no blur and no layout animation.

**How** (flick:receiver/ui/theme/Motion.kt:65-75; receiver-expressive-spec.md §6.1):

- `FILM_EXIT_MS = 250` spans 6 vsyncs at 24 Hz. `FILM_REVEAL_MS = 720` moves at most 10 % of its
  span per frame. A spring's 2-frame exit reads as a cut over film, so exits over film are tweens.
- No moving edge, wipe or layout-phase animation over a film: at 24 steps a second those read as
  judder.
- No `Modifier.blur` or `RenderEffect` anywhere in the receiver.
- No ambient loop while the decoder runs. The idle wash (a 34 s drift) is the one loop, and only
  with no film. At most one `rememberInfiniteTransition` per screen.
- Per-frame values only in `drawBehind` or `graphicsLayer`; chrome moves by transforms.
- Drop entrance layers once settled. Compositing a finished transform forever, plus redrawing a QR
  code as ~1700 `drawRect`s per invalidation, cost 109 scratch render targets and 49.89 MB of GPU
  memory; after the fix, 11 and 3.45 MB, GPU time 17 → 10 ms (flick@c4873de).
- Don't take a library component's word for its cost. The team disassembled `LoadingIndicator`
  before trusting it against the fence (flick@6c20a4b).

## 11. Glass without blur

**Rule.** On TV, glass is a translucent fill, a raking sheen, a drop shadow and a hairline.
There is no blur.

**Why.** The film is on a `SurfaceView`, which no backdrop effect can sample, and a live blur
over 4K is exactly the budget the app exists to protect (flick@0fa09f1).

**How** (flick:receiver/ui/theme/Color.kt:47-63, 265-318):

- **Fill density is a contrast measurement over a white frame.** The design's 13 % left ink at
  3.3:1 on the top pills and a title at 2.8:1 on the transport. 34 % (`#09112A` and `#163A8C`)
  is the least that keeps 4.5:1 at the lowest edge of the ink.
- **The sheen rakes at 168°.** A white 32 % lip falls only on the panel's own padding. Over ink
  it is at most 1.6 %: the design's 6 % dropped an amber eyebrow from 4.83:1 to 4.11:1. The foot
  catches the room in cool `#96BEFF` at 8 %. `PlaybackContrastTest` composites the sheen over
  every row and fails under 4.5:1.
- **Apply alpha to the fill, not the control.** A 50 % whole-key alpha dropped the amber key and
  its glyph to 2.72:1 (flick@7f87444).
- Build gradients once (`remember { panelTopHighlightBrush() }`), because chrome ticks invalidate
  the layer under a film.

## 12. Refresh-rate hints derive from state and are released

**Rule.** Ask for the film's frame rate only while a film is presenting. Derive the hint from
current state every time, and release it by writing 0, including on dispose.

**Why.** Flick set `preferredRefreshRate` to the film's rate behind an `if (fps > 0f)` guard.
When playback ended the rate fell to 0, the branch was skipped, and the 24 Hz hint pinned every
screen for the life of the process. Measured on the pairing screen: `preferredRefreshRate=24.000002`,
`mIdealPeriod=41.67`, 0.00 % janky frames. The app met its deadline; the deadline was 41 ms.
After the fix: 60 Hz, 15 ms frames, 0 % jank (flick@c4873de).

**How** (`examples/flick/receiver/RefreshRatePolicy.kt`, `RefreshRateHelper.kt`):

```kotlin
fun preferredWindowRefreshRate(presentingVideo: Boolean, contentFrameRate: Float): Float =
    if (presentingVideo && contentFrameRate.isFinite() && contentFrameRate > 0f) contentFrameRate else 0f
```

- Write the window attribute only when it changes: assigning `window.attributes` dispatches a
  relayout.
- Hint the surface too: `Surface.setFrameRate(rate, FRAME_RATE_COMPATIBILITY_FIXED_SOURCE,
  CHANGE_FRAME_RATE_ALWAYS)` on API 31+, the 2-argument form on 30. Release with
  `COMPATIBILITY_DEFAULT`.
- Defer only a release, and only across a cast handshake (2 s), so a re-cast at the same cadence
  costs no HDMI mode switch. Pinning is always immediate.
- Read `display.mode.refreshRate`, not `Display.getRefreshRate()`, which "can be a divisor of the
  panel's".

The phone-side counterpart (ask for `FrameRateCategory.High` on the page host) is in `performance.md`.

## 13. The focus-walk test

**Rule.** For every D-pad screen, walk every focus target with key events and assert, at each
step, one focus owner and a ring that stays inside the viewport.

**How** (`examples/flick/androidTest/SettingsScreenFocusTest.kt:78-255`):

```kotlin
composeRule.setContent {
    // The font-scale matrix without a shell: override density, not the system setting.
    CompositionLocalProvider(LocalDensity provides Density(LocalDensity.current.density, fontScale = 2f)) {
        AppTvTheme { SettingsScreen(/* fake data */) }
    }
}
val viewport = composeRule.onNodeWithTag(ViewportTag).getUnclippedBoundsInRoot()  // DpRect
repeat(targets.size) {
    // Send the key to the node that owns focus, as Flick does per control.
    composeRule.onNode(isFocused()).performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
    // Several controls may share a tag, so resolve the focused one by index within its tag.
    val owners = targets.mapNotNull { tag ->
        val nodes = composeRule.onAllNodesWithTag(tag)
        val i = nodes.fetchSemanticsNodes().indexOfFirst { it.config.getOrNull(SemanticsProperties.Focused) == true }
        if (i >= 0) nodes[i] else null
    }
    assertEquals(1, owners.size)                          // exactly one owner
    // Unclipped: a scrolled viewport clips boundsInRoot, so a ring off screen would pass.
    val b = owners.single().getUnclippedBoundsInRoot()
    // The 1.06 lift per edge + the lifted ring and contour: 1.06 × (4.5 + 1 + 1) = 6.89 dp (§3).
    val outset = (b.bottom - b.top) * 0.03f + 6.89.dp
    assertTrue(b.top - outset >= viewport.top && b.bottom + outset <= viewport.bottom)
}
```

Or assert against the one shared constant, as Flick's `assertFocusedTargetIsRingSafe` does:
`b.top >= viewport.top + FocusRingReserve` (10 dp). Also assert the title sits inside the vertical 5 % safe area and a full-width row plus its
outset stays inside the 48 dp horizontal inset. Walk back up. Run at `fontScale` 1 and 2.

## 14. Symptom → cause → fix

| Symptom | Cause | Fix |
|---|---|---|
| Content or a ring cut off at the panel's edge | No overscan inset, or no ring reserve | `tvOverscanSafeArea()`; 10 dp reserve (§3) |
| Row reflows when focus moves | Ring or border added to layout | Paint the ring in `drawWithContent` (§5) |
| Ring clipped on one side | A container clips, or the ring is drawn after `clip` | No clip on panels; ring after the scale, before the clip (§5) |
| Focus lost; remote does nothing | `requestFocus` before placement, or the focused row was deleted | `landTvFocus`; planned landing (§7) |
| Can't move left or right in a row | Activity consumes horizontal keys | Narrow key ownership (§8) |
| Focus lift wobbles across the room | Phone damping (0.6–0.8) on focus | 0.85 for focus, 0.8 geometry (§9) |
| Fades over a film step visibly | Motion sized for 60 Hz under a 24 Hz pin | Alpha only, sized to 41.67 ms frames (§10) |
| Whole UI feels 24 Hz after a film | Refresh hint never released | Derive from state; write 0 on end and dispose (§12) |
| Glass unreadable over a white frame | Fill density picked on a dark mock | Measure contrast over white; 34 % (§11) |
| Ring flight stutters and redraws the panel | No render node on the host; beacon keyed on the whole beacon | `.graphicsLayer()` on the host; key on owner + bounds (§6) |
| Semantics tests pass, screen renders empty | Content overflowed the safe area | A containment test on real bounds (§3, §13) |
