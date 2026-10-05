import SwiftUI

// MyAppApp: the entry point.
//
// What: starts FrameProbe first (a no-op unless APP_FRAME_LOG is set), builds the one AppModel
// (whose init applies LaunchHooks: reset, seed, pinned clock), and shows RootView.
//
// Wire in: keep FrameProbe first, so the motion check sees the launch's frames from the start.
// Appearance (LaunchHooks.appearance over the saved preference) and the deep link are applied by
// RootView.
//
// Lessons it encodes (references/architecture.md §10, measuring-motion.md "The rig"):
// - Test hooks are read at one seam, before any store opens, and work in Release: the motion
//   check measures a Release build.
// - The frame log costs nothing unless a test asks for it.

@main
struct MyAppApp: App {
    @State private var app: AppModel

    init() {
        FrameProbe.shared.startIfRequested()
        _app = State(initialValue: AppModel())
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(app)
        }
    }
}
