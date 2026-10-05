import SwiftUI

// SettingsScreen: the Settings tab. Appearance, and an About page pushed on the NavigationStack.
//
// What: SettingsScreen (a preference that saves itself through AppModel, and a row that pushes
// Route.about) and AboutScreen (the pushed page, with the system back button and swipe).
//
// Wire in: add rows here. A choice that redraws the whole app (theme, units) applies after any
// dialog that asked for it has faded (references/motion-craft.md §3).
//
// Lessons it encodes:
// - A plain page from a row is a native NavigationStack push: free back swipe and accessibility.
//   Only a card flying apart into its page needs the custom layer.
// - A pushed page is hosted by UIKit and doesn't inherit the pager's accessibility rules: it says
//   its own (\.pageCovered + hiddenWhenCovered()).

struct SettingsScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(Navigator.self) private var nav

    var body: some View {
        @Bindable var app = app
        ScrollView {
            VStack(alignment: .leading, spacing: Space.l) {
                Text("Settings")
                    .textRole(.display)
                    .foregroundStyle(Palette.ink)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("settings_title")
                    .padding(.top, Space.s)
                group("Appearance") {
                    Picker("Appearance", selection: $app.appearance) {
                        ForEach(AppModel.Appearance.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .accessibilityIdentifier("appearance_picker")
                }
                group("About") {
                    Button { nav.push(.about) } label: {
                        HStack {
                            Text("About MyApp").textRole(.body).foregroundStyle(Palette.ink)
                            Spacer()
                            Image(systemName: "chevron.right").foregroundStyle(Palette.muted)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.press(0.98))
                    .accessibilityIdentifier("about_row")
                }
            }
            .padding(.horizontal, Space.xl)
            .padding(.bottom, 120)
        }
        .scrollIndicators(.hidden)
        .accessibilityIdentifier("settings_screen")
    }

    private func group<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Space.m) {
            Text(title.uppercased()).textRole(.label).foregroundStyle(Palette.muted)
            content()
        }
        .padding(Space.l)
        .background(Palette.panel, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
    }
}

struct AboutScreen: View {
    var body: some View {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
        List {
            LabeledContent("Version", value: version)
            Text("Built from the ios-app-craft starter: a kept tab pager, a card that flies apart into its page, and a motion check that measures every frame.")
                .foregroundStyle(Palette.muted)
        }
        .navigationTitle("About")
        .toolbar(.visible, for: .navigationBar)
        // RootView sets \.pageCovered on pushed pages; this page says it for itself.
        .hiddenWhenCovered()
        .accessibilityIdentifier("about_screen")
    }
}
