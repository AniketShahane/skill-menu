import SwiftUI
import MyAppCore

// HomeScreen: the Home tab. A scrolling list of cards; tapping one flies it apart into its page.
//
// What: HomeScreen (reads the model and navigator, passes plain values down) and HomeCard (one card:
// a hero with its chip, title and day over a gradient, and a strip of three numbers). Every part
// that flies is tagged with .flightPiece(..., end: .card), and the card hands the flight its looks
// in the button action, just before asking to open.
//
// Wire in: a list page of your own: set \.flightScope on the tab page (RootView does), tag the card's
// pieces, and stage looks built from the same views (CardParts.swift) in the tap.
//
// Lessons it encodes:
// - Reads of the model and navigator stay in the host; the card takes plain data, so its looks
//   and a warm-up copy can be built from it anywhere.
// - A pressed card is scaled (PressStyle 0.975): the engine reads each piece's own size apart from
//   its frame on screen, so the look is laid out unscaled and drawn scaled.
// - Every element a test touches has an id; the list's scroll view has one too.
// - Entrances play once (.reveal): coming back to Home shows it settled.

struct HomeScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(Navigator.self) private var nav
    @Environment(\.flightScope) private var scope

    var body: some View {
        let cards = app.cards
        let now = app.now
        let scope = scope
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Space.l) {
                VStack(alignment: .leading, spacing: Space.xs) {
                    Text("Home")
                        .textRole(.display)
                        .foregroundStyle(Palette.ink)
                        .accessibilityAddTraits(.isHeader)
                        .accessibilityIdentifier("home_title")
                    Text(cards.isEmpty ? "Nothing here yet" : "\(cards.count) cards")
                        .textRole(.caption)
                        .foregroundStyle(Palette.muted)
                }
                .padding(.top, Space.s)
                .padding(.bottom, Space.xs)
                ForEach(Array(cards.enumerated()), id: \.element.id) { index, card in
                    HomeCard(card: card, index: index, day: DayLabel.short(card.date, now: now, calendar: LaunchHooks.calendar)) { looks in
                        nav.openCard(card.id, from: scope, looks: looks)
                    }
                }
            }
            .padding(.horizontal, Space.xl)
            // Room to scroll the last card clear of the floating bar.
            .padding(.bottom, 120)
        }
        .scrollIndicators(.hidden)
        .accessibilityIdentifier("home_list")
    }
}

struct HomeCard: View {
    let card: Card
    let index: Int
    let day: String
    let onOpen: (@escaping FlightLookFactory<CardPart>) -> Void

    static let heroHeight: CGFloat = 164

    var body: some View {
        Button {
            onOpen(looks)
        } label: {
            VStack(spacing: 0) {
                hero
                    .frame(height: Self.heroHeight)
                    .clipShape(UnevenRoundedRectangle(cornerRadii: Self.heroCorners, style: .continuous))
                    .flightPiece(CardPart.hero, id: card.id, end: .card)
                strip
                    .background(Palette.panel, in: UnevenRoundedRectangle(cornerRadii: Self.stripCorners, style: .continuous))
                    .flightPiece(CardPart.panel, id: card.id, end: .card)
            }
            .contentShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        }
        .buttonStyle(.press(0.975))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(card.title), \(day)")
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("card_\(card.id)")
        .reveal("home#\(card.id)", index: index)
    }

    static let heroCorners = RectangleCornerRadii(topLeading: Radius.card, topTrailing: Radius.card)
    static let stripCorners = RectangleCornerRadii(bottomLeading: Radius.card, bottomTrailing: Radius.card)

    /// The hero with its caption. In a look, the chip, title and day are left out (they fly on
    /// their own) but keep their room.
    private var hero: some View {
        HeroSurface(colors: card.colors, symbol: card.symbol)
            .overlay(alignment: .topLeading) {
                CategoryChip(symbol: card.symbol, text: card.category)
                    .flightPiece(CardPart.chip, id: card.id, end: .card)
                    .padding(Space.m)
            }
            .overlay(alignment: .bottomLeading) {
                VStack(alignment: .leading, spacing: 2) {
                    CardTitle(text: card.title, large: false)
                        .flightPiece(CardPart.title, id: card.id, end: .card)
                    DayText(text: day)
                        .flightPiece(CardPart.day, id: card.id, end: .card)
                }
                .padding(.horizontal, Space.l)
                .padding(.bottom, Space.m)
            }
    }

    private var strip: some View {
        HStack(spacing: Space.s) {
            StatsRow(card: card, large: false)
            Image(systemName: "chevron.right")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Palette.muted)
        }
        .padding(.horizontal, Space.l)
        .padding(.vertical, 14)
    }

    /// How each piece of this card is drawn in flight, from the same views as the card.
    private var looks: FlightLookFactory<CardPart> {
        let card = card, day = day
        let hero = hero, strip = strip
        return { part, _ in
            switch part {
            case .hero: FlightLook(hero, corners: Self.heroCorners)
            case .panel: FlightLook(strip, ground: Palette.panel, corners: Self.stripCorners)
            case .chip: FlightLook(CategoryChip(symbol: card.symbol, text: card.category))
            case .title: FlightLook(CardTitle(text: card.title, large: false))
            case .day: FlightLook(DayText(text: day))
            case .statLabel, .statValue: FlightLook(StatsRow.look(part, card: card, large: false))
            }
        }
    }
}
