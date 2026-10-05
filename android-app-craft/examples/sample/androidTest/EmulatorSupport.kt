// Shows: guards that restrict mutating helpers to emulators, reaching a node by scrolling and
// clearing it of a floating bar instead of guessed coordinates, and leaving device state and
// user data exactly as a test found them.
// Example written for this skill; read it, don't paste it.
package com.example.app

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
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.rules.TestRule
import org.junit.runners.model.Statement

/**
 * Helpers shared by every emulator suite. Every entry point that changes device state (a
 * setting, a preference, a scroll position) calls [requireEmulator] first, so a test that resets
 * a global setting can never run against the developer's own phone.
 */
internal object EmulatorSupport {
    val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    val context: Context get() = instrumentation.targetContext

    fun requireEmulator() {
        assertTrue(
            "This suite changes device state and is restricted to emulators",
            Build.HARDWARE in listOf("ranchu", "goldfish") ||
                Build.MODEL.contains("sdk_gphone") ||
                Build.FINGERPRINT.contains("emulator"),
        )
    }

    fun shell(command: String): String =
        instrumentation.uiAutomation.executeShellCommand(command).use { descriptor ->
            FileInputStream(descriptor.fileDescriptor).bufferedReader().use { it.readText() }
        }

    /** Polls for state Compose cannot see directly: a file, a setting, a background service. */
    fun await(message: String, timeoutMillis: Long = 15_000, condition: () -> Boolean) {
        val deadline = SystemClock.elapsedRealtime() + timeoutMillis
        while (!condition() && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(100)
        assertTrue(message, condition())
    }

    // ---- reaching a node the way a finger would, without a finger ------------------------

    /** Pages whose content lives in a lazily composed list; a row below the fold does not exist
     * in the tree until its list scrolls to it, so looking it up by tag alone finds nothing. */
    private val scrollingPages = listOf(Tags.LibraryList, Tags.SettingsList, Tags.DetailPage)

    /** Brings [tag] into the composition, scrolls it into view, and lifts it clear of the
     * floating bar. Returns null when no visible list can reach it. */
    fun revealOrNull(compose: ComposeTestRule, tag: String): SemanticsNodeInteraction? {
        compose.waitForIdle()
        val alreadyShown = hasNode(compose, tag) &&
            runCatching { compose.onNodeWithTag(tag).assertIsDisplayed() }.isSuccess
        if (!alreadyShown) for (list in scrollingPages) {
            if (!hasNode(compose, list)) continue
            runCatching { compose.onNodeWithTag(list).performScrollToNode(hasTestTag(tag)) }
            compose.waitForIdle()
            if (hasNode(compose, tag)) break
        }
        if (!hasNode(compose, tag)) return null
        val node = compose.onNodeWithTag(tag)
        runCatching { node.performScrollTo() }
        compose.waitForIdle()
        clearOfFloatingBar(compose, node)
        return node
    }

    fun tap(compose: ComposeTestRule, tag: String) {
        (revealOrNull(compose, tag) ?: compose.onNodeWithTag(tag)).assertIsDisplayed().performClick()
    }

    fun hasNode(compose: ComposeTestRule, tag: String): Boolean =
        compose.onAllNodesWithTag(tag).fetchSemanticsNodes(atLeastOneRootRequired = false).isNotEmpty()

    /**
     * Scrolls [node] up until it clears a floating bottom bar ([Tags.BottomBar]) by a small
     * margin. The bar floats over the page content, so a node can report itself as "displayed"
     * and still sit under the glass, where a click lands on the bar's own tab instead of the
     * node underneath it. Scrolls through the nearest scrolling ancestor's own ScrollBy
     * semantics action rather than a swipe gesture, so nothing is pressed on the way there.
     */
    fun clearOfFloatingBar(compose: ComposeTestRule, node: SemanticsNodeInteraction) {
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

    // ---- settings, restored exactly -------------------------------------------------------

    /** A device setting as the shell reads it, or null when unset. The shell prints the literal
     * word "null" for an unset key; writing that back would store the string "null" rather than
     * clearing it, so restoring an unset key must delete it instead of writing it. */
    fun readSetting(namespace: String, key: String): String? =
        shell("settings get $namespace $key").trim().takeUnless { it.isEmpty() || it == "null" }

    /** Sets [key] to [value] for the duration of [block], then restores the exact prior value —
     * deleting the key if it was unset rather than writing back the string "null". */
    fun <T> withSetting(namespace: String, key: String, value: String, block: () -> T): T {
        requireEmulator()
        val prior = readSetting(namespace, key)
        shell("settings put $namespace $key $value")
        try {
            return block()
        } finally {
            if (prior == null) shell("settings delete $namespace $key") else shell("settings put $namespace $key $prior")
        }
    }

    // ---- leaving the user's data exactly as the test found it ------------------------------

    private val preferenceFiles = listOf("app_prefs", "theme_prefs")

    private fun preferences(name: String) = context.getSharedPreferences(name, Context.MODE_PRIVATE)

    fun snapshotPreferences(): Map<String, Map<String, Any?>> =
        preferenceFiles.associateWith { preferences(it).all.toMap() }

    private fun restorePreferences(snapshot: Map<String, Map<String, Any?>>) {
        for ((name, values) in snapshot) {
            val editor = preferences(name).edit().clear()
            for ((key, value) in values) when (value) {
                is Boolean -> editor.putBoolean(key, value)
                is Int -> editor.putInt(key, value)
                is String -> editor.putString(key, value)
                else -> Unit
            }
            assertTrue("Restore preference file $name", editor.commit())
        }
    }

    private val dataDirs = listOf("files", "no_backup", "databases")

    /** SHA-256 of every data file outside shared_prefs, by path relative to the app's data
     * directory. SQLite's -wal/-shm sidecars are skipped; they change whenever a database is
     * merely opened, which is not a change the test caused. */
    fun snapshotDataFiles(): Map<String, String> {
        val root = File(context.applicationInfo.dataDir)
        return dataDirs.map { File(root, it) }.filter { it.isDirectory }
            .flatMap { dir -> dir.walkTopDown().filter { it.isFile && !it.name.matches(Regex(".*-(wal|shm|journal)$")) }.toList() }
            .associate { it.relativeTo(root).path to sha256(it) }
    }

    private fun sha256(file: File) = MessageDigest.getInstance("SHA-256")
        .digest(file.readBytes()).joinToString("") { "%02x".format(it) }

    /** Fails when a file that existed before the test was changed or deleted. Files the test
     * created are the test's own to delete and assert; this only guards what was already there. */
    fun assertDataFilesUntouched(before: Map<String, String>) {
        val after = snapshotDataFiles()
        val touched = before.filter { (path, hash) -> after[path] != hash }.keys
        assertTrue("The test changed or deleted existing files: $touched", touched.isEmpty())
    }

    /**
     * A rule that refuses to run off an emulator, snapshots preferences and data files before the
     * activity launches, restores preferences after it is torn down, then checks every
     * pre-existing data file is byte-identical. Install it OUTSIDE the activity rule
     * (`RuleChain.outerRule(EmulatorSupport.userStatePreserved()).around(compose)`) so the guard
     * runs before launch and the restore runs after the activity is gone, where nothing can save
     * over the restored preferences on the way down.
     */
    fun userStatePreserved(): TestRule = TestRule { base, _ ->
        object : Statement() {
            override fun evaluate() {
                requireEmulator()
                val priorPrefs = snapshotPreferences()
                val priorFiles = snapshotDataFiles()
                try {
                    base.evaluate()
                } finally {
                    restorePreferences(priorPrefs)
                }
                // Outside the finally, so a failing test reports its own failure, not this one.
                assertDataFilesUntouched(priorFiles)
            }
        }
    }

    fun screencap(name: String) {
        requireEmulator()
        shell("mkdir -p /data/local/tmp/app-shots")
        shell("screencap -p /data/local/tmp/app-shots/$name")
    }
}
