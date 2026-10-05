package com.example.starter.ui.screens

import androidx.compose.runtime.Immutable
import java.time.DayOfWeek

/**
 * The starter's sample content. Replace this file with the app's repository; keep the two
 * shapes it demonstrates: a synchronous [cached] read so the first frame is content rather
 * than a placeholder that flips a frame later, and a suspending [load] behind it.
 */
@Immutable
internal data class DemoSession(
    val id: String,
    /** Index into `R.array.demo_session_titles`, so the sample text lives in strings.xml. */
    val titleIndex: Int,
    val minutes: Int,
    val day: DayOfWeek,
)

internal object DemoData {
    private val sessions = listOf(
        DemoSession("s1", 0, 42, DayOfWeek.MONDAY),
        DemoSession("s2", 1, 25, DayOfWeek.TUESDAY),
        DemoSession("s3", 2, 18, DayOfWeek.WEDNESDAY),
        DemoSession("s4", 3, 55, DayOfWeek.THURSDAY),
        DemoSession("s5", 4, 12, DayOfWeek.THURSDAY),
        DemoSession("s6", 5, 32, DayOfWeek.SATURDAY),
        DemoSession(LONG_TITLE_ID, 6, 28, DayOfWeek.SUNDAY),
    )

    /**
     * A session whose title is as long as a user would type. It keeps TextFitTest honest: the
     * Detail page and the Home row must wrap it at font scale 2, never cut it. Keep one such
     * row when you replace the samples.
     */
    const val LONG_TITLE_ID = "s7"

    /** What is already in memory, or null when nothing is and the page must show placeholders. */
    fun cached(): List<DemoSession>? = sessions

    suspend fun load(): List<DemoSession> = sessions

    fun session(id: String): DemoSession? = sessions.firstOrNull { it.id == id }

    /** Minutes per weekday, Monday first: the bar chart's input, already in display units. */
    fun minutesByDay(list: List<DemoSession>): List<Float> =
        DayOfWeek.entries.map { day -> list.filter { it.day == day }.sumOf { it.minutes }.toFloat() }
}
