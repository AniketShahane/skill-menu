import SwiftUI

// ItemRow: the compact list-row card form — a small square thumbnail, title and count inline,
// no panel — flying the same ItemPart pieces (ItemCard.swift) into the same detail page. Two
// card forms sharing one part enum is the point: the layer and the page don't know or care
// which form an item was tapped from.
//
// Example written for this skill; read it, don't paste it.
//
// Builds on templates/app/CardFlight/README.md step 3 ("stage the card's looks in the tap") and
// its "What it doesn't do" note that the generic starter carries only one card form. A row has
// no panel to show, so its `cardLooks` below gives the panel piece a look built from the row's
// own title and subtitle text laid out full-width, not a literal copy of the card's panel view —
// the piece travels from wherever the row's words sit to wherever the page's panel sits, same as
// it would from the full card, because the timing table only cares about each piece's kind.
//
// Lessons it encodes (shared-element-flights.md "Pieces"; references/architecture.md "a few
// leaf views still read the model directly" — ItemRow here takes plain data instead):
// - A piece's kind, not its container, decides how it travels. The row's title is still `.text`;
//   it is simply laid out inline instead of in a panel.
// - A row with no thumbnail on screen (scrolled under the top inset) still reports nothing, and
//   the layer's "on screen" rule (`ItemLayer.swift`, `onScreen`) leaves it out of the flight
//   cleanly rather than flying from a zero-size frame.
// - Take plain data (`Item`, a scope, a layer), not a model reference: it can be previewed and
//   reused in both a dense list and a wide one without carrying navigation along.

struct ItemRow: View {
    let item: Item
    let scope: AppTab
    let layer: ItemLayerModel<ItemPart>

    var body: some View {
        Button {
            layer.open(item.id, from: AnyHashable(scope), cardLooks: cardLooks)
        } label: {
            HStack(spacing: 12) {
                thumbLook
                    .itemPiece(.hero, id: item.id, end: .card)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title)
                        .font(.body.weight(.medium))
                        .itemPiece(.title, id: item.id, end: .card)
                    Text("\(item.count) logged")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .itemPiece(.subtitle, id: item.id, end: .card)
                }
                Spacer(minLength: 0)
                Text("\(item.count)")
                    .font(.caption.bold())
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(.ultraThinMaterial, in: Capsule())
                    .itemPiece(.countChip, id: item.id, end: .card)
            }
            .padding(.vertical, 8)
        }
        .buttonStyle(.plain)
        .environment(\.itemPieceScope, AnyHashable(scope))
    }

    private var thumbLook: some View {
        ThumbnailMap(key: item.thumbnailKey)
            .frame(width: 52, height: 52)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    /// No `.panel` case: a row never tags that piece with `end: .card`, so it is never measured
    /// on this end and `cardLooks` is never asked for it. The layer then treats it as page-only
    /// — it simply fades in at the page's own position, rather than flying from a view the row
    /// doesn't have.
    func cardLooks(_ part: ItemPart, _ size: CGSize) -> ItemLook {
        switch part {
        case .hero: ItemLook(thumbLook, corner: 10)
        case .panel: ItemLook(Color.clear, ground: .clear) // unreachable; kept for ItemPart's exhaustiveness
        case .countChip: ItemLook(Text("\(item.count)").font(.caption.bold())
            .padding(.horizontal, 7).padding(.vertical, 3).background(.ultraThinMaterial, in: Capsule()))
        case .title: ItemLook(Text(item.title).font(.body.weight(.medium)))
        case .subtitle: ItemLook(Text("\(item.count) logged").font(.caption).foregroundStyle(.secondary))
        }
    }
}
