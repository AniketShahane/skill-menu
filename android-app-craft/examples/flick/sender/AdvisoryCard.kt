package com.flick.sender.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.flick.sender.ui.theme.FlickCorners
import com.flick.sender.ui.theme.FlickIcons
import com.flick.sender.ui.theme.FlickText
import com.flick.sender.ui.theme.LocalFlickColors
import com.flick.sender.ui.theme.PillShape
import com.flick.sender.ui.theme.Primary
import com.flick.sender.ui.theme.Spark
import com.flick.sender.ui.theme.flickRipple
import com.flick.sender.ui.theme.pressScale

enum class AdvisoryTone { CAUTION, INFO }

/** Separate from [AdvisoryCard] so matching pairing never enlarges the Wi-Fi warning. */
@Composable
fun BatteryOptimizationCard(
    title: String,
    body: String,
    primaryLabel: String,
    onPrimary: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalFlickColors.current
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(FlickCorners.qrCard))
            .background(colors.inverseSurface)
            .padding(22.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            BatteryOptimizationGlyph()
            Column(Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = FlickText.bodyLarge.copy(color = colors.onInverseSurface),
                )
                Text(
                    text = body,
                    style = FlickText.bodyMedium.copy(color = colors.onInverseSurfaceDim),
                    modifier = Modifier.padding(top = 7.dp),
                )
            }
        }
        InverseCardAction(
            text = primaryLabel,
            accessibilityLabel = primaryLabel,
            container = colors.primary,
            contentColor = colors.onPrimary,
            onClick = onPrimary,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun BatteryOptimizationGlyph(modifier: Modifier = Modifier) {
    Box(
        modifier
            .size(92.dp)
            .clip(RoundedCornerShape(FlickCorners.statCard))
            .background(Primary),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = FlickIcons.Battery,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(58.dp),
        )
        Icon(
            imageVector = FlickIcons.Bolt,
            contentDescription = null,
            tint = Spark,
            modifier = Modifier.size(28.dp),
        )
    }
}

/**
 * A tinted, actionable advisory (S11) — never a modal, never a toast wall. Names
 * the specific condition at stake and the exact fix. [CAUTION][AdvisoryTone.CAUTION]
 * carries the amber caution fill used by the library band banner;
 * [INFO][AdvisoryTone.INFO] sits on the inverse surface so two stacked cards never
 * shout at each other.
 */
@Composable
fun AdvisoryCard(
    icon: ImageVector,
    title: String,
    body: String,
    tone: AdvisoryTone,
    primaryLabel: String,
    onPrimary: () -> Unit,
    titleStyle: TextStyle = FlickText.bodySmall.copy(fontWeight = FontWeight.ExtraBold),
    modifier: Modifier = Modifier,
    secondaryLabel: String? = null,
    onSecondary: (() -> Unit)? = null,
    secondaryEnabled: Boolean = true,
) {
    val colors = LocalFlickColors.current
    val container = if (tone == AdvisoryTone.CAUTION) colors.caution else colors.inverseSurface
    val ink = if (tone == AdvisoryTone.CAUTION) colors.onCaution else colors.onInverseSurface
    // The INFO glyph stands on the inverse card, whose polarity flips between the sets, so
    // it takes the accent the ground picks — the plain accent is 2.39:1 on the dark set's
    // near-white inverse surface.
    val glyph = if (tone == AdvisoryTone.CAUTION) colors.onCaution else colors.sparkInverse
    val primaryPress = remember { MutableInteractionSource() }
    val secondaryPress = remember { MutableInteractionSource() }
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(FlickCorners.warning))
            .background(container)
            .padding(horizontal = 17.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(13.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = glyph,
            modifier = Modifier.size(22.dp),
        )
        Column {
            Text(
                text = title,
                style = titleStyle.copy(color = ink),
            )
            Text(
                text = body,
                style = FlickText.bodySmall.copy(color = ink.copy(alpha = 0.86f)),
                modifier = Modifier.padding(top = 3.dp),
            )
            Row(
                Modifier.padding(top = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = primaryLabel,
                    style = FlickText.labelMedium.copy(color = container),
                    modifier = Modifier
                        .pressScale(primaryPress)
                        .clip(PillShape)
                        .background(ink)
                        .clickable(
                            interactionSource = primaryPress,
                            indication = flickRipple(container),
                            onClick = onPrimary,
                        )
                        .semantics { role = Role.Button }
                        .heightIn(min = 48.dp)
                        .padding(horizontal = 16.dp, vertical = 15.dp),
                )
                if (secondaryLabel != null && onSecondary != null) {
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = secondaryLabel,
                        style = FlickText.labelMedium.copy(color = ink.copy(alpha = 0.78f)),
                        modifier = Modifier
                            .pressScale(secondaryPress)
                            .clip(PillShape)
                            .clickable(
                                interactionSource = secondaryPress,
                                indication = flickRipple(ink),
                                enabled = secondaryEnabled,
                                onClick = onSecondary,
                            )
                            .semantics { role = Role.Button }
                            .heightIn(min = 48.dp)
                            .padding(horizontal = 14.dp, vertical = 15.dp),
                    )
                }
            }
        }
    }
}
