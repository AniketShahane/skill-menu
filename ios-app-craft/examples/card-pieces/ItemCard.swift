import SwiftUI

// ItemCard: the full card form — a thumbnail hero, a number panel, a title and a count chip —
// wired to fly its pieces into ItemDetailHost's page. Declares the ItemPart enum both ItemCard
// and ItemRow (the compact list-row form) share.
//
// Example written for this skill; read it, don't paste it.
//
// Builds on templates/app/CardFlight/README.md "Wiring it in" steps 1-3: name the parts, tag the
// card's pieces, stage the card's looks in the tap. Two card forms sharing one part enum is the
// one addition templates/app/CardFlight/ doesn't need to make, since its starter has only one.
//
// Lessons it encodes (shared-element-flights.md "Looks"; motion-craft.md "Anything the page
// shows inside a flying surface's area must also be in that surface's look"):
// - Every look is built from the same subviews the card itself draws — `heroLook` and `panelLook`
//   below are called from both the card's body and the tap's `cardLooks` closure.
// - The hero's look also draws the count chip in place, at the card's resting position, with the
//   same `.itemAfterPieces` index the page uses: without it, the chip pops in all at once the
//   frame the flight lands, because it sits inside the hero's area and the hero covers it.

/// The pieces a card flies: a thumbnail/map hero, its number panel, a count chip riding on the
/// hero, the title (same words at both ends) and a subtitle that reads differently on the page.
enum ItemPart: ItemPiece {
    case hero, panel, countChip, title, subtitle

    var kind: ItemPieceKind {
        switch self {
        case .hero: .surface
        case .panel: .panel
        case .countChip: .element
        case .title: .text
        case .subtitle: .otherText
        }
    }

    var holder: ItemPart? {
        switch self {
        case .countChip, .title: .hero
        default: nil
        }
    }
}

/// An item: a title, a number, and a thumbnail the hero and the row both draw from the cache.
struct Item: Identifiable, Hashable, Sendable {
    let id: UUID
    var title: String
    var count: Int
    var thumbnailKey: String
}

struct ItemCard: View {
    let item: Item
    let scope: AppTab
    let layer: ItemLayerModel<ItemPart>

    var body: some View {
        Button {
            layer.open(item.id, from: AnyHashable(scope), cardLooks: cardLooks)
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                heroLook(size: CGSize(width: 340, height: 180))
                    .itemPiece(.hero, id: item.id, end: .card)
                panelLook
                    .itemPiece(.panel, id: item.id, end: .card)
            }
        }
        .buttonStyle(.plain)
        .environment(\.itemPieceScope, AnyHashable(scope))
    }

    /// The hero, at any size: the thumbnail, with the count chip riding in its corner. Called
    /// here and from `cardLooks` below, so the flight draws exactly this.
    func heroLook(size: CGSize) -> some View {
        ThumbnailMap(key: item.thumbnailKey)
            .frame(width: size.width, height: size.height)
            .overlay(alignment: .topTrailing) {
                Text("\(item.count)")
                    .font(.caption.bold())
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(10)
                    .itemPiece(.countChip, id: item.id, end: .card)
            }
    }

    var panelLook: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(item.title)
                .font(.headline)
                .itemPiece(.title, id: item.id, end: .card)
            Text("\(item.count) logged")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .itemPiece(.subtitle, id: item.id, end: .card)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial)
    }

    /// Built from the same subviews as the card (see the header's "Looks" lesson).
    func cardLooks(_ part: ItemPart, _ size: CGSize) -> ItemLook {
        switch part {
        case .hero: ItemLook(heroLook(size: size), corner: 18)
        case .panel: ItemLook(panelLook, ground: .init(.secondarySystemBackground))
        case .countChip: ItemLook(Text("\(count)").font(.caption.bold())
            .padding(.horizontal, 8).padding(.vertical, 4).background(.ultraThinMaterial, in: Capsule()))
        case .title: ItemLook(Text(title).font(.headline))
        case .subtitle: ItemLook(Text("\(count) logged").font(.subheadline).foregroundStyle(.secondary))
        }
    }

    private var count: Int { item.count }
    private var title: String { item.title }
}
