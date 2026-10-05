package com.example.starter

import android.content.Context
import android.os.Build
import android.os.SystemClock
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.isRoot
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import com.example.starter.ui.Tags
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.rules.TestRule
import org.junit.runners.model.Statement

/**
 * Helpers for the emulator suites. Everything here changes device state (settings, preferences,
 * scroll positions), so every mutating entry point checks [requireEmulator] first: a test that
 * resets a setting must never reach the user's phone. Ported from Dash's EmulatorSupport
 * (dash:androidTest/EmulatorSupport.kt:42-196; examples/sample/androidTest/EmulatorSupport.kt).
 */
internal object EmulatorSupport {
    val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    val context: Context get() = instrumentation.targetContext

    fun requireEmulator() {
        assertTrue(
            "This suite changes device state and is restricted to Android emulators",
            Build.HARDWARE in listOf("ranchu", "goldfish") ||
                Build.MODEL.contains("sdk_gphone") ||
                Build.FINGERPRINT.contains("emulator") ||
                Build.FINGERPRINT.contains("sdk_gphone"),
        )
    }

    /** Runs [command] as the shell user; `settings`, `screencap` and `pm` need that identity. */
    fun shell(command: String): String =
        instrumentation.uiAutomation.executeShellCommand(command).use { descriptor ->
            FileInputStream(descriptor.fileDescriptor).bufferedReader().use { it.readText() }
        }

    /** Polls every 100 ms; for state outside Compose (a file, a setting, a service). */
    fun await(message: String, timeoutMillis: Long = 15_000, condition: () -> Boolean) {
        val deadline = SystemClock.elapsedRealtime() + timeoutMillis
        while (!condition() && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(100)
        assertTrue(message, condition())
    }

    /** True while at least one composed node carries [tag]. */
    fun hasNode(compose: ComposeTestRule, tag: String): Boolean =
        compose.onAllNodesWithTag(tag).fetchSemanticsNodes(atLeastOneRootRequired = false).isNotEmpty()

    // ---- Reaching a node the way a finger would, without a finger ----

    /**
     * The pages whose content lives in a scrolling list. A lazy item below the fold is not composed
     * until its list scrolls to it, so a test that looks it up by tag finds nothing.
     */
    private val pageLists = listOf(Tags.HomeList, Tags.SettingsList, Tags.DetailPage)

    /**
     * Brings [tag] into the composition by scrolling whichever page list is showing, scrolls it into
     * view, and moves it out from under the floating bar. Null when no page list can reach it.
     */
    fun revealOrNull(compose: ComposeTestRule, tag: String): SemanticsNodeInteraction? {
        compose.waitForIdle()
        // A node already on screen (a dialog button, a hero) must not make the page list scroll;
        // a prefetched lazy item exists in the tree before it is placed, so "exists" is not
        // "shown", and only the list's own scroll-to-node brings it into the viewport.
        // dash:docs/upgrade-0.9.1/README.md (Validation): three classes failed on exactly this.
        val shown = hasNode(compose, tag) &&
            runCatching { compose.onNodeWithTag(tag).assertIsDisplayed() }.isSuccess
        if (!shown) for (list in pageLists) {
            if (!hasNode(compose, list)) continue
            val scrolled = runCatching { compose.onNodeWithTag(list).performScrollToNode(hasTestTag(tag)) }.isSuccess
            compose.waitForIdle()
            if (scrolled && hasNode(compose, tag)) break
        }
        if (!hasNode(compose, tag)) return null
        val node = compose.onNodeWithTag(tag)
        runCatching { node.performScrollTo() }
        compose.waitForIdle()
        clearOfBottomBar(compose, node)
        return node
    }

    fun reveal(compose: ComposeTestRule, tag: String): SemanticsNodeInteraction =
        revealOrNull(compose, tag) ?: compose.onNodeWithTag(tag)

    fun tap(compose: ComposeTestRule, tag: String) {
        reveal(compose, tag).assertIsDisplayed().performClick()
    }

    /**
     * Scrolls [node] up until it clears the floating bar ([Tags.BottomBar]) by 12 dp. The bar
     * floats over the page, so a node can be "displayed" and still sit under the glass, where a
     * click lands on a tab instead (dash:docs/upgrade-0.9/validation.json, emulator note).
     *
     * It scrolls through the nearest scrolling ancestor's ScrollBy semantics action, not a swipe:
     * no touch gesture can press a control on the way, and the node stays where the test expects.
     * There is deliberately no touch fallback; a node with no scrolling ancestor cannot be moved,
     * and the click that follows should fail loudly rather than land somewhere else.
     */
    fun clearOfBottomBar(compose: ComposeTestRule, node: SemanticsNodeInteraction) {
        // A dialog or menu is its own window above the bar; only the main window needs the nudge.
        if (compose.onAllNodes(isRoot()).fetchSemanticsNodes().size != 1) return
        val bar = compose.onAllNodesWithTag(Tags.BottomBar).fetchSemanticsNodes().firstOrNull() ?: return
        val semantics = node.fetchSemanticsNode()
        val margin = with(compose.density) { 12.dp.toPx() }
        val overlap = semantics.boundsInRoot.bottom - bar.boundsInRoot.top + margin
        if (overlap <= 0f) return
        var ancestor = semantics.parent
        while (ancestor != null && ancestor.config.getOrNull(SemanticsActions.ScrollBy) == null) ancestor = ancestor.parent
        val scrollBy = ancestor?.config?.getOrNull(SemanticsActions.ScrollBy)?.action ?: return
        compose.runOnUiThread { scrollBy(0f, overlap) }
        compose.waitForIdle()
    }

    // ---- Leaving the device as the test found it ----

    /**
     * A device setting as the shell reads it, or null when it is unset. The shell prints the word
     * "null" for an unset key; writing that back would store the string "null", so a restore of an
     * unset key must delete it instead (dash:androidTest/LongRunLayoutTest.kt:62-68).
     */
    fun readSetting(namespace: String, key: String): String? =
        shell("settings get $namespace $key").trim().takeUnless { it.isEmpty() || it == "null" }

    fun writeSetting(namespace: String, key: String, value: String?) {
        requireEmulator()
        if (value == null) shell("settings delete $namespace $key")
        else shell("settings put $namespace $key $value")
    }

    /**
     * Runs [block] with a device setting changed, and puts the exact prior value back even when
     * [block] throws. For `system font_scale` and `global animator_duration_scale`.
     */
    inline fun <T> withSetting(namespace: String, key: String, value: String, block: () -> T): T {
        val prior = readSetting(namespace, key)
        writeSetting(namespace, key, value)
        try {
            return block()
        } finally {
            writeSetting(namespace, key, prior)
        }
    }

    /** Every SharedPreferences file of the app under test, by name, with its values. */
    fun snapshotPreferences(): Map<String, Map<String, Any?>> =
        preferenceNames().associateWith { name -> preferences(name).all.toMap() }

    /**
     * Puts every preference file back exactly as [snapshot] holds it, through the SharedPreferences
     * API rather than by copying files: the app under test runs in this process and keeps each file
     * cached in memory, so a file written underneath it would be overwritten by its next save.
     * A file the test created is emptied and deleted.
     */
    @Suppress("UNCHECKED_CAST")
    fun restorePreferences(snapshot: Map<String, Map<String, Any?>>) {
        requireEmulator()
        for (name in preferenceNames() - snapshot.keys) {
            assertTrue("Empty the preference file $name the test created", preferences(name).edit().clear().commit())
            context.deleteSharedPreferences(name)
        }
        for ((name, values) in snapshot) {
            val editor = preferences(name).edit().clear()
            values.forEach { (key, value) ->
                when (value) {
                    is String -> editor.putString(key, value)
                    is Int -> editor.putInt(key, value)
                    is Long -> editor.putLong(key, value)
                    is Float -> editor.putFloat(key, value)
                    is Boolean -> editor.putBoolean(key, value)
                    is Set<*> -> editor.putStringSet(key, value as Set<String>)
                }
            }
            assertTrue("Restore the preference file $name", editor.commit())
        }
        for ((name, values) in snapshot) {
            assertEquals("Preference file $name must be exactly as the test found it", values, preferences(name).all.toMap())
        }
    }

    /**
     * SHA-256 of every file the app keeps outside shared_prefs (files/, no_backup/, databases/),
     * by path under the data directory. Preferences are compared by value instead
     * ([snapshotPreferences]). Skipped: SQLite's -wal/-shm/-journal sidecars, which change whenever
     * a database is opened, and profileinstaller's two markers in files/, which the library
     * rewrites on its own schedule. Dash hashes its run files the same way
     * (dash:androidTest/UpgradeFlowTest.kt:94, runFileHashes).
     */
    fun snapshotDataFiles(): Map<String, String> {
        val root = File(context.applicationInfo.dataDir)
        return DATA_DIRS.map { File(root, it) }.filter { it.isDirectory }
            .flatMap { dir -> dir.walkTopDown().filter { it.isFile && !isVolatile(it) }.toList() }
            .associate { it.relativeTo(root).path to sha256(it) }
    }

    /**
     * Fails when a file that existed before the test was changed or deleted. Files the test created
     * are the test's to delete (and assert). An app whose own launch rewrites a data file, such as
     * a database it migrates on open, compares rows through its repository instead.
     */
    fun assertDataFilesUntouched(before: Map<String, String>) {
        val touched = snapshotDataFiles().let { after -> before.filter { (path, hash) -> after[path] != hash }.keys }
        assertTrue("The test changed or deleted the user's files: $touched", touched.isEmpty())
    }

    /**
     * A rule that refuses to run off an emulator, restores every preference file afterwards, and
     * then checks that every data file that existed before is byte-identical.
     * Put it OUTSIDE the activity rule (`RuleChain.outerRule(userStatePreserved()).around(compose)`)
     * so the guard runs before the app launches and the restore runs after the activity is gone,
     * where nothing can save over it on the way down.
     */
    fun userStatePreserved(): TestRule = TestRule { base, _ ->
        object : Statement() {
            override fun evaluate() {
                requireEmulator()
                val before = snapshotPreferences()
                val files = snapshotDataFiles()
                try {
                    base.evaluate()
                } finally {
                    restorePreferences(before)
                }
                // Outside the finally, so a failing test reports its own failure, not this one.
                assertDataFilesUntouched(files)
            }
        }
    }

    /**
     * A screenshot that survives the test run. Gradle's `connectedAndroidTest` uninstalls the app,
     * and its storage with it, when the run ends (`scripts/test-emulator.sh` installs with
     * `install -r` and never uninstalls), so shots go to /data/local/tmp, which neither runner
     * touches (dash:androidTest/LongRunLayoutTest.kt:131-138). On a headless AVD with
     * `-gpu swiftshader_indirect` screencap returns a black image; read the accessibility tree
     * instead, or boot with `-gpu host`.
     */
    fun screencap(name: String) {
        requireEmulator()
        shell("mkdir -p $SHOT_DIR")
        shell("screencap -p $SHOT_DIR/$name")
    }

    private const val SHOT_DIR = "/data/local/tmp/starter-shots"

    private val DATA_DIRS = listOf("files", "no_backup", "databases")

    private fun isVolatile(file: File): Boolean =
        file.name.endsWith("-wal") || file.name.endsWith("-shm") || file.name.endsWith("-journal") ||
            file.name == "profileInstalled" || file.name.startsWith("profileinstaller_")

    private fun sha256(file: File): String =
        MessageDigest.getInstance("SHA-256").digest(file.readBytes()).joinToString("") { "%02x".format(it) }

    private fun preferences(name: String) = context.getSharedPreferences(name, Context.MODE_PRIVATE)

    private fun preferenceNames(): Set<String> =
        File(context.applicationInfo.dataDir, "shared_prefs")
            .listFiles { file -> file.name.endsWith(".xml") }
            ?.map { it.name.removeSuffix(".xml") }
            ?.toSet()
            .orEmpty()
}
