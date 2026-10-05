import SwiftUI
import UIKit

// CardFlightPage: the layer the page lives in, above the tabs, with its edge swipe back.
//
// What: CardFlightPageLayer shows the open (or retiring) item's page with its clock in the
// environment, shrinks it with the left-edge swipe (Android's predictive back), rises it in when
// there is no card to fly from, and posts the accessibility screen changes.
//
// Wire in: RootView's ZStack, bottom to top (explicit siblings, not zIndex):
//   NavigationStack { KeptTabPager(state:, covered: cards.coversList, ...) { tab in page(tab)
//       .environment(\.flightScope, AnyHashable(tab)) } }
//       .accessibilityHidden(cards.coversList).allowsHitTesting(!cards.isPresented)
//   CardFlightLayer(flight: cards, under: true)
//   CardFlightPageLayer(flight: cards) { id in DetailHost(id: id) }
//   CardFlightLayer(flight: cards)
//   BottomBar(...).flightBarAway(cards).allowsHitTesting(!cards.barAway && !cards.isPresented)
//   ...and .cardFlight(cards) on the ZStack.
//
// Lessons it encodes (shared-element-flights.md "Back gesture", "Everything a NavigationStack push
// did for free"; motion-craft.md §3, §5, §9):
// - The page is an overlay above the list, not a push: a push takes the list out of the window, and
//   then there is nothing to fly between.
// - One shape of modifiers at every progress (neutral at rest). An `if` around content in the shrink
//   gave the page a new identity as a swipe began: rebuilt, scroll lost.
// - A retiring page keeps the clock where the fold left it: nothing on it changes while it waits.
// - With a custom layer you own what a push did: VoiceOver hiding, `.screenChanged` at still
//   moments, an escape action, and refusing back while a dialog is up or a close is measured.
// - Other pans (scrolls, scrubs) wait for the edge pan to fail.

struct CardFlightPageLayer<Part: FlightPart, Page: View>: View {
    let flight: CardFlight<Part>
    let page: (AnyHashable) -> Page

    init(flight: CardFlight<Part>, @ViewBuilder page: @escaping (AnyHashable) -> Page) {
        self.flight = flight
        self.page = page
    }

    var body: some View {
        // Everything is read here, in the body (reads inside GeometryReader's closure are not observed).
        let shown = flight.itemId
        let id = shown ?? flight.retiringId
        let timing = flight.timing
        let clock = shown == nil
            ? FlightClock(time: timing.pieces, opening: false, pieces: true, closeFrom: 0, timing: timing)
            : FlightClock(time: flight.clock, opening: flight.opening, pieces: flight.piecesInPlay,
                          closeFrom: flight.closeFrom, timing: timing)
        let back = flight.backProgress
        let rise = flight.pageRise
        let interactive = flight.interactive
        let covers = flight.coversList
        GeometryReader { geo in
            ZStack {
                // The same position whether shown or retiring: a retiring page is the same page.
                if let id {
                    page(id)
                        .frame(width: geo.size.width, height: geo.size.height)
                        .environment(\.flightPageInLayer, true)
                        .modifier(BackShrink(progress: back, insets: geo.safeAreaInsets))
                        .modifier(RiseEffect(rise: rise))
                        .opacity(shown == nil ? 0 : 1)
                        .allowsHitTesting(interactive && shown != nil)
                        .accessibilityHidden(shown == nil)
                        .accessibilityElement(children: .contain)
                        .accessibilityAction(.escape) { flight.back() }
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .environment(\.flightClock, clock)
            .gesture(FlightEdgeBack(enabled: flight.swipeBackEnabled,
                                    changed: { flight.backDragChanged($0) },
                                    ended: { flight.backDragEnded(commit: $0) }))
        }
        // The layer says the screen changed as the list leaves (the tap) and comes back (once the
        // fold has settled): moments when nothing moves.
        .onChange(of: covers) { _, _ in UIAccessibility.post(notification: .screenChanged, argument: nil) }
    }
}

/// The page following the finger: it shrinks, moves right and rounds its corners.
private struct BackShrink: ViewModifier, Animatable {
    var progress: CGFloat
    let insets: EdgeInsets

    nonisolated var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }

    func body(content: Content) -> some View {
        let p = min(max(progress, 0), 1)
        let e = CGFloat(Self.ease(Double(p)))
        // No `if` here: the same modifiers at every progress, neutral at 0.
        content
            .clipShape(BackClip(radius: 28 * e, on: p > 0, insets: insets))
            .scaleEffect(1 - 0.08 * e)
            .offset(x: 28 * e)
    }

    private static let ease = CubicBezier(0.05, 0.7, 0.1, 1)
}

/// The page's outline while swiped: rounded around the whole screen (the page draws under the
/// status bar and home indicator, outside its own frame). At rest it clips nothing.
private struct BackClip: Shape {
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

/// A page height below at 1 (rising in from the bottom), in place at 0. Only a transform.
private struct RiseEffect: GeometryEffect {
    var rise: CGFloat

    nonisolated var animatableData: CGFloat {
        get { rise }
        set { rise = newValue }
    }

    nonisolated func effectValue(size: CGSize) -> ProjectionTransform {
        ProjectionTransform(CGAffineTransform(translationX: 0, y: rise * size.height))
    }
}

/// A swipe in from the left edge: follows the finger; goes back past 35% of the width or on a flick.
private struct FlightEdgeBack: UIGestureRecognizerRepresentable {
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
        /// Scrolls and other pans wait for the edge swipe to fail first.
        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                               shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
            other is UIPanGestureRecognizer && !(other is UIScreenEdgePanGestureRecognizer)
        }
    }
}
