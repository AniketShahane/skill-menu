package com.example.starter.ui.motion

import android.content.ContentResolver
import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner

/**
 * The app's named curves. Pick one by what the eye sees, never by feel at a call site: an
 * unnamed `tween(300)` is a decision nobody can find again. See references/motion-system.md.
 *
 * All five are Dash's (dash:ui/DashMotion.kt:67-106), and EasingShapeTest holds their shapes.
 */
object Easings {
    /**
     * Material's emphasized-decelerate: fast start, long soft landing. 45 % done at 1/20 of its
     * time and 76 % at 1/5, so it suits only things ARRIVING FROM OFF SCREEN — the sprint
     * happens where nobody sees it. On anything whose whole journey is on screen it reads as a
     * jump then a crawl; that is what "it snaps" meant (dash@42b59ff). Entrances, count-ups,
     * draw-ins.
     */
    val Arrive: Easing = CubicBezierEasing(0.05f, 0.7f, 0.1f, 1f)

    /**
     * Material's emphasized: slow at both ends, brisk and near-straight in between, so the eye
     * can follow a thing from where it was to where it lands. A page moving a visible distance
     * (push, pop) and one shape changing into another.
     */
    val Travel: Easing = CubicBezierEasing(0.2f, 0f, 0f, 1f)

    /**
     * Ease-out-quart: off the mark briskly, then a long soft landing. For many small pieces
     * flying at once — they must be seen to leave together and settle together. Travel's
     * standstill would hang them for the first tenth of a second; Arrive's sprint would land
     * them before the eye picked one out.
     */
    val Flight: Easing = CubicBezierEasing(0.25f, 1f, 0.5f, 1f)

    /** Ease-out-cubic: the fades and small entrances that go with a flight. */
    val Fade: Easing = CubicBezierEasing(0.33f, 1f, 0.68f, 1f)

    /**
     * Whole-screen tab slides. What matters is the fastest single frame, because a late frame
     * shows as a jump of that size: Travel peaks at 4x its average speed a tenth of the way in;
     * this peaks under 3x, a quarter of the way in, after a start gentle enough that the first
     * frames (which pay for building the arriving page) hardly move. Over 400 ms its fastest
     * 120 Hz frame moves a 1440 px page ~80 px, against ~160 px for Travel at 300 ms.
     */
    val Glide: Easing = CubicBezierEasing(0.35f, 0f, 0.15f, 1f)
}

/**
 * Springs for anything a finger carries or that can be re-aimed mid-flight: a spring retargets
 * from its current velocity, a tween restarts on a fresh clock (flick:sender/.../Motion.kt:56-62).
 * Material components and presses take `MaterialTheme.motionScheme`; these are for the app's
 * own surfaces (dash:ui/DashMotion.kt:61-65).
 */
object Springs {
    /** Settles a cancelled gesture back to rest: predictive back cancel, a released drag. */
    val Snappy: SpringSpec<Float> = spring(dampingRatio = 0.82f, stiffness = 520f)

    /** Something that should visibly land with energy: a toggle knob, a badge popping in. */
    val Bouncy: SpringSpec<Float> = spring(dampingRatio = 0.6f, stiffness = 360f)

    /** Critically damped and unhurried: a value drifting to a new resting place. */
    val Gentle: SpringSpec<Float> = spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = 220f)
}

/** Snap instead of animating when motion is reduced. The one reduced-motion idiom for finite specs. */
fun <T> orSnap(reduceMotion: Boolean, spec: FiniteAnimationSpec<T>): FiniteAnimationSpec<T> =
    if (reduceMotion) snap() else spec

/**
 * The reduced-motion content swap for `AnimatedContent`. It draws the incoming and outgoing
 * children together for one frame, so the incoming one must hold at alpha 0 for that frame;
 * `EnterTransition.None togetherWith ExitTransition.None` draws both at full opacity
 * (flick:receiver/.../Motion.kt:307-314). A fresh instance per call, because `using` mutates it.
 */
fun cut(sizeTransform: SizeTransform? = null): ContentTransform =
    ContentTransform(fadeIn(snap()), fadeOut(snap()), sizeTransform = sizeTransform)

/**
 * Retime a scheme spring without changing its character: only stiffness moves. Spring duration
 * scales with 1/sqrt(stiffness), so a [durationFraction] of 0.75 asks for stiffness / 0.75².
 * A non-spring passes through rather than failing a cast when the scheme changes. Name a
 * [visibilityThreshold] for bounds (`Rect.VisibilityThreshold`): the scheme names none, and a
 * shared copy is only handed back when the spring ENDS (flick:sender/.../Motion.kt:157-180).
 */
@Suppress("UNCHECKED_CAST")
fun <T> retimed(base: FiniteAnimationSpec<T>, durationFraction: Float, visibilityThreshold: T? = null): FiniteAnimationSpec<T> {
    val baseSpring = base as? SpringSpec<T> ?: return base
    return SpringSpec(
        dampingRatio = baseSpring.dampingRatio,
        stiffness = baseSpring.stiffness / (durationFraction * durationFraction),
        visibilityThreshold = visibilityThreshold ?: baseSpring.visibilityThreshold,
    )
}

/**
 * Whether motion is reduced, provided once near the root:
 * `CompositionLocalProvider(LocalReducedMotion provides rememberReducedMotion())`.
 * AppNavHost provides it for every page. Static: it changes a few times in an app's life.
 */
val LocalReducedMotion: ProvidableCompositionLocal<Boolean> = staticCompositionLocalOf { false }

/**
 * True while "Remove animations" (animator duration scale 0) is on, observed live.
 *
 * `!ValueAnimator.areAnimatorsEnabled()` reads the setting once, and the user flipping it later
 * is never seen (android-design motion-and-performance.md §8 has that version; see
 * references/android-design-corrections.md). Compose already scales every finite spec by this
 * setting; this flag is for what Compose cannot scale: loops, which must park, and one-frame
 * content swaps ([cut]). Evidence: flick:receiver/.../Motion.kt:397-426.
 */
@Composable
fun rememberReducedMotion(): Boolean {
    val resolver = LocalContext.current.contentResolver
    var animatorScale by remember(resolver) { mutableFloatStateOf(readAnimatorScale(resolver)) }
    DisposableEffect(resolver) {
        val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) {
                animatorScale = readAnimatorScale(resolver)
            }
        }
        val registered = runCatching {
            resolver.registerContentObserver(
                Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE),
                false,
                observer,
            )
        }.isSuccess
        onDispose { if (registered) runCatching { resolver.unregisterContentObserver(observer) } }
    }
    return animatorScale <= 0f
}

/** The system animator duration scale; 1 when unreadable. AppNavHost uses it to time overtakes. */
internal fun readAnimatorScale(resolver: ContentResolver): Float = runCatching {
    Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
}.getOrDefault(1f)

/**
 * Whether this composition's window is resumed.
 *
 * A finite animation ends on its own. A loop keeps asking for frames for as long as it is
 * composed, and a screen can stay composed for hours behind another app. Gate every loop on this
 * AND on [LocalReducedMotion], and read both before any early return so the composition shape
 * never depends on the branch (flick:sender/.../Motion.kt:197-224; FlickGesture.kt:60-83).
 */
@Composable
fun rememberIsResumed(): Boolean {
    val lifecycleOwner = LocalLifecycleOwner.current
    var resumed by remember(lifecycleOwner) {
        mutableStateOf(lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED))
    }
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> resumed = true
                Lifecycle.Event.ON_PAUSE -> resumed = false
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    return resumed
}
