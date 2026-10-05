package com.flick.sender.ui.components

import android.app.ActivityManager
import android.content.Context
import android.graphics.drawable.BitmapDrawable
import android.net.Uri
import android.util.Size as AndroidSize
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.BoundsTransform
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.VisibilityThreshold
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.indication
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.isSpecified
import androidx.compose.ui.unit.sp
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.decode.DataSource
import coil.decode.VideoFrameDecoder
import coil.fetch.DrawableResult
import coil.fetch.Fetcher
import coil.memory.MemoryCache
import coil.request.ImageRequest
import coil.request.Options
import coil.request.videoFrameMillis
import coil.size.Dimension
import coil.size.Precision
import com.flick.sender.R
import com.flick.sender.media.ResumeProgress
import com.flick.sender.media.VideoStills
import com.flick.sender.model.HdrType
import com.flick.sender.model.MediaItem
import com.flick.sender.ui.Format
import com.flick.sender.ui.displayName
import com.flick.sender.ui.theme.FlickCorners
import com.flick.sender.ui.theme.FlickGradients
import com.flick.sender.ui.theme.FlickIcons
import com.flick.sender.ui.theme.FlickText
import com.flick.sender.ui.theme.LocalFlickColors
import com.flick.sender.ui.theme.PillShape
import com.flick.sender.ui.theme.TileShadow
import com.flick.sender.ui.theme.flickRipple
import com.flick.sender.ui.theme.pressMorph
import com.flick.sender.ui.theme.pressScale
import com.flick.sender.ui.theme.rememberReduceMotion

// One process-wide loader (application-scoped) so the video-frame memory cache
// survives navigation. Building a fresh ImageLoader per screen visit threw the cache
// away on every Library <-> Detail hop — re-running an expensive frame extract on every
// visible 4K tile — and leaked the abandoned loaders until GC. Keyed off the
// application context so it never holds an Activity.
@Volatile
private var sharedVideoImageLoader: ImageLoader? = null
private val videoImageLoaderLock = Any()

/**
 * The app-scoped Coil [ImageLoader] that decodes a still frame straight out of a local
 * video (design: the tiles are filmic stills, not generic icons).
 */
@Composable
fun rememberVideoImageLoader(): ImageLoader {
    val appContext = LocalContext.current.applicationContext
    return sharedVideoImageLoader ?: synchronized(videoImageLoaderLock) {
        sharedVideoImageLoader ?: ImageLoader.Builder(appContext)
            .components { add(VideoFrameDecoder.Factory()) }
            .crossfade(true)
            // An absolute ceiling keeps a large-heap phone from turning a proportional
            // default into an oversized gallery cache. The proportional half still lets
            // the platform's low-memory verdict shrink it further.
            .memoryCache {
                MemoryCache.Builder(appContext)
                    .maxSizeBytes(frameCacheBudgetBytes(appContext))
                    .build()
            }
            .build()
            .also { sharedVideoImageLoader = it }
    }
}

/**
 * The smaller of a conservative heap share and a hard byte ceiling. Low-RAM devices get
 * both a smaller share and a smaller ceiling.
 */
private fun frameCacheBudgetBytes(context: Context): Int {
    val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
    return frameCacheBudgetBytes(
        memoryClassMb = activityManager?.memoryClass?.takeIf { it > 0 } ?: DefaultMemoryClassMb,
        lowRam = activityManager?.isLowRamDevice == true,
    )
}

internal fun frameCacheBudgetBytes(memoryClassMb: Int, lowRam: Boolean): Int {
    val heapBytes = memoryClassMb.coerceAtLeast(1).toLong() * BytesPerMiB
    val proportional = heapBytes / if (lowRam) LowRamBudgetDivisor else FrameBudgetDivisor
    val cap = if (lowRam) LowRamFrameCacheCapBytes else FrameCacheCapBytes
    return minOf(proportional, cap.toLong()).toInt()
}

private const val BytesPerMiB = 1_048_576L
private const val DefaultMemoryClassMb = 96
private const val FrameBudgetDivisor = 8L
private const val LowRamBudgetDivisor = 12L
private const val FrameCacheCapBytes = 16 * 1_048_576
private const val LowRamFrameCacheCapBytes = 8 * 1_048_576

// Library and Detail ask at their own sizes; the cast surfaces take the larger box because
// a poster is the biggest a still is ever drawn here. Whatever the size, all of them go
// through the same chosen frame, so the picture a tile shows is the picture that flies into
// the detail sheet and lands on the remote. Detail reads the library entry as its placeholder.
private const val FrameWidthPx = 960
private const val FrameHeightPx = 540
private const val LibraryFrameWidthPx = 512
private const val LibraryFrameHeightPx = 288

/**
 * The still, chosen rather than taken on faith — see [VideoStills]. A frame that judges as
 * a picture of nothing (the black open nearly every film has) is escalated to a small
 * bounded search through the body of the film, off this thread and off any thread the grid
 * can multiply.
 *
 * Returning null hands the request back to Coil's own [VideoFrameDecoder], which decodes
 * the fixed one-third frame the request already names: a file this cannot open at all is
 * drawn exactly as it was before any of this existed.
 */
private object VideoStillFetcher : Fetcher.Factory<Uri> {
    override fun create(data: Uri, options: Options, imageLoader: ImageLoader): Fetcher = Fetcher {
        val target = options.thumbnailTargetSize()
        VideoStills.still(
            context = options.context,
            uri = data,
            durationMs = options.parameters.value<Long>(SourceDurationKey) ?: 0L,
            width = target.width,
            height = target.height,
        )?.let { bitmap ->
            DrawableResult(
                drawable = BitmapDrawable(options.context.resources, bitmap),
                isSampled = true,
                dataSource = DataSource.DISK,
            )
        }
    }
}

private fun Options.thumbnailTargetSize(): AndroidSize = AndroidSize(
    (size.width as? Dimension.Pixels)?.px ?: LibraryFrameWidthPx,
    (size.height as? Dimension.Pixels)?.px ?: LibraryFrameHeightPx,
)

/**
 * The file's own length, carried to the fetcher so the search knows where the middle of the
 * film is. The null cache key is what keeps it OUT of the computed memory-cache key: the
 * duration is a property of the very bytes the URI already names, and letting it in would
 * fork the cache for every surface that rounds it differently.
 */
private fun ImageRequest.Builder.sourceDurationMs(durationMs: Long): ImageRequest.Builder =
    setParameter(SourceDurationKey, durationMs, null)

private const val SourceDurationKey = "flick#source_duration_ms"

internal fun libraryThumbnailCacheKey(
    uri: String,
    dateModifiedSeconds: Long,
    generationModified: Long?,
    mediaStoreVersion: String?,
    sizeBytes: Long,
    durationMs: Long,
    width: Int,
    height: Int,
): String {
    val revision = if (generationModified != null && mediaStoreVersion != null) {
        "generation:${mediaStoreVersion.length}:$mediaStoreVersion:$generationModified"
    } else {
        "legacy:$dateModifiedSeconds:$sizeBytes:$durationMs:${width}x$height"
    }
    return "library-thumb-v2:${uri.length}:$uri:$revision"
}

private fun libraryThumbnailCacheKey(item: MediaItem): String = libraryThumbnailCacheKey(
    uri = item.uriKey,
    dateModifiedSeconds = item.dateModifiedSeconds,
    generationModified = item.generationModified,
    mediaStoreVersion = item.mediaStoreVersion,
    sizeBytes = item.sizeBytes,
    durationMs = item.durationMs,
    width = item.width,
    height = item.height,
)

private fun heroFrameCacheKey(item: MediaItem): String = "${libraryThumbnailCacheKey(item)}:hero"

/** Shared-element key for a library item's still, matched by Library and Detail. */
fun posterKey(itemId: Long): String = "poster-$itemId"

/** Shared-element key for the frame that travels Connecting -> NowPlaying. */
const val CastPosterKey = "cast-poster"

/**
 * The one request builder for local video stills. [crossfade] is a fade of the decode,
 * not of a transition: it belongs on first-sight surfaces only, because a hero landing
 * already carries its own motion.
 */
@Composable
fun rememberVideoFrameRequest(
    uri: Uri?,
    durationMs: Long,
    crossfade: Boolean = false,
    memoryCacheKey: String? = null,
    placeholderMemoryCacheKey: String? = null,
): ImageRequest? {
    val context = LocalContext.current
    return remember(uri, durationMs, crossfade, memoryCacheKey, placeholderMemoryCacheKey) {
        uri?.let {
            ImageRequest.Builder(context)
                .data(it)
                // Where Coil's own decoder looks when every path in the fetcher failed. A
                // third in: the head of a film is usually black or a title card.
                .videoFrameMillis((durationMs / 3L).coerceAtLeast(1_000L))
                .sourceDurationMs(durationMs)
                .size(FrameWidthPx, FrameHeightPx)
                .precision(Precision.INEXACT)
                .crossfade(crossfade)
                .fetcherFactory(VideoStillFetcher, Uri::class.java)
                .apply {
                    memoryCacheKey?.let { key -> memoryCacheKey(key) }
                    placeholderMemoryCacheKey?.let { key -> placeholderMemoryCacheKey(key) }
                }
                .build()
        }
    }
}

@Composable
private fun rememberLibraryThumbnailRequest(item: MediaItem): ImageRequest {
    val context = LocalContext.current
    val cacheKey = libraryThumbnailCacheKey(item)
    return remember(item.uri, item.durationMs, cacheKey) {
        ImageRequest.Builder(context)
            .data(item.uri)
            .videoFrameMillis((item.durationMs / 3L).coerceAtLeast(1_000L))
            .sourceDurationMs(item.durationMs)
            .size(LibraryFrameWidthPx, LibraryFrameHeightPx)
            .precision(Precision.INEXACT)
            .memoryCacheKey(cacheKey)
            .fetcherFactory(VideoStillFetcher, Uri::class.java)
            .crossfade(true)
            .build()
    }
}

@Composable
fun rememberDetailVideoFrameRequest(item: MediaItem): ImageRequest = rememberVideoFrameRequest(
    uri = item.uri,
    durationMs = item.durationMs,
    memoryCacheKey = heroFrameCacheKey(item),
    placeholderMemoryCacheKey = libraryThumbnailCacheKey(item),
)!!

/**
 * The spring every shared frame travels on, spelled out rather than taken from the motion
 * scheme because of the threshold. A spec that names none falls back to a hundredth of a
 * pixel per edge, and the overlay copy is handed back to its parent — corner and all —
 * when the bounds animation ENDS, not when it has visibly landed: a window-sized return
 * settles to the eye in a quarter of a second and does not terminate for three quarters of
 * one. [Rect.VisibilityThreshold] is a pixel per edge, which is where a photograph is
 * actually home. Critically damped for a second reason: a still that springs past its
 * landing reads as a bounce, and nothing about a frame growing out of a grid is bouncy.
 */
private val FrameFlight = spring(
    dampingRatio = Spring.DampingRatioNoBouncy,
    stiffness = Spring.StiffnessMediumLow,
    visibilityThreshold = Rect.VisibilityThreshold,
)

/**
 * The same flight home.
 *
 * Leaving is quicker than arriving here for the reason it already is everywhere else in the
 * shell — the route a frame flies with fades its outgoing half at the scheme's FAST effects
 * spring and its incoming half at the default one. A frame growing out of a grid is the
 * point of the gesture and is worth watching; the same frame going back is a screen the
 * viewer has already finished with, and every millisecond of it is spent waiting.
 *
 * The tempo is the scheme's own fast-spatial stiffness rather than a number chosen for
 * feel. Only the tempo is borrowed: that spring is damped 0.6 and would land the still with
 * a bounce, which is what the note above rules out for both directions. Against the flight
 * out, a spring this much stiffer settles in about seven tenths of the time.
 */
private val FrameReturn = spring(
    dampingRatio = Spring.DampingRatioNoBouncy,
    stiffness = 800f,
    visibilityThreshold = Rect.VisibilityThreshold,
)

/**
 * Whether a flight is a return — the frame is on its way to a seat smaller than the one it
 * left.
 *
 * Read off the geometry rather than declared by the caller, because it is true of every
 * pair this modifier serves: a grid cell grows into a hero, a connecting card grows into
 * the cast poster, and each comes back the other way. An interrupted return that is sent
 * forward again therefore picks the outward spring on its own, which is what a frame that
 * has changed its mind should do.
 */
internal fun frameReturning(from: Rect, to: Rect): Boolean =
    to.width * to.height < from.width * from.height

/**
 * Marks a decoded frame as the surface that becomes the next screen. Both scopes null
 * leaves the modifier inert, so anything composed outside the shell's
 * `SharedTransitionLayout` renders exactly as it did before.
 *
 * [renderInOverlay] must stay true wherever the flight starts or ends inside a clip —
 * a grid cell, a rounded poster — because the overlay copy is the only one that can
 * leave it.
 *
 * [restCorner] is the radius of the SEAT the frame flies out of and back into. An overlay
 * copy is drawn from the transition layout's own draw scope, so every ancestor layer is
 * bypassed — including the one that gives the seat its corner — and the library's default
 * clip resolves to none for a frame that is inside no enclosing shared element. Naming the
 * radius here is what keeps the copy rounded for the whole flight instead of arriving as a
 * hard rectangle and squaring off the moment it lands. Unspecified passes no clip argument
 * at all and leaves that default in force, which is what a seat with no corner wants.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun Modifier.flickSharedFrame(
    sharedScope: SharedTransitionScope?,
    animatedScope: AnimatedVisibilityScope?,
    key: String,
    renderInOverlay: Boolean = true,
    restCorner: Dp = Dp.Unspecified,
): Modifier {
    if (sharedScope == null || animatedScope == null) return this
    val reduceMotion = rememberReduceMotion()
    val bounds = remember(reduceMotion) {
        BoundsTransform { from, to ->
            when {
                reduceMotion -> snap()
                frameReturning(from, to) -> FrameReturn
                else -> FrameFlight
            }
        }
    }
    val clip = if (restCorner.isSpecified) rememberFrameMorphClip(sharedScope, restCorner) else null
    return with(sharedScope) {
        val state = rememberSharedContentState(key)
        if (clip == null) {
            this@flickSharedFrame.sharedElement(
                sharedContentState = state,
                animatedVisibilityScope = animatedScope,
                boundsTransform = bounds,
                renderInOverlayDuringTransition = renderInOverlay,
            )
        } else {
            this@flickSharedFrame.sharedElement(
                sharedContentState = state,
                animatedVisibilityScope = animatedScope,
                boundsTransform = bounds,
                renderInOverlayDuringTransition = renderInOverlay,
                clipInOverlayDuringTransition = clip,
            )
        }
    }
}

/**
 * The silhouette a travelling frame is clipped to. As with the dock's morph, the radius is
 * a function of the copy's own measured height rather than of a second animation, so it
 * cannot drift out of step with the bounds it is rounding.
 *
 * The small end is anchored to the WINDOW and never to the tile: an adaptive grid makes a
 * tile's height a variable, and a small end set under it would leave the radius already
 * part-resolved where the frame comes to rest — which is the snap this exists to remove.
 * A grid still is under an eighth of the window on any phone this ships to, so holding the
 * full radius for everything below [CornerHold] of it puts the corner home well before the
 * bounds are. That margin is what the clip being handed back at the END of the flight
 * requires.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
private fun rememberFrameMorphClip(
    sharedScope: SharedTransitionScope,
    restCorner: Dp,
): SharedTransitionScope.OverlayClip {
    val density = LocalDensity.current
    val screenHeightDp = LocalConfiguration.current.screenHeightDp
    val shape = remember(density, screenHeightDp, restCorner) {
        with(density) {
            val windowPx = screenHeightDp.dp.toPx()
            FrameMorphShape(
                restRadiusPx = restCorner.toPx(),
                seatPx = windowPx * CornerHold,
                spanPx = (windowPx * (1f - CornerHold)).coerceAtLeast(1f),
            )
        }
    }
    return remember(sharedScope, shape) { with(sharedScope) { OverlayClip(shape) } }
}

private class FrameMorphShape(
    private val restRadiusPx: Float,
    private val seatPx: Float,
    private val spanPx: Float,
) : Shape {
    override fun createOutline(
        size: Size,
        layoutDirection: LayoutDirection,
        density: Density,
    ): Outline {
        val grown = ((size.height - seatPx) / spanPx).coerceIn(0f, 1f)
        return Outline.Rounded(
            RoundRect(
                left = 0f,
                top = 0f,
                right = size.width,
                bottom = size.height,
                cornerRadius = CornerRadius(restRadiusPx * (1f - grown)),
            ),
        )
    }
}

/** Share of the window's height under which a travelling frame keeps its seat's full corner. */
private const val CornerHold = 0.25f

/**
 * Library tile (design §5.2.5): a real decoded frame under a bottom scrim, the
 * resolution + dynamic-range chip top-left, the duration bottom-right, then the
 * title and a size/length caption. The frame itself is the hero — tapping the tile
 * expands these pixels into DetailScreen's backdrop.
 *
 * [unplayable] is a fact this app witnessed — a receiver refused these exact bytes —
 * and it is the only state here allowed to read as a fault. A file MediaStore simply
 * never scanned is a different thing entirely: the badge withholds the claim it cannot
 * make, and nothing about the tile says the file is broken.
 *
 * [silentAudio] is the milder witness beside it: the TV played this film and had no
 * decoder for its sound. The film is watchable, so the tile keeps its full colour and its
 * full target and the chip takes the withheld register rather than the failure one. It is
 * suppressed under [unplayable], which is not merely precedence — a file that will not
 * play at all has nothing to say about its audio.
 *
 * [resume] is the watched line under the still, and it is a resolved value rather than a
 * checkpoint map on purpose: the caller resolves it per tile through
 * [com.flick.sender.media.resumeProgress], which is the same rule the detail sheet's
 * resume CTA goes through. Null draws nothing, which is what every call site that has not
 * been given one gets.
 */
@Composable
fun VideoTile(
    item: MediaItem,
    hdr: HdrType?,
    imageLoader: ImageLoader,
    onClick: () -> Unit,
    unplayable: Boolean = false,
    silentAudio: Boolean = false,
    compact: Boolean = false,
    resume: ResumeProgress? = null,
    modifier: Modifier = Modifier,
    sharedScope: SharedTransitionScope? = null,
    animatedScope: AnimatedVisibilityScope? = null,
) {
    val colors = LocalFlickColors.current
    val displayName = item.displayName()
    val shape = RoundedCornerShape(FlickCorners.tile)
    val interaction = remember { MutableInteractionSource() }
    val request = rememberLibraryThumbnailRequest(item)
    val refusedDescription = stringResource(R.string.a11y_tile_unplayable)
    val silentDescription = stringResource(R.string.a11y_tile_no_sound)
    val watchedDescription = resume?.let {
        stringResource(R.string.a11y_tile_watched, Format.timecode(it.positionMs))
    }
    // Decided once and read by both the chip and the state line, so what TalkBack says
    // and what the eye sees can never disagree about which of the two facts is showing.
    val noSound = silentAudio && !unplayable
    // One node, one state line. A refused file may also carry a resume, and TalkBack
    // reads a single stateDescription — so the two facts are joined here rather than
    // raising a second focusable thing on a tile that is one button.
    val tileState = listOfNotNull(
        refusedDescription.takeIf { unplayable },
        silentDescription.takeIf { noSound },
        watchedDescription,
    )
        .joinToString(" · ")
        .takeIf { it.isNotEmpty() }
    // The still is held back rather than dimmed: a scrim on top would fight the one the
    // badges already read against, and a frame at full chroma beside a refusal chip reads
    // as an unrelated decoration stuck to it.
    val frameFilter = remember(unplayable) {
        if (unplayable) ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(RefusedSaturation) }) else null
    }

    Column(
        modifier = modifier
            .pressScale(interaction)
            // The whole tile is the target but the poster below draws the press: the
            // caption sits outside any rounded shape, and clipping this column would
            // cut the poster's deliberately unclipped shadow.
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .semantics {
                role = Role.Button
                // The chip and the line are both decorative to TalkBack — the tile speaks
                // its own state, so neither is announced as a second, tappable thing.
                tileState?.let { stateDescription = it }
            },
        verticalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                // A ratio, not a fixed height: the grid reflows with the window, and a
                // pinned dp would crop the still to a sliver on a wide column.
                .aspectRatio(if (compact) CompactPosterRatio else PosterRatio)
                .shadow(10.dp, shape, clip = false, ambientColor = TileShadow, spotColor = TileShadow)
                .pressMorph(interaction, restRadius = FlickCorners.tile, pressedRadius = 20.dp)
                .background(colors.surfaceTonal)
                // The amber media accent rather than the action blue: this surface is a
                // decoded frame, not a palette surface, and only a light, high-chroma
                // ripple survives both a blown-out still and a near-black one.
                .indication(interaction, flickRipple(colors.spark)),
        ) {
            // Only the frame travels. The badges below belong to the grid, so they stay
            // out of the shared node and cross-fade with the route.
            AsyncImage(
                model = request,
                contentDescription = displayName,
                imageLoader = imageLoader,
                contentScale = ContentScale.Crop,
                colorFilter = frameFilter,
                modifier = Modifier
                    // The seat's radius, not the press's: for the first frames of a flight
                    // begun under a finger the travelling copy can be up to 6 dp rounder
                    // than the tile beneath it, which at that scale is not visible and is
                    // not worth a second animation chasing it.
                    .flickSharedFrame(
                        sharedScope = sharedScope,
                        animatedScope = animatedScope,
                        key = posterKey(item.id),
                        restCorner = FlickCorners.tile,
                    )
                    .fillMaxSize(),
            )
            Box(Modifier.fillMaxSize().background(FlickGradients.posterScrim))
            // Stacked, not swapped: the two chips answer different questions, and a file
            // the TV refused still has whatever metadata it always had.
            Column(
                modifier = Modifier.align(Alignment.TopStart).padding(10.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                MetadataBadge(hdr = hdr, item = item)
                if (unplayable) RefusedBadge()
                if (noSound) NoSoundBadge()
            }
            // A zero duration means MediaStore had no value, not a zero-length film.
            if (item.knowsDuration) {
                Text(
                    text = Format.timecode(item.durationMs),
                    style = FlickText.monoSmall.copy(fontSize = 10.5.sp, color = Color.White),
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(bottom = 10.dp, end = 11.dp),
                )
            }
            resume?.let { ResumeLine(fraction = it.fraction, played = colors.spark) }
        }
        Column {
            Text(
                text = displayName,
                style = FlickText.labelLarge.copy(color = colors.onSurface),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = metaLabel(item, stringResource(R.string.media_unknown)),
                // onSurfaceFaint is cleared only for tracked uppercase labels: this line
                // is 11 sp mixed case and it is under every tile in the grid, which makes
                // it the most-read text in the app and the least readable ink for it.
                style = FlickText.bodyMedium.copy(fontSize = 11.sp, color = colors.onSurfaceDim),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 3.dp),
            )
        }
    }
}

/**
 * How much of this file has been watched, pinned to the bottom edge of the still and
 * inside its rounded clip, so the corners take the ends of the rule as they take the
 * frame's. It is a fact about the file, not a control: no target, no ripple, and slim
 * enough that the timecode above it is still the thing in that corner.
 *
 * The played span is [com.flick.sender.ui.theme.FlickColors.spark] for the reason the
 * ripple on this same surface is — a decoded frame is not a palette surface, and only a
 * light, high-chroma mark survives both a blown-out still and a near-black one. The
 * unplayed remainder takes a white wash rather than a dark one for the other half of that
 * argument: the bottom of the frame is already under the poster scrim's full 62% black,
 * so black would vanish into the very stills the track has to be legible on.
 */
@Composable
private fun BoxScope.ResumeLine(fraction: Float, played: Color) {
    Box(
        Modifier
            .align(Alignment.BottomCenter)
            .fillMaxWidth()
            .height(ResumeLineHeight)
            .background(ResumeLineTrack)
            .drawBehind {
                val width = size.width * fraction.coerceIn(0f, 1f)
                if (width > 0f) drawRect(color = played, size = Size(width, size.height))
            },
    )
}

/**
 * The tile's metadata claim, and never more of one than MediaStore supplied. With no
 * pixels reported the badge states the dynamic range alone if the probe found one, and
 * otherwise says so outright — the solid pill is reserved for a fact, so the withheld
 * form loses the fill and takes the dim ink and a hairline instead. It stays the same
 * pill in the same seat: a missing badge would read as a tile that failed to draw.
 */
@Composable
private fun MetadataBadge(hdr: HdrType?, item: MediaItem) {
    val colors = LocalFlickColors.current
    val range = hdrBadge(hdr)
    val withheld = !item.knowsResolution && range == null
    val text = if (range != null) {
        // A probed dynamic range is a fact on its own, and the only one left to state
        // when MediaStore reported no pixels to pair it with.
        if (item.knowsResolution) {
            stringResource(R.string.library_tile_badge, item.resolutionLabel, range)
        } else {
            range
        }
    } else {
        if (item.knowsResolution) item.resolutionLabel else stringResource(R.string.library_badge_unknown)
    }
    Text(
        text = text,
        style = FlickText.monoBadge.copy(color = if (withheld) colors.onSurfaceDim else colors.onSurface),
        modifier = Modifier
            .clip(PillShape)
            .background(if (withheld) colors.canvas.copy(alpha = WithheldFill) else colors.canvas)
            .then(if (withheld) Modifier.border(1.dp, colors.outline, PillShape) else Modifier)
            .padding(horizontal = 9.dp, vertical = 6.dp),
    )
}

/**
 * The remembered refusal. Crimson is the app's failure role and this is a failure that
 * genuinely happened — but it is one attempt on one TV, so the copy stays in the past
 * tense and the tile stays tappable: the sheet behind it still offers to cast.
 */
@Composable
private fun RefusedBadge() {
    val colors = LocalFlickColors.current
    Row(
        modifier = Modifier
            .clip(PillShape)
            .background(colors.trouble)
            .padding(horizontal = 8.dp, vertical = 5.dp),
        horizontalArrangement = Arrangement.spacedBy(5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = FlickIcons.Warning,
            contentDescription = null,
            // FlickColors pairs no ink with `trouble`; this is the one role that clears
            // it in both sets — white on the light crimson, near-black on the dark one.
            tint = colors.onPrimary,
            modifier = Modifier.size(12.dp),
        )
        Text(
            text = stringResource(R.string.library_badge_unplayable),
            style = FlickText.monoBadge.copy(color = colors.onPrimary),
        )
    }
}

/**
 * The remembered silence, in the register [MetadataBadge] withholds a claim in rather than
 * the one [RefusedBadge] states a failure in.
 *
 * Nothing here is allowed to discourage casting, because the film plays: no crimson, no
 * held-back still, no icon. A text-only pill in the dim ink is the whole treatment — the
 * icon set carries a speaker with sound coming out of it and nothing that means the
 * absence of one, and a drawn-on mute glyph would be a second thing to read at 12 dp when
 * the two words already say it.
 */
@Composable
private fun NoSoundBadge() {
    val colors = LocalFlickColors.current
    Text(
        text = stringResource(R.string.library_badge_no_sound),
        style = FlickText.monoBadge.copy(color = colors.onSurfaceDim),
        modifier = Modifier
            .clip(PillShape)
            .background(colors.canvas.copy(alpha = WithheldFill))
            .border(1.dp, colors.outline, PillShape)
            .padding(horizontal = 9.dp, vertical = 6.dp),
    )
}

/** DV / HDR10 only once probed: null is "nobody has looked", never "no HDR". */
@Composable
private fun hdrBadge(hdr: HdrType?): String? = when (hdr) {
    HdrType.DOLBY_VISION -> stringResource(R.string.media_dv_badge)
    HdrType.HDR10 -> stringResource(R.string.media_hdr10_badge)
    HdrType.NONE, null -> null
}

private fun metaLabel(item: MediaItem, unknown: String): String {
    val length = if (item.knowsDuration) Format.durationHuman(item.durationMs) else unknown
    val size = if (item.sizeBytes > 0L) Format.bytes(item.sizeBytes) else unknown
    return "$length · $size"
}

// The mock's 179 dp column carries a 122 dp still. Short screens drop to 16:9 so the
// poster does not eat the row on a landscape phone.
private const val PosterRatio = 179f / 122f
private const val CompactPosterRatio = 16f / 9f

// A withheld badge is the same pill with its confidence taken out: enough fill to keep
// mono type legible over any frame, not enough to read as the solid claim beside it.
private const val WithheldFill = 0.62f

// Held back, not greyed out. Far enough down that the tile reads as answered-for at a
// glance, far enough up that the frame is still the film.
private const val RefusedSaturation = 0.45f

// A rule, not a bar. Thin enough to read as a property of the still rather than as a
// control laid over it, thick enough to survive a 1x-density phone rounding it away.
private val ResumeLineHeight = 3.dp
private val ResumeLineTrack = Color.White.copy(alpha = 0.3f)
