package com.example.starter.ui.motion

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.LocalTextStyle
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer

/**
 * Counts a number up from zero (or from its previous value) to [value], painted in the draw phase.
 *
 * For saved statistics only. A live measurement is never interpolated: a number that is not yet
 * true must not be shown (see references/motion-system.md, "Count-ups").
 *
 * The box is laid out once at the size of the FINAL text and the running value is drawn with
 * `drawText`, so a page of counting tiles never recomposes or re-lays out per frame. Nine
 * `Text`-based count-ups on Dash's Home each re-laid out their tile and row every frame
 * (dash docs/upgrade-0.9.1/README.md:15-17). Accessibility reads the final value, never a
 * number mid-count. Use tabular figures in [style] so the width never jitters.
 */
@Composable
fun AnimatedNumber(
    value: Double,
    style: TextStyle,
    color: Color,
    modifier: Modifier = Modifier,
    durationMillis: Int = 1_100,
    delayMillis: Int = 0,
    format: (Double) -> String,
) {
    val stage = LocalRevealStage.current
    // Asked again when the page's session changes (new data), so new totals still count up.
    val animated = remember(stage) { stage.playsNow() }
    val animatable = remember { Animatable(if (animated) 0f else value.toFloat()) }
    LaunchedEffect(value) {
        if (animated) {
            animatable.animateTo(value.toFloat(), tween(durationMillis, delayMillis, Easings.Arrive))
        } else {
            animatable.snapTo(value.toFloat())
        }
    }
    val measurer = rememberTextMeasurer()
    val resolved = LocalTextStyle.current.merge(style).copy(color = color)
    val density = LocalDensity.current
    val finalText = format(value)
    val reserved = remember(finalText, resolved, measurer) {
        measurer.measure(finalText, resolved, maxLines = 1, softWrap = false)
    }
    val width = with(density) { reserved.size.width.toDp() }
    val height = with(density) { reserved.size.height.toDp() }
    Box(
        modifier
            .size(width, height)
            .semantics { text = AnnotatedString(finalText) }
            .drawWithCache {
                onDrawBehind {
                    val shown = format(animatable.value.toDouble())
                    // TextMeasurer caches recent layouts; the landed frame reuses the reserved one.
                    drawText(if (shown == finalText) reserved else measurer.measure(shown, resolved, maxLines = 1, softWrap = false))
                }
            },
    )
}
