# Starter

<!-- Replace this paragraph on day one: what the app does and for whom, in one or two sentences.
     Keep this file short. It points at the records; it never restates test counts or versions,
     which go stale. -->
_What the app does, and for whom._

## Latest version

No version recorded yet. Each version gets `docs/upgrade-x.y/` (start from
`docs/upgrade-template/`); link the newest one here.

## Build

```sh
source scripts/android-env.sh && ./gradlew :app:assembleDebug :app:testDebugUnitTest
```

Everything else (release builds, the emulator suites, installing on a phone without losing its
data) is in `CLAUDE.md`.

## Installing on a phone that has data

Only with `scripts/install-phone.sh`, which updates in place. Do not uninstall or clear app
storage to update: that deletes the user's data.
