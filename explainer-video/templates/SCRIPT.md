# <Title> — script

**Viewer:** <who they are and what they already know, e.g. "curious, knows high-school algebra, never heard of X">
**Promise:** <one sentence: what they'll understand by the end>
**Length target:** <minutes>. Narration budget ≈ 100 words per minute of video: the voice speaks at about 120 wpm, which leaves about 15% for silent beats. Check with `tts.py --list`.

**Hook (first 15 s, no title card):** <the surprising image or question, shown in motion>
**Central visual:** <the one picture the whole video keeps returning to> (alternatives considered: <2–3>, and why this one won)
**Aha moment:** <chapter + line, what's on screen, the silence that follows>
**Misconception / naive attempt:** <what the viewer would wrongly guess, and where we show it failing>
**Out of scope:** <what we deliberately won't explain>

## Fundamentals ladder
Built backwards from the promise, taught forwards. Each rung uses only rungs above it.
1. <most basic idea>
2. <next idea, built on 1>
3. ...

## Question chain
Each chapter answers a question and ends on the next one. Read the chain aloud: it should feel like a story, not a list.
1. <question the hook raises> → 2. <question chapter 2 ends on> → ...

## Color key (fixed for the whole video)
- C_A blue = <meaning>
- C_B yellow = <meaning>
- C_C green = <meaning>
- C_D orange = <meaning>

## Fact base
Every number, formula and claim in the narration, with its source: a reference, or a script in this folder that computes it. Nothing may be invented.
- <claim> — <source / computed by sim.py>

## Chapters
### 1. <Hook: the concrete problem>  (scene S1..., ~<sec>)
Question it answers: <...>
Key frame: <the single frame a viewer would screenshot>
- <narration line>   → <what animates during it>
- (silence 2–3 s)    → <what the viewer looks at>
Ends on question: <...>

### 2. <Rung 1>
...

### N. Recap
Montage: replay key frames 1..N, one sentence each, ending on the one idea said simply.

## Title + thumbnail
Title: <poses the question, not just the topic name>
Thumbnail: <which key frame>
