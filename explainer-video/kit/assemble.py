"""Join rendered scenes into one video with soft subtitles, chapter markers and a chapters list.

Usage:  python assemble.py [l|m|h|k]      (default h)
Writes: out/<slug>.mp4, out/<slug>.srt, out/chapters.txt (YouTube-style timestamps)
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
QDIR = {"l": "480p15", "m": "720p30", "h": "1080p60", "k": "2160p60"}[sys.argv[1] if len(sys.argv) > 1 else "h"]
VIDEO = json.loads((ROOT / "video.json").read_text())
SLUG = re.sub(r"[^a-z0-9]+", "_", VIDEO.get("title", "explainer").lower()).strip("_") or "explainer"


def dur(p):
    return float(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)]))


def ts(t, sep=","):
    ms = int(round(max(t, 0) * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02}{sep}{ms:03}"


def wrap(text, width=42):
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > width and cur:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    lines.append(cur)
    return lines


def fit(chunk):
    """Split a chunk at word boundaries until every piece wraps to at most two 42-char lines."""
    if len(wrap(chunk)) <= 2 or " " not in chunk:
        return [chunk]
    w = chunk.split()
    return fit(" ".join(w[:len(w) // 2])) + fit(" ".join(w[len(w) // 2:]))


def cues(t0, d, text):
    """Subtitle cues for one narrated line: sentence boundaries first, then word splits; timed by length."""
    chunks = [p for s in re.split(r"(?<=[.!?;:])\s+", text) for p in fit(s) if p.strip()]
    total = sum(len(c) for c in chunks) or 1
    out, t = [], t0
    for c in chunks:
        cd = d * len(c) / total
        out.append((t, t + cd, "\n".join(wrap(c))))
        t += cd
    return out


def clock(t):
    s = int(round(t))
    return f"{s // 3600}:{s % 3600 // 60:02}:{s % 60:02}" if s >= 3600 else f"{s // 60:02}:{s % 60:02}"


def main():
    out = ROOT / "out"
    parts_dir = out / "parts"
    parts_dir.mkdir(parents=True, exist_ok=True)
    files, srt, chapters, offset = [], [], [], 0.0
    for s in VIDEO["scenes"]:
        f, c = Path(s["file"]).stem, s["class"]
        v = ROOT / f"media_{c}" / "videos" / f / QDIR / f"{c}.mp4"
        if not v.exists():
            sys.exit(f"missing {v} — render it first (./render.sh {sys.argv[1] if len(sys.argv) > 1 else 'h'} {c})")
        d = dur(v)
        # Pad audio to exactly the video length; otherwise each scene's short audio makes later
        # narration drift early after concatenation (measured: ~3 s by the end of a 10-minute video).
        fixed = parts_dir / f"{c}.mov"
        has_audio = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries",
                                    "stream=index", "-of", "csv=p=0", str(v)], capture_output=True, text=True).stdout.strip()
        if has_audio:
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(v), "-c:v", "copy",
                   "-af", f"apad=whole_dur={d:.4f}", "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", str(fixed)]
        else:  # silent scene: add a silent track so concat keeps streams aligned
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(v), "-f", "lavfi", "-t", f"{d:.4f}",
                   "-i", "anullsrc=r=48000:cl=stereo", "-c:v", "copy", "-c:a", "pcm_s16le", "-shortest", str(fixed)]
        subprocess.run(cmd, check=True)
        files.append(fixed)
        chapters.append((offset, s.get("title", c)))
        sub_file = ROOT / "media" / "subs" / f"{c}.json"
        if sub_file.exists():
            for e in json.loads(sub_file.read_text())["subs"]:
                srt.extend(cues(offset + e[0], e[1], e[2]))
        offset += d

    srt_path = out / f"{SLUG}.srt"
    srt_path.write_text("\n".join(f"{i}\n{ts(a)} --> {ts(b)}\n{t}\n" for i, (a, b, t) in enumerate(srt, 1)))
    meta = out / "chapters.ffmeta"
    lines = [";FFMETADATA1", f"title={VIDEO.get('title', '')}"]
    for i, (t, name) in enumerate(chapters):
        end = chapters[i + 1][0] if i + 1 < len(chapters) else offset
        lines += ["[CHAPTER]", "TIMEBASE=1/1000", f"START={int(t * 1000)}", f"END={int(end * 1000)}", f"title={name}"]
    meta.write_text("\n".join(lines) + "\n")
    (out / "chapters.txt").write_text("\n".join(f"{clock(t)} {n}" for t, n in chapters) + "\n")
    lst = out / "list.txt"
    lst.write_text("".join(f"file 'parts/{p.name}'\n" for p in files))  # relative: survives quotes in paths
    final = out / f"{SLUG}.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
                    "-i", str(srt_path), "-i", str(meta),
                    "-map", "0:v", "-map", "0:a", "-map", "1:s", "-map_metadata", "2", "-map_chapters", "2",
                    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "192k", "-c:s", "mov_text", "-metadata:s:s:0", "language=eng",
                    "-movflags", "+faststart", str(final)], check=True)
    lst.unlink()
    sd = lambda sel: float(subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", sel, "-show_entries",
                                                    "stream=duration", "-of", "csv=p=0", str(final)]).split()[0])
    vd, ad = sd("v:0"), sd("a:0")
    if abs(vd - ad) > 0.15:
        print(f"WARNING: audio ({ad:.2f}s) and video ({vd:.2f}s) lengths differ — check sync", file=sys.stderr)
    print(f"done: {final}  ({offset / 60:.1f} min, {len(srt)} subtitle cues, {len(chapters)} chapters)")
    print(f"      {srt_path}\n      {out / 'chapters.txt'}")


if __name__ == "__main__":
    main()
