# Starter <x.y>: <one word for what this version is about>

<!--
Copy this folder to docs/upgrade-<x.y>/ for every version that reaches the phone. Fill in
validation.json and, after the phone install, phone-install.json. Add screens/ with emulator
captures (synthetic data only), light and dark, numbered in tour order: 01-home-light.png,
02-home-dark.png, … Include one mid-transition frame for any new motion. Real-phone captures stay
private and are never committed.

The shape is Dash's (dash:docs/upgrade-0.9.1/README.md): why → what changed → install →
measure → validation → not done. Delete this comment.
-->

Updated <day month year>. <One or two sentences: what the previous version did, what was wrong
or missing, and what this one changes. "<x.y> changes nothing about what the app does and
everything about how it is built and painted" is the register.>

## Why <it stuttered / it was needed>

Numbered causes, each with its evidence. A cause without evidence is a guess; label it so.

1. **<Cause, as a finding>.** <Evidence: the command and what it printed, e.g. `dumpsys
   package <pkg>` showed `flags=[ DEBUGGABLE ]`. The budget it broke, e.g. an 8.3 ms frame at
   120 Hz.>
2. **<Cause>.** <Evidence.>

## What changed

One bullet per mechanism. Name the file and say what it now does, not that it "was improved".

- **<Mechanism>** (`app/src/main/.../<File>.kt`): <what it does now, and the number it bought>.
- **<Mechanism>** (`<file>`): <…>.

## Install

```sh
source scripts/android-env.sh
./gradlew :app:assembleRelease
scripts/install-phone.sh
```

The second command needs the phone on USB or wireless debugging (`APP_PHONE_SERIAL`) and no
<live session> in progress. It prints the installed version and flags before and after (expect
no `DEBUGGABLE`), backs up data while the installed build is still debuggable, installs with
`install -r`, and compiles with `cmd package compile -m speed -f`.

## Measure

```sh
scripts/measure-frames.sh after
```

<Say what the tour does and that it refuses to tap unless the app is focused.>

Measured on <device class, Android version, resolution, refresh rate> on <date>, same tour,
about <n> frames each:

| Build | Janky frames | p50 | p90 | p95 | p99 | Slow UI thread | Missed vsync |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| <previous version>, <build type> | <%> | <ms> | <ms> | <ms> | <ms> | <n> | <n> |
| <this version>, release, AOT | <%> | <ms> | <ms> | <ms> | <ms> | <n> | <n> |

<One paragraph on reading the table: which display mode was active during every tour (from
`dumpsys display`), and which number to watch. Dash's note: "the SurfaceFlinger ids in the same
dump are zero-based, which is easy to misread as 80 Hz".>

## Validation

Recorded in [validation.json](validation.json), <date>, on `<branch>` at `<commit>`.

- JVM: <n> tests pass, <n> fail, <n> skipped (<why>). Lint: <errors> errors, <warnings>
  warnings on debug and release.
- Emulator (`<avd>`, <build type>): <classes and test counts>. <Every re-run and every
  test-side fix, honestly: "three classes needed a second run after the helper learnt about lazy
  pages".>
- Release build smoke-tested by hand on the emulator with R8 on: <screens>; no crash in logcat.
  Screenshots (synthetic data) are in [screens/](screens/).
- Phone: <installed with scripts/install-phone.sh; data backed up and byte-identical after; see
  phone-install.json> — or — <not installed; say why>.

### Not done

Name everything this version did not prove. A missing line here reads as a pass.

- <e.g. an outdoor run on <x.y>; TalkBack on the new bar; a listening test.>
- <e.g. the phone suite ran on the TV device, not on a phone: not evidence for the phone path.>
