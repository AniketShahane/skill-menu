# Review: the adversarial passes that make the video correct

Three gates. Don't skip one because the previous one went well. `PY` means the skill venv's python:
`~/.local/share/explainer-video/venv/bin/python`.

## Gate 1 — script review, before any scene code
Spawn a fresh subagent (it must not share your assumptions). Prompt it like this, filling in the path:

> You are a rigorous reviewer: a subject-matter expert and a math educator. Read `<project>/SCRIPT.md`, the
> narration plan for an animated explainer that builds from fundamentals. Attack it adversarially:
> 1. Any mathematically or factually wrong or misleading statement: formulas, optimality claims,
>    "always/never" claims, history, real-world claims, numbers. Recompute every number you can (you may
>    run python3). Say which claims you could not verify.
> 2. Pedagogical gaps: a concept used before it's introduced; a step that doesn't build on the previous one;
>    anything a smart novice would trip on; missing assumptions. Also, where would a viewer get bored or
>    click away? Look for narration with no motion, a formula without a picture, a chapter with no question
>    pulling it forward, or a hook that starts with a definition.
> 3. Concrete line-level fixes: the exact replacement sentence for each problem.
>
> Rank by severity. Be concise. Don't edit files.

Fix every High and Medium issue in SCRIPT.md. In your report, say which Low ones you skipped and why. The
Kalman review found:
- the matrix gain formula was wrong
- process noise Q was missing, which contradicted the steady-state claim
- "predict" was used before prediction was taught
- independence assumptions were never stated

For long videos, run 2–3 reviewers in parallel with different lenses (domain expert, novice stand-in,
skeptic of oversold claims), then merge and dedupe.

## Gate 2 — lint, then look, on every preview
1. **`./render.sh lint`.** In seconds and without drawing frames, it reports:
   - **overruns**: a voice block whose animations outlast its speech
   - **text off-frame**
   - **text overlapping text**

   Get it clean, or explain each remaining item (an intentional overlap, such as a label on its own
   curve, is fine).
2. **`./render.sh` then `$PY qa.py`.** Read every beat sheet `qa/<Scene>-<n>.png` with the Read tool.
   Each tile is the settled last frame of one narrated beat, captioned with its time and line. For each
   tile, check:
   - Does the picture show what the line says? Every spoken claim needs a visible counterpart.
   - Is any text clipped at an edge?
   - Does a curve or object run into a formula?
   - Does a label cover data?
   - Is anything a viewer must read below font 22? (18 is fine only for tick numbers.)
   - Is any Write or Transform caught mid-way?
   - Is there an empty frame mid-scene?
   - Is something from the previous beat left behind?
   - Does any color break the color key?
   - Does a Transform between two Texts garble the letters? (Use FadeTransform.)
3. **A specific moment** (the user says "at 2:31 the label overlaps"): run `$PY qa.py --at 2:31`. It
   prints the scene, local time and narration line, and writes the frame; Read it.
4. **Repair from small to large** (ScopeRefine, from Code2Video):
   - first fix the line (a position, a buff, a font size)
   - then the beat
   - rewrite a whole scene only as a last resort
   - send the problem back to the earliest stage that caused it: a confusing beat is a script problem,
     not a layout problem
   - re-render only the scenes you touched
   - after about 5 rounds on one scene, rethink the beat

## Gate 3 — before handing over
1. **Show the user a 480p cut first:** `$PY assemble.py l`, then `open out/<slug>.mp4`. Ask about voice
   and pacing. You can't hear the audio, so this is the one judgement only they can make. Render 1080p
   after they're happy, or straight away if they asked you not to check in.
2. **`assemble.py h`** must print no audio/video length warning.
3. **Sync spot-check near the end**, where drift would be largest:
   1. Pick the last subtitle cue's start time `T` from `out/<slug>.srt`.
   2. Run:
      ```
      ffmpeg -ss <T-5> -t 15 -i out/<slug>.mp4 -vn -af silencedetect=n=-40dB:d=0.3 -f null - 2>&1 | grep silence_end
      ```
   3. Each `silence_end` is relative to the window start, so add `T-5`. Pauses inside a line produce extra
      events; the speech onset is the event nearest `T`.
   4. Use the *first* cue of the last narrated line. When a long line is split into several cues, the
      later cues are timed by character share, so they're only estimates.
   5. It should be within 0.2 s of `T`.
4. **`$PY qa.py --issues`** reports 0, or each issue is explained.
5. **Spot frames against subtitles.** Run `$PY qa.py --at` at three cue times in the first minute and
   three in the last. Each frame should match its cue's words.
6. **Report honestly.** List what you verified (transcripts, sync, lengths, frames) and what you couldn't
   (how the voice sounds).
