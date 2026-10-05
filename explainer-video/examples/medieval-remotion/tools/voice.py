"""Voice every beat in narration.py (Gemini TTS via the skill's tts.py, transcription-verified, cached),
then copy clips to video/public/audio and write video/src/timing.json for Remotion.
usage: uv run python tools/voice.py [--list]"""
import json, shutil, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT)]
import tts
from narration import CHAPTERS, VOICES

base = tts.settings(ROOT)
def cfg_for(v):
    c = dict(base); c.update(VOICES[v]); return c

beats = [b for ch in CHAPTERS for b in ch["beats"]]
only = [a.split("=")[1] for a in sys.argv if a.startswith("--only=")]  # --only=Q voices just that voice
if "--list" in sys.argv:
    w = sum(len(b["t"].split()) for b in beats)
    est = w / base["wpm"] / 0.85  # runtime ≈ speech / 0.85 (pauses, drawer cards, silent beats)
    cap = float(tts.video_config(ROOT).get("max_minutes", 30))
    print(f"{len(beats)} beats, {w} words, ~{w / base['wpm']:.1f} min of speech, ~{est:.1f} min runtime (cap {cap:g})")
    sys.exit(0 if est <= cap else 3)

def one(b):
    if only and b["v"] not in only:
        try:  # use the cached clip if it exists, else estimate
            c = cfg_for(b["v"]); w = tts.cache_dir(ROOT) / f"{tts.clip_key(' '.join(b['t'].split()), c)}.wav"
            if w.exists(): return b["id"], w, tts.ffprobe_duration(w)
        except Exception: pass
        return b["id"], None, len(b["t"].split()) * 60 / base["wpm"]
    if "--estimate" in sys.argv:  # no audio: guess lengths so the picture can be built before voicing
        return b["id"], None, len(b["t"].split()) * 60 / base["wpm"]
    for attempt in range(4):  # transient "no audio" replies happen; quota errors are re-raised
        try:
            wav, dur = tts.synth(b["t"], ROOT, cfg_for(b["v"]))
            return b["id"], wav, dur
        except tts.TTSError as e:
            if "quota" in str(e) or attempt == 3: raise
            print(f"  retry {b['id']}: {str(e)[:80]}", file=sys.stderr)
with ThreadPoolExecutor(int(base.get("workers", 3))) as ex:
    res = {i: (w, d) for i, w, d in ex.map(one, beats)}

aud = ROOT / "video/public/audio"; aud.mkdir(parents=True, exist_ok=True)
out = []
for ch in CHAPTERS:
    cb = []
    for b in ch["beats"]:
        w, d = res[b["id"]]
        if w: shutil.copyfile(w, aud / f"{b['id']}.wav")
        cb.append({**b, "dur": round(d, 3)})
    out.append({"key": ch["key"], "title": ch["title"], "beats": cb, "hold": ch.get("hold", 0)})
(ROOT / "video/src/timing.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
tot = sum(b["dur"] for c in out for b in c["beats"])
print(f"voiced {len(res)} beats, {tot/60:.1f} min of speech -> video/src/timing.json")
