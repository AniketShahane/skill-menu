# Setup and tooling

The machine, the Gradle project, the emulator and the phone. None of this is craft, but in Dash
and Flick every item here cost at least one failed build or one scare: a release profile with
zero app classes, a phone that ran debug builds through 0.9.0, a script that would have tapped
into another app. Do it right on day one and it stays out of the way.

Templates: `templates/new-app.sh`, and in `templates/starter/`: `gradle/libs.versions.toml`,
`app/build.gradle.kts`, `baselineprofile/`, `gradle.properties`, `.gitignore`,
`local.properties.example`, `CLAUDE.md`, `README.md`, `app/proguard-*.pro` and `scripts/`.
Performance work that builds on this setup is in `references/performance.md`.

## 0. Start every app from the starter

**Rule.** `templates/new-app.sh <dest> <AppName> <package.name>`, then build it before changing
anything.

**Why.** The starter carries every decision below already made and commented. Rebuilding them by
hand is how Flick shipped for a while with no minify, no profile and a debug build under test
(flick@c0ac2ed).

**How.**
```sh
~/.claude/skills/android-app-craft/templates/new-app.sh ~/Workspace/tides Tides com.example.tides
cd ~/Workspace/tides && git init
source scripts/android-env.sh && ./gradlew :app:assembleDebug :app:testDebugUnitTest  # online (§3)
```
These are the lines the script prints under "Next:". The build is one line on purpose: an
agent's shell forgets `JAVA_HOME` between tool calls (§2). The script writes `local.properties`
with `sdk.dir` from the SDK `android-env.sh` finds; if it finds none it says so, and you copy
`local.properties.example` and fill it in by hand.

The script moves `com/example/starter` in every source root, rewrites the package, namespace
and applicationId, renames `StarterApp`/`StarterTestRunner`/`Theme.Starter`/`app_name`, and
gives the emulator its own name (`tides_phone`) and a port derived from the name. It lists any
file that still mentions the template. It never runs Gradle.

The starter's `CLAUDE.md` says the project came from this skill and that surprises go in the
skill's `lessons-log.md`. Fill in its three slots (What it is, Thesis, Hero moments) and the stub
`README.md` on day one.

## 1. Pin a toolchain set that is known to build together

**Rule.** Take one of the two proven sets whole. Never bump one pin alone.

**Why.** The pins constrain each other. material3 1.5.0-alpha19+ needs Compose 1.12 and
compileSdk 37; AGP 8.10 does not support 37 (Dash: "this project's Android Gradle plugin
does not support it yet"; nobody tried); the 1.4.x baseline-profile plugin refuses
AGP 9. Dash stayed on alpha18 for exactly this reason (dash:docs/upgrade-0.9.4/README.md "Stack
upgrade"); Flick moved to AGP 9.3 to get alpha24 (flick:docs/implementation.md:77-92).

| | Flick's set (the starter's) | Dash's set (fallback) |
|---|---|---|
| AGP / Gradle | 9.3.0 / 9.5.0 | 8.10.1 / 8.11.1 (sha256 pinned in the wrapper) |
| Kotlin | built into AGP 9; compose plugin 2.3.21 | `org.jetbrains.kotlin.android` + compose plugin 2.1.21 |
| compileSdk / minSdk / targetSdk | 37 / 26 / 36 | 36 / 26 / 35 |
| Compose BOM | 2026.06.01 | 2026.06.01 (Compose 1.11.4) |
| material3 | 1.5.0-alpha24 (pulls Compose 1.12.0-beta01) | 1.5.0-alpha18 |
| Haze | 1.7.2 (1.7.3+ allowed: it needs compileSdk 37) | 1.7.2 is the ceiling |
| benchmark plugin / profileinstaller | 1.5.0-alpha07 / 1.4.1 | none |
| JDK running Gradle / bytecode | 21 / Java 17 | 21 (17 works) / Java 17 |

Use Dash's set only if something forces AGP 8. Since 31 Aug 2026 Play requires targetSdk 36
for new apps and updates (flick:docs/play-release.md, technical requirements), so Dash's set is
only for personal or sideloaded builds. Raise targetSdk to 36 (compileSdk 36 allows it) before
publishing from it.

**How.** Every pin lives in `gradle/libs.versions.toml` with its reason (§4). An upgrade is its
own commit with a full emulator pass, and the reason comments change in the same edit.

## 2. A fresh shell: source the env script

**Rule.** `source scripts/android-env.sh` before any `./gradlew` or `adb` in a new shell. Every
script in `scripts/` does it for itself.

**Why.** The Homebrew JDK and SDK are not on `PATH`, and the system default JDK is too new for
this AGP/Gradle pair. The Gradle *launcher* needs `JAVA_HOME` even when `org.gradle.java.home`
is set, because that property only governs the daemon (flick:CLAUDE.md:14-19). An agent's shell
state does not persist between tool calls, so this is per command, every time.

**How.** The script (`templates/starter/scripts/android-env.sh`):
- keeps any `JAVA_HOME`/`ANDROID_HOME` already set;
- picks JDK 21, else 17: Homebrew `openjdk@21`, `/usr/libexec/java_home -v 21`, Linux
  `/usr/lib/jvm`, then the same for 17;
- picks the first SDK with `platform-tools/adb`: `$ANDROID_SDK_ROOT`,
  `~/Library/Android/sdk`, `~/Android/Sdk`, Homebrew's
  `/opt/homebrew/share/android-commandlinetools`;
- puts `platform-tools`, `emulator` and `cmdline-tools/latest/bin` on `PATH`;
- exports `APP_PHONE` (§8).

Run it instead of sourcing it (`scripts/android-env.sh`) to print what it found. Sourced, it
leaves your shell's options alone. Gradle finds the SDK from the exported `ANDROID_HOME`, or
from `sdk.dir` in the gitignored `local.properties`, which `new-app.sh` writes when it finds an
SDK. Either is enough; `local.properties` also covers a shell that did not source the script.

Finding the phone runs `adb shell getprop` on each attached non-emulator device. It is skipped
when `APP_SERIAL` is already set, and when `APP_ENV_SKIP_PHONE=1`. `start-emulator.sh` and
`test-emulator.sh` set that, so emulator-only work never talks to a physical device. For a
Gradle-only shell: `APP_ENV_SKIP_PHONE=1 source scripts/android-env.sh`.

## 3. The first build must be online

**Rule.** Build once with network on every new machine and after every plugin bump. After that,
`--offline` works.

**Why.** Gradle resolves each plugin marker and its whole classpath at configuration time, even
under `apply false`. The root build declares the `com.android.test` and baseline-profile
plugins with `apply false`, so a cold cache fails *every* task, `:app:assembleDebug` included
(flick:build.gradle.kts:5-13). None of that chain is in a stock Gradle cache.

**How.** The configuration-time coordinates are
`androidx.baselineprofile:androidx.baselineprofile.gradle.plugin:1.5.0-alpha07`,
`androidx.benchmark:benchmark-baseline-profile-gradle-plugin:1.5.0-alpha07`,
`com.google.testing.platform:core-proto:0.0.8-alpha08` and
`com.android.test:com.android.test.gradle.plugin:9.3.0`. Compiling `:baselineprofile` also
needs `benchmark-macro-junit4` and its siblings at 1.5.0-alpha07, `uiautomator:2.4.0`,
`androidx.test:rules:1.5.0` and `com.squareup.wire:wire-runtime:6.4.0` (Maven Central)
(flick:CLAUDE.md:23-37).

Only one process may run Gradle at a time: concurrent builds in one project clash
(flick:CLAUDE.md:75-80). With parallel agents, name one Gradle runner.

## 4. The version catalog: a reason on every pin

**Rule.** No version string outside `gradle/libs.versions.toml`, and no pin without a comment
that says why it is that version.

**Why.** An inline version (Dash: every dependency in `app/build.gradle.kts`) gives the next
upgrade nothing to argue with. Flick's catalog comment on the benchmark pin is what stops someone
"tidying" it back to the stable 1.4.1, which caps AGP below 9.0.0-alpha01
(flick:gradle/libs.versions.toml:29-33).

**How.** See the starter's catalog. Patterns worth keeping:
- Compose artifacts take their version from the BOM (no `version.ref`).
- material3 is pinned apart from the BOM. Its alpha pulls the whole Compose family forward.
- Plugins and libraries that must move together share one `version.ref` (the baseline-profile
  plugin and `benchmark-macro-junit4` both use `androidxBenchmark`).

## 5. Build types: debug, release, benchmark

**Rule.** `release` is the real shape of the app from day one: R8 minify, resource shrinking,
not debuggable, and signed with the debug key unless an upload key is configured.

**Why.** A debug build is what users never run, and it is where the stutter lives. On the same
code and an "identical protocol", Flick's phone library scroll measured 3.81–7.42 % janky
frames, p99 13–27 ms, on debug, and 2.02–2.31 %, p99 10–15 ms, on release (flick@c0ac2ed).
Dash's phone had run `flags=[ DEBUGGABLE ]` builds; its 8.5 % → 2.4 % → 1.5 % mixes the build
change with the first UI fixes, so it cannot show the build's share alone
(`references/performance.md` §1). Dash's release APK was also 52 MB against 73 MB. Signing with the debug key lets
`adb install -r` of a release replace a debug install and keep the phone's data
(dash:app/build.gradle.kts:49-55).

| Type | Minified | Debuggable | Signed with | For |
|---|---|---|---|---|
| `debug` | no | yes | debug | day-to-day work, `run-as`, the emulator suites |
| `release` | yes | no | upload key, else debug | the phone, every frame measurement, the baseline profile |
| `benchmark` | no | no | debug | traces and profiles with real symbol names |
| `nonMinifiedRelease`, `benchmarkRelease` | made by the baseline-profile plugin | | | profile generation, macrobenchmarks |

`benchmark` exists because "debuggable code is never AOT-compiled, which invalidates timings",
but it stays unminified "so profiles and traces map to real symbol names"
(flick:sender/build.gradle.kts:237-250). The plugin treats `benchmark*` names as its own, so this
type stays out of profile wiring.

Two switches in `gradle.properties` (pass `-P<name>=true`):
- `appTestRelease` runs the instrumentation suites against a non-debuggable, R8-optimised
  release build (`testBuildType = "release"` plus `proguard-test-app-rules.pro`:
  `-dontshrink -dontobfuscate`, because the test APK reaches members the app never calls;
  dash:app/proguard-test-app-rules.pro). Shrinking and renaming are off in it, so it tests R8's
  optimisation, not your keep rules (§9).
- `appTracing` adds `runtime-tracing` + `tracing-perfetto(-binary)` for composable names in a
  trace (`references/performance.md` §12). Fine for personal builds; off for Play.

The app also sets `testInstrumentationRunner = "<package>.<App>TestRunner"` and
`testOptions { animationsDisabled = true }`; see `references/testing.md`. That flag reaches only
Gradle's connected tests (`./gradlew connectedDebugAndroidTest`, driven by AGP's test platform).
`scripts/test-emulator.sh` calls `am instrument` itself, so it passes `--no-window-animation`,
which sets the three animator scales to 0 for the run and restores them after.

## 6. Signing and secrets never enter the repository

**Rule.** Upload signing is all-or-nothing, read from gitignored `local.properties` or the
environment, and no build output ever prints a value.

**Why.** Three fields set and one forgotten would fall back to the debug key in silence and
produce a bundle Play rejects only after upload. Absent is the normal state of a clone and must
still build (flick:sender/build.gradle.kts:121-165).

**How.** The starter's `app/build.gradle.kts` reads `app.upload.storeFile`, `storePassword`,
`keyAlias`, `keyPassword` (or `APP_UPLOAD_*` in the environment). None set: release uses the
debug key. Some set: `GradleException` naming the missing field. A path that is not a file:
`GradleException` saying to restore the keystore from backup. The keystore lives outside the
repo; back it up before anything else (flick:docs/play-release.md:77).

API keys follow the same shape: gitignored property or env var, validated by charset, empty by
default, and the app degrades honestly without one. A key
in an APK is extractable; keeping it out of git keeps it out of a public history, nothing more.
No device serials, IPs, emails or personal paths in any committed file, including scripts
(a serial as a script default is the usual slip).

## 7. One emulator per project, found by name

**Rule.** Each project gets its own AVD under `.tools/avd`, on its own port, and every script
that changes device state checks the AVD's name first.

**Why.** Mock data, permission resets and fixtures must never reach the phone or another
project's emulator. Dash's test script refuses unless `adb emu avd name` returns `dash_api35`
(dash:scripts/test-emulator.sh:5-10). A shared emulator gets builds installed under you: during
Dash's port, another session installed an old build on a shared emulator mid-session
(ios-app-craft `references/setup-and-tooling.md` §4).

**How.**
```sh
scripts/start-emulator.sh                    # background, waits for sys.boot_completed
APP_EMULATOR_GUI=1 scripts/start-emulator.sh # with a window
scripts/test-emulator.sh                     # refuses any device but this AVD
# TV: its own port, or it is refused while the phone AVD holds the default one
APP_EMULATOR_KIND=tv APP_EMULATOR_PORT=<another even port> scripts/start-emulator.sh
APP_AVD_NAME=<app>_tv APP_EMULATOR_PORT=<same port> scripts/test-emulator.sh
```
- `ANDROID_AVD_HOME=$project/.tools/avd` (gitignored), Dash's practice
  (dash:scripts/start-emulator.sh:7); Flick's AVDs live in the shared `~/.android/avd`. Deleting the project deletes its
  emulator, and `emulator -list-avds` elsewhere never offers it.
- The script picks an image that is actually installed, and says how to install one if not:

| Kind | Image (arm64 host) | Device | Proven as |
|---|---|---|---|
| phone | `system-images;android-35;google_apis;arm64-v8a` | `pixel_7`, 3072 MB (Dash's `-memory`; Flick's ran with 2 GB) | Dash `dash_api35`, Flick `flick_phone` |
| tv | `system-images;android-36;google-tv;arm64-v8a` | `tv_1080p` (1920×1080), 2048 MB | Flick `flick_tv` |
| atd | `system-images;android-35;aosp_atd;arm64-v8a` | `pixel_7`, 2048 MB | Marginalia `marginalia_test`: headless, fast, no Google apps |

- Flags: `-no-snapshot -no-boot-anim -gpu host -no-audio -cores 4`, plus `-no-window` unless
  `APP_EMULATOR_GUI=1`. `-gpu host` matters: under `-gpu swiftshader_indirect`, `screencap`
  returns black (Marginalia); verify through `uiautomator dump` if you must run swiftshader.
- The port must be even and in 5554–5682. A port already taken by another AVD is a refusal, not
  a reuse.
- Emulator audio is muted, so it proves nothing about sound (dash:docs/TESTING.md:59-66).
- A TV's screensaver steals focus and reads as a failure it is not; send
  `input keyevent KEYCODE_WAKEUP` first (flick:docs/store/codec-matrix-test.sh:39-41).
- The emulator is for behaviour and for looking (at 5× or 10× animator scale). Never for frame
  timing: "its emulated GPU dominates every frame" (dash@ea5137b).

## 8. The personal phone is production: install without losing data

**Rule.** Install on the user's phone only with `scripts/install-phone.sh`: `install -r` of the
release build, then AOT compile. Never uninstall, never clear data, never "fix" a signature
mismatch by uninstalling.

**Why.** The phone holds the user's real data. Dash's README: "Do not uninstall or clear app
storage to update" (dash:README.md:47). Its install record checks that every saved run file is
byte-identical afterwards (dash:docs/upgrade-0.9/phone-install.json).

**How.** Set `APP_PHONE_SERIAL` in your shell profile, never in the repo, to the phone's adb id
or its hardware serial (`adb shell getprop ro.serialno`). `android-env.sh` matches it over USB
or Wireless debugging, where the adb id is a network name, and never picks an emulator. With it
unset, a lone attached non-emulator device is used; a TV on the same adb counts, so set it.

Build the phone's APK with the `app.upload.*` fields unset (or in another checkout). Once they
are set, the release carries the upload key's signature, `install -r` over the debug-key
install fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, and the phone needs an export/import
first (dash:docs/ROADMAP.md:99-101).

`scripts/install-phone.sh [apk]`:
1. Refuses while `APP_BUSY_SERVICE` is running (Dash: its `RunService`, so no install mid-run).
2. Prints `versionName` and `pkgFlags` before and after.
3. If the installed build is still `DEBUGGABLE`, tars the app's data out with `run-as` into
   `.tools/phone-backup-<stamp>/`. `run-as` works only on debuggable builds, so the first
   release install closes this path for good (dash:scripts/install-phone.sh:18-27).
4. `install -r`. On `INSTALL_FAILED_UPDATE_INCOMPATIBLE` it stops and says not to uninstall.
5. `cmd package compile -m speed -f <pkg>` (about a minute) and prints the dexopt status
   (why: `references/performance.md` §2).
6. Warns if the result is still debuggable.

Plan the data path before it is needed. Once a release build is on the phone, only in-app
export can save data; a Play keystore changes the signature and needs export/import first
(dash:docs/ROADMAP.md:38-41, 99-101).

A connected test run uninstalls the APKs it installed when it finishes, and the baseline-profile
generator installs *this app*. The starter sets
`android.injected.androidTest.leaveApksInstalledAfterRun=true` in `gradle.properties` (AGP 9.3.0
defines the option), but whether that keeps the data through a generator run is not verified on
a device. `scripts/install-phone.sh --backup` works only while a debug build is installed. With a
release build on the phone, the only protection is an in-app export, so generate on a spare
device or this project's emulator.

## 9. R8: keep too much rather than too little

**Rule.** Keep attributes and exception names from day one, pin every class the code reaches by
name, and keep `-dontwarn` narrow.

**Why.** "A release APK a few hundred kilobytes larger is not a defect; one that crashes when the
user opens the scanner or starts the server is" (flick:sender/proguard-rules.pro:4-6). R8
renames silently, so name-based code keeps compiling and quietly stops matching.

**How** (`templates/starter/app/proguard-rules.pro`):
- Always: `-keepnames class * extends java.lang.Throwable` and
  `-keepattributes SourceFile,LineNumberTable,Signature,Exceptions,InnerClasses,EnclosingMethod`
  with `-renamesourcefileattribute SourceFile`. Flick shows `e.javaClass.simpleName` to users in
  a diagnostics sheet (flick:sender/proguard-rules.pro:8-13).
- One `-keepnames` line per class compared by name. Flick's failure classifier matches
  `UnrecognizedInputFormatException` by string; renaming it "reclassifies every container
  rejection as MALFORMED_MEDIA" (flick:receiver/proguard-rules.pro:15-19).
- Library blocks only for libraries that use reflection or service lookup (Ktor, slf4j, ML Kit,
  kotlinx-serialization, JNI). They ship commented out in the starter.
- Don't widen a `-dontwarn` beyond what a library's own recipe needs, and never to a package
  whose missing classes you would want to hear about. Flick lists the media3 siblings one by
  one, because `androidx.media3.**` "also covers media3-common and media3-session, which ARE on
  this classpath, so a genuinely missing class ... would be silenced"
  (flick:sender/proguard-rules.pro:43-51). The starter's commented library blocks copy Flick's
  package-wide lines (`io.ktor.**`, `kotlinx.coroutines.**`, `org.slf4j.**` and others) as
  those libraries' recipes: a known trade-off, not the pattern to extend.
- Test keep rules on the real `assembleRelease` APK. `-PappTestRelease=true` turns shrinking
  and renaming off, so it cannot catch them. Install the release build on the emulator and walk
  every name-based or reflective path (a classifier, a scanner, a server, serialization) by hand
  or from an external UiAutomator/adb script such as `scripts/tap-by-tree.sh`.

## 10. AGP 9 and Kotlin DSL gotchas

- **`import java.util.Properties`** at the top of a build script. The qualified
  `java.util.Properties` does not compile: inside a Kotlin build script `java` names Gradle's
  own extension (flick:sender/build.gradle.kts:1-5).
- **No `org.jetbrains.kotlin.android` plugin and no `kotlinOptions` on AGP 9.** Kotlin is built
  in; `compileOptions` sets Java 17 and Kotlin follows it. A `com.android.test` module has no
  Compose plugin to imply Kotlin, so it needs `enableKotlin = true`
  (flick:baselineprofile/sender/build.gradle.kts:24-26).
- **`buildFeatures.buildConfig = true`** is opt-in on AGP 8+. Anything that reads
  `BuildConfig.DEBUG` needs it (flick:sender/build.gradle.kts:258-263). The starter does not.
- **`baselineProfileRulesRewrite`** stays unset: it writes a module property AGP 9.3.0 no longer
  defines (flick:sender/build.gradle.kts:292-296).
- **`hideSyntheticBuildTypesInAndroidStudio = false`**, or the plugin also hides the
  hand-written `benchmark` type from the variant picker.
- **Never set `android.experimental.testOptions.uninstallIncompatibleApks`.** It lets a test run
  uninstall an app whose signature differs, which on the phone is the user's data.

## 11. The .gitignore that keeps the profiles

**Rule.** Never ignore `release/`. End the `.gitignore` with `!**/src/release/` and
`!**/src/release/**`.

**Why.** `saveInSrc = true` commits the baseline profile under
`app/src/release/generated/baselineProfiles/`, and `assemble*` packages whatever is checked in.
Flick's `release/` rule matched only those directories: both apps shipped ART profiles of 5721
and 3613 lines with zero `com/flick/` rules (flick@50a7a9a). Details and the grep check:
`references/performance.md` §3.

Also ignored from the start: `local.properties`, `.tools/`, `dist/`, `.claude/worktrees/`,
`*.jks`, `*.keystore`, `.kotlin/`.

## 12. Adding a dependency to the pinned set

**Rule.** A new library enters through the catalog with a reason, and is proven by the full
gate before it is committed.

**Why.** The pins constrain each other (§1). A library's AAR can demand a newer compileSdk or AGP
than the set has (Haze 1.7.3+ needs compileSdk 37), or reach classes by reflection that R8 then
renames (§9). Both fail late: the first at the next clean build, the second only in release.

**How.**
1. Add it to `gradle/libs.versions.toml` with a comment saying why this version (§4). Take the
   version the set allows, not the newest.
2. Check the AAR's metadata: `unzip -p <lib>.aar META-INF/com/android/build/gradle/aar-metadata.properties`
   (the AAR is under `~/.gradle/caches/modules-2/files-2.1/` after one resolve) prints
   `minCompileSdk` and `minAndroidGradlePluginVersion`. Both must be at or below the set's
   compileSdk and AGP. Haze 1.7.3's says `minCompileSdk=37`, which is why Dash's set stops at
   1.7.2.
3. Read the library's R8 recipe. Add its keep and `-dontwarn` lines to `proguard-rules.pro` in
   their own commented block, as narrow as the recipe allows (§9).
4. Run the full gate before committing: `:app:assembleDebug :app:testDebugUnitTest :app:lintDebug`,
   then `:app:assembleRelease`, then the emulator suites, then walk the paths that use the
   library on the release APK.
5. An annotation processor comes in through KSP, and KSP must match the Kotlin version the
   build compiles with (the catalog's `kotlin = "2.3.21"`, the compose plugin's version). KSP
   releases named `<kotlin>-<ksp>` must match it exactly; for any other, check the KSP release
   notes for the Kotlin it supports. Pin KSP in the catalog with that reason, next to `kotlin`.
   Not yet exercised in Dash or Flick, neither of which uses an annotation processor.

## Symptom → cause → fix

| Symptom | Cause | Fix |
|---|---|---|
| Every Gradle task fails on a fresh machine, even `assembleDebug`, with an unresolved plugin | Plugin markers resolve at configuration time under `apply false`; the cache is cold | Build once online (§3) |
| Gradle will not start, or reports an unsupported Java version | The shell's default JDK is too new; only the daemon honours `org.gradle.java.home` | `source scripts/android-env.sh` (JDK 21) |
| `SDK location not found` | No `local.properties` and no `ANDROID_HOME` | `source scripts/android-env.sh`, or copy `local.properties.example` and set `sdk.dir` |
| `java.util.Properties` does not resolve in a `.kts` | `java` names Gradle's extension | `import java.util.Properties` |
| material3 alpha or Haze refuses to compile | alpha19+ and Haze 1.7.3+ need compileSdk 37, which needs AGP 9 | Move to the whole Flick set, or stay on alpha18 / Haze 1.7.2 (§1) |
| The baseline-profile plugin rejects AGP 9 | 1.4.x caps AGP below 9.0.0-alpha01 | `androidxBenchmark = 1.5.0-alpha07`, plugin and library together |
| `Upload signing is all-or-nothing` | One to three upload fields set | Set all four or none (§6) |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` on the phone | Installed and new APK are signed by different keys | Stop. Export data in-app first. Never uninstall |
| `run-as: package not debuggable` | A release build is installed | Expected. The data stays across `install -r`; backups now need in-app export |
| A release build crashes where debug does not | R8 renamed or removed a class reached by name or reflection | Add a keep rule; walk the name-based paths on the real `assembleRelease` APK (`-PappTestRelease` renames nothing, §9) |
| `test-emulator.sh` refuses to run | The port holds another AVD, or none | `scripts/start-emulator.sh`; check `APP_EMULATOR_PORT` |
| `screencap` returns a black image | Headless emulator on swiftshader | `-gpu host`, or read `uiautomator dump` |
| The emulator never boots in time | Image missing, or a cold first boot | `sdkmanager "<image>"`; raise `APP_BOOT_TIMEOUT` |
| "BUILD SUCCESSFUL in 1s" after a change, and nothing changed | Nothing compiled | Check the compile task ran (android-design `motion-and-performance.md` §3) |
| Two builds fail at once with lock errors | Two processes ran Gradle in one project | One Gradle runner per project |
