// Shows: an explanation that lives behind a small (i) button and a dialog, rather than as
// permanent caption text cluttering every card. Example written for this skill; read it, don't
// paste it.
package com.example.sample.ui

import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * A card says a number once and nothing more; what that number means lives behind this button,
 * not as a second line under the value. 48 dp keeps the touch target reachable even though the
 * glyph itself is small, so it doesn't compete with the number for visual weight.
 */
@Composable
fun InfoButton(title: String, explanation: String) {
    var open by remember { mutableStateOf(false) }

    IconButton(onClick = { open = true }, modifier = Modifier.size(48.dp)) {
        Text("i")
    }

    if (open) {
        AlertDialog(
            onDismissRequest = { open = false },
            title = { Text(title) },
            text = { Text(explanation) },
            confirmButton = { Text("Got it") },
        )
    }
}
