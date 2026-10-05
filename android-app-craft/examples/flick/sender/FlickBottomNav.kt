package com.flick.sender.ui.components

import android.os.Build
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.VectorConverter
import androidx.compose.animation.core.spring
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicText
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorProducer
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.flick.sender.R
import com.flick.sender.ui.screens.NavTab
import com.flick.sender.ui.theme.FlickColors
import com.flick.sender.ui.theme.FlickIcons
import com.flick.sender.ui.theme.FlickText
import com.flick.sender.ui.theme.LocalFlickColors
import com.flick.sender.ui.theme.Motion
import com.flick.sender.ui.theme.flickGlass
import com.flick.sender.ui.theme.pressScale
import com.flick.sender.ui.theme.rememberPressAmount
import com.flick.sender.ui.theme.rememberReduceMotion
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeEffect
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch

/**
 * The floating glass navigation pill (design §5.4). It is drawn over the route rather
 * than inset into it, so each screen it appears on reserves its own bottom padding.
 * The caller owns the 16 dp margins and the window insets.
 *
 * Selection is ONE fill that travels between the seats rather than one fill per seat
 * cross-fading: the tab left behind and the tab arrived at are the same object moving,
 * which is the claim the route transition makes at the same moment.
 *
 * The travelling fill is seat-count agnostic — it is placed against measured bounds — so
 * a seat is added by adding a [NavItem] and nothing else. Three 76 dp seats plus the
 * row's 12 dp margins are 252 dp, which still leaves free space to distribute inside the
 * 328 dp the bar spans on the narrowest phone the app supports.
 */
@Composable
internal fun FlickBottomNav(
    selected: NavTab,
    hazeState: HazeState,
    onSelect: (NavTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalFlickColors.current
    val density = LocalDensity.current
    val metrics = LocalNavMetrics.current
    val reduceMotion = rememberReduceMotion()
    // This keeps the fast first 50 ms response of the old spatial spring without its
    // visible overshoot. The icon's deliberately slower effects spring still resolves
    // after the fill has travelled beneath it.
    val travel = spring<Rect>(
        dampingRatio = NavTravelDampingRatio,
        stiffness = NavTravelStiffness,
    )
    val indicator = remember { Animatable(Rect.Zero, Rect.VectorConverter) }
    val scope = rememberCoroutineScope()
    // Route-driven changes keep one conflated command stream. Presses and taps start inline
    // below, and Animatable's mutation lock cancels whichever travel they supersede.
    val travelCommands = remember { Channel<NavTravelCommand>(Channel.CONFLATED) }
    val target = remember { mutableStateOf<NavTravelCommand?>(null) }
    // The seat the shell actually resolved, readable from a coroutine that outlives the
    // command that launched the current travel.
    val settled = rememberUpdatedState(selected)
    val currentReduceMotion = rememberUpdatedState(reduceMotion)
    val glassHazeStyle = remember(colors) {
        HazeStyle(
            tints = navBarHazeTints(colors).map { HazeTint(it) },
            blurRadius = GlassBlurRadius,
            noiseFactor = GlassNoiseFactor,
            fallbackTint = HazeTint(navBarFallbackTint(colors)),
        )
    }
    val backdropEffect = Modifier.hazeEffect(state = hazeState, style = glassHazeStyle) {
        // Android 13+ is Haze's optimal native path. Older releases keep the same
        // translucent tint as a fallback without the global pre-draw invalidation or
        // RenderScript work that can make a scrolling grid pay for a small glass pill.
        blurEnabled = navBackdropBlurEnabled(Build.VERSION.SDK_INT)
    }

    // Seats are measured, not composed: a plain map plus an epoch keeps a layout pass
    // from writing snapshot state the same layout pass reads, and the epoch only moves
    // when a seat genuinely changes (first placement, rotation, font scale).
    val seats = remember { mutableMapOf<NavTab, Rect>() }
    var seatEpoch by remember { mutableIntStateOf(0) }
    // Read only from a positioning callback, never from composition, so publishing the
    // bar's own coordinates costs nothing.
    val host = remember { mutableStateOf<LayoutCoordinates?>(null) }
    val reportSeat: (NavTab, Rect) -> Unit = { tab, rect ->
        if (seats[tab] != rect) {
            seats[tab] = rect
            seatEpoch++
        }
    }

    LaunchedEffect(travelCommands) {
        travelCommands.receiveAsFlow().collectLatest { command ->
            if (currentReduceMotion.value || indicator.value == Rect.Zero) {
                indicator.snapTo(command.seat)
            } else {
                indicator.animateTo(command.seat, travel)
            }
        }
    }

    // Route changes and genuine seat remeasurement publish destinations; they never animate
    // directly. A successful tap already published the same command and therefore does not
    // restart its spring when the route catches up one frame later.
    LaunchedEffect(selected, seatEpoch, reduceMotion) {
        val destination = seats[selected] ?: return@LaunchedEffect
        val command = NavTravelCommand(selected, destination, NavTravelOrigin.AUTHORITATIVE)
        if (!target.value.hasSameDestination(command) || reduceMotion) {
            target.value = command
            travelCommands.trySend(command)
        }
    }

    val launchTravel: (NavTravelCommand, Boolean) -> Unit = { command, correctAfter ->
        target.value = command
        scope.launch(start = CoroutineStart.UNDISPATCHED) {
            if (currentReduceMotion.value || indicator.value == Rect.Zero) {
                indicator.snapTo(command.seat)
            } else {
                indicator.animateTo(command.seat, travel)
            }

            if (correctAfter && target.value == command) {
                // A preview can already be home when the click commits it. Give the shell
                // two frame turns to publish the route before treating a mismatch as refusal.
                if (settled.value != command.tab) repeat(2) { withFrameNanos { } }
                val resolvedTab = settled.value
                if (resolvedTab != command.tab && target.value == command) {
                    seats[resolvedTab]?.let { resolvedSeat ->
                        val correction = NavTravelCommand(
                            resolvedTab,
                            resolvedSeat,
                            NavTravelOrigin.AUTHORITATIVE,
                        )
                        target.value = correction
                        if (currentReduceMotion.value) {
                            indicator.snapTo(resolvedSeat)
                        } else {
                            indicator.animateTo(resolvedSeat, travel)
                        }
                    }
                }
            }
        }
    }

    // The press is the first trustworthy intent signal and arrives before clickable waits
    // for finger-up. It moves only the visual fill; the route still changes exclusively on
    // click, and a cancelled gesture returns the fill to that authoritative route.
    val onPress: (NavTab) -> Unit = onPress@{ tab ->
        if (currentReduceMotion.value) return@onPress
        val seat = seats[tab]
        val shouldStartTravel = navShouldStartTravel(
            indicator = indicator.value,
            isRunning = indicator.isRunning,
            target = target.value?.seat,
            destination = seat,
        )
        if (seat != null && shouldStartTravel) {
            launchTravel(NavTravelCommand(tab, seat, NavTravelOrigin.PREVIEW), false)
        }
    }

    val onTap: (NavTab) -> Unit = { tab ->
        val seat = seats[tab]
        val previous = target.value
        val shouldStartTravel = navShouldStartTravel(
            indicator = indicator.value,
            isRunning = indicator.isRunning,
            target = previous?.seat,
            destination = seat,
        )
        val commitsPreview = previous.isPreviewOf(tab, seat)
        if (seat != null && (shouldStartTravel || commitsPreview)) {
            launchTravel(NavTravelCommand(tab, seat, NavTravelOrigin.COMMITTED), true)
        }
        onSelect(tab)
    }
    val onCancelledPress: (NavTab) -> Unit = { tab ->
        val preview = target.value
        if (preview?.origin == NavTravelOrigin.PREVIEW && preview.tab == tab) {
            val resolvedTab = settled.value
            seats[resolvedTab]?.let { resolvedSeat ->
                launchTravel(
                    NavTravelCommand(
                        resolvedTab,
                        resolvedSeat,
                        NavTravelOrigin.AUTHORITATIVE,
                    ),
                    false,
                )
            }
        }
    }

    Box(
        modifier
            .fillMaxWidth()
            .flickGlass(
                colors = colors,
                fill = navBarFill(colors),
                showSheen = navShowsGlassSheen(colors),
                backdropEffect = backdropEffect,
            )
            .onGloballyPositioned { host.value = it }
            // The routes this floats over reserve their own room for it, and how much is
            // not a constant — see [LocalNavMetrics].
            .onSizeChanged { metrics.height = with(density) { it.height.toDp() } },
    ) {
        // This draw node owns the full bar bounds, which is also the coordinate space
        // reported by the seats. A pill-sized layout cannot safely place its child at
        // full-bar coordinates after the first seat.
        Box(
            Modifier
                .matchParentSize()
                .drawBehind {
                    val bounds = indicator.value
                    if (!bounds.isEmpty) {
                        drawRoundRect(
                            color = colors.primary,
                            topLeft = bounds.topLeft,
                            size = bounds.size,
                            cornerRadius = CornerRadius(bounds.height / 2f),
                        )
                    }
                },
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 11.dp),
            horizontalArrangement = Arrangement.SpaceAround,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            NavItem(
                icon = FlickIcons.GridView,
                label = stringResource(R.string.nav_library),
                active = selected == NavTab.LIBRARY,
                host = host,
                onSeat = { reportSeat(NavTab.LIBRARY, it) },
                onPress = { onPress(NavTab.LIBRARY) },
                onCancelPress = { onCancelledPress(NavTab.LIBRARY) },
                onClick = { onTap(NavTab.LIBRARY) },
            )
            NavItem(
                icon = FlickIcons.Cast,
                label = stringResource(R.string.nav_devices),
                active = selected == NavTab.DEVICES,
                host = host,
                onSeat = { reportSeat(NavTab.DEVICES, it) },
                onPress = { onPress(NavTab.DEVICES) },
                onCancelPress = { onCancelledPress(NavTab.DEVICES) },
                onClick = { onTap(NavTab.DEVICES) },
            )
            NavItem(
                icon = FlickIcons.Tune,
                label = stringResource(R.string.nav_settings),
                active = selected == NavTab.SETTINGS,
                host = host,
                onSeat = { reportSeat(NavTab.SETTINGS, it) },
                onPress = { onPress(NavTab.SETTINGS) },
                onCancelPress = { onCancelledPress(NavTab.SETTINGS) },
                onClick = { onTap(NavTab.SETTINGS) },
            )
        }
    }
}

@Composable
private fun NavItem(
    icon: ImageVector,
    label: String,
    active: Boolean,
    host: State<LayoutCoordinates?>,
    onSeat: (Rect) -> Unit,
    onPress: () -> Unit,
    onCancelPress: () -> Unit,
    onClick: () -> Unit,
) {
    val colors = LocalFlickColors.current
    val inactiveInk = navInactiveInk(colors)
    val reduceMotion = rememberReduceMotion()
    val motionScheme = MaterialTheme.motionScheme
    // Both tints stay State and are spent in the draw phase, exactly as the library's
    // filter chips do it. Read at composition scope they recomposed the seat on every frame
    // of the travel — and the label's went further than that: a tint inside a TextStyle is
    // a new layout input, so each frame re-measured the text as well as repainting it.
    //
    // The icon rides the travelling fill, so its ink must not resolve before the fill has
    // arrived under it — a slower effects spec, never a spatial one.
    val iconTint = animateColorAsState(
        targetValue = if (active) colors.onPrimary else inactiveInk,
        animationSpec = Motion.orSnap(reduceMotion, motionScheme.slowEffectsSpec<Color>()),
        label = "navIcon",
    )
    val labelTint = animateColorAsState(
        targetValue = if (active) navActiveLabelInk(colors) else inactiveInk,
        animationSpec = Motion.orSnap(reduceMotion, motionScheme.defaultEffectsSpec<Color>()),
        label = "navLabel",
    )
    val labelInk = remember(labelTint) { ColorProducer { labelTint.value } }

    // No haptic here: the shell decides whether a tap moved at all — a re-tap of the
    // seat already carrying the fill is silent. FlickApp fires the pulse from onSelect.
    val interaction = remember { MutableInteractionSource() }
    val currentOnPress = rememberUpdatedState(onPress)
    val currentOnCancelPress = rememberUpdatedState(onCancelPress)
    LaunchedEffect(interaction) {
        val presses = mutableSetOf<PressInteraction.Press>()
        interaction.interactions.collect { event ->
            when (event) {
                is PressInteraction.Press -> {
                    if (presses.add(event) && presses.size == 1) currentOnPress.value()
                }
                is PressInteraction.Release -> presses.remove(event.press)
                is PressInteraction.Cancel -> {
                    if (presses.remove(event.press) && presses.isEmpty()) {
                        currentOnCancelPress.value()
                    }
                }
            }
        }
    }
    // Material's ripple dilutes whatever ink it is handed, and on this palette
    // onSurface is near-white — which lands on the glass as a grey blob. The seat
    // answers a touch by pressing in under it instead, washed in the same brand tint
    // the selection itself travels in. Never a neutral one, and never on the seat that
    // already carries the fill: there the travelling pill is the wash.
    //
    // An effects spring, not the spatial one the scale takes: this is opacity and must
    // not ring past either end of its range.
    val wash = rememberPressAmount(interaction, motionScheme.fastEffectsSpec())
    val washColor = colors.primary

    Box(
        modifier = Modifier
            .width(76.dp)
            .heightIn(min = 48.dp)
            .clickable(
                interactionSource = interaction,
                indication = null,
                role = Role.Tab,
                onClick = onClick,
            )
            .semantics(mergeDescendants = true) { selected = active },
        contentAlignment = Alignment.TopCenter,
    ) {
        // This unscaled sibling owns the indicator geometry. Measuring the icon inside the
        // pressed layer made its animated scale look like a seat remeasurement, which let
        // the route effect cancel the press-start travel on every frame.
        Box(
            modifier = Modifier
                .size(NavIndicatorSeatWidth, NavIndicatorSeatHeight)
                // Reported in the bar's own space: the fill is drawn once, above, and
                // has to be placed against a seat rather than inside it.
                .onGloballyPositioned { coordinates ->
                    host.value?.let { onSeat(it.localBoundingBoxOf(coordinates, clipBounds = false)) }
                },
        )
        Column(
            modifier = Modifier
                .width(76.dp)
                .heightIn(min = 48.dp)
                .pressScale(interaction, target = NavPressScale)
                .drawBehind {
                    // Read in the draw scope, so a press repaints one seat rather than
                    // recomposing the bar it sits in.
                    val alpha = if (active) 0f else wash.value * NavPressWashAlpha
                    if (alpha > 0f) {
                        drawRoundRect(
                            color = washColor,
                            topLeft = Offset.Zero,
                            size = size,
                            cornerRadius = CornerRadius(NavPressWashRadius.toPx()),
                            alpha = alpha,
                        )
                    }
                },
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                modifier = Modifier.padding(
                    horizontal = NavIndicatorHorizontalPadding,
                    vertical = NavIndicatorVerticalPadding,
                ),
                contentAlignment = Alignment.Center,
            ) {
                // Painted rather than composed as an Icon: the tint is a draw-scope colour
                // filter here, and `Icon` can only take one resolved in composition. The label
                // carries the name, so this glyph announces nothing a reader would hear twice.
                val painter = rememberVectorPainter(icon)
                Box(
                    Modifier.size(NavIconSize).drawBehind {
                        with(painter) { draw(size, colorFilter = ColorFilter.tint(iconTint.value)) }
                    },
                )
            }
            Spacer(Modifier.height(6.dp))
            // The ink is handed over as a producer rather than as a style, so the tint animation
            // resolves at draw time and never recomposes the label.
            //
            // One line always: the seat is a fixed 76 dp and the three of them are a lockup, so
            // at an accessibility font scale the label gives up its tail rather than its row.
            BasicText(
                text = label,
                style = FlickText.labelSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = labelInk,
            )
        }
    }
}

// Press response for one seat. The dip is deeper than the row scale because the seat
// is small and carries no fill of its own to deform; the wash sits just above the
// glass sheen it has to read against.
private const val NavPressScale = 0.92f
private const val NavPressWashAlpha = 0.16f
private val NavPressWashRadius = 20.dp
private val NavIconSize = 24.dp
private val NavIndicatorHorizontalPadding = 22.dp
private val NavIndicatorVerticalPadding = 6.dp
private val NavIndicatorSeatWidth = NavIconSize + NavIndicatorHorizontalPadding * 2
private val NavIndicatorSeatHeight = NavIconSize + NavIndicatorVerticalPadding * 2
private const val NavTravelDampingRatio = 0.82f
private const val NavTravelStiffness = 1_000f

/**
 * Haze owns the material of every backdrop-blurred surface in the shell, so none of them
 * may paint an opaque fill of its own: the fill would land ON TOP of the blurred backdrop
 * and hide the one thing the blur exists to show.
 */
internal fun glassBackdropFill(colors: FlickColors): Color = Color.Transparent

/** See [glassBackdropFill] — the nav's own name for it, which the style test measures. */
internal fun navBarFill(colors: FlickColors): Color = glassBackdropFill(colors)

/**
 * Tint over the blurred route for a surface that leaves [backdropVisibility] of it showing
 * through. Light mode spends the whole tint budget on the pale glass; dark mode splits it
 * between a small luminance stabilizer and the bright Ready blue.
 *
 * The stabilizer is an absolute floor rather than a share of the budget: it is what keeps a
 * blown-out frame passing underneath from lifting the dark material into a grey, and that
 * job does not get smaller because the surface doing it is thinner. Which is also the
 * ceiling — a surface cannot ask for more than 1 - [DarkGlassStabilizerAlpha] of its
 * backdrop back without asking the blue above it for a negative alpha.
 */
internal fun glassHazeTints(colors: FlickColors, backdropVisibility: Float): List<Color> {
    val tintOpacity = 1f - backdropVisibility
    return if (colors.isLight) {
        listOf(colors.glass.copy(alpha = tintOpacity))
    } else {
        val blue = (tintOpacity - DarkGlassStabilizerAlpha) / (1f - DarkGlassStabilizerAlpha)
        listOf(
            Color.Black.copy(alpha = DarkGlassStabilizerAlpha),
            colors.sparkInverse.copy(alpha = blue.coerceAtLeast(0f)),
        )
    }
}

/** One equivalent translucent scrim for platforms where background blur is unavailable. */
internal fun glassFallbackTint(colors: FlickColors, backdropVisibility: Float): Color =
    glassHazeTints(colors, backdropVisibility)
        .fold(Color.Transparent) { base, tint -> tint.compositeOver(base) }

internal fun navBarHazeTints(colors: FlickColors): List<Color> =
    glassHazeTints(colors, NavBackdropVisibility)

internal fun navBarFallbackTint(colors: FlickColors): Color =
    glassFallbackTint(colors, NavBackdropVisibility)

/** The dim ink is too quiet on the dark navigation bar's saturated live-blue fill. */
internal fun navInactiveInk(colors: FlickColors): Color =
    if (colors.isLight) colors.onSurfaceDim else Color.White

/** Active labels sit below the gold indicator and therefore remain ink on glass. */
internal fun navActiveLabelInk(colors: FlickColors): Color =
    if (colors.isLight) colors.onSurface else Color.White

/** The tight rim is static and makes the translucent material legible in either theme. */
internal fun navShowsGlassSheen(colors: FlickColors): Boolean = true

/**
 * How much of the blurred route each glass surface leaves showing through itself.
 *
 * The pill is the app's permanent furniture: it floats over every route the shell has, on
 * artwork and on empty states alike, so it keeps the heavier tint and the legibility that
 * comes with it. The Now-Playing dock is a temporary, single-purpose bar that exists only
 * while a cast is live, and it should feel lighter than the thing it sits on rather than
 * doubling it — two glass surfaces stacked directly one above the other must not read as a
 * single slab, which is exactly what equal tints would make them. So the upper one is the
 * thinner one.
 */
internal const val NavBackdropVisibility = 0.60f
internal const val DockBackdropVisibility = 0.74f

private const val DarkGlassStabilizerAlpha = 0.14f

/** Both surfaces are cut from the same material; only the tint budget above differs. */
internal const val GlassNoiseFactor = 0.04f
internal val GlassBlurRadius = 20.dp

internal fun navBackdropBlurEnabled(sdkInt: Int): Boolean =
    sdkInt >= Build.VERSION_CODES.TIRAMISU

internal enum class NavTravelOrigin { PREVIEW, COMMITTED, AUTHORITATIVE }

internal data class NavTravelCommand(
    val tab: NavTab,
    val seat: Rect,
    val origin: NavTravelOrigin,
)

internal fun NavTravelCommand?.hasSameDestination(other: NavTravelCommand): Boolean =
    this != null && tab == other.tab && seat == other.seat

internal fun NavTravelCommand?.isPreviewOf(tab: NavTab, seat: Rect?): Boolean =
    this != null && origin == NavTravelOrigin.PREVIEW && this.tab == tab && this.seat == seat

/** A recorded target only suppresses a duplicate while its animation is still alive. */
internal fun navShouldStartTravel(
    indicator: Rect,
    isRunning: Boolean,
    target: Rect?,
    destination: Rect?,
): Boolean =
    destination != null &&
        indicator != Rect.Zero &&
        (target != destination || (!isRunning && indicator != destination))

/**
 * How tall the nav actually came out. The bar is drawn OVER the routes rather than inset
 * into them, so each route reserves its own room at the foot of its scroll — and the height
 * it has to reserve is a measurement, not a literal: the label's line box scales with the
 * user's font setting, which at the accessibility end adds enough to hide the last row
 * under the pill.
 *
 * Written from a layout callback and read only where a route computes its bottom padding.
 * A bar whose height never changes therefore costs one write and no recomposition at all.
 */
@Stable
internal class NavMetrics {
    var height: Dp by mutableStateOf(NavNominalHeight)
}

/** Provided by the shell, which composes both the bar and the routes it floats over. */
internal val LocalNavMetrics = staticCompositionLocalOf { NavMetrics() }

/**
 * Room a route has to leave under its content: the bar's own height, the margin the shell
 * holds it off the window edge with, and the gap the design leaves between the last row and
 * the pill. While a cast is live the dock rides above the bar on the same stack, so its
 * clearance is part of the same reservation.
 */
internal fun navBottomClearance(barHeight: Dp, dockLive: Boolean): Dp =
    barHeight + NavShellMargin + NavContentGap + if (dockLive) NowPlayingDockClearance else 0.dp

/** The shell's own margin around the floating bottom stack (design §5.4). */
internal val NavShellMargin = 16.dp

/** Breathing room between the last row of a route and the pill floating over it. */
private val NavContentGap = 22.dp

/**
 * The bar before it has been measured — icon, its 6 dp padding, the 6 dp spacer, one line
 * box of `labelSmall` and the row's 11 dp, at a 1.0 font scale. Only the first frame of the
 * first route uses it; a real measurement replaces it in the same layout pass.
 */
private val NavNominalHeight = 78.dp
