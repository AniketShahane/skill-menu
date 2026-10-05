import SwiftUI
import UIKit

// ItemLayer: the state machine for "a card flies apart into its page" (ItemLayerModel) and what
// is airborne at any moment (ItemFlight, pairing each piece's card and page ends). The view that
// draws the pieces (ItemFlightLayer) is in ItemDetailHost.swift, next to the page it flies into.
//
// Example written for this skill; read it, don't paste it.
//
// Builds on templates/app/CardFlight/CardFlight.swift and FlightLayer.swift: the same phases
// (mount, measure, fly, land, back, close, retire) folded into one file and one phase enum,
// `ItemLayerState`, since two card forms (ItemCard, ItemRow) open this same layer, and a map
// hero (ThumbnailMap.swift) draws its looks from cached renders rather than measuring live. It
// schedules with `Task`/`await Task.sleep` and a revision token, not CardFlight's
// `DispatchQueue.asyncAfter` chain — the other idiomatic way to write the same guard.
//
// Lessons (shared-element-flights.md "Architecture", "Measuring each end"; motion-craft.md §3,
// §4 "Tear down after landing"): mount, then move — the clock starts only once the flight layer
// has actually drawn the flight; a revision token guards every awaited step, so a late
// completion never closes the open that followed it; `.retiring` keeps a just-closed page
// mounted, invisible and frozen for a beat, so its teardown lands after the bottom bar returns.

/// The phases a layer passes through for one item. `.retiring` is reached only after `.closing`
/// finishes, and only when the flight actually ran — not a plain close with no card to return to.
enum ItemLayerState: Equatable, Sendable {
    case closed, mounting, opening, open, closing, retiring
}

/// One piece, paired across its card and page ends for the flight currently in the air.
struct ItemFlight<Piece: ItemPiece> {
    struct Leg: Identifiable {
        struct Key: Hashable { let piece: Piece; let end: ItemPieceEnd }
        let piece: Piece
        let end: ItemPieceEnd
        let from: CGRect, to: CGRect
        let fromScale: CGFloat, toScale: CGFloat
        let fromCorner: CGFloat, toCorner: CGFloat
        let rest: CGSize
        let ownScale: CGFloat
        let look: ItemLook
        let under: Bool // drawn under the page: a card end with nothing to meet
        var id: Key { Key(piece: piece, end: end) }
        var z: Double {
            let base: Double = switch piece.kind { case .panel: 0; case .surface: 2; default: 4 }
            return base + (end == .page ? 1 : 0)
        }
    }

    let opening: Bool
    let legs: [Leg]
    private let flown: Set<Piece>

    @MainActor
    init(opening: Bool, card: [Piece: ItemGeometry], page: [Piece: ItemGeometry],
         cardLooks: ItemLookFactory<Piece>, pageLooks: ItemLookFactory<Piece>, screen: CGRect) {
        self.opening = opening
        func visible(_ g: ItemGeometry) -> ItemGeometry? {
            guard g.size.width > 0, g.frame.width > 0, g.frame.height > 0, g.frame.intersects(screen) else { return nil }
            return g
        }
        let onScreenCard = card.compactMapValues(visible), onScreenPage = page.compactMapValues(visible)
        var legs: [Leg] = []
        var flown = Set<Piece>()
        for piece in Set(onScreenCard.keys).union(onScreenPage.keys) {
            let cardEnd = onScreenCard[piece], pageEnd = onScreenPage[piece]
            switch (cardEnd, pageEnd) {
            case let (.some(c), .some(p)):
                let cardLook = cardLooks(piece, c.size), pageLook = pageLooks(piece, p.size)
                let start = opening ? c : p, finish = opening ? p : c
                let startCorner = opening ? cardLook.corner : pageLook.corner
                let finishCorner = opening ? pageLook.corner : cardLook.corner
                // An element is drawn once, by whichever end is arriving.
                if piece.kind == .element {
                    let (own, look) = opening ? (p, pageLook) : (c, cardLook)
                    legs.append(Leg(piece: piece, end: opening ? .page : .card, from: start.frame, to: finish.frame,
                                    fromScale: start.scale, toScale: finish.scale, fromCorner: startCorner,
                                    toCorner: finishCorner, rest: own.size, ownScale: own.scale, look: look, under: false))
                } else {
                    legs.append(Leg(piece: piece, end: .card, from: start.frame, to: finish.frame, fromScale: start.scale,
                                    toScale: finish.scale, fromCorner: startCorner, toCorner: finishCorner, rest: c.size,
                                    ownScale: c.scale, look: cardLook, under: false))
                    legs.append(Leg(piece: piece, end: .page, from: start.frame, to: finish.frame, fromScale: start.scale,
                                    toScale: finish.scale, fromCorner: startCorner, toCorner: finishCorner, rest: p.size,
                                    ownScale: p.scale, look: pageLook, under: false))
                }
                flown.insert(piece)
            case let (.some(c), nil):
                // No page end to meet: fades in place under the page, unless its holder flies.
                let holderFlies = piece.holder.map { card[$0] != nil && page[$0].flatMap(visible) != nil } ?? false
                let look = cardLooks(piece, c.size)
                legs.append(Leg(piece: piece, end: .card, from: c.frame, to: c.frame, fromScale: c.scale, toScale: c.scale,
                                fromCorner: look.corner, toCorner: look.corner, rest: c.size, ownScale: c.scale,
                                look: look, under: !holderFlies))
                flown.insert(piece)
            case let (nil, .some(p)):
                let look = pageLooks(piece, p.size)
                legs.append(Leg(piece: piece, end: .page, from: p.frame, to: p.frame, fromScale: p.scale, toScale: p.scale,
                                fromCorner: look.corner, toCorner: look.corner, rest: p.size, ownScale: p.scale,
                                look: look, under: false))
                flown.insert(piece)
            case (nil, nil):
                break
            }
        }
        self.legs = legs
        self.flown = flown
    }

    func drawsPage(_ piece: Piece) -> Bool { legs.contains { $0.piece == piece && $0.end == .page } }
    func drawsCard(_ piece: Piece) -> Bool { legs.contains { $0.piece == piece && $0.end == .card } }
    func flies(_ piece: Piece) -> Bool { flown.contains(piece) }
}

@MainActor
@Observable
final class ItemLayerModel<Piece: ItemPiece>: ItemLayerBox {
    private(set) var itemId: AnyHashable?
    private(set) var retiringId: AnyHashable? // just flown home: invisible, frozen ~0.3 s
    private(set) var state: ItemLayerState = .closed
    private(set) var flyingId: AnyHashable? // pieces read this first, so only the flying card depends on the layer
    private(set) var scope: AnyHashable? // the list page opened from; another kept page never pairs
    private(set) var piecesInPlay = false
    private(set) var opening = true
    private(set) var clock: Double = 0
    private(set) var flight: ItemFlight<Piece>?
    private(set) var measuring = false
    private(set) var backProgress: CGFloat = 0
    private(set) var closeFrom: Double = ItemPieceTiming().openTail
    var backBlocked = false

    @ObservationIgnored var timing = ItemPieceTiming()
    @ObservationIgnored var reducedMotion: @MainActor () -> Bool = { UIAccessibility.isReduceMotionEnabled }
    @ObservationIgnored private var cardFrames: [Piece: ItemGeometry] = [:]
    @ObservationIgnored private var pageFrames: [Piece: ItemGeometry] = [:]
    @ObservationIgnored private var cardLooks: ItemLookFactory<Piece>?
    @ObservationIgnored private var pageLooks: ItemLookFactory<Piece>?
    /// Bumped on every user-visible step; a resumed `Task` checks it still matches before acting,
    /// so a stale completion (from an open that was immediately followed by a close) is a no-op.
    @ObservationIgnored private var revision = 0
    @ObservationIgnored private var onFlightVisible: (() -> Void)?
    @ObservationIgnored private var openedAt: CFTimeInterval = 0

    init() {}

    var interactive: Bool { state == .open && !measuring }
    var swipeBackEnabled: Bool { interactive && !backBlocked }

    func open(_ id: AnyHashable, from scope: AnyHashable, cardLooks: @escaping ItemLookFactory<Piece>) {
        guard state == .closed else { return }
        revision += 1
        let token = revision
        retiringId = nil
        itemId = id
        backProgress = 0
        closeFrom = timing.openTail
        guard !reducedMotion() else { piecesInPlay = false; state = .open; return }
        flyingId = id
        self.scope = scope
        self.cardLooks = cardLooks
        (cardFrames, pageFrames) = ([:], [:])
        piecesInPlay = true; opening = true; clock = 0
        measuring = true
        state = .mounting
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(0.35))
            guard let self, self.revision == token, self.state == .mounting else { return }
            self.beginFlight()
        }
    }

    /// The page hands over how its pieces are drawn, from its own body, so looks track live data.
    func registerPageLooks(_ looks: @escaping ItemLookFactory<Piece>) { pageLooks = looks }

    func noteGeometry(_ piece: Piece, end: ItemPieceEnd, id: AnyHashable, geometry: ItemGeometry) {
        guard measuring, (end == .card ? id == flyingId : id == itemId) else { return }
        if end == .card { cardFrames[piece] = geometry } else { pageFrames[piece] = geometry }
        let anchors = cardFrames.keys.filter { $0.kind == .surface || $0.kind == .panel }
        guard !anchors.isEmpty, anchors.allSatisfy({ pageFrames[$0] != nil }) else { return }
        let token = revision
        Task { [weak self] in
            guard let self, self.revision == token else { return }
            switch self.state {
            case .mounting: self.beginFlight()
            case .open: self.beginClose()
            default: break
            }
        }
    }

    private func beginFlight() {
        guard state == .mounting, flyingId != nil, let cardLooks, let pageLooks else { return }
        measuring = false
        let token = revision
        flight = ItemFlight(opening: true, card: cardFrames, page: pageFrames,
                            cardLooks: cardLooks, pageLooks: pageLooks, screen: Self.screen)
        state = .opening
        afterFlightVisible { [weak self] in
            guard let self, self.revision == token else { return }
            self.openedAt = CACurrentMediaTime()
            withAnimation(.linear(duration: self.timing.openTail)) { self.clock = self.timing.openTail }
            Task { [weak self] in
                try? await Task.sleep(for: .seconds(self.timing.landing))
                guard let self, self.revision == token else { return }
                self.flight = nil
                self.state = .open
            }
        }
    }

    /// Runs `start` once the flight layer has actually drawn the flight just set, or after a
    /// short backstop — never in the same update that inserted it, or the open skips its animation.
    private func afterFlightVisible(_ start: @escaping () -> Void) {
        onFlightVisible = start
        let token = revision
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(0.034))
            guard let self, self.revision == token else { return }
            self.runOnFlightVisible()
        }
    }

    /// The flight layer's onAppear: the flight is actually on screen, so its clock may start.
    func flightOnScreen() {
        guard onFlightVisible != nil else { return }
        Task { [weak self] in self?.runOnFlightVisible() }
    }

    private func runOnFlightVisible() {
        guard let start = onFlightVisible else { return }
        onFlightVisible = nil
        start()
    }

    func back() {
        guard state == .open, !measuring, !backBlocked else { return }
        guard piecesInPlay, flyingId != nil else { close(); return }
        revision += 1
        (cardFrames, pageFrames) = ([:], [:])
        measuring = true
        let token = revision
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(0.2))
            guard let self, self.revision == token, self.state == .open, self.measuring else { return }
            self.beginClose()
        }
    }

    private func beginClose() {
        guard state == .open, let cardLooks, let pageLooks else { close(); return }
        measuring = false
        revision += 1
        let token = revision
        closeFrom = min(CACurrentMediaTime() - openedAt, timing.openTail)
        var noAnimation = Transaction(); noAnimation.disablesAnimations = true
        withTransaction(noAnimation) {
            opening = false
            clock = 0
            flight = ItemFlight(opening: false, card: cardFrames, page: pageFrames,
                               cardLooks: cardLooks, pageLooks: pageLooks, screen: Self.screen)
            state = .closing
        }
        afterFlightVisible { [weak self] in
            guard let self, self.revision == token else { return }
            if self.backProgress > 0 { withAnimation(.easeOut(duration: 0.28)) { self.backProgress = 0 } }
            withAnimation(.linear(duration: self.timing.travel)) { self.clock = self.timing.travel } completion: { [weak self] in
                guard let self, self.revision == token else { return }
                self.settleClosed()
            }
        }
    }

    /// Closes with no flight: the item was deleted, or there is no card to go back to.
    func close() {
        guard itemId != nil else { return }
        revision += 1
        measuring = false
        var noAnimation = Transaction(); noAnimation.disablesAnimations = true
        withTransaction(noAnimation) { flight = nil; piecesInPlay = false; state = .closing }
        settleClosed()
    }

    private func settleClosed() {
        onFlightVisible = nil
        let token = revision
        if piecesInPlay, let itemId, !reducedMotion() {
            retiringId = itemId
            state = .retiring
            Task { [weak self] in
                try? await Task.sleep(for: .seconds(0.3))
                guard let self, self.revision == token else { return }
                var noAnimation = Transaction(); noAnimation.disablesAnimations = true
                withTransaction(noAnimation) { self.retiringId = nil }
            }
        }
        itemId = nil; flight = nil; flyingId = nil; scope = nil
        piecesInPlay = false; measuring = false
        cardLooks = nil; pageLooks = nil; backBlocked = false
        closeFrom = timing.openTail
        opening = true; clock = 0; backProgress = 0
        state = .closed
    }

    func backDragChanged(_ progress: CGFloat) {
        guard swipeBackEnabled else { return }
        let p = min(max(progress, 0), 1)
        withAnimation(.interactiveSpring(response: 0.12, dampingFraction: 0.9)) { backProgress = p }
    }

    func backDragEnded(commit: Bool) {
        guard swipeBackEnabled else { return }
        if commit { back(); return }
        withAnimation(.spring(response: 0.276, dampingFraction: 0.82)) { backProgress = 0 }
    }

    func hidesPage(_ piece: Piece) -> Bool {
        (state == .mounting && piecesInPlay) || (flight?.drawsPage(piece) ?? false)
    }

    func hidesCard(_ piece: Piece) -> Bool { flight?.drawsCard(piece) ?? false }

    private static var screen: CGRect {
        let scene = UIApplication.shared.connectedScenes.first { $0 is UIWindowScene } as? UIWindowScene
        return scene?.screen.bounds ?? CGRect(x: 0, y: 0, width: 10_000, height: 10_000)
    }
}
