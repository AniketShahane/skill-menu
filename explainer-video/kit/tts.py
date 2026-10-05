"""Narration for explainer videos: Gemini TTS (verified) or macOS `say`, cached per line.

Library use (from vkit):   wav, seconds = synth("A line of narration.")
CLI (run with the skill venv's python):
  tts.py --prepass s1_intro.py s2_idea.py ...   voice every self.voice("...") line up front
  tts.py --list    s1_intro.py ...              narration, word counts, estimated length vs target
  tts.py --check   s1_intro.py ...              voice issues for the lines currently in the scenes
  tts.py --preview "Some text" --voices Charon,Kore,Puck
  tts.py --say "One line"                       synthesize one line and print its path

Settings come from video.json (searched upward from the working directory), key "voice":
  backend   "gemini" | "say"
  model     Gemini TTS model: "gemini-3.8-flash-lite-tts" (default, cheaper) or "gemini-3.8-flash-tts" (higher quality)
  voice     Gemini prebuilt voice (e.g. "Charon") or a macOS voice (e.g. "Samantha")
  style     how to read: a short director's note (sent separately from the words)
  wpm       measured speaking rate, used for length estimates (Charon + default style ≈ 120)
  rate      words per minute for `say` only
  verify    transcribe each Gemini clip and re-generate if it doesn't match the text
  fallback_to_say   if Gemini fails for good, use `say` instead of stopping (mixes voices; off by default)

The API key is read from $GEMINI_API_KEY, else the macOS Keychain item "gemini-api-key".
It is sent only in a request header, never logged or printed.
"""
import argparse
import ast
import base64
import difflib
import hashlib
import http.client
import json
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

CACHE_VERSION = 2  # bump when post-processing changes, to invalidate old clips
API = "https://generativelanguage.googleapis.com/v1beta"
PASS = 0.85        # transcript similarity needed to accept a clip
DEFAULTS = {
    "backend": "gemini",
    "model": "gemini-3.8-flash-lite-tts",
    "voice": "Charon",
    "style": "a warm, curious teacher explaining to one friend: unhurried, clear, gently enthusiastic, "
             "with natural pauses at commas and full stops",
    "wpm": 120,
    "rate": 178,
    "verify": True,
    "verify_model": "gemini-flash-latest",
    "fallback_to_say": False,
    "workers": 3,
}
KEY_HELP = ("Store it once (you'll be prompted, so it stays out of shell history):\n"
            "  security add-generic-password -U -a \"$USER\" -s gemini-api-key -w\n"
            "or export GEMINI_API_KEY, or set \"backend\": \"say\" in video.json.")


class TTSError(RuntimeError):
    pass


# ---------------------------------------------------------------- settings

def find_project_root(start=None):
    p = Path(start or os.getcwd()).resolve()
    for d in [p, *p.parents]:
        if (d / "video.json").exists():
            return d
    return p


def video_config(root=None):
    f = Path(root or find_project_root()) / "video.json"
    return json.loads(f.read_text()) if f.exists() else {}


def settings(root=None):
    cfg = dict(DEFAULTS)
    cfg.update(video_config(root).get("voice", {}))
    if os.environ.get("VKIT_TTS_BACKEND"):
        cfg["backend"] = os.environ["VKIT_TTS_BACKEND"]
    return cfg


def api_key():
    k = os.environ.get("GEMINI_API_KEY", "").strip()
    if k:
        return k
    if shutil.which("security"):
        r = subprocess.run(["security", "find-generic-password", "-s", "gemini-api-key", "-w"],
                           capture_output=True, text=True)
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip()
    raise TTSError("No Gemini API key. " + KEY_HELP)


# ---------------------------------------------------------------- text matching

_ONES = ("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen "
         "sixteen seventeen eighteen nineteen").split()
_TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def _num_words(n):
    """Spell an integer the way narration says it, so a transcript's "75" matches "seventy-five"."""
    if n < 20:
        return _ONES[n]
    if n < 100:
        return _TENS[n // 10] + ("" if n % 10 == 0 else " " + _ONES[n % 10])
    if n < 1000:
        return _ONES[n // 100] + " hundred" + ("" if n % 100 == 0 else " " + _num_words(n % 100))
    for v, name in ((10 ** 12, "trillion"), (10 ** 9, "billion"), (10 ** 6, "million"), (1000, "thousand")):
        if n >= v:
            return _num_words(n // v) + " " + name + ("" if n % v == 0 else " " + _num_words(n % v))


def words(s):
    """Normalised word list for comparing script vs transcript: no tags, punctuation, digit/word or
    'a'/'and' differences ("a hundred and five" == "105")."""
    s = re.sub(r"<[^>]*>", " ", s.lower().replace("’", "'"))
    s = re.sub(r"\ba (hundred|thousand|million|billion|trillion)\b", r"one \1", s)
    s = re.sub(r"(?<=\d),(?=\d{3})", "", s)                     # 8,000 -> 8000
    s = re.sub(r"(?<=\d)\.(?=\d)", " point ", s)                # 0.8 -> 0 point 8
    s = re.sub(r"\d{1,12}", lambda m: f" {_num_words(int(m.group()))} ", s)
    s = re.sub(r"[^a-z0-9' ]+", " ", s)
    return [w for w in s.split() if w not in ("a", "and")]


def similarity(a, b):
    return difflib.SequenceMatcher(None, words(a), words(b)).ratio()


# ---------------------------------------------------------------- audio helpers

def ffprobe_duration(path):
    return float(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]))


def finish_clip(src, dst):
    """Trim leading/trailing silence, normalise loudness, write 48 kHz stereo WAV atomically."""
    fd, tmp = tempfile.mkstemp(suffix=".tmp.wav", dir=Path(dst).parent)  # unique: parallel writers can't collide
    os.close(fd)
    trim = ("silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,"
            "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse")
    try:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src),
                        "-af", f"{trim},loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "2", tmp],
                       check=True)
        os.replace(tmp, dst)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


# ---------------------------------------------------------------- Gemini

def _post(url, body, key, timeout=180):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"x-goog-api-key": key, "Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=timeout))


def _call_with_retries(url, body, key, what):
    delay = 4.0
    for attempt in range(7):
        try:
            return _post(url, body, key)
        except urllib.error.HTTPError as e:
            raw = e.read().decode(errors="replace")
            try:
                j = json.loads(raw)
                j = j[0] if isinstance(j, list) and j else j
                err = j.get("error", {}) if isinstance(j, dict) else {}
            except ValueError:
                err = {}
            msg = err.get("message", "") or raw[:300]
            if e.code == 429 and re.search(r"per ?day|PerDay|daily", raw):
                raise TTSError(f"{what}: daily Gemini quota used up ({msg[:200]}). Cached lines are kept; "
                               "re-run tomorrow, use a paid key, or set \"backend\": \"say\".")
            if e.code in (429, 500, 502, 503, 504) and attempt < 6:
                m = re.search(r'"retryDelay":\s*"(\d+(?:\.\d+)?)s"', raw)
                wait = float(m.group(1)) + 1 if m else delay
                print(f"  [tts] {what}: HTTP {e.code}, retrying in {wait:.0f}s", file=sys.stderr)
                time.sleep(wait + random.random())
                delay = min(delay * 2, 60)
                continue
            raise TTSError(f"{what}: HTTP {e.code}: {msg[:300]}")
        except (urllib.error.URLError, OSError, http.client.HTTPException) as e:  # incl. resets, timeouts
            if attempt < 6:
                time.sleep(delay)
                delay = min(delay * 2, 60)
                continue
            raise TTSError(f"{what}: network error: {e}")
    raise TTSError(f"{what}: gave up after retries")


_NO_INTERACTIONS = set()  # models confirmed (this run) to need the generateContent path


def _interactions_tts(text, cfg, key, plain):
    """Gemini 3.x documented path: style travels in a speech_metadata annotation, separate from the
    words, so the model cannot read it aloud. Returns (bytes, mime)."""
    content = {"type": "text", "text": text}
    if cfg["style"] and not plain:
        content["annotations"] = [{"type": "speech_metadata", "style": cfg["style"]}]
    body = {"model": cfg["model"], "input": [{"type": "user_input", "content": [content]}],
            "response_format": {"type": "audio"}, "generation_config": {"speech_config": [{"voice": cfg["voice"]}]}}
    d = _call_with_retries(f"{API}/interactions", body, key, "tts")
    for step in d.get("steps", []):
        for c in step.get("content", []):
            if c.get("type") == "audio" and c.get("data"):
                return base64.b64decode(c["data"]), c.get("mime_type", "audio/wav")
    raise TTSError(f"tts: no audio in interactions response (status={d.get('status')})")


def _generate_content_tts(text, cfg, key, plain):
    """Older path (2.5 models). Style goes in the prompt as director's notes. On 3.x models
    "Say warmly: ..." is read aloud verbatim, and even this layout leaked about 1 line in 4."""
    prompt = text if plain or not cfg["style"] else (
        f"### DIRECTOR'S NOTES\nStyle: {cfg['style']}\n\n### TRANSCRIPT\n{text}")
    body = {"contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseModalities": ["AUDIO"],
                                 "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": cfg["voice"]}}}}}
    d = _call_with_retries(f"{API}/models/{cfg['model']}:generateContent", body, key, "tts")
    try:
        part = d["candidates"][0]["content"]["parts"][0]["inlineData"]
    except (KeyError, IndexError):
        raise TTSError(f"tts: no audio in response (finishReason="
                       f"{d.get('candidates', [{}])[0].get('finishReason')})")
    return base64.b64decode(part["data"]), part.get("mimeType", "")


# Only these mean "this model doesn't speak the Interactions dialect"; an ordinary 400 (bad voice,
# empty text) must not switch the whole run to the leakier path.
_PATH_UNSUPPORTED = re.compile(r"HTTP 404|not supported|Unknown name|Invalid JSON payload", re.I)


def gemini_tts(text, cfg, key, plain=False):
    """Return a path to a temporary WAV of `text`."""
    raw = mime = None
    if cfg["model"] not in _NO_INTERACTIONS:
        try:
            raw, mime = _interactions_tts(text, cfg, key, plain)
        except TTSError as e:
            if not _PATH_UNSUPPORTED.search(str(e)):
                raise
    if raw is None:
        raw, mime = _generate_content_tts(text, cfg, key, plain)
        _NO_INTERACTIONS.add(cfg["model"])  # only after the other path actually worked
    fd, out = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    if "wav" in mime:  # newer models return a WAV container
        Path(out).write_bytes(raw)
    else:              # older models return raw 16-bit PCM, e.g. audio/L16;codec=pcm;rate=24000
        m = re.search(r"rate=(\d+)", mime)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "s16le", "-ar", m.group(1) if m else "24000",
                        "-ac", "1", "-i", "-", out], input=raw, check=True)
    return out


def transcribe(wav, cfg, key):
    body = {"contents": [{"parts": [
        {"inlineData": {"mimeType": "audio/wav", "data": base64.b64encode(Path(wav).read_bytes()).decode()}},
        {"text": "Transcribe this audio verbatim. Write numbers as words. Output only the spoken words."}]}]}
    for _ in range(2):  # the transcriber occasionally returns an empty reply; one retry clears it
        d = _call_with_retries(f"{API}/models/{cfg['verify_model']}:generateContent", body, key, "verify")
        parts = (d.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
        text = " ".join(p.get("text", "") for p in parts if p.get("text") and not p.get("thought")).strip()
        if text:
            return text
    raise TTSError("verify: no transcript in response")


# ---------------------------------------------------------------- say

def say_tts(text, cfg):
    if not shutil.which("say"):
        raise TTSError("`say` is macOS-only. Use the gemini backend on this machine.")
    voice = cfg["voice"] if cfg["backend"] == "say" else "Samantha"
    fd, aiff = tempfile.mkstemp(suffix=".aiff")
    os.close(fd)
    subprocess.run(["say", "-v", voice, "-r", str(cfg["rate"]), "-o", aiff, "--", text], check=True)
    return aiff


# ---------------------------------------------------------------- main entry

def cache_dir(root=None, sub="voice"):
    d = (Path(root) if root else find_project_root()) / "media" / sub
    d.mkdir(parents=True, exist_ok=True)
    return d


def clip_key(text, cfg):
    ident = {k: cfg[k] for k in ("backend", "model", "voice", "style")} if cfg["backend"] == "gemini" \
        else {"backend": "say", "voice": cfg["voice"], "rate": cfg["rate"]}
    return hashlib.sha1(json.dumps([CACHE_VERSION, ident, " ".join(text.split())], sort_keys=True).encode()
                        ).hexdigest()[:16]


def synth(text, root=None, cfg=None, sub="voice"):
    """Narrate one line. Returns (wav_path, seconds). Cached by text + voice settings."""
    text = " ".join(text.split())
    if not text:
        raise TTSError("empty narration line")
    cfg = cfg or settings(root)
    d = cache_dir(root, sub)
    key_ = clip_key(text, cfg)
    wav, meta = d / f"{key_}.wav", d / f"{key_}.json"
    if wav.exists():
        old = json.loads(meta.read_text()) if meta.exists() else {}
        if not (old.get("fallback") and cfg["backend"] == "gemini"):  # retry Gemini for say-fallback clips
            return wav, ffprobe_duration(wav)

    info = {"text": text, "backend": cfg["backend"], "voice": cfg["voice"]}
    if cfg["backend"] == "gemini":
        try:
            k = api_key()
            best, made = None, []
            for attempt in range(3):
                raw = gemini_tts(text, cfg, k, plain=(attempt == 2))  # last try drops the style note
                made.append(raw)
                if not cfg["verify"]:
                    best = (1.0, raw, None)
                    break
                try:
                    heard = transcribe(raw, cfg, k)
                except TTSError as e:  # verification is best effort
                    info["verify_error"] = str(e)[:200]
                    best = best or (None, raw, None)
                    break
                score = similarity(text, heard)
                if best is None or best[0] is None or score > best[0]:
                    best = (score, raw, heard)
                if score >= PASS:
                    break
                print(f"  [tts] mismatch ({score:.2f}) for: {text[:60]}… heard: {heard[:80]}…", file=sys.stderr)
            score, raw, heard = best
            for f in made:
                if f != raw:
                    os.unlink(f)
            info.update(model=cfg["model"], score=None if score is None else round(score, 3), heard=heard,
                        attempts=len(made), styled=not (len(made) == 3 and raw == made[-1]))
            src = raw
        except TTSError as e:
            if not cfg["fallback_to_say"]:
                raise
            print(f"  [tts] Gemini failed ({e}); falling back to say", file=sys.stderr)
            info["fallback"] = str(e)[:200]
            src = say_tts(text, cfg)
    else:
        src = say_tts(text, cfg)
    finish_clip(src, wav)
    os.unlink(src)
    dur = ffprobe_duration(wav)
    n = len(words(text))
    expected = n * 60 / float(cfg["wpm"])
    if not 0.4 * expected <= dur <= 2.5 * expected + 1:
        info["length_warning"] = f"{dur:.1f}s for {n} words (expected ~{expected:.1f}s)"
        print(f"  [tts] odd length: {info['length_warning']}: {text[:60]}", file=sys.stderr)
    meta.write_text(json.dumps(info, indent=1))
    return wav, dur


# ---------------------------------------------------------------- narration extraction + checks

def narration_lines(path):
    """Every literal string passed to self.voice(...) in a scene file, in source order."""
    tree = ast.parse(Path(path).read_text(), filename=str(path))
    out = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "voice" \
                and node.args:
            a = node.args[0]
            if isinstance(a, ast.Constant) and isinstance(a.value, str):
                out.append((a.lineno, " ".join(a.value.split())))
            else:
                print(f"  [tts] {path}:{a.lineno}: voice() text is not a plain string; it will be voiced at render "
                      f"time instead of in the prepass", file=sys.stderr)
    return [t for _, t in sorted(out)]


def voice_issues(files, root=None):
    """Problems with the clips for lines that are *currently* in the scenes (stale clips are ignored)."""
    cfg = settings(root)
    out = []
    for f in files:
        for t in narration_lines(f):
            m = cache_dir(root) / f"{clip_key(t, cfg)}.json"
            if not m.exists():
                continue
            i = json.loads(m.read_text())
            why = []
            if i.get("score") is not None and i["score"] < PASS:
                why.append(f"transcript match {i['score']:.2f} < {PASS}")
            if i.get("fallback"):
                why.append("macOS say fallback (different voice)")
            if i.get("length_warning"):
                why.append("length " + i["length_warning"])
            if i.get("styled") is False:
                why.append("kept the take without the style note")
            if i.get("verify_error"):
                why.append("not verified: " + i["verify_error"][:80])
            if why:
                out.append({"file": str(f), "text": t, "heard": i.get("heard") or "", "why": "; ".join(why)})
    return out


def print_voice_issues(files, root=None):
    iss = voice_issues(files, root)
    for i in iss:
        print(f"    voice   {i['why']}\n            text : {i['text'][:110]}\n            heard: {i['heard'][:110]}")
    return len(iss)


def cmd_list(files):
    cfg, vid = settings(), video_config()
    wpm = float(cfg["wpm"])
    total_w = 0
    for f in files:
        lines = narration_lines(f)
        w = sum(len(words(t)) for t in lines)
        total_w += w
        print(f"\n## {f}  ({len(lines)} lines, {w} words, ~{w / wpm:.1f} min of speech)")
        for t in lines:
            print(f"- {t}")
    print(f"\nTOTAL {total_w} words ≈ {total_w / wpm:.1f} min of speech at {wpm:.0f} wpm")
    if vid.get("target_minutes"):
        tm = float(vid["target_minutes"])
        budget = int(tm * wpm * 0.85)
        print(f"TARGET {tm:g} min → narration budget ≈ {budget} words (leaves ~15% for silent beats)"
              + ("  ✓" if total_w <= budget else f"  ✗ cut ~{total_w - budget} words"))
    # Hard ceiling: videos are capped at max_minutes (default 30). Runtime ≈ speech / 0.85 (pauses, cards, silent beats).
    cap = float(vid.get("max_minutes", 30))
    est = total_w / wpm / 0.85
    if est > cap:
        print(f"CAP ✗ estimated runtime {est:.1f} min > {cap:g} min ceiling: cut ~{int(total_w - cap * wpm * 0.85)} words")
        sys.exit(3)
    print(f"CAP ✓ estimated runtime {est:.1f} min ≤ {cap:g} min ceiling")


def cmd_prepass(files):
    cfg = settings()
    todo = list(dict.fromkeys(t for f in files for t in narration_lines(f)
                              if not (cache_dir() / f"{clip_key(t, cfg)}.wav").exists()))
    print(f"[tts] {len(todo)} new lines to voice with {cfg['backend']}"
          + (f" ({cfg['model']}, {cfg['voice']})" if cfg["backend"] == "gemini" else f" ({cfg['voice']})"))
    failed = []
    workers = max(1, int(cfg["workers"])) if cfg["backend"] == "gemini" else 1
    with ThreadPoolExecutor(workers) as ex:
        futs = {ex.submit(synth, t, None, cfg): t for t in todo}
        for i, fu in enumerate(as_completed(futs), 1):
            t = futs[fu]
            try:
                _, dur = fu.result()
                print(f"  [{i}/{len(todo)}] {dur:4.1f}s  {t[:70]}")
            except Exception as e:  # report all failures at the end
                failed.append((t, str(e)))
                print(f"  [{i}/{len(todo)}] FAILED {t[:60]}: {e}", file=sys.stderr)
    n = print_voice_issues(files)
    print(f"[tts] {n} voice issue(s)" if n else "[tts] all current lines OK")
    if failed:
        print(f"[tts] {len(failed)} lines failed; first error: {failed[0][1]}", file=sys.stderr)
        sys.exit(1)


def cmd_preview(text, voices):
    cfg = settings()
    out = cache_dir(sub="voice_preview")
    for v in voices:
        wav, dur = synth(text, cfg=dict(cfg, voice=v, verify=False), sub="voice_preview")
        dst = out / f"{v}.wav"
        shutil.copy(wav, dst)
        print(f"{v}: {dst} ({dur:.1f}s)   play: afplay '{dst}'")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--prepass", nargs="+", metavar="SCENE_FILE")
    ap.add_argument("--list", nargs="+", metavar="SCENE_FILE")
    ap.add_argument("--check", nargs="+", metavar="SCENE_FILE")
    ap.add_argument("--preview", metavar="TEXT")
    ap.add_argument("--voices", default="Charon,Kore,Puck,Iapetus,Sadaltager,Achird")
    ap.add_argument("--say", metavar="TEXT")
    a = ap.parse_args()
    try:
        if a.prepass:
            cmd_prepass(a.prepass)
        elif a.list:
            cmd_list(a.list)
        elif a.check:
            sys.exit(1 if print_voice_issues(a.check) else 0)
        elif a.preview:
            cmd_preview(a.preview, a.voices.split(","))
        elif a.say:
            print(synth(a.say))
        else:
            ap.print_help()
    except TTSError as e:
        sys.exit(f"[tts] {e}")
