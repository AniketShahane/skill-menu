package com.example.starter.ui.theme

import android.content.Context
import androidx.core.content.res.ResourcesCompat

/**
 * Parses the bundled faces off the main thread, so the first measure that needs one finds it
 * already cached. Call before `setContent`.
 *
 * `Font(resId, weight)` is `FontLoadingStrategy.Blocking`, which is the right strategy: an
 * async face shows a fallback for a frame and then reflows. Its cost is that each typeface is
 * created synchronously inside the first measure that asks for it, on the main thread. Eight
 * files, about 650 KB here.
 *
 * `ResourcesCompat.getFont(context, id)` is backed by a process-wide typeface cache that any
 * thread may fill, and Compose's resource-font path resolves through the same call, so a warm
 * here turns the later main-thread resolve into a cache hit
 * (flick: receiver/.../FontWarmup.kt:30-34, MainActivity.kt:46-53).
 *
 * About `FontFamily.Resolver.preload()`: Flick's receiver comment says it loads nothing for
 * Blocking fonts. The ui-text 1.12.0 bytecode says otherwise: it does resolve them, through
 * `TypefaceRequestCache.preWarmCache`. But from a `LaunchedEffect` it runs on the main thread
 * after the first composition, so it moves the cost earlier without taking it off the frame.
 * AppTheme keeps it only as a harmless second pass. Verified by bytecode, not by a trace; see
 * references/performance.md.
 *
 * Best effort by construction. It races composition rather than blocking it: if the warm
 * loses, the main thread parses the face exactly as it would have. A daemon thread, because
 * losing the race is the ordinary outcome on a cold start and costs nothing. A face that will
 * not parse must surface as the platform fallback at measure time, never as a startup crash,
 * so failures are swallowed.
 */
fun startFontWarmup(context: Context) {
    val app = context.applicationContext
    Thread({ warmBundledTypefaces(app) }, "font-warm")
        .apply { isDaemon = true }
        .start()
}

private fun warmBundledTypefaces(context: Context) {
    for (id in BundledFaces) {
        runCatching { ResourcesCompat.getFont(context, id) }
    }
}
