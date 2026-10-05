#!/usr/bin/env python3
"""Tests for motion_report.py and frame_strip.py on synthetic inputs: no simulator needed.

What: locks in how the report measures (frame timing, response, pops, tails, late content,
settling, re-timing), how it judges (budgets, the journey mean, the baseline and its refusals),
and that frame_strip shows the frame that was on screen at each time.

Run after any change to motion_report.py or frame_strip.py, from the skill folder:
  python3 -m unittest templates/scripts/test_motion_report.py
  python3 templates/scripts/test_motion_report.py
Needs what the scripts need: numpy, Pillow, ffmpeg and ffprobe. The video tests also need
ffmpeg's libx264 and are skipped without it.

The videos are built like a simctl recording: variable frame rate, stamped in 1/600 s, with
B-frames, so packets are stored out of display order.
"""
import contextlib
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import motion_report as mr  # noqa: E402
import frame_strip as fs  # noqa: E402

R = 1 / 60  # one refresh at 60 Hz
CFG = dict(mr.DETECTOR)


def has_x264():
    try:
        out = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
    except OSError:
        return False
    return "libx264" in out


VIDEO = has_x264()


def write_video(path, frames, units):
    """Grey frames (H x W uint8) shown at `units` (1/600 s, increasing), as H.264 with B-frames."""
    h, w = frames[0].shape
    steps = np.diff(units)
    expr = f"{units[0]}+N*10" + "".join(f"+({d - 10})*gte(N,{j})" for j, d in enumerate(steps, start=1) if d != 10)
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{w}x{h}", "-framerate", "600",
           "-i", "-", "-vf", f"setpts='{expr}'", "-fps_mode", "passthrough", "-c:v", "libx264", "-qp", "1", "-bf", "2",
           "-x264-params", "b-adapt=0", "-pix_fmt", "yuv420p", "-video_track_timescale", "600", path]
    subprocess.run(cmd, input=np.stack(frames).tobytes(), check=True, capture_output=True)
    got = fs.read_pts(path)
    assert len(got) == len(units) and np.allclose(got, np.array(units) / 600, atol=1e-5), "timestamps not as asked"


def write_run(folder, video_frames, units, marks, app_frames, touches, vstart=1790000000.0, media0=1000.0):
    """A run folder as motion-check.sh leaves it. `marks` are (name, begin, end, acted) in video
    seconds; `app_frames` and `touches` too. The media clock is video + media0, the wall clock
    video + vstart."""
    os.makedirs(folder, exist_ok=True)
    if video_frames is not None:
        write_video(os.path.join(folder, "screen.mp4"), video_frames, units)
    with open(os.path.join(folder, "video_start"), "w") as f:
        f.write(f"{vstart:.6f}\n")
    with open(os.path.join(folder, "marks.log"), "w") as f:
        for name, b, e, acted in marks:
            f.write(f"{name} {b + media0:.6f} {e + media0:.6f} {b + vstart:.6f} {e + vstart:.6f} {acted + media0:.6f}\n")
    with open(os.path.join(folder, "frames.log"), "w") as f:
        f.write("# maxfps 60\n")
        for t in touches:
            f.write(f"# touch {t + media0:.6f}\n")
        for t in app_frames:
            f.write(f"{t + media0:.6f} {t + media0 + R:.6f}\n")


def quiet(fn, *args):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = fn(*args)
    return code, out.getvalue()


# ---------------------------------------------------------------------------------------------
# Frame timing


class FrameMetrics(unittest.TestCase):
    def test_perfect_60hz_has_no_hitch(self):
        ts = np.array([k * R for k in range(61)])
        m = mr.frame_metrics(ts, 60, 0.0, 1.0)
        self.assertEqual(m["hitch_ms_per_s"], 0.0)
        self.assertEqual(m["dropped_pct"], 0.0)
        self.assertAlmostEqual(m["worst_frame_ms"], 1000 / 60, places=3)
        self.assertAlmostEqual(m["fps"], 61, places=6)

    def test_one_50ms_frame(self):
        ts = np.array([k * R for k in range(31)] + [0.55 + k * R for k in range(28)])  # 0.5 s -> 0.55 s
        m = mr.frame_metrics(ts, 60, 0.0, 1.0)
        self.assertAlmostEqual(m["hitch_ms_per_s"], 50 - 1000 / 60, places=3)  # late by all past one refresh
        self.assertAlmostEqual(m["worst_frame_ms"], 50, places=3)
        self.assertAlmostEqual(m["dropped_pct"], 100 * 2 / 60, places=3)  # 50 ms is three refreshes: two missed


class ResponseStall(unittest.TestCase):
    def test_steady_frames_answer_in_one_refresh(self):
        ts = np.array([k * R for k in range(120)])
        self.assertAlmostEqual(mr.response_stall(ts, 0.5, 0.4), 1000 / 60, places=3)

    def test_freeze_longer_than_the_window_counts_in_full(self):
        # Fixed bug: a freeze longer than the 400 ms window used to be reported as nothing.
        ts = np.array([k * R for k in range(31)] + [1.1 + k * R for k in range(30)])  # nothing from 0.5 to 1.1 s
        self.assertAlmostEqual(mr.response_stall(ts, 0.5, 0.4), 600, places=3)


class Retime(unittest.TestCase):
    def test_a_burst_is_spread_back_one_refresh_per_frame(self):
        pts = np.array([0, R, 2 * R, 0.2, 0.203, 0.206, 0.206 + R])
        out = mr.retime(pts, R)
        np.testing.assert_allclose(out[:3], pts[:3])  # normal spacing: untouched
        self.assertAlmostEqual(out[5], 0.206)  # the burst keeps its last frame...
        np.testing.assert_allclose(np.diff(out[3:6]), [R, R])  # ...and is spread back from it
        self.assertAlmostEqual(out[6], pts[6])
        self.assertTrue(np.all(np.diff(out) > 0))


# ---------------------------------------------------------------------------------------------
# Pixel metrics on synthetic change arrays: change[i] is what changed from frame i to i+1


def timeline(n):
    return np.array([k * R for k in range(n)]), np.zeros(n - 1)


class VideoMetrics(unittest.TestCase):
    def test_a_one_frame_change_is_a_pop(self):
        pts, change = timeline(60)
        change[20] = 0.3
        v = mr.video_metrics(pts, change, 0, 1, CFG, R)
        self.assertEqual(v["pops"], 1)
        self.assertAlmostEqual(v["max_jump_pct"], 30)

    def test_an_animation_is_not_a_pop(self):
        pts, change = timeline(60)
        change[20:30] = 0.05  # every frame over pop_area, but none carries most of the motion
        self.assertEqual(mr.video_metrics(pts, change, 0, 1, CFG, R)["pops"], 0)

    def test_a_pop_after_a_recorder_gap_is_unverified(self):
        pts = np.array([k * R for k in range(20)] + [0.5 + k * R for k in range(20)])
        change = np.zeros(len(pts) - 1)
        change[19] = 0.3  # shown at 0.5 s, after 183 ms with no recorded frame
        v = mr.video_metrics(pts, change, 0, 1, CFG, R)
        self.assertEqual((v["pops"], v["unverified_pops"]), (0, 1))
        self.assertEqual(v["recorder_gaps"], 1)

    def tail_case(self, after_s):
        """A 12-frame slide, then after `after_s` of still frames one frame that changes 5%."""
        pts, change = timeline(120)
        change[10:22] = 0.02  # shown at frames 11..22
        k = 22 + round(after_s / R)
        change[k - 1] = 0.05  # shown at frame k
        return mr.video_metrics(pts, change, 0, 2, CFG, R)

    def test_a_tail_within_120ms_is_not_a_new_arrival(self):
        self.assertEqual(self.tail_case(0.1)["pops"], 0)

    def test_the_same_change_later_is_a_pop(self):
        v = self.tail_case(0.2)
        self.assertEqual(v["pops"], 1)
        self.assertEqual(v["late_pct"], 0)  # 200 ms of stillness is under late_after_s

    def test_late_needs_recorded_stillness(self):
        pts, change = timeline(120)
        change[10:20] = 0.02
        change[40] = 0.01  # after 350 ms of recorded stillness
        self.assertAlmostEqual(mr.video_metrics(pts, change, 0, 2, CFG, R)["late_pct"], 1.0)
        # The same pause with no frames saved is the recorder's gap, not stillness.
        keep = [k for k in range(120) if not 22 <= k <= 39]
        pts2 = pts[keep]
        change2 = np.zeros(len(pts2) - 1)
        change2[10:20] = 0.02
        change2[keep.index(40) + 0] = 0.01
        self.assertEqual(mr.video_metrics(pts2, change2, 0, 2, CFG, R)["late_pct"], 0)

    def test_settle_runs_from_the_first_moving_pixel_to_the_last(self):
        pts, change = timeline(120)
        change[10:31] = 0.02  # shown at frames 11..31
        v = mr.video_metrics(pts, change, 0, 2, CFG, R)
        self.assertAlmostEqual(v["settle_ms"], (31 - 10) * 1000 / 60, places=3)
        self.assertEqual(v["still_moving"], 0)


# ---------------------------------------------------------------------------------------------
# Budgets, journey and baseline (the report's main, with the run analysis replaced)


def metrics(**kw):
    m = dict(motion_hitch_ms_per_s=0.0, motion_worst_ms=16.7, response_stall_ms=40.0, hitch_ms_per_s=0.0,
             dropped_pct=0.0, worst_frame_ms=16.7, pops=0, max_jump_pct=2.0, late_pct=0.0, settle_ms=400.0,
             fps=60.0, unverified_pops=0, recorder_gaps=0, still_moving=0)
    m.update(kw)
    return m


BUDGETS = {
    "detector": {},
    "default": {"motion_hitch_ms_per_s": 20, "motion_worst_ms": 50, "response_stall_ms": 120, "pops": 0,
                "late_pct": 5, "settle_ms": 1400},
    "moments": {"launch": {"in_journey": False, "motion_hitch_ms_per_s": 150, "settle_ms": 8000},
                "fling": {"late_pct": 1000, "settle_ms": 3000}},
    "journey": {"motion_hitch_ms_per_s": 7},
}
DEVICE = "iPhone 17 / iOS-26-0"


class Report(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = tmp.name

    def report(self, runs, baseline=None, update=False, budgets=BUDGETS):
        """runs: one {moment: metrics} per run. Returns exit code, report.md, report.json, baseline path."""
        runs_dir = os.path.join(self.dir, "runs")
        for i in range(len(runs)):
            os.makedirs(os.path.join(runs_dir, str(i + 1)), exist_ok=True)
        paths = {k: os.path.join(self.dir, k) for k in ("budgets.json", "baseline.json", "report.md", "report.json")}
        with open(paths["budgets.json"], "w") as f:
            json.dump(budgets, f)
        if baseline is not None:
            with open(paths["baseline.json"], "w") as f:
                json.dump(baseline, f)
        argv = ["motion_report.py", "--runs", runs_dir, "--budgets", paths["budgets.json"], "--baseline",
                paths["baseline.json"], "--out", paths["report.md"], "--device", DEVICE]
        if update:
            argv.append("--update-baseline")

        def fake(run_dir, cfg):
            return 60, runs[int(os.path.basename(run_dir)) - 1], []

        with mock.patch.object(mr, "analyse_run", fake), mock.patch.object(sys, "argv", argv):
            code, _ = quiet(mr.main)
        with open(paths["report.md"]) as f, open(paths["report.json"]) as g:
            return code, f.read(), json.load(g), paths["baseline.json"]

    @staticmethod
    def baseline(moments, device=DEVICE):
        return {"device": device, "maxfps": 60, "moments": moments}

    def test_settle_ms_is_checked_for_drift(self):
        # Fixed bug: a budget of 1000 or more meant "not meaningful" for every metric, so settle_ms
        # (budget 1400) was never compared with the baseline.
        code, text, _, _ = self.report([{"open": metrics(settle_ms=900)}],
                                       self.baseline({"open": metrics(settle_ms=500)}))
        self.assertEqual(code, 1)
        self.assertIn("open: settle_ms regressed 500 → 900", text)

    def test_a_metric_marked_meaningless_is_skipped(self):
        runs = [{"open": metrics(late_pct=2.0), "fling": metrics(late_pct=50.0)}]
        code, text, rep, _ = self.report(runs, self.baseline({"open": metrics(late_pct=2.0),
                                                              "fling": metrics(late_pct=0.0)}))
        self.assertNotIn("late_pct", text.split("## Result")[1])  # neither a budget nor a regression
        self.assertEqual(code, 0)
        self.assertEqual(rep["journey"]["late_pct"], 2.0)  # and it stays out of the journey mean

    def test_in_journey_false_leaves_a_moment_out_of_the_mean(self):
        runs = [{"launch": metrics(motion_hitch_ms_per_s=97.0), "open": metrics(motion_hitch_ms_per_s=2.0)}]
        code, text, rep, _ = self.report(runs, self.baseline({"launch": metrics(motion_hitch_ms_per_s=97.0),
                                                              "open": metrics(motion_hitch_ms_per_s=2.0)}))
        self.assertEqual(rep["journey"]["motion_hitch_ms_per_s"], 2.0)
        self.assertIn("The journey leaves out: launch.", text)
        self.assertEqual(code, 0)

    def test_the_median_of_runs_is_judged(self):
        runs = [{"open": metrics(motion_hitch_ms_per_s=v)} for v in (0.0, 30.0, 2.0)]
        code, _, rep, _ = self.report(runs, self.baseline({"open": metrics(motion_hitch_ms_per_s=2.0)}))
        self.assertEqual(rep["summary"]["open"]["motion_hitch_ms_per_s"], 2.0)
        self.assertEqual(code, 0)

    def test_no_baseline_is_written_while_a_budget_fails(self):
        code, text, _, path = self.report([{"open": metrics(pops=1)}], update=True)
        self.assertEqual(code, 1)
        self.assertFalse(os.path.exists(path))
        self.assertIn("Baseline NOT updated", text)

    def test_a_baseline_is_written_when_every_budget_holds(self):
        code, _, _, path = self.report([{"open": metrics(settle_ms=420.0)}], update=True)
        self.assertEqual(code, 0)
        with open(path) as f:
            saved = json.load(f)
        self.assertEqual((saved["device"], saved["maxfps"]), (DEVICE, 60))
        self.assertEqual(saved["moments"]["open"]["settle_ms"], 420.0)

    def test_a_baseline_from_another_device_is_not_a_baseline(self):
        code, text, _, _ = self.report([{"open": metrics()}], self.baseline({"open": metrics()}, device="iPad"))
        self.assertEqual(code, 1)
        self.assertIn("re-baseline on purpose", text)

    def test_the_budgets_template_names_only_known_settings(self):
        path = os.path.join(HERE, "..", "motion-budgets.json")
        if not os.path.exists(path):
            self.skipTest("no motion-budgets.json next to the scripts folder")
        budgets, _ = mr.load_budgets(path)
        self.assertLessEqual(set(mr.numbers(budgets.get("detector"))), set(mr.DETECTOR))
        known = set(mr.BUDGETED) | set(mr.INFO)
        sections = [budgets.get("default"), budgets.get("journey")] + \
            [b for k, b in budgets.get("moments", {}).items() if k != "note"]
        for section in sections:
            self.assertLessEqual(set(mr.numbers(section)), known)


# ---------------------------------------------------------------------------------------------
# The whole run analysis on a synthetic recording


H, W = 390, 180  # the analysis width, so the report compares these pixels as they are


def scene(k):
    """Frame k of a 60 Hz recording (t = k / 60) of four moments:
    slide      0.7-1.0 s  a 60 px block slides 120 px (an animation)
    snap       2.0 s      a third of the screen appears in one frame (a pop)
    tail_near  3.1-3.3 s  a slide, then 100 ms later a 5% block appears (its tail)
    tail_far   4.6-4.8 s  the slide back, then 200 ms later the block goes (a pop)"""
    img = np.full((H, W), 30, np.uint8)
    x = round(120 * min(max((k - 41) / 19, 0), 1))
    img[30:90, x:x + 60] = 220
    if k >= 120:
        img[100:220, :] = 220
    x2 = round(120 * min(max((k - 185) / 13, 0), 1)) - round(120 * min(max((k - 275) / 13, 0), 1))
    img[230:290, x2:x2 + 60] = 220
    if 204 <= k < 300:
        img[300:360, 0:60] = 220
    return img


# App frames: 60 Hz, but one frame took 50 ms (0.8 -> 0.85 s), in the middle of the slide.
APP_FRAMES = [k * R for k in range(49)] + [0.85 + k * R for k in range(310)]
MOMENTS = [("slide", 0.4, 1.4, 0.5), ("snap", 1.8, 2.6, 1.9), ("tail_near", 2.9, 3.7, 3.0),
           ("tail_far", 4.4, 5.3, 4.5)]


@unittest.skipUnless(VIDEO, "needs ffmpeg with libx264")
class AnalyseRun(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.run_dir = os.path.join(cls.tmp.name, "1")
        write_run(cls.run_dir, [scene(k) for k in range(361)], [10 * k for k in range(361)], MOMENTS, APP_FRAMES,
                  [acted for _, _, _, acted in MOMENTS])
        cls.maxfps, cls.result, cls.warnings = mr.analyse_run(cls.run_dir, CFG)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_one_50ms_frame_while_pixels_move(self):
        r = self.result["slide"]
        # The motion runs from one refresh before the first moved frame (0.7 s) to the last (1.0 s).
        motion_s = 1.0 - (0.7 - R)
        self.assertAlmostEqual(r["motion_hitch_ms_per_s"], (50 - 1000 / 60) / motion_s, delta=1.0)
        self.assertAlmostEqual(r["motion_worst_ms"], 50, delta=0.5)
        self.assertAlmostEqual(r["response_stall_ms"], 50, delta=0.5)
        self.assertAlmostEqual(r["settle_ms"], motion_s * 1000, delta=2)
        self.assertEqual(r["pops"], 0)

    def test_a_snap_is_a_pop(self):
        r = self.result["snap"]
        self.assertEqual(r["pops"], 1)
        self.assertAlmostEqual(r["max_jump_pct"], 100 * 120 * W / (W * (H - int(H * CFG["status_bar_share"]))),
                               delta=1.0)
        self.assertAlmostEqual(r["response_stall_ms"], 1000 / 60, delta=0.5)

    def test_a_tail_within_120ms_is_not_a_new_arrival(self):
        self.assertEqual(self.result["tail_near"]["pops"], 0)
        self.assertEqual(self.result["tail_far"]["pops"], 1)

    def test_nothing_else_is_flagged(self):
        self.assertEqual(self.maxfps, 60)
        self.assertEqual(self.warnings, [])
        for name in self.result:
            self.assertEqual(self.result[name]["late_pct"], 0, name)
            self.assertEqual(self.result[name]["unverified_pops"], 0, name)
            self.assertEqual(self.result[name]["recorder_gaps"], 0, name)

    def test_a_name_used_three_times_keeps_all_three(self):
        run_dir = os.path.join(self.tmp.name, "repeats")
        write_run(run_dir, None, None, [("tap", b, e, a) for _, b, e, a in MOMENTS[:3]], APP_FRAMES, [])
        os.symlink(os.path.join(self.run_dir, "screen.mp4"), os.path.join(run_dir, "screen.mp4"))
        _, result, _ = mr.analyse_run(run_dir, CFG)
        self.assertEqual(sorted(result), ["tap", "tap#2", "tap#3"])
        self.assertEqual(result["tap#2"]["pops"], 1)  # the snap, not overwritten by the third
        self.assertEqual(fs.find_moment(mr.read_marks(os.path.join(run_dir, "marks.log")), "tap#3")["acted"],
                         3.0 + 1000.0)


# ---------------------------------------------------------------------------------------------
# frame_strip


# Frame times in 1/600 s: steady stretches, a 150 ms hole (240), a burst 3 ms apart (250-254), and
# long holes. Frame k is a flat grey 20 + 9k, so every tile says which frame it shows.
STRIP_UNITS = [0, 60, 120, 130, 140, 150, 240, 250, 252, 254, 264, 360, 420, 430, 440, 450, 460, 600, 610, 620,
               630, 640, 650, 660]
ACTED = 0.3037  # video seconds, off the 1/600 s grid: no sample time ties with a frame's stamp


def grey(k):
    return 20 + 9 * k


@unittest.skipUnless(VIDEO, "needs ffmpeg with libx264")
class FrameStrip(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.run_dir = os.path.join(cls.tmp.name, "1")
        frames = [np.full((H, W), grey(k), np.uint8) for k in range(len(STRIP_UNITS))]
        write_run(cls.run_dir, frames, STRIP_UNITS, [("open", 0.0, 1.1, ACTED)], [k * R for k in range(66)], [ACTED])
        cls.pts = np.array(STRIP_UNITS) / 600

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    @staticmethod
    def shown(pixels):
        """Which frame some pixels show (every frame is one flat grey), and that grey."""
        v = int(round(np.asarray(pixels, dtype=float).mean()))
        return int(np.argmin([abs(grey(k) - v) for k in range(len(STRIP_UNITS))])), v

    def test_each_tile_is_the_frame_on_screen_at_its_time(self):
        out = os.path.join(self.tmp.name, "strip.png")
        offsets = [-0.3 + 0.05 * k for k in range(23)]  # every 50 ms from the first frame to 1.1 s
        code, text = quiet(fs.main, [self.run_dir, "open", "--from", "-0.3", "--to", "0.8", "--n", "23",
                                     "--width", "60", "--out", out])
        self.assertEqual(code, 0)
        from PIL import Image
        img = np.asarray(Image.open(out).convert("RGB"))
        th = fs.tile_size(W, H, 60)[1]
        self.assertEqual(img.shape, (th, 23 * 60 + 22 * fs.TILE_GAP, 3))
        in_a_hole = 0
        for k, off in enumerate(offsets):
            t = ACTED + off
            want = int(np.searchsorted(self.pts, t, side="right")) - 1  # the last frame stamped <= t
            tile = img[:, k * (60 + fs.TILE_GAP):k * (60 + fs.TILE_GAP) + 60]
            got, v = self.shown(tile[th // 4:])
            self.assertEqual(got, want, f"tile {k} at {off * 1000:+.0f} ms shows frame {got} (grey {v})")
            if want + 1 < len(self.pts) and self.pts[want] < t - 1e-6 < self.pts[want + 1] - 0.02:
                in_a_hole += 1  # a seek to t would have shown the next frame instead
        self.assertGreaterEqual(in_a_hole, 5)
        self.assertIn("RECORDER GAP", text)  # 150 ms holes at 60 Hz

    def test_a_single_frame_and_its_diff(self):
        from PIL import Image
        out = os.path.join(self.tmp.name, "frame.png")
        code, _ = quiet(fs.main, ["frame", self.run_dir, "open", "--at", "0.1", "--out", out])  # t = 0.4037 s
        self.assertEqual(code, 0)
        img = np.asarray(Image.open(out).convert("RGB"))
        self.assertEqual(img.shape, (H, W, 3))  # full size by default
        self.assertEqual(self.shown(img[H // 4:])[0], 6)  # stamped 0.4 s; the next comes at 0.4167 s
        same = os.path.join(self.tmp.name, "same.png")
        other = os.path.join(self.tmp.name, "other.png")
        Image.fromarray(np.full((H, W), grey(6), np.uint8)).save(same)
        Image.fromarray(np.full((H, W), grey(9), np.uint8)).save(other)
        self.assertEqual(quiet(fs.main, ["diff", out, same])[0], 0)
        self.assertEqual(quiet(fs.main, ["diff", out, other])[0], 1)

    def test_a_decoder_that_disagrees_with_the_pts_is_refused(self):
        video = os.path.join(self.run_dir, "screen.mp4")
        with self.assertRaises(mr.InputError):
            fs.decode(video, len(self.pts) + 1, {3}, (60, 130))
        self.assertEqual(set(fs.decode(video, len(self.pts), {3, 23}, (60, 130))), {3, 23})


class FrameStripPure(unittest.TestCase):
    def test_on_screen_is_the_last_frame_at_or_before_t(self):
        pts = np.array([0.0, 0.1, 0.1, 0.25])
        self.assertEqual(fs.on_screen(pts, -0.01), -1)
        self.assertEqual(fs.on_screen(pts, 0.05), 0)
        self.assertEqual(fs.on_screen(pts, 0.1), 2)  # of two frames stamped alike, the later one shows
        self.assertEqual(fs.on_screen(pts, 0.2499), 2)
        self.assertEqual(fs.on_screen(pts, 9.0), 3)

    def test_diff_ignores_the_status_bar_and_fails_past_the_limit(self):
        from PIL import Image
        with tempfile.TemporaryDirectory() as d:
            base = np.full((200, 100), 120, np.uint8)
            paths = {}
            for name, (y0, y1) in {"same": (0, 0), "bar": (0, 10), "block": (100, 120)}.items():
                img = base.copy()
                img[y0:y1, 0:20] = 250
                paths[name] = os.path.join(d, name + ".png")
                Image.fromarray(img).save(paths[name])
            a = os.path.join(d, "a.png")
            Image.fromarray(base).save(a)
            self.assertEqual(quiet(fs.main, ["diff", a, paths["same"]])[0], 0)
            self.assertEqual(quiet(fs.main, ["diff", a, paths["bar"]])[0], 0)  # inside the top 6%
            code, text = quiet(fs.main, ["diff", a, paths["block"]])
            self.assertEqual(code, 1)
            self.assertIn("2.128% of pixels", text)  # 400 of the 18,800 compared
            self.assertEqual(quiet(fs.main, ["diff", a, paths["block"], "--max-share", "0.05"])[0], 0)


if __name__ == "__main__":
    unittest.main()
