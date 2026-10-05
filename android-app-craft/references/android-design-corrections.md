# Corrections to android-design

`~/.claude/skills/android-design/` is the older, principle-level skill. It is still the
right place for taste: deriving a direction, the hero budget, the genericness test, the
contrast math. But Dash and Flick shipped after it was written, and in the places below the
real apps measured something it gets wrong or states too broadly.

**When the two skills disagree, the rule here wins**, because each one has a measurement or a
shipped bug behind it. Each entry: what android-design says → what is true → evidence.

During a retro, if a correction here is itself proven wrong, fix it in place and log it in
`lessons-log.md`. Don't edit android-design from this skill's retro; leave it a pointer.

## Motion

**1. "Never hand-write `tween(300)` in an expressive app"** (`material-expressive.md` §4, and
the "Compose-default spring() and hand-written tween(300) side by side" default-look bullet in
`SKILL.md`).
True rule: springs for anything a finger carries or that can be re-aimed mid-flight; named
cubic-curve tweens for finite choreography whose parts must add up and land together.
Evidence: Dash's best motion is tweens on five named curves, bounded so tests can prove
`MORPH_BOUNDS_MILLIS < MORPH_MILLIS` (`examples/sample/ui/NavMotion.kt`,
`examples/sample/test/NavMotionTest.kt`). Flick's TV keeps tweens "only where nothing can
interrupt them" (`examples/flick/receiver/Motion.kt` header). The part that stays true: an
unnamed `tween(300)` at a call site is still a smell. Name it, say why, test it.

**2. Assuming routes cross-dissolve** (`motion-and-performance.md` §7, the paragraph on
hoisting screen state above the route, which takes a cross-dissolve as given).
True rule: never fade a whole page. Slide the arriving page fully opaque and dim the covered
page with one flat `drawRect`. Cross-dissolve only card-sized things.
Evidence: full-page alpha forces a full-screen offscreen buffer per page per frame; on a
1440×3120 screen it was Dash's single biggest source of slow draw commands. Replacing it cut
slow issue-draw commands 39 → 25, p90 18 → 15 ms, p99 30 → 24 ms (dash@c9323c7;
`examples/sample/ui/NavMotion.kt (`NavMotion.dimAmount`)`).

**3. "Choose the motion scheme once"** (`SKILL.md`, workflow step 3).
True rule: choose it once *for components* (presses, sheets, Material widgets). Page
choreography gets its own duration table. A TV may keep the scheme's stiffness and clamp its
damping.
Evidence: Dash passes no `motionScheme`, so its Material widgets get `MaterialExpressiveTheme`'s
expressive default, while its page choreography is tweens on named curves; Flick's receiver
transcribes the Expressive stiffnesses (380/800/1600/3800) and clamps damping to ≥ 0.8
(`examples/flick/receiver/Motion.kt:226-247`).

**4. "Slow for full-screen"** (`material-expressive.md` §4, spring speed selection).
True rule: a leaving or returning full-window transform should be *faster* than the default;
every millisecond of a return is spent waiting.
Evidence: Flick retimes its dock→remote transform to 0.75 of the scheme spring (stiffness ÷
0.75²) and returns heroes on stiffness 800 (`examples/flick/sender/Motion.kt:66-72, 157-187`;
`examples/flick/sender/VideoTile.kt:325-338`).

**5. `rememberReduceMotion = !ValueAnimator.areAnimatorsEnabled()`**
(`motion-and-performance.md` §8).
True rule: that reads the setting once. Observe `Settings.Global.ANIMATOR_DURATION_SCALE`
with a `ContentObserver`; on TV the setting changes live.
Evidence: `examples/flick/receiver/Motion.kt:397-426`.

## Type

**6. Warm fonts with `FontFamily.Resolver.preload()` in a `LaunchedEffect`**
(`copy-and-type.md` Part 2).
What `preload` really does (bytecode of ui-text-android 1.11.4 and 1.12.0, identical): it
resolves every font in the family, Blocking resource fonts included, through
`TypefaceRequestCache.preWarmCache`. So it is not a no-op. But from a `LaunchedEffect` it runs
on the main thread after the first composition, so it moves the cost, not off the frame.
True rule: warm bundled faces off the main thread before `setContent` with
`ResourcesCompat.getFont` on a daemon thread (Compose's resource-font path then hits the
process typeface cache); keep `preload` only as a harmless second pass.
Evidence: `examples/flick/receiver/FontWarmup.kt` (its comment claiming `preload` loads
nothing is wrong about the mechanism); flick receiver `MainActivity.kt:46-53`;
`lessons-log.md` 2026-09-27.

**7. "Pin tracking to 0 on body roles"** (`copy-and-type.md` Part 2).
True for phones. On a ten-foot TV, tracking is slightly *looser* (+0.005 em), because tight
tracking closes the counters at 10 ft (`examples/flick/receiver/Type.kt:57-58`).

**8. Display line height ~1.2×** (`material-expressive.md` §6).
Both phone apps set display leading at or below 1.0×: Dash 54/53 sp, Flick 44/42 and 34/34.
Only the TV uses ≥ 1.3× (`examples/sample/ui/Theme.kt (`DisplayLarge`, `DisplaySmall`)`; `examples/flick/sender/Type.kt`).

**9. Emphasis goes "Regular → Medium"** (`material-expressive.md` §6).
When the base display roles are already Bold or ExtraBold, emphasis is a tracking step
(Flick: 0.005 em tighter) or one weight up for the body face. android-design's own
`copy-and-type.md` Part 2 already gives the tracking rule; this skill follows that one, not
`material-expressive.md` §6. Shipping emphasized roles identical to their base (as Dash does
for display roles) is still wrong; android-design is right about that part.

**10. Apostrophes must be typographic (’)** (`SKILL.md` "never" list; `copy-and-type.md`).
Pick one convention per app and match it in test assertions. Flick ships ASCII `\'`; the one
U+2019 in its test sources broke an assertion (flick@47cf4b6).

## Shape, color, components

**11. The M3 corner steps 4/8/12/16/20/28/32/48** (`material-expressive.md` §5).
Neither app uses them. Flick's sender names 19 radii by component (13–36 dp, plus a 999 dp
`full`); Dash uses literal radii, mostly 16–32 dp. Keep a named scale; its values are a
product decision (`examples/flick/sender/Shape.kt`).

**12. Glass paints its fill under the backdrop effect** (`color-and-theming.md` §9, the
`appGlass` snippet).
True rule: a blur-backed surface paints a *transparent* fill; the tint lives inside the
Haze style, and the no-blur fallback is the same composite. Test ink contrast over that
composite at the coverage actually drawn (the starter's `glassFallbackTint` at
`BarBackdropVisibility`), over the worst backdrop that can scroll under it — not over the
`glass` token at its own alpha, which the bar never paints.
Evidence: flick@e079608 ("Haze owns the nav material in both themes; an opaque fill would
hide its backdrop"), flick@0fa09f1 (one tint function, stacked glass graded 0.60 vs 0.74);
`examples/flick/sender/FlickBottomNav.kt:490-568`.

**13. "Chrome height is a measurement, not a literal"** (`components-and-verification.md` §4).
Conditional: measure when the bar can grow with font scale (Flick). A constant is fine when
the design guarantees a fixed height and the label shrinks to fit (Dash's 104 dp clearance
under a fixed 60 dp bar).

**14. Ripple guidance assumes ripples** (`components-and-verification.md` §1).
On glass and brand fills, the neutral ripple reads as a grey blob. Dash uses press scale with
`indication = null`; Flick's glass nav uses a brand-tinted wash at 0.16 alpha. When a
component combines responses (Flick's video tile: scale, a 26 → 20 dp corner morph and a
spark ripple), drive them all from one press and one interaction source; never add a scale on
top of a Material component's own shape morph.

**15. Errors carry no reassurance** (`copy-and-type.md` Part 1).
Refined: state the problem and the fix, and optionally the one wrong cause the user would
otherwise chase ("Your network isn't the problem"). Flick ships this pattern.

## Build, measurement, verification

**16. Use `material3:1.5.0-alpha25`** (`material-expressive.md` §1).
Pick the alpha by toolchain: alpha19+ needs Compose 1.12 and compileSdk 37, which needs AGP
9.x. Dash stays on alpha18 (AGP 8.10); Flick runs alpha24 (AGP 9.3). See
`references/setup-and-tooling.md`.

**17. "Never ship `tracing-perfetto-binary` to production"** (`motion-and-performance.md` §3).
Fine in a personal or dogfood release build (Dash ships it with `profileable shell="true"` so
a release install can be traced). Strip it for Play.

**18. "0.21 % jank" is what good looks like** (`motion-and-performance.md` §3).
The real apps settle at 1.5 % (Dash tour, p99 23 ms) and 2.0–2.3 % (Flick library scroll) on
release. Judge a change by its own before/after on the same tour, not by a best case.

**19. "Screenshot the real screen on real hardware"** (`SKILL.md` workflow step 7).
Look on hardware; publish from the emulator with synthetic data or from redacted captures.
The user's phone holds their real data; its screens stay private.

**20. `adb exec-out screencap`** (`components-and-verification.md` §6).
On a headless emulator with `-gpu swiftshader_indirect` it returns black. Use `-gpu host`, or
verify through `uiautomator dump`.
