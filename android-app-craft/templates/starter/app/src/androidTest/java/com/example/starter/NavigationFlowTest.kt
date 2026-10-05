package com.example.starter

import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.starter.ui.Tags
import com.example.starter.ui.theme.ThemePreference
import com.example.starter.ui.theme.ThemeStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.runner.RunWith

/**
 * The whole app under the real activity: Home, into a Detail page and back, then Settings and an
 * appearance switch. Runs on the dedicated emulator only, with animations off
 * (`testOptions.animationsDisabled`), and leaves every preference file exactly as it found it —
 * the emulator builds up history that later suites depend on, and a test that resets it hides the
 * bugs only old data shows (dash:androidTest/UpgradeFlowTest.kt:89-128).
 */
@RunWith(AndroidJUnit4::class)
class NavigationFlowTest {
    private val compose = createAndroidComposeRule<MainActivity>()

    // Guard and restore sit outside the activity: the guard runs before the app launches, and the
    // restore after the activity is gone, where nothing can save over it.
    @get:Rule val rules: RuleChain = RuleChain.outerRule(EmulatorSupport.userStatePreserved()).around(compose)

    private val context get() = EmulatorSupport.context

    @Test fun homeOpensAnItemIntoDetail_backReturnsHome_andSettingsSwitchesTheAppearance() {
        compose.onNodeWithTag(Tags.HomeList).assertIsDisplayed()

        val item = firstItemTag()
        EmulatorSupport.tap(compose, item)
        compose.waitUntil(10_000) { EmulatorSupport.hasNode(compose, Tags.DetailPage) }
        compose.onNodeWithTag(Tags.DetailPage).assertIsDisplayed()

        // The system back path, the same one predictive back completes into.
        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitUntil(10_000) { !EmulatorSupport.hasNode(compose, Tags.DetailPage) }
        compose.onNodeWithTag(Tags.HomeList).assertIsDisplayed()

        tab(R.string.tab_settings).performClick()
        compose.waitUntil(10_000) { EmulatorSupport.hasNode(compose, Tags.SettingsList) }

        // Light first, then Dark, so the test proves a switch even when the user already runs dark.
        choose("Light", ThemePreference.LIGHT)
        assertTrue("Light must paint a light canvas (median luminance ${medianLuminance()})", medianLuminance() > 0.5f)
        choose("Dark", ThemePreference.DARK)
        assertTrue("Dark must paint a dark canvas (median luminance ${medianLuminance()})", medianLuminance() < 0.25f)
    }

    /** The first Home item's tag. Home's content is the starter's, so the test never names an id. */
    private fun firstItemTag(): String {
        val prefix = Tags.item("")
        val items = compose.onAllNodes(
            SemanticsMatcher("test tag starting with $prefix") {
                it.config.getOrNull(SemanticsProperties.TestTag)?.startsWith(prefix) == true
            } and hasAnyAncestor(hasTestTag(Tags.HomeList)),
        ).fetchSemanticsNodes()
        assertTrue("Home must show at least one item tagged $prefix<id>", items.isNotEmpty())
        return items.first().config[SemanticsProperties.TestTag]
    }

    /**
     * A tab of the floating bar, by the label the bar gives it (its content description, which is
     * what TalkBack reads), read from the same string resource. Never by position: a tab added in
     * front of Settings would otherwise make this tap the wrong one and time out.
     */
    private fun tab(label: Int): SemanticsNodeInteraction {
        val name = context.getString(label)
        val matcher = hasContentDescription(name) and hasClickAction() and hasAnyAncestor(hasTestTag(Tags.BottomBar))
        val found = compose.onAllNodes(matcher).fetchSemanticsNodes().size
        assertEquals("The bar must offer exactly one tab labelled \"$name\"", 1, found)
        return compose.onNode(matcher)
    }

    /**
     * Picks an appearance option by its visible label and waits until MainActivity has saved it.
     * The label is the one assumption about copy in this test; if the option gains a test tag,
     * match that instead.
     */
    private fun choose(label: String, expected: ThemePreference) {
        val option = compose.onNode(hasText(label, ignoreCase = true) and hasClickAction())
        runCatching { option.performScrollTo() }
        EmulatorSupport.clearOfBottomBar(compose, option)
        option.performClick()
        EmulatorSupport.await("Choosing $label must save $expected") { ThemeStore(context).load() == expected }
        compose.waitForIdle()
        if (option.fetchSemanticsNode().config.getOrNull(SemanticsProperties.Selected) != null) option.assertIsSelected()
        assertEquals(expected, ThemeStore(context).load())
    }

    /** Median luminance of every eighth pixel of the window: the canvas dominates, cards do not. */
    private fun medianLuminance(): Float {
        val pixels = compose.onRoot().captureToImage().toPixelMap()
        val samples = ArrayList<Float>()
        for (y in 0 until pixels.height step 8) for (x in 0 until pixels.width step 8) samples += pixels[x, y].luminance()
        samples.sort()
        return samples[samples.size / 2]
    }
}
