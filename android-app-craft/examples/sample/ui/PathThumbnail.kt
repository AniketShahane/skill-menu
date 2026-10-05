// Shows: an item's path drawn along its own length as a thumbnail, with geometry cached once
// per size/points, and a crossfade from an instant line sketch to the cached rendered bitmap
// once it is ready, so a card never shows a blank box while the render queue is busy.
// Example written for this skill; read it, don't paste it.

package com.example.sample.ui

import android.graphics.Bitmap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp

/*
 * An item's path is a list of abstract (x, y) points, not screen pixels: a thumbnail has to
 * fit them into a box before it can draw them. Two things make that cheap to repeat every
 * time a card recomposes:
 *  - The normalized path (points scaled and centered into the box) is built once per
 *    size + point list, in drawWithCache, and reused across every subsequent draw.
 *  - A slow render (the cached bitmap version, with fills and a head marker) happens off the
 *    main thread through RenderQueue; until it lands, a cheap line-only sketch of the same
 *    cached path draws immediately, so the card is never empty.
 */

data class PathPoint(val x: Float, val y: Float)

/** Builds a [Path] scaled and centered into [size], preserving aspect ratio with [padding]. */
private fun buildNormalizedPath(points: List<PathPoint>, size: androidx.compose.ui.geometry.Size, padding: Float): Path {
    if (points.size < 2) return Path()
    val minX = points.minOf { it.x }
    val maxX = points.maxOf { it.x }
    val minY = points.minOf { it.y }
    val maxY = points.maxOf { it.y }
    val spanX = (maxX - minX).coerceAtLeast(0.0001f)
    val spanY = (maxY - minY).coerceAtLeast(0.0001f)
    val scale = minOf(
        (size.width - padding * 2) / spanX,
        (size.height - padding * 2) / spanY,
    )
    val offsetX = padding + (size.width - padding * 2 - spanX * scale) / 2
    val offsetY = padding + (size.height - padding * 2 - spanY * scale) / 2

    fun toScreen(p: PathPoint) = Offset(
        offsetX + (p.x - minX) * scale,
        offsetY + (p.y - minY) * scale,
    )

    val path = Path()
    points.forEachIndexed { i, p ->
        val screen = toScreen(p)
        if (i == 0) path.moveTo(screen.x, screen.y) else path.lineTo(screen.x, screen.y)
    }
    return path
}

/**
 * The instant sketch: the item's path drawn along its own length, nothing else. Cheap enough
 * to draw on every composition, so it can show the instant a card appears, before the
 * rendered-and-cached bitmap is ready.
 */
@Composable
fun PathSketch(points: List<PathPoint>, modifier: Modifier = Modifier) {
    Canvas(
        modifier
            .fillMaxSize()
            .drawWithCache {
                // Geometry built once per size + point list; a recomposition that doesn't
                // change either reuses this exact Path.
                val path = buildNormalizedPath(points, size, padding = 8.dp.toPx())
                onDrawBehind {
                    drawPath(
                        path,
                        color = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.8f),
                        style = Stroke(width = 2.dp.toPx()),
                    )
                }
            }
    ) {}
}

/**
 * The full thumbnail: sketch first, then a crossfade into whatever [RenderQueue] hands back —
 * a bitmap with fills, a head marker, and the item's fixed hue. The two layers overlap during
 * the fade rather than swapping in one frame, so the handoff doesn't read as a flicker.
 */
@Composable
fun PathThumbnail(
    points: List<PathPoint>,
    cacheKey: String,
    cache: ThumbnailMemoryCache,
    renderWidth: Int,
    renderHeight: Int,
    modifier: Modifier = Modifier,
) {
    var rendered by remember(cacheKey) { mutableStateOf(cache.get(cacheKey)) }
    var fadeInProgress by remember(cacheKey) { mutableStateOf(rendered != null) }

    LaunchedEffect(cacheKey, points) {
        if (rendered != null) return@LaunchedEffect
        val bitmap = RenderQueue.submit {
            renderPathBitmap(points, renderWidth, renderHeight)
        }
        if (bitmap != null) {
            cache.put(cacheKey, bitmap)
            rendered = bitmap
            fadeInProgress = true
        }
        // A null result (the queue timed out with a pause reason stuck) leaves the sketch as
        // the only visible layer; the next recomposition with the same key tries again.
    }

    val renderAlpha = remember(cacheKey) { androidx.compose.animation.core.Animatable(0f) }
    LaunchedEffect(fadeInProgress) {
        if (fadeInProgress) renderAlpha.animateTo(1f, tween(durationMillis = 220))
    }

    androidx.compose.foundation.layout.Box(modifier.fillMaxSize()) {
        // The sketch underneath never fully disappears instantly: it fades out at the same
        // rate the render fades in, so there is no instant where neither layer is opaque.
        PathSketch(
            points,
            Modifier
                .fillMaxSize()
                .graphicsLayer { alpha = 1f - renderAlpha.value },
        )
        rendered?.let { bitmap ->
            Canvas(Modifier.fillMaxSize()) {
                drawImage(
                    bitmap.asImageBitmap(),
                    dstSize = androidx.compose.ui.unit.IntSize(size.width.toInt(), size.height.toInt()),
                    alpha = renderAlpha.value,
                )
            }
        }
    }
}

/** Stands in for the slow path: fills, head marker, the item's fixed hue — off the main
 *  thread, behind [RenderQueue] so it never competes with a scroll or a transition frame. */
private suspend fun renderPathBitmap(points: List<PathPoint>, width: Int, height: Int): Bitmap {
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = android.graphics.Canvas(bitmap)
    val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        style = android.graphics.Paint.Style.STROKE
        strokeWidth = 4f
        color = android.graphics.Color.WHITE
    }
    val path = android.graphics.Path()
    points.forEachIndexed { i, p ->
        if (i == 0) path.moveTo(p.x, p.y) else path.lineTo(p.x, p.y)
    }
    canvas.drawPath(path, paint)
    return bitmap
}
