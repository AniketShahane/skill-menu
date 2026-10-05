import SwiftUI

// Navigator: where the user is. The tab, the pages pushed above it, and the card flight's page.
//
// What: AppTab (the bottom bar's tabs, in order), Route (pages pushed on the NavigationStack), and
// Navigator: the kept tab pager's state, the stack's path, and the CardFlight whose layer shows a
// card's page. One back() pops whatever is on top.
//
// Wire in: RootView owns one (@State) and injects it with .environment(nav). Screens call
// nav.openCard / nav.back / nav.switchTab. Deep links (APP_OPEN, LaunchHooks.deepLink):
// "tab:settings" or "card:<id>".
//
// Lessons it encodes (references/architecture.md §4):
// - Own the navigation state; don't scatter it through views.
// - One NavigationStack at the root around the pager, not one per tab: a tab switch clears one
//   path, and the card layer above the stack also covers pushed pages.
// - A card's page is not a route: it lives in a layer above the stack (CardFlightPageLayer), so the
//   list stays in the window while the card's pieces fly into the page.

enum AppTab: String, CaseIterable, Hashable, Identifiable {
    case home, settings
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
    var icon: String {
        switch self {
        case .home: "square.stack.fill"
        case .settings: "gearshape.fill"
        }
    }
}

enum Route: Hashable {
    case about
}

@MainActor
@Observable
final class Navigator {
    let pager = TabPagerState(AppTab.home)
    var path: [Route] = []
    /// The card → page flight and the page layer's state.
    let cards = CardFlight<CardPart>()

    init() {
        cards.reducedMotion = { AppMotion.reduced }
    }

    func switchTab(_ tab: AppTab) {
        if !path.isEmpty { path.removeAll() }
        pager.select(tab)
    }

    /// Opens a card's page. From a card on a list page (`scope`) with its looks, the pieces fly.
    func openCard(_ id: String, from scope: AnyHashable?, looks: FlightLookFactory<CardPart>?) {
        cards.open(id, from: scope, cardLooks: looks)
    }

    /// Back from whatever is on top: the card's page, then a pushed page.
    func back() {
        if cards.isPresented { cards.back() } else if !path.isEmpty { path.removeLast() }
    }

    func push(_ route: Route) {
        guard path.last != route else { return }
        path.append(route)
    }

    /// "tab:<name>" or "card:<id>" (APP_OPEN), opened at once so a rendering test lands on it.
    func openDeepLink(_ link: String) {
        let parts = link.split(separator: ":", maxSplits: 1).map(String.init)
        guard parts.count == 2 else { return }
        switch parts[0] {
        case "tab": if let tab = AppTab(rawValue: parts[1]) { switchTab(tab) }
        case "card": cards.open(parts[1], instant: true)
        default: break
        }
    }
}
