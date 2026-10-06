"""Join rendered chapter parts, mux the soundtrack, soft subtitles and chapter markers.
usage: uv run python tools/assemble.py <l|h> [--chapters a,b,...] [--name slug]"""
import argparse, json, subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser(); ap.add_argument("q"); ap.add_argument("--chapters"); ap.add_argument("--name", default="medieval-mind")
ap.add_argument("--no-music", action="store_true")
a = ap.parse_args()
T = json.loads((ROOT / "video/src/timing.json").read_text())
keys = a.chapters.split(",") if a.chapters else [c["key"] for c in T]
mix = ["uv", "run", "python", "tools/mix.py", "--chapters", ",".join(keys)] + (["--no-music"] if a.no_music else [])
subprocess.run(mix, cwd=ROOT, check=True)
out = ROOT / "out"
lst = out / "parts.txt"
lst.write_text("".join(f"file 'parts/{k}.{a.q}.mp4'\n" for k in keys))
final = out / f"{a.name}{'' if a.q == 'h' else '-preview'}.mp4"
cmd = ["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-i", str(out / "soundtrack.wav"),
       "-i", str(out / "subs.srt"), "-i", str(out / "chapters.ffmeta"),
       "-map", "0:v", "-map", "1:a", "-map", "2:s", "-map_metadata", "3", "-map_chapters", "3",
       "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-c:s", "mov_text", "-metadata:s:s:0", "language=eng",
       "-metadata", "title=The Curio Cabinet of Medieval Mental Health", "-shortest", "-movflags", "+faststart", str(final)]
subprocess.run(cmd, check=True)
dur = lambda p, s: float(subprocess.run(["ffprobe", "-v", "error", "-select_streams", s, "-show_entries", "stream=duration", "-of", "csv=p=0", str(p)], capture_output=True, text=True).stdout.split()[0].strip(","))
v, au = dur(final, "v:0"), dur(final, "a:0")
print(f"{final.relative_to(ROOT)}  video {v:.2f}s  audio {au:.2f}s" + ("  WARNING: length mismatch" if abs(v - au) > 1.2 else ""))
