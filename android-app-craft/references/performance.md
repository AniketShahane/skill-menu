# Performance: build it right, keep it off the frame, measure it

How to make a Compose app hold its frame rate on a 120 Hz phone, and prove it. In Dash and
Flick most of the "stutter" was the debug build. Most of the rest was work in composition,
offscreen buffers, or oversized bitmaps. All of it was found by measuring, not by looking.

Build types, R8, signing and the phone install are in `setup-and-tooling.md`; this file builds
on it. Motion idioms (draw-phase count-ups, cached paths, press off composition, flat page dim)
are in `motion-system.md` and `navigation-and-shared-elements.md`; §4 only lists them. For the
principles (composition is where animations stutter, frame phases, deferred reads) read
`android-design/references/motion-and-performance.md` §1, §2, §5, §6.

Scripts live in `templates/starter/scripts/`. Set `APP_PHONE_SERIAL` in your shell profile; the
scripts find the app root and the package themselves (`new-app.sh` writes your package into them). "Dash's" and "Flick's" numbers come from that app's device and tour.

---

## 1. Judge nothing until it is a release build, compiled ahead of time

**Rule.** Every frame number, every "it stutters", every before/after comes from the minified,
non-debuggable release build, AOT-compiled on the device.

**Why.** Dash's phone was running a `flags=[ DEBUGGABLE ]` build. Same tour, about 1,510 frames
each (dash:docs/upgrade-0.9.1/README.md "Measure"):

| Build (Dash's tour, 120 Hz phone) | Janky | p90 | p99 | Slow UI thread | Missed vsync |
|---|---:|---:|---:|---:|---:|
| 0.9.0 debug | 8.5 % | 23 ms | 133 ms | 125 | 78 |
| 0.9.1 release + AOT, first pass | 2.4 % | 13 ms | 57 ms | 20 | 9 |
| 0.9.1 release + AOT, final | 1.5 % | 13 ms | 23 ms | 8 | 2 |

Dash's rows mix two changes: the "first pass" already carried the first UI fixes (draw-phase
count-ups, reveal-once, lazy pages, cached route geometry, hardware map tiles, the High
frame-rate vote), all in one commit (dash@3b9c234). So they cannot say how much the build alone
was worth. Flick's can: same code, "identical protocol", phone library scroll, four runs each:
debug 3.81–7.42 % janky, p99 13–27 ms; release 2.02–2.31 %, p99 10–15 ms. "The variance
collapse is the point" (flick@c0ac2ed). A debug build carries Compose's source-information
bookkeeping, inlines nothing, and ART holds back optimisation. A debug number is noisy enough to
hide a real change.

**How.** The starter's `release` type is already minified and signed so `install -r` works
(`setup-and-tooling.md` §5):
```sh
./gradlew :app:assembleRelease
scripts/install-phone.sh            # install -r, then cmd package compile -m speed -f
scripts/measure-frames.sh before    # §12
```

## 2. Confirm what is installed, and that it is compiled

**Rule.** Before trusting a number, check on the device that the build is not debuggable and
that it has been compiled.

**Why.** A sideloaded APK gets no cloud profile, so its first minutes run interpreted or in the
JIT (dash:docs/upgrade-0.9.1 cause 2). And a debug build can sit on a phone unnoticed (Dash 0.9.0).

**How.**
```sh
adb -s "$APP_PHONE" shell dumpsys package <pkg> | grep -E "versionName|pkgFlags"   # no DEBUGGABLE
adb -s "$APP_PHONE" shell cmd package compile -m speed -f <pkg>                    # about a minute
adb -s "$APP_PHONE" shell dumpsys package dexopt | grep -A3 <pkg> | grep -m1 status
```
`scripts/install-phone.sh` runs all three and warns if the result is still `DEBUGGABLE`. `speed`
compiles the whole app, which is stronger than a profile: right for measuring your own device,
useless for a Play install (that is §3). Compile again after every sideload.

## 3. Ship a baseline profile, and check it contains your code

**Rule.** Every app ships a baseline profile from its own `com.android.test` module. After every
generation, count your own package's rules in it.

**Why.** Flick shipped profiles of 5721 and 3613 lines with **zero** `com/flick/` rules: all of
them came from AndroidX AARs, and every screen's first run was interpreted. The cause was a
`.gitignore` line, `release/`, that matched only `src/release/`, the directory `saveInSrc = true`
commits to. After the fix: 1752 and 1518 app rules (flick@50a7a9a).

**How: the module** (all in the starter).
- `baselineprofile/build.gradle.kts`: `com.android.test`, `targetProjectPath = ":app"`, `minSdk`
  28 (ART's profile cannot be dumped below it), `enableKotlin = true` (AGP 9),
  `useConnectedDevices = true`. Profile on the hardware with real data; an empty emulator
  profiles the empty state.
- `app/build.gradle.kts` `baselineProfile {}`: `automaticGenerationDuringBuild = false`, so
  `assemble*` never needs a device and packages what is committed; `saveInSrc = true`;
  `hideSyntheticBuildTypesInAndroidStudio = false`; `dexLayoutOptimization = true`. Leave
  `baselineProfileRulesRewrite` unset (AGP 9.3.0 no longer defines its property). The app's
  `profileinstaller` installs the profile on first run.
- `StarterBaselineProfileGenerator.kt`: `startup()` with `includeInStartupProfile = true`, and
  `journeys()`: fling the main list 3× down and 2× up (gesture margin 0.15, so the floating bar
  and back gesture do not eat it), open the largest tile, visit the tabs. Every step is
  best-effort: "a short profile is still a valid profile, an aborted run is not"
  (`examples/flick/baselineprofile/SenderBaselineProfileGenerator.kt`).

**How: generate and verify.**
```sh
./gradlew :app:generateReleaseBaselineProfile     # a device must be connected
git check-ignore app/src/release/generated/baselineProfiles/baseline-prof.txt && echo IGNORED
grep -c 'com/example/starter/' app/src/release/generated/baselineProfiles/baseline-prof.txt
./gradlew :app:assembleRelease
grep -c 'com/example/starter/' \
  app/build/intermediates/r8_art_profile/release/expandReleaseArtProfileWildcards/baseline-prof.txt
```
Use your own package path after `new-app.sh`. `check-ignore` must print nothing; both counts
must be well above zero (Flick: 1752 and 1518). Until the first `generateReleaseBaselineProfile`
the count is 0 by design: the starter ships no profile, so the expanded file holds only AndroidX
rules (a fresh scaffold: 39,656 lines, none of them the app's), and the benchmark's
`Partial(Require)` fails. The starter's `.gitignore` ends with `!**/src/release/` and
`!**/src/release/**` (`setup-and-tooling.md` §11). Commit `baseline-prof.txt` and
`startup-prof.txt`. The generator installs and drives the app. `install-phone.sh --backup`
works only while a debug build is installed; with a release build on the phone the only
protection is an in-app export. So generate on a spare device, or accept the risk only after an
export (`setup-and-tooling.md` §8).

**Hand-written rules for what the generator cannot reach.** Flick's generator never starts a
cast, so the TV's playback motion lives in a hand file merged at build time
(`examples/flick/baselineprofile/flick-motion-rules.txt`). Put yours in
`app/src/main/baselineProfiles/<name>.txt`, and give every rule a method part:
```
HSPLcom/example/starter/ui/screens/PlaybackScreenKt;->**(**)**
HSPLcom/example/starter/ui/screens/PlaybackScreenKt$*;->**(**)**
```
"A bare class rule only preloads the class and compiles none of its methods". The `Kt$*` line
covers nested lambda and coroutine classes (flick:docs/implementation.md:168-185). Check the
rules appear in `build/intermediates/merged_art_profile/release/mergeReleaseArtProfile/` and
expanded in the `expandReleaseArtProfileWildcards` file above.

**Profiles go stale.** A profile names methods. After `VideoTile`'s signature changed, the
library's first tiles ran interpreted until the profile was regenerated (flick@ac61e81; TV
renderers, flick@a4d1838). Regenerate after changing a hot screen, and write in the commit what
the generator still cannot reach.

**The `benchmark` type** is release-shaped but unminified, so traces show real names
(`setup-and-tooling.md` §5); the macrobenchmark runs the plugin's `benchmarkRelease` (§12.5).

## 4. The draw-phase checklist

**Rule.** Nothing that changes every frame is read in composition. Each row was a real
problem in one of the apps; the rows with a number were measured, the others come from the
code's own comments or were seen on screen. The idioms live in the linked files.

| Rule | Measured cost when broken | Idiom |
|---|---|---|
| Per-frame values only inside `graphicsLayer {}`, `offset {}`, `drawBehind`, `drawWithCache` | Flick's scroll jank "was almost entirely UI-thread while the GPU sat well inside budget" (flick@c0ac2ed) | android-design `motion-and-performance.md` §5–6 |
| Count-ups paint with `drawText` into a box sized once | 9 count-ups on Dash's Home re-laid out their tile and row every frame (0.9.1 cause 3) | `motion-system.md` §5 |
| Paths built once per size in `drawWithCache`; each frame only slices | Up to 480 points per route re-pathed per frame, six routes at once (0.9.1 cause 6) | `motion-system.md` §6 |
| Entrances play once per page identity, first 600 ms only | Tab switch 0.94 → 0.32 skipped frames, for the whole commit (a new tab slide, reveal-once, the pet decode moved off the main thread; dash@1940b64) | `motion-system.md` §4 |
| Press state collected off composition | "invalidated the whole control twice on every touch" (`examples/flick/sender/Motion.kt:229-234`) | `motion-system.md` §7 |
| Never alpha a whole page; slide opaque, dim with one `drawRect` | 26 of 32 janky frames were slow issue-draw; 39 → 25 after (dash@c9323c7) | `navigation-and-shared-elements.md` §4 |
| Drop settled layers; rasterise repeated geometry once | 109 → 11 render targets on Flick's TV receiver, pairing screen (flick@c4873de) | §5 |
| Many identical animated items: one draw lambda | 427 ms open, then about 10 fps (flick@6c20a4b) | §6 |
| Tints as `ColorProducer` / `ColorFilter.tint` in `drawBehind`, never in a `TextStyle` | A tint in a style is a layout input: Flick's nav label re-measured per frame | `components.md` §4, §18 |
| Shaders built once per size, moved with `translate` | Flick's scrub gradient was a new shader per draw at pointer rate, up to 240 Hz | `examples/flick/sender/PhoneScrubBar.kt:305-311`; `motion-system.md` §6; android-design `motion-and-performance.md` §6 |
| `TextMotion.Animated` on text under a scale | Text shimmered under the 0.97 → 1 reveal (dash 0.9.4) | `theme-and-type.md` §10 |
| Loops park when not resumed; one infinite transition per screen | A live dot asked for a frame every vsync for a two-hour cast | `motion-system.md` §10 |

## 5. Offscreen buffers are the GPU bill: ModulateAlpha, drop settled layers, half-res glass

**Rule.** A fading thing uses `CompositingStrategy.ModulateAlpha`. A layer that has finished
animating leaves the modifier chain. The blur samples at half resolution.

**Why.** Under the default strategy, alpha below 1 renders the node into an offscreen buffer
every frame. For Flick's tiles that was "a megabyte and a half of RGBA per tile per frame, on up
to twelve tiles at once", and the buffer clipped the tile's shadow
(flick:sender/.../LibraryScreen.kt:705-711). A finished layer still composites every frame.
On Flick's TV receiver (the pairing screen, a different device from the phone tiles above),
dropping settled entrance layers and rasterising the QR code once instead of about 1,700
`drawRect`s per invalidation took scratch render targets 109 → 11, GPU memory 49.89 → 3.45 MB,
GPU time 17 → 10 ms (flick@c4873de).

**How.**
```kotlin
// Flick's tile entrance (LibraryScreen.kt:704-718): no layer at all once it has landed.
if (!armed && !rising) return this
return graphicsLayer {
    compositingStrategy = CompositingStrategy.ModulateAlpha
    alpha = progress.value.coerceIn(0f, 1f)   // the spatial spring overshoots; opacity must not
    translationY = (1f - progress.value) * rise
}
```
The starter's `Reveal` adds its layer only while an entrance plays
(`templates/starter/.../ui/motion/Reveal.kt:172-189`). Shared-element pieces fade themselves with
`ModulateAlpha` too: the shared-bounds fade renders "a buffer the width of the phone" for a map,
every frame (dash@ea5137b; `navigation-and-shared-elements.md` §7).

**Glass.** Haze with `inputScale = HazeInputScale.Fixed(0.5f)` samples at half resolution,
"invisible under a 28 dp radius" (dash:docs/upgrade-0.9.4; starter `ui/components/GlassBar.kt`, the `inputScale = HazeInputScale.Fixed(0.5f)` line in
`GlassBar`).
Do not blame the glass first: Dash turned the bar's blur off and measured no change, "the bar
was not the cost" (dash@c4ab031). Consider blur-off-while-flinging only if a trace shows
fill-bound frames. The TV has no blur at all (`tv.md` §11).

## 6. Many identical animated items: one draw lambda, not many composables

**Rule.** When dozens of identical shapes animate together (bars, dots, ticks), draw them in one
`drawBehind` over float arrays, driven by one animated value read inside the lambda.

**Why.** Flick's 40-bar histogram gave each bar a composable with two `Animatable`s, a
`graphicsLayer`, a `clip` and a `drawBehind`: 80 render nodes, 80 animators, "on the order of
1,200 objects to draw forty rounded rects". The panel's first frame took 427.7 ms (189.9 ms
compose, 227.0 ms record), then it ran at about 10 fps. RenderThread never passed 9.8 ms: it was
all UI thread (flick@6c20a4b; measured on the TV's debug build, so read the shape, not the ms).

**How.** Keep each bar's start and target in `FloatArray`s. One `Animatable` runs 0 → 1, and
`drawBehind` computes `from[i] + (to[i] - from[i]) * t`. That is exact when every bar shares one
critically damped spec from rest: such a spring's normalised path does not depend on its
distance. An unmeasured slot is not drawn at all; a measured zero keeps its 6 % floor (flick@6c20a4b).

## 7. Lazy lists: keys, content types, a cache window, entrances once

**Rule.** Every page longer than a screen is a `LazyColumn` or `LazyVerticalGrid`. Every item
has a stable `key` and a `contentType`. Page lists share one cache window.

**Why.** On Dash's plain columns, "a tab switch composed twenty cards, three map thumbnails and
all their charts before the first frame of the transition" (0.9.1 cause 5). Without
`contentType`, a tile handed a header's slot "is rebuilt from nothing rather than updated"
(flick:sender/.../LibraryScreen.kt:1814-1817).

**How.**
```kotlin
@OptIn(ExperimentalFoundationApi::class)
internal val PageListCacheWindow = LazyLayoutCacheWindow(ahead = 300.dp, behind = 200.dp)  // Dash's
LazyColumn(state = rememberLazyListState(cacheWindow = PageListCacheWindow)) {
    items(runs, key = { it.id }, contentType = { "run" }) { RunCard(it) }
}
```
A fling then meets cards "already composed and measured" (`examples/sample/ui/AppBottomBar.kt (`BarRowCacheWindow`)`).
Foundation 1.11.4+ keeps pausable prefetch on by default. The starter has keys and content types
but no window; add one once a page holds heavy cards. Tag the list (`testTagsAsResourceId = true`
+ `testTag`) for the benchmark and scripts. The starter does not set `testTagsAsResourceId`, so
until you add `Modifier.semantics { testTagsAsResourceId = true }` at the root,
`measure-frames.sh`'s `--match '^item_'` finds nothing and it taps a fixed point 2/5 down the
screen instead. Scrolled-back items must not replay their entrance:
`RevealRule` (`motion-system.md` §4).

## 8. Keep heavy work off frames that are already animating

**Rule.** Expensive main-thread work (a map render, a decode, a big computation, composing a
heavy card) waits until no transition or fling is running, or happens before it starts.

- **Pause a work queue by reason.** Dash's map renders start on the main thread. The queue keeps
  a `HashSet<String>` of pause reasons and resumes only when it is empty; renders rest 120 ms
  apart and time out after 20 s (`examples/sample/ui/ThumbnailCache.kt`, `RenderQueue.submit`, `RenderTimeoutMillis`).
  Give the reason back on dispose, or a list disposed mid-fling leaves "scroll" in the set and
  the queue never resumes (dash:ui/activities/ActivitiesScreen.kt:75):
  ```kotlin
  LaunchedEffect(listState.isScrollInProgress) { RouteSnapshots.setPaused(listState.isScrollInProgress) }
  DisposableEffect(Unit) { onDispose { RouteSnapshots.setPaused(false) } }
  LaunchedEffect(transition.isRunning) { RouteSnapshots.setPaused(transition.isRunning, "transition") }
  ```
- **Settle heavy cards.** Dash's `Settling` holds each heavy card's outline at its usual height
  until the page transition reports arrival, then fades the card in over 150 ms. A 1.2 s
  timeout stops a paused clock holding cards back (`examples/sample/ui/StartScreen.kt (`Settling`, `rememberSettling`, `SettlingSlot`)`).
- **Precompute facts.** A run's route, laps and best efforts were computed on the transition's
  first frame; they now come precomputed with the dashboard (dash:docs/upgrade-0.9.4).
- **Hold layout in flight.** A flying panel under `RemeasureToBounds` re-measured about 30 text
  lines per frame. `skipToLookaheadSize(inFlight)` lays it out once at its landing size. Remember
  the `inFlight` lambda: the modifier compares it by identity, so a fresh one re-measures on
  every recomposition (`examples/sample/ui/AppNavigation.kt (`ItemPiece`)`; dash@c4ab031).
- **`scaleToBounds` for container transforms.** `RemeasureToBounds` re-measured the whole start
  page every frame of a 460 ms transform (`navigation-and-shared-elements.md` §8).

## 9. Bitmaps: the size of their box, uploaded before they are drawn

**Rule.** Decode or render every bitmap at the pixel size of the box that shows it. Decode off
the main thread as `HARDWARE` where it can be, and upload software bitmaps early. Cache by bytes; let go when asked.

**Why.** Dash gave the map snapshotter the box size in pixels *and* the density, and it
multiplied them. A card's map came back 4,837×2,475 and a page's 5,400×4,781 on a 1440 px
phone: about 14× the pixels shown, 48 and 100 MB of GPU memory, shrunk again every frame. Frame
classification showed the card-flight stutter was RenderThread, not composition (dash@c4ab031).
Separately, decoding three 1,254 px pet originals cost 60–70 ms of the frame that opened
Settings, found in a Perfetto trace (dash@1940b64).

**How** (`examples/sample/ui/ThumbnailCache.kt`):
- **Resample in halving steps**, then one last step: "one bilinear jump across a factor of four
  skips most of the pixels it is averaging" (`shrink()`'s KDoc; the steps are
  `shrinkSteps`).
- **Hardware decode, early upload:** `inPreferredConfig = Bitmap.Config.HARDWARE` where the
  decode allows it. A HARDWARE bitmap is already on the GPU, so `prepareToDraw()` does nothing
  for it; call it on the disk thread for every software bitmap: the fallback, and fresh renders,
  which are scaled as software bitmaps (`decodeThumbnail`).
- **Disk cache that cannot serve stale or torn files:** a versioned key (`-v$VERSION`) with
  every older version deleted on write, an atomic `.png.tmp` + rename, and a 120-file LRU by
  modification time (not shown in the example).
- **Byte-sized LRU:** `minOf(64 MiB, Runtime.maxMemory() / 4)`, `sizeOf = w * h * 4 + …`. The
  old limit was 14 entries of any size (`ThumbnailMemoryCache`).
- **`onTrimMemory`:** evict all at `BACKGROUND` and above, half at `UI_HIDDEN`, all at
  `RUNNING_LOW` and `RUNNING_CRITICAL`; `releaseMemory()` when heavy work starts (`ThumbnailMemoryCache.onTrimMemory`).
- **Never decode a launcher original in the UI.** Dash's headers decoded the 1,254 px launcher
  PNG on every Home composition; the fix was a 176 px copy. Decode with `inSampleSize` down to
  256–511 px, off the main thread at launch.

## 10. State the frame rate you want, and always give it back

**Rule.** On a phone, wrap the navigation host in `preferredFrameRate(FrameRateCategory.High)`.
Any rate hint must be derived from current state and released on dispose. Keep long-lived,
continuously redrawing screens (a timer, a live map, a reader) outside the High vote, for
battery: Dash's hour-long run screen makes no request (dash:ui/navigation/DashNavigation.kt:374-376;
dash:docs/upgrade-0.9.1/README.md:64-67).

**Why.** Compose 1.9+ votes a frame rate per invalidation on Android 15+. Without a stated
preference "the platform may settle non-touch animation at 60 Hz once the finger lifts, so a page
transition can run at half the rate of the scroll that preceded it" (dash:docs/upgrade-0.9.1
cause 8). The opposite bug: Flick's TV kept a film's 24 Hz hint for the life of the process,
because the release sat behind `if (fps > 0f)`. It measured 0.00 % janky frames; the deadline
was 41.67 ms. After the fix: 60 Hz, 15 ms frames (flick@c4873de).

**How.**
```kotlin
// starter ui/nav/AppNavHost.kt:161, from dash:DashNavigation.kt:374-377
Box(Modifier.fillMaxSize().preferredFrameRate(FrameRateCategory.High)) { /* pages */ }
```
It propagates to every layer under it; Dash makes no window-level request. For a state-derived
hint (video cadence) use Flick's
`preferredWindowRefreshRate(presentingVideo, contentFrameRate)`, which returns `0f` ("the
system chooses") whenever nothing presents. Apply it in a `LaunchedEffect` keyed on the rate and
release it in `DisposableEffect(window) { onDispose { … } }` (`tv.md` §12;
`examples/flick/receiver/RefreshRatePolicy.kt`, `RefreshRateHelper.kt`).

**Check it.** `measure-frames.sh` prints the display rates seen; 60 Hz on a 120 Hz tour is a
frame-rate bug, not a jank bug.

## 11. Warm bundled fonts off the main thread before `setContent`

**Rule.** Call `startFontWarmup(applicationContext)` before `setContent`. It runs
`ResourcesCompat.getFont` for every id in `BundledFaces` on a daemon thread.

**Why.** `Font(R.font.x)` is `FontLoadingStrategy.Blocking`, which is right (no fallback flash,
no reflow), but each typeface is parsed in the first measure that needs it, on the main thread.
`ResourcesCompat.getFont` fills a process-wide typeface cache from any thread, and Compose
resolves resource fonts through that cache, so the later resolve is a hit
(`examples/flick/receiver/FontWarmup.kt`; flick:receiver/MainActivity.kt:46-53).

**`FontFamily.Resolver.preload()` is not a no-op for Blocking resource fonts.** In the
ui-text-android 1.11.4 and 1.12.0 bytecode (identical), `preload` first preloads Async fonts
through the adapter, then builds a `TypefaceRequest` for every font in the family and calls
`TypefaceRequestCache.preWarmCache`, which resolves each one synchronously. So it does load
Blocking faces, on whatever thread runs it. From a `LaunchedEffect` that is the main thread,
after the first composition: the cost moves earlier but stays on a frame. The off-thread warm
before `setContent` is still the recipe; the starter's `AppTheme` keeps `preload` only as a
harmless second pass (`templates/starter/.../ui/theme/AppTheme.kt:160-169`). Flick's receiver
KDoc (`FontWarmup.kt:17-23`) is wrong about the mechanism; its code is right. Dash uses only
`preload` (dash:ui/Theme.kt:167-181), which works, but on the main thread. Verified by bytecode,
not by a trace. Choosing and bundling fonts: `theme-and-type.md` §9.

## 12. The measuring toolkit, as a procedure

Use the tools in this order; each answers a different question.

**12.1 How bad? `scripts/measure-frames.sh <label> [tab ...]`.** Force-stops and launches the
app and refuses to tap unless it is the resumed activity. Finds controls in the accessibility
tree, runs `gfxinfo reset`, then three rounds of a fixed tour (scroll, each tab, open the first
`item_*`, back) with 350 ms swipes. Prints janky %, percentiles, slow UI / bitmap / issue-draw
counts and the refresh rates seen, into `.tools/perf/<label>.{gfx,modes,classified}`. Compare
janky % and p99, not p50: Dash's 9 ms p50 at 120 Hz is frame duration, not a drop.

**12.2 Which thread? `scripts/frame-classify.py <dump> [--hz 60]`.** Reads the `framestats`
rows, skips flagged frames (`Flags & 0b1101`), and calls a frame janky when
`GpuCompleted >= FrameDeadline`. Each janky frame goes in the first bucket it fits:

| Bucket | Test (interval = frame interval, 120 Hz default) | Look at |
|---|---|---|
| Late start (pacing) | `Vsync − IntendedVsync > 25 %` of interval, UI < 50 %, RT < 75 % | Frame-rate votes, input, the scheduler (§10) |
| UI thread | UI time ≥ RenderThread + GPU | Composition, layout, main-thread work (§4, §7, §8) |
| GPU | GPU time > RenderThread time | Fill: offscreen buffers, blur, big bitmaps (§5, §9) |
| RenderThread | everything else | Display-list size, texture uploads (§9) |

`framestats` keeps only the last ~120 frames, so dump right after the gesture. This is what
showed Dash's card flight was RenderThread, not composition (dash@c4ab031).

**12.3 What exactly? `scripts/trace-phone.sh <label>`.** 15 s of Perfetto (`scripts/trace.pbtxt`:
sched and CPU-frequency ftrace, atrace `gfx view input sched freq idle binder_driver ss dalvik`,
the SurfaceFlinger frame timeline, GPU memory, `track_event`). It broadcasts
`androidx.tracing.perfetto.action.ENABLE_TRACING` first, so composables appear by name in a
build made with `-PappTracing=true` (`runtime-tracing` + `tracing-perfetto(-binary)` 1.0.0). The
manifest's `<profileable android:shell="true"/>` lets a release build be traced, and the
`benchmarkRelease` variant needs it for `FrameTimingMetric` (§12.5), so keep it in the main
manifest. What to strip for Play is the `appTracing` libraries, `tracing-perfetto-binary` above
all (`android-design-corrections.md` §17). If `profileable` must go too, remove it in a
release-only manifest overlay so the benchmark variants keep it. The 60–70 ms pet
decode was found this way.

**12.4 Does it look right? `scripts/record-transition.sh <name> [step ...]`.** Records at half
the panel size and 12 Mbps, then tiles stills 40 ms apart (`fps=25`, 240 px wide), eight to a
row, into `.tools/transitions/<name>.png`. Steps: `tap:<label>`, `back` (edge swipe),
`key-back`, `wait:<sec>`. "A 300–440 ms transition is six to eleven frames, so one that is over in
two has been cut short." Every transition bug Dash fixed after the script existed was found on such a sheet
(dash:scripts/record-transition.sh:4-6). Each `tap:` step spends about 2 s on `uiautomator dump`
before its tap lands, so the default window is computed from the steps (see the script).

**12.5 Guard it. `StarterScrollBenchmark`.**
`./gradlew :baselineprofile:connectedBenchmarkReleaseAndroidTest` runs `FrameTimingMetric` for
10 iterations under `CompilationMode.Partial(BaselineProfileMode.Require)`: the app as a Play
user gets it, failing if there is no profile instead of quietly timing JIT code. Preconditions
fail loudly with `check()`, because a benchmark that measured an empty list is worse than none
(`examples/flick/baselineprofile/SenderLibraryScrollBenchmark.kt`). Read the P99 of
`frameOverrunMs`. It is a connected run that installs this app's `benchmarkRelease` APK and
removes it afterwards, the same data risk as the generator (§3): a spare device or this
project's AVD, never the personal phone without an in-app export. Unfiltered it also runs
`StarterBaselineProfileGenerator`, which lives in the same module; add
`-Pandroid.testInstrumentationRunnerArguments.androidx.benchmark.enabledRules=Macrobenchmark`
to skip it. Localising by switching halves off: android-design `motion-and-performance.md` §4.

## 13. Timing comes from the phone; the emulator is for looking

**Rule.** Judge frame timing only on a real phone. Use the emulator for frame-by-frame visual
checks.

**Why.** "Frame timing is not judged on the emulator, whose emulated GPU dominates every frame"
(dash@ea5137b). For looking it is ideal: Dash checked transitions at 5× and 10× animation scale
and scanned every frame (~1,700) for one-frame flashes. Drive only `APP_PHONE` or this
project's own AVD, never another project's emulator (`setup-and-tooling.md` §7–8).

**Three traps that fake a regression:**
- **`adb shell input keyevent KEYCODE_BACK` drops a 120 Hz panel to 60 Hz; a real touch does
  not.** It "had made the second half of every close look like a drop to 60" (dash@c4ab031).
  Back out with a swipe (`APP_BACK=gesture`, record-transition's `back`). That the injected
  edge swipe keeps 120 Hz is expected, not measured: the evidence is that "a tap-back also keeps
  the display at 120 Hz" (dash@c4ab031). Dash's published tour, the source of the §1 numbers,
  used `input keyevent 4` (dash:scripts/measure-frames.sh:49,51,55), so the starter's
  gesture-back tour is not the same tour as Dash's.
- **Display mode ids.** In `dumpsys display`, framework mode ids are one-based and the
  SurfaceFlinger ids in the same dump zero-based, "easy to misread as 80 Hz"
  (dash:docs/upgrade-0.9.1 "Measure"). `measure-frames.sh` prints each sample as Hz.
- **Another app in front.** The scripts check the resumed activity before every tap and stop.

## 14. Memory: three numbers over five cycles; the Java heap is not a signal

**Rule.** To prove a feature releases what it takes, sample Native Heap PSS, open FDs and
thread count at four points over five start/stop cycles. Judge the trend over cycles 2–5.

**Why.** ART keeps Java heap pages mapped for reuse: it "will NOT shrink back to the OS after a
cast, and that is not a leak". The three numbers that must fall and stay flat back the codecs,
sockets, thread pools and off-heap buffers (flick:docs/memory-audit.md §1, §4).

**How.** The `/proc` reads need `run-as`, so a debug build. Run the protocol on this project's
emulator or a spare device, never by putting a debug build over the user's release app. On a
release install, only the `dumpsys meminfo` line works:
```sh
PID=$(adb -s "$APP_PHONE" shell pidof <pkg> | tr -d '\r')
adb -s "$APP_PHONE" shell dumpsys meminfo <pkg> | grep -E 'Native Heap|Java Heap|TOTAL'
adb -s "$APP_PHONE" shell run-as <pkg> sh -c "ls -1 /proc/$PID/fd | wc -l"
adb -s "$APP_PHONE" shell run-as <pkg> sh -c "grep Threads /proc/$PID/status"
adb -s "$APP_PHONE" shell am send-trim-memory <pkg> RUNNING_CRITICAL   # then wait 10–30 s
```
- **Points:** BASELINE (idle, once), DURING (30–60 s in), POST-STOP, SETTLED (trim + wait).
- **Pass:** at SETTLED, FDs and threads within ±1–2 of baseline, Native Heap within ±10–15 %,
  flat over cycles 2–5 (cycle 1 may settle higher: JIT, pool high-water marks). A leak: FDs
  42 → 47 → 52 → 57 → 62. Healthy: 42 → 43 → 42 → 42 → 43. A process that exited is a pass.
- **Flick's proposed background threshold (not yet measured: every cell of its table is still
  pending):** trim work is owed if Native Heap is more than 15 %,
  Graphics more than 8 MB, or TOTAL PSS more than 64 MB above the backgrounded baseline.
- **Size buffers from `Runtime.maxMemory()`**, "the grant that happened, not the one the
  manifest asked for"; `largeHeap="true"` is ignored on low-RAM hardware (flick@336280a).

## 15. Realistic targets: beat your own before

**Rule.** The target is this app's own previous number, on the same device, tour and build
type. A change must move the number it was made for, written down with its before and after.

**Why.** The shipped apps settle at 1.5 % janky, p99 23 ms (Dash's tour) and 2.02–2.31 %, p99
10–15 ms (Flick's scroll). android-design's "0.21 %" is a best case, not a bar
(`android-design-corrections.md` §18); chasing it spends the work on the wrong frames. Some
frames stay for structural reasons: Dash's card flight still skips 2.0–2.3 frames per open, "the
first frames of each direction, where the arriving page is built and its textures uploaded"
(dash@c4ab031).

Good pairs name one number and one cause: slow issue-draw 39 → 25 after the page alpha became one
dim `drawRect` (dash@c9323c7). A commit that bundles changes gets one number for the bundle, and
says so: Dash's tab switch 0.94 → 0.32 skipped frames covers a new tab slide, reveal-once and an
off-thread decode together (dash@1940b64); Flick's GPU memory 49.89 → 3.45 MB covers dropped
layers and the rasterised QR code (flick@c4873de).
Record "tried and dropped" too: Dash's blur-off (no change) and route-as-picture (one frame
saved, a doubled line on the way back) (dash@c4ab031). Release notes: `delivery-process.md`.

---

## Symptom → cause → fix

| Symptom | Cause | Fix |
|---|---|---|
| Everything stutters; runs vary wildly | Debug build, or release not compiled | Release + `compile -m speed -f`; check `pkgFlags`, dexopt (§1–2) |
| Rough for minutes after install, then smooth | Sideload running interpreted / JIT | `install-phone.sh` compiles; ship a baseline profile (§2–3) |
| Baseline profile "does nothing" | `release/` in `.gitignore` hid `src/release/`: zero app rules | `!**/src/release/` rules; `grep -c '<your/package>/'` > 0 (§3) |
| Zero app rules in a new app; `Partial(Require)` benchmark fails | No profile generated yet: the starter ships none | `:app:generateReleaseBaselineProfile` on a spare device, commit it (§3) |
| A rare flow is janky on a fresh install | The generator cannot reach it | Hand rules with `;->**(**)**` and `Kt$*` (§3) |
| UI-thread janky frames during an animation | A per-frame value read in composition | Reads into layer/draw lambdas (§4) |
| Slow issue-draw during page moves | Whole-page alpha: full-screen offscreen buffers | Slide opaque, dim with one `drawRect` (§4) |
| High GPU memory, many render targets | Default compositing on fades; layers kept after settling | `ModulateAlpha`; drop settled layers (§5) |
| A panel of bars opens slowly, then ~10 fps | A composable and animators per bar | One `drawBehind` over arrays, one driver (§6) |
| Tab switch janks before its first frame | Long page composed eagerly | Lazy list, keys, `contentType`, cache window (§7) |
| Transition hitches while a list or map loads | Main-thread render or decode during motion | Pause the queue by reason; settle heavy cards (§8) |
| RenderThread-bound frames in a flight | Oversized bitmaps; uploads on first draw | Box-sized, halving resample, `HARDWARE` + `prepareToDraw()` (§9) |
| Animations drop to 60 Hz after the finger lifts | Per-invalidation vote on Android 15+ | `preferredFrameRate(FrameRateCategory.High)` on the host (§10) |
| 0 % jank but everything looks choppy | A stale hint pins 24 Hz | Derive the hint from state, release on dispose (§10) |
| A scripted close "drops to 60" | `input keyevent BACK` drops the panel to 60 Hz | Back with a swipe (§13) |
| "The display ran at 80 Hz" | Zero-based SurfaceFlinger id read as a mode id | Read the mode's fps (§13) |
| Java heap stays high after a feature stops | ART keeps pages mapped | Not a leak; judge Native Heap, FDs, threads (§14) |
