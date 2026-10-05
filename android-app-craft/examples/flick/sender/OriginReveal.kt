package com.flick.sender.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.center
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.toSize
import com.flick.sender.ui.theme.rememberReduceMotion
import kotlin.math.hypot
import kotlin.math.max
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/** The surfaces the shell can summon out of the control that asked for one. */
enum class RevealTarget { ADVISORIES, QUALITY, DIAGNOSTICS }

/**
 * The shell's one summoning gesture: a surface is born at the control that asked for
 * it, as a disc that grows out of that control until it owns the window.
 *
 * [RevealOrigin] is the single channel between the two halves, and it is bound to one
 * [target] at construction: an origin recorded here can only ever be spent by the
 * surface it was recorded for, so a sheet nothing published an origin for is born at
 * its own centre instead of inheriting somebody else's control. The offsets are in ROOT
 * coordinates because the control and the surface never share a parent — and every host
 * here is a child of the shell's window-filling box, so a root offset is already a local
 * one for them.
 */
@Stable
class RevealOrigin(private val target: RevealTarget) {
    // Deliberately not snapshot state: publishing an origin must invalidate nothing,
    // and every read happens in the same composition as the state change that summoned
    // the surface.
    private var pending: Offset? = null
    private var serial = 0L

    /** Returns the ticket the publisher needs to take the origin back again. */
    fun record(center: Offset): Long {
        pending = center
        serial++
        return serial
    }

    /** No-op once a later press, or a consumer, has replaced what [serial] recorded. */
    fun withdraw(serial: Long) {
        if (serial == this.serial) pending = null
    }

    /**
     * Spent whether or not it matched, so a surface this channel does not serve cannot
     * leave the origin behind for the next one either. Null — a mismatch, a keyboard or
     * TalkBack activation, a restored state — falls back to the centre of the surface
     * being born.
     */
    fun consume(target: RevealTarget): Offset? {
        val origin = pending
        pending = null
        serial++
        return if (target == this.target) origin else null
    }
}

/**
 * The shell's [RevealTarget.QUALITY] channel. A composition local rather than a
 * parameter because the two controls that open that sheet sit four and five levels
 * inside a screen that otherwise knows nothing about the shell's overlay layer, and
 * threading the wire through every one of them would put a shell concern in their
 * signatures.
 *
 * The default instance exists so a control lifted out of the shell — a preview — still
 * composes; nothing consumes it, so an origin published there is simply never spent.
 */
internal val LocalQualityRevealOrigin = staticCompositionLocalOf { RevealOrigin(RevealTarget.QUALITY) }

/** Where a press has got to, decided once per final pass by [PressToSummon]. */
internal enum class PressVerdict { PENDING, SUMMONS, ABANDONED }

/**
 * Whether the press under way is still going to become the click that summons a surface.
 *
 * Consumption alone is NOT somebody taking the gesture away: `clickable` consumes the
 * down it is about to act on, and consumes the up again, both on the main pass — which
 * runs before the final pass this is fed from. Reading either as a steal withdraws the
 * origin of every press that ever becomes a click, and every surface is then born at its
 * own centre instead of at the control. Foundation's own
 * `ClickableNode.checkForCancellation` excludes the down it consumed for exactly this
 * reason; this excludes the press pass and reads the release first.
 *
 * What is left is honest: a consumed MOVE is a scroll or a pager that has taken the
 * gesture, and a pointer that leaves the control's bounds is a press the user thought
 * better of.
 */
internal class PressToSummon {
    private var pressPass = true

    fun onFinalPass(pressed: Boolean, consumed: Boolean, inBounds: Boolean): PressVerdict {
        val own = pressPass
        pressPass = false
        return when {
            // Released: only inside the control is the click on its way, and only then is
            // the origin it published the one that surface is born at.
            !pressed -> if (inBounds) PressVerdict.SUMMONS else PressVerdict.ABANDONED
            consumed && !own -> PressVerdict.ABANDONED
            !inBounds -> PressVerdict.ABANDONED
            else -> PressVerdict.PENDING
        }
    }
}

/**
 * Publishes this control's centre as [origin] for whatever it summons. Recorded on the
 * initial pass of the pointer down and never consumed there, so the control's own click
 * detector still owns the gesture.
 *
 * A press that another node claims — a scroll started on this row — or that is released
 * outside these bounds never becomes the click that summons anything, so the origin it
 * published is taken back rather than left for whatever opens next.
 */
@Composable
internal fun Modifier.revealOrigin(origin: RevealOrigin): Modifier {
    // Read only from the positioning callback, never from composition, so publishing
    // the control's own coordinates costs nothing.
    val coordinates = remember { mutableStateOf<LayoutCoordinates?>(null) }
    return this
        .onGloballyPositioned { coordinates.value = it }
        .pointerInput(origin) {
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                val node = coordinates.value?.takeIf { it.isAttached } ?: return@awaitEachGesture
                val ticket = origin.record(node.localToRoot(node.size.toSize().center))
                val bounds = Rect(Offset.Zero, size.toSize())
                val press = PressToSummon()
                var verdict = PressVerdict.PENDING
                while (verdict == PressVerdict.PENDING) {
                    // The final pass, so a scroll or a pager that took this gesture has
                    // already said so by the time the decision is made — and so the first
                    // event here is the down's own, which this control consumed.
                    val event = awaitPointerEvent(PointerEventPass.Final)
                    val change = event.changes.firstOrNull { it.id == down.id } ?: break
                    verdict = press.onFinalPass(
                        pressed = change.pressed,
                        consumed = change.isConsumed,
                        inBounds = bounds.contains(change.position),
                    )
                }
                if (verdict != PressVerdict.SUMMONS) origin.withdraw(ticket)
            }
        }
}

/**
 * Clips a surface to a disc growing from [from] — the room darkens outward from the
 * control that was pressed rather than fading in everywhere at once. [from] null falls
 * back to the centre of the surface itself, which is what a keyboard or TalkBack
 * activation and a restored state both land on.
 */
@Composable
internal fun Modifier.originRevealMask(from: Offset?, enabled: Boolean): Modifier {
    val reduceMotion = rememberReduceMotion()
    val spec = MaterialTheme.motionScheme.defaultSpatialSpec<Float>()
    val progress = remember { Animatable(0f) }
    // The disc must never give back coverage it has already taken. The scheme's spatial
    // spring overshoots past 1 and settles back down through it, so the clip is dropped
    // for good on the frame the disc first owns the window rather than being re-derived
    // from a value that dips under full coverage again.
    var covered by remember { mutableStateOf(false) }
    LaunchedEffect(enabled, reduceMotion) {
        if (!enabled) return@LaunchedEffect
        if (reduceMotion) {
            progress.snapTo(1f)
            covered = true
            return@LaunchedEffect
        }
        launch { progress.animateTo(1f, spec) }
        snapshotFlow { progress.value }.first { it >= 1f }
        covered = true
    }
    if (!enabled || covered) return this
    return this.graphicsLayer {
        // Read in the layer block, so the disc travels without recomposing the surface
        // it is uncovering.
        val travelled = progress.value
        if (travelled < 1f) {
            val center = from ?: size.center
            clip = true
            shape = DiscShape(center, travelled * coverRadius(center, size))
        }
    }
}

/** A circle of [radius] centred anywhere in the box, used as a clip. */
private class DiscShape(private val center: Offset, private val radius: Float) : Shape {
    override fun createOutline(
        size: Size,
        layoutDirection: LayoutDirection,
        density: Density,
    ): Outline = Outline.Rounded(
        RoundRect(
            left = center.x - radius,
            top = center.y - radius,
            right = center.x + radius,
            bottom = center.y + radius,
            cornerRadius = CornerRadius(radius),
        ),
    )
}

/** Distance from a point inside [size] to its farthest corner. */
private fun coverRadius(center: Offset, size: Size): Float =
    hypot(max(center.x, size.width - center.x), max(center.y, size.height - center.y))
