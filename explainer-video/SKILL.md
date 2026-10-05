---
name: explainer-video
description: Makes animated explainer videos up to 30 minutes long — 3Blue1Brown-style Manim scenes for math/science, or an illustrated Remotion path (AI-generated and public-domain art on a designed page) for history, art, essays and culture — with AI-narrated voice-over (Gemini TTS, macOS say fallback), soft subtitles and chapters, assembled into one mp4 — that teach an idea from its fundamentals up. Use when the user wants a video, animation or narrated visual explanation of a math, science, algorithm or engineering idea, or of an article, essay, period of history or work of art ("explainer video", "3b1b style", "Manim", "animate how X works", "make a video explaining X", "turn this article into a video"), even if Manim is never named. Also use to fix, re-time, re-voice or extend an existing explainer ("the label overlaps at 2:31", "the voice runs ahead of the picture"), or for a short silent Manim clip. Covers the fundamentals-ladder script, adversarial fact review, scene code, transcription-verified narration, parallel rendering, frame-level visual QA and final assembly. Not for written explainers or articles, live-action or screen-recording editing, slide decks, or standalone marketing motion graphics.
---

# Explainer video

A great explainer is mostly a great *script*: a ladder of ideas where each rung uses only the rungs
above it, every claim is true, every sentence has a picture, and there's room to think. So the work is
front-loaded:
1. plan
2. adversarially review
3. code
4. lint and look at every beat
5. polish

Narration is the clock: each line is voiced first, and the animation fills its measured length.

**Hard limits:**
- **Videos are at most 30 minutes.** Default to the shortest length that keeps the promise.
- Enforce the cap on *measured* audio, not just word counts.
  - Budget: runtime ≈ words ÷ 120 wpm ÷ 0.85. So 30 min ≈ 3,000 words at most, and aim for ≤ 2,700.
  - `tts.py --list` (or `voice.py --list` on the illustrated path) exits non-zero over `max_minutes`.
- "Cover everything in this 4,000-word article" is still capped. Tell the user the planned length at the
  brief, and compress minor examples first.

**Pick the engine by subject, at the brief:**
- Math, science, algorithms, engineering → Manim (this file).
- History, art, essays, biography, culture → the **illustrated path**: read `references/illustrated.md`
  and copy from `examples/medieval-remotion/`. Manim is the wrong tool for painted pages and manuscripts.

`PY` below means `~/.local/share/explainer-video/venv/bin/python`. Never edit files inside this skill
folder while making a video; work in the project folder. Keep going until `out/<slug>.mp4` exists and
the user has seen it. If something blocks you, report the exact blocker.

## Workflow

Copy this checklist into your task list:

```
- [ ] 0. Toolchain     scripts/setup.sh --check  (run without --check to install)
- [ ] 1. Project       scripts/new_project.sh <dir> "<Title>"; set target_minutes in video.json
- [ ] 2. Brief + facts viewer, promise, length (≤30 min), engine; voice quota plan; sources for every number
- [ ] 3. Script        <project>/SCRIPT.md: ladder, question chain, central visual, aha, narration
- [ ] 4. Gate 1        fresh subagent attacks the script (references/review.md); fix High/Medium
- [ ] 5. Scenes        one KScene file per chapter, listed in video.json
- [ ] 6. Lint + look   ./render.sh lint → ./render.sh → $PY qa.py → Read every sheet → fix
- [ ] 7. Voice check   $PY qa.py --issues shows no voice issues (or each is explained)
- [ ] 8. User preview  $PY assemble.py l → show the user → adjust voice/pacing
- [ ] 9. Final         ./render.sh h → $PY assemble.py h → Gate 3 checks → open the video
- [ ] 10. Lessons      append to <project>/LESSONS.md
```

### 0–1. Toolchain and project
- **`scripts/setup.sh`** installs what's missing, mostly in user space: Homebrew ffmpeg/cairo/pango, a
  Python 3.12 venv with manim 0.21.0, TinyTeX, and a smoke render.
- **The Gemini key** comes from `$GEMINI_API_KEY` or the macOS Keychain item `gemini-api-key`. Never
  print it or write it into any file. If it's missing, ask the user to run
  `security add-generic-password -U -a "$USER" -s gemini-api-key -w` (it prompts for the key), or use
  `"backend": "say"`.
- **Scaffold before writing anything.** `new_project.sh` never overwrites existing files.

### 2–3. Brief and script
- **Defaults:** curious adult, high-school math, the shortest length that delivers the promise
  (usually 6–12 min), dark 3b1b look, voice Charon.
- Ask at most 2 questions, and only if the answer changes the video.
- Offer `$PY tts.py --preview "<line>" --voices Charon,Iapetus,Kore,Achird` only if the user cares
  about the voice.
- **Read `references/pedagogy.md`**, then fill in `<project>/SCRIPT.md`:
  - build the ladder backwards, teach it forwards
  - chain chapters by questions
  - show the naive attempt failing first
  - pick one central visual, one key frame per chapter and one aha moment
- **Narration budget:** about 100 words per minute of video. The voice speaks at about 120 wpm, which
  leaves silent beats. Write numbers and symbols as spoken words.
- **Numbers on screen come from code** (`sim.py`). Nothing is invented.

### 4. Gate 1
Use the review prompt in `references/review.md` with a fresh subagent. Fix its findings before writing
any scene code: this is the cheapest place to catch errors. The Kalman review found 2 false statements
here.

### 5. Scenes
- **Read `references/manim-cookbook.md`** (layout budget, patterns, gotchas) and skim
  `examples/kalman/` for style.
- **The vkit API:**
  - `with self.voice("line") as d:` — animations inside total about `d` seconds
  - `rt(x)` — a safe run_time
  - `txt` — labels
  - `ctex` — colored math pieces
  - `chapter_card` — title cards
  - `C_A..C_D` — semantic colors; `BG`, `DIM`
- **Narration must be a plain string literal** (implicit concatenation is fine) so the prepass can find
  it.
- **To land an animation on a specific word,** end the line there and start a new `voice()` block.

### 6–7. Lint, render, look
```
./render.sh lint            # seconds: overruns, off-frame text, text-on-text overlap
./render.sh                 # voices new lines (Gemini, transcription-verified), renders at 480p in parallel
$PY qa.py                   # beat sheets qa/<Scene>-<n>.png: the settled frame of every narrated beat
```
- Read every sheet with the Read tool. Checks are listed in `references/review.md` Gate 2.
- Fix from small to large: a position before a beat, a beat before a scene.
- Re-render only what changed: `./render.sh l S3Foo`.

### 8–9. Preview, then final
- **Preview:** `$PY assemble.py l && open out/<slug>.mp4`. Ask the user about the voice and pacing; you
  can't hear them.
- **Final:** `./render.sh h && $PY assemble.py h`.
- **What assembly adds:** soft subtitles, chapter markers and `out/chapters.txt`. It pads each scene's
  audio to its video length before joining (without this, the narration drifted ~3 s early by the end
  of a 10-minute video).
- **Then run the Gate 3 checks** in `references/review.md`, including the sync spot-check.

## Fixing an existing video
1. Find the project: the folder with `video.json`.
2. Run `$PY qa.py --at 2:31` and Read the frame. It names the scene, local time and narration line.
3. Edit only that scene.
4. Run `./render.sh lint <Scene>`, then `./render.sh l <Scene>`, and check it.
5. Run `./render.sh h <Scene>`, then `$PY assemble.py h`.

The user may have edited files by hand. Treat surprising changes as intentional.

## Quick paths
- **Under 2 minutes:** no chapter cards; 2–3 scenes of 3–5 lines; Gate 1 can be a self-review using
  the same prompt.
- **Silent clip:** no `voice()` blocks; skip steps 2–4, 7 and 8.

## Quotas: plan before voicing
- Tier-1 Gemini allows **100 TTS requests a day per model**, and retakes count. A 130-line script
  can't finish on one model in one day.
- Plan for this at the brief:
  - one model per character;
  - or two days;
  - or Tier 2.
- Details: `references/audio.md`.

## Rules that cost the most to learn
1. **Never put direction words in narration text, and keep `verify: true`.** Gemini 3.8 read
   "Say warmly: …" aloud; tts.py sends style separately and re-generates any clip whose transcript
   doesn't match.
2. **Never mix voices silently.** A Gemini failure stops the run instead of switching to `say`.
   Cached clips survive, so re-run.
3. **Use `render.sh`; never run manim in parallel by hand.** Shared media dirs delete each other's
   LaTeX files.
4. **Reserve layout space for the extreme frame.** A slider that sharpens a curve pushes it into the
   formulas.
5. **Previews are half-size; say so.** The user judged a 540p preview as "super low resolution".
   - When showing a preview, say it is a low-res draft, or show one 1080p chapter.
   - Finals render at 1080p with art generated at 2K (illustrated path: JPEG 95 frames, x264 fast,
     CRF 16).
6. **Report honestly.** Say what was verified (transcripts, sync, frames) and what wasn't (how the voice
   sounds).

## Files
- `scripts/setup.sh`, `scripts/new_project.sh` — toolchain and scaffolding
- `kit/` — copied into each project:
  - `vkit.py` — KScene, helpers, QA
  - `tts.py` — narration, cache, verify, prepass, list, preview
  - `render.sh` — lint/l/h
  - `qa.py` — beat sheets, `--issues`, `--at`
  - `assemble.py`
- `templates/` — `SCRIPT.md`, `video.json`, a starter scene
- `references/` — `pedagogy.md`, `manim-cookbook.md`, `audio.md`, `review.md`, `illustrated.md`
- `examples/kalman/` — a complete 9-scene, 10-minute video
- `examples/medieval-remotion/` — the illustrated path: a 27-min, 11-chapter history essay (Remotion,
  Gemini art, two voices, cabinet + compass devices, mix/assemble, beat sheets)
- `lessons-log.md`, `CHANGELOG.md` — the skill's own history

## This skill learns
During a video, append what broke and what you measured to `<project>/LESSONS.md`. When the user says
"update the explainer skill with what we learned":
1. Fold repeated lessons into the references.
2. Add an entry to `lessons-log.md`.
3. Record the change in `CHANGELOG.md`.
