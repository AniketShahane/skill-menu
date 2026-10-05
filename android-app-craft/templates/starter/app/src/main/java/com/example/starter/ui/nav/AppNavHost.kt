package com.example.starter.ui.nav

import android.os.SystemClock
import androidx.activity.compose.PredictiveBackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.EnterExitState
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.VisibilityThreshold
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.FrameRateCategory
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.preferredFrameRate
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.example.starter.ui.motion.Easings
import com.example.starter.ui.motion.LocalArrivesSettled
import com.example.starter.ui.motion.LocalReducedMotion
import com.example.starter.ui.motion.RevealSession
import com.example.starter.ui.motion.Springs
import com.example.starter.ui.motion.cut
import com.example.starter.ui.motion.orSnap
import com.example.starter.ui.motion.readAnimatorScale
import com.example.starter.ui.motion.rememberReducedMotion
import com.example.starter.ui.theme.AppTheme
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext

/** The Haze state the pages are drawn into, for glass to blur. Provided by AppNavHost, or by a shell above it. */
val LocalBackdrop: ProvidableCompositionLocal<HazeState?> = compositionLocalOf { null }

@OptIn(ExperimentalSharedTransitionApi::class)
val LocalSharedScope: ProvidableCompositionLocal<SharedTransitionScope?> = compositionLocalOf { null }

/** This page's side of the running page transition. */
val LocalPageScope: ProvidableCompositionLocal<AnimatedVisibilityScope?> = compositionLocalOf { null }

/** The route of the page being composed; read by [sharedPiece] to know which end it is. */
internal val LocalPageRoute: ProvidableCompositionLocal<Route?> = compositionLocalOf { null }

/**
 * Whether this page's current transition is a MORPH, latched as it starts to arrive or leave.
 * Only the pair in flight carries fades and layout holds; every other card on a list stays as it
 * is and snaps, so a tab switch neither redraws them nor lasts as long as a flight (dash@63e27f0).
 */
internal val LocalMorphing: ProvidableCompositionLocal<Boolean> = compositionLocalOf { false }

/**
 * The namespace this page's shared pieces register in ([NavMotion.sharedScope]): a card page's own
 * key, or for a Detail the card page it was opened from. Null registers nothing. Read by
 * [sharedPiece], so a screen names only the item and the part, never its opener.
 */
internal val LocalPieceScope: ProvidableCompositionLocal<String?> = compositionLocalOf { null }

/** Whether the last navigation was a MORPH; read by [aboveFlights] for chrome in the [AppNavHost] `chrome` slot. */
internal val LocalFlightInProgress: ProvidableCompositionLocal<Boolean> = compositionLocalOf { false }

/**
 * Animates between routes, hosts the shared-element scope, shrinks the top page during a
 * predictive back swipe, and blurs its pages into [backdrop] for floating glass.
 *
 * Tabs slide side by side like one strip; pages without a card behind them rise and fall; a
 * Detail opened from its card does not slide at all — the card's pieces fly and that is the only
 * thing moving ([NavMotion]). Every sliding page stays fully opaque; a covered page is dimmed by one
 * flat rectangle, never faded, so no transition needs a full-screen offscreen buffer. The one
 * page-wide fade is a morph's Detail content, on ModulateAlpha, which needs no buffer. Port of
 * dash:ui/navigation/DashNavigation.kt:340-521 (examples/sample/ui/AppNavigation.kt).
 *
 * Screens paint no background of their own: the host paints the app ground once, and a page only
 * paints its own while it slides. [chrome] is drawn above the pages inside the shared-transition
 * scope with [LocalBackdrop] provided — put the floating bar there and give it
 * `Modifier.aboveFlights()`. A bar composed outside the host shares the blur by providing
 * [LocalBackdrop] above the host (or passing [backdrop]); the host then sources into that state.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun AppNavHost(
    navigator: Navigator,
    modifier: Modifier = Modifier,
    backdrop: HazeState? = null,
    chrome: @Composable BoxScope.() -> Unit = {},
    page: @Composable (route: Route) -> Unit,
) {
    // The one Haze source: [backdrop], else a shell's LocalBackdrop, else our own. A second
    // source would draw the pages into the blur twice.
    val inherited = LocalBackdrop.current
    val own = rememberHazeState()
    val source = backdrop ?: inherited ?: own
    val reduced = rememberReducedMotion()
    val colors = AppTheme.colors
    val dark = AppTheme.isDark
    val ground = colors.canvas
    // The dim is the scrim's ink at full strength; its strength is pageDim, applied per frame.
    val dimInk = colors.scrim.copy(alpha = 1f)
    val backProgress = remember { Animatable(0f) }
    val backTravel = with(LocalDensity.current) { NavMotion.BACK_TRAVEL_DP.dp.toPx() }
    // Pages leave the composition when their transition ends; their remembered UI state (scroll
    // positions above all) is kept here under the navigator's save keys and comes back on pop.
    val stateHolder = rememberSaveableStateHolder()
    val providedKeys = remember { mutableSetOf<String>() }
    // When the last tab slide began, and whether this navigation is a tab chosen before it ended.
    val lastTabSlide = remember { longArrayOf(Long.MIN_VALUE / 2) }
    val resolver = LocalContext.current.contentResolver
    val overtaking = remember(navigator.saveKey(navigator.current)) {
        val tabSlide = navigator.previous is Route.Tab && navigator.current is Route.Tab
        val now = SystemClock.uptimeMillis()
        (tabSlide && NavMotion.overtakes(now - lastTabSlide[0], readAnimatorScale(resolver)))
            .also { if (tabSlide) lastTabSlide[0] = now }
    }
    val flight = navigator.previous?.let {
        NavMotion.motion(navigator.current, it, navigator.direction, navigator.morphable) == PageMotion.MORPH
    } ?: false

    // Needs targetSdk 36 (or android:enableOnBackInvokedCallback="true") for progress events to
    // arrive on a device; test the swipe on hardware.
    PredictiveBackHandler(enabled = navigator.canGoBack) { events ->
        try {
            events.collect { backProgress.snapTo(it.progress) }
            navigator.back()
            backProgress.animateTo(0f, tween(NavMotion.BACK_SETTLE_MILLIS, easing = Easings.Arrive))
        } catch (cancelled: CancellationException) {
            // A cancelled swipe cancels this very coroutine (activity-compose 1.10.1:
            // OnBackInstance.cancel() calls job.cancel()), so a bare animateTo here would throw
            // at its first frame and leave the page shrunk. Settle outside the cancellation.
            withContext(NonCancellable) { backProgress.animateTo(0f, Springs.Snappy) }
            throw cancelled
        }
    }

    SharedTransitionLayout(modifier) {
        CompositionLocalProvider(
            LocalSharedScope provides this,
            LocalReducedMotion provides reduced,
            LocalBackdrop provides source,
        ) {
            // Android 15+ votes a frame rate per invalidation; without a preference the platform
            // may settle transitions and draw-ins at 60 Hz once the finger lifts (dash
            // docs/upgrade-0.9.1/README.md:30-33). Leave it off screens that stay up for an hour.
            Box(Modifier.fillMaxSize().preferredFrameRate(FrameRateCategory.High)) {
                Box(Modifier.fillMaxSize().hazeSource(source).drawBehind { drawRect(ground) }) {
                    AnimatedContent(
                        targetState = navigator.current,
                        contentKey = { it.key },
                        label = "page",
                        transitionSpec = {
                            val depth = navigator.depth.toFloat()
                            val motion = NavMotion.motion(initialState, targetState, navigator.direction, navigator.morphable)
                            val spec = tween<IntOffset>(NavMotion.durationMillis(motion), easing = Easings.Travel)
                            // A sliding page starts a whole screen away and opaque, so it covers the
                            // page behind as it lands and nothing is ever half-transparent. A morph
                            // does not slide: the zero-distance slides only hold both pages composed
                            // while what was tapped does the travelling.
                            val transform = when {
                                reduced -> cut()
                                motion == PageMotion.TAB_FORWARD || motion == PageMotion.TAB_BACK -> {
                                    val sign = if (motion == PageMotion.TAB_BACK) -1 else 1
                                    val glide: FiniteAnimationSpec<IntOffset> =
                                        if (overtaking) {
                                            spring(dampingRatio = 1f, stiffness = NavMotion.OVERTAKE_STIFFNESS, visibilityThreshold = IntOffset.VisibilityThreshold)
                                        } else {
                                            tween(NavMotion.TAB_MILLIS, easing = Easings.Glide)
                                        }
                                    slideInHorizontally(glide) { sign * it } togetherWith slideOutHorizontally(glide) { -sign * it }
                                }
                                motion == PageMotion.MORPH ->
                                    slideInVertically(spec) { 0 } togetherWith slideOutVertically(spec) { 0 }
                                motion == PageMotion.PUSH ->
                                    slideInVertically(spec) { it } togetherWith slideOutVertically(spec) { -it / NavMotion.PARALLAX_PUSH }
                                else ->
                                    slideInVertically(spec) { -it / NavMotion.PARALLAX_PUSH } togetherWith slideOutVertically(spec) { it }
                            }
                            // No clip, or the default SizeTransform clips and anchors top-start.
                            transform.using(SizeTransform(clip = false)).apply { targetContentZIndex = depth }
                        },
                    ) { route ->
                        val leaving = route.key != navigator.current.key
                        val moving = transition.isRunning || transition.currentState != transition.targetState
                        val entering = moving && !leaving
                        // The other half of this transition. A leaving page animates against what is
                        // now current; the current page against the one it replaced, which only the
                        // navigator still remembers.
                        val partner = (if (leaving) navigator.current else navigator.previous) ?: route
                        val direction = navigator.direction
                        val motion = NavMotion.motion(route, partner, direction, navigator.morphable)
                        val saveKey = navigator.saveKey(route)
                        // Decided as the page starts to arrive or leave and kept until it turns round:
                        // a page still leaving would otherwise be re-paired with whatever is chosen next.
                        val morphing = remember(saveKey, leaving) { motion == PageMotion.MORPH }
                        val fadesGround = remember(saveKey, leaving) {
                            NavMotion.fadesGround(route, partner, direction, navigator.morphable)
                        }
                        // Asked once per entry, while a Detail is still on the stack above its opener,
                        // and kept for its pop, when the stack no longer says.
                        val pieceScope = remember(saveKey) { NavMotion.sharedScope(route, navigator.stack) }
                        val sliding = moving && NavMotion.paintsBackground(route, partner, direction, leaving, navigator.morphable)
                        val covered = NavMotion.scrims(route, partner, direction, leaving, navigator.morphable)
                        val deepest = NavMotion.pageDim(dark)
                        val dim by transition.animateFloat(
                            transitionSpec = { orSnap(reduced, tween(NavMotion.durationMillis(motion), easing = Easings.Travel)) },
                            label = "page dim",
                        ) { state -> if (state == EnterExitState.Visible) 0f else deepest }
                        // The page's end of a morph: its ground fades in under the flying pieces, and
                        // what only the page has arrives as they land. Fades that go with a flight.
                        val groundShown by transition.animateFloat(
                            transitionSpec = { if (fadesGround && !reduced) tween(NavMotion.PIECE_FADE_MILLIS, easing = Easings.Fade) else snap() },
                            label = "page ground",
                        ) { state -> if (state == EnterExitState.Visible) 1f else 0f }
                        val contentShown by transition.animateFloat(
                            transitionSpec = {
                                when {
                                    !fadesGround || reduced -> snap()
                                    targetState == EnterExitState.Visible ->
                                        tween(NavMotion.PIECE_FADE_MILLIS, NavMotion.PAGE_ARRIVE_DELAY_MILLIS, Easings.Fade)
                                    else -> tween(NavMotion.PIECE_LEAVE_MILLIS, easing = Easings.Fade)
                                }
                            },
                            label = "page content",
                        ) { state -> if (state == EnterExitState.Visible) 1f else 0f }
                        // Whether this page arrived by navigating to it, decided once, and asked by the
                        // page's RevealSession only while that arrival is still under way.
                        val settled = remember(saveKey) { NavMotion.arrivesSettled(route, if (leaving) null else navigator.previous) }
                        val arriving = remember(saveKey) {
                            {
                                settled && Snapshot.withoutReadObservation {
                                    transition.targetState == EnterExitState.Visible && transition.currentState != EnterExitState.Visible
                                }
                            }
                        }
                        SideEffect { providedKeys += saveKey }
                        Box(
                            Modifier
                                .fillMaxSize()
                                .graphicsLayer {
                                    // Only the page being swiped away shrinks; the page arriving beneath stays put.
                                    val progress = if (entering) 0f else backProgress.value
                                    if (progress > 0f) {
                                        val eased = Easings.Arrive.transform(progress)
                                        scaleX = 1f - NavMotion.BACK_SCALE * eased
                                        scaleY = scaleX
                                        translationX = backTravel * eased
                                        clip = true
                                        shape = RoundedCornerShape((NavMotion.BACK_CORNER_DP * eased).dp)
                                    }
                                }
                                .drawWithContent {
                                    if (sliding) drawRect(ground)
                                    if (fadesGround && moving) drawRect(ground, alpha = groundShown)
                                    drawContent()
                                    // One flat rectangle over the covered page, inside the same layer
                                    // so a predictive back swipe carries and clips it with the page.
                                    val shade = if (covered) dim else 0f
                                    if (shade > .004f) drawRect(dimInk, alpha = shade)
                                },
                        ) {
                            Box(
                                // Its own layer, so the ground above keeps its own alpha; dropped once
                                // the page has landed. Shared pieces fly in the overlay and skip it.
                                if (fadesGround && moving) {
                                    Modifier.fillMaxSize().graphicsLayer {
                                        alpha = contentShown
                                        compositingStrategy = CompositingStrategy.ModulateAlpha
                                    }
                                } else {
                                    Modifier.fillMaxSize()
                                },
                            ) {
                                CompositionLocalProvider(
                                    LocalPageScope provides this@AnimatedContent,
                                    LocalPageRoute provides route,
                                    LocalPieceScope provides pieceScope,
                                    LocalMorphing provides morphing,
                                    LocalArrivesSettled provides arriving,
                                ) {
                                    stateHolder.SaveableStateProvider(saveKey) {
                                        RevealSession(key = route.key) { page(route) }
                                    }
                                }
                            }
                        }
                    }
                }
                // Drop the state of every entry that has left the stack, so the same page opened
                // again starts from the top. A page still animating out keeps its key until then.
                val liveKeys = navigator.saveKeys
                SideEffect {
                    providedKeys.filter { it !in liveKeys }.forEach { key ->
                        stateHolder.removeState(key)
                        providedKeys -= key
                    }
                }
                CompositionLocalProvider(LocalFlightInProgress provides flight) { chrome() }
            }
        }
    }
}
