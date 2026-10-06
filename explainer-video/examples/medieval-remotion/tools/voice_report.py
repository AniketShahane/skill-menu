"""Report voicing status: missing clips, low transcript scores, length warnings, speaking rates."""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT)]
import tts, narration
base = tts.settings(ROOT)
bad = []; tot = {"N": 0, "Q": 0}; words = {"N": 0, "Q": 0}; n = 0
for c in narration.CHAPTERS:
    for b in c["beats"]:
        cfg = dict(base); cfg.update(narration.VOICES[b["v"]])
        k = tts.clip_key(" ".join(b["t"].split()), cfg)
        m = ROOT / f"media/voice/{k}.json"
        if not m.exists(): bad.append((b["id"], "missing")); continue
        i = json.loads(m.read_text()); n += 1
        d = tts.ffprobe_duration(ROOT / f"media/voice/{k}.wav"); tot[b["v"]] += d; words[b["v"]] += len(b["t"].split())
        if (i.get("score") or 0) < 0.85 or i.get("length_warning"):
            bad.append((b["id"], i.get("score"), i.get("heard", "")[:110], i.get("length_warning")))
print("voiced", n, "| speech", round(sum(tot.values()) / 60, 1), "min | wpm N", round(words["N"] / max(tot["N"], 1) * 60), "Q", round(words["Q"] / max(tot["Q"], 1) * 60))
for x in bad: print(" ", x)
