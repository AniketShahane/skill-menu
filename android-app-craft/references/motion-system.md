# Motion system

The vocabulary of motion in a new app, and the rules that keep every frame of it cheap. Page
transitions and shared elements are in `navigation-and-shared-elements.md`. How to measure
frames is in `performance.md`; how to test motion on a device is in `testing.md`.

The working code is in the starter: `templates/starter/app/src/main/java/com/example/starter/ui/motion/`
(`Motion.kt`, `Reveal.kt`, `AnimatedNumber.kt`, `Press.kt`). Its JVM tests are in
`templates/starter/app/src/test/java/com/example/starter/ui/motion/`. Read the code; this file
says why it is shaped that way.

For the principles (composition is where animations stutter, deferred reads, `ModulateAlpha`,
the Material `MotionScheme` tokens) read `android-design/references/motion-and-performance.md`
§1–6 and `android-design/references/material-expressive.md` §4. This file does not repeat them.
Where Dash and Flick proved that skill wrong, `android-design-corrections.md` §Motion says so.

Numbers marked "Dash's" or "Flick's" were tuned for that product. The rules are general; the
exact values are a starting point.

---

## 1. Springs for fingers and retargets; named tweens for choreography

**Rule.** Use a spring for anything a finger carries or that can be re-aimed mid-flight. Use a
named cubic-curve tween for finite choreography whose parts must add up and land together.

**Why.** A spring retargets from its current velocity. A tween "restarts on a fresh clock"
(flick:sender/.../Motion.kt:56-62): it carries on from the current value but drops the velocity,
so an interrupted tween stalls and restarts its curve from rest. But a spring has no fixed end, so
"these bounds finish before the page holding them" cannot be proven. Dash's page choreography is
all tweens, and its tests prove `MORPH_BOUNDS_MILLIS (400) < MORPH_MILLIS (500)`. Its press,
predictive-back cancel and tab overtake are springs.

**How.**

| Motion | Family | Where it comes from |
|---|---|---|
| Press, drag release, sheet rise, focus lift, anything re-aimed | spring | `MaterialTheme.motionScheme`, or `Springs.*` |
| Colour, alpha, selection fill | effects spring (never overshoots) | `motionScheme.*EffectsSpec()` |
| Page transitions, card → page flights, entrances, count-ups, draw-ins | tween on a named curve | `Easings.*` + a constant in `NavMotion` / `RevealRule` |
| Loops | one linear clock | §10 |

A bare `tween(300)` at a call site is still wrong. Name the curve, name the duration, say why,
and test it.

**Evidence.** Correction 1 in `android-design-corrections.md` ("never hand-write `tween(300)`").
Flick's TV keeps tweens "only where nothing can interrupt them"
(`examples/flick/receiver/Motion.kt:42-54`). Dash choreographs with tweens
(`examples/sample/ui/NavMotion.kt (`NavMotion.millisFor`)`).

---

## 2. Choose the curve by what the eye sees

**Rule.** Pick the curve by whether the whole journey is on screen, never by feel.

**Why.** Emphasized-decelerate is 45 % done in the first 5 % of its time. Arriving from off
screen, the sprint happens where nobody looks. For a card growing into a page, it is most of the
way there before the eye finds it, then creeps. Dash's commit message: that is what "it snaps"
means (dash@42b59ff).

**How.** Five curves, in `Easings` (`Motion.kt`). Values below are the fraction of the journey
done at 5 %, 10 % and 20 % of the time, computed from the starter's own curves.

| Name | Cubic | 5 % | 10 % | 20 % | Use it for |
|---|---|---|---|---|---|
| `Arrive` | (0.05, 0.7, 0.1, 1) | 0.45 | 0.62 | 0.78 | Things arriving from off screen; things appearing in place from nothing (entrances, count-ups, draw-ins) |
| `Travel` | (0.2, 0, 0, 1) | 0.03 | 0.16 | 0.50 | A page moving a visible distance (push, pop); one shape into another |
| `Flight` | (0.25, 1, 0.5, 1) | 0.19 | 0.35 | 0.60 | Many small pieces flying at once; they must leave and land together |
| `Fade` | (0.33, 1, 0.68, 1) | 0.14 | 0.27 | 0.49 | Fades and small entrances that go with a flight |
| `Glide` | (0.35, 0, 0.15, 1) | 0.01 | 0.04 | 0.19 | Whole-screen tab slides |

`Arrive` on things that play entirely on screen is the one exception to choosing by the journey.
It suits something that appears in place from nothing (alpha from 0, a value from 0, a line
drawing from its start), where the fast start is hidden by the fade or is the effect itself. It
never suits something visibly travelling across the screen.

**Whole-screen motion is judged by its fastest frame.** A late frame shows as a jump the size
of that frame's step. On a 1440 px page at 120 Hz, `Glide` over 400 ms moves at most 86 px in
one frame. `Travel` over 300 ms moved 159 px; `Arrive` over 400 ms moves 357 px. `Glide` also
barely moves in its first frames, which are the ones paying for building the arriving page.

**Ease once.** If the animation already carries the curve, read its progress raw in the draw
lambda. Easing again inside compounds into a slow start.

**Evidence.** `examples/sample/ui/AppMotion.kt (`AppEasings`)` (the KDoc on each curve);
`examples/sample/test/EasingTest.kt (`fastestFramePx`)`; the starter's `EasingShapeTest` holds every
threshold, including `a tab page never moves far in any one frame` (< 100 px, < 0.6× Travel).

---

## 3. The spring vocabulary

**Rule.** Components and presses take `MaterialTheme.motionScheme` (Expressive). The app's own
surfaces take a few named springs. Never write `spring(...)` inline.

**How.**
- `Springs.Snappy` 0.82 / 520: settle a cancelled gesture (predictive back cancel).
- `Springs.Bouncy` 0.6 / 360: something that should land with energy.
- `Springs.Gentle` 1.0 / 220: a value drifting to a new rest.
- `retimed(base, fraction, threshold)`: make one scheme spring quicker without changing its
  character. Only stiffness moves: stiffness ÷ fraction². Flick's dock → remote transform runs
  at 0.75 of the scheme's default (`examples/flick/sender/Motion.kt:66-72, 157-180`).
- Spatial springs overshoot; effects springs must not. Clamp any alpha driven by a spatial
  spring: "the spatial spring overshoots by design and opacity must not"
  (flick:sender/src/main/java/com/flick/sender/ui/screens/LibraryScreen.kt:714-715).

**On TV (Flick's values).** Keep the Expressive stiffnesses (spatial 380 / 800, effects 1600 /
3800) and clamp damping to ≥ 0.8 for geometry and 0.85 for focus. "The bounce that reads as
energy in the hand reads as instability at 55 inches" (`examples/flick/receiver/Motion.kt:51-53`;
the values are at `:211-247`).
See `tv.md`.

---

## 4. Entrances play once per page identity

**Rule.** A page makes its entrance (cards rising in reading order, numbers counting, charts
drawing) only on its first showing, only in its first 600 ms, and never while it arrives by
navigation.

**Why.** Two bugs in Dash (dash@1940b64). A lazy list forgets what scrolls out, so every card
scrolled back to replayed its entrance. And a tab sliding in on its first visit assembled itself
while it slid: two motions at once. Flick reached the same rule on its own: a shell-held latch
and a 1200 ms window, 35 ms steps capped at 12, an 18 dp rise (flick:sender/.../LibraryScreen.kt:209-213,
1842-1850).

**How.** `Reveal.kt`, a faithful port of Dash's.
- `AppNavHost` wraps every page in `RevealSession(route.key)`. The session asks `RevealMemory`
  whether this identity was shown before, and asks `LocalArrivesSettled` whether the page is
  sliding in. Both answers go into one `RevealStage`.
- The opening lasts `OPENING_MILLIS = 600`, counted **after the first frame**
  (`withFrameMillis {}` then `delay`), so a slow cold-start frame does not use up its own
  entrance.
- Each entrance asks the stage once, in `remember(revealKey)`, and never observes it again.
- `Reveal(revealKey, index = i)`: 480 ms on `Arrive`, rising 22 dp, scaling 0.97 → 1, with
  `ModulateAlpha`. Stagger is 55 ms × index, capped at index 12.
- A card composed late (the list building ahead) waits only `remainingDelayMillis`, not its
  whole turn again. Waiting the whole turn left early-scrolled cards blank for up to 500 ms.
- A tab reached by navigating arrives settled (`NavMotion.arrivesSettled`). Of the tabs, only
  the app's first screen assembles itself. A pushed page (Detail) still makes its entrance.
- New data should replay (a new session, a filter change): nest a `RevealSession` inside the
  screen, keyed on the data, e.g. `"home-$count-$today"` (dash HomeScreen.kt:111-113).
- The starter drops the entrance's `graphicsLayer` once it lands, and never adds one when the
  entrance does not play. A settled list carries no extra layer per card (Flick's rule,
  `examples/flick/receiver/Presence.kt:82-98`).

```kotlin
Reveal(revealKey = "home", index = 2) { AppCard { … } }        // in a lazy item
val draw = rememberRevealProgress("chart-$weekId", durationMillis = 1_100)
Canvas(Modifier) { drawBars(progress = draw.value) }            // read in draw only
```

**Evidence.** `examples/sample/ui/AppMotion.kt (`RevealMemory`, `RevealRule`, `AppReveal`)`; `examples/sample/test/RevealRuleTest.kt`;
the starter's `RevealRuleTest`.

---

## 5. Numbers count up in the draw phase

**Rule.** A count-up is laid out once at the final text's size and paints the running value with
`drawText`. Count up only saved statistics. Never interpolate a live measurement.

**Why.** Nine `Text` count-ups on Dash's Home each re-laid out their tile and their row every
frame; it is cause 3 of the 8 the 0.9.1 README lists (dash
docs/upgrade-0.9.1/README.md:15-17). A live reading counting through values that were never true
is a lie (both apps reached this rule; see `design-direction.md`).

**How.** `AnimatedNumber(value, style, color, format = …)`: 1100 ms on `Arrive`, from 0 or from
the previous value; plays only when its page's stage plays. Accessibility reads the final value.
Give `style` tabular figures (`AppText.monoValue` or `fontFeatureSettings = "tnum"`), or the width
jitters as digits change. Stagger a row with `delayMillis = 120 + index * 60` (Dash's Home).

**Evidence.** `examples/sample/ui/AppMotion.kt (`AnimatedNumber`)`.

---

## 6. Charts and paths draw themselves in, built once

**Rule.** A draw-in reads a 0 → 1 progress inside the draw lambda. Geometry (paths, lengths,
shaders, `Paint`) is built once per size in `drawWithCache`; each frame only cuts a segment.

**Why.** Each Dash route thumbnail turned up to 480 points into paths, measured them and cut the
visible segment again every frame (dash docs/upgrade-0.9.1/README.md:24-26).

**How.** `rememberRevealProgress(key, durationMillis, delayMillis)` gives a `State<Float>`; read
`.value` only in `drawBehind` / `Canvas`. Keep one `Path` per continuous segment and their
lengths; per frame, `PathMeasure.getSegment(0, total × progress, scratch, true)` into a reused
path. Never bridge a gap in the data. Dash's durations, for scale:

| Element (Dash's) | Duration | Delay |
|---|---|---|
| Line chart | 1300 ms | 0 |
| Bars (stagger `(p·(n+3) − i) / 3`) | 1100 ms | 0 |
| Sparkline | 900 ms | 250 ms |
| Route thumbnail | 1500 ms | 150 ms |
| Hero route on the detail page (`always = true`) | 1900 ms | 500 ms, after the morph |

Two things drawing themselves at once read as neither: Dash's hero route waits for the page to
finish arriving (dash@07d337d). Many identical animated items take one `drawBehind` over float
arrays and one driver, not one animation each. Flick's TV panel fan-out ran at ~10 fps, all of it
on the UI thread. One cause was a 40-bar histogram built from 80 render nodes and 80
`Animatable`s. It became one `drawBehind` over four float arrays with a single driver read in
draw (flick@6c20a4b).

Dash's line chart still builds its partial-fill gradient on every frame of its draw-in
(`examples/sample/ui/Charts.kt (`ItemLineChart`'s `fillBrush`)`). Do not copy that line: build the brush once in
`drawWithCache` and pass `alpha = progress` to `drawPath` instead.

**Evidence.** `examples/sample/ui/PathThumbnail.kt (`PathThumbnail`)`; `examples/sample/ui/Charts.kt (`ItemLineChart`)`.

---

## 7. Press: collected off composition, read in a layer

**Rule.** Press feedback never reads press state in composition. Collect the interactions into an
`Animatable`, and read its value only inside `graphicsLayer`.

**Why.** A `@Composable` Modifier factory has no restart scope of its own, so
`collectIsPressedAsState()` inside one invalidated the whole control twice per touch: Flick's dock
with four texts and a decoded thumbnail (`examples/flick/sender/Motion.kt:226-264`). Dash's
`dashPress` still does this (`examples/sample/ui/AppMotion.kt (`Modifier.pressScale`)`); do not copy it.

**How.** `Modifier.pressScale(interactionSource, pressedScale = 0.965f)` on the scheme's fast
spatial spring. Pass the same source to `clickable(interactionSource, indication = null)`: the
scale is the feedback, and a ripple on top answers one touch twice.
- A release mid-swell is `launch`ed, not awaited, so it retargets from its velocity.
- A press corner morph needs a **fresh `Shape` per frame with `equals` on the radius**. A
  remembered shape mutated in place compares equal to itself, so the outline never updates and
  the corner freezes (`examples/flick/sender/Motion.kt:316-347`). Clamp the radius; the spring
  overshoots.
- Put anything that measures its own bounds outside the scaled layer (android-design
  motion-and-performance.md §6).

---

## 8. Gesture-driven sheets run on three clocks

**Rule.** A sheet has three separate clocks: `rise` (geometry, may overshoot), `fade` (every
opacity, must not overshoot), and `travel` (set by the finger, then by the exit spring).

**Why.** "Keeping travel out of the entrance clocks is what lets a drag interrupt an arrival …
a sheet that is leaving does it by travelling, not by dissolving." The drag offset is *added* to
the entrance offset, so a sheet grabbed mid-arrival moves with the hand instead of jumping to it
(`examples/flick/sender/Sheets.kt:627-660, 812-838`).

**How (Flick's values).** Rise on `defaultSpatialSpec`, fade and scrim on `fastEffectsSpec`, exit
on `fastSpatialSpec` ("arriving is an event worth a little travel; leaving is the user asking to
be somewhere else"). Enter from 30 dp below at scale 0.96, `TransformOrigin(0.5, 1)`. `travel`
is `Animatable(0f, visibilityThreshold = 1f)`: a pixel is the smallest step worth animating,
and the caller is not told the sheet is gone until it lands. All three are read in one
`graphicsLayer`; a leaving sheet never recomposes its content.

---

## 9. Surfaces are born at their origin

**Rule.** A surface summoned by a control grows out of that control, and the origin is spent
exactly once, by the surface it was recorded for.

**Why.** Flick's settings sheet grew from the top-left because the default
`SizeTransform(clip = true)` anchors top-start; and an origin recorded by a cancelled press was
inherited by whatever opened next (flick@c987846).

**How.** `RevealOrigin` is bound to one target; record the centre on the pointer-down `Initial`
pass, withdraw it if the press is abandoned, consume it (matched or not) when a surface is born.
Decide on the `Final` pass, because `clickable` consumes its own down. Clip a disc on the spatial
spring and drop the clip for good the frame the disc owns the window; the spring overshoots
(`examples/flick/sender/OriginReveal.kt:40-230`). On TV the origin is the focused control and
the wipe is a `clipPath` in `drawWithCache` (`examples/flick/receiver/TvReveal.kt:88-243`).

---

## 10. Loops run on one clock and park at rest

**Rule.** A looping illustration is one linear 0 → 1 clock read inside a `Canvas`. Every beat is
an absolute window of that clock. The loop runs only while motion is on and the window is
resumed, and parks on its rest frame otherwise.

**Why.** With one clock read in draw, "a frame of this loop costs a repaint of one Canvas and
nothing above it" (`examples/flick/sender/FlickGesture.kt:50-52`). Absolute windows let a beat be
retimed "without shifting the four that follow it". A loop keeps asking for frames for as long as
it is composed, for hours behind a cast (`examples/flick/sender/FlickGesture.kt:50-110`).

**How.**
```kotlin
val reduced = LocalReducedMotion.current
val resumed = rememberIsResumed()          // read both before any early return
val phase = remember { Animatable(0f) }
LaunchedEffect(!reduced && resumed) {
    if (reduced || !resumed) { phase.snapTo(0f); return@LaunchedEffect }   // the rest pose
    delay(EntranceHoldMs)                  // Flick: 620 ms, so it does not compete with a landing
    while (true) { phase.snapTo(0f); phase.animateTo(1f, tween(CycleMs, easing = LinearEasing)) }
}
fun beat(ms: Float, from: Int, to: Int) = ((ms - from) / (to - from)).coerceIn(0f, 1f)
```
Keep at most one `rememberInfiniteTransition` per screen. A shimmer builds its gradient once in
`drawWithCache` and moves it with `translate`; Dash's `shimmer` allocates a `Brush` every frame
(`examples/sample/ui/AppMotion.kt (`OdometerNumber`)`) — do not copy it (android-design
motion-and-performance.md §6).

---

## 11. Reduced motion, done right

**Rule.** Observe the setting live, provide it once, and handle the three cases Compose cannot.

**Why.** Compose follows the animator duration scale live for every finite spec; at 0 they snap.
The ui jar's `MotionDurationScaleImpl` collects the system scale as a flow
(`startObservingSystemScaleFactor`, checked in ui 1.12.0-beta01). What Compose cannot do: stop a
loop, and choose a reduced-motion content swap for you (`AnimatedContent`'s one frame with both
children drawn). Your own "reduce motion" flag must also be observed.
`!ValueAnimator.areAnimatorsEnabled()` read in composition is correct when it is read, but it is
not observable, so nothing recomposes when the user changes the setting.

**How.**
- `rememberReducedMotion()` watches `Settings.Global.ANIMATOR_DURATION_SCALE` with a
  `ContentObserver` (`examples/flick/receiver/Motion.kt:392-426`). Provide it once near the root
  as `LocalReducedMotion`; `AppNavHost` provides it for pages.
- Finite specs: `orSnap(reduced, spec)`.
- `AnimatedContent`: `cut()` = `fadeIn(snap()) togetherWith fadeOut(snap())`. Never
  `None togetherWith None`: that draws both children at full opacity for a frame
  (`examples/flick/receiver/Motion.kt:307-314`).
- Loops park on their rest frame (§10). A morphing loader freezes on its first shape.
- What stays: motion that *is* the gesture answering (a sheet following the finger).
- Haptics are a different setting; reduced motion does not gate them
  (`examples/flick/sender/Motion.kt:363-375`).

---

## 12. Test motion as numbers

**Rule.** Every timing invariant is a JVM test; every visual claim is a frame from a frozen clock
or a recorded strip, never a screenshot of the end state.

**How, from cheapest to most real.**
1. **Curve shapes and kinematics** (JVM): `EasingShapeTest` — fractions at fixed points, and
   `fastestFramePx(easing, millis)` for whole-screen motion
   (`examples/sample/test/EasingTest.kt`, `fastestFramePx`).
2. **Rules** (JVM): `RevealRuleTest`, `NavMotionTest` (`navigation-and-shared-elements.md` §2).
3. **Specs sampled at the target frame rate** (JVM): step a `TargetBasedAnimation` by the frame
   interval and assert the largest step. Flick holds a full-screen fade to ≤ 10 % per 24 Hz film
   frame (`examples/flick/test/MotionTokensTest.kt:22-40`).
4. **Frozen-clock pixel tests** (device): `createComposeRule(effectContext = object :
   MotionDurationScale { override val scaleFactor = 1f })` for full motion even at scale 0
   (`createComposeRule` from `androidx.compose.ui.test.junit4.v2`; `MotionDurationScale` has a
   property, not a function, so a lambda does not compile); `mainClock.autoAdvance = false`;
   `advanceTimeBy(ms, ignoreFrameDuration = true)`; `captureToImage()`; assert a monotone mean
   luma with a per-step budget (`examples/flick/androidTest/StageMotionTest.kt:60-160, 813-838`).
   Inject the clock; motion on `SystemClock` cannot be driven by the test clock.
5. **Loops really stop** (device): toggle `settings put global animator_duration_scale 0`,
   restore the exact prior value in `finally`, and count frame writes with
   `Snapshot.registerApplyObserver` (`examples/sample/androidTest/LoopMotionTest.kt`).
6. **By eye, from a contact sheet**: `screenrecord`, then `ffmpeg fps=25,scale=240`, tiled 8 per
   row. "Every animation bug fixed so far was found this way" (dash scripts/record-transition.sh).
   Also scan at 5× and 10× animation scale for one-frame flashes (dash@ea5137b).

See `testing.md` for harness code and `performance.md` for frame budgets. Judge only on a release
build. Flick's phone library scroll measured 3.81–7.42 % janky frames (p99 13–27 ms) on debug
against 2.02–2.31 % (p99 10–15 ms) on release, four runs each (flick@c0ac2ed). Dash's 0.9.0 debug
build measured 8.5 % (p99 133 ms). The first 0.9.1 release + AOT pass, before any other fix,
measured 2.4 % (p99 57 ms), and the final 0.9.1 build 1.5 % (p99 23 ms) (dash
docs/upgrade-0.9.1/README.md:136-141).

---

## Symptom → cause → fix

| Symptom | Cause | Fix |
|---|---|---|
| A card-to-page morph "snaps" or "looks like a cut" | `Arrive` (decelerate) on a journey that is all on screen | `Travel` for one shape, `Flight` for pieces (§2) |
| A tab slide shows big jumps whenever a frame is late | a curve whose fastest frame moves > 100 px | `Glide` over 400 ms; test `fastestFramePx` (§2) |
| An interrupted press or drag hitches or stalls | a tween restarting its curve from rest | a spring; `launch` the retarget (§1, §7) |
| Numbers count from zero again on scroll-back or pop | entrance asked per composition, not per page identity | `RevealSession` + `Reveal`/`AnimatedNumber` (§4) |
| A tab slides in while assembling itself | its entrance plays while it arrives by navigation | `LocalArrivesSettled` from the host (§4) |
| Cards scrolled to early sit blank | the late card waits its whole stagger again | `remainingDelayMillis` (§4) |
| Home stutters while counting | `Text` count-ups re-lay out every frame | `AnimatedNumber` draws in the draw phase (§5) |
| A draw-in allocates, GC in the trace | paths/shaders rebuilt per frame | build in `drawWithCache`, `getSegment` into a reused path (§6) |
| Touching a card recomposes it twice | `collectIsPressedAsState` in a Modifier factory | `pressScale` / `rememberPressAmount` (§7) |
| A press corner freezes | a remembered `Shape` mutated in place | a fresh shape per frame with `equals` on the radius (§7) |
| A sheet grabbed mid-arrival jumps to the finger | drag replaces the entrance offset | three clocks; add `travel` to the rise (§8) |
| A sheet grows from the top-left | default `SizeTransform(clip = true)` | `SizeTransform(clip = false)` and an origin (§9) |
| A surface opens from the wrong control | an origin left by a cancelled press | origin bound to a target, withdrawn on cancel (§9) |
| A loop keeps the GPU busy behind another app | loop not gated on lifecycle | `rememberIsResumed()` + park at rest (§10) |
| "Remove animations" is ignored until relaunch | the setting read once | `rememberReducedMotion()` observes it (§11) |
| Both pages flash for one frame with animations off | `None togetherWith None` | `cut()` (§11) |
| An alpha flickers at the end of an entrance | spatial spring overshoot on opacity | effects spec, or clamp the alpha (§3) |
