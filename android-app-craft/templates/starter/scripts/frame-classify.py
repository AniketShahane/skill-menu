#!/usr/bin/env python3
"""Classifies each janky frame in a `dumpsys gfxinfo <pkg> framestats` dump as a late start
(pacing), UI-thread work, RenderThread work or GPU work. Columns follow HWUI's FrameInfo names.

  frame-classify.py <dump>             e.g. .tools/perf/<label>.gfx from scripts/measure-frames.sh
  frame-classify.py <dump> --hz 60     frame interval to assume when a row has no FrameInterval

Ported from dash:scripts/frame-classify.py. It is what showed Dash's card-flight stutter was
the RenderThread (oversized map bitmaps), not composition (dash@c4ab031). A frame counts as
janky when its GPU work completed at or after its deadline. Then, in order:
  late start   the frame began > 25 % of an interval late while UI < 50 % and RT < 75 % of it
  UI thread    UI time >= RenderThread + GPU time
  GPU          GPU time > RenderThread time
  RenderThread everything else
framestats keeps only the most recent ~120 frames, so dump right after the gesture.
"""
import sys


def main(argv):
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print(__doc__.strip())
        return 0 if len(argv) >= 2 else 2
    hz = 120.0
    if "--hz" in argv:
        hz = float(argv[argv.index("--hz") + 1])
    default_interval = int(1e9 / hz)

    rows = []
    try:
        lines = open(argv[1], encoding="utf-8", errors="ignore").read().splitlines()
    except OSError as failure:
        sys.exit(f"frame-classify.py: {failure}")
    inside = False
    header = None
    for line in lines:
        if line.startswith("---PROFILEDATA---"):
            inside = not inside
            header = None
            continue
        if not inside:
            continue
        parts = line.strip().rstrip(",").split(",")
        if header is None and parts and parts[0] == "Flags":
            header = parts
            continue
        if header and len(parts) >= len(header) and parts[0].lstrip("-").isdigit():
            rows.append(dict(zip(header, map(int, parts[: len(header)]))))

    def ms(ns):
        return ns / 1e6

    late = ui = rt = gpu = ok = 0
    for f in rows:
        if f["Flags"] & 0b1101:  # window-layout-changed, surface-canvas, skipped
            continue
        interval = f.get("FrameInterval") or default_interval
        start_late = f["Vsync"] - f["IntendedVsync"]
        ui_ms = ms(f["SyncStart"] - f["Vsync"])
        rt_ms = ms(f["FrameCompleted"] - f["IssueDrawCommandsStart"])
        gpu_ms = ms(f["GpuCompleted"] - f["FrameCompleted"]) if f.get("GpuCompleted") else 0
        done = f.get("GpuCompleted") or f["FrameCompleted"]
        if done < f["FrameDeadline"]:
            ok += 1
            continue
        total = ms(done - f["IntendedVsync"])
        if start_late > interval * 0.25 and ui_ms < ms(interval) * 0.5 and rt_ms < ms(interval) * 0.75:
            late += 1
            why = "LATE START (pacing)"
        elif ui_ms >= rt_ms + gpu_ms:
            ui += 1
            why = "UI thread"
        elif gpu_ms > rt_ms:
            gpu += 1
            why = "GPU"
        else:
            rt += 1
            why = "RenderThread"
        print(
            f"vsync={f.get('FrameTimelineVsyncId', '?')} total={total:5.1f}ms late={ms(start_late):4.1f} "
            f"ui={ui_ms:4.1f} rt={rt_ms:4.1f} gpu={gpu_ms:4.1f}  -> {why}"
        )
    print(
        f"\nframes={len(rows)} ok={ok} janky={late + ui + rt + gpu}  "
        f"late-start={late} ui={ui} renderthread={rt} gpu={gpu}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
