# Theme and type

How to give a new app a designed palette, faces, corners and spacing, and how to keep them
honest with tests. The starter ships all of it as a placeholder you replace. The numbers
from Dash and Flick are evidence, not targets.

Last verified against `templates/starter/app/src/main/java/com/example/starter/ui/theme/`
on 2026-09-27. If you change a token, change its figure here and in its KDoc, or delete
the figure. A stale number is worse than none (§13).

Principles live in android-design; this file does not repeat them:
`android-design/references/color-and-theming.md` §1-9, `copy-and-type.md` Part 2,
`material-expressive.md` §5-6, `icons.md`. Where the apps proved it wrong, see
`references/android-design-corrections.md` (Type 6-9).

## 0. What the starter gives you, and how to replace it

| File | Holds |
|---|---|
| `ui/theme/AppColors.kt` | `AppColors` (job-named roles), `LightColors`, `DarkColors`, `LocalAppColors` |
| `ui/theme/AppTheme.kt` | `AppTheme(...)`, `AppTheme.colors`, the ColorScheme projection, window sync |
| `ui/theme/Type.kt` | three `FontFamily`s, `BundledFaces`, `AppTypography` (30 roles), `AppText` |
| `ui/theme/Shape.kt`, `Space.kt` | `AppCorners`, `AppShapes`, `PillShape`, `SheetShape`, `AppSpace` |
| `ui/theme/Appearance.kt` | `ThemePreference`, `ThemeStore` (prefs + per-app night mode) |
| `ui/theme/FontWarmup.kt` | `startFontWarmup(context)` |
| `ui/theme/AppIcons.kt` | six hand-drawn `ImageVector`s and the two builders |
| `res/values{,-night}{,-v31}/themes.xml` | the cold-start plates |
| `res/mipmap-anydpi/ic_launcher{,_round}.xml`, `res/drawable/ic_launcher_*.xml` | a placeholder adaptive launcher icon (§12) |
| `test/.../PaletteContrastTest.kt`, `ThemePlateTest.kt` | the palette's contract |

To make it yours, in this order:

1. Derive the direction first (`references/design-direction.md`). Write the thesis as one
   sentence in the four slots listed in design-direction §1, one of which is the top of
   `AppColors.kt`.
2. Replace every value in `LightColors` and `DarkColors`. Design dark as its own set (§2).
3. Run `./gradlew :app:testDebugUnitTest`. Fix failures by moving colours, never by
   lowering a floor. A floor you cannot meet becomes a ratchet (§6), with the number written down.
4. Copy the new canvases into the four `themes.xml` files. `ThemePlateTest` fails until you do.
5. Rewrite every KDoc figure you touched: tone (L*), relative chroma, contrast on each ground.
6. Swap faces if the direction asks for it (§9-10), keeping the three jobs.

## 1. The theme is three layers

**Rule.** A product palette in a CompositionLocal, projected into a real `ColorScheme`,
inside `MaterialExpressiveTheme(motionScheme = MotionScheme.expressive())`.

**Why.** Screens read jobs (`AppTheme.colors.onSurfaceDim`) and never see a hex. Stock
Material components still get the brand, because every role they draw with is set. Flick's
phone app has 120 palette reads and no hex outside `ui/theme`. Dash only aliased
`MaterialTheme.colorScheme` with look-names (`Forest` is white in light mode). Its screens
then rebuilt missing roles as local `if (DashIsDark) … else Color(0x…)`, with hex literals
in 9 UI files outside the theme.

**How.** `AppTheme.kt`:
```kotlin
CompositionLocalProvider(LocalAppColors provides colors, LocalReducedMotion provides rememberReducedMotion()) {
    MaterialExpressiveTheme(colorScheme = appColorScheme(colors, base, dynamic),
        motionScheme = MotionScheme.expressive(), shapes = AppShapes, typography = AppTypography, content = content)
}
```
- `LocalAppColors` is `staticCompositionLocalOf`. A palette swap repaints everything anyway,
  so per-reader tracking buys nothing (the same argument Flick makes for `LocalThemePreference`,
  sender `Appearance.kt:46-49`).
- The projection sets every role a stock component draws with, including `inversePrimary`:
  the other set's action, 11.30:1 on the light snackbar ground and 8.74:1 on the dark one.
  The 12 `*Fixed` roles (`primaryFixed` … `onTertiaryFixedVariant`) are left at the base
  scheme: baseline purple, or the wallpaper when dynamic colour is on. No stock material3
  1.5.0-alpha24 component reads them; app code that does must map them first.
- Selection (nav indicator, selected chip) is `secondaryContainer`. The starter maps it
  to the action family, because selection is a state of the action. The accent is a mark
  and never means "selected".

**Evidence.** `examples/flick/sender/Theme.kt:132-192`, `examples/flick/sender/Color.kt:23-86,729`;
`examples/sample/ui/Theme.kt (`AppTheme`, `LocalAppColors`)`.

## 2. Each theme is a designed set, and dark is not light inverted

**Rule.** Write the dark palette from scratch, to three rules:

1. **Raised means lighter.** Canvas < raised < tonal, in luminance.
2. **Dark's raise is wider than light's.** A shadow draws nothing on near-black, so on
   dark the tonal step is the only edge. The floor is the light set's own canvas-to-raised
   step.
3. **Surfaces carry the brand as a tint, not a wash.** Relative chroma (channel spread ÷
   brightest channel) under 60%.

**Why.** Flick's dark theme was once an alias of its cinematic set. Its sheet came out
darker than the page it sat on (1.017:1, inverted). Its canvas-to-sheet step was 1.051:1
against light's 1.082:1. The hue ran at about 80% relative chroma. Nothing failed
(flick@b2a3a8f). The designed set steps 1.141:1 the right way, at one hue (225°) and half
the chroma.

**How.** Starter values. Tone is CIELAB L*, which is what M3 calls tone:

| Role | Light | Dark | Note |
|---|---|---|---|
| canvas = surface | `#F5F5FA` tone 97 | `#0E0F16` tone 4 | Never pure black; one value, and every step above it is a raise |
| surfaceRaised | `#FFFFFF` | `#1A1C28` tone 11 | Light 1.087:1, dark 1.129:1 above the canvas |
| surfaceTonal | `#E9E8F5` | `#23253A` | Chips, fields. With dynamic colour on, Material's copies of this role and of surfaceRaised (Low/High) take the wallpaper tone; `AppColors` itself never changes |
| primary | `#3024B5` tone 27 | `#C8C4FF` tone 81 | Dark action is a light tone of the same hue (M3's shape) |
| onSurfaceFaint | `#5F5F7A` | `#9A9AB2` | ≥ 4.5:1 on every surface, both sets |

- The dark action goes luminous rather than saturated. Flick's saturated blue on near-black
  held only 4.33:1 on the sheet and 3.45:1 on a card (flick@b2a3a8f). Flick's own argument
  against blue for fine lines on dark: "about 2 % of retinal cones are blue-sensitive and the
  eye focuses blue in front of the retina" (sender `Color.kt:160-165`; the literature more
  often puts S-cones at 5-10 %, and the design point does not depend on the figure). Flick
  swapped to gold for the action and kept blue for areas only (`Color.kt:152-182`, flick@a0ebf75).
- Ink on a warm fill is warm. A cool near-black reads grey on gold (sender `Color.kt:184-189`).
- A dark scrim is heavier than a light one: 65% against 50%. A page that is already dark
  has to be taken almost to nothing before a sheet over it reads as raised.

**Evidence.** `examples/flick/sender/Color.kt:128-150,512-593`;
`templates/starter/.../ui/theme/AppColors.kt`.

## 3. Fixed brand step-outs, held by a test

**Rule.** A colour may refuse to follow the theme only if it is the brand, and only while
a test pins it to one constant.

**Why.** Code built from the constant can then stay a plain `val`. Flick's scrub-bar and FAB
brushes are `val`s in the hottest draw path. Making them palette-aware would cost "a shader
allocation and a `remember` slot per call … to return a byte-identical brush"
(sender `Color.kt:606-617`). A test (`theMediaAccentIsTheSameAmberInEverySet…`,
`FlickColorsTest.kt:260`) holds the pin, so it fails before a mismatched gradient ships.

**How.**
- Dash keeps lime as `primaryContainer` in both themes. In light, `primary` leaves the brand
  hue: lime on the light page is 1.06:1, and forest `#345122` is 8.37:1. The rule from its
  docs: "Fixed bright brand panels use fixed dark foregrounds" (`dash:docs/light-mode/README.md:5`).
- The starter pins `accent`/`onAccent` (citron `#D4F25A` / `#1C2400`, 12.79:1) in both sets:
  `theAccentIsTheSamePaintInBothSets`. On dark it is a mark (15.15:1 on the canvas). On light
  it is 1.16:1, so there it may only be a fill that carries its ink. That limit is written in
  its KDoc, because no test can see a call site.
- A step-out must still differ from the status colours. `theAccentIsNeverMistakenForTheWarning`
  holds a luminance step of at least 1.5 (today 1.65:1, and 38° of hue apart). The first placeholder was a tangerine at
  1.13:1 from the amber caution, the same paint.

## 4. Polarity-aware roles and derived inks

When a ground inverts between sets (inverse surface, a gold fill), the ink or accent on it
needs its own role. Flick shipped three accent-on-inverse defects at 1.45, 1.31 and 2.09:1
before `sparkInverse` existed (sender `Color.kt:251-260`). See android-design
`color-and-theming.md` §4.

The starter derives two such roles in `AppColors.kt`, next to the palette so the test can
measure them:
- `onTrouble`: white on the light red (6.04:1), the night canvas on the dark salmon (6.94:1).
  White on the salmon would be 2.75:1.
- `troubleContainer`: trouble at 10% (light) and 16% (dark). At 20% dark would clear by
  only 0.02 (4.52:1 over the raised surface); 16% gives 4.85:1.

## 5. Dynamic colour is confined, or off

**Rule.** Default `dynamicColor = false`. If it is on, wallpaper colour reaches only
`surfaceVariant`, `surfaceContainer`, `…Low`, `…High`, `…Highest`. Never the action, the ink,
status, or the page.

**Why.** An identity the wallpaper can repaint is not an identity. Flick confines it this way
(sender `Theme.kt:37-39,173-181`); Dash and the TV never use it. The 12 `*Fixed` roles also
come from the wallpaper when it is on (§1).

**Test it on the JVM, not on wallpapers.** Dynamic tones are fixed per role (material3
1.5.0-alpha24, `dynamicDarkColorScheme31`): light 90-96; dark `surfaceContainerLow` 10,
`surfaceContainer` 12, `High` 17, `Highest` 22, and `surfaceVariant` 30. Luminance depends
only on tone (tone is L*), so a grey of that L* gives the exact figure for every wallpaper.
Light holds (worst: positive 4.54:1 on tone 90). Dark does not: the starter's
`onSurfaceFaint` `#9A9AB2` and `trouble` `#FF6B78` fall to 3.40:1 and 3.39:1 on tone 30 and
4.49:1 and 4.48:1 on tone 22. Raise those inks, or keep dynamic colour off. Checked for the
API 31 path; the API 34+ path reads system colour resources and was not checked.

Related but separate: SystemUI's media card takes its colours from the artwork and ignores
`setColor` (flick@f16ae49). Flick removed the amber mat that beat it, because the card
taking the film's colour is the better trade (flick@776a338).

## 6. Contrast is a JVM test, measured on what is drawn

**Rule.** Palette structure and contrast are unit tests on the JVM. Compose `Color` works
there with no Robolectric. Ship `PaletteContrastTest` and keep it green.

**Why.** Every defect it catches looks like a flat or cheap app, not a bug. Flick's dark
theme broke elevation and shipped marks at 1.31-2.67:1 with no failing test
(flick@b2a3a8f, a0ebf75). Dash has no contrast test.

**What the starter asserts** (helpers verbatim from `FlickColorsTest.kt:575-602`):

| Test | Floor |
|---|---|
| raised lighter than surface and canvas | luminance order |
| elevation step | light > 1.05; dark ≥ light |
| tonal surface off the page / primaryContainer off raised | 1.1 / 1.2 |
| every ink × every surface, incl. the glass bar as drawn over canvas and raised | 4.5 |
| every filled control's ink (primary, container, accent, caution, trouble) | 4.5 |
| trouble on its own container over canvas and raised | 4.5 |
| ink ramp monotonic | order |
| outline on canvas and raised | 3.0 (WCAG 1.4.11) |
| action vs trouble | 1.6 luminance step |
| accent vs caution | 1.5 |
| accent pinned in both sets; a mark on dark surfaces | equality; 3.0 |
| dark surfaces tinted | relative chroma < 0.6 |
| bar ink over canvas, raised and tonal, as GlassBar draws it | 4.5 |
| a media bar (18 % backdrop showing) over the worst photo | 4.5 |
| the bar lets the backdrop take part | drawn coverage ≤ 0.92 |

**Measure what is drawn.** A translucent fill has no colour until it is composited, so test
`fill.over(ground)`, never the fill. Flick's nav sheen ended its gradient on the labels. The
test measured ink on bare glass (4.88:1) while the device drew 4.31:1. The fix held the wash
below the labels, and the test now reads the gradient's real stop positions
(sender `Color.kt:308-332`, `FlickColorsTest.kt:403-440`). Use only surfaces the app really
paints ink on. Asserting pairs that never meet costs a real design decision and buys nothing.

**Why luminance, not hue, for "never the same paint."** Hue alone can fail (red against
green is the classic pair colour-blind users lose), so two states that can replace each
other also differ in luminance. Flick set 1.6 for primary against caution, two fills that
share one seat in its link pill and are never drawn on each other (`FlickColorsTest.kt:221-243`).
The starter applies the same floor to primary against trouble.

**Ratchets.** When a palette the owner likes misses a floor, do not quietly move an anchored
ink. Pin each role just under where it stands, so the gap can close but not deepen, and write
the shortfall down. Flick's light set: onSurfaceFaint 3.29:1 and trouble 4.10:1 on its card
fill, pinned at 3.25 and 4.05 (`FlickColorsTest.kt:129-164`). The starter's
`aRatchetLooksLikeThis` is a worked example.

**Pixels, too.** JVM tests cannot see system bars or recreation. Dash samples median gutter
and bar luminance on the emulator after theme switches (> 0.5 light, < 0.25 dark)
(`examples/sample/androidTest/ThemePresentationTest.kt (`lightThemeKeepsTheTopStripBright`)`). See `references/testing.md`.

## 7. Glass over media has measured densities

**Rule.** A glass fill's opacity is set by the worst backdrop it floats over, not by the mock.
Test ink over black (light glass) and over white (dark glass).

**Why.** Flick's TV glass, copied from the mock at 13%, left labels at 3.3:1 over a white
frame. It went to 34%, and panels from 50% to 88% (receiver `Color.kt:47-87`,
`PlaybackContrastTest.kt:12-21`). An amber seek wash at 16% made bright frames brighter,
down to 2.4:1, until a dark bed went under it (`Color.kt:241-253`).

**How.**
- `AppColors.glass` is only the glass's hue (opaque `#F7F7FC` light, `#1C1E2C` dark).
  GlassBar replaces its alpha: it covers `1 - BarBackdropVisibility` = 40 % of the page
  (`GlassBar.kt`, `BarBackdropVisibility = 0.60`; dark spends 14 % of that on a black floor).
  `glassFallbackTint` is the same composite as one colour. Test that, never `AppColors.glass`.
- As drawn, the starter's bar holds onSurfaceDim at 7.94:1 (light) and 9.15:1 (dark) over
  its own canvas. Over a black or white photo it falls to 1.43:1 and 1.25:1; over a mid-grey
  one, 3.93:1 and 3.61:1. So the starter's bar is legible only over the app's own surfaces,
  and `PaletteContrastTest` asserts exactly that (`theBarInkHoldsOverWhatScrollsUnderIt`).
- An app that scrolls photos or video under its bar lowers the backdrop visibility or adds a
  scrim, and tests `glassFallbackTint(c, v).over(worst)`. With the starter's palette, 18 %
  showing clears 4.5:1 for onSurface, onSurfaceDim and primary in both sets
  (`aBarOverMediaIsSizedByTheWorstBackdrop`); dark onSurfaceDim fails above 18.7 %.
- The no-blur fallback must draw the same material the blur tints with. A backdrop that is
  black or white edge to edge stays so under blur, so the worst-backdrop figure is a floor
  for the blurred bar too. The tint function lives in `references/components.md`.
- Media on a `SurfaceView` cannot be blurred by any backdrop effect. Flick's TV chrome is
  glass without blur for that reason (receiver `Theme.kt:108-127`).
- Test a translucent layer as a stack: bed, glass, sheen, then ink. Flick's receiver places
  each chrome row as a fraction of the 540 dp canvas and composites them over a white frame
  (`examples/flick/test/PlaybackContrastTest.kt`).

## 8. Appearance preference and the cold-start plate

**Rule.** System / Light / Dark, stored as explicit strings, written with `commit()`, read
synchronously before `setContent`, and handed to the platform so the plate and splash follow.

**How** (`Appearance.kt`, `MainActivity.kt`):
- `ThemePreference(val stored: String)`. Renaming an enum entry must not reset the choice.
  Dash stores `name` and would. Unknown values fall back to `SYSTEM`.
- `ThemeStore.save` uses `commit()`: "a preference that loses the tap that set it is worse
  than no preference" (flick sender `Appearance.kt:64-69`).
- The choice lives in snapshot state, not an activity recreate. A recreate restarts every
  transition in flight.
- **API 31+:** `UiModeManager.setApplicationNightMode(AUTO | NO | YES)`. `ThemeStore` calls
  it on save and again on load (a prefs file restored from backup arrives without it).
  `MODE_NIGHT_AUTO` is what stores *no* override; leaving `NO` behind would ignore the phone
  forever. It is a configuration change, so the manifest's `MainActivity` needs
  `android:configChanges="uiMode"`, or the tap recreates the activity
  (flick sender `MainActivity.kt:167-205`). Below 31 there is no per-app mode without AppCompat.
- **The plate.** `themes.xml` in four buckets, parented on platform
  `Theme.Material(.Light).NoActionBar`, with no AppCompat. Night outranks the version
  qualifier, so `values-night-v31` must repeat the night style plus the splash attribute.
  A qualified bucket replaces the style; it does not merge.
- `ThemePlateTest` reads the four files from the module directory. It asserts each declares
  `Theme.Starter`, then holds `windowBackground` and `windowSplashScreenBackground` to the
  Kotlin canvas. Plate drift is invisible on warm launches and on emulators that keep the
  process alive (flick@b2a3a8f).
- Repaint the window from the composed palette (`window.setBackgroundDrawable`). It is the
  first frame the choice owns below API 31 and on the launch the choice is made. `AppTheme`
  does it on first composition and on every change. Flick also does it in `onCreate` before
  `setContent` (sender `MainActivity.kt:95-107`), which is one frame earlier; the starter
  does not.
- **Android 15:** call `WindowCompat.setDecorFitsSystemWindows(window, false)` *before*
  `super.onCreate`. After a recreate, early Android 15 restored stale dark bar backgrounds
  over light content. Updating only the icon colours did not fix it
  (`dash:docs/light-mode/README.md:15`, `dash:app/src/main/java/com/dash/run/MainActivity.kt:21-24`).
- Re-assert bar icon contrast when the window gains focus. "Android can reapply the launch
  theme when the window first attaches, after Compose's initial side effect"
  (dash `MainActivity.kt:57-69`). `AppTheme` does this with a focus listener.
- `window.isNavigationBarContrastEnforced = false` on API 29+, or the platform paints a
  translucent band across your floating bar.

Dash has three `themes.xml` buckets (`values`, `-v27`, `-v31`), none night-qualified and
none setting `windowBackground`. Every style parents the dark `Theme.Material.NoActionBar`,
and the v31 splash is fixed to ink `#10110F`. So a light-mode user on API 31+ gets an ink
splash and a dark plate before Compose paints paper. Read from the XML; not verified on a device.

## 9. Fonts: bundled, static, declared, warmed

**Bundle `res/font`. Never a downloadable-font provider.** Flick's `font_certs.xml` shipped
an empty certificate array. The provider could not authenticate, and "neither app has ever
rendered the typography its theme declared" (flick@40791d0). No error, no crash. The same
commit found subtitles in the platform face at weight 400: `CaptionStyleCompat` had a null
typeface. Every text path that is not Compose needs the face handed to it.

**Declare exactly the weights you use.** An undeclared weight silently resolves to the
nearest one. An unused file is dead APK weight. The starter declares 8 faces, about 650 KB:
Bricolage 700/800, Geist 400/500/600/700, Geist Mono 500/600. Flick's phone app declares
Geist ExtraBold for four emphasized roles (`bodyLargeEmphasized`, `labelLarge/Medium/SmallEmphasized`)
and for `copy(fontWeight = ExtraBold)` call sites (sender `Type.kt:185,188-190`). Its own KDoc
at `:29-31`, which says no style uses it, predates those roles (added in flick@958b17a).

**Cut static instances from a variable font.** Neither app uses variable axes at runtime.
Static files keep `FontWeight` resolution exact. Dash's method (`dash:docs/design/README.md:14`
names fontTools' `varLib.instancer`), as a loop written for this skill and not yet run:
```sh
pip install fonttools
for w in 400:regular 500:medium 600:semibold 700:bold; do
  python3 -m fontTools.varLib.instancer 'Geist[wght].ttf' wght=${w%%:*} --static --update-name-table \
    -o app/src/main/res/font/geist_${w##*:}.ttf
done
cp OFL.txt app/src/main/assets/licenses/OFL-Geist.txt
```
Resource names must be lowercase `a-z0-9_`. Ship each OFL licence in `assets/licenses/`.

**Check what the font actually contains.** Whether `"tnum"` or `"zero"` does anything
depends on the file's GSUB table:
```sh
python3 -c "from fontTools.ttLib import TTFont; t=TTFont('geist_mono_medium.ttf'); \
print(sorted({r.FeatureTag for r in t['GSUB'].table.FeatureList.FeatureRecord}))"
```
The bundled Geist Mono has neither feature: `ccmp, dnom, frac, locl, numr`. It needs neither,
because its digits all advance 0.6 em and its default zero is already slashed (3 contours
against the O's 2). Geist has `tnum`; its slashed zero is `ss09`. The starter's Geist is the
full cut from Dash (975 glyphs, 90 KB). Flick's phone cut is subset (792 glyphs, 73 KB) and
lacks `ss09`. Never mix two cuts of one family.

**Warm the faces off the main thread.** `Font(resId)` is Blocking: each typeface is parsed
inside the first measure that needs it. `startFontWarmup(context)` runs
`ResourcesCompat.getFont` for every id in `BundledFaces` on a daemon thread, before
`setContent`. That fills the process typeface cache, which Compose's resource path then hits
(flick receiver `FontWarmup.kt`, `MainActivity.kt:46-53`). Compose's
`FontFamily.Resolver.preload()` does resolve Blocking fonts (ui-text 1.12.0 bytecode), but
from a `LaunchedEffect` it runs on the main thread after the first composition. `AppTheme`
keeps it only as a second pass. The dispute and how to measure it: `references/performance.md`.

## 10. The type scale

**Rule.** Three jobs: a display face for titles and hero numbers, a body face for everything
read, a mono face for running numbers. Set all 30 `Typography` roles.

| Role | Dash | Flick phone | Starter |
|---|---|---|---|
| displayLarge | Space Grotesk Bold 54/53, −2.4 sp | Bricolage ExtraBold 44/42, −0.045 em | Flick's |
| displayMedium | (derived) | 34/34, −0.045 em | Flick's |
| headlineLarge | 34/38, −1 sp | 30/31, −0.04 em | Flick's |
| titleLarge | 23/28, −0.7 sp | 23/24, −0.035 em | Flick's |
| titleMedium | Medium 16/22 | Bold 19/23, −0.03 em | Flick's |
| bodyLarge | Geist 16/23 + tnum | Geist Bold 14.5/19.5 | Geist Regular 16/23, tnum, 0 |
| bodyMedium | Geist 14/20 + tnum | Geist SemiBold 12.5/17 | Geist Regular 14/20, tnum, 0 |
| labelLarge | Space Grotesk Bold 14/20 | Geist Bold 14.5/17 | Geist SemiBold 14/18, tnum, 0 |
| mono | none | Geist Mono SemiBold 11-25 sp | `AppText.eyebrow`, `monoValue` |

- **Display leading at or under 1.0×** on a phone. Both apps do it (54/53, 44/42, 34/34).
  M3's "~1.2× display" is for its own faces. Only the TV uses ≥ 1.3×.
- **`"tnum"` on every role that shows a changing number.** Geist's default digits are
  proportional: a "4:37 left" countdown changed width every second (dash@1940b64). Set codes
  that are read aloud or typed (a pairing code) in the mono face, which is fixed-width with a
  slashed zero by default. On Geist use `"tnum, ss09"` (its slashed zero is `ss09`; it has no
  `zero` feature). The starter keeps `"tnum, zero"` on mono only as declared intent (§9).
- **Pin body tracking to 0.** Material's +0.5 sp small-text tracking suits Roboto. On Geist it
  set Dash's run-screen text a line longer (dash `Theme.kt:138-145`). Pinning it also stops
  `ProvideTextStyle` leaking a display role's negative tracking into a button label (flick
  sender `Type.kt:120-123`). TV is the exception: +0.005 em (`references/tv.md`).
- **Emphasized roles differ from their base.** Expressive components read them. With the
  30-role `Typography` constructor an omitted emphasized role falls back to M3's token style
  in the platform face; with the 15-role constructor it equals its base. Either way, set all
  30. When the base is already the face's heaviest weight, emphasis is 0.005 em tighter
  tracking (Flick). Otherwise it is one visible weight step: Regular → SemiBold (Dash; Medium
  is too close to see), SemiBold → Bold. Dash ships its display-face emphasized roles
  identical to their base, all but `titleMedium` (Medium → Bold). Don't.
- **`TextMotion.Animated` when text scales.** The starter's reveal scales cards 0.97 → 1, and
  glyphs positioned for a static layout shimmer under the scale (dash@03174fc). The cost is
  lost pixel-snapping on static text, slightly softer at low density. An app with no scaled
  text should drop it.
- **A dedicated mono beats `tnum` on a proportional face** for timecodes and codes: "the
  digits in a telemetry readout and the digits in a label finally share a design"
  (flick@40791d0). `tnum` on the body face is the lighter option for numbers inside prose.
- **Ten-foot type** has floors enforced by clamping helpers (14 sp minimum, Medium minimum,
  loose tracking). See `references/tv.md` and `examples/flick/receiver/Type.kt:35-214`.

## 11. Corners and spacing are named scales

**Corners.** Name radii by the component: `AppCorners.card 26, tile 20, sheet 36, button 17,
chip 13, bar 34` (Flick's phone values). Map Material's five `Shapes` slots onto them.
Neither app maps its radii to M3's slots by name. Flick names 19 radii by component
(`full` = 999 dp, and 18 from 13 to 36 dp, many off-grid: 13, 15, 17, 19, 22, 26, 30, 34, 36;
sender `Shape.kt:9-27`). Dash's most-used radii sit on
M3 steps (16 dp ×13, 28 ×12, 20 ×11), but it wrote 16 distinct values by hand. Keep a named
scale whose values are a product decision.
- Pills are `RoundedCornerShape(percent = 50)`, never `999.dp`. Material morphs corners in
  pixels, and a 999 dp radius "sits at 'still a pill' for almost the whole travel and then
  snaps" (sender `Shape.kt:40-47`).
- A sheet rounds only its top edge (`SheetShape`).

**Spacing.** Choose a gap by the relationship between the two things, not by the number
(flick receiver `Dimens.kt:95-116`):

| Token | dp | Between |
|---|---|---|
| Xs | 6 | parts of one thing (icon and label) |
| Sm | 10 | siblings in a stack |
| Md | 16 | elements within a group |
| Lg | 24 | groups within a column |
| Xl | 40 | major regions |
| Gutter | 16 | page side margin |
| ReadingWidth | 680 | max column width on wide screens (~87 characters of 16 sp Geist) |

"Shrink content, keep gaps": when a screen is too full, components get smaller and gaps stay
(`Dimens.kt:18-21`). The receiver is the only complete scale in either app. Dash's gaps were
8 ×36, 12 ×22, 4 ×21 … as literals. A hairline is 1 dp, or `Dp.Hairline` for exactly 1 px;
`Modifier.border` rounds sub-pixel widths up, so thinner values do not draw thinner.

## 12. Icons: hand-drawn vectors, one grid

**Rule.** One family, one grid (24 units), one stroke (1.8-2.0), round caps and joins.
The starter hand-draws its six glyphs as `ImageVector`s with Flick's `strokeIcon`/`fillIcon`
builders, and has no icon-library dependency.

- Flick authors all 33 phone glyphs this way (`examples/flick/sender/FlickIcons.kt`). Use an
  even-odd fill to knock one shape out of another, because an `ImageVector` carries one tint
  (the starter's `Info`).
- Dash ships `material-icons-extended:1.7.8`, Rounded. That library is frozen and no longer
  recommended, but it works and is fast to start with. android-design calls it removed from
  material3; Dash shows it still builds.
- For a new app: Material Symbols Rounded vector XML for the catalogue, and hand-drawn
  `ImageVector`s on the same grid for the gaps and the brand glyphs. See android-design
  `icons.md` for optical size and knockouts.

**Launcher icon.** The starter ships a placeholder adaptive icon: a citron ring and dot on
the light action colour (`res/mipmap-anydpi/ic_launcher{,_round}.xml`, layers in
`res/drawable/ic_launcher_{background,foreground,monochrome}.xml`). Replace all three layers
together.
- **Three layers, vectors.** Background (full bleed, no detail), foreground (the mark), and
  monochrome (the mark as one flat shape; Android 13+ tints it for themed icons, and without it
  a themed home screen shows your icon untinted among tinted ones). With minSdk 26 the
  `mipmap-anydpi` file is the only icon needed; no PNG densities.
- **The 66 % safe zone.** Each layer is a 108 dp canvas. The launcher masks it to a circle,
  squircle or other shape and may shift it for parallax, so only the centred 66 dp circle is
  guaranteed visible. Keep the mark inside it with room to spare: the placeholder stays in
  48 dp. Dash's generated mark occupies 58 % × 54 % of its canvas for the same reason
  (`dash:docs/design/README.md:20`).
- **Where the mark comes from.** The thesis, not a mood board: write the mark's prompt from
  the thesis (design-direction §1.1 shows Dash's), have it drawn, then trace it into vector
  paths on the 108 grid. A raster mark forces PNG densities back in.
- The manifest names both: `android:icon="@mipmap/ic_launcher"` and
  `android:roundIcon="@mipmap/ic_launcher_round"`. Without them lint reports
  `MissingApplicationIcon`.

## 13. Design docs go stale; the KDoc is the spec

**Rule.** The measured rationale lives in KDoc next to each token: tone, chroma, contrast on
each ground, and the defect it fixed. A design doc carries a "last verified against code"
date, or a test.

**Why.** `flick:docs/design/design-tokens.md` calls itself the "single source of truth". It
still documents the coral `#FF6B57` / cyan / ivory palette and 12-40 corners. The palette
swapped to blue/amber in flick@7fe301e (2026-07-24). A later edit (flick@958b17a, 2026-07-26)
patched §1.3 to move TV focus from cyan to amber while leaving the coral and ivory palette
beside it: the doc was half-updated, not forgotten, which misleads more. It also claims the TV wraps `MaterialExpressiveTheme`, which it does not. An agent reading
it would rebuild a retired design.

**How.** Date-stamp the token doc's header against a commit. When you change a token, change
its KDoc figure in the same commit. Record deliberate deviations from the mock in a spec with
"Invariants — do not touch" and "(deliberate deviation)" sections, as Flick's
`docs/design/receiver-expressive-spec.md` does. The template is
`templates/starter/docs/design/spec-template.md`.

## Symptom → cause → fix

| Symptom | Cause | Fix |
|---|---|---|
| Dark mode looks flat; cards have no edge | Raised surface darker than, or too close to, the canvas (Flick 1.017:1) | Designed dark set; `aRaisedSurfaceIsLighter…`, `theElevationStep…` |
| Dark mode reads as a different, navy app | Surfaces at ~80% relative chroma | Tint, don't wash: < 60% |
| App renders in the platform face everywhere, with no error | Downloadable-font provider with an empty cert array | Bundle `res/font` |
| Subtitles or a notification in the wrong face | A non-Compose text path got a null typeface | Hand it the bundled `Typeface` |
| A countdown or count-up jiggles sideways | Proportional digits | `"tnum"` on every number-bearing role |
| Body text a line longer than the design | Material's +0.5 sp small-text tracking on a custom face | `letterSpacing = 0.em` on body roles |
| Button label picks up a heading's tight tracking | Unspecified tracking inherits through `ProvideTextStyle` | Pin tracking on every role |
| Glyphs shimmer while a card scales in | Static text layout under a scale | `TextMotion.Animated` |
| An expressive component shows the platform face | Emphasized roles unset (30-role constructor) | Set all 30 roles |
| A pill snaps at the end of a corner morph | `RoundedCornerShape(999.dp)` | `percent = 50` |
| Cold start flashes the old colour, then settles | Plate hex drifted from the Kotlin canvas | `ThemePlateTest`; update all four buckets |
| Dark user on a light phone sees a white splash | Splash resolved from the phone's night mode | `setApplicationNightMode` (API 31+), `values-night-v31` |
| Theme tap restarts the whole activity | Per-app night mode is a config change | `android:configChanges="uiMode"` |
| Light app shows dark bar backgrounds after recreate (Android 15) | Window fitting applied after decor creation | `setDecorFitsSystemWindows(window, false)` before `super.onCreate` |
| Bar icons wrong right after launch | Launch theme re-applied on window attach | Re-assert on window focus |
| Test says 4.9:1, device shows 4.3:1 | Test measured a surface the app never draws (glass without its sheen) | Composite the real stack, read real stop positions |
| Labels vanish on glass over a bright photo | Glass density copied from the mock, or tested on a paint the bar never draws | Size coverage against the worst backdrop; test `glassFallbackTint(...).over(worst)` |
| Wallpaper recolours buttons and ink | Dynamic colour reached anchored roles | Confine it to the tonal containers |
| An agent rebuilds a retired palette | The token doc outlived the code | Date-stamp the doc; KDoc is the spec |
