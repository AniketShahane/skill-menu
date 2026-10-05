package com.example.starter.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.starter.ui.Tags
import com.example.starter.ui.motion.LocalReducedMotion
import com.example.starter.ui.motion.pressScale
import com.example.starter.ui.motion.rememberIsResumed
import com.example.starter.ui.theme.AppCorners
import com.example.starter.ui.theme.AppTheme
import com.example.starter.ui.theme.PillShape

/** One sweep of the placeholder shimmer (dash:ui/DashMotion.kt:403-422). */
private const val ShimmerMillis = 1_500

/** How wide the bright band is, as a fraction of the card's width. */
private const val ShimmerSpan = 1.2f

/**
 * A loading sweep across a placeholder, only while [active].
 *
 * The gradient is built once per size in `drawWithCache` and MOVED with `translate`; only
 * the sweep phase is read per frame, in the draw phase. Dash's version built a new
 * `linearGradient` (a native shader) every frame (dash:ui/DashMotion.kt:411-420); the same
 * mistake at pointer rate cost Flick's scrub bar a shader per event (flick:sender/ui/components/PhoneScrubBar.kt:300-311).
 */
@Composable
fun Modifier.shimmer(active: Boolean, highlight: Color): Modifier {
    if (!active) return this
    val sweep = rememberInfiniteTransition(label = "shimmer").animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(ShimmerMillis, easing = LinearEasing), RepeatMode.Restart),
        label = "shimmer sweep",
    )
    return drawWithCache {
        val span = size.width * ShimmerSpan
        val band = Brush.linearGradient(
            listOf(Color.Transparent, highlight, Color.Transparent),
            start = Offset.Zero,
            end = Offset(span, size.height),
        )
        // The band's left edge runs from one card-width before the card to two after it, the
        // same path Dash's centre took (-1w to 2w), so the pause between sweeps matches.
        val from = -size.width - span / 2
        val travel = size.width * 3f
        onDrawWithContent {
            drawContent()
            translate(left = from + sweep.value * travel) {
                drawRect(band, size = Size(span, size.height))
            }
        }
    }
}

/**
 * Stands in for a card while its data loads: the same shape, the same edge, and the height
 * of the real card, so nothing below it moves when the data lands (dash:ui/home/HomeScreen.kt:138-140).
 * Give the real card `heightIn(min = height)` from the same constant.
 *
 * The shimmer is a loop, so it stops when animations are off or the window is not resumed:
 * a loop asks for a frame every vsync for as long as it is composed (flick:sender/ui/components/StatusPills.kt:51-57).
 */
@Composable
fun PlaceholderCard(height: Dp, modifier: Modifier = Modifier) {
    val colors = AppTheme.colors
    val shape = RoundedCornerShape(AppCorners.card)
    val reduceMotion = LocalReducedMotion.current
    val resumed = rememberIsResumed()
    Box(
        modifier
            .fillMaxWidth()
            .height(height)
            .clip(shape)
            .background(colors.surface)
            .border(1.dp, colors.outlineHairline, shape)
            .shimmer(active = !reduceMotion && resumed, highlight = colors.onSurface.copy(alpha = .06f))
            // A placeholder says nothing; the page's own loading line speaks for it.
            .clearAndSetSemantics { },
    )
}

/**
 * A designed zero state. It never fakes data: no empty chart, no row of dashes. It says what
 * will appear here and how, and offers the one move that gets there (dash:ui/components/DashComponents.kt:281-299).
 * Give an exact threshold when there is one ("Two sessions of at least a minute are needed
 * for a trend").
 */
@Composable
fun EmptyState(
    title: String,
    body: String,
    action: String?,
    onAction: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
) {
    val colors = AppTheme.colors
    AppCard(modifier.fillMaxWidth().testTag(Tags.EmptyState)) {
        Column(
            Modifier.fillMaxWidth().padding(vertical = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (icon != null) {
                Box(
                    Modifier.size(64.dp).background(colors.primary.copy(alpha = .14f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(icon, contentDescription = null, modifier = Modifier.size(30.dp), tint = colors.primary)
                }
            }
            Text(title, style = MaterialTheme.typography.titleLarge, color = colors.onSurface, textAlign = TextAlign.Center)
            Text(
                body,
                style = MaterialTheme.typography.bodyMedium,
                color = colors.onSurfaceDim,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 8.dp),
            )
            if (action != null) {
                Spacer(Modifier.height(4.dp))
                PillButton(action, onClick = onAction)
            }
        }
    }
}

enum class AdvisoryTone { CAUTION, INFO }

/**
 * A tinted, actionable advisory that sits in the page's flow: never a modal, never a toast
 * (flick:sender/ui/components/AdvisoryCard.kt:114-209). Use it for a partial result or a
 * setting that limits the app, above the content it is about; the rows the page did get are
 * real and stay. It names the condition and the exact fix. The action is an inverted pill at
 * least 48 dp tall.
 */
@Composable
fun AdvisoryCard(
    icon: ImageVector,
    title: String,
    body: String,
    actionLabel: String,
    onAction: () -> Unit,
    modifier: Modifier = Modifier,
    tone: AdvisoryTone = AdvisoryTone.INFO,
) {
    val colors = AppTheme.colors
    // Caution inverts to a solid fill with dark ink: a warm mid-tone never clears contrast as
    // ink on the surface it would sit on (flick:sender/ui/components/StatusPills.kt:92-96).
    val container = if (tone == AdvisoryTone.CAUTION) colors.caution else colors.surfaceTonal
    val ink = if (tone == AdvisoryTone.CAUTION) colors.onCaution else colors.onSurface
    val press = remember { MutableInteractionSource() }
    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(AppCorners.card))
            .background(container)
            .padding(horizontal = 17.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(13.dp),
    ) {
        Icon(icon, contentDescription = null, tint = ink, modifier = Modifier.size(22.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = ink)
            Text(
                body,
                style = MaterialTheme.typography.bodySmall,
                color = ink.copy(alpha = .86f),
                modifier = Modifier.padding(top = 3.dp),
            )
            Text(
                actionLabel,
                style = MaterialTheme.typography.labelLarge,
                color = container,
                modifier = Modifier
                    .padding(top = 11.dp)
                    .pressScale(press)
                    .clip(PillShape)
                    .background(ink)
                    .clickable(interactionSource = press, indication = null, role = Role.Button, onClick = onAction)
                    .heightIn(min = 48.dp)
                    .padding(horizontal = 16.dp, vertical = 15.dp),
            )
        }
    }
}
