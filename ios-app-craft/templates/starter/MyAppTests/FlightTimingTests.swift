import XCTest
@testable import MyApp

// The card flight's timing table is pure: test it against your spec without a view. These check
// the rules that keep the first and last frames identical to the list and the page.

final class FlightTimingTests: XCTestCase {
    let timing = FlightTiming()

    func testTheFlightStartsOnTheCardAndLandsOnThePage() {
        XCTAssertEqual(timing.flight(0), 0)
        XCTAssertEqual(timing.flight(timing.pieces), 1)
        // t = 0 is the list's picture: card ends drawn, page ends and paper not.
        XCTAssertEqual(timing.alpha(.text, .card, opening: true, t: 0), 1)
        XCTAssertEqual(timing.alpha(.text, .page, opening: true, t: 0), 0)
        XCTAssertEqual(timing.alpha(.surface, .card, opening: true, t: 0), 1)
        XCTAssertEqual(timing.paper(0, opening: true), 0)
        // Landing is the page's picture: page ends solid, card ends gone.
        XCTAssertEqual(timing.alpha(.text, .page, opening: true, t: timing.landing), 1)
        XCTAssertEqual(timing.alpha(.text, .card, opening: true, t: timing.landing), 0)
        XCTAssertEqual(timing.alpha(.surface, .card, opening: true, t: timing.landing), 0)
        XCTAssertEqual(timing.paper(timing.landing, opening: true), 1)
    }

    func testACardSurfaceNeverHalfFades() {
        for t in stride(from: 0.0, through: timing.pieces, by: 0.01) {
            let a = timing.alpha(.surface, .card, opening: true, t: t)
            XCTAssertTrue(a == 0 || a == 1, "card surface at \(t) is \(a)")
        }
    }

    func testAfterPiecesLeaveFromWhereTheyGot() {
        // A close that began before this piece had started leaves it at zero.
        let delay = timing.arrivalDelay(index: 3, pops: false)
        XCTAssertEqual(timing.afterPiece(0, opening: false, delay: delay, closeFrom: 0.1), 0)
        XCTAssertEqual(timing.afterPiece(0, opening: false, delay: delay, closeFrom: timing.openTail), 1)
    }

    func testTheBezierMatchesItsEndsAndRises() {
        let curve = timing.flightCurve
        var last = -1.0
        for x in stride(from: 0.0, through: 1.0, by: 0.05) {
            let y = curve(x)
            XCTAssertGreaterThanOrEqual(y, last)
            last = y
        }
        // Front-loaded: 93% of the way at half time, 13% after the first 60 Hz frame.
        XCTAssertEqual(curve(0.5), 0.934, accuracy: 0.005)
        XCTAssertEqual(timing.flight(1 / 60), 0.133, accuracy: 0.005)
    }
}
