package com.flick.receiver.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.snap
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Row
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.LayoutDirection
import androidx.tv.material3.Text
import com.flick.receiver.ui.theme.FlickMotion
import com.flick.receiver.ui.theme.LocalReducedMotion

/**
 * A value rolled one character at a time, shared by the pairing code and the idle
 * clock.
 *
 * An equal-length change rolls only the cells that changed, so the value reads as
 * re-issued rather than redrawn. A change of length, or any change to a value that
 * can't be split into cells, crossfades the whole value instead of popping cells in
 * or out. Set in a monospaced face, every cell keeps its
 * width and the row cannot reflow mid-roll.
 *
 * [semanticsText] replaces the per-glyph text nodes with one, for a value a screen
 * reader should hear whole.
 *
 * [contentAlignment] places both values while a length change swaps them: the box
 * is as wide as the longer one until the old value leaves, so a caller that centres
 * this box must centre within it too, or the value jumps sideways when it narrows.
 */
@Composable
fun RollingGlyphs(
    text: String,
    style: TextStyle,
    color: Color,
    modifier: Modifier = Modifier,
    semanticsText: String? = null,
    contentAlignment: Alignment = Alignment.TopStart,
) {
    val reducedMotion = LocalReducedMotion.current
    // Built once for the whole value: `transitionSpec` is not a composable lambda,
    // and every cell rolls the same way anyway. The size transform snaps and clips,
    // so a glyph on its way out is cut at the cell edge and the row never reflows.
    val roll = if (reducedMotion) {
        FlickMotion.cut(SizeTransform(clip = true) { _, _ -> snap() })
    } else {
        ContentTransform(
            targetContentEnter = slideInVertically(
                animationSpec = FlickMotion.panelSpatial(),
                initialOffsetY = { it },
            ) + fadeIn(FlickMotion.stateEffects()),
            initialContentExit = slideOutVertically(
                animationSpec = FlickMotion.flickSettleSpatial(),
                targetOffsetY = { -it },
            ) + fadeOut(FlickMotion.stateEffects()),
            sizeTransform = SizeTransform(clip = true) { _, _ -> snap() },
        )
    }
    val swap = if (reducedMotion) {
        FlickMotion.cut()
    } else {
        ContentTransform(
            targetContentEnter = fadeIn(FlickMotion.stateEffects()),
            initialContentExit = fadeOut(FlickMotion.fastStateEffects()),
            sizeTransform = null,
        )
    }
    AnimatedContent(
        targetState = text,
        modifier = if (semanticsText != null) {
            modifier.clearAndSetSemantics { this.text = AnnotatedString(semanticsText) }
        } else {
            modifier
        },
        transitionSpec = { swap },
        contentAlignment = contentAlignment,
        contentKey = { value -> if (value.all { it.isRollableGlyph() }) value.length else value },
        label = "rollingGlyphsValue",
    ) { value ->
        // Per-glyph cells are laid out, not shaped: only a value the mono face draws
        // whole and that always reads left to right may be split. Anything else would
        // be reversed by an RTL locale's Row or leave the baseline on a fallback font,
        // so it stays one bidi-shaped Text, keyed on the whole value so every change
        // crossfades rather than cutting in place. The no-break spaces are admitted
        // because recent ICU puts U+202F before "PM".
        if (value.all { it.isRollableGlyph() }) {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Row {
                    value.forEachIndexed { index, character ->
                        key(index) {
                            AnimatedContent(
                                targetState = character,
                                transitionSpec = { roll },
                                label = "rollingGlyph",
                            ) { glyph ->
                                Text(text = glyph.toString(), style = style, color = color, maxLines = 1)
                            }
                        }
                    }
                }
            }
        } else {
            Text(text = value, style = style, color = color, maxLines = 1)
        }
    }
}

private fun Char.isRollableGlyph(): Boolean =
    code in 0x20..0x7E || this == '\u00A0' || this == '\u2009' || this == '\u202F'
