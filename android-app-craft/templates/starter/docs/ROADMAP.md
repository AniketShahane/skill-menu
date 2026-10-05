# Starter roadmap: what is not built yet

Updated <date>. `main` holds <version>: <one line on what it is>, recorded in
[docs/upgrade-<x.y>/README.md](upgrade-<x.y>/README.md). Everything below is still open, in the
order it is worth doing. Volatile facts (test counts, library versions) are not repeated here;
they live in the latest `validation.json`.

## 1. <Area>

- **<Item as an outcome, not a task>.** Why it matters, in one line. What evidence decides it
  (a measurement, a user report). What it depends on.

## 2. Verification owed

Things built but not yet proven where it counts. Each names the place it must be checked.

- **<Feature> on the real phone.** Exercised only on the emulator so far.
- **Frame timing of <transition> at 120 Hz**, release build, `scripts/measure-frames.sh`.
- **TalkBack** across <screens>.

## 3. Data safety before it is needed

- **Export and import of the user's data** before any change of signing key (a Play upload key
  changes the signature, and `install -r` then fails without an uninstall, which deletes the
  data; dash:docs/ROADMAP.md:38-41, 99-101).

## 4. Before Play

See the Play checklist in the skill's `references/delivery-process.md`. Start the 12-tester,
14-day closed test early; it sets the calendar.

## Done (moved here with the version that shipped it)

- <item> — <version>, <date>.
