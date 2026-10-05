package com.flick.receiver.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.State
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.focus.FocusEventModifierNode
import androidx.compose.ui.focus.FocusState
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.center
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.node.GlobalPositionAwareModifierNode
import androidx.compose.ui.node.ModifierNodeElement
import androidx.compose.ui.unit.toSize
import com.flick.receiver.ui.theme.FlickDimens
import com.flick.receiver.ui.theme.FlickMotion
import com.flick.receiver.ui.theme.LocalReducedMotion
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlin.math.hypot
import kotlin.math.max

/**
 * Where the wipe hands off: the colour starts dissolving once the circle has
 * covered this much of its reach, so the panel is already legible while the last
 * of the wipe is still travelling into the far corner.
 */
private const val HANDOFF_AT = 0.62f

/**
 * True once the enclosing [TvOriginReveal]'s wash has started to clear, so a
 * cascade inside the panel can wait to be seen instead of playing under the
 * opaque colour. Always true outside a reveal.
 */
val LocalTvRevealHandedOff = staticCompositionLocalOf<State<Boolean>> { AlwaysHandedOff }

private object AlwaysHandedOff : State<Boolean> {
    override val value = true
}

/**
 * Where a panel was summoned from, in root coordinates.
 *
 * On a phone the answer is "the control the finger pressed". A TV has no finger,
 * so the equivalent is THE FOCUSED CONTROL: whichever row held focus when the
 * panel was asked for is where the panel is born.
 */
@Stable
class TvRevealOrigin {

    /**
     * The last recorded source centre, or null before any source has held focus.
     *
     * Deliberately never cleared: opening a panel moves focus INTO the panel, so
     * a source that dropped its origin on focus loss would leave every reveal
     * starting from the surface centre — the one case this exists to avoid.
     */
    var offset: Offset? by mutableStateOf(null)
        internal set

    fun record(offset: Offset) {
        this.offset = offset
    }
}

@Composable
fun rememberTvRevealOrigin(): TvRevealOrigin = remember { TvRevealOrigin() }

/**
 * Publishes this element's centre as the origin whenever it holds focus.
 *
 * Safe to place on every member of a row: the origin holds whichever one focus
 * left from, which is the control that summoned the panel.
 */
fun Modifier.tvRevealSource(origin: TvRevealOrigin): Modifier =
    this.then(TvRevealSourceElement(origin))

/**
 * Wipes [color] outward from [origin] to cover the whole surface, then hands off
 * to [content] — the TV half of the phone's "a surface is born at the control
 * that summoned it". Taking [visible] away runs the same wipe backwards, so the
 * surface also DIES at the control it was born from.
 *
 * The circle is a DRAW-phase clip, never a recomposition or a layout of the
 * content underneath: what sits behind a TV panel is a live decoder surface, and
 * it may not be disturbed to animate chrome over it. Once the wipe has settled
 * the clip is dropped entirely, so a focused child's detached ring — which is
 * painted outside its own bounds — survives.
 *
 * Snaps when [LocalReducedMotion] is true. Falls back to the surface centre when
 * [TvRevealOrigin.offset] is null.
 *
 * [visible] drives the wipe, not the presence of [content] in the focus graph:
 * while it is false nothing is drawn, but the content is still composed and its
 * focusables are still reachable. **A caller that wants the retreat must keep
 * this composed past the close** — a draw-phase animation cannot run in a subtree
 * that has already been disposed — and [onRetreated] is what says the surface is
 * finally gone. It is also reported by a surface that composes hidden and is
 * never revealed at all, so a caller that keys anything off it must qualify the
 * report with its own open/closed state; that is the price of the report being
 * reachable from every path rather than only from a completed animation.
 *
 * A [GlassPanel] inside a reveal must pass `animateEntrance = false` — the
 * reveal owns the arrival, and two entrances on one panel fight each other.
 */
@Composable
fun TvOriginReveal(
    visible: Boolean,
    origin: TvRevealOrigin,
    color: Color,
    modifier: Modifier = Modifier,
    onRetreated: () -> Unit = {},
    content: @Composable BoxScope.() -> Unit,
) {
    val reducedMotion = LocalReducedMotion.current
    // Seeded from [visible]: the wipe belongs to a false → true transition, so a
    // surface that first composes with it already true was summoned before this
    // composition — a LazyColumn item returning to the viewport — and must arrive
    // settled. A caller's latch cannot enforce that from outside, because the
    // progress lives here and dies with the item.
    val reach = remember { Animatable(if (visible) 1f else 0f) }
    val wash = remember { Animatable(0f) }
    // The specs are rebuilt on every recomposition, so they are read through
    // holders rather than keyed into the effect below, which would restart the
    // wipe each time the panel's content recomposed.
    val wipeSpec = rememberUpdatedState(FlickMotion.panelSpatial<Float>())
    val handoffSpec = rememberUpdatedState(FlickMotion.fastStateEffects<Float>())
    // Exits lead with the fast spring, the way `glassPanelExit` does: a surface
    // that retraces its whole arrival reads as being dragged off screen.
    val retreatSpec = rememberUpdatedState(FlickMotion.focusSpatial<Float>())
    // Read through a holder so a caller that rebuilds the lambda cannot restart
    // the wipe, and so the report is always made to the current caller.
    val retreated = rememberUpdatedState(onRetreated)

    LaunchedEffect(visible, reducedMotion) {
        if (reducedMotion) {
            wash.snapTo(0f)
            reach.snapTo(if (visible) 1f else 0f)
            if (!visible) retreated.value()
            return@LaunchedEffect
        }
        if (!visible) {
            if (reach.value <= 0f) {
                // Nothing was ever wiped in — a surface composed hidden, or a
                // retreat that has already run. Reported anyway: the caller's
                // subtree is waiting on this to know it may go.
                wash.snapTo(0f)
                retreated.value()
                return@LaunchedEffect
            }
            // The entrance read backwards, which is what makes the surface read
            // as being pulled INTO the control rather than as one more thing
            // fading off the film: the colour comes back over the content while
            // the circle closes on the same origin it opened from. The colour
            // leads — `glassPanelExit`'s rule — and the geometry takes the FASTER
            // spring than the arrival did, which is the whole of "leaves in a
            // fraction of the time it arrived" on a spring that has no duration.
            coroutineScope {
                launch { wash.animateTo(1f, handoffSpec.value) }
                reach.animateTo(0f, retreatSpec.value)
            }
            retreated.value()
            return@LaunchedEffect
        }
        if (reach.value >= 1f) {
            // Nothing left to travel: either the seed above, or a close/reopen the
            // retreat never got a frame of. Laying the wash over a surface that is
            // already covered would flash it opaque for no distance gained.
            wash.snapTo(0f)
            return@LaunchedEffect
        }
        // The colour leads the geometry: it is opaque while the circle grows and
        // dissolves once the panel is nearly covered, so the surface reads as
        // being born at the control rather than fading up over the film.
        wash.snapTo(1f)
        coroutineScope {
            launch { reach.animateTo(1f, wipeSpec.value) }
            snapshotFlow { reach.value >= HANDOFF_AT }.first { it }
            wash.animateTo(0f, handoffSpec.value)
        }
    }

    // One holder for the reveal's life, so the static local never invalidates;
    // readers observe the flip, which happens once per open.
    val handedOff = remember { derivedStateOf { reach.value >= HANDOFF_AT } }

    // The origin is published in root coordinates by controls that know nothing
    // about this surface, so the surface resolves it against its own position.
    var rootPosition by remember { mutableStateOf(Offset.Zero) }

    Box(
        modifier = modifier
            .onGloballyPositioned { rootPosition = it.positionInRoot() }
            .drawWithCache {
                // One buffer per size, rewound per frame: the wipe repaints at
                // frame rate over a decoder and may not allocate while it runs.
                val circle = Path()
                onDrawWithContent {
                    val grown = reach.value
                    val cover = wash.value
                    if (grown <= 0f) return@onDrawWithContent
                    if (grown >= 1f && cover <= 0f) {
                        drawContent()
                        return@onDrawWithContent
                    }
                    val centre = origin.offset?.minus(rootPosition) ?: size.center
                    // The spring settles past 1, which only ever makes the circle
                    // bigger than it needs to be — the clip is dropped above at
                    // full reach anyway.
                    val radius = (farthestCorner(centre, size) +
                        FlickDimens.FocusRingReserve.toPx()) * grown
                    circle.rewind()
                    circle.addOval(
                        Rect(
                            left = centre.x - radius,
                            top = centre.y - radius,
                            right = centre.x + radius,
                            bottom = centre.y + radius,
                        ),
                    )
                    clipPath(circle) {
                        this@onDrawWithContent.drawContent()
                        if (cover > 0f) drawRect(color = color, alpha = cover)
                    }
                }
            }
            // The revealed surface's own render node, and the reason this wipe is
            // affordable at all. The clip above is re-cut on every frame of the
            // travel, and without a layer under it each of those frames re-records
            // the display list of everything the panel draws — every glyph, every
            // rule, every icon — to change one circle. With it the frame costs a
            // single `drawRenderNode`. No transform and no alpha here, so it is a
            // display list and never an offscreen buffer, and `clip` stays false so
            // a focused child's detached ring still paints outside its bounds.
            .graphicsLayer(),
    ) {
        CompositionLocalProvider(LocalTvRevealHandedOff provides handedOff) { content() }
    }
}

/** Distance from [centre] to the farthest corner, for a centre that may sit outside [size]. */
private fun farthestCorner(centre: Offset, size: Size): Float = hypot(
    max(centre.x, size.width - centre.x),
    max(centre.y, size.height - centre.y),
)

private data class TvRevealSourceElement(
    val origin: TvRevealOrigin,
) : ModifierNodeElement<TvRevealSourceNode>() {
    override fun create(): TvRevealSourceNode = TvRevealSourceNode(origin)
    override fun update(node: TvRevealSourceNode) = node.update(origin)
}

private class TvRevealSourceNode(
    private var origin: TvRevealOrigin,
) : Modifier.Node(),
    GlobalPositionAwareModifierNode,
    FocusEventModifierNode {

    private var centre: Offset? = null
    private var focused = false

    override fun onGloballyPositioned(coordinates: LayoutCoordinates) {
        if (!isAttached) return
        // Taken from the centre rather than the corner: the focus lift is a
        // centred `graphicsLayer` scale, so the centre is invariant under it and
        // a lifted control still reports where it actually sits.
        val bounds = coordinates.size.toSize()
        centre = coordinates.localToRoot(Offset(bounds.width / 2f, bounds.height / 2f))
        if (focused) publish()
    }

    override fun onFocusEvent(focusState: FocusState) {
        if (focusState.isFocused == focused) return
        focused = focusState.isFocused
        if (focused) publish()
    }

    fun update(origin: TvRevealOrigin) {
        this.origin = origin
        if (focused) publish()
    }

    private fun publish() {
        origin.record(centre ?: return)
    }
}
