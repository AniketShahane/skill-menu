package com.flick.receiver.util

import android.os.Build
import android.view.Surface
import android.view.Window

/**
 * Best-effort refresh-rate matching to avoid 3:2 judder when the content frame
 * rate (e.g. 23.976 / 24 / 25 fps) does not divide the panel's default refresh
 * rate. Two complementary hints are applied once the frame rate is known:
 *
 *  1. [applyToWindow]: sets [android.view.WindowManager.LayoutParams.preferredRefreshRate],
 *     the app-level hint the platform uses to pick a matching display mode.
 *  2. [applyToSurface]: calls [Surface.setFrameRate] on API 30+ (the direct
 *     MATCH_CONTENT_FRAME_RATE mechanism). ExoPlayer also does this internally
 *     on the surface it owns; issuing it explicitly documents/forces the intent.
 *
 * Both hints are RELEASED by re-applying [SYSTEM_DEFAULT_REFRESH_RATE] — the
 * platform exposes no clear call, and a hint nothing ever withdraws survives the
 * film that justified it. [preferredWindowRefreshRate] decides which of the two
 * this helper is being asked for; nothing here latches.
 *
 * Everything here is guarded and swallowed on failure — refresh-rate switching
 * is a nice-to-have, never a hard requirement.
 */
object RefreshRateHelper {

    fun applyToWindow(window: Window, frameRate: Float) {
        if (frameRate < 0f) return
        runCatching {
            val params = window.attributes
            // Assigning the attributes dispatches a window relayout, so a hint
            // that has not actually changed is never written.
            if (params.preferredRefreshRate == frameRate) return@runCatching
            params.preferredRefreshRate = frameRate
            window.attributes = params
        }
    }

    /** Hands the display back to the mode the system would pick on its own. */
    fun releaseWindow(window: Window) {
        applyToWindow(window, SYSTEM_DEFAULT_REFRESH_RATE)
    }

    fun applyToSurface(surface: Surface?, frameRate: Float) {
        if (surface == null || !surface.isValid || frameRate < 0f) return
        // A released rate carries no source cadence to be compatible with, so the
        // FIXED_SOURCE claim is dropped along with the rate it described.
        val compatibility = if (frameRate == SYSTEM_DEFAULT_REFRESH_RATE) {
            Surface.FRAME_RATE_COMPATIBILITY_DEFAULT
        } else {
            Surface.FRAME_RATE_COMPATIBILITY_FIXED_SOURCE
        }
        runCatching {
            when {
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
                    surface.setFrameRate(
                        frameRate,
                        compatibility,
                        Surface.CHANGE_FRAME_RATE_ALWAYS,
                    )
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.R ->
                    @Suppress("DEPRECATION")
                    surface.setFrameRate(
                        frameRate,
                        compatibility,
                    )
            }
        }
    }

    fun releaseSurface(surface: Surface?) {
        applyToSurface(surface, SYSTEM_DEFAULT_REFRESH_RATE)
    }
}
