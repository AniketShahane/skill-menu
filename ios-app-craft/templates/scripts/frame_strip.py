#!/usr/bin/env python3
"""Frame strip: the frames a moment showed, side by side, each picked by when it was on screen.

What: reads one run folder that motion-check.sh recorded (screen.mp4, video_start, marks.log,
frames.log; see motion_report.py) and lines the video up with a moment the way the report does.
Three modes:
  strip  N frames evenly spaced from --from to --to seconds around the moment's acted time (the
         finger lift, or the end of the gesture), in one row or a --grid contact sheet. It prints
         which recorded frame each tile shows and how old that frame was.
  frame  the one frame on screen at --at seconds, full size unless --width says otherwise.
  diff   the share of pixels of two images whose grey level differs by more than --threshold. It
         exits 1 above --max-share. It is the gate for "the flight's t=0 frame equals the list
         screenshot, and the landing frame equals the settled page".

Run (RUN_DIR is one run, e.g. build/motion/runs/1; MOMENT is a name from its marks.log, and a
name's second and later occurrences are name#2, name#3, as in the report):
  frame_strip.py RUN_DIR MOMENT [--from -0.05] [--to 0.6] [--n 12] [--width 160] [--grid COLS]
      [--label] [--retime] [--out PNG]
  frame_strip.py frame RUN_DIR MOMENT --at S --out PNG [--width PX] [--retime]
  frame_strip.py diff A.png B.png [--threshold 24] [--max-share 0.002] [--ignore-top 0.06] [--show PNG]
Needs python3 with numpy and Pillow, ffmpeg and ffprobe, and motion_report.py next to it. Exit 0
done, 1 diff over its limit, 2 unusable input.

Lessons it encodes:
  - Pick frames by presentation time from one decoded array, never by time inside ffmpeg.
    simctl recordVideo writes variable-frame-rate video with bursts. `ffmpeg -ss` on it returned
    frames from the wrong moment and showed a "flash" that never happened.
  - The cause: ffmpeg times each decoded frame with libavcodec's best-effort timestamp. On a
    simctl recording, the first repeated pts makes that fall back to the dts, which ran 0.99 s
    behind the pts. So `-ss`, `trim` and `select` by time all land about a second away, even
    with -copyts. Only the frame's position in decode order is reliable: `select` by n.
  - The frame on screen at t is the last one stamped at or before t
    (searchsorted(pts, t, side="right") - 1), not the next one. After a change the recorder saves
    nothing until the next change, so the next frame can be far in the future.
  - The recording has B-frames: packets are stored out of display order. The pts come from the
    packet list, sorted: 0.1 s, against 22 s for a frame-level ffprobe on a 150 s journey. On a
    real run they equal the decoded frames' pts, all 10,307. The decoder must then produce exactly
    one frame per pts, and the tool checks the count on every call: ffmpeg decodes from the first
    frame to the last (about 6 s for 150 s of video) and scales only the frames it keeps.
  - Frame times are the recorder's own pts. For its metrics, motion_report.retime() spreads each
    recorder burst back to one refresh per frame. On a real run it moved 29% of frames, by up to
    257 ms. In one card flight the recorder saved frames about 5 ms apart for 400 ms, and re-timing
    put the landed page 5 ms before the tap that opened it, which cannot be. So a strip shows
    frames as stamped, and the table notes where the report's timeline differs by more than a
    refresh. --retime picks on the report's timeline instead.
  - A tile whose frame is older than 1.6 refreshes sits in a recorder gap. With FrameProbe's
    beacon every shown frame is saved, so a gap is the recorder's, and the tile may be older than
    what the screen showed. It is flagged in the table and, with --label, drawn with a red label.
  - A strip only samples. A one- or two-frame flash can fall between its tiles, so when a moment
    blinks, sample every frame (--n as large as the frame count, --grid) or scan the frames.
"""
import argparse
import math
import os
import re
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_report as mr  # noqa: E402  (the report's reading and alignment code, shared)

InputError = mr.InputError
GAP_COLOUR, LABEL_COLOUR, BACKGROUND = (200, 30, 30), (0, 0, 0), (40, 40, 40)
TILE_GAP = 2  # px between tiles


def run(args):
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        raise InputError(f"{args[0]} failed on {args[-1]}: {r.stderr.strip()[:400]}")
    return r.stdout


# ---------------------------------------------------------------------------------------------
# The video's timeline


def read_pts(video):
    """Presentation times of every frame, in display order: the order the decoder hands frames
    out. Packets are stored in decode order (the recorder writes B-frames), so their pts are
    sorted. A packet with no pts falls back to asking the decoder, which is slow on a long
    recording."""
    out = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time",
               "-of", "csv=p=0", video])
    try:
        pts = np.sort(np.array([float(x.strip(",")) for x in out.split() if x.strip(",")]))
    except ValueError:
        out = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time",
                   "-of", "csv=p=0", video])
        pts = np.array([float(x.strip(",")) for x in out.split() if x.strip(",")])
        if np.any(np.diff(pts) < 0):
            raise InputError(f"{video}: frame times go backwards")
    if len(pts) == 0:
        raise InputError(f"{video} has no frames")
    return pts


def video_size(video):
    w, h = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                "-of", "csv=p=0", video]).strip().split(",")[:2]
    return int(w), int(h)


def tile_size(w, h, width):
    """The report's scaling: `width` px wide, an even height. 0 keeps the video's size."""
    if not width:
        return w, h
    return int(width), max(2, int(round(h * width / w / 2) * 2))


def on_screen(pts, t):
    """Index of the frame on screen at time t: the last one stamped at or before t. -1 before the
    first frame."""
    return int(np.searchsorted(pts, t, side="right")) - 1


def find_moment(marks, name):
    """The mark called `name`. A name's second and later occurrences are name#2, name#3, ..."""
    seen, names = {}, []
    for m in marks:
        k = seen[m["name"]] = seen.get(m["name"], 0) + 1
        label = m["name"] if k == 1 else f"{m['name']}#{k}"
        if label == name:
            return m
        names.append(label)
    raise InputError(f"no moment '{name}' in marks.log; it has: {', '.join(names)}")


def to_video(m, vstart, media):
    """Media clock (CACurrentMediaTime, as in marks.log and frames.log) to video seconds, through
    the moment's own begin in both clocks, exactly as motion_report.analyse_run does."""
    return media - m["begin"] + m["begin_wall"] - vstart


def load_run(run_dir, moment, retime=False):
    def need(name):
        path = os.path.join(run_dir, name)
        if not os.path.exists(path):
            hint = ""
            if os.path.isdir(os.path.join(run_dir, "runs")):
                hint = f" (pass one run folder, e.g. {os.path.join(run_dir, 'runs', '1')})"
            raise InputError(f"{path} is missing{hint}")
        return path

    video = need("screen.mp4")
    marks = mr.read_marks(need("marks.log"))
    with open(need("video_start")) as f:
        vstart = float(f.read().strip())
    m = find_moment(marks, moment)
    raw = read_pts(video)
    maxfps, _, _ = mr.read_frames(need("frames.log"))
    refresh = 1.0 / maxfps
    retimed = mr.retime(raw, refresh)
    if retime and np.any(np.diff(retimed) < 0):
        raise InputError("the report's re-timed frame times go backwards here; leave out --retime")
    acted = to_video(m, vstart, m["acted"])
    window = (to_video(m, vstart, m["begin"]) - acted, to_video(m, vstart, m["end"]) - acted)
    return dict(video=video, raw=raw, retimed=retimed, timeline=retimed if retime else raw, acted=acted,
                window=window, refresh=refresh)


# ---------------------------------------------------------------------------------------------
# Decoding a window of frames


def decode(video, count, indices, size):
    """The frames at `indices` (positions in display order, as in the pts list) as {index: HxWx3}.

    ffmpeg decodes from the first frame and `select` keeps frames by their number n, never by time:
    ffmpeg's own frame times are not the file's pts (see the docstring). Only the kept frames are
    scaled. The last frame is kept too, so the number of frames received proves the decoder made
    exactly `count` frames, one per pts; otherwise frame n is not pts[n] and nothing is returned."""
    lo, hi = min(indices), max(indices)
    last = count - 1
    width, height = size
    expected = hi - lo + 1 + (1 if hi < last else 0)
    chain = [f"select='between(n,{lo},{hi})+gte(n,{last})'", f"scale={width}:{height}:flags=area", "format=rgb24"]
    cmd = ["ffmpeg", "-hide_banner", "-nostats", "-v", "error", "-i", video, "-map", "0:v:0",
           "-fps_mode", "passthrough", "-vf", ",".join(chain), "-f", "rawvideo", "-"]
    frame_bytes = width * height * 3
    kept, received = {}, 0
    with tempfile.TemporaryFile() as err:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=err)
        while True:
            buf = proc.stdout.read(frame_bytes)
            if len(buf) < frame_bytes:
                break
            n = lo + received
            if n in indices:
                kept[n] = np.frombuffer(buf, dtype=np.uint8).reshape(height, width, 3)
            received += 1
        proc.stdout.close()
        status = proc.wait()
        err.seek(0)
        log = err.read().decode(errors="replace")
    if status != 0:
        raise InputError(f"ffmpeg failed on {video}: {log.strip()[-400:]}")
    if received != expected:
        raise InputError(f"{video}: ffmpeg decoded a different number of frames than the file has pts "
                         f"({received} received, {expected} expected), so frame n is not pts[n]")
    return kept


# ---------------------------------------------------------------------------------------------
# Pictures


def font_for(width):
    try:
        return ImageFont.load_default(size=max(10, width // 11))
    except TypeError:  # Pillow before 10.1: one bitmap size
        return ImageFont.load_default()


def label_tile(img, text, alert=False):
    draw = ImageDraw.Draw(img)
    font = font_for(img.width)
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    draw.rectangle([0, 0, right + 4, bottom + 4], fill=GAP_COLOUR if alert else LABEL_COLOUR)
    draw.text((2, 2), text, fill=(255, 255, 255), font=font)


def sheet(tiles, cols):
    w, h = tiles[0].size
    rows = math.ceil(len(tiles) / cols)
    out = Image.new("RGB", (cols * w + (cols - 1) * TILE_GAP, rows * h + (rows - 1) * TILE_GAP), BACKGROUND)
    for k, tile in enumerate(tiles):
        out.paste(tile, ((k % cols) * (w + TILE_GAP), (k // cols) * (h + TILE_GAP)))
    return out


def pick(r, offsets):
    """For each offset (seconds from the acted time): the index of the frame on screen then."""
    picks = []
    for off in offsets:
        i = on_screen(r["timeline"], r["acted"] + off)
        if i < 0:
            raise InputError(f"{off * 1000:+.0f} ms is before the recording's first frame")
        picks.append(i)
    return picks


def describe(r, off, i):
    """One table row: which frame, when it appeared, how old it was, and whether the report's
    re-timed timeline puts it more than a refresh elsewhere."""
    t = r["acted"] + off
    shown, age = r["timeline"][i], t - r["timeline"][i]
    gap = age > mr.GAP * r["refresh"]
    text = (f"  {off * 1000:+7.0f} ms   frame {i:6d}   on screen from {(shown - r['acted']) * 1000:+7.1f} ms"
            f"   {age * 1000:6.1f} ms old")
    moved = r["retimed"][i] - r["raw"][i]
    if abs(moved) > r["refresh"]:
        text += f"   report re-times it {moved * 1000:+.0f} ms"
    if gap:
        text += "   RECORDER GAP: the screen may have changed since"
    return text, gap


# ---------------------------------------------------------------------------------------------
# Modes


def cmd_strip(a):
    if a.n < 1 or a.to < a.start or a.width < 0 or (a.grid is not None and a.grid < 1):
        raise InputError("need --n >= 1, --to >= --from, --width >= 0 and --grid >= 1")
    r = load_run(a.run_dir, a.moment, a.retime)
    offsets = [a.start] if a.n == 1 else [a.start + (a.to - a.start) * k / (a.n - 1) for k in range(a.n)]
    picks = pick(r, offsets)
    frames = decode(r["video"], len(r["raw"]), set(picks), tile_size(*video_size(r["video"]), a.width))
    print(f"{a.moment}: acted at {r['acted']:.3f} s into {r['video']}; the moment runs "
          f"{r['window'][0] * 1000:+.0f} to {r['window'][1] * 1000:+.0f} ms around it. Frame times: "
          + ("re-timed as in the report (--retime)." if a.retime else "the recorder's own pts."))
    tiles = []
    for off, i in zip(offsets, picks):
        text, gap = describe(r, off, i)
        print(text)
        tile = Image.fromarray(frames[i])
        if a.label:
            label_tile(tile, f"{off * 1000:+.0f} ms", alert=gap)
        tiles.append(tile)
    out = a.out or os.path.join(a.run_dir, "strip_" + re.sub(r"[^A-Za-z0-9_.-]", "_", a.moment) + ".png")
    sheet(tiles, a.grid or len(tiles)).save(out)
    print(f"wrote {out}")
    return 0


def cmd_frame(a):
    if a.width < 0:
        raise InputError("--width must be 0 (full size) or more")
    r = load_run(a.run_dir, a.moment, a.retime)
    [i] = pick(r, [a.at])
    frames = decode(r["video"], len(r["raw"]), {i}, tile_size(*video_size(r["video"]), a.width))
    print(describe(r, a.at, i)[0].strip())
    Image.fromarray(frames[i]).save(a.out)
    print(f"wrote {a.out}")
    return 0


def cmd_diff(a):
    try:
        imgs = [Image.open(p).convert("L") for p in (a.a, a.b)]
    except OSError as e:
        raise InputError(str(e))
    (wa, ha), (wb, hb) = imgs[0].size, imgs[1].size
    if abs(wa / ha - wb / hb) > 0.01 * wa / ha:
        raise InputError(f"{a.a} is {wa}x{ha} and {a.b} is {wb}x{hb}: not the same screen")
    if (wa, ha) != (wb, hb):  # compare at the smaller size, averaging the larger down
        small = min((wa, ha), (wb, hb))
        imgs = [im if im.size == small else im.resize(small, Image.BOX) for im in imgs]
        print(f"compared at {small[0]}x{small[1]} ({wa}x{ha} vs {wb}x{hb})")
    a_px, b_px = (np.asarray(im, dtype=np.int16) for im in imgs)
    top = int(a_px.shape[0] * a.ignore_top)
    hard = np.abs(a_px - b_px)[top:] > a.threshold
    share = float(hard.mean()) if hard.size else 0.0
    ok = share <= a.max_share
    print(f"{'PASS' if ok else 'FAIL'}: {share * 100:.3f}% of pixels differ by more than {a.threshold} grey levels "
          f"(limit {a.max_share * 100:.3f}%; the top {a.ignore_top:.0%} left out)")
    if hard.any():
        ys, xs = np.nonzero(hard)
        h, w = a_px.shape
        print(f"  where: x {xs.min()}-{xs.max()}, y {ys.min() + top}-{ys.max() + top} of {w}x{h} px")
    if a.show:
        view = np.repeat((a_px // 3).astype(np.uint8)[:, :, None], 3, axis=2)
        view[top:][hard] = (255, 40, 40)
        Image.fromarray(view).save(a.show)
        print(f"wrote {a.show}")
    return 0 if ok else 1


def parsers():
    fmt = argparse.RawDescriptionHelpFormatter
    strip = argparse.ArgumentParser(
        prog="frame_strip.py", formatter_class=fmt,
        description="Frames of one motion-check moment side by side, each the frame on screen at its time.",
        epilog="other modes:\n"
               "  frame_strip.py frame RUN_DIR MOMENT --at S --out PNG [--width PX] [--retime]\n"
               "      the one frame on screen at S seconds from the acted time (full size by default)\n"
               "  frame_strip.py diff A.png B.png [--threshold 24] [--max-share 0.002] [--ignore-top 0.06] "
               "[--show PNG]\n"
               "      share of pixels that differ; exit 1 when it is over --max-share\n"
               "Times are seconds from the moment's acted time (the finger lift or gesture end).")
    strip.add_argument("run_dir", help="one run folder of motion-check.sh, e.g. build/motion/runs/1")
    strip.add_argument("moment", help="a moment name from marks.log (a repeat is name#2, name#3, ...)")
    strip.add_argument("--from", dest="start", type=float, default=-0.05, help="first tile, s from acted (-0.05)")
    strip.add_argument("--to", type=float, default=0.6, help="last tile, s from acted (0.6)")
    strip.add_argument("--n", type=int, default=12, help="tiles, evenly spaced (12)")
    strip.add_argument("--width", type=int, default=160, help="tile width in px; 0 keeps full size (160)")
    strip.add_argument("--grid", type=int, metavar="COLS", help="a contact sheet with COLS columns instead of a row")
    strip.add_argument("--label", action="store_true", help="draw each tile's offset in ms (red: a recorder gap)")
    strip.add_argument("--retime", action="store_true", help="pick on the report's re-timed frame times")
    strip.add_argument("--out", help="PNG to write (default RUN_DIR/strip_MOMENT.png)")

    frame = argparse.ArgumentParser(prog="frame_strip.py frame",
                                    description="The one frame on screen at --at seconds from the acted time.")
    frame.add_argument("run_dir")
    frame.add_argument("moment")
    frame.add_argument("--at", type=float, required=True, help="seconds from the acted time")
    frame.add_argument("--out", required=True, help="PNG to write")
    frame.add_argument("--width", type=int, default=0, help="px wide; 0 keeps full size (0)")
    frame.add_argument("--retime", action="store_true", help="pick on the report's re-timed frame times")

    diff = argparse.ArgumentParser(prog="frame_strip.py diff",
                                   description="Share of pixels whose grey level differs by more than --threshold.")
    diff.add_argument("a")
    diff.add_argument("b")
    diff.add_argument("--threshold", type=int, default=int(mr.DETECTOR["hard_change"]),
                      help="grey levels a pixel must differ by (24, the report's hard_change)")
    diff.add_argument("--max-share", type=float, default=0.002, help="fail above this share of pixels (0.002)")
    diff.add_argument("--ignore-top", type=float, default=mr.DETECTOR["status_bar_share"],
                      help="top share left out: the status bar and its beacon (0.06)")
    diff.add_argument("--show", help="also write a PNG with the differing pixels in red")
    return strip, frame, diff


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    strip, frame, diff = parsers()
    if argv and argv[0] == "diff":
        return cmd_diff(diff.parse_args(argv[1:]))
    if argv and argv[0] == "frame":
        return cmd_frame(frame.parse_args(argv[1:]))
    return cmd_strip(strip.parse_args(argv))


if __name__ == "__main__":
    try:
        sys.exit(main())
    except InputError as e:
        print(f"frame_strip: {e}", file=sys.stderr)
        sys.exit(2)
