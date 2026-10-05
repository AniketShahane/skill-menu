# CardFlight: the card-pieces transition, generic

Tapping a card doesn't push a page over it. The card flies apart into the page: its picture grows
into the hero, its number strip becomes the page's panel, and its chip, title, date and numbers each
fly to their places while the page's background fades in underneath. Page-only content arrives a
beat later. Back (a button, the left-edge swipe, or VoiceOver's escape) flies it all home.

These five files are that engine with nothing app-specific in them. They need only SwiftUI and
UIKit, and they compile in Swift 5 and Swift 6 modes (iOS 18). `../../starter/` is a working app
that uses them, and `new-app.sh` builds one for you. `../../../examples/card-pieces/` is a fuller
version (maps, two card forms, a full-screen map above the page) for depth.

| File | What |
|---|---|
| `FlightTiming.swift` | `FlightKind`, `FlightEnd`, the `FlightPart` protocol, `CubicBezier`, and `FlightTiming`: every alpha, curve and stagger as a pure function of one clock |
| `CardFlight.swift` | `CardFlight<Part>`, the state machine: open, measure, fly, land, back, close, retire. Plus `FlightLook` and `FlightGeometry` |
| `FlightLayer.swift` | `Flight` (pairs card and page ends, decides who draws what) and `CardFlightLayer` (draws the pieces, placed per kind) |
| `FlightPieces.swift` | `.flightPiece`, `.flightAfterPieces`, `.flightPaper`, `.flightBarAway`, `.cardFlight`, and the environment |
| `CardFlightPage.swift` | `CardFlightPageLayer`: the page above the tabs, the back-swipe shrink, the rise-in, and accessibility posts |

## The rules it encodes

Each links to where the reason is written down.

1. **The page is an overlay layer above the tabs, not a push.** A push takes the list out of the
   window, and then there is nothing to fly between. A flight layer above both pages draws each
   piece's two ends in window coordinates, and a second copy under the page draws card ends with
   nothing to meet. (`references/shared-element-flights.md` "Architecture")
2. **Parts have kinds, and each kind travels its own way.** A surface is laid out again at every
   size. A panel's content is laid out once while its ground follows the frame. An element is
   drawn once. Same text is scaled to the frame's width. Other text crossfades at its own size.
   ("Pieces")
3. **One linear clock; everything else is a pure function of it.** It is read once in a body and
   handed down through the environment into `Animatable` modifiers, never first read inside a
   `ForEach` or `GeometryReader` closure. (`motion-craft.md` §5, §6.1)
4. **Mount, then move.** The tap builds the page unseen and measures both ends. The flight goes on
   screen at t = 0, the same picture as the card. Its clock starts only after the flight layer's
   `onAppear`, with a 34 ms backstop, never in the update that inserts it. (§6.2, §3)
5. **Hidden is 0.001, never 0, from the build frame,** and a card piece checks `flyingId` first,
   so only the flying card depends on the flight. (§7, §6.3)
6. **Looks are built from the same view code as the real views,** and laid out at their own size.
   Each end reports its global frame and its own size apart, so a press or back-swipe scale never
   reaches the size. ("Looks", "Measuring each end")
7. **Close flies from the page as it is now.** It measures the card again where it is, the page
   stays mounted about 0.3 s after close with a frozen clock ("retiring"), and the bar returns half
   way through. (`motion-craft.md` §3)
8. **You own what a push did for free.** The list is hidden from VoiceOver while covered: the flip
   happens on the tap and about 0.15 s after a close settles, and `.screenChanged` is posted at
   those still moments. There is an escape action, back refusal (`backBlocked`), and an edge swipe
   whose shrink has no `if` around its content. ("Everything a NavigationStack push did for free",
   `motion-craft.md` §5, §9)
9. **Anything the page shows inside a flying surface's area must also be in that surface's look.**
   The flying hero covers the page underneath it, so a back button on the page over the hero
   appeared all at once when the flight landed. That was measured in the starter: a one-frame
   change of 0.9% of the hero region, too small for the report's pop detector. Draw it in the
   hero's page-end look with the same `.flightAfterPieces` timing.

## Wiring it in

1. **Name your parts and give each a kind** (`FlightTiming.swift` header). Say which surface or
   panel each sits in on the card (`container`).
2. **Tag the card's pieces:** `.flightPiece(CardPart.hero, id: item.id, end: .card)` on each.
   Set `\.flightScope` on every list page that can fly (the kept tab page, say
   `.environment(\.flightScope, AnyHashable(tab))`). A card with no scope opens its page by
   rising in.
3. **Stage the card's looks in the tap:**
   `flight.open(item.id, from: scope, cardLooks: { part, size in FlightLook(...) })`. Give a surface
   or panel its `ground` and its `corners`. Build every look from the card's own subviews.
4. **Tag the page's pieces** with `end: .page`. Register the page's looks from its body:
   `let _ = flight.registerPageLooks { part, size in ... }`, only while
   `\.flightPageInLayer` is true. Give the page `.flightPaper(yourBackground)` and no opaque
   background of its own. Give page-only things `.flightAfterPieces(index:)`, and buttons
   `pops: true`.
5. **Host the layers in RootView,** as explicit ZStack siblings: the pager in its
   `NavigationStack` (hidden and untouchable while `coversList`), then
   `CardFlightLayer(under: true)`, then `CardFlightPageLayer { id in DetailHost(id: id) }`, then
   `CardFlightLayer()`, then the bottom bar with `.flightBarAway(flight)`. Put `.cardFlight(flight)`
   on the ZStack. Set `flight.reducedMotion = { AppMotion.reduced }`.
6. **Add journey moments and budgets:** open, back by button, open again, back by swipe (and back
   from a scrolled page). Then look at a frame strip of each (`scripts/frame_strip.py`).

## What to tune

- **`FlightTiming`:** the durations, the stagger and the two curves. The defaults are Dash's,
  matched to its Android app (480 ms flight on (0.25, 1, 0.5, 1), 220 ms fade-in, 150 ms fade-out,
  landing at pieces + 10 ms). Replace them with your design's own spec, and unit-test the table
  (the starter's `FlightTimingTests`).
- **Kinds per part:** if a piece blurs or re-wraps in flight, it is the wrong kind. Text that
  changes words is `otherText`, and it needs a full-line frame at both ends.
- **Z order** (`Flight.Piece.z`): panels, then surfaces, then everything else, page ends over card
  ends.
- **Back swipe:** a 35% commit threshold or a 700 pt/s flick; shrink 8%, shift 28 pt, corner 28 pt.
- **What it doesn't do (see the Dash version):** several card forms that carry different parts,
  a dark-panel colour swap, a map drawn from cached renders, pages pushed inside the layer,
  and holding background renders during a flight.

## Known limits

- It is measured on the simulator at 60 Hz only. There the starter's flight shows 0 ms/s motion
  hitch and 0 pops over 3 runs. Check a ProMotion device with Instruments → Animation Hitches.
- The page takes no touches until the pieces land (0.49 s), as a pushed page takes none until its
  push ends. Tests wait for the landing before going back.
- One flight at a time: a tap on a card during a close is ignored until the close finishes.
