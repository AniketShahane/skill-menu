import SwiftUI

// FlightPieces: the modifiers the card and the page put on their views, and the environment.
//
// What: .flightPiece(part, id:, end:) tags one end of a piece; .flightAfterPieces(index:) is
// something only the page has, arriving after the pieces; .flightPaper(color) is the page's
// background; .flightBarAway(flight) sends the bottom bar away and back; .cardFlight(flight) puts
// the state in the environment. Environment: \.flightScope (the list page a card sits on),
// \.flightRole (live or look), \.flightPageInLayer, \.flightClock.
//
// Wire in:
//   Card:  CardHero(item).flightPiece(CardPart.hero, id: item.id, end: .card)
//   Page:  PageHero(item).flightPiece(CardPart.hero, id: item.id, end: .page)
//          NotesSection(item).flightAfterPieces(index: 1);  BackButton().flightAfterPieces(index: 0, pops: true)
//          The page's root: .flightPaper(Palette.paper), and no opaque background of its own.
//   Each kept tab page: .environment(\.flightScope, AnyHashable(tab)). No scope: no flight from there.
//
// Lessons it encodes (motion-craft.md §6-§7, shared-element-flights.md "Hiding"):
// - Hidden is opacity 0.001, never 0, from the build frame. Core Animation does not draw a layer at
//   0, so a page revealed from 0 is rasterised on its landing frame (a 40-50 ms stall). Switching
//   from 0 to 0.001 later was measured not to help.
// - A card piece reads flyingId first and returns, so a flight starting or landing re-runs the
//   flying card's pieces, not every card's.
// - Measure only while a flight is being prepared (a background inside an `if`, so the piece's own
//   identity never changes), never on every scroll frame. Report the global frame and the own size
//   apart: a press or back-swipe scale must not reach the size.
// - Inside a look, pieces that fly on their own are left out but keep their room.
// - The clock arrives through the environment into Animatable modifiers: no body re-runs per frame.

/// A real card or page (`.live`), or a copy drawn in the flight layer (`.look`).
enum FlightRole: Sendable { case live, look }

/// The clock as the page layer and the flight layer hand it down.
struct FlightClock: Equatable, Sendable {
    var time: Double = 0
    var opening = true
    /// The page arrived in pieces; false leaves everything at rest.
    var pieces = false
    /// How far the open had got when this close began.
    var closeFrom: Double = FlightTiming().openTail
    var timing = FlightTiming()
}

extension EnvironmentValues {
    /// The CardFlight in play (set with `.cardFlight(_:)`); nil outside it.
    @Entry var cardFlightBox: (any CardFlightBox)? = nil
    /// The list page this card sits on. nil: cards here open their page without a flight.
    @Entry var flightScope: AnyHashable? = nil
    @Entry var flightRole: FlightRole = .live
    /// True only for the page the page layer shows (not a warm-up copy, not a look).
    @Entry var flightPageInLayer: Bool = false
    @Entry var flightClock: FlightClock = FlightClock()
}

extension View {
    /// Puts `flight` where the pieces, looks and pages under it can find it.
    func cardFlight<Part: FlightPart>(_ flight: CardFlight<Part>) -> some View {
        environment(\.cardFlightBox, flight)
    }

    /// One end of a piece of item `id`. Hidden (and keeping its room) while the flight draws it.
    func flightPiece<Part: FlightPart>(_ part: Part, id: some Hashable, end: FlightEnd) -> some View {
        modifier(FlightPieceModifier(part: part, id: AnyHashable(id), end: end))
    }

    /// Something only the page has: it arrives after the pieces (pieces / 2 + index * stagger,
    /// rising 16 pt; `pops` scales from 0.6 instead) and leaves at once on a close.
    func flightAfterPieces(index: Int, pops: Bool = false) -> some View {
        modifier(AfterPiecesModifier(index: index, pops: pops))
    }

    /// The page's background: fades in under the pieces on the way in and out on the way back.
    func flightPaper(_ color: Color) -> some View {
        modifier(PaperModifier(color: color))
    }

    /// The bottom bar leaves with the flight's first moving frame and returns half way home.
    /// `alsoAway`: other reasons it is away (a pushed page).
    func flightBarAway<Part: FlightPart>(_ flight: CardFlight<Part>, alsoAway: Bool = false) -> some View {
        modifier(BarAway(away: flight.barAway || alsoAway,
                         returnDelay: flight.piecesInPlay ? flight.timing.barReturnDelay : 0,
                         reduced: flight.reducedMotion()))
    }
}

private struct FlightPieceModifier<Part: FlightPart>: ViewModifier {
    let part: Part
    let id: AnyHashable
    let end: FlightEnd
    @Environment(\.cardFlightBox) private var box
    @Environment(\.flightRole) private var role
    @Environment(\.flightScope) private var scope
    @Environment(\.flightPageInLayer) private var inLayer

    func body(content: Content) -> some View {
        let flight = box as? CardFlight<Part>
        let state = pieceState(flight)
        content
            .opacity(state.hidden ? 0.001 : 1)
            .background {
                if state.measures, let flight {
                    Color.clear.onGeometryChange(for: FlightGeometry.self) {
                        FlightGeometry(frame: $0.frame(in: .global), size: $0.size)
                    } action: { geometry in
                        flight.report(part, end: end, id: id, geometry: geometry)
                    }
                }
            }
    }

    private func pieceState(_ flight: CardFlight<Part>?) -> (hidden: Bool, measures: Bool) {
        guard let flight else { return (false, false) }
        switch (role, end) {
        case (.look, _):
            // Inside a look: leave out what the flight draws on its own.
            return (flight.flight?.flies(part) ?? false, false)
        case (.live, .card):
            // flyingId first: every other card depends on that alone.
            guard flight.flyingId == id, scope != nil, scope == flight.scope else { return (false, false) }
            return (flight.hidesCard(part), flight.measuring)
        case (.live, .page):
            guard inLayer else { return (false, false) }
            return (flight.hidesPage(part), flight.measuring)
        }
    }
}

private struct AfterPiecesModifier: ViewModifier {
    let index: Int
    let pops: Bool
    @Environment(\.flightClock) private var clock
    @Environment(\.flightRole) private var role
    @Environment(\.flightPageInLayer) private var inLayer

    func body(content: Content) -> some View {
        let on = (inLayer || role == .look) && clock.pieces
        content.modifier(AfterPiecesEffect(time: on ? clock.time : 0, on: on, opening: clock.opening, pops: pops,
                                           delay: clock.timing.arrivalDelay(index: index, pops: pops),
                                           closeFrom: clock.closeFrom, timing: clock.timing))
    }
}

private struct AfterPiecesEffect: ViewModifier, Animatable {
    var time: Double
    let on: Bool
    let opening: Bool
    let pops: Bool
    let delay: Double
    let closeFrom: Double
    let timing: FlightTiming

    nonisolated var animatableData: Double {
        get { time }
        set { time = newValue }
    }

    func body(content: Content) -> some View {
        let v = on ? timing.afterPiece(time, opening: opening, delay: delay, closeFrom: closeFrom) : 1
        content
            // Never quite 0: drawn while it waits, not all at once on the frame it starts to show.
            .opacity(max(v, 0.001))
            .scaleEffect(pops ? 0.6 + 0.4 * v : 1)
            .offset(y: pops ? 0 : (1 - v) * 16)
    }
}

private struct PaperModifier: ViewModifier {
    let color: Color
    @Environment(\.flightClock) private var clock
    @Environment(\.flightPageInLayer) private var inLayer

    func body(content: Content) -> some View {
        let on = inLayer && clock.pieces
        content.background {
            Paper(color: color, time: on ? clock.time : 0, on: on, opening: clock.opening, timing: clock.timing)
                .ignoresSafeArea()
        }
    }
}

/// Per frame, only this one-colour body runs.
private struct Paper: View, Animatable {
    let color: Color
    var time: Double
    let on: Bool
    let opening: Bool
    let timing: FlightTiming

    nonisolated var animatableData: Double {
        get { time }
        set { time = newValue }
    }

    var body: some View {
        color.opacity(on ? timing.paper(time, opening: opening) : 1)
    }
}

/// The bar sliding down and fading as it leaves, and back (Android: 240 ms out, 320 ms in).
private struct BarAway: ViewModifier {
    let away: Bool
    let returnDelay: Double
    let reduced: Bool

    func body(content: Content) -> some View {
        content
            .offset(y: away ? 140 : 0)
            .animation(reduced ? nil : away ? .timingCurve(0.05, 0.7, 0.1, 1, duration: 0.24)
                       : .timingCurve(0.05, 0.7, 0.1, 1, duration: 0.32).delay(returnDelay), value: away)
            .opacity(away ? 0 : 1)
            .animation(reduced ? nil : away ? .timingCurve(0.4, 0, 0.2, 1, duration: 0.16)
                       : .timingCurve(0.4, 0, 0.2, 1, duration: 0.2).delay(returnDelay), value: away)
    }
}
