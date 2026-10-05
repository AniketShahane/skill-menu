# Changelog

Each entry says which app a change came from, what changed and why. Newest first.

## 1.0.0 · 2026-09-27 · from Dash and Flick

First version, distilled from two shipped apps:
- **Dash** (Kotlin + Compose running app, 0.9 → 0.12.1, Sep 2026) at `69037db`: the
  production UI, the 0.9.1 smoothness pass (8.5 % → 1.5 % janky frames), card-to-page
  piece-by-piece flights, the frosted bar, the chart kit, the emulator and phone scripts.
- **Flick** (phone sender + Android TV receiver, Jul–Sep 2026) at `a6bda78`: the palette
  system and its contrast tests, bundled type, Expressive motion on phone and TV, the TV focus
  system, baseline profiles, the Play release runbook.

What's in it:
- **SKILL.md**: the principle, precedence, the learning loop and retro, the workflow, the
  15 costliest rules, working with agents, and a map.
- **references/**: setup-and-tooling, design-direction, theme-and-type, data-and-state,
  motion-system, navigation-and-shared-elements, components, tv, performance, testing,
  delivery-process, android-design-corrections.
- **templates/starter/**: a generic app that builds and passes its JVM tests — theme
  (palette local → ColorScheme → MaterialExpressiveTheme, bundled Bricolage/Geist/Geist Mono,
  off-thread font warm-up, appearance store, cold-start plates), motion (named curves,
  springs, reveal-once, draw-phase count-up, off-composition press, live reduced motion),
  navigation (pure `NavMotion` + host with opaque slides, flat dim, predictive back,
  frame-rate vote), components (glass bar, cards, states, chart, info button), JVM and
  instrumented tests, a baseline-profile module, device scripts, and doc templates.
- **templates/new-app.sh**: scaffold a new app from the starter.
- **examples/**: Flick's files copied from its public repo, plus generic examples written
  for this skill from Dash's techniques (Dash's repo is private), with a where-to-look table.
- **lessons-log.md**: the lessons behind the rules, and open items to verify on the next app.
- **evals/evals.json**: 10 prompts — new app, jank, hero transition, identity, TV focus,
  install on the phone, the retro, a do-nothing counterexample, adding a tab with a flight
  from two openers, and real storage.

How it was checked before release:
- Every reference was fact-checked by an adversarial reviewer against the two repos, their git
  history and the library jars; 49 must-fix and ~100 smaller findings were re-verified and
  applied (or rejected with a reason). A fresh-eyes run of a "new habit tracker" prompt found
  two traps (two tab lists; a detail opened from a second tab lost its flight) — both fixed in
  the starter, with tests.
- The starter was scaffolded with `new-app.sh` under two names and built: assembleDebug,
  assembleRelease (R8), the benchmark and baseline-profile variants, 80 JVM tests, lint with
  0 errors; on a fresh emulator all 3 instrumented classes passed (navigation flow, text fit
  at font scale 1 / 1.3 / 2, frozen-clock motion), with screenshots and a transition contact
  sheet reviewed.
- `FontFamily.Resolver.preload()` behaviour was settled from bytecode (see lessons-log).

Also: `android-design/SKILL.md` got a short pointer to this skill and its corrections list.
