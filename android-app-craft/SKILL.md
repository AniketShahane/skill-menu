---
name: android-app-craft
description: Build, polish, test and ship a native Android app in Kotlin + Jetpack Compose that feels premium — Material 3 Expressive, beautiful motion, a designed theme and type, and frames measured rather than guessed. Distilled from the user's apps Dash (running) and Flick (phone-to-TV casting). Use it for any Android app work, even if the user never says "Android" — starting a new app from a buildable starter (Gradle pins, JDK/SDK, emulators, installing on the user's phone without losing data); theme, color, fonts, icons; animations and transitions ("janky", "smooth", "120 Hz", "shared element", "card flies into the page", predictive back); glass bars, charts, sheets, empty/error states; data and state; Android TV focus; release builds, baseline profiles, frame measurement; tests and release notes. Use it at the end of an Android project to record lessons back into this skill. Pairs with android-design (taste); where they disagree, this wins. Not for iOS, web, Flutter, React Native, or Docker Compose.
---

# Android app craft

This skill grows with every app; read "This skill learns" first. It was first distilled
(Sep 2026) from Dash, a running app, and Flick, which casts phone videos to an Android TV.
Every rule here has a measured case or a shipped bug behind it.

## Core principle

An Android app feels premium when two things hold:

1. **It has a point of view.** A one-sentence thesis taken from the product's subject, carried
   by a small set of named tokens and spent on one or two hero moments.
2. **Every frame of its motion is on time** — on a release build, on the real phone.

Both are testable. Contrast, elevation and motion timing are arithmetic, so they are JVM
tests; layout fit at large font scales is a seconds-long component test. Frames are numbers
from a scripted tour. Several Dash fixes that *looked*
right were disproved by a frame strip, and its "stutter" was mostly the debug build. Build
the measurement before tuning, change one cause at a time, and judge by numbers and strips.

## Precedence

1. The user's own words. A stated direction wins.
2. The project's existing system: its `CLAUDE.md`, `ui/theme/`, motion rules object, scripts
   and `docs/`. Find them first:
   `rg -l --type kotlin 'MaterialExpressiveTheme|CompositionLocal|NavMotion|SharedTransitionLayout'`,
   `ls scripts docs`, `cat CLAUDE.md`.
3. This skill's defaults, stated as choices, with the reason.
4. `android-design` for taste (deriving a direction, the hero budget, the genericness test).
   Where it disagrees with this skill, this skill wins: `references/android-design-corrections.md`.

A signature transition is product, not polish. Never swap one for a platform default to make
a metric, a refactor or a test easier without asking.

## This skill learns: the loop

- **At the start of an Android project,** read `lessons-log.md` (open items first) and
  `CHANGELOG.md`. They hold what the last app taught that the references don't cover yet.
- **During the project,** when something costs more than ~20 minutes, contradicts intuition,
  or a measurement disagrees with what you expected, append a raw entry to `lessons-log.md`
  straight away: date, app, symptom, cause, fix, evidence.
- **At the end of the project (or a big milestone),** run the retro below. It is part of done.

### Retro protocol

1. **Collect.** Every raw log entry, plus a scan of the session for errors, reverts, failed
   tests and changed numbers. A subagent can grep the transcript JSONL.
2. **Generalise.** Rewrite each entry as a rule for *any* app, with one line of evidence.
   Drop app trivia.
3. **Place.** Put each rule in the reference it belongs to (Map below), not in SKILL.md.
   Promote to "Rules that cost the most" only if it cost hours or recurred across apps;
   demote one if the list passes ~15. Mark the log entry `→ promoted to <file>`.
4. **Correct.** When a rule proved wrong, fix it in place and log `corrected <date>: <why>`.
   Delete rather than accumulate contradictions. Disagreements with android-design go in
   `references/android-design-corrections.md`.
5. **Templates.** Fold reusable code back into `templates/starter/`, generic and proven:
   `bash -n` every script, then scaffold and build it (commands under Workflow step 0) —
   the starter must stay green.
6. **Examples.** If a shipped file got better, re-copy it into `examples/` and update the
   commit table in `examples/README.md`.
7. **Evals.** Add a case to `evals/evals.json` for each new failure mode.
8. **Version.** Add a `CHANGELOG.md` entry. Keep SKILL.md under ~250 lines.

## Workflow for a new app

**0. Scaffold and set up** (`references/setup-and-tooling.md`)
```sh
~/.claude/skills/android-app-craft/templates/new-app.sh ~/Workspace/<dir> <AppName> <com.you.app>
cd ~/Workspace/<dir> && git init
source scripts/android-env.sh && ./gradlew :app:assembleDebug :app:testDebugUnitTest   # online the first time
```
- Keep `source … && ./gradlew …` on one line: an agent's shell forgets `JAVA_HOME` between
  calls, and the system default JDK is too new (JDK 21 runs Gradle). `new-app.sh` writes
  `local.properties` with `sdk.dir` when it finds an SDK.
- Sourcing the env script probes attached phones read-only; set `APP_ENV_SKIP_PHONE=1` when
  you only need the emulator.
- One AVD per project (`scripts/start-emulator.sh`); the scripts refuse any other AVD.
- Fill in the scaffold's `CLAUDE.md` (what it is, thesis, hero moments) and `README.md`. It
  already carries the build line, one Gradle runner, strings in `strings.xml`, the
  orchestration pattern, and a pointer back to this skill's `lessons-log.md`.

**1. Direction before tokens** (`references/design-direction.md`)
- One-sentence thesis from the subject; one or two hero moments; the counterfactual test.
- Brief → a Claude Design system → `docs/design/design-tokens.md` → spec → code. You fill
  `docs/design/brief.md`; the user pastes it into Claude Design (or you use a Design artifact
  type if the host lists one) and the page is saved under `docs/design/`. If the user skips
  it, derive the tokens straight into `design-tokens.md` and record "visual source: none".

**2. Tokens** (`references/theme-and-type.md`)
- Replace the starter's placeholder palette, faces and corners. The palette is a job-named
  CompositionLocal projected into a `ColorScheme` inside `MaterialExpressiveTheme`.
- Dark is its own designed set. `PaletteContrastTest` and `ThemePlateTest` stay green.

**3. Data and contracts before fan-out** (`references/data-and-state.md`,
`references/delivery-process.md`)
- Where data lives: one repository per aggregate, a synchronous cache plus a suspending load,
  atomic writes with a format version and an upgrade test; nothing lost across `install -r`.
- `docs/CONTRACT.md`: data types, seams, which agent owns which package or module.
- Motion and navigation decisions live in a pure, JVM-tested rules object (`NavMotion`).
  Adding a tab or a page follows the checklist in `navigation-and-shared-elements.md`.

**4. Screens** (`references/components.md`; TV: `references/tv.md`)
- Floating glass bar over content; designed loading, empty and error states; each number
  said once; text that fits at font scale 2; insets per page.

**5. Motion** (`references/motion-system.md`, `references/navigation-and-shared-elements.md`)
- Named curves and springs, entrance once per page, draw-phase count-ups and draw-ins, one
  motion per navigation, then the hero transition.

**6. Measure** (`references/performance.md`)
- Release + AOT on the phone, a fixed tour, janky frames classified by cause, transitions
  checked frame by frame from a contact sheet.

**7. Test** (`references/testing.md`)
- JVM rule tests; component tests with density override; frozen-clock motion tests; emulator
  flows that snapshot and restore the user's data.

**8. Ship**
- Install on the phone without losing data (`scripts/install-phone.sh`).
- A `docs/upgrade-x.y/` folder: README, light and dark screens, `validation.json`, with
  "not done" written down.
- Before any push: scan for secrets, serials, IPs and personal paths. Then run the retro.

## Rules that cost the most

Each has a reference with the full story and the evidence.

1. **Measure only on a release build compiled ahead of time.** Dash's debug build measured
   8.5 % janky frames, p99 133 ms; release + `compile -m speed` measured 1.5 %, p99 23 ms.
   Check that the baseline profile contains your package. (performance)
2. **Nothing that moves is read in composition.** Per-frame values go inside `graphicsLayer`,
   `drawBehind`, `drawWithCache`, `offset {}` or `layout {}`; pass `() -> T`; tint text with a
   `ColorProducer`. (performance, motion-system)
3. **Never fade a whole page with layer alpha.** Slide it in opaque and dim the covered page
   with one `drawRect`. Full-page alpha was Dash's top jank source. Card-sized fades use
   `CompositingStrategy.ModulateAlpha`; drop layers once settled.
   (navigation-and-shared-elements)
4. **One motion per navigation,** decided by a pure rules object with JVM invariants: the
   page travels or the tapped thing travels, never both; bounds finish inside their
   container. (navigation-and-shared-elements)
5. **Entrances play once per page identity,** in the page's first 600 ms, never on scroll-back,
   pop, rotation or while a tab slides in. (motion-system)
6. **Choose the curve by what the eye sees.** Decelerate `(0.05, 0.7, 0.1, 1)` for arrivals
   and entrances (count-ups, draw-ins), never for one shape turning into another on screen;
   emphasized `(0.2, 0, 0, 1)` for journeys the eye follows; springs when a finger or a
   retarget is involved; named tweens for choreography that must add up. (motion-system)
7. **Shared elements:** keys namespaced by the card page, with the detail taking its opener's
   scope, fixed from the first composition (a detail opened from two tabs must still match);
   named visibility thresholds; `scaleToBounds` over `RemeasureToBounds`; hold layout in
   flight; lift floating chrome into the overlay; a flying surface fades only at the page's
   end. One key on two surfaces at once crashed Marginalia. (navigation-and-shared-elements)
8. **Never animate a live measurement,** and show "—" rather than invent a value. Only saved
   statistics may count up. Both apps reached this independently. (design-direction)
9. **Bundle fonts, warm them off-thread, `tnum` on every changing number.** Flick's
   downloadable fonts never rendered once (an empty cert array); Geist's proportional digits
   made a countdown change width every second. (theme-and-type)
10. **Each theme is a designed palette, and contrast and elevation are JVM tests.** Flick's
    aliased dark theme shipped with elevation inverted (1.017:1) and nothing failed.
    (theme-and-type)
11. **Size bitmaps to their box and upload them off the frame.** Dash's map snapshots were
    14× oversized, 48–100 MB of GPU memory each. (performance)
12. **Control the frame rate:** ask for `High` on the nav host; derive any refresh-rate pin
    from state and release it on dispose. Flick's TV UI ran at 24 Hz for a whole process.
    (performance, tv)
13. **Judge motion from frame strips, and time it on the phone.** The emulator's GPU
    dominates its frames; `adb input keyevent` drops the panel to 60 Hz and fakes drops.
    (performance, testing)
14. **The user's phone is production.** Release signed with the debug key, `install -r`,
    never uninstall or clear data; tap only after checking your app is focused, at bounds read
    from the accessibility tree. (setup-and-tooling, testing)
15. **On TV: one focus owner, a painted detached ring, damping ≥ 0.85 on focus and ≥ 0.8 on
    panels, D-pad keys that reach Compose, chrome inside overscan with a ring reserve.** Each
    came from a shipped bug. (tv)

## Working with agents

The user's standing pattern (from Flick's `CLAUDE.md`): Opus medium-effort implementers
partitioned by module or package so they never edit the same files; an Opus xhigh adversarial
verifier; Opus medium fixers on confirmed findings only; Fable only after repeated failed Opus
rounds. **Exactly one agent runs Gradle** — concurrent builds clash. For a
consequential plan: think, have a subagent attack it against the files, show the user, then
build. Details: `references/delivery-process.md`.

## Honesty

- Say what the emulator can't show: real frame timing, 120 Hz, thermal, Bluetooth, GPS,
  audio routes. Use it for frame-by-frame visuals at 5× and 10× animation scale.
- Report per-run numbers for anything borderline, and failures with their output.
- Write "not run" and "not verified on hardware" into the release notes; never imply a pass.

## Map

| Path | What |
|---|---|
| `references/setup-and-tooling.md` | Toolchain sets and pins, fresh-shell env, build types, signing and secrets, emulators, installing on the phone, R8, Gradle DSL traps |
| `references/design-direction.md` | Thesis from the subject (Dash and Flick worked), hero budget, honest numbers, brief → design system → tokens → spec |
| `references/theme-and-type.md` | Three-layer theme, designed dark sets, dynamic color, appearance and cold-start plates, fonts, type scales, corners, spacing, icons, launcher icon, contrast tests |
| `references/data-and-state.md` | Repositories, caches and loads, storage choice, atomic writes and format upgrades, backup rules, dates and time zones, seed data |
| `references/motion-system.md` | Curves and springs, entrance once, count-ups and draw-ins, press, sheets, origins, loops, reduced motion, motion tests |
| `references/navigation-and-shared-elements.md` | NavMotion rules, the host, page slides and dims, predictive back, tab capsule, card→page flights, container transforms |
| `references/components.md` | Glass bar, cards, media cards, charts, pickers, sheets, pills, states, scaffolding and insets, text fit, haptics, copy voice |
| `references/tv.md` | Compose for TV: focus ring and beacon, D-pad ownership, overscan, ten-foot type, the 24 Hz fence |
| `references/performance.md` | Release + AOT, baseline profiles, draw-phase checklist, lists, bitmaps, frame rate, fonts, the measuring toolkit, memory |
| `references/testing.md` | The test pyramid, design-rule tests, frozen-clock motion tests, emulator flows, device driving, screenshots |
| `references/delivery-process.md` | Docs before code, contracts and lanes, orchestration, release notes and validation.json, repo hygiene, Play prep, the retro |
| `references/android-design-corrections.md` | Where the older android-design skill is wrong, with evidence |
| `templates/starter/` | A small buildable app: theme, motion, nav host, glass bar, screens, tests, baseline profile module, scripts, doc templates |
| `templates/new-app.sh` | Copies the starter and renames package, app name and AVD |
| `examples/` | Verbatim shipped files from Dash and Flick, with a where-to-look table and source commits |
| `lessons-log.md` | Dated raw lessons per app, promotion status, open items |
| `evals/evals.json` | Prompts this skill must handle well |
| `CHANGELOG.md` | Skill versions |
