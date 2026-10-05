package com.example.starter.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Corner radii named by the component that wears them. Placeholder values from Flick's
 * sender (sender/.../Shape.kt:8-28), which names its radii by component, many of them off
 * M3's 4/8/12/16/20/28/32 steps. Dash's most-used radii (16, 28, 20) sit on those steps, but
 * it never named them and wrote 16 distinct values by hand. Retune per product; keep the
 * names so call sites never write a literal radius.
 */
object AppCorners {
    /** A content card on the page. */
    val card: Dp = 26.dp

    /** A smaller tile inside a card or grid: a stat, a thumbnail. */
    val tile: Dp = 20.dp

    /** A bottom sheet's leading edge. */
    val sheet: Dp = 36.dp

    /** A rectangular button. Pill buttons use [PillShape] instead. */
    val button: Dp = 17.dp

    /** A chip or small badge. */
    val chip: Dp = 13.dp

    /** The floating glass bar. */
    val bar: Dp = 34.dp
}

/** Material's five slots mapped onto the product radii, so stock components agree with ours. */
val AppShapes: Shapes = Shapes(
    extraSmall = RoundedCornerShape(AppCorners.chip),
    small = RoundedCornerShape(AppCorners.button),
    medium = RoundedCornerShape(AppCorners.tile),
    large = RoundedCornerShape(AppCorners.card),
    extraLarge = RoundedCornerShape(AppCorners.bar),
)

/**
 * A pill, as a percentage. Never `RoundedCornerShape(999.dp)`: Material interpolates corner
 * sizes in pixels when a shape morphs, and a 999 dp radius (clamped to half the height at
 * draw) sits at "still a pill" for almost the whole travel and then snaps. A percentage
 * resolves to the real half-height, so the same morph reads evenly (flick: sender/.../Shape.kt:40-47).
 */
val PillShape: Shape = RoundedCornerShape(percent = 50)

/** Bottom sheets round only their leading edge. */
val SheetShape: Shape = RoundedCornerShape(topStart = AppCorners.sheet, topEnd = AppCorners.sheet)
