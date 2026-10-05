package com.example.starter.ui.components

import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.example.starter.R
import com.example.starter.ui.theme.AppIcons
import com.example.starter.ui.theme.AppTheme

/**
 * The explanation for one card, kept out of the layout: a 48 dp target with a 20 dp glyph
 * that opens a dialog. Explanations stay available without filling every screen with body
 * copy, and the card keeps only its number (dash:ui/InfoButton.kt:13-26; Home went from 14
 * readouts to 6 in dash@060f6c9).
 *
 * [text] carries one idea. Two ideas want two buttons, or one of them is not needed.
 */
@Composable
fun InfoButton(title: String, text: String) {
    // Saveable, so the dialog is still open after rotation or process death.
    var open by rememberSaveable(title) { mutableStateOf(false) }
    IconButton(onClick = { open = true }, modifier = Modifier.size(48.dp)) {
        Icon(
            AppIcons.Info,
            contentDescription = stringResource(R.string.info_button_label, title),
            modifier = Modifier.size(20.dp),
            tint = AppTheme.colors.onSurfaceDim,
        )
    }
    if (open) {
        AlertDialog(
            onDismissRequest = { open = false },
            title = { Text(title) },
            text = { Text(text) },
            confirmButton = { TextButton(onClick = { open = false }) { Text(stringResource(R.string.info_dismiss)) } },
        )
    }
}
