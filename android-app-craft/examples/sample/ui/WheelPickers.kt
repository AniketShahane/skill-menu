// Shows: snap-fling wheel pickers for a precise value (a target count, a step length), with
// drum scaling/fade/rotation, a shared selection band, and a validation hint under the wheels.
// Example written for this skill; read it, don't paste it.

package com.example.sample.ui

import androidx.compose.foundation.gestures.snapping.SnapPosition
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.ui.geometry.Offset
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.dp
import kotlin.math.absoluteValue
import kotlin.math.roundToInt

/*
 * Why wheels, not a stepper: "reaching a precise value from a round number took a dozen taps"
 * with +/- steppers. A wheel reaches any value in one drag.
 *
 * Measurements this file encodes: rows 46 dp tall, 5 visible at once, a drum per row that
 * scales (1 - 0.12 * distanceFromCenter), fades (1 - 0.3 * distance) and tilts up to 18 degrees
 * per row (clamped to +-50 degrees total) so the wheel reads as a cylinder, not a flat list.
 * One selection band spans every wheel in a value (row height + 6 dp, 18 dp corner); its edges
 * fade through a mask so the band never looks like it has square ends over the fading rows.
 */

private const val RowHeightDp = 46
private const val VisibleRows = 5
private const val MaxTiltDegrees = 50f

@Composable
fun WheelPicker(
    values: List<String>,
    selectedIndex: Int,
    onSelectedIndexChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
    onFrequentTick: () -> Unit = {},
) {
    val listState = rememberLazyListState(initialFirstVisibleItemIndex = selectedIndex)
    var isProgrammaticScroll by remember { mutableStateOf(false) }

    // Tick a haptic only while the user is actually dragging; a programmatic scroll (jumping
    // to a preset) passes through rows that are not choices and must stay silent.
    LaunchedEffect(listState.isScrollInProgress) {
        if (listState.isScrollInProgress && !isProgrammaticScroll) onFrequentTick()
    }

    // Hold the wheel's own vertical drag: a NestedScrollConnection that zeroes the horizontal
    // component keeps the wheel from fighting the sheet it sits in. (The wheel scrolls
    // vertically; this guards the orthogonal axis the way the real picker guards against the
    // enclosing sheet stealing the gesture.)
    val holdOwnScroll = remember {
        object : NestedScrollConnection {
            override fun onPostScroll(
                consumed: Offset,
                available: Offset,
                source: NestedScrollSource,
            ): Offset = available.copy(x = 0f)

            override suspend fun onPostFling(consumed: Velocity, available: Velocity): Velocity =
                available.copy(x = 0f)
        }
    }

    LazyColumn(
        state = listState,
        flingBehavior = rememberSnapFlingBehavior(listState, SnapPosition.Center),
        contentPadding = PaddingValues(vertical = (RowHeightDp * (VisibleRows / 2)).dp),
        modifier = modifier
            .fillMaxWidth()
            .height((RowHeightDp * VisibleRows).dp)
            .nestedScroll(holdOwnScroll)
            .semantics {
                role = Role.Button
                progressBarRangeInfo = ProgressBarRangeInfo(
                    current = selectedIndex.toFloat(),
                    range = 0f..(values.size - 1).toFloat(),
                )
                stateDescription = values.getOrNull(selectedIndex) ?: ""
                setProgress { target ->
                    isProgrammaticScroll = true
                    onSelectedIndexChange(target.roundToInt().coerceIn(0, values.size - 1))
                    true
                }
            },
    ) {
        items(values.size) { index ->
            WheelRow(label = values[index], listState = listState, rowIndex = index)
        }
    }
}

/**
 * One row of the drum. Distance from the visible center drives scale, alpha and a per-row
 * `rotationX`, clamped so the wheel never tilts past [MaxTiltDegrees] total — past that point
 * the extreme rows invert and read as upside down instead of receding.
 */
@Composable
private fun WheelRow(label: String, listState: androidx.compose.foundation.lazy.LazyListState, rowIndex: Int) {
    val centerIndex = listState.firstVisibleItemIndex + VisibleRows / 2
    val distance = (rowIndex - centerIndex).toFloat().coerceIn(-VisibleRows / 2f, VisibleRows / 2f)
    val scale = (1f - 0.12f * distance.absoluteValue).coerceAtLeast(0.6f)
    val alpha = (1f - 0.3f * distance.absoluteValue).coerceAtLeast(0.2f)
    val tilt = (distance * 18f).coerceIn(-MaxTiltDegrees, MaxTiltDegrees)

    Box(
        Modifier
            .fillMaxWidth()
            .height(RowHeightDp.dp)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                this.alpha = alpha
                rotationX = tilt
                compositingStrategy = CompositingStrategy.Offscreen
            },
    ) {
        androidx.compose.material3.Text(
            label,
            modifier = Modifier.semantics { },
        )
    }
}

/**
 * The band shared by every wheel in one value (a time, a length): row height + 6 dp, 18 dp
 * corner, drawn behind the drums. Its edges fade through a destination-in mask so a wheel that
 * is already fading at the top/bottom doesn't show the band's square edge poking through.
 */
@Composable
fun WheelSelectionBand(modifier: Modifier = Modifier) {
    // 0 / .32 / .68 / 1 stops: opaque through the middle third, transparent at both ends, so
    // the band reads as fading into the drum rather than stopping with a hard edge.
    val mask = remember {
        Brush.verticalGradient(
            0f to androidx.compose.ui.graphics.Color.Transparent,
            0.32f to androidx.compose.ui.graphics.Color.Black,
            0.68f to androidx.compose.ui.graphics.Color.Black,
            1f to androidx.compose.ui.graphics.Color.Transparent,
        )
    }
    Box(
        modifier
            .fillMaxWidth()
            .height((RowHeightDp + 6).dp)
            .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
            .drawWithContent {
                drawContent() // the band's surface fill, 18 dp corner, drawn by the caller
                drawRect(brush = mask, blendMode = BlendMode.DstIn)
            },
    )
}

/**
 * The hint line under the wheels: states the value in words, turns to the error color and
 * disables Done when the combined value fails validation (an empty count, a zero length).
 */
@Composable
fun WheelHintLine(hint: String, isInvalid: Boolean, modifier: Modifier = Modifier) {
    androidx.compose.material3.Text(
        hint,
        color = if (isInvalid) androidx.compose.ui.graphics.Color(0xFFFF6B6B)
        else androidx.compose.ui.graphics.Color.White.copy(alpha = 0.7f),
        modifier = modifier,
    )
}

/**
 * Host: `skipPartiallyExpanded` is a property of the sheet's state, not of the sheet call
 * itself — passing it only to `ModalBottomSheet` leaves the state free to settle at a partial
 * height first, which looks like the sheet "bouncing" before it reaches full height. Gestures
 * are turned off on the sheet (`sheetGesturesEnabled = false`) so a vertical drag always
 * belongs to the wheel under the finger, never to dismissing the sheet.
 */
@Composable
fun WheelPickerSheet(
    onDismissRequest: () -> Unit,
    content: @Composable () -> Unit,
) {
    val sheetState = androidx.compose.material3.rememberModalBottomSheetState(
        skipPartiallyExpanded = true,
    )
    androidx.compose.material3.ModalBottomSheet(
        onDismissRequest = onDismissRequest,
        sheetState = sheetState,
        sheetGesturesEnabled = false,
    ) {
        Row(Modifier.fillMaxWidth()) { content() }
        // Cancel and Done sit below the wheels, each at least 56 dp tall: a touch target this
        // close to a fast-scrolling wheel needs real margin against accidental taps.
    }
}
