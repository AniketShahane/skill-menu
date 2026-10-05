"""Visual QA: beat sheets to look at, every logged issue, and the frame at any moment.

Usage (with the skill venv's python):
  qa.py [l|m|h|k] [Scene ...]   beat sheets: the settled last frame of every narrated beat, captioned with
                                time + line, 3x3 per page -> qa/<Scene>-<page>.png. Then Read every page.
  qa.py --issues                only print logged issues (layout, overruns, voice) for current lines
  qa.py --at 2:31 [--q h]       the frame at that time in the assembled video (or 151.5 seconds):
                                prints scene, local time, narration line; writes qa/at_<t>.png
"""
import json
import subprocess
import sys
import tempfile
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

import tts

ROOT = Path(__file__).resolve().parent
VIDEO = json.loads((ROOT / "video.json").read_text())
QDIRS = {"l": "480p15", "m": "720p30", "h": "1080p60", "k": "2160p60"}
OUT = ROOT / "qa"


def video_path(s, q):
    return ROOT / f"media_{s['class']}" / "videos" / Path(s["file"]).stem / QDIRS[q] / f"{s['class']}.mp4"


def best_quality(s, prefer=None):
    for q in ([prefer] if prefer else []) + ["h", "k", "m", "l"]:
        if q and video_path(s, q).exists():
            return q
    return None


def dur(p):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                          "-of", "csv=p=0", str(p)]))


def frame(video, t, png):
    """Grab the frame at t; seeking at/after the last frame yields nothing, so step back if needed."""
    for back in (0, 0.15, 0.4, 1.0):
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{max(t - back, 0):.3f}", "-i", str(video),
                        "-frames:v", "1", str(png)], check=True)
        if Path(png).exists() and Path(png).stat().st_size:
            return
    raise RuntimeError(f"could not grab a frame at {t:.2f}s from {video}")


def end(e):
    return e[3] if len(e) > 3 and e[3] else e[0] + e[1]


def subs(c):
    f = ROOT / "media" / "subs" / f"{c}.json"
    return json.loads(f.read_text())["subs"] if f.exists() else []


def font(size):
    for f in ["/System/Library/Fonts/Helvetica.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def issues():
    n = 0
    for s in VIDEO["scenes"]:
        lay = ROOT / "media" / "qa" / f"{s['class']}.layout.json"
        for i in (json.loads(lay.read_text()) if lay.exists() else []):
            n += 1
            print(f"    {s['class']:14} t={i['t']:6.1f}s  {i['kind']:9} {i['what']}")
    n += tts.print_voice_issues([ROOT / s["file"] for s in VIDEO["scenes"]], ROOT)
    return n


def sheets(q, only):
    OUT.mkdir(exist_ok=True)
    W, CAP = 640, 46
    for s in VIDEO["scenes"]:
        c = s["class"]
        if only and c not in only:
            continue
        v = video_path(s, q)
        if not v.exists():
            print(f"{c}: not rendered at {QDIRS[q]}")
            continue
        d = dur(v)
        beats = [end(e) - 0.08 for e in subs(c)]
        lines = [e[2] for e in subs(c)]
        if not beats:  # silent scene: 9 even samples
            beats, lines = [d * (k + 0.5) / 9 for k in range(9)], [""] * 9
        beats.append(d - 0.05)
        lines.append("(end of scene)")
        with tempfile.TemporaryDirectory() as tmp:
            tiles = []
            for k, (t, line) in enumerate(zip(beats, lines)):
                p = Path(tmp) / f"{k}.png"
                frame(v, min(t, d - 0.1), p)
                im = Image.open(p).convert("RGB")
                im = im.resize((W, int(im.height * W / im.width)))
                tile = Image.new("RGB", (W, im.height + CAP), (40, 40, 40))
                tile.paste(im, (0, 0))
                dr = ImageDraw.Draw(tile)
                dr.text((8, im.height + 4), f"{t:5.1f}s", fill=(255, 210, 100), font=font(18))
                for row, part in enumerate(textwrap.wrap(line, 64)[:2]):
                    dr.text((80, im.height + 4 + 20 * row), part, fill=(230, 230, 230), font=font(16))
                tiles.append(tile)
        th = tiles[0].height
        pages = [tiles[i:i + 9] for i in range(0, len(tiles), 9)]
        for pi, page in enumerate(pages, 1):
            sheet = Image.new("RGB", (3 * W + 8, ((len(page) + 2) // 3) * (th + 4)), (90, 90, 90))
            for k, tile in enumerate(page):
                sheet.paste(tile, ((k % 3) * (W + 4), (k // 3) * (th + 4)))
            out = OUT / f"{c}-{pi}.png"
            sheet.save(out)
            print(f"{c}: {d:5.1f}s  {out}")


def at(spec, prefer):
    t = sum(float(x) * 60 ** i for i, x in enumerate(reversed(spec.split(":"))))
    off = 0.0
    for s in VIDEO["scenes"]:
        q = best_quality(s, prefer)
        if not q:
            sys.exit(f"{s['class']} is not rendered; can't map times past it")
        d = dur(video_path(s, q))
        if t < off + d:
            local = t - off
            line = next((e[2] for e in subs(s["class"]) if e[0] <= local < end(e)), "(no narration)")
            OUT.mkdir(exist_ok=True)
            png = OUT / f"at_{t:.1f}.png"
            frame(video_path(s, q), local, png)
            print(f"{spec} = {s['class']} ({s['file']}) at {local:.2f}s [{QDIRS[q]}]\n  line: {line}\n  frame: {png}")
            return
        off += d
    sys.exit(f"{spec} is past the end ({off:.1f}s)")


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["--issues"]:
        n = issues()
        print(f"{n} issue(s)")
        sys.exit(1 if n else 0)
    if a[:1] == ["--at"]:
        at(a[1], a[3] if a[2:3] == ["--q"] else None)
        sys.exit(0)
    q = a.pop(0) if a and a[0] in ("l", "m", "h", "k") else "l"
    sheets(q, a)
    n = issues()
    print(f"\n{n} logged issue(s). Logged issues are not everything: Read every sheet.")
