package com.example.starter.ui.nav

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The navigation motion rules (shape ported from dash NavMotionTest.kt).
 *
 * Every animation bug this kind of file catches comes from one of two mistakes: two things moving
 * at once when only one should, or an animation cut off by something shorter than itself. Neither
 * shows in a screenshot, and neither needs a device, because all of it is decided in [NavMotion]
 * before a Compose object exists.
 */
class NavMotionTest {
    private val home = Route.Home
    private val settings = Route.Settings
    private val detail = Route.Detail("item-1")
    private val other = Route.Detail("item-2")

    // ---- which motion ----------------------------------------------------------------------

    @Test
    fun `tabs slide sideways in the direction they were asked for`() {
        assertEquals(PageMotion.TAB_FORWARD, NavMotion.motion(home, settings, direction = 1))
        assertEquals(PageMotion.TAB_BACK, NavMotion.motion(settings, home, direction = -1))
        // A signed tab distance, not just ±1.
        assertEquals(PageMotion.TAB_BACK, NavMotion.motion(settings, home, direction = -2))
    }

    @Test
    fun `a detail opened from a page of cards flies out of its card instead of sliding`() {
        assertEquals(PageMotion.MORPH, NavMotion.motion(home, detail, direction = 1))
        assertEquals(PageMotion.MORPH, NavMotion.motion(detail, home, direction = -1))
    }

    @Test
    fun `a detail opened from a page without cards is pushed and popped`() {
        assertEquals(PageMotion.PUSH, NavMotion.motion(settings, detail, direction = 1))
        assertEquals(PageMotion.POP, NavMotion.motion(detail, settings, direction = -1))
    }

    @Test
    fun `a detail with no card left to return to slides away`() {
        assertEquals(PageMotion.POP, NavMotion.motion(detail, home, direction = -1, morphable = false))
    }

    @Test
    fun `one detail opening another is a push`() {
        assertEquals(PageMotion.PUSH, NavMotion.motion(detail, other, direction = 1))
        assertEquals(PageMotion.POP, NavMotion.motion(other, detail, direction = -1))
    }

    @Test
    fun `the motion is the same whichever way round the pair is given`() {
        for ((a, b) in listOf(home to settings, home to detail, settings to detail, detail to other)) {
            for (direction in listOf(-1, 0, 1)) {
                assertEquals("$a <-> $b at $direction", NavMotion.motion(a, b, direction), NavMotion.motion(b, a, direction))
            }
        }
    }

    // ---- durations -------------------------------------------------------------------------

    @Test
    fun `every motion has a duration a person would call a transition`() {
        for (motion in PageMotion.entries) {
            val millis = NavMotion.durationMillis(motion)
            assertTrue("$motion is $millis ms", millis in 150..600)
        }
    }

    /**
     * The one that made a transition end with a jump. Shared bounds live inside the transition
     * holding both ends composed; given longer, both pages are torn down while they still travel.
     */
    @Test
    fun `shared bounds finish before the morph holding them ends`() {
        assertTrue(NavMotion.MORPH_BOUNDS_MILLIS < NavMotion.durationMillis(PageMotion.MORPH))
    }

    /** The other half: bounds get the morph's length, so a pair may only ever exist during a morph. */
    @Test
    fun `a pair that can fly only ever moves as a morph`() {
        val pages = listOf(home, settings, detail, other)
        for (a in pages) for (b in pages) {
            if (a.key == b.key || NavMotion.morphId(a, b) == null) continue
            for (direction in listOf(-1, 1)) {
                assertEquals("$a <-> $b", PageMotion.MORPH, NavMotion.motion(a, b, direction))
            }
        }
    }

    @Test
    fun `a card becoming a page is given longer than a push`() {
        assertTrue(NavMotion.durationMillis(PageMotion.MORPH) > NavMotion.durationMillis(PageMotion.PUSH))
    }

    /** Leaving is quicker than arriving; every millisecond of a return is spent waiting. */
    @Test
    fun `the page's end leaves faster than it arrives, and pops are quicker than pushes`() {
        assertTrue(NavMotion.PIECE_LEAVE_MILLIS < NavMotion.PIECE_FADE_MILLIS)
        assertTrue(NavMotion.POP_MILLIS < NavMotion.PUSH_MILLIS)
    }

    /** What only the page has lands before the morph lets go of the page beneath. */
    @Test
    fun `the page has finished arriving inside the morph`() {
        val landed = NavMotion.PAGE_ARRIVE_DELAY_MILLIS + NavMotion.PIECE_FADE_MILLIS
        assertTrue("page content lands at $landed ms", landed <= NavMotion.MORPH_MILLIS)
        assertTrue("page ground lands at ${NavMotion.PIECE_FADE_MILLIS} ms", NavMotion.PIECE_FADE_MILLIS <= NavMotion.MORPH_BOUNDS_MILLIS)
    }

    @Test
    fun `a tab chosen mid-slide overtakes it, scaled by the system animation speed`() {
        assertTrue(NavMotion.overtakes(sinceLastSlideMillis = 150, animatorScale = 1f))
        assertFalse(NavMotion.overtakes(sinceLastSlideMillis = 450, animatorScale = 1f))
        assertTrue(NavMotion.overtakes(sinceLastSlideMillis = 450, animatorScale = 2f))
        assertFalse(NavMotion.overtakes(sinceLastSlideMillis = 1, animatorScale = 0f))
    }

    // ---- shared keys -----------------------------------------------------------------------

    /** Every page that shows cards: the tabs in showsCards (add a pushed card page here too). */
    private val cardPages: List<Route> = Route.tabs.filter { NavMotion.showsCards(it) }

    /**
     * The card's end and the page's end must say the same key, for EVERY card page a Detail can
     * be opened from. A Detail that hardcoded its opener paired only with that one page; opened
     * from a second card page it matched nothing and cut instead of flying.
     */
    @Test
    fun `a card and the detail it opens name the same key, from every card page`() {
        assertTrue("some page must show cards", cardPages.isNotEmpty())
        for (page in cardPages) {
            val cardScope = NavMotion.sharedScope(page, listOf(page))
            val pageScope = NavMotion.sharedScope(detail, listOf(page, detail))
            assertNotNull("$page must give its cards a scope", cardScope)
            assertEquals(
                "$page -> $detail",
                NavMotion.sharedKey(detail.id, "title", cardScope!!),
                NavMotion.sharedKey(detail.id, "title", pageScope!!),
            )
            // Deeper in the stack, the opener is still the entry just below the Detail.
            val stacked = listOf(Route.tabs.first(), page, detail).distinctBy { it.key }
            assertEquals(cardScope, NavMotion.sharedScope(detail, stacked))
        }
    }

    /**
     * The same item's card on two pages must not be a pair, or it flies across an ordinary tab
     * switch while the pages slide (dash@42b59ff). Two parts of one card never pair either.
     */
    @Test
    fun `the same item on two pages never shares a key`() {
        val pages = Route.tabs
        for (a in pages) for (b in pages) {
            if (a.key == b.key) continue
            assertNotEquals("$a / $b", NavMotion.sharedKey("item-1", "card", a.key), NavMotion.sharedKey("item-1", "card", b.key))
        }
        assertNotEquals(NavMotion.sharedKey("item-1", "card", home.key), NavMotion.sharedKey("item-1", "title", home.key))
    }

    @Test
    fun `a page with no card to fly from registers no pieces`() {
        assertNull(NavMotion.sharedScope(settings, listOf(settings)))
        assertNull(NavMotion.sharedScope(detail, listOf(settings, detail)))
        // One detail opening another is a push; the second has no card beneath it.
        assertNull(NavMotion.sharedScope(other, listOf(home, detail, other)))
        // Off the stack there is nothing to ask; the host keeps the answer from the Detail's arrival.
        assertNull(NavMotion.sharedScope(detail, listOf(home)))
    }

    @Test
    fun `only the pair actually being opened is named`() {
        assertEquals("item-1", NavMotion.morphId(home, detail))
        assertEquals("item-1", NavMotion.morphId(detail, home))
        assertNull(NavMotion.morphId(home, settings))
        assertNull(NavMotion.morphId(settings, detail))
        assertNull(NavMotion.morphId(detail, other))
    }

    @Test
    fun `the page's end is the detail, never a tab`() {
        assertTrue(NavMotion.isPageEnd(detail))
        assertFalse(NavMotion.isPageEnd(home))
        assertFalse(NavMotion.isPageEnd(settings))
    }

    // ---- dimming and grounds ---------------------------------------------------------------

    /**
     * from, to, direction: every kind of navigation the app can make, generated from Route.tabs so
     * a new tab is covered without touching this file. Every ordered pair of tabs (signed by bar
     * order), a Detail opened from and back to every tab, and one Detail opening another.
     */
    private val journeys: List<Triple<Route, Route, Int>> = buildList {
        val tabs = Route.tabs
        for (a in tabs) for (b in tabs) {
            if (a.key != b.key) add(Triple(a, b, tabs.indexOf(b).compareTo(tabs.indexOf(a))))
        }
        for (tab in tabs) {
            add(Triple(tab, detail, 1))
            add(Triple(detail, tab, -1))
        }
        add(Triple(detail, other, 1))
        add(Triple(other, detail, -1))
    }

    @Test
    fun `exactly one of the two pages dims, whichever way the navigation went`() {
        for ((from, to, direction) in journeys) {
            val dimmed = listOfNotNull(
                from.takeIf { NavMotion.dims(it, to, direction, leaving = true) },
                to.takeIf { NavMotion.dims(it, from, direction, leaving = false) },
            )
            assertEquals("$from -> $to dimmed $dimmed", 1, dimmed.size)
        }
    }

    /**
     * The page uncovered by a pop is the one that brightens. Asking "am I and the live page both
     * tabs" instead compared the live page with itself, and no pop dimmed at all.
     */
    @Test
    fun `a pop dims the page being uncovered`() {
        assertTrue(NavMotion.dims(settings, detail, -1, leaving = false))
        assertFalse(NavMotion.dims(detail, settings, -1, leaving = true))
    }

    /** Side by side, not stacked: the grey sweep over a tab leaving WAS the flicker between tabs. */
    @Test
    fun `two tabs are never darkened`() {
        assertFalse(NavMotion.scrims(home, settings, 1, leaving = true))
        assertFalse(NavMotion.scrims(settings, home, 1, leaving = false))
        assertFalse(NavMotion.scrims(settings, home, -1, leaving = true))
    }

    /** The page's ground fading in already says "covered"; a scrim under it flashed dark on back. */
    @Test
    fun `neither end of a morph is darkened`() {
        assertFalse(NavMotion.scrims(home, detail, 1, leaving = true))
        assertFalse(NavMotion.scrims(home, detail, -1, leaving = false))
        assertTrue(NavMotion.scrims(home, detail, -1, leaving = false, morphable = false))
    }

    @Test
    fun `a covered page dims in both themes, light mode far less`() {
        assertTrue(NavMotion.scrims(settings, detail, 1, leaving = true))
        assertTrue(NavMotion.pageDim(dark = false) > 0f)
        assertTrue(NavMotion.pageDim(dark = false) <= NavMotion.pageDim(dark = true) / 2)
    }

    /** Two opaque grounds is a wasted full-screen fill per frame; none lets the page below show through. */
    @Test
    fun `never more than one page paints a ground while pages are stacked`() {
        for ((from, to, direction) in journeys) {
            val painting = listOfNotNull(
                from.takeIf { NavMotion.paintsBackground(it, to, direction, leaving = true) || NavMotion.fadesGround(it, to, direction) },
                to.takeIf { NavMotion.paintsBackground(it, from, direction, leaving = false) || NavMotion.fadesGround(it, from, direction) },
            )
            if (from is Route.Tab && to is Route.Tab) {
                assertEquals("$from -> $to: both tab pages paint their half", 2, painting.size)
            } else {
                assertEquals("$from -> $to painted $painting", 1, painting.size)
            }
        }
    }

    @Test
    fun `only the page's end of a morph fades its ground`() {
        assertTrue(NavMotion.fadesGround(detail, home, 1))
        assertTrue(NavMotion.fadesGround(detail, home, -1))
        assertFalse(NavMotion.fadesGround(home, detail, 1))
        assertFalse(NavMotion.fadesGround(detail, settings, 1))
    }

    // ---- arriving settled -----------------------------------------------------------------

    @Test
    fun `the first screen makes its entrance and a tab reached by navigating does not`() {
        assertFalse(NavMotion.arrivesSettled(home, arrivedFrom = null))
        assertTrue(NavMotion.arrivesSettled(settings, arrivedFrom = home))
        assertTrue(NavMotion.arrivesSettled(home, arrivedFrom = detail))
    }

    @Test
    fun `a detail keeps its own entrance`() {
        assertFalse(NavMotion.arrivesSettled(detail, arrivedFrom = home))
    }
}
