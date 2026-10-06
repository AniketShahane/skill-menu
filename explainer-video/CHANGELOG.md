# Changelog

## 1.0.0 — 2026-10-05
- First version, distilled from the Kalman-filter explainer.
- Kit: vkit (KScene, voice blocks, layout QA), tts (Gemini Interactions API + transcription verify, say fallback,
  cache, prepass), render.sh (parallel, per-scene media dirs), qa.py (contact sheets + issues),
  assemble.py (audio padding, soft subtitles, chapters).

## 1.1.0 — 2026-10-05 (review-team pass: E2E tester, code/security, design, pedagogy)
- tts: number-aware transcript matching (75 == seventy-five; a million == 1,000,000), tags stripped; transcribe prompt
  asks for words; Interactions→generateContent fallback only on real "unsupported" signals; robust error parsing and
  network retries; unique temp files (parallel-safe); `say --`; issues only for current lines, with reasons;
  preview clips cached separately; say-fallback clips retried later; measured wpm (≈120) drives estimates;
  `--check`, `--list` budget vs target_minutes; key stored via prompt (not shell history).
- vkit: overrun detection (animations outlasting speech); beat-end times recorded.
- render.sh: `lint` mode (-s, seconds, no frames); JOBS ≥ 1; Ctrl-C kills renders.
- qa.py: beat sheets (settled frame per narrated beat, captioned, 3×3 pages); `--issues`; `--at MM:SS`.
- assemble.py: recursive subtitle fitting (≤2×42 chars); relative concat paths (quotes in paths); chapter clock fix.
- new_project.sh never overwrites; scaffold is step 1. setup.sh: Linux arch/zsh/pango checks, brew uv.
- Pedagogy: question chain, naive attempt first, storyboard (central visual, key frames, aha), silence budget
  (~100 words per minute of video), short-video path; SCRIPT.md template fields; starter scene rewritten as a hook.
- SKILL.md: third-person description, fix-an-existing-video path, user preview before final, quick paths.

## 1.1.1 — 2026-10-05
- Default TTS model is now gemini-3.8-flash-lite-tts (user's choice, for cost); flash-tts documented as the quality option.
- Transcriber: join all text parts and retry once on an empty reply (one-off empty transcripts left clips unverified).

## 1.2.0 — 2026-10-05 (medieval-mental-health video + deep research on faster pipelines)
- **30-minute hard cap**: `max_minutes` (default 30) in video.json; `tts.py --list` exits 3 when the
  estimated runtime is over it. SKILL.md states the budget (≈3,000 words max, aim ≤2,700).
- **Illustrated path** for history/art/essays: `references/illustrated.md` + `examples/medieval-remotion/`
  (Remotion chapters, Gemini 2K art with paper-whitening + multiply blend, real-artwork frames, two voices,
  per-chapter render, Python mix with drone/chimes, soft subs + chapters, beat-sheet stills, render benchmark).
- Engine choice at the brief (Manim for math, Remotion for illustrated).
- audio.md: Tier-1 100 RPD per model and how to plan for it; transient no-audio retry; 3.8 consistency
  issue; ElevenLabs / MLX-Audio fallbacks; WhisperX for word timings.
- review.md: a sensitive-topics lens for Gate 1, and support lines in the credits.
- Measured render settings: JPEG 95 + x264 fast CRF 16 is 2.8× faster than PNG + slow at PSNR 49 dB.
- SKILL.md rule: say previews are low-res; finals at 1080p with 2K art.
