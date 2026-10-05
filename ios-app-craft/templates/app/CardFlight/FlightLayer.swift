import SwiftUI

// FlightLayer: one open or close in the air (Flight) and the layer that draws it (CardFlightLayer).
//
// What: Flight pairs every measured card end with its page end and decides who draws what.
// CardFlightLayer draws each piece's ends in window coordinates, placed per kind by PieceMotion,
// every frame a function of the clock.
//
// Wire in: two copies in RootView's ZStack, around the page layer (see CardFlightPage.swift):
//   CardFlightLayer(flight: cards, under: true)   // card ends with nothing to meet, under the page
//   CardFlightPageLayer(flight: cards) { id in DetailHost(id: id) }
//   CardFlightLayer(flight: cards)                // the pieces in the air, above both pages
//
// Lessons it encodes (references/shared-element-flights.md "Looks", "Measuring each end";
// motion-craft.md §5-§6):
// - Read the clock in body and hand it down. A first read inside ForEach's closure is not tracked,
//   and the pieces freeze. Per frame only PieceMotion's body(content:) runs, never a look's body.
// - Lay every look out at its own size and scale it into the live frame. Laid out at a measured
//   size, a pressed card's title is cut short ("Morning te..."). Surfaces are the exception: they
//   are laid out again at every size (live / k, drawn at k, k easing between the ends' scales).
// - A piece is matched only if both ends are on screen. An unmatched end fades in place; a card
//   end with nothing to meet is drawn under the page unless its container flies.
// - The layer calls back from onAppear: the clock starts only once the flight is on screen.
// - No compositingGroup or drawingGroup on moving pieces (offscreen passes, blurred text).

/// One open or close in the air: where every piece starts and lands, and the looks of both ends.
struct Flight<Part: FlightPart> {
    struct Piece: Identifiable {
        struct Key: Hashable { let part: Part; let end: FlightEnd }
        let part: Part
        let end: FlightEnd
        /// Where this end is drawn at the start and the end of travel (the same rect when it has
        /// no partner and fades in place), how scaled each was on screen, and their corners.
        let from: CGRect, to: CGRect
        let fromScale: CGFloat, toScale: CGFloat
        let fromCorners: RectangleCornerRadii, toCorners: RectangleCornerRadii
        /// This end's own laid-out size (its look is laid out at it) and its scale on screen.
        let rest: CGSize
        let ownScale: CGFloat
        let look: FlightLook
        /// Drawn under the page: a card end with no page end to meet, part of the list.
        let under: Bool
        var id: Key { Key(part: part, end: end) }
        /// Stacking: panels under surfaces under everything else; a page end over its card end.
        var z: Double {
            let base: Double = switch part.kind {
            case .panel: 0
            case .surface: 2
            default: 4
            }
            return base + (end == .page ? 1 : 0)
        }
    }

    let id: AnyHashable
    let opening: Bool
    let pieces: [Piece]
    private let drawnCard: Set<Part>
    private let drawnPage: Set<Part>

    @MainActor
    init(id: AnyHashable, opening: Bool, card: [Part: FlightGeometry], page: [Part: FlightGeometry],
         cardLooks: FlightLookFactory<Part>, pageLooks: FlightLookFactory<Part>, screen: CGRect) {
        self.id = id
        self.opening = opening
        func onScreen(_ g: FlightGeometry?) -> FlightGeometry? {
            guard let g, g.frame.width > 0, g.frame.height > 0, g.size.width > 0, g.frame.intersects(screen) else { return nil }
            return g
        }
        var pieces: [Piece] = []
        var drawnCard = Set<Part>(), drawnPage = Set<Part>()
        func add(_ part: Part, _ end: FlightEnd, own: FlightGeometry, look: FlightLook, from: FlightGeometry, to: FlightGeometry,
                 corners: (RectangleCornerRadii, RectangleCornerRadii), under: Bool = false) {
            pieces.append(Piece(part: part, end: end, from: from.frame, to: to.frame, fromScale: from.scale, toScale: to.scale,
                                fromCorners: corners.0, toCorners: corners.1, rest: own.size, ownScale: own.scale,
                                look: look, under: under))
        }
        for part in Set(card.keys).union(page.keys) {
            let c = onScreen(card[part]), p = onScreen(page[part])
            if let c, let p {
                let cardLook = cardLooks(part, c.size), pageLook = pageLooks(part, p.size)
                let (a, b) = opening ? (c, p) : (p, c)
                let corners = opening ? (cardLook.corners, pageLook.corners) : (pageLook.corners, cardLook.corners)
                if part.kind == .element {
                    // Drawn once, by the end that is arriving.
                    if opening { add(part, .page, own: p, look: pageLook, from: a, to: b, corners: corners) }
                    else { add(part, .card, own: c, look: cardLook, from: a, to: b, corners: corners) }
                } else {
                    add(part, .card, own: c, look: cardLook, from: a, to: b, corners: corners)
                    add(part, .page, own: p, look: pageLook, from: a, to: b, corners: corners)
                }
                drawnCard.insert(part); drawnPage.insert(part)
            } else if let c {
                // No page end to meet (scrolled away): fade in place under the page, unless the
                // surface it sits in flies; then it rides above with it.
                let holderFlies = part.container.map { card[$0] != nil && onScreen(page[$0]) != nil } ?? false
                let look = cardLooks(part, c.size)
                add(part, .card, own: c, look: look, from: c, to: c, corners: (look.corners, look.corners), under: !holderFlies)
                drawnCard.insert(part)
            } else if let p {
                let look = pageLooks(part, p.size)
                add(part, .page, own: p, look: look, from: p, to: p, corners: (look.corners, look.corners))
                drawnPage.insert(part)
            }
        }
        self.pieces = pieces
        self.drawnCard = drawnCard
        self.drawnPage = drawnPage
    }

    func drawsPage(_ part: Part) -> Bool { drawnPage.contains(part) }
    func drawsCard(_ part: Part) -> Bool { drawnCard.contains(part) }
    /// Drawn by the flight on its own, so a look that contains it leaves it out.
    func flies(_ part: Part) -> Bool { drawnCard.contains(part) || drawnPage.contains(part) }
}

/// Draws every piece in the air, in window coordinates.
struct CardFlightLayer<Part: FlightPart>: View {
    let flight: CardFlight<Part>
    /// The copy under the page (card ends with nothing to meet), or the one above both pages.
    var under = false

    var body: some View {
        // Read here, in the body: a read first made inside ForEach's closure is not observed.
        let clock = flight.clock
        let timing = flight.timing
        let handed = FlightClock(time: clock, opening: flight.opening, pieces: flight.piecesInPlay,
                                 closeFrom: flight.closeFrom, timing: timing)
        if let current = flight.flight {
            let pieces = current.pieces.filter { $0.under == under }
            ZStack(alignment: .topLeading) {
                ForEach(pieces) { piece in
                    piece.look.view
                        .modifier(PieceMotion(clock: clock, kind: piece.part.kind, end: piece.end, opening: current.opening,
                                              from: piece.from, to: piece.to, fromScale: piece.fromScale, toScale: piece.toScale,
                                              fromCorners: piece.fromCorners, toCorners: piece.toCorners,
                                              rest: piece.rest, ownScale: piece.ownScale,
                                              ground: piece.look.ground, edge: piece.look.edge, timing: timing))
                        .zIndex(piece.z)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .ignoresSafeArea()
            .environment(\.flightRole, .look)
            .environment(\.flightClock, handed)
            .environment(\.cardFlightBox, flight)
            .onAppear { if !under { flight.flightOnScreen() } }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }
}

/// Places one end of one piece for the current clock: its frame, corners, scale and alpha.
private struct PieceMotion: ViewModifier, Animatable {
    var clock: Double
    let kind: FlightKind
    let end: FlightEnd
    let opening: Bool
    let from: CGRect, to: CGRect
    let fromScale: CGFloat, toScale: CGFloat
    let fromCorners: RectangleCornerRadii, toCorners: RectangleCornerRadii
    let rest: CGSize
    let ownScale: CGFloat
    let ground: Color?
    let edge: Color?
    let timing: FlightTiming

    nonisolated var animatableData: Double {
        get { clock }
        set { clock = newValue }
    }

    func body(content: Content) -> some View {
        let f = CGFloat(timing.flight(clock))
        let frame = CGRect(x: from.minX + (to.minX - from.minX) * f, y: from.minY + (to.minY - from.minY) * f,
                           width: from.width + (to.width - from.width) * f, height: from.height + (to.height - from.height) * f)
        let alpha = timing.alpha(kind, end, opening: opening, t: clock)
        // `kind` never changes for a piece, so this switch never swaps its content's identity.
        switch kind {
        case .surface, .panel:
            let shape = UnevenRoundedRectangle(cornerRadii: Self.mix(fromCorners, toCorners, f), style: .continuous)
            let size = CGSize(width: max(frame.width, 1), height: max(frame.height, 1))
            let k = max(fromScale + (toScale - fromScale) * f, 0.01)
            let placed = kind == .surface
                // The same picture laid out again at the live size (over k, drawn at k).
                ? CGSize(width: size.width / k, height: size.height / k)
                // Content laid out once at its own size, anchored top-leading.
                : rest
            content
                .frame(width: placed.width, height: placed.height, alignment: .topLeading)
                .scaleEffect(kind == .surface ? k : ownScale, anchor: .topLeading)
                .frame(width: size.width, height: size.height, alignment: .topLeading)
                .background { shape.fill(ground ?? .clear) }
                .clipShape(shape)
                .overlay { shape.strokeBorder(edge ?? .clear, lineWidth: 1) }
                .opacity(alpha)
                .offset(x: frame.minX, y: frame.minY)
        case .element, .text:
            // Scaled uniformly to the frame's width, leading, centred on its height.
            let s = rest.width > 0 ? frame.width / rest.width : 1
            content
                .frame(width: rest.width, height: rest.height, alignment: .topLeading)
                .scaleEffect(s, anchor: .topLeading)
                .opacity(alpha)
                .offset(x: frame.minX, y: frame.midY - rest.height * s / 2)
        case .otherText:
            // At its own size, as its end draws it: leading, centred on the frame's height.
            content
                .frame(width: rest.width, height: rest.height, alignment: .topLeading)
                .scaleEffect(ownScale, anchor: .topLeading)
                .opacity(alpha)
                .offset(x: frame.minX, y: frame.midY - rest.height * ownScale / 2)
        }
    }

    private static func mix(_ a: RectangleCornerRadii, _ b: RectangleCornerRadii, _ f: CGFloat) -> RectangleCornerRadii {
        RectangleCornerRadii(topLeading: a.topLeading + (b.topLeading - a.topLeading) * f,
                             bottomLeading: a.bottomLeading + (b.bottomLeading - a.bottomLeading) * f,
                             bottomTrailing: a.bottomTrailing + (b.bottomTrailing - a.bottomTrailing) * f,
                             topTrailing: a.topTrailing + (b.topTrailing - a.topTrailing) * f)
    }
}
