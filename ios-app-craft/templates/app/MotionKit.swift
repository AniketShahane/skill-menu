import SwiftUI
import UIKit

// MotionKit: the app's motion vocabulary in one file.
//
// What: curve tokens (cubic beziers as SwiftUI Animations), a press ButtonStyle, a reveal-once
// entrance (RevealSession + .reveal), .onFirstShown (waits until a kept page is really on
// screen), a count-up AnimatedNumber, and one reduced-motion switch.
//
// Wire in: add to the app target. Rename AppMotion if you like; keep one name everywhere.
// UI tests pass `-appNoMotion` (AppUITestCase) to turn entrances off; change
// `AppMotion.noMotionArgument` if you change the prefix there. `tabPageShown` is set by
// KeptTabPager; without a pager it is always true and everything here still works.
//
// Lessons it encodes:
// - Name curves once and use the names. Porting from another platform, copy the bezier control
//   points exactly: "ease-out" is not one curve, and the feel lives in those four numbers.
// - An entrance plays once per identity for the life of the app. Coming back to a page, or a lazy
//   row scrolled back into view, shows it settled. Replaying on every visit reads as lag.
// - A page built ahead of time (a kept tab, a warm-up copy) must not play its entrance unseen:
//   entrances start from onFirstShown, not onAppear.
// - A number that counts up reserves the width of its final text, so nothing beside it reflows
//   per frame. Its per-frame body is one Text: keep Animatable views that small.
// - Reduced motion is one switch read by views and by non-view code (navigators, state
//   machines), so the whole app agrees. It covers the system setting and a test launch argument.

enum AppMotion {
    /// The UI-test launch argument that turns motion off (screenshots stay deterministic).
    static let noMotionArgument = "-appNoMotion"
    private static let noMotionLaunch = ProcessInfo.processInfo.arguments.contains(noMotionArgument)

    /// True under Reduce Motion or the test flag. Read live: the system setting can change while
    /// the app runs. Views may also read \.accessibilityReduceMotion; non-view code reads this.
    @MainActor static var reduced: Bool { noMotionLaunch || UIAccessibility.isReduceMotionEnabled }

    // MARK: Curves. Each is a cubic bezier; the comment says what it is for.

    /// Pages sliding side by side and the tab indicator: slow out, long settle.
    static func glide(_ duration: Double = tabSeconds) -> Animation { .timingCurve(0.35, 0, 0.15, 1, duration: duration) }
    /// Emphasized decelerate: reveals, count-ups, draw-ins, anything arriving.
    static func ease(_ duration: Double) -> Animation { .timingCurve(0.05, 0.7, 0.1, 1, duration: duration) }
    /// Emphasized: a frame travelling between two places (a button growing into a page).
    static func travel(_ duration: Double) -> Animation { .timingCurve(0.2, 0, 0, 1, duration: duration) }
    /// Ease-out quart: pieces in flight to their places.
    static func flight(_ duration: Double) -> Animation { .timingCurve(0.25, 1, 0.5, 1, duration: duration) }
    /// Ease-out cubic: cross-fades.
    static func fade(_ duration: Double) -> Animation { .timingCurve(0.33, 1, 0.68, 1, duration: duration) }
    /// Standard: small fades that start and stop gently (alphas inside a morph).
    static func standard(_ duration: Double) -> Animation { .timingCurve(0.4, 0, 0.2, 1, duration: duration) }
    /// Emphasized accelerate: things leaving. Short, so the next thing is not kept waiting.
    static func leave(_ duration: Double = 0.2) -> Animation { .timingCurve(0.3, 0, 0.8, 0.15, duration: duration) }

    static let tabSeconds = 0.4

    // MARK: Springs. A spring starts from rest, so its first frame moves little: prefer one for
    // anything full screen (a dim, a scrim) where a steep curve would land a big step at once.

    static let bouncy = Animation.spring(response: 0.35, dampingFraction: 0.55)
    static let snappy = Animation.spring(response: 0.3, dampingFraction: 0.85)
    static let gentle = Animation.spring(response: 0.5, dampingFraction: 0.9)

    /// Core Animation does not draw a layer at zero opacity. Something about to fade or fly in
    /// sits at this instead, so it is drawn while nothing shows and its first moving frame is
    /// cheap (measured: a page first drawn on its landing frame cost a 40-50 ms stall).
    static let drawnButUnseen: Double = 0.001

    /// `animation`, or nil under reduced motion. For `.animation(AppMotion.unlessReduced(...), value:)`.
    @MainActor static func unlessReduced(_ animation: Animation) -> Animation? { reduced ? nil : animation }
}

/// Runs `body` in `animation`, or plainly under reduced motion.
@MainActor
func withMotion<Result>(_ animation: Animation, _ body: () throws -> Result) rethrows -> Result {
    if AppMotion.reduced { return try body() }
    return try withAnimation(animation, body)
}

// MARK: - Press

/// Scales the label down while pressed: quick in, a small spring back out.
struct PressStyle: ButtonStyle {
    var scale: CGFloat = 0.96
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            // Scoped to isPressed, so the press never animates anything else in the label.
            .animation(configuration.isPressed ? .easeOut(duration: 0.12) : AppMotion.bouncy, value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == PressStyle {
    static var press: PressStyle { PressStyle() }
    static func press(_ scale: CGFloat) -> PressStyle { PressStyle(scale: scale) }
}

// MARK: - Reveal once

/// Remembers which entrances have played. A key is spent when its view is first built, so a view
/// built again (a parent's body re-running, a lazy row coming back) shows settled.
@MainActor
final class RevealSession {
    static let shared = RevealSession()
    private var seen: Set<String> = []
    /// While pages are built unseen to warm them up, nothing counts as a first showing, so the
    /// real page still plays its entrance later. Set by KeptTabPager's warm-up.
    var warming = false

    func firstTime(_ key: String) -> Bool {
        if AppMotion.reduced || warming { return false }
        return seen.insert(key).inserted
    }

    /// Plays every entrance again (sign out, a data reset).
    func reset() { seen.removeAll() }
}

/// Rise and fade in, staggered by `index`, the first time `key` is shown.
private struct Reveal: ViewModifier {
    let key: String
    let index: Int
    @State private var shown: Bool
    @State private var animate: Bool

    init(key: String, index: Int) {
        self.key = key
        self.index = index
        // Decided at build, kept in state: only the first build of this identity counts.
        let first = RevealSession.shared.firstTime(key)
        _shown = State(initialValue: !first)
        _animate = State(initialValue: first)
    }

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .scaleEffect(shown ? 1 : 0.97)
            .offset(y: shown ? 0 : 22)
            .onFirstShown {
                guard animate else { return }
                // Capped stagger: row 30 of a long list must not wait two seconds.
                let delay = Double(min(max(index, 0), 12)) * 0.055
                withAnimation(AppMotion.ease(0.48).delay(delay)) { shown = true }
            }
    }
}

/// Runs `start` the first time this view is actually on screen: when it appears, or, for a page
/// built ahead of time behind another tab, when that tab is shown. With `repeats`, it runs again
/// on every later appearance.
private struct FirstShown: ViewModifier {
    let repeats: Bool
    let start: () -> Void
    @Environment(\.tabPageShown) private var pageShown
    @State private var done = false
    @State private var onScreen = false

    func body(content: Content) -> some View {
        content
            .onAppear { onScreen = true; fire() }
            .onDisappear { onScreen = false; if repeats { done = false } }
            .onChange(of: pageShown) { _, _ in fire() }
    }

    private func fire() {
        guard onScreen, pageShown, !done else { return }
        done = true
        start()
    }
}

extension View {
    /// `start` runs once this view is on screen for real (see FirstShown).
    func onFirstShown(repeats: Bool = false, _ start: @escaping () -> Void) -> some View {
        modifier(FirstShown(repeats: repeats, start: start))
    }

    /// Rise-and-fade entrance, played once per `key` for the life of the app. Give keys a page
    /// prefix and a stable item id ("home#card-\(id)"), never a list index.
    func reveal(_ key: String, index: Int = 0) -> some View {
        modifier(Reveal(key: key, index: index))
    }
}

extension EnvironmentValues {
    /// False while this page is kept alive behind another tab. Kept pages are not torn down when
    /// left, so work that should stop when a page is left watches this, not onDisappear.
    @Entry var tabPageShown: Bool = true
}

// MARK: - Count-up number

/// A number that counts up from zero the first time its page is shown and shows settled on every
/// later visit. Pass a monospaced-digit font (`.monospacedDigit()`) so digits don't jitter.
struct AnimatedNumber: View {
    let value: Double
    let revealKey: String
    var font: Font
    var color: Color = .primary
    var tracking: CGFloat = 0
    var duration: Double = 1.1
    var delay: Double = 0
    let format: (Double) -> String

    @State private var shown: Double
    /// Kept in state: SwiftUI may build this view again before it appears, and only the first
    /// build is the page's first showing.
    @State private var animates: Bool

    init(_ value: Double, revealKey: String, font: Font, color: Color = .primary, tracking: CGFloat = 0,
         duration: Double = 1.1, delay: Double = 0, format: @escaping (Double) -> String) {
        self.value = value
        self.revealKey = revealKey
        self.font = font
        self.color = color
        self.tracking = tracking
        self.duration = duration
        self.delay = delay
        self.format = format
        let first = RevealSession.shared.firstTime("number:" + revealKey)
        _animates = State(initialValue: first)
        _shown = State(initialValue: first ? 0 : value)
    }

    var body: some View {
        // The final text, hidden, holds the layout; the counting text is drawn over it, so the
        // row never reflows while the digits change.
        Text(format(value))
            .font(font).tracking(tracking)
            .lineLimit(1)
            .hidden()
            .overlay(alignment: .leading) {
                CountingText(value: shown, format: format)
                    .font(font).tracking(tracking)
                    .foregroundStyle(color)
                    .lineLimit(1)
                    .fixedSize()
            }
            // VoiceOver reads the real value, never a frame of the count.
            .accessibilityElement()
            .accessibilityLabel(format(value))
            .onFirstShown {
                guard animates else { return }
                withAnimation(AppMotion.ease(duration).delay(delay)) { shown = value }
            }
            .onChange(of: value) { _, new in
                // A number that entered settled stays settled: a new value cuts in.
                withAnimation(animates ? AppMotion.ease(duration) : nil) { shown = new }
            }
    }
}

/// The only view whose body runs per frame of a count: one Text.
private struct CountingText: View, Animatable {
    var value: Double
    let format: (Double) -> String
    // nonisolated: Animatable is not a main-actor protocol (Swift 6 language mode).
    nonisolated var animatableData: Double {
        get { value }
        set { value = newValue }
    }
    var body: some View { Text(format(value)) }
}
