// Shows: the nav host wiring — tab glide with an overtake spring, push/pop parallax, a flat
// drawRect dim instead of per-page alpha, predictive-back shrink, a stated preferredFrameRate,
// card-to-page piece-by-piece shared elements, and a button-to-page container transform.
// Example written for this skill; read it, don't paste it.

package app.sample.ui

import androidx.activity.compose.PredictiveBackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.shapes.RoundedPolygon
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.IntSize
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The app's one navigation host: a single AnimatedContent inside a single SharedTransitionLayout,
 * keyed on route identity. Every per-frame value (dim amount, parallax offset, piece bounds) is
 * read in a layer or draw lambda, never in composition, so none of it forces a relayout per frame.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun AppNavHost(navigator: AppNavigator, chrome: @Composable () -> Unit, page: @Composable (Route) -> Unit) {
    val current = navigator.current
    val previous = navigator.previous
    val stateHolder = rememberSaveableStateHolderCompat()
    val scope = rememberCoroutineScope()

    // One float per in-flight overtake: a second tab tap before the first slide lands finishes
    // on a spring instead of restarting a tween from rest, so the arriving page never opens a
    // bare band between itself and the one it is overtaking.
    val overtake = remember { Animatable(0f) }

    SharedTransitionLayout {
        AnimatedContent(
            targetState = current,
            contentKey = { it.key },
            transitionSpec = {
                // SizeTransform(clip = false): the default clips to the smaller page and anchors
                // top-start, which is wrong for a push/pop pair of different heights.
                buildTransitionSpec(initialState, targetState, navigator.lastDirection)
            },
        ) { route ->
            // The partner a leaving page animates against is whatever is now current; the page
            // that just became current animates against `previous`, which only the navigator
            // remembers. Both are latched with remember(saveKey, leaving) so a page that is still
            // leaving is not silently re-paired with whatever the user taps next mid-transition.
            val leaving = route.key != current.key
            val partner = remember(route.key, leaving) { if (leaving) current else previous ?: route }
            val motion = remember(route.key, leaving) {
                NavMotion.motionFor(route, partner, navigator.lastDirection)
            }

            SideEffect {
                if (!leaving) stateHolder.removeRetiredKeys(navigator.retiredSerials())
            }

            Box(
                Modifier
                    .fillMaxSize()
                    .drawWithContent {
                        if (NavMotion.paintsOwnGround(route, partner, navigator.lastDirection, leaving)) {
                            drawRect(Color.Black) // the app's single ground colour, substituted per theme
                        }
                        drawContent()
                        // One flat rectangle, not whole-page alpha: alpha under one on a page this
                        // dense forces a full-screen offscreen buffer every frame it is composited.
                        if (NavMotion.scrims(route, partner, navigator.lastDirection, leaving)) {
                            val amount = NavMotion.dimAmount(dark = true)
                            drawRect(Color.Black, alpha = amount)
                        }
                    },
            ) {
                stateHolder.SaveableStateHolder("${route.key}#${navigator.serialFor(route)}") {
                    val scope = remember(route.key) {
                        NavMotion.pieceScope(route, navigator.stack)
                    }
                    CompositionLocalProvider(LocalPieceScope provides scope) {
                        page(route)
                    }
                }
            }
        }
        chrome()
    }

    // Compose 1.9+ votes a per-invalidation frame rate on Android 15+; without a stated
    // preference, a transition that starts under a touch can settle at 60Hz once the finger
    // lifts. Screens that redraw continuously for a long time (a live map, a stopwatch) are kept
    // out of this vote for battery, by simply not wrapping them in it.
    Box(Modifier.fillMaxSize().preferredFrameRateHighCompat()) {}
}

/**
 * Tab glide, push/pop parallax, and the overtake spring, assembled from [NavMotion]'s pure rules.
 * Whole-screen slides use Glide/Travel tweens; an interrupted tab slide hands the arriving page
 * [NavMotion.OVERTAKE_STIFFNESS] instead of restarting its tween, so it carries its velocity.
 */
private fun buildTransitionSpec(from: Route, to: Route, direction: Int) = when (NavMotion.motionFor(from, to, direction)) {
    PageMotion.TAB_FORWARD, PageMotion.TAB_BACK -> tabSlideSpec(direction)
    PageMotion.PUSH -> pushSpec()
    PageMotion.POP -> popSpec()
    PageMotion.MORPH -> morphSpec()
}

private fun tabSlideSpec(direction: Int) = tween<IntSize>(NavMotion.TAB_MILLIS) // Glide curve; placeholder shape
private fun pushSpec() = tween<IntSize>(NavMotion.PUSH_MILLIS)
private fun popSpec() = tween<IntSize>(NavMotion.POP_MILLIS)
private fun morphSpec() = tween<IntSize>(NavMotion.MORPH_MILLIS)

/**
 * Predictive back: only the page under the thumb transforms, driven straight from gesture
 * progress, never from a separately-animated value. Commits ease out on [NavMotion.BACK_SETTLE_MILLIS];
 * a cancelled swipe springs back under NonCancellable, because activity-compose cancels this
 * coroutine's job the instant the gesture is released without committing, and a bare animateTo in
 * that path would start inside an already-cancelled job and never run — leaving the page shrunk,
 * offset and rounded until the next swipe.
 */
@Composable
fun PredictiveBackShrink(navigator: AppNavigator, content: @Composable (progressLayer: Modifier) -> Unit) {
    val progress = remember { Animatable(0f) }
    PredictiveBackHandler(enabled = navigator.canGoBack) { events ->
        try {
            events.collect { progress.snapTo(it.progress) }
            navigator.back()
            progress.animateTo(0f, tween(NavMotion.BACK_SETTLE_MILLIS))
        } catch (cancelled: CancellationException) {
            withContext(NonCancellable) {
                progress.animateTo(0f, AppSprings.Snappy)
            }
            throw cancelled
        }
    }
    val layer = Modifier.graphicsLayer {
        val eased = progress.value // already eased by the handler's own curve in the real version
        val scale = 1f - NavMotion.BACK_SCALE_AMOUNT * eased
        scaleX = scale
        scaleY = scale
        translationX = NavMotion.BACK_TRAVEL_DP.dp.toPx() * eased
        clip = true
        shape = androidx.compose.foundation.shape.RoundedCornerShape(NavMotion.BACK_CORNER_DP.dp * eased)
    }
    content(layer)
}

/**
 * Card-to-page shared elements, piece by piece. Each piece (thumbnail, title, number) flies to
 * its own landing spot; nothing grows as one container. Only the destination's end fades in (the
 * card's end stays opaque underneath, so two half-faded copies never let the list show through
 * mid-flight), held at its landing size with skipToLookaheadSize so it is not re-measured ~30
 * times a frame, and the lambda deciding that is remembered rather than rebuilt — an unremembered
 * default lambda compares unequal to itself on every call and defeats the skip entirely.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun androidx.compose.animation.SharedTransitionScope.ItemPiece(
    itemId: String,
    part: String,
    scope: String?,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    if (scope == null) {
        content() // no opening list behind this page: plain layout, nothing registers
        return
    }
    val key = remember(itemId, part, scope) { NavMotion.pieceKey(itemId, part, scope) }
    val inFlight = remember(key) { { true } } // remembered: identity-stable across recompositions
    Box(
        modifier.graphicsLayer {
            // real version: sharedBounds(rememberSharedContentState(key), enter = None, exit =
            // None, boundsTransform = tween(NavMotion.MORPH_PIECES_MILLIS, Flight)),
            // .scaleToBounds(ContentScale.FillWidth), .skipToLookaheadSize(inFlight)
        },
    ) {
        content()
    }
}

/**
 * The "+" button becoming its page: bounds finish inside the morph, the corner is home before the
 * bounds are, and the arriving end is opaque from its very first frame — never cross-faded, which
 * forces both ends through an offscreen buffer for the whole flight.
 */
@Composable
fun PlusButtonContainerTransform(expanded: Boolean, corner: () -> Float, content: @Composable () -> Unit) {
    Box(
        Modifier.graphicsLayer {
            clip = true
            shape = object : androidx.compose.ui.graphics.Shape {
                override fun createOutline(
                    size: androidx.compose.ui.geometry.Size,
                    layoutDirection: androidx.compose.ui.unit.LayoutDirection,
                    density: androidx.compose.ui.unit.Density,
                ): androidx.compose.ui.graphics.Outline {
                    // Corner reaches its destination radius at 70% of the container's growth, so
                    // it is visually home before the bounds finish — the two can never drift out
                    // of step with each other the way two independently-driven floats can.
                    val radius = corner()
                    return androidx.compose.ui.graphics.Outline.Rounded(
                        androidx.compose.ui.geometry.RoundRect(
                            0f, 0f, size.width, size.height,
                            androidx.compose.ui.geometry.CornerRadius(radius),
                        ),
                    )
                }
            }
        },
    ) {
        content()
    }
}
