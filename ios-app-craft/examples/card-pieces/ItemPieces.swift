import SwiftUI

// ItemPieces: what a piece of an item is, the timing table that drives it, and the modifiers the
// card and the page put on their own views.
//
// Example written for this skill; read it, don't paste it.
//
// Builds on templates/app/CardFlight/FlightTiming.swift and FlightPieces.swift: same shape (a
// part protocol with a kind, a pure timing table keyed by one clock, modifiers that tag each end
// and hide it while the layer draws it) with two card forms in mind — ItemCard and ItemRow — so a
// piece's `holder` can point at either one's surface, and a corner is one radius, not four.
//
// Lessons it encodes (references/shared-element-flights.md "Pieces", "Looks"; motion-craft.md §6):
// - A piece's kind decides how it travels, not which view it is. ItemRow and ItemCard titles both
//   report `.text`; the layer scales each to the live frame the same way.
// - Hidden is 0.001, never 0, from the first frame a piece is tagged, or a page revealed from 0 is
//   rasterised on its landing frame instead of warmed up ahead of it.
// - `.itemPiece` reads `flyingId` before anything else, so only the one travelling item depends on
//   the layer; every other card's body never re-evaluates.

/// How one piece of an item travels between its card and its page.
enum ItemPieceKind: Sendable {
    /// A picture that fills any box it is given (the thumbnail/map hero), re-laid-out at size.
    case surface
    /// A container laid out once, at its own size, while its ground and edge follow the frame.
    case panel
    /// Drawn once, by the arriving end, then moved and scaled into place (a badge, a chevron).
    case element
    /// The same words at both ends, scaled uniformly to the live frame's width and crossfaded.
    case text
    /// Different words at each end ("3 today" vs. "3 items logged today"), crossfading with a gap.
    case otherText
}

enum ItemPieceEnd: Hashable, Sendable { case card, page }

/// One piece of an item. Declare your parts once, from the design:
///     enum ItemPart: ItemPiece { case hero, countChip, title, subtitle
///         var kind: ItemPieceKind { switch self { case .hero: .surface; case .countChip: .element
///             case .subtitle: .otherText; case .title: .text } }
///         var holder: ItemPart? { self == .title ? .hero : nil } }
protocol ItemPiece: Hashable, Sendable {
    var kind: ItemPieceKind { get }
    /// The surface/panel this sits on in its card; drawn under the page if unmatched, unless the
    /// holder is flying too, in which case it rides above with it.
    var holder: Self? { get }
}

extension ItemPiece {
    var holder: Self? { nil }
}

/// Every duration and curve of the flight, as pure functions of one linear clock `t`. Defaults are
/// a starting point, not a spec — replace them with your own design's numbers and unit-test the
/// table without a view (it needs only Foundation).
struct ItemPieceTiming: Sendable, Equatable {
    /// Every frame and corner travels this long.
    var travel = 0.46
    var fadeIn = 0.2
    var fadeOut = 0.14
    /// otherText: old words leave over `wordsLeave`; new arrive over `wordsArrive` after
    /// `wordsArriveDelay`.
    var wordsLeave = 0.08
    var wordsArriveDelay = 0.05
    var wordsArrive = 0.14
    /// Page-only content arrives at travel / 2 + index * stagger, rising 14 pt; a button pops
    /// from 0.6 scale, `buttonStagger` apart.
    var stagger = 0.05
    var buttonStagger = 0.04
    var lastAfterIndex = 4

    /// When the open's clock stops: the last after-piece has landed.
    var openTail: Double { travel / 2 + Double(lastAfterIndex) * stagger + fadeIn }
    /// Every frame is home by here; the page's own pieces take over from the layer.
    var landing: Double { travel + 0.01 }

    /// Front-loaded: most of the travel happens in the first third of the clock, so the opening
    /// frame already reads as "the right shape" — the one frame a dropped frame will show.
    private func easeOut(_ x: Double) -> Double {
        let p = min(max(x, 0), 1)
        return 1 - pow(1 - p, 3)
    }

    func travelled(_ t: Double) -> Double { easeOut(t / travel) }
    func faded(_ t: Double, over duration: Double, delay: Double = 0) -> Double { easeOut((t - delay) / duration) }
    func linear(_ t: Double, over duration: Double, delay: Double = 0) -> Double { min(max((t - delay) / duration, 0), 1) }

    /// One end of one piece. "Arriving" is the page end on an open and the card end on a close.
    func alpha(_ kind: ItemPieceKind, _ end: ItemPieceEnd, opening: Bool, t: Double) -> Double {
        let arriving = (end == .page) == opening
        switch kind {
        case .element:
            return arriving ? 1 : 0
        case .surface, .panel:
            // The card's surface stays solid until the page's is, never two half-faded at once.
            if end == .card { return arriving ? 1 : (t < fadeIn ? 1 : 0) }
            return arriving ? faded(t, over: fadeIn) : 1 - faded(t, over: fadeOut)
        case .otherText:
            return arriving ? faded(t, over: wordsArrive, delay: wordsArriveDelay) : 1 - linear(t, over: wordsLeave)
        case .text:
            return arriving ? faded(t, over: fadeIn) : 1 - faded(t, over: fadeOut)
        }
    }

    /// Page-only content: arrives after the pieces on an open; leaves at once on a close, from
    /// wherever it had got to, never snapping back to full first.
    func afterPiece(_ t: Double, opening: Bool, delay: Double, closeFrom: Double) -> Double {
        if opening { return faded(t, over: fadeIn, delay: delay) }
        return min(faded(closeFrom, over: fadeIn, delay: delay), 1 - faded(t, over: fadeOut))
    }

    func arrivalDelay(index: Int, pops: Bool) -> Double {
        travel / 2 + Double(index) * (pops ? buttonStagger : stagger)
    }
}

/// How one end of a piece is drawn in flight, built from the same view code as the real end.
/// A single `corner` radius, not four: this example needs no uneven shape.
struct ItemLook {
    var view: AnyView
    var ground: Color?
    var edge: Color?
    var corner: CGFloat

    init<V: View>(_ view: V, ground: Color? = nil, edge: Color? = nil, corner: CGFloat = 0) {
        self.view = AnyView(view)
        self.ground = ground
        self.edge = edge
        self.corner = corner
    }
}

typealias ItemLookFactory<Piece> = @MainActor (_ piece: Piece, _ size: CGSize) -> ItemLook

/// One end of a piece as measured: its global frame and own laid-out size (its scale on screen,
/// below, is 1 at rest; only a press or a back-swipe shrink changes it).
struct ItemGeometry: Equatable, Sendable {
    var frame: CGRect
    var size: CGSize
    var scale: CGFloat { size.width > 0 ? frame.width / size.width : 1 }
}

/// Lets a generic ItemLayerModel travel through the environment.
protocol ItemLayerBox: AnyObject, Sendable {}

/// Live view, or a look drawn in the flight layer.
enum ItemPieceRole: Sendable { case live, look }

/// Handed down into `Animatable` modifiers, so per-frame work never re-runs a view's body.
struct ItemPieceClock: Equatable, Sendable {
    var time: Double = 0
    var opening = true
    var pieces = false // The page arrived in pieces; false leaves everything at rest.
    /// Which item's piece is in the air, if any — read before a piece's own identity.
    var flying: AnyHashable?
    var closeFrom: Double = ItemPieceTiming().openTail // where a close's after-pieces leave from
    var timing = ItemPieceTiming()
}

extension EnvironmentValues {
    @Entry var itemLayerBox: (any ItemLayerBox)? = nil
    /// The list page a card sits on; nil cards open their page with no flight.
    @Entry var itemPieceScope: AnyHashable? = nil
    @Entry var itemPieceRole: ItemPieceRole = .live
    /// True only for the page the detail host is actually showing, never a warm-up copy.
    @Entry var itemPageInLayer: Bool = false
    @Entry var itemPieceClock = ItemPieceClock()
}

extension View {
    func itemLayer<Piece: ItemPiece>(_ layer: ItemLayerModel<Piece>) -> some View {
        environment(\.itemLayerBox, layer)
    }

    /// One end of one piece of item `id`. Hidden at 0.001 (never 0) while the layer draws it.
    func itemPiece<Piece: ItemPiece>(_ piece: Piece, id: some Hashable, end: ItemPieceEnd) -> some View {
        modifier(ItemPieceModifier(piece: piece, id: AnyHashable(id), end: end))
    }

    /// Page-only content: arrives after the pieces (staggered, rising 14 pt; `pops` scales from
    /// 0.6 instead) and leaves at once on a close, from wherever it had reached.
    func itemAfterPieces(index: Int, pops: Bool = false) -> some View {
        modifier(ItemAfterPiecesModifier(index: index, pops: pops))
    }

    /// The page's own background, fading in under the pieces and out going back.
    func itemPaper(_ color: Color) -> some View {
        modifier(ItemPaperModifier(color: color))
    }
}

private struct ItemPieceModifier<Piece: ItemPiece>: ViewModifier {
    let piece: Piece
    let id: AnyHashable
    let end: ItemPieceEnd
    @Environment(\.itemLayerBox) private var box
    @Environment(\.itemPieceRole) private var role
    @Environment(\.itemPieceScope) private var scope
    @Environment(\.itemPageInLayer) private var inLayer

    func body(content: Content) -> some View {
        let layer = box as? ItemLayerModel<Piece>
        let state = pieceState(layer)
        content
            .opacity(state.hidden ? 0.001 : 1)
            .background {
                if state.measures, let layer {
                    Color.clear.onGeometryChange(for: ItemGeometry.self) {
                        ItemGeometry(frame: $0.frame(in: .global), size: $0.size)
                    } action: { geometry in
                        layer.noteGeometry(piece, end: end, id: id, geometry: geometry)
                    }
                }
            }
    }

    private func pieceState(_ layer: ItemLayerModel<Piece>?) -> (hidden: Bool, measures: Bool) {
        guard let layer else { return (false, false) }
        switch (role, end) {
        case (.look, _):
            return (layer.flight?.flies(piece) ?? false, false)
        case (.live, .card):
            guard layer.flyingId == id, scope != nil, scope == layer.scope else { return (false, false) }
            return (layer.hidesCard(piece), layer.measuring)
        case (.live, .page):
            guard inLayer else { return (false, false) }
            return (layer.hidesPage(piece), layer.measuring)
        }
    }
}

private struct ItemAfterPiecesModifier: ViewModifier {
    let index: Int
    let pops: Bool
    @Environment(\.itemPieceClock) private var clock
    @Environment(\.itemPieceRole) private var role
    @Environment(\.itemPageInLayer) private var inLayer

    func body(content: Content) -> some View {
        let on = (inLayer || role == .look) && clock.pieces
        content.modifier(ItemAfterPiecesEffect(time: on ? clock.time : 0, on: on, opening: clock.opening,
                                               pops: pops, delay: clock.timing.arrivalDelay(index: index, pops: pops),
                                               closeFrom: clock.closeFrom, timing: clock.timing))
    }
}

private struct ItemAfterPiecesEffect: ViewModifier, Animatable {
    var time: Double
    let on: Bool
    let opening: Bool
    let pops: Bool
    let delay: Double
    let closeFrom: Double
    let timing: ItemPieceTiming

    nonisolated var animatableData: Double {
        get { time }
        set { time = newValue }
    }

    func body(content: Content) -> some View {
        let v = on ? timing.afterPiece(time, opening: opening, delay: delay, closeFrom: closeFrom) : 1
        content
            .opacity(max(v, 0.001))
            .scaleEffect(pops ? 0.6 + 0.4 * v : 1)
            .offset(y: pops ? 0 : (1 - v) * 14)
    }
}

private struct ItemPaperModifier: ViewModifier {
    let color: Color
    @Environment(\.itemPieceClock) private var clock
    @Environment(\.itemPageInLayer) private var inLayer

    func body(content: Content) -> some View {
        let on = inLayer && clock.pieces
        content.background {
            ItemPaper(color: color, time: on ? clock.time : 0, on: on, opening: clock.opening, timing: clock.timing)
                .ignoresSafeArea()
        }
    }
}

private struct ItemPaper: View, Animatable {
    let color: Color
    var time: Double
    let on: Bool
    let opening: Bool
    let timing: ItemPieceTiming

    nonisolated var animatableData: Double {
        get { time }
        set { time = newValue }
    }

    var body: some View {
        let fade = on ? (opening ? timing.faded(time, over: timing.fadeIn) : 1 - timing.faded(time, over: timing.fadeIn)) : 1
        color.opacity(fade)
    }
}
