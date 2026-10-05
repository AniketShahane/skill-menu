# Shared-element flights ("card pieces") in SwiftUI

Opening an item from a card should not push a page over it. The card should fly apart into
the page: its map grows into the hero, its panel becomes the page's panel, and its title,
date and numbers each fly to their places, while the page's background fades in underneath.
Back reverses it. This is the most-noticed motion in an app, and SwiftUI has no built-in way
to do it:
- `matchedGeometryEffect` animates only the inserted view, re-lays out text and can't
  crossfade two ends.
- `.navigationTransition(.zoom)` scales the whole page as one block.

## Start here

- **`templates/app/CardFlight/` is the generic engine.** It needs only SwiftUI and UIKit, takes
  your own part enum, and compiles in Swift 5 and 6. Its README says how to wire it and what to
  tune. `templates/starter/` uses it (Home cards fly into their page), and
  `templates/scripts/new-app.sh` makes a building app from the starter. That app measured 0 ms/s
  motion hitch and 0 pops on every flight moment over 3 runs.
- **`examples/card-pieces/` is a fuller version,** for depth: maps drawn from
  cached renders, two card forms, and a full-screen map inside the layer. It is a generic
  rewrite of a shipped engine and does not compile on its own.

Below is how the engine works and why.

## Architecture

1. **The detail page lives in an overlay layer above the list, not in a NavigationStack.**
   - A NavigationStack push removes the list from the window, so there is nothing to fly
     between.
   - The layer holds the page (and anything pushed from it, like a full-screen map, as
     entries in its own small stack).
   - It sits above the `NavigationStack` (so it also covers pushed pages such as a metric
     page), below the bottom bar, which sits below any `+`-button morph layer.
2. **A flight layer draws both ends of every piece** above both pages, in window coordinates
   (`.ignoresSafeArea()`, positions from `frame(in: .global)`).
   - A second copy of the flight layer sits *under* the page, for card ends with no page end
     to meet.
   - While a piece flies, the real views are hidden (see "Hiding" below).
3. **One linear clock drives everything.** Frames, corners, per-piece alphas, the page's
   paper, the staggered after-pieces and the bottom bar are all pure functions of `t`.
4. **A state machine with a generation counter:** `closed → mounting → opening → open →
   closing → closed`. Every async step checks `generation == mine`.

## Pieces

Each piece is a `part` (map, panel, chip, title, date, each label, value and unit, badge)
with a **kind**:

| Kind | How it travels | Example |
|---|---|---|
| surface | Moving frame and moving corner radii. Map: laid out again at the live size, drawing the same image aspect-fill cropped. Panel: content laid out once at its own size (anchored top-leading) while its ground and edge follow the live frame and the frame clips. | map, number panel |
| element | Drawn once (the arriving end), moved and scaled to the frame | type chip |
| same text | Both ends laid out at their own size, each scaled uniformly to the live frame's width, leading, vertically centred, crossfading | title, numbers |
| other text | Different words at each end. Each end at its natural size, leading, vertically centred, crossfading with a gap (leave in 90 ms, arrive after 60 ms). Its resting frame must span the full line width. | "Yesterday" → full date, "TIME" → "RUN TIME" |

Keys pair a card end with a page end: `item:<id>:<part>@<scope>`. The scope is the list page
the card is on. A run shown on two pages then never pairs across tabs, and each list has its
own form (a full card vs a compact row carries different parts; the page shows the
uncarried ones fading in place after 120 ms).

## Timings (Android-matched; all from t = 0)

- Frames and corners: 480 ms on (0.25, 1, 0.5, 1). This is front-loaded, so the first frame
  matters most.
- Card-end surface: fully opaque until the page end is solid, then removed at 220 ms. It
  never half-fades and shows the list through two maps.
- Page-end surfaces and same text: 220 ms fade in. Card text: 150 ms fade out.
- A dark lime panel swaps in 60 ms linear (part-way lime over near-black reads as olive).
- A compact row's map arrives in 40 ms; on close it holds 250 ms, then leaves in 70.
- Page background: 220 ms fade.
- After-pieces (everything the page has that the card lacks) arrive at `240 + 55·i` ms over
  220 ms, rising 16 pt. Buttons pop at `240 + 45·i`, scaling from 0.6. On close all of them
  leave at once in 150 ms, *from the value they had reached*.
- Bottom bar: leaves with the first moving frame; returns 240 ms into a close.
- Close is the exact reverse, from the page as it is now (it may be scrolled or shrunk by a
  back swipe).

## Looks: the key to no pops

Each end hands the flight layer a *look* factory: `(part, ownSize) -> ItemLook(view, ground,
edge, edgeOpenTop)`.
- Build looks from **the same view code** as the real views: factor titles, numbers and
  panels into small builders used by both. A look must be pixel-identical to the real view
  at its end, or the first or last frame pops.
- **Inside a look, the parts that fly on their own are left out but keep their room.** The
  same `.itemPiece` modifier reads a `role` environment value (`live` / `look`), hides the
  part at 0.001, and doesn't measure.
- The card stages its looks in its button action, just before asking to open. The page
  registers its looks from its body (an `@ObservationIgnored` property, so assigning from
  `body` is safe), so they always reflect current data.
- **Anything the page shows inside a flying surface's area goes in that surface's look too**,
  with the same after-piece timing. The flying hero covers the page underneath it. The starter's
  back button sat on the page over the hero and appeared all at once at landing, a one-frame
  change of 0.9% of the hero region, which is under the pop detector's 4% threshold. Dash's
  `heroLook` draws its buttons for this reason.
- A map look is a dedicated view that draws cached images only. **Never lay out the real
  thumbnail view in flight:** it requests a render per size. Crop-fit the image into the
  live box and keep the route stroke width constant. The veil and attribution follow the
  live edges. Blend the end's own render with the widest cached stand-in by the share rule
  (the own render shows once the box covers its whole height, else in the last 5%).

## Measuring each end

- **Report both the global frame and the own laid-out size.** Use `onGeometryChange` →
  `(frame(in: .global), size)`. A pressed card is scaled ~2.5% (button press style), a
  back-swiped page ~8%. A look laid out at the scaled size cuts text short ("Morning te…").
  Lay every look out at its own size, then:
  - scale same text and elements by `frame.width / size.width`;
  - scale other text and panels by their own end's scale;
  - lay out maps at `live / k` and scale by `k`, where `k` eases between the two ends'
    scales.
- **Measure only when needed.** On a card, only while that card is flying and a flight is
  being prepared (a background `Color.clear.onGeometryChange` inside an `if`, so the card's
  own identity doesn't change). On the page, only while mounting or preparing a close. Not
  on every scroll frame.
- **Start once both surfaces of both ends have reported.** Schedule the start on the next
  turn, when every piece from that layout pass is in. Add a timeout that flies with what it
  has.
- **A piece is matched only if both ends intersect the screen.** Unmatched ends fade in place.
  A card end with no page end is drawn *under* the page (the under layer) unless its
  containing surface flies.

## Hiding

- Real pieces hide at **opacity 0.001**, not 0, from the page's build frame onward. At 0,
  the whole page is rasterised on the landing frame (a 40–50 ms stall mid-motion).
- Card pieces read `flyingId` first and return early, so only the flying card depends on the
  flight.

## Order of operations (open)

1. **Tap (frame A).** The card stages its looks.
   - `open()` mounts the page with its background at alpha 0, its pieces hidden, and its
     after-pieces at 0.
   - It starts measuring on both ends, holds background renders, and hides the list from
     accessibility (a frame where nothing moves).
2. **The measurements arrive.** Create the flight at t = 0, which is the same picture as the
   card, then hide the card.
3. **The flight layer's `onAppear`** calls back. On the next turn, start the linear clock
   (to the choreography's tail, 735 ms) and move the bar. Keep a 2-frame timer as a backstop.
4. **Landing (480 ms + a frame).** Remove the flight. The page's own pieces take over, and
   they are the same picture. After-pieces and the route draw-in continue from the same
   clock.

Close mirrors it:
- Measure the card again where it is now.
- Build the flight from the page as it is.
- Relax any back-swipe shrink while the pieces fly.
- `finishClose`: un-hide the card, keep the invisible page mounted ~0.3 s (so its teardown
  lands after the bar), and restore accessibility ~150 ms after settling.

## Back gesture

Follow Android's predictive back: a left-edge `UIScreenEdgePanGestureRecognizer` (through
`UIGestureRecognizerRepresentable`) shrinks the page with the finger (scale 1 − 0.08e, x +28e,
corner 28e, e = ease(progress)), through a very short interactive spring so jumpy touches
never jump the page.
- **Release past 35% or on a fast flick:** fold the pieces back from the shrunk positions,
  whose global frames include the transform.
- **Cancel:** spring back.
- Other pans (scroll, map, chart scrub) wait for the edge pan to fail.

## Everything a NavigationStack push did for free

You now have to do all of this yourself:
- Hide the list from VoiceOver and touches while covered. Say it on each page and on each
  accessibility container, since the stack's modifiers don't reach into UIKit-hosted pages
  and the nearest `accessibilityHidden` wins.
- Post `.screenChanged` at still moments.
- Add `.accessibilityAction(.escape)`.
- Refuse back while a dialog is up (and give the dialog its own escape → cancel) or while a
  close is being measured.
- Make the bar tappable only once the page is gone.
- Delete (the card is gone) and Done: close with a plain sink, not a flight. Pop pushed
  pages under the opaque page first, so you land on the tab.

## Verify with numbers and strips

- **The journey test** should include: open from each list form, open again (warm), back by
  button, back by edge swipe, and back from a scrolled-down page.
- **Numbers:** motion hitch 0 during flights, zero pops, response < ~130 ms for the first
  open of a session.
- **Frame strips:** compare them side by side with the Android reference slow-motion strips
  (`measuring-motion.md` has the strip tool).
