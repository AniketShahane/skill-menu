import Foundation

// Card: the starter's one model, its seed file format and the day labels the card and page show.
//
// What: Card (what a Home card and its page show), CardDeck (the on-disk file, cards.json, and
// its decoding), HexColor (the gradient colours, parsed without UIKit), and DayLabel (the short
// label on a card and the long one on its page).
//
// Wire in: replace Card with your own model. Keep the file format plain and in the app's own form:
// the UI tests copy TestData/seed/ into the app's data directory (LaunchHooks.prepare), so the
// seed is exactly what the app would write.
//
// Lessons it encodes:
// - Every "today" comes in as a parameter (the app passes LaunchHooks.now and .calendar), never
//   Date(): the tests pin the clock and zone, so "Yesterday" is always yesterday.
// - Pure and Foundation-only, so it is tested on the Mac with no simulator.

public struct Card: Codable, Hashable, Sendable, Identifiable {
    public struct Stat: Codable, Hashable, Sendable {
        public var label: String
        public var value: String
        public var unit: String?

        public init(label: String, value: String, unit: String? = nil) {
            self.label = label
            self.value = value
            self.unit = unit
        }
    }

    public var id: String
    public var title: String
    public var category: String
    /// An SF Symbol name for the category chip and the hero.
    public var symbol: String
    public var date: Date
    /// Two "#RRGGBB" colours for the hero gradient, top-leading to bottom-trailing.
    public var colors: [String]
    public var stats: [Stat]
    public var notes: String
    public var highlights: [String]

    public init(id: String, title: String, category: String, symbol: String, date: Date, colors: [String],
                stats: [Stat], notes: String, highlights: [String]) {
        self.id = id
        self.title = title
        self.category = category
        self.symbol = symbol
        self.date = date
        self.colors = colors
        self.stats = stats
        self.notes = notes
        self.highlights = highlights
    }
}

/// The on-disk file: `cards.json` in the app's data directory.
public struct CardDeck: Codable, Sendable {
    public static let fileName = "cards.json"
    public var version: Int
    public var cards: [Card]

    public init(version: Int = 1, cards: [Card]) {
        self.version = version
        self.cards = cards
    }

    /// Newest first. Dates are ISO 8601 with their offset ("2026-01-14T07:02:00-05:00").
    public static func decode(_ data: Data) throws -> CardDeck {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        var deck = try decoder.decode(CardDeck.self, from: data)
        deck.cards.sort { $0.date > $1.date }
        return deck
    }

    public func encoded() throws -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(self)
    }
}

/// "#FF7A59" as red, green and blue in 0...1.
public struct HexColor: Equatable, Sendable {
    public var red: Double, green: Double, blue: Double

    public init?(_ text: String) {
        let hex = text.hasPrefix("#") ? String(text.dropFirst()) : text
        guard hex.count == 6, let value = UInt32(hex, radix: 16) else { return nil }
        red = Double((value >> 16) & 0xFF) / 255
        green = Double((value >> 8) & 0xFF) / 255
        blue = Double(value & 0xFF) / 255
    }
}

/// The date as a card says it ("Today", "Yesterday", "3 days ago", "Jan 2") and as its page does
/// ("Wednesday, January 14 · 7:02 AM"). Different words, so it flies as other text.
public enum DayLabel {
    public static func short(_ date: Date, now: Date, calendar: Calendar, locale: Locale = .current) -> String {
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: date), to: calendar.startOfDay(for: now)).day ?? 0
        switch days {
        case 0: return "Today"
        case 1: return "Yesterday"
        case 2...6: return "\(days) days ago"
        default:
            var style = Date.FormatStyle(date: .abbreviated, time: .omitted, locale: locale, calendar: calendar, timeZone: calendar.timeZone)
            style = style.year(.omitted)
            return date.formatted(style)
        }
    }

    public static func long(_ date: Date, calendar: Calendar, locale: Locale = .current) -> String {
        let day = date.formatted(Date.FormatStyle(date: .complete, time: .omitted, locale: locale, calendar: calendar,
                                                  timeZone: calendar.timeZone).year(.omitted))
        let time = date.formatted(Date.FormatStyle(date: .omitted, time: .shortened, locale: locale, calendar: calendar,
                                                   timeZone: calendar.timeZone))
        return "\(day) · \(time)"
    }
}
