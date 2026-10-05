package com.example.starter.ui.components

import android.os.Build
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.util.lerp
import com.example.starter.ui.Tags
import com.example.starter.ui.motion.Easings
import com.example.starter.ui.motion.LocalReducedMotion
import com.example.starter.ui.motion.Springs
import com.example.starter.ui.motion.orSnap
import com.example.starter.ui.motion.pressScale
import com.example.starter.ui.nav.LocalBackdrop
import com.example.starter.ui.nav.NavMotion
import com.example.starter.ui.theme.AppColors
import com.example.starter.ui.theme.AppTheme
import com.example.starter.ui.theme.DisplayFont
import com.example.starter.ui.theme.PillShape
import dev.chrisbanes.haze.ExperimentalHazeApi
import dev.chrisbanes.haze.HazeInputScale
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeEffect
import kotlin.math.max
import kotlin.math.min

/** One seat of the bar. The label is drawn only inside the selection capsule. */
data class BarTab(val label: String, val icon: ImageVector)

/**
 * The pill's height. Fixed on purpose: labels step down to fit instead of growing the bar,
 * and that is the only reason [BarClearance] may be a constant (dash:ui/components/DashBottomBar.kt:100).
 */
internal val BarHeight = 60.dp

/** How far the pill floats above the navigation-bar inset (dash:DashBottomBar.kt:203). */
internal val BarLift = 14.dp
internal val BarSideMargin = 16.dp
internal val BarMaxWidth = 520.dp

/** Breathing room between the last row of a page and the pill (flick:sender/ui/components/FlickBottomNav.kt:626). */
private val BarContentGap = 22.dp

/**
 * Room a scrolling page leaves under the floating bar, NOT counting the navigation-bar
 * inset. Use [barClearance], which adds the inset. Dash's 104 dp left the inset out, which
 * is fine on gesture navigation (about 24 dp) but puts the last 18 dp of content under the
 * pill on 3-button navigation (48 + 14 + 60 = 122 dp > 104).
 *
 * A constant is right only while the bar's height cannot change. The moment anything in
 * the bar can grow with the font scale (a label under the icon, a second line, a dock
 * stacked above it), measure instead: write the bar's height from `onSizeChanged` into a
 * CompositionLocal the pages read (flick:sender/ui/components/FlickBottomNav.kt:596-633).
 */
val BarClearance: Dp = BarHeight + BarLift + BarContentGap

/** [BarClearance] plus the navigation-bar inset: a tab page's bottom content padding. */
@Composable
fun barClearance(): Dp = BarClearance + WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

private val BarPadding = 6.dp
private val TabPadding = 6.dp
private val TabIconSize = 23.dp
private val LabelGap = 7.dp
private const val MinLabelScale = 0.6f
private const val IconBounce = 1.08f
private const val IconPressScale = 0.92f
private const val TintMillis = 220

/**
 * How much of the blurred page shows through the pill (flick:sender/ui/components/FlickBottomNav.kt:545-559).
 * A second glass surface stacked on this one (a mini player) must be thinner, 0.74 in
 * Flick, so the two never read as one slab.
 */
internal const val BarBackdropVisibility = 0.60f

/**
 * The fixed black floor under dark glass: it keeps a blown-out frame passing beneath from
 * lifting the dark material to grey (flick:FlickBottomNav.kt:498-523).
 */
private const val DarkGlassStabilizerAlpha = 0.14f

private val GlassBlurRadius = 28.dp
private const val GlassNoiseFactor = 0.04f

/**
 * The tints over the blurred page for a surface that leaves [backdropVisibility] of it
 * showing. Light spends the whole budget on the glass colour; dark splits it between the
 * black floor and the glass colour. [AppColors.glass] supplies the hue; its own alpha is
 * replaced. The total coverage is `1 - backdropVisibility` in both themes.
 */
internal fun glassHazeTints(colors: AppColors, backdropVisibility: Float): List<Color> {
    val tintOpacity = (1f - backdropVisibility).coerceIn(0f, 1f)
    return if (colors.isLight) {
        listOf(colors.glass.copy(alpha = tintOpacity))
    } else {
        val body = (tintOpacity - DarkGlassStabilizerAlpha) / (1f - DarkGlassStabilizerAlpha)
        listOf(
            Color.Black.copy(alpha = DarkGlassStabilizerAlpha),
            colors.glass.copy(alpha = body.coerceAtLeast(0f)),
        )
    }
}

/**
 * The one flat colour that equals [glassHazeTints] composited in order, for where blur is
 * off (below API 33, or no backdrop). Derived, never picked, so the two cannot drift.
 */
internal fun glassFallbackTint(colors: AppColors, backdropVisibility: Float): Color =
    glassHazeTints(colors, backdropVisibility).fold(Color.Transparent) { base, tint -> tint.compositeOver(base) }

/**
 * Real blur only on API 33+. Below that Haze falls back to a pre-draw listener and
 * RenderScript, which makes a scrolling list pay for a small pill (flick:FlickBottomNav.kt:132-137).
 */
internal fun glassBlurEnabled(sdkInt: Int): Boolean = sdkInt >= Build.VERSION_CODES.TIRAMISU

/**
 * A floating frosted-glass pill drawn OVER the page, not in the layout. The page scrolls
 * under it and leaves [barClearance] at its foot. Place it as a `BottomCenter` sibling of
 * the page host; it applies its own margins and the navigation-bar inset.
 *
 * Selection is ONE capsule that travels, never a fill per tab. The chosen slot is two units
 * wide and shows its name; the others are one unit and show an icon. Choosing a tab lays
 * the bar out once; the capsule's glide, the icons' slide and the names' fades are drawn
 * from a progress that only the draw and layer phases read, so the bar never re-measures
 * while the pages under it slide (dash:DashBottomBar.kt:118-134). The glide runs on the
 * pages' own clock and curve, so the capsule and the page it names arrive together.
 */
// HazeInputScale is experimental in Haze 1.7; the opt-in keeps the build warning-free.
@OptIn(ExperimentalHazeApi::class)
@Composable
fun GlassBar(
    tabs: List<BarTab>,
    selected: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    require(tabs.isNotEmpty()) { "GlassBar needs at least one tab" }
    val colors = AppTheme.colors
    val backdrop = LocalBackdrop.current
    val reduceMotion = LocalReducedMotion.current
    val light = colors.isLight
    val glass = remember(colors) {
        HazeStyle(
            backgroundColor = colors.canvas,
            tints = glassHazeTints(colors, BarBackdropVisibility).map { HazeTint(it) },
            blurRadius = GlassBlurRadius,
            noiseFactor = GlassNoiseFactor,
            fallbackTint = HazeTint(glassFallbackTint(colors, BarBackdropVisibility)),
        )
    }
    val fallback = remember(colors) { glassFallbackTint(colors, BarBackdropVisibility) }
    // Dash's rim and sheen (dash:DashBottomBar.kt:157-165): a lit top edge fading down.
    val rim = remember(light) {
        Brush.verticalGradient(
            if (light) listOf(Color.White, Color.White.copy(alpha = .40f))
            else listOf(Color.White.copy(alpha = .32f), Color.White.copy(alpha = .05f)),
        )
    }
    val sheen = remember(light) {
        Brush.verticalGradient(0f to Color.White.copy(alpha = if (light) .20f else .06f), .55f to Color.Transparent)
    }
    // A tinted shadow is invisible on near-black, so dark mode takes a plain black one.
    val shadowAmbient = if (light) colors.onSurface.copy(alpha = .20f) else Color.Black.copy(alpha = .50f)
    val shadowSpot = if (light) colors.onSurface.copy(alpha = .26f) else Color.Black.copy(alpha = .55f)

    // Every name measured up front, in the style the glide draws it. Measured by the name's
    // own layout instead, the first frame or two of a switch had no width yet and the chosen
    // icon jumped half a name sideways and back (dash@1940b64).
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val windowWidth = with(density) { LocalWindowInfo.current.containerSize.width.toDp() }
    // On a narrow phone or at large text a long name was cut ("Activitie", dash@8098d01).
    // The names step down together to the size where the longest fits beside its icon.
    val labelStyle = remember(measurer, density, windowWidth, tabs) {
        val base = TextStyle(fontFamily = DisplayFont, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        with(density) {
            val pill = (windowWidth - BarSideMargin * 2).coerceAtMost(BarMaxWidth) - BarPadding * 2
            val room = (pill * 2 / (tabs.size + 1) - TabPadding * 2 - TabIconSize - LabelGap).toPx()
            val widest = tabs.maxOf { measurer.measure(it.label, base, maxLines = 1, softWrap = false).size.width }
            if (widest <= room || room <= 0f) base
            else base.copy(fontSize = base.fontSize * (room / widest).coerceAtLeast(MinLabelScale))
        }
    }
    val labels = remember(measurer, labelStyle, tabs) {
        tabs.map { measurer.measure(it.label, labelStyle, maxLines = 1, softWrap = false) }
    }

    val motion = remember(tabs.size) { TabMotion(tabs.size, selected.coerceIn(0, tabs.lastIndex)) }
    with(density) {
        motion.iconPx = TabIconSize.toPx()
        motion.gapPx = LabelGap.toPx()
        motion.paddingPx = TabPadding.toPx()
    }
    labels.forEachIndexed { index, label -> motion.labelWidths[index] = label.size.width }
    motion.select(selected.coerceIn(0, tabs.lastIndex))
    LaunchedEffect(selected) {
        if (!motion.animating) return@LaunchedEffect
        // A tab chosen mid-glide cuts the glide short and the pages finish on a quick
        // critically damped spring; the capsule does the same, or it would still be
        // travelling after the page it names had landed (dash:DashBottomBar.kt:193-198).
        val spec = if (motion.overtaking) {
            spring(dampingRatio = 1f, stiffness = NavMotion.OVERTAKE_STIFFNESS, visibilityThreshold = .001f)
        } else {
            tween<Float>(NavMotion.TAB_MILLIS, easing = Easings.Glide)
        }
        animate(0f, 1f, animationSpec = orSnap(reduceMotion, spec)) { value, _ -> motion.step(value) }
        motion.finish()
    }

    val capsuleFill = colors.primary
    val capsuleRim = Color.White.copy(alpha = .35f)
    val labelInk = colors.onPrimary
    Box(
        modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = BarSideMargin).padding(bottom = BarLift),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.widthIn(max = BarMaxWidth).fillMaxWidth().height(BarHeight)
                .shadow(20.dp, PillShape, clip = false, ambientColor = shadowAmbient, spotColor = shadowSpot)
                .clip(PillShape)
                // Haze owns the material: no fill is painted under or over the blur, or it would
                // hide the one thing the blur exists to show (flick@0fa09f1).
                .then(
                    if (backdrop != null) {
                        Modifier.hazeEffect(backdrop, glass) {
                            blurEnabled = glassBlurEnabled(Build.VERSION.SDK_INT)
                            // Half resolution is invisible under a 28 dp blur and a quarter of
                            // the work (dash:DashBottomBar.kt:210-211).
                            inputScale = HazeInputScale.Fixed(0.5f)
                        }
                    } else {
                        Modifier.background(fallback)
                    },
                )
                .background(sheen)
                .border(1.dp, rim, PillShape)
                .testTag(Tags.BottomBar),
        ) {
            Row(
                Modifier.fillMaxSize().padding(BarPadding)
                    .layout { measurable, constraints ->
                        val placeable = measurable.measure(constraints)
                        motion.width = placeable.width
                        layout(placeable.width, placeable.height) { placeable.place(0, 0) }
                    }
                    .drawWithCache {
                        val rimPx = .5.dp.toPx()
                        val rimStroke = Stroke(rimPx)
                        val radius = CornerRadius(size.height / 2)
                        val rimRadius = CornerRadius(size.height / 2 - rimPx / 2)
                        onDrawWithContent {
                            drawCapsule(motion, capsuleFill, capsuleRim, radius, rimRadius, rimStroke, rimPx)
                            drawContent()
                            drawLabels(motion, labels, labelInk)
                        }
                    }
                    .selectableGroup(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                tabs.forEachIndexed { index, tab ->
                    TabSlot(tab, index, index == selected, motion, reduceMotion) { if (index != selected) onSelect(index) }
                }
            }
        }
    }
}

/**
 * One seat: a touch target two units wide when chosen and one otherwise. It draws only its
 * icon, placed by [TabMotion] so it slides from where it was. Not clipped: mid-glide an icon
 * is drawn where it came from, which after a jump is several slots away, and a slot clip
 * cut it out of sight (dash@1940b64). The bar clips everything to its pill.
 */
@Composable
private fun RowScope.TabSlot(
    tab: BarTab,
    index: Int,
    selected: Boolean,
    motion: TabMotion,
    reduceMotion: Boolean,
    onClick: () -> Unit,
) {
    val colors = AppTheme.colors
    // Tint and bounce stay State and are spent in the draw and layer phases, so a switch
    // repaints two seats and recomposes nothing (flick:FlickBottomNav.kt:346-363).
    val tint = animateColorAsState(
        if (selected) colors.onPrimary else colors.onSurfaceDim,
        orSnap(reduceMotion, tween(TintMillis)),
        label = "tab tint",
    )
    val bounce = animateFloatAsState(
        if (selected) IconBounce else 1f,
        orSnap(reduceMotion, Springs.Bouncy),
        label = "tab bounce",
    )
    val painter = rememberVectorPainter(tab.icon)
    val interaction = remember { MutableInteractionSource() }
    Box(
        Modifier.weight(if (selected) 2f else 1f).fillMaxHeight()
            // No ripple: a neutral ripple on glass is a grey blob (flick:FlickBottomNav.kt:386-395).
            // The travelling capsule is the answer to the tap; the icon dips under the finger.
            .selectable(selected = selected, interactionSource = interaction, indication = null, role = Role.Tab, onClick = onClick)
            .semantics { contentDescription = tab.label }
            .padding(horizontal = TabPadding),
        contentAlignment = Alignment.CenterStart,
    ) {
        Box(
            Modifier.size(TabIconSize)
                .graphicsLayer {
                    translationX = motion.iconAt(index) - motion.slotContentLeft(index)
                    scaleX = bounce.value
                    scaleY = bounce.value
                }
                .pressScale(interaction, pressedScale = IconPressScale)
                .drawBehind { with(painter) { draw(size, colorFilter = ColorFilter.tint(tint.value)) } },
        )
    }
}

/** The one selection capsule, wherever the glide has it. Its rim lies wholly inside it, so no clip ever halves it (dash@1940b64). */
private fun DrawScope.drawCapsule(
    motion: TabMotion,
    fill: Color,
    rim: Color,
    radius: CornerRadius,
    rimRadius: CornerRadius,
    rimStroke: Stroke,
    rimPx: Float,
) {
    val left = motion.capsuleLeft()
    val width = motion.capsuleWidth()
    if (width <= 0f) return
    drawRoundRect(fill, Offset(left, 0f), Size(width, size.height), radius)
    drawRoundRect(rim, Offset(left + rimPx / 2, rimPx / 2), Size(width - rimPx, size.height - rimPx), rimRadius, style = rimStroke)
}

/**
 * Every name that is visible right now: the arriving one fading up as the capsule reaches it,
 * the leaving ones fading out, each riding with its icon and drawn only inside the capsule
 * and inside the width its slot allowed. Names are never drawn on bare glass.
 */
private fun DrawScope.drawLabels(motion: TabMotion, labels: List<TextLayoutResult>, ink: Color) {
    val capsuleLeft = motion.capsuleLeft()
    val capsuleRight = capsuleLeft + motion.capsuleWidth()
    for (index in labels.indices) {
        val alpha = motion.labelAlpha(index)
        if (alpha <= 0f) continue
        val label = labels[index]
        val left = motion.iconAt(index) + motion.iconPx + motion.gapPx
        val top = (size.height - label.size.height) / 2f
        val right = min(capsuleRight, left + motion.restingLabelWidth(index))
        val clipLeft = max(capsuleLeft, left)
        if (right <= clipLeft) continue
        clipRect(left = clipLeft, right = right) {
            drawText(label, color = ink, topLeft = Offset(left, top), alpha = alpha)
        }
    }
}

/**
 * Where the capsule, each icon and each name are on their way to. Slot widths follow from
 * the row width and the chosen index (two units against one); an icon's place follows from
 * the icon, the gap and the name's measured width, so nothing waits for a layout pass.
 * [progress] and [running] are snapshot state read only in the draw and layer phases; the
 * rest are plain fields, so the glide never recomposes the bar.
 *
 * Everything starts from wherever it is when a tab is chosen, so a tab chosen mid-glide
 * carries on from there instead of jumping. Ported from dash:DashBottomBar.kt:361-452; its
 * JVM test is examples/sample/test/TabMotionTest.kt.
 */
internal class TabMotion(private val count: Int, initial: Int) {
    var selected = initial
        private set
    var progress by mutableFloatStateOf(1f)
        private set
    var running by mutableStateOf(false)
        private set
    var animating = false
        private set

    /** Whether the glide under way began by cutting another one short. */
    var overtaking = false
        private set
    private var latest = 1f
    var width = 0
    var iconPx = 0f
    var gapPx = 0f
    var paddingPx = 0f
    val labelWidths = IntArray(count)
    private val iconOrigins = FloatArray(count)
    private val labelOrigins = FloatArray(count)
    private var capsuleOriginLeft = 0f
    private var capsuleOriginWidth = 0f

    private fun slotWidth(selected: Int, index: Int): Float =
        width * (if (index == selected) 2f else 1f) / (count + 1)

    private fun slotLeft(selected: Int, index: Int): Float {
        var left = 0f
        for (slot in 0 until index) left += slotWidth(selected, slot)
        return left
    }

    /** A name as wide as its slot lets it be; at large text the icon centres with the squeezed name. */
    private fun labelWidth(selected: Int, index: Int): Float =
        minOf(labelWidths[index].toFloat(), slotWidth(selected, index) - 2 * paddingPx - iconPx - gapPx).coerceAtLeast(0f)

    /** The slot's padding cancels out: its content is centred in what remains. */
    private fun iconLeft(selected: Int, index: Int): Float {
        val content = iconPx + if (index == selected) gapPx + labelWidth(selected, index) else 0f
        return slotLeft(selected, index) + (slotWidth(selected, index) - content) / 2
    }

    fun iconShift(index: Int): Float = (iconOrigins[index] - iconLeft(selected, index)) * (1f - progress)

    /** Where an icon is drawn right now, mid-glide included. */
    fun iconAt(index: Int): Float = iconLeft(selected, index) + iconShift(index)

    /** Where a slot lays out its icon box (start of its padded content), which [iconAt] offsets from. */
    fun slotContentLeft(index: Int): Float = slotLeft(selected, index) + paddingPx

    /** How wide tab [index]'s name is drawn while it is the one chosen. */
    fun restingLabelWidth(index: Int): Float = labelWidth(index, index)

    /**
     * How visible a name is. The chosen one comes up over the middle half of the glide; every
     * other one is gone within the first third; each starts from the opacity it had when the
     * glide began, so going straight back never blinks a name.
     */
    fun labelAlpha(index: Int): Float {
        if (!running) return if (index == selected) 1f else 0f
        val from = labelOrigins[index]
        return if (index == selected) from + (1f - from) * ((progress - .3f) / .5f).coerceIn(0f, 1f)
        else from * (1f - progress / .3f).coerceIn(0f, 1f)
    }

    fun capsuleLeft(): Float = lerp(capsuleOriginLeft, slotLeft(selected, selected), progress)
    fun capsuleWidth(): Float = lerp(capsuleOriginWidth, slotWidth(selected, selected), progress)

    /** Starts a glide from wherever everything is now, mid-glide included. */
    fun select(index: Int) {
        if (index == selected) return
        overtaking = running
        for (slot in 0 until count) {
            labelOrigins[slot] = labelAlpha(slot)
            val resting = iconLeft(selected, slot)
            iconOrigins[slot] = resting + (iconOrigins[slot] - resting) * (1f - latest)
        }
        capsuleOriginLeft = lerp(capsuleOriginLeft, slotLeft(selected, selected), latest)
        capsuleOriginWidth = lerp(capsuleOriginWidth, slotWidth(selected, selected), latest)
        selected = index
        latest = 0f
        progress = 0f
        animating = true
        running = true
    }

    fun step(value: Float) {
        latest = value
        progress = value
    }

    fun finish() {
        latest = 1f
        progress = 1f
        animating = false
        running = false
        overtaking = false
    }
}
