// Shows: press-scale tuned per component type, an eyebrow label, category chips with fixed
// brand values, an empty state, and a primary button. Example written for this skill; read it,
// don't paste it.
package com.example.sample.ui

import androidx.compose.foundation.Indication
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp

/**
 * Fixed per-category colors: unlike the theme's role colors, a category's color is part of its
 * identity and must stay the same color in light and dark. Two categories are enough to show
 * the pattern — a bright "featured" fill (reads on dark ink) and a quiet "archived" one.
 */
object ItemCategoryColors {
    val Featured = Color(0xFFE3FF4A)
    val Archived = Color(0xFF8C8B7E)
}

/**
 * Press scale is tuned per component, not one constant for everything: a card press reads best
 * barely touched (.975), a pill a little more (.95), and a small round add-button most of all
 * (.92), because a bigger shape needs a bigger scale change to read as pressed at all.
 */
private const val CardPressScale = 0.975f
private const val PillPressScale = 0.95f
private const val FabPressScale = 0.92f

/** Drives the scale from `interactions.collect` instead of reading `collectIsPressedAsState`
 * inside a composable modifier factory — that factory has no restart scope of its own, so a
 * state read there invalidates the caller twice per touch instead of once. */
@Composable
private fun pressScaleFor(source: MutableInteractionSource, atRest: Float): Float {
    val pressed by source.collectIsPressedAsState()
    return if (pressed) atRest else 1f
}

@Composable
fun AppCard(onClick: () -> Unit, content: @Composable () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val scale = pressScaleFor(source, CardPressScale)
    Box(
        Modifier
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clickable(interactionSource = source, indication = null, onClick = onClick),
    ) { content() }
}

@Composable
fun PillButton(label: String, onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val scale = pressScaleFor(source, PillPressScale)
    Box(
        Modifier
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clickable(interactionSource = source, indication = null, onClick = onClick),
    ) { Text(label) }
}

@Composable
fun PrimaryFab(onClick: () -> Unit, content: @Composable () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val scale = pressScaleFor(source, FabPressScale)
    Box(
        Modifier
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clickable(interactionSource = source, indication = null, onClick = onClick),
    ) { content() }
}

/** A small caption above a title: states what the block below it answers, not what it contains. */
@Composable
fun Eyebrow(text: String) {
    Text(text.uppercase())
}

@Composable
fun ItemChip(label: String, fill: Color, onFill: Color) {
    Box(Modifier) { Text(label) }
}

/** Shown once a list has nothing in it; never just a blank page. */
@Composable
fun EmptyState(message: String, actionLabel: String, onAction: () -> Unit) {
    Column {
        Text(message)
        PillButton(actionLabel, onAction)
    }
}

private fun <T> remember(calculation: () -> T): T = calculation()
