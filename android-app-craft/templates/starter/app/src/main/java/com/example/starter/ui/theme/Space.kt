package com.example.starter.ui.theme

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * The gap scale: the space BETWEEN things. Pick by the relationship between the two things
 * being separated, not by how the number looks. Values are Flick's receiver scale
 * (receiver/.../Dimens.kt:95-116), the only complete spacing system in either app; Dash and
 * Flick's phone app wrote 8+ distinct gaps as literals and could not be retuned in one place.
 *
 * Rule from the same file: shrink content, keep gaps. When a screen is too full, the
 * components get smaller and these stay put, because the whitespace IS the breathing room.
 */
object AppSpace {
    /** Parts of one thing: an icon to its label, a label to its value. */
    val Xs: Dp = 6.dp

    /** Siblings in a stack: rows in a list, chips in a row. */
    val Sm: Dp = 10.dp

    /** Elements within a group: a heading and the copy under it; a card's inner padding. */
    val Md: Dp = 16.dp

    /** Groups within a column: one card and the next section. */
    val Lg: Dp = 24.dp

    /** Major regions: the page header and the content below it. */
    val Xl: Dp = 40.dp

    /** The page's side margin on a phone. Equal to [Md] by design, named for its own job. */
    val Gutter: Dp = 16.dp

    /**
     * The widest a column may grow on a tablet, a foldable or in landscape, so cards and rows
     * do not stretch into bands. Inside two [Gutter]s it holds about 87 characters of 16 sp
     * Geist (0.467 em average advance, measured from the font's hmtx): the upper edge for
     * prose, so a page that is mostly paragraphs may want ~600 dp. Apply with
     * `Modifier.widthIn(max = ReadingWidth)` centred in the page.
     */
    val ReadingWidth: Dp = 680.dp
}
