package com.flick.receiver.ui

import android.view.KeyEvent
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.isFocused
import androidx.test.platform.app.InstrumentationRegistry
import com.flick.receiver.ui.components.LocalShellInteractive
import com.flick.receiver.ui.components.ShellGate
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.Density
import com.flick.receiver.net.PairedPhone
import com.flick.receiver.summon.OpenForCastsRow
import com.flick.receiver.ui.screens.SettingsScreen
import com.flick.receiver.ui.theme.FlickDimens
import com.flick.receiver.ui.theme.FlickTvTheme
import com.flick.receiver.util.FlickLog
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class SettingsScreenFocusTest {

    @get:Rule
    val composeRule = createComposeRule()

    /**
     * Two phones, because "Forget all phones" is only offered at two or more: at
     * one it duplicates that phone's own Forget, and at none it is a destructive
     * action with nothing to destroy. The per-phone rows themselves no longer sit
     * in this column — they are a drill-in behind the Paired phones row — so the
     * count reaches the column only through that row's summary and through the
     * presence of Forget all. One phone is undated, which is how a pairing written
     * before the TV recorded dates renders.
     */
    private val pairedPhones = listOf(
        PairedPhone(keyId = "test-key-a", label = "Pixel 9 Pro", pairedAtMs = 1_726_000_000_000L),
        PairedPhone(keyId = "test-key-b", label = "Galaxy S24", pairedAtMs = null),
    )

    private val expandedDiagnostics = List(14) { index ->
        FlickLog.Entry(
            atMs = 1_726_000_000_000L + index * 1_000L,
            level = listOf('I', 'D', 'W')[index % 3],
            area = listOf("probe", "player", "http", "lan")[index % 4],
            message = "attempt=${index + 1} bufferedMs=${480 - index * 11} retry=${index % 3}",
        )
    }

    private fun assertTitleInsideSafeArea(title: String = "Settings") {
        composeRule.onNodeWithText(title).assertIsDisplayed()
        val titleBounds = composeRule.onNodeWithText(title).getUnclippedBoundsInRoot()
        val rootBounds = composeRule.onRoot().getUnclippedBoundsInRoot()
        val rootHeight = rootBounds.bottom - rootBounds.top
        val safeTop = rootBounds.top + rootHeight * 0.05f
        val safeBottom = rootBounds.bottom - rootHeight * 0.05f
        assertTrue(
            "The pane title must remain inside the vertical 5% safe area; " +
                "title=$titleBounds, root=$rootBounds",
            titleBounds.top >= safeTop && titleBounds.bottom <= safeBottom,
        )
    }

    private fun assertViewportStartsBelowTitle(
        title: String = "Settings",
        viewport: String = "settings-scroll-viewport",
    ) {
        val titleBounds = composeRule.onNodeWithText(title).getUnclippedBoundsInRoot()
        val viewportBounds = composeRule.onNodeWithTag(viewport).getUnclippedBoundsInRoot()
        assertTrue(
            "The clipped scroll viewport must begin below the fixed title, so visible rows cannot paint into it; " +
                "title=$titleBounds, viewport=$viewportBounds",
            viewportBounds.top >= titleBounds.bottom,
        )
    }

    /**
     * Every tagged focus target on either pane. The paired-phone rows moved into
     * the drill-in and took two keys each with them, so Rename and Forget are
     * separate tags now — and the Paired phones row in the column became a focus
     * target of its own when it became the way in.
     */
    private val focusableTags = listOf(
        "settings-first-row",
        "settings-paired-row",
        "settings-phone-rename",
        "settings-phone-forget",
        "settings-paired-back-row",
        "settings-open-row",
        "settings-metrics-row",
        "settings-forget-row",
        "settings-diagnostics-row",
        "settings-clear-row",
        "settings-done-row",
    )

    private fun assertFocusedTargetIsRingSafe(viewport: String = "settings-scroll-viewport") {
        val viewportBounds = composeRule.onNodeWithTag(viewport).getUnclippedBoundsInRoot()
        // Several controls share one tag, so the focused node is resolved by index
        // within its tag rather than by the tag alone.
        var focused: SemanticsNodeInteraction? = null
        for (tag in focusableTags) {
            val nodes = composeRule.onAllNodesWithTag(tag)
            val index = nodes.fetchSemanticsNodes()
                .indexOfFirst { it.config.getOrNull(SemanticsProperties.Focused) == true }
            if (index >= 0) {
                focused = nodes[index]
                break
            }
        }
        assertTrue("Expected one tagged Settings control to own D-pad focus", focused != null)
        if (focused != null) {
            val focusedBounds = focused.getUnclippedBoundsInRoot()
            assertTrue(
                "Focused settings controls need the shared ring reserve within the viewport; " +
                    "control=$focusedBounds, viewport=$viewportBounds",
                focusedBounds.top >= viewportBounds.top + FlickDimens.FocusRingReserve &&
                    focusedBounds.bottom <= viewportBounds.bottom - FlickDimens.FocusRingReserve,
            )
        }
    }

    private fun assertFocusedFirstRowPaintStaysInsideViewport() {
        val rowBounds = composeRule.onNodeWithTag("settings-first-row").getUnclippedBoundsInRoot()
        val viewportBounds = composeRule.onNodeWithTag("settings-scroll-viewport").getUnclippedBoundsInRoot()
        val rowHeight = rowBounds.bottom - rowBounds.top
        // Focus scales a row 6% around center (3% toward each edge), then draws
        // the 4.5dp-offset, 2dp-wide detached ring another 5.5dp outward.
        val focusedTopPaintOutset = rowHeight * 0.03f + 5.5.dp
        assertTrue(
            "Rename's focused scale and ring must remain inside the clipped viewport; " +
                "row=$rowBounds, viewport=$viewportBounds",
            rowBounds.top - focusedTopPaintOutset >= viewportBounds.top,
        )
    }

    private fun assertMetricsPaintStaysInsideHorizontalSafeArea() {
        val metricsBounds = composeRule.onNodeWithTag("settings-metrics-row").getUnclippedBoundsInRoot()
        val rootBounds = composeRule.onRoot().getUnclippedBoundsInRoot()
        val metricsWidth = metricsBounds.right - metricsBounds.left
        val focusedPaintOutset = metricsWidth * 0.03f + 5.5.dp
        assertTrue(
            "A focused full-width settings row, including its scale and ring, must stay " +
                "inside the 48dp 5% horizontal overscan inset; " +
                "metrics=$metricsBounds, root=$rootBounds",
            metricsBounds.left - focusedPaintOutset >= rootBounds.left + 48.dp &&
                metricsBounds.right + focusedPaintOutset <= rootBounds.right - 48.dp,
        )
    }

    @Test
    fun settings_title_stays_inside_safe_area_at_default_font_scale() {
        composeRule.setContent {
            FlickTvTheme {
                SettingsScreen(
                    tvName = "Living Room TV",
                    pairedSummary = "2 paired",
                    pairedPhones = pairedPhones,
                    metricsEnabled = false,
                    onRename = {},
                    onToggleMetrics = {},
                    onForgetAll = {},
                    onDone = {},
                )
            }
        }
        assertTitleInsideSafeArea()
        assertViewportStartsBelowTitle()
        val rename = composeRule.onNodeWithText("Device name")
        rename.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        assertFocusedFirstRowPaintStaysInsideViewport()
    }

    @Test
    fun settings_title_stays_inside_safe_area_at_supported_max_font_scale_and_after_scrolling() {
        composeRule.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale = 2f)) {
                FlickTvTheme {
                    SettingsScreen(
                        tvName = "Living Room TV",
                        pairedSummary = "2 paired",
                        pairedPhones = pairedPhones,
                        metricsEnabled = false,
                        onRename = {},
                        onToggleMetrics = {},
                        onForgetAll = {},
                        onDone = {},
                    )
                }
            }
        }
        assertTitleInsideSafeArea()
        assertViewportStartsBelowTitle()
        assertFocusedTargetIsRingSafe()

        val rename = composeRule.onNodeWithText("Device name")
        val paired = composeRule.onNodeWithTag("settings-paired-row")
        val metrics = composeRule.onNodeWithText("Playback metrics overlay")
        val forgetAll = composeRule.onNodeWithText("Forget all phones")
        val diagnostics = composeRule.onNodeWithText("Diagnostics")
        val done = composeRule.onNodeWithText("Done")
        rename.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        rename.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        paired.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        paired.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        metrics.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        assertMetricsPaintStaysInsideHorizontalSafeArea()
        metrics.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        forgetAll.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        forgetAll.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        diagnostics.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        diagnostics.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        done.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        assertTitleInsideSafeArea()
        assertViewportStartsBelowTitle()

        done.performKeyInput { keyDown(Key.DirectionUp); keyUp(Key.DirectionUp) }
        diagnostics.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        diagnostics.performKeyInput { keyDown(Key.DirectionUp); keyUp(Key.DirectionUp) }
        forgetAll.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        forgetAll.performKeyInput { keyDown(Key.DirectionUp); keyUp(Key.DirectionUp) }
        metrics.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        metrics.performKeyInput { keyDown(Key.DirectionUp); keyUp(Key.DirectionUp) }
        paired.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        paired.performKeyInput { keyDown(Key.DirectionUp); keyUp(Key.DirectionUp) }
        composeRule.onNodeWithText("Device name").assertIsFocused()
        assertFocusedTargetIsRingSafe()
        assertFocusedFirstRowPaintStaysInsideViewport()
    }

    /**
     * The drill-in. The phone list is a pane of its own, so the column's D-pad path
     * no longer grows with the number of paired phones, and the trip has to be
     * reversible: Back lands on the row that opened it, not at the top of the
     * column.
     */
    @Test
    fun paired_phones_drill_in_walks_both_keys_and_returns_to_its_own_row() {
        composeRule.setContent {
            FlickTvTheme {
                SettingsScreen(
                    tvName = "Living Room TV",
                    pairedSummary = "2 paired",
                    pairedPhones = pairedPhones,
                    metricsEnabled = false,
                    onRename = {},
                    onToggleMetrics = {},
                    onForgetAll = {},
                    onDone = {},
                )
            }
        }

        composeRule.onNodeWithText("Device name").assertIsFocused()
        composeRule.onNodeWithTag("settings-paired-row").performClick()

        // The pane, with its own heading and its own viewport.
        assertTitleInsideSafeArea(title = "Paired phones")
        assertViewportStartsBelowTitle(title = "Paired phones", viewport = "settings-paired-viewport")
        composeRule.onNodeWithText("Pixel 9 Pro").assertIsDisplayed()
        composeRule.onNodeWithText("Galaxy S24").assertIsDisplayed()

        val renameKeys = composeRule.onAllNodesWithTag("settings-phone-rename")
        val forgetKeys = composeRule.onAllNodesWithTag("settings-phone-forget")
        assertEquals(2, renameKeys.fetchSemanticsNodes().size)
        assertEquals(2, forgetKeys.fetchSemanticsNodes().size)

        // Entry is the first phone's Rename key; Forget is beside it, the next
        // phone is below, and Back closes the run.
        renameKeys[0].assertIsFocused()
        assertFocusedTargetIsRingSafe(viewport = "settings-paired-viewport")
        renameKeys[0].performKeyInput { keyDown(Key.DirectionRight); keyUp(Key.DirectionRight) }
        forgetKeys[0].assertIsFocused()
        assertFocusedTargetIsRingSafe(viewport = "settings-paired-viewport")
        forgetKeys[0].performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        forgetKeys[1].assertIsFocused()
        assertFocusedTargetIsRingSafe(viewport = "settings-paired-viewport")
        forgetKeys[1].performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }

        val back = composeRule.onNodeWithTag("settings-paired-back-row")
        back.assertIsFocused()
        assertFocusedTargetIsRingSafe(viewport = "settings-paired-viewport")
        back.performClick()

        assertTitleInsideSafeArea()
        composeRule.onNodeWithTag("settings-paired-row").assertIsFocused()
        assertFocusedTargetIsRingSafe()
    }

    /** Forget stays a two-press confirm, and one armed key must not arm its neighbour. */
    @Test
    fun a_single_forget_press_arms_only_its_own_phone() {
        var forgotten: String? = null
        composeRule.setContent {
            FlickTvTheme {
                SettingsScreen(
                    tvName = "Living Room TV",
                    pairedSummary = "2 paired",
                    pairedPhones = pairedPhones,
                    metricsEnabled = false,
                    onRename = {},
                    onToggleMetrics = {},
                    onForgetAll = {},
                    onDone = {},
                    onForgetPhone = { keyId -> forgotten = keyId; true },
                )
            }
        }

        composeRule.onNodeWithTag("settings-paired-row").performClick()
        val forgetKeys = composeRule.onAllNodesWithTag("settings-phone-forget")

        forgetKeys[0].performClick()
        composeRule.runOnIdle { assertNull(forgotten) }
        // The armed phone says so; the other keeps its own summary.
        composeRule.onNodeWithText("Press again to forget").assertIsDisplayed()
        composeRule.onNodeWithText("Paired before this TV recorded dates").assertIsDisplayed()

        forgetKeys[0].performClick()
        composeRule.runOnIdle { assertEquals("test-key-a", forgotten) }
    }

    /** The Rename key reports the phone it belongs to and nothing else. */
    @Test
    fun rename_reports_the_phone_whose_key_was_pressed() {
        val renamed = mutableListOf<String>()
        composeRule.setContent {
            FlickTvTheme {
                SettingsScreen(
                    tvName = "Living Room TV",
                    pairedSummary = "2 paired",
                    pairedPhones = pairedPhones,
                    metricsEnabled = false,
                    onRename = {},
                    onToggleMetrics = {},
                    onForgetAll = {},
                    onDone = {},
                    onRenamePhone = { keyId -> renamed += keyId },
                )
            }
        }

        composeRule.onNodeWithTag("settings-paired-row").performClick()
        val renameKeys = composeRule.onAllNodesWithTag("settings-phone-rename")
        renameKeys[1].performClick()
        composeRule.runOnIdle { assertEquals(listOf("test-key-b"), renamed) }
        renameKeys[0].performClick()
        composeRule.runOnIdle { assertEquals(listOf("test-key-b", "test-key-a"), renamed) }
    }

    /**
     * No phones is a real state now that Settings is reachable from the pair
     * screen. The heading is then the whole answer, there is nothing to drill into
     * and no Forget all — so the next stop below Device name is metrics.
     */
    @Test
    fun with_no_phones_the_paired_row_is_not_a_focus_target() {
        composeRule.setContent {
            FlickTvTheme {
                SettingsScreen(
                    tvName = "Living Room TV",
                    pairedSummary = "None yet",
                    pairedPhones = emptyList(),
                    metricsEnabled = false,
                    onRename = {},
                    onToggleMetrics = {},
                    onForgetAll = {},
                    onDone = {},
                )
            }
        }

        val rename = composeRule.onNodeWithText("Device name")
        rename.assertIsFocused()
        composeRule.onNodeWithText("None yet").assertIsDisplayed()
        rename.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        composeRule.onNodeWithText("Playback metrics overlay").assertIsFocused()
        assertFocusedTargetIsRingSafe()
    }

    private fun setExpandedDiagnosticsContent(fontScale: Float) {
        composeRule.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale = fontScale)) {
                FlickTvTheme {
                    SettingsScreen(
                        tvName = "Living Room TV",
                        pairedSummary = "2 paired",
                        pairedPhones = pairedPhones,
                        metricsEnabled = false,
                        onRename = {},
                        onToggleMetrics = {},
                        onForgetAll = {},
                        onDone = {},
                        diagnosticsVisible = true,
                        diagnostics = expandedDiagnostics,
                    )
                }
            }
        }
    }

    private fun runExpandedDiagnosticsTraversal() {
        val rename = composeRule.onNodeWithText("Device name")
        val paired = composeRule.onNodeWithTag("settings-paired-row")
        val metrics = composeRule.onNodeWithText("Playback metrics overlay")
        val forgetAll = composeRule.onNodeWithText("Forget all phones")
        val diagnostics = composeRule.onNodeWithText("Diagnostics")
        val clear = composeRule.onNodeWithText("Clear diagnostics")
        val done = composeRule.onNodeWithText("Done")
        rename.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        rename.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        paired.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        paired.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        metrics.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        metrics.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        forgetAll.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        forgetAll.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        diagnostics.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        diagnostics.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        clear.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        clear.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        done.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        done.performKeyInput { keyDown(Key.DirectionUp); keyUp(Key.DirectionUp) }
        clear.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        clear.performKeyInput { keyDown(Key.DirectionUp); keyUp(Key.DirectionUp) }
        diagnostics.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
    }

    @Test
    fun expanded_fourteen_line_diagnostics_keeps_each_dpad_destination_ring_safe_at_default_font_scale() {
        setExpandedDiagnosticsContent(fontScale = 1f)
        runExpandedDiagnosticsTraversal()
    }

    @Test
    fun expanded_fourteen_line_diagnostics_keeps_each_dpad_destination_ring_safe_at_supported_max_font_scale() {
        setExpandedDiagnosticsContent(fontScale = 2f)
        runExpandedDiagnosticsTraversal()
    }

    private fun runLiveDiagnosticsResizeWhileFocused(fontScale: Float) {
        lateinit var diagnosticsState: MutableState<List<FlickLog.Entry>>
        lateinit var fontScaleState: MutableState<Float>
        composeRule.setContent {
            val density = LocalDensity.current
            diagnosticsState = remember { mutableStateOf(expandedDiagnostics) }
            fontScaleState = remember { mutableStateOf(fontScale) }
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale = fontScaleState.value)) {
                FlickTvTheme {
                    SettingsScreen(
                        tvName = "Living Room TV",
                        pairedSummary = "2 paired",
                        pairedPhones = pairedPhones,
                        metricsEnabled = false,
                        onRename = {},
                        onToggleMetrics = {},
                        onForgetAll = {},
                        onDone = {},
                        diagnosticsVisible = true,
                        diagnostics = diagnosticsState.value,
                    )
                }
            }
        }

        val rename = composeRule.onNodeWithText("Device name")
        val paired = composeRule.onNodeWithTag("settings-paired-row")
        val metrics = composeRule.onNodeWithText("Playback metrics overlay")
        val forgetAll = composeRule.onNodeWithText("Forget all phones")
        val diagnostics = composeRule.onNodeWithText("Diagnostics")
        val clear = composeRule.onNodeWithText("Clear diagnostics")
        val done = composeRule.onNodeWithText("Done")
        rename.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        rename.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        paired.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        paired.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        metrics.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        metrics.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        forgetAll.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        forgetAll.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        diagnostics.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        diagnostics.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        clear.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()

        composeRule.runOnUiThread { diagnosticsState.value = emptyList() }
        clear.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        composeRule.runOnUiThread { diagnosticsState.value = expandedDiagnostics }
        clear.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()

        clear.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        done.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        composeRule.runOnUiThread { diagnosticsState.value = expandedDiagnostics + FlickLog.Entry(
            atMs = 1_726_000_014_000L,
            level = 'W',
            area = "player",
            message = "attempt=15 bufferedMs=326 retry=2",
        ) }
        done.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        composeRule.runOnUiThread { fontScaleState.value = if (fontScale == 1f) 2f else 1f }
        done.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
    }

    @Test
    fun populated_diagnostics_resize_keeps_clear_and_done_ring_safe_at_default_font_scale() {
        runLiveDiagnosticsResizeWhileFocused(fontScale = 1f)
    }

    @Test
    fun populated_diagnostics_resize_keeps_clear_and_done_ring_safe_at_supported_max_font_scale() {
        runLiveDiagnosticsResizeWhileFocused(fontScale = 2f)
    }

    @Test
    fun dpad_navigation_reveals_done_at_the_tv_viewport_bottom() {
        composeRule.setContent {
            FlickTvTheme {
                SettingsScreen(
                    tvName = "Living Room TV",
                    pairedSummary = "2 paired",
                    pairedPhones = pairedPhones,
                    metricsEnabled = false,
                    onRename = {},
                    onToggleMetrics = {},
                    onForgetAll = {},
                    onDone = {},
                )
            }
        }

        val rename = composeRule.onNodeWithText("Device name")
        val paired = composeRule.onNodeWithTag("settings-paired-row")
        val metrics = composeRule.onNodeWithText("Playback metrics overlay")
        val forgetAll = composeRule.onNodeWithText("Forget all phones")
        val diagnostics = composeRule.onNodeWithText("Diagnostics")
        val done = composeRule.onNodeWithText("Done")

        rename.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        rename.performKeyInput {
            keyDown(Key.DirectionDown)
            keyUp(Key.DirectionDown)
        }
        paired.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        paired.performKeyInput {
            keyDown(Key.DirectionDown)
            keyUp(Key.DirectionDown)
        }
        metrics.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        assertMetricsPaintStaysInsideHorizontalSafeArea()
        metrics.performKeyInput {
            keyDown(Key.DirectionDown)
            keyUp(Key.DirectionDown)
        }
        forgetAll.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        forgetAll.performKeyInput {
            keyDown(Key.DirectionDown)
            keyUp(Key.DirectionDown)
        }
        diagnostics.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        diagnostics.performKeyInput {
            keyDown(Key.DirectionDown)
            keyUp(Key.DirectionDown)
        }

        done.assertIsFocused().assertIsDisplayed()
        assertTitleInsideSafeArea()
        assertFocusedTargetIsRingSafe()

    }
    private fun setOpenForCastsContent(
        state: OpenForCastsRow,
        fontScale: Float = 1f,
        onOpenForCasts: () -> Unit = {},
    ) {
        composeRule.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale = fontScale)) {
                FlickTvTheme {
                    SettingsScreen(
                        tvName = "Living Room TV",
                        pairedSummary = "2 paired",
                        pairedPhones = pairedPhones,
                        metricsEnabled = false,
                        onRename = {},
                        onToggleMetrics = {},
                        onForgetAll = {},
                        onDone = {},
                        openForCasts = state,
                        onOpenForCasts = onOpenForCasts,
                    )
                }
            }
        }
    }

    private fun runOpenForCastsTraversal() {
        val rename = composeRule.onNodeWithText("Device name")
        val paired = composeRule.onNodeWithTag("settings-paired-row")
        val open = composeRule.onNodeWithTag("settings-open-row")
        val metrics = composeRule.onNodeWithText("Playback metrics overlay")
        val forgetAll = composeRule.onNodeWithText("Forget all phones")
        val diagnostics = composeRule.onNodeWithText("Diagnostics")
        val done = composeRule.onNodeWithText("Done")
        rename.assertIsFocused().assertIsDisplayed()
        rename.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        paired.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        paired.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        open.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        open.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        metrics.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        metrics.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        forgetAll.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        forgetAll.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        diagnostics.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        diagnostics.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        done.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        assertTitleInsideSafeArea()

        done.performKeyInput { keyDown(Key.DirectionUp); keyUp(Key.DirectionUp) }
        diagnostics.assertIsFocused()
        diagnostics.performKeyInput { keyDown(Key.DirectionUp); keyUp(Key.DirectionUp) }
        forgetAll.assertIsFocused()
        forgetAll.performKeyInput { keyDown(Key.DirectionUp); keyUp(Key.DirectionUp) }
        metrics.assertIsFocused()
        metrics.performKeyInput { keyDown(Key.DirectionUp); keyUp(Key.DirectionUp) }
        open.assertIsFocused().assertIsDisplayed()
        assertFocusedTargetIsRingSafe()
        open.performKeyInput { keyDown(Key.DirectionUp); keyUp(Key.DirectionUp) }
        paired.assertIsFocused()
    }

    /** The row sits between Paired phones and metrics, on the same D-pad path both ways. */
    @Test
    fun open_for_casts_row_joins_the_dpad_path_between_paired_and_metrics() {
        setOpenForCastsContent(OpenForCastsRow.Off)
        runOpenForCastsTraversal()
    }

    @Test
    fun open_for_casts_row_joins_the_dpad_path_at_supported_max_font_scale() {
        setOpenForCastsContent(OpenForCastsRow.Off, fontScale = 2f)
        runOpenForCastsTraversal()
    }

    /** Hidden renders no row at all, so the walk below Paired phones goes straight to metrics. */
    @Test
    fun hidden_open_for_casts_leaves_the_dpad_path_unchanged() {
        setOpenForCastsContent(OpenForCastsRow.Hidden)
        composeRule.onAllNodesWithTag("settings-open-row").assertCountEquals(0)
        composeRule.onNodeWithText("Open when you cast").assertDoesNotExist()
        val paired = composeRule.onNodeWithTag("settings-paired-row")
        composeRule.onNodeWithText("Device name")
            .performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        paired.assertIsFocused()
        paired.performKeyInput { keyDown(Key.DirectionDown); keyUp(Key.DirectionDown) }
        composeRule.onNodeWithText("Playback metrics overlay").assertIsFocused()
    }

    @Test
    fun open_for_casts_off_and_on_read_as_a_toggle_and_report_the_press() {
        var presses = 0
        setOpenForCastsContent(OpenForCastsRow.Off, onOpenForCasts = { presses++ })
        val open = composeRule.onNodeWithTag("settings-open-row")
        open.assertTextContains("Open when you cast", substring = true)
            .assertTextContains("Casting opens Flick here", substring = true)
            .assertIsOff()
        open.performClick()
        composeRule.runOnIdle { assertEquals(1, presses) }
    }

    @Test
    fun open_for_casts_on_reads_as_on() {
        setOpenForCastsContent(OpenForCastsRow.On)
        composeRule.onNodeWithTag("settings-open-row")
            .assertTextContains("Casting opens Flick here", substring = true)
            .assertIsOn()
    }

    /**
     * The press leaves Flick for the TV's own settings, so the row carries the
     * disclosure mark and no toggle state.
     */
    @Test
    fun open_for_casts_needs_access_shows_the_disclosure_and_where_to_go() {
        var presses = 0
        setOpenForCastsContent(OpenForCastsRow.NeedsAccess, onOpenForCasts = { presses++ })
        val open = composeRule.onNodeWithTag("settings-open-row")
        open.assertTextContains("Turn on Flick in Display over other apps", substring = true)
            .assertTextContains("›", substring = true)
            .assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.ToggleableState))
        open.performClick()
        composeRule.runOnIdle { assertEquals(1, presses) }
    }

    @Test
    fun open_for_casts_blocked_shows_the_caution_summary_with_the_toggle_off() {
        setOpenForCastsContent(OpenForCastsRow.Blocked)
        composeRule.onNodeWithTag("settings-open-row")
            .assertTextContains("didn’t let Flick open", substring = true)
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.ToggleableState, ToggleableState.Off))
    }

    /**
     * A cast arriving while Settings is open retains the shell for its exit, so it
     * stays composed: the host revokes [LocalShellInteractive], and then no row may
     * keep or take focus, or DPAD_CENTER would fire a row the viewer no longer sees.
     */
    @Test
    fun settings_rows_let_go_of_focus_once_a_cast_stage_takes_the_shell() {
        val interactive = mutableStateOf(true)
        var renamed = 0
        composeRule.setContent {
            FlickTvTheme {
                val live = interactive.value
                ShellGate(live) {
                    SettingsScreen(
                        tvName = "Living Room TV",
                        pairedSummary = "2 paired",
                        pairedPhones = pairedPhones,
                        metricsEnabled = false,
                        onRename = { renamed++ },
                        onToggleMetrics = {},
                        onForgetAll = {},
                        onDone = {},
                    )
                }
            }
        }
        composeRule.onNodeWithText("Device name").assertIsFocused()
        composeRule.runOnIdle { interactive.value = false }
        composeRule.waitForIdle()
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_DPAD_CENTER)
        composeRule.waitForIdle()
        composeRule.onAllNodes(isFocused()).assertCountEquals(0)
        assertEquals("DPAD_CENTER reached a row of a shell that had handed over", 0, renamed)
    }
}
