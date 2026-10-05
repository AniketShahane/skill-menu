import SwiftUI

// KeptTabPager: tabs that slide side by side like pages of one strip, and stay alive when left.
//
// What: TabPagerState (which tab is shown, which is sliding in or out) and KeptTabPager (the
// view). A page is built the first time it is opened, or ahead of time while the app is idle,
// and then kept: its scroll position and state survive, and coming back costs nothing.
// Also here: .warmUp (build a heavy detail page once, unseen, so its first real open is quick),
// .zoomSourceOnShownPage (native zoom sources that ignore kept-but-hidden pages), and
// \.pageCovered / .hiddenWhenCovered() for VoiceOver.
//
// Wire in (needs MotionKit.swift):
//   enum AppTab: Int, CaseIterable, Hashable { case home, library, settings }  // bar order
//   @State private var pager = TabPagerState(AppTab.home)
//   KeptTabPager(state: pager, covered: overlayIsUp, background: .appPaper,
//                isBusy: { !nav.path.isEmpty || sheetIsUp }) { tab in
//       switch tab { case .home: HomeScreen() ... }
//   }
//   Your bar calls pager.select(tab) (clear any pushed pages first). Put the pager at the root
//   of a NavigationStack, not inside one per tab. Work that must stop when a tab is left
//   (timers, polling, sensors) watches \.tabPageShown; entrances use .onFirstShown / .reveal
//   from MotionKit. Pages UIKit hosts outside the pager (NavigationStack pushes) don't inherit
//   its accessibilityHidden: set \.pageCovered on them and add .hiddenWhenCovered().
//
// Lessons it encodes:
// - Build, then move. The arriving page is mounted off screen one frame before the slide starts,
//   so its costly first build happens while nothing moves and every frame of the slide is cheap.
//   A view inserted in the same update as an animated change skips the animation or spends the
//   animation's first frames being built.
// - Keep pages. Rebuilding a page on every switch spent each slide's first frames building it
//   and lost scroll and state. Other tabs are built after launch, one at a time, while idle.
// - Only the shown page and the ones sliding are visible, so a far jump slides past, not
//   through, the tabs between. Hidden pages are parked well off screen so they can never catch a
//   touch or a scroll meant for the shown one.
// - Kept pages are still in the tree: onAppear/onDisappear no longer mean shown/left. Use
//   \.tabPageShown. The nearest accessibilityHidden wins, so the pager states the whole rule on
//   each page, and a zoom source must exist only on the shown page (a page closing into a copy
//   on a hidden tab looked like a 60 ms cut).
// - Hiding doesn't reliably take a page out of XCUITest's tree. In one iOS 27 failure hierarchy,
//   two hidden pages kept only their root ScrollView, while a third kept every content id, all
//   parked off screen. UI tests tell which page is showing by reach (isHittable, the frame on
//   screen), never by whether an id exists.
// - Read observed state in the body itself. A read first made inside a GeometryReader or ForEach
//   closure is not tracked, and the view stops following the model.
// - The first open of any page type pays SwiftUI's one-time cost of meeting its views (type
//   metadata, conformances, chart types only it uses) on the frame after the tap. Building one
//   copy unseen while idle paid it early: first opens were about 30% quicker.

/// Which tab is shown, and which are sliding. Owned by the root view or the app's navigator.
@MainActor
@Observable
final class TabPagerState<Tab: Hashable & CaseIterable> {
    private(set) var tab: Tab
    /// The tab sliding in, mounted beside the screen for one frame so it is built before it moves.
    private(set) var arriving: Tab?
    /// The tab sliding out, until its slide ends.
    private(set) var leaving: Tab?
    /// +1 moving right along the bar, -1 left.
    private(set) var direction: Int = 0
    /// Pages built so far. They stay built.
    private(set) var mounted: Set<Tab>
    /// Every tab has been built ahead of time (see KeptTabPager.Prewarm).
    private(set) var prewarmed = false
    /// Bumped when the shown tab is selected again.
    private(set) var reselects: [Tab: Int] = [:]

    @ObservationIgnored var slideDuration: Double = AppMotion.tabSeconds
    /// Called as a slide starts, with its length: pause background work that would compete with
    /// it for the main thread (image renders, decoding, prefetch).
    @ObservationIgnored var onSlideStart: ((Double) -> Void)?

    init(_ tab: Tab) {
        self.tab = tab
        mounted = [tab]
    }

    var isSliding: Bool { arriving != nil || leaving != nil }

    func select(_ target: Tab) {
        if target == tab {
            reselects[target, default: 0] += 1
            return
        }
        direction = order(target) > order(tab) ? 1 : -1
        mounted.insert(target)
        if AppMotion.reduced {
            leaving = nil; arriving = nil; tab = target
            return
        }
        onSlideStart?(slideDuration)
        // Frame 1: mount the page off screen. Frame 2 on: slide both pages.
        arriving = target
        DispatchQueue.main.async { [self] in
            // A newer tap won the frame: it runs its own slide.
            guard arriving == target else { return }
            leaving = tab
            withAnimation(AppMotion.glide(slideDuration)) {
                tab = target
                arriving = nil
            } completion: { [self] in
                if tab == target { leaving = nil }
            }
        }
    }

    func reselectCount(_ tab: Tab) -> Int { reselects[tab, default: 0] }

    fileprivate func mount(_ tab: Tab) { mounted.insert(tab) }
    fileprivate func markPrewarmed() { prewarmed = true }

    private func order(_ tab: Tab) -> Int { Array(Tab.allCases).firstIndex(of: tab) ?? 0 }
}

struct KeptTabPager<Tab: Hashable & CaseIterable, Page: View>: View {
    /// Builds the other tabs after launch: first after `delay`, then one every `gap`, and only
    /// while nothing moves. Their entrances still wait for their first real showing.
    struct Prewarm {
        var delay: Duration = .seconds(1.6)
        var gap: Duration = .milliseconds(450)
    }

    let state: TabPagerState<Tab>
    /// Something is over the pages (a full-screen layer, a morph): all leave VoiceOver's reach.
    var covered: Bool
    /// Opaque, or a page shows its neighbour through it mid-slide.
    var background: Color
    /// Selecting the shown tab again rebuilds it (back to the top, fresh state). Turn off and
    /// watch state.reselectCount(tab) to scroll to top yourself instead.
    var rebuildOnReselect: Bool
    var prewarm: Prewarm?
    /// Something outside the pager is moving or open (a pushed page, a sheet): warm-up waits.
    var isBusy: () -> Bool
    let page: (Tab) -> Page

    init(state: TabPagerState<Tab>, covered: Bool = false, background: Color = Color(uiColor: .systemBackground),
         rebuildOnReselect: Bool = true, prewarm: Prewarm? = Prewarm(), isBusy: @escaping () -> Bool = { false },
         @ViewBuilder page: @escaping (Tab) -> Page) {
        self.state = state
        self.covered = covered
        self.background = background
        self.rebuildOnReselect = rebuildOnReselect
        self.prewarm = prewarm
        self.isBusy = isBusy
        self.page = page
    }

    var body: some View {
        // Observed state is read here, in the body, so the pager follows it (see header).
        let shown = state.tab
        let arriving = state.arriving
        let leaving = state.leaving
        let direction = CGFloat(state.direction)
        let mounted = state.mounted
        let reselects = state.reselects
        GeometryReader { geo in
            ZStack {
                ForEach(Array(Tab.allCases), id: \.self) { tab in
                    if mounted.contains(tab) {
                        let visible = tab == shown || tab == arriving || tab == leaving
                        let hidden = tab != shown || covered
                        page(tab)
                            .frame(width: geo.size.width, height: geo.size.height)
                            .background(background)
                            .id(rebuildOnReselect ? reselects[tab, default: 0] : 0)
                            .offset(x: offset(of: tab, shown: shown, arriving: arriving, leaving: leaving,
                                              direction: direction, width: geo.size.width))
                            // Parked pages are not drawn at all.
                            .opacity(visible ? 1 : 0)
                            .zIndex(tab == shown ? 2 : visible ? 1 : 0)
                            .allowsHitTesting(tab == shown)
                            // The nearest accessibilityHidden wins, so the whole rule is said here.
                            .accessibilityHidden(hidden)
                            .environment(\.pageCovered, hidden)
                            .environment(\.tabPageShown, tab == shown)
                    }
                }
            }
            .clipped()
        }
        .task { await prewarmTabs() }
    }

    private func offset(of tab: Tab, shown: Tab, arriving: Tab?, leaving: Tab?, direction: CGFloat, width: CGFloat) -> CGFloat {
        if tab == shown { return 0 }
        if tab == arriving { return direction * width }
        if tab == leaving { return -direction * width }
        // Parked well off screen: a kept page never catches a touch or a scroll.
        return 3 * width
    }

    private func prewarmTabs() async {
        guard let prewarm, !state.prewarmed else { return }
        // After the launch entrance has played: nothing competes with it.
        try? await Task.sleep(for: prewarm.delay)
        // The where clause is checked as the loop reaches each tab, so one the user opened
        // meanwhile is skipped.
        for tab in Tab.allCases where !state.mounted.contains(tab) {
            while state.isSliding || isBusy() {
                if Task.isCancelled { return }
                try? await Task.sleep(for: .milliseconds(300))
            }
            if Task.isCancelled { return }
            state.mount(tab)
            try? await Task.sleep(for: prewarm.gap)
        }
        state.markPrewarmed()
    }
}

// MARK: - Warm-up of pages that are not tabs

extension View {
    /// Builds `content` once, unseen, the first time `ready()` holds (polled every 300 ms), then
    /// takes it down. Use it for the heavy page most likely to be opened next (a detail page, a
    /// chart page), filled with real sample data. It pays SwiftUI's build and layout, not drawing.
    ///
    ///   .warmUp(when: { pager.prewarmed && nav.path.isEmpty }) { DetailScreen(item: sample) }
    ///
    /// The copy must be inert: a throwaway id, no network, no analytics, and not a transition
    /// source. Also queue expensive images the likeliest next page needs here, so none lands
    /// mid-transition (measured: a map render landing mid-flight cost a 33 ms frame).
    func warmUp<Warm: View>(when ready: @escaping () -> Bool, @ViewBuilder _ content: @escaping () -> Warm) -> some View {
        modifier(WarmUp(ready: ready, warm: content))
    }
}

private struct WarmUp<Warm: View>: ViewModifier {
    let ready: () -> Bool
    let warm: () -> Warm
    @State private var present = false
    @State private var done = false

    func body(content: Content) -> some View {
        content
            .background {
                if present {
                    warm()
                        .opacity(0)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                        .environment(\.tabPageShown, false)
                }
            }
            .task {
                guard !done else { return }
                while !ready() {
                    if Task.isCancelled { return }
                    try? await Task.sleep(for: .milliseconds(300))
                }
                done = true
                // While the copy is built no entrance counts as played, or the real page would
                // later open settled.
                RevealSession.shared.warming = true
                present = true
                try? await Task.sleep(for: .milliseconds(150))
                RevealSession.shared.warming = false
                try? await Task.sleep(for: .milliseconds(450))
                present = false
            }
    }
}

// MARK: - Zoom sources on kept pages

extension View {
    /// What a pushed page grows out of with `.navigationTransition(.zoom(sourceID:in:))`.
    /// The same item can have a card on several kept tabs; only the shown page's card answers to
    /// `id`. The id changes, not the view tree, so the card keeps its state.
    func zoomSourceOnShownPage<ID: Hashable>(_ id: ID, in namespace: Namespace.ID, cornerRadius: CGFloat = 0) -> some View {
        modifier(ShownPageZoomSource(id: id, namespace: namespace, cornerRadius: cornerRadius))
    }

    /// Out of VoiceOver's reach while \.pageCovered is true, said on the page itself. For pages
    /// the pager's own modifier cannot reach: pages UIKit hosts for a NavigationStack push, which
    /// don't inherit modifiers from outside the stack. Set \.pageCovered on those yourself.
    func hiddenWhenCovered() -> some View { modifier(HiddenWhenCovered()) }
}

private struct ShownPageZoomSource<ID: Hashable>: ViewModifier {
    struct Hidden: Hashable { let id: ID }
    let id: ID
    let namespace: Namespace.ID
    let cornerRadius: CGFloat
    @Environment(\.tabPageShown) private var shown

    func body(content: Content) -> some View {
        content.matchedTransitionSource(id: shown ? AnyHashable(id) : AnyHashable(Hidden(id: id)), in: namespace) {
            $0.clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        }
    }
}

private struct HiddenWhenCovered: ViewModifier {
    @Environment(\.pageCovered) private var covered
    func body(content: Content) -> some View { content.accessibilityHidden(covered) }
}

extension EnvironmentValues {
    /// This page is out of view: another tab is shown, or something covers the pager.
    @Entry var pageCovered: Bool = false
}
