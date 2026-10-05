import SwiftUI
import MyAppCore

// DetailScreen: a card's page, the other end of the flight.
//
// What: DetailHost (finds the card, owns what the page asks of the app) and DetailScreen (a hero
// with chip, title and full date under the status bar; a stats panel; then page-only content: notes,
// highlights and a footer that arrive after the pieces land). Every piece the card has is tagged
// with .flightPiece(..., end: .page); the page registers its looks from its body.
//
// Wire in: your detail page. It must not draw an opaque background of its own: .flightPaper is its
// background, fading in under the pieces. Tag the same parts as the card, give page-only things
// .flightAfterPieces(index:), and keep a Back button (also reachable by the edge swipe and escape).
//
// Lessons it encodes (references/shared-element-flights.md, motion-craft.md §2-§3):
// - Looks registered from body (an @ObservationIgnored property, so assigning there is safe),
//   so a flight never starts from stale data.
// - Build the first screen, then the rest: on the mount frame only what flies and is measured is
//   built; the rest waits a turn (restBuilt). The pause before the flight is split over two frames
//   where nothing moves.
// - One motion per navigation: the pieces are the entrance, so page-only content arrives on the
//   same clock (after-pieces), not with an entrance of its own.
// - Draw the page under the status bar and keep the Back button inside the safe area.

struct DetailHost: View {
    let id: AnyHashable
    @Environment(AppModel.self) private var app
    @Environment(Navigator.self) private var nav
    /// Held once shown, so an item deleted from under the page doesn't blank it mid-flight.
    @State private var held: Card?

    var body: some View {
        let card = app.card(id) ?? held
        Group {
            if let card {
                DetailScreen(card: card, now: app.now, onBack: { nav.back() })
                    .onAppear { held = card }
            } else {
                Button("Back") { nav.back() }
                    .accessibilityIdentifier("detail_back")
            }
        }
    }
}

struct DetailScreen: View {
    let card: Card
    let now: Date
    let onBack: () -> Void

    static let heroHeight: CGFloat = 360
    static let heroCorners = RectangleCornerRadii(bottomLeading: Radius.page, bottomTrailing: Radius.page)
    static let panelCorners = RectangleCornerRadii(topLeading: Radius.panel, bottomLeading: Radius.panel,
                                                   bottomTrailing: Radius.panel, topTrailing: Radius.panel)

    @Environment(\.cardFlightBox) private var flightBox
    @Environment(\.flightPageInLayer) private var inLayer
    /// The rest of the page is built on the turn after the first screen (see header).
    @State private var restBuilt = false

    var body: some View {
        GeometryReader { geo in
            let _ = registerLooks(topInset: geo.safeAreaInsets.top)
            // The ZStack keeps the safe area; only the scroll view reaches under the status bar.
            ZStack(alignment: .topLeading) {
                ScrollView {
                    VStack(alignment: .leading, spacing: Space.xl) {
                        hero
                            .frame(height: Self.heroHeight + geo.safeAreaInsets.top)
                            .clipShape(UnevenRoundedRectangle(cornerRadii: Self.heroCorners, style: .continuous))
                            .flightPiece(CardPart.hero, id: card.id, end: .page)
                        panel
                            .background(Palette.panel, in: UnevenRoundedRectangle(cornerRadii: Self.panelCorners, style: .continuous))
                            .flightPiece(CardPart.panel, id: card.id, end: .page)
                            .padding(.horizontal, Space.xl)
                        if restBuilt {
                            rest
                        }
                    }
                    .padding(.bottom, geo.safeAreaInsets.bottom + Space.xxl)
                }
                .scrollIndicators(.hidden)
                .ignoresSafeArea(edges: .top)
                .accessibilityIdentifier("detail_list")
                placedBackButton(topInset: 0)
            }
        }
        .flightPaper(Palette.paper)
        .onAppear { if !restBuilt { DispatchQueue.main.async { restBuilt = true } } }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("detail_screen")
    }

    private var day: String { DayLabel.long(card.date, calendar: LaunchHooks.calendar) }

    private var hero: some View {
        HeroSurface(colors: card.colors, symbol: card.symbol)
            .overlay(alignment: .bottomLeading) {
                VStack(alignment: .leading, spacing: Space.s) {
                    CategoryChip(symbol: card.symbol, text: card.category)
                        .flightPiece(CardPart.chip, id: card.id, end: .page)
                    CardTitle(text: card.title, large: true)
                        .accessibilityAddTraits(.isHeader)
                        .flightPiece(CardPart.title, id: card.id, end: .page)
                    DayText(text: day)
                        .flightPiece(CardPart.day, id: card.id, end: .page)
                }
                .padding(.horizontal, Space.xl)
                .padding(.bottom, Space.xl + 2)
            }
    }

    private var panel: some View {
        StatsRow(card: card, large: true)
            .padding(Space.xl)
    }

    /// Fixed at the top-left of the safe area, arriving after the pieces. The hero's look draws it
    /// too (see look(_:)): during a flight the hero flies above the page and covers this one.
    private func placedBackButton(topInset: CGFloat) -> some View {
        backButton
            .flightAfterPieces(index: 0, pops: true)
            .padding(.leading, Space.l)
            .padding(.top, topInset)
    }

    private var backButton: some View {
        Button(action: onBack) {
            Image(systemName: "chevron.left")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(.black.opacity(0.28), in: Circle())
        }
        .buttonStyle(.press)
        .accessibilityLabel("Back")
        .accessibilityIdentifier("detail_back")
    }

    /// Everything only the page has: it arrives after the pieces land, one beat apart.
    @ViewBuilder private var rest: some View {
        section("Notes") {
            Text(card.notes).textRole(.body).foregroundStyle(Palette.ink)
        }
        .flightAfterPieces(index: 1)
        section("Highlights") {
            VStack(alignment: .leading, spacing: Space.m) {
                ForEach(card.highlights, id: \.self) { line in
                    Label(line, systemImage: "sparkle")
                        .textRole(.body)
                        .foregroundStyle(Palette.ink)
                }
            }
        }
        .flightAfterPieces(index: 2)
        section("Details") {
            VStack(alignment: .leading, spacing: Space.s) {
                ForEach(card.stats, id: \.label) { stat in
                    HStack {
                        Text(stat.label.capitalized).foregroundStyle(Palette.muted)
                        Spacer()
                        Text([stat.value, stat.unit].compactMap { $0 }.joined(separator: " ")).monospacedDigit()
                    }
                    .textRole(.body)
                    .foregroundStyle(Palette.ink)
                }
            }
        }
        .flightAfterPieces(index: 3)
        Text("Saved on this phone")
            .textRole(.caption)
            .foregroundStyle(Palette.muted)
            .frame(maxWidth: .infinity)
            .flightAfterPieces(index: 4)
    }

    private func section<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Space.m) {
            Text(title).textRole(.headline).foregroundStyle(Palette.ink).accessibilityAddTraits(.isHeader)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Space.xl)
        .background(Palette.panel, in: RoundedRectangle(cornerRadius: Radius.panel, style: .continuous))
        .padding(.horizontal, Space.xl)
    }

    // MARK: Looks

    /// Hands the flight this page's looks, built from what the page shows now.
    private func registerLooks(topInset: CGFloat) {
        guard inLayer, let flight = flightBox as? CardFlight<CardPart> else { return }
        let page = self
        flight.registerPageLooks { part, _ in page.look(part, topInset: topInset) }
    }

    private func look(_ part: CardPart, topInset: CGFloat) -> FlightLook {
        switch part {
        // The hero at any size it flies through; its caption flies on its own. The back button
        // rides in it: the flying hero covers the page's own button, which would otherwise
        // appear all at once when the flight lands (measured: a one-frame pop at landing).
        case .hero: FlightLook(hero.overlay(alignment: .topLeading) { placedBackButton(topInset: topInset) },
                               corners: Self.heroCorners)
        case .panel: FlightLook(panel, ground: Palette.panel, corners: Self.panelCorners)
        case .chip: FlightLook(CategoryChip(symbol: card.symbol, text: card.category))
        case .title: FlightLook(CardTitle(text: card.title, large: true))
        case .day: FlightLook(DayText(text: day))
        case .statLabel, .statValue: FlightLook(StatsRow.look(part, card: card, large: true))
        }
    }
}
