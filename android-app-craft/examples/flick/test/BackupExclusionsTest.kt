package com.flick.sender

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.w3c.dom.Element
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory

/**
 * The backup exclusions and the code that writes those files are coupled by
 * nothing but two identical string literals sitting in different languages: the
 * prefs name lives in Kotlin, the exclusion path lives in XML, and the build has
 * never had an opinion about whether they agree. A single typo in either — or a
 * new prefs file nobody thought about — silently starts shipping the phone's
 * pairing keys and the user's subtitle API key to Google Drive, with no error
 * anywhere and nothing on screen to notice.
 *
 * This test is that opinion. It parses the real `res/xml` files out of the source
 * tree (not a copy, not a fixture) and it also reads every `getSharedPreferences`
 * call in `src/main`, so neither half can move without the other.
 *
 * Adding a prefs file is meant to fail this test. Classify it below — as a
 * credential store or as something that may legitimately ride along — and say why.
 */
class BackupExclusionsTest {

    @Test fun everySecretBearingPrefsFileIsExcludedFromCloudBackup() {
        val excluded = sharedPrefExcludes(fullBackupSection(xml("backup_rules.xml")))
        assertExcluded(SECRET_BEARING + LEGACY_SECRET_BEARING, excluded, "backup_rules.xml (cloud backup)")
    }

    @Test fun everySecretBearingPrefsFileIsExcludedFromBothTransferPaths() {
        val root = xml("data_extraction_rules.xml")
        for (section in listOf("cloud-backup", "device-transfer")) {
            val excluded = sharedPrefExcludes(childSection(root, section))
            assertExcluded(SECRET_BEARING + LEGACY_SECRET_BEARING, excluded, "data_extraction_rules.xml <$section>")
        }
    }

    @Test fun everyFingerprintKeyedStoreStaysOnThePhoneThatOwnsTheMedia() {
        assertEquals(
            DEVICE_LOCAL_FILES,
            fileExcludes(fullBackupSection(xml("backup_rules.xml"))).intersect(DEVICE_LOCAL_FILES),
        )
        val root = xml("data_extraction_rules.xml")
        for (section in listOf("cloud-backup", "device-transfer")) {
            assertEquals(
                "$section must exclude every device-local store",
                DEVICE_LOCAL_FILES,
                fileExcludes(childSection(root, section)).intersect(DEVICE_LOCAL_FILES),
            )
        }
    }

    /**
     * The Kotlin half. A prefs name that no longer matches its exclusion path is a
     * leak that the XML alone cannot show, because the XML would still look right.
     */
    @Test fun everyPrefsFileInTheSourcesIsClassified() {
        val found = prefsNamesInSources()
        assertTrue(
            "found no getSharedPreferences call at all in $MODULE/src/main — this test " +
                "is not reading the sources it thinks it is",
            found.isNotEmpty(),
        )
        val known = SECRET_BEARING + CARRIED_DELIBERATELY.keys
        val unclassified = found - known
        assertEquals(
            "unclassified SharedPreferences file(s) in $MODULE: $unclassified. Decide whether " +
                "each one holds a credential. If it does, add it to SECRET_BEARING and exclude " +
                "it in backup_rules.xml AND both sections of data_extraction_rules.xml; if it " +
                "does not, add it to CARRIED_DELIBERATELY with the reason.",
            emptySet<String>(),
            unclassified,
        )
        val vanished = SECRET_BEARING - found
        assertEquals(
            "SECRET_BEARING names $vanished, which no getSharedPreferences call in $MODULE " +
                "opens any more. Either the store was renamed — in which case the exclusion " +
                "paths in res/xml now protect nothing — or it is gone and this list is stale.",
            emptySet<String>(),
            vanished,
        )
        // The same question asked of the other list, and it is not symmetry for its own
        // sake. A classification is a written decision about how one file should travel, and
        // an entry naming a file nothing opens does not merely go stale: it reads as cover
        // for whichever file the code opened instead, and the check above cannot see that,
        // because that other file is classified too. This is exactly how the sort
        // preference was first written into `flick_library` — which is excluded from every
        // transfer path — under an entry describing a `flick_library_sort` that did not yet
        // exist, with the suite green.
        val unopened = CARRIED_DELIBERATELY.keys - found
        assertEquals(
            "CARRIED_DELIBERATELY names $unopened, which no getSharedPreferences call in " +
                "$MODULE opens. Either the store moved — in which case the reasoning here " +
                "now describes nothing and the file the code DID open is travelling on " +
                "somebody else's rationale — or it is gone and this entry is stale.",
            emptySet<String>(),
            unopened,
        )
    }

    // --- Assertions ---------------------------------------------------------

    private fun assertExcluded(required: Set<String>, excluded: Set<String>, where: String) {
        val missing = required.map { "$it.xml" }.filterNot { it in excluded }
        if (missing.isNotEmpty()) {
            fail(
                "$where does not exclude $missing. Those files hold pairing keys or the " +
                    "user's subtitle API key; without the exclusion they are uploaded verbatim. " +
                    "Present exclusions were: ${excluded.sorted()}",
            )
        }
    }

    // --- Reading the real files ---------------------------------------------

    private fun xml(name: String): Element {
        val file = File(moduleDir, "src/main/res/xml/$name")
        if (!file.isFile) fail("cannot read ${file.absolutePath} — the backup rules are not where this test looks")
        return DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file).documentElement
    }

    private fun fullBackupSection(root: Element): Element {
        assertEquals("backup_rules.xml root element", "full-backup-content", root.tagName)
        return root
    }

    private fun childSection(root: Element, tag: String): Element {
        assertEquals("data_extraction_rules.xml root element", "data-extraction-rules", root.tagName)
        val nodes = root.getElementsByTagName(tag)
        if (nodes.length != 1) {
            fail("data_extraction_rules.xml must carry exactly one <$tag>; found ${nodes.length}")
        }
        return nodes.item(0) as Element
    }

    /** Every `<exclude domain="sharedpref">` path under [section]. */
    private fun sharedPrefExcludes(section: Element): Set<String> {
        val nodes = section.getElementsByTagName("exclude")
        return (0 until nodes.length)
            .map { nodes.item(it) as Element }
            .filter { it.getAttribute("domain") == "sharedpref" }
            .map { it.getAttribute("path") }
            .toSet()
    }

    private fun fileExcludes(section: Element): Set<String> {
        val nodes = section.getElementsByTagName("exclude")
        return (0 until nodes.length)
            .map { nodes.item(it) as Element }
            .filter { it.getAttribute("domain") == "file" }
            .map { it.getAttribute("path") }
            .toSet()
    }

    /**
     * Every prefs name opened anywhere in `src/main`, resolving the constant when
     * the call site passes one rather than a literal. An unresolvable call site
     * fails rather than being skipped: a store this test cannot see is a store it
     * cannot protect.
     */
    private fun prefsNamesInSources(): Set<String> {
        val names = mutableSetOf<String>()
        File(moduleDir, "src/main/java").walkTopDown().filter { it.extension == "kt" }.forEach { file ->
            val text = file.readText()
            CALL_SITE.findAll(text).forEach { match ->
                val literal = match.groupValues[1]
                val identifier = match.groupValues[2]
                when {
                    literal.isNotEmpty() -> names += literal
                    else -> {
                        val declared = Regex("\\bconst\\s+val\\s+$identifier\\s*=\\s*\"([^\"]*)\"").find(text)
                        if (declared == null) {
                            fail(
                                "${file.name} opens SharedPreferences with `$identifier`, whose value " +
                                    "this test cannot resolve. Inline the name or declare it as a " +
                                    "`const val` in the same file — an unreadable prefs name cannot " +
                                    "be checked against the backup exclusions.",
                            )
                        } else {
                            names += declared.groupValues[1]
                        }
                    }
                }
            }
        }
        return names
    }

    private val moduleDir: File by lazy {
        val marker = "src/main/res/xml/backup_rules.xml"
        generateSequence(File("").absoluteFile) { it.parentFile }
            .flatMap { sequenceOf(it, File(it, MODULE)) }
            .firstOrNull { File(it, marker).isFile }
            ?: throw AssertionError(
                "cannot locate the $MODULE module from ${File("").absolutePath}; looked for $marker",
            )
    }

    private companion object {
        const val MODULE = "sender"

        /**
         * Prefs files that hold a credential. Every one of these must be excluded
         * from cloud backup AND device transfer.
         *
         * `flick_pairings` holds the 256-bit key each paired TV admits this phone
         * on. It is a bearer secret: a restore onto a second device hands that
         * device the first one's authority, which is exactly what it is not meant
         * to do.
         */
        val SECRET_BEARING = setOf("flick_pairings")

        /**
         * Credential stores no code opens any more, whose exclusions stay anyway.
         *
         * `flick_subtitles_online` held the user's own OpenSubtitles API key and
         * bearer token, back when the app offered sign-in and a key of your own.
         * Nothing reads or writes it now, but a phone that ran one of those builds
         * still has the file, and dropping the exclusion would let exactly those
         * leftover secrets ride a backup onto a second device. The exclusion costs
         * nothing and the file it protects is real until that phone is wiped.
         *
         * Excluded like [SECRET_BEARING], but deliberately absent from the
         * every-name-is-still-opened check below — being unopened is the point.
         */
        val LEGACY_SECRET_BEARING = setOf("flick_subtitles_online")

        /**
         * All three stores are keyed by the same hash of a content URI and a MediaStore
         * source revision, so none of them names anything on a second device: restored,
         * they are records that can only ever fail to match, taking up a bounded store's
         * room against the films that phone actually holds.
         *
         * `subtitle_memory` is the directory those subtitle records name, and it is on
         * this list for a second reason the others do not have: it holds verbatim copies
         * of the user's own subtitle files. Excluding the records without the copies would
         * leave the copies travelling alone.
         */
        val DEVICE_LOCAL_FILES = setOf(
            "datastore/flick_playback_progress.preferences_pb",
            "datastore/flick_audio_delay.preferences_pb",
            "datastore/flick_subtitle_memory.preferences_pb",
            "subtitle_memory",
        )

        /**
         * Prefs files that carry no credential, with the reason each is allowed to
         * ride along (or to be excluded for a reason that is not security).
         */
        val CARRIED_DELIBERATELY = mapOf(
            "flick_appearance" to
                "a light/dark choice is about the person, not the device: it is deliberately " +
                    "NOT excluded, and this test must never start demanding that it is",
            "flick_library" to
                "excluded, but for a non-security reason: the scope names a folder of one " +
                    "phone's storage — now a RELATIVE_PATH, which on another phone either " +
                    "matches nothing or matches a same-named folder holding different films",
            "flick_library_sort" to
                "one enum name saying how the grid is ordered. Kept OUT of flick_library on " +
                    "purpose: that file is excluded because a folder scope names one phone's " +
                    "storage, and an order is about the person the way the appearance choice " +
                    "is, so it travels rather than being dropped for somebody else's reason",
            "flick_video_names" to
                "a display-only readability choice is about the person and deliberately " +
                    "travels with them; it contains no filename, path, or credential",
            "flick_subtitles" to
                "held the SAF tree of the retired folder source; nothing writes to it any " +
                    "more and the subtitles sheet reads it once only to release that grant " +
                    "and remove the key, so a restored copy names a folder no code opens",
            "flick_support" to
                "holds only a saturated successful-cast count and a one-way prompt-consumed " +
                    "marker; it contains no checkout URL, credential, or payment data",
        )

        /** `getSharedPreferences("name"` or `getSharedPreferences(CONSTANT`. */
        val CALL_SITE = Regex("""getSharedPreferences\(\s*(?:"([^"]*)"|([A-Za-z_][A-Za-z0-9_]*))""")
    }
}
