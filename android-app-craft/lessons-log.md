# Lessons log

Raw, dated lessons, newest app first. Append an entry the moment something costs more than
~20 minutes, contradicts intuition, or a measurement disagrees with what you expected. Don't
wait for the end of the project; context gets summarised.

Format:

```
### <date> · <app> · <one-line symptom>
- Cause: …
- Fix: …
- Evidence: <file:line, commit, number, or error text>
- Status: raw | → promoted to <reference file> | corrected <date>: <why>
```

During a retro (see SKILL.md), every raw entry is either promoted into a reference and marked,
or deleted as app trivia.

---

## Open items (not yet verified — check these on the next app)

- **How much does off-thread font warm-up save on the first frame?** Bytecode settled *what*
  `FontFamily.Resolver.preload()` does (see the 2026-09-27 entry below); nobody has measured
  the first-frame saving of the daemon-thread warm on a device. Take a Perfetto trace of a cold
  start with and without it on the next app.
- **Predictive back progress on targetSdk 35 without `enableOnBackInvokedCallback`.** Dash
  targets 35 and its manifest does not declare the flag; the progress-driven shrink may never
  run on a real device. The starter targets 36 and sets the flag. Test the swipe on hardware.
- **Dash's light-mode cold start** has no `windowBackground` and no `values-night`, so it
  probably opens on the platform's dark plate. Read from the XML, not seen on a device.
- **Dash's `dashPress`** collects press state in composition (the pattern Flick measured as
  invalidating the whole control twice per touch). The starter uses Flick's off-composition
  press. Dash itself is unchanged.
- **Dash's `shimmer`** builds a new gradient every frame. The starter's placeholder builds it
  once and moves it. Dash itself is unchanged.

- **Not covered yet** (the skill has nothing to say; you are off the map): reminders and
  notifications (POST_NOTIFICATIONS on 33+, exact alarms vs WorkManager), home-screen widgets
  (Glance), a check-off toggle as a hero interaction, and in-app export/import of user data.
  Whatever the next app learns here becomes a new reference.
- **A shared title settles a few pixels after landing** in the starter's open-detail → back
  recording (seen once in a contact sheet, not investigated).

---

## Distillation, 2026-09-27

### 2026-09-27 · skill · two readings of `preload()` disagreed
- Cause: Flick's receiver KDoc says `FontFamily.Resolver.preload()` loads nothing for Blocking
  resource fonts; one distillation reader agreed, another disagreed.
- Fix: read the bytecode of `FontFamilyResolverImpl.preload` in ui-text-android 1.11.4 and
  1.12.0 (identical). It first preloads Async fonts through the adapter, then builds a
  `TypefaceRequest` for every font in the family and calls `TypefaceRequestCache.preWarmCache`,
  which resolves each one synchronously. So Blocking `Font(R.font.x)` faces ARE loaded — but on
  whatever thread runs the coroutine: from a `LaunchedEffect` that is the main thread, after the
  first composition. The daemon-thread `ResourcesCompat.getFont` warm before `setContent` is
  still the better recipe; `preload` is a harmless second pass.
- Evidence: `javap -c -p FontFamilyResolverImpl` (offsets 127 → 349, `preWarmCache`);
  Flick's `receiver/.../FontWarmup.kt:17-19` comment is wrong about the mechanism.
- Status: → promoted to performance.md, theme-and-type.md, android-design-corrections.md

### 2026-09-27 · skill · the starter's first emulator run failed before any test
- Cause: `lintDebug` (run by `scripts/test-emulator.sh`) failed on NonObservableLocale:
  `Locale.getDefault()` inside a composable does not update on a locale change. Then
  `TextFitTest` at font scale 2 caught an eyebrow and a row title clipped by
  `maxLines = 1` + ellipsis.
- Fix: `LocalLocale.current.platformLocale` in composables; eyebrow and row titles wrap
  instead of clipping. Also: the glass contrast test measured `glass` at its own alpha, but the
  bar draws only its RGB at 40 % coverage — a test must composite exactly what is drawn.
- Evidence: build integrator run on a scaffolded `Tides` app (78 JVM tests, 3 instrumented
  classes green after the fixes).
- Status: → promoted to testing.md, components.md, theme-and-type.md

### 2026-09-27 · skill · following the docs gave a broken app with green tests
- Cause: a fresh-eyes run found two traps — the bar's tab list and `Route.tabs` were two
  separate lists, and a Detail opened from a second tab built a different shared key, so its
  flight silently became a cut.
- Fix: one tab list; the shared-key scope comes from the opener, with a JVM test that both
  ends of every card flight build equal keys; a full add-a-tab / add-a-page checklist.
- Evidence: fresh-eyes review of the habit-tracker prompt, 2026-09-27.
- Status: → promoted to navigation-and-shared-elements.md

## Dash (running app), Sep 2026

### 2026-09-23 · Dash · long runs broke tiles at large text
- Cause: "3:52:10" collided with the pace; best chips crushed to a column of letters;
  "Activities" cut to "Activitie"; a marathon's splits filled three screens.
- Fix: `TextAutoSize.StepBased(10..22 sp)` with the unit measured first, `FlowRow`, tab labels
  that step down together, splits folded to the first 10 plus the fastest; a text-fit test at
  font scale 1 / 1.3 / 2.
- Evidence: dash@8098d01; `examples/sample/androidTest/LongTextLayoutTest.kt`.
- Status: → promoted to components.md, testing.md

### 2026-09-20 · Dash · fourteen numbers answering six questions
- Cause: tiles repeated the hero; a second opinion on a number reads as noise.
- Fix: Home keeps six readouts, each said in exactly one place; explanations behind (i).
- Evidence: dash@060f6c9.
- Status: → promoted to design-direction.md, components.md

### 2026-09-20 · Dash · a flying card covered the floating bar
- Cause: the shared-element overlay draws above everything, including floating chrome.
- Fix: lift the bar into the overlay at a higher z (8) while a card is in flight.
- Evidence: dash@29b6156.
- Status: → promoted to navigation-and-shared-elements.md

### 2026-09-18 · Dash · map snapshots 14× too big
- Cause: box size in px was multiplied by density a second time: 4,837×2,475 px, 48–100 MB of
  GPU memory per map.
- Fix: render at box size with a halving resample (dash@c4ab031); hardware bitmaps +
  `prepareToDraw()` off-thread (dash@3b9c234); a byte-sized 64 MB LRU with `onTrimMemory`
  (dash@1940b64).
- Evidence: those three commits; `examples/sample/ui/ThumbnailCache.kt`.
- Status: → promoted to performance.md

### 2026-09-18 · Dash · `adb input keyevent BACK` faked a frame drop
- Cause: a keyevent drops the display to 60 Hz; a real tap keeps 120 Hz. The second half of
  every close looked like a drop.
- Fix: judge closes from real touches or on-device traces.
- Evidence: dash@c4ab031.
- Status: → promoted to performance.md

### 2026-09-18 · Dash · entrances replayed on every scroll-back
- Cause: lazy lists compose items as they scroll in; every card re-counted and re-drew.
- Fix: `RevealMemory` + `RevealRule`: entrances only in a page's first 600 ms, once per
  identity. The same commit also slid tabs side by side, cached pages and decoded pet badges
  off-thread; together, tab switches went 0.94 skipped frames per switch → 0.32.
- Evidence: dash@1940b64; `examples/sample/ui/AppMotion.kt (`RevealMemory`, `RevealRule`, `AppReveal`)`.
- Status: → promoted to motion-system.md

### 2026-09-18 · Dash · Geist countdown changed width every second
- Cause: Geist's figures are proportional (Roboto's are tabular).
- Fix: `fontFeatureSettings = "tnum"` on every number-bearing role.
- Evidence: dash@1940b64; `examples/sample/ui/Theme.kt (`TabularNumberStyle`, `numericTextStyle`)`.
- Status: → promoted to theme-and-type.md

### 2026-09-18 · Dash · 60–70 ms decoding art on the Settings frame
- Cause: three 1,254 px pet badges decoded in the frame that opened Settings; separately, Home
  decoded the 1,254 px launcher original on every composition.
- Fix: badges decoded once, off the main thread at launch, with `inSampleSize`, and cached;
  Home got a 176 px copy of the mark.
- Evidence: dash@1940b64.
- Status: → promoted to performance.md

### 2026-09-15 · Dash · page cross-fades were the top jank source
- Cause: whole-page alpha < 1 renders each page into a full-screen offscreen buffer.
- Fix: slide the arriving page opaque; dim the covered page with one `drawRect`. Slow issue-draw
  39 → 25, p99 30 → 24 ms.
- Evidence: dash@c9323c7.
- Status: → promoted to navigation-and-shared-elements.md, android-design-corrections.md

### 2026-09-15 · Dash · a card→page morph "looked like a cut"
- Cause: emphasized-decelerate (0.05, 0.7, 0.1, 1) is 45 % done at 1/20 of its time; shared
  bounds of 420 ms ran inside a 320 ms pop; two things moved at once.
- Fix: emphasized (0.2, 0, 0, 1) for on-screen journeys; one motion per navigation; rules in a
  pure `NavMotion` with JVM invariants (bounds < container).
- Evidence: dash@42b59ff; `examples/sample/test/NavMotionTest.kt`.
- Status: → promoted to motion-system.md, navigation-and-shared-elements.md

### 2026-09-15 · Dash · the same run flew during a tab switch
- Cause: unnamespaced shared keys matched the same run on Home and Activities.
- Fix: keys namespaced by page pair, fixed from the page's first composition.
- Evidence: dash@42b59ff; `examples/sample/ui/NavMotion.kt (`NavMotion.pieceScope`, `NavMotion.pieceKey`)`.
- Status: → promoted to navigation-and-shared-elements.md

### 2026-09-14 · Dash · "the animations stutter" was the debug build
- Cause: debuggable, JIT, no R8: 8.5 % janky, p99 133 ms on the phone.
- Fix: R8 release signed with the debug key, `install -r`, `cmd package compile -m speed -f`.
  2.4 % first pass, 1.5 % / p99 23 ms after the other fixes.
- Evidence: dash@3b9c234; dash `docs/upgrade-0.9.1/README.md`.
- Status: → promoted to performance.md, setup-and-tooling.md

## Flick (phone → TV casting), Jul–Sep 2026

### 2026-08-01 · Flick · a glass fill hid the blur
- Cause: an opaque-ish fill painted on top of the blurred backdrop.
- Fix: transparent fill on blur-backed surfaces (flick@e079608); later one tint function whose
  no-blur fallback is the same composite, and stacked glass graded 0.60 vs 0.74 visibility
  (flick@0fa09f1, 2026-09-13).
- Evidence: those two commits.
- Status: → promoted to components.md, android-design-corrections.md

### 2026-08-12 · Flick · a test failed on an apostrophe
- Cause: the assertion used U+2019; the strings use ASCII `\'`.
- Fix: one convention per app, matched in tests.
- Evidence: flick@47cf4b6.
- Status: → promoted to testing.md

### 2026-08-07 · Flick · body copy said too much
- Cause: explainers restated titles; errors apologised.
- Fix: 59 strings reworded, 1,279 → 961 words; an error states the problem and the fix.
- Evidence: flick@680c9e4.
- Status: → promoted to components.md (copy voice)

### 2026-08-05 · Flick · a sheet's scrim swallowed the first tap after dismissal
- Cause: a disabled `clickable` still consumes (b/239789641).
- Fix: remove the pointer node from the chain while leaving.
- Evidence: flick@7fa4ce2.
- Status: → promoted to components.md

### 2026-07-30 · Flick · baseline profiles held zero app classes
- Cause: a `release/` line in `.gitignore` swallowed `src/release/generated/`.
- Fix: un-ignore `!**/src/release/**`; always `grep -c '<your/package>/'` the profile.
- Evidence: flick@50a7a9a.
- Status: → promoted to performance.md

### 2026-07-30 · Flick · a shared element lingered ~750 ms after it looked done
- Cause: a spring with the default visibility threshold on a window-sized `Rect`.
- Fix: name `Rect.VisibilityThreshold`; return on stiffness 800; name a clip for the overlay.
- Evidence: flick@a0ebf75, flick@cc10d02.
- Status: → promoted to navigation-and-shared-elements.md

### 2026-07-29 · Flick · dark theme elevation ran backwards
- Cause: dark was an alias of another palette; "raised" measured darker than the page
  (1.017:1) and no test failed.
- Fix: a designed dark set; `FlickColorsTest` asserts direction and size of every step.
- Evidence: flick@b2a3a8f.
- Status: → promoted to theme-and-type.md

### 2026-07-28 · Flick · the TV UI ran at 24 Hz for the whole process
- Cause: a `preferredRefreshRate` hint set for a film was never released.
- Fix: derive the hint from state; re-apply 0 on dispose. 24 Hz → 60 Hz, 15 ms frames.
- Evidence: flick@c4873de; `examples/flick/receiver/RefreshRatePolicy.kt`.
- Status: → promoted to performance.md, tv.md

### 2026-07-28 · Flick · the D-pad could not move horizontally
- Cause: left/right consumed at Activity level as seeks; a side panel nested inside the bar's
  `AnimatedVisibility`; `requestFocus` before placement threw.
- Fix: narrow key ownership; sibling panels; `landTvFocus` retrying for 4 frames.
- Evidence: flick@7f87444.
- Status: → promoted to tv.md

### 2026-07-28 · Flick · a 40-bar histogram ran at ~10 fps
- Cause: 40 composables × 2 Animatables ≈ 1,200 objects for forty rects; 427 ms first frame.
- Fix: one `drawBehind` over float arrays with one driver.
- Evidence: flick@6c20a4b.
- Status: → promoted to performance.md

### 2026-07-28 · Flick · library scroll jank was UI-thread, and debug
- Cause: animated values read in composition; no R8, no profile.
- Fix: values into `graphicsLayer`/`offset`/`drawBehind`; release + baseline profile. Debug
  3.81–7.42 % janky → release 2.02–2.31 %.
- Evidence: flick@c0ac2ed.
- Status: → promoted to performance.md

### 2026-07-25 · Flick · the theme's fonts had never rendered
- Cause: the downloadable-font provider's `font_certs.xml` shipped an empty certificate array;
  every face fell back to the platform default.
- Fix: bundle static TTFs in `res/font`; ship the OFL licences.
- Evidence: flick@40791d0.
- Status: → promoted to theme-and-type.md
