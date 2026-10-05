import SwiftUI

// FadeDialog: a dialog drawn in the app's own style, over everything (tab bar included), that
// fades and scales in on a spring and fades out before it is taken down.
//
// What: .fadeDialog(isPresented:) { dismiss in DialogCard(...) }. Presented through a clear
// fullScreenCover with its slide turned off; a dim scrim (tap to close), a card at 0.95 -> 1
// scale, and a DialogCard with title, body and end-aligned buttons.
//
// Wire in (needs MotionKit.swift):
//   .fadeDialog(isPresented: $unitsOpen) { dismiss in
//       DialogCard(title: "Units") {
//           Picker(...)
//       } buttons: {
//           DialogButton("Done", id: "units_done") { dismiss() }
//       }
//   }
//   Close it with the `dismiss` handed to the content: it fades first. Setting the binding to
//   false yourself cuts it away. Apply a change the dialog chose (a unit, a theme) after
//   dismiss, so the redraw lands once the dialog has gone, not under its fade. Use system
//   alerts for destructive confirmations the platform already styles; this is for dialogs that
//   must look like the rest of the app.
//
// Lessons it encodes (each was measured on a frame log):
// - Start the fade a little after the tap, not at once. The tap's frame can be a heavy one and an
//   animation's clock runs through it, so the first visible frame was already 40% of the dim.
//   Opening waits longer (60 ms): the cover is a new layer tree whose first draw on the render
//   server takes a few frames (a third of the dim landed in the first frame otherwise).
// - Core Animation does not draw a layer at zero opacity. Before the fade, the card sits at 1%,
//   so its text and shapes are drawn while nothing shows and the fade's first frame is cheap.
// - Fade on a spring, not a steep ease-out: a spring starts from rest, so a full-screen dim eases
//   in instead of landing a big step in its first frame.
// - Remove only once the fade has fully finished (completionCriteria: .removed). A completion on
//   "logically complete" cut the fade's last step off, which read as a pop.

extension View {
    func fadeDialog<Dialog: View>(isPresented: Binding<Bool>,
                                  @ViewBuilder content: @escaping (_ dismiss: @escaping () -> Void) -> Dialog) -> some View {
        modifier(FadeDialogPresenter(isPresented: isPresented, dialog: content))
    }
}

enum FadeDialogTiming {
    /// A close starts this long after the tap: two frames, too short to feel, long enough for
    /// the tap's own work (a pressed row, a new choice) to land first.
    static let settle: TimeInterval = 0.03
    /// An open waits for the cover's first draw. Still well under the 100 ms that reads as instant.
    static let firstDraw: TimeInterval = 0.06
    static let scrimOpacity: Double = 0.32
}

private struct FadeDialogPresenter<Dialog: View>: ViewModifier {
    @Binding var isPresented: Bool
    let dialog: (_ dismiss: @escaping () -> Void) -> Dialog

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: $isPresented) {
                FadeDialogHost(isPresented: $isPresented, dialog: dialog)
                    .presentationBackground(.clear)
            }
            // No cover slide: the dialog does its own fade.
            .transaction(value: isPresented) { $0.disablesAnimations = true }
    }
}

private struct FadeDialogHost<Dialog: View>: View {
    @Binding var isPresented: Bool
    let dialog: (_ dismiss: @escaping () -> Void) -> Dialog
    @State private var shown = AppMotion.reduced
    @State private var closing = false
    /// Drawn but unseen before the fade in (see header); truly gone after the fade out.
    private var floor: Double { closing ? 0 : 0.01 }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color.black.opacity((shown ? 1 : floor) * FadeDialogTiming.scrimOpacity)
                    .ignoresSafeArea()
                    .onTapGesture { dismiss() }
                    .accessibilityHidden(true)
                dialog(dismiss)
                    .frame(width: min(560, max(280, geo.size.width - 80)))
                    .opacity(shown ? 1 : floor)
                    .scaleEffect(shown ? 1 : 0.95)
                    // VoiceOver's two-finger scrub closes it, like a system alert.
                    .accessibilityAction(.escape) { dismiss() }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .onAppear {
            guard !shown else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + FadeDialogTiming.firstDraw) {
                withAnimation(.smooth(duration: 0.28)) { shown = true }
            }
        }
    }

    private func dismiss() {
        let close = {
            var transaction = Transaction()
            transaction.disablesAnimations = true
            withTransaction(transaction) { isPresented = false }
        }
        if AppMotion.reduced { close(); return }
        DispatchQueue.main.asyncAfter(deadline: .now() + FadeDialogTiming.settle) {
            withAnimation(.smooth(duration: 0.22), completionCriteria: .removed) {
                closing = true
                shown = false
            } completion: { close() }
        }
    }
}

/// The dialog card: a title, a body, and a row of end-aligned buttons. Restyle to your system.
struct DialogCard<Content: View, Buttons: View>: View {
    let title: String
    var background: Color
    var cornerRadius: CGFloat
    let content: () -> Content
    let buttons: () -> Buttons

    init(title: String, background: Color = Color(uiColor: .secondarySystemBackground), cornerRadius: CGFloat = 28,
         @ViewBuilder content: @escaping () -> Content, @ViewBuilder buttons: @escaping () -> Buttons) {
        self.title = title
        self.background = background
        self.cornerRadius = cornerRadius
        self.content = content
        self.buttons = buttons
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(.title2.weight(.semibold))
                .accessibilityAddTraits(.isHeader)
                .padding(.bottom, 16)
            content()
                .padding(.bottom, 24)
            HStack(spacing: 8) {
                Spacer(minLength: 0)
                buttons()
            }
        }
        .padding(24)
        .background(background, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
    }
}

/// A dialog's text button ("Done", "Cancel"). `id` becomes the accessibility identifier.
struct DialogButton: View {
    let title: String
    var id: String?
    let action: () -> Void

    init(_ title: String, id: String? = nil, action: @escaping () -> Void) {
        self.title = title
        self.id = id
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.body.weight(.semibold))
                .padding(.horizontal, 12)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.press)
        .accessibilityIdentifier(id ?? title)
    }
}
