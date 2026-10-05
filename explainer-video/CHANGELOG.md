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
