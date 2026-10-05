import SwiftUI

// GrowMorph: a small control (a + button, a compose button, a card) growing into a full page and
// shrinking back into it, like a shared-bounds container transform.
//
// What: GrowMorphState (the clock and alphas), GrowMorphLayer (draws the travelling frame), and
// .growMorphSource (reports where the control sits). A frame travels from the control's rect
// to the whole screen. Each side is laid out once at its own size and scaled to cover the moving
// frame: the control's look, clipped to its own outline, fades out early; the page, clipped to
// a rectangle, fades in after a short delay. Closing runs the same in reverse.
//
// Wire in (needs MotionKit.swift):
//   @State private var morph = GrowMorphState()
//   ZStack {
//       Tabs().opacity(1 - Double(morph.progress) * 0.68)       // what is under fades back
//             .accessibilityHidden(morph.mounted)
//       Bar(...).offset(y: morph.covering ? 140 : 0)           // leaves while the page is up
//       PlusButton { morph.open() }.growMorphSource(morph)     // inside the bar
//       if morph.mounted {
//           GrowMorphLayer(state: morph, sourceShape: .capsule) { PlusButtonLook() }
//               page: { ComposeScreen(onClose: { morph.close() }) }
//       }
//   }
//   The look must draw exactly as the control does (same gradient, glyph, size), or the first
//   frame visibly swaps. Put the layer above the bar so the growing frame passes over it.
//
// Lessons it encodes:
// - Move with a GeometryEffect and an animatable clip Shape, never an Animatable View. Both are
//   interpolated without running any body, so the page's body runs once per open. The first
//   version was an Animatable view that rebuilt the whole page on every frame.
// - Mount, then move: the layer is inserted at the control's size, and the travel starts on the
//   next turn of the main loop. Started in the same update, it skips or spends its first frames
//   building the page.
// - Guard completions with a generation number. A close's completion that arrives after a newer
//   open must not unmount the page.
// - Freeze the source rect while the morph is mounted. The bar leaves while the page is up; a
//   live rect would shrink the page into where the button is mid-slide, not where it lands.
// - The bar comes back as the page starts to shrink (`covering` goes false at close), so the
//   heavy frame that takes the page down comes after the bar has landed and nothing moves.

@MainActor
@Observable
final class GrowMorphState {
    struct Timing {
        /// The frame's travel, on AppMotion.travel.
        var travel: Double = 0.4
        /// The leaving side fades out over this.
        var fadeOut: Double = 0.13
        /// The arriving side fades in over this, after `fadeInDelay`.
        var fadeIn: Double = 0.2
        var fadeInDelay: Double = 0.09
    }

    /// The page is mounted: open, opening or closing.
    private(set) var mounted = false
    /// From the start of opening to the start of closing. Drive the bar (and anything that should
    /// leave while the page is up) with this.
    private(set) var covering = false
    /// 0 = the control's rect, 1 = the whole screen.
    private(set) var progress: CGFloat = 0
    private(set) var pageAlpha: Double = 0
    private(set) var sourceAlpha: Double = 1
    /// Where the control sits, in global coordinates (see growMorphSource).
    var source: CGRect = .zero
    @ObservationIgnored var timing = Timing()
    /// Bumped on every open or close, so a late completion from an earlier one is ignored.
    @ObservationIgnored private var generation = 0

    func open() {
        generation += 1
        mounted = true
        covering = true
        guard !AppMotion.reduced else {
            progress = 1; pageAlpha = 1; sourceAlpha = 0
            return
        }
        progress = 0; pageAlpha = 0; sourceAlpha = 1
        let t = timing
        // Mount at the control's size first, then travel on the next turn.
        DispatchQueue.main.async { [self] in
            withAnimation(AppMotion.travel(t.travel)) { progress = 1 }
            withAnimation(AppMotion.standard(t.fadeOut)) { sourceAlpha = 0 }
            withAnimation(AppMotion.standard(t.fadeIn).delay(t.fadeInDelay)) { pageAlpha = 1 }
        }
    }

    func close() {
        guard mounted else { return }
        generation += 1
        covering = false
        let current = generation
        guard !AppMotion.reduced else {
            mounted = false; progress = 0; pageAlpha = 0; sourceAlpha = 1
            return
        }
        let t = timing
        withAnimation(AppMotion.standard(t.fadeOut)) { pageAlpha = 0 }
        withAnimation(AppMotion.standard(t.fadeIn).delay(t.fadeInDelay)) { sourceAlpha = 1 }
        withAnimation(AppMotion.travel(t.travel)) { progress = 0 } completion: { [self] in
            if current == generation { mounted = false }
        }
    }

    /// For a Bool in your navigator: `.onChange(of: nav.showCompose) { _, on in morph.set(on) }`.
    func set(_ open: Bool) { open ? self.open() : close() }

    /// Gone at once, as when the page hands over to another full-screen state.
    func dismissImmediately() {
        generation += 1
        mounted = false; covering = false; progress = 0; pageAlpha = 0; sourceAlpha = 1
    }
}

extension View {
    /// Reports this view's frame as where the morph grows from and shrinks back to.
    func growMorphSource(_ state: GrowMorphState) -> some View {
        onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { frame in
            // Frozen while mounted (see header).
            if !state.mounted { state.source = frame }
        }
    }
}

/// Draws the travelling frame: the control's look and the page, each scaled to cover it.
struct GrowMorphLayer<Look: View, Page: View>: View {
    let state: GrowMorphState
    /// The control's own outline, which its look is clipped to.
    let sourceShape: MorphOutline
    let look: () -> Look
    let page: () -> Page

    init(state: GrowMorphState, sourceShape: MorphOutline = .capsule,
         @ViewBuilder look: @escaping () -> Look, @ViewBuilder page: @escaping () -> Page) {
        self.state = state
        self.sourceShape = sourceShape
        self.look = look
        self.page = page
    }

    var body: some View {
        // Read in the body so the layer follows the state (a first read inside the
        // GeometryReader closure is not tracked).
        let progress = state.progress
        let source = state.source
        let pageAlpha = state.pageAlpha
        let sourceAlpha = state.sourceAlpha
        GeometryReader { outer in
            // The page is laid out edge to edge but keeps the screen's safe area. safeAreaPadding,
            // not padding: backgrounds inside still reach the screen edges.
            let insets = outer.safeAreaInsets
            GeometryReader { geo in
                let full = geo.frame(in: .global)
                let from = source == .zero
                    ? CGRect(x: geo.size.width - 76, y: geo.size.height - 108, width: 60, height: 60)
                    : source.offsetBy(dx: -full.minX, dy: -full.minY)
                let morph = MorphGeometry(progress: progress, source: from, size: geo.size)
                // Both layers sit at the stack's origin, so their own coordinates are the stack's
                // and each clip path can be the travelling frame itself.
                ZStack(alignment: .topLeading) {
                    look()
                        .frame(width: from.width, height: from.height)
                        .modifier(MorphPlacement(geometry: morph))
                        .clipShape(MorphClip(geometry: morph, outline: sourceShape))
                        .opacity(sourceAlpha)
                        .accessibilityHidden(true)
                    page()
                        .safeAreaPadding(insets)
                        .frame(width: geo.size.width, height: geo.size.height)
                        .modifier(MorphPlacement(geometry: morph))
                        .clipShape(MorphClip(geometry: morph, outline: .rectangle))
                        .opacity(pageAlpha)
                }
                .frame(width: geo.size.width, height: geo.size.height, alignment: .topLeading)
            }
            .ignoresSafeArea()
        }
        // An animation sets the model value at its start, so this reads "opening or open":
        // nothing under the page takes a tap meant for it, and a closing page takes none.
        .allowsHitTesting(progress > 0.999 || AppMotion.reduced)
    }
}

/// The outline the control's look is clipped to while it grows; the page is a rectangle.
enum MorphOutline: Sendable { case capsule, rounded(CGFloat), rectangle }

/// The travelling frame at `progress`: the control's rect at 0, the whole screen at 1.
struct MorphGeometry: Equatable, Sendable {
    var progress: CGFloat
    let source: CGRect
    let size: CGSize

    var frame: CGRect {
        let p = min(max(progress, 0), 1)
        return CGRect(
            x: source.minX * (1 - p), y: source.minY * (1 - p),
            width: max(source.width + (size.width - source.width) * p, 1),
            height: max(source.height + (size.height - source.height) * p, 1))
    }
}

/// Scales a layer laid out at its own size (the look, or the full page) to cover the frame and
/// centres it there. Only a transform: no layout, no body.
private struct MorphPlacement: GeometryEffect {
    var geometry: MorphGeometry

    nonisolated var animatableData: CGFloat {
        get { geometry.progress }
        set { geometry.progress = newValue }
    }

    nonisolated func effectValue(size: CGSize) -> ProjectionTransform {
        let frame = geometry.frame
        let scale = max(frame.width / max(size.width, 1), frame.height / max(size.height, 1))
        let t = CGAffineTransform(translationX: -size.width / 2, y: -size.height / 2)
            .concatenating(CGAffineTransform(scaleX: scale, y: scale))
            .concatenating(CGAffineTransform(translationX: frame.midX, y: frame.midY))
        return ProjectionTransform(t)
    }
}

/// The frame's outline, animated along with the placement.
private struct MorphClip: Shape {
    var geometry: MorphGeometry
    let outline: MorphOutline

    nonisolated var animatableData: CGFloat {
        get { geometry.progress }
        set { geometry.progress = newValue }
    }

    nonisolated func path(in rect: CGRect) -> Path {
        let frame = geometry.frame
        switch outline {
        case .capsule: return Path(roundedRect: frame, cornerRadius: min(frame.width, frame.height) / 2, style: .continuous)
        case .rounded(let radius): return Path(roundedRect: frame, cornerRadius: radius, style: .continuous)
        case .rectangle: return Path(frame)
        }
    }
}
