package com.flick.receiver.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterExitState
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.util.lerp
import com.flick.receiver.ui.theme.FlickMotion
import com.flick.receiver.ui.theme.LocalReducedMotion
import kotlin.math.abs

/**
 * The one overlay-presence helper: [content] is shown while [value] is non-null.
 *
 * The exit draws the last non-null value, so a plate that was STALLED stays STALLED
 * while it fades. It enters from [rise] below and sinks half that on the way out,
 * scaling from [scaleFrom]. [overFilm] selects the pure-alpha tweens sized for the
 * 24 Hz pin. Alpha is applied per draw op rather than through an offscreen buffer,
 * and the layer is dropped once settled. Focus and semantics leave on the first
 * exit frame.
 */
@Composable
fun <T : Any> FlickPresence(
    value: T?,
    modifier: Modifier = Modifier,
    overFilm: Boolean = false,
    rise: Dp = 0.dp,
    scaleFrom: Float = 1f,
    label: String = "flickPresence",
    content: @Composable (T) -> Unit,
) {
    var retained by remember { mutableStateOf(value) }
    LaunchedEffect(value) { if (value != null) retained = value }
    val shown = value ?: retained
    val state = remember { MutableTransitionState(false) }.apply { targetState = value != null }
    AnimatedVisibility(
        visibleState = state,
        modifier = modifier,
        enter = EnterTransition.None,
        exit = ExitTransition.None,
        label = label,
    ) {
        val reduced = LocalReducedMotion.current
        val inSpec = FlickMotion.orSnap(reduced, FlickMotion.presenceIn<Float>(overFilm))
        val outSpec = FlickMotion.orSnap(reduced, FlickMotion.presenceOut<Float>(overFilm))
        val riseSpec = FlickMotion.orSnap(reduced, FlickMotion.panelSpatial<Float>())
        val sinkSpec = FlickMotion.orSnap(reduced, FlickMotion.focusSpatial<Float>())
        val alpha = transition.animateFloat(
            transitionSpec = { if (targetState == EnterExitState.Visible) inSpec else outSpec },
            label = "presenceAlpha",
        ) { if (it == EnterExitState.Visible) 1f else 0f }
        val travel = transition.animateFloat(
            transitionSpec = { if (targetState == EnterExitState.Visible) riseSpec else sinkSpec },
            label = "presenceTravel",
        ) {
            when (it) {
                EnterExitState.PreEnter -> 1f
                EnterExitState.Visible -> 0f
                EnterExitState.PostExit -> -0.5f
            }
        }
        val leaving = transition.targetState != EnterExitState.Visible
        val settled = !leaving && transition.currentState == EnterExitState.Visible
        Box(
            modifier = (
                if (settled) {
                    Modifier
                } else {
                    Modifier.graphicsLayer {
                        this.alpha = alpha.value
                        val t = travel.value
                        translationY = abs(t) * rise.toPx()
                        val s = lerp(1f, scaleFrom, if (t >= 0f) t else -2f * t)
                        scaleX = s
                        scaleY = s
                        compositingStrategy = CompositingStrategy.ModulateAlpha
                    }
                }
                )
                .focusProperties { if (leaving) canFocus = false }
                .then(if (leaving) Modifier.clearAndSetSemantics { } else Modifier),
        ) {
            shown?.let { content(it) }
        }
    }
}

/** Standby-only expanding entrance for a warning line. */
@Composable
fun flickRevealEnter(): EnterTransition =
    if (LocalReducedMotion.current) {
        EnterTransition.None
    } else {
        expandVertically(FlickMotion.panelSpatial()) + fadeIn(FlickMotion.stateEffects())
    }

/** The exit paired with [flickRevealEnter]; the fade leads. */
@Composable
fun flickRevealExit(): ExitTransition =
    if (LocalReducedMotion.current) {
        ExitTransition.None
    } else {
        shrinkVertically(FlickMotion.focusSpatial()) + fadeOut(FlickMotion.fastStateEffects())
    }
