# <Surface> — implementation spec

<!--
Copy this file per surface or per redesign (e.g. docs/design/home-spec.md). It sits between the
imported design (the HTML from Claude Design) and the code. Its shape is Flick's
receiver-expressive-spec.md, the most useful design document either app wrote
(flick:docs/design/receiver-expressive-spec.md; §0 invariants, §1a/§1b deliberate deviations,
§9 definition of done). Delete this comment.
-->

Source of truth for the `<surface>` build. Derived from `docs/design/<app>-design-system.html`
(Claude Design project `<id>`), reconciled against what the app can actually measure and against
Android's constraints (font scale, insets, reduced motion, 48 dp targets).

**Every agent implements against THIS file, not against the design HTML.** Where the two
disagree, this file wins, and each disagreement is listed in §2 with its reason.

Last verified against code: `<commit>`.

---

## 0. Invariants — do not touch

Behaviour that is proven and load-bearing. The build is a UI-layer change; these survive it.

- `<package or file>` — <what it does>. **No edits.**
- `<package or file>` — **additive changes only**; no behavioural edits to <path>.
- <Product rule, e.g. "every number is a real measurement; nothing animates between readings".>

### Test contracts that must keep passing

These tests assert on exact strings and tags. Renaming one breaks a test: if a rename is really
needed, change the test in the same commit and say so in the commit message.

| String or tag | Where | Test |
|---|---|---|
| `Tags.HomeList` | Home's scrolling list | `NavigationFlowTest`, `TextFitTest` |
| `Tags.DetailPage` | Detail's root | `NavigationFlowTest` |
| `Tags.BottomBar` | the floating bar | `EmulatorSupport.clearOfBottomBar` |
| `"<visible label>"` | <component> | <test> |

## 1. Scale rule

<How design px map to dp and sp. Claude Design phone frames are usually 1× CSS px = 1 dp; a TV
canvas of 1920 × 1080 px is ~960 × 540 dp, so ÷ 2 (Flick's rule).>

## 2. Deliberate deviations from the design

Each row: what the design says, what we build instead, and the measured reason. A deviation not
listed here is a bug.

| # | Design | Built | Why (measured) |
|---|---|---|---|
| 2a | <e.g. 6–8 sp mono labels> | <14 sp floor> | <unreadable at the viewing distance> |
| 2b | <e.g. chrome 28 dp from the edge> | <inside the 5 % overscan inset + 10 dp ring reserve> | <clipped on real panels> |
| 2c | <e.g. a cross-fade between pages> | <opaque slide + one-rect dim> | <full-page alpha was 26 of 32 janky frames (dash c9323c7)> |

## 3. Tokens used

Link, don't copy: `docs/design/design-tokens.md` §<n>. List only the tokens this surface adds or
the roles it uses in a way the token file does not already say.

## 4. Screens and states

For each screen: layout (top to bottom), the tokens each part uses, every state (loading, empty,
error, long content, font scale 2.0, both themes), and what is focused or selected first.

### 4.1 <Screen>

- Layout: …
- States: loading → <what>; empty → <what>; error → <problem, then the fix>.
- Numbers shown: <each once; which are measured; what shows when unknown ("—")>.

## 5. Motion

| Moment | Spec | Duration | Reduced motion |
|---|---|---|---|
| <page in> | `NavMotion.PUSH` + `Easings.Travel` | 340 ms | cut |
| <entrance> | `Reveal`, 55 ms stagger | 480 ms | lands at once |

### 5.1 The performance fence

Rules this surface must hold while it animates:
- Per-frame values are read only in `graphicsLayer`, `drawBehind`, `drawWithCache`, `offset {}`
  or `layout {}`.
- No whole-page alpha. Fades use `CompositingStrategy.ModulateAlpha`.
- At most one `rememberInfiniteTransition` on screen, and none while <the busy state> runs.
- <Anything that must never be blurred, re-measured or decoded during a transition.>

## 6. Data plumbing

<Additive only: new fields, where they come from, what the UI shows before they arrive.>

## 7. Test plan

| Claim | Test | Level |
|---|---|---|
| <motion rule> | `NavMotionTest.<name>` | JVM |
| every ink ≥ 4.5:1 | `PaletteContrastTest` | JVM |
| text fits at 2.0 | `TextFitTest` | component |
| <entrance lands once> | `MotionClockTest` | component, frozen clock |
| <the flow> | `NavigationFlowTest` | emulator |

## 8. Definition of done

- `./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug :app:assembleDebugAndroidTest` passes, run by the one Gradle runner.
- The emulator suites pass on this project's AVD (`scripts/test-emulator.sh`), with the
  per-class `OK (n tests)` lines quoted. **A compiled test APK is not a device pass.**
- Every §2 deviation is built as written; nothing else deviates.
- Both themes, font scale 1.0 / 1.3 / 2.0, animator scale 1× and 0×, TalkBack reaches every
  control, 48 dp targets.
- No text below <floor> sp; no fabricated value anywhere.
- Release build measured on the phone (`scripts/measure-frames.sh`) and the numbers recorded
  in `docs/upgrade-x.y/validation.json`; what was not run is written down as "not run".
