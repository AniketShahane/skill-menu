package com.flick.receiver.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.EnterExitState
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.IntSize
import com.flick.receiver.ui.theme.FlickMotion
import com.flick.receiver.ui.theme.LocalReducedMotion

/**
 * An in-place word or glyph exchange. The exit leads because the replacement fades
 * up in the same spot and masks it, so two words are never legible together for
 * more than one 24 Hz frame.
 *
 * [content] must render only from its argument, never from outer state, or the
 * outgoing copy changes what it showed on its way out. [resize] lets the box follow
 * the new content's size; leave it off over a film, where layout must not animate.
 */
@Composable
fun <T> FlickSwap(
    target: T,
    modifier: Modifier = Modifier,
    resize: Boolean = false,
    contentAlignment: Alignment = Alignment.TopStart,
    contentKey: (T) -> Any? = { it },
    label: String = "flickSwap",
    content: @Composable (T) -> Unit,
) {
    // Resolved here: the @Composable spec accessors cannot be called in transitionSpec.
    // `using` is only reachable inside that scope, hence the explicit constructor.
    val swap = if (LocalReducedMotion.current) {
        FlickMotion.cut()
    } else {
        val sizeSpec = FlickMotion.panelSpatial<IntSize>()
        ContentTransform(
            targetContentEnter = fadeIn(FlickMotion.stateEffects()),
            initialContentExit = fadeOut(FlickMotion.fastStateEffects()),
            sizeTransform = if (resize) SizeTransform(clip = false) { _, _ -> sizeSpec } else null,
        )
    }
    AnimatedContent(
        targetState = target,
        modifier = modifier,
        transitionSpec = { swap },
        contentAlignment = contentAlignment,
        label = label,
        contentKey = contentKey,
    ) { value ->
        // The outgoing copy stays composed until the incoming fade settles, so it
        // leaves the accessibility tree on its first exit frame. The focus gate may
        // only clear: an inner write wins, and `true` would undo a guard below it.
        val leaving = transition.targetState != EnterExitState.Visible
        Box(
            modifier = Modifier
                .focusProperties { if (leaving) canFocus = false }
                .then(if (leaving) Modifier.clearAndSetSemantics { } else Modifier),
            // Without this the Box relaxes the parent's min constraints and
            // re-places the child TopStart.
            propagateMinConstraints = true,
        ) { content(value) }
    }
}
