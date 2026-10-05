package com.flick.receiver.util

/**
 * The platform's "no preference" value. Both
 * `WindowManager.LayoutParams.preferredRefreshRate` and `Surface.setFrameRate`
 * document 0 as "the system chooses", and neither offers a separate clear call —
 * re-applying 0 is the only way to give a rate hint back.
 */
const val SYSTEM_DEFAULT_REFRESH_RATE = 0f

/**
 * Which refresh rate the window must be asking for RIGHT NOW.
 *
 * Matching the film's own cadence is what removes 3:2 judder on 23.976/24/25 fps
 * material, so the hint is correct while a film is presenting — and only then.
 * Applied as a one-way latch it outlives the cast: once playback ends the decoder
 * reports a frame rate of 0, an `if (fps > 0)` apply branch is simply skipped, and
 * the film's 24 Hz hint keeps pinning the pairing, idle and settings surfaces —
 * every spring, fade and focus lift on them — to 24 steps a second for the rest of
 * the process. Deriving the hint from current state is what makes that impossible.
 *
 * A frame rate that is not a real cadence (0 before the format is known, NaN, an
 * infinity) releases rather than pins: there is nothing to match, and a bad value
 * handed to the platform is worse than no hint at all.
 */
fun preferredWindowRefreshRate(
    presentingVideo: Boolean,
    contentFrameRate: Float,
): Float = if (presentingVideo && contentFrameRate.isFinite() && contentFrameRate > 0f) {
    contentFrameRate
} else {
    SYSTEM_DEFAULT_REFRESH_RATE
}

/**
 * How long a release waits out a cast handshake.
 *
 * A cast arriving over a running film — the next episode, or the SAME film
 * re-prepared because a subtitle was attached mid-watch — passes through the
 * check/prepare stages, where nothing is presenting yet and the old film is still
 * decoding under the connecting cover. Releasing there and re-pinning a second
 * later at the same cadence costs two display-mode switches, and each one is a
 * real HDMI resync on the verified hardware: the viewer pays a black frame twice
 * for a hint that never actually needed to change. Probe plus prepare on a LAN
 * file lands far inside this window, so the ordinary re-cast costs none.
 *
 * A settle, not a hold: the startup deadline is 18 s, and a handshake that stalls
 * may not keep the panel pinned to a finished film's cadence for it.
 */
const val CAST_HANDSHAKE_SETTLE_MS = 2_000L

/**
 * How long the window must wait before it commits [requestedRate].
 *
 * Only a release is ever deferred, and only across a handshake. Pinning is always
 * immediate, and playback ending, an error and disposal all release at once —
 * that immediate release is what hands the pairing, idle and settings surfaces
 * back to the panel's own refresh rate.
 */
fun refreshRateHintDelayMs(
    requestedRate: Float,
    castHandshakeInFlight: Boolean,
): Long = if (castHandshakeInFlight && requestedRate == SYSTEM_DEFAULT_REFRESH_RATE) {
    CAST_HANDSHAKE_SETTLE_MS
} else {
    0L
}
