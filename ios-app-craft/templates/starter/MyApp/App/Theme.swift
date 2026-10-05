import SwiftUI
import MyAppCore

// Theme: the app's small token set. Colours, type, spacing, corners and motion, each named once.
//
// What: Palette (colour roles from the asset catalog, light and dark), TextRole + .textRole()
// (type that scales with Dynamic Type), Space and Radius (the spacing and corner scales), Motion
// (the curves this app uses, from MotionKit's vocabulary), and Color(hex:) for data colours.
//
// Wire in: change the values here and in Assets.xcassets, never at call sites. A new colour is a
// colour set with a light and a dark value; LaunchBackground must stay equal to Paper, because the
// launch screen (UILaunchScreen in project.yml) is the first frame's background.
//
// Lessons it encodes (references/architecture.md §7, motion-craft.md §1):
// - Colour roles live in the asset catalog, so dark mode is a property of the colour, not of every
//   view. Brand constants that never change with the theme can live in code.
// - Type roles scale with Dynamic Type (text styles, or Font.custom(_:size:relativeTo:)), and every
//   role that shows changing numbers is monospaced-digit, so digits never jitter.
// - One vocabulary of curves, named once: a call site never writes easeInOut(0.3).

enum Palette {
    static let paper = Color("Paper")
    static let ink = Color("Ink")
    static let muted = Color("Muted")
    static let panel = Color("Panel")
    static let outline = Color("Outline")
    static let accent = Color("AccentColor")
}

enum TextRole {
    case display, title, cardTitle, headline, body, caption, label, number, bigNumber

    var font: Font {
        switch self {
        case .display: .system(.largeTitle, design: .rounded, weight: .bold)
        case .title: .system(.title, design: .rounded, weight: .bold)
        case .cardTitle: .system(.title3, design: .rounded, weight: .bold)
        case .headline: .system(.headline, design: .rounded, weight: .semibold)
        case .body: .system(.body)
        case .caption: .system(.subheadline)
        case .label: .system(.caption2, weight: .bold)
        case .number: .system(.title3, design: .rounded, weight: .semibold).monospacedDigit()
        case .bigNumber: .system(.title, design: .rounded, weight: .semibold).monospacedDigit()
        }
    }

    var tracking: CGFloat {
        switch self {
        case .display, .title: -0.6
        case .label: 1
        default: 0
        }
    }
}

extension View {
    func textRole(_ role: TextRole) -> some View { font(role.font).tracking(role.tracking) }
}

enum Space {
    static let xs: CGFloat = 4, s: CGFloat = 8, m: CGFloat = 12, l: CGFloat = 16, xl: CGFloat = 20, xxl: CGFloat = 28
}

enum Radius {
    static let card: CGFloat = 24, panel: CGFloat = 28, page: CGFloat = 32
}

/// The motion this app uses, from MotionKit's named curves.
enum Motion {
    static var tabs: Animation { AppMotion.glide() }
    static var arrive: Animation { AppMotion.ease(0.48) }
    static var change: Animation { .smooth(duration: 0.35) }
}

extension Color {
    /// "#RRGGBB" from data (a card's gradient); clear if it doesn't parse.
    init(hex: String) {
        if let c = HexColor(hex) { self.init(.sRGB, red: c.red, green: c.green, blue: c.blue) } else { self = .clear }
    }
}
