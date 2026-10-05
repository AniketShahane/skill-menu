# Changelog

Each entry says which app a change came from, what changed and why. Commit the skill folder
after every entry, when it is under git.

## 1.1.0 · 2026-09-27 · fresh-eyes review (no new app; proven on a generated "Sample")

- **New-app path.** `templates/starter/` plus `templates/scripts/new-app.sh NAME DEST`: App,
  model, navigator, RootView layer slots, kept tabs, a floating bar, assets (icon, colour roles,
  launch background), a Core package, smoke and motion tests, and seed data. Proven: a
  generated app built with 0 warnings (Swift 5 and 6), passed SmokeTests 3/3, and passed a
  3-run motion check with 0 ms/s hitch and 0 pops on every card moment.
- **Generic card flight.** `templates/app/CardFlight/`: the card-pieces engine with no app
  dependencies. It keeps every rule in shared-element-flights, and its timings are the
  Android-derived defaults, labelled as such. Frame diffs caught one landing pop (a page button
  under the flying hero), which is now fixed. `examples/card-pieces/README.md` now says it
  doesn't compile alone, what it depends on, and how it clashes with the templates.
- **SKILL.md.**
  - "Start here": a reading list for each kind of job, and when to fan out to agents.
  - A transition-choice table: native zoom, GrowMorph, card pieces, `matchedGeometryEffect`,
    sheets.
  - Frame-diff gates for a new app with no reference.
  - The folder is now a git repo.
- **premium-feel.md** (new): type, colour, spacing, SF Symbols, haptics, Liquid Glass (iOS
  26/27 APIs checked against the Xcode 27 SDK), states, accessibility, icon and launch, a
  premium review checklist, and where Dash's tokens are.
- **Tools.**
  - `frame_strip.py`: strips, grids, single frames and pixel diffs, picked by pts.
  - `test_motion_report.py`: 30 tests, each proven to catch its bug.
  - `motion_report.py` no longer loses a moment when a name repeats three times.
  - `motion-check.sh` points to frame_strip when a moment fails.
- **Templates.**
  - `MotionTestCase` inherits `AppUITestCase`, so the journey launches with the same seed
    and clock.
  - New helpers: `waitUnreachable`/`waitForHittable`, which check reach, not existence;
    `tapMoment(gone:)` now uses reach.
  - Every wait checks once straight away, which saves ~1 s per wait on Xcode 27.
  - Also added: `waitUntil`, `waitStill` and `relaunchKeepingData`.
  - Fling moments get a 3.0 s window and a 3000 budget. Before, a budget longer than its
    window could never fail.
  - `FrameProbe` no longer uses `UIScreen.main`, which is deprecated in iOS 26.
- **evals**: 9 prompts. New: a recipe app with a card flight and no reference; a single photo
  zoom (the cheap row); "make it premium".
- **Open** (see lessons-log):
  - The report's re-timing can misplace frames in dense recorder bursts.
  - A forced in-app appearance flashes at launch.
  - The two analyser fixes still need backporting to Dash.

## 1.0.1 · 2026-09-27 · consistency pass (no new app)

- **SKILL.md**: pairs with `android-app-craft` for the Android side; the port order matches
  `porting-from-android.md` (spec and core in parallel); rule 1 points at `motion-craft.md` §6,
  rule 10 also at §9; the map lists every motion-craft section; the folder is not a git repo.
- **Numbers reconciled with Dash's repo:** 9 area merges (git log); the first-open budget
  example is `run_open`'s 140 ms; the 35 h hang is "the full UI run" (141 was the mis-sum);
  the two-dot diff's 36 files are `app/` alone; `fade(0.2)`'s first-frame share is computed
  (23% at 16.7 ms, 42% at 33 ms).
- **Contradictions removed:** kept pages and XCUITest's tree (`KeptTabPager.swift` now matches
  `swiftui-gotchas.md` §3 and Dash's `plan-diag.xcresult`); opacity-0 touch stealing is
  unverified in one place, not asserted then doubted; the shipped two-still-frame page build
  vs the split that made opens worse.
- **Duplication:** `motion-craft.md` §10 and the stale-build trap are now pointers.
- **ui-testing.md** §1: `AppUITestCase` now sets the process `TZ` as well as `APP_TZ`.
- **lessons-log.md**: every promoted entry names its file.

## 1.0.0 · 2026-09-27 · from Dash (Android → SwiftUI running app)

First version, distilled from the Dash iOS port (24–27 Sep 2026):
- the port itself;
- the "120 fps, no snaps, guardrails" pass;
- the Android-parity card-pieces transition.

What's in it:
- **SKILL.md**: the principle, precedence, the learning loop and retro, the workflow, the
  costly rules, and a map.
- **references/**: setup-and-tooling, architecture, motion-craft, shared-element-flights,
  measuring-motion, swiftui-gotchas, ui-testing, porting-from-android, delivery-process.
- **templates/**: FrameProbe, MotionKit, KeptTabPager, GrowMorph, FadeDialog, LaunchHooks,
  AppUITestCase, MotionTestCase, run-ui-tests.sh, motion-check.sh, motion_report.py (with two
  fixes over Dash's copy and `in_journey`), motion-budgets.json, project.yml, and the xcconfig
  pattern.
- **examples/card-pieces/**: a flight engine plus its card and page ends (in this public
  copy, a generic rewrite of Dash's).
- **lessons-log.md**: the Dash entries, with their promotion status and the open items.
- **evals/evals.json**: 6 prompts, covering a new app, jank, a signature transition, test
  reach, a port, and the retro.
