# Design brief for Claude Design: "Starter" — one committed design system, both themes

<!--
How to use this template
- Fill every <angle-bracket> field. Delete any section that does not apply (the TV parts, a
  second app). Keep the structure: product truth → the hero → the system → the screens →
  constraints → output format.
- Derive the thesis BEFORE filling this in (references/design-direction.md in the
  android-app-craft skill). The brief carries the thesis; it does not ask the model to find one.
- Paste the whole filled brief into Claude Design as one message. It returns one self-contained
  HTML page. Save it as docs/design/<app>-design-system.html and record the project id below.
  A Claude Code session cannot run Claude Design itself: it fills this brief, then uses a design
  tool or Artifact type for designs if the host lists one, or asks the user to paste it and hand
  back the page. If the user declines, the session derives the tokens directly and records
  "Visual source: none imported (<reason>, <date>)" in design-tokens.md
  (references/delivery-process.md §1).
- Modelled on Flick's brief (flick:docs/design-brief.md), which produced the system Flick shipped.
  Flick's lesson: the shipped palette ended up different from the brief's (coral/cyan →
  blue/amber). That is fine. What matters is that the tokens file then says what shipped.
Delete this comment before pasting.
-->

You are a world-class product and brand designer. Produce a **single, self-contained visual
design artifact**: one HTML page with embedded CSS and inline SVG, no external assets, fonts,
scripts or network calls. It delivers a **complete, committed design system and high-fidelity,
annotated mockups of every screen and state** of an Android app called **<App name>**. Render
mockups as real HTML/CSS UI (real type, layout, gradients, glass, focus) inside phone frames,
never as placeholder boxes or written descriptions. This is a design deliverable, not shippable
code, but **every choice must be buildable in Jetpack Compose with Material 3 Expressive**, and
specific enough that a Compose engineer could build it from the page alone.

**Commit to ONE direction. Do not offer alternative palettes, type pairings or layouts.** If a
choice is hard, make it and say why in one line.

**The hero is <the one moment, named>. Weight your effort there above everything else.** If you
must trade depth anywhere, protect the design system, <the hero screen(s)> and the hero
storyboard. An exhaustive icon set matters less.

---

## The product (ground every decision in this)

<Two or three sentences in the user's words: what the app does, for whom, and what it is never
allowed to do. e.g. Flick: "casts your own local 4K videos from your phone to your TV over home
Wi-Fi with zero buffering… No transcode. No accounts. Nothing leaves the home network.">

**Thesis:** <one sentence taken from the subject's physical vocabulary: its material, light,
surface, measure of time. e.g. for Dash (written afterwards; Dash never wrote one): "high-
visibility kit on asphalt". Flick (as shipped): "light is a blue tool that plays amber films;
dark is the film's own amber become the interface".>

**Honesty rules:** every number on screen is a real measurement; a measurement never animates
between values; an unknown value shows "—", never a plausible guess.

## The hero: <name>

<Describe the moment as a sequence of beats, each with what moves, what the user feels, and
what the motion must never do. Ask for a storyboard of 4–6 annotated frames. e.g. Dash: a card
on Home flies apart into its run page, piece by piece: the map opens into the hero, the number
strip unrolls into the lime panel, the distance grows from 22 to 58 pt.>

## Part 1 — The design system (show this first)

**Brand and mark.** An inline-SVG mark that reads at 16 px and 512 px, shown mono, on light, on
dark, and as the adaptive launcher icon (with the 66 % safe zone drawn). A wordmark and a
one-line voice.

**Color — LIGHT and DARK, both mandatory, both designed.** Dark is its own palette, not the
light one inverted. Give hex values and a **job** for every role:
canvas, surface, surfaceRaised, surfaceTonal, glass + glassBorder, onSurface / onSurfaceDim /
onSurfaceFaint, outline / outlineHairline, primary + onPrimary (**the tap**), accent + onAccent
(**a mark that is not a tap**), positive, caution + onCaution, trouble, scrim. Raised surfaces
are lighter than the surface under them in dark. Every ink clears 4.5:1 on every surface it
sits on; state the ratio. <If items have types: one fixed hue per type, same in both themes,
always with dark ink on top.> Dynamic color, if any, only tints quiet containers; the brand
roles never change.

**Type.** A display face and a body face (+ a mono if the app shows codes or timecodes), all
bundleable (OFL). Name the weights you use; nothing else will be bundled. Every changing number
uses tabular figures. Show the full Material 3 scale with sizes, line heights and tracking.

**Shape, spacing, layout.** One corner scale (card, tile, sheet, button, chip, bar) and one
spacing ramp. A 360 dp phone and a 411 dp phone. A floating bottom bar over scrolling content.

**Elevation and glass.** The glass bar: blur radius, tint alpha per theme, rim, sheen, and the
fallback when blur is unavailable (it must look like the same bar).

**Motion.** Name every curve and spring with its job ("arrivals from off screen", "journeys on
screen", "interruptible"). Page changes slide opaque over a dimmed page; no page cross-fades.
Entrances play once per page. Reduced motion: what each moment becomes.

**Components.** The pieces once, well: card, <domain components>, pills, sheets, empty /
loading / error states, the bar.

## Part 2 — Screens

Render each in a phone frame, light and dark, labelled with a one-line intent:
1. <Home — what it answers first. Say each number once.>
2. <Detail>
3. <Settings — appearance: System / Light / Dark>
4. Empty, loading and error states for <the screens that have them>.
5. <Large text: Home at font scale 2.0.>

## Part 3 — The hero storyboard

<The beats from "The hero", as paired frames with the motion token used at each beat.>

## Real constraints

- Jetpack Compose + Material 3 Expressive (`MaterialExpressiveTheme`, `MotionScheme`). minSdk 26.
- One-handed reach: primary actions in the lower third. 48 dp minimum targets.
- Everything must work at font scale 2.0 and with the system's animations turned off.
- <Domain constraints: what the app cannot measure, what it must never imply.>

## Output format

ONE self-contained HTML page, working offline in light and dark, structured top to bottom as:
cover (mark, thesis, the hero frame) → design system → screens → hero storyboard. Visually rich
but skimmable; annotations only where motion or behaviour needs explaining.

---

Claude Design project: `<id, once created>` · file: `<name>.dc.html` · imported on `<date>`.
