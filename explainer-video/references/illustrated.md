# The illustrated path: art, history, culture, essays (Remotion + generated art)

Use this path when the subject is people, places, stories or ideas without equations: an essay, a period
of history, a book, a biography. Manim draws math beautifully but is the wrong tool for painted pages,
photographs, manuscripts and typography-heavy quotes. The worked example is
`examples/medieval-remotion/` (27 min, 11 chapters, an Aeon history essay).

The skill's principles stay the same: a fundamentals ladder, Gate 1 review, narration as the clock,
a beat sheet per chapter, and a user preview before the final render.

## Stack
| job | tool | why |
|---|---|---|
| picture | **Remotion 4** (React → mp4, deterministic frames) | CSS/SVG typography, images, blend modes, masks; per-chapter compositions |
| narration | the kit's `tts.py`, driven by `tools/voice.py` | cache, transcript check, per-voice settings |
| illustrations | Gemini image (`gemini-3-pro-image`), `tools/genimg.py` | same Keychain key; 16:9, 21:9 and 1:1; **2K** via `imageSize` |
| real artworks | Wikimedia Commons API / The Met Open Access (CC0) | authenticity; caption them honestly |
| mix + assembly | Python (numpy, soundfile) + ffmpeg | the soundtrack is built from the same timing as the picture |
| env | `uv` project in the video folder; `npm` in `video/` | user preference: uv |

Codex image generation needs an unsandboxed `codex exec --full-auto`, which the auto-mode safety check
blocks. Use the Gemini image API directly instead.

## Data flow (copy it from the example)
```
narration.py            CHAPTERS → beats: N(id, text) narrator · Q(id, text, who, show=) source voice · pad=
  └ tools/voice.py      voices each beat (per-voice model/voice/style), → video/public/audio/<id>.wav
                        + video/src/timing.json (measured durations). --list = word/runtime budget + 30-min cap.
video/src/timeline.ts   timing.json + constants.json → frame positions. Chapter = [drawer card][beats…][tail]
video/src/chapters/*.tsx  each chapter uses useCh(key): b(id).s/.e (beat start/end frame),
                        w(id, "phrase") (frame when that phrase is spoken, by character share)
tools/mix.py            SAME arithmetic from constants.json → out/soundtrack.wav, subs.srt, chapters.ffmeta
video/scripts/render.mjs  one bundle, renderMedia per chapter → out/parts/<key>.<l|h>.mp4 (silent)
tools/assemble.py       concat parts (-c copy) + soundtrack + soft subs + chapters → out/<slug>.mp4
video/scripts/stills.mjs  settled frame of every beat → qa/<chapter>/; tools/sheet.py → contact sheets
```
Render per chapter, always. A narration change re-renders one chapter, not 30 minutes.

## Look-and-feel kit (`kit.tsx`)
- **Vellum**: a procedural parchment texture (prep_art.py), candle-light breathing, vignette, dust motes.
- **Art**: a generated illustration inked onto the page with a radial reveal and blur-to-sharp. Use
  `mix-blend-mode: multiply` plus a feathered radial mask.
- **Mini**: a real artwork in a gold frame with a slow Ken Burns move and a caption.
- **Quote**: written word by word across the beat, with the source in rubric red. Use `show=` for
  ellipses and brackets.
- **Note**: a "where and when" note in the margin. **Stamp**, **Roundel**, **Items**, **Pen**
  (stroke-drawn SVG), and **Question** (each chapter ends on one).
- **Recurring devices** carry the story. In the example, a *curio cabinet* fills one drawer per chapter
  during the silent drawer card. A *humoral compass* (a dot that feelings push around) is the central
  visual and holds the aha.

## Illustration recipe
1. **Fixed style block** on every prompt: medium and period, palette, "plain flat evenly toned cream
   background, no text, no border, no frame, no halos, subject centred with generous margin".
2. **Generate at 2K from the start** (`imageConfig.imageSize: "2K"`). 1K art looked soft at 1080p and
   cost a full redraw. Batch API = 50% off (24 h turnaround), so use it once the style is locked.
3. **Re-roll outliers**: expect ~15% to come back with frames or panels, photographed books, halos on
   non-saints, or a tiny subject. Look at a contact sheet of all of them before building scenes.
4. **prep_art.py**:
   - Divide out the paper tint so the background becomes pure white; then multiply makes it vanish.
   - Crop to the ink and write `art.json` with each image's real aspect ratio. Never hard-code aspects:
     that stretched half the art and only the beat sheets caught it.
5. **Blend gotcha**: a parent with transform, opacity or filter isolates `mix-blend-mode`, and the white
   paper shows as a rectangle. Animate the image itself (x offset), not a wrapper.

## Render settings (measured 2026-10, M-series, 300 heavy frames)
| setting | fps | quality vs PNG/slow |
|---|---|---|
| png frames + x264 slow CRF 14 | 4.2 | reference |
| **jpeg 95 + x264 fast CRF 16** | **11.7** | SSIM 0.993, PSNR 49 dB: indistinguishable |
| jpeg 95 + VideoToolbox 12 Mb/s | 7.5 | similar; larger files |

- Use JPEG 95 + `x264Preset: "fast"` for finals and veryfast at half scale for previews.
- Before a long render, check `uptime`: emulators or simulators from other projects halved throughput.
- Remotion's docs flag `filter: blur()` and `box-shadow` as slow. Prefer gradients or pre-baked images.
- Remotion Lambda could be >10× faster (docs: 10-min HD ≈ 1 min, ≈ $0.10), but it is unmeasured on
  heavy CSS. Pilot one chapter first. `@remotion/web-renderer` is alpha and supports only part of CSS.
- Licence: free for individuals and teams of up to 3 (remotion.dev/docs/license).

## QA (Gate 2 for this path)
- `node scripts/stills.mjs <chapter…>` then `uv run python tools/sheet.py <chapter>`. Read every sheet.
  - Check for: snaps instead of glides (use `mv()`), overlaps between a quote card and art, empty beats
    (a line with nothing new on screen), and stretched art.
- Sample mid-animation frames from a preview part (`ffmpeg -ss`) to check reveals and motion.
- Sync check near the end: build the mix with `--no-music` (the drone hides silences), run
  silencedetect, and compare to the last beat's start. Target within 0.2 s; the example measured 0.05 s.
- Loudness: the example mixed to −16.9 LUFS integrated. YouTube guides say −14 LUFS and ≤ −1 dBTP
  (third-party, not an official spec).
