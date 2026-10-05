package com.flick.sender.ui.components

import android.os.Build
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.BoundsTransform
import androidx.compose.animation.EnterExitState
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.animation.core.snap
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.flick.sender.R
import com.flick.sender.model.MediaItem
import com.flick.sender.model.PlaybackUiState
import com.flick.sender.ui.displayName
import com.flick.sender.net.FlickController
import com.flick.sender.ui.theme.FlickCorners
import com.flick.sender.ui.theme.FlickGradients
import com.flick.sender.ui.theme.FlickIcons
import com.flick.sender.ui.theme.FlickText
import com.flick.sender.ui.theme.Ink
import com.flick.sender.ui.theme.LocalFlickColors
import com.flick.sender.ui.theme.Motion
import com.flick.sender.ui.theme.flickGlass
import com.flick.sender.ui.theme.pressScale
import com.flick.sender.ui.theme.rememberReduceMotion
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeEffect
import kotlinx.coroutines.flow.dropWhile
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/** The dock's own height and the air it keeps between itself and the nav pill. */
private val DockHeight = 66.dp
private val DockGap = 10.dp
private val DockHairline = 3.dp
private val DockThumb = 48.dp
private val DockKeySize = 48.dp

/** The bar's resting corner, and what it eases into once the card owns the window. */
private val DockCorner = FlickCorners.warning
private val CardCorner = 0.dp

/**
 * How far outside the bar its own elevation shadow reaches. The travelling clip has to
 * leave that much room around the bar's end of the morph, or the shadow is cut off on the
 * flight's first frame and handed back on its last — a blink at both ends of a transform
 * whose whole point is that nothing about it is a cut.
 */
private val DockShadowBleed = 32.dp

/** Fraction of the card's growth the corner radius is resolved over. */
private const val CornerResolve = 0.7f

/** Room a screen that reserves its own bottom padding has to add while a cast is live. */
internal val NowPlayingDockClearance: Dp = DockHeight + DockGap

/**
 * The one container transform in the shell. Both ends declare it — the dock here, the
 * remote's route container in the shell — so the bar's bounds ARE the card's bounds.
 */
private const val RemoteCardKey = "remote-card"

/**
 * The live-cast dock. A cast that is playing has to be visible while the user browses,
 * not only once they open the remote — so this rides directly above the floating nav
 * and carries the frame, the title, the TV, one transport key and the session clock.
 *
 * It docks with the nav rather than with a route, so [allowed] is the shell's judgment
 * about where there is room for it; the cast record decides the rest.
 *
 * [morphing] is the shell's answer to "is the surface on the other side of this flip the
 * remote". When it is, the bar neither rises nor falls: its own bounds become the card,
 * and any enter/exit of its own would be a second motion fighting that one.
 *
 * [flight] is the shell's identity for the route flip in progress. [morphing] stays true
 * across back-to-back flights, so it cannot say when a new one has begun; this can.
 *
 * [hazeState] is the shell's one haze source, taken at the route boundary. The dock is a
 * sibling of the nav pill in the same bottom stack, so the route it blurs is already in
 * there and this surface needs no source of its own.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
internal fun NowPlayingDock(
    controller: FlickController,
    allowed: Boolean,
    morphing: Boolean,
    flight: Any,
    hazeState: HazeState,
    sharedScope: SharedTransitionScope?,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val motionScheme = MaterialTheme.motionScheme
    val reduceMotion = rememberReduceMotion()
    val item by controller.castingItem.collectAsState()
    val tv by controller.connectedTv.collectAsState()
    // Kept as State: the session clock ticks ~10x/s and stops at the hairline's draw
    // scope rather than reaching the library behind it.
    val playback = controller.playback.collectAsState()
    val departing = rememberDeparting(item)
    val tvName = tv?.name ?: stringResource(R.string.np_tv_generic)

    AnimatedVisibility(
        visible = allowed && item != null,
        modifier = modifier,
        enter = if (reduceMotion || morphing) {
            EnterTransition.None
        } else {
            fadeIn(motionScheme.defaultEffectsSpec()) +
                slideInVertically(motionScheme.defaultSpatialSpec()) { it }
        },
        exit = if (reduceMotion || morphing) {
            ExitTransition.None
        } else {
            fadeOut(motionScheme.fastEffectsSpec()) +
                slideOutVertically(motionScheme.defaultSpatialSpec()) { it }
        },
        label = "dock",
    ) {
        if (departing != null) {
            DockBar(
                item = departing,
                tvName = tvName,
                playback = playback,
                hazeState = hazeState,
                morphing = morphing,
                flight = flight,
                sharedScope = sharedScope,
                // The bar is the surface being left only when it is on its way out INTO
                // the remote; every other departure is the cast itself ending.
                morphBounds = Modifier.remoteCardBounds(
                    sharedScope = sharedScope,
                    animatedScope = this@AnimatedVisibility,
                    leaving = morphing &&
                        transition.targetState == EnterExitState.PostExit,
                    // Only this end of the morph carries a shadow, and only the shadow
                    // lives outside the silhouette: the bar clips its own content to its
                    // own corner, so the extra room can never let anything else escape.
                    shadowBleed = DockShadowBleed,
                ),
                onOpen = onOpen,
                onPlayPause = { controller.playPause() },
            )
        }
    }
}

/**
 * Declares one end of the dock↔remote container transform.
 *
 * Both ends run on the same key, the same spring and the same travelling clip, so
 * minimizing is the identical geometry read backwards. [leaving] is what makes the
 * cross-fade legible in either direction: the surface being left keeps full opacity and
 * dissolves off an arrival that is already opaque underneath it, which is the only
 * ordering in which the card never shows the screen behind it through itself and neither
 * end is a cut. [shadowBleed] is room the travelling clip leaves outside the silhouette
 * for an end that draws an elevation shadow — an end that draws none must ask for zero,
 * or its own surface would spill past the card's edge. Both scopes null leaves the
 * modifier inert.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
internal fun Modifier.remoteCardBounds(
    sharedScope: SharedTransitionScope?,
    animatedScope: AnimatedVisibilityScope?,
    leaving: Boolean,
    shadowBleed: Dp = 0.dp,
): Modifier {
    if (sharedScope == null || animatedScope == null) return this
    val reduceMotion = rememberReduceMotion()
    val travel = Motion.cardMorphSpec(
        MaterialTheme.motionScheme.defaultSpatialSpec<Rect>(),
        visibilityThreshold = Motion.cardMorphTravelThreshold,
    )
    val dissolve = Motion.cardMorphSpec(MaterialTheme.motionScheme.defaultSpatialSpec<Float>())
    val bounds = remember(reduceMotion, travel) {
        BoundsTransform { _, _ -> if (reduceMotion) snap<Rect>() else travel }
    }
    val clip = rememberCardMorphClip(sharedScope, shadowBleed)
    return with(sharedScope) {
        this@remoteCardBounds.sharedBounds(
            sharedContentState = rememberSharedContentState(RemoteCardKey),
            animatedVisibilityScope = animatedScope,
            // Never a fade in: the arrival has to be opaque from the first frame so the
            // card cannot be seen through while it travels.
            enter = EnterTransition.None,
            exit = if (leaving && !reduceMotion) fadeOut(dissolve) else ExitTransition.None,
            boundsTransform = bounds,
            zIndexInOverlay = if (leaving) 1f else 0f,
            clipInOverlayDuringTransition = clip,
        )
    }
}

/**
 * The silhouette an end of the morph is clipped to while it travels. The radius is a
 * function of the container's own height rather than of a second animation, so it cannot
 * drift out of step with the bounds it is rounding: it IS the bar's corner at the bar's
 * height, and it has reached the card's square edge before the card is full size, so
 * neither end of the flight snaps. [shadowBleed] widens it without widening the radius's
 * reading of how far the container has grown.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
private fun rememberCardMorphClip(
    sharedScope: SharedTransitionScope,
    shadowBleed: Dp,
): SharedTransitionScope.OverlayClip {
    val density = LocalDensity.current
    val screenHeightDp = LocalConfiguration.current.screenHeightDp
    val shape = remember(density, screenHeightDp, shadowBleed) {
        with(density) {
            CardMorphShape(
                barHeightPx = DockHeight.toPx(),
                // Deliberately shorter than the travel: the radius has to be all the way
                // home BEFORE the card is, because the clip is handed back at the end of
                // the flight and a radius still easing at that moment would snap.
                spanPx = ((screenHeightDp.dp.toPx() - DockHeight.toPx()) * CornerResolve)
                    .coerceAtLeast(1f),
                barRadiusPx = DockCorner.toPx(),
                cardRadiusPx = CardCorner.toPx(),
                bleedPx = shadowBleed.toPx(),
            )
        }
    }
    return remember(sharedScope, shape) { with(sharedScope) { OverlayClip(shape) } }
}

private class CardMorphShape(
    private val barHeightPx: Float,
    private val spanPx: Float,
    private val barRadiusPx: Float,
    private val cardRadiusPx: Float,
    private val bleedPx: Float,
) : Shape {
    override fun createOutline(
        size: Size,
        layoutDirection: LayoutDirection,
        density: Density,
    ): Outline {
        // Measured off the bounds, never off the bled outline: the radius answers how far
        // the container has grown, and the room left for a shadow is not growth.
        val grown = ((size.height - barHeightPx) / spanPx).coerceIn(0f, 1f)
        val radius = barRadiusPx + (cardRadiusPx - barRadiusPx) * grown
        return Outline.Rounded(
            RoundRect(
                left = -bleedPx,
                top = -bleedPx,
                right = size.width + bleedPx,
                bottom = size.height + bleedPx,
                cornerRadius = CornerRadius(radius + bleedPx),
            ),
        )
    }
}

/**
 * The cast record clears the moment the TV stops, and the bar still has to leave with
 * the title it was showing.
 */
@Composable
private fun rememberDeparting(item: MediaItem?): MediaItem? {
    val held = remember { mutableStateOf<MediaItem?>(null) }
    LaunchedEffect(item) { if (item != null) held.value = item }
    return item ?: held.value
}

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
private fun DockBar(
    item: MediaItem,
    tvName: String,
    playback: State<PlaybackUiState>,
    hazeState: HazeState,
    morphing: Boolean,
    flight: Any,
    sharedScope: SharedTransitionScope?,
    morphBounds: Modifier,
    onOpen: () -> Unit,
    onPlayPause: () -> Unit,
) {
    val colors = LocalFlickColors.current
    val displayName = item.displayName()
    val shape = RoundedCornerShape(DockCorner)
    val openSource = remember { MutableInteractionSource() }
    val imageLoader = rememberVideoImageLoader()
    val request = rememberVideoFrameRequest(item.uri, item.durationMs)
    val playing by remember(playback) { derivedStateOf { playback.value.playing } }
    val description = stringResource(R.string.a11y_now_playing_dock, displayName, tvName)
    val openLabel = stringResource(R.string.a11y_open_remote)
    val track = colors.fillTrack
    // The played hairline is the scrub bar's own fill in miniature, so it takes the media
    // role rather than the accent — the accent is a blue in dark, and this line has to be
    // the same substance as the fill the remote shows for the same position.
    val played = colors.playheadLo
    // The dock is cut from the same material as the pill it rides on — same blur, same
    // noise, same tint recipe — and differs only in how much of the route it lets through.
    // See [DockBackdropVisibility] for why the upper of two stacked glass surfaces is the
    // thinner one.
    val hazeStyle = remember(colors) {
        HazeStyle(
            tints = glassHazeTints(colors, DockBackdropVisibility).map { HazeTint(it) },
            blurRadius = GlassBlurRadius,
            noiseFactor = GlassNoiseFactor,
            fallbackTint = HazeTint(glassFallbackTint(colors, DockBackdropVisibility)),
        )
    }
    val blurAvailable = navBackdropBlurEnabled(Build.VERSION.SDK_INT)
    val glass = rememberDockGlass(morphing, flight, blurAvailable, sharedScope)
    val backdropEffect = Modifier.hazeEffect(state = hazeState, style = hazeStyle) {
        // Same floor as the nav's, and for the same reason — see [navBackdropBlurEnabled].
        blurEnabled = blurAvailable
        // Read here rather than in composition: this block is observed by the effect node
        // itself, so the fade repaints the blur layer it already has — never a new node,
        // never a new RenderEffect, never a recomposition of the bar.
        alpha = glass.value.coerceIn(DockGlassFlat, DockGlassBlurred)
    }
    // The material the bar is painted with while the container transform runs, and the
    // reason the blur stands down for it. A hazeEffect node samples the source through its
    // OWN resolved coordinates, and for the length of the flight this bar is drawn in the
    // shared-transition overlay rather than where it lives — so the backdrop it would
    // sample is not the one lying under the silhouette the viewer is watching. Nor could it
    // be cut to that silhouette if it were: flickGlass clips the effect to [shape], which
    // is the bar's resting corner, while the travelling clip is easing the corner from that
    // corner to the card's square edge for the whole flight.
    //
    // The flat tint is the style's own fallbackTint — the colour Haze itself paints where
    // there is no blur — so the fade changes only whether the backdrop is blurred, never the
    // hue or the weight of the material. A different colour here would be a pop at the one
    // moment the bar has to read as the same object as the card it is becoming.
    val flatTint = remember(colors) { glassFallbackTint(colors, DockBackdropVisibility) }

    Box(
        Modifier
            .fillMaxWidth()
            .padding(bottom = DockGap)
            // Declared ABOVE the press response: the overlay redraws only what is below
            // this line while the card is in flight, so a press still springing back when
            // the tap opens the remote has to finish INSIDE the card. Left outside, that
            // spring would settle on a placeholder nobody can see and the flight's first
            // frame would be a cut back to full size.
            .then(morphBounds)
            // The whole bar answers a press on it, but only the left region opens the
            // remote: the transport key beside it is a second, separate target.
            .pressScale(openSource)
            .flickGlass(
                colors = colors,
                shape = shape,
                // Read in the draw scope, and the other half of the same fade: the blur layer
                // carries its own tints, so the flat tint only makes up what it has not yet
                // brought in. At rest this is the transparent fill [glassBackdropFill] names.
                fill = {
                    flatTint.copy(alpha = dockFlatTintAlpha(flatTint.alpha, glass.value))
                },
                showSheen = navShowsGlassSheen(colors),
                backdropEffect = backdropEffect,
            )
            .clip(shape)
            .drawBehind {
                // Read in the draw scope: the clock must repaint the hairline without
                // recomposing the bar or the grid under it.
                val height = DockHairline.toPx()
                val top = size.height - height
                drawRect(track, topLeft = Offset(0f, top), size = Size(size.width, height))
                val fraction = playback.value.confirmedFraction
                if (fraction > 0f) {
                    drawRect(played, topLeft = Offset(0f, top), size = Size(size.width * fraction, height))
                }
            },
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = DockHeight)
                .padding(9.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                modifier = Modifier
                    .weight(1f)
                    .clickable(
                        interactionSource = openSource,
                        indication = null,
                        onClickLabel = openLabel,
                        role = Role.Button,
                        onClick = onOpen,
                    )
                    .semantics(mergeDescendants = true) { contentDescription = description },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AsyncImage(
                    model = request,
                    contentDescription = null,
                    imageLoader = imageLoader,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(DockThumb)
                        .clip(RoundedCornerShape(FlickCorners.previewThumb))
                        .background(colors.surfaceRaisedAlt),
                )
                Spacer(Modifier.width(11.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        text = displayName,
                        style = FlickText.labelLarge.copy(color = colors.onSurface),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(5.dp),
                        modifier = Modifier.padding(top = 2.dp),
                    ) {
                        Icon(
                            FlickIcons.Cast,
                            contentDescription = null,
                            tint = colors.onSurfaceDim,
                            modifier = Modifier.size(13.dp),
                        )
                        Text(
                            text = tvName,
                            style = FlickText.bodySmall.copy(color = colors.onSurfaceDim),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                Spacer(Modifier.width(8.dp))
            }
            DockKey(playing = playing, onClick = onPlayPause)
        }
    }
}

/**
 * How far the dock's material has come back from the flat slab it flies as (0) to the
 * blurred glass it rests as (1).
 *
 * It goes flat quickly as the bar lifts into the card, and comes back only once the
 * transform has handed the bar back to its own seat: before then the blur would be sampled
 * where the bar lives rather than where it is drawn. The shell's latch is the fallback for
 * a flight whose end is never observed, and it can only ever be later than the hand-back.
 * Seeded from [morphing] so a bar that is born mid-flight starts flat instead of fading
 * out; a flip mid-fade carries on from wherever the material has got to.
 *
 * Restarted per [flight], never per [morphing]: the shell holds that true across a second
 * flight launched before the first one's latch, which must still go flat, and the latch
 * releasing is only ever the end of a wait — restarting on it would cancel a fade-in in
 * flight and start its spring again from rest. The fades run in the composition's scope
 * for the same reason, so a restart that leaves the target unchanged leaves them running.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
private fun rememberDockGlass(
    morphing: Boolean,
    flight: Any,
    blurEnabled: Boolean,
    sharedScope: SharedTransitionScope?,
): Animatable<Float, AnimationVector1D> {
    val motionScheme = MaterialTheme.motionScheme
    val reduceMotion = rememberReduceMotion()
    val glass = remember { Animatable(dockGlassTarget(morphing, blurEnabled)) }
    val fades = rememberCoroutineScope()
    val morphingNow = rememberUpdatedState(morphing)
    val fadeOut = rememberUpdatedState(Motion.orSnap(reduceMotion, motionScheme.fastEffectsSpec<Float>()))
    val fadeIn = rememberUpdatedState(Motion.orSnap(reduceMotion, motionScheme.defaultEffectsSpec<Float>()))
    LaunchedEffect(flight, blurEnabled, sharedScope) {
        if (dockGlassTarget(morphingNow.value, blurEnabled) == DockGlassFlat) {
            // Launched, not awaited: the hand-back is watched from the flight's first frame,
            // and the fade-in that answers it takes over from wherever this has got to.
            fades.launch { glass.animateTo(DockGlassFlat, fadeOut.value) }
            // Waits for the flight to BEGIN before waiting for it to end: on the frame the
            // route flips, nothing is in the air yet.
            snapshotFlow { (sharedScope?.isTransitionActive == true) to morphingNow.value }
                .dropWhile { (active, morph) -> dockAwaitingFlight(active, morph) }
                .first { (active, morph) -> dockHandedBack(active, morph) }
        }
        if (!(glass.isRunning && glass.targetValue == DockGlassBlurred)) {
            fades.launch { glass.animateTo(DockGlassBlurred, fadeIn.value) }
        }
    }
    return glass
}

/** The flight this bar is flat for has not left the ground, and the latch still holds it. */
internal fun dockAwaitingFlight(transitionActive: Boolean, morphing: Boolean): Boolean =
    !transitionActive && morphing

/** Once the flight has begun: it has landed, or the shell's latch has let the bar go. */
internal fun dockHandedBack(transitionActive: Boolean, morphing: Boolean): Boolean =
    !transitionActive || !morphing

internal const val DockGlassFlat = 0f
internal const val DockGlassBlurred = 1f

/**
 * Where the dock's material is headed. Below the blur floor the style paints its fallback
 * tint, which is already the flat slab's colour and samples nothing, so there the bar never
 * has anything to stand down.
 */
internal fun dockGlassTarget(morphing: Boolean, blurEnabled: Boolean): Float =
    if (morphing && blurEnabled) DockGlassFlat else DockGlassBlurred

/**
 * Opacity of the flat tint painted over a blur layer that is itself at [glass] opacity.
 *
 * The layer already carries the same tint at [tintAlpha], so painting the flat tint at
 * `tintAlpha * (1 - glass)` would double-count the overlap and thin the material through
 * the middle of the fade. This is the share that keeps the tint's total coverage at
 * [tintAlpha] for every [glass] — so the fade changes only how blurred the backdrop is,
 * which is the whole of what it is for.
 */
internal fun dockFlatTintAlpha(tintAlpha: Float, glass: Float): Float {
    val g = glass.coerceIn(DockGlassFlat, DockGlassBlurred)
    val remaining = 1f - g * tintAlpha
    return if (remaining <= 0f) 0f else tintAlpha * (1f - g) / remaining
}

/** The remote's amber FAB, shrunk to one key. Same glyph, same morph, same ink. */
@Composable
private fun DockKey(playing: Boolean, onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val label = stringResource(if (playing) R.string.a11y_pause else R.string.a11y_play)
    val state = stringResource(if (playing) R.string.a11y_playing_state else R.string.a11y_paused_state)
    Box(
        modifier = Modifier
            .size(DockKeySize)
            .pressScale(source)
            .clip(CircleShape)
            // The same brush and the same ink as the remote's FAB, not a flat accent: this
            // key morphs into that FAB, and a shared-element flight that changes hue in the
            // air is the most visible thing a palette swap can produce. The accent is a blue
            // in dark and would also land at 2.64:1 on the dock's own glass.
            .background(FlickGradients.fab)
            // No haptic here: PlaybackSession already pulses the vibrator when it sends
            // the command, and the two would answer one tap twice.
            .clickable(interactionSource = source, indication = null, onClick = onClick)
            .semantics(mergeDescendants = true) {
                role = Role.Button
                contentDescription = label
                stateDescription = state
            },
        contentAlignment = Alignment.Center,
    ) {
        PlayPauseMorph(
            playing = playing,
            color = Ink,
            modifier = Modifier.size(21.dp),
        )
    }
}
