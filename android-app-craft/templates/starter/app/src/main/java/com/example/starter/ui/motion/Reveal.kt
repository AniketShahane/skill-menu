package com.example.starter.ui.motion

import android.os.SystemClock
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.Stable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/**
 * The pages (and the data on them) already shown in this process. Coming back to one snaps
 * everything into place instead of replaying every count-up and draw-in, which keeps a pop to one
 * animation. See [RevealRule] for when a first showing still stays still.
 */
object RevealMemory {
    private val seen = HashSet<String>()

    /** True the first time [key] is shown; false on every later visit. */
    @Synchronized
    fun firstShowing(key: Any?): Boolean = seen.add(key.toString())

    @Synchronized
    fun forget() = seen.clear()
}

/**
 * When a page makes its entrance: cards rising into place in reading order, numbers counting up,
 * charts drawing themselves.
 *
 * An entrance belongs to the moment the page opens and to nothing after. Two things broke that in
 * Dash (dash@1940b64): a lazy list forgets what scrolls out of it, so every card scrolled back to
 * replayed its entrance; and a tab sliding in on its first visit assembled itself while it slid —
 * two motions at once.
 */
object RevealRule {
    /**
     * How long a page's opening lasts, counted from its first frame. Everything on the first
     * screen is composed in that frame or the few after it; anything composed later got there by
     * being scrolled to, and simply is there.
     */
    const val OPENING_MILLIS = 600L

    /** Stagger slots beyond this all start together, so a long list never waits seconds. */
    const val MAX_STAGGER_INDEX = 12

    /** How long one entrance takes, how far it rises, and the scale it grows from. */
    const val ENTRANCE_MILLIS = 480
    const val RISE_DP = 22
    const val FROM_SCALE = 0.97f

    /**
     * Whether something appearing on a page makes an entrance: only on the page's (or its data's)
     * first showing, only while the page is [opening], and not while it arrives by navigation.
     */
    fun plays(firstShowing: Boolean, arrivesSettled: Boolean, opening: Boolean): Boolean =
        firstShowing && !arrivesSettled && opening

    /**
     * How much of its stagger an entrance still waits, [sinceOpenedMillis] after its page opened.
     * What is composed with the page waits its whole turn; what the list composes later has
     * already been waiting and only waits the rest. Waiting the whole turn again left a card
     * scrolled to early blank for up to half a second.
     */
    fun remainingDelayMillis(staggerMillis: Int, sinceOpenedMillis: Long): Int =
        (staggerMillis - sinceOpenedMillis.coerceAtLeast(0L)).coerceIn(0L, staggerMillis.toLong()).toInt()
}

/**
 * Whether entrances under this point may play. Each entrance asks [playsNow] once, as it first
 * appears, and remembers the answer; the page's [RevealSession] closes the opening once it is over.
 */
@Stable
class RevealStage(private val plays: Boolean, private val openedAtMillis: Long, private val closes: Boolean = true) {
    // Read once by each entrance as it is created, never observed, so a plain flag.
    @Volatile private var open = true

    fun playsNow(): Boolean = RevealRule.plays(plays, arrivesSettled = false, opening = !closes || open)

    fun sinceOpenedMillis(nowMillis: Long): Long = if (closes) nowMillis - openedAtMillis else 0L

    fun close() {
        open = false
    }

    companion object {
        /** Outside any page's session — a sheet, a dialog — entrances always play. */
        val Always = RevealStage(plays = true, openedAtMillis = 0L, closes = false)
    }
}

val LocalRevealStage: ProvidableCompositionLocal<RevealStage> = staticCompositionLocalOf { RevealStage.Always }

/**
 * Whether the page here is arriving by navigation right now — a tab sliding in beside another, or
 * uncovered as the page above it falls away. Asked by a page's session when it opens; false for
 * the app's first screen, and false again once the page has arrived, so new data on a page already
 * there still makes its entrance. Provided by AppNavHost.
 */
val LocalArrivesSettled: ProvidableCompositionLocal<() -> Boolean> = staticCompositionLocalOf { { false } }

/**
 * Wrap a page in this with its identity so its entrance plays once per identity, on its first
 * screen, as it opens. AppNavHost wraps every page with its route key; a screen nests its own
 * session keyed on its data (e.g. `"home-$itemCount-$today"`) when new data should replay.
 */
@Composable
fun RevealSession(key: Any?, content: @Composable () -> Unit) {
    val arriving = LocalArrivesSettled.current
    val stage = remember(key) {
        // Recorded whether or not it plays: a page rebuilt with its activity — a rotation, the
        // system switching to dark — must find itself already shown.
        val first = RevealMemory.firstShowing(key)
        RevealStage(plays = first && !arriving(), openedAtMillis = SystemClock.uptimeMillis())
    }
    // Counted from the page's first frame rather than from composition, so a slow first frame —
    // a cold start, a font's first use — does not use up its own entrance.
    LaunchedEffect(stage) {
        withFrameMillis { }
        delay(RevealRule.OPENING_MILLIS)
        stage.close()
    }
    CompositionLocalProvider(LocalRevealStage provides stage, content = content)
}

/**
 * A section's entrance: rises [RevealRule.RISE_DP], grows from [RevealRule.FROM_SCALE] and fades
 * in over [RevealRule.ENTRANCE_MILLIS] on [Easings.Arrive], [index] × [stepMillis] after its page
 * opened (capped at [RevealRule.MAX_STAGGER_INDEX]). Use a navigation or data identity for
 * [revealKey], never a clock or a live value.
 *
 * Only the layer reads the progress, so nothing recomposes while it plays; the layer is dropped
 * once the entrance has landed (and never added when it does not play), so a settled list carries
 * no extra layer per card (flick:receiver/.../Presence.kt:82-98). [enabled] is read once: false
 * stands the entrance down for a section arriving some other way, such as a shared element.
 */
@Composable
fun Reveal(
    revealKey: Any?,
    modifier: Modifier = Modifier,
    index: Int = 0,
    stepMillis: Int = 55,
    enabled: Boolean = true,
    content: @Composable BoxScope.() -> Unit,
) {
    val stage = LocalRevealStage.current
    val animated = remember(revealKey) { enabled && stage.playsNow() }
    val waits = remember(revealKey) {
        RevealRule.remainingDelayMillis(
            index.coerceIn(0, RevealRule.MAX_STAGGER_INDEX) * stepMillis,
            stage.sinceOpenedMillis(SystemClock.uptimeMillis()),
        )
    }
    val progress = remember(revealKey) { Animatable(if (animated) 0f else 1f) }
    var settled by remember(revealKey) { mutableStateOf(!animated) }
    val travelPx = with(LocalDensity.current) { RevealRule.RISE_DP.dp.toPx() }
    LaunchedEffect(revealKey) {
        if (animated) {
            // The stagger is part of the spec, so the system animation scale stretches it too.
            progress.animateTo(1f, tween(RevealRule.ENTRANCE_MILLIS, delayMillis = waits, easing = Easings.Arrive))
            settled = true
        }
    }
    Box(
        modifier = if (settled) modifier else modifier.graphicsLayer {
            val shown = progress.value
            alpha = shown
            translationY = (1f - shown) * travelPx
            scaleX = RevealRule.FROM_SCALE + (1f - RevealRule.FROM_SCALE) * shown
            scaleY = scaleX
            // Multiply alpha into each draw op instead of rendering the card offscreen first.
            compositingStrategy = CompositingStrategy.ModulateAlpha
        },
        content = content,
    )
}

/**
 * A 0→1 progress that restarts whenever [key] changes; drives chart and path draw-ins. Read it
 * inside a draw lambda only, so the animation invalidates drawing and never composition.
 *
 * [always] overrides [RevealMemory] for the rare thing worth watching every time (Dash's route
 * drawing across its run page's map). A screenful of numbers replaying is not one of them.
 */
@Composable
fun rememberRevealProgress(
    key: Any?,
    durationMillis: Int = 1_000,
    delayMillis: Int = 0,
    easing: Easing = Easings.Arrive,
    always: Boolean = false,
): State<Float> {
    val stage = LocalRevealStage.current
    val animated = remember(key) { always || stage.playsNow() }
    val progress = remember(key) { Animatable(if (animated) 0f else 1f) }
    LaunchedEffect(key) {
        if (animated) {
            progress.snapTo(0f)
            progress.animateTo(1f, tween(durationMillis, delayMillis, easing))
        } else {
            progress.snapTo(1f)
        }
    }
    return progress.asState()
}
