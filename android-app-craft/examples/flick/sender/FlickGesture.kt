package com.flick.sender.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.unit.dp
import com.flick.sender.ui.theme.FlickColors
import com.flick.sender.ui.theme.LocalFlickColors
import com.flick.sender.ui.theme.rememberIsResumed
import com.flick.sender.ui.theme.rememberReduceMotion
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin
import kotlinx.coroutines.delay

/**
 * The flick itself, drawn: a thumb winds back against a small deck of cards, snaps
 * through it, and the top card leaves up-and-right trailing three speed bars in the accent
 * — amber on the light palette, the brand blue on the dark one, following [FlickMark].
 *
 * It is [FlickMark] in motion and deliberately not a second mark — the mark is a play
 * triangle leaving three streaks at 0.45 / 0.75 / 0.45, and the card that flies here
 * carries that triangle and lays down those same three bars at those same weights. The
 * receiver is not drawn: the CTA directly beneath this strip already names the TV, and a
 * TV glyph here would say it twice.
 *
 * Nothing here is content. The composable publishes no semantics of its own — a [Canvas]
 * is a Spacer with a draw block — so it is invisible to TalkBack and cannot take focus,
 * which is what `contentDescription = null` amounts to for a component with no node.
 *
 * The whole scene is one linear 0..1 clock read inside the draw block: a frame of this
 * loop costs a repaint of one Canvas and nothing above it. Every beat below derives its
 * own local progress from that clock, so there is exactly one animation running.
 *
 * The scene is NOT mirrored in RTL. The flying card carries the play triangle, which is a
 * transport symbol and is never mirrored; flipping the scene would flip that with it.
 */
@Composable
fun FlickGesture(modifier: Modifier = Modifier) {
    val colors = LocalFlickColors.current
    val reduceMotion = rememberReduceMotion()
    // A loop has no end state to arrive at, and this sheet stays composed behind a cast
    // that runs for hours. Gated on both, as Motion.rememberIsResumed's own note requires:
    // reduce-motion holds the rest frame for good, a paused window holds it until it is
    // looked at again.
    val resumed = rememberIsResumed()
    val running = !reduceMotion && resumed
    val phase = remember { Animatable(0f) }
    LaunchedEffect(running) {
        if (!running) {
            // Parked at the rest frame rather than wherever the loop was cut, so the first
            // frame back is the pose the gesture begins from instead of a mid-flick freeze.
            phase.snapTo(0f)
            return@LaunchedEffect
        }
        // The poster is still flying in from the Library over the top of this sheet when
        // the route opens. Two arrivals at once read as neither, so the gesture waits out
        // the hero landing before its first cycle.
        delay(EntranceHoldMs)
        while (true) {
            phase.snapTo(0f)
            phase.animateTo(1f, CycleSpec)
        }
    }
    // Constant in scene units, so it is built once rather than per frame; the transform
    // stack puts it on each of the three cards.
    val glyph = remember { playGlyph() }
    Canvas(
        modifier
            .fillMaxWidth()
            .height(GestureHeight)
            // The thumb's base runs off the bottom-left corner — it is a hand entering
            // frame, not a shape floating in a box — and a draw scope is not clipped to
            // its own bounds by default.
            .clipToBounds(),
    ) {
        val unit = size.height / SceneUnits
        if (unit <= 0f) return@Canvas
        val widthUnits = size.width / unit
        val seatX = max(widthUnits * SeatFraction, SeatMinX)
        // Measured off the surface rather than fixed, so the card leaves the strip on a
        // wide window instead of stopping in the middle of it — and is capped, so on a
        // tablet it does not cross 400 dp in 420 ms.
        val flight = (widthUnits - seatX - CardW / 2f - FlightMargin)
            .coerceIn(FlightMin, FlightMax)
        val ms = phase.value * FlickCycleMs
        withTransform({ scale(unit, unit, Offset.Zero) }) {
            drawFlickScene(ms, colors, glyph, seatX, flight)
        }
    }
}

/** One frame of the gesture, in scene units. */
private fun DrawScope.drawFlickScene(
    ms: Float,
    colors: FlickColors,
    glyph: Path,
    seatX: Float,
    flight: Float,
) {
    // The wake is laid down behind everything: the bars are stamped at the seat the card
    // just left, so they have to be uncovered by it rather than painted over it.
    for (index in 0..2) {
        val life = barLife(ms, index)
        val alpha = barAlpha(life)
        if (alpha <= AlphaFloor) continue
        val middle = index == 0
        val length = (if (middle) BarMidLen else BarOuterLen) * barLength(life)
        val rightX = seatX + (if (middle) BarMidEnd else BarOuterEnd) + BarDrift * life
        val row = SeatY + when (index) {
            1 -> -BarRowGap
            2 -> BarRowGap
            else -> 0f
        }
        drawSpeedBar(
            rightX = rightX,
            centerY = row,
            length = length,
            color = colors.spark,
            alpha = alpha * (if (middle) BarMidAlpha else BarOuterAlpha),
        )
    }

    // The deck, back to front. The three roles rotate on the loop point: the card that
    // flies away this cycle is the one that faded in at the back of the deck last cycle,
    // which is why the strip never has to reset visibly.
    drawDeckCard(
        cx = seatX + DeckDx,
        cy = SeatY + DeckDy,
        alpha = dealAlpha(ms),
        colors = colors,
        glyph = glyph,
    )
    val rise = riserProgress(ms)
    drawDeckCard(
        cx = seatX + DeckDx * (1f - rise),
        cy = SeatY + DeckDy * (1f - rise),
        alpha = riserAlpha(ms),
        colors = colors,
        glyph = glyph,
    )
    val squash = cardSquash(ms)
    val flightAt = flightProgress(ms)
    val away = 1f + (FlightShrink - 1f) * flightAt
    drawDeckCard(
        cx = seatX + flight * flightAt - WindShove * max(0f, -squash),
        cy = SeatY - LiftUnits * liftProgress(ms),
        alpha = flyerAlpha(ms),
        colors = colors,
        glyph = glyph,
        scaleX = away * (1f + SquashX * squash),
        scaleY = away * (1f - SquashY * squash),
        rotationDeg = FlightTiltDeg * flightAt + WindTiltDeg * max(0f, -squash),
    )

    val travel = thumbTravel(ms)
    drawThumb(
        tipX = seatX + TipDx + travel * AxisCos,
        tipY = SeatY + TipDy + travel * AxisSin - ThumbArc * arcBow(travel),
        angleDeg = thumbAngle(travel),
        colors = colors,
    )
}

/**
 * A card of the deck. All three take the action role and differ only in opacity: the
 * deck is one card seen three times, not three kinds of card.
 */
private fun DrawScope.drawDeckCard(
    cx: Float,
    cy: Float,
    alpha: Float,
    colors: FlickColors,
    glyph: Path,
    scaleX: Float = 1f,
    scaleY: Float = 1f,
    rotationDeg: Float = 0f,
) {
    if (alpha <= AlphaFloor) return
    withTransform({
        translate(cx, cy)
        rotate(rotationDeg, Offset.Zero)
        scale(scaleX, scaleY, Offset.Zero)
    }) {
        drawRoundRect(
            color = colors.primary,
            topLeft = Offset(-CardW / 2f, -CardH / 2f),
            size = Size(CardW, CardH),
            cornerRadius = CornerRadius(CardRadius, CardRadius),
            alpha = alpha,
        )
        // Fill plus a matching round-join stroke, which is how FlickMark rounds the same
        // triangle; the stroke rides half its width outside the path.
        drawPath(glyph, color = colors.onPrimary, alpha = alpha)
        drawPath(glyph, color = colors.onPrimary, alpha = alpha, style = GlyphStroke)
    }
}

/**
 * The distal segment of a thumb, entering from the lower left: one capsule cut off by the
 * strip's own edges, with a nail plate near the tip. The hand is never drawn — past the
 * first joint it would be a hand holding nothing, in a strip 48 dp tall.
 */
private fun DrawScope.drawThumb(tipX: Float, tipY: Float, angleDeg: Float, colors: FlickColors) {
    withTransform({
        translate(tipX, tipY)
        rotate(angleDeg, Offset.Zero)
    }) {
        val body = Offset(-ThumbLen, -ThumbHalfW)
        val span = Size(ThumbLen, ThumbHalfW * 2f)
        val cap = CornerRadius(ThumbHalfW, ThumbHalfW)
        // The translucent fills rather than an ink silhouette: the thumb crosses the card
        // it is pushing, and a solid one would black out the thing the gesture is about.
        drawRoundRect(color = colors.fillControl, topLeft = body, size = span, cornerRadius = cap)
        drawRoundRect(
            color = colors.outlineSoft,
            topLeft = body,
            size = span,
            cornerRadius = cap,
            style = ThumbRim,
        )
        drawRoundRect(
            color = colors.fillCard,
            topLeft = Offset(-NailInset - NailLen, -ThumbHalfW + NailInset),
            size = Size(NailLen, (ThumbHalfW - NailInset) * 2f),
            cornerRadius = CornerRadius(NailRadius, NailRadius),
        )
    }
}

private fun DrawScope.drawSpeedBar(
    rightX: Float,
    centerY: Float,
    length: Float,
    color: Color,
    alpha: Float,
) {
    if (length <= LengthFloor) return
    drawRoundRect(
        color = color,
        topLeft = Offset(rightX - length, centerY - BarH / 2f),
        size = Size(length, BarH),
        cornerRadius = CornerRadius(BarH / 2f, BarH / 2f),
        alpha = alpha,
    )
}

private fun playGlyph(): Path = Path().apply {
    moveTo(-GlyphBack, -GlyphHalfH)
    lineTo(GlyphTip, 0f)
    lineTo(-GlyphBack, GlyphHalfH)
    close()
}

// --- the timeline -----------------------------------------------------------------
//
// Every beat is stated as an absolute window on the cycle clock rather than as a
// duration chained off the last one, so a beat can be retimed without shifting the four
// that follow it. docs/flick-gesture-motion.md is the same table in prose and has to move
// with these numbers.

/** One full gesture, rest to rest. */
internal const val FlickCycleMs = 2400

private const val WindFrom = 300
private const val WindTo = 540
private const val StrikeFrom = 580
private const val StrikeTo = 880
private const val RecoverFrom = 880
private const val RecoverTo = 1240
private const val FlightFrom = 620
private const val FlightTo = 1040
private const val FadeFrom = 880
private const val FadeTo = 1040
private const val RiseFrom = 860
private const val RiseTo = 1140
private const val DealFrom = 1140
private const val DealTo = 1340
private const val SquashHoldTo = 620
private const val SnapTo = 700
private const val UnsquashTo = 900
private const val BarFirstMs = 650
private const val BarStepMs = 50
private const val BarLifeMs = 240

/** Loaded and released. A flick breaks hard and glides; nothing here is a spring. */
private val Wind = CubicBezierEasing(0.2f, 0f, 0.1f, 1f)
private val Release = CubicBezierEasing(0.12f, 0.62f, 0.24f, 1f)
private val Recover = CubicBezierEasing(0.4f, 0f, 0.2f, 1f)
private val Lift = CubicBezierEasing(0.05f, 0.8f, 0.3f, 1f)
private val Fade = CubicBezierEasing(0.4f, 0f, 1f, 1f)

/** The clock itself is linear: every shape below carries its own curve. */
private val CycleSpec = tween<Float>(durationMillis = FlickCycleMs, easing = LinearEasing)

/**
 * Where a beat that runs [fromMs]..[toMs] has got to at [ms], clamped at both ends. A
 * zero-length window is already over — the alternative is a division by zero on a beat
 * somebody retimed to nothing.
 */
internal fun flickBeat(ms: Float, fromMs: Int, toMs: Int): Float {
    if (toMs <= fromMs) return if (ms >= fromMs) 1f else 0f
    return ((ms - fromMs) / (toMs - fromMs)).coerceIn(0f, 1f)
}

/**
 * How far the thumb tip is along its own axis: negative wound back, positive followed
 * through, zero at rest. Continuous across all three branches, and back to zero by
 * [RecoverTo] so the cycle's last second is genuinely still.
 */
internal fun thumbTravel(ms: Float): Float = when {
    ms < StrikeFrom -> -PullBack * Wind.transform(flickBeat(ms, WindFrom, WindTo))
    ms < RecoverFrom -> {
        val strike = Release.transform(flickBeat(ms, StrikeFrom, StrikeTo))
        -PullBack + (Reach + PullBack) * strike
    }
    else -> Reach * (1f - Recover.transform(flickBeat(ms, RecoverFrom, RecoverTo)))
}

/** The wrist: laid back while loading, rolled through on the strike. */
internal fun thumbAngle(travel: Float): Float = if (travel < 0f) {
    RestAngleDeg + WindDeg * (travel / -PullBack)
} else {
    RestAngleDeg - SnapDeg * (travel / Reach)
}

/**
 * The bow the tip travels above the straight line between its two ends — zero at both, so
 * the strike is an arc and the rest pose is not displaced by it.
 */
internal fun arcBow(travel: Float): Float =
    sin(PI * (travel / Reach).coerceIn(0f, 1f).toDouble()).toFloat()

/** -1 fully compressed against the loaded thumb, +1 stretched along the release, 0 at rest. */
internal fun cardSquash(ms: Float): Float = when {
    ms < SquashHoldTo -> -Wind.transform(flickBeat(ms, WindFrom, WindTo))
    ms < SnapTo -> -1f + 2f * Release.transform(flickBeat(ms, SquashHoldTo, SnapTo))
    else -> 1f - Recover.transform(flickBeat(ms, SnapTo, UnsquashTo))
}

internal fun flightProgress(ms: Float): Float = Release.transform(flickBeat(ms, FlightFrom, FlightTo))

/** The rise tops out early and flattens: a card skimmed away, not one thrown up. */
internal fun liftProgress(ms: Float): Float = Lift.transform(flickBeat(ms, FlightFrom, FlightTo))

internal fun flyerAlpha(ms: Float): Float = 1f - Fade.transform(flickBeat(ms, FadeFrom, FadeTo))

internal fun riserProgress(ms: Float): Float = Recover.transform(flickBeat(ms, RiseFrom, RiseTo))

internal fun riserAlpha(ms: Float): Float = DeckAlpha + (1f - DeckAlpha) * riserProgress(ms)

internal fun dealAlpha(ms: Float): Float = DeckAlpha * Recover.transform(flickBeat(ms, DealFrom, DealTo))

internal fun barLife(ms: Float, index: Int): Float {
    val fires = BarFirstMs + index * BarStepMs
    return flickBeat(ms, fires, fires + BarLifeMs)
}

internal fun barLength(life: Float): Float = when {
    life <= 0f -> 0f
    life < BarGrowFraction -> Release.transform(life / BarGrowFraction)
    else -> 1f - BarShorten * ((life - BarGrowFraction) / (1f - BarGrowFraction))
}

/** A bar holds full weight while it draws itself, then dissolves where it lies. */
internal fun barAlpha(life: Float): Float = when {
    life <= 0f -> 0f
    life < BarGrowFraction -> 1f
    else -> 1f - Fade.transform((life - BarGrowFraction) / (1f - BarGrowFraction))
}

// --- the scene, in units of the strip's height / 48 --------------------------------
//
// At the shipped height one unit is one dp. The scene scales with the strip and is never
// stretched: a wider sheet buys the card a longer flight, not a wider thumb.

private val GestureHeight = 48.dp
private const val SceneUnits = 48f

/** The deck sits left of centre; the strip to its right is where the flight is spent. */
private const val SeatFraction = 0.28f
private const val SeatMinX = 44f
private const val SeatY = 21f
private const val FlightMargin = 8f
private const val FlightMin = 90f
private const val FlightMax = 200f

private const val CardW = 30f
private const val CardH = 20f
private const val CardRadius = 4.5f
private const val DeckDx = -4.5f
private const val DeckDy = 4.5f
private const val DeckAlpha = 0.42f
private const val LiftUnits = 8f
private const val FlightTiltDeg = -14f
private const val FlightShrink = 0.86f
private const val SquashX = 0.09f
private const val SquashY = 0.07f
private const val WindShove = 2.5f
private const val WindTiltDeg = 3f

private const val GlyphBack = 5.5f
private const val GlyphTip = 6.5f
private const val GlyphHalfH = 6.5f

private const val ThumbHalfW = 8.5f
private const val ThumbLen = 58f
private const val NailInset = 3.2f
private const val NailLen = 13f
private const val NailRadius = 3f
private const val TipDx = -9f
private const val TipDy = 12f
private const val RestAngleDeg = -28f
private const val WindDeg = 3f
private const val SnapDeg = 10f
private const val PullBack = 7f
private const val Reach = 34f
private const val ThumbArc = 4f

// The tip travels along the rest axis; the capsule's own rotation is separate, so the
// wrist can roll through the strike without bending the path it is on.
private val AxisCos = cos(RestAngleDeg * PI / 180.0).toFloat()
private val AxisSin = sin(RestAngleDeg * PI / 180.0).toFloat()

// The mark's own three streaks: outer bars nearer the card, the middle one reaching
// further back, at its 0.45 / 0.75 / 0.45 weights.
private const val BarH = 4f
private const val BarRowGap = 7f
private const val BarOuterLen = 15f
private const val BarMidLen = 19f
private const val BarOuterEnd = 6f
private const val BarMidEnd = -1f
private const val BarDrift = 5f
private const val BarOuterAlpha = 0.45f
private const val BarMidAlpha = 0.75f
private const val BarGrowFraction = 0.46f
private const val BarShorten = 0.35f

private val ThumbRim = Stroke(width = 1.4f)
private val GlyphStroke = Stroke(width = 2f, join = StrokeJoin.Round)

/** Below these a shape is a rounding error with a draw call attached to it. */
private const val AlphaFloor = 0.004f
private const val LengthFloor = 0.05f

/** Long enough for the shared-element poster to have landed before the first wind-up. */
private const val EntranceHoldMs = 620L
