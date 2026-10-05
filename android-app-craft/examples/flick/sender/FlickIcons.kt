package com.flick.sender.ui.theme

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
 * The Flick icon set — 24dp grid, round caps/joins, tracking Material Symbols
 * Rounded. Glyphs the mock shows solid are authored as fills; the rest keep the
 * 1.8–2.0 stroke. Built as [ImageVector]s so callers tint them via
 * `Icon(tint = …)`; no icon-font or drawable dependency is involved. The brand
 * mark is a Canvas composable in ui/components (it carries streaks a vector path
 * can't). back-10 / fwd-10 here are rings only; the "10" inside them is set in
 * type by the transport cluster.
 */
object FlickIcons {
    val PlayCircle: ImageVector = fillIcon("PlayCircle", evenOdd = true) {
        circle(12f, 12f, 9.6f)
        moveTo(9.8f, 7.4f); lineTo(16.8f, 12f); lineTo(9.8f, 16.6f); close()
    }

    /**
     * Replay ring: 300° of an r=8.3 circle on the grid's centre, opening into a 60° gap at
     * the upper left. The head sits at twelve o'clock pointing the way the seek runs, its
     * base straddling the arc's own end — a triangle whose incircle is narrower than the
     * stroke, so it fills solid instead of outlining. The bore left inside is the caller's
     * clearance for the "10".
     */
    val Back10: ImageVector = strokeIcon("Back10") {
        moveTo(12f, 3.7f)
        arc(8.3f, 4.81f, 7.85f, clockwise = true, major = true)
        moveTo(9.6f, 3.7f); lineTo(11.84f, 5.39f); lineTo(11.84f, 2.01f); close()
    }

    /** [Back10] mirrored about x = 12 — every point below is its twin's 24 − x. */
    val Fwd10: ImageVector = strokeIcon("Fwd10") {
        moveTo(12f, 3.7f)
        arc(8.3f, 19.19f, 7.85f, clockwise = false, major = true)
        moveTo(14.4f, 3.7f); lineTo(12.16f, 5.39f); lineTo(12.16f, 2.01f); close()
    }

    /**
     * Skip to the start: the wall the head returns to, and a head pointing back at it.
     * Solid rather than the replay ring [Back10] is built from, and deliberately so — that
     * arc is this set's mark for a SEEK inside a running cast, and starting over is a cast
     * beginning again from zero. Wound like every other closed path here, so the bar and
     * the triangle union under NonZero.
     */
    val Restart: ImageVector = fillIcon("Restart") {
        roundRect(4.2f, 5.2f, 6.7f, 18.8f, 1.15f)
        moveTo(19.6f, 5.2f); lineTo(19.6f, 18.8f); lineTo(8.6f, 12f); close()
    }

    val Volume: ImageVector = strokeIcon("Volume") {
        // Speaker body.
        moveTo(4.5f, 9.5f); lineTo(4.5f, 14.5f); lineTo(8f, 14.5f)
        lineTo(12.5f, 18.5f); lineTo(12.5f, 5.5f); lineTo(8f, 9.5f); close()
        // Two sound waves.
        moveTo(15.5f, 9f); quadTo(18f, 12f, 15.5f, 15f)
        moveTo(18f, 6.7f); quadTo(22f, 12f, 18f, 17.3f)
    }

    val Cast: ImageVector = strokeIcon("Cast") {
        // Screen.
        moveTo(2.5f, 8.5f); lineTo(2.5f, 6.4f)
        quadTo(2.5f, 4.4f, 4.5f, 4.4f); lineTo(19.5f, 4.4f)
        quadTo(21.5f, 4.4f, 21.5f, 6.4f); lineTo(21.5f, 17.6f)
        quadTo(21.5f, 19.6f, 19.5f, 19.6f); lineTo(13.7f, 19.6f)
        // Broadcast arcs.
        moveTo(2.5f, 16.5f); quadTo(7.5f, 16.5f, 7.5f, 21.5f)
        moveTo(2.5f, 12.5f); quadTo(11.5f, 12.5f, 11.5f, 21.5f)
    }

    val Tv: ImageVector = fillIcon("Tv") {
        roundRect(2.4f, 4.6f, 21.6f, 17.6f, 3f)
        roundRect(8.6f, 19f, 15.4f, 20.9f, 0.95f)
    }

    /**
     * The only glyph in this set that carries an instruction rather than a thing. The
     * Devices screen has to say that a SECOND app goes on the television, and [Tv] alone
     * cannot: it names the screen and stops there, which is what let that card be read as
     * a caption about TVs in general. The arrow is the mark every app store puts on an
     * install, so the two together say "this goes onto that" before the title is read.
     *
     * Built on [Tv]'s exact body and stand, so the pair are one television drawn twice
     * rather than two televisions. The arrow is knocked out of the fill instead of laid
     * over it because an [ImageVector] carries one tint: an arrow drawn on top of the
     * screen would be the screen's own colour and would not exist.
     */
    val TvInstall: ImageVector = fillIcon("TvInstall", evenOdd = true) {
        roundRect(2.4f, 4.6f, 21.6f, 17.6f, 3f)
        roundRect(8.6f, 19f, 15.4f, 20.9f, 0.95f)
        // Symmetric about x = 12, and set 2.3 clear of the screen top and bottom alike so
        // it sits on the screen rather than in the frame.
        moveTo(10.6f, 6.9f); lineTo(13.4f, 6.9f); lineTo(13.4f, 11.1f); lineTo(16f, 11.1f)
        lineTo(12f, 15.3f); lineTo(8f, 11.1f); lineTo(10.6f, 11.1f); close()
    }

    val TvOff: ImageVector = strokeIcon("TvOff", width = 1.9f) {
        moveTo(5.4f, 4.9f); lineTo(18.6f, 4.9f)
        quadTo(21.3f, 4.9f, 21.3f, 7.6f); lineTo(21.3f, 14.9f)
        quadTo(21.3f, 17.6f, 18.6f, 17.6f); lineTo(5.4f, 17.6f)
        quadTo(2.7f, 17.6f, 2.7f, 14.9f); lineTo(2.7f, 7.6f)
        quadTo(2.7f, 4.9f, 5.4f, 4.9f); close()
        moveTo(9f, 20.7f); lineTo(15f, 20.7f)
        moveTo(3.6f, 3.6f); lineTo(20.4f, 20.4f)
    }

    /**
     * This phone, not a handset. The label it stands beside offers to play the film HERE,
     * and a telephone receiver would name a call while [Tv] beside it names the other
     * screen. Built on [Battery]'s construction — the same quadratic corners, the same
     * 1.9 stroke — with no terminal at the top and a bar at the foot: that bar is the
     * gesture indicator, and it is what makes a portrait rounded rectangle read as a
     * phone at 20 dp rather than as a cell.
     */
    val Phone: ImageVector = strokeIcon("Phone", width = 1.9f) {
        moveTo(9.2f, 2.6f); lineTo(14.8f, 2.6f)
        quadTo(17.4f, 2.6f, 17.4f, 5.2f); lineTo(17.4f, 18.8f)
        quadTo(17.4f, 21.4f, 14.8f, 21.4f); lineTo(9.2f, 21.4f)
        quadTo(6.6f, 21.4f, 6.6f, 18.8f); lineTo(6.6f, 5.2f)
        quadTo(6.6f, 2.6f, 9.2f, 2.6f); close()
        moveTo(10.4f, 18.4f); lineTo(13.6f, 18.4f)
    }

    val Wifi: ImageVector = strokeIcon("Wifi") {
        moveTo(3f, 9.5f); quadTo(12f, 3f, 21f, 9.5f)
        moveTo(6.2f, 13f); quadTo(12f, 9f, 17.8f, 13f)
        moveTo(9.4f, 16.4f); quadTo(12f, 14.6f, 14.6f, 16.4f)
        // Dot.
        moveTo(12f, 18.2f)
        curveTo(12.66f, 18.2f, 13.2f, 18.74f, 13.2f, 19.4f)
        curveTo(13.2f, 20.06f, 12.66f, 20.6f, 12f, 20.6f)
        curveTo(11.34f, 20.6f, 10.8f, 20.06f, 10.8f, 19.4f)
        curveTo(10.8f, 18.74f, 11.34f, 18.2f, 12f, 18.2f)
        close()
    }

    val Signal: ImageVector = fillIcon("Signal") {
        roundRect(4f, 14f, 7.6f, 20.2f, 1.1f)
        roundRect(10.2f, 9f, 13.8f, 20.2f, 1.1f)
        roundRect(16.4f, 3.8f, 20f, 20.2f, 1.1f)
    }

    /** Padlock — solid, matching the mock's filled lock on the privacy pill. */
    val Private: ImageVector = fillIcon("Private") {
        // Shackle stops exactly on the body's top edge so the two subpaths meet
        // without overlapping; a NonZero union of opposed windings would hollow out.
        moveTo(8f, 10.4f)
        lineTo(8f, 8.4f)
        curveTo(8f, 3.7f, 16f, 3.7f, 16f, 8.4f)
        lineTo(16f, 10.4f)
        lineTo(13.9f, 10.4f)
        lineTo(13.9f, 8.4f)
        curveTo(13.9f, 6.3f, 10.1f, 6.3f, 10.1f, 8.4f)
        lineTo(10.1f, 10.4f)
        close()
        roundRect(4.4f, 10.4f, 19.6f, 20.4f, 2.8f)
    }

    val Battery: ImageVector = strokeIcon("Battery", width = 1.9f) {
        moveTo(9f, 3f); lineTo(15f, 3f)
        moveTo(8f, 5f); lineTo(16f, 5f)
        quadTo(18f, 5f, 18f, 7f); lineTo(18f, 19f)
        quadTo(18f, 21f, 16f, 21f); lineTo(8f, 21f)
        quadTo(6f, 21f, 6f, 19f); lineTo(6f, 7f)
        quadTo(6f, 5f, 8f, 5f); close()
    }

    val Bolt: ImageVector = fillIcon("Bolt") {
        moveTo(13.2f, 2.5f)
        lineTo(6.6f, 13.2f)
        lineTo(11.1f, 13.2f)
        lineTo(10.2f, 21.5f)
        lineTo(17.4f, 10.7f)
        lineTo(12.9f, 10.7f)
        close()
    }

    /**
     * The support badge's glyph, and the reason it is a path at all: the card carried a
     * colour emoji before this, which on a Samsung device is a glossy, shaded, three-
     * dimensional object with a specular highlight on it — a foreign body on a surface where
     * every other mark is flat, and one no theme could tint or restyle.
     *
     * Two lobes and a point, symmetric about x = 12: every control point on the left flank
     * is its twin's 24 − x. The lobes are full and their shoulders round, tracking Material
     * Symbols Rounded rather than the older baseline heart, whose narrow shoulders and
     * needle tip read as sharp next to the rest of this set. The bottom point is left a
     * point — a heart with a rounded bottom is a peach — but a blunt one, its two flanks
     * meeting at about 97°.
     */
    val Heart: ImageVector = fillIcon("Heart") {
        moveTo(12f, 20.8f)
        curveTo(15.6f, 17.6f, 19f, 14.4f, 20.4f, 11.6f)
        curveTo(21.9f, 8.6f, 20.6f, 4.2f, 16.9f, 3.6f)
        curveTo(14.9f, 3.3f, 13f, 4.4f, 12f, 6.2f)
        curveTo(11f, 4.4f, 9.1f, 3.3f, 7.1f, 3.6f)
        curveTo(3.4f, 4.2f, 2.1f, 8.6f, 3.6f, 11.6f)
        curveTo(5f, 14.4f, 8.4f, 17.6f, 12f, 20.8f)
        close()
    }

    /**
     * A picture, with a solid band along its foot — the orientation key's glyph, and the
     * reason the band is there at all. The key is rotated to whatever the viewer has
     * chosen, and a bare frame would leave 0° indistinguishable from 180° and 90° from
     * 270°: the two pairs differ only in which way up the picture is, so the glyph has to
     * carry a top and a bottom or it states half of what it is drawn to state.
     *
     * Landscape at rest, because that is the shape nearly every film arrives in and the
     * shape the key returns to at 0°.
     *
     * Even-odd, in three passes: the outer rectangle, the inner one knocked out of it to
     * leave a frame, and the band filled back into the bottom of that hole.
     */
    val PictureOrientation: ImageVector = fillIcon("PictureOrientation", evenOdd = true) {
        roundRect(3.4f, 6.6f, 20.6f, 17.4f, 2.2f)
        roundRect(5.2f, 8.4f, 18.8f, 15.6f, 1.1f)
        roundRect(5.2f, 12.4f, 18.8f, 15.6f, 1.1f)
    }

    val Tune: ImageVector = fillIcon("Tune") {
        roundRect(3f, 6.1f, 21f, 7.9f, 0.9f)
        circle(8.6f, 7f, 2.7f)
        roundRect(3f, 11.1f, 21f, 12.9f, 0.9f)
        circle(15.4f, 12f, 2.7f)
        roundRect(3f, 16.1f, 21f, 17.9f, 0.9f)
        circle(8.6f, 17f, 2.7f)
    }

    val GridView: ImageVector = fillIcon("GridView") {
        roundRect(3.4f, 3.4f, 10.6f, 10.6f, 2.3f)
        roundRect(13.4f, 3.4f, 20.6f, 10.6f, 2.3f)
        roundRect(3.4f, 13.4f, 10.6f, 20.6f, 2.3f)
        roundRect(13.4f, 13.4f, 20.6f, 20.6f, 2.3f)
    }

    val Warning: ImageVector = fillIcon("Warning", evenOdd = true) {
        moveTo(10.6f, 3.5f)
        quadTo(12f, 2.7f, 13.4f, 3.5f)
        lineTo(22.2f, 18.6f)
        quadTo(23f, 20f, 21.4f, 20f)
        lineTo(2.6f, 20f)
        quadTo(1f, 20f, 1.8f, 18.6f)
        close()
        roundRect(11f, 8.4f, 13f, 14.6f, 1f)
        circle(12f, 17.1f, 1.25f)
    }

    val CheckCircle: ImageVector = fillIcon("CheckCircle", evenOdd = true) {
        circle(12f, 12f, 9.6f)
        moveTo(6.6f, 12.4f)
        lineTo(10.6f, 16.4f)
        lineTo(17.4f, 9f)
        lineTo(16f, 7.6f)
        lineTo(10.6f, 13.5f)
        lineTo(8f, 10.9f)
        close()
    }

    val Captions: ImageVector = strokeIcon("Captions", width = 1.9f) {
        moveTo(5.2f, 4.6f); lineTo(18.8f, 4.6f)
        quadTo(21.4f, 4.6f, 21.4f, 7.2f); lineTo(21.4f, 16.8f)
        quadTo(21.4f, 19.4f, 18.8f, 19.4f); lineTo(5.2f, 19.4f)
        quadTo(2.6f, 19.4f, 2.6f, 16.8f); lineTo(2.6f, 7.2f)
        quadTo(2.6f, 4.6f, 5.2f, 4.6f); close()
        moveTo(10.2f, 9.9f); quadTo(6.4f, 8.4f, 6.4f, 12f); quadTo(6.4f, 15.6f, 10.2f, 14.1f)
        moveTo(17.6f, 9.9f); quadTo(13.8f, 8.4f, 13.8f, 12f); quadTo(13.8f, 15.6f, 17.6f, 14.1f)
    }

    val AudioTrack: ImageVector = fillIcon("AudioTrack") {
        roundRect(2.6f, 10f, 4.8f, 14f, 1.1f)
        roundRect(7f, 6.4f, 9.2f, 17.6f, 1.1f)
        roundRect(11.4f, 3.4f, 13.6f, 20.6f, 1.1f)
        roundRect(15.8f, 6.4f, 18f, 17.6f, 1.1f)
        roundRect(20.2f, 10f, 22.4f, 14f, 1.1f)
    }

    val Speed: ImageVector = strokeIcon("Speed", width = 1.9f) {
        moveTo(3.6f, 17.6f)
        curveTo(3.6f, 12.9f, 7.4f, 9.1f, 12f, 9.1f)
        curveTo(16.6f, 9.1f, 20.4f, 12.9f, 20.4f, 17.6f)
        moveTo(12f, 17.6f); lineTo(15.9f, 12.2f)
    }

    val ChevronRight: ImageVector = strokeIcon("ChevronRight", width = 2f) {
        moveTo(9.5f, 5f); lineTo(16.5f, 12f); lineTo(9.5f, 19f)
    }

    val ChevronDown: ImageVector = strokeIcon("ChevronDown", width = 2f) {
        moveTo(5f, 8.5f); lineTo(12f, 15.5f); lineTo(19f, 8.5f)
    }

    val Search: ImageVector = strokeIcon("Search", width = 2f) {
        circle(10.5f, 10.5f, 5.8f)
        moveTo(14.8f, 14.8f); lineTo(20f, 20f)
    }

    val Close: ImageVector = strokeIcon("Close", width = 2f) {
        moveTo(6.5f, 6.5f); lineTo(17.5f, 17.5f)
        moveTo(17.5f, 6.5f); lineTo(6.5f, 17.5f)
    }

    /**
     * Three bars and a down arrow — the library's list, and the direction it is dealt in.
     *
     * The bars used to descend in length and to be the whole mark, because the glyph beside
     * them named the order and nothing needed to say which way it ran. Two name orders and
     * two duration orders ended that: A–Z and Z–A wear the same letter, longest and shortest
     * the same hourglass, and the pill would have shown one drawing for two different grids.
     *
     * Direction is still stated exactly once, which was the point of the old rule. The bars
     * are equal length precisely so they cannot make a second claim about it and disagree
     * with the arrow — a staircase whose steps ran one way under an arrow pointing the other
     * is the failure that rule was written against. Rendered at 20 dp on the pill against the
     * staircase it replaces, the arrow is also the only one of the two that survives being
     * glanced at rather than read: mirrored staircases differ by where their mass sits, and
     * that difference is the first thing to go.
     */
    val SortDescending: ImageVector = strokeIcon("SortDescending", width = 2f) {
        sortBars()
        moveTo(16.9f, 7f); lineTo(16.9f, 17f)
        moveTo(14.1f, 14.2f); lineTo(16.9f, 17f); lineTo(19.7f, 14.2f)
    }

    /**
     * [SortDescending] reflected about y = 12 — every point below is its twin's 24 − y, so
     * the two marks are the same drawing and can only ever differ in the one thing they are
     * drawn to differ in.
     */
    val SortAscending: ImageVector = strokeIcon("SortAscending", width = 2f) {
        sortBars()
        moveTo(16.9f, 17f); lineTo(16.9f, 7f)
        moveTo(14.1f, 9.8f); lineTo(16.9f, 7f); lineTo(19.7f, 9.8f)
    }

    /**
     * A clock face reading four o'clock: the long hand straight up at 12, the short one at
     * 4. The 120° between them is the point rather than the hour — at the 15 dp the sort
     * control draws this, two hands at a narrow angle merge into a single stroke and the
     * face stops reading as a clock at all.
     */
    val Clock: ImageVector = strokeIcon("Clock", width = 1.9f) {
        circle(12f, 12f, 8.6f)
        moveTo(12f, 6.6f); lineTo(12f, 12f); lineTo(16.2f, 14.4f)
    }

    /**
     * A capital A. The one letterform in this set, and it earns the exception: alphabetical
     * order is the single sort that is about text rather than about a quantity, and no
     * abstract mark says "by name" at 15 dp the way the first letter of the alphabet does.
     *
     * The crossbar's ends sit ON the flanks rather than beyond them — at y = 13.4 the legs
     * have reached x = 8.06 and 15.94, so a bar drawn between 8.1 and 15.9 closes the
     * counter without growing whiskers outside the letter.
     */
    val Alphabetical: ImageVector = strokeIcon("Alphabetical", width = 2f) {
        moveTo(5.4f, 19.2f); lineTo(12f, 4.8f); lineTo(18.6f, 19.2f)
        moveTo(8.1f, 13.4f); lineTo(15.9f, 13.4f)
    }

    /**
     * Duration, and deliberately not a second clock: an hourglass is a length of time
     * rather than a moment on a dial, which is exactly the difference between "longest
     * first" and "recently added". The two bulbs meet at a point rather than through a
     * neck, because a neck one grid unit wide is a smudge at 15 dp.
     *
     * All four subpaths wind clockwise on the y-down grid, so NonZero unions them.
     */
    val Hourglass: ImageVector = fillIcon("Hourglass") {
        roundRect(6.2f, 3f, 17.8f, 4.9f, 0.95f)
        roundRect(6.2f, 19.1f, 17.8f, 21f, 0.95f)
        moveTo(8.2f, 4.9f); lineTo(15.8f, 4.9f); lineTo(12f, 12f); close()
        moveTo(12f, 12f); lineTo(15.8f, 19.1f); lineTo(8.2f, 19.1f); close()
    }

}

// --- builders ---------------------------------------------------------------

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

// --- path helpers -----------------------------------------------------------
// The two closed ones wind clockwise in the y-down viewport, so NonZero unions
// them and EvenOdd knocks them out of whatever they sit inside.

private fun PathBuilder.roundRect(
    left: Float,
    top: Float,
    right: Float,
    bottom: Float,
    radius: Float,
) {
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

/**
 * The list the two sort marks are drawn on: three bars of equal length, filling the same
 * 6–18 band the arrow beside them spans. Shared so the pair cannot drift in the half of the
 * drawing that is supposed to be identical.
 */
private fun PathBuilder.sortBars() {
    moveTo(4.5f, 7f); lineTo(11.8f, 7f)
    moveTo(4.5f, 12f); lineTo(11.8f, 12f)
    moveTo(4.5f, 17f); lineTo(11.8f, 17f)
}

/**
 * Open circular arc to (x, y) — SVG's elliptical arc with both radii equal. [clockwise] is
 * the sweep as it reads on a y-down grid; [major] takes the long way round, the only way
 * one command reaches past 180°.
 */
private fun PathBuilder.arc(
    radius: Float,
    x: Float,
    y: Float,
    clockwise: Boolean,
    major: Boolean,
) {
    arcTo(radius, radius, 0f, major, clockwise, x, y)
}
