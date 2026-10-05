// swift-tools-version: 6.0
// MyAppCore: the app's pure logic, Foundation only. `swift test` runs it on the Mac in seconds,
// no simulator. Keep SwiftUI, UIKit and third-party code out; a type that needs a framework gets a
// protocol here and an implementation in the app (references/architecture.md §2).
import PackageDescription

let package = Package(
    name: "MyAppCore",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "MyAppCore", targets: ["MyAppCore"]),
    ],
    targets: [
        .target(name: "MyAppCore"),
        .testTarget(name: "MyAppCoreTests", dependencies: ["MyAppCore"]),
    ]
)
