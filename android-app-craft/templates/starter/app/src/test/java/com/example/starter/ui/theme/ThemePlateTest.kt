package com.example.starter.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The plate the system paints before this process exists, and the canvas the app paints once
 * it does, are the same colour written twice in two languages: a Kotlin `Color` and a hex
 * literal in each bucket's `themes.xml`. Nothing in the build relates them.
 *
 * When they drift, the cold start opens on a band of the old colour and settles onto the new
 * one a frame or two later. Not a crash, and no other test fails; it just looks cheap. It is
 * also invisible on a warm launch and on any emulator that keeps the process alive, which is
 * why it needs a test (flick: sender/src/test/.../ThemePlateTest.kt, flick@b2a3a8f).
 *
 * So this reads the real theme files out of the source tree and holds them to the palette.
 * A palette retune is meant to fail here until the plates come with it.
 */
class ThemePlateTest {

    @Test fun theDayPlateIsTheLightCanvas() {
        for (bucket in DAY_BUCKETS) {
            assertEquals(
                "$bucket/themes.xml windowBackground is the plate the system paints before " +
                    "AppTheme exists; it has to be LightColors.canvas",
                LightColors.canvas.hex(),
                themeXml(bucket).attr("android:windowBackground"),
            )
        }
    }

    @Test fun theNightPlateIsTheDarkCanvas() {
        for (bucket in NIGHT_BUCKETS) {
            assertEquals(
                "$bucket/themes.xml windowBackground has to be DarkColors.canvas, or the cold " +
                    "start flashes the old colour",
                DarkColors.canvas.hex(),
                themeXml(bucket).attr("android:windowBackground"),
            )
        }
    }

    /**
     * The API 31+ splash is resolved before this process runs, so it is the one frame no Kotlin
     * can repaint. It has to agree with the plate it hands over to, in both polarities.
     */
    @Test fun theSplashBehindTheIconIsTheSamePlate() {
        assertEquals(
            LightColors.canvas.hex(),
            themeXml("values-v31").attr("android:windowSplashScreenBackground"),
        )
        assertEquals(
            DarkColors.canvas.hex(),
            themeXml("values-night-v31").attr("android:windowSplashScreenBackground"),
        )
    }

    /** Status-bar icons are seeded from the window theme: dark icons on the day plate only. */
    @Test fun theSeededIconContrastMatchesThePlate() {
        for (bucket in DAY_BUCKETS) {
            assertEquals("$bucket seeds light-bar icons", "true", themeXml(bucket).attr("android:windowLightStatusBar"))
        }
        for (bucket in NIGHT_BUCKETS) {
            assertEquals("$bucket seeds dark-bar icons", "false", themeXml(bucket).attr("android:windowLightStatusBar"))
        }
    }

    private fun themeXml(bucket: String): String {
        val file = File(moduleDir, "src/main/res/$bucket/themes.xml")
        assertTrue("no themes.xml in $bucket — this test is not reading what it thinks", file.isFile)
        val text = file.readText()
        // A claim about the app's own style, not about whatever else is in the file: a plate
        // inherited from a style this test never looked at is not checked.
        assertTrue(
            "$bucket/themes.xml no longer declares $STYLE",
            text.contains("""name="$STYLE""""),
        )
        return text
    }

    /** The value of an `<item name="...">`, or "" when the style does not set it. */
    private fun String.attr(name: String): String =
        Regex("""<item\s+name="$name"\s*>\s*([^<]*)\s*</item>""").find(this)
            ?.groupValues?.get(1)?.trim().orEmpty()

    /** `#RRGGBB`, upper case, the form the theme files are written in. From the packed value. */
    private fun Color.hex(): String = "#%06X".format(toArgb() and 0xFFFFFF)

    /**
     * Gradle runs unit tests with the module as the working directory; an IDE may run them from
     * the project root. Walk up from wherever we are and accept either.
     */
    private val moduleDir: File by lazy {
        val marker = "src/main/res/values-night/themes.xml"
        generateSequence(File("").absoluteFile) { it.parentFile }
            .flatMap { sequenceOf(it, File(it, MODULE)) }
            .firstOrNull { File(it, marker).isFile }
            ?: throw AssertionError(
                "cannot locate the $MODULE module from ${File("").absolutePath}; looked for $marker",
            )
    }

    private companion object {
        const val MODULE = "app"
        const val STYLE = "Theme.Starter"

        val DAY_BUCKETS = listOf("values", "values-v31")

        // Night mode outranks the version qualifier, so an API 31+ device in dark mode reads
        // values-night-v31 and everything older reads values-night. Both are the plate.
        val NIGHT_BUCKETS = listOf("values-night", "values-night-v31")
    }
}
