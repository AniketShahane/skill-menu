# Audio: narration with Gemini TTS (and the macOS fallback)

## How it works
- **Narration drives timing.** `tts.py --prepass` voices every `self.voice("...")` line before
  rendering. At render time each voice block knows its clip's length `d` and paces its animations to fit.
- **One clip per line**, cached in `media/voice/<hash>.wav`. The hash covers text, backend, model,
  voice, style and rate, so changing any of them re-voices only what changed.
- **Every clip is post-processed:** leading and trailing silence trimmed, loudness normalised to −16
  LUFS, 48 kHz stereo.
- **Verification:** each Gemini clip is transcribed by `gemini-flash-latest` and compared word by
  word with the script.
  - Below a 0.85 match, it re-generates (up to 3 tries; the last one without the style note).
  - The best take is kept, and anything still below 0.85 is reported by `qa.py`.
  - Transcription noise ("centre"/"center", "cart"/"card") typically scores 0.93–1.0.

## The Gemini call (as tested Oct 2026)
- **Model:** default `gemini-3.8-flash-lite-tts` (the user chose it for cost). For a higher-quality
  final, set `"model": "gemini-3.8-flash-tts"` in video.json; every clip re-voices automatically.
  `gemini-2.5-pro-preview-tts` also works. The lite model's per-minute rate limit is tighter: expect
  429 retries on a long prepass, which tts.py waits out.
- **Preferred path:** the Interactions API (`POST v1beta/interactions`). The style goes in a
  `speech_metadata` annotation, separate from the words:
  ```json
  {"model": "gemini-3.8-flash-tts",
   "input": [{"type": "user_input", "content": [{"type": "text", "text": "<line>",
      "annotations": [{"type": "speech_metadata", "style": "<director's note>"}]}]}],
   "response_format": {"type": "audio"},
   "generation_config": {"speech_config": [{"voice": "Charon"}]}}
  ```
  Audio comes back as `steps[].content[]` with `type: "audio"`, `mime_type: "audio/wav"`: a WAV with
  header, 24 kHz mono 16-bit.
- **Fallback path:** `generateContent`, with the style inside the prompt as
  `### DIRECTOR'S NOTES … ### TRANSCRIPT …`.
  - Measured: "Say warmly: <text>" was read aloud verbatim by 3.8-flash-tts every time.
  - The director's-notes layout leaked about 1 line in 4.
  - The 2.5 models return raw `audio/L16;rate=24000` PCM. `tts.py` handles both formats.
- **Inline tags** (`<short pause>`, `<long pause>`, `<breath>`, `<laugh>`) are documented for 3.8 but
  untested here. Prefer `pad=` / `self.wait()` for silence you can rely on. The verifier strips tags
  before comparing.

## Speaking rate (measured)
- Charon with the default style speaks at about **118–120 words per minute**, slower than the usual
  150 wpm for voice-over.
- Budget narration by it: video.json `voice.wpm` (default 120) drives `tts.py --list` and the clip
  length check.
- **Write numbers as words** in narration ("twenty twenty-six", "seventy-five"). Then the speech is
  predictable, and the verifier compares like with like. It also normalises digits, so "75" in a
  transcript matches "seventy-five".

## Voices
30 prebuilt voices. Good narrators:
- **Charon** (informative; the default)
- **Iapetus** (clear)
- **Sadaltager** (knowledgeable)
- **Kore** (firm)
- **Achird** (friendly)
- **Puck** (upbeat)

Let the user choose by ear:
`python tts.py --preview "A line from the script" --voices Charon,Iapetus,Kore,Achird` writes
`media/voice_preview/<Voice>.wav`. Play them with `afplay`.

The style note is part of the voice. Keep one style for the whole video, because separate calls
already drift a little in timbre and energy (observed in our runs and reported on Google's forum). Changing the style mid-video
makes the drift worse.

## Quotas, cost, failure
- **Daily cap (measured 2026-10): Tier 1 allows 100 TTS requests per day *per model*, over a rolling
  window.** Retakes from the transcript check count too.
  - A 130-line script needs about 140 requests, so it cannot finish on one model in one day.
  - Plan before voicing:
    - give each *character* one model (narrator on one model, the quote voice on another);
    - never split one character across models: the timbre changes;
    - or voice over two days;
    - or get Tier 2 ($100 spend + 3 days, automatic).
  - `--list` and the cap check cost nothing; run them first.
  - Measured rates: Charon on gemini-3.1-flash-tts-preview ≈ 121 wpm; Gacrux on gemini-2.5-pro-preview-tts
    ≈ 110 wpm. The preview/2.5 models had quota left when the 3.8 ones were exhausted.
- **Transient `finishReason=OTHER` (no audio)** happens. Retry that line; don't let it kill the whole prepass.
- **Voice consistency (open Google issue, 2026-09-30):** 3.8 TTS can change tone mid-clip on 2–7 min
  inputs. Keep clips to one line or a short paragraph. Pilot ~20 lines before committing a long script.
- **Fallbacks if drift or caps bite:**
  - ElevenLabs: `seed` plus `previous_text`/`next_text` for continuity; character timestamps;
    ~$1–2 per 30 min.
  - Local MLX-Audio (Qwen3-TTS, Chatterbox, Kokoro): no limits, a step below Gemini on the arena
    leaderboards.
  - Word timings for any engine: WhisperX forced alignment (stable-ts was archived 2026-05).
- **Rate limits** depend on the key's tier and aren't published per model.
  - `tts.py` retries 429/5xx with the server's `retryDelay`, or exponential backoff.
  - The prepass runs 3 workers. Lower `voice.workers` in video.json if you see many 429s.
- **Daily quota exhausted:** the prepass stops with a clear message. Finished clips stay cached, so
  re-running later continues where it stopped.
- **No silent mixing:** by default, a failure stops the run instead of switching to the macOS voice
  halfway through a video. `"fallback_to_say": true` allows the switch; qa.py lists every clip that
  fell back.
- **Cost (paid tier, as of Oct 2026; check before quoting):**
  - About $9 per million audio output tokens, at 25 tokens per second of audio, so 10 minutes of
    narration costs ≈ $0.14.
  - Mismatches can cost up to 3× that, since each failed take is re-generated.
  - Verification is a cheap flash-model call.
  - Google announced prices double on 2027-01-01.

## The key
- **Where it's read from:** `$GEMINI_API_KEY` first, else the macOS Keychain item `gemini-api-key`.
- **Store it once:**
  `security add-generic-password -U -a "$USER" -s gemini-api-key -w`
  With `-w` last and no value, it prompts for the key, so the key stays out of shell history and `ps`.
- **Never** write the key into project files, logs, video.json, or the skill folder.
- The scripts send it only in the `x-goog-api-key` header, never in a URL, so it can't leak into an
  error message.

## macOS `say` fallback
- Set `"backend": "say", "voice": "Samantha", "rate": 178` for an offline, free, robotic voice. It's
  fine for drafts and timing passes.
- A good workflow on a tight quota:
  1. Iterate visuals with `say`.
  2. Switch to Gemini for the final pass. Clips re-voice, and the scene timing follows automatically
     because animations are paced by `d`.
