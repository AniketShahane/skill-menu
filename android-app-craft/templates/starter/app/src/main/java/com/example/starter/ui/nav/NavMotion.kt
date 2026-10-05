package com.example.starter.ui.nav

/**
 * How one page gives way to the next.
 *
 * The rule this file exists to keep: **one motion per navigation**. Either the page travels or
 * the tapped thing travels, never both. A page that slides while a shared element flies out of
 * it tears the two apart (dash@42b59ff).
 */
enum class PageMotion {
    /** Two tab pages side by side, edge to edge, like one strip; neither is darkened. */
    TAB_FORWARD,
    TAB_BACK,

    /** A page rises over the one that opened it. */
    PUSH,

    /** The page on top falls away and uncovers the one beneath. */
    POP,

    /**
     * Neither page moves. What was tapped carries the whole transition: a card flies into its
     * page and back. The host only holds both pages composed while the pieces fly.
     */
    MORPH,
}

/**
 * Every decision a page transition makes, from the two routes alone. Nothing here touches
 * Compose, so the rules are readable and NavMotionTest reads exactly what the app runs
 * (dash:ui/navigation/NavMotion.kt:104-108).
 *
 * The numbers are Dash's. They are tuned together: change one and run NavMotionTest.
 */
object NavMotion {
    /**
     * Two tab pages trading places. A whole screen travels, so it is given long enough that it
     * never hurries: on Easings.Glide its fastest 120 Hz frame moves a 1440 px page ~80 px. The
     * bar's capsule glides on the same curve and clock, so the two move as one.
     */
    const val TAB_MILLIS = 400

    const val PUSH_MILLIS = 340
    const val POP_MILLIS = 320

    /**
     * A card becoming a page. Longer than a push because it is one object changing shape and
     * the eye follows it the whole way. It holds both pages composed, so it must outlast
     * everything that flies between them ([MORPH_BOUNDS_MILLIS]).
     */
    const val MORPH_MILLIS = 500

    /**
     * How long shared bounds fly. Strictly shorter than [MORPH_MILLIS]: when bounds outlast the
     * transition holding them, both pages are torn down mid-flight and the piece covers the rest
     * in one frame — "it snaps at the end" (dash@42b59ff; tested).
     */
    const val MORPH_BOUNDS_MILLIS = 400

    /** How long the page's end of a piece, and the page's own ground, take to fade in. */
    const val PIECE_FADE_MILLIS = 220

    /**
     * How long the page's end takes to go on the way back. Quicker than arriving, so there is
     * always more of either look than of the gap between them, and the flight is front-loaded.
     */
    const val PIECE_LEAVE_MILLIS = 150

    /**
     * When what only the page has (everything that is not a shared piece) starts to arrive on a
     * morph: half way through the flight, when the pieces are nearly home and there is a page to
     * land on. Dash's is PIECES_MILLIS / 2 (dash:ui/navigation/NavMotion.kt:304).
     */
    const val PAGE_ARRIVE_DELAY_MILLIS = MORPH_BOUNDS_MILLIS / 2

    /** How far the covered page drifts behind a push: 1/12 of the axis reads as depth, never uncovers an edge. */
    const val PARALLAX_PUSH = 12

    /**
     * The stiffness two tab pages finish on when a third tab is chosen before they have. Compose
     * hands the interrupted page a spring whatever its spec; on the slow-starting Glide the
     * arriving one would still be leaving the far edge, and a bare band opens between them.
     */
    const val OVERTAKE_STIFFNESS = 1500f

    /** Predictive back: how much the top page shrinks, how far it drifts, its corner, and its settle. */
    const val BACK_SCALE = 0.08f
    const val BACK_TRAVEL_DP = 28f
    const val BACK_CORNER_DP = 28f
    const val BACK_SETTLE_MILLIS = 280

    /**
     * Where floating chrome (the bar) sits in the shared-element overlay while a card flies. The
     * overlay draws over the host's whole content, so without a place in it a card low on a list
     * takes off over the glass instead of under it (dash@29b6156). Above every piece's z.
     */
    const val CHROME_OVERLAY_Z = 8f

    /**
     * The motion between [from] and [to]. [direction] is the navigator's: positive for a push or a
     * forward tab, negative for a pop or a backward tab. [morphable] is false when there is no card
     * at the far end to fly to (the item was just deleted), so the pop slides instead.
     */
    fun motion(from: Route, to: Route, direction: Int, morphable: Boolean = true): PageMotion = when {
        from is Route.Tab && to is Route.Tab -> if (direction < 0) PageMotion.TAB_BACK else PageMotion.TAB_FORWARD
        morphable && morphId(from, to) != null -> PageMotion.MORPH
        direction >= 0 -> PageMotion.PUSH
        else -> PageMotion.POP
    }

    fun durationMillis(motion: PageMotion): Int = when (motion) {
        PageMotion.TAB_FORWARD, PageMotion.TAB_BACK -> TAB_MILLIS
        PageMotion.PUSH -> PUSH_MILLIS
        PageMotion.POP -> POP_MILLIS
        PageMotion.MORPH -> MORPH_MILLIS
    }

    /**
     * Whether [route] shows a card that opens a Detail. Add every such page here: it is what makes
     * a Detail opened from it a MORPH instead of a push.
     */
    fun showsCards(route: Route): Boolean = route == Route.Home

    /**
     * The item whose card flies into its page across this pair, or null when this navigation is
     * not one of those. Scoping is as important as the animation: without it every item on two
     * card pages would match itself across an ordinary tab switch.
     */
    fun morphId(from: Route, to: Route): String? {
        val detail = (from as? Route.Detail ?: to as? Route.Detail) ?: return null
        val other = if (from === detail) to else from
        return if (showsCards(other)) detail.id else null
    }

    /**
     * Whether [route] is the page's end of a flight (the Detail a card opens), as opposed to the
     * card's end. Only the page's end fades; the card's end stays opaque underneath it, so two
     * half-faded copies never let the list show through (dash:ui/navigation/NavMotion.kt:307-324).
     * Asked by route kind, not "not a tab", so a pushed page of cards stays a card's end.
     */
    fun isPageEnd(route: Route): Boolean = route is Route.Detail

    /**
     * The namespace [route]'s shared pieces register in: a card page's own key, and for a Detail
     * the key of the card page it was opened from (the entry below it on [stack]). Null for a page
     * with no pieces to fly, which then registers none. Port of dash:ui/navigation/NavMotion.kt:396-411.
     *
     * Keys match on their text alone, so the same item's card on two card pages must not share a
     * key, or it flies across an ordinary tab switch (dash@42b59ff). The page's end cannot hardcode
     * its opener either: a Detail opened from a second card page would then register under the
     * first page's name, match nothing, and cut instead of flying. Naming the opener is also
     * something each page can say from its first composition; AppNavHost asks once per entry, while
     * the Detail is still on the stack, and keeps the answer for its pop.
     */
    fun sharedScope(route: Route, stack: List<Route>): String? = when {
        showsCards(route) -> route.key
        route is Route.Detail -> {
            val below = stack.indexOfLast { it.key == route.key } - 1
            stack.getOrNull(below)?.takeIf { showsCards(it) }?.key
        }
        else -> null
    }

    /**
     * The key a shared piece is registered under: the item, the part of it, and the [scope] from
     * [sharedScope]. The card and its Detail both land on the card page's scope, so they pair; the
     * same card on another card page does not. One key on two surfaces at once — a list and a sheet
     * over it — crashed Marginalia's shared-bounds pass; put the surface in [part] when an item can
     * show twice on one page.
     */
    fun sharedKey(id: String, part: String, scope: String): String = "$part:$id@$scope"

    /**
     * How dark a covered page goes. One flat rectangle over it, never the page's own alpha: alpha
     * below one on a whole page renders it offscreen and composites it, which on a 1440x3120
     * screen was Dash's single biggest source of slow draw commands. Near-black at a third reads
     * as the page receding; over a light page it reads as a grey flash, so light mode gets far less.
     */
    fun pageDim(dark: Boolean): Float = if (dark) .32f else .12f

    /**
     * Whether [page] is the one darkened while [partner] covers or uncovers it. Exactly one of the
     * two: a pop uncovers the page beneath, every other move covers the page leaving.
     *
     * A tab switch is a tab switch only when BOTH ends are tabs. Asking "am I and the live page both
     * tabs" is a different question — for the live page they are the same page — and it left every
     * pop undimmed (dash:ui/navigation/NavMotion.kt:414-430).
     */
    fun dims(page: Route, partner: Route, direction: Int, leaving: Boolean): Boolean {
        val tabSwitch = page is Route.Tab && partner is Route.Tab
        return if (!tabSwitch && direction < 0) !leaving else leaving
    }

    /**
     * Whether the host actually draws the dim over [page]: every page that [dims], except a tab
     * giving way to a tab (side by side, not stacked; the grey sweep WAS the "flicker between tabs")
     * and either end of a morph (the page's own ground fading in already says "covered"; a scrim
     * under it flashed dark on back — dash@ea5137b).
     */
    fun scrims(page: Route, partner: Route, direction: Int, leaving: Boolean, morphable: Boolean = true): Boolean =
        dims(page, partner, direction, leaving) &&
            !(page is Route.Tab && partner is Route.Tab) &&
            motion(page, partner, direction, morphable) != PageMotion.MORPH

    /**
     * Whether the host paints the app ground behind [page] while it travels. Screens paint no
     * ground of their own; one app-wide surface sits behind them. A page sliding over another
     * needs its own, and only while it slides. Both tab pages paint (a third tab cutting in turns
     * the middle one round over the first). A morph paints none this way: the page's end fades its
     * ground in instead ([fadesGround]).
     */
    fun paintsBackground(page: Route, partner: Route, direction: Int, leaving: Boolean, morphable: Boolean = true): Boolean =
        motion(page, partner, direction, morphable) != PageMotion.MORPH &&
            ((page is Route.Tab && partner is Route.Tab) || !dims(page, partner, direction, leaving))

    /** Whether [page]'s ground fades in and out over [PIECE_FADE_MILLIS]: the page's end of a morph. */
    fun fadesGround(page: Route, partner: Route, direction: Int, morphable: Boolean = true): Boolean =
        isPageEnd(page) && motion(page, partner, direction, morphable) == PageMotion.MORPH

    /**
     * Whether [page] arrives already put together rather than making its entrance ([arrivedFrom]
     * is the page it replaced, null for the app's first screen). A tab reached by navigating is
     * simply there, as on a strip of pages; only the first screen assembles itself.
     */
    fun arrivesSettled(page: Route, arrivedFrom: Route?): Boolean = page is Route.Tab && arrivedFrom != null

    /**
     * Whether a tab chosen [sinceLastSlideMillis] after the previous tab slide began cuts that slide
     * short. The slide lasts as long as the system animation scale makes it (dash:ui/navigation/
     * DashNavigation.kt:355-362).
     */
    fun overtakes(sinceLastSlideMillis: Long, animatorScale: Float): Boolean =
        sinceLastSlideMillis < TAB_MILLIS * animatorScale
}
