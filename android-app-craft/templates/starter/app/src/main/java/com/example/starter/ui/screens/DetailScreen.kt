package com.example.starter.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLocale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringArrayResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.example.starter.R
import com.example.starter.ui.Tags
import com.example.starter.ui.components.EmptyState
import com.example.starter.ui.components.Eyebrow
import com.example.starter.ui.components.StatTile
import com.example.starter.ui.components.StatusKind
import com.example.starter.ui.components.StatusPill
import com.example.starter.ui.nav.sharedPiece
import com.example.starter.ui.theme.AppIcons
import com.example.starter.ui.theme.AppSpace
import com.example.starter.ui.theme.AppTheme
import java.text.NumberFormat
import kotlin.math.roundToInt
import java.time.format.TextStyle as DayStyle

/**
 * A pushed page. The floating bar hides while it is up, so its foot leaves the navigation
 * inset plus 24 dp instead of the bar's clearance (dash:ui/metrics/MetricDetailScreen.kt:85,91).
 * The status inset sits inside the scroll, so the content scrolls up under the status bar.
 */
@Composable
fun DetailScreen(id: String, onBack: () -> Unit) {
    val colors = AppTheme.colors
    val session = DemoData.session(id)
    val titles = stringArrayResource(R.array.demo_session_titles)
    val bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + 24.dp
    Box(
        Modifier
            .fillMaxSize()
            .background(colors.canvas)
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal))
            .testTag(Tags.DetailPage),
        contentAlignment = Alignment.TopCenter,
    ) {
        Column(
            Modifier
                .widthIn(max = AppSpace.ReadingWidth)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .statusBarsPadding()
                .padding(start = AppSpace.Gutter, end = AppSpace.Gutter, bottom = bottom),
            verticalArrangement = Arrangement.spacedBy(AppSpace.Md),
        ) {
            // 48 dp target; pulled left so the glyph, not the target, lines up with the gutter.
            IconButton(onClick = onBack, modifier = Modifier.offset(x = (-12).dp).size(48.dp)) {
                Icon(AppIcons.Back, contentDescription = stringResource(R.string.back), tint = colors.onSurface)
            }
            if (session == null) {
                EmptyState(
                    title = stringResource(R.string.detail_missing_title),
                    body = stringResource(R.string.detail_missing_body),
                    action = stringResource(R.string.detail_missing_action),
                    onAction = onBack,
                )
            } else {
                SessionDetail(session, titles.getOrElse(session.titleIndex) { session.id })
            }
            Spacer(Modifier.height(AppSpace.Sm))
        }
    }
}

@Composable
private fun SessionDetail(session: DemoSession, title: String) {
    val colors = AppTheme.colors
    Column(verticalArrangement = Arrangement.spacedBy(AppSpace.Xs)) {
        Eyebrow(session.day.getDisplayName(DayStyle.FULL, LocalLocale.current.platformLocale))
        Text(
            title,
            Modifier
                // Same id and part as the list row's title. The host scopes it to the card page
                // this Detail was opened from, so it flies from the row that was tapped, on
                // whichever card page that was, and nowhere else.
                .sharedPiece(session.id, "title")
                .semantics { heading() },
            style = MaterialTheme.typography.headlineLarge,
            color = colors.onSurface,
        )
    }
    StatusPill(stringResource(R.string.detail_saved), StatusKind.DONE)
    val format = remember { NumberFormat.getIntegerInstance() }
    StatTile(
        label = stringResource(R.string.detail_minutes_label),
        value = session.minutes.toDouble(),
        format = { format.format(it.roundToInt()) },
        modifier = Modifier.fillMaxWidth(),
        unit = stringResource(R.string.unit_minutes),
    )
    Text(
        stringResource(R.string.detail_body),
        style = MaterialTheme.typography.bodyLarge,
        color = colors.onSurfaceDim,
    )
}
