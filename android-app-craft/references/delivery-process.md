# Delivery process: docs, lanes, agents, releases, Play, and the retro

How Dash and Flick went from an idea to a shipped build with several agents working at once,
without collisions, leaked secrets, lost user data or false "done" claims. The starter carries
the templates: `templates/starter/CLAUDE.md`, `AGENTS.md`, `docs/CONTRACT.md`,
`docs/ROADMAP.md`, `docs/design/{brief,design-tokens,spec-template}.md`, `docs/upgrade-template/`.

The iOS sister skill's `delivery-process.md` covers worktrees, shared briefs and merge order in
depth; the rules there hold on Android too. This file covers what is Android- or user-specific.

---

## 1. Design documents come before code

- **Rule:** brief → a Claude Design system (one HTML page) → `design-tokens.md` → a spec per
  surface → code. Each step narrows. Only the Claude Design step may be skipped, and only as a
  recorded skip (below); the others never are.
- **Why:** Flick's redesign ran seven lanes against one written system and landed it on both
  apps. Where a doc was skipped or went stale, agents built against the wrong thing (§6).
- **How:**
  1. `docs/design/brief.md`: the prompt. One committed direction, both themes, the hero named up
     front. `references/design-direction.md` says how to derive it.
  2. The imported artifact: `docs/design/<app>-design-system.html`, with its Claude Design
     project id recorded. If the user picks a reference frame, pin it by SHA-256
     (flick:docs/design/design-tokens.md:3-6).
     - **Who runs it.** A Claude Code session cannot drive Claude Design itself. It fills
       `brief.md`, then either uses a design tool or Artifact type for designs if the host lists
       one, or hands the brief to the user to paste into Claude Design as one message. Ask once,
       and keep working on what does not depend on the palette (data layer, navigation, tests)
       while the user does it.
     - **Bringing it back.** The user saves or pastes the returned page; the session stores it
       as `docs/design/<app>-design-system.html` and fills the project line at the foot of
       `brief.md` (project id, file name, date).
     - **The recorded skip.** If the user declines, or no design tool is available, derive the
       tokens straight into `design-tokens.md` from the brief's thesis
       (`references/design-direction.md`), and write `Visual source: none imported (<reason>,
       <date>)` at the top of it. A later import replaces the line. Never skip silently: the
       next session must be able to tell "no design yet" from "design lost".
  3. `docs/design/design-tokens.md`: tables per layer, with a "Last verified against code" line.
  4. `docs/design/<surface>-spec.md` from `spec-template.md`: invariants, test contracts,
     deliberate deviations, definition of done.
- **A redesign plan adds** (flick:docs/design/redesign-plan.md): a worktree and baseline
  contract (`git merge-base --is-ancestor`), the platform decision, a **toolchain gate** ("if the
  dependency/toolchain gate fails, stop"), a migration order per screen, a **preservation
  boundary** naming what must not change, the lane table, a verification matrix (API 26 / 31+ /
  37; light, dark, three dynamic palettes; font 1.0 / 1.3 / 2.0; animator 1× and 0×; TalkBack;
  48 dp targets), and a definition of done that refuses "test APK compiled" as a device pass.

## 2. A contract, and one owner per file

- **Rule:** before fanning out, write `docs/CONTRACT.md`: the data types, the API seams, and
  which lane owns which package. Change the contract before the code.
- **Why:** parallel agents that share names but not files never collide and never wait. Dash's
  first contract fixed the data classes and signatures and assigned "core agent owns core/ and
  JVM tests … service agent owns tracking/ … UI agent owns ui/ and MainActivity … Root owns build
  scaffolding, integration, QA and docs" (dash:docs/CONTRACT.md:2-20).
- **How:**
  - Partition by module (`:sender` vs `:receiver`) or by package (`ui/theme`, `ui/motion`,
    `ui/screens`). No file has two owners.
  - Screen lanes start only after their module's token API is frozen
    (flick:docs/design/redesign-plan.md:188-210).
  - Where two lanes meet at a service, one defines the interface with a no-op default and the
    other implements it. The integrator wires them.
  - Test tags are part of the contract. Renaming one breaks a test; the spec lists them.

## 3. The orchestration pattern (the user's standing rule)

- **Rule** (flick:CLAUDE.md:75-80, as updated in commit 14fdc91):
  - **Opus (medium) sub-agents implement**, partitioned so they never edit the same files.
  - **Opus (xhigh) verifies adversarially**, against the files. (Flick's redesign review ran
    "per-finding refutation" as well, flick:HANDOFF.md:59-61; that was how one review was run,
    not the rule, and it is no reason to spawn a verifier per finding.)
  - **Opus (medium) sub-agents fix confirmed findings only.** An unconfirmed finding is not work.
  - **Fable only after repeated Opus rounds have failed.**
  - **Exactly ONE agent runs Gradle.** Concurrent builds clash on the daemon, the build
    directory and the configuration cache. Everyone else writes code and says what to run.
- **Why:** it is what worked. Flick's redesign: "Workflow A (2 Opus-xhigh implementers
  partitioned by module + a single Gradle runner) → Workflow B (Fable 6-lens adversarial review
  with per-finding refutation + a Codex pass → Opus fixes). 75 verified findings"
  (flick:HANDOFF.md:58-64). The effort levels were later lowered to medium implementers with an
  xhigh verifier; follow the current rule, not the history.
- **As Dash practised it:** five parallel pieces of work on separate branches, each validated on
  the emulator before the merge and again after it (dash:docs/upgrade-0.9.4/README.md,
  Validation); then review → fix commits (616ff58 → 763cf97 "Fix what the adversarial review
  found in heart rate" → 71781c9 "Close the second review").
- **Billing boundary:** anything user-triggered and billed (`/code-review ultra`) is launched by
  the user from the CLI, not by an agent (flick:HANDOFF.md:22-23).
- **The build integrator** makes no product edits during builds; it reports failures back to the
  owning lane.

## 4. A consequential plan is attacked before anyone builds it

- **Rule:** think → have a sub-agent attack the plan against the files → show the user → then
  implement. Do not start while the review is pending.
- **Why:** on another production repo, the attack returned UNSOUND on a plan that would have
  broken the mechanism preventing duplicate actions. Three of six planned changes were dropped.
- **How:**
  - Give the attacker repo access. Demand file:line for every claim, and report claims that are
    false, overstated, or true-but-misleading.
  - Demand a verdict (SOUND / UNSOUND) plus must-fix, should-fix and could-not-verify lists.
  - Tell it the plan is wrong and its job is to break it. A plan that survives unchanged was not
    attacked hard enough.
  - Verify its top findings yourself. It is a research assistant, not a signature.
- **"Consequential"** means: user data, signing, a migration, the persistence format, anything
  irreversible, anything billed.

## 5. Every version gets a folder, a record, and a git rhythm

- **Rule:** each version that reaches the phone gets `docs/upgrade-x.y/` with `README.md`,
  `screens/`, `validation.json`, and `phone-install.json` after the install.
- **Why:** it is the only place a number stays true. Dash's 0.9.1 folder still says exactly
  what was measured on 14 September 2026, while its README drifted (§6).
- **How:** copy `templates/starter/docs/upgrade-template/`.
  - **README shape** (dash:docs/upgrade-0.9.1/README.md): *Why it stuttered* (numbered causes,
    each with evidence) → *What changed* (one bullet per mechanism, naming the file) →
    *Install* → *Measure* (a before/after table) → *Validation* → *Not done*.
  - **validation.json:** `recordedAtUtc`, `version`, `versionCode`, `branch`, `apk`,
    `apkSha256`, `build`; `jvm{tests,failed,skipped,skippedReason,newTests}`;
    `lint{debug,release}{errors,warnings}`; `emulator{avd,serial,build,classes{…},tests,note}`;
    `phone` as an object or a string such as `"not installed; the phone was not connected"`;
    anything else as `"not run on x.y"`. The emulator `note` records re-runs and test-side fixes
    honestly.
  - **phone-install.json:** device (no serial), before, backup (`committed: false`), install
    command and sha, after with a **byte-identity check of the user's files**, and a `distNote`:
    "debug builds are not byte-reproducible", so trust the sha of the APK actually installed.
  - **screens/:** emulator, synthetic data, light and dark, numbered in tour order, one
    mid-transition frame. Real-phone captures stay private.
- **The git rhythm** (Dash 0.9.0): the feature commit (b3b57f6) → "Adapt the emulator suites to
  the production UI and record validation" (f74cf3b) → "Record the 0.9.0 phone installation"
  (e036afe) → "Note the rebuilt dist APK checksum" (019c3e6). One idea per commit, titled as a
  sentence about what the user sees (`android-design/references/components-and-verification.md §8`).

## 6. Living docs drift; dated snapshots don't

- **Rule:** volatile facts (versions, test counts, library pins, what passed) go only into dated
  per-version files. Living docs (README, CLAUDE.md, tokens) point at them and carry a "last
  verified against `<commit>`" line.
- **Why:** every living doc in both apps drifted.
  - dash:README.md said "Current local build 0.11.0" and pinned "Compose BOM 2025.08.00,
    Material 3 1.5.0-alpha01"; the build file had 0.12.1, BOM 2026.06.01, alpha18.
  - flick:README.md said versionCode 3 and "29 sender and 38 receiver JVM tests"; the build had
    versionCode 5 and 1,933 `@Test`s.
  - dash:docs/TESTING.md said the script was "clearing Dash's data"; the script says "no app-data
    reset".
  - flick:docs/design/design-tokens.md, "canonical", still described coral/cyan months after the
    code shipped blue/amber. Commit 336280a names it: "the docs outrunning the code".
  - flick:AGENTS.md kept an old orchestration rule after CLAUDE.md changed (commit 14fdc91).
- **How:** one agent-instructions file (`CLAUDE.md`) and a pointer (`AGENTS.md`); a verified-at
  line on every token or spec doc; the README links the latest `docs/upgrade-x.y/`.

## 7. Public-repo hygiene, enforced in code

- **Rule:** start every app with Flick's rules, even when the repo is private: never commit
  secrets, real emails, Wi-Fi names, device serials, private IPs or personal paths; commit with
  the GitHub noreply address.
- **Why:** a private repo drifts looser: a device serial committed as a script default, or a
  personal backend URL as a build-config default. Making it public later means rewriting history.
- **How (mechanisms, not intentions):**
  - Keys come from gitignored `local.properties` or the environment, are validated by charset,
    and default to empty, so a clone builds and degrades honestly.
  - Upload signing is **all-or-nothing** and throws naming the missing field, never the value
    (flick:sender/build.gradle.kts:136-165). Release falls back to the debug key.
  - Scripts take the device from the environment and fail loudly:
    `PHONE=${APP_PHONE_SERIAL:?set APP_PHONE_SERIAL — run: adb devices}`
    (flick:docs/store/codec-matrix-test.sh:20-22).
  - Screenshots are redacted by script: the LAN address becomes a documentation-range fixture,
    the paired phone a test-fixture model, and the status bar is repainted because "One UI
    ignores SystemUI demo mode" (flick:docs/store/frame-screenshots.py:103-165).
  - An exploit-level security audit is gitignored; `SECURITY.md` is the public summary.
  - `.gitignore` must not swallow `src/release/`. A `release/` line dropped Flick's generated
    baseline profiles: both apps shipped a profile with **zero** of their own classes
    (`grep -c 'com/flick/'` = 0) until `!**/src/release/**` went in (commit 50a7a9a).
  - Before any push: `rg -n` for serial-shaped strings, private IPv4 ranges with
    `'\b(192\.168|10|172\.(1[6-9]|2\d|3[01]))\.\d+\.\d+'`, `@gmail`, `/Users/`, and
    `git log --format='%ae' | sort -u`. Review the IP hits by hand: the pattern also matches a
    version string such as `10.2.1.4`, and the emulator's own `10.0.2.2` is expected.

## 8. Play release prep (dates as Flick recorded them, 7 August 2026)

Play's rules move; re-check each against Google's pages on the day. Flick's runbook
(flick:docs/play-release.md, 653 lines) was "researched against Google's own policy pages on
7 August 2026. Where a rule has a date attached, the date is given."

| Requirement | As recorded | Check |
|---|---|---|
| Closed test before production | **12 testers opted in for 14 continuous days** (personal accounts created after 13 Nov 2023); opting out resets that tester's clock | start day 0; ~21 days minimum to production |
| Target API | `targetSdk = 36` by **31 Aug 2026** | `app/build.gradle.kts` |
| 16 KB page sizes | every 64-bit `.so` aligned by **1 Aug 2026** | parse the ELF program headers out of the AAB: `p_align = 16384` |
| 64-bit | in force | every 32-bit library has a 64-bit twin |
| Format | Android App Bundle | `bundleRelease` |
| Upload key | valid past Oct 2033 | Flick's: RSA 2048, to 2053 |
| Phone screenshots | long side ≤ 2× short side | 1440×3120 is 2.167:1 and is rejected; composite onto 1080×1920 |

- **Back up the upload keystore before anything else.** It lives outside the repo; losing it
  loses the listing.
- **The first three screenshots are the pitch;** Play shows about three in search results.
- **Data safety is re-derived from the tree that will ship, not re-read.** Flick's first draft
  declared an email-and-password sign-in the code never performs. After 84 files changed it was
  re-derived again: "A verification does not survive a diff that size" (commits d960069,
  13f404b). Every claim in the Console pack "was read out of the code, not assumed"
  (flick:docs/launch/play-console.md:1-4).
- **App access instructions** are written for a reviewer who has never seen the app ("the field
  most likely to decide the review"). A two-device app ships reviewer APK links.
- **Privacy policy:** a self-contained page (light and dark CSS) on GitHub Pages.
- **Store graphics** are rendered from the app's own vectors; never let a model draw the lockup,
  "because models mangle letterforms".
- **Keep a risk register** with likelihood and the action (flick:docs/play-release.md §9) and a
  day-0 checklist (§10).
- **Signing and user data:** a Play upload key changes the signature, so `install -r` over the
  debug-key build fails. Ship in-app export/import **before** the switch
  (dash:docs/ROADMAP.md:98-101). Keeping the user's data across installs:
  `references/data-and-state.md` §9.

## 9. Research gets a decision record

- **Rule:** research lives in `research/` with a README that indexes numbered reports, states
  the combined verdict, and marks superseded rows with strikethrough and a date.
- **Why:** the next session needs the conclusion and the evidence separately, so it can overturn
  one without discarding the other. Flick's record keeps "The one test that gated the
  architecture — RUN, and the answer is no" next to the raw `pm list features` output
  (flick:research/README.md:3-8, 45-57).
- **How:** per effort, 5 research agents + 5 adversarial verifiers + 1 synthesis
  (flick:research/README.md:3). Run the falsifying experiment before writing "impossible"
  (user memory, isolate-the-variable-before-settling: a correct measurement carried a wrong
  conclusion for a week).

## 10. The retro feeds this skill

- **Rule:** at the end of a project or a big milestone, run the retro in `SKILL.md` ("This skill
  learns"). It is part of done.
- **How, in short** (the protocol itself lives in SKILL.md; don't fork it here):
  - During the work, append raw entries to `lessons-log.md` the moment something costs ~20
    minutes or contradicts a measurement.
  - At the end, generalise each into a rule with one line of evidence, place it in the reference
    it belongs to, and mark the log entry `→ promoted to <file>`.
  - Fold proven code back into `templates/starter/` and re-copy improved shipped files into
    `examples/`.
  - Correct wrong rules in place (`corrected <date>: <why>`); put disagreements with
    android-design in `references/android-design-corrections.md`.
  - Add an eval for each new failure mode, and a `CHANGELOG.md` entry.

## 11. Symptom → cause → fix

| Symptom | Cause | Fix |
|---|---|---|
| Two agents' builds fail at random | more than one agent ran Gradle | one integrator runs every build |
| A merge redeclares a type or color | two lanes wrote the same shared file or name | one owner per file; prefix lane-local names; contract first |
| An agent built the old palette | the token doc was stale | "last verified against" line; code wins; fix both in one change |
| `AGENTS.md` and `CLAUDE.md` disagree | two full copies | `AGENTS.md` is a pointer |
| README states a test count nobody can reproduce | volatile fact in a living doc | move it to `validation.json`, link it |
| "Tested" in the notes, but it never ran on hardware | a compiled test APK taken as a pass | name the path (A/B/C); write "not run" |
| A plan shipped a bug the repo's own journal forbade | nobody attacked the plan against the files | §4 before building |
| Release profile does nothing | `.gitignore` swallowed `src/release/` | un-ignore it; `grep -c '<your/package>'` in the packaged profile |
| Data safety form declares something false | answers copied, not derived | re-derive from the shipping tree, per upload |
| Screenshot upload rejected | phone capture over 2:1 | composite onto 1080×1920 |
| The user's data is gone after an update | uninstall, clear data, or a signature change | release on the debug key, `install -r`; export before any key change |
| A serial or IP is in `git log -p` | a script default or a doc example | env vars with `:?`; a pre-push `rg` scan |
