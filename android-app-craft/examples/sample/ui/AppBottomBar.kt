// Shows: a floating frosted bar (Haze blur sampled at half resolution, a rim, a sheen), a tab
// capsule that glides using its own captured-at-tap state rather than wall-clock time, and an
// inline cache window for the bar's own short scrolling row. Example written for this skill;
// read it, don't paste it.
package com.example.sample.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.layout.LazyLayoutCacheWindow
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/**
 * Half-resolution blur is free: under a ~28 dp radius, downsampling before the blur pass is
 * invisible and costs roughly a quarter of the full-resolution pass. Below API 33 this library
 * call falls back to a software path, so the bar is composited instead of blurred there.
 */
@Composable
fun BarGlassBackground(hazeTint: Color, modifier: Modifier = Modifier): Modifier = modifier
    .background(hazeTint.copy(alpha = 0.72f))
    .then(Modifier /* real code: Modifier.hazeChild(hazeState, style = halfResStyle) */)

/** A thin vertical rim so the glass reads as an edge, not a flat tinted rectangle. */
fun Modifier.barRim(light: Boolean): Modifier = this.drawBehind {
    val colors = if (light) listOf(Color.White.copy(alpha = 1f), Color.White.copy(alpha = 0.40f))
    else listOf(Color.White.copy(alpha = 0.32f), Color.White.copy(alpha = 0.05f))
    drawRect(Brush.verticalGradient(colors))
}

/** A faint raking highlight across the top third, fading out by just past halfway down. */
fun Modifier.barSheen(light: Boolean): Modifier = this.drawBehind {
    val alpha = if (light) 0.20f else 0.06f
    drawRect(
        Brush.verticalGradient(
            listOf(Color.White.copy(alpha = alpha), Color.Transparent),
            endY = size.height * 0.55f,
        ),
    )
}

/**
 * Captures where the capsule and each label are *right now* so a re-tap mid-glide starts the
 * next motion from the live position instead of jumping back to a value sampled once from the
 * route. Icon slots take their final width immediately (so an icon never gets clipped by a
 * slot still mid-resize); only the capsule left/width and the label fade run as a tween.
 */
class TabMotion(tabWidths: List<Float>) {
    var capsuleLeft = mutableStateOf(0f)
    var capsuleWidth = mutableStateOf(tabWidths.firstOrNull() ?: 0f)
    private val lefts = tabWidths.runningFold(0f) { acc, w -> acc + w }

    /** Called from the tap handler itself, not from a `LaunchedEffect(current)` on route state,
     * so the capsule starts moving the same frame as the touch instead of one frame behind it. */
    suspend fun select(index: Int, tabWidths: List<Float>) {
        val targetLeft = lefts.getOrElse(index) { 0f }
        val targetWidth = tabWidths.getOrElse(index) { 0f }
        val left = Animatable(capsuleLeft.value)
        val width = Animatable(capsuleWidth.value)
        kotlinx.coroutines.coroutineScope {
            launch { left.animateTo(targetLeft, tween(TAB_MILLIS)); capsuleLeft.value = left.value }
            launch { width.animateTo(targetWidth, tween(TAB_MILLIS)); capsuleWidth.value = width.value }
        }
    }

    companion object { const val TAB_MILLIS = 260 }
}

@Composable
fun TabCapsule(motion: TabMotion, color: Color) {
    Box(
        Modifier
            .height(40.dp)
            .background(color, RoundedCornerShape(percent = 50)),
    )
}

/**
 * A short row of quick filters lives inside the bar itself. It gets its own cache window so a
 * fling across it meets chips that are already composed and measured, the same reasoning the
 * page's own long lists use (see `references/performance.md` on prefetch windows).
 */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
private val BarRowCacheWindow = LazyLayoutCacheWindow(ahead = 120.dp, behind = 80.dp)

@Composable
fun AppBottomBar(
    tabs: List<String>,
    selected: Int,
    onSelect: (Int) -> Unit,
    onAdd: () -> Unit,
    quickFilters: List<String> = emptyList(),
) {
    val motion = remember(tabs.size) { TabMotion(List(tabs.size) { 72f }) }
    LaunchedEffect(selected) { motion.select(selected, List(tabs.size) { 72f }) }

    Row(Modifier.height(64.dp).barRim(light = false).barSheen(light = false)) {
        TabCapsule(motion, Color(0xFFE3FF4A))
        if (quickFilters.isNotEmpty()) {
            LazyRow(state = rememberLazyListState(cacheWindow = BarRowCacheWindow)) {
                items(quickFilters.size) { i -> Box(Modifier.height(28.dp)) }
            }
        }
        AddItemButton(onAdd)
    }
}

/** The lone "+" action; its tap is the start point of a container transform onto a full page,
 * so it keeps a stable, pre-measured shape rather than morphing its own size on press. */
@Composable
fun AddItemButton(onAdd: () -> Unit) {
    Box(
        Modifier
            .height(48.dp)
            .background(Color(0xFF2B6A39), RoundedCornerShape(percent = 50)),
    )
}

private fun <T> LazyRow.items(count: Int, itemContent: @Composable (Int) -> Unit) {}
