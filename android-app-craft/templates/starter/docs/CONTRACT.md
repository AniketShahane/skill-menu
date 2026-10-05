# Starter build contract

<!--
Write this BEFORE fanning work out to parallel agents, and change it before the code. It fixes
the shared names so each lane can build against them without waiting, and it says who owns which
files so no two agents edit the same one. Dash's version (dash:docs/CONTRACT.md) assigned
"core agent owns core/ and JVM tests, service agent owns tracking/, UI agent owns ui/ and
MainActivity, root owns build scaffolding, integration, QA and docs". Delete this comment.
-->

Package `com.example.starter`. Kotlin, minSdk 26, compileSdk 37, targetSdk 36, Compose + Material 3
Expressive. Toolchain pins live in `gradle/libs.versions.toml`; nobody but the build lane edits them.

## Rules for every lane

- Write only the files your lane owns (table below). Need a change in another lane's file? Ask
  its owner, or define a private helper in your own file.
- Use only the shared names below from other lanes. Adding to a shared API is additive and
  announced; changing one is a contract change and happens here first.
- **Never run Gradle.** One integrator runs every build and test, so builds never clash.
- User-facing strings go in `res/values/strings.xml` (owner: <lane>). Comments state
  constraints only.

## Lane ownership

| Lane | Owns | Starts when |
|---|---|---|
| build / integrator | `settings.gradle.kts`, `build.gradle.kts`, `gradle/**`, `app/build.gradle.kts`, `MainActivity.kt`, `scripts/**`; **all Gradle runs** | now |
| theme | `ui/theme/**`, `res/values*/themes.xml`, `res/font/**`, theme JVM tests | now |
| motion | `ui/motion/**`, `ui/nav/**`, their JVM tests | now |
| components | `ui/components/**`, `ui/screens/**`, `ui/StarterApp.kt`, `ui/Tags.kt`, `strings.xml` | theme + motion APIs frozen |
| <data / core> | `data/**` (or `core/**`) and its JVM tests; one repository per aggregate (references/data-and-state.md) | now |
| tests | `app/src/androidTest/**` | screens stable |
| verifier (xhigh) | read-only; findings with file:line | integration green |
| fixers (medium) | the files named in each confirmed finding | per finding |

## Data types

```kotlin
// package com.example.starter.data   (owner: <lane>)
data class Item(val id: String, val title: String, /* … */)
```

## API seams

```kotlin
// package com.example.starter.ui.theme   (owner: theme)
object AppTheme { val colors: AppColors @Composable get() /* … */ }

// package com.example.starter.ui.nav     (owner: motion)
sealed interface Route { /* … */ }
class Navigator(start: Route) { fun go(route: Route); fun back(): Boolean /* … */ }

// package com.example.starter.ui         (owner: components)
object Tags { const val HomeList = "home_list" /* … */ }
```

Where two lanes meet at a service, one lane defines the interface with a no-op default and the
other implements it; the integrator wires them at merge.

## Test hooks

- `StarterTestRunner` switches off <paid / network backends> before the app starts.
- Tags every emulator test relies on: `Tags.*` (never rename without the tests).
- <Fake clocks: every "today" or "this week" takes a `LocalDate` and `ZoneId` parameter, so tests pass fixed ones.>
- <Seeded data: the fixture a debug or test hook writes, with a unique id prefix the tests delete.>
- <Deep links, if any.>
- `EmulatorSupport.userStatePreserved()` guards preferences by value and data files by hash; say here
  if a store needs a row-level check instead.
