# Data and state: where the user's data lives, how screens get it, and how it survives

How Dash, Flick and Marginalia hold data, and the rules that fell out. Read this before writing
the first repository of a new app, and again before changing a file format, a backup rule or the
signing key. The starter's `ui/screens/DemoData.kt` is the placeholder a real repository replaces.

Each app chose differently, for reasons worth copying:

| App | What it stores | Storage | DI |
|---|---|---|---|
| Dash (running) | runs, a weekly plan, ~10 small settings files | JSON files in `no_backup/` via `AtomicFile`; SharedPreferences | `object` singletons with `initialize(context)` |
| Flick (casting) | pairings, settings, resume points, subtitle memory | SharedPreferences; Preferences DataStore for keyed memories; MediaStore for the films | one `CastCoordinator` on the `Application` |
| Marginalia (read-later) | articles, highlights, PDFs, reader settings | Room (KSP) + DataStore + PDF files | hand-rolled `AppContainer`, no Hilt |

---

## 1. A data lane owns `data/**`, with one repository per aggregate

- **Rule:** one package (`data/` or `core/`) owns storage, and each thing the user thinks of as
  one unit (a run, a week's plan, a library) has exactly one repository. Screens never open files,
  prefs or DAOs.
- **Why:** parallel agents need a seam they can build against. Dash's first contract gave "core
  agent owns core/ and JVM tests … service agent owns tracking/" (dash:docs/CONTRACT.md:2-20). Two
  aggregates, two repositories: `RunRepository` "never reads, removes, or rewrites" the plan's
  file, and the plan's repository never touches run files (dash:tracking/WeeklyPlanRepository.kt:18).
- **How:** name the lane in `docs/CONTRACT.md` (the starter's table has a `<data / core>` row).
  Put the rules (statistics, streaks, validation) in pure functions in the same lane so they are
  JVM-tested (`references/testing.md` §1): Dash's `RunStatistics.compute` has 19 JVM tests and
  never sees a `Context` (dash:app/src/test/java/com/dash/run/core/RunStatisticsTest.kt).

## 2. A repository answers twice: synchronously from memory, then from disk

- **Rule:** every repository offers a synchronous read of what is already in memory (null if
  nothing is) and a suspending or off-thread load behind it. The screen opens on the first and
  is corrected by the second.
- **Why:** a page that opens on a placeholder and flips to content a frame later reads as a
  flicker, and on a tab it happens every visit. Dash's plan tab "opens with it, so coming back to
  the tab shows the week as it was rather than an empty week that fills in a moment later"
  (dash:tracking/WeeklyPlanRepository.kt:28-34).
- **How:** the starter already has the shape:
  ```kotlin
  val sessions by produceState(initialValue = DemoData.cached()) { value = DemoData.load() }
  ```
  (starter `ui/screens/HomeScreen.kt:96`, `DemoData.kt:30-33`). A real repository keeps the last
  value it read or wrote (Dash: a `ConcurrentHashMap` by file path, `peek()`), and `load()` does
  the I/O on `Dispatchers.IO` or a single-thread executor.
- **Publish as `StateFlow` when many screens watch.** Dash's `RunRepository` holds
  `MutableStateFlow`s for the live run and the history; the disk executor loads, and the main
  thread publishes (dash:tracking/RunRepository.kt:28-35, 154-158). One writer thread for a
  repository means saves, deletes and refreshes never interleave (`Executors.newSingleThreadExecutor()`,
  :32).
- **Keep a flow alive through a transient error.** `catch` ends a flow and `stateIn` never
  re-collects a completed source, so "one transient read error would pin the StateFlow at its
  fail-open value for the life of the process". Flick retries on `IOException` instead, emitting
  the fail-open value on the first failure (flick:sender/.../media/PlaybackProgress.kt:198-209).
- **Model "not read yet" as a state.** Flick's `PlaybackProgressState` is `Loading | Ready`;
  Detail keeps its Resume button disabled until `Ready`, so it never offers to start over a film
  that has a saved position it simply hasn't read (PlaybackProgress.kt:86-88).

## 3. Screens receive state; they do not fetch it

- **Rule:** a screen composable takes its data as parameters, or collects a repository flow with
  `collectAsStateWithLifecycle()` at the top of the app shell. Derived values (statistics,
  groupings) are computed off the main thread and keyed on their inputs.
- **Why:** parameters make every screen previewable and testable with fake state
  (`references/testing.md` §3). Lifecycle collection stops work when the app is in the background.
- **How:**
  ```kotlin
  val history by RunRepository.history.collectAsStateWithLifecycle()
  val stats by produceState<RunStatistics?>(initialValue = null, history) {
      value = withContext(Dispatchers.Default) {
          RunStatistics.compute(history.map { it.toRecord() }, LocalDate.now(), ZoneId.systemDefault())
      }
  }
  ```
  (dash:ui/DashApp.kt:128-129, 168-173). Flick collects with plain `collectAsState()`
  (flick:sender/.../ui/screens/FlickApp.kt:128-133); prefer the lifecycle version.
- **ViewModels are optional.** Dash and Flick have none; state lives in repositories and the shell.
  Marginalia uses one `ViewModel` per screen with a `viewModelFactory { initializer { … } }` that
  pulls from its container (read-later-app:ui/library/LibraryViewModel.kt:76-78). Pick one style
  per app.

## 4. Choose storage by what the data is, not by habit

| Data | Use | Evidence |
|---|---|---|
| A handful of settings read on the first frame (theme, units) | SharedPreferences, `commit()` for a choice the user just made | Flick: "the choice has to be on disk before the process can be killed" (flick:sender/.../ui/theme/Appearance.kt:64-69); starter `ui/theme/Appearance.kt` |
| Many keyed small records, written often, read as a stream | Preferences DataStore | Flick keeps "up to 100 device-local checkpoints … keyed by a hash of the content URI and its MediaStore source revision" (flick@b52aee3) |
| Whole documents the user made (a run, a plan) | one JSON file each, `AtomicFile`, a format version | dash:tracking/RunRepository.kt, WeeklyPlanRepository.kt |
| Relational data you query, filter and join (a library, highlights) | Room | Marginalia: items + highlights with CASCADE delete (read-later-app:data/local/MarginaliaDatabase.kt) |
| The user's media | MediaStore queries, never copies | Flick's `MediaLibrary.query` (flick:sender/.../media/MediaLibrary.kt:33-68) |

- **Why files for Dash:** a run is one document, written once, read whole, and must survive a
  crash mid-write. No schema migrations; an old file stays readable by the new decoder (§6).
- **Why SharedPreferences over DataStore for the theme:** the first frame needs it synchronously,
  before `setContent`. DataStore has no synchronous read.
- **MediaStore rules (Flick):** query on `Dispatchers.IO`; never open the byte stream just to list;
  a read that failed partway returns the rows it got with `complete = false`, and nothing claims a
  folder is gone on a partial read (MediaLibrary.kt:19-31). Key anything remembered about a film by
  a SHA-256 of URI, size, date, duration, `GENERATION_MODIFIED` and `MediaStore.getVersion`, "so a
  re-encoded file never inherits an old position" (PlaybackProgress.kt:115-149; flick@b52aee3).

## 5. Adding Room or DataStore to the pinned toolchain

- **Rule:** a new library enters `gradle/libs.versions.toml` with a reason comment, then a full
  build and an emulator pass before anything uses it. Room also needs KSP, which must match the
  Kotlin compiler and AGP; record the working trio.
- **Why:** the starter's pins are proven together (`references/setup-and-tooling.md` §1, §4).
  KSP runs inside the Kotlin compiler, so a mismatched version fails at the KSP task, not at
  runtime.
- **How:**
  - Marginalia's working set was AGP 8.9.1, Kotlin 2.2.20, KSP `2.2.20-2.0.3`, Room 2.7.2,
    DataStore 1.1.1 (read-later-app:gradle/libs.versions.toml:2-13). It does **not** carry over:
    the starter is Kotlin 2.3.21 on AGP 9.3.0 with AGP's built-in Kotlin. The KSP version for that
    pair was not verified here; take the KSP release whose notes name Kotlin 2.3.21 and AGP 9
    built-in Kotlin, and prove it with `:app:kspDebugKotlin` plus the full suite.
  - Flick pins `datastore-preferences` 1.2.1 on its toolchain (flick:gradle/libs.versions.toml:18).
    DataStore needs no annotation processor.
  - Set `exportSchema = true` and commit `app/schemas/`. Marginalia did at v3 (read-later-app@ec6618f).

## 6. Writes are atomic, files carry a version, and one test opens the oldest format

- **Rule:** write user data with `AtomicFile` (write to `.new`, keep `.bak`, rename), put a
  `version` field in every file, decode old versions forever, and keep one emulator test that
  opens a file in the oldest format ever shipped.
- **Why:** a process can die at any point of a write. Dash's run save writes the final file, then
  deletes the checkpoint; on the next start, "the final saved run always wins; never replace it
  with an older checkpoint" (dash:tracking/RunRepository.kt:47-57).
- **How:**
  - The write: `AtomicFile(file).startWrite()` → bytes → `finishWrite`, `failWrite` on any
    exception (RunRepository.kt:160-171). Serialise writes on one thread or one lock.
  - The version: Dash's run files are `"version": 2`; the decoder reads `optInt("version", 1)` and
    treats v1's missing detail as absent, not as an error (RunRepository.kt:199-204, 209).
  - Optional detail fails alone: "a bad block loses only the heart rate, never the pace" (:202).
  - Bound what you read: the plan refuses a file over 4,000,000 bytes, and run insights check
    array lengths "before materializing any detail" (WeeklyPlanRepository.kt:76, 95;
    RunRepository.kt:239-240).
  - The test: write a v1 file with a unique id (`upgrade-legacy-${UUID}`), open it through the
    real repository and UI, assert its totals, visit every tab, then assert the file is still
    byte-identical: "Viewing the upgraded summary must not migrate or rewrite legacy JSON"
    (examples/sample/androidTest/UpgradeFlowTest.kt (`viewingAnUpgradedItemDoesNotMigrateOrRewriteTheLegacyFile`)).
  - Room: a real `Migration` per version plus `MigrationTestHelper` over the exported schemas.
    Marginalia shipped `fallbackToDestructiveMigration()` while in development and removed it
    before release (read-later-app@ec6618f); a destructive fallback deletes the user's library on
    the first schema bump.

## 7. Unreadable user data fails loudly; lost memory fails open

- **Rule:** decide per store what happens when it cannot be read. What the user made is never
  replaced with an empty value; what the app merely remembered may be.
- **Why:** Dash's plan: "Failure is surfaced. Replacing an unreadable plan with an empty plan would
  lose user data" (dash:tracking/WeeklyPlanRepository.kt:94). A plan written by a newer build
  fails with "This plan needs a newer Dash version." instead of being overwritten (:119).
- **How:** for a memory (a resume point, an A/V nudge), Flick installs
  `ReplaceFileCorruptionHandler { emptyPreferences() }` on the DataStore
  (flick:sender/.../media/PlaybackProgress.kt:31-34). Never on a store the user would miss.

## 8. Backup rules are a decision per store, and a test holds them

- **Rule:** start with `allowBackup="false"` (the starter's manifest) until each store is
  classified: carried (about the person), or left behind (about this device, or secret). Then
  write both `fullBackupContent` (API ≤ 30) and `dataExtractionRules` (API 31+, which also covers
  device-to-device transfer), and add `BackupExclusionsTest`.
- **Why:** each app landed differently, for stated reasons.
  - Dash excludes everything from both transports and keeps runs in `no_backup/`
    (dash:app/src/main/res/xml/data_extraction_rules.xml; RunRepository.kt:41).
  - Flick leaves behind pairings (secret), the library folder ("matches a same-named folder
    holding different films, and the library opens silently narrowed"), and every
    fingerprint-keyed DataStore; it deliberately carries the theme, which "is about the person
    rather than the hardware" (flick:sender/src/main/res/xml/data_extraction_rules.xml).
  - Marginalia includes the database, `datastore/` and `pdfs/` together "so database rows and
    backing files restore together" (read-later-app:app/src/main/res/xml/data_extraction_rules.xml).
- **How:** copy examples/flick/test/BackupExclusionsTest.kt. It parses the real XML, scans every
  `getSharedPreferences("…")` in `src/main`, and fails both on an unclassified store and on a
  classification naming a store nothing opens (`references/testing.md` §2.5). Extend its scan to
  DataStore names and database files if the app has them.

## 9. The user's data survives every install

- **Rule:** install over the existing app with `adb install -r`, never uninstall, never
  `pm clear`, and prove afterwards that the user's files are byte-identical.
- **Why:** everything under the app's data directory (files, `no_backup/`, `shared_prefs/`,
  databases) survives `install -r` as long as the signature matches. Dash's 0.9.0 install
  recorded `"savedRuns": 6` before and after and `"runFilesByteIdentical": true`
  (dash:docs/upgrade-0.9/phone-install.json).
- **How:**
  - `scripts/install-phone.sh` takes a `run-as` tar backup first. It works only while the
    installed build is debuggable, so "take the backup while it still is"
    (dash:scripts/install-phone.sh:18-27; starter `scripts/install-phone.sh`).
  - It refuses to install while a session is running (Dash: `RunService` in `dumpsys`, :12-14).
  - A different signing key makes `install -r` fail, and the only way past is an uninstall that
    deletes everything. Ship in-app export and import first (dash:docs/ROADMAP.md:38-41, 99-101;
    `references/delivery-process.md` §8).
  - A downgrade needs `install -r -d`; the older build then meets newer files, which is why §7's
    "needs a newer version" check exists.
  - Emulator tests follow the same rule: `EmulatorSupport.userStatePreserved()` restores
    preferences by value and fails if any pre-existing data file changed
    (`references/testing.md` §6).

## 10. Anything calendar-shaped takes `today` and a zone as parameters

- **Rule:** store past events as instants (epoch millis); derive their `LocalDate` at read time in
  the current `ZoneId`. Store planned events as local date + local time + zone id. Every function
  that says "today", "this week" or "streak" takes `LocalDate` and `ZoneId` as parameters.
- **Why:** a run at 23:30 UTC on 15 September is the 16th in Kolkata and the 15th in Los Angeles.
  Dash pins exactly that (dash:app/src/test/java/com/dash/run/core/RunStatisticsTest.kt:405-409),
  and it can only because `RunStatistics.compute(records, today, zone)` never reads the clock.
- **How:**
  - Week start: `date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))`
    (dash:core/WeeklyPlan.kt:79). Monday is Dash's value; a locale-aware app uses
    `WeekFields.of(locale).firstDayOfWeek`.
  - Buckets are zero-filled (12 weeks, "last element == thisWeek"), so a quiet week is a bar at
    zero, not a missing bar (dash:core/RunStatistics.kt:80-84).
  - Streak: consecutive weeks with a run, "counting back from this week; if this week has none,
    count back from last week". A streak does not read 0 on Monday morning
    (RunStatistics.kt:89, 179-184).
  - Daylight saving: a planned time that the clock skips is rejected with a message; a repeated
    autumn time takes its first occurrence (dash:core/WeeklyPlan.kt:81-86; tested at 02:30 on
    8 March 2026 in America/New_York, WeeklyPlanTest.kt:22).
  - Refresh `today` on resume: `LifecycleResumeEffect(Unit) { today = LocalDate.now(); … }`
    (dash:ui/WeeklyPlanScreen.kt:217-218). Dash's Home statistics are keyed on history only
    (DashApp.kt:169), so "this week" stays on the old week if the app sits open across midnight
    on Sunday (read from the code, not seen on a device). Key derived statistics on `today` too.

## 11. Demo data is synthetic, marked, and never mistaken for the user's

- **Rule:** screenshots and emulator flows use synthetic data with an id prefix the tests own.
  Real-phone data never leaves the phone.
- **Why:** release-note screens are "emulator, synthetic data, light and dark"; real-phone captures
  stay private (`references/delivery-process.md` §5). Dash's recovery check "adds a clearly
  synthetic recovery record to emulator data only. Never targets a phone"
  (dash:scripts/check-recovery.py:2-3).
- **How:**
  - Fixtures carry a unique id, and `@After` asserts each delete (UpgradeFlowTest.kt, `tearDown`).
  - Put extreme cases in the fixture set: Dash's long-run layout fixture is a six-hour ultra at
    104.876 km (`references/testing.md` §7).
  - A first-run library is a product decision, not test data. Marginalia seeds curated
    public-domain essays so "the recommendation engine has something to work with"
    (read-later-app:data/SeedData.kt:6-10). Its `seedIfEmpty()` checks `count() == 0`
    (LibraryRepository.kt:49-53), so a user who deletes everything gets the seeds back; record a
    "seeded once" flag instead.
  - The starter's `DemoData` is sample content only; delete it when the first repository lands.

## 12. No DI framework until the graph needs one

- **Rule:** construct dependencies by hand in one place (`Application` or a container) until the
  app has several modules or several implementations per interface.
- **Why:** Marginalia: "For a single-module, single-user app this is plenty — it keeps the build
  dead simple (one annotation processor: Room) while still giving us clean constructor injection
  into the ViewModels" (read-later-app:di/AppContainer.kt:21-23). Neither Dash nor Flick uses a DI
  library.
- **How:** an `AppContainer(context)` with `by lazy` members, created in `Application.onCreate`
  (read-later-app:MarginaliaApp.kt:25). Flick's `Application` holds one `CastCoordinator` and an
  app scope (flick:sender/.../FlickApplication.kt:21-27). A test swaps a member through the
  runner (`StarterTestRunner`), not through a framework.

## 13. Symptom → cause → fix

| Symptom | Cause | Fix |
|---|---|---|
| A tab opens empty, then fills a frame later | the screen waited for disk | a synchronous `cached()`/`peek()` as the initial value (§2) |
| A saved run is gone after the phone died mid-save | a plain `writeText` over the old file | `AtomicFile`; final file before checkpoint delete (§6) |
| An old file shows zeros or crashes the new build | the decoder assumed the newest format | `version` field, decode every old version, keep the upgrade test (§6) |
| The user's plan is empty after an update | an unreadable file was replaced with a default | fail loudly for user data (§7) |
| A resume button never appears again until restart | `catch` completed the flow under `stateIn` | `retryWhen` on `IOException` (§2) |
| Data lost after a "fix the build" reinstall | uninstall, `pm clear`, or a new signing key | `install -r`; export before any key change (§9) |
| The library is wiped on the first schema bump | `fallbackToDestructiveMigration()` shipped | real migrations and exported schemas (§6) |
| A restored phone opens narrowed to a folder the user never chose | a device-specific store was carried by backup | classify each store; `BackupExclusionsTest` (§8) |
| "This week" is last week after midnight | the derived value was keyed on data, not on `today` | refresh `today` on resume and key on it (§10) |
| A run late at night counts on the wrong day | dates computed in UTC | derive `LocalDate` in the current zone (§10) |
| Room fails in `kspDebugKotlin` | KSP version does not match Kotlin/AGP | pick the matching KSP, record the trio (§5) |
| Deleted everything, seeds came back | seeding keyed on an empty table | a "seeded once" flag (§11) |
