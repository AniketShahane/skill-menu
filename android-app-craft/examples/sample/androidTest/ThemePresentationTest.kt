// Shows: checking a theme switch and activity recreation by sampling pixel luminance, which a
// JVM contrast test cannot see because system bars and recreation only exist on a device.
// Example written for this skill; read it, don't paste it.
package com.example.app

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onRoot
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * A JVM contrast test (the theme lane's `PaletteContrastTest`) proves the palette's numbers are
 * right, but it cannot see what the device actually draws: the status and navigation bars, or
 * what a theme switch leaves behind across activity recreation. This test samples drawn pixels
 * instead of reading a color value, because a translucent system bar has no real color until a
 * frame is composited under it.
 */
@RunWith(AndroidJUnit4::class)
class ThemePresentationTest {
    @get:Rule val activity = createAndroidComposeRule<MainActivity>()

    private fun medianLuma(colors: List<Color>): Float {
        val lumas = colors.map { (0.2126f * it.red + 0.7152f * it.green + 0.0722f * it.blue) }.sorted()
        return lumas[lumas.size / 2]
    }

    /** Samples a thin strip across the very top of the root, where the status bar area sits,
     * rather than a single pixel that might land on an icon or a notch cutout. */
    private fun topStripLuma(): Float {
        val bitmap = activity.onRoot().captureToImage().asAndroidBitmap()
        val y = 4
        val colors = (0 until bitmap.width step bitmap.width / 24).map { x ->
            Color(bitmap.getPixel(x, y))
        }
        return medianLuma(colors)
    }

    @Test
    fun lightThemeKeepsTheTopStripBright() {
        EmulatorSupport.tap(activity, Tags.themeOption("light"))
        activity.activityRule.scenario.recreate()
        activity.waitForIdle()
        assertTrue("light top strip luma was ${topStripLuma()}", topStripLuma() > 0.5f)
    }

    @Test
    fun darkThemeKeepsTheTopStripDark() {
        EmulatorSupport.tap(activity, Tags.themeOption("dark"))
        activity.activityRule.scenario.recreate()
        activity.waitForIdle()
        assertTrue("dark top strip luma was ${topStripLuma()}", topStripLuma() < 0.25f)
    }

    /**
     * The choice itself must survive recreation, not merely be visible before it. A theme that
     * looks right until rotation or a process restart is a theme that read a cached value once
     * instead of the saved preference.
     */
    @Test
    fun theChosenThemeSurvivesRecreation() {
        EmulatorSupport.tap(activity, Tags.themeOption("dark"))
        activity.waitForIdle()
        val beforeLuma = topStripLuma()
        activity.activityRule.scenario.recreate()
        activity.waitForIdle()
        assertTrue("theme did not survive recreation", (topStripLuma() - beforeLuma) < 0.05f)
    }
}
