// Shows: an entrance animation decided by a pure rule keyed on identity, so a lazy list that
// forgets and recomposes scrolled-out rows cannot make them play their entrance again.
// Example written for this skill; read it, don't paste it.
package com.example.app.ui.motion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The bug this rule exists for: scrolling a list of items up and down made every card scrolled
 * back into view count up from zero again, because a lazy list forgets what scrolls out of the
 * composition and each returning card asked "is this my first time?" afresh. [RevealRule] answers
 * that question from a key the list remembers across scrolls, not from composition lifecycle.
 */
class RevealRuleTest {
    @Test
    fun `a page shown for the first time makes its entrance while it is opening`() {
        assertTrue(RevealRule.plays(firstShowing = true, arrivesSettled = false, opening = true))
    }

    /** Scrolled to later, or scrolled back to: simply there, not arriving. */
    @Test
    fun `nothing composed after the page has already opened makes an entrance`() {
        assertFalse(RevealRule.plays(firstShowing = true, arrivesSettled = false, opening = false))
    }

    @Test
    fun `an item seen before never makes its entrance again`() {
        assertFalse(RevealRule.plays(firstShowing = false, arrivesSettled = false, opening = true))
    }

    /** A tab sliding in beside another arrives already assembled, as the page it is. */
    @Test
    fun `a page arriving by navigation does not assemble itself as it slides in`() {
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
    fun `a stage for an item seen before never plays, however it is constructed`() {
        assertFalse(RevealStage(plays = false, openedAtMillis = 1_000L).playsNow())
    }

    /** A sheet or dialog has no page session; its entrance always plays. */
    @Test
    fun `outside any page's session, entrances always play`() {
        RevealStage.Always.close()
        assertTrue(RevealStage.Always.playsNow())
    }

    /**
     * A row composed with the page waits its whole stagger turn. One composed later, as the list
     * builds further down, has already waited part of that turn and only owes what is left — so
     * scrolling slowly down a long list never stacks up a full stagger per row.
     */
    @Test
    fun `a later row only waits what is left of its stagger turn`() {
        assertEquals(400, RevealRule.remainingDelayMillis(staggerMillis = 400, sinceOpenedMillis = 0))
        assertEquals(150, RevealRule.remainingDelayMillis(staggerMillis = 400, sinceOpenedMillis = 250))
        assertEquals(0, RevealRule.remainingDelayMillis(staggerMillis = 400, sinceOpenedMillis = 900))
        // A clock that reads negative (a late composition racing the open) owes the full turn.
        assertEquals(400, RevealRule.remainingDelayMillis(staggerMillis = 400, sinceOpenedMillis = -5))
    }

    @Test
    fun `a stage counts elapsed time from when it opened, not from zero`() {
        val stage = RevealStage(plays = true, openedAtMillis = 1_000L)
        assertEquals(250L, stage.sinceOpenedMillis(nowMillis = 1_250L))
    }

    @Test
    fun `memory reports an identity's first showing exactly once`() {
        val key = "reveal-rule-test-${System.nanoTime()}"
        assertTrue(RevealMemory.firstShowing(key))
        assertFalse(RevealMemory.firstShowing(key))
    }

    /** The cap that keeps a long grid from feeling slow: the last row lands well inside a
     * second and a bit, however many rows the stagger would otherwise ask it to wait through. */
    @Test
    fun `a page's whole entrance is over quickly, however many rows it has`() {
        val lastLanding = RevealRule.MAX_STAGGER_INDEX * 50 + RevealRule.ENTRANCE_MILLIS
        assertTrue("the last row lands at $lastLanding ms", lastLanding <= 1_200)
    }
}
