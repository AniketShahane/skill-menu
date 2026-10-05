package com.example.starter.ui.components

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.util.lerp
import com.example.starter.ui.motion.LocalReducedMotion
import com.example.starter.ui.motion.rememberIsResumed
import com.example.starter.ui.theme.AppTheme
import com.example.starter.ui.theme.PillShape

/** One full breath of a live dot, there and back (flick:sender/ui/theme/Motion.kt:106). */
private const val PulseMillis = 1_600

/** Symmetric in and out, so the breath has no preferred direction. */
private val Breathe = CubicBezierEasing(0.42f, 0f, 0.58f, 1f)

/**
 * A status dot. When [pulsing] it breathes alpha .4 to 1 and scale .82 to 1.18.
 *
 * It is static when animations are off or the window is not resumed. A live dot is the
 * longest-lived loop an app has: Flick's drove a pill for the whole of a two-hour cast and
 * asked for a frame every vsync while the same process served 4K over Wi-Fi
 * (flick:sender/ui/components/StatusPills.kt:42-81).
 */
@Composable
fun LiveDot(color: Color, modifier: Modifier = Modifier, size: Dp = 6.dp, pulsing: Boolean = false) {
    val reduceMotion = LocalReducedMotion.current
    // Read before the early return, so the call shape does not depend on the branch taken.
    val resumed = rememberIsResumed()
    if (!pulsing || reduceMotion || !resumed) {
        Canvas(modifier.size(size)) { drawCircle(color = color) }
        return
    }
    val phase = rememberInfiniteTransition(label = "live dot").animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(PulseMillis / 2, easing = Breathe), RepeatMode.Reverse),
        label = "live dot phase",
    )
    // Unclipped: the swell overshoots the dot's own box and never moves its neighbours.
    Canvas(modifier.size(size)) {
        val t = phase.value
        drawCircle(
            color = color.copy(alpha = color.alpha * lerp(0.4f, 1f, t)),
            radius = this.size.minDimension / 2f * lerp(0.82f, 1.18f, t),
        )
    }
}

enum class StatusKind { LIVE, WORKING, DONE, TROUBLE, CAUTION }

/**
 * A full pill that states one condition ("Saved on this phone", "Connecting…"). Only LIVE and
 * WORKING pulse; a settled state that breathes claims something is still happening.
 */
@Composable
fun StatusPill(text: String, kind: StatusKind, modifier: Modifier = Modifier) {
    val colors = AppTheme.colors
    val accent = when (kind) {
        StatusKind.LIVE, StatusKind.DONE -> colors.positive
        StatusKind.WORKING -> colors.primary
        StatusKind.TROUBLE -> colors.trouble
        StatusKind.CAUTION -> colors.caution
    }
    // Caution inverts to a solid fill with dark ink: a warm mid-tone never clears its
    // contrast floor as ink on the surface it would sit on (flick:StatusPills.kt:92-96).
    val fill = if (kind == StatusKind.CAUTION) colors.caution else accent.copy(alpha = 0.14f)
    val ink = if (kind == StatusKind.CAUTION) colors.onCaution else accent
    Row(
        modifier.clip(PillShape).background(fill).padding(horizontal = 14.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LiveDot(
            color = ink,
            size = 7.dp,
            pulsing = kind == StatusKind.LIVE || kind == StatusKind.WORKING,
            modifier = Modifier.padding(end = 8.dp),
        )
        Text(text, style = MaterialTheme.typography.labelMedium, color = ink, maxLines = 1)
    }
}
