import XCTest

// SmokeTests: the app launches, a card opens into its page, and back works by button and by swipe.
//
// What: three short tests on seeded data (TestData/seed, pinned clock). One runs with motion off
// (instant pages, deterministic), one with the real card flight, one crosses the tabs.
//
// Wire in: run with `scripts/run-ui-tests.sh <udid> SmokeTests`. Grow it into one suite per area.
//
// Lessons it encodes (references/ui-testing.md §4):
// - "The list is gone" means unreachable, not absent: under a custom page layer the list still
//   exists for XCUITest. waitUnreachable checks reach (not hittable), which is what a thumb has.
// - The edge swipe is a quick flick from the very edge, released on arrival, like a thumb.

final class SmokeTests: AppUITestCase {
    func testCardOpensAndGoesBack() {
        launch()
        let card = el("card_c1")
        waitForHittable(card, timeout: 20)
        card.tap()
        waitForHittable(el("detail_back"))
        XCTAssertTrue(el("detail_screen").exists)
        waitUnreachable(card)

        el("detail_back").tap()
        waitForHittable(card)
        waitUnreachable(el("detail_back"))

        card.tap()
        waitForHittable(el("detail_back"))
        edgeSwipeBack()
        waitForHittable(card)
        waitUnreachable(el("detail_back"))
    }

    /// The same round trip with animations on: the real flight, its measuring and its landing.
    /// The page takes touches only once its pieces have landed (0.49 s), as a pushed page does once
    /// its push ends, so each back waits for the landing first.
    func testCardFlightRoundTrip() {
        launch(motion: true)
        let card = el("card_c2")
        waitForHittable(card, timeout: 20)
        card.tap()
        waitForHittable(el("detail_back"))
        waitUnreachable(card)
        idle(Self.landing)
        snap("detail_open")

        el("detail_back").tap()
        waitForHittable(card)
        waitUnreachable(el("detail_back"))

        card.tap()
        waitForHittable(el("detail_back"))
        idle(Self.landing)
        edgeSwipeBack()
        waitForHittable(card)
        waitUnreachable(el("detail_back"))
        snap("home_after_swipe")
    }

    func testTabsAndAbout() {
        launch()
        waitForHittable(el("home_title"), timeout: 20)
        app.buttons["tab_settings"].tap()
        waitForHittable(el("settings_title"))
        waitUnreachable(el("home_title"))
        el("about_row").tap()
        waitFor(el("about_screen"))
        app.navigationBars.buttons.firstMatch.tap()
        waitForHittable(el("settings_title"))
        app.buttons["tab_home"].tap()
        waitForHittable(el("card_c1"))
    }

    /// Past the open's clock (0.735 s with the after-pieces), with room for a slow simulator.
    static let landing: TimeInterval = 1.0

    /// A flick from the left edge, released as it arrives.
    private func edgeSwipeBack() {
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.005, dy: 0.5))
        start.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)),
                    withVelocity: .fast, thenHoldForDuration: 0)
    }
}
