# Applied to the app only when the instrumentation suites target the release build
# (-PappTestRelease=true). The test APK shares the app's Compose, Kotlin and coroutine classes and
# reaches members the app itself never calls, so the tested build must not prune or rename them.
# It stays non-debuggable and keeps R8's optimisations; only shrinking and renaming are off
# (dash:app/proguard-test-app-rules.pro).
-dontshrink
-dontobfuscate
-dontwarn java.lang.invoke.MethodHandleProxies
