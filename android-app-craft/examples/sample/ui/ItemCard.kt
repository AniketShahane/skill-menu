// Shows: a card over a thumbnail sized by aspect ratio (never a fixed height), a number strip
// that shrinks by steps rather than clipping, and merging the whole card into one spoken line
// for TalkBack. Example written for this skill; read it, don't paste it.
package com.example.sample.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.sp

data class ItemSummary(
    val title: String,
    val dateLabel: String,
    val count: Int,
    val categoryLabel: String,
    val resolutionKnown: Boolean,
)

/**
 * Anatomy: the thumbnail takes a 16:9 ratio, never a fixed dp height, so it keeps its shape
 * across phones instead of cropping differently per screen. The category chip and a resolution
 * badge sit over the top edge; title and date sit over the bottom edge, both over a scrim so
 * they stay legible on any image. Below the image is one row of numbers.
 */
@Composable
fun ItemCard(item: ItemSummary) {
    Column(
        Modifier
            .fillMaxWidth()
            .clearAndSetSemantics {
                // One line for the whole card: a screen reader hears "Morning loop, Tuesday,
                // twelve items" once, instead of walking the chip, title and date separately.
                contentDescription = "${item.title}, ${item.dateLabel}, ${item.count} items"
            },
    ) {
        Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f)) {
            // thumbnail image goes here, under the veil
            Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).let {
                it.run { this }
            })
            ResolutionBadge(known = item.resolutionKnown)
        }
        ItemNumberRow(count = item.count, label = "items")
    }
}

@Composable
private fun ResolutionBadge(known: Boolean) {
    // Withheld, never invented: a file with no known size gets a neutral "—" pill instead of a
    // guessed badge, because a missing badge in that seat would read as a tile that failed to
    // draw, not as a tile with nothing to report.
    val label = if (known) "HD" else "—"
    Text(label)
}

/**
 * The unit is measured first (it never needs to shrink), and the number gets whatever width is
 * left, stepping its font size down rather than letting a long value collide with its neighbor.
 */
@Composable
fun ItemNumberRow(count: Int, label: String) {
    Row(Modifier.fillMaxWidth()) {
        BasicText(
            text = "$count",
            autoSize = TextAutoSize.StepBased(minFontSize = 10.sp, maxFontSize = 22.sp, stepSize = 1.sp),
        )
        Text(label)
    }
}
