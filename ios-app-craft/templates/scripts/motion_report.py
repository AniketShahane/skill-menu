#!/usr/bin/env python3
"""Motion report: measures every marked moment of a motion journey and checks it against budgets.

What: reads the runs that motion-check.sh recorded, measures each moment, takes the median over
runs, and fails when a budget in motion-budgets.json is broken or a number got worse than the
accepted baseline. Each run folder holds:
  marks.log     MotionTestCase: `name beginMedia endMedia beginWall endWall actedMedia` per moment.
  frames.log    FrameProbe: `# maxfps N`, `# touch t` per finger lift, `timestamp target` per frame.
  screen.mp4    `simctl io recordVideo` of the whole journey.
  video_start   wall-clock seconds of the recording's first frame.

Wire in: nothing to change. motion-check.sh calls it; by hand:
  motion_report.py --runs build/motion/runs --budgets motion-budgets.json \\
      --baseline motion-baseline.json --out build/motion/report.md [--device NAME] [--update-baseline]
Needs python3 with numpy, plus ffmpeg and ffprobe. Exit 0 pass, 1 fail, 2 unusable input.

Two sources, because each misses what the other sees:
  frames.log   when every frame landed. A gap is a frame the main thread missed. It cannot see what
               the frames showed.
  screen.mp4   what the frames showed. Frame-to-frame pixel change shows how things moved: spread
               over many frames (an animation) or all at once (a snap, a pop-in, content arriving
               late). It cannot time frames, because the recorder lags and drops.

Metrics per moment (median over runs; lower is better):
  motion_hitch_ms_per_s  Apple's hitch time ratio counted only while pixels move: the ms the screen
                         was late per second of motion. This is the jank people see.
  motion_worst_ms        the longest frame while pixels move.
  response_stall_ms      the longest frame from the finger lift through response_window_s after it:
                         the pause before the screen answers. For a moment with no touch (the
                         launch) it is worst_frame_ms.
  pops                   a large area (>= pop_area) changed in one frame, and that frame carried
                         >= pop_share of its episode's change: a snap, not an animation.
  unverified_pops        the same, but straight after frames the recorder missed. Reported, never
                         budgeted.
  max_jump_pct           the largest share of the screen that changed hard in one frame.
  late_pct               area that changed after the screen had been provably still for
                         late_after_s: content arriving after the page landed.
  settle_ms              from the first moving pixel to the last.
  hitch_ms_per_s, dropped_pct, worst_frame_ms, fps
                         the frame numbers over the whole window, XCUITest's own work included.
                         Checked for regression only.
  recorder_gaps          refreshes the recorder did not save. For information.

Lessons it encodes, each learned from a false alarm or a stutter the numbers missed:
  - Split each window into "while pixels move" (jank you see) and "after the finger lifts" (a late
    answer). Whole-window numbers are dominated by XCUITest's work around the gesture.
  - The recorder falls behind, then hands over frames a few ms apart. retime() spreads each burst
    back to one refresh per frame, or the burst looks like a snap and the pause before it like
    stillness.
  - A pop straight after a recorder gap may be an animation whose first frames were lost, so it is
    counted apart.
  - The last frames of a motion, split off by a burst, are its tail and not a new arrival.
  - "Late" needs recorded stillness: a pause the recorder did not save is not stillness.
  - Budgets are the floor that must always hold, and the baseline catches slow drift under it. A
    moment's budget of null, or 1000 and up on a metric that is not in ms, marks the metric as
    meaningless for that moment (a fling's deceleration is not "late"). Such a metric is left out
    of the budget check, the baseline check and the journey mean. The rule used to cover ms metrics
    too, and since settle_ms defaults to 1400, settling was silently never checked for drift.
  - Leave the launch out of the journey mean ("in_journey": false). In the reference app it was
    97 ms/s of hitch, which made up 64% of the journey mean (5.29 with it, 1.89 without). The
    journey line was measuring the launch, not the interactions.
  - Take the median of several runs: the simulator drops a frame now and then at random.
  - A baseline measured on another device or at another refresh rate is not a baseline.
"""
import argparse
import json
import math
import os
import statistics
import subprocess
import sys
import tempfile

import numpy as np

# Detector settings. motion-budgets.json → "detector" overrides any of them.
DETECTOR = {
    "move_floor": 0.0015,  # share of the screen that must change hard for a frame to count as moving
    "gap_s": 0.06,  # moving frames closer than this are one episode (one motion)
    "pop_area": 0.04,  # a pop changes at least this share of the screen in one frame...
    "pop_share": 0.7,  # ...and that frame carries at least this share of its episode's change
    "late_after_s": 0.25,  # stillness longer than this, then change, is content arriving late
    "tail_s": 0.12,  # an episode this soon after a bigger one is that one's tail
    "analysis_width": 180,  # frames are scaled to this width: a phone becomes about 180 x 390
    "hard_change": 24,  # grey levels a pixel must change by to count; encoder noise stays under it
    "status_bar_share": 0.06,  # top strip left out: the clock and FrameProbe's beacon
    "response_window_s": 0.4,  # how long after a lift a stall still counts as the response
}
BURST = 0.7  # recorded frames closer than 0.7 refresh were bunched up by the recorder
GAP = 1.6  # recorded frames more than 1.6 refreshes apart: frames the recorder did not save
MIN_MOTION_S = 0.05  # motion shorter than this has no frame numbers of its own
NOT_MEANINGFUL = 1000  # a budget at or over this, on a metric not in ms, marks it meaningless for the moment

BUDGETED = ["motion_hitch_ms_per_s", "motion_worst_ms", "response_stall_ms", "hitch_ms_per_s", "dropped_pct",
            "worst_frame_ms", "pops", "max_jump_pct", "late_pct", "settle_ms"]
INFO = ["fps", "unverified_pops", "recorder_gaps", "still_moving"]
SUMMED = ("pops", "unverified_pops", "recorder_gaps")
COLUMNS = [("motion_hitch_ms_per_s", "motion hitch ms/s"), ("motion_worst_ms", "motion worst ms"),
           ("response_stall_ms", "response stall ms"), ("hitch_ms_per_s", "hitch ms/s"), ("worst_frame_ms", "worst ms"),
           ("fps", "fps"), ("pops", "pops"), ("unverified_pops", "unverified pops"), ("max_jump_pct", "max jump %"),
           ("late_pct", "late %"), ("settle_ms", "settle ms"), ("recorder_gaps", "recorder gaps")]
NAN = float("nan")


class InputError(Exception):
    """Input the report cannot measure: a missing log, a broken video, a bad budgets file."""


# ---------------------------------------------------------------------------------------------
# Reading the logs


def read_marks(path):
    marks = []
    with open(path) as f:
        for line in f:
            p = line.split()
            if len(p) < 5:
                continue
            marks.append(dict(name=p[0], begin=float(p[1]), end=float(p[2]), begin_wall=float(p[3]),
                              end_wall=float(p[4]), acted=float(p[5]) if len(p) > 5 else float(p[1])))
    if not marks:
        raise InputError(f"{path} has no moments")
    return marks


def read_frames(path):
    maxfps, ts, touches = None, [], []
    with open(path) as f:
        for line in f:
            if line.startswith("# maxfps"):
                maxfps = int(line.split()[2])
            elif line.startswith("# touch"):
                touches.append(float(line.split()[2]))
            elif not line.startswith("#"):
                p = line.split()
                if len(p) == 2:
                    ts.append(float(p[0]))
    if maxfps is None or len(ts) < 2:
        raise InputError(f"{path} has no frames: did the app start FrameProbe with the frame-log variable?")
    return maxfps, np.sort(np.array(ts)), sorted(touches)


# ---------------------------------------------------------------------------------------------
# Frame timing (frames.log)


def frame_metrics(ts, maxfps, begin, end):
    e = 1.0 / maxfps
    sel = ts[(ts >= begin) & (ts <= end)]
    window = end - begin
    if len(sel) < 2 or window <= 0:
        return dict(hitch_ms_per_s=NAN, dropped_pct=NAN, worst_frame_ms=NAN, fps=0.0)
    dt = np.diff(sel)
    # A frame that took more than 1.5 refreshes was late by everything past one refresh.
    late = dt[dt > 1.5 * e] - e
    missed = np.maximum(np.round(dt / e) - 1, 0).sum()
    return dict(hitch_ms_per_s=float(late.sum() * 1000 / window),
                dropped_pct=float(100 * missed / (window / e)),
                worst_frame_ms=float(dt.max() * 1000),
                fps=float(len(sel) / window))


def response_stall(ts, lift, window):
    """The longest frame from the finger lift through `window` after it. The first frame past the
    window counts too, so a freeze longer than the window counts in full instead of as nothing."""
    after = ts[ts > lift]
    if len(after) == 0:
        return NAN
    after = after[:np.searchsorted(after, lift + window, side="right") + 1]
    return float(np.diff(np.concatenate([[lift], after])).max() * 1000)


# ---------------------------------------------------------------------------------------------
# Pixel change (screen.mp4)


def video_change(path, cfg):
    """Frame times (seconds) and, for each pair of neighbouring frames, the share of the screen that
    changed hard. The video is streamed in chunks, so a long journey never sits in memory whole."""
    def run(args):
        r = subprocess.run(args, capture_output=True, text=True)
        if r.returncode != 0:
            raise InputError(f"{args[0]} failed on {path}: {r.stderr.strip()[:400]}")
        return r.stdout

    w, h = map(int, run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                         "-of", "csv=p=0", path]).strip().split(",")[:2])
    width = int(cfg["analysis_width"])
    height = int(round(h * width / w / 2) * 2)
    stamps = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time",
                  "-of", "csv=p=0", path])
    pts = np.array([float(x.strip(",")) for x in stamps.split() if x.strip(",")])

    top = int(height * cfg["status_bar_share"])  # the status bar: its clock is not the app
    size = width * height
    changes, prev = [], None
    with tempfile.TemporaryFile() as err:
        proc = subprocess.Popen(["ffmpeg", "-v", "error", "-i", path, "-fps_mode", "passthrough", "-vf",
                                 f"scale={width}:{height}:flags=area,format=gray", "-f", "rawvideo", "-"],
                                stdout=subprocess.PIPE, stderr=err)
        while True:
            buf = proc.stdout.read(size * 256)
            n = len(buf) // size
            if n == 0:
                break
            block = np.frombuffer(buf[:n * size], dtype=np.uint8).reshape(n, height, width)[:, top:, :].astype(np.int16)
            if prev is not None:
                block = np.concatenate([prev[None], block])
            if len(block) > 1:
                changes.append((np.abs(np.diff(block, axis=0)) > cfg["hard_change"]).mean(axis=(1, 2)))
            prev = block[-1]
        proc.stdout.close()
        if proc.wait() != 0:
            err.seek(0)
            raise InputError(f"ffmpeg failed on {path}: {err.read().decode(errors='replace').strip()[:400]}")
    change = np.concatenate(changes) if changes else np.zeros(0)
    n = min(len(change) + 1, len(pts))
    if n < 2:
        raise InputError(f"{path} has no frames to compare")
    return pts[:n], change[:n - 1]


def retime(pts, refresh):
    """The recorder can fall behind and then hand over a burst of frames a few ms apart. Real frames
    are at least one refresh apart, so a burst was drawn earlier than it was stamped. Spread each
    burst back from its last frame at one refresh per frame, never before the frame ahead of it.
    Frames at a normal spacing are left alone."""
    out = pts.copy()
    n = len(out)
    i = 1
    while i < n:
        if out[i] - out[i - 1] < BURST * refresh:
            j = i
            while j + 1 < n and out[j + 1] - out[j] < BURST * refresh:
                j += 1
            first = i - 1  # the burst is frames first..j
            floor = out[first - 1] if first > 0 else out[first] - (j - first) * refresh
            for k in range(j - 1, first - 1, -1):
                out[k] = max(min(out[k], out[k + 1] - refresh), floor + 1e-4 * (k - first + 1))
            i = j + 1
        else:
            i += 1
    return out


def video_metrics(pts, change, t0, t1, cfg, refresh):
    """Pixel metrics for the window t0..t1 (video seconds). change[i] is the change from frame i to
    frame i+1, which the screen showed at pts[i+1]."""
    out = dict(pops=0, unverified_pops=0, recorder_gaps=0, max_jump_pct=0.0, late_pct=0.0, settle_ms=0.0,
               still_moving=0, motion=None)
    idx = np.where((pts[1:] >= t0) & (pts[1:] <= t1))[0]
    if len(idx) == 0:
        return out
    # The beacon changes every frame, so the recording holds one frame per refresh. A longer gap is
    # frames the recorder did not save.
    out["recorder_gaps"] = int(sum(1 for i in idx if pts[i + 1] - pts[i] > GAP * refresh))
    moving = [i for i in idx if change[i] >= cfg["move_floor"]]
    if not moving:
        return out
    # Episodes: runs of moving frames with gaps under gap_s.
    episodes, cur = [], [moving[0]]
    for i in moving[1:]:
        if pts[i + 1] - pts[cur[-1] + 1] <= cfg["gap_s"]:
            cur.append(i)
        else:
            episodes.append(cur)
            cur = [i]
    episodes.append(cur)
    out["max_jump_pct"] = float(100 * max(change[i] for i in moving))

    previous_end, previous_total = None, 0.0
    for ep in episodes:
        total = sum(change[i] for i in ep)
        peak = max(change[i] for i in ep)
        # The last frames of a longer motion, set apart by frames the recorder bunched up before
        # them, are that motion's tail, not something appearing on its own.
        tail = previous_end is not None and pts[ep[0] + 1] - previous_end <= cfg["tail_s"] and previous_total > total
        previous_end, previous_total = pts[ep[-1] + 1], total
        if tail:
            continue
        # A pop: a large area changed in one frame, and that frame is most of the episode's change.
        # An animation spreads its change over many frames, even when the recorder squeezes it into
        # a few; a cut does not.
        if peak >= cfg["pop_area"] and peak / total >= cfg["pop_share"]:
            k = max(ep, key=lambda i: change[i])
            if pts[k + 1] - pts[k] > GAP * refresh:
                out["unverified_pops"] += 1  # its first frames may be the ones the recorder lost
            else:
                out["pops"] += 1

    # Late: change after the screen had been still for late_after_s, with the recorder saving frames
    # the whole while, so the stillness is real. A choreography that keeps moving is not late.
    for prev, ep in zip(episodes, episodes[1:]):
        still_from, still_to = pts[prev[-1] + 1], pts[ep[0] + 1]
        if still_to - still_from <= cfg["late_after_s"]:
            continue
        between = pts[(pts >= still_from) & (pts <= still_to)]
        if len(between) > 1 and np.diff(between).max() <= GAP * refresh:
            out["late_pct"] += float(100 * sum(change[i] for i in ep))

    # First moving pixel to last. The frame before a change can be old (a gap), so a change starts
    # at most one refresh before the frame that shows it.
    start = max(float(pts[episodes[0][0]]), float(pts[episodes[0][0] + 1]) - refresh)
    last = float(pts[episodes[-1][-1] + 1])
    out["settle_ms"] = (last - start) * 1000
    out["still_moving"] = int(last >= t1 - 3 * refresh)
    out["motion"] = (start, last)
    return out


# ---------------------------------------------------------------------------------------------
# One run


def analyse_run(run_dir, cfg):
    def need(name):
        path = os.path.join(run_dir, name)
        if not os.path.exists(path):
            raise InputError(f"{path} is missing")
        return path

    marks = read_marks(need("marks.log"))
    maxfps, ts, touches = read_frames(need("frames.log"))
    with open(need("video_start")) as f:
        vstart = float(f.read().strip())
    refresh = 1.0 / maxfps
    pts, change = video_change(need("screen.mp4"), cfg)
    pts = retime(pts, refresh)

    result, warnings = {}, []
    for m in marks:
        name = m["name"]
        if name in result:  # a repeat: name#2, name#3, ... (a third used to overwrite name#2)
            k = 2
            while f"{name}#{k}" in result:
                k += 1
            warnings.append(f"{run_dir}: moment '{name}' appears {k} times; repeat {k} is reported as '{name}#{k}'")
            name = f"{name}#{k}"
        if ts[-1] < m["end"] - 2 * refresh:
            warnings.append(f"{name}: the frame log stops {m['end'] - ts[-1]:.2f} s before the moment ends "
                            "(end the journey with endJourney())")
        r = frame_metrics(ts, maxfps, m["begin"], m["end"])
        # Wall clock to video time for the window.
        t0, t1 = m["begin_wall"] - vstart, m["end_wall"] - vstart
        v = video_metrics(pts, change, t0, t1, cfg, refresh)
        motion = v.pop("motion")
        r.update(v)
        # Stalls while the pixels move are jank you see. Stalls between the lift and the first
        # moving pixel are a late answer, measured below.
        r["motion_hitch_ms_per_s"] = r["motion_worst_ms"] = 0.0
        if motion:
            shift = m["begin"] - m["begin_wall"] + vstart  # video seconds to media seconds
            mb, me = max(motion[0] + shift, m["begin"]), min(motion[1] + shift, m["end"])
            if me - mb > MIN_MOTION_S:
                during = frame_metrics(ts, maxfps, mb, me)
                r["motion_hitch_ms_per_s"] = during["hitch_ms_per_s"]
                r["motion_worst_ms"] = during["worst_frame_ms"]
        # Response: timed from the last lift the app saw in the window, without the harness's work.
        lifts = [t for t in touches if m["begin"] <= t <= m["end"]]
        r["response_stall_ms"] = (response_stall(ts, lifts[-1], cfg["response_window_s"]) if lifts
                                  else r["worst_frame_ms"])
        result[name] = r
    return maxfps, result, warnings


# ---------------------------------------------------------------------------------------------
# Budgets, baseline, report


def numbers(section):
    """A budgets section without its notes: every key whose value is a number."""
    return {k: v for k, v in (section or {}).items()
            if k != "note" and isinstance(v, (int, float)) and not isinstance(v, bool)}


def nan_to_none(x):
    if isinstance(x, float) and math.isnan(x):
        return None
    if isinstance(x, dict):
        return {k: nan_to_none(v) for k, v in x.items()}
    if isinstance(x, list):
        return [nan_to_none(v) for v in x]
    return x


def num(v):
    return NAN if v is None else v


def fmt(v):
    if isinstance(v, float) and math.isnan(v):
        return "–"
    return f"{v:g}" if isinstance(v, float) else str(v)


def median_of(runs, name, key):
    vals = [r[name][key] for r in runs if name in r and key in r[name] and not math.isnan(r[name][key])]
    return round(statistics.median(vals), 2) if vals else NAN


def load_budgets(path):
    try:
        with open(path) as f:
            budgets = json.load(f)
    except (OSError, ValueError) as e:
        raise InputError(f"{path}: {e}")
    cfg = dict(DETECTOR)
    cfg.update(numbers(budgets.get("detector")))
    return budgets, cfg


def main():
    ap = argparse.ArgumentParser(description="Measure a motion journey's runs against budgets and a baseline.")
    ap.add_argument("--runs", required=True, help="folder of run folders (1, 2, 3, ...)")
    ap.add_argument("--budgets", required=True)
    ap.add_argument("--baseline", required=True, help="accepted numbers; written by --update-baseline")
    ap.add_argument("--out", required=True, help="report.md; report.json is written beside it")
    ap.add_argument("--device", help="simulator name and runtime, kept in the baseline and compared")
    ap.add_argument("--update-baseline", action="store_true", help="accept these numbers (only when every budget holds)")
    a = ap.parse_args()

    budgets, cfg = load_budgets(a.budgets)
    known = set(BUDGETED) | set(INFO)
    warnings, notes = [], []
    for key in numbers(budgets.get("detector")):
        if key not in DETECTOR:
            warnings.append(f"budgets: unknown detector setting '{key}'")

    if not os.path.isdir(a.runs):
        raise InputError(f"no runs folder at {a.runs}")
    runs, maxfps = [], None
    dirs = sorted((d for d in os.listdir(a.runs) if os.path.isdir(os.path.join(a.runs, d))),
                  key=lambda d: (not d.isdigit(), int(d) if d.isdigit() else 0, d))
    for d in dirs:
        try:
            rate, r, w = analyse_run(os.path.join(a.runs, d), cfg)
        except (OSError, ValueError, IndexError) as e:
            raise InputError(f"run {d}: {e}")
        if maxfps is not None and rate != maxfps:
            raise InputError(f"run {d} was at {rate} Hz, earlier runs at {maxfps} Hz")
        maxfps = rate
        runs.append(r)
        warnings += w
    if not runs:
        raise InputError(f"no runs in {a.runs}")
    warnings = list(dict.fromkeys(warnings))  # the same warning from every run, once

    names = list(runs[0])
    for r in runs[1:]:
        names += [n for n in r if n not in names]
    keys = BUDGETED + INFO
    summary = {n: {k: median_of(runs, n, k) for k in keys} for n in names}

    moment_budgets = {k: v for k, v in (budgets.get("moments") or {}).items() if k != "note"}
    limits_of, off_of = {}, {}
    for n in names:
        limits = numbers(budgets.get("default"))
        limits.update(numbers(moment_budgets.get(n)))
        # Not meaningful for this moment: null, or NOT_MEANINGFUL and up on a metric that is not a
        # duration. A duration of 1000 ms is a real budget (settle_ms defaults to 1400).
        off = {k for k, v in (moment_budgets.get(n) or {}).items() if v is None}
        off |= {k for k, v in limits.items() if not k.endswith("_ms") and v >= NOT_MEANINGFUL}
        limits_of[n] = {k: v for k, v in limits.items() if k not in off}
        off_of[n] = off
    for section, table in [("default", numbers(budgets.get("default"))), ("journey", numbers(budgets.get("journey")))] + \
            [(f"moments.{n}", numbers(b)) for n, b in moment_budgets.items()]:
        for k in table:
            if k not in known:
                warnings.append(f"budgets: {section} names an unknown metric '{k}'")
    for n in moment_budgets:
        if n not in summary:
            warnings.append(f"budgets: moment '{n}' is not in this journey (renamed or removed?)")

    # Budgets: the floor every moment must hold.
    failures = []
    for n in names:
        for k, limit in limits_of[n].items():
            v = summary[n].get(k, NAN)
            if not math.isnan(v) and v > limit:
                failures.append(f"{n}: {k} {fmt(v)} > budget {fmt(limit)}")
        if summary[n]["still_moving"] >= 1:
            warnings.append(f"{n}: still moving when its window closed; give it a longer settle")

    # The whole journey: the mean over moments (pops and gaps summed) stays inside a tighter line.
    # A moment marked "in_journey": false (the launch) is left out; otherwise its one-off cost
    # becomes most of the mean. So is a metric that a moment's budget marks as meaningless.
    in_journey = [n for n in names if (moment_budgets.get(n) or {}).get("in_journey", True) is not False]
    left_out = [n for n in names if n not in in_journey]
    journey = {}
    for k in keys:
        vals = [summary[n][k] for n in in_journey
                if not math.isnan(summary[n][k]) and k not in off_of[n]]
        journey[k] = (sum(vals) if k in SUMMED else round(statistics.mean(vals), 2)) if vals else NAN
    for k, limit in numbers(budgets.get("journey")).items():
        v = journey.get(k, NAN)
        if not math.isnan(v) and v > limit:
            failures.append(f"journey: {k} {fmt(v)} > budget {fmt(limit)}")

    # Regression: worse than the accepted numbers by more than old * ratio + abs.
    regressions, baseline_problems = [], []
    baseline = {}
    if os.path.exists(a.baseline):
        try:
            with open(a.baseline) as f:
                baseline = json.load(f)
        except ValueError as e:
            raise InputError(f"{a.baseline}: {e}")
    base = baseline.get("moments", {})
    comparable = bool(baseline)
    if not baseline and not a.update_baseline:
        warnings.append(f"no baseline at {a.baseline}: nothing guards against drift until one is accepted "
                        "with --update-baseline")
    if baseline:
        if baseline.get("maxfps") not in (None, maxfps):
            baseline_problems.append(f"baseline measured at {baseline['maxfps']} Hz, this run at {maxfps} Hz")
        if a.device and baseline.get("device") not in (None, a.device):
            baseline_problems.append(f"baseline measured on '{baseline['device']}', this run on '{a.device}'")
        comparable = not baseline_problems
    tolerances = {k: v for k, v in (budgets.get("regression") or {}).items() if k != "note" and isinstance(v, dict)}
    if comparable:
        for n in names:
            if n not in base:
                notes.append(f"{n}: no baseline yet")
                continue
            for k in BUDGETED:
                if k in off_of[n] or k not in base[n]:
                    continue
                old, v = num(base[n][k]), summary[n][k]
                tol = tolerances.get(k, {"ratio": 0.25, "abs": 1})
                if v > old * (1 + tol.get("ratio", 0)) + tol.get("abs", 0):
                    regressions.append(f"{n}: {k} regressed {fmt(old)} → {fmt(v)}")
        for n in base:
            if n not in summary:
                warnings.append(f"baseline: moment '{n}' is gone from the journey; its history no longer guards anything")

    for n, text in (budgets.get("moment_notes") or {}).items():
        if n in summary:
            notes.append(f"{n}: {text}")

    # The report.
    lines = ["# Motion report", "",
             f"Screen top rate: {maxfps} Hz. Runs: {len(runs)} (median shown)."
             + (f" Device: {a.device}." if a.device else ""), "",
             "| moment | " + " | ".join(label for _, label in COLUMNS) + " |",
             "|---" * (len(COLUMNS) + 1) + "|"]
    for n in names:
        lines.append(f"| {n} | " + " | ".join(fmt(summary[n][k]) for k, _ in COLUMNS) + " |")
    lines.append("| **journey (mean; pops and gaps summed)** | "
                 + " | ".join(f"**{fmt(journey[k])}**" for k, _ in COLUMNS) + " |")
    if left_out:
        lines += ["", "The journey leaves out: " + ", ".join(left_out) + "."]
    # Accepting a new baseline takes every budget holding: a baseline is a floor you accept, never a
    # broken one. What it accepts (regressions, a new device) is listed, not hidden.
    accept = a.update_baseline and not failures
    if accept:
        problems = []
    elif a.update_baseline:
        problems = failures + regressions
    else:
        problems = failures + regressions + [f"{p}: re-baseline on purpose with --update-baseline, or measure on "
                                             "the baseline's device" for p in baseline_problems]
    lines += ["", "## Result", ""]
    lines += [f"- FAIL {f}" for f in problems] or ["- PASS: every moment is inside its budget"
                                                   + (", and these numbers are the new baseline." if accept
                                                      else " and the baseline.")]
    if accept:
        lines += [f"- accepted: {c}" for c in regressions + baseline_problems]
    elif a.update_baseline:
        lines.append("- Baseline NOT updated: a budget fails.")
    if warnings:
        lines += ["", "## Warnings", ""] + [f"- {w}" for w in warnings]
    if notes:
        lines += ["", "## Notes", ""] + [f"- {x}" for x in notes]

    if accept:
        with open(a.baseline, "w", encoding="utf-8") as f:
            json.dump(nan_to_none({"note": "Accepted motion numbers (median of runs). Update only on purpose: "
                                           "motion-check.sh ... --update-baseline",
                                   "device": a.device, "maxfps": maxfps, "runs": len(runs),
                                   "journey": journey, "moments": summary}), f, indent=1, sort_keys=True)
        lines += ["", f"Baseline written to {a.baseline}."]
    report = "\n".join(lines) + "\n"
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        f.write(report)
    with open(os.path.splitext(a.out)[0] + ".json", "w", encoding="utf-8") as f:
        json.dump(nan_to_none({"maxfps": maxfps, "device": a.device, "runs": runs, "summary": summary,
                               "journey": journey, "failures": problems, "warnings": warnings}), f, indent=1)
    print(report)
    return 1 if problems else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except InputError as e:
        print(f"motion_report: {e}", file=sys.stderr)
        sys.exit(2)
