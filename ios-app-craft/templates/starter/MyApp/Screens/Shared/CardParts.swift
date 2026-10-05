import SwiftUI
import MyAppCore

// CardParts: the pieces a card flies as, and the small views both ends are built from.
//
// What: CardPart (each piece and its kind), and the builders the Home card, the detail page and
// both ends' flight looks all use: HeroSurface, CategoryChip, CardTitle, DayText, StatLabel,
// StatValue and StatsRow.
//
// Wire in: a new piece is a case here with a kind, a `.flightPiece` on the card and on the page,
// and a look on each end (HomeCard.looks, DetailScreen.look). Parts that only the page has are not
// pieces: give them .flightAfterPieces(index:) on the page.
//
// Lessons it encodes (references/shared-element-flights.md "Looks: the key to no pops"):
// - A look must be pixel-identical to the real view at its end, or the first or last frame pops.
//   So the real views and the looks are built by the same code, here.
// - A surface is laid out again at every size it flies through, so draw it to fill any box: the
//   hero's symbol is sized from the box, not fixed, and both ends then draw the same picture.
// - Different words fly as otherText, framed to the full line on both ends.

enum CardPart: FlightPart {
    case hero, panel, chip, title, day
    case statLabel(Int), statValue(Int)

    var kind: FlightKind {
        switch self {
        case .hero: .surface
        case .panel: .panel
        case .chip: .element
        case .day: .otherText
        case .title, .statLabel, .statValue: .text
        }
    }

    var container: CardPart? {
        switch self {
        case .chip, .title, .day: .hero
        case .statLabel, .statValue: .panel
        case .hero, .panel: nil
        }
    }
}

/// The card's picture: its gradient and a large faint symbol, drawn to fill whatever box it gets.
struct HeroSurface: View {
    let colors: [String]
    let symbol: String

    var body: some View {
        LinearGradient(colors: colors.map(Color.init(hex:)), startPoint: .topLeading, endPoint: .bottomTrailing)
            .overlay(alignment: .topTrailing) {
                GeometryReader { geo in
                    let side = min(geo.size.width, geo.size.height) * 0.62
                    Image(systemName: symbol)
                        .resizable()
                        .scaledToFit()
                        .foregroundStyle(.white.opacity(0.22))
                        .frame(width: side, height: side)
                        .offset(x: geo.size.width - side * 0.9, y: geo.size.height * 0.08)
                }
            }
            .accessibilityHidden(true)
    }
}

struct CategoryChip: View {
    let symbol: String
    let text: String

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: symbol).font(.system(size: 11, weight: .bold))
            Text(text.uppercased()).textRole(.label)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 10).padding(.vertical, 5)
        .background(.black.opacity(0.22), in: Capsule())
        .lineLimit(1)
        .fixedSize()
    }
}

struct CardTitle: View {
    let text: String
    let large: Bool

    var body: some View {
        Text(text)
            .textRole(large ? .display : .cardTitle)
            .foregroundStyle(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
    }
}

/// "Yesterday" on the card, "Wednesday, January 14 · 7:02 AM" on the page. Spans its line.
struct DayText: View {
    let text: String

    var body: some View {
        Text(text)
            .textRole(.caption)
            .foregroundStyle(.white.opacity(0.85))
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct StatLabel: View {
    let text: String
    var body: some View {
        Text(text).textRole(.label).foregroundStyle(Palette.muted).lineLimit(1)
    }
}

struct StatValue: View {
    let stat: Card.Stat
    let large: Bool

    var body: some View {
        // Value and unit are one Text, so they fly as one piece and never drift apart.
        (Text(stat.value).font(large ? TextRole.bigNumber.font : TextRole.number.font)
            + Text(stat.unit.map { " " + $0 } ?? "").font(.system(.caption, weight: .medium)).foregroundStyle(Palette.muted))
            .foregroundStyle(Palette.ink)
            .lineLimit(1)
            .fixedSize()
    }
}

/// A card's or page's numbers, each label and value its own piece.
struct StatsRow: View {
    let card: Card
    let large: Bool

    var body: some View {
        HStack(alignment: .top, spacing: Space.m) {
            ForEach(Array(card.stats.prefix(3).enumerated()), id: \.offset) { index, stat in
                VStack(alignment: .leading, spacing: large ? 6 : 3) {
                    StatLabel(text: stat.label)
                        .flightPiece(CardPart.statLabel(index), id: card.id, end: large ? .page : .card)
                    StatValue(stat: stat, large: large)
                        .flightPiece(CardPart.statValue(index), id: card.id, end: large ? .page : .card)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    /// The look of one stat piece, from the same views.
    @ViewBuilder static func look(_ part: CardPart, card: Card, large: Bool) -> some View {
        switch part {
        case .statLabel(let i) where i < card.stats.count: StatLabel(text: card.stats[i].label)
        case .statValue(let i) where i < card.stats.count: StatValue(stat: card.stats[i], large: large)
        default: EmptyView()
        }
    }
}
