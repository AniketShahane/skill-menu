# Lessons log

This is the raw, dated record of what each iOS app taught. It feeds the references (see the
retro protocol in `SKILL.md`). Newest app first. Add entries *during* a project, as they
happen.

Entry format:

```
- YYYY-MM-DD · <app> · <area> · <symptom> → <cause> → <fix>. Evidence: <file / error / number>. [status]
```

Under an app heading and an area subheading, an entry may drop `<app> · <area>`. Status is one
of: `new`, `→ promoted to <file>`, `corrected <date>: <why>`, `open` (unresolved), or
`unverified-on-device`.

---

## ios-app-craft starter + generic CardFlight · 27 Sep 2026

Built `templates/starter/`, `templates/app/CardFlight/` and `templates/scripts/new-app.sh`, and
proved them on a generated app ("Sample", scratch folder, iPhone 18 Pro / iOS 27 simulator).

- 2026-09-27 · flight · The back button appeared all at once at landing → it sat on the page over the hero, and the flying hero (above the page) covered it until the flight was removed → draw it in the hero's page-end look with the same after-piece timing. Evidence: a one-frame change of 0.9% of the hero region at the landing swap, gone after the fix; the report's pop detector (4% of the screen) missed it. [→ promoted to shared-element-flights.md "Looks"]
- 2026-09-27 · measurement · Dense strips (`frame_strip.py --n 85 --grid 85`) with per-frame diffs of just the pieces' region find landing steps that are below the pop threshold. Slice tiles at the strip's real pitch (tile + 2 px), or the diff drifts and shows a fake constant change. [new]
- 2026-09-27 · testing · An edge swipe right after a motion-on open did nothing → the page takes no touches until the pieces land (0.49 s), and `waitForHittable` returned mid-flight (XCUITest ignores `allowsHitTesting`) → wait ~1 s for the landing before going back. [new]
- 2026-09-27 · launch · Forced dark (APP_APPEARANCE=DARK) on a light-mode simulator gave 2 launch pops → the launch screen follows the system appearance, the app's forced one differs → a light→dark flash. An in-app appearance choice that differs from the system flashes the same way. [open]
- 2026-09-27 · tooling · XcodeGen puts any `.md` under the app's source folder into Copy Bundle Resources → keep READMEs outside it (new-app.sh puts CardFlight's at `docs/CardFlight.md`). [new]
- 2026-09-27 · layout · Home's status-bar and home-indicator bands showed the NavigationStack's white → the kept pager clips to the safe area → give the pager a paper background inside the stack and `.ignoresSafeArea(.container, edges: .bottom)`. [new]

## Dash (running app, Android → SwiftUI port) · 24–27 Sep 2026

Source: the author's Dash app (a private repo). The entries below stand on their own.

### Setup, process
- 2026-09-24 · xcodebuild/simctl failed ("requires Xcode… command line tools instance") → xcode-select pointed at CLT → `export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` everywhere, including agent briefs. [→ promoted to setup-and-tooling.md]
- 2026-09-24 · Targeting a simulator by name failed with a misleading platform error, and the existing simulators belonged to other sessions → private simulators per workstream, targeted by `id=`. [→ promoted to setup-and-tooling.md]
- 2026-09-24 · Seven parallel agents and nine merges gave zero pbxproj conflicts → XcodeGen, with the project gitignored. [→ promoted to delivery-process.md]
- 2026-09-24 · The key was missing after a merge → `git worktree add` doesn't copy gitignored `Secrets.xcconfig`. [→ promoted to setup-and-tooling.md]
- 2026-09-25 · A UI test hung for ~35 h → always `-test-timeouts-enabled YES -maximum-test-execution-time-allowance 600`. [→ promoted to ui-testing.md]
- 2026-09-26 · Xcode 27 has no Simulator.app; the viewer is DeviceHub. [→ promoted to setup-and-tooling.md]

### Motion (measured)
- 2026-09-26 · Custom motion was held at 60 Hz → `CADisableMinimumFrameDurationOnPhone` was missing. [→ promoted to motion-craft.md]
- 2026-09-26 · Tab slides hitched (Plan 195 ms) and scroll was lost → pages were rebuilt on every switch → kept-alive pager, plus mount-then-move. [→ promoted to motion-craft.md §3–4]
- 2026-09-26 · The + morph stuttered → an Animatable *View* rebuilt the Start page every frame → GeometryEffect + animatable clip Shape. [→ promoted to motion-craft.md §5]
- 2026-09-26 · Back looked like a cut (60 ms) → the zoom source id existed on a hidden kept tab → scope sources to the shown page. [→ promoted to motion-craft.md §4]
- 2026-09-26 · The dialog dim popped (40% in one frame) → a steep ease-out, plus the tap's heavy frame → spring from rest, started 30–60 ms later. [→ promoted to motion-craft.md §1, §3]
- 2026-09-27 · Card-pieces flight froze → the clock was read inside a ForEach/GeometryReader closure, so it wasn't observed. [→ promoted to motion-craft.md §6]
- 2026-09-27 · The flight intermittently didn't animate (2 of 3 runs) → it was inserted in the same update as the animated clock → start from the flight layer's onAppear callback. [→ promoted to motion-craft.md §6]
- 2026-09-27 · Titles cut off in flight ("Morning te…") → the measured frame included the press scale → report the own size apart from the frame. [→ promoted to shared-element-flights.md]
- 2026-09-27 · 40–50 ms landing frame → pieces hidden at 0 were rasterised on reveal → 0.001 from the build frame. Switching to 0.001 later didn't help (measured). [→ promoted to motion-craft.md §7]
- 2026-09-27 · 25–45 ms frames at a flight's start and end → every card depended on `flight` → check `flyingId` first. [→ promoted to motion-craft.md §6]
- 2026-09-27 · 33 ms mid-flight on a first open → the hero render arrived mid-flight → render and cache the newest runs' heroes during idle. [→ promoted to motion-craft.md §8]
- 2026-09-27 · Swipe back rebuilt the page and lost its scroll → an `if` around content in BackShrink. [→ promoted to motion-craft.md §5]
- 2026-09-27 · Frames lost at landing, at fold end and under a swipe → accessibility tree flips and `.screenChanged` posts under XCUITest → flip on the tap, and ~150 ms after a close settles. [→ promoted to motion-craft.md §9]
- 2026-09-27 · 36 ms frame while the bar was returning → page teardown → keep the invisible page mounted 0.3 s ("retiring"). [→ promoted to motion-craft.md §3]

### Measurement
- 2026-09-26 · "Pops" and "late content" were recorder artefacts → simctl recordVideo saves only changed frames and drops or bunches them under load → status-bar beacon, burst re-timing, unverified pops, tail rule, late-after-recorded-stillness. [→ promoted to measuring-motion.md]
- 2026-09-27 · A strip showed a "flash" that never happened → `ffmpeg -ss` input seek on VFR bursts → pick frames by pts from the decoded array. [→ promoted to measuring-motion.md]
- 2026-09-27 · A diag run silently used the previous binary → the build error was piped to /dev/null (a `RunClock` name clash with an existing type). [→ promoted to measuring-motion.md traps]
- 2026-09-27 · The template rewrite found two bugs in Dash's `motion_report.py`: (1) a freeze longer than the 400 ms window reported 0 ms response; (2) the "budget ≥ 1000 = meaningless" rule also skipped `settle_ms` (budget 1400), so settle was never regression-checked. It also found that launch (97 ms/s) was 64% of the journey hitch mean. Fixed in `templates/scripts/motion_report.py` (plus `in_journey: false`). [open: backport to Dash]

### Testing
- 2026-09-27 · The list was "still there" under the run page → XCUITest reads automation elements, including views hidden from VoiceOver; a ScrollView keeps its own element; the nearest `accessibilityHidden` wins; stack modifiers don't reach UIKit-hosted pages → hide on each page and container; tests check reach, not existence. [→ promoted to ui-testing.md, swiftui-gotchas.md]
- 2026-09-27 · Tapping "Done" switched tabs → the control sat under the floating bar, and XCUITest tapped through to the bar → reveal controls clear of floating bars first. [→ promoted to ui-testing.md §5]

### Building this skill (1.1.0 review)
- 2026-09-27 · A settle budget longer than its moment's window can never fail → Dash gave flings 3500 ms with a 2.5 s window → keep them equal (`flingSettle` 3.0 s, budget 3000). [→ promoted to measuring-motion.md, templates]
- 2026-09-27 · `UIScreen.main` is deprecated in the iOS 26 SDK, and no scene exists at App init → FrameProbe asks for 120 Hz, then reads the rate from the first window's scene. [→ templates/app/FrameProbe.swift]
- 2026-09-27 · The motion base class had its own launch, so the example journey hand-built the pinned clock and got it wrong once → MotionTestCase inherits AppUITestCase. [→ templates/uitests]
- 2026-09-27 · Template `tapMoment(gone:)` checked existence, against the skill's own reach rule → `waitUnreachable`. [→ templates/uitests, ui-testing.md §4]

- 2026-09-27 · `ffmpeg -ss`, `trim` and `select` by time all landed ~1 s off on a simctl recording, even with `-copyts` → at the first repeated pts (0.980 twice) libavcodec's best-effort timestamp switches to the dts, which ran 0.99 s behind → decode from frame 0, keep frames by index, take times from ffprobe's sorted packet pts (0.1 s vs 22 s for a frame probe). [→ templates/scripts/frame_strip.py, measuring-motion.md]
- 2026-09-27 · A moment name used three times overwrote `name#2`, losing the second one's numbers → next free `name#k`. Caught by a new test. [→ templates/scripts/motion_report.py, test_motion_report.py]
- 2026-09-27 · The report's re-timing moved 2,960 of 10,307 frames of a real Dash run, by up to 257 ms: in `home_run_open` the recorder saved frames ~5 ms apart for 400 ms, and re-timing put the landed page 5 ms *before* the tap. Its "at most one frame per refresh" assumption fails there. The hitch numbers come from FrameProbe and are safe; the video metrics (response, pops, late) near such bursts may be skewed. frame_strip uses the recorder's own times by default (`--retime` for the report's). [open: fix re-timing, then re-check Dash's response numbers]
- 2026-09-27 · `video_change` takes the smaller of the decoded-frame and pts counts instead of checking they match: a silent misalignment risk (counts matched on the real run). [open: make it an error]

### Open, or unverified on a device
- 120 Hz behaviour and render-server hitches: not measured (the simulator runs at 60 Hz). Run Instruments → Animation Hitches on a ProMotion iPhone; try `XCTHitchMetric` (iOS 26+) on a device. [unverified-on-device]
- VoiceOver walkthrough of the run layer (focus after open and close): not done by hand. [open]
- Swipe-back hitch is noisy under XCUITest's synthesized drag (16–50 ms/s per run): is it harness or real? Needs a device trace. [open]
