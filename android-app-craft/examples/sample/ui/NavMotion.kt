// Shows: every page-transition decision as a pure function — which PageMotion a route pair
// gets, how long it runs, which page dims and by how much, which page paints the app ground,
// and the timing/namespacing of flying pieces. No Compose import in this file on purpose: the
// rules are plain Kotlin so a JVM test can assert on them directly, with no host to fake.
// Example written for this skill; read it, don't paste it.

package app.sample.ui

/**
 * The five ways one page can give way to another. Exactly one of these runs per navigation —
 * never a page sliding while something also flies out of it, which tears the flying piece away
 * from the page it belongs to for a few frames.
 */
enum class PageMotion {
    TAB_FORWARD, TAB_BACK,  // two tab pages trading places, side by side, never dimmed
    PUSH, POP,              // one page rising over another, or falling away from it
    MORPH,                  // neither page moves; a card turns into the page it opens
}

/**
 * All page-transition rules, derived from the two routes alone. Keeping this Compose-free means
 * a test reads exactly what the running app does, rather than a description that can drift from
 * the host's actual wiring.
 */
object NavMotion {

    // Durations in ms. A whole-screen slide gets a slow curve and a generous span, because the
    // eye judges it by its fastest single frame, not by feel: a short duration on a wide curve
    // produces a visible jump the size of one animation step.
    const val TAB_MILLIS = 400
    const val PUSH_MILLIS = 340
    const val POP_MILLIS = 320

    // A morph holds BOTH pages composed for as long as the slower of the two things it contains:
    // the container itself, and the pieces flying inside it. The container must outlast the
    // pieces, or the transition tears down mid-flight and the still-flying piece snaps home in
    // a single frame instead of landing.
    const val MORPH_MILLIS = 500
    const val MORPH_PIECES_MILLIS = 400

    // A piece arrives slower than it leaves: there should always be more "looks arrived" than
    // "mid-flight", and a front-loaded flight reads as decisive rather than as a pale copy
    // sliding into place.
    const val PIECE_ARRIVE_MILLIS = 220
    const val PIECE_LEAVE_MILLIS = 150

    // Content that belongs only to the destination page (not a flying piece) waits until the
    // pieces are most of the way home, then arrives staggered — never all at once, and never
    // before there is a page shape for it to land on.
    const val PAGE_CONTENT_DELAY_MILLIS = MORPH_PIECES_MILLIS / 2
    const val PAGE_CONTENT_STEP_MILLIS = 55

    /** 1/12th of the travelled axis: enough to read as depth, never enough to show a hard edge. */
    const val PARALLAX_DIVISOR = 12

    /** The spring a slide finishes on when a second tap chooses a new tab before it has landed. */
    const val OVERTAKE_STIFFNESS = 1500f

    // Predictive back: the page under the thumb shrinks, drifts and rounds off, driven straight
    // by gesture progress; nothing else on the page transforms.
    const val BACK_SCALE_AMOUNT = 0.08f
    const val BACK_TRAVEL_DP = 28f
    const val BACK_CORNER_DP = 28f
    const val BACK_SETTLE_MILLIS = 280

    /** Z the floating bar is lifted to inside the shared-element overlay, above every piece. */
    const val CHROME_OVERLAY_Z = 8f

    /**
     * Which motion a navigation between [from] and [to] gets. [direction] is positive for a
     * forward push or forward tab, negative going back. [morphable] is false once the item the
     * destination would fly from has been removed (deleted mid-list), in which case a push or
     * pop stands in for what would otherwise be a morph.
     */
    fun motionFor(from: Route, to: Route, direction: Int, morphable: Boolean = true): PageMotion = when {
        from is Route.Tab && to is Route.Tab -> if (direction < 0) PageMotion.TAB_BACK else PageMotion.TAB_FORWARD
        morphable && flyingItemId(from, to) != null -> PageMotion.MORPH
        direction >= 0 -> PageMotion.PUSH
        else -> PageMotion.POP
    }

    fun millisFor(motion: PageMotion): Int = when (motion) {
        PageMotion.TAB_FORWARD, PageMotion.TAB_BACK -> TAB_MILLIS
        PageMotion.PUSH -> PUSH_MILLIS
        PageMotion.POP -> POP_MILLIS
        PageMotion.MORPH -> MORPH_MILLIS
    }

    /** Pages whose cards can grow into a detail page. Add a route here, not inline at call sites. */
    fun showsItemCards(route: Route): Boolean = route == Route.Items

    /** The id flying between [from] and [to], or null when this pair never flies at all. */
    fun flyingItemId(from: Route, to: Route): String? {
        val detail = (from as? Route.ItemDetail ?: to as? Route.ItemDetail) ?: return null
        val other = if (from === detail) to else from
        return if (showsItemCards(other)) detail.id else null
    }

    /** True for the page end of a flight (the detail a card opens), false for the card's own end. */
    fun isDestinationEnd(route: Route): Boolean = route is Route.ItemDetail

    /**
     * The namespace a page's pieces register their keys under: a card list's own key, or, for a
     * detail page, the key of whichever card list is beneath it on [stack]. A key that only
     * matches on the item id would also match the same item shown on a second list, and it would
     * fly across an ordinary tab switch. Scoping by the opening list fixes that, and the scope
     * must be something each page can answer from its very first frame — a gate that only opens
     * once the transition is already under way answers a frame too late for the first composition
     * to register against.
     */
    fun pieceScope(route: Route, stack: List<Route>): String? = when {
        showsItemCards(route) -> route.key
        route is Route.ItemDetail -> {
            val position = stack.indexOfLast { it.key == route.key } - 1
            stack.getOrNull(position)?.takeIf { showsItemCards(it) }?.key
        }
        else -> null
    }

    /** The key a flying piece registers under: which part of the item, on which list. */
    fun pieceKey(itemId: String, part: String, scope: String): String = "$part/$itemId@$scope"

    /**
     * How dark a covered page goes while the other end of the transition is topmost. One flat
     * rectangle, not the page's own alpha — alpha under one on a whole page of text and images
     * forces every frame of that page through an offscreen buffer, which is the single biggest
     * cause of slow draw commands this skill has measured on a dense page.
     */
    fun dimAmount(dark: Boolean): Float = if (dark) 0.32f else 0.12f

    /**
     * Whether [page] is the darkened one while [partner] shares its transition. Exactly one side
     * dims: a pop uncovers the page beneath it (that page brightens as it returns), every other
     * motion dims the page that is leaving. A tab switch dims neither — the two pages sit side by
     * side, not stacked, and a dim sweeping across a tab switch reads as a flicker, not depth.
     */
    fun dims(page: Route, partner: Route, direction: Int, leaving: Boolean): Boolean {
        val tabSwap = page is Route.Tab && partner is Route.Tab
        return if (!tabSwap && direction < 0) !leaving else leaving
    }

    /** Whether the host actually draws a dim rectangle over [page] this transition. */
    fun scrims(page: Route, partner: Route, direction: Int, leaving: Boolean, morphable: Boolean = true): Boolean =
        dims(page, partner, direction, leaving) &&
            !(page is Route.Tab && partner is Route.Tab) &&
            motionFor(page, partner, direction, morphable) != PageMotion.MORPH

    /**
     * Whether [page] paints its own copy of the app ground while it travels. Screens do not paint
     * a background of their own; one surface sits behind the whole host. A page sliding over
     * another needs its own ground only while it is in motion, and a morph needs none — its
     * destination page fades its own ground in as part of arriving, rather than sliding over one.
     */
    fun paintsOwnGround(page: Route, partner: Route, direction: Int, leaving: Boolean, morphable: Boolean = true): Boolean =
        motionFor(page, partner, direction, morphable) != PageMotion.MORPH &&
            ((page is Route.Tab && partner is Route.Tab) || !dims(page, partner, direction, leaving))

    /** Whether [page] is fading its own ground in or out right now — only the destination end of a morph. */
    fun fadesOwnGround(page: Route, partner: Route, direction: Int, morphable: Boolean = true): Boolean =
        isDestinationEnd(page) && motionFor(page, partner, direction, morphable) == PageMotion.MORPH

    /**
     * Whether [page] should skip its entrance choreography because it arrived already fully
     * assembled rather than by opening fresh — true for a tab reached by switching tabs, after
     * the app's first screen.
     */
    fun arrivesAssembled(page: Route, arrivedFrom: Route?): Boolean = page is Route.Tab && arrivedFrom != null

    /** Whether a tab tapped [sinceLastSlideMillis] after the previous slide started should cut it short. */
    fun overtakes(sinceLastSlideMillis: Long, animatorDurationScale: Float): Boolean =
        sinceLastSlideMillis < TAB_MILLIS * animatorDurationScale
}
