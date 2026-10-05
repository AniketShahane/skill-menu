import Foundation
import Testing
@testable import MyAppCore

// The core's tests run on the Mac: `cd MyAppCore && swift test`. Seconds, no simulator.

@Test func decodesTheSeedFormatAndLabelsDays() throws {
    let json = """
    {"version": 1, "cards": [
      {"id": "a", "title": "Older", "category": "Trail", "symbol": "mountain.2.fill",
       "date": "2026-01-10T07:02:00-05:00", "colors": ["#FF7A59", "#FFB86B"],
       "stats": [{"label": "DISTANCE", "value": "12.4", "unit": "km"}], "notes": "", "highlights": []},
      {"id": "b", "title": "Newer", "category": "Road", "symbol": "figure.run",
       "date": "2026-01-14T07:02:00-05:00", "colors": ["#3A7BFF", "#7AD7FF"],
       "stats": [], "notes": "", "highlights": []}
    ]}
    """
    let deck = try CardDeck.decode(Data(json.utf8))
    #expect(deck.cards.map(\.id) == ["b", "a"])                 // newest first
    #expect(deck.cards[1].stats.first?.unit == "km")
    #expect(HexColor("#FF7A59") == HexColor("ff7a59"))
    #expect(HexColor("#FF7A5") == nil)

    // The pinned clock the UI tests use: 15 Jan 2026, 10:30 in New York.
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "America/New_York")!
    let now = try #require(ISO8601DateFormatter().date(from: "2026-01-15T10:30:00-05:00"))
    let us = Locale(identifier: "en_US")
    #expect(DayLabel.short(deck.cards[0].date, now: now, calendar: calendar, locale: us) == "Yesterday")
    #expect(DayLabel.short(deck.cards[1].date, now: now, calendar: calendar, locale: us) == "5 days ago")
    // Foundation puts a narrow no-break space before "AM".
    let long = DayLabel.long(deck.cards[0].date, calendar: calendar, locale: us).replacingOccurrences(of: "\u{202F}", with: " ")
    #expect(long == "Wednesday, January 14 · 7:02 AM")

    // What the app writes, it reads back.
    let again = try CardDeck.decode(deck.encoded())
    #expect(again.cards == deck.cards)
}
