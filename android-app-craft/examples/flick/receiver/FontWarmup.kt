package com.flick.receiver.ui.theme

import android.content.Context
import androidx.core.content.res.ResourcesCompat

/**
 * Parses the bundled faces off the main thread so the first measure that needs one
 * finds it already cached.
 *
 * `Font(resId, weight)` is `FontLoadingStrategy.Blocking`, which is deliberate — an
 * async face shows a fallback for a frame and then reflows, and the whole reason these
 * seven TTFs (~527 KB) are bundled rather than downloaded is that the receiver never
 * flashes a substitute. The cost of that choice is that each typeface is created
 * synchronously inside the first measure that asks for it, on the main thread, on a TV
 * CPU.
 *
 * **`FontFamily.Resolver.preload()` cannot move that cost.** It filters the family to
 * `FontLoadingStrategy.Async` fonts before doing anything, so on a family of Blocking
 * faces it returns having loaded nothing. What does work is the layer underneath:
 * Compose resolves a blocking `ResourceFont` through
 * `ResourcesCompat.getFont(context, resId)`, and that call is backed by a
 * process-wide typeface cache which any thread may fill. Calling it here first turns
 * the later main-thread resolve into a cache hit.
 *
 * Best-effort by construction. It is a race against composition, not a barrier: if the
 * warm loses, the main thread parses the face exactly as it does today. Failures are
 * swallowed for the same reason — a font that will not parse must surface as the
 * platform fallback at measure time, not as a crash during startup.
 */
fun warmBundledTypefaces(context: Context) {
    for (resId in FlickType.BundledFaces) {
        runCatching { ResourcesCompat.getFont(context, resId) }
    }
}
