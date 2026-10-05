import XCTest

// AppUITestCase: the base class every XCUITest suite inherits.
//
// What: launch from a known state (clean install, seeded data, pinned clock, fixed appearance,
// motion off unless asked, extra environment), screenshots written to a folder on the Mac, and
// the waits and scrolls every suite needs: el(id), idle, waitUntil, waitFor, waitForHittable,
// waitUnreachable (reach, not existence), waitForAbsence, waitForValue, waitStill,
// relaunchKeepingData, and reveal/tapRevealed (scroll until an element sits clear of the top
// band and a floating bar).
//
// Wire in: put this file in the UI test target's folder (MyAppUITests/). Paths below are
// relative to the folder above it. Set `clock` to the day your seed data was made for, and the
// clearances to your header and floating bar. The app must honour the same names: see
// LaunchHooks.swift (APP_ env names, -appReset / -appNoMotion). Run suites with
// scripts/run-ui-tests.sh, which grants permissions a test process cannot.
//
// Lessons it encodes:
// - Every test starts from a clean install with seeded files and a pinned clock, so assertions
//   can name exact numbers and days ("2 runs this week") and screenshots are comparable.
// - Motion is off by default (deterministic screenshots, no waiting on entrances). Tests that
//   are about motion pass motion: true.
// - Give every element a test touches a stable accessibilityIdentifier, snake_case with the
//   item's id ("row_<id>"), and put one on each scroll container so tests scroll the right one.
//   Expose state as accessibilityValue ("done", "missed"): VoiceOver reads it, tests assert it.
//   An identifier on a plain stack is handed down to its children and replaces theirs: make the
//   stack a container (.accessibilityElement(children: .contain)) before naming it.
// - Scroll by a slow press-and-drag of the distance needed, not swipes: a swipe flings and
//   overshoots. Reveal an element clear of a floating bar before tapping it, as a thumb would:
//   XCUITest taps a point, and the bar over it takes the tap.
// - Check reach, not existence. XCUITest reads automation elements, which include views hidden
//   from VoiceOver and pages under a custom overlay. "The list left" means waitUnreachable (or
//   isHittable == false), not exists == false.
// - The simulator's test runner can write to the Mac's disk, so screenshots land in build/
//   for review without digging through the result bundle.

/// A wall-clock moment in a named zone, handed to the app as APP_NOW_MILLIS / APP_TODAY / APP_TZ.
struct PinnedClock {
    let nowMillis: Int64
    let today: String
    let timeZone: String

    /// `local` is the wall time in `timeZone`, "yyyy-MM-dd'T'HH:mm:ss".
    init(_ local: String, timeZone: String) {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: timeZone)
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        guard let date = formatter.date(from: local) else {
            preconditionFailure("PinnedClock: \(local) is not yyyy-MM-ddTHH:mm:ss in \(timeZone)")
        }
        nowMillis = Int64((date.timeIntervalSince1970 * 1000).rounded())
        today = String(local.prefix(10))
        self.timeZone = timeZone
    }
}

/// Main actor: XCUIApplication and XCUIElement are main-actor types (Swift 6 language mode).
@MainActor
class AppUITestCase: XCTestCase {
    // MARK: The contract with the app. Override in a subclass, or edit here once per app.

    class var envPrefix: String { "APP_" }
    class var argPrefix: String { "-app" }
    /// The day the seed data was made for. nil leaves the app on the real clock.
    class var clock: PinnedClock? { PinnedClock("2026-01-15T10:30:00", timeZone: "America/New_York") }
    /// Space kept clear at the bottom (a floating tab bar, the home indicator) and under the top
    /// of a scroll container (a pinned header) when revealing elements.
    class var bottomClearance: CGFloat { 110 }
    class var topClearance: CGFloat { 70 }

    /// The folder above this file's folder: the project root.
    static let projectRoot: URL = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
    class var seedDirectory: URL { projectRoot.appendingPathComponent("TestData/seed") }
    class var screenshotDirectory: URL { projectRoot.appendingPathComponent("build/ui-shots") }

    var app: XCUIApplication!

    override func setUpWithError() throws {
        try super.setUpWithError()
        // A UI test that has gone wrong only gets further from the screen it expects.
        continueAfterFailure = false
    }

    enum Appearance: String { case light = "LIGHT", dark = "DARK" }

    /// Launches the app. `reset: false` relaunches over the last test's data (persistence
    /// tests); `seeded: false` is a first-run install. `env` keys are passed as given.
    @discardableResult
    func launch(reset: Bool = true, seeded: Bool = true, appearance: Appearance = .light, motion: Bool = false,
                open: String? = nil, env extra: [String: String] = [:], arguments: [String] = []) -> XCUIApplication {
        let type = type(of: self)
        let app = XCUIApplication()
        if reset { app.launchArguments.append(type.argPrefix + "Reset") }
        if !motion { app.launchArguments.append(type.argPrefix + "NoMotion") }
        app.launchArguments += arguments
        let p = type.envPrefix
        var env: [String: String] = [p + "APPEARANCE": appearance.rawValue]
        if let clock = type.clock {
            env[p + "TODAY"] = clock.today
            env[p + "NOW_MILLIS"] = String(clock.nowMillis)
            env[p + "TZ"] = clock.timeZone
            // The process zone too: TimeZone.current and default date formatting (Text(date, style:))
            // do not go through LaunchHooks.
            env["TZ"] = clock.timeZone
        }
        if seeded { env[p + "SEED_DIR"] = type.seedDirectory.path }
        if let open { env[p + "OPEN"] = open }
        env.merge(extra) { _, new in new }
        app.launchEnvironment = env
        app.launch()
        self.app = app
        return app
    }

    // MARK: Finding and waiting
    //
    // Every wait checks once straight away. On Xcode 27, waitForExistence and XCTWaiter make
    // their first check about a second after they start (1.04 s mean over 606 waits in Dash), so
    // a wait for something already there still cost a second without the fast path.

    /// Any element with this accessibility identifier.
    func el(_ id: String) -> XCUIElement { app.descendants(matching: .any)[id].firstMatch }

    /// Waits without asking the app anything.
    func idle(_ seconds: TimeInterval) { RunLoop.current.run(until: Date().addingTimeInterval(seconds)) }

    /// Polls `ok` every 0.15 s. `what` is built on failure, so it can include the current state.
    func waitUntil(_ what: @autoclosure () -> String, timeout: TimeInterval = 10,
                   file: StaticString = #filePath, line: UInt = #line, _ ok: () -> Bool) {
        let end = Date().addingTimeInterval(timeout)
        repeat {
            if ok() { return }
            idle(0.15)
        } while Date() < end
        XCTFail("Timed out: \(what())", file: file, line: line)
    }

    func waitFor(_ element: XCUIElement, timeout: TimeInterval = 10, file: StaticString = #filePath, line: UInt = #line) {
        if element.exists { return }
        XCTAssertTrue(element.waitForExistence(timeout: timeout), "Missing \(element)", file: file, line: line)
    }

    /// Waits until a thumb could press it: on screen, not covered, not hidden.
    func waitForHittable(_ element: XCUIElement, timeout: TimeInterval = 10, file: StaticString = #filePath, line: UInt = #line) {
        waitUntil("\(element) never became hittable", timeout: timeout, file: file, line: line) {
            element.exists && element.isHittable
        }
    }

    /// Waits until a person can no longer reach it: gone, or covered, or hidden. Use this, not
    /// waitForAbsence, for "the page left": XCUITest still sees views hidden from VoiceOver and
    /// the list under a custom overlay page, so they keep `exists == true` while no finger can
    /// reach them.
    func waitUnreachable(_ element: XCUIElement, timeout: TimeInterval = 5, file: StaticString = #filePath, line: UInt = #line) {
        waitUntil("Still reachable: \(element)", timeout: timeout, file: file, line: line) {
            !element.exists || !element.isHittable
        }
    }

    /// Waits until the element is out of the tree. Right for things that are removed (a deleted
    /// row, a dismissed alert); for pages that are only covered, use waitUnreachable.
    func waitForAbsence(_ element: XCUIElement, timeout: TimeInterval = 5, file: StaticString = #filePath, line: UInt = #line) {
        if !element.exists { return }
        let gone = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: element)
        XCTAssertEqual(XCTWaiter().wait(for: [gone], timeout: timeout), .completed, "Still there: \(element)", file: file, line: line)
    }

    /// Waits until the element's accessibilityValue reads `value`.
    func waitForValue(_ element: XCUIElement, _ value: String, timeout: TimeInterval = 5,
                      file: StaticString = #filePath, line: UInt = #line) {
        if element.exists, element.value as? String == value { return }
        let reads = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", value), object: element)
        let ok = XCTWaiter().wait(for: [reads], timeout: timeout) == .completed
        XCTAssertTrue(ok, "\(element) should read \(value), reads \(String(describing: element.value))", file: file, line: line)
    }

    /// Waits until the element stops moving: sheets and detents spring into place, and a tap on
    /// a moving control can miss.
    func waitStill(_ element: XCUIElement, timeout: TimeInterval = 3) {
        var last = CGRect.null
        let end = Date().addingTimeInterval(timeout)
        while Date() < end {
            let frame = element.frame
            if frame == last { return }
            last = frame
            idle(0.15)
        }
    }

    /// Relaunches over the data the last launch left (persistence tests): same arguments minus
    /// the reset, same environment minus the seed and the deep link.
    @discardableResult
    func relaunchKeepingData(drop: Set<String>? = nil) -> XCUIApplication {
        let type = type(of: self)
        let dropped = drop ?? [type.envPrefix + "SEED_DIR", type.envPrefix + "OPEN"]
        let old: XCUIApplication = app
        old.terminate()
        let new = XCUIApplication()
        new.launchArguments = old.launchArguments.filter { $0 != type.argPrefix + "Reset" }
        new.launchEnvironment = old.launchEnvironment.filter { !dropped.contains($0.key) }
        new.launch()
        app = new
        return new
    }

    // MARK: Scrolling

    /// Scrolls `scroll` (default: the first scroll view) until `element` sits on screen, clear
    /// of the top band and the floating bar. `up` searches upwards for an element not yet built.
    @discardableResult
    func reveal(_ element: XCUIElement, in scroll: XCUIElement? = nil, up: Bool = false, attempts: Int = 14,
                file: StaticString = #filePath, line: UInt = #line) -> XCUIElement {
        let scroller = scroll ?? app.scrollViews.firstMatch
        let screen = app.windows.firstMatch.frame
        for _ in 0..<attempts {
            if element.exists {
                let frame = element.frame
                let top = max(scroller.frame.minY, screen.minY) + type(of: self).topClearance
                let bottom = screen.maxY - type(of: self).bottomClearance
                if frame.minY >= top && frame.maxY <= bottom { return element }
                // Taller than the clear band: its top on screen is as good as it gets.
                if frame.height > bottom - top && frame.minY >= top && frame.minY < bottom - 60 { return element }
                // Near the trailing edge, off most controls; by what is needed, capped per drag.
                let start = scroller.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5))
                let dy: CGFloat = frame.minY < top ? min(top - frame.minY + 40, 300) : -min(frame.maxY - bottom + 40, 300)
                start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: dy)),
                            withVelocity: .slow, thenHoldForDuration: 0.1)
            } else if up {
                scroller.swipeDown(velocity: .slow)
            } else {
                scroller.swipeUp(velocity: .slow)
            }
        }
        XCTAssertTrue(element.exists && element.isHittable, "Could not reveal \(element)", file: file, line: line)
        return element
    }

    /// Reveals, then taps: never a tap on something under the floating bar.
    func tapRevealed(_ element: XCUIElement, in scroll: XCUIElement? = nil, file: StaticString = #filePath, line: UInt = #line) {
        reveal(element, in: scroll, file: file, line: line).tap()
    }

    func scrollToTop(_ scroll: XCUIElement? = nil) {
        for _ in 0..<6 { (scroll ?? app.scrollViews.firstMatch).swipeDown(velocity: .fast) }
    }

    // MARK: Screenshots and alerts

    /// Saves build/ui-shots/<name>.png on the Mac (simulator only; a device skips it) and keeps
    /// it in the result bundle.
    func snap(_ name: String) {
        let shot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: shot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        let dir = type(of: self).screenshotDirectory
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? shot.pngRepresentation.write(to: dir.appendingPathComponent(name + ".png"))
    }

    /// Answers a system permission alert the script could not grant ahead (it fires on the next
    /// interaction with the app after the alert appears). Prefer `simctl privacy grant`.
    func answerSystemAlerts(with labels: [String] = ["Allow", "Allow While Using App", "Allow Full Access", "OK"]) {
        addUIInterruptionMonitor(withDescription: "System alert") { alert in
            for label in labels where alert.buttons[label].exists {
                alert.buttons[label].tap()
                return true
            }
            return false
        }
    }
}
