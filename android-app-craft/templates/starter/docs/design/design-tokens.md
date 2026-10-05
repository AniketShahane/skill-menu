# Starter design tokens

**Last verified against code: `<commit>` on `<date>`** (`app/src/main/java/com/example/starter/ui/theme/`).
When this file and the code disagree, the code is what ships. Fix one or the other in the same
change, and bump the line above. Flick's token doc called itself "canonical" and still listed the
retired coral/cyan palette months after the code moved to blue/amber (flick:docs/design/
design-tokens.md:11-16 vs flick:sender/.../Color.kt:91-104); the next agent built against it.

Visual source: `docs/design/<app>-design-system.html` (Claude Design project `<id>`), and the
reference frame the user chose: `docs/design/references/<file>.png`, SHA-256 `<hash>`.
<If nothing was imported, write instead: "Visual source: none imported (<reason>, <date>)",
and derive the tables below from the brief's thesis. A later import replaces this line.>

**Thesis:** <one sentence>. **Hero moments:** <one or two>.

Jobs never swap: <primary> means a tap; <accent> means a mark that is not a tap; <positive /
caution / trouble> mean state. <Say what each hue is never used for.>

---

## 1. Color

### 1.1 Dark — "<name of the dark set>"

| Token | Hex | Use |
|---|---|---|
| `canvas` | `#…` | page ground — tinted, never `#000` |
| `surface` | `#…` | default card |
| `surfaceRaised` | `#…` | raised card; lighter than `surface` |
| `surfaceTonal` | `#…` | chips, tonal fields |
| `glass` | `rgba(…)` | floating bar fill over content |
| `glassBorder` | `rgba(…)` | 1 px rim on glass |
| `onSurface` | `#…` | primary ink |
| `onSurfaceDim` | `#…` | secondary ink |
| `onSurfaceFaint` | `#…` | captions; still ≥ 3:1 |
| `outline` | `#…` | dividers, unfocused borders |
| `outlineHairline` | `rgba(…)` | card borders |
| `scrim` | `rgba(…)` | behind sheets and dialogs |

### 1.2 Light — "<name of the light set>"

| Token | Hex | Use |
|---|---|---|
| `canvas` | `#…` | page ground — warm or cool on purpose, not clinical white |
| … | | |

### 1.3 Brand — the jobs (both themes)

| Token | Light | Dark | Job |
|---|---|---|---|
| `primary` / `onPrimary` | `#…` / `#…` | `#…` / `#…` | every tap target that is the main action |
| `primaryContainer` / `onPrimaryContainer` | | | quiet selected state |
| `accent` / `onAccent` | | | a mark that is not a tap: a chart line, a badge |

### 1.4 State

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `positive` | | | healthy, done |
| `caution` / `onCaution` | | | needs attention, not broken |
| `trouble` | | | failed; never the same paint as `primary` |

### 1.5 Fixed per-type hues (if the app has item types)

Same hex in both themes, always with dark ink on top, so every type reads apart on either
canvas (Dash's rule: dash:ui/components/DashComponents.kt:316-328, commit 9c1380b).

| Type | Hex | Ink |
|---|---|---|
| `<type>` | `#…` | `#…` |

### 1.6 Contrast, as tested

`app/src/test/.../ui/theme/PaletteContrastTest.kt` holds these. Quote the measured ratio here
when you change a color.

| Pair | Light | Dark | Floor |
|---|---|---|---|
| `onSurface` on `surfaceRaised` | | | 4.5 |
| `onSurfaceFaint` on `canvas` | | | 3.0 |
| `onPrimary` on `primary` | | | 4.5 |
| `surfaceRaised` vs `surface` (elevation step) | | | raised is lighter in dark |

### 1.7 Dynamic color

<Off by default, or: only `surfaceContainer*` take the wallpaper tint; brand and state roles
stay anchored.>

### 1.8 Semantic role mapping (job → Material 3 `ColorScheme` role)

The app's palette is the source; the `ColorScheme` is a projection of it so Material components
paint in the brand. Screens read `AppTheme.colors`, never `MaterialTheme.colorScheme`, except
inside stock Material components.

| Job | App token | M3 role(s) it fills |
|---|---|---|
| page ground | `canvas` | `background`, `surface` |
| contained content | `surface`, `surfaceRaised` | `surfaceContainer`, `surfaceContainerHigh` |
| quiet fields | `surfaceTonal` | `surfaceVariant`, `surfaceContainerHighest` |
| main tap | `primary` / `onPrimary` | `primary` / `onPrimary` |
| selected, quiet | `primaryContainer` | `primaryContainer`, `secondaryContainer` |
| a mark that is not a tap | `accent` | `tertiary` |
| failure | `trouble` | `error` |
| lines | `outline`, `outlineHairline` | `outline`, `outlineVariant` |

---

## 2. Typography

Faces are bundled in `res/font` (no downloadable provider: Flick's never rendered once because
its certificate array was empty, commit 40791d0). Licences in `assets/licenses/`.

- **Display:** <face>, weights <…>.
- **Body:** <face>, weights <…>.
- **Mono / figures:** <face>, `fontFeatureSettings = "tnum"` (add `zero` if users type codes).

| Role | Face | Size / line | Weight | Tracking |
|---|---|---|---|---|
| `displayLarge` | | | | |
| `headlineLarge` | | | | |
| `titleLarge` | | | | |
| `bodyLarge` | | | | 0 sp |
| `labelLarge` | | | | |
| `AppText.heroNumber` | | | | tabular |
| `AppText.eyebrow` | | | | |

## 3. Shape and spacing

| Corner | dp | Use |
|---|---|---|
| `card` | | |
| `tile` | | |
| `sheet` | | top corners only |
| `button` | | |
| `chip` | | |
| `bar` | | the floating bar |

Spacing ramp (`AppSpace`): `Xs · Sm · Md · Lg · Xl`, gutter `<…>`, reading width 680 dp.
Minimum target 48 dp.

## 4. Elevation and glass

- Glass bar: blur `<…> dp` at half-resolution input, tint `glass` at `<…>` alpha (dark) /
  `<…>` (light); fallback tint `<…>` where blur is unavailable, so it reads as the same bar.
- Shadows: <none / values>. Rim: <…>. Sheen: <…>.

## 5. Icons

<One family, one grid (24 dp), one stroke (e.g. 1.8), round caps. Hand-drawn `AppIcons` for the
gaps.>

## 6. Motion

| Name | Curve / spring | Duration | Job |
|---|---|---|---|
| `Easings.Arrive` | `(0.05, 0.7, 0.1, 1)` | | arrivals from off screen only |
| `Easings.Travel` | `(0.2, 0, 0, 1)` | | journeys wholly on screen |
| `Easings.Glide` | `(0.35, 0, 0.15, 1)` | 400 ms | tab slides |
| `Springs.Snappy` | damping / stiffness | — | interruptible geometry |
| … | | | |

Measured values never animate. Reduced motion: <what each moment becomes>.

## 7. The hero

<Beats, timings and the tokens each beat uses. Link the spec: `docs/design/<hero>-spec.md`.>
