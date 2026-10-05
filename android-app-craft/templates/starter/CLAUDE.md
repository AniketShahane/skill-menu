# Starter — Claude project notes

<!-- Replace this paragraph on day one. Say, in the user's words: what the app does, for whom,
     and the one-sentence design thesis (docs/design/brief.md). Then name the one or two hero
     moments. Delete this comment. -->
**What it is:** _one paragraph — what the app does and for whom._
**Thesis:** _one sentence, from the subject, e.g. "high-visibility kit on asphalt" (written for Dash after the fact)._
**Hero moments:** _one or two, named._

Package `com.example.starter`, one `:app` module plus `:baselineprofile`. Kotlin, Jetpack
Compose, Material 3 Expressive (`MaterialExpressiveTheme`, material3 1.5.0-alpha24).

**Skill:** started from `~/.claude/skills/android-app-craft`; read it before Android work here.
When something surprises you (a build break, a pin that fought back, a measurement that
disagreed with the skill), add it to that skill's `lessons-log.md`.

## Build

Every command runs from the repo root with JDK 21. `scripts/android-env.sh` finds the JDK and SDK
and exports `JAVA_HOME`, `ANDROID_HOME` and `PATH`; source it once per shell.

```sh
source scripts/android-env.sh && ./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug   # the everyday gate
./gradlew :app:assembleRelease                                     # the build you measure
./gradlew :app:assembleDebugAndroidTest                            # compiles the emulator suites
```

Without the env script, prefix each command: `JAVA_HOME="$(/usr/libexec/java_home -v 21)" ./gradlew …`.

- The `JAVA_HOME` prefix is required: the Gradle *launcher* needs it even when
  `org.gradle.java.home` is set, and the system default JDK is too new for AGP 9.3 / Gradle 9.5.
- `local.properties` (gitignored) holds `sdk.dir=…`; `new-app.sh` wrote it. On a new machine,
  copy `local.properties.example`, or rely on the `ANDROID_HOME` the env script exports.
- An agent's shell forgets `JAVA_HOME` between tool calls: keep `source … && ./gradlew …` on one line.
- **The first build on a machine needs network.** Plugin markers resolve at configuration time,
  even under `apply false`. After that, `--offline` works.
- "BUILD SUCCESSFUL in 1s" after a source change means nothing compiled. Check the task ran.

### Emulator and phone

| Task | Command | Notes |
| --- | --- | --- |
| Start this project's AVD | `scripts/start-emulator.sh` | Own AVD (`APP_AVD_NAME`), own port (`APP_EMULATOR_PORT`); headless unless `APP_EMULATOR_GUI=1` |
| Emulator suites | `scripts/test-emulator.sh` | Refuses any device but this AVD; runs each class, keeps a log per class |
| Named classes only | `scripts/test-emulator.sh NavigationFlowTest MotionClockTest` | `APP_TEST_RELEASE=1` runs them against the minified release (`-PappTestRelease=true`) |
| Tap by the accessibility tree | `scripts/tap-by-tree.sh --list` / `<label>` | refuses unless the app has window focus |
| Install on the phone | `scripts/install-phone.sh` | `install -r` of the release build, then AOT compile. Never uninstall, never clear data |
| Frame tour | `scripts/measure-frames.sh <label>` | Release build, on the phone; refuses to tap unless the app is focused |
| Transition strip | `scripts/record-transition.sh <name>` | screenrecord → contact sheet at 25 fps |
| Baseline profile | `./gradlew :app:generateReleaseBaselineProfile` | Needs the matching device; writes into `app/src/release/generated/` |

The phone is chosen by `APP_PHONE_SERIAL` (its adb id or hardware serial; `scripts/android-env.sh`
exports the match as `APP_PHONE` and never picks an emulator). No serial is ever committed.

### Build types

Keep this table in step with `app/build.gradle.kts`.

| Type | Minified | Debuggable | Signed with | Purpose |
| --- | --- | --- | --- | --- |
| `debug` | no | yes | debug key | day-to-day; interpreted/JIT, no profile. **Never judge motion on it** |
| `release` | yes (R8 + resource shrink) | no | upload key if all four fields are set, else the debug key | the real app; carries the baseline profile; what the phone runs |
| `benchmark` | no | no | debug key | Macrobenchmark target: AOT-compiled but symbol-readable |
| `nonMinifiedRelease`, `benchmarkRelease` | made by the baseline-profile plugin | | | profile generation and comparison |

Release is signed with the debug key on purpose: `adb install -r` over an earlier debug build then
keeps the user's data. It is a local identity, not a distribution one. The upload keystore lives
outside the repo; signing is all-or-nothing and the build fails naming the missing field, never
its value.

## Working agreements

- **Orchestration (user-mandated).** Substantial work fans out as agents:
  - Opus (medium) sub-agents implement, partitioned by module or package so no two edit the
    same file. `docs/CONTRACT.md` says who owns what.
  - Opus (xhigh) verifies adversarially, one finding at a time, against the files.
  - Opus (medium) sub-agents fix **confirmed** findings only.
  - Fable is brought in only after repeated Opus rounds have failed.
  - **Exactly ONE agent runs Gradle.** Concurrent builds clash on the daemon and the build dir.
- **Plans before consequential changes.** Think, then have a sub-agent attack the plan against
  the files (verdict + must-fix / should-fix / could-not-verify, each with file:line), then show
  the user, then build. Tell the attacker the plan is wrong.
- **Public-repo hygiene, from the first commit, even if the repo is private.** Never commit
  secrets, real emails, Wi-Fi names, device serials, private IPs or personal paths. Commit with
  the GitHub noreply address. Keys come from `local.properties` or the environment and default to
  empty, so a clone builds and degrades honestly.
- **Strings live in `res/values/strings.xml`** from day one. Pick one apostrophe (ASCII `\'`)
  and use the same one in test assertions.
- **Comments state constraints the code can't show**, and why, with one evidence pointer.
  Nothing else: no narration, no history.
- **Every version gets a record:** `docs/upgrade-x.y/` with README, `screens/` (emulator,
  synthetic data, light and dark), `validation.json`, and `phone-install.json` after the phone
  install. Write "not run" and "not done" down. Start from `docs/upgrade-template/`.
- **Tests never reset the user's data.** Emulator suites snapshot and restore preferences
  (`EmulatorSupport.userStatePreserved()`), and delete only fixtures they made.
- **Taps on a real device** use bounds read from the accessibility tree and a focus check first.

## Key context

- `docs/design/` — the brief, the imported design system, `design-tokens.md` (says which commit
  it was last checked against), and the specs. Where a spec and the code disagree, the spec says
  so, or it is a bug in one of them.
- `docs/CONTRACT.md` — data types, API seams and lane ownership. Change it before the code.
- `docs/ROADMAP.md` — what is not built yet, in order.
- `README.md` points at the latest `docs/upgrade-x.y/`; it does not restate test counts or
  versions, which go stale.
- `~/.claude/skills/android-app-craft/lessons-log.md` — where this project's surprises go.
