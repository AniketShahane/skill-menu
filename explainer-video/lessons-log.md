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
