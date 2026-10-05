// Shows: a chart kit (bars, line, sparkline, heatmap, week dots) whose entrance progress is
// read only in the draw scope, whose geometry is built once per size/data, and whose gradient
// brush is built once rather than once per draw-in frame.
// Example written for this skill; read it, don't paste it.

package com.example.sample.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.example.sample.ui.motion.Easings
import com.example.sample.ui.motion.rememberRevealProgress

/*
 * Rules this file exists to show: values arrive in display units, higher is better (flip
 * anything where lower is better before charting, and caption the axis); entrance progress is
 * read ONLY inside drawWithCache's draw block, so a tick repaints one node instead of
 * recomposing or re-measuring; geometry is rebuilt once per size/data, never every frame; a
 * long series is bucketed before it is drawn small, or it reads as a scribble; the reveal runs
 * linear and each bar eases its own share once (easing twice compounds into a slow start); and
 * selection reads the latest callback through rememberUpdatedState so a drag handler that
 * captured `selected`/`onSelect` at gesture-start does not go stale after the first move.
 */

private const val BarGapDp = 5
private const val HaloDp = 1.5f
private const val MinBarDp = 3

@Composable
fun ItemBarChart(
    values: List<Float>,
    revealKey: Any?,
    modifier: Modifier = Modifier,
    selected: Int? = null,
    onSelect: (Int) -> Unit = {},
) {
    val reveal = rememberRevealProgress(revealKey, durationMillis = 1_100, easing = Easings.linear)
    val latestSelect by rememberUpdatedState(onSelect)
    val latestSelected by rememberUpdatedState(selected)
    var dragIndex by remember { mutableStateOf<Int?>(null) }

    Canvas(
        modifier
            .fillMaxWidth()
            .height(96.dp)
            .pointerInput(values) {
                detectHorizontalDragGestures(
                    onDragStart = { offset ->
                        dragIndex = indexForX(offset.x, size.width, values.size)
                        dragIndex?.let { if (it != latestSelected) latestSelect(it) }
                    },
                    onDragEnd = { dragIndex = null },
                ) { change, _ ->
                    val i = indexForX(change.position.x, size.width, values.size)
                    if (i != null && i != latestSelected) latestSelect(i)
                }
            }
            .semantics { contentDescription = "Series of ${values.size} items" },
    ) {
        val n = values.size
        if (n == 0) return@Canvas
        val maxV = values.max().coerceAtLeast(0.0001f)
        val gap = BarGapDp.dp.toPx()
        val barWidth = (size.width - gap * (n - 1)) / n
        val corner = CornerRadius(barWidth / 2.2f)

        values.forEachIndexed { i, v ->
            // Each bar's own share of the linear reveal, eased once — not twice.
            val barProgress = Easings.emphasizedDecelerate
                .transform(((reveal.value * (n + 3) - i) / 3f).coerceIn(0f, 1f))
            val h = (v / maxV * size.height * barProgress)
                .coerceAtLeast(if (v > 0f) MinBarDp.dp.toPx() else 0f)
            val x = i * (barWidth + gap)
            val isSelected = i == selected
            val alpha = when {
                selected == null -> 1f
                isSelected -> 1f
                else -> 0.38f
            }
            drawRoundRect(
                color = androidx.compose.ui.graphics.Color.White.copy(alpha = alpha),
                topLeft = Offset(x, size.height - h),
                size = Size(barWidth, h),
                cornerRadius = corner,
            )
            if (isSelected) {
                drawRoundRect(
                    color = androidx.compose.ui.graphics.Color.White,
                    topLeft = Offset(x - HaloDp.dp.toPx(), size.height - h - HaloDp.dp.toPx()),
                    size = Size(barWidth + HaloDp.dp.toPx() * 2, h + HaloDp.dp.toPx() * 2),
                    cornerRadius = corner,
                    style = Stroke(width = 1.dp.toPx()),
                )
            }
        }
    }
}

private fun indexForX(x: Float, width: Float, count: Int): Int? {
    if (count == 0 || width <= 0f) return null
    return (x / width * count).toInt().coerceIn(0, count - 1)
}

/**
 * A continuous line, built once per size/data in [drawWithCache] rather than per frame.
 * The partial-fill gradient brush is a single allocation; only its alpha changes as the
 * draw-in progresses, which is the fix for a kit that rebuilt the brush on every frame of a
 * 1,300 ms reveal and paid for it in GPU time.
 */
@Composable
fun ItemLineChart(
    values: List<Float>,
    revealKey: Any?,
    modifier: Modifier = Modifier,
) {
    val reveal = rememberRevealProgress(revealKey, durationMillis = 1_300, easing = Easings.linear)
    val measure = remember { PathMeasure() }
    val headPath = remember { Path() }

    Canvas(
        modifier
            .fillMaxWidth()
            .height(120.dp)
            .drawWithCache {
                // Built once per size + values: control points sit at 0.42 of the gap between
                // points, 18% head-room keeps a peak off the top edge, and a grid sits at
                // 0 / .5 / 1. The area-fill brush is allocated here, once — not inside the
                // draw block, where it would be rebuilt on every frame of the draw-in.
                val maxV = values.maxOrNull()?.coerceAtLeast(0.0001f) ?: 1f
                val headRoom = size.height * 0.18f
                val usable = size.height - headRoom
                val stepX = if (values.size > 1) size.width / (values.size - 1) else 0f

                fun yFor(v: Float) = headRoom + usable - (v / maxV) * usable

                val line = Path()
                var prevX = 0f
                var prevY = if (values.isNotEmpty()) yFor(values[0]) else 0f
                values.forEachIndexed { i, v ->
                    val x = i * stepX
                    val y = yFor(v)
                    if (i == 0) line.moveTo(x, y) else {
                        val ctrl = stepX * 0.42f
                        line.cubicTo(prevX + ctrl, prevY, x - ctrl, y, x, y)
                    }
                    prevX = x
                    prevY = y
                }
                val area = Path().apply {
                    addPath(line)
                    lineTo(size.width, size.height)
                    lineTo(0f, size.height)
                    close()
                }
                val fillBrush = Brush.verticalGradient(
                    0f to androidx.compose.ui.graphics.Color.White.copy(alpha = 0.22f),
                    1f to androidx.compose.ui.graphics.Color.White.copy(alpha = 0.02f),
                )

                measure.setPath(line, forceClosed = false)
                val total = measure.length

                onDrawBehind {
                    // The draw-in progress is read ONLY here: a repaint of this node, not a
                    // recomposition or a re-measure of the chart.
                    headPath.rewind()
                    measure.getSegment(0f, total * reveal.value, headPath, startWithMoveTo = true)

                    drawPath(area, brush = fillBrush, alpha = reveal.value)
                    drawPath(
                        headPath,
                        color = androidx.compose.ui.graphics.Color.White,
                        style = Stroke(width = 3.dp.toPx(), cap = androidx.compose.ui.graphics.StrokeCap.Round),
                    )
                }
            }
    ) {}
}

/**
 * A long series, bucketed down before it is drawn small. A hundred-odd raw points in a
 * thumb-sized box reads as a scribble, not a shape — averaging into a fixed bucket count gives
 * the eye a silhouette instead of noise.
 */
@Composable
fun ItemSparkline(
    series: List<Float>,
    modifier: Modifier = Modifier,
    buckets: Int = 12,
) {
    val bucketed = remember(series, buckets) { averageIntoBuckets(series, buckets) }
    Canvas(modifier.fillMaxWidth().height(28.dp)) {
        if (bucketed.isEmpty()) return@Canvas
        val maxV = bucketed.max().coerceAtLeast(0.0001f)
        val stepX = size.width / bucketed.size
        val path = Path()
        bucketed.forEachIndexed { i, v ->
            val x = (i + 0.5f) * stepX
            val y = size.height - (v / maxV) * size.height
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        drawPath(path, color = androidx.compose.ui.graphics.Color.White, style = Stroke(width = 2.dp.toPx()))
    }
}

private fun averageIntoBuckets(series: List<Float>, buckets: Int): List<Float> {
    if (series.isEmpty() || buckets <= 0) return emptyList()
    val perBucket = (series.size.toFloat() / buckets).coerceAtLeast(1f)
    return List(buckets) { b ->
        val from = (b * perBucket).toInt().coerceIn(0, series.size)
        val to = ((b + 1) * perBucket).toInt().coerceIn(from, series.size)
        if (from == to) 0f else series.subList(from, to).average().toFloat()
    }
}

/**
 * A 7-row × N-week grid, one cell per day, strength in [0, 1]. Geometry (cell rects) is built
 * once per size/data via [drawWithCache]; only the per-cell alpha depends on [strength].
 */
@Composable
fun ItemHeatmap(
    strengthByCell: List<Float>, // row-major, 7 * weeks entries
    weeks: Int,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier.fillMaxWidth().height(7 * 14.dp)) {
        val gap = 3.dp.toPx()
        val cellW = (size.width - gap * (weeks - 1)) / weeks
        val cellH = (size.height - gap * 6) / 7
        val corner = CornerRadius(cellH * 0.28f)
        for (week in 0 until weeks) {
            for (row in 0 until 7) {
                val index = row * weeks + week
                val strength = strengthByCell.getOrElse(index) { 0f }
                drawRoundRect(
                    color = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.3f + 0.7f * strength),
                    topLeft = Offset(week * (cellW + gap), row * (cellH + gap)),
                    size = Size(cellW, cellH),
                    cornerRadius = corner,
                )
            }
        }
    }
}

/**
 * Seven dots, one per day of the current week, lit for the days an item exists on. A small
 * sibling of the heatmap for a header row rather than a full grid.
 */
@Composable
fun ItemWeekDots(litDays: Set<Int>, modifier: Modifier = Modifier) {
    Canvas(modifier.fillMaxWidth().height(10.dp)) {
        val gap = 6.dp.toPx()
        val diameter = (size.width - gap * 6) / 7
        for (day in 0 until 7) {
            val lit = day in litDays
            drawCircle(
                color = androidx.compose.ui.graphics.Color.White.copy(alpha = if (lit) 1f else 0.25f),
                radius = diameter / 2,
                center = Offset(day * (diameter + gap) + diameter / 2, size.height / 2),
            )
        }
    }
}
