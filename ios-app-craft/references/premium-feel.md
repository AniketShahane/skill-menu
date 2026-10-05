# Premium feel beyond motion

What makes a SwiftUI screen feel made with care once its motion is right: type, colour, spacing,
symbols, haptics, glass, states, accessibility, icon and launch. Motion lives in `motion-craft.md`.
Every API here was checked against the Xcode 27.0 / iOS 27 SDK on 27 Sep 2026; gaps are marked.

## Rules

1. **All text scales with Dynamic Type.** Many people run larger text; fixed sizes break for them.
2. **Changing numbers use monospaced digits.** Proportional digits make the row jiggle every tick.
3. **Colours are named roles with light, dark and high-contrast values.** A hex can't follow appearance.
4. **Spacing comes from one scale (4-pt base, 8-pt steps).** Stray 13s and 17s read as sloppy.
5. **Every tap target is at least 44 × 44 pt.** Apple's default; smaller ones get missed.
6. **Symbols take the weight and size of the text beside them.** Mismatched weights look pasted in.
7. **One haptic per meaningful event, with its system meaning.** Frequent haptics become noise.
8. **Use the system tab bar, toolbar and sheets unless the design truly needs your own.** They get
   Liquid Glass, scroll edge effects and accessibility adaptation for free.
9. **Glass is for the controls layer, never content.** Glass on content muddles the hierarchy.
10. **Every screen has designed empty, loading, error and offline states.** Blank reads as a bug.
11. **Reduce Motion gets a cross-fade, not nothing.** The change must still be seen.
12. **The launch screen is the first screen with the content taken out.** Anything else flashes.
13. **Run the premium review (§10) on every screen before calling it done.**
14. **"Like our last app" means reuse its tokens (§11).** New tokens make a different app.

## 1. Type

- Use text styles (`.body`, `.headline`) or a custom font tied to one:
  `Font.custom(name, size:, relativeTo:)`. `Font.custom(name, fixedSize:)` never scales: keep it for
  display numbers whose box must not grow, and check those at the largest size.
- A small scale: 6–8 roles in one enum, applied by one modifier. Two typefaces at most. HIG: iOS
  default 17 pt, minimum 11 pt; avoid Ultralight, Thin and Light at small sizes.
- Sizes beside text (icon boxes, avatars, row heights) use `@ScaledMetric(relativeTo:)`.
- Changing numbers: `.monospacedDigit()` and `.contentTransition(.numericText(value:))` inside an
  animation, with the final width reserved (`motion-craft.md` §2).
- Custom fonts: files in `UIAppFonts` (`setup-and-tooling.md` §2), PostScript names. System fonts
  honour Bold Text; custom fonts don't. Read `@Environment(\.legibilityWeight)` and step up a weight.
- Line height: `.lineHeight(.exact(points:))` on iOS 26+, `.lineSpacing` below
  (`porting-from-android.md` §6).
- Cap with `.dynamicTypeSize(...DynamicTypeSize.xxxLarge)` only chrome whose growth helps nobody
  (tab titles). Never cap body content.

```swift
@ScaledMetric(relativeTo: .title) private var icon: CGFloat = 22
@Environment(\.legibilityWeight) private var legibility
// in body:
HStack(spacing: 8) {
    Image(systemName: "figure.run").font(.system(size: icon, weight: .semibold))
    Text(km, format: .number.precision(.fractionLength(2)))
        .font(.custom(legibility == .bold ? "Geist-Bold" : "Geist-Medium", size: 28, relativeTo: .title))
        .monospacedDigit()
        .contentTransition(.numericText(value: km))
}
.animation(.smooth, value: km)
```

## 2. Colour

- Name colours by purpose (Paper, Ink, Muted, Accent, Outline, Surface), never by hue.
- Each colour set has Any, Dark, High Contrast and High Contrast Dark. In Xcode's inspector:
  Appearances → Any, Dark, and tick High Contrast. In `Contents.json`:
  `{"appearance": "contrast", "value": "high"}` (actool 27 compiles all four).
- No hard-coded greys. Use `.foregroundStyle(.secondary)` / `.tertiary`, your Muted role, or system
  roles (`Color(.secondarySystemBackground)`, `.separator`).
- Set the accent once (`AccentColor` asset or `.tint()` at the root). Colour carries meaning: the
  primary action, selection, status. Brand colour goes in the content layer, not the bars (WWDC26 251).
- Contrast: 4.5:1 for text up to 17 pt, 3:1 at 18 pt+ or bold (HIG Accessibility), in both
  appearances. If the default can't, Increase Contrast must (`\.colorSchemeContrast == .increased`).
- Never signal state by colour alone; add a symbol or a word. Dark mode isn't an inversion: raised
  surfaces get lighter, and white images are softened (HIG Dark Mode).

## 3. Spacing and layout

- One scale: 4, 8, 12, 16, 20, 24, 32. One page margin for every page (Dash: 20), via
  `.contentMargins(.horizontal, 20, for: .scrollContent)` or `.safeAreaPadding`.
- Backgrounds ignore the safe area; content respects it (`porting-from-android.md` §7, insets row).
- Readable width: SwiftUI has no twin of UIKit's `readableContentGuide`. Cap text columns:
  `.frame(maxWidth: 640, alignment: .leading).frame(maxWidth: .infinity)`. On iOS 27, apps rebuilt
  with the SDK are resizable on iPad and in iPhone Mirroring (WWDC26 102), so lay out from the
  available width, not the device.
- Targets: 44 × 44 pt default, 28 × 28 minimum; about 12 pt around bezelled controls and 24 pt
  around bezel-less ones (HIG Accessibility). Grow the hit area, not the glyph:
  `.frame(minWidth: 44, minHeight: 44).contentShape(.rect)`. Primary actions sit in thumb reach.
- Corners are concentric: inner radius = outer − padding. iOS 26+: `ConcentricRectangle` or
  `.rect(corners: .concentric)`; below, compute it, with `style: .continuous`.

## 4. SF Symbols

- Prefer SF Symbols; custom icons only where the brand needs them, keeping platform meanings.
  Symbols are versioned: check each one's minimum OS in the SF Symbols app against your floor.
- Weight: put the font on the `Label` or row so the symbol matches its text. Change emphasis with
  `.imageScale(.small / .large)`, which keeps the weight match.
- Variants: `.fill` in tab bars and for selection, outline in toolbars and lists, `.slash` for off,
  enclosed at small sizes (`.symbolVariant(.fill)`).
- Rendering: `.symbolRenderingMode(.hierarchical)` for depth in one colour, `.palette` for two,
  `.multicolor` only for intrinsic meaning. Variable colour shows a level, not depth.
- Effects, sparingly: a state change `.contentTransition(.symbolEffect(.replace))` (Magic Replace
  between related symbols); an event `.symbolEffect(.bounce, value:)`; ongoing activity
  `.symbolEffect(.pulse / .variableColor / .breathe, isActive:)`; iOS 26+ `.drawOn` / `.drawOff`.
- Under Reduce Motion, stop repeating effects with `.symbolEffectsRemoved(reduceMotion)`.
  Unconfirmed whether the system already tones them down.

## 5. Haptics

| Event | `.sensoryFeedback(…)` |
|---|---|
| A picker, segment or custom selector changes value | `.selection` |
| A task finished (saved, synced, run ended) | `.success` |
| Needs attention, recoverable / failed | `.warning` / `.error` |
| Something lands or snaps into place; lift or drop in a drag | `.impact(weight: .light / .medium)`, `.impact(flexibility: .soft / .rigid)` |
| A dragged item lines up with a guide | `.alignment` |
| Stepper up or down | `.increase` / `.decrease` |
| An ongoing activity starts or stops | `.start` / `.stop` |
| A custom control that should feel like a system one (iOS 26+) | `.press(.button / .toggle / .slider / .tab)`, `.release(.slider)`, `.selection(.on / .off / .minimum / .maximum)` |

- System `Toggle`, `Slider` and `Picker` already play haptics; don't add a second.
- Trigger on the value that changed. To pick per outcome, use the closure form
  `.sensoryFeedback(trigger: result) { old, new in … }` and return `nil` for none.
- Never on scroll ticks or other high-frequency changes, never against a pattern's meaning, and
  match the haptic's sharpness to its animation (HIG Playing haptics).
- The simulator plays no haptics. Feel each on a device, or list it as not verified on hardware.
  Unconfirmed whether `sensoryFeedback` honours the System Haptics setting; if haptics are
  frequent, offer an in-app switch (HIG: "Make haptics optional").

## 6. Materials and Liquid Glass

**What changed.** iOS 26 brought Liquid Glass. iOS 27 refines it (better diffusion, a darkened edge,
brighter highlights) and adds a Settings slider from ultra clear to fully tinted. Apps get this
without recompiling. Built with Xcode 27, apps can no longer opt out of the new design (WWDC26 102);
that the plist key `UIDesignRequiresCompatibility` is now ignored is unconfirmed (the session names no
key). No public API reads the slider.

**Native first.** `TabView` with `Tab`, `.toolbar`, navigation bars, sheets, menus, alerts and
`.searchable` get glass, scroll edge effects, morphing, and Reduce Transparency and Increase Contrast
handling. Remove custom backgrounds behind them (`toolbarBackground`, `presentationBackground`,
dimming layers); they fight the scroll edge effect (WWDC25 323; Adopting Liquid Glass).

- Tab bar: `.tabBarMinimizeBehavior(.onScrollDown)`; `.tabViewBottomAccessory { }` for something
  persistent such as a mini-player, never screen actions; `Tab(role: .search)`; iOS 27
  `Tab(…, role: .prominent)` pins a tab to the trailing edge.
- Toolbars: group with `ToolbarSpacer(.fixed / .flexible)`; `.sharedBackgroundVisibility(.hidden)`
  for an item that shouldn't share its group's glass. iOS 27: `.visibilityPriority(.high)`,
  `ToolbarOverflowMenu { }`, `.topBarPinnedTrailing`, and
  `.toolbarMinimizationBehavior(.onScrollDown, for: .navigationBar)`. The WWDC26 session shows
  `toolbarMinimizeBehavior`, which is not in the 27.0 SDK and fails to compile.

**A custom floating bar** is fine when the design needs it (Dash's has a gliding capsule, and a card
flight passes under it). Then you own what the native bar did:
- iOS 26+: `glassEffect(.regular.interactive(), in: .capsule)`, applied after the other appearance
  modifiers. Nearby glass shares one `GlassEffectContainer(spacing:)`: glass can't sample glass, and
  one container renders faster.
- Host it with `safeAreaBar(edge: .bottom) { }`, so content scrolls under it with a scroll edge effect.
  Tune with `.scrollEdgeEffectStyle(.soft / .hard, for:)`, one per view.
- Morph with `glassEffectID(_:in:)` and a `@Namespace` inside one container; join shapes at rest with
  `glassEffectUnion(id:namespace:)`; use `glassEffectTransition(.materialize)` for far-apart pieces.
  Switch glass off with `Glass.identity`, not an `if` (identity: `motion-craft.md` §5).
- iOS 18 fallback: a material behind an `#available` branch (it never flips at run time). Glass
  handles Reduce Transparency itself; the fallback must draw solid by hand.

```swift
struct FloatingBarBackground: ViewModifier {
    @Environment(\.accessibilityReduceTransparency) private var solid
    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content.glassEffect(.regular.interactive(), in: .capsule)
        } else {
            content.background(solid ? AnyShapeStyle(Color(.systemBackground)) : AnyShapeStyle(.ultraThinMaterial),
                               in: Capsule())
        }
    }
}
```

- Buttons: `.buttonStyle(.glass)`; `.glassProminent` for the one primary action, tinting its
  background, not its text (HIG Color).
- Variants: `.regular` (default, legible). `.clear` only over photos or video, with a ~35% dark dim
  when that content is bright (HIG Materials). `.tint()` only when the colour means something.
- Content-layer structure (cards, panels) uses standard materials (`.thinMaterial` … `.thickMaterial`).
- `\.accessibilityShowBorders` (new name for `accessibilityShowButtonShapes`, back-deployed, compiles
  at iOS 18): when on, give borderless custom buttons a visible shape.
- Test custom glass over the busiest content at rest, with the iOS 27 slider at both ends.

## 7. States

Nothing appears from nowhere (`motion-craft.md` §2): every state below arrives with a transition.

- **Empty.** Say what goes here and give the next action: `ContentUnavailableView(title,
  systemImage:, description:)`, `ContentUnavailableView.search(text:)`, or the app's card (Dash:
  `EmptyStateCard`). Never hide or disable a tab because it is empty (HIG Tab bars).
- **Loading.** Show the layout at once. Skeleton: real rows with placeholder data under
  `.redacted(reason: .placeholder)`; `.unredacted()` on parts already known. A shimmer on top is
  optional and stops under Reduce Motion. Swap to content in place, inside an animation.
- **Error.** Inline, where the content failed, with a retry; `.alert` only for problems that block.
  **Offline:** say so once, in a quiet banner. Keep stale or cached data visible; it beats blank.
- **Refresh.** `.refreshable { await model.sync() }` on a `List` or `ScrollView`; the spinner stays
  until the work returns. Land new rows with `withAnimation`.

## 8. Accessibility as polish

- **Reduce Motion.** Swap moves for fades:
  `.transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))`. HIG: tighten
  springs, replace x/y/z moves with fades, don't animate blurs. iOS 27 adds
  `.navigationTransition(.crossFade)` for pushes. Custom layers read the app's one `reduced` flag
  (`motion-craft.md` §0).
- **VoiceOver.** The label says what, the value says the state; hints are rare. A card is one element
  (`.accessibilityElement(children: .combine)`, or `.ignore` plus a composed label:
  `swiftui-gotchas.md` §3). Headers get `.accessibilityAddTraits(.isHeader)`. Custom controls add
  `.accessibilityAdjustableAction`, `.accessibilityAction(named:)`, or `.accessibilityDirectTouch` for
  gesture surfaces (WWDC26 220).
- **Voice Control:** visible text matches the label; synonyms via `.accessibilityInputLabels`. **Bold
  Text** §1, **Increase Contrast** §2; honour `accessibilityDifferentiateWithoutColor`.
- **Larger text.** Stack rather than truncate; keep the order and the primary element on top.

```swift
@Environment(\.dynamicTypeSize) private var size
// in body:
let layout = size.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
                                      : AnyLayout(HStackLayout(spacing: 8))
layout { Text(label).foregroundStyle(.secondary); Text(value).monospacedDigit() }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(label)
    .accessibilityValue(value)
// or: ViewThatFits(in: .horizontal) { HStack { … }; VStack(alignment: .leading) { … } }
```

## 9. App icon and launch

- **Icon.** Build it in Icon Composer (in Xcode 27 at
  `/Applications/Xcode.app/Contents/Applications/Icon Composer.app`, or from Apple Design Resources):
  a solid or gradient background plus foreground layers, vectors (SVG, PDF; text outlined), no baked
  shadows, highlights, bevels or blurs. Annotate default, dark and mono; clear and tinted come from
  mono. Keep the same features in every appearance. 1024 × 1024. iOS 27 renders icon glass sharper
  and allows refraction on chosen layers; Icon Composer 27 previews earlier releases (WWDC26 102).
- **Adding it.** Drag the `.icon` file into the target and set the App Icon name (General → App
  Icons) to its name without the extension. It replaces the asset-catalog icon; Apple says to keep
  the asset catalog if earlier releases must show your icon. Unconfirmed: wiring an `.icon` through
  XcodeGen (`ASSETCATALOG_COMPILER_APPICON_NAME`). Dash still ships a flat 1024 PNG.
- **Launch screen.** `UILaunchScreen` → `UIColorName`: a colour set equal to the first screen's
  background, with a dark variant (`setup-and-tooling.md` §2; Dash: `LaunchBackground`). No text, no
  logo unless the first screen has it in the same place (HIG Launching). Then the first frame is laid
  out from cached data, with no launch spinner, and restores the last tab and scroll position.

## 10. The premium review

Run it on every screen before calling it done; automate what UI tests can (`ui-testing.md` §9).
Simulator: `xcrun simctl ui <udid> appearance dark | content_size <size> | increase_contrast enabled`.

- [ ] Light and dark, each also with Increase Contrast.
- [ ] Largest accessibility size and smallest size: nothing clipped, truncated or overlapping.
- [ ] Bold Text on. Reduce Motion on: every change still shows, as a fade.
- [ ] Reduce Transparency on: bars and custom glass are solid and legible.
- [ ] VoiceOver swipe-through: what and value for each element, in reading order, no hidden-page leaks.
- [ ] Empty, loading, error and offline states all designed.
- [ ] Slow network (Network Link Conditioner): the skeleton holds its place; nothing jumps on arrival.
- [ ] One-handed: the primary action is in reach, and every target is ≥ 44 pt.
- [ ] Changing numbers don't jiggle; no stray tokens:
      `rg -n 'Color\(red:|\.system\(size:|cornerRadius: [0-9]' <App>/Screens`.
- [ ] Haptics felt on a device: each fires once, none too often.
- [ ] Resized window (DeviceHub or Previews resize handles); landscape if supported; cold launch in
      light and dark with no flash.
- [ ] Glass over the busiest content is legible at rest (iOS 27: slider at both ends).

## 11. When the user says "like our last app"

Copy the last app's tokens; don't invent new ones. The last app is Dash. Ask the user where its SwiftUI port lives (or find it with
`mdfind -name Theme.swift`); read it, never edit it. Paths are under `ios/`:

| Token | Where |
|---|---|
| Type: Space Grotesk for display, Geist for reading; 13 roles with tracking and line spacing; `.dashType()` | `Dash/Theme/Theme.swift` (`DashFont`, `DashType`) |
| Fonts | `Dash/Resources/Fonts/*.ttf`; `UIAppFonts` in `Dash/Info.plist` and `project.yml` |
| Colour roles, light and dark (Paper, Ink, Muted, Accent, Forest, SoftGreen, Outline, Surface…, LaunchBackground) | `Dash/Resources/Assets.xcassets/*.colorset`; brand constants (lime, lavender, accentInk) in `Theme.swift` |
| Curves, springs, `reduced`, press style, reveal-once | `Dash/Theme/DashMotion.swift`; count-up in `Dash/Theme/AnimatedNumber.swift` |
| Shapes and spacing: card 28, tile 24 (continuous), page margin 20, mark 44; `DashCard`, `EmptyStateCard` | `Dash/Components/DashComponents.swift` (`DashShape`) |
| Frosted bar before iOS 26 (material, tint, sheen) | `Dash/Navigation/DashBottomBar.swift` (`GlassBackground`) |
| Shimmers, both gated on `DashMotion.reduced` | `Dash/Components/RouteThumbnail.swift` (`Shimmer`), `Dash/Screens/Home/HomeHost.swift` (`ShimmerCard`) |
| Number and unit formats | `Dash/Theme/Format.swift` |
| The written spec (hexes, sizes, radii) | `reference/UI-SPEC-foundations.md` |

Copy the files, rename the prefix, keep the numbers. Then close Dash's known gaps: its colour sets
have no high-contrast values; `DashFont.display` uses `fixedSize` (check display numbers at the
largest size); its bar is a material, so add the §6 `#available` glass branch.

## Sources

Read 27 Sep 2026.
- HIG (`developer.apple.com/design/human-interface-guidelines/<page>`; JSON at
  `developer.apple.com/tutorials/data/design/human-interface-guidelines/<page>.json`): `materials`, `color`,
  `typography`, `layout` (updated 9 Sep 2026), `accessibility`, `sf-symbols`, `playing-haptics`,
  `tab-bars`, `app-icons` (updated 8 Jun 2026), `launching`, `loading`, `motion`, `dark-mode`.
- Docs: https://developer.apple.com/documentation/SwiftUI/Applying-Liquid-Glass-to-custom-views,
  https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass,
  https://developer.apple.com/documentation/Xcode/creating-your-app-icon-using-icon-composer, and the
  `SensoryFeedback` member pages (`press(_:)`, `selection(_:)`, `release(_:)`).
- WWDC26 (`developer.apple.com/videos/play/wwdc2026/<n>/`): 102 Platforms State of the Union, 269
  What's new in SwiftUI, 251 Communicate your brand identity on iOS, 220 Refine accessibility for
  custom controls. WWDC25 (`…/wwdc2025/<n>/`): 323 Build a SwiftUI app with the new design, 356 Get
  to know the new design system, 219 Meet Liquid Glass.
- SDK: Xcode 27.0 (27A266a), iPhoneSimulator27.0 `SwiftUI`, `SwiftUICore` and `Symbols`
  `.swiftinterface`. Every snippet was typechecked at `arm64-apple-ios18.0-simulator`, and a
  high-contrast colour set was compiled with actool.
