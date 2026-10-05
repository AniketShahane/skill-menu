import Foundation

// LaunchHooks: the app side of AppUITestCase's launch contract.
//
// What: one place that reads the launch arguments and environment a UI test sets, so every test
// starts from a known state: a clean install (-appReset), seeded data copied from the repo
// (APP_SEED_DIR), a pinned clock (APP_NOW_MILLIS, APP_TODAY, APP_TZ), a forced appearance
// (APP_APPEARANCE), and a deep link to open (APP_OPEN). -appNoMotion is read by AppMotion.
//
// Wire in:
//   - Call LaunchHooks.prepare(dataDirectory:defaultsSuites:) first thing in your app model's
//     init, before any store or database is opened.
//   - Route every "now", "today" and time zone through LaunchHooks.now / .today / .timeZone
//     (or a Clock that defaults to them). A single stray Date() makes "Today"/"Yesterday"
//     labels and week boundaries flaky.
//   - Apply LaunchHooks.appearance over the saved preference, and handle LaunchHooks.deepLink
//     in the root view's .task (e.g. "tab:2", "item:<id>") so rendering tests open a page
//     directly instead of tapping their way there.
//   - Keep envPrefix/argPrefix in step with AppUITestCase.
//
// Lessons it encodes:
// - Seed data is plain files in the repo, in the app's own on-disk format. The simulator can
//   read the Mac's file system, so a test passes a path and the app copies it: no fixtures
//   compiled into the app, and the same files can come from another platform's app.
// - Pin the clock to the day the seed was made for, with its time zone. Screenshots and
//   assertions ("2 runs this week") then hold on any day, in any zone.
// - Reset means everything the app keeps: the data directory, every UserDefaults suite, and any
//   keychain items (the simulator keeps those across reinstalls). prepare() clears the first two;
//   an app that keeps keychain items adds a SecItemDelete per item class on -appReset.

enum LaunchHooks {
    /// Must match AppUITestCase.envPrefix and argPrefix.
    static let envPrefix = "APP_"
    static let argPrefix = "-app"

    static func env(_ name: String) -> String? { ProcessInfo.processInfo.environment[envPrefix + name] }
    static func flag(_ name: String) -> Bool { ProcessInfo.processInfo.arguments.contains(argPrefix + name) }

    /// Launched under XCTest or asked to reset: skip first-launch prompts, network warm-ups and
    /// paid APIs.
    static var isTesting: Bool {
        flag("Reset") || ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
    }

    /// The wall clock, or the pinned test clock (APP_NOW_MILLIS, milliseconds since 1970).
    static var now: Date {
        if let text = env("NOW_MILLIS"), let millis = Double(text) { return Date(timeIntervalSince1970: millis / 1000) }
        return Date()
    }

    /// APP_TZ (an IANA name such as America/New_York), or the device's zone.
    static let timeZone: TimeZone = env("TZ").flatMap(TimeZone.init(identifier:)) ?? .current

    static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar
    }

    /// APP_TODAY (yyyy-MM-dd), or today in `timeZone` by `now`.
    static var today: DateComponents {
        if let text = env("TODAY") {
            let parts = text.split(separator: "-").compactMap { Int($0) }
            if parts.count == 3 { return DateComponents(year: parts[0], month: parts[1], day: parts[2]) }
        }
        return calendar.dateComponents([.year, .month, .day], from: now)
    }

    enum Appearance: String { case light = "LIGHT", dark = "DARK", system = "SYSTEM" }
    /// APP_APPEARANCE forces light or dark over the saved preference.
    static var appearance: Appearance? { env("APPEARANCE").flatMap(Appearance.init(rawValue:)) }

    /// APP_OPEN: a page to open at launch, in your own "kind:argument" form.
    static var deepLink: String? { env("OPEN") }

    /// Wipes the app's state on -appReset, then copies APP_SEED_DIR's tree into `dataDirectory`
    /// (same relative paths, files replaced). Call before anything reads the data.
    static func prepare(dataDirectory: URL, defaultsSuites: [String] = []) {
        let fm = FileManager.default
        if flag("Reset") {
            try? fm.removeItem(at: dataDirectory)
            if let id = Bundle.main.bundleIdentifier { UserDefaults.standard.removePersistentDomain(forName: id) }
            for suite in defaultsSuites { UserDefaults.standard.removePersistentDomain(forName: suite) }
        }
        try? fm.createDirectory(at: dataDirectory, withIntermediateDirectories: true)
        guard let seed = env("SEED_DIR").map({ URL(fileURLWithPath: $0, isDirectory: true) }) else { return }
        let base = seed.resolvingSymlinksInPath().path
        guard let files = fm.enumerator(at: seed, includingPropertiesForKeys: [.isRegularFileKey]) else { return }
        for case let file as URL in files {
            guard (try? file.resourceValues(forKeys: [.isRegularFileKey]))?.isRegularFile == true,
                  !file.lastPathComponent.hasPrefix(".") else { continue }
            let path = file.resolvingSymlinksInPath().path
            guard path.hasPrefix(base) else { continue }
            let relative = String(path.dropFirst(base.count)).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            let target = dataDirectory.appendingPathComponent(relative)
            try? fm.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
            try? fm.removeItem(at: target)
            try? fm.copyItem(at: file, to: target)
        }
    }
}
