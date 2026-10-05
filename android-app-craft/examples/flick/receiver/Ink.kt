package com.flick.receiver.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorProducer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.tv.material3.LocalTextStyle
import com.flick.receiver.ui.theme.FlickMotion
import com.flick.receiver.ui.theme.LocalReducedMotion

/**
 * Text whose colour eases in the draw phase. tv-material3 `Text` takes its colour in
 * composition, so a colour change there recomposes on every animation frame; here
 * it only repaints. Semantics are the same as `Text`'s.
 */
@Composable
fun InkText(
    text: String,
    color: Color,
    style: TextStyle,
    modifier: Modifier = Modifier,
    maxLines: Int = Int.MAX_VALUE,
    softWrap: Boolean = true,
    overflow: TextOverflow = TextOverflow.Clip,
    textAlign: TextAlign? = null,
) {
    val ink = animateColorAsState(
        targetValue = color,
        animationSpec = FlickMotion.orSnap(LocalReducedMotion.current, FlickMotion.stateEffects()),
        label = "inkText",
    )
    val merged = LocalTextStyle.current.merge(style)
    BasicText(
        text = text,
        modifier = modifier,
        style = if (textAlign != null) merged.copy(textAlign = textAlign) else merged,
        overflow = overflow,
        softWrap = softWrap,
        maxLines = maxLines,
        color = ColorProducer { ink.value },
    )
}

/** A vector glyph whose tint eases in the draw phase. Decorative: it adds no semantics. */
@Composable
fun InkIcon(imageVector: ImageVector, tint: Color, modifier: Modifier = Modifier) {
    val painter = rememberVectorPainter(imageVector)
    val ink = animateColorAsState(
        targetValue = tint,
        animationSpec = FlickMotion.orSnap(LocalReducedMotion.current, FlickMotion.stateEffects()),
        label = "inkIcon",
    )
    val cache = remember { TintCache() }
    Box(
        modifier.drawBehind {
            with(painter) { draw(size, colorFilter = cache.filterFor(ink.value)) }
        },
    )
}

/**
 * Two glyphs dissolving into each other in place, [onVector] at [on] and [offVector]
 * otherwise. Decorative: it adds no semantics.
 */
@Composable
fun CrossfadeIcon(
    on: Boolean,
    onVector: ImageVector,
    offVector: ImageVector,
    onTint: Color,
    offTint: Color,
    modifier: Modifier = Modifier,
) {
    val onPainter = rememberVectorPainter(onVector)
    val offPainter = rememberVectorPainter(offVector)
    val progress = animateFloatAsState(
        targetValue = if (on) 1f else 0f,
        animationSpec = FlickMotion.orSnap(LocalReducedMotion.current, FlickMotion.stateEffects()),
        label = "crossfadeIcon",
    )
    val onCache = remember { TintCache() }
    val offCache = remember { TintCache() }
    Box(
        modifier.drawBehind {
            val p = progress.value.coerceIn(0f, 1f)
            if (p < 1f) {
                with(offPainter) { draw(size, alpha = 1f - p, colorFilter = offCache.filterFor(offTint)) }
            }
            if (p > 0f) {
                with(onPainter) { draw(size, alpha = p, colorFilter = onCache.filterFor(onTint)) }
            }
        },
    )
}

/** Rebuilds the tint filter only when the drawn colour changes, not on every frame. */
private class TintCache {
    private var color: Color? = null
    private var filter: ColorFilter? = null

    fun filterFor(tint: Color): ColorFilter {
        val cached = filter
        if (cached != null && color == tint) return cached
        return ColorFilter.tint(tint).also {
            color = tint
            filter = it
        }
    }
}
