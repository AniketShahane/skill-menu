package com.example.starter.ui.nav

import androidx.compose.animation.BoundsTransform
import androidx.compose.animation.EnterExitState
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import com.example.starter.ui.motion.Easings
import com.example.starter.ui.motion.LocalReducedMotion

/**
 * One piece of a card that flies to its own place on the page it opens: the card's image into the
 * page's hero, its title into the page's title, and back. Give both ends the same item [id] and
 * [part]; the key is built from them and this page's [LocalPieceScope] ([NavMotion.sharedScope]):
 * the card page's own name, which the Detail also carries as the page it was opened from. So a
 * screen never names its opener, and a Detail opened from any card page pairs with that page's card.
 *
 * How it flies, and why each choice (references/navigation-and-shared-elements.md):
 * - `sharedBounds` with enter/exit None: both ends stay opaque in the overlay. Only the PAGE's end
 *   fades, over the card's end, with `ModulateAlpha` — the shared-bounds fade renders a part-faded
 *   piece offscreen every frame, for a hero one the width of the phone (dash:DashNavigation.kt:650-663).
 * - `scaleToBounds`: the page's end is measured once at its landing size and scaled, never
 *   re-measured per frame. `RemeasureToBounds` re-measured Dash's whole start page on every frame of
 *   a 460 ms transform (dash docs/upgrade-0.9.1/README.md:68-70). [contentScale] FillWidth keeps a
 *   line of text from re-wrapping; use Crop for a container, None for different words crossfading.
 * - Bounds fly on a tween of [NavMotion.MORPH_BOUNDS_MILLIS], which ends inside the 500 ms morph
 *   holding it. A tween ends at its duration and needs no threshold. If you swap it for a spring,
 *   name `Rect.VisibilityThreshold`: a spring left without one runs to 0.01 px and hands the copy
 *   back ~750 ms late (flick:sender/.../VideoTile.kt:309-323).
 * - [zIndex] orders pieces in the overlay; unnumbered pieces sort BELOW every numbered one,
 *   children included, so text inside a lifted surface needs a higher number (dash@184fd2f). The
 *   page's end gets +1 so it covers the card's.
 * - [shape] names the clip in the overlay. The overlay copy bypasses every ancestor clip, so a
 *   piece from a rounded seat with no clip flies as a hard rectangle (flick@a0ebf75).
 *
 * Outside a flight (no host, a page with no piece scope, a tab switch, a plain push) it is only its bounds, so a list of cards
 * neither animates nor waits for anything.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun Modifier.sharedPiece(
    id: String,
    part: String,
    contentScale: ContentScale = ContentScale.FillWidth,
    alignment: Alignment = Alignment.Center,
    zIndex: Float = 0f,
    shape: Shape? = null,
): Modifier {
    val shared = LocalSharedScope.current ?: return this
    val scope = LocalPageScope.current ?: return this
    val pieceScope = LocalPieceScope.current ?: return this
    val key = NavMotion.sharedKey(id, part, pieceScope)
    val route = LocalPageRoute.current
    val morphing = LocalMorphing.current
    val reduced = LocalReducedMotion.current
    val pageEnd = route != null && NavMotion.isPageEnd(route)
    val bounds = remember(reduced) {
        BoundsTransform { _, _ ->
            if (reduced) snap() else tween(NavMotion.MORPH_BOUNDS_MILLIS, easing = Easings.Flight)
        }
    }
    val inFlight = rememberInFlight(shared)
    return with(shared) {
        val state = rememberSharedContentState(key)
        val clip = remember(shape, shared) { shape?.let { OverlayClip(it) } }
        val placed = if (clip == null) {
            this@sharedPiece.sharedBounds(
                sharedContentState = state,
                animatedVisibilityScope = scope,
                enter = EnterTransition.None,
                exit = ExitTransition.None,
                boundsTransform = bounds,
                resizeMode = SharedTransitionScope.ResizeMode.scaleToBounds(contentScale, alignment),
                zIndexInOverlay = zIndex + if (pageEnd) 1f else 0f,
            )
        } else {
            this@sharedPiece.sharedBounds(
                sharedContentState = state,
                animatedVisibilityScope = scope,
                enter = EnterTransition.None,
                exit = ExitTransition.None,
                boundsTransform = bounds,
                resizeMode = SharedTransitionScope.ResizeMode.scaleToBounds(contentScale, alignment),
                zIndexInOverlay = zIndex + if (pageEnd) 1f else 0f,
                clipInOverlayDuringTransition = clip,
            )
        }
        if (!morphing || !pageEnd) {
            placed
        } else {
            // Added in the same composition that sets the flight off, and only on the pair in flight.
            val look = scope.transition.animateFloat(
                transitionSpec = {
                    when {
                        reduced -> snap()
                        targetState == EnterExitState.Visible -> tween(NavMotion.PIECE_FADE_MILLIS, easing = Easings.Fade)
                        else -> tween(NavMotion.PIECE_LEAVE_MILLIS, easing = Easings.Fade)
                    }
                },
                label = "piece look",
            ) { state -> if (state == EnterExitState.Visible) 1f else 0f }
            placed
                .graphicsLayer {
                    alpha = look.value
                    compositingStrategy = CompositingStrategy.ModulateAlpha
                }
                // Laid out once at its landing size while it flies; ~30 text measures a frame
                // otherwise, for nothing anyone could see (dash@c4ab031).
                .skipToLookaheadSize(inFlight)
        }
    }
}

/**
 * Keep floating chrome (the bar) above flying pieces. Pieces are drawn in the shared-element
 * overlay, over the host's whole content, so without this a card low on a list takes off over the
 * glass and lands back over it, and the bar's own return is hidden behind it (dash@29b6156).
 * Lifts only while a MORPH runs; use it on chrome in AppNavHost's `chrome` slot.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun Modifier.aboveFlights(): Modifier {
    val shared = LocalSharedScope.current ?: return this
    val flying = LocalFlightInProgress.current
    val lifted = remember(flying, shared) {
        if (!flying) {
            Modifier
        } else {
            with(shared) { Modifier.renderInSharedTransitionScopeOverlay(zIndexInOverlay = NavMotion.CHROME_OVERLAY_Z) }
        }
    }
    return this.then(lifted)
}

/**
 * Whether a shared transition is under way, as ONE lambda for the life of the piece. The default
 * is made afresh on every call and compared by identity, so every recomposition of a flying piece
 * would otherwise re-measure it (dash:DashNavigation.kt:683-690).
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
private fun rememberInFlight(shared: SharedTransitionScope): () -> Boolean =
    remember(shared) { { shared.isTransitionActive } }
