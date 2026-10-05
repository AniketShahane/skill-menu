package com.example.starter.ui.motion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * When a page makes its entrance (ported from dash RevealRuleTest.kt). The bug it was written
 * for: scrolling up and down made every card scrolled back to count up from zero and redraw its
 * chart, because a lazy list forgets what scrolls out and each card asked afresh (dash@1940b64).
 */
class RevealRuleTest {
    @Test
    fun `a page shown for the first time makes its entrance while it opens`() {
        assertTrue(RevealRule.plays(firstShowing = true, arrivesSettled = false, opening = true))
    }

    /** Scrolled to later, or scrolled back to: simply there. */
    @Test
    fun `nothing composed after the page has opened makes an entrance`() {
        assertFalse(RevealRule.plays(firstShowing = true, arrivesSettled = false, opening = false))
    }

    @Test
    fun `a page seen before never makes its entrance again`() {
        assertFalse(RevealRule.plays(firstShowing = false, arrivesSettled = false, opening = true))
    }

    /** A tab sliding in beside another is already put together, as the page it is. */
    @Test
    fun `a page arriving by navigation does not assemble itself as it slides`() {
        assertFalse(RevealRule.plays(firstShowing = true, arrivesSettled = true, opening = true))
    }

    @Test
    fun `a stage plays until its opening closes, and never again after`() {
        val stage = RevealStage(plays = true, openedAtMillis = 1_000L)
        assertTrue(stage.playsNow())
        stage.close()
        assertFalse(stage.playsNow())
    }

    @Test
    fun `a stage for a page that arrived settled, or was seen before, never plays`() {
        assertFalse(RevealStage(plays = false, openedAtMillis = 1_000L).playsNow())
    }

    /** Sheets and dialogs have no session; their entrances always play. */
    @Test
    fun `outside any page entrances always play`() {
        RevealStage.Always.close()
        assertTrue(RevealStage.Always.playsNow())
    }

    /**
     * A card composed with its page waits its whole turn; one composed later, as the list builds
     * ahead, has already waited and only waits the rest.
     */
    @Test
    fun `a late card only waits what is left of its turn`() {
        assertEquals(440, RevealRule.remainingDelayMillis(staggerMillis = 440, sinceOpenedMillis = 0))
        assertEquals(140, RevealRule.remainingDelayMillis(staggerMillis = 440, sinceOpenedMillis = 300))
        assertEquals(0, RevealRule.remainingDelayMillis(staggerMillis = 440, sinceOpenedMillis = 900))
        assertEquals(440, RevealRule.remainingDelayMillis(staggerMillis = 440, sinceOpenedMillis = -5))
    }

    @Test
    fun `a stage counts from when it opened`() {
        val stage = RevealStage(plays = true, openedAtMillis = 1_000L)
        assertEquals(250L, stage.sinceOpenedMillis(nowMillis = 1_250L))
        assertEquals(0L, RevealStage.Always.sinceOpenedMillis(nowMillis = 99_000L))
    }

    @Test
    fun `memory reports a key's first showing once`() {
        val key = "reveal-rule-test-${System.nanoTime()}"
        assertTrue(RevealMemory.firstShowing(key))
        assertFalse(RevealMemory.firstShowing(key))
    }

    /** The cap keeps a long list from waiting: the last card has landed well inside 1.2 s. */
    @Test
    fun `a page's whole entrance is over inside a second and a bit`() {
        val lastLanding = RevealRule.MAX_STAGGER_INDEX * 55 + RevealRule.ENTRANCE_MILLIS
        assertTrue("the last card lands at $lastLanding ms", lastLanding <= 1_200)
    }
}
