package com.example.starter.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLocale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringArrayResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.starter.R
import com.example.starter.ui.Tags
import com.example.starter.ui.components.AppCard
import com.example.starter.ui.components.BarChart
import com.example.starter.ui.components.EmptyState
import com.example.starter.ui.components.Eyebrow
import com.example.starter.ui.components.InfoButton
import com.example.starter.ui.components.PageTitle
import com.example.starter.ui.components.PlaceholderCard
import com.example.starter.ui.components.StatTile
import com.example.starter.ui.components.barClearance
import com.example.starter.ui.components.rememberAppHaptics
import com.example.starter.ui.motion.Reveal
import com.example.starter.ui.nav.sharedPiece
import com.example.starter.ui.theme.AppIcons
import com.example.starter.ui.theme.AppSpace
import com.example.starter.ui.theme.AppText
import com.example.starter.ui.theme.AppTheme
import java.text.NumberFormat
import java.time.DayOfWeek
import kotlin.math.roundToInt
import java.time.format.TextStyle as DayStyle

/*
 * Real cards take these as their minimum height and the placeholders take them as their
 * height, so nothing below moves when the data lands. Measured at font scale 1.0; a larger
 * font grows the real card past its minimum, which is the right way round.
 */
private val HeroCardHeight = 156.dp
private val ChartCardHeight = 260.dp
private val RowCardHeight = 84.dp
private val ChartHeight = 140.dp

private const val RevealKey = "home"

/** The last list row that still staggers; later rows are below the fold and arrive settled anyway. */
private const val MaxStagger = 8

/**
 * The first tab. One LazyColumn scrolls everything, under the status bar and under the
 * floating bar. Each number is said in exactly one place: the week's total in the hero, each
 * day in the chart (read on demand), each session in its own row (dash@060f6c9: 14 readouts
 * answering 6 questions became 6).
 */
@Composable
fun HomeScreen(onOpen: (String) -> Unit) {
    val colors = AppTheme.colors
    val haptics = rememberAppHaptics()
    // Seeded from the cache so the first frame is content; null only while nothing is known.
    val sessions by produceState(initialValue = DemoData.cached()) { value = DemoData.load() }
    var cleared by rememberSaveable { mutableStateOf(false) }
    var confirmClear by rememberSaveable { mutableStateOf(false) }
    var selectedDay by rememberSaveable { mutableStateOf<Int?>(null) }
    val titles = stringArrayResource(R.array.demo_session_titles)
    val shown = if (cleared) emptyList() else sessions

    Box(
        Modifier
            .fillMaxSize()
            .background(colors.canvas)
            // Insets are applied per page, never globally: sides here, the status bar on the
            // first row, the navigation bar inside barClearance().
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal)),
        contentAlignment = Alignment.TopCenter,
    ) {
        LazyColumn(
            modifier = Modifier.widthIn(max = AppSpace.ReadingWidth).fillMaxWidth().testTag(Tags.HomeList),
            contentPadding = PaddingValues(start = AppSpace.Gutter, end = AppSpace.Gutter, top = AppSpace.Sm, bottom = barClearance()),
            verticalArrangement = Arrangement.spacedBy(AppSpace.Md),
        ) {
            item(key = "title", contentType = "title") {
                // On the first item, not the list: the content scrolls up under the status bar.
                PageTitle(stringResource(R.string.app_name), Modifier.statusBarsPadding())
            }
            val list = shown
            when {
                list == null -> {
                    // One quiet line says what is happening; the placeholders say nothing.
                    item(key = "loading", contentType = "loading") {
                        Eyebrow(stringResource(R.string.home_loading), Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                    }
                    item(key = "placeholder-hero", contentType = "placeholder") { PlaceholderCard(HeroCardHeight) }
                    item(key = "placeholder-chart", contentType = "placeholder") { PlaceholderCard(ChartCardHeight) }
                    items(count = 3, key = { "placeholder-row-$it" }, contentType = { "placeholder" }) { PlaceholderCard(RowCardHeight) }
                }
                list.isEmpty() -> item(key = "empty", contentType = "empty") {
                    Reveal(RevealKey) {
                        EmptyState(
                            title = stringResource(R.string.home_empty_title),
                            body = stringResource(R.string.home_empty_body),
                            action = stringResource(R.string.home_empty_action),
                            onAction = { cleared = false },
                            icon = AppIcons.Plus,
                        )
                    }
                }
                else -> {
                    item(key = "hero", contentType = "hero") {
                        Reveal(RevealKey, index = 0) { HeroCard(list) }
                    }
                    item(key = "week", contentType = "chart") {
                        Reveal(RevealKey, index = 1) {
                            WeekCard(list, selectedDay) { day -> selectedDay = day }
                        }
                    }
                    item(key = "sessions-title", contentType = "section") {
                        SectionTitle(stringResource(R.string.home_sessions_title), stringResource(R.string.home_sessions_clear)) {
                            confirmClear = true
                        }
                    }
                    itemsIndexed(list, key = { _, session -> session.id }, contentType = { _, _ -> "session" }) { index, session ->
                        Reveal(RevealKey, index = minOf(2 + index, MaxStagger)) {
                            SessionRow(session, titles.getOrElse(session.titleIndex) { session.id }) { onOpen(session.id) }
                        }
                    }
                }
            }
        }
    }

    if (confirmClear) {
        // A dialog pairs its verbs: the one that acts and the one that keeps things as they are.
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text(stringResource(R.string.home_clear_title)) },
            text = { Text(stringResource(R.string.home_clear_body)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmClear = false
                    cleared = true
                    selectedDay = null
                    haptics.confirm()
                }) { Text(stringResource(R.string.home_clear_confirm)) }
            },
            dismissButton = {
                TextButton(onClick = { confirmClear = false }) { Text(stringResource(R.string.home_clear_keep)) }
            },
        )
    }
}

@Composable
private fun HeroCard(sessions: List<DemoSession>) {
    val total = remember(sessions) { sessions.sumOf { it.minutes }.toDouble() }
    val format = remember { NumberFormat.getIntegerInstance() }
    StatTile(
        label = stringResource(R.string.home_hero_label),
        value = total,
        format = { format.format(it.roundToInt()) },
        modifier = Modifier.fillMaxWidth().heightIn(min = HeroCardHeight),
        unit = stringResource(R.string.unit_minutes),
        hero = true,
        numberTag = Tags.HeroNumber,
    ) {
        InfoButton(stringResource(R.string.home_hero_info_title), stringResource(R.string.home_hero_info_body))
    }
}

@Composable
private fun WeekCard(sessions: List<DemoSession>, selectedDay: Int?, onSelectDay: (Int) -> Unit) {
    val colors = AppTheme.colors
    val minutes = remember(sessions) { DemoData.minutesByDay(sessions) }
    val locale = LocalLocale.current.platformLocale
    val readout = if (selectedDay == null) {
        stringResource(R.string.home_chart_hint)
    } else {
        stringResource(
            R.string.home_chart_readout,
            DayOfWeek.of(selectedDay + 1).getDisplayName(DayStyle.FULL, locale),
            minutes[selectedDay].roundToInt(),
        )
    }
    AppCard(Modifier.fillMaxWidth().heightIn(min = ChartCardHeight)) {
        Eyebrow(stringResource(R.string.home_chart_title))
        Spacer(Modifier.height(AppSpace.Xs))
        // Announced politely as the finger moves, without stealing focus from the chart.
        // Always one full-size line tall, so scrubbing from a short day to "Wednesday" never
        // moves the chart; at font scale 2 a long readout steps its size down to fit the width
        // instead of clipping. Ellipsis is only the floor below 10 sp.
        val readoutStyle = MaterialTheme.typography.bodyMedium
        Text(
            readout,
            Modifier
                .fillMaxWidth()
                .height(with(LocalDensity.current) { readoutStyle.lineHeight.toDp() })
                .semantics { liveRegion = LiveRegionMode.Polite },
            color = if (selectedDay == null) colors.onSurfaceDim else colors.onSurface,
            autoSize = TextAutoSize.StepBased(minFontSize = 10.sp, maxFontSize = readoutStyle.fontSize, stepSize = 0.5.sp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = readoutStyle,
        )
        Spacer(Modifier.height(12.dp))
        BarChart(
            values = minutes,
            revealKey = "$RevealKey-chart",
            modifier = Modifier.fillMaxWidth().height(ChartHeight),
            selected = selectedDay,
            onSelect = onSelectDay,
        )
        Spacer(Modifier.height(6.dp))
        // The chart's description already names the days; TalkBack should not read seven letters.
        Row(Modifier.fillMaxWidth().clearAndSetSemantics { }) {
            DayOfWeek.entries.forEachIndexed { index, day ->
                Text(
                    day.getDisplayName(DayStyle.NARROW, locale),
                    Modifier.weight(1f),
                    style = MaterialTheme.typography.labelSmall,
                    color = if (index == selectedDay) colors.onSurface else colors.onSurfaceDim,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun SectionTitle(title: String, action: String, onAction: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(title, Modifier.weight(1f), style = MaterialTheme.typography.titleLarge, color = AppTheme.colors.onSurface)
        TextButton(onClick = onAction, modifier = Modifier.heightIn(min = 48.dp)) {
            Text(action, style = MaterialTheme.typography.labelLarge)
        }
    }
}

/**
 * One session. The whole card is the target and merges into one spoken line. The title is a
 * shared piece: it flies to the detail page's title, keyed by the item and this page (the host
 * supplies the page, so the same row on another card page pairs with its own Detail).
 */
@Composable
private fun SessionRow(session: DemoSession, title: String, onClick: () -> Unit) {
    val colors = AppTheme.colors
    val locale = LocalLocale.current.platformLocale
    AppCard(
        modifier = Modifier.fillMaxWidth().heightIn(min = RowCardHeight).testTag(Tags.item(session.id)),
        onClick = onClick,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                // Wraps, never ellipsizes: at font scale 2 the minutes column leaves the title
                // about half the row and "Weekend hike" needs two lines. The row grows with it.
                Text(
                    title,
                    Modifier.sharedPiece(session.id, "title"),
                    style = MaterialTheme.typography.titleMedium,
                    color = colors.onSurface,
                )
                Text(
                    session.day.getDisplayName(DayStyle.FULL, locale),
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.onSurfaceDim,
                    maxLines = 1,
                )
            }
            Text(
                stringResource(R.string.minutes_short, session.minutes),
                style = AppText.monoValue,
                color = colors.onSurface,
                maxLines = 1,
                softWrap = false,
            )
        }
    }
}
