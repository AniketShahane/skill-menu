// Shows: page-transition rules as pure functions, tested for invariants over every route pair
// instead of a handful of examples — so the whole JVM suite runs in seconds with no device.
// Example written for this skill; read it, don't paste it.
package com.example.app.ui.nav

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Every animation bug in a page-transition system traces back to one of two mistakes: two
 * surfaces moving when only one should, or a transition cut off by something shorter than
 * itself. Neither shows up in a screenshot, and neither needs a device, because [ItemNav] decides
 * all of it before any Compose node exists.
 */
class NavMotionTest {
    private val list = Route.List
    private val settings = Route.Settings
    private val detail = Route.Detail("item-1")
    private val otherDetail = Route.Detail("item-2")

    // ---- which motion plays ----------------------------------------------------------------

    @Test
    fun `tabs slide in the signed direction they were asked for`() {
        assertEquals(PageMotion.TAB_FORWARD, ItemNav.motion(list, settings, direction = 1))
        assertEquals(PageMotion.TAB_BACK, ItemNav.motion(settings, list, direction = -1))
    }

    @Test
    fun `a detail opened from a list of thumbnails carries out of its thumbnail`() {
        assertEquals(PageMotion.CARRY, ItemNav.motion(list, detail, direction = 1))
        assertEquals(PageMotion.CARRY, ItemNav.motion(detail, list, direction = -1))
    }

    @Test
    fun `a detail opened from a page with no thumbnail is pushed and popped`() {
        assertEquals(PageMotion.PUSH, ItemNav.motion(settings, detail, direction = 1))
        assertEquals(PageMotion.POP, ItemNav.motion(detail, settings, direction = -1))
    }

    @Test
    fun `one detail opening another is a push, never a carry`() {
        assertEquals(PageMotion.PUSH, ItemNav.motion(detail, otherDetail, direction = 1))
        assertEquals(PageMotion.POP, ItemNav.motion(otherDetail, detail, direction = -1))
    }

    @Test
    fun `the motion agrees whichever way round the pair is given`() {
        for ((a, b) in listOf(list to settings, list to detail, settings to detail, detail to otherDetail)) {
            for (direction in listOf(-1, 1)) {
                assertEquals("$a <-> $b", ItemNav.motion(a, b, direction), ItemNav.motion(b, a, direction))
            }
        }
    }

    // ---- durations ---------------------------------------------------------------------------

    @Test
    fun `every motion has a duration a person would call a transition`() {
        for (motion in PageMotion.entries) {
            val millis = ItemNav.durationMillis(motion)
            assertTrue("$motion is $millis ms", millis in 150..600)
        }
    }

    /** Shared bounds live inside the carry transition; given longer, both ends are torn down
     * while they still travel, which ends the transition with a visible jump. */
    @Test
    fun `shared bounds finish before the carry transition that holds them ends`() {
        assertTrue(ItemNav.CARRY_BOUNDS_MILLIS < ItemNav.durationMillis(PageMotion.CARRY))
    }

    @Test
    fun `a thumbnail becoming a page is given longer than an ordinary push`() {
        assertTrue(ItemNav.durationMillis(PageMotion.CARRY) > ItemNav.durationMillis(PageMotion.PUSH))
    }

    // ---- shared keys ---------------------------------------------------------------------

    /** Pages that show thumbnails: any route whose grid a detail could be carried out of. */
    private val thumbnailPages: List<Route> = Route.tabs.filter { ItemNav.showsThumbnails(it) }

    /**
     * The thumbnail's end and the detail's end must name the same key, from EVERY page that
     * shows thumbnails — not just the one the feature was written against. A detail that
     * hardcoded its opener only matched one grid; opened from a second grid it cut instead of
     * carrying, because the two ends asked for different keys.
     */
    @Test
    fun `a thumbnail and the detail it opens name the same key, from every thumbnail page`() {
        assertTrue("some page must show thumbnails", thumbnailPages.isNotEmpty())
        for (page in thumbnailPages) {
            val gridScope = ItemNav.sharedScope(page, listOf(page))
            val detailScope = ItemNav.sharedScope(detail, listOf(page, detail))
            assertNotNull("$page must give its thumbnails a scope", gridScope)
            assertEquals(
                "$page -> detail",
                ItemNav.sharedKey(detail.id, "title", gridScope!!),
                ItemNav.sharedKey(detail.id, "title", detailScope!!),
            )
        }
    }

    /**
     * The same item's thumbnail on two different pages must never share a key, or it carries
     * across an ordinary tab switch while the pages are only meant to slide past each other.
     */
    @Test
    fun `the same item on two pages never shares a key`() {
        val pages = Route.tabs
        for (a in pages) for (b in pages) {
            if (a.key == b.key) continue
            assertNotEquals("$a / $b", ItemNav.sharedKey("item-1", "thumb", a.key), ItemNav.sharedKey("item-1", "thumb", b.key))
        }
    }

    @Test
    fun `a page with no thumbnail to carry from registers no shared pieces`() {
        assertNull(ItemNav.sharedScope(settings, listOf(settings)))
        assertNull(ItemNav.sharedScope(detail, listOf(settings, detail)))
        // One detail opening another is a push; the second detail has no thumbnail beneath it.
        assertNull(ItemNav.sharedScope(otherDetail, listOf(list, detail, otherDetail)))
    }

    // ---- dimming -------------------------------------------------------------------------

    /** Every ordered pair of tabs, plus a detail opened from and returned to every tab. */
    private val journeys: List<Triple<Route, Route, Int>> = buildList {
        val tabs = Route.tabs
        for (a in tabs) for (b in tabs) {
            if (a.key != b.key) add(Triple(a, b, tabs.indexOf(b).compareTo(tabs.indexOf(a))))
        }
        for (tab in tabs) {
            add(Triple(tab, detail, 1))
            add(Triple(detail, tab, -1))
        }
    }

    /** Exactly one of the two pages dims, whichever way the navigation went — never both, never
     * neither. Asking "is the live page also a tab" instead of comparing against the actual
     * other side of the pair is the mistake that once let a pop dim nothing at all. */
    @Test
    fun `exactly one of the two pages dims, whichever way the navigation went`() {
        for ((from, to, direction) in journeys) {
            val dimmed = listOfNotNull(
                from.takeIf { ItemNav.dims(it, to, direction, leaving = true) },
                to.takeIf { ItemNav.dims(it, from, direction, leaving = false) },
            )
            assertEquals("$from -> $to dimmed $dimmed", 1, dimmed.size)
        }
    }

    @Test
    fun `two tabs sliding past each other are never darkened`() {
        assertFalse(ItemNav.dims(list, settings, direction = 1, leaving = true))
        assertFalse(ItemNav.dims(settings, list, direction = -1, leaving = false))
    }

    // ---- arriving settled ------------------------------------------------------------------

    @Test
    fun `the first screen makes its entrance and a tab reached by navigating does not`() {
        assertFalse(ItemNav.arrivesSettled(list, arrivedFrom = null))
        assertTrue(ItemNav.arrivesSettled(settings, arrivedFrom = list))
    }

    @Test
    fun `a detail keeps its own entrance even when its opener arrived settled`() {
        assertFalse(ItemNav.arrivesSettled(detail, arrivedFrom = list))
    }
}
