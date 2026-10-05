import XCTest

// MotionJourneyTests: every animated moment of the starter, measured. Run by scripts/motion-check.sh.
//
// What: launch, the harness floor (a tap on inert text), a fling on Home, the card flight (first
// open, back by button, a warm open again, back by edge swipe), and the tab slides. Each name is a
// key in motion-budgets.json and motion-baseline.json.
//
// Wire in: add a moment for every new animation, and its budget. Renaming a moment drops its history.
//
// Lessons it encodes (references/measuring-motion.md "The rig", shared-element-flights.md "Verify"):
// - Nothing but the gesture and waiting inside a moment: tapMoment finds the element first and
//   checks the result after the clock stops.
// - Launch work (kept tabs built at 1.6 s, the detail warm-up) finishes unmeasured before the first
//   tap, so no moment pays for it.
// - Open twice: the first open of a session pays one-time costs a warm open doesn't.

final class MotionJourneyTests: MotionTestCase {
    @MainActor
    func testMotionJourney() {
        beginJourney()
        moment("launch", settle: 2.5) { launchMeasured() }
        waitFor(el("home_list"), timeout: 20)
        idle(2.5)
        tapMoment("harness_idle_tap", el("home_title"))

        moment("home_scroll", settle: flingSettle) { fling(.up) }
        fling(.down)
        idle(1.5)

        let card = el("card_c1")
        tapMoment("card_open", card, expect: el("detail_back"), gone: card)
        tapMoment("card_back", el("detail_back"), gone: el("detail_back"))
        waitForHittable(card)
        tapMoment("card_open_again", card, expect: el("detail_back"), gone: card)
        moment("card_swipe_back") { edgeSwipeBack() }
        waitForHittable(card)
        waitUnreachable(el("detail_back"))

        tapMoment("tab_settings", app.buttons["tab_settings"], expect: el("settings_title"))
        tapMoment("tab_home", app.buttons["tab_home"], expect: el("home_title"))
        endJourney()
    }
}
