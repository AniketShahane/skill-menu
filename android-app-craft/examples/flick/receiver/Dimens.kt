package com.flick.receiver.ui.theme

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * The dp half of the TV scale — the companion to [FlickType].
 *
 * At density 2.0 a 1080p panel is a **960 × 540 dp** canvas. That is *less*
 * height than a phone has, not more: a TV dp is physically large on a 55"
 * screen, which is exactly why so few of them fit. Every size here is chosen
 * against that canvas.
 *
 * Two rules govern the numbers:
 *  1. **Shrink content, keep gaps.** Room to breathe is the *ratio* of content
 *     to whitespace. Component sizes came down ~20 %; [FlickSpace] did not
 *     follow them down. The freed pixels are the whitespace.
 *  2. **Overscan is not optional.** A TV crops its own edges, so nothing —
 *     including focus rings, which are drawn outside their element — may sit
 *     outside the safe area. That is what clipped the pair screen's status row.
 */
object FlickDimens {

    // ── TV overscan safe area ───────────────────────────────────────────────
    // A 5 % inset on a 960 × 540 dp canvas. Not styling: the panel physically
    // does not show what falls outside it. Apply it with
    // [Modifier.tvOverscanSafeArea] on every full-screen surface.

    /** Left/right overscan inset. */
    val OverscanHorizontal: Dp = 48.dp

    /** Top/bottom overscan inset. */
    val OverscanVertical: Dp = 27.dp

    // ── Layout budget ───────────────────────────────────────────────────────
    // What is left of the canvas once overscan is taken. A screen's content
    // column must SUM to no more than [UsableHeight] — line heights, gaps and
    // paddings together — or it clips on the real panel. These are budgets to
    // measure against, not sizes to hand to `height()`.

    /** 960 dp canvas − 2 × [OverscanHorizontal]. */
    val UsableWidth: Dp = 864.dp

    /** 540 dp canvas − 2 × [OverscanVertical]. */
    val UsableHeight: Dp = 486.dp

    // ── Focus decoration ────────────────────────────────────────────────────

    /**
     * Room a focused control needs *beyond* its own bounds, and therefore the
     * distance the outermost focusable in a screen must keep from the edge of
     * the safe area.
     *
     * `FlickFocusRing` is detached and painted, never laid out, so nothing
     * reserves this automatically: the ring sits `FlickFocusRingOffset` (4.5 dp)
     * out with a `FlickFocusRingWidth` (2 dp) stroke straddling that line, and
     * the whole thing is then multiplied by `FlickMotion.FOCUS_SCALE` (1.06).
     * 10 dp covers that for any control up to ~139 dp tall.
     */
    val FocusRingReserve: Dp = 10.dp

    // ── Strokes ─────────────────────────────────────────────────────────────

    /**
     * Every hairline border in the module. It does **not** scale with the rest
     * of the re-size — below 1 dp a border stops rendering, and a hairline that
     * reads at 3 m is already as thin as it can be.
     */
    val Hairline: Dp = 1.dp

    // ── Shared component padding ────────────────────────────────────────────
    // Inner padding is part of a component's size, so these came down with it.
    // They are the defaults for `FlickTvButton` and `GlassPanel`; a caller that
    // needs a denser or looser instance passes its own.

    /** Inside a pill button — text inset from its fill. */
    val ControlPadding: PaddingValues = PaddingValues(horizontal = 18.dp, vertical = 9.dp)

    /** Inside a glass panel or card — content inset from the panel edge. */
    val PanelPadding: PaddingValues = PaddingValues(horizontal = 21.dp, vertical = 18.dp)

    // ── Glyphs ──────────────────────────────────────────────────────────────

    /** An icon set beside label-sized text — it must not out-weigh the word. */
    val GlyphSmall: Dp = 14.dp

    /** An icon carrying its own meaning in a row or button. */
    val GlyphMedium: Dp = 20.dp
}

/**
 * The gap scale — the space *between* elements, which the re-size deliberately
 * left alone. Content shrank; these did not. Pick by the relationship between
 * the two things being separated, not by how the number looks.
 */
object FlickSpace {

    /** Parts of one thing — mark to wordmark, label to its value. */
    val Xs: Dp = 6.dp

    /** Siblings in a stack — rows in a list, chips in a row. */
    val Sm: Dp = 10.dp

    /** Elements within a group — a heading and the copy under it. */
    val Md: Dp = 16.dp

    /** Groups within a column — the card and the status line below it. */
    val Lg: Dp = 24.dp

    /** Major regions — the pair screen's content column and its QR column. */
    val Xl: Dp = 40.dp
}

/**
 * Insets a full-screen surface by the TV overscan safe area. This is the form
 * a screen applies to its root.
 *
 * It defers to [rememberTvSafeAreaPadding], which resolves the same 5 % from the
 * live viewport, so the contract holds at 4 K as well as at
 * [FlickDimens.OverscanHorizontal] × [FlickDimens.OverscanVertical] on 1080p.
 * Take the `PaddingValues` from that function directly when a screen has to pass
 * the inset down to a child rather than apply it at the root.
 */
@Composable
fun Modifier.tvOverscanSafeArea(): Modifier = padding(rememberTvSafeAreaPadding())
