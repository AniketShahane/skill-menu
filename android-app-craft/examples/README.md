# Examples: real code from the two apps

These files show the techniques in full, so a rule in `references/` can point at working code
instead of a paraphrase. Read them; don't paste them. The renamed, buildable versions live in
`templates/starter/`.

| Folder | What it is |
|---|---|
| `sample/` | Short examples written for this skill from the techniques in Dash (a running app whose repo is private): same ideas and numbers, neutral names ("items"). They don't compile on their own. |
| `flick/` | Exact copies from Flick (casting: `:sender` phone, `:receiver` Android TV), a public repo, at `a6bda78`, copied 2026-09-27. |

References also cite `dash:<path>:<line>` and `dash@<sha>`. Those point into Dash's private
repo as evidence; you don't need them to use the skill.

The Flick copies drift from its repo as the app moves on. When a path:line in a reference no
longer matches the repo, trust the copy here, and refresh both during a retro.

## Where to look for what

### Motion and navigation

| Want | Open |
|---|---|
| Named easing curves with when-to-use, springs, press spring | `sample/ui/AppMotion.kt (`AppEasings`, `AppSprings`, `Modifier.pressScale`)` |
| Entrance once per page identity (`RevealMemory`, `RevealRule`, `RevealSession`, `AppReveal`) | `sample/ui/AppMotion.kt (`RevealMemory`, `RevealRule`, `AppReveal`)` |
| Chart and route draw-in progress | `sample/ui/AppMotion.kt (`rememberDrawInProgress`)` |
| Count-up painted in the draw phase (`AnimatedNumber`) | `sample/ui/AppMotion.kt (`AnimatedNumber`)` |
| Odometer text | `sample/ui/AppMotion.kt (`OdometerNumber`)`; better: `flick/receiver/RollingGlyphs.kt` |
| Every page-transition decision as a pure function | `sample/ui/NavMotion.kt` |
| Those decisions tested on the JVM | `sample/test/NavMotionTest.kt`, `sample/test/EasingTest.kt`, `sample/test/RevealRuleTest.kt` |
| The nav host: tab glide + overtake spring, push/pop parallax, flat dim, predictive back, frame-rate vote | `sample/ui/AppNavigation.kt (`AppNavHost`)` |
| Card → page "piece by piece" shared elements | `sample/ui/AppNavigation.kt (`ItemPiece`)`, `sample/ui/NavMotion.kt (`pieceScope`, `pieceKey`, `isDestinationEnd`)` |
| Button → page container transform (the + button) | `sample/ui/AppNavigation.kt (`PlusButtonContainerTransform`)` |
| Tab capsule gliding on the page's clock | `sample/ui/AppBottomBar.kt (`TabMotion.select`, `TabCapsule`)`; test `sample/test/TabMotionTest.kt` |
| Expressive `MotionScheme` + a small motion object; retiming a scheme spring | `flick/sender/Motion.kt:52-188` |
| Press feedback collected off composition, corner morph | `flick/sender/Motion.kt:226-347` |
| TV spring vocabulary, damping clamp, live reduced motion, `cut()` | `flick/receiver/Motion.kt` |
| Dock → full-screen container transform, corner as a function of height | `flick/sender/NowPlayingBar.kt:210-320` |
| Tile → detail hero frame with named visibility thresholds | `flick/sender/VideoTile.kt:309-470` |
| Surfaces born at the control that summoned them | `flick/sender/OriginReveal.kt`, `flick/receiver/TvReveal.kt` |
| A looping illustration on one linear clock, parked at rest | `flick/sender/FlickGesture.kt` |
| In-place swap and overlay presence | `flick/receiver/Swap.kt`, `flick/receiver/Presence.kt` |
| Confetti, seeded and finite | `sample/ui/Confetti.kt` |

### Theme, type, icons

| Want | Open |
|---|---|
| Palette in a CompositionLocal, projected into `ColorScheme`, confined dynamic color | `flick/sender/Color.kt`, `flick/sender/Theme.kt:132-196` |
| Fixed brand fills + `MaterialExpressiveTheme` + fill-in type helpers + `tnum` | `sample/ui/Theme.kt` |
| Type scale with Bricolage / Geist / Geist Mono, emphasized roles | `flick/sender/Type.kt` |
| Ten-foot type with floors | `flick/receiver/Type.kt` |
| Corner scale, percent pill | `flick/sender/Shape.kt` |
| Relationship-named spacing and TV layout budgets | `flick/receiver/Dimens.kt` |
| Appearance preference stored safely, applied without recreate | `flick/sender/Appearance.kt` |
| Off-thread font warm-up | `flick/receiver/FontWarmup.kt` — its comment claiming `FontFamily.Resolver.preload()` loads nothing for resource fonts is wrong; see `references/performance.md` (font warm-up) |
| Hand-drawn `ImageVector` icon builders | `flick/sender/FlickIcons.kt:389-470` |
| Contrast and elevation as JVM tests | `flick/test/FlickColorsTest.kt` |
| Cold-start plate held to the palette | `flick/test/ThemePlateTest.kt` |
| Chrome contrast over a white film frame | `flick/test/PlaybackContrastTest.kt` |

### Components

| Want | Open |
|---|---|
| Floating frosted bar (Haze, half-res input, rim, sheen, capsule, + button) | `sample/ui/AppBottomBar.kt` |
| Glass tint as a function + a fallback that is the same composite; measured bar clearance | `flick/sender/FlickBottomNav.kt:490-633` |
| Cards, tiles, eyebrow, chips, empty state, primary button | `sample/ui/Components.kt` |
| Card over a map/image, auto-sizing numbers, one merged semantics line | `sample/ui/ItemCard.kt` |
| Media tile with honest "withheld" badges | `flick/sender/VideoTile.kt:500-680` |
| Chart kit (bars, line, sparkline, heatmap, week dots) | `sample/ui/Charts.kt` |
| Route drawn along its path, cached geometry | `sample/ui/PathThumbnail.kt (`PathThumbnail`)` |
| Byte-sized bitmap cache, hardware bitmaps, halving resample, pause-by-reason render queue | `sample/ui/ThumbnailCache.kt` |
| Snap-fling wheel pickers | `sample/ui/WheelPickers.kt` |
| A custom bottom sheet that survives keyboards, floating bars and fast dismiss | `flick/sender/Sheets.kt` |
| Status pill + live dot gated on resumed/reduced motion | `flick/sender/StatusPills.kt` |
| Inline advisory card | `flick/sender/AdvisoryCard.kt` |
| Morphing pill buttons without double feedback | `flick/sender/Buttons.kt` |
| Scrub bar: lambda inputs, draw-only, end gate, wave that tells the truth | `flick/sender/PhoneScrubBar.kt` |
| Explanations behind an (i) | `sample/ui/InfoButton.kt` |
| Heavy cards deferred behind an outline until the transition settles | `sample/ui/StartScreen.kt (`Settling`, `SettlingSlot`, `CardOutline`)` |

### Android TV

| Want | Open |
|---|---|
| Detached painted focus ring, beacon, `landTvFocus`, button modifier order | `flick/receiver/TvFocus.kt` |
| Glass without blur over video | `flick/receiver/GlassPanel.kt` |
| Text tint without recomposition (`ColorProducer`) | `flick/receiver/Ink.kt` |
| Refresh-rate hint derived from state, released on dispose | `flick/receiver/RefreshRatePolicy.kt`, `flick/receiver/RefreshRateHelper.kt` |
| Focus-walk + safe-area test | `flick/androidTest/SettingsScreenFocusTest.kt` |

### Testing and performance

| Want | Open |
|---|---|
| Custom instrumentation runner that cuts paid backends | `sample/androidTest/AppTestRunner.kt` |
| Emulator-only guards, `reveal`, clear-of-floating-bar via `ScrollBy` | `sample/androidTest/EmulatorSupport.kt` |
| Tests that snapshot and restore the user's data | `sample/androidTest/UpgradeFlowTest.kt` |
| Text fit across font scales via `GetTextLayoutResult` | `sample/androidTest/LongTextLayoutTest.kt` |
| System-bar and recreation checks by pixel luminance | `sample/androidTest/ThemePresentationTest.kt` |
| Real-clock loop tests toggling the animator scale | `sample/androidTest/LoopMotionTest.kt` |
| Frozen-clock pixel motion tests with `MotionDurationScale` | `flick/androidTest/StageMotionTest.kt`, `flick/androidTest/HeardRingMotionTest.kt` |
| Sampling a spec at the target frame rate | `flick/test/MotionTokensTest.kt` |
| Backup rules checked against the real XML and source | `flick/test/BackupExclusionsTest.kt` |
| Baseline profile producer module, generators, scroll benchmark, hand-written HSPL rules | `flick/baselineprofile/` |
