package com.flick.sender.ui.components

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ButtonShapes
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.unit.dp
import com.flick.sender.ui.theme.FlickText
import com.flick.sender.ui.theme.LocalFlickColors
import com.flick.sender.ui.theme.PillMorphShape
import com.flick.sender.ui.theme.PressedPillShape
import com.flick.sender.ui.theme.PrimaryShadow

/**
 * A press changes the silhouette, not the size: the pill squares off under the finger
 * and rounds back out on release. That is Material's own pressed-shape morph, so it
 * runs on the scheme's spring and needs no scale of ours on top of it — two answers to
 * one touch read as a bug.
 */
@Composable
private fun rememberPillShapes(): ButtonShapes =
    remember { ButtonShapes(shape = PillMorphShape, pressedShape = PressedPillShape) }

/** Full-width brand-blue action: the pairing sheets' Connect/Pair and the empty-state CTA. */
@Composable
fun FlickPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = LocalFlickColors.current
    Button(
        onClick = onClick,
        shapes = rememberPillShapes(),
        enabled = enabled,
        colors = ButtonDefaults.buttonColors(
            containerColor = colors.primary,
            contentColor = colors.onPrimary,
            disabledContainerColor = colors.primaryContainer,
            disabledContentColor = colors.onPrimaryContainer,
        ),
        contentPadding = PaddingValues(horizontal = 22.dp, vertical = 16.dp),
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            // Only the enabled pill is lifted; a disabled one must not read as tappable.
            // The lift stays on the resting shape: an elevation shadow is cast from a
            // static outline and cannot follow the press morph.
            .then(
                if (enabled) {
                    Modifier.shadow(
                        elevation = 14.dp,
                        shape = PillMorphShape,
                        clip = false,
                        ambientColor = PrimaryShadow,
                        spotColor = PrimaryShadow,
                    )
                } else {
                    Modifier
                },
            ),
    ) {
        Text(text, style = FlickText.titleSmall)
    }
}

/** Quiet secondary action — "Cancel", "play on this phone instead". */
@Composable
fun FlickSubtleButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalFlickColors.current
    TextButton(
        onClick = onClick,
        shapes = rememberPillShapes(),
        // labelLarge is 14.5sp bold, the size onSurfaceFaint needs to clear the
        // contrast floor on the pale canvas (design §7).
        colors = ButtonDefaults.textButtonColors(contentColor = colors.onSurfaceFaint),
        modifier = modifier.heightIn(min = 48.dp),
    ) {
        Text(text, style = FlickText.labelLarge)
    }
}
