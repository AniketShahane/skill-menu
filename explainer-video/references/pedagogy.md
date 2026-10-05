# Pedagogy: how to make the explanation itself good

The video is only as good as the explanation in SCRIPT.md. Production polish can't rescue a confused
ladder of ideas, so most of the effort belongs in the script.

Sources: 3Blue1Brown's SoME1 advice ("just start", "concrete before abstract — open with the key
example", "topic choice matters more than production quality", "be niche"); Math-To-Manim's "reverse
knowledge tree" (prerequisite discovery); Code2Video's ablations (removing the planner cost ~41 points,
the largest of any stage); and the Kalman-filter video in `examples/kalman/`. "Stakes early",
"question chain" and the silence budget are this skill's own rules, learned from reviewing that video.

## 1. Find the viewer and the promise
- **Viewer:** write one line about who is watching and what they already know. Every word of jargon
  outside that line must be explained the first time it appears.
- **Promise:** one sentence saying what the viewer will understand by the end. If you can't write
  it, the topic is too broad, so cut it down.

## 2. Build the fundamentals ladder backwards, then teach it forwards
Start from the target idea and ask "what must they already understand for this to make sense?" Keep
asking until you reach something the viewer surely knows. Reverse that list and you have your chapters.
- Each rung uses only rungs above it. Check this line by line. Using a word before it's taught is the
  most common script bug (the Kalman review caught "predict" in the update chapter, before prediction
  had been introduced).
- About 3 to 6 rungs suit a 10-minute video. More rungs means a longer video or a narrower promise.

## 3. Shape each chapter
- **Concrete before abstract.** Show one specific case first (a cart, two numbers, one circle), then
  name the pattern, then give the formula. The formula should feel like a summary of something
  already seen.
- **The stakes within 30 seconds.** Open with a problem the viewer can feel, here "two imperfect
  sensors: which do you trust?". Never open with a definition.
- **One idea per chapter.** A short title card is fine from chapter 2 on, never in the first 15 s.
- **Question chain, not a list.** Each chapter ends on a question or tension the next one resolves
  ("…but the cart moves. What happens to the belief between readings?"). Avoid "First idea / Second
  idea" signposting beyond once. Write the chain in SCRIPT.md before any narration.
- **Naive attempt first.** Before the right answer, try the obvious one on screen and let it visibly
  fail (a plain 50/50 average of two sensors), or voice the common misconception. Then the real idea
  feels necessary instead of handed down.
- **Definitions are not beginnings.** Show a formula only if a later beat uses it. (The Kalman video
  showed the Gaussian pdf formula once and never used it again.)
- **Let the viewer predict.** Ask "what should we believe now?", pause on it, then show the answer.
- **Earn every formula.** Introduce symbols one at a time, colored to match the picture, and point at
  each term while the narration says what it means.
- **Rewrite to reveal.** Show the same formula in a more suggestive form (the weighted average
  rewritten as "move a fraction K of the way") and transform one into the other on screen.
- **Each chapter's twin.** When you generalise (1-D → matrices), put the general form beside the
  simple one and connect them row by row.

## 4. Storyboard before code
- **Choose the central visual deliberately.** List 2–3 candidate pictures for the core idea, then pick
  the one that makes the key relationship *visible* (the Kalman video: two bell curves multiplying into
  a narrower one).
- **One key frame per chapter**: the frame a viewer would screenshot. Write it in SCRIPT.md. If you
  can't describe it, the chapter has no picture yet.
- **One aha moment.** Mark it, and set it up: build-up → silence → reveal → hold.

## 5. The visual language
- **Colors carry meaning, all video long.** Pick 3 or 4 semantic colors in the script's color key,
  for example prediction = blue, measurement = yellow, estimate = green, gain = orange. Use them for
  curves, symbols in equations and labels alike. Never reuse a color for something else.
- **Transform, don't replace.** When an idea evolves, morph the old object into the new one
  (ReplacementTransform, TransformFromCopy) so the eye follows continuity.
- **A visual for every claim.** If the narration says "narrower", show widths side by side. If it
  says "settles", draw the curve settling.
- **One continuous parameter.** Many of the best moments are a slider: drag the sensor noise and
  watch the belief slide and tighten (a ValueTracker plus always_redraw).
- **Recurring characters.** One concrete object (the cart) runs through the whole video and returns
  in the demo.

## 6. Honesty and correctness
- **Every number comes from code or a source.** Simulate the demo (`sim.py`), compute its statistics
  and show them; don't eyeball "about 95%". Pick a random seed that is *representative*: the Kalman
  demo used a seed where the truth-in-band rate was the expected 95%, not a flattering 100%.
- **State assumptions** where a claim depends on them ("optimal *when* linear, Gaussian, independent
  noise").
- **Put caveats where they matter**, briefly, in a calm voice.
- **Run the adversarial script review** (references/review.md) before writing any scene code. In the
  Kalman video it found 15 issues, 2 of them wrong statements.

## 7. Writing narration for the ear
- **Pace — leave room to think.** The Gemini voice (Charon, default style) measures about **120 words
  per minute** of speech. Budget narration at about **100 words per minute of video** (≈1,000 words for
  10 min), so 15–20% of the runtime is pictures without talk. `tts.py --list` prints the budget against
  `target_minutes`. The first Kalman cut ran 151 words per minute of runtime, wall-to-wall talk, and
  the reviewer's verdict was "correct, but a lecture".
- **Silent beats.** At least one 2–4 s silence per chapter, right after its key visual change
  (`self.wait(3)`, or `pad=3` on the voice block). Vary the rhythm: a quick montage, then a slow hold.
- **Sentences:** short. One clause per line where possible. Each `self.voice(...)` line is 1 to 3
  sentences (about 4–12 s), one beat of animation.
- **Spell out symbols as spoken:** "sigma squared", "x hat", "K times the innovation". Never put LaTeX
  or Unicode math in narration.
- **No parentheses or asides.** They read badly aloud. Make the aside its own sentence.
- **Signpost:** "First idea.", "Here's the trick.", "Now for the part that feels like magic."
- **Default gap** between lines is 0.45 s. Anything longer is a deliberate choice, so make it at the
  reveals.
- **End with a recap:** one humble sentence that ties every rung together, said over a calm repeat of
  the core animation.

## 8. Length and structure defaults
- **6–12 min** (default): hook (≈45 s), each rung (≈1.5 min), worked demo (≈1 min), generalisation
  (≈1 min), limits and uses (≈30 s), recap montage (≈30 s).
- **Under 2 min:** no chapter cards; 2–3 scenes of 3–5 lines each; one rung, one aha, one silence;
  skip the generalisation.
- Unless the user asks otherwise, pick the shortest length that delivers the promise.
