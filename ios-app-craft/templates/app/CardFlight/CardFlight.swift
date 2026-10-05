import SwiftUI
import UIKit

// CardFlight: the state of the "card flies apart into its page" transition, and its state machine.
//
// What: CardFlight<Part> owns which item's page is up, the phase (closed, mounting, opening, open,
// closing), the one linear clock, the flight in the air (Flight, in FlightLayer.swift), both ends'
// measured frames and looks, and everything a NavigationStack push used to do for free: when the
// list is covered, when the bar leaves and returns, back refusal, and the edge swipe's progress.
//
// Wire in (one per app, usually on your navigator):
//   let cards = CardFlight<CardPart>()          // cards.reducedMotion = { AppMotion.reduced }
//   Card button:  cards.open(item.id, from: scope, cardLooks: looks)   // scope: \.flightScope
//   Back button:  cards.back()                  // flies home, or sinks if there is no card
//   Page body:    let _ = cards.registerPageLooks { part, size in ... }  (only while inLayer)
//   RootView: see CardFlightPage.swift for the layer order. README.md walks through all of it.
//
// Lessons it encodes (references/shared-element-flights.md, motion-craft.md §3, §6, §9):
// - Mount, then move. The tap mounts the page unseen (its pieces at 0.001, paper at 0) and measures
//   both ends. The flight goes on screen at t = 0, the same picture as the card, and its clock starts
//   only after the flight layer's onAppear (with a 34 ms backstop), never in the update that inserts
//   it: a view inserted in the same update as an animated change skips the animation.
// - A generation counter guards every async step, so a late completion never closes the next open.
// - Close measures the card again where it is now and flies from the page as it is now (scrolled,
//   or shrunk by a back swipe).
// - Tear down after landing: the page stays mounted, invisible and frozen, ~0.3 s after a close
//   ("retiring"), so its teardown frame lands after the bar, not under it.
// - Accessibility changes cost frames under VoiceOver and XCUITest: the list is hidden on the tap
//   and uncovered ~0.15 s after a close settles, when nothing moves.

/// Lets a generic CardFlight travel through the environment (see `.cardFlight(_:)`).
protocol CardFlightBox: AnyObject, Sendable {}

/// How one end of a piece is drawn in flight, made from the same view code as the real end.
struct FlightLook {
    /// A surface: fills any size it is given. Anything else: laid out at the end's own size.
    var view: AnyView
    /// A surface's or panel's ground, filling the moving frame under the content.
    var ground: Color?
    /// A 1 pt edge on the moving frame.
    var edge: Color?
    /// This end's corner radii; a surface or panel morphs between its two ends' corners.
    var corners: RectangleCornerRadii

    init<V: View>(_ view: V, ground: Color? = nil, edge: Color? = nil, corners: RectangleCornerRadii = .init()) {
        self.view = AnyView(view)
        self.ground = ground
        self.edge = edge
        self.corners = corners
    }
}

/// Makes one end's look of `part`; `size` is that end's own laid-out size (unscaled).
typealias FlightLookFactory<Part> = @MainActor (_ part: Part, _ size: CGSize) -> FlightLook

/// One end of a piece as measured: where it is on screen (after any press or back-swipe scale above
/// it) and its own laid-out size (which no scale touches).
struct FlightGeometry: Equatable, Sendable {
    var frame: CGRect
    var size: CGSize
    /// How much this end is drawn scaled on screen; 1 at rest.
    var scale: CGFloat { size.width > 0 ? frame.width / size.width : 1 }
}

@MainActor
@Observable
final class CardFlight<Part: FlightPart>: CardFlightBox {
    enum Phase: Equatable, Sendable {
        case closed
        /// The page is built unseen and both ends are measured. Nothing moves yet.
        case mounting
        case opening, open, closing
    }

    /// The item whose page is up (mounting to closing); nil when closed.
    private(set) var itemId: AnyHashable?
    /// A page that has just flown home: invisible, untouchable, frozen, taken down ~0.3 s later.
    private(set) var retiringId: AnyHashable?
    private(set) var phase: Phase = .closed
    /// The item whose card is flying. Card pieces read this first and stop there if it is not
    /// theirs, so only the flying card depends on the flight.
    private(set) var flyingId: AnyHashable?
    /// The list page (\.flightScope) the card was opened from: a card on another kept page never pairs.
    private(set) var scope: AnyHashable?
    /// The page arrived in pieces and will leave in pieces. False: it rose in or simply appeared.
    private(set) var piecesInPlay = false
    private(set) var opening = true
    /// Seconds since the open or close began. Animated linearly; every piece is a function of it.
    private(set) var clock: Double = 0
    private(set) var flight: Flight<Part>?
    /// Both ends are being measured for a flight about to start. Touches wait.
    private(set) var measuring = false
    /// 0: the page in place; 1: a screen below (it rises in when there is no card to fly from).
    private(set) var pageRise: CGFloat = 0
    /// The edge swipe's progress, 0...1.
    private(set) var backProgress: CGFloat = 0
    /// The list under the page is out of VoiceOver's (and XCUITest's) reach.
    private(set) var coversList = false
    /// The bottom bar is away. It leaves with the first moving frame and returns half way home.
    private(set) var barAway = false
    /// Something on the page (a dialog) handles back itself: no fold, no edge swipe.
    var backBlocked = false
    /// How far the open had got when this close began (after-pieces leave from there).
    private(set) var closeFrom: Double = FlightTiming().openTail

    @ObservationIgnored var timing = FlightTiming()
    /// Your one reduced-motion switch (e.g. `{ AppMotion.reduced }`). Reduced: pages cut in and out.
    @ObservationIgnored var reducedMotion: @MainActor () -> Bool = { UIAccessibility.isReduceMotionEnabled }
    @ObservationIgnored private var cardFrames: [Part: FlightGeometry] = [:]
    @ObservationIgnored private var pageFrames: [Part: FlightGeometry] = [:]
    @ObservationIgnored private var cardLooks: FlightLookFactory<Part>?
    @ObservationIgnored private var pageLooks: FlightLookFactory<Part>?
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var startScheduled = false
    @ObservationIgnored private var pendingStart: (() -> Void)?
    @ObservationIgnored private var openedAt: CFTimeInterval = 0

    init() {}

    var isPresented: Bool { itemId != nil }
    /// Touches reach the page once it has landed, and not while a close is being measured.
    var interactive: Bool { phase == .open && !measuring }
    var swipeBackEnabled: Bool { interactive && !backBlocked }

    // MARK: Opening

    /// Opens `id`'s page. With a scope and the card's looks, its pieces fly; without, the page
    /// rises in; with `instant` (deep links, reduced motion) it is simply there.
    func open(_ id: AnyHashable, from scope: AnyHashable? = nil, cardLooks: FlightLookFactory<Part>? = nil,
              instant: Bool = false) {
        guard phase == .closed else { return }
        generation += 1
        let mine = generation
        retiringId = nil
        itemId = id
        backProgress = 0
        closeFrom = timing.openTail
        // Out of VoiceOver's reach now, on the tap's frame, while nothing moves yet.
        coversList = true
        if instant || reducedMotion() {
            pageRise = 0; piecesInPlay = false; barAway = true; phase = .open
            return
        }
        guard let scope, let cardLooks else { riseIn(mine); return }
        // Frame A: the page is built unseen and both ends measure. The flight starts after.
        flyingId = id
        self.scope = scope
        self.cardLooks = cardLooks
        cardFrames = [:]; pageFrames = [:]
        piecesInPlay = true; opening = true; clock = 0; pageRise = 0
        measuring = true
        startScheduled = false
        phase = .mounting
        // If a piece never reports (a card gone from its list), fly with what there is.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
            guard let self, self.generation == mine, self.phase == .mounting else { return }
            self.startFlight()
        }
    }

    /// The page hands over how its pieces are drawn. Call from its body, so looks match current data.
    func registerPageLooks(_ looks: @escaping FlightLookFactory<Part>) { pageLooks = looks }

    /// Each measured end reports here. Once every surface and panel the card reported has its page
    /// end too, the flight starts on the next turn, when that whole layout pass has reported.
    func report(_ part: Part, end: FlightEnd, id: AnyHashable, geometry: FlightGeometry) {
        switch end {
        case .card:
            guard id == flyingId, measuring else { return }
            cardFrames[part] = geometry
        case .page:
            guard id == itemId, measuring else { return }
            pageFrames[part] = geometry
        }
        guard !startScheduled, phase == .mounting || phase == .open else { return }
        let anchors = cardFrames.keys.filter { $0.kind == .surface || $0.kind == .panel }
        guard !anchors.isEmpty, anchors.allSatisfy({ pageFrames[$0] != nil }) else { return }
        startScheduled = true
        let mine = generation
        DispatchQueue.main.async { [weak self] in
            guard let self, self.generation == mine else { return }
            if self.phase == .mounting { self.startFlight() } else if self.phase == .open { self.startClose() }
        }
    }

    private func startFlight() {
        guard phase == .mounting, let id = flyingId else { return }
        measuring = false
        guard let cardLooks, let pageLooks else { riseIn(generation); return }
        let mine = generation
        flight = Flight(id: id, opening: true, card: cardFrames, page: pageFrames,
                        cardLooks: cardLooks, pageLooks: pageLooks, screen: Self.screen)
        phase = .opening
        whenFlightDrawn { [weak self] in
            guard let self, self.generation == mine else { return }
            self.openedAt = CACurrentMediaTime()
            self.barAway = true
            withAnimation(.linear(duration: self.timing.openTail)) { self.clock = self.timing.openTail }
            // Every frame is home by `pieces`: the looks and the page's own pieces are the same
            // picture, and the page takes over. After-pieces run on from the same clock.
            DispatchQueue.main.asyncAfter(deadline: .now() + self.timing.landing) { [weak self] in
                guard let self, self.generation == mine else { return }
                self.flight = nil
                self.phase = .open
            }
        }
    }

    /// No card to fly from: the page rises from the bottom, mounted first and moved on the next turn.
    private func riseIn(_ mine: Int) {
        flyingId = nil; scope = nil; flight = nil
        piecesInPlay = false; measuring = false; barAway = true
        phase = .opening
        pageRise = 1
        DispatchQueue.main.async { [weak self] in
            guard let self, self.generation == mine else { return }
            withAnimation(Self.travel) { self.pageRise = 0 } completion: { [weak self] in
                guard let self, self.generation == mine else { return }
                self.phase = .open
            }
        }
    }

    /// Runs `start` once the flight layer has drawn the flight just set, or after two frames.
    private func whenFlightDrawn(_ start: @escaping () -> Void) {
        pendingStart = start
        let mine = generation
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.034) { [weak self] in
            guard let self, self.generation == mine else { return }
            self.runPendingStart()
        }
    }

    /// The flight layer's onAppear: the flight is on screen. Its clock starts on the next turn.
    func flightOnScreen() {
        guard pendingStart != nil else { return }
        DispatchQueue.main.async { [weak self] in self?.runPendingStart() }
    }

    private func runPendingStart() {
        guard let start = pendingStart else { return }
        pendingStart = nil
        start()
    }

    // MARK: Closing

    /// Back from the page: its pieces fly home to the card, or it sinks if it did not come from one.
    func back() {
        guard phase == .open, !measuring, !backBlocked else { return }
        guard piecesInPlay, flyingId != nil else { close(); return }
        // Measure the card again where it is now (the list may have moved), then fly.
        generation += 1
        cardFrames = [:]; pageFrames = [:]
        startScheduled = false
        measuring = true
        let mine = generation
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
            guard let self, self.generation == mine, self.phase == .open, self.measuring else { return }
            self.startClose()
        }
    }

    private func startClose() {
        guard phase == .open, let id = flyingId, let cardLooks, let pageLooks else { close(); return }
        measuring = false
        generation += 1
        let mine = generation
        closeFrom = min(CACurrentMediaTime() - openedAt, timing.openTail)
        // At t = 0 with nothing animating (the open's clock may still be running its tail); the
        // clock runs from the next turn, as for an open.
        var still = Transaction()
        still.disablesAnimations = true
        withTransaction(still) {
            opening = false
            clock = 0
            flight = Flight(id: id, opening: false, card: cardFrames, page: pageFrames,
                            cardLooks: cardLooks, pageLooks: pageLooks, screen: Self.screen)
            phase = .closing
        }
        whenFlightDrawn { [weak self] in
            guard let self, self.generation == mine else { return }
            self.barAway = false
            if self.backProgress > 0 { withAnimation(Self.relax) { self.backProgress = 0 } }
            withAnimation(.linear(duration: self.timing.pieces)) { self.clock = self.timing.pieces } completion: { [weak self] in
                guard let self, self.generation == mine else { return }
                self.finishClose()
            }
        }
    }

    /// Closes without flying: the page sinks away (its item was deleted, or there is no card to go
    /// back to), or with `instant`, is gone at once.
    func close(instant: Bool = false) {
        guard isPresented else { return }
        generation += 1
        let mine = generation
        measuring = false
        if instant || reducedMotion() { finishClose(); return }
        var still = Transaction()
        still.disablesAnimations = true
        withTransaction(still) {
            flight = nil; piecesInPlay = false
            phase = .closing
            coversList = false; barAway = false
        }
        DispatchQueue.main.async { [weak self] in
            guard let self, self.generation == mine else { return }
            withAnimation(Self.travel) { self.pageRise = 1; self.backProgress = 0 } completion: { [weak self] in
                guard let self, self.generation == mine else { return }
                self.finishClose()
            }
        }
    }

    private func finishClose() {
        pendingStart = nil
        let reduced = reducedMotion()
        let settleLater = piecesInPlay && coversList && !reduced
        let mine = generation
        if piecesInPlay, let itemId, !reduced {
            retiringId = itemId
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
                guard let self, self.generation == mine, self.phase == .closed else { return }
                var still = Transaction()
                still.disablesAnimations = true
                withTransaction(still) { self.retiringId = nil }
            }
        }
        itemId = nil; flight = nil; flyingId = nil; scope = nil
        piecesInPlay = false; measuring = false
        cardLooks = nil; pageLooks = nil
        if settleLater {
            // The list comes back to VoiceOver once the fold has settled, not on its last frame.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
                guard let self, self.generation == mine, self.phase == .closed else { return }
                self.coversList = false
            }
        } else {
            coversList = false
        }
        barAway = false; backBlocked = false
        closeFrom = timing.openTail
        opening = true; clock = 0
        pageRise = 0; backProgress = 0
        phase = .closed
    }

    // MARK: Edge swipe (predictive back)

    func backDragChanged(_ progress: CGFloat) {
        guard swipeBackEnabled else { return }
        let p = min(max(progress, 0), 1)
        if reducedMotion() { backProgress = p; return }
        // A very short spring: it follows the finger, but a jumpy touch never jumps the page.
        withAnimation(.interactiveSpring(response: 0.12, dampingFraction: 0.9)) { backProgress = p }
    }

    func backDragEnded(commit: Bool) {
        guard swipeBackEnabled else { return }
        if commit { back(); return }
        withAnimation(reducedMotion() ? nil : .spring(response: 0.276, dampingFraction: 0.82)) { backProgress = 0 }
    }

    // MARK: What the pieces ask

    /// A page piece is hidden while the page is measured for a flight, and while the flight draws it.
    func hidesPage(_ part: Part) -> Bool {
        if phase == .mounting && piecesInPlay { return true }
        return flight?.drawsPage(part) ?? false
    }

    func hidesCard(_ part: Part) -> Bool { flight?.drawsCard(part) ?? false }

    private static var travel: Animation { .timingCurve(0.2, 0, 0, 1, duration: 0.34) }
    private static var relax: Animation { .timingCurve(0.05, 0.7, 0.1, 1, duration: 0.28) }

    /// The screen, for the "both ends on screen" rule. UIScreen.main is deprecated in iOS 26.
    private static var screen: CGRect {
        let scene = UIApplication.shared.connectedScenes.first { $0 is UIWindowScene } as? UIWindowScene
        return scene?.screen.bounds ?? CGRect(x: 0, y: 0, width: 10_000, height: 10_000)
    }
}
