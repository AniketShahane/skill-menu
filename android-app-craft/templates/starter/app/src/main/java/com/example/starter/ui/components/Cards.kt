package com.example.starter.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ButtonShapes
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.example.starter.ui.motion.AnimatedNumber
import com.example.starter.ui.motion.pressScale
import com.example.starter.ui.theme.AppCorners
import com.example.starter.ui.theme.AppSpace
import com.example.starter.ui.theme.AppText
import com.example.starter.ui.theme.AppTheme

/** Press depth for a whole card: shallower than a button's, because the card is big (dash:ui/DashMotion.kt:293-304). */
private const val CardPressScale = 0.975f

/**
 * The standard card: surface fill, hairline edge, 20 dp padding. It answers a press only when
 * it is clickable, and then by scale alone. There is no ripple: a neutral ripple on a brand or
 * glass fill reads as a grey blob (dash:ui/components/DashComponents.kt:84-109;
 * flick:sender/ui/components/FlickBottomNav.kt:386-395). A ripple added later must be in a
 * colour that reads on the fill and ride the same interaction source as the scale.
 */
@Composable
fun AppCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = AppTheme.colors
    val shape = RoundedCornerShape(AppCorners.card)
    val interaction = remember { MutableInteractionSource() }
    val press = if (onClick != null) Modifier.pressScale(interaction, pressedScale = CardPressScale) else Modifier
    val click = if (onClick != null) {
        Modifier.clickable(interactionSource = interaction, indication = null, role = Role.Button, onClick = onClick)
    } else {
        Modifier
    }
    Column(
        modifier
            .then(press)
            .clip(shape)
            .background(colors.surface)
            .border(1.dp, colors.outlineHairline, shape)
            .then(click)
            .padding(20.dp),
        content = content,
    )
}

/**
 * A small uppercase label over a value or a section: the app's quiet voice. It wraps rather
 * than ellipsizing: at font scale 2 on a 360 dp phone "MINUTES THIS WEEK" beside an info
 * button needs two lines, and a cut label is a lost label (TextFitTest).
 */
@Composable
fun Eyebrow(text: String, modifier: Modifier = Modifier, color: Color = AppTheme.colors.onSurfaceDim) {
    Text(text.uppercase(), modifier, style = AppText.eyebrow, color = color)
}

/**
 * A page's title row, with room for one control that belongs to the whole page. Every page
 * opens with it at the same height, so pages sliding side by side line up like one strip
 * (dash:ui/components/DashComponents.kt:128-150).
 *
 * The title wraps rather than ellipsizing: a long app name or a user-named page at font
 * scale 2 on a 360 dp phone needs a second line, and a cut title is a lost title
 * (TextFitTest). The row grows only when the words need it; every title that fits one line
 * still lines up with its neighbours.
 */
@Composable
fun PageTitle(title: String, modifier: Modifier = Modifier, trailing: @Composable RowScope.() -> Unit = {}) {
    Row(modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(
            title,
            Modifier.weight(1f).semantics { heading() },
            style = MaterialTheme.typography.headlineLarge,
            color = AppTheme.colors.onSurface,
        )
        trailing()
    }
}

/**
 * A number on a card that counts up once, when its page first opens. [format] turns the
 * running value into text; the tile is laid out once at the size of the final text, so a page
 * of counting tiles never re-measures (dash:ui/DashMotion.kt:327-367). Use a plain Text instead
 * for a value that would mislead by counting (a date, a best time, "—").
 *
 * [hero] picks the big display style; [numberTag] tags the number for tests. [trailing]
 * takes one small control, usually an [InfoButton].
 */
@Composable
fun StatTile(
    label: String,
    value: Double,
    format: (Double) -> String,
    modifier: Modifier = Modifier,
    unit: String? = null,
    hero: Boolean = false,
    numberTag: String? = null,
    onClick: (() -> Unit)? = null,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    val colors = AppTheme.colors
    AppCard(modifier, onClick = onClick) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Eyebrow(label, Modifier.weight(1f))
            trailing()
        }
        Spacer(Modifier.height(AppSpace.Xs))
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(AppSpace.Xs)) {
            AnimatedNumber(
                value = value,
                style = if (hero) AppText.heroNumber else MaterialTheme.typography.headlineMedium,
                color = colors.onSurface,
                modifier = if (numberTag != null) Modifier.testTag(numberTag) else Modifier,
                format = format,
            )
            if (unit != null) {
                Text(
                    unit,
                    Modifier.padding(bottom = if (hero) 8.dp else 3.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.onSurfaceDim,
                    maxLines = 1,
                    softWrap = false,
                )
            }
        }
    }
}

/**
 * Percent corners, not a 999 dp radius: Material interpolates corner sizes in pixels, and a
 * 999 dp radius sits at "still a pill" for most of the morph and then snaps
 * (flick:sender/ui/theme/Shape.kt:38-47).
 */
private val PillMorphShape = RoundedCornerShape(percent = 50)
private val PressedPillShape = RoundedCornerShape(13.dp)

/**
 * The brand action. A press squares the pill off under the finger (Material's pressed-shape
 * morph on the scheme's spring) and adds no scale on top, because two answers to one touch
 * read as a bug (flick:sender/ui/components/Buttons.kt:22-30). At least 48 dp tall.
 */
@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun PillButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val colors = AppTheme.colors
    val shapes = remember { ButtonShapes(shape = PillMorphShape, pressedShape = PressedPillShape) }
    Button(
        onClick = onClick,
        shapes = shapes,
        modifier = modifier.heightIn(min = 48.dp),
        enabled = enabled,
        colors = ButtonDefaults.buttonColors(
            containerColor = colors.primary,
            contentColor = colors.onPrimary,
            disabledContainerColor = colors.primaryContainer,
            disabledContentColor = colors.onPrimaryContainer,
        ),
        contentPadding = PaddingValues(horizontal = 22.dp, vertical = 14.dp),
    ) {
        Text(text, style = MaterialTheme.typography.labelLarge, maxLines = 1)
    }
}
