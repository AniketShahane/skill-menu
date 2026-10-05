# card-pieces: a fuller card-to-page flight, for depth

`templates/app/CardFlight/` is the generic engine and the place to start a real app from (see
its README, and `templates/scripts/new-app.sh`). This folder is a fuller example on top of it,
written fresh for this skill from the same ideas: two card forms flying into one page, a hero
drawn from cached renders instead of a live view, page-only content below the pieces, and back by
button, by edge swipe, or blocked by a dialog. It is a generic rewrite, not a shipped app's code,
and it does not compile on its own (no `Item` data layer, no app target, no AppModel) — read it
for the shape, don't paste it.

| File | What it shows | Extends CardFlight's… |
|---|---|---|
| `ItemPieces.swift` | `ItemPieceKind`/`ItemPieceEnd`, the `ItemPiece` protocol, `ItemPieceTiming` (the pure timing table), `ItemLook` (one `corner` radius, not four), and the `.itemPiece`/`.itemAfterPieces`/`.itemPaper` modifiers plus the environment | `FlightTiming.swift` + `FlightPieces.swift`, combined into one file |
| `ItemLayer.swift` | `ItemLayerState` (closed → mounting → opening → open → closing → **retiring**), `ItemFlight` (pairs each piece's card and page ends), and `ItemLayerModel`, the state machine: open, measure, fly, land, back, close, retire | `CardFlight.swift`, with the phase folded into one enum instead of two cooperating types |
| `ItemDetailHost.swift` | `ItemDetailHost` (the page overlay layer above the tabs), `ItemFlightLayer` (draws the pieces in the air), the edge-swipe back, `ItemPageReveal` (an entrance that plays once per session key), and the above-the-fold-then-rest build split | `CardFlightPage.swift`, plus the two motion-craft.md lessons it leaves to the page itself |
| `ItemCard.swift` | The full card form: a thumbnail hero, a number panel, a title and a count chip. Declares `ItemPart` (the piece enum) and `Item` (the neutral model: a title, a number, a thumbnail) | Wires the generic engine's parts; nothing in CardFlight corresponds to a second card form |
| `ItemRow.swift` | The compact list-row form: a small square thumbnail, inline title and count, no panel view of its own — flying the *same* `ItemPart` pieces into the same page | Shows why a piece's kind, not its container, decides how it travels |
| `ThumbnailMap.swift` | `ThumbnailMap`, the surface piece's content: an `MKMapSnapshotter` render, cached by item and pixel size, seeded on the first frame, crossfaded in when a fresh render lands | What CardFlight's README names as a known gap ("a map drawn from cached renders") |

## What's actually new here, past the generic engine

1. **Two card forms, one part enum.** `ItemCard` and `ItemRow` both declare their pieces as
   `ItemPart` and both build an `ItemLook` factory from their own subviews. The layer and the
   page never know which form a flight started from — only each piece's `kind` matters
   (`ItemLayer.swift`, `ItemFlight.init`). `ItemRow` has no panel view at all; see its header for
   how an unmeasured piece becomes page-only automatically, with no special case in the layer.
2. **A hero that isn't a live view.** `ThumbnailMap` renders once into a `UIImage` and caches it
   by size, so the flight's `.surface` piece scales a bitmap, not a live `MKMapView` — cheaper
   mid-flight, and it can seed a cached render on the very first frame instead of a blank tile.
3. **Page-only content and an entrance that plays once.** `ItemDetailHost` builds the detail
   page in two passes (what's above the fold first, the rest a turn later) and gates its
   reveal animation through `ItemPageReveal`, which is claimed once per session key so a second
   visit, or a page that arrived by a plain push instead of a flight, never replays it.
4. **Back refusal and the edge swipe share one gate.** `ItemLayerModel.swipeBackEnabled` and the
   back button both go through `backBlocked`; a dialog presented from the page sets it, and both
   paths stop dead until the dialog clears.

## To adapt this into a real app

1. Pick your own parts. Keep `ItemPart`'s shape (a `kind` per case, a `holder` for anything that
   rides inside a surface) but name and size the cases for your design — a hero and a panel are
   a start, not a requirement.
2. Replace `Item` and `ThumbnailMap`'s region lookup with your real model and image source. If
   your hero is a live photo instead of a map render, you likely don't need `ThumbnailCache` at
   all — a live `.surface` piece is what `templates/app/CardFlight/`'s starter already does.
3. Host one `ItemLayerModel<ItemPart>` per app (or one per area that can fly independently), put
   `ItemDetailHost` and two `ItemFlightLayer`s around it exactly as `CardFlightPage.swift`'s
   header describes, and tag each kept tab page with `.environment(\.itemPieceScope,
   AnyHashable(AppTab.someCase))`.
4. Wire `ItemCard`/`ItemRow` the way they already are: a `Button` whose action is
   `layer.open(item.id, from: AnyHashable(scope), cardLooks:)`, and `.itemPiece` on each of the
   card's own subviews that corresponds to a part.
5. Tune `ItemPieceTiming`'s numbers for your own design, and unit-test the table the way
   `templates/starter/MyAppTests/FlightTimingTests.swift` tests `FlightTiming` — it needs only
   Foundation.
6. Add the same journey moments `shared-element-flights.md` and `motion-craft.md` call for: open
   from each card form, open again, back by button, back by swipe, back from a scrolled page —
   and measure them with `templates/scripts/frame_strip.py` before trusting the feel.
