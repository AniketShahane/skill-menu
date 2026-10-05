package com.example.starter.ui.screens

import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.example.starter.R
import com.example.starter.ui.Tags
import com.example.starter.ui.components.AdvisoryCard
import com.example.starter.ui.components.AdvisoryTone
import com.example.starter.ui.components.AppCard
import com.example.starter.ui.components.Eyebrow
import com.example.starter.ui.components.InfoButton
import com.example.starter.ui.components.PageTitle
import com.example.starter.ui.components.barClearance
import com.example.starter.ui.components.rememberAppHaptics
import com.example.starter.ui.motion.LocalReducedMotion
import com.example.starter.ui.theme.AppIcons
import com.example.starter.ui.theme.AppSpace
import com.example.starter.ui.theme.AppTheme
import com.example.starter.ui.theme.ThemePreference

/**
 * The second tab. It scrolls under the bar like every tab page, so the glass never sits on a
 * flat band where a page stopped short (dash@212cd19).
 */
@Composable
fun SettingsScreen(preference: ThemePreference, onPreference: (ThemePreference) -> Unit) {
    val colors = AppTheme.colors
    val haptics = rememberAppHaptics()
    val reduceMotion = LocalReducedMotion.current
    val context = LocalContext.current
    Box(
        Modifier
            .fillMaxSize()
            .background(colors.canvas)
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal)),
        contentAlignment = Alignment.TopCenter,
    ) {
        LazyColumn(
            modifier = Modifier.widthIn(max = AppSpace.ReadingWidth).fillMaxWidth().testTag(Tags.SettingsList),
            contentPadding = PaddingValues(start = AppSpace.Gutter, end = AppSpace.Gutter, top = AppSpace.Sm, bottom = barClearance()),
            verticalArrangement = Arrangement.spacedBy(AppSpace.Md),
        ) {
            item(key = "title", contentType = "title") {
                PageTitle(stringResource(R.string.settings_title), Modifier.statusBarsPadding())
            }
            if (reduceMotion) {
                // Inline, above what it is about. Never a dialog: the app still works.
                item(key = "motion-off", contentType = "advisory") {
                    AdvisoryCard(
                        icon = AppIcons.Info,
                        title = stringResource(R.string.settings_motion_off_title),
                        body = stringResource(R.string.settings_motion_off_body),
                        actionLabel = stringResource(R.string.settings_motion_off_action),
                        onAction = {
                            runCatching {
                                context.startActivity(
                                    Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                                )
                            }
                        },
                        tone = AdvisoryTone.INFO,
                    )
                }
            }
            item(key = "appearance", contentType = "card") {
                AppCard(Modifier.fillMaxWidth()) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Eyebrow(stringResource(R.string.settings_appearance), Modifier.weight(1f))
                        InfoButton(
                            stringResource(R.string.settings_appearance_info_title),
                            stringResource(R.string.settings_appearance_info_body),
                        )
                    }
                    Column(Modifier.selectableGroup()) {
                        ThemePreference.entries.forEach { option ->
                            ThemeRow(option, selected = option == preference) {
                                if (option != preference) {
                                    haptics.choose()
                                    onPreference(option)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * One choice. The whole row is the target and carries the radio semantics; the RadioButton
 * inside is drawing only (`onClick = null`), so TalkBack hears one control, not two.
 */
@Composable
private fun ThemeRow(option: ThemePreference, selected: Boolean, onClick: () -> Unit) {
    val colors = AppTheme.colors
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .selectable(selected = selected, role = Role.RadioButton, onClick = onClick)
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(
            selected = selected,
            onClick = null,
            colors = RadioButtonDefaults.colors(selectedColor = colors.primary, unselectedColor = colors.onSurfaceDim),
        )
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            Text(stringResource(option.label), style = MaterialTheme.typography.bodyLarge, color = colors.onSurface)
            Text(stringResource(option.hint), style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceDim)
        }
    }
}

private val ThemePreference.label: Int
    get() = when (this) {
        ThemePreference.SYSTEM -> R.string.theme_system
        ThemePreference.LIGHT -> R.string.theme_light
        ThemePreference.DARK -> R.string.theme_dark
    }

private val ThemePreference.hint: Int
    get() = when (this) {
        ThemePreference.SYSTEM -> R.string.theme_system_hint
        ThemePreference.LIGHT -> R.string.theme_light_hint
        ThemePreference.DARK -> R.string.theme_dark_hint
    }
