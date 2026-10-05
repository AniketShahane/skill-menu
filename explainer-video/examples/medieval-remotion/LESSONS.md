# Lessons — The Curio Cabinet of Medieval Mental Health (Oct 2026)

First non-math explainer made with the explainer-video skill. Source: an Aeon history essay.

## Tool choice
- **Manim was the wrong engine for an art/history piece.** Used Remotion (React → mp4, deterministic
  frames) for picture, the skill's tts.py for narration, Python/ffmpeg for mix + assembly. Kept the skill's
  core ideas: narration is the clock, adversarial script review, settled-frame beat sheets.
- **Narration as data, not code:** `narration.py` (beat id, voice, text, pad, show) → `tools/voice.py` →
  `video/src/timing.json`. Picture code asks `b("c4e").s` (beat start frame) and `w("c4e", "fallen")`
  (frame a phrase is spoken, by character share). Audio mix repeats the same arithmetic in Python from a
  shared `constants.json`, so picture and sound can't drift.
- **Render per chapter** (`ch-<key>` compositions) and concat: a late narration change only re-renders
  its chapter.

## Illustrations
- Codex image generation via `codex exec --full-auto` with sandbox off was blocked by the auto-mode
  safety classifier. Gemini image API (`gemini-3-pro-image`, same Keychain key) worked first time, ~16 s
  per image. ~65 images incl. re-dos.
- Prompt for "plain flat cream vellum background, no frame, no text, no halos". Still re-did ~15%:
  frames/panels, photographed books, halos on non-saints, subject tiny in a big empty page.
- **Blend trick:** divide out the paper colour (→ pure white), crop to the ink, then
  `mix-blend-mode: multiply` onto the vellum + a radial feather mask. Looks painted on the page.
- **Gotcha:** a parent with transform/opacity/filter isolates `mix-blend-mode` → white rectangle.
  Put motion on the image itself (x offset), not a wrapper.
- **Gotcha:** keep each image's real aspect ratio (export `art.json` from the crop step). A hard-coded
  aspect map silently stretched half the art; only the beat sheets caught it.
- Real public-domain miniatures (Codex Manesse via Wikimedia Commons API, 429s → backoff) framed in gold
  gave authenticity; caption them honestly ("a poet in the classic pose of a troubled mind").

## Voice
- Tier-1 Gemini TTS = **100 requests/day per model**, and verification retries count. A 131-line
  script needs ~140 requests: plan for two days or two models. Narrator and quote voice on different
  models is fine (they're different characters); never split one character across models.
- Transient `finishReason=OTHER` (no audio) killed a whole prepass: retry per line.
- Measured: Charon on gemini-3.1-flash-tts-preview ≈ 121 wpm; Gacrux on gemini-2.5-pro-preview-tts ≈ 110 wpm.

## Script
- Gate 1 found real errors: a softened suicide reference, a weak miscarriage caveat, misquotes, an
  undefined term (acedia), a contradiction (Datini "lay awake" — he dreamed). Sensitive topics need an
  explicit reviewer lens.
- "Cover everything" in a 4,000-word essay → ~2,860 words narration → ~30 min. Say the length early.

## Toolchain
- `uv add manim` failed: Command Line Tools' newest SDK (MacOSX27) breaks the linker
  ("tapi error: unknown architecture arm64e.x1"). Fix: `SDKROOT=.../MacOSX26.5.sdk`.
- Remotion `renderStill` with one bundle renders ~11 stills in ~15 s: good enough for beat sheets.
