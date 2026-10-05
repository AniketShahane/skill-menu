# Delivering a big iOS build with parallel agents

How to run a multi-hour app build or port with Claude as the lead and several agents
working at once, without collisions, lost work, leaked secrets or false "done" claims. Dash's
numbers set the scale: 22.7k lines of Kotlin, 2 foundation agents then 7 area agents, 3.3 h
wall-clock from goal to 6 of 7 areas merged. A 114-test UI suite takes about 52 min
serially, and the motion check (3 runs) about 10–12 min.

Templates: `templates/scripts/run-ui-tests.sh`, `templates/scripts/motion-check.sh`,
`templates/project.yml`, `templates/Config/App.xcconfig`, `templates/Secrets.example.xcconfig`.
Toolchain mechanics (DEVELOPER_DIR, XcodeGen, simulators, secrets xcconfig, showing the app)
are in `setup-and-tooling.md`, and port specifics are in `porting-from-android.md`.

## 1. Goal, gates and stop conditions

**Turn the ask into gates before writing code.** A goal like "same functionality + quality +
beautiful animations, tested end to end, don't touch the Android app" is only checkable once
each phrase has a gate. Write the gates into the plan and the shared brief.

| The ask says | The gate |
|---|---|
| "exact same functionality" | Every source screen and flow has an owner. Every source instrumented test is ported, or listed as not portable with a reason. |
| "tested end to end" | Per-area suites plus cross-screen journeys through the real controller, with the `Executed N tests, with 0 failures` lines quoted |
| "looks good" | Light, dark and large-text screenshots, compared against the reference in at least 2 fix passes |
| "smooth / 120 fps" | `motion-check.sh` passes on the median of 3 runs with no loosened budget. The ProMotion key is in the built plist. The device check is listed as owed. |
| "never regress" | The guardrail is a script with an exit code, and the baseline and budgets are committed (`measuring-motion.md`) |
| "don't touch X" | A three-dot diff of X's paths is empty (§10) |

- **Keep going** through anything the gates and the source can answer. A session goal
  (`/goal`) installs a Stop hook that re-checks the condition. While agents run in the
  background, it sends idle check-ins; answer them with where each workstream stands.
- **Stop and ask** only for these:
  - outward or irreversible acts: push, merge to main, deleting user data, spending paid
    API credits;
  - replacing a signature custom design with a platform default;
  - loosening a budget;
  - a product decision the source app can't settle.

  Dash's port shipped the native zoom as a stand-in for Android's card-pieces flight without
  asking, and the flight later had to be built as a custom layer (the story is in `SKILL.md`,
  Precedence, and `porting-from-android.md` §0).

## 2. Phase order

| Phase | Who | Output |
|---|---|---|
| 0. Survey | lead | `xcode-select -p`, runtimes, XcodeGen, source size and tests, assets, secrets |
| 1. Integration branch | lead | Worktree plus branch. Gitignore `*.xcodeproj`, `build/`, `Secrets.xcconfig` and real user data **before the first commit**. |
| 2. Foundations, in parallel | 2 agents + lead | Logic package with ported tests and an API summary (`PORTING.md`). Reference specs, screenshots, motion clips and seed data. The lead meanwhile builds the shell: tokens, motion constants, navigation, tab bar. The shell is the most motion-heavy, cross-cutting part, so one hand keeps it consistent. |
| 3. Contracts commit | lead | App model, controller skeleton with its **final public surface**, one placeholder file per screen with final signatures marked `OWNED BY the <area> work`, UI-test base class plus a passing smoke test |
| 4. Fan out | 1 agent per area | Each in its own worktree, branch, simulator and DerivedData, branched from the contracts commit |
| 5. Merge | lead | Dependency order, a build after each merge, dependents re-merge (§6) |
| 6. Integrate | lead | Cross-area wiring, E2E journeys, the full suites (§7) |
| 7. Motion and signature transitions | lead + builders | See §9, `motion-craft.md` and `shared-element-flights.md` |
| 8. Close-out | lead | Verification (§11), report, cleanup, push when asked, retro |

**Why contracts first:** seven agents built against one API with additive changes only. Home's
rows called the `RouteThumbnail(record:cornerRadius:)` placeholder. The Activities agent then
replaced its body, and no call site changed.

**Order dependencies; never let a helper wait on a file nobody has written yet.** Dash's
core-port agent forked an estimator-porting helper that polled for `RunEngine.swift` before
porting its engine tests, and the parent blocked on its helpers. Nothing moved for 80 min.
Write the shared core, commit a checkpoint, then fork. Agent rosters are flat: a teammate
can't spawn named teammates ("Teammates cannot spawn other teammates — the team roster is
flat"), only unnamed subagents, so plan the whole tree from the lead.

## 3. The shared brief (`common.md`)

Every area agent's prompt begins: `First read <abs path>/common.md completely and follow
it.` One brief gave seven independent agents consistent code, tests and reports. Put in it
every gotcha already paid for; otherwise each agent pays for it again.

| Section | Contents |
|---|---|
| Goal and boundaries | The user's goal, quoted. Source of truth. The paths that are **read-only** (the other platform, its build files, backend), named explicitly. |
| Your workspace | "Work and commit only in your worktree. Commit often, with the attribution trailer. Don't push, and don't merge into other branches; the lead merges." "Use only your simulator UDID; boot with `simctl boot` + `bootstatus -b`. Never touch other simulators, emulators or devices." |
| Toolchain | `export DEVELOPER_DIR=…`, `xcodegen generate` after any file add or rename, and the exact build/test command with `-destination 'id=<UDID>' -derivedDataPath <worktree>/ios/build/dd` |
| What exists | Paths plus the **API**: package entry points ("use it, never reimplement logic the core has"), theme tokens, motion tokens, shared components, the navigator's calls, app-model properties, the test base class and its launch parameters, and the deep links |
| Conventions | Identifier rule (source test tags become `accessibilityIdentifier`), naming rule (§5), "small additive changes to shared files, backward compatible, announced" |
| Quality bar | Visual parity with 2+ compare-and-fix passes in light, dark and `-UIPreferredContentSizeCategoryName UICTContentSizeCategoryAccessibilityM`. Motion curves from the spec, honouring the reduced flag. Platform-native replacements. No heavy work in `body`. Suite covers every path the source tests cover. Unit tests for model logic. |
| Before finishing | Own suite, unit tests and whole-app build all green. Commit everything. **Report:** what you built, the `Executed` lines, screenshots compared, gaps against the source and why. |

**Per-area prompt**, below the pointer to the brief:
- worktree, branch and UDID;
- the placeholder files to replace, with signatures to keep;
- the source files to port;
- spec sections, screenshot numbers and motion clips;
- the suite name, the source tests to port, and the screenshot list;
- who owns the neighbouring shared files, and what to name things instead.

## 4. Isolation: a worktree, a simulator and a DerivedData per agent

```bash
INT=ios-port; SCR=<scratchpad>
for a in home activities start plan settings activerun tracking; do
  git worktree add -b ios-$a ../app-$a $INT
  cp ios/Secrets.xcconfig ../app-$a/ios/   # gitignored files are NOT copied by worktree add
  u=$(xcrun simctl create "App $a" "iPhone 17 Pro"); echo "$a $u" >> $SCR/sims.txt
done
```

- **Private simulator per agent, targeted by `id=`** (why, and the misleading error that
  name/OS targeting gives: `setup-and-tooling.md` §4).
- **Own DerivedData per worktree, and per configuration** (`build/dd` Debug, `build/dd-motion`
  Release; `setup-and-tooling.md` §9). That parallel agents sharing one would race is *likely*
  rather than proven: Dash never shared one, so it never saw the failure.
- **Copy the secret into every worktree with `cp`, the integration worktree included, and
  never print it.** Dash's integration worktree never had the file, so after the first round
  of merges Settings said the API key was missing (`setup-and-tooling.md` §3). Confirm it's still
  ignored: `git check-ignore -q ios/Secrets.xcconfig && echo ignored`.
- **A generated project makes merges cheap.** With `project.yml` committed and the
  `.xcodeproj` gitignored, there is no `.pbxproj` to conflict: across Dash's 9 merges of 7
  area branches into integration (and the areas' merges back), the only conflicts were in
  `RunController.swift` (§6). Regenerate after every merge (`setup-and-tooling.md` §2).

## 5. Prevent collisions by structure, not by messages

Ownership broadcasts weren't enough. Dash's merge build still failed with `invalid
redeclaration` of `AppearanceDialog`, `PlanStep`, `PlanBlock` and `dashError`, and `ambiguous
use of 'heart'` (two `Color.heart` statics).

- **Prefix every type and every `Color`/`Font` static in a screen folder with its area**
  (`PlanPieceStep`, `SettingsAppearanceDialog`, `runError`). Shared tokens live only in the
  theme.
- **Every shared file has exactly one owner**, named in the brief or in a lead message:
  "Home owns `Components/Charts.swift` and `RollingText.swift`; put yours under
  `Screens/Detail` with distinct names; I'll unify at merge."
- **Where two areas meet at a service, the consumer defines a protocol with a no-op default,
  and the service owner builds the concrete class.** At merge, a small adapter over the
  concrete class replaces the no-op: Settings' `HeartRateScanning` (default
  `NoHeartRateScanning`) got `BluetoothHeartRateScanning` over tracking's
  `BluetoothHeartRate.shared` in the lead's merge, and the run screen's `MusicControlling`
  (default `NoMusicControl`) got `SystemMusicControl` over tracking's `SystemMusicController`.
- **After each merge, scan for duplicates.** One grep lists them all; the build buries them
  among knock-on `'X' is ambiguous for type lookup` errors:
  `grep -rhoE '(struct|class|enum|protocol) [A-Z][A-Za-z0-9]*' $SRC | sort | uniq -d`, and
  `grep -rhE 'static (let|var) [a-zA-Z]+( = |: )Color' $SRC | sed -E 's/.*static (let|var) ([a-zA-Z]+).*/\2/' | sort | uniq -d`.
  Both also list nested and `private` types or statics that legitimately share a name (on
  Dash today: `Coordinator`, `Row`, `heart`), so check each hit rather than renaming blindly.
- **Rename with perl, not sed** (BSD sed has no `\b` and silently skipped Dash's renames;
  `setup-and-tooling.md` §10): `perl -pi -e 's/\bOld\b/New/g' $(grep -rl Old $SRC)`.

## 6. Merge order and conflicts

- **Merge in dependency order:** services and controllers first, then screens. Merge one
  branch at a time with `git merge --no-ff -m "Merge <area>: <what>"`. After each one:
  `xcodegen generate`, then build, then check that no secret was committed (§10).
- **Right after each merge, tell the remaining agents to re-merge:** "The integration branch
  now has X (commit). `git merge <int>`, regenerate, rebuild, re-run your suite, then commit
  and report." List the new API they should use. Dash's `RunController.swift` was touched by
  three agents and conflicted three times. Merging the real controller first, and having the
  dependents merge it, kept every later merge small.
- **Stub against real: keep the real one**, `git checkout --ours|--theirs <file>`, then
  re-apply the other side's intent by hand (a hook call site, a new property). Read
  `git diff <contracts-commit> <branch> -- <file>` first to see what that side meant.
- **Duplicate shared pieces: keep one** and point call sites at it. Dash's commit message:
  "Settings, Plan and Start each brought a private copy of a shared piece; one of each is
  kept."

## 7. Integration after merges

Agents' green reports are claims about their branch alone. The lead's job starts at merge:

- Wire what no single area could: real services behind the protocols, save and delete
  reaching sync, the finished run opening its summary.
- Write cross-screen journeys through the real controller with scripted inputs (empty
  install → run → summary → delete; plan → Start → run; a units change reaching every page;
  a screenshot tour viewed as one contact sheet). See `ui-testing.md`.
- Run everything, in the background, with a per-test cap (`ui-testing.md` §7). The area agents
  had reported green, yet the first full run after merging had 5 failures in 113 UI tests, and
  one of them hung for about **35 h** because nothing capped it. 1 was a real bug (the keyboard
  covering a sheet's buttons) and 4 were test or environment issues. (The lead's first tally,
  "136 of 141", was a mis-sum, most likely from adding up `Executed` lines: they include
  aggregate lines, and after `Restarting after unexpected exit` the aggregates carry earlier
  launches' totals. Take counts from the result bundle, `setup-and-tooling.md` §8.)
- Re-run a failure on its own before believing it (`ui-testing.md` §12).

## 8. Operating over hours

- **Commit early and often; plan for usage limits.** The limit is shared: Dash's lead and every
  agent still working (Settings, Start, Plan, Activities) stopped within the same minute, and
  nothing moved for 1 h 40 min. Two agents (Start, Settings) left useful uncommitted edits. On
  resume, read every worktree's `git status --short` and `git diff`, and fold in what's worth
  keeping.
- **Judge progress from artifacts**, not from "task still running": `git -C <wt> log -1
  --format='%cr %s'`, the newest mtime under the area's folder (`find <dir> -newer <file>`),
  the test log tail, and `ls -t build/ui-shots | head`. That is how the 80-min stall was found.
- **Kill watcher loops when their owner finishes or goes quiet.** A leftover `until grep …`
  loop in the Activities agent's shell kept Dash's lead waiting about 6 h after Activities had
  already passed 24 of 24.
- **Long runs go in the background.** Bash calls stop at 10 min (Dash's full UI suite took
  52), and foreground `sleep N` polling is refused. Start the run with `run_in_background`
  and `> build/ui-full.log 2>&1` in the worktree, then wait with a Monitor (an until-loop on
  the log) watching for
  `TEST( EXECUTE)? (SUCCEEDED|FAILED)|Restarting after unexpected exit|' failed \('`. The
  runner's `test-without-building` prints `** TEST EXECUTE SUCCEEDED **`, which a bare
  `TEST (SUCCEEDED|FAILED)` never matches.

## 9. Hard features: readers, engine, builders, adversarial review

For a signature transition or anything else about 1,000+ lines with many pitfalls (the flight
itself: `shared-element-flights.md`):

1. **Readers in parallel** map the source mechanics, both target ends and the navigation
   integration. A **critic** lists the top pitfalls, and a synthesis doc collects both.
2. **The lead writes the engine core** until it compiles, then commits a checkpoint.
3. **Builders** take one end each, in their own worktrees from that checkpoint, and a
   reviewer follows each builder.
4. **Merge**, then compare frame strips against the reference.
5. **Measure 3 runs** with the guardrail.
6. **Adversarial review with separate lenses** (parity, state, tests, perf). A skeptic
   confirms or refutes each finding.
7. **Fix,** then re-run the guardrail and the full suite.

Dash's card-pieces flight took 26 review agents. They produced 16 confirmed findings and 6
refuted, including a conditional-modifier rebuild, z-order under the page, a tab bar that
took taps mid-fold, and missing VoiceOver screen changes. Before a measurement pass, run a
docs-research agent and a static jank audit (file:line, symptom, fix, ranked) in parallel;
Dash's audit predicted most of what measurement later confirmed. Then change **one cause at a
time** and re-measure. Two plausible fixes made Dash worse: splitting the page build took the
opens' stutter from 0 to 83 and 35, and flipping accessibility at landing gave 39–40. Only
per-change numbers caught them. (The split that shipped builds both halves on still frames,
before the clock starts: `motion-craft.md` §3.)

## 10. Secrets, private data and the other platform

- **Secrets never enter git, and tests never spend paid credits.** The xcconfig mechanics
  (`#include?`, the `.example`, the `$(` guard, building without the key) are in
  `setup-and-tooling.md` §3; the key-blanking launch flag and the XCTest guard are in
  `ui-testing.md`.
- **Real user data** (Dash: real GPS tracks in `reference/seed/runs-real/`) is gitignored
  before the first commit, and `git status` is grepped for it on every commit.
- **After every merge**, check that `git ls-files | grep -iE 'secrets\.xcconfig$|<private-dir>'`
  finds nothing, and that the key still reaches the built app without printing it (the
  `plutil -extract … | wc -c` check in `setup-and-tooling.md` §3).
- **Leave the other platform alone, and prove it.** Put all new work under its own top-level
  folder, name the read-only paths in every brief, and check at the end with a **three-dot**
  diff:
  `git diff --stat main...<branch> -- app scripts mcp gradle '*.gradle.kts'`, which must print
  nothing (quote the glob, or zsh expands or rejects it). The two-dot form compares against
  main's *current* tip. Dash's check passed with two dots only because main hadn't moved yet;
  run today, the same command reports 60 files in those paths "changed" by a branch that
  touched none.

## 11. Verify before claiming done

All of these, in this order, before saying "done":

1. `xcodegen generate`, then a build. Check its exit code and grep its output for `error:`
   **before** any `test-without-building`: a failed build leaves the old binary in place
   (`setup-and-tooling.md` §7; Dash measured stale code twice).
2. Unit tests and package tests (`swift test`), then the full UI suite through the runner
   script, which caps each test (`-test-timeouts-enabled YES
   -maximum-test-execution-time-allowance 600`). Judge by the final `** TEST EXECUTE
   SUCCEEDED|FAILED **` line, `Restarting after unexpected exit`, `' failed \('` and the
   passed count against the count you expect, not by the word "error" (the noise list is in
   `setup-and-tooling.md` §8).
3. `motion-check.sh` after any UI change: 3 runs, budgets untouched, and the baseline updated
   only on purpose (`measuring-motion.md`, "What done means").
4. Screenshots in light, dark and large text, read side by side with the reference.
5. The §10 checks: the source-untouched diff and the secret checks.
6. README sections "Differences from <source>" and "Not yet verified on hardware" are current.

## 12. Report honestly

- **Numbers, not adjectives.** Quote the `Executed` lines. Give per-run values for anything
  borderline (Dash's swipe-back: median 17.3 ms/s, but 1 run in 3 is about 50). Never round
  "5 failures in 113, one after a 35 h hang" to "green".
- **Say what the simulator can't show,** and keep that list in the README (`SKILL.md`,
  Honesty).
- **Gaps against the source, each with its reason** (Dash: no Spotify control on iOS; no Live
  Activity, because it needs a widget extension).
- **Use the user's register.** Dash's user asked for three parts in plain words: what I did,
  did it work, what you do now. With no stated preference, still lead with the outcome and
  the one action they need to take.
- **Hand it over running.** Open the app seeded in a simulator and list exactly what to tap
  (mechanics in `setup-and-tooling.md`: `SIMCTL_CHILD_*`, DeviceHub on Xcode 27).

## 13. Clean up

```bash
for a in $AREAS; do b=ios-$a; w=../app-$a
  if git merge-base --is-ancestor $b $INT && [ -z "$(git -C $w status --porcelain)" ]; then
    git worktree remove $w && git branch -d $b && echo "removed $a"
  else echo "KEEP $a"; git -C $w status --short; fi   # read the diff, fold in, then --force
done; git worktree prune
while read n u; do xcrun simctl shutdown $u 2>/dev/null; xcrun simctl delete $u; done < $SCR/sims.txt
```

- Remove a worktree only when its branch is an ancestor of integration **and** its status is
  clean. Two of Dash's seven (Start, Settings) were dirty, from the usage limit. Their diffs
  were read and the useful parts re-applied and committed on the integration branch (dfb48b7)
  before `git worktree remove --force`.
- Keep one private test simulator, stop leftover Monitors and background loops
  (`pgrep -fl 'xcodebuild|until '`), and the rest of the device clean-up: `setup-and-tooling.md`
  §12.
- Copy anything worth keeping out of the scratchpad (frame-strip, profiling, parsing helpers)
  into the repo's `scripts/` or into this skill before the scratchpad is cleaned.
- Update project memory: where the branch lives, how to build and test it, and the gaps.

## 14. Push (only when asked)

Scan **what the push sends**, which is every commit not on the remote, not the tip diff
against main:

```bash
B=ios-port
git remote -v | head -2; git status --short | head
git ls-files | grep -iE 'secrets\.xcconfig$|\.p8$|\.p12$|\.mobileprovision$|<private-dir>'
git log -p $B --not --remotes=origin \
  | grep -iE '^\+.*(api[_-]?key|secret|token|password)\s*[:=]\s*["'\'']?[A-Za-z0-9_-]{16,}'
# Exact values, never echoed (not run before Dash's push; run afterwards over all of
# ios-port's history, it printed 0):
sed -n 's/^[A-Z_]* *= *//p' ios/Secrets.xcconfig | grep -v '^$' > $SCR/v
git log -p $B --not --remotes=origin | grep -cF -f $SCR/v; rm $SCR/v   # must print 0
git push -u origin $B
```

- Every hit must be explained before pushing. Dash's scan used a two-dot diff and flagged
  the committed `.example` placeholder and a dev-only sync token.
  The second was a line main had deleted after the branch point (28697ba), so the tip diff
  showed it as added, and `git log -S` showed the branch never added it. Scanning the pushed
  commits avoids that noise, and it also catches a key that was added and later deleted,
  which a tip diff misses.
- Push the feature branch. Merge to main or open a PR only when asked.

## 15. The retro that feeds this skill

The steps (collect, generalise, place, correct, templates, evals, version) are the Retro
protocol in `SKILL.md`. What a multi-agent build adds to them:

1. **Mine the evidence in parallel.** Give agents segments of the transcript JSONL, the agent
   reports, the app's `MOTION.md` "Lessons the numbers taught", and its doc comments. Each
   lesson comes out as
   `- [<source>|<verified|likely|speculative>] RULE: … WHY: … EVIDENCE: <file:line, error text, number>`.
2. **Classify each lesson against the skill:**
   - **new:** add it, at most *likely* until a second app confirms it;
   - **confirmed:** add the new evidence and promote it to *verified*;
   - **contradicted:** rewrite it, or mark it superseded, with the evidence.
3. **Record the toolchain** (Xcode, iOS SDK and runtime, Swift mode, platform floor) with each
   app. APIs and gotchas move with it: Xcode 27 has no Simulator.app.
4. **Re-derive budgets** once numbers from a real device exist. Dash's are simulator-only
   at 60 Hz.

What is still open after Dash lives in `lessons-log.md` ("Open, or unverified on a device"),
`measuring-motion.md` (device hitches, FrameProbe at 120 Hz) and `ui-testing.md` §16.
