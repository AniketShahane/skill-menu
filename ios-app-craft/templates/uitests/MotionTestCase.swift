import QuartzCore
import XCTest

// MotionTestCase: the UI-test half of the motion guardrail.
//
// What: one test walks every animated moment of the app with animations on. It writes one line
// per moment to <motion dir>/marks.log: `name beginMedia endMedia beginWall endWall actedMedia`.
// Media seconds are CACurrentMediaTime, the clock the app's FrameProbe logs in. Wall seconds line a
// moment up with the screen recording. scripts/motion_report.py cuts the frame log and the video
// to these marks.
//
// Wire in: add to the UI test target next to AppUITestCase.swift, which it inherits: the same
// launch (reset, seed, pinned clock and zone, appearance), el, waitFor, waitUnreachable and
// reveal. Subclass it with one test (see the example at the end): beginJourney(), then
// launchMeasured(...) inside a "launch" moment, then the walk, then endJourney(). Keep
// frameLogKey equal to FrameProbe.envKey. scripts/motion-check.sh passes the log folder as
// TEST_RUNNER_APP_MOTION_DIR; xcodebuild strips the TEST_RUNNER_ prefix before the runner sees it.
// Run from Xcode, the folder falls back to <folder above this file's folder>/build/motion. If the
// project has its own base class, inherit from that and route launchMeasured through its launch.
//
// Lessons it encodes:
// - A measured window holds nothing but the gesture and waiting. Every XCUITest query (exists,
//   frame, waitForExistence, element.tap) makes the app snapshot its accessibility tree on the main
//   thread, and that shows up as the app's own dropped frames. So tapMoment finds the element
//   before the clock starts, taps its coordinate, and checks the result after the clock stops.
// - A back swipe is a flick released at speed, the way a thumb does it. A drag held at the far edge
//   measures a different, slower animation.
// - Every moment gets the same settle time, equal to the settle_ms budget (1.4 s). A fling gets a
//   longer window and an equal budget (3.0 s, 3000). A budget longer than its window can never
//   fail, so keep the two in step. Anything still moving when the window closes counts, and the
//   report warns, instead of being missed.
// - Measure the harness: a tap on inert text (harness_idle_tap) is the floor under every response
//   number.
// - Pin everything the pixels depend on (seed data, clock, time zone, appearance, locale) so every
//   run draws the same screens. Launch with animations on: never pass the app's no-motion flag.
// - Moment names are budget and baseline keys: renaming one drops its history.
class MotionTestCase: AppUITestCase {
    // MARK: Wiring

    /// The app's frame-log variable. Must equal FrameProbe.envKey.
    class var frameLogKey: String { "APP_FRAME_LOG" }
    /// The variable motion-check.sh sets (as TEST_RUNNER_<name>) to the folder it collects logs from.
    class var motionDirKey: String { "APP_MOTION_DIR" }
    /// Where marks.log and frames.log go. The simulator writes straight to this Mac path.
    class var motionDirectory: String {
        if let dir = ProcessInfo.processInfo.environment[motionDirKey], !dir.isEmpty { return dir }
        return URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("build/motion").path
    }

    /// How long each moment is given to finish after its gesture. Keep it equal to the settle_ms
    /// budget (1400 by default). Flings get `flingSettle` via moment(_:settle:), and a 3000 budget.
    var settle: TimeInterval { 1.4 }
    var flingSettle: TimeInterval { 3.0 }

    private var marks: FileHandle?
    private var names: Set<String> = []

    // MARK: Journey

    /// Starts marks.log afresh. Call first in the journey test.
    @MainActor
    func beginJourney() {
        continueAfterFailure = false
        let dir = Self.motionDirectory
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        let path = "\(dir)/marks.log"
        FileManager.default.createFile(atPath: path, contents: nil)
        marks = FileHandle(forWritingAtPath: path)
        names = []
        XCTAssertNotNil(marks, "Cannot write \(path)")
    }

    /// Ends the journey. It waits a second first, because the app writes its frames every half second
    /// and would otherwise lose the last moment's final frames when the test ends and kills it.
    @MainActor
    func endJourney() {
        idle(1.0)
        try? marks?.close()
        marks = nil
    }

    /// The frame-log variable, for a project whose own launch helper builds the environment.
    var frameLogEnvironment: [String: String] { [Self.frameLogKey: "\(Self.motionDirectory)/frames.log"] }

    /// Launches the app with the frame log on and animations on, through AppUITestCase.launch (reset,
    /// seed, pinned clock and zone, appearance). Put it inside the "launch" moment.
    @MainActor
    @discardableResult
    func launchMeasured(reset: Bool = true, seeded: Bool = true, appearance: Appearance = .light, open: String? = nil,
                        env extra: [String: String] = [:], arguments: [String] = []) -> XCUIApplication {
        launch(reset: reset, seeded: seeded, appearance: appearance, motion: true, open: open,
               env: extra.merging(frameLogEnvironment) { _, probe in probe }, arguments: arguments)
    }

    // MARK: Moments

    /// Runs `action`, waits `settle` seconds without touching the app, and writes the moment's line.
    @MainActor
    func moment(_ name: String, settle: TimeInterval? = nil, file: StaticString = #filePath, line: UInt = #line,
                _ action: () -> Void) {
        guard let marks else { return XCTFail("Call beginJourney() before the first moment", file: file, line: line) }
        guard !name.isEmpty, !name.contains(where: \.isWhitespace) else {
            return XCTFail("A moment name is one word: '\(name)'", file: file, line: line)
        }
        guard names.insert(name).inserted else {
            return XCTFail("Moment '\(name)' is already in this journey; names are budget keys", file: file, line: line)
        }
        let begin = CACurrentMediaTime(), beginWall = Date().timeIntervalSince1970
        action()
        let acted = CACurrentMediaTime()
        idle(settle ?? self.settle)
        let end = CACurrentMediaTime(), endWall = Date().timeIntervalSince1970
        let text = name + String(format: " %.6f %.6f %.6f %.6f %.6f\n", begin, end, beginWall, endWall, acted)
        try? marks.write(contentsOf: Data(text.utf8))
    }

    /// A tap as a moment. The element is found before the clock starts. After the clock stops, the
    /// test checks that `expect` arrived and/or `gone` can no longer be reached (a covered page
    /// still exists for XCUITest). Neither check adds work to the frames being measured.
    @MainActor
    func tapMoment(_ name: String, _ element: XCUIElement, expect: XCUIElement? = nil, gone: XCUIElement? = nil,
                   settle: TimeInterval? = nil, file: StaticString = #filePath, line: UInt = #line) {
        waitFor(element, file: file, line: line)
        let frame = element.frame
        let point = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: frame.midX, dy: frame.midY))
        moment(name, settle: settle, file: file, line: line) { point.tap() }
        if let expect { waitFor(expect, file: file, line: line) }
        if let gone { waitUnreachable(gone, file: file, line: line) }
    }

    // MARK: Gestures

    enum Direction { case up, down, left, right }

    /// A fast finger fling through the middle of the screen, or of `element`. Content moves the
    /// other way: `.up` scrolls a list down.
    @MainActor
    func fling(_ direction: Direction = .up, in element: XCUIElement? = nil, fast: Bool = true) {
        let target: XCUIElement = element ?? app
        let velocity: XCUIGestureVelocity = fast ? .fast : .default
        switch direction {
        case .up: target.swipeUp(velocity: velocity)
        case .down: target.swipeDown(velocity: velocity)
        case .left: target.swipeLeft(velocity: velocity)
        case .right: target.swipeRight(velocity: velocity)
        }
    }

    /// The system back gesture from the left edge, as a quick flick: released as it arrives, not
    /// held at the far side.
    @MainActor
    func edgeSwipeBack() {
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.005, dy: 0.5))
        start.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)),
                    withVelocity: .fast, thenHoldForDuration: 0)
    }

    /// Brings an element into view between moments, unmeasured, and lets the scroll settle so
    /// the next moment starts from stillness. Never call it inside a moment.
    @MainActor
    func revealUnmeasured(_ element: XCUIElement) {
        reveal(element)
        idle(1.2)
    }
}

// An example journey. The identifiers are placeholders: use your app's accessibility identifiers,
// and keep the moment names in step with motion-budgets.json.
//
// final class MotionJourneyTests: MotionTestCase {
//     @MainActor
//     func testMotionJourney() {
//         beginJourney()
//         moment("launch", settle: 2.5) { launchMeasured() }        // seed, pinned clock: AppUITestCase
//         waitFor(el("home_screen"), timeout: 20)
//         idle(2.5)                                                   // launch warm-ups finish unmeasured
//         tapMoment("harness_idle_tap", el("home_title"))             // nothing moves: the harness's own cost
//
//         moment("home_scroll", settle: flingSettle) { fling(.up) }
//         fling(.down); idle(1.2)                                     // unmeasured: back to the top
//
//         tapMoment("detail_open", el("item_card_0"), expect: el("detail_screen"))
//         moment("detail_scroll", settle: flingSettle) { fling(.up) }
//         moment("detail_swipe_back") { edgeSwipeBack() }
//         waitFor(el("home_screen"))
//
//         tapMoment("tab_second", app.buttons["tab_second"], expect: el("second_screen"))
//         revealUnmeasured(el("edit_button"))
//         tapMoment("sheet_open", el("edit_button"), expect: el("editor_sheet"))
//         tapMoment("sheet_close", el("editor_cancel"), gone: el("editor_sheet"))
//         tapMoment("tab_home_again", app.buttons["tab_home"], expect: el("home_screen"))  // a kept page returns unbuilt
//         endJourney()
//     }
// }
