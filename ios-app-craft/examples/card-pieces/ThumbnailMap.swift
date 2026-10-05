import SwiftUI
import MapKit

// ThumbnailMap: the surface piece's content — a small rendered map tile, seeded from a cache so
// a card never shows a blank hero while a live map loads, and crossfaded in when a fresh render
// finally lands.
//
// Example written for this skill; read it, don't paste it.
//
// Builds on templates/app/CardFlight/README.md's "What to tune" note ("a map drawn from cached
// renders" is one of the things the generic engine leaves out): this file is that piece, kept
// to a plain `MKMapSnapshotter` render plus an in-memory cache, with none of the layer's own
// code in it — `ItemCard` and `ItemRow` both just place a `ThumbnailMap(key:)` where a hero or
// a thumbnail goes, and the flight scales whatever it draws like any other surface.
//
// Lessons it encodes (motion-craft.md §3 "Late images crossfade"):
// - Seed from the cache in `init` (a `@State` initial value), so a cached render is already
//   there on the very first frame — never a placeholder that then pops to the real image.
// - A freshly decoded render still crossfades in over the stand-in, never swapping instantly:
//   a flight mid-flight must never show a hard image cut.
// - The cache is keyed by both the item and the pixel size asked for, because a card's hero and
//   a flight look drawn at a different size are, correctly, different renders — rendering a
//   card-sized tile and stretching it into the page-sized hero looks soft.

/// A tiny in-memory cache of rendered map tiles, keyed by item and pixel size. One per app
/// (`ThumbnailMap.cache`), so a card's hero and the flight's look of the same item, at the same
/// size, share a render instead of each kicking off their own `MKMapSnapshotter`.
@MainActor
final class ThumbnailCache {
    static let shared = ThumbnailCache()
    private var images: [Key: UIImage] = [:]

    struct Key: Hashable { let key: String; let size: CGSize }

    func image(for key: String, size: CGSize) -> UIImage? { images[Key(key: key, size: size)] }

    func store(_ image: UIImage, for key: String, size: CGSize) {
        images[Key(key: key, size: size)] = image
    }
}

/// A map-tile hero or thumbnail. `key` names a fixed region (a saved place, a route's bounds) —
/// resolving `key` to an `MKCoordinateRegion` is left to your own data layer.
struct ThumbnailMap: View {
    let key: String
    var region: MKCoordinateRegion = .init(center: .init(latitude: 37.7749, longitude: -122.4194),
                                           latitudinalMeters: 600, longitudinalMeters: 600)

    @State private var image: UIImage?

    var body: some View {
        GeometryReader { geo in
            let size = geo.size
            ZStack {
                // The stand-in: a flat tint, never a spinner — a spinner itself would need to fly.
                Color(.tertiarySystemFill)
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .transition(.opacity)
                }
            }
            .frame(width: size.width, height: size.height)
            .clipped()
            .task(id: ThumbnailCache.Key(key: key, size: size)) {
                await load(size: size)
            }
        }
    }

    @MainActor
    private func load(size: CGSize) async {
        // Seed from the cache first: if a render already exists, it is on screen this frame.
        if let cached = ThumbnailCache.shared.image(for: key, size: size) {
            image = cached
            return
        }
        guard size.width > 1, size.height > 1 else { return }
        let options = MKMapSnapshotter.Options()
        options.region = region
        options.size = size
        options.showsBuildings = false
        let snapshotter = MKMapSnapshotter(options: options)
        guard let snapshot = try? await snapshotter.start() else { return }
        ThumbnailCache.shared.store(snapshot.image, for: key, size: size)
        withAnimation(.easeOut(duration: 0.18)) { image = snapshot.image }
    }
}
