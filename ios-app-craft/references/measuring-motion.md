# Measuring motion, with guardrails that fail on regressions

"Make it smooth" becomes engineering once every animated moment has numbers, budgets, a
baseline and a check that fails. Build this before touching animations. Every real Dash
fix came from a number or a frame strip, and several "fixes" that looked right were
disproved by them.

Templates: `templates/app/FrameProbe.swift`, `templates/uitests/MotionTestCase.swift`,
`templates/scripts/motion-check.sh`, `templates/scripts/motion_report.py`,
`templates/scripts/frame_strip.py`, `templates/scripts/test_motion_report.py`,
`templates/motion-budgets.json`.

## The rig

1. **FrameProbe** (in the app, off unless a launch env var names a log file).
   - A `CADisplayLink` at the screen's top rate logs `timestamp targetTimestamp` per frame.
     Its clock is `CACurrentMediaTime`, which the UI-test process shares.
   - A window-level gesture recogniser that never recognises logs each finger lift
     (`# touch t`), so response is measured from the real touch, not from when XCUITest
     asked.
   - **A status-bar beacon:** a 12×8 pt `CALayer` whose colour flips every frame. The
     simulator recorder saves only frames that change. Without the beacon, a still screen
     leaves no frames, and a frame the recorder dropped looks exactly like a snap. With it,
     every shown frame is saved, and any gap in the recording is the recorder's fault. The
     analyser ignores the status bar. (Dash's evidence: a 3 s recording of a still screen
     held 1 frame.)
   - Flip the beacon inside `CATransaction.setDisableActions(true)`. Otherwise a standalone
     layer's colour change is an implicit 0.25 s fade, not one clean change per frame.
   - *Template behaviour:* the log appends, so a journey that relaunches the app keeps one
     timeline.
2. **The motion journey** (one XCUITest, animations on). It walks every animated moment:
   launch, a no-op tap (the harness floor), every tab slide, returning to kept tabs, a fling
   on every list, every push/zoom/flight and its back (button and edge swipe), morphs,
   sheets, dialogs. Each moment writes `name beginMedia endMedia beginWall endWall
   actedMedia`.
   - `tapMoment` finds the element and its frame *before* the clock starts, taps the
     coordinate, and checks that the right page arrived *after* the clock stops. XCUITest's
     own queries add work to measured frames otherwise.
   - Swipes are quick flicks released on arrival (`withVelocity: .fast,
     thenHoldForDuration: 0`), as a thumb does.
3. **motion-check.sh**:
   - builds a Release scheme with no debugger and no coverage (Apple's advice for
     performance tests);
   - overrides the status bar and clears simulated location;
   - runs the journey N times (3 by default), each with `simctl io recordVideo
     --codec=h264`, noting the wall time at "Recording started";
   - analyses everything and exits non-zero on any failure.
   - *Template behaviour:* one Python process polls the recorder's output every 2 ms for
     "Recording started". Dash's 0.1 s shell poll could shift the video against the logs by up
     to 100 ms, which is six frames. The script also:
     - passes the simulator's name and runtime to the report (`--device`);
     - makes `--out` absolute, because the simulator's processes write from another directory;
     - fails when `marks.log` or `frames.log` is missing;
     - stops the recorder and clears the status bar on any exit.
4. **motion_report.py** reads each run's frames, touches, marks and video (grey, 180 px wide,
   pts from ffprobe). It computes per-moment metrics, takes the median over runs, checks
   budgets, journey budgets and the baseline, and writes `report.md` + `report.json`.
   `--update-baseline` accepts the current numbers.
   - After any change to `motion_report.py` or `frame_strip.py`, run
     `python3 -m unittest templates/scripts/test_motion_report.py`, and it must pass. The
     tests use synthetic logs and videos, so they need no simulator and take about 2 s.

## Metrics (per moment; median over runs)

| Metric | Definition | Why |
|---|---|---|
| `motion_hitch_ms_per_s` | Apple's hitch ratio, counted only while pixels move. For each frame interval dt > 1.5×refresh, add dt − refresh; divide by the motion's length. | The jank you see. Apple: < 5 good, 5–10 warning, ≥ 10 critical. |
| `motion_worst_ms` | Longest frame while moving | One long stall |
| `response_stall_ms` | Longest frame in the 400 ms after the real finger lift | The pause before the screen answers |
| `pops` | A move where ≥ 4% of the screen changed hard (> 24 grey levels) in one frame, and that frame held ≥ 70% of the move's total change. Not a pop if it comes right after a recorder gap (`unverified_pops`), or within 120 ms after a larger move (a tail split off by recorder bunching). | Something snapped in or appeared from nowhere |
| `late_pct` | Change that follows ≥ 250 ms of *recorded* stillness (frames present, nothing moving) | Content arriving after the screen settled |
| `settle_ms` | First moving pixel to the last | How long until calm |
| `max_jump_pct` | Largest one-frame change | Gentleness |
| whole-window `hitch_ms_per_s`, `worst_frame_ms`, `dropped_pct`, `fps` | Include the harness's own work around taps | Regression only, with loose tolerance |
| `recorder_gaps` | Video gaps > 1.6×refresh | Tells you how much to trust a run's video metrics |

*Template behaviour:* the response window takes in the first frame past its end, so a freeze
longer than 400 ms counts in full. Dash's copy reported such a freeze as 0 ms. A unit test
confirmed the bug, and the template reports the full 600 ms.

## Budgets, journey budgets, baseline

- **Per-moment defaults:**
  - motion hitch ≤ 20 (one missed frame in a 1 s moment is already 17);
  - motion worst ≤ 50;
  - response ≤ 120;
  - pops 0;
  - late ≤ 5;
  - settle ≤ 1400, and 3000 for flings. Each equals its moment's window (MotionTestCase
    `settle` 1.4 s, `flingSettle` 3.0 s). A budget longer than its window can never fail: Dash
    gave flings 3500 with a 2.5 s window, so fling settling was never checked.
- **Journey (mean over moments):** motion hitch ≤ 7 (at Apple's "good" line, with room for
  simulator noise), response ≤ 60, pops 0.
  - *Template behaviour:* `"in_journey": false` leaves a one-off moment out of the mean. Dash's
    launch (97 ms/s) made up 64% of its journey hitch mean: 5.29 with it, 1.89 without. So the
    journey line was measuring the launch. With the launch left out, 7 is loose; tighten it
    toward 5 once a baseline exists.
- **Overrides are allowed only with a written `moment_notes` reason**, for example the
  session's first run page open at 140 ms: it is pre-drawn before the flight so the flight
  never drops a frame. Never loosen a budget to pass; fix it, or explain the trade in the
  notes.
- **Regression vs baseline:** each metric has a tolerance (old × ratio + abs). Skip
  regression for a metric whose budget for that moment is ≥ 1000 ("meaningless here", such
  as a fling's late change).
  - *Template behaviour:* "meaningless" means `null`, or ≥ 1000 on a metric that is not in
    ms. Dash's rule (any budget ≥ 1000) also caught `settle_ms`, whose default is 1400. So no
    Dash moment's settle time was ever checked for drift. A meaningless metric is also left
    out of the journey mean.
- **Update the baseline only on purpose**, from a 3-run median, after a change you meant.
  A baseline taken from one lucky run (0.0) will flag noise forever.
- **Read every "regressed" line before `--update-baseline`.** Accepting the baseline accepts
  its regressions too. Accept one only with a stated cause. Dash accepted `metric_open` going
  from 0.0 to 15.58 ms/s because it is Apple's native zoom, whose own hitch varies from 0 to 17
  between runs.
- *Template behaviour:* `--update-baseline` refuses while any budget fails and leaves the file
  untouched. Whatever it does accept (regressions, a new device) is listed in the report.
- *Template behaviour:* the baseline records the device and the screen rate. A run on another
  simulator or at another rate fails until you re-baseline on purpose, because numbers from a
  different device are not a baseline.
- *Template behaviour:* warnings flag a metric name the analyser doesn't know, a budget or
  baseline moment that the journey no longer has, a missing baseline, a moment still moving
  when its window closed, and a frame log that ends early. Unusable input exits with 2.

## Reading a moment: the diagnosis loop

When a number fails, look before theorising:

1. **App frame gaps relative to the finger lift:** list the dt > 20 ms around the lift.
   - The tap's build frame shows as ~90–130 ms at +0.
   - A stall mid-flight shows at +200–500 ms.
   - Landing shows at ~+480–630 ms.
   - Teardown shows at the end.
2. **Video episodes:** start/end, total change, peak, and the region that changed (y range).
   - Whole screen changing in one frame means a cut or a missing animation.
   - A small region at the top is the status bar or header.
3. **A frame strip** (`templates/scripts/frame_strip.py`): N frames sampled across the moment,
   stacked horizontally. Times are seconds from the moment's finger lift.
   - Strip: `frame_strip.py build/motion/runs/1 <moment> --from -0.05 --to 0.6 --n 12 --label`
   - Grid: `frame_strip.py build/motion/runs/1 <moment> --from -0.1 --to 0.9 --n 24 --grid 8 --label`
   - Diff: `frame_strip.py frame build/motion/runs/1 <moment> --at 0 --out t0.png`, then
     `frame_strip.py diff t0.png list.png`. It exits 1 when more than 0.2% of pixels differ
     by more than 24 grey levels. Use it to check that the flight's t=0 frame equals the list
     screenshot, and that the landing frame equals the settled page.

   **Pick the frame on screen at each time from the decoded frame array (searchsorted on pts).** Do not
   use `ffmpeg -ss` input seeking on a variable-frame-rate recording with bursts: it returned
   frames from *before* the tap and showed a "flash" that never happened.
   - The cause: ffmpeg times decoded frames with libavcodec's best-effort timestamp. On a simctl
     recording, the first repeated pts switches it to the dts, which were 0.99 s off the pts. So
     `-ss`, `trim` and `select` by time all land about a second away. The tool selects frames
     by number, takes their times from ffprobe, and checks that the frame counts match.
   - The strip shows frames at the recorder's own times. The report's re-timing of bursts can
     move a frame by over 100 ms (in one flight it put the landing before the tap), so the
     tool's table flags where the two disagree.
   - A strip only samples, so a one- or two-frame flash can fall between its frames. When a
     moment "blinks", scan every decoded frame of it for a brightness dip or spike in one
     region. Dash pulled every frame to pin down its list flashing back for a frame after a
     page landed. The Android reference's gate was "every-frame flash scan = 0".
4. **When logic is suspect,** add temporary `NSLog("TAG …")` and read it with
   `xcrun simctl spawn <udid> log show --last 1m --predicate 'eventMessage CONTAINS "TAG"'`.
   Dash found its frozen-pieces bug by logging the clock value an effect actually received.
5. **When cost is suspect,** use Time Profiler on the simulator.
   - Start the test in the background.
   - Wait until the *newest* `pgrep -n -f "<udid>.*/<App>.app/<App>"` pid differs from the
     one before (XCUITest relaunches the app).
   - Then `xcrun xctrace record --template 'Time Profiler' --device <udid> --attach <pid>
     --time-limit 50s`, and export the `time-profile` table with `xctrace export --xpath`.
   - Attaching to the test runner is the common mistake.
   - Profile a dedicated diagnostic UI test. It launches, waits ~8 s for launch and warm-up to
     settle, then repeats the slow action 4 times. Wait ~2 s after the new pid appears before
     attaching. A pid taken before the test's own `launch()` fails with "Cannot find process
     for provided pid".
   - In the exported XML:
     - resolve `id`/`ref`;
     - keep Main Thread samples in state Running;
     - cluster them into busy windows (samples less than 30 ms apart): each window is a stall;
     - count frames matching `AX` or `ccessib` to size XCUITest's share (Dash: 42% of
       main-thread samples).
   - Read the top *self* frames. Suppose
     `swift_conformsToProtocolMaybeInstantiateSuperclasses`, metadata instantiation and
     Mach-O load-command walks lead, and your binary has only a handful of samples. That is
     SwiftUI meeting a view type for the first time, so pay it early (`motion-craft.md` §4);
     there is nothing in your code to optimise. Dash's first open had 4 samples in app code.

## Traps the numbers hid (each cost hours)

- **The simulator runs at 60 Hz.** You can't measure 120 Hz there; the ms-per-second
  budgets hold at either rate. Say so; verify on a device with Instruments → Animation
  Hitches before release.
  - The rig sees only the app's own (commit) frames. Frames that the render server drops on a
    device never reach FrameProbe. Per the Xcode 12 release notes, `XCTOSSignpostMetric` hitch
    data is unavailable on simulated devices (not tested here).
  - On a ProMotion device, use Instruments → Animation Hitches and
    `XCTHitchMetric(application:)` (iOS 26+). Whether that metric runs on the simulator is
    unverified, so `XCTSkip` it there. In the field, use MetricKit's `HitchTimeMetric`.
  - *Unverified:* FrameProbe's display link asks for the top rate. On a device it may itself
    hold the screen at 120 Hz, which would hide whether the app asks for 120 Hz on its own.
    Cross-check with the probe off.
- **A stall or snap in the video with a clean frame log is the recorder.** Check the app's
  frame log before blaming the app. Dash's `plan_scroll` showed 130–150 ms freezes (motion
  hitch 61.5) while its frame log was clean. They were recorder gaps, and the final number is
  0.0. A "snap" on a tab switch had app gaps of 33 ms against video gaps of 145–268 ms.
- **Only changed frames are stored, so the frame before a change can be seconds old.** Start
  a motion at max(previous frame, first changed frame − 1 refresh), and clamp every analysis
  window to the moment's marks. Dash's analyser had both bugs: settle times swallowed seconds
  of stillness, and frames from past a moment's end leaked into it. The template does both.
- **XCUITest turns accessibility on.** It snapshots the tree before every action, which costs
  the app 30–40% of main-thread time, and it makes accessibility-tree flips cost frames.
  Measure the harness floor with a no-op tap moment; treat whole-window numbers as
  regression-only.
- **The recorder under load drops frames and delivers bursts** (dozens of frames stamped
  within 5 ms). Re-time bursts backwards at one refresh each, only for runs of deltas
  < 0.7×refresh (a global min-spacing pass drifts by seconds). Classify gaps as unverified.
  Without the beacon, none of this is decidable.
- **Median of 3, not 1.** Single runs flip moments between pass and fail. Even the median
  wobbles for the swipe-back moment (16–50), because of XCUITest's gesture synthesis. Report
  per-run values when a moment is borderline.
- **Stale builds:** a script that pipes the build to `/dev/null` quietly measures the previous
  binary after a compile error. Check the build first (`setup-and-tooling.md` §7).

## What "done" means

- The check passes (budgets, journey, baseline).
- The frame strips of the key transitions match the reference, frame by frame.
- The full UI suite is green.
- You can quote the numbers.

Report per-run values for anything borderline, and say what the simulator can't show.
