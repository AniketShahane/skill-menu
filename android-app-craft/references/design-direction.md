# Design direction: a thesis from the subject, one or two heroes, honest numbers

What to decide before the first token, with Dash and Flick as worked examples, and how to carry
the decision through Claude Design into code. Read it at the start of a new app and before any
redesign.

The four-step method (say what the product is about in the user's words → mine the subject's
physical vocabulary → draft two or three signatures → run the counterfactual) is android-design's
and is not repeated here: `android-design/SKILL.md`, "Deriving a direction". So is the ceiling of
one bold surface per screen ("The Android default look"). This file adds what the two shipped
apps proved: the worked theses, how far the shipped direction moved from the brief, the honesty
rules both apps reached on their own, and what each app tried and removed.

---

## 1. Write the thesis as one sentence, and put it in the theme file

- **Rule:** before naming a color, write one sentence that takes the look from the subject.
  Put it in the code and in the design docs, word for word.
- **Why:** a sentence is an argument a reviewer can check against the subject; "I liked the
  teal" is not. Both apps kept an identity the wallpaper could not erase because every role
  traced back to it.
- **How:** the starter has four thesis slots. Fill all four with the same sentence:
  the header comment of `ui/theme/AppColors.kt` (code), `docs/design/design-tokens.md:12`,
  `docs/design/brief.md:42`, and `CLAUDE.md:7`. `references/theme-and-type.md` §0 points here.

### 1.1 Dash (a running app)

- **Direction** (dash:docs/design/README.md:5): "ink background, electric chartreuse action
  color, warm-white text, lavender recovery accents, locally bundled Space Grotesk display
  typography, and a custom forward-moving D mark." On an active run the full street map is the
  canvas and telemetry floats on ink cards. Dash never wrote a thesis sentence; that list is
  tokens, not an argument. One that fits its direction, written for this skill, is:
  high-visibility kit on asphalt.
- **Dash's values:** ink `#10110F`, chartreuse `#DFFF00`, lavender `#CAB8FF`, warm white
  `#F4F3E9` (examples/sample/ui/Theme.kt (`AppColors`, `LightColors`, `DarkColors`)).
- **The mark came from the thesis, not a mood board.** The prompt asked for "a single abstract
  forward-leaning capital D made from a thick continuous racetrack ribbon with a precisely cut
  horizontal dash of negative space … subtle 12-degree forward lean", one color `#DFFF00` on
  `#10110F`, occupying 58 % × 54 % of the canvas for adaptive-icon masking
  (dash:docs/design/README.md:20).
- **Light mode kept the idea, not the hex.** Paper `#F7F8F0`, dark-green ink `#182017`. Lime
  stays as the `primaryContainer` fill, but `primary` becomes forest `#345122`, so lime never
  carries text on paper. "Fixed bright brand panels use fixed dark foregrounds so they stay
  readable in either theme" (dash:docs/light-mode/README.md:5; Theme.kt:65-75).
- **No dynamic color at all.** The brand is the product.

### 1.2 Flick (casting films from a phone to a TV)

- **Thesis, as shipped** (flick:sender/.../Theme.kt:33-39, introduced in a0ebf75; read at
  a6bda78): "light is a blue tool that plays amber films, dark is the film's own amber become
  the interface". The TV behaves like a cinema's house lights.
- **Flick's values:** electric blue `#1240E8`, amber `#FFB61E`; the media pair `PlayheadHi
  #FFD873` / `PlayheadLo #F5A100` is amber in all four palettes (examples/flick/sender/Color.kt:88-104).
- **The roles swap between themes, on an argument.** In light, blue acts and amber plays. In
  dark, gold `#FFC93D` acts and blue `#6E93FF` only ever fills areas. Why: "about 2 % of retinal
  cones are blue-sensitive and the eye focuses blue in front of the retina … so a saturated blue
  is the worst hue there is for small targets and fine lines on near-black" (Color.kt:152-165).
  The swap moved the selected nav pill from 3.69:1 to 6.93:1 (Color.kt:167-182).
- **Dynamic color reaches only quiet tonal containers**, never an anchored role
  (flick:sender/.../Theme.kt:172-181).

### 1.3 The brief is not the shipped design, and that is fine

| | Brief asked for | Shipped | Why it moved |
|---|---|---|---|
| Flick accents | warm vermilion/coral spark + cyan for TV focus (flick:docs/design-brief.md:48) | electric blue + amber (commits 7fe301e, 1ed8281) | a later Claude Design pass ("Flick Remote", "Flick TV (Receiver)"); amber became the film's own light |
| Flick TV focus | cyan glow | a detached amber ring, white on amber fills | one hue per job; cyan left for the network |
| Flick faces | "name system-safe families" | Space Grotesk + Roboto Mono (downloadable) → Archivo / Manrope / IBM Plex Mono → Bricolage / Geist / Geist Mono, bundled (f1b13ae → 7fe301e → 40791d0) | the downloadable path never rendered once: an empty certificate array |
| Flick first token doc | "warm editorial direct-play": ivory, plum, coral | blue-black and pale blue `#F2F6FF` | superseded, and the doc was not updated (§8) |
| Dash | "warm offwhite + forest/acid lime sport palette" (dash:docs/CONTRACT.md) | ink-first dark, chartreuse, lavender (0.2.0); paper + forest came back as the light theme (0.2.1) | the 0.2.0 redesign (dash:docs/design/README.md:5); the reason is not recorded |

**Rule:** let the direction move when the evidence or the user moves it, then update the tokens
file in the same change. A drifted brief is harmless; a drifted tokens file misleads the next agent.

## 2. Spend the budget on one or two hero moments

- **Rule:** name the hero in the brief's first paragraph and weight everything toward it.
  Everything else is quiet and consistent.
- **Why:** Flick's brief said "The synchronized phone⟷TV scrub is the hero — weight your effort
  there above all else" (flick:docs/design-brief.md:5), and the shipped scrub is the most
  developed thing in either app. Both apps lead each screen with one bold surface, not five:
  Dash's lime headline card, Flick's amber play key and playhead.
- **The worked heroes:**
  - **Dash:** a card on Home flies apart into its run page, piece by piece: the map opens into
    the hero, the number strip unrolls into the lime panel, distance grows 22 → 58 pt, the type
    chip drops above the title (`references/navigation-and-shared-elements.md`).
  - **Flick phone** (shipped, `examples/flick/sender/PhoneScrubBar.kt`): the synchronized
    scrub. An amber played fill is the optimistic target. A pale `Ghost` echo tick
    (`#7FB0FF`, 3.5 × 28 dp) marks the TV-confirmed position, drawn only while dragging and
    more than 0.4 % from the target, so healthy sync is invisible. A pale-blue SYNCING…
    shimmer runs while the TV clock is stale. The TV draws the confirmed position as a hollow
    white ring (receiver `TvScrubBar.kt`). The coral and cyan wording in
    flick:docs/design/design-tokens.md:318-338 is the retired design (§8).
  - **Flick TV:** house lights. "The room closes to the centre as a dithered aperture at 60 Hz,
    the handshake card rises out of the last light, and at the first frame the veil lifts
    uniformly off the picture" (commit a6bda78).
- **Where the hero may not go:** "The reference illustrates a hero, not a license to put a large
  image, cyan glow, or asymmetry into errors, advisories, diagnostics, or every list row"
  (flick:docs/design/design-tokens.md, Selected reference rules).

## 3. Never animate a measurement, and never fabricate a value

- **Rule:** a live measured number snaps between readings. An unknown value shows "—". A
  count-up is for a saved statistic arriving on a page, never for a reading.
- **Why:** both apps reached this independently. Dash: "The speed readout has no interpolation,
  counting animation, or display delay" (dash:docs/design/README.md:7). Flick: "Every measured
  number SNAPS between values — a tweened measurement is a fabricated measurement"
  (flick:docs/design/design-tokens.md:283-285). A gauge *fraction* may move on an effects spec
  only, "because a spatial overshoot would draw a reading that was never taken".
- **The same rule for badges:** Flick showed "SD" on a file with unknown metadata, which was "an
  absence turned into a positive claim" (commit 7f87444). Unknown metadata is now withheld.
  Status copy derives from real state: a "Live" pill that said Live while paused was replaced by
  one that reads the playback phase (commit 7fe301e).
- **How:** the starter's `AnimatedNumber` is for saved values on a page's entrance. A live
  value uses plain text with `tnum`, so its width never shifts.

## 4. Say each number once, and cut copy to the decision it carries

- **Rule:** every readout answers a question nothing else on the screen answers.
- **Why:** Dash's Home had "fourteen readouts, perhaps six questions": the week hero, the
  twelve-week chart and a total-distance tile all reported the same week. It now keeps six:
  "this week, twelve weeks of volume, the pace trend, the consistency heatmap, two personal
  bests, recent runs" (commit 060f6c9). Explanations moved behind info buttons
  (dash:README.md:25).
- **Copy:** Flick's audit reworded 59 strings, 1,279 → 961 words; the longest paragraph went
  from 41 words to 24. "An error states the problem and the fix and stops; an explainer carries
  one idea; nothing restates the title above it" (commit 680c9e4). It kept every measured
  number, every privacy disclosure and all compliance copy.
- Voice rules in depth: `android-design/references/copy-and-type.md`.

## 5. Give each item type a fixed hue

- **Rule:** when items have types, give each a fixed hue that is the same in both themes, always
  with dark ink on top.
- **Why:** Dash's plan colored runs "so all ten types read apart" (commit 9c1380b), on dark map
  cards and light paper alike.
- **Dash's values** (examples/sample/ui/Components.kt (`ItemCategoryColors`)): Easy = lime `#DFFF00`, Long
  `#7FE1C9`, Recovery = lavender, Tempo `#FFB86B`, Fartlek `#B9F26B`, Intervals `#FF8FB1`,
  Hills `#9BE89B`, Progression `#8FD3FF`, Time trial `#FFE66B`, Race `#FFD166`. Ink on all:
  `#10110F`.
- **Test it:** each hue with its ink clears 4.5:1, and any two types that can appear together
  differ by at least 25° of hue or 1.3:1 in luminance, plus an icon or label. Dash's own values
  fail that floor: Time trial `#FFE66B` and Race `#FFD166` are 8° and 1.15:1 apart, Easy and
  Time trial 1.10:1. On light paper `#F7F8F0` every chip is only 1.06-2.0:1 off the page, so a
  fixed pastel chip needs a card ground or an outline there. Both checks belong in the theme's
  contrast test.

## 6. Two values get two treatments

- **Rule:** when the app holds two versions of one fact (what the user asked for, what the
  system confirmed), draw them differently and label both for accessibility.
- **Why:** Flick's scrub separates the optimistic target (the solid fill) from the confirmed
  position (an echo tick on the phone, a hollow ring on the TV), so lag reads as "alive and
  honest, never broken" (flick:docs/design-brief.md, Design philosophy). The same idea covers a pending save, a syncing count, a queued change.

## 7. What each app tried and removed, and why

Removals are direction decisions too. Record them, so the next app does not re-add them.

| App | Tried | Removed because | Evidence |
|---|---|---|---|
| Dash | whole-page cross-fades | full-page alpha was the top jank source | c9323c7 |
| Dash | an icon-over-label bar in four narrow columns (69 dp each at 384 dp) | reason not recorded beyond "narrow"; replaced by one line, a lime capsule with icon and name taking two slots | dash:docs/upgrade-0.9.2/README.md, The bar |
| Dash | eight tiles, a workout-mix card, RUNS / TIME / FASTEST pages | each said a number already said | 060f6c9 |
| Dash | a near-black film sweeping over tab switches | in light mode it was most of the flicker between tabs | 1940b64 |
| Dash | a scrim behind a card flying apart | going back uncovered the list dark, then brightened: an 11-level dip on the recording, now 0 | ea5137b |
| Dash | a route pre-painted into a picture | showed a doubled line | c4ab031 |
| Flick | coral / cyan on violet-black | replaced by a later Claude Design pass ("Flick Remote", "Flick TV"); no reason recorded (the thesis sentence came later, in a0ebf75) | 7fe301e, 1ed8281 |
| Flick | downloadable fonts | never rendered once (empty certificate array) | 40791d0 |
| Flick | cyan focus | one job per hue; amber ring | 1ed8281 |
| Flick | `focusPop` / `syncSpring` curves | interruptible things need springs | design-tokens.md §6.2 |
| Flick | a centred "Paused" chip | the viewer who pressed pause needs chrome out of the way, not a label | 7f87444 |
| Flick | a translucent-gold captions key | composited brown over blue glass | 0fa09f1 |
| Flick | an amber mat to win the media card's color | "the card taking its colour from the film is the trade the viewer would rather have" | f16ae49 → 776a338 |
| Flick | an amber QR finder eye | binarized as white and broke detection; the eye was reverted and the scanner moved to ML Kit | c987846, c4873de |
| Marginalia | a card → reader shared element | the same `hero-<id>` existed on two surfaces and crashed the shared-bounds pass | user memory, marginalia-app |

## 8. The chain: brief → design system → tokens → spec → code

- **Rule:** each link narrows the one before, and the code is checked against the last link,
  never against the design HTML.
- **How:**
  1. **Brief** (`docs/design/brief.md`): thesis, hero, honesty rules, both themes, constraints.
  2. **Design system** from Claude Design (§9), saved as `docs/design/<app>-design-system.html`.
  3. **Tokens** (`docs/design/design-tokens.md`): tables per layer, the semantic role mapping
     (job → app token → Material 3 role), and "Last verified against code: `<commit>`".
  4. **Spec** per surface (`docs/design/spec-template.md`): invariants, test contracts, and every
     deliberate deviation from the design with its measured reason. "Every agent working on this
     redesign implements against THIS file, not against the raw design HTML"
     (flick:docs/design/receiver-expressive-spec.md:7-10).
  5. **Code:** the theme lane turns tokens into `AppColors` / `AppTypography`. Screens never
     write a hex value, and never a literal gap or radius (`AppSpace`, `AppCorners`); fixed
     sizes such as touch targets are named constants.
- **Keep the chain honest:** Flick's tokens file called itself canonical and still listed coral
  and cyan after the code moved to blue and amber (flick:docs/design/design-tokens.md:11-16 vs
  sender Color.kt:91-104). A later edit, 958b17a, patched the doc's TV focus row to amber and
  still left coral in place. Update tokens in the same commit as the color, or mark the code as
  the source of truth.
- **One step may be skipped, and only on the record:** the design system (step 2). If the user
  declines Claude Design or it is not available, derive the tokens from the brief and write
  "Visual source: none imported (<reason>, <date>)" in the tokens header (§9). Every other
  step stays.

## 9. Using Claude Design

- **Who runs it.** A Claude Code session cannot run Claude Design itself. It fills
  `docs/design/brief.md`, then:
  1. If the host's Artifact tool lists a Design artifact type (a `quickstart` with intent
     `design` shows it), it creates the design from the brief there, and saves the page it
     reads back.
  2. Otherwise it asks the user to paste the whole filled brief into Claude Design as one
     message, and to hand back the exported HTML page.
  Either way the page is saved as `docs/design/<app>-design-system.html`, and the project id or
  artifact link goes in the brief and the tokens header.
- **If the user skips it.** When the user declines, or neither route exists, the session does
  not stall: it derives the tokens from the brief's thesis straight into `design-tokens.md`
  and records "Visual source: none imported (<reason>, <date>)" there. A later import replaces
  that line and re-derives the tables.
- **Paste the whole brief as one message.** It returns one self-contained HTML page (inline CSS
  and SVG, no network) that previews and iterates in place.
- **Ask for one committed direction.** "Committed (do not offer multiple-choice palettes)" is in
  Flick's brief for a reason: options move the decision back to you, unmade.
- **If the first pass thins out toward the end,** re-prompt section by section ("regenerate
  Part 4 — the storyboard — at full fidelity"). The hero and its screens matter most.
- **To explore identity,** vary only the brand section (color story or mark) and hold the rest
  fixed (flick:docs/design-brief.md, closing note).
- **It is a browser mockup, so expect deviations.** Flick's TV design put mono labels at 6–8 sp
  after ÷2 and chrome 28 dp from the edge, inside the 5 % overscan inset. The spec records the
  floors and clamps as "(deliberate deviation)" (receiver-expressive-spec.md §1a, §1b).
- **Record the project id and file name** in the brief and the tokens header, and the SHA-256 of
  any reference image the user picked.
- **Check the design against the product's truths** before importing it: no fabricated numbers,
  no states the app cannot detect, no claims about data it does not have.

## 10. Symptom → cause → fix

| Symptom | Cause | Fix |
|---|---|---|
| The app looks like a Compose sample with a nicer hue | no thesis; tokens picked first | §1: one sentence from the subject, then tokens |
| Every screen shouts | more than one bold surface; the hero spread everywhere | one bold surface per screen; the hero stays on its screens |
| Dark mode looks flat or muddy | dark aliased from light | design dark as its own set; swap roles if the physics argue for it (§1.2) |
| A brand color carries body text and fails contrast | one hex doing two jobs | split fill and ink roles (Dash's lime fill vs forest primary) |
| A number counts up every time data refreshes | a live measurement was animated | measurements snap; count-ups only for saved values on entrance |
| A badge claims a quality the app never measured | absence rendered as a default | withhold; show "—" |
| Home has ten tiles and users read none | the same number said three ways | §4 audit: one readout per question |
| Types blur together on one theme | theme-dependent type colors | fixed per-type hues with dark ink (§5) |
| Agents built the old palette | tokens file drifted from code | verified-at line; update in the same commit |
| The design HTML and the app disagree and nobody knows which is right | no spec, or deviations unrecorded | a spec that lists each deviation with its reason |
