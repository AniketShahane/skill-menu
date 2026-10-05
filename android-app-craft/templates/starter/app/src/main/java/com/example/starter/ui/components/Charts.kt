package com.example.starter.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Spacer
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.example.starter.R
import com.example.starter.ui.motion.Easings
import com.example.starter.ui.motion.rememberRevealProgress
import com.example.starter.ui.theme.AppTheme
import kotlin.math.max

/*
 * The chart kit's rules (dash:ui/charts/DashCharts.kt):
 * - Values arrive in display units, and higher is better. Flip anything where lower is
 *   better (a pace, a time) before charting, and caption the axis ("Faster ↑").
 * - The entrance progress is read ONLY inside the draw scope, so a draw-in repaints one node
 *   and never recomposes or re-measures.
 * - Geometry is built once per size and data set in `drawWithCache`; a frame only reads it.
 * - Selection ticks a haptic when the index changes, never on every pointer event.
 * - Every chart states what it shows in one content description.
 */

/**
 * Bars that grow from the baseline one after another. [selected] is the bar the user is
 * reading; the others dim. With nothing selected every bar is at full strength.
 *
 * The reveal runs linear and each bar eases its own share of it once. Dash eased the progress
 * and then eased each bar's share again, which compounds into a slow start (dash:DashCharts.kt:66,96-97).
 */
@Composable
fun BarChart(
    values: List<Float>,
    revealKey: Any?,
    modifier: Modifier = Modifier,
    selected: Int? = null,
    onSelect: (Int) -> Unit = {},
) {
    val colors = AppTheme.colors
    val reveal = rememberRevealProgress(revealKey, durationMillis = 1_100, easing = LinearEasing)
    val haptics = rememberAppHaptics()
    val maximum = remember(values) { max(values.maxOrNull() ?: 0f, 0.001f) }
    // A pointerInput block keyed on the data keeps running across recompositions, so it must
    // read the selection through State. Dash compared against the `selected` it captured when
    // the gesture began, which after the first move is stale (dash:DashCharts.kt:78-83).
    val currentSelected = rememberUpdatedState(selected)
    val currentOnSelect = rememberUpdatedState(onSelect)
    val description = pluralStringResource(R.plurals.chart_bars_description, values.size, values.size)
    val color = colors.primary
    val dim = color.copy(alpha = .38f)
    val track = colors.onSurfaceDim.copy(alpha = .12f)
    val pick: (Float, Int) -> Unit = { x, width ->
        val index = (x / width * values.size).toInt().coerceIn(0, values.lastIndex)
        if (index != currentSelected.value) {
            haptics.scrub()
            currentOnSelect.value(index)
        }
    }
    Spacer(
        modifier
            .semantics { contentDescription = description }
            .then(
                if (values.isEmpty()) {
                    Modifier
                } else {
                    Modifier
                        .pointerInput(values) { detectTapGestures { pick(it.x, size.width) } }
                        .pointerInput(values) {
                            detectHorizontalDragGestures { change, _ ->
                                change.consume()
                                pick(change.position.x, size.width)
                            }
                        }
                },
            )
            .drawWithCache {
                val count = values.size.coerceAtLeast(1)
                val gap = 5.dp.toPx()
                val slot = size.width / count
                val barWidth = (slot - gap).coerceAtLeast(2f)
                val radius = CornerRadius(barWidth / 2.2f)
                val minBar = 3.dp.toPx()
                val haloPad = 2.dp.toPx()
                val halo = Stroke(1.5.dp.toPx())
                val haloRadius = CornerRadius(radius.x + haloPad)
                onDrawBehind {
                    val progress = reveal.value
                    val chosen = currentSelected.value
                    for (index in values.indices) {
                        val value = values[index]
                        val left = index * slot + gap / 2
                        drawRoundRect(track, Offset(left, 0f), Size(barWidth, size.height), radius)
                        // Bar i starts once the reveal passes i/(n+3) and takes 3/(n+3) of it.
                        val share = ((progress * (count + 3) - index) / 3f).coerceIn(0f, 1f)
                        val eased = Easings.Arrive.transform(share)
                        val fraction = (value / maximum).coerceIn(0f, 1f) * eased
                        val height = (size.height * fraction).coerceAtLeast(if (value > 0f) minBar * eased else 0f)
                        if (height <= 0f) continue
                        val fill = if (chosen == null || index == chosen) color else dim
                        drawRoundRect(fill, Offset(left, size.height - height), Size(barWidth, height), radius)
                        if (index == chosen) {
                            drawRoundRect(
                                color.copy(alpha = .28f),
                                Offset(left - haloPad, size.height - height - haloPad),
                                Size(barWidth + haloPad * 2, height + haloPad * 2),
                                haloRadius,
                                style = halo,
                            )
                        }
                    }
                }
            },
    )
}

/**
 * A smooth line that draws itself in, with an area fill under it. The path, its area and its
 * measure are built once per size; each frame takes a segment with `getSegment` and rewinds
 * two scratch paths. The fill brush is built once too and faded with `alpha` while drawing
 * in (Dash built a new gradient per frame here, dash:DashCharts.kt:212).
 */
@Composable
fun LineChart(
    values: List<Float>,
    revealKey: Any?,
    modifier: Modifier = Modifier,
    selected: Int? = null,
    onSelect: (Int) -> Unit = {},
) {
    val colors = AppTheme.colors
    val reveal = rememberRevealProgress(revealKey, durationMillis = 1_300)
    val haptics = rememberAppHaptics()
    val currentSelected = rememberUpdatedState(selected)
    val currentOnSelect = rememberUpdatedState(onSelect)
    val description = pluralStringResource(R.plurals.chart_line_description, values.size, values.size)
    // 18 % head-room above and below, so the line never touches the frame.
    val range = remember(values) {
        val low = values.minOrNull() ?: 0f
        val high = values.maxOrNull() ?: 1f
        val pad = max((high - low) * .18f, .001f)
        (low - pad) to (high + pad)
    }
    val color = colors.primary
    val grid = colors.onSurfaceDim.copy(alpha = .16f)
    val pick: (Float, Int) -> Unit = { x, width ->
        val index = nearest(x, width, values.size)
        if (index != currentSelected.value) {
            haptics.scrub()
            currentOnSelect.value(index)
        }
    }
    Spacer(
        modifier
            .semantics { contentDescription = description }
            .then(
                if (values.isEmpty()) {
                    Modifier
                } else {
                    Modifier
                        .pointerInput(values) { detectTapGestures { pick(it.x, size.width) } }
                        .pointerInput(values) {
                            detectHorizontalDragGestures { change, _ ->
                                change.consume()
                                pick(change.position.x, size.width)
                            }
                        }
                },
            )
            .drawWithCache {
                val inset = 8.dp.toPx()
                val plot = Size(size.width - inset * 2, size.height - inset * 2)
                val floor = size.height - inset
                val points = List(values.size) { index ->
                    val x = inset + if (values.size == 1) plot.width / 2 else plot.width * index / (values.size - 1)
                    val f = ((values[index] - range.first) / (range.second - range.first)).coerceIn(0f, 1f)
                    Offset(x, inset + plot.height * (1f - f))
                }
                val line = Path()
                val area = Path()
                points.forEachIndexed { index, p ->
                    if (index == 0) {
                        line.moveTo(p.x, p.y)
                        area.moveTo(p.x, floor)
                        area.lineTo(p.x, p.y)
                    } else {
                        val previous = points[index - 1]
                        // Control points at 0.42 of the gap: smooth without overshooting a peak.
                        val c = (p.x - previous.x) * .42f
                        line.cubicTo(previous.x + c, previous.y, p.x - c, p.y, p.x, p.y)
                        area.cubicTo(previous.x + c, previous.y, p.x - c, p.y, p.x, p.y)
                    }
                }
                points.lastOrNull()?.let { area.lineTo(it.x, floor); area.close() }
                val measure = PathMeasure().apply { setPath(line, false) }
                val length = measure.length
                val shown = Path()
                val partial = Path()
                val fill = Brush.verticalGradient(listOf(color.copy(alpha = .22f), color.copy(alpha = .02f)))
                val stroke = Stroke(3.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                val gridStroke = 1.dp.toPx()
                val headHalo = 9.dp.toPx()
                val head = 4.dp.toPx()
                onDrawBehind {
                    if (points.isEmpty()) return@onDrawBehind
                    for (f in GridLines) {
                        val y = inset + plot.height * f
                        drawLine(grid, Offset(inset, y), Offset(size.width - inset, y), gridStroke)
                    }
                    val progress = reveal.value
                    if (progress >= 1f) {
                        drawPath(area, fill)
                        drawPath(line, color, style = stroke)
                    } else {
                        shown.rewind()
                        measure.getSegment(0f, length * progress, shown, true)
                        val tip = measure.getPosition(length * progress)
                        partial.rewind()
                        partial.addPath(shown)
                        partial.lineTo(tip.x, floor)
                        partial.lineTo(points.first().x, floor)
                        partial.close()
                        drawPath(partial, fill, alpha = progress)
                        drawPath(shown, color, style = stroke)
                        drawCircle(color.copy(alpha = .35f), headHalo, tip)
                        drawCircle(color, head, tip)
                    }
                    currentSelected.value?.let { index ->
                        val p = points.getOrNull(index) ?: return@let
                        drawLine(grid, Offset(p.x, inset), Offset(p.x, floor), gridStroke)
                        drawCircle(color.copy(alpha = .25f), 10.dp.toPx(), p)
                        drawCircle(color, 5.dp.toPx(), p)
                    }
                }
            },
    )
}

private val GridLines = floatArrayOf(0f, .5f, 1f)

private fun nearest(x: Float, width: Int, count: Int): Int {
    if (count <= 1) return 0
    val fraction = (x / width.coerceAtLeast(1)).coerceIn(0f, 1f)
    return (fraction * (count - 1) + .5f).toInt().coerceIn(0, count - 1)
}

/**
 * [values] averaged into at most [count] near-equal runs; shorter lists come back unchanged.
 * Forty points in a thumb-sized sparkline is a scribble; its shape survives averaging
 * (dash:DashCharts.kt:240,263-271).
 */
internal fun condensed(values: List<Float>, count: Int): List<Float> {
    if (values.size <= count) return values
    return List(count) { bucket ->
        val from = values.size * bucket / count
        val to = values.size * (bucket + 1) / count
        values.subList(from, to).average().toFloat()
    }
}
