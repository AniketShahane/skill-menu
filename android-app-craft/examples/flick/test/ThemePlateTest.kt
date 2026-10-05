package com.flick.sender.ui.theme

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The plate the system paints before this process exists, and the canvas the app paints
 * once it does, are the same colour written twice in two languages — a Kotlin `Color` and
 * a hex literal in `values-night/themes.xml`. Nothing in the build relates them.
 *
 * When they drift, the cold start opens on a band of the old colour and settles onto the
 * new one a frame or two later. That is not a crash and no test fails on it; it just looks
 * like a cheap app, and it is exactly the failure that is invisible on a warm launch and
 * on every emulator that keeps the process alive between runs.
 *
 * So this reads the real theme files out of the source tree and holds them to the palette.
 * A dark-mode retune is meant to fail here until the plate comes with it.
 */
class ThemePlateTest {

    @Test fun theNightPlateIsTheDarkCanvas() {
        for (bucket in NIGHT_BUCKETS) {
            val theme = themeXml(bucket)
            assertEquals(
                "$bucket/themes.xml windowBackground is the plate the system paints before " +
                    "FlickTheme exists; it has to be DarkFlickColors.canvas or the cold start " +
                    "flashes the old colour",
                DarkFlickColors.canvas.hex(),
                theme.attr("android:windowBackground"),
            )
        }
    }

    /**
     * The API 31+ splash is resolved before this process runs, so it is the one frame no
     * Kotlin can repaint. It has to agree with the plate it hands over to.
     */
    @Test fun theSplashBehindTheMarkIsTheSamePlate() {
        val theme = themeXml("values-night-v31")
        assertEquals(
            DarkFlickColors.canvas.hex(),
            theme.attr("android:windowSplashScreenBackground"),
        )
    }

    /**
     * The day buckets carry a plate of their own for the same reason, and it is held to
     * the same rule. Only the light SPLASH is exempt: it names
     * `@color/ic_launcher_background` rather than a hex, because on light the launcher
     * plate and the app canvas are the same colour by construction and the reference is
     * the better statement of that.
     */
    @Test fun theDayPlateIsTheLightCanvas() {
        for (bucket in listOf("values", "values-v31")) {
            val theme = themeXml(bucket)
            assertEquals(
                "$bucket/themes.xml windowBackground has to be LightFlickColors.canvas",
                LightFlickColors.canvas.hex(),
                theme.attr("android:windowBackground"),
            )
        }
    }

    private fun themeXml(bucket: String): String {
        val file = File(moduleDir, "src/main/res/$bucket/themes.xml")
        assertTrue("no themes.xml in $bucket — this test is not reading what it thinks", file.isFile)
        val text = file.readText()
        // Read as a claim about the app's own style, not about whatever else is in the
        // file: a plate inherited from a style this test never looked at is not checked.
        assertTrue(
            "$bucket/themes.xml no longer declares Theme.FlickSender",
            text.contains("""name="Theme.FlickSender""""),
        )
        return text
    }

    /** The value of an `<item name="...">`, or "" when the style does not set it. */
    private fun String.attr(name: String): String =
        Regex("""<item\s+name="$name"\s*>\s*([^<]*)\s*</item>""").find(this)
            ?.groupValues?.get(1)?.trim().orEmpty()

    /** `#RRGGBB`, upper case, which is the form the theme files are written in. */
    private fun Color.hex(): String =
        "#%02X%02X%02X".format((red * 255).toInt(), (green * 255).toInt(), (blue * 255).toInt())

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
        const val MODULE = "sender"

        // Night mode outranks the version qualifier, so an API 31+ device in dark mode
        // reads values-night-v31 and everything older reads values-night. Both are the
        // plate; both have to carry the same colour.
        val NIGHT_BUCKETS = listOf("values-night", "values-night-v31")
    }
}
