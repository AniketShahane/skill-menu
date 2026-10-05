package com.flick.sender.ui.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.indication
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.util.lerp
import com.flick.sender.ui.theme.FlickIcons
import com.flick.sender.ui.theme.FlickText
import com.flick.sender.ui.theme.LocalFlickColors
import com.flick.sender.ui.theme.Motion
import com.flick.sender.ui.theme.PillShape
import com.flick.sender.ui.theme.flickRipple
import com.flick.sender.ui.theme.pressScale
import com.flick.sender.ui.theme.rememberIsResumed
import com.flick.sender.ui.theme.rememberReduceMotion

/** A status dot; when [pulsing] it breathes alpha .4↔1 and scale .82↔1.18 over 1.6 s. */
@Composable
fun LiveDot(
    color: Color,
    modifier: Modifier = Modifier,
    size: Dp = 6.dp,
    pulsing: Boolean = false,
) {
    val reduceMotion = rememberReduceMotion()
    // Read before the early return, so the call shape does not depend on the branch taken.
    // This dot is the longest-lived loop in the app: the library's link pill drives it with
    // `playing` and the remote's top row with `serving`, both true for the whole of a cast,
    // so without this it asks for a frame every vsync for two hours while the same process
    // saturates the Wi-Fi radio. See [rememberIsResumed] for the rule.
    val resumed = rememberIsResumed()
    if (!pulsing || reduceMotion || !resumed) {
        Canvas(modifier.size(size)) { drawCircle(color = color) }
        return
    }
    val transition = rememberInfiniteTransition(label = "live dot")
    val phase = transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = Motion.PulseMs / 2, easing = Motion.Breathe),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "live dot phase",
    )
    // The dot overshoots its own box the way the CSS transform does; the Canvas is
    // unclipped so the swell never moves anything around it.
    Canvas(modifier.size(size)) {
        val t = phase.value
        drawCircle(
            color = color.copy(alpha = color.alpha * lerp(Motion.PulseMinAlpha, 1f, t)),
            radius = this.size.minDimension / 2f *
                lerp(Motion.PulseMinScale, Motion.PulseMaxScale, t),
        )
    }
}

enum class StatusKind { LIVE, CONNECTING, TROUBLE, CAUTION }

/** Full-pill status: `Serving · live`, `Connecting…`, `TV unreachable`, etc. */
@Composable
fun StatusPill(text: String, kind: StatusKind, modifier: Modifier = Modifier) {
    val colors = LocalFlickColors.current
    val accent = when (kind) {
        StatusKind.LIVE -> colors.live
        StatusKind.CONNECTING -> colors.link
        StatusKind.TROUBLE -> colors.trouble
        StatusKind.CAUTION -> colors.caution
    }
    // The caution hue is a warm mid-tone in every set — amber on the light canvas, vermilion
    // on the dark ones — so it never clears its floor as ink on the surface it would be
    // drawn on. The pill inverts instead: solid fill, dark ink. Every other state is a tint
    // of its own accent, which is a ground it does clear.
    val fill = if (kind == StatusKind.CAUTION) colors.caution else accent.copy(alpha = 0.14f)
    val ink = if (kind == StatusKind.CAUTION) colors.onCaution else accent
    Row(
        modifier = modifier
            .clip(PillShape)
            .background(fill)
            .padding(horizontal = 14.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LiveDot(
            color = ink,
            size = 7.dp,
            pulsing = kind == StatusKind.LIVE || kind == StatusKind.CONNECTING,
            modifier = Modifier.padding(end = 8.dp),
        )
        Text(text = text, style = FlickText.labelMedium.copy(color = ink))
    }
}

/**
 * Signal chip → `61.4 Mb/s · 5 GHz`, mono tabular, expands to the quality sheet.
 * The 48 dp box is the touch target; the visible pill sits centred inside it.
 */
@Composable
fun SignalChip(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    healthy: Boolean = true,
) {
    val colors = LocalFlickColors.current
    val fill: Color
    val ink: Color
    when {
        healthy -> {
            fill = colors.link.copy(alpha = 0.18f)
            ink = colors.link
        }
        // Amber-on-pale fails contrast, so the weak state inverts on light surfaces.
        colors.isLight -> {
            fill = colors.caution
            ink = colors.onCaution
        }
        else -> {
            fill = colors.caution.copy(alpha = 0.20f)
            ink = colors.caution
        }
    }
    val interaction = remember { MutableInteractionSource() }
    Box(
        modifier = modifier
            .heightIn(min = 48.dp)
            .pressScale(interaction)
            // The pill inside is smaller than this 48 dp target, so the press is drawn
            // there instead — a ripple bounded to the target would overhang the pill.
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClick = onClick,
            )
            .semantics { role = Role.Button },
        contentAlignment = Alignment.Center,
    ) {
        Row(
            modifier = Modifier
                .clip(PillShape)
                .background(fill)
                .indication(interaction, flickRipple(ink))
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = FlickIcons.Signal,
                contentDescription = null,
                tint = ink,
                modifier = Modifier.size(16.dp),
            )
            Text(
                text = text,
                style = FlickText.monoSmall.copy(color = ink),
                modifier = Modifier.padding(start = 7.dp),
            )
        }
    }
}
