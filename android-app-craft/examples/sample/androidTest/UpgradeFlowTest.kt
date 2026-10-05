// Shows: a file-format-upgrade test that writes the oldest format the app ever shipped, opens it
// through the real app, proves the old data still reads correctly, then proves that merely
// viewing it did not rewrite or migrate the file on disk.
// Example written for this skill; read it, don't paste it.
package com.example.app

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.io.File
import java.security.MessageDigest
import java.util.UUID
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Item files carry a `version` field; the decoder reads `version` 1 (no thumbnail hash, just a
 * title and a number) and `version` 2 (adds a thumbnail hash) the same way, and never rewrites a
 * file just because it was opened. This test holds that promise against a real file on disk
 * rather than against the decoder in isolation: it writes a `version` 1 fixture by hand, in the
 * exact bytes the oldest shipped build would have produced, opens it through the live UI, checks
 * the values the app shows, visits other pages, and then checks the file is still byte-identical.
 *
 * The fixture id carries a unique suffix so [tearDown] can assert its own cleanup rather than
 * trusting that nothing else left files behind.
 */
@RunWith(AndroidJUnit4::class)
class UpgradeFlowTest {
    @get:Rule val activity = createAndroidComposeRule<MainActivity>()

    private val fixtureId = "upgrade-legacy-${UUID.randomUUID()}"
    private lateinit var fixtureFile: File

    private fun legacyV1Json(id: String, title: String, number: Int): String =
        JSONObject().apply {
            put("version", 1)
            put("id", id)
            put("title", title)
            put("number", number)
            // v1 never had a thumbnail hash; the decoder must treat its absence as "no
            // thumbnail yet", not as a corrupt file.
        }.toString()

    private fun sha256(file: File) = MessageDigest.getInstance("SHA-256")
        .digest(file.readBytes()).joinToString("") { "%02x".format(it) }

    @Test
    fun viewingAnUpgradedItemDoesNotMigrateOrRewriteTheLegacyFile() {
        EmulatorSupport.requireEmulator()
        val itemsDir = File(activity.activity.filesDir, "items")
        itemsDir.mkdirs()
        fixtureFile = File(itemsDir, "$fixtureId.json")
        fixtureFile.writeText(legacyV1Json(fixtureId, title = "A six-year-old item", number = 104876))
        val hashBeforeAnyRead = sha256(fixtureFile)

        // Opening the file through the real repository and UI, not by constructing a model
        // object directly, is what proves the on-disk format is actually read correctly.
        activity.activityRule.scenario.recreate()
        activity.waitForIdle()
        EmulatorSupport.tap(activity, Tags.libraryRow(fixtureId))
        activity.waitForIdle()

        activity.onNodeWithTag(Tags.detailTitle).assertTextEquals("A six-year-old item")
        activity.onNodeWithTag(Tags.detailNumber).assertTextEquals("104876")

        // Use features that exist only in the newer format while the legacy file is open, to
        // prove viewing (and interacting elsewhere) never triggers a silent migration write.
        EmulatorSupport.tap(activity, Tags.settingsTab)
        activity.waitForIdle()
        EmulatorSupport.tap(activity, Tags.libraryTab)
        activity.waitForIdle()

        assertEquals(
            "Viewing an upgraded item must not migrate or rewrite its legacy file",
            hashBeforeAnyRead,
            sha256(fixtureFile),
        )
    }

    @Test
    fun aFileMissingTheOptionalThumbnailHashLosesOnlyTheThumbnailNeverTheWholeItem() {
        EmulatorSupport.requireEmulator()
        val itemsDir = File(activity.activity.filesDir, "items")
        itemsDir.mkdirs()
        fixtureFile = File(itemsDir, "$fixtureId.json")
        // A deliberately malformed thumbnail block alongside otherwise-good fields: a bad
        // optional block must lose only that field, never make the whole item unreadable.
        fixtureFile.writeText(
            JSONObject().apply {
                put("version", 2)
                put("id", fixtureId)
                put("title", "Partially corrupt item")
                put("number", 7)
                put("thumbnailHash", JSONObject()) // wrong type: should be a string
            }.toString(),
        )

        activity.activityRule.scenario.recreate()
        activity.waitForIdle()
        EmulatorSupport.tap(activity, Tags.libraryRow(fixtureId))
        activity.waitForIdle()

        // The title and number still show; only the thumbnail silently falls back to the
        // placeholder image instead of failing the whole item out of the list.
        activity.onNodeWithTag(Tags.detailTitle).assertTextEquals("Partially corrupt item")
        assertTrue(EmulatorSupport.hasNode(activity, Tags.placeholderThumbnail))
    }

    @After
    fun tearDown() {
        if (::fixtureFile.isInitialized) {
            val deleted = fixtureFile.delete()
            assertTrue("fixture $fixtureId must be deleted by the test that created it", deleted || !fixtureFile.exists())
        }
    }
}
