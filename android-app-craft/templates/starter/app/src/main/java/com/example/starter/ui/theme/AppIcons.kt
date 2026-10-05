package com.example.starter.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathBuilder
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/**
 * The app's icons, hand-drawn as [ImageVector]s: a 24-unit grid, round caps and joins, a
 * 1.8-2.0 stroke, tracking Material Symbols Rounded. Tint at the call site with
 * `Icon(AppIcons.Home, contentDescription, tint = …)`; the black here is only a placeholder
 * paint. No icon library: `material-icons-extended` is frozen at 1.7.8, no longer
 * recommended, and a large dependency for the six glyphs a starter needs. Flick authors all 33 of its
 * glyphs this way (sender/.../FlickIcons.kt); Dash ships the Rounded library instead.
 *
 * Add a glyph by drawing it on the grid with the helpers below. Use a fill with
 * `evenOdd = true` to knock a shape out of another, because an ImageVector carries one tint.
 */
object AppIcons {

    /** A house: pitched roof, body, and a door cut as an open gap in the base. */
    val Home: ImageVector = strokeIcon("Home") {
        moveTo(3.8f, 10.4f); lineTo(12f, 3.9f); lineTo(20.2f, 10.4f)
        moveTo(5.9f, 8.9f); lineTo(5.9f, 18.4f)
        quadTo(5.9f, 20.1f, 7.6f, 20.1f); lineTo(9.8f, 20.1f)
        lineTo(9.8f, 15.2f); quadTo(9.8f, 14.2f, 10.8f, 14.2f); lineTo(13.2f, 14.2f)
        quadTo(14.2f, 14.2f, 14.2f, 15.2f); lineTo(14.2f, 20.1f); lineTo(16.4f, 20.1f)
        quadTo(18.1f, 20.1f, 18.1f, 18.4f); lineTo(18.1f, 8.9f)
    }

    /**
     * A hub and eight spokes: the receiver's Settings glyph (flick: receiver/.../Icons.kt:219-223),
     * redrawn with the path builder rather than SVG path strings.
     */
    val Settings: ImageVector = strokeIcon("Settings") {
        circle(12f, 12f, 3.2f)
        moveTo(12f, 3.5f); lineTo(12f, 6.1f)
        moveTo(12f, 17.9f); lineTo(12f, 20.5f)
        moveTo(3.5f, 12f); lineTo(6.1f, 12f)
        moveTo(17.9f, 12f); lineTo(20.5f, 12f)
        moveTo(6f, 6f); lineTo(7.8f, 7.8f)
        moveTo(16.2f, 16.2f); lineTo(18f, 18f)
        moveTo(18f, 6f); lineTo(16.2f, 7.8f)
        moveTo(7.8f, 16.2f); lineTo(6f, 18f)
    }

    /**
     * An arrow pointing to the start edge. Mirror it for right-to-left layouts at the call
     * site (`Modifier.graphicsLayer { scaleX = -1f }` when `LayoutDirection.Rtl`).
     */
    val Back: ImageVector = strokeIcon("Back", width = 2f) {
        moveTo(19.5f, 12f); lineTo(5f, 12f)
        moveTo(11f, 5.8f); lineTo(4.8f, 12f); lineTo(11f, 18.2f)
    }

    /** A ring with the letter i, as a filled knockout so the stem and dot read at 16 dp. */
    val Info: ImageVector = fillIcon("Info", evenOdd = true) {
        circle(12f, 12f, 9.6f)
        roundRect(11f, 10.4f, 13f, 17f, 1f)
        circle(12f, 7.7f, 1.25f)
    }

    val Plus: ImageVector = strokeIcon("Plus", width = 2f) {
        moveTo(12f, 5f); lineTo(12f, 19f)
        moveTo(5f, 12f); lineTo(19f, 12f)
    }

    /** Flick's check stroke, without its disc (sender/.../FlickIcons.kt:258-267). */
    val Check: ImageVector = strokeIcon("Check", width = 2f) {
        moveTo(5.2f, 12.6f); lineTo(9.7f, 17.1f); lineTo(18.8f, 7.4f)
    }
}

// --- builders (flick: sender/.../FlickIcons.kt:389-430) ------------------------------------

private fun fillIcon(
    name: String,
    evenOdd: Boolean = false,
    block: PathBuilder.() -> Unit,
): ImageVector =
    ImageVector.Builder(
        name = name,
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    ).apply {
        path(
            fill = SolidColor(Color.Black),
            pathFillType = if (evenOdd) PathFillType.EvenOdd else PathFillType.NonZero,
        ) { block() }
    }.build()

private fun strokeIcon(
    name: String,
    width: Float = 1.8f,
    block: PathBuilder.() -> Unit,
): ImageVector =
    ImageVector.Builder(
        name = name,
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    ).apply {
        path(
            stroke = SolidColor(Color.Black),
            strokeLineWidth = width,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
        ) { block() }
    }.build()

// --- path helpers ---------------------------------------------------------------------------
// Both closed shapes wind clockwise in the y-down viewport, so NonZero unions them and EvenOdd
// knocks them out of whatever they sit inside.

private fun PathBuilder.roundRect(left: Float, top: Float, right: Float, bottom: Float, radius: Float) {
    moveTo(left + radius, top)
    lineTo(right - radius, top)
    quadTo(right, top, right, top + radius)
    lineTo(right, bottom - radius)
    quadTo(right, bottom, right - radius, bottom)
    lineTo(left + radius, bottom)
    quadTo(left, bottom, left, bottom - radius)
    lineTo(left, top + radius)
    quadTo(left, top, left + radius, top)
    close()
}

private fun PathBuilder.circle(cx: Float, cy: Float, radius: Float) {
    val k = radius * 0.5523f
    moveTo(cx, cy - radius)
    curveTo(cx + k, cy - radius, cx + radius, cy - k, cx + radius, cy)
    curveTo(cx + radius, cy + k, cx + k, cy + radius, cx, cy + radius)
    curveTo(cx - k, cy + radius, cx - radius, cy + k, cx - radius, cy)
    curveTo(cx - radius, cy - k, cx - k, cy - radius, cx, cy - radius)
    close()
}
