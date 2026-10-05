// Shows: a byte-sized bitmap LRU (not an entry-count LRU), hardware bitmaps with early
// prepareToDraw(), halving resample, and a render queue paused by a set of named reasons with
// a timeout so a stuck reason cannot hold rendering back forever.
// Example written for this skill; read it, don't paste it.

package com.example.sample.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlin.math.max

/*
 * Why this file exists: a snapshotter that was handed a box size in pixels, then multiplied it
 * by density a second time, rendered a card's thumbnail at roughly 14x the pixels it would ever
 * show — tens of megabytes of GPU memory per thumbnail, shrunk back down every frame it was
 * composited. The fix has three parts, each below: render at the box's actual pixel size;
 * resample in halving steps rather than one big bilinear jump; and cache by the bytes a bitmap
 * actually costs, not by how many bitmaps happen to be cached.
 */

private const val CacheVersion = 3 // bump and old-version entries are dropped on next write
private val MaxCacheBytes = { maxHeap: Long -> minOf(64L * 1024 * 1024, maxHeap / 4) }

/** Keyed, byte-sized bitmap cache: `sizeOf` reports real memory cost, not "1 per entry". */
class ThumbnailMemoryCache(maxHeapBytes: Long) {
    private val cache = object : LruCache<String, Bitmap>(MaxCacheBytes(maxHeapBytes).toInt()) {
        override fun sizeOf(key: String, value: Bitmap): Int =
            value.byteCount // w * h * bytesPerPixel; a 14x-oversized bitmap costs 14x the budget
    }

    fun get(key: String): Bitmap? = cache.get(key)

    fun put(key: String, bitmap: Bitmap) {
        cache.put(versionedKey(key), bitmap)
    }

    private fun versionedKey(key: String) = "$key-v$CacheVersion"

    /**
     * Mirrors `ComponentCallbacks2.onTrimMemory`: evict everything at BACKGROUND and above
     * (the process is about to be invisible, nothing here will be drawn soon), half at
     * UI_HIDDEN (the UI is gone but the process may come back quickly), and everything at
     * RUNNING_LOW / RUNNING_CRITICAL regardless of UI visibility.
     */
    fun onTrimMemory(level: Int) {
        when {
            level >= android.content.ComponentCallbacks2.TRIM_MEMORY_BACKGROUND -> cache.evictAll()
            level == android.content.ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN ->
                cache.trimToSize(cache.size() / 2)
            level >= android.content.ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW -> cache.evictAll()
        }
    }

    /** Called when a run/session starts: a fresh context, no reason to hold the old frames. */
    fun releaseAll() = cache.evictAll()
}

/**
 * Resamples [source] down to [targetWidth] x [targetHeight] in halving steps, with one final
 * non-halving step. A single bilinear downsample across a large factor (say, 4x) averages each
 * output pixel from a block of input pixels so coarse that most of the block's own detail is
 * skipped rather than blended — the image is thinner on information than its pixel count
 * suggests. Halving at each step keeps every sample average small and representative.
 */
fun shrink(source: Bitmap, targetWidth: Int, targetHeight: Int): Bitmap {
    var current = source
    for (step in shrinkSteps(current.width, current.height, targetWidth, targetHeight)) {
        val next = Bitmap.createScaledBitmap(current, step.first, step.second, true)
        if (current !== source) current.recycle()
        current = next
    }
    return current
}

/** Produces the halving width/height steps down to the target, finishing on the exact target. */
fun shrinkSteps(fromW: Int, fromH: Int, toW: Int, toH: Int): List<Pair<Int, Int>> {
    val steps = mutableListOf<Pair<Int, Int>>()
    var w = fromW
    var h = fromH
    while (w / 2 >= toW && h / 2 >= toH) {
        w = max(w / 2, toW)
        h = max(h / 2, toH)
        steps += w to h
    }
    steps += toW to toH
    return steps
}

/**
 * Decodes a path thumbnail off the main thread, preferring a hardware bitmap when the decode
 * path allows one. A HARDWARE bitmap already lives on the GPU, so `prepareToDraw()` on it is a
 * no-op; call it anyway on every bitmap that decoded as software (the fallback path, and any
 * freshly rendered/scaled bitmap, which can't be HARDWARE), on the same background thread,
 * so the GPU upload happens before the first frame that draws it rather than during it.
 */
suspend fun decodeThumbnail(bytes: ByteArray, targetWidth: Int, targetHeight: Int): Bitmap {
    val options = BitmapFactory.Options().apply {
        inPreferredConfig = Bitmap.Config.HARDWARE
    }
    val decoded = runCatching { BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) }
        .getOrNull()
        ?: BitmapFactory.decodeByteArray(bytes, 0, bytes.size) // software fallback

    val resized = shrink(decoded, targetWidth, targetHeight)
    if (resized.config != Bitmap.Config.HARDWARE) {
        resized.prepareToDraw() // uploads now, off this draw's frame budget
    }
    return resized
}

/**
 * A render queue paused by a set of named reasons rather than one boolean: a list that pauses
 * rendering for "scroll" and a transition that separately pauses it for "transition" must each
 * be able to let go of their own reason without un-pausing the other's. Renders rest
 * [RenderRestMillis] apart once resumed, and a render waiting on a pause that never lifts times
 * out after [RenderTimeoutMillis] rather than blocking its thumbnail forever.
 */
object RenderQueue {
    private const val RenderRestMillis = 120L
    private const val RenderTimeoutMillis = 20_000L

    private val mutex = Mutex()
    private val pauseReasons = mutableSetOf<String>()
    private var lastRenderAt = 0L

    /** Give the reason back on dispose — a list torn down mid-fling must not leave its
     *  reason in the set, or the queue never resumes for anyone else. */
    fun setPaused(paused: Boolean, reason: String = "default") {
        if (paused) pauseReasons += reason else pauseReasons -= reason
    }

    suspend fun <T> submit(render: suspend () -> T): T? {
        val deadline = System.currentTimeMillis() + RenderTimeoutMillis
        while (pauseReasons.isNotEmpty()) {
            if (System.currentTimeMillis() > deadline) return null // give up, don't block forever
            delay(50)
        }
        return mutex.withLock {
            val waitFor = (lastRenderAt + RenderRestMillis) - System.currentTimeMillis()
            if (waitFor > 0) delay(waitFor)
            lastRenderAt = System.currentTimeMillis()
            render()
        }
    }
}

/**
 * Typical call sites: a list pauses rendering while it scrolls, a page transition pauses it
 * while it runs, and both give their reason back unconditionally on dispose so a torn-down
 * composable can never leave the queue stuck.
 *
 * LaunchedEffect(listState.isScrollInProgress) { RenderQueue.setPaused(listState.isScrollInProgress) }
 * DisposableEffect(Unit) { onDispose { RenderQueue.setPaused(false) } }
 * LaunchedEffect(transition.isRunning) { RenderQueue.setPaused(transition.isRunning, "transition") }
 */
