# Lessons log

Append one entry per video: what broke, what you measured, what you'd change. Fold repeats into references/.

## 2026-10 — Kalman filters (examples/kalman, 10.2 min)
- LaTeX: parallel renders sharing media/ deleted each other's .dvi → per-scene media dirs.
- Audio drifted ~3 s early by the end: per-scene audio shorter than video → pad before concat.
- Narrow Gaussians (σ→0.08) spiked into the formula band; clamped slider to σ ≥ 0.2.
- Side-panel text clipped at the right edge twice; fixed by narrowing axes, 2-line labels.
- Gate-1 review found 15 issues (2 wrong statements: matrix gain formula, missing Q). Worth it every time.
- Gemini 3.8 TTS read "Say warmly:" aloud; director's-notes prompt leaked 1/4; speech_metadata annotation fixed it.

## 2026-10 — skill review pass (binary-search test video, 96 s)
- Voice verifier false-failed number lines ("Seventy-five" vs transcript "75", score 0.12) → wasted 3× regenerations.
- Charon speaks ~118 wpm, not 150: first cut 131 s vs 75–100 s target.
- new_project.sh overwrote a reviewed SCRIPT.md (scaffold ran after the script was written).
- Layout checker found a real bug in the shipped Kalman video: the "innovation = surprise" label sat below the frame.
- Text→Text Transform garbled mid-morph; FadeTransform fixed it.

## 2026-10 — Medieval mental health (examples/medieval-remotion, ~28 min, illustrated path)
- Subject was a history essay: Manim was the wrong engine. Built a Remotion path (narration.py → voice.py →
  timing.json → per-chapter compositions; mix.py repeats the timing in Python from constants.json).
- Tier-1 TTS: 100 requests/day per model, retakes included. A 131-line script stalled twice. Split by
  character across models, and finished the narrator after the rolling window reopened.
- Codex image generation (unsandboxed `codex exec`) was blocked by the safety check; the Gemini image API worked.
- Art at 1K looked soft at 1080p, and the user called the 540p preview "super low resolution".
  Redrew all 50 images at 2K from themselves (faithful), and rendered the final at 1080p.
- Hard-coded image aspects stretched half the art; mix-blend-mode inside a transformed parent showed white
  boxes. Both were caught only by beat sheets.
- Render: png + x264 slow = 4.2 fps → jpeg95 + x264 fast = 11.7 fps (2.8×), PSNR 49 dB. VideoToolbox was
  slower. Emulators from another project were eating the CPU.
- Gate 1 (with a sensitive-topics lens) fixed a softened suicide line, a weak miscarriage caveat, and misquotes.
- The user set a 30-minute ceiling after seeing the plan. The cap is now enforced in `--list`.
