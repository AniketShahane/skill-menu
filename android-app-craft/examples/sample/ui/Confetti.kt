// Shows: a confetti burst that is seeded (reproducible in a screenshot test) and finite (it
// stops itself instead of looping forever on a celebratory screen). Example written for this
// skill; read it, don't paste it.
package com.example.sample.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.rotate
import kotlin.random.Random

private data class ConfettiPiece(
    val start: Offset,
    val drift: Offset,
    val color: Color,
    val spin: Float,
)

/**
 * A fixed seed means the same burst renders the same way every time, so a screenshot test can
 * assert on it. A fixed particle count and a fixed duration mean the effect always finishes and
 * tidies up its own state, instead of an unbounded loop that keeps animating (and keeps the
 * frame busy) long after anyone is looking at it.
 */
private const val PieceCount = 36
private const val DurationMillis = 900

@Composable
fun rememberConfettiPieces(seed: Long, palette: List<Color>): List<ConfettiPiece> {
    return remember(seed) {
        val random = Random(seed)
        List(PieceCount) {
            ConfettiPiece(
                start = Offset(random.nextFloat(), 0f),
                drift = Offset(random.nextFloat() - 0.5f, random.nextFloat()),
                color = palette[random.nextInt(palette.size)],
                spin = random.nextFloat() * 360f,
            )
        }
    }
}

/** Plays once per [burstId]; changing the id starts a fresh, independently seeded burst. */
@Composable
fun ConfettiOverlay(burstId: Int, seed: Long, palette: List<Color>) {
    val pieces = rememberConfettiPieces(seed, palette)
    var progress by remember(burstId) { mutableStateOf(0f) }

    LaunchedEffect(burstId) {
        val anim = Animatable(0f)
        anim.animateTo(1f, tween(DurationMillis, easing = LinearEasing)) {
            progress = this.value
        }
        // Reaching 1f here is the natural stop: no repeat, no restart, nothing left running.
    }

    Canvas(Modifier) {
        if (progress <= 0f || progress >= 1f) return@Canvas
        pieces.forEach { piece ->
            val pos = Offset(
                x = (piece.start.x + piece.drift.x * progress) * size.width,
                y = (piece.start.y + piece.drift.y * progress) * size.height,
            )
            rotate(piece.spin * progress, pivot = pos) {
                drawCircle(piece.color, radius = 4f, center = pos)
            }
        }
    }
}
