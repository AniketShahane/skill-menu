import SwiftUI
import MyAppCore

// AppModel: the app's one observable model. Data, preferences and the clock go through here.
//
// What: the cards (from cards.json in Application Support, or the bundled demo on a first launch),
// the appearance preference, and the pinned-clock "now" every label uses.
//
// Wire in: made once in MyAppApp and injected with .environment(app). Screens read it in their
// host views and pass plain values down, so a screen can be built anywhere (a warm-up copy, a
// flight look). Add services behind protocols here (references/architecture.md §8).
//
// Lessons it encodes (references/architecture.md §3, §6, §10):
// - LaunchHooks.prepare runs first, before anything reads the data directory: a UI test's reset and
//   seed land before the first read.
// - A page whose first frame must be complete gets its data before that frame: cards load in init.
//   A list that fills a frame later jumps.
// - `@ObservationIgnored` on everything that isn't UI state (stores, caches, closures).
// - Every "now" comes from LaunchHooks, which honours the pinned test clock.

@MainActor
@Observable
final class AppModel {
    enum Appearance: String, CaseIterable, Identifiable {
        case system, light, dark
        var id: String { rawValue }
        var title: String { rawValue.capitalized }
    }

    static let settingsSuite = "settings"

    private(set) var cards: [Card] = []
    /// False until the first load finished: "loading" is not "empty".
    private(set) var loaded = false
    var appearance: Appearance {
        didSet { prefs.set(appearance.rawValue, forKey: "appearance") }
    }

    @ObservationIgnored private let prefs: UserDefaults

    nonisolated static var dataDirectory: URL {
        URL.applicationSupportDirectory.appendingPathComponent("MyApp", isDirectory: true)
    }

    init() {
        LaunchHooks.prepare(dataDirectory: Self.dataDirectory, defaultsSuites: [Self.settingsSuite])
        prefs = UserDefaults(suiteName: Self.settingsSuite) ?? .standard
        appearance = Appearance(rawValue: prefs.string(forKey: "appearance") ?? "") ?? .system
        cards = Self.loadCards()
        loaded = true
    }

    /// The pinned test clock, or the real one.
    var now: Date { LaunchHooks.now }

    /// The colour scheme to force: the test override first, then the preference.
    var colorScheme: ColorScheme? {
        switch LaunchHooks.appearance {
        case .light?: return .light
        case .dark?: return .dark
        case .system?: return nil
        case nil: break
        }
        switch appearance {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }

    func card(_ id: AnyHashable) -> Card? {
        guard let id = id.base as? String else { return nil }
        return cards.first { $0.id == id }
    }

    private static func loadCards() -> [Card] {
        let file = dataDirectory.appendingPathComponent(CardDeck.fileName)
        let data = (try? Data(contentsOf: file))
            ?? Bundle.main.url(forResource: "DemoCards", withExtension: "json").flatMap { try? Data(contentsOf: $0) }
        guard let data, let deck = try? CardDeck.decode(data) else { return [] }
        return deck.cards
    }
}
