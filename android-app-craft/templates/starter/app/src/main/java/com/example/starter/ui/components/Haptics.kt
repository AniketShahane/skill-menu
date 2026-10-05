package com.example.starter.ui.components

import android.os.SystemClock
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback

/**
 * Ticks closer together than this are dropped. Below about 40 ms the actuator cannot
 * separate two pulses, so a fast scrub reads as one long buzz (flick:sender/ui/theme/Motion.kt:142).
 */
internal const val TickMinIntervalMs = 40L

/**
 * Haptics named for what the user did, so no call site can pick a pulse that does not
 * match the gesture (flick:sender/ui/theme/Motion.kt:363-424, `FlickTouchHaptics`).
 *
 * Rules the names cannot enforce:
 * - Call only from a gesture callback. Never from a draw scope, a layer block, a
 *   recomposition side effect, or for state restored after process death.
 * - One owner per gesture. If something else already vibrates for this gesture (a player
 *   session, a Material component with its own haptic), do not cue it here as well.
 * - Reduce-motion does not gate haptics. The animator scale and the system haptic setting
 *   are separate settings, and the platform already honours the second.
 */
@Stable
class AppHaptics internal constructor(
    private val haptics: HapticFeedback,
    private val clock: () -> Long = { SystemClock.uptimeMillis() },
) {
    // uptimeMillis is monotonic and ignores wall-clock changes.
    private var lastTickAt = Long.MIN_VALUE / 2

    /** A switch or a filter chip turned on or off. */
    fun toggle(on: Boolean) = perform(if (on) HapticFeedbackType.ToggleOn else HapticFeedbackType.ToggleOff)

    /** One option chosen from a set (a radio row, a segmented choice). Silent on a re-tap. */
    fun choose() = perform(HapticFeedbackType.SegmentTick)

    /** A wheel or slider passed a detent under the finger. Floored at [TickMinIntervalMs]. */
    fun step() {
        if (tickAllowed()) perform(HapticFeedbackType.SegmentFrequentTick)
    }

    /**
     * A chart selection moved to another point under the finger. Fire only when the index
     * changes (dash:ui/charts/DashCharts.kt:72-84); the floor is a backstop, not the gate.
     */
    fun scrub() {
        if (tickAllowed()) perform(HapticFeedbackType.TextHandleMove)
    }

    /** The bottom bar moved to a different tab. The shell fires it, only if the tab changed. */
    fun tabChange() = perform(HapticFeedbackType.ContextClick)

    /** Something the user asked for succeeded (saved, paired, sent). */
    fun confirm() = perform(HapticFeedbackType.Confirm)

    /** Something the user asked for failed, or the input was refused. */
    fun reject() = perform(HapticFeedbackType.Reject)

    /** A long press picked something up (drag to reorder). */
    fun pickUp() = perform(HapticFeedbackType.LongPress)

    private fun tickAllowed(): Boolean {
        val now = clock()
        if (now - lastTickAt < TickMinIntervalMs) return false
        lastTickAt = now
        return true
    }

    private fun perform(type: HapticFeedbackType) = haptics.performHapticFeedback(type)
}

/**
 * The holder carries the tick floor's clock, so it must survive recomposition: a fresh
 * instance per frame would let every tick through.
 */
@Composable
fun rememberAppHaptics(): AppHaptics {
    val haptics = LocalHapticFeedback.current
    return remember(haptics) { AppHaptics(haptics) }
}
