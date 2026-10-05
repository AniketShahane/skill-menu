package com.example.starter

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.starter.ui.Tags
import com.example.starter.ui.motion.LocalReducedMotion
import com.example.starter.ui.screens.DemoData
import com.example.starter.ui.screens.DetailScreen
import com.example.starter.ui.screens.HomeScreen
import com.example.starter.ui.screens.SettingsScreen
import com.example.starter.ui.theme.AppTheme
import com.example.starter.ui.theme.ThemePreference
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Every line of text on each page fits its box at font scale 1.0, 1.3 and 2.0, on a 360 dp wide
 * phone. Large text is where a layout that looked fine breaks, and nobody tests at 2.0 by hand.
 *
 * The scale comes from overriding [LocalDensity] (Flick's way, flick:receiver/androidTest/
 * SettingsScreenFocusTest.kt:200-215): no shell, no activity recreation, so the whole matrix runs in
 * seconds and on any device. It cannot catch a bug that only a real configuration change shows;
 * keep one end-to-end pass with `settings put system font_scale 2` for that (Dash's
 * LongRunLayoutTest, examples/sample/androidTest/LongTextLayoutTest.kt).
 *
 * Every problem is collected before asserting, so one run lists them all.
 *
 * Limit: a number painted in the draw phase (AnimatedNumber) exposes no text layout, so this test
 * cannot see it. AnimatedNumber reserves its final text's box; its fit is its parent's layout.
 */
@RunWith(AndroidJUnit4::class)
class TextFitTest {
    @get:Rule val compose = createComposeRule()

    /**
     * One row per page: its name, a tag on its scrolling container or on an ancestor of it, and
     * the page itself. Detail tags its page Box, and the scroll sits on a Column inside it.
     */
    private class Page(val name: String, val listTag: String, val content: @Composable () -> Unit)

    private val pages = listOf(
        Page("Home", Tags.HomeList) { HomeScreen(onOpen = {}) },
        Page("Settings", Tags.SettingsList) { SettingsScreen(preference = ThemePreference.SYSTEM, onPreference = {}) },
        // The sample with a user-length title: the heading must wrap at 2x, never cut.
        Page("Detail", Tags.DetailPage) { DetailScreen(id = DemoData.LONG_TITLE_ID, onBack = {}) },
    )

    @Test fun everyTextFitsItsBoxAtEveryFontScale() {
        var fontScale by mutableFloatStateOf(1f)
        var page by mutableIntStateOf(0)
        var appliedScale = 0f
        compose.setContent {
            val base = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(base.density, fontScale)) {
                appliedScale = LocalDensity.current.fontScale
                AppTheme(preference = ThemePreference.LIGHT) {
                    // Loops park, so the rule can reach idle; entrances draw through a layer and
                    // never change a text box, so they cannot hide or cause a clip.
                    CompositionLocalProvider(LocalReducedMotion provides true) {
                        Box(Modifier.fillMaxHeight().widthIn(max = PHONE_WIDTH_DP.dp).fillMaxWidth()) {
                            pages[page].content()
                        }
                    }
                }
            }
        }

        val problems = linkedSetOf<String>()
        for (pageIndex in pages.indices) for (scale in FONT_SCALES) {
            compose.runOnUiThread { page = pageIndex; fontScale = scale }
            compose.waitForIdle()
            assertEquals("font scale must be applied", scale, compose.runOnIdle { appliedScale }, .01f)
            val current = pages[pageIndex]
            scrollToTop(current.listTag)
            var screens = 0
            do {
                collectClipped("${current.name} at ${scale}x", problems)
            } while (++screens < MAX_SCREENS && scrollByAScreen(current.listTag))
        }
        assertTrue(problems.joinToString("\n"), problems.isEmpty())
    }

    /** Checks every text node in the unmerged tree, so a line inside a card is not hidden by the card. */
    private fun collectClipped(where: String, into: MutableSet<String>) {
        val texts = compose.onAllNodes(
            SemanticsMatcher.keyIsDefined(SemanticsActions.GetTextLayoutResult),
            useUnmergedTree = true,
        ).fetchSemanticsNodes()
        for (node in texts) {
            val getLayout = node.config[SemanticsActions.GetTextLayoutResult].action ?: continue
            val layouts = mutableListOf<TextLayoutResult>()
            compose.runOnUiThread { getLayout(layouts) }
            val why = layouts.firstNotNullOfOrNull { clipped(it) } ?: continue
            into += "$where · ${nearestTag(node)}: $why"
        }
    }

    /**
     * Why a layout does not fit, or null when it does. `didOverflowHeight` is also true when the
     * text needed more lines than maxLines allowed, so an ellipsized label counts as cut.
     * The +1 px is anti-aliasing slack (dash:androidTest/LongRunLayoutTest.kt:116-129).
     */
    private fun clipped(layout: TextLayoutResult): String? = when {
        layout.didOverflowHeight -> "clips vertically (\"${layout.layoutInput.text}\")"
        (0 until layout.lineCount).any { layout.getLineRight(it) > layout.size.width + 1f } ->
            "is cut short (\"${layout.layoutInput.text}\")"
        else -> null
    }

    private fun nearestTag(node: SemanticsNode): String {
        var at: SemanticsNode? = node
        while (at != null) {
            at.config.getOrNull(SemanticsProperties.TestTag)?.let { return it }
            at = at.parent
        }
        return "untagged"
    }

    /** The vertical scroller at [tag]: the tagged node itself, or the first scroller inside it. */
    private fun scroller(tag: String): SemanticsNode? =
        compose.onAllNodesWithTag(tag).fetchSemanticsNodes().firstOrNull()
            ?.takeIf { SemanticsProperties.VerticalScrollAxisRange in it.config }
            ?: compose.onAllNodes(hasScrollAction() and hasAnyAncestor(hasTestTag(tag))).fetchSemanticsNodes()
                .firstOrNull { SemanticsProperties.VerticalScrollAxisRange in it.config }

    private fun scrollToTop(listTag: String) {
        val list = scroller(listTag) ?: return
        // A lazy list's axis range is an index estimate, not pixels, so it goes back by index.
        val toIndex = list.config.getOrNull(SemanticsActions.ScrollToIndex)?.action
        if (toIndex != null) {
            compose.runOnUiThread { toIndex(0) }
        } else {
            val range = list.config.getOrNull(SemanticsProperties.VerticalScrollAxisRange) ?: return
            val scrollBy = list.config.getOrNull(SemanticsActions.ScrollBy)?.action ?: return
            compose.runOnUiThread { scrollBy(0f, -range.value()) }
        }
        compose.waitForIdle()
    }

    /** Scrolls most of a viewport down; false when the list is absent or already at its end. */
    private fun scrollByAScreen(listTag: String): Boolean {
        val list = scroller(listTag) ?: return false
        val range = list.config.getOrNull(SemanticsProperties.VerticalScrollAxisRange) ?: return false
        val scrollBy = list.config.getOrNull(SemanticsActions.ScrollBy)?.action ?: return false
        val before = compose.runOnIdle { range.value() }
        compose.runOnUiThread { scrollBy(0f, list.boundsInRoot.height * .7f) }
        compose.waitForIdle()
        return compose.runOnIdle { range.value() } != before
    }

    private companion object {
        val FONT_SCALES = listOf(1f, 1.3f, 2f)

        /** The narrow end of phones in use; a wider test device is held to it. */
        const val PHONE_WIDTH_DP = 360

        /** A page longer than this many screens is a bug of its own. */
        const val MAX_SCREENS = 12
    }
}
