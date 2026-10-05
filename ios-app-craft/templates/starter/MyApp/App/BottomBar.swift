import SwiftUI

// BottomBar: the floating tab bar. A glass capsule over the pages; the selected tab's pill glides.
//
// What: one button per AppTab, ids "tab_<name>", the selected pill moving by matchedGeometryEffect
// in the pager's own glide transaction.
//
// Wire in: RootView puts it last in its ZStack (above the flying pieces, so they pass under its
// glass), with .flightBarAway(cards) so it leaves with the flight's first moving frame and returns
// half way through a close, and hit testing only once the page is gone.
//
// Lessons it encodes (references/architecture.md §4, ui-testing.md §5):
// - A floating bar covers content: lists pad their bottom so the last row can scroll clear of it,
//   and tests reveal a control clear of the bar before tapping it.
// - matchedGeometryEffect is fine for a small element inside one container; page-level moves are
//   flights.

struct BottomBar: View {
    let current: AppTab
    let onTab: (AppTab) -> Void
    @Namespace private var pill

    var body: some View {
        HStack(spacing: Space.xs) {
            ForEach(AppTab.allCases) { tab in
                let selected = tab == current
                Button { onTab(tab) } label: {
                    VStack(spacing: 2) {
                        Image(systemName: tab.icon).font(.system(size: 17, weight: .semibold))
                        Text(tab.title).font(.system(.caption2, weight: .semibold))
                    }
                    .foregroundStyle(selected ? Palette.ink : Palette.muted)
                    .frame(width: 88, height: 50)
                    .background {
                        if selected {
                            Capsule().fill(Palette.panel).matchedGeometryEffect(id: "pill", in: pill)
                        }
                    }
                    .contentShape(Capsule())
                }
                .buttonStyle(.press)
                .accessibilityIdentifier("tab_\(tab.rawValue)")
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        .padding(6)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(Palette.outline.opacity(0.6), lineWidth: 1))
        .shadow(color: .black.opacity(0.14), radius: 18, y: 8)
        .padding(.bottom, Space.s)
    }
}
