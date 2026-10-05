import SwiftUI
import UIKit

// ItemDetailHost: the overlay layer the open item's page lives in, the view that draws the
// pieces in the air (ItemFlightLayer), the left-edge swipe back, entrance-once page content
// (ItemPageReveal), and the "build what's above the fold first" split. AppTab is the small scope
// enum a kept tab page tags itself with, so its cards know which flights they can join.
//
// Example written for this skill; read it, don't paste it.
//
// Builds on templates/app/CardFlight/CardFlightPage.swift: same shape (a GeometryReader over the
// open or retiring item, a back-shrink modifier with no `if` around its content, a screen-edge
// pan gesture), plus two lessons from motion-craft.md that CardFlightPage.swift leaves to the
// page itself: an entrance that must not replay on every visit, and heavy pages built in two
// passes so the mount frame stays light.
//
// Lessons it encodes (motion-craft.md §3 "Reveal once", "Build the first screen, then the rest";
// shared-element-flights.md "Back gesture"):
// - An entrance (rise, fade, stagger, count-up) plays once per session per key, claimed in
//   `init` so a rebuilt view never replays it — and a page that arrived by flight still marks
//   its key seen, so a later plain push doesn't play an entrance on top of one.
// - A heavy detail page builds only what's above the fold (and what gets measured) on its mount
//   frame; the rest waits one turn, so nobody watches it fill in.
// - The page is an overlay above the list, not a push, or there is nothing left to fly between.

/// The list page scope a card is opened from. A card with no `AppTab` in its environment opens
/// its page with no flight (see ItemCard's and ItemRow's "to adapt" notes in README.md).
enum AppTab: String, Hashable, CaseIterable, Sendable {
    case feed, starred
}

/// Marks an entrance key seen for the rest of the session, so a page's rise-and-fade plays once.
@MainActor
final class ItemPageReveal: ObservableObject {
    private static var seen = Set<AnyHashable>()

    let plays: Bool

    /// Claim the key in `init`, into a `@State`-held instance, not read fresh in `body`: a
    /// rebuilt view (a parent's state changing) must not see the entrance replay.
    init(key: AnyHashable, skip: Bool = false) {
        if skip || Self.seen.contains(key) {
            plays = false
        } else {
            plays = true
        }
        Self.seen.insert(key)
    }
}

/// An entrance that rises 18 pt and fades in, once, over `duration`; settled on every later visit
/// or when the page arrived by a flight (its own entrance already played that part).
struct ItemRevealModifier: ViewModifier {
    let reveal: ItemPageReveal
    var duration: Double = 0.32
    @State private var shown = false

    func body(content: Content) -> some View {
        content
            .opacity(reveal.plays && !shown ? 0 : 1)
            .offset(y: reveal.plays && !shown ? 18 : 0)
            .onAppear {
                guard reveal.plays, !shown else { return }
                withAnimation(.easeOut(duration: duration)) { shown = true }
            }
    }
}

extension View {
    func itemPageReveal(_ reveal: ItemPageReveal, duration: Double = 0.32) -> some View {
        modifier(ItemRevealModifier(reveal: reveal, duration: duration))
    }
}

/// Draws every leg of the current flight in window coordinates. Two copies are mounted: one
/// `under` the page (card ends with nothing to meet), one above both pages.
struct ItemFlightLayer<Piece: ItemPiece>: View {
    let layer: ItemLayerModel<Piece>
    var under = false

    var body: some View {
        // Read the clock here, in the body: a first read inside ForEach's closure is not tracked.
        let clock = layer.clock
        let timing = layer.timing
        let handed = ItemPieceClock(time: clock, opening: layer.opening, pieces: layer.piecesInPlay,
                                    flying: layer.flyingId, closeFrom: layer.closeFrom, timing: timing)
        if let flight = layer.flight {
            let legs = flight.legs.filter { $0.under == under }
            ZStack(alignment: .topLeading) {
                ForEach(legs) { leg in
                    leg.look.view
                        .modifier(ItemPieceMotion(clock: clock, kind: leg.piece.kind, end: leg.end,
                                                  opening: flight.opening, from: leg.from, to: leg.to,
                                                  fromScale: leg.fromScale, toScale: leg.toScale,
                                                  fromCorner: leg.fromCorner, toCorner: leg.toCorner,
                                                  rest: leg.rest, ownScale: leg.ownScale,
                                                  ground: leg.look.ground, edge: leg.look.edge, timing: timing))
                        .zIndex(leg.z)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .ignoresSafeArea()
            .environment(\.itemPieceRole, .look)
            .environment(\.itemPieceClock, handed)
            .environment(\.itemLayerBox, layer)
            .onAppear { if !under { layer.flightOnScreen() } }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }
}

/// Places one end of one piece for the current clock: its frame, corner, scale and alpha. No
/// `compositingGroup`/`drawingGroup` here — an offscreen pass on a moving piece blurs its text.
private struct ItemPieceMotion: ViewModifier, Animatable {
    var clock: Double
    let kind: ItemPieceKind
    let end: ItemPieceEnd
    let opening: Bool
    let from: CGRect, to: CGRect
    let fromScale: CGFloat, toScale: CGFloat
    let fromCorner: CGFloat, toCorner: CGFloat
    let rest: CGSize
    let ownScale: CGFloat
    let ground: Color?
    let edge: Color?
    let timing: ItemPieceTiming

    nonisolated var animatableData: Double {
        get { clock }
        set { clock = newValue }
    }

    func body(content: Content) -> some View {
        let f = CGFloat(timing.travelled(clock))
        let frame = CGRect(x: from.minX + (to.minX - from.minX) * f, y: from.minY + (to.minY - from.minY) * f,
                           width: from.width + (to.width - from.width) * f, height: from.height + (to.height - from.height) * f)
        let alpha = timing.alpha(kind, end, opening: opening, t: clock)
        switch kind {
        case .surface, .panel:
            let corner = fromCorner + (toCorner - fromCorner) * f
            let shape = RoundedRectangle(cornerRadius: corner, style: .continuous)
            let size = CGSize(width: max(frame.width, 1), height: max(frame.height, 1))
            let k = max(fromScale + (toScale - fromScale) * f, 0.01)
            // A surface is the same picture re-laid-out at the live size; a panel lays its
            // content out once, at its own size, under the moving frame.
            let placed = kind == .surface ? CGSize(width: size.width / k, height: size.height / k) : rest
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
            let s = rest.width > 0 ? frame.width / rest.width : 1
            content
                .frame(width: rest.width, height: rest.height, alignment: .topLeading)
                .scaleEffect(s, anchor: .topLeading)
                .opacity(alpha)
                .offset(x: frame.minX, y: frame.midY - rest.height * s / 2)
        case .otherText:
            content
                .frame(width: rest.width, height: rest.height, alignment: .topLeading)
                .scaleEffect(ownScale, anchor: .topLeading)
                .opacity(alpha)
                .offset(x: frame.minX, y: frame.midY - rest.height * ownScale / 2)
        }
    }
}

/// The page layer: above the tabs, below the bottom bar. `page` builds the detail view for
/// whichever item is open or retiring; `restBuilt` is handed to it so a heavy page can build only
/// what's above the fold on its mount frame and the rest one turn later.
struct ItemDetailHost<Piece: ItemPiece, Page: View>: View {
    let layer: ItemLayerModel<Piece>
    @ViewBuilder let page: (AnyHashable, _ restBuilt: Bool) -> Page
    @State private var restBuilt = false

    var body: some View {
        let shown = layer.itemId
        let id = shown ?? layer.retiringId
        let timing = layer.timing
        let clock = shown == nil
            ? ItemPieceClock(time: timing.travel, opening: false, pieces: true, flying: nil, closeFrom: 0, timing: timing)
            : ItemPieceClock(time: layer.clock, opening: layer.opening, pieces: layer.piecesInPlay,
                             flying: layer.flyingId, closeFrom: layer.closeFrom, timing: timing)
        let back = layer.backProgress
        let interactive = layer.interactive
        GeometryReader { geo in
            ZStack {
                if let id {
                    page(id, restBuilt)
                        .frame(width: geo.size.width, height: geo.size.height)
                        .environment(\.itemPageInLayer, true)
                        .modifier(ItemBackShrink(progress: back, insets: geo.safeAreaInsets))
                        .opacity(shown == nil ? 0 : 1)
                        .allowsHitTesting(interactive && shown != nil)
                        .accessibilityHidden(shown == nil)
                        .accessibilityElement(children: .contain)
                        .accessibilityAction(.escape) { layer.back() }
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .environment(\.itemPieceClock, clock)
            .gesture(ItemEdgeBack(enabled: layer.swipeBackEnabled,
                                 changed: { layer.backDragChanged($0) },
                                 ended: { layer.backDragEnded(commit: $0) }))
        }
        .onChange(of: shown) { _, now in
            restBuilt = false
            guard now != nil else { return }
            // Above the fold first; the rest waits a turn, so nobody watches it fill in.
            DispatchQueue.main.async { restBuilt = true }
        }
        .onChange(of: layer.state) { _, state in
            UIAccessibility.post(notification: .screenChanged, argument: nil)
            _ = state
        }
    }
}

/// The page following the finger: shrinks, moves right, rounds its corners. No `if` around the
/// content at any progress — an `if` here gave a swiped page a new identity and lost its scroll.
private struct ItemBackShrink: ViewModifier, Animatable {
    var progress: CGFloat
    let insets: EdgeInsets

    nonisolated var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }

    func body(content: Content) -> some View {
        let p = min(max(progress, 0), 1)
        content
            .clipShape(ItemBackClip(radius: 26 * p, on: p > 0, insets: insets))
            .scaleEffect(1 - 0.08 * p)
            .offset(x: 26 * p)
    }
}

private struct ItemBackClip: Shape {
    var radius: CGFloat
    let on: Bool
    let insets: EdgeInsets

    nonisolated var animatableData: CGFloat {
        get { radius }
        set { radius = newValue }
    }

    nonisolated func path(in rect: CGRect) -> Path {
        guard on else { return Path(rect.insetBy(dx: -4000, dy: -4000)) }
        let screen = CGRect(x: rect.minX - insets.leading, y: rect.minY - insets.top,
                            width: rect.width + insets.leading + insets.trailing,
                            height: rect.height + insets.top + insets.bottom)
        return Path(roundedRect: screen, cornerRadius: radius, style: .continuous)
    }
}

/// A swipe in from the left edge: follows the finger, commits past 35% of the width or on a flick.
private struct ItemEdgeBack: UIGestureRecognizerRepresentable {
    let enabled: Bool
    let changed: (CGFloat) -> Void
    let ended: (Bool) -> Void

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

    func makeUIGestureRecognizer(context: Context) -> UIScreenEdgePanGestureRecognizer {
        let pan = UIScreenEdgePanGestureRecognizer()
        pan.edges = .left
        pan.delegate = context.coordinator
        return pan
    }

    func updateUIGestureRecognizer(_ recognizer: UIScreenEdgePanGestureRecognizer, context: Context) {
        recognizer.isEnabled = enabled
    }

    func handleUIGestureRecognizerAction(_ recognizer: UIScreenEdgePanGestureRecognizer, context: Context) {
        let width = max(recognizer.view?.bounds.width ?? 1, 1)
        let progress = max(recognizer.translation(in: recognizer.view).x, 0) / width
        switch recognizer.state {
        case .began, .changed: changed(progress)
        case .ended: ended(progress > 0.35 || recognizer.velocity(in: recognizer.view).x > 700)
        case .cancelled, .failed: ended(false)
        default: break
        }
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                               shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
            other is UIPanGestureRecognizer && !(other is UIScreenEdgePanGestureRecognizer)
        }
    }
}
