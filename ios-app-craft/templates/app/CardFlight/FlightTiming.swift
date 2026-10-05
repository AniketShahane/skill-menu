import SwiftUI

// FlightTiming: what a piece is, and every curve and clock of the card flight as pure functions of
// one linear clock t (seconds since the open or close began).
//
// What: FlightKind (how a piece travels), FlightEnd, the FlightPart protocol your part enum adopts,
// CubicBezier, and FlightTiming (the table). Nothing here draws.
//
// Wire in: declare your parts once, from the design, and give each a kind:
//   enum CardPart: FlightPart {
//       case hero, panel, chip, title, subtitle
//       var kind: FlightKind { switch self { case .hero: .surface; case .panel: .panel; case .chip: .element
//                                            case .subtitle: .otherText; default: .text } }
//       var container: CardPart? { self == .title ? .hero : nil }
//   }
// The defaults below are Android-derived (Dash's NavMotion.kt, which matched its Android app to the
// millisecond). They are a good start, not a spec: replace them with your own design's numbers, and
// test the table without a view (it is pure; CubicBezier needs only Foundation).
//
// Lessons it encodes (references/shared-element-flights.md, "Pieces" and "Timings"):
// - One clock drives everything. Frames, corners, per-piece alphas, the page's paper and the
//   staggered after-pieces are functions of t, so they stay in exact sync and a close can start
//   from wherever an open got to.
// - The flight curve is front-loaded (13% in the first 16 ms), so the first frame matters most.
// - A card surface stays fully opaque until the page's is solid, then goes. A half-faded pair of
//   surfaces shows the list through both.
// - Different words never overprint at full weight: the old leaves fast, the new arrives late.
// - Ease once: these curves are applied here, so the clock itself animates linearly.

/// How a piece travels between its card and its page (references/shared-element-flights.md).
enum FlightKind: Sendable {
    /// A picture that fills any box (a hero image, a gradient, a map). Laid out again at every size
    /// it passes through, the same picture cropped to the box, under moving corners.
    case surface
    /// A container. Its content is laid out once at its own size, anchored top-leading, while its
    /// ground and edge follow the moving frame and the frame clips it.
    case panel
    /// Drawn once, by the arriving end, and moved and scaled to the frame (a chip, an icon).
    case element
    /// The same words at both ends. Each end is laid out at its own size and scaled uniformly to
    /// the frame's width, leading and vertically centred; the two crossfade.
    case text
    /// Different words at each end ("Yesterday" and "Wednesday 14 January"). Each end at its own
    /// size, leading, crossfading with a gap. Give its resting frame the full line width.
    case otherText
}

enum FlightEnd: Hashable, Sendable { case card, page }

/// One piece of an item that flies between its card and its page. Usually an enum.
protocol FlightPart: Hashable, Sendable {
    var kind: FlightKind { get }
    /// The surface or panel this part sits in on the card. A card end with no page end to meet
    /// is drawn under the page, unless its container flies; then it rides above with it.
    var container: Self? { get }
}

extension FlightPart {
    var container: Self? { nil }
}

/// A CSS-style cubic-bezier easing: x1, y1, x2, y2 as in `cubic-bezier()` or Compose's
/// CubicBezierEasing. Pure, so a timing table can move to a Foundation-only package and be tested.
struct CubicBezier: Sendable, Equatable {
    let x1: Double, y1: Double, x2: Double, y2: Double

    init(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double) {
        self.x1 = x1; self.y1 = y1; self.x2 = x2; self.y2 = y2
    }

    func callAsFunction(_ progress: Double) -> Double {
        let x = min(max(progress, 0), 1)
        if x == 0 || x == 1 { return x }
        // Find s where the curve's x is `x`: Newton first, bisection if it stalls.
        var s = x
        for _ in 0..<8 {
            let error = Self.sample(s, x1, x2) - x
            if abs(error) < 1e-7 { return Self.sample(s, y1, y2) }
            let slope = Self.slope(s, x1, x2)
            if abs(slope) < 1e-7 { break }
            s -= error / slope
        }
        var lo = 0.0, hi = 1.0
        s = x
        for _ in 0..<40 {
            let v = Self.sample(s, x1, x2)
            if abs(v - x) < 1e-7 { break }
            if v < x { lo = s } else { hi = s }
            s = (lo + hi) / 2
        }
        return Self.sample(s, y1, y2)
    }

    private static func sample(_ s: Double, _ a: Double, _ b: Double) -> Double {
        ((1 - 3 * b + 3 * a) * s + (3 * b - 6 * a)) * s * s + 3 * a * s
    }

    private static func slope(_ s: Double, _ a: Double, _ b: Double) -> Double {
        3 * (1 - 3 * b + 3 * a) * s * s + 2 * (3 * b - 6 * a) * s + 3 * a
    }
}

/// Every duration and curve of the flight. Android-derived defaults (see header): replace them.
struct FlightTiming: Sendable, Equatable {
    /// Every frame and corner travels this long on `flightCurve`.
    var pieces = 0.48
    /// Arriving pieces, surfaces and the page's paper fade in over this.
    var fadeIn = 0.22
    /// Leaving text fades out over this; after-pieces leave over it on a close.
    var fadeOut = 0.15
    /// otherText: the old words leave over `wordsLeave`; the new arrive over `wordsArrive` after
    /// `wordsArriveDelay`.
    var wordsLeave = 0.09
    var wordsArriveDelay = 0.06
    var wordsArrive = 0.15
    /// After-pieces (what only the page has) arrive at pieces / 2 + index * stagger, rising 16 pt;
    /// buttons pop from 0.6 scale, `buttonStagger` apart.
    var stagger = 0.055
    var buttonStagger = 0.045
    /// The highest after-piece index. The open's clock runs until the last one has landed.
    var lastAfterIndex = 5
    var flightCurve = CubicBezier(0.25, 1, 0.5, 1)
    var fadeCurve = CubicBezier(0.33, 1, 0.68, 1)

    /// When the open's clock stops: the last after-piece has landed.
    var openTail: Double { pieces / 2 + Double(lastAfterIndex) * stagger + fadeIn }
    /// When the page's own pieces take over from the flight: every frame is home by `pieces`.
    var landing: Double { pieces + 0.01 }
    /// The bottom bar comes back half way through a close.
    var barReturnDelay: Double { pieces / 2 }

    func flight(_ t: Double) -> Double { flightCurve(t / pieces) }
    func eased(_ t: Double, _ duration: Double, delay: Double = 0) -> Double { fadeCurve((t - delay) / duration) }
    func linear(_ t: Double, _ duration: Double, delay: Double = 0) -> Double { min(max((t - delay) / duration, 0), 1) }

    /// The page's background, under the pieces.
    func paper(_ t: Double, opening: Bool) -> Double {
        opening ? eased(t, fadeIn) : 1 - eased(t, fadeIn)
    }

    /// One end of one piece. "Arriving" is the page end on an open and the card end on a close.
    func alpha(_ kind: FlightKind, _ end: FlightEnd, opening: Bool, t: Double) -> Double {
        let arriving = (end == .page) == opening
        switch kind {
        case .element:
            // Drawn once, by the arriving end: it only moves.
            return arriving ? 1 : 0
        case .surface, .panel:
            // The card's surface is solid until the page's is, then goes: never two half-faded.
            if end == .card { return arriving ? 1 : (t < fadeIn ? 1 : 0) }
            return arriving ? eased(t, fadeIn) : 1 - eased(t, fadeOut)
        case .otherText:
            return arriving ? eased(t, wordsArrive, delay: wordsArriveDelay) : 1 - linear(t, wordsLeave)
        case .text:
            return arriving ? eased(t, fadeIn) : 1 - eased(t, fadeOut)
        }
    }

    /// Something only the page has. In after `delay` on an open; on a close it leaves at once,
    /// from the value it had reached when the close began (`closeFrom`), never from full.
    func afterPiece(_ t: Double, opening: Bool, delay: Double, closeFrom: Double) -> Double {
        if opening { return eased(t, fadeIn, delay: delay) }
        return min(eased(closeFrom, fadeIn, delay: delay), 1 - eased(t, fadeOut))
    }

    func arrivalDelay(index: Int, pops: Bool) -> Double {
        pieces / 2 + Double(index) * (pops ? buttonStagger : stagger)
    }
}
