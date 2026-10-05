import SwiftUI
import MyAppCore

// RootView: the app's layers, bottom to top, as explicit ZStack siblings.
//
// What:
//   1. NavigationStack { KeptTabPager }   the tabs, kept alive; pushed pages (About) above them
//   2. CardFlightLayer(under: true)       card ends with no page end to meet, under the page
//   3. CardFlightPageLayer                a card's page, above the tabs and any pushed page
//   4. CardFlightLayer                    the pieces in the air, above both pages
//   5. BottomBar                          above the pieces (they pass under its glass)
// plus the deep link (APP_OPEN) and a warm-up copy of the detail page, built unseen after launch.
//
// Wire in: add a tab to AppTab and a case to page(_:). Another layer (a + button growing into a
// page, GrowMorph) goes above the bar. A full-screen mode goes beside this ZStack, which fades.
//
// Lessons it encodes (references/architecture.md §4, motion-craft.md §4, §10):
// - Read observed state at the top of body; closures below only use the locals.
// - The list under a page is hidden from VoiceOver and touches while covered, said on the stack and
//   on each kept page (the nearest accessibilityHidden wins). Pushed pages get \.pageCovered.
// - The bar is tappable only once the page is gone, though it returns half way through a close.
// - The first open of a page type pays SwiftUI's one-time cost of meeting its views. Building one
//   copy unseen while idle pays it early; the copy is inert (not in the layer, no scope).

struct RootView: View {
    @Environment(AppModel.self) private var app
    @State private var nav = Navigator()

    var body: some View {
        @Bindable var nav = nav
        let cards = nav.cards
        let covered = cards.coversList
        let pushed = !nav.path.isEmpty
        let barAway = cards.barAway || pushed
        let sample = app.cards.first
        ZStack {
            NavigationStack(path: $nav.path) {
                KeptTabPager(state: nav.pager, covered: covered, background: Palette.paper,
                             isBusy: { nav.cards.isPresented || !nav.path.isEmpty }) { tab in
                    page(tab)
                        .environment(\.flightScope, AnyHashable(tab))
                }
                // Pages scroll under the bar to the screen's bottom edge; a ScrollView still
                // insets its content. Paper behind the status bar, not the stack's white.
                .ignoresSafeArea(.container, edges: .bottom)
                .background(Palette.paper)
                .toolbar(.hidden, for: .navigationBar)
                .navigationDestination(for: Route.self) { route in
                    destination(route)
                        .environment(\.pageCovered, covered)
                }
            }
            .accessibilityHidden(covered)
            .allowsHitTesting(!cards.isPresented)

            CardFlightLayer(flight: cards, under: true)
            CardFlightPageLayer(flight: cards) { id in
                DetailHost(id: id)
            }
            CardFlightLayer(flight: cards)

            BottomBar(current: nav.pager.tab, onTab: { nav.switchTab($0) })
                .flightBarAway(cards, alsoAway: pushed)
                .frame(maxHeight: .infinity, alignment: .bottom)
                .accessibilityHidden(barAway)
                .allowsHitTesting(!barAway && !cards.isPresented)
        }
        .background(Palette.paper)
        .warmUp(when: { nav.pager.prewarmed && !nav.cards.isPresented && nav.path.isEmpty }) {
            if let sample {
                DetailScreen(card: sample, now: app.now, onBack: {})
            }
        }
        .cardFlight(cards)
        .environment(nav)
        .preferredColorScheme(app.colorScheme)
        .task {
            if let link = LaunchHooks.deepLink { nav.openDeepLink(link) }
        }
    }

    @ViewBuilder private func page(_ tab: AppTab) -> some View {
        switch tab {
        case .home: HomeScreen()
        case .settings: SettingsScreen()
        }
    }

    @ViewBuilder private func destination(_ route: Route) -> some View {
        switch route {
        case .about: AboutScreen()
        }
    }
}
