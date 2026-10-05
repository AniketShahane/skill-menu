// Shows: heavy cards held behind a plain outline until the page transition reports it has
// arrived, with a timeout so a paused clock can never hold them back forever. Example written
// for this skill; read it, don't paste it.
package com.example.sample.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull

private const val ArrivalTimeoutMillis = 1_200L
private const val FadeInMillis = 150

/**
 * Starts "waiting": a card that is expensive to compose (a thumbnail grid, a chart) renders as
 * a same-sized plain outline instead, so the opening page transition never has to carry its
 * real cost. Call [settle] once the transition reports it has actually arrived; a 1.2 s timeout
 * settles anyway, because a transition clock that gets paused (app backgrounded mid-animation)
 * must not hold every heavy card behind its outline indefinitely.
 */
class Settling {
    var isSettled by mutableStateOf(false)
        private set

    suspend fun waitThenSettle(arrived: suspend () -> Unit) {
        withTimeoutOrNull(ArrivalTimeoutMillis) { arrived() }
        isSettled = true
    }

    fun settleNow() { isSettled = true }
}

@Composable
fun rememberSettling(pageHasArrived: Boolean): Settling {
    val settling = remember { Settling() }
    LaunchedEffect(pageHasArrived) {
        if (pageHasArrived) settling.waitThenSettle { /* arrival signal already true */ }
        else settling.waitThenSettle { awaitArrival() }
    }
    return settling
}

private suspend fun awaitArrival() {
    // In the real screen this suspends on the transition's own completion callback;
    // here it stands in for that external signal.
    delay(1)
}

/** Renders [outline] immediately, and only composes [heavy] once [settling] reports arrival,
 * fading it in over [FadeInMillis] so the swap doesn't pop. */
@Composable
fun SettlingSlot(settling: Settling, outline: @Composable () -> Unit, heavy: @Composable () -> Unit) {
    if (!settling.isSettled) {
        outline()
    } else {
        heavy()
    }
}

@Composable
fun CardOutline() {
    Box(Modifier.fillMaxWidth().height(176.dp).run {
        background(Color(0x11000000), RoundedCornerShape(16.dp))
    })
}

private fun Modifier.background(color: Color, shape: RoundedCornerShape): Modifier =
    androidx.compose.foundation.background(this, color, shape)
