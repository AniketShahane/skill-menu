"""Build the soundtrack from the SAME timing the picture uses (video/src/timing.json + constants.json):
narration clips placed at their beat starts, a quiet synthesized drone (open fifths, slow swells) that ducks
under speech, and a soft bell chime on every drawer card. Everything is generated here: no outside music.

usage: uv run python tools/mix.py [--chapters hook,humours,...] [--no-music] -> out/soundtrack.wav (+ out/subs.srt, out/chapters.txt)
"""
import argparse, json
from pathlib import Path
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
SR = 48000
T = json.loads((ROOT / "video/src/timing.json").read_text())
K = json.loads((ROOT / "video/src/constants.json").read_text())
fr = lambda s: round(s * K["fps"])  # same rounding as timeline.ts


def layout(keys):
    """Mirror of timeline.ts: chapter start frames and beat start frames (global)."""
    out, g = [], 0
    for ch in T:
        card = fr(K["card"]) if ch["title"] else 0
        t = card + fr(K["lead"])
        beats = []
        for b in ch["beats"]:
            s = t
            t = s + fr(b["dur"]) + fr(K["gap"] if b.get("pad") is None else b["pad"])
            beats.append((b, s))
        total = t + fr(K["tail"]) + fr(ch.get("hold", 0) or 0)
        if keys is None or ch["key"] in keys:
            out.append({"ch": ch, "from": g, "card": card, "total": total, "beats": beats})
            g += total
    return out, g


def chime(f0=523.25, dur=4.0, amp=0.16):
    t = np.arange(int(dur * SR)) / SR
    parts = [(1.0, 1.0, 1.2), (2.0, 0.5, 0.9), (2.76, 0.35, 0.7), (5.4, 0.18, 0.45), (8.9, 0.08, 0.3)]
    y = sum(a * np.sin(2 * np.pi * f0 * r * t) * np.exp(-t / d) for r, a, d in parts)
    y *= np.minimum(1, t / 0.004)
    return amp * y / np.abs(y).max()


def drone(n, seed=3):
    """Open fifths on D, with slow independent swells, a little air noise. Very quiet."""
    t = np.arange(n) / SR
    rng = np.random.default_rng(seed)
    y = np.zeros(n)
    for f, a in [(73.42, 0.5), (110.0, 0.35), (146.83, 0.25), (220.0, 0.12), (293.66, 0.06)]:
        lfo = 0.6 + 0.4 * np.sin(2 * np.pi * t / rng.uniform(17, 31) + rng.uniform(0, 6))
        y += a * lfo * np.sin(2 * np.pi * f * t + 0.3 * np.sin(2 * np.pi * 0.07 * t))
    noise = np.convolve(rng.standard_normal(n), np.ones(400) / 400, mode="same")
    y += 0.15 * noise / (np.abs(noise).max() + 1e-9)
    return y / np.abs(y).max()


def srt_time(s):
    h, m = int(s // 3600), int(s % 3600 // 60)
    return f"{h:02d}:{m:02d}:{s % 60:06.3f}".replace(".", ",")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chapters"); ap.add_argument("--no-music", action="store_true")
    ap.add_argument("--out", default="out/soundtrack.wav")
    a = ap.parse_args()
    keys = a.chapters.split(",") if a.chapters else None
    chs, total = layout(keys)
    n = int(total / K["fps"] * SR) + SR
    voice = np.zeros((n, 2))
    fx = np.zeros((n, 2))
    subs, chapters = [], []
    for c in chs:
        t0 = c["from"] / K["fps"]
        if c["ch"]["title"]:
            ch = chime()
            i = int((t0 + 0.15) * SR); voice_free = fx[i:i + len(ch)]
            voice_free += np.stack([ch, ch], 1)[: len(voice_free)]
            ch2 = chime(659.25, amp=0.10)  # a second, higher bell as the next drawer glows
            j = int((t0 + 1.15) * SR); seg = fx[j:j + len(ch2)]; seg += np.stack([ch2, ch2], 1)[: len(seg)]
        chapters.append((t0, c["ch"]["title"] or {"hook": "Prologue", "credits": "Credits"}.get(c["ch"]["key"], c["ch"]["key"])))
        for b, s in c["beats"]:
            st = (c["from"] + s) / K["fps"]
            w, sr = sf.read(ROOT / f"video/public/audio/{b['id']}.wav", always_2d=True)
            assert sr == SR
            i = int(st * SR)
            voice[i:i + len(w)] += w[: max(0, n - i)]
            subs.append((st, st + len(w) / SR, b["t"], b.get("who") if b["v"] == "Q" else None))
    mix = voice + fx
    if not a.no_music:
        bed = drone(n) * 10 ** (-30 / 20)
        env = np.abs(voice).max(1)
        k = int(0.25 * SR)
        env = np.convolve(env, np.ones(k) / k, mode="same")
        duck = 1 - 0.55 * np.clip(env / 0.02, 0, 1)
        fade = np.minimum(1, np.minimum(np.arange(n), n - np.arange(n)) / (3 * SR))
        mix += np.stack([bed * duck * fade] * 2, 1)
    peak = np.abs(mix).max()
    if peak > 0.98: mix *= 0.98 / peak
    out = ROOT / a.out; out.parent.mkdir(exist_ok=True)
    sf.write(out, mix, SR, subtype="PCM_16")
    # subtitles: split long lines into ~2 cues by character share
    lines, k = [], 1
    for st, en, text, who in subs:
        words = text.split(); chunks, cur = [], []
        for wd in words:
            cur.append(wd)
            if len(" ".join(cur)) > 84: chunks.append(" ".join(cur)); cur = []
        if cur: chunks.append(" ".join(cur))
        L = sum(len(c) for c in chunks); t = st
        for c in chunks:
            d = (en - st) * len(c) / L
            lines.append(f"{k}\n{srt_time(t)} --> {srt_time(t + d)}\n{c}\n"); k += 1; t += d
    (out.parent / "subs.srt").write_text("\n".join(lines))
    (out.parent / "chapters.txt").write_text("\n".join(f"{int(t // 60)}:{int(t % 60):02d} {name}" for t, name in chapters) + "\n")
    meta = [";FFMETADATA1"]
    for i, (t, name) in enumerate(chapters):
        end = chapters[i + 1][0] if i + 1 < len(chapters) else total / K["fps"]
        meta += ["[CHAPTER]", "TIMEBASE=1/1000", f"START={int(t * 1000)}", f"END={int(end * 1000)}", f"title={name}"]
    (out.parent / "chapters.ffmeta").write_text("\n".join(meta) + "\n")
    print(f"{out.relative_to(ROOT)}: {total / K['fps'] / 60:.1f} min, {len(subs)} lines, {len(chapters)} chapters")


if __name__ == "__main__":
    main()
