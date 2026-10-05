package com.example.starter.ui.nav

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The back stack, its direction sign and its per-entry serials. Snapshot state works on the plain
 * JVM, so this needs no device.
 */
class NavigatorTest {
    @Test
    fun `starts on the first tab with nowhere to go back to`() {
        val nav = Navigator()
        assertEquals(Route.Home, nav.current)
        assertFalse(nav.canGoBack)
        assertFalse(nav.back())
    }

    @Test
    fun `a push points forward and a pop points back, remembering where it came from`() {
        val nav = Navigator()
        nav.go(Route.Detail("a"))
        assertEquals(1, nav.direction)
        assertEquals(Route.Home, nav.previous)
        assertTrue(nav.back())
        assertEquals(-1, nav.direction)
        assertEquals(Route.Detail("a"), nav.previous)
        assertEquals(Route.Home, nav.current)
    }

    @Test
    fun `tab switches carry the sign of their distance in the bar`() {
        val nav = Navigator()
        nav.selectTab(Route.Settings)
        assertEquals(1, nav.direction)
        nav.selectTab(Route.Home)
        assertEquals(-1, nav.direction)
    }

    @Test
    fun `back from another tab goes to the first tab`() {
        val nav = Navigator()
        nav.selectTab(Route.Settings)
        assertTrue(nav.canGoBack)
        assertTrue(nav.back())
        assertEquals(Route.Home, nav.current)
    }

    /** Going back finds the state it left; opening the same route again starts from the top. */
    @Test
    fun `reopening a route gets a fresh save key, going back keeps the old one`() {
        val nav = Navigator()
        val homeKey = nav.saveKey(Route.Home)
        nav.go(Route.Detail("a"))
        val firstVisit = nav.saveKey(Route.Detail("a"))
        nav.back()
        assertEquals(homeKey, nav.saveKey(Route.Home))
        nav.go(Route.Detail("a"))
        assertNotEquals(firstVisit, nav.saveKey(Route.Detail("a")))
    }

    @Test
    fun `pushing the page already on top does nothing`() {
        val nav = Navigator()
        nav.go(Route.Detail("a"))
        val depth = nav.depth
        nav.go(Route.Detail("a"))
        assertEquals(depth, nav.depth)
    }

    @Test
    fun `a pop with no card to return to is marked unmorphable`() {
        val nav = Navigator()
        nav.go(Route.Detail("a"))
        nav.popToRoot(morphable = false)
        assertFalse(nav.morphable)
        assertEquals(PageMotion.POP, NavMotion.motion(Route.Detail("a"), nav.current, nav.direction, nav.morphable))
    }

    @Test
    fun `the stack and its serials survive a save and restore`() {
        val nav = Navigator()
        nav.go(Route.Detail("a|b"))
        val restored = Navigator.restore(nav.saved())
        assertEquals(nav.stack.toList(), restored.stack.toList())
        assertEquals(nav.saveKeys, restored.saveKeys)
    }

    @Test
    fun `a start that is not a tab gets the first tab beneath it`() {
        val nav = Navigator(Route.Detail("a"))
        assertEquals(listOf(Route.Home, Route.Detail("a")), nav.stack.toList())
        assertTrue(nav.canGoBack)
    }
}
