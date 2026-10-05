---
name: ios-app-craft
description: Build, port, polish, test and ship a native SwiftUI iOS app that feels premium. Use it for any iOS/SwiftUI app work, whether or not the user says "iOS". Covers starting a new app or porting one from Android/Compose, and project setup (XcodeGen, Xcode toolchain, simulators). Covers app architecture and navigation, and animations and transitions ("janky", "snappy", "smooth", "120 fps", "hero/shared-element", "card flies into the page"). Covers measuring smoothness with budgets that fail on regressions, and end-to-end XCUITest testing. Has a new-app starter (new-app.sh) with a built-in card-flight transition, and a premium-look checklist. Also covers showing the app in the simulator, and pushing. Use it too at the end of an iOS project, to record what was learned back into this skill. Not for Android-only or web work, and not for UIKit-only legacy maintenance with no SwiftUI.
---

# iOS app craft

This skill grows with every app; read "This skill learns" first. It was first distilled from
Dash (a SwiftUI running app ported from Android, Sep 2026), so every rule has a measured case
behind it.

It pairs with the `android-app-craft` skill (`~/.claude/skills/android-app-craft`) for the
Android side of the same apps. Porting from Android, read its `references/motion-system.md`
and `references/navigation-and-shared-elements.md`: they describe the source mechanics.

## Core principle

An iOS app feels premium when two things hold:
1. Every change on screen is a motion that starts from where things are. Nothing appears
   from nowhere or snaps into place.
2. Every frame of that motion is on time.

Both are measurable, so measure them. On the simulator your eyes can't tell a 33 ms frame
from a 16 ms one, and several Dash fixes that *looked* right were disproved by a frame strip.
Build the measurement before tuning, change one cause at a time, and judge by numbers and
strips.

## Precedence

1. The user's own words. A stated direction wins, including "keep the Android animation".
2. The project's existing system: its tokens, navigator, test hooks, scripts and
   `CLAUDE.md`. Find them first (`rg -l 'Observable|NavigationStack|timingCurve'`,
   `ls */scripts`, the README).
3. This skill's defaults, stated as choices, with the reason.

A signature transition is product, not polish. Never swap one for a platform default (such as
the native zoom) to make a metric, a refactor or a test easier without asking. Dash's user
called the missing card flight "absolutely beautiful… super important".

## Start here: pick your path

Read `lessons-log.md` first in every case. Then:

| The job | Do first | Read |
|---|---|---|
| **New app, no reference** | `templates/scripts/new-app.sh Name ~/Workspace/name`: a building starter with the measuring rig, kept tabs, a floating bar and a card flight | architecture, premium-feel, motion-craft §1–5, then the workflow below |
| **Port from Android** | Survey the source; spec and core in parallel | porting-from-android, delivery-process, the `android-app-craft` skill |
| **"It's janky / snaps / pops"** | Wire FrameProbe + MotionTestCase and run `motion-check.sh` before touching code | measuring-motion, motion-craft, swiftui-gotchas |
| **A signature transition** | Pick it from the table below; ask if the words are unclear | shared-element-flights, `templates/app/CardFlight/` |
| **UI tests fail or flake** | Read the failure's screenshot and hierarchy first | ui-testing |
| **Looks plain, not premium** | Run the premium review checklist | premium-feel |
| **End of a project** | The retro below | lessons-log, CHANGELOG |

**Work solo** on a small app or a fix. **Fan out to parallel agents** only when there are three
or more independent areas *and* the contracts commit has landed (delivery-process §2). Below
that, the briefs and merges cost more than they save.

### Choosing a transition

| The user says, or the design shows | Use | Cost |
|---|---|---|
| A card or thumbnail grows into its page; one surface | Native zoom: `.matchedTransitionSource` + `.navigationTransition(.zoom)` | An hour. System back swipe for free. Scope source ids to the shown page (motion-craft §4) |
| A button (a +, a FAB) grows into a full page | `templates/app/GrowMorph.swift` | Half a day. One shape morphs; content fades in after |
| "The elements flow / fly onto the page", "like our Android shared elements"; several parts land in different places | Card pieces: `templates/app/CardFlight/` | 1–3 days. You own the layer, back, accessibility and the tests' reach (shared-element-flights) |
| A small element moves inside one container (a tab capsule, a chip) | `matchedGeometryEffect` | Minutes. Never across navigation |
| A sheet or dialog | System sheet, or `templates/app/FadeDialog.swift` for a custom one | An hour |

If the words fit two rows, ask, and show the cost. Never pick the cheaper row for a signature
moment without asking (Precedence).

## This skill learns: the loop

- **At the start of an iOS project,** read `lessons-log.md` (newest first) and `CHANGELOG.md`.
  They hold what the last app taught that the references don't cover yet.
- **During the project,** when something costs more than ~20 minutes, contradicts intuition,
  or a measurement disagrees with what you expected, append a raw entry to `lessons-log.md`
  straight away: date, app, symptom, cause, fix, evidence. Don't trust memory to the end;
  context gets summarised.
- **At the end of the project (or a big milestone),** run the retro below. It is part of
  "done".

### Retro protocol

1. **Collect.** Gather every raw entry, plus a scan of the session for errors, reverted
   attempts, failed tests and changed budgets. A subagent can grep the transcript JSONL.
2. **Generalise.** Rewrite each entry as a rule for *any* app. Keep one line of evidence
   (the file, error text or number). Drop app trivia.
3. **Place.** Put each rule in the reference it belongs to (map below), not in SKILL.md.
   Promote a rule to "Rules that cost the most" only if it cost hours or recurred across
   apps, and demote one there if the list passes about 15. Mark the log entry `→ promoted to
   <file>`.
4. **Correct.** When a rule proved wrong or incomplete, fix it in place and log `corrected
   <date>: <why>`. Delete rather than accumulate contradictions.
5. **Templates.** Fold reusable code improvements back into `templates/`. Keep them generic
   and checked: `bash -n`, `python3 -m py_compile`, `python3 templates/scripts/test_motion_report.py`,
   Swift typechecks in Swift 5 and 6, and `new-app.sh` into a scratch folder must still build.
6. **Evals.** For each new failure mode, add a case to `evals/evals.json` that would have
   caught it.
7. **Version.** Add an entry to `CHANGELOG.md` and commit this folder (a git repo since
   1.1.0; `git -C ~/.claude/skills/ios-app-craft log` is the skill's history). Keep SKILL.md
   under ~250 lines; depth belongs in `references/`.

## Workflow for a new app or a port

**0. Setup** (`references/setup-and-tooling.md`, `templates/project.yml`)
- New app: `templates/scripts/new-app.sh` does all of this step and builds a smoke test.
- Set `DEVELOPER_DIR` (xcode-select often points at the Command Line Tools).
- Generate the project with XcodeGen and gitignore the `.xcodeproj`.
- Create a private simulator per workstream and target it by `id=<UDID>`.
- Keep secrets in a gitignored xcconfig.
- Set `CADisableMinimumFrameDurationOnPhone`, or iPhone caps your motion at 60 Hz.

**1. Architecture and contracts** (`references/architecture.md`)
- Pure logic goes in a Foundation-only Swift package, tested on macOS with `swift test`.
- One `@MainActor @Observable` app model, services behind protocols with fakes, your own
  navigator, and kept-alive tab pages.
- Test hooks read from launch arguments and environment variables: reset, seed, pinned
  clock, reduced motion, fakes, deep links.
- Land these contracts before fanning out to parallel agents (`references/delivery-process.md`).

**2. Screens.** Porting? Follow `references/porting-from-android.md`: a read-only spec (exact
tokens, slow-motion captures) and the core in parallel, then the contracts commit, then the
screens in parallel worktrees.
- Build looks from shared view builders.
- Tag views with accessibility identifiers taken from the source app's test tags.
- Wrap each container in `.accessibilityElement(children: .contain)`, or its id hides its
  children's.

**3. Motion.** Measure first (`references/measuring-motion.md` and the kit in `templates/`),
then work through `references/motion-craft.md`. Build signature transitions with
`references/shared-element-flights.md`: start from `templates/app/CardFlight/`; a fuller
engine (two card forms, a map hero) is in `examples/card-pieces/` for depth.
- New app, no reference to match: gate each transition with two diffs
  (`templates/scripts/frame_strip.py diff`). The flight's first frame equals the screen before
  the tap, and its landing frame equals the settled page.

**4. Testing** (`references/ui-testing.md`, `templates/uitests/`)
- A base test class exists from day one, with deterministic launch.
- Journeys cross every screen, with a screenshot tour in light and dark.
- Run through `templates/scripts/run-ui-tests.sh`: permissions, a simulated route, and a
  10-minute per-test cap.
- Also run the motion journey.

**5. Ship**
- Run the full suites, `motion-check.sh` (3 runs, median) and the unit tests.
- Show the user the app in the simulator with seeded data (`SIMCTL_CHILD_*` on
  `simctl launch`; Xcode 27's viewer is DeviceHub).
- Before any push, scan for secrets and private data. Then run the retro.

## Rules that cost the most

Each has a reference with the full story.

1. **Read observed state in `body`,** never first inside a `GeometryReader` or `ForEach`
   closure. Those reads aren't tracked, and the view freezes. (motion-craft §6)
2. **A view inserted in the same update as an animated change skips the animation.** Insert,
   let it draw (its `onAppear` calls back), then start the clock. (motion-craft §6)
3. **Only a modifier's `body(content:)` may run per frame.** Use `GeometryEffect` or an
   animatable `Shape`, and put no `if` around `content` inside a modifier. (motion-craft §5)
4. **Mount, then move.** Never build a heavy view on the frame it starts moving. Keep pages
   alive, and warm heavy page types while idle. (motion-craft §3–4)
5. **Hide at opacity 0.001, not 0,** from the build frame. Core Animation doesn't draw at 0,
   so the reveal frame rasterises everything. (motion-craft §7)
6. **Only the moving thing may depend on shared transition state.** Read the narrow key
   first and return early. (motion-craft §6)
7. **A shared-element flight is an overlay layer with looks built from the real views' code,
   laid out at their own size.** (shared-element-flights)
8. **With a custom layer you own what a push gave you:** accessibility hiding on each page
   and container, screen-change posts at still moments, escape, and back refusal.
   (shared-element-flights, swiftui-gotchas)
9. **The simulator recorder drops and bunches frames.** A status-bar beacon plus re-timing
   makes the video trustworthy, and the median of 3 runs keeps the result stable.
   (measuring-motion)
10. **XCUITest turns accessibility on.** Tree flips and screen-change posts then cost frames
    (so time them at still moments). XCUITest also reads *automation* elements that VoiceOver
    doesn't: check reach (hittability), not existence. (ui-testing, motion-craft §9)
11. **Budgets never loosen to pass.** Fix it, or write the trade into `moment_notes`. Update
    the baseline only on purpose, from a 3-run median. (measuring-motion)
12. **Deterministic tests:** pinned clock and timezone, seeded data in the source app's
    format, reduced motion, scripted fakes paced in seconds, and reveal a control clear of
    floating bars before tapping it. (ui-testing)
13. **Byte-compatible data:** port the source platform's serializer, not Codable, when files
    or sync must match. (porting-from-android)
14. **Parallel agents:** one worktree, simulator and DerivedData each; a shared brief; one
    owner per shared file; and a generated project, so the pbxproj never conflicts.
    (delivery-process)
15. **Show frames, not claims.** Before saying a transition is done, compare frame strips of
    its key moments with the reference, frame for frame (`templates/scripts/frame_strip.py`),
    and quote the numbers. (measuring-motion)

## Honesty

- The simulator runs at 60 Hz. Say what it can't show (120 Hz, render-server hitches,
  thermal), and point to Instruments → Animation Hitches on a device.
- Report per-run numbers for anything borderline, and failures with their output.
- "Unverified on hardware" lists belong in the README: BLE, background runs, network voice,
  music control.

## Map

| Path | What |
|---|---|
| `references/setup-and-tooling.md` | Xcode, XcodeGen, simulators, DeviceHub, simctl recipes, shell traps, build noise |
| `references/architecture.md` | App model, services, navigator, kept tabs, overlay layers, test hooks, layout |
| `references/motion-craft.md` | Tokens, arrivals, mount-then-move, kept pages, one clock, observation/identity/insertion, pre-draw, images, accessibility timing, custom-layer duties, budgets |
| `references/shared-element-flights.md` | The card-pieces transition: architecture, pieces, timings, looks, measuring, back gesture |
| `references/measuring-motion.md` | The rig, metrics, budgets and baseline, the diagnosis loop, traps |
| `references/swiftui-gotchas.md` | Symptom → cause → fix catalogue |
| `references/premium-feel.md` | Type, colour, spacing, SF Symbols, haptics, Liquid Glass, states, icon and launch; the premium review checklist |
| `references/ui-testing.md` | XCUITest contract, helpers, journeys, flakes, triage |
| `references/porting-from-android.md` | Spec extraction, core-first port, Compose → SwiftUI mapping, parity |
| `references/delivery-process.md` | Workstreams, worktrees, briefs, merges, verification, push, retro |
| `templates/starter/` + `templates/scripts/new-app.sh` | A new app that builds on day one: App, model, navigator, RootView layer slots, kept tabs, floating bar, assets, Core package, smoke and motion tests, seed data |
| `templates/app/CardFlight/` | The generic card-pieces engine, no app dependencies |
| `templates/` (the rest) | FrameProbe, MotionKit, KeptTabPager, GrowMorph, FadeDialog, LaunchHooks, UI-test bases, run-ui-tests.sh, motion-check.sh, motion_report.py (+ tests), frame_strip.py, budgets, project.yml, xcconfigs |
| `examples/card-pieces/` | A fuller flight engine with card and page ends (generic rewrite of a shipped one; does not compile alone) |
| `lessons-log.md` | Dated raw lessons per app, and their promotion status |
| `evals/evals.json` | Prompts this skill must handle well |
| `CHANGELOG.md` | Skill versions |
