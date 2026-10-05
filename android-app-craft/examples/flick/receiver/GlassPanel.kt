package com.flick.receiver.ui.components

import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import com.flick.receiver.ui.theme.FlickColor
import com.flick.receiver.ui.theme.FlickDimens
import com.flick.receiver.ui.theme.FlickMotion
import com.flick.receiver.ui.theme.FlickShape
import com.flick.receiver.ui.theme.FlickSpace
import com.flick.receiver.ui.theme.LocalReducedMotion
import com.flick.receiver.ui.theme.glassChrome
import com.flick.receiver.ui.theme.glassPanel
import com.flick.receiver.ui.theme.glassState
import com.flick.receiver.ui.theme.panelTopHighlightBrush
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

/**
 * Which glass a [GlassPanel] is cut from (receiver-expressive-spec.md §2a):
 *  - [Chrome] — the bottom transport panel, which sits inside the bottom scrim;
 *  - [Panel]  — the subtitles / metrics panels and the handshake card, which
 *    carry dense text and reach up through the unscrimmed band;
 *  - [State]  — a **centred state overlay**: buffering, paused, finished. It sits
 *    where there is no scrim by design, so its plate is the whole read;
 *  - [Solid]  — the opaque `Surface` card with a white hairline, for panels that
 *    do not sit over moving video (the pairing manual-entry card).
 *
 * The three film-facing tones are graded by how much scrim is under them, not by
 * taste: `UNSCRIMMED_BAND` is real and permanent, and a surface that lands in it
 * owns its own backdrop. See `FlickColor.GlassState`.
 */
enum class GlassPanelTone { Chrome, Panel, State, Solid }

/**
 * The shared floating panel: glass fill, hairline border, the §2d inner top
 * highlight, and a [riseDistance] entrance.
 *
 * Two modes, and only two. By default the panel owns its own arrival: it rises on
 * [FlickMotion.panelSpatial] and fades on [FlickMotion.stateEffects], once, the
 * first time it composes. With `animateEntrance = false` it carries no transform
 * layer of its own at all, because its parent is driving both halves through
 * `AnimatedVisibilityScope.animateEnterExit` with [glassPanelEnter] /
 * [glassPanelExit] — the only way a panel can also have an *exit*, which a
 * one-way entrance latch could never give it.
 *
 * The panel deliberately does NOT clip its content — a focused child's detached
 * amber ring extends past its own bounds and must survive. Neither mode may
 * introduce a clip.
 *
 * [borderColor] overrides the tone's own hairline — spec §5.2 gives the handshake
 * card the white [FlickColor.GlassBorder] rather than the cool one the side
 * panels wear.
 */
@Composable
fun GlassPanel(
    modifier: Modifier = Modifier,
    shape: Shape = FlickShape.Hero,
    tone: GlassPanelTone = GlassPanelTone.Chrome,
    borderColor: Color? = null,
    contentPadding: PaddingValues = FlickDimens.PanelPadding,
    verticalArrangement: Arrangement.Vertical = Arrangement.spacedBy(FlickSpace.Md),
    horizontalAlignment: Alignment.Horizontal = Alignment.Start,
    riseDistance: Dp = FlickMotion.TvRise,
    animateEntrance: Boolean = true,
    showTopHighlight: Boolean = true,
    content: @Composable ColumnScope.() -> Unit,
) {
    // Nothing is created in the parent-owned mode: two animations that no pixel
    // reads still cost a frame callback each, and this panel sits over a decoder.
    val entrance = if (animateEntrance) rememberGlassPanelEntrance(riseDistance) else Modifier
    // Hoisted out of the draw phase: this layer is invalidated by every chrome
    // tick underneath it, and the five-stop gradient would otherwise be rebuilt
    // on each redraw. It is a pure function of fractional stops, so one instance
    // serves every size.
    val topHighlight = remember { panelTopHighlightBrush() }

    Column(
        modifier = modifier
            .then(entrance)
            .glassTone(tone, shape, borderColor)
            .drawWithContent {
                drawContent()
                if (showTopHighlight) {
                    drawRect(
                        brush = topHighlight,
                        size = Size(size.width, FlickDimens.Hairline.toPx()),
                    )
                }
            }
            .padding(contentPadding),
        verticalArrangement = verticalArrangement,
        horizontalAlignment = horizontalAlignment,
        content = content,
    )
}

/**
 * The self-owned entrance: a one-shot rise and fade, run once the first time the
 * panel composes.
 *
 * Split deliberately: the rise is geometry and takes a spatial spring that may
 * settle past its target, the fade is alpha and takes an effects spring that must
 * not — an opacity animating past 1 is a rendering fault, not expression. Both are
 * read inside the layer block, so the entrance never recomposes the panel.
 *
 * Once both have settled the layer is DROPPED rather than left compositing a
 * finished transform forever. Every panel on screen otherwise keeps a render node
 * of its own for the life of the surface, and while alpha is below 1 that node is
 * an offscreen buffer at panel resolution — real GPU memory and a real composite
 * per frame, bought for an animation that ended a second after the screen opened.
 */
@Composable
private fun rememberGlassPanelEntrance(riseDistance: Dp): Modifier {
    val reducedMotion = LocalReducedMotion.current
    val fadeSpec: FiniteAnimationSpec<Float> = FlickMotion.stateEffects()
    val riseSpec: FiniteAnimationSpec<Float> = FlickMotion.panelSpatial()
    val fade = remember { Animatable(0f) }
    val rise = remember { Animatable(1f) }
    var settled by remember { mutableStateOf(false) }
    LaunchedEffect(reducedMotion) {
        if (reducedMotion) {
            fade.snapTo(1f)
            rise.snapTo(0f)
        } else {
            coroutineScope {
                launch { fade.animateTo(1f, fadeSpec) }
                launch { rise.animateTo(0f, riseSpec) }
            }
        }
        settled = true
    }
    if (settled) return Modifier
    return Modifier.graphicsLayer {
        alpha = fade.value
        translationY = rise.value * riseDistance.toPx()
    }
}

/**
 * The panel entrance a parent owns when [GlassPanel] is told not to animate
 * itself — the same rise and fade, expressed as an [EnterTransition] so it can be
 * driven from `AnimatedVisibilityScope.animateEnterExit`.
 */
@Composable
fun glassPanelEnter(riseDistance: Dp = FlickMotion.TvRise): EnterTransition {
    val rise = with(LocalDensity.current) { riseDistance.roundToPx() }
    return slideInVertically(FlickMotion.panelSpatial()) { rise } +
        fadeIn(FlickMotion.stateEffects())
}

/**
 * The exit vocabulary, defined once for every TV panel: sink half the distance
 * you rose, and lead with the fade.
 *
 * A spring exit has no fixed duration, so "leaves in ~40 % of the time it
 * arrived" is carried by the specs rather than by a number — the fade is the fast
 * effects spring against the entrance's default one, and the sink is half the
 * travel on the focus spring rather than the panel spring.
 */
@Composable
fun glassPanelExit(riseDistance: Dp = FlickMotion.TvRise): ExitTransition {
    val sink = with(LocalDensity.current) { (riseDistance * 0.5f).roundToPx() }
    return slideOutVertically(FlickMotion.focusSpatial()) { sink } +
        fadeOut(FlickMotion.fastStateEffects())
}

private fun Modifier.glassTone(
    tone: GlassPanelTone,
    shape: Shape,
    borderColor: Color?,
): Modifier = when (tone) {
    GlassPanelTone.Chrome ->
        if (borderColor == null) glassChrome(shape)
        else background(FlickColor.GlassChrome, shape)
            .border(FlickDimens.Hairline, borderColor, shape)
    GlassPanelTone.Panel ->
        if (borderColor == null) glassPanel(shape)
        else background(FlickColor.GlassPanel, shape)
            .border(FlickDimens.Hairline, borderColor, shape)
    GlassPanelTone.State ->
        if (borderColor == null) glassState(shape)
        else background(FlickColor.GlassState, shape)
            .border(FlickDimens.Hairline, borderColor, shape)
    GlassPanelTone.Solid ->
        background(FlickColor.Surface, shape)
            .border(FlickDimens.Hairline, borderColor ?: FlickColor.GlassBorder, shape)
}
