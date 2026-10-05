// Shows: an end-to-end text-fit pass that forces a real configuration change and activity
// recreation at the largest supported font scale, with an extreme fixture and an unmerged-tree
// scan so a line hidden inside a collapsed card cannot slip through.
// Example written for this skill; read it, don't paste it.
package com.example.app

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.text.TextLayoutResult
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The density-override matrix (see the starter's `TextFitTest`) runs in seconds but cannot catch
 * a bug that only shows under a real configuration change and activity recreation. This test
 * complements it: one end-to-end pass at the largest scale the app supports, through an actual
 * `settings put system font_scale`, restoring whatever value the device had before the test ran.
 *
 * The fixture is deliberately extreme: an item titled with the longest string the app's data
 * model allows, "where a short title never reaches" the wrapping or clipping behaviour at all.
 */
@RunWith(AndroidJUnit4::class)
class LongTextLayoutTest {
    @get:Rule val activity = createAndroidComposeRule<MainActivity>()

    private var priorScale: String? = null

    @Before
    fun recordPriorFontScale() {
        priorScale = EmulatorSupport.readSetting("system", "font_scale")
    }

    @After
    fun restorePriorFontScale() {
        if (priorScale == null) EmulatorSupport.shell("settings delete system font_scale")
        else EmulatorSupport.shell("settings put system font_scale $priorScale")
    }

    @Test
    fun everyLineFitsItsBoxAtTheLargestFontScale() {
        EmulatorSupport.requireEmulator()
        // The longest fixture title the app's data model allows, so this test exercises the
        // worst case rather than whatever happens to be in the demo data today.
        val longId = DemoData.seedLongTitleItem(title = "A".repeat(180) + " item title that never wraps cleanly on a 360 dp phone")
        EmulatorSupport.shell("settings put system font_scale 2.0")
        activity.activityRule.scenario.recreate()
        activity.waitForIdle()

        EmulatorSupport.tap(activity, Tags.libraryRow(longId))
        activity.waitForIdle()

        // Scan the UNMERGED tree: a merged card node hides the layout of the text lines inside
        // it, so a clipped line in a collapsed card would otherwise never be seen.
        val hasTextLayout = SemanticsMatcher("has GetTextLayoutResult") {
            it.config.getOrNull(SemanticsActions.GetTextLayoutResult) != null
        }
        val problems = mutableListOf<String>()
        for (node in activity.onAllNodes(hasTextLayout, useUnmergedTree = true).fetchSemanticsNodes()) {
            val results = mutableListOf<TextLayoutResult>()
            node.config.getOrNull(SemanticsActions.GetTextLayoutResult)?.action?.invoke(results)
            val layout = results.firstOrNull() ?: continue
            if (layout.didOverflowHeight) problems += "a line overflowed its box"
            val widestLine = (0 until layout.lineCount).maxOf { layout.getLineRight(it) - layout.getLineLeft(it) }
            if (widestLine > node.boundsInRoot.width + 1f) {
                problems += "a line is wider than its box by ${widestLine - node.boundsInRoot.width}"
            }
        }
        // Collect every problem before asserting, so one run lists them all instead of stopping
        // at the first and requiring a second pass to find the next.
        assertTrue("Text overflowed at 2.0x: $problems", problems.isEmpty())

        DemoData.deleteItem(longId)
    }
}
