package com.flick.sender.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.calculateEndPadding
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableIntState
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.dp
import com.flick.sender.R
import com.flick.sender.ui.theme.LocalFlickColors
import com.flick.sender.ui.theme.Motion
import com.flick.sender.ui.theme.PillShape
import com.flick.sender.ui.theme.SheetShape
import com.flick.sender.ui.theme.rememberReduceMotion
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

/** Padding of a sheet's content column: tight above the grabber, generous below. */
private val SheetPadding = PaddingValues(start = 20.dp, top = 12.dp, end = 20.dp, bottom = 24.dp)

/** Clear air between the scrolling region and the first control of a pinned footer. */
private val SheetFooterGap = 16.dp

/** Clear air between a pinned heading and the scrolling region beneath it. */
private val SheetHeaderGap = 10.dp

/** The line a pinned header or footer draws while content is hidden past it. */
private val SheetEdge = 1.dp

/**
 * The smallest scrolling viewport the sheet's own content is left with before a pinned
 * slot has to give way — one text field's worth. Below this the region is not a cramped
 * form, it is a form that cannot be read and, at zero, cannot be scrolled to either.
 */
private val SheetMinScroll = 56.dp

/**
 * How far a sheet must be dragged for the release to let it go, as a fraction of its own
 * height. Proportional rather than fixed, because the gesture means "push this off the
 * screen" and the same 100 dp is most of a short sheet and a nudge to a tall one.
 */
private const val SheetDragFraction = 0.35f

/** …but never less than this, so a stray flick down a list cannot spend the sheet. */
private val SheetDragMinTravel = 96.dp

/**
 * Release speed that dismisses whatever distance was covered — a flick rather than a
 * drag. Well above the speed a finger carries while placing a sheet deliberately.
 */
private val SheetFlingVelocity = 500.dp

/**
 * How many sheets are raised UNDERNEATH the floating chrome.
 *
 * The shell's nav pill and now-playing dock float over the route, so a sheet a route
 * raises inside itself is painted underneath them — the pill lands on whatever sits at
 * the foot of the sheet, which on the pairing sheets is the Connect button. Counting
 * rather than flagging, because a sheet may replace another while the first is still
 * running its exit and a boolean would clear the chrome back in under the second one.
 *
 * The shell hands its overlay layer a counter of its own, because a sheet hosted there is
 * drawn OVER the chrome: evicting bars that sheet already covers is motion nobody asked
 * for, played through a scrim that shows it.
 *
 * The default is a detached counter, so a sheet composed outside the shell — a preview,
 * a test — still increments something real and simply moves no chrome.
 */
internal val LocalSheetDepth = staticCompositionLocalOf<MutableIntState> { mutableIntStateOf(0) }

/**
 * Runs the enclosing sheet's exit, and its dismissal at the end of it.
 *
 * Content that carries its own way out — a "Not now" beside the primary action — is the
 * same dismissal the scrim is, and must not be the one path that blinks. The default is a
 * no-op so a component composed outside a sheet is merely inert rather than broken.
 */
internal val LocalSheetDismiss = staticCompositionLocalOf<() -> Unit> { {} }

/**
 * A scrimmed bottom sheet used for the pairing code, manual entry, the quality
 * sheet (S10) and diagnostics. Tapping the scrim dismisses, dragging it down dismisses,
 * and taps on the sheet are swallowed. The surface colour comes from the enclosing theme,
 * so wrapping a caller in `FlickCinematicTheme` turns the sheet cinematic without
 * changing anything here.
 *
 * [header] is the sheet's heading, pinned outside the scrolling region. A form the
 * keyboard pushes against scrolls its own content to keep the focused field in view, and
 * a heading inside that region goes with it — which is what "the card is cut off at the
 * top" actually was. Anything pinned here survives every scroll offset and every font
 * scale; the description and the fields below it are what give way.
 *
 * [footer] is the sheet's terminal action, pinned for the mirror-image reason. A form
 * whose fields and submit button together outgrow the space a raised keyboard leaves —
 * manual pairing on a tall phone — must not put that button behind a scroll: it is the
 * only way out of the sheet the user came for. A sheet that passes neither slot is laid
 * out exactly as before.
 *
 * Pinning is a claim on height that a short window cannot always honour, so both slots
 * are conditional: see the arrangement chosen below.
 *
 * [visible] is how the APP closes a sheet. Every dismissal is animated, so the sheet has
 * to stay composed for the length of its exit; it answers [onDismiss] once it is actually
 * off the window, and THAT is the call that may remove it. The scrim, Back and a drag
 * past its threshold run the same exit with no caller involvement at all.
 *
 * [onLeaving] is announced once, on the frame the exit begins, whoever began it. A caller
 * that has to attribute the dismissal reads its state HERE and not in [onDismiss]: an
 * exit takes frames, and an app-side close arriving during a user's exit would otherwise
 * rewrite whose dismissal it was between the two calls.
 */
@Composable
fun BottomSheet(
    onDismiss: () -> Unit,
    contentPadding: PaddingValues = SheetPadding,
    visible: Boolean = true,
    onLeaving: () -> Unit = {},
    paneLabel: String? = null,
    header: (@Composable ColumnScope.() -> Unit)? = null,
    footer: (@Composable ColumnScope.() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = LocalFlickColors.current
    val dismissDescription = stringResource(R.string.a11y_dismiss_sheet)
    val sheetTitle = paneLabel ?: stringResource(R.string.a11y_sheet)
    // Held for exactly as long as this sheet is composed — including the frames it
    // spends leaving — so the chrome above it comes back only once it is actually gone.
    val sheetDepth = LocalSheetDepth.current
    DisposableEffect(sheetDepth) {
        sheetDepth.intValue++
        onDispose { sheetDepth.intValue-- }
    }
    val scrimSource = remember { MutableInteractionSource() }
    val sheetSource = remember { MutableInteractionSource() }
    val motion = remember { SheetMotion() }
    val reduceMotion = rememberReduceMotion()
    // The dim runs on an effects spring and the sheet's geometry on a spatial one, so the
    // room darkens before the surface arrives on it rather than the two moving as one
    // slab. The surface's own fade takes the dim's clock, not the rise's: one animation
    // for every opacity in the entrance, and none of them on a spring that rings.
    val riseSpec = MaterialTheme.motionScheme.defaultSpatialSpec<Float>()
    val dimSpec = MaterialTheme.motionScheme.fastEffectsSpec<Float>()
    // The exit is the shorter spring: arriving is an event worth a little travel, leaving
    // is the user asking to be somewhere else.
    val exitSpec = MaterialTheme.motionScheme.fastSpatialSpec<Float>()
    val density = LocalDensity.current
    val minTravelPx = with(density) { SheetDragMinTravel.toPx() }
    val flingPx = with(density) { SheetFlingVelocity.toPx() }
    val minScrollPx = with(density) { SheetMinScroll.roundToPx() }
    val scrimColor = colors.scrim
    val scrollState = rememberScrollState()
    val layoutDirection = LocalLayoutDirection.current
    val scope = rememberCoroutineScope()
    val gone = rememberUpdatedState(onDismiss)
    val began = rememberUpdatedState(onLeaving)
    val currentExit = rememberUpdatedState(exitSpec)
    val currentReduce = rememberUpdatedState(reduceMotion)
    // One exit behind every way out, so none of them can be the one that blinks. Kept
    // stable across recomposition because it is published to the content below, where a
    // fresh lambda each frame would invalidate the whole subtree.
    val leave = remember<() -> Unit>(motion, scope) {
        {
            scope.launch {
                motion.leave(currentExit.value, currentReduce.value, { began.value() }) { gone.value() }
            }
        }
    }
    val onRelease: suspend (Float) -> Unit = { velocity ->
        motion.settle(velocity, exitSpec, reduceMotion, minTravelPx, flingPx, { began.value() }) {
            gone.value()
        }
    }
    val settle = rememberUpdatedState(onRelease)
    // What the pinned slots actually cost, read back from layout rather than assumed: a
    // heading's height is a font scale, a translation and — on the pairing sheets —
    // whether there is an error under the action. Both are measured wherever they end up,
    // so the arrangement they decide can never change the measurement that decided it.
    var headerPx by remember { mutableIntStateOf(0) }
    var footerPx by remember { mutableIntStateOf(0) }
    // A pinned slot keeps the padding on its own side of the scrolling region, so that
    // region sheds a padding there which would only ever read as a second gap.
    val scrollPadding = PaddingValues(
        start = contentPadding.calculateStartPadding(layoutDirection),
        top = if (header == null) contentPadding.calculateTopPadding() else 0.dp,
        end = contentPadding.calculateEndPadding(layoutDirection),
        bottom = if (footer == null) contentPadding.calculateBottomPadding() else 0.dp,
    )
    // UNION, never sum: a raised IME's inset already spans the navigation bar, so
    // adding the two would reserve a second bar of dead space under the keyboard.
    val safeBottom = WindowInsets.ime.union(WindowInsets.navigationBars)
    LaunchedEffect(reduceMotion) { motion.enter(riseSpec, dimSpec, reduceMotion) }
    LaunchedEffect(visible) {
        if (visible) {
            motion.returnToSeat(exitSpec, reduceMotion)
        } else {
            motion.leave(exitSpec, reduceMotion, { began.value() }) { gone.value() }
        }
    }
    // Pairing and diagnostics sheets own Back while visible: a route launch must first
    // dismiss or cancel the in-flight UI rather than closing the Activity underneath it.
    // Still owned while the sheet is leaving, too — a second press during the exit belongs
    // to the sheet that is still on screen, not to the route behind it.
    BackHandler(onBack = leave)
    // The finger's own channel into the sheet: drags on the heading, the footer and the
    // margins, none of which any scrolling region ever sees.
    val dragState = rememberDraggableState { delta -> motion.dragBy(delta, scope) }
    // …and the drags that DO start inside the scrolling region. Those reach the sheet as
    // nested scroll rather than as a gesture of its own, which is what keeps a drag over a
    // text field from fighting the field: the scroll owns the gesture throughout, and only
    // the part of it the content could not use becomes the sheet's travel.
    val drags = remember(motion, scope) {
        object : NestedScrollConnection {
            override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                val delta = available.y
                // Coming back up, the sheet returns to its seat before the content moves;
                // otherwise a half-dragged sheet hangs there while the list scrolls in it.
                val steering = source == NestedScrollSource.UserInput && delta < 0f && motion.travel.value > 0f
                return if (steering) Offset(0f, motion.dragBy(delta, scope)) else Offset.Zero
            }

            override fun onPostScroll(
                consumed: Offset,
                available: Offset,
                source: NestedScrollSource,
            ): Offset {
                val delta = available.y
                return if (source == NestedScrollSource.UserInput && delta > 0f) {
                    Offset(0f, motion.dragBy(delta, scope))
                } else {
                    Offset.Zero
                }
            }

            override suspend fun onPreFling(available: Velocity): Velocity {
                // The sheet is only owed the release when it is the thing that moved.
                if (motion.travel.value <= 0f) return Velocity.Zero
                settle.value(available.y)
                return available
            }
        }
    }
    // Provided around the whole surface: content that carries its own way out — the
    // scanned card's "Not now" — leaves through the one exit rather than past it.
    CompositionLocalProvider(LocalSheetDismiss provides leave) {
        Box(
            Modifier
                .fillMaxSize()
                .drawBehind {
                    drawRect(
                        color = scrimColor,
                        alpha = sheetScrimAlpha(motion.fade.value, motion.travel.value, motion.heightPx),
                    )
                }
                .semantics { contentDescription = dismissDescription }
                // Taken off the modifier chain entirely the moment the sheet commits to
                // leaving, which is the whole point of the flag being observable.
                //
                // [gone] is what removes this Box, and it deliberately does not run until
                // the surface has finished travelling off the window — so for the length of
                // the exit the scrim is still full-screen and still on top. Left clickable
                // it swallows the first tap on the app behind a sheet the user has already
                // dismissed, and answers it by asking for a dismissal already under way.
                // One whole tap, every time, which is exactly how it was reported.
                //
                // REMOVED and not merely `enabled = false`: a disabled `clickable` still
                // installs its pointer-input node and still consumes, so nothing behind it
                // is reached either way (b/239789641). That was tried here first and
                // changed nothing on device. A node that is not in the chain cannot
                // consume; `fillMaxSize`, `drawBehind` and `semantics` take no pointer
                // input, so the tap lands on what it was aimed at.
                //
                // The sheet's own surface stays deaf for that same stretch — see the
                // Initial-pass consumer on it — because a row tapped on a surface half off
                // the screen would answer for a sheet already spent. Only the app behind
                // becomes reachable early, which is where the user is now looking.
                .then(
                    if (motion.leaving) {
                        Modifier
                    } else {
                        Modifier.clickable(
                            interactionSource = scrimSource,
                            indication = null,
                            onClick = leave,
                        )
                    },
                ),
        ) {
            BoxWithConstraints(
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    // OUTSIDE the surface: it reserves height without painting a band or
                    // lifting the sheet off the bottom edge. On a window shorter than the
                    // cap below — landscape, split screen — that cap stops being the
                    // ceiling, and a sheet left free to fill whatever a raised keyboard
                    // leaves puts its heading under the status bar, where no amount of
                    // scrolling can bring it back.
                    .statusBarsPadding()
                    // The card's own height, measured inside that band: it is how far the
                    // sheet has to travel to be off the window, so it is both the exit's
                    // distance and the denominator the scrim lightens against.
                    .onSizeChanged { motion.heightPx = it.height.toFloat() }
                    .heightIn(max = 640.dp)
                    .sheetRiseTransform(motion.riseAmount, motion.fadeAmount, motion.travelAmount)
                    .clip(SheetShape)
                    .background(colors.surfaceRaised)
                    // A sheet on its way out is not a sheet that can be used. Its content
                    // is still on the window for the length of the exit and still under a
                    // finger's reach, so a row tapped there would answer for a sheet the
                    // user has already spent — a folder chosen out of a chooser that is
                    // half off the bottom of the screen. Swallowed in the INITIAL pass and
                    // above every handler below, so nothing inside ever sees the gesture,
                    // and read from the gesture loop rather than from composition, so an
                    // exit still costs no recomposition of the content it is carrying.
                    .pointerInput(motion) {
                        awaitPointerEventScope {
                            while (true) {
                                val event = awaitPointerEvent(PointerEventPass.Initial)
                                if (motion.leaving) event.changes.forEach { it.consume() }
                            }
                        }
                    }
                    .clickable(interactionSource = sheetSource, indication = null, onClick = {})
                    .semantics {
                        paneTitle = sheetTitle
                        isTraversalGroup = true
                    }
                    .nestedScroll(drags)
                    .draggable(
                        state = dragState,
                        orientation = Orientation.Vertical,
                        onDragStopped = { velocity -> settle.value(velocity) },
                    )
                    // Outside the scroll and above the footer, so the inset shrinks the
                    // scrolling VIEWPORT instead of riding inside it: the viewport's bottom
                    // edge is then the safe edge in every state, and no scroll offset —
                    // including a stale one left behind by a collapsing keyboard — can put
                    // the terminal action under the bar. It stays inside the background
                    // above, so the surface still reaches the bottom screen edge with no
                    // scrim gap under it.
                    .windowInsetsPadding(safeBottom),
            ) {
                // The height the card has left after the status bar, the cap above and a
                // raised keyboard have each taken their share — the space the pinned slots
                // are actually competing for.
                val room = constraints.maxHeight
                val measurable = constraints.hasBoundedHeight
                // A slot stays pinned only while this window can seat it AND still leave a
                // viewport the content can be read and scrolled in. The FOOTER gives way
                // first: a terminal action inside the scroll is where it lived before this
                // slot existed and is still reachable there, whereas the heading is the
                // whole thing pinning was for. Both give way together in the degenerate
                // case — a window too short for even the heading plus that viewport, which
                // is landscape or split-screen with a keyboard up — and the card then
                // scrolls as one, exactly as it did before either slot existed. Something
                // is off-screen at that size whatever is done; the floor this holds is
                // that nothing is unreachable.
                val pinHeader = !measurable || headerPx + minScrollPx <= room
                val pinFooter = pinHeader && (!measurable || headerPx + footerPx + minScrollPx <= room)
                val edge = colors.outlineSoft
                Column(Modifier.fillMaxWidth()) {
                    if (header != null && pinHeader) {
                        SheetSlot(
                            pinned = true,
                            top = contentPadding.calculateTopPadding(),
                            bottom = SheetHeaderGap,
                            contentPadding = contentPadding,
                            edgeColor = edge,
                            edgeAtTop = false,
                            hidingContent = { scrollState.canScrollBackward },
                            onHeight = { headerPx = it },
                            content = header,
                        )
                    }
                    Column(
                        Modifier
                            .fillMaxWidth()
                            // fill = false, or the region would stretch to whatever the
                            // window allows and strand the footer at the foot of a mostly
                            // empty sheet.
                            .weight(1f, fill = false)
                            .verticalScroll(scrollState)
                            .padding(scrollPadding),
                    ) {
                        if (header != null && !pinHeader) {
                            SheetSlot(
                                pinned = false,
                                top = contentPadding.calculateTopPadding(),
                                bottom = SheetHeaderGap,
                                contentPadding = contentPadding,
                                edgeColor = edge,
                                edgeAtTop = false,
                                hidingContent = { scrollState.canScrollBackward },
                                onHeight = { headerPx = it },
                                content = header,
                            )
                        }
                        content()
                        if (footer != null && !pinFooter) {
                            SheetSlot(
                                pinned = false,
                                top = SheetFooterGap,
                                bottom = contentPadding.calculateBottomPadding(),
                                contentPadding = contentPadding,
                                edgeColor = edge,
                                edgeAtTop = true,
                                hidingContent = { scrollState.canScrollForward },
                                onHeight = { footerPx = it },
                                content = footer,
                            )
                        }
                    }
                    if (footer != null && pinFooter) {
                        SheetSlot(
                            pinned = true,
                            top = SheetFooterGap,
                            bottom = contentPadding.calculateBottomPadding(),
                            contentPadding = contentPadding,
                            edgeColor = edge,
                            edgeAtTop = true,
                            hidingContent = { scrollState.canScrollForward },
                            onHeight = { footerPx = it },
                            content = footer,
                        )
                    }
                }
            }
        }
    }
}

/**
 * One of the sheet's two pinnable slots, in either of the two places it can be laid out.
 *
 * [pinned] decides exactly two things, and they have to be decided together. The
 * horizontal inset is this slot's own only while it sits outside the scrolling region —
 * inside it, that inset is already there and applying a second one would indent the
 * heading past everything under it. And the hairline is a claim that content is hidden
 * past this edge, which a slot travelling WITH that content cannot make.
 *
 * The vertical padding is deliberately identical in both places. It is what makes the
 * measured height reported through [onHeight] the same wherever the slot is standing, and
 * therefore what keeps the arrangement chosen from that height from being able to change
 * it: a decision that moved the slot and re-measured it differently could oscillate
 * between the two arrangements for ever.
 */
@Composable
private fun SheetSlot(
    pinned: Boolean,
    top: Dp,
    bottom: Dp,
    contentPadding: PaddingValues,
    edgeColor: Color,
    edgeAtTop: Boolean,
    hidingContent: () -> Boolean,
    onHeight: (Int) -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    val layoutDirection = LocalLayoutDirection.current
    Column(
        Modifier
            .fillMaxWidth()
            .onSizeChanged { onHeight(it.height) }
            .drawBehind {
                // Read in the draw phase: a scroll must repaint this line without
                // recomposing the heading or the action it belongs to.
                if (pinned && hidingContent()) {
                    drawRect(
                        color = edgeColor,
                        topLeft = Offset(0f, if (edgeAtTop) 0f else size.height - SheetEdge.toPx()),
                        size = Size(size.width, SheetEdge.toPx()),
                    )
                }
            }
            .padding(
                start = if (pinned) contentPadding.calculateStartPadding(layoutDirection) else 0.dp,
                top = top,
                end = if (pinned) contentPadding.calculateEndPadding(layoutDirection) else 0.dp,
                bottom = bottom,
            ),
        content = content,
    )
}

/** The drag handle at the top of a sheet. */
@Composable
fun SheetGrabber(color: Color = LocalFlickColors.current.outlineSoft) {
    Box(
        Modifier
            .fillMaxWidth()
            .padding(bottom = 13.dp),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(width = 36.dp, height = 4.dp)
                .clip(PillShape)
                .background(color),
        )
    }
}

/**
 * Whether a sheet is on screen, which is not the same question as whether the app still
 * wants it there.
 *
 * A sheet the app closes has an exit to play before it may leave the composition, so
 * [composed] outlives [visible] by exactly that animation. [closingByApp] is what
 * separates the two dismissals at the call site: the scrim, Back and the drag are the
 * user closing the sheet, and whatever that implies elsewhere — cancelling a pairing
 * attempt, dropping a launch — still has to happen. An exit the app started has already
 * done its own bookkeeping, and repeating it there would undo the state it closed for.
 *
 * That verdict is LATCHED, by [leaving], on the frame the exit starts. Derived instead
 * from [visible] at the moment the exit lands, it would answer for whatever happened
 * last: a user drags the sheet away, an error arrives during those frames and runs
 * [close], and the dismissal the user made is then reported as the app's — taking its
 * cleanup with it and leaving the state behind to prefill the next open.
 */
@Stable
internal class SheetSwitch {
    var composed by mutableStateOf(false)
        private set
    var visible by mutableStateOf(false)
        private set
    var closingByApp by mutableStateOf(false)
        private set

    fun open() {
        composed = true
        visible = true
        closingByApp = false
    }

    /** Ask for the exit. The sheet reports back through [gone] once it lands. */
    fun close() {
        if (composed) visible = false
    }

    /**
     * The exit has begun. Whoever the sheet is still wanted by right now is whoever asked
     * for it, and every later answer to that question is this one — the sheet announces
     * this exactly once, and a second request lands on an exit already running.
     */
    fun leaving() {
        closingByApp = !visible
    }

    /** The sheet is off the window: drop it. */
    fun gone() {
        composed = false
        visible = false
        closingByApp = false
    }
}

@Composable
internal fun rememberSheetSwitch(): SheetSwitch = remember { SheetSwitch() }

/**
 * Everything a sheet's entrance and exit are animated from.
 *
 * The three clocks are separate because they answer different questions. [rise] is the
 * entrance's geometry and is allowed to overshoot; [fade] is every opacity in that
 * entrance and must not; [travel] is where the sheet is relative to its seat, driven by a
 * finger while one is down and by the exit spring afterwards. Keeping travel out of the
 * entrance clocks is what lets a drag interrupt an arrival, and what keeps the surface at
 * full opacity on the way out — a sheet that is leaving does it by travelling, not by
 * dissolving where it sits.
 *
 * Nothing here is read during composition. Consumers read the values inside
 * `graphicsLayer`/`drawBehind` lambdas, so a sheet leaving never recomposes its content.
 */
@Stable
internal class SheetMotion {
    val rise = Animatable(0f)
    val fade = Animatable(0f)

    /**
     * How far below its seat the sheet is being held or thrown, in pixels. A pixel is the
     * smallest displacement worth animating and the default threshold is a hundredth of
     * one — and the caller is not told the sheet is gone until this lands.
     */
    val travel = Animatable(0f, visibilityThreshold = 1f)

    /** The sheet's own height in pixels. Written from layout, read from draw and gestures. */
    var heightPx by mutableFloatStateOf(0f)

    /**
     * Set the moment the sheet is on its way out; every later request is the same one.
     *
     * Observable, and read from composition by exactly one thing: whether the scrim still
     * takes taps. That costs a single recomposition per exit — the flag moves once — and it
     * buys back the window in which the scrim was swallowing every tap on the app behind a
     * sheet the user had already dismissed. The gesture loops below and on the surface read
     * it too, and those reads are not in composition and subscribe to nothing, so a drag or
     * an exit still costs no recomposition of the content the sheet is carrying.
     */
    var leaving by mutableStateOf(false)
        private set

    val riseAmount: () -> Float = { rise.value }
    val fadeAmount: () -> Float = { fade.value }
    val travelAmount: () -> Float = { travel.value }

    suspend fun enter(
        riseSpec: FiniteAnimationSpec<Float>,
        dimSpec: FiniteAnimationSpec<Float>,
        reduceMotion: Boolean,
    ) {
        if (reduceMotion) {
            rise.snapTo(1f)
            fade.snapTo(1f)
            return
        }
        coroutineScope {
            launch { rise.animateTo(1f, riseSpec) }
            launch { fade.animateTo(1f, dimSpec) }
        }
    }

    /**
     * Follow the finger. Downward only — the seat is the top of the sheet's travel, and a
     * sheet dragged above it would leave a strip of scrim under its own bottom edge.
     */
    fun dragBy(delta: Float, scope: CoroutineScope): Float {
        if (leaving) return 0f
        val next = (travel.value + delta).coerceAtLeast(0f)
        val consumed = next - travel.value
        // Through the Animatable's own mutex rather than a raw assignment: a settle still
        // in the air is cancelled by the grab that interrupted it. Re-checked inside the
        // launch as well, because a delta accepted on the frame the exit began would
        // otherwise reach that same mutex a moment later and cancel the exit — leaving a
        // sheet parked off its seat that nothing is going to come back for.
        if (consumed != 0f) scope.launch { if (!leaving) travel.snapTo(next) }
        return consumed
    }

    /** The release: carry on off the window, or spring back to the seat. */
    suspend fun settle(
        velocityPxPerSec: Float,
        spec: FiniteAnimationSpec<Float>,
        reduceMotion: Boolean,
        minTravelPx: Float,
        flingPxPerSec: Float,
        onLeaving: () -> Unit = {},
        gone: () -> Unit,
    ) {
        if (leaving) return
        if (sheetDismissedByDrag(travel.value, velocityPxPerSec, heightPx, minTravelPx, flingPxPerSec)) {
            leave(spec, reduceMotion, onLeaving, gone)
        } else if (reduceMotion) {
            travel.snapTo(0f)
        } else {
            // The spring inherits the throw it is undoing, so a sheet caught on the way
            // down settles from the speed it already had rather than from a standstill.
            travel.animateTo(0f, spec, initialVelocity = velocityPxPerSec)
        }
    }

    /**
     * Take the sheet off the bottom of the window and only THEN report it gone. [gone] is
     * what removes the composable, so the removal outlives the exit instead of replacing
     * it — which is the whole difference between a sheet that leaves and one that blinks.
     *
     * [onLeaving] runs first and runs once, before a single frame of travel: it is the
     * only moment at which what STARTED this exit is still the most recent thing to have
     * happened to the sheet.
     */
    suspend fun leave(
        spec: FiniteAnimationSpec<Float>,
        reduceMotion: Boolean,
        onLeaving: () -> Unit = {},
        gone: () -> Unit,
    ) {
        if (leaving) return
        leaving = true
        onLeaving()
        if (!reduceMotion && heightPx > 0f) travel.animateTo(heightPx, spec)
        gone()
    }

    /** A sheet the app asked back before its exit had landed. */
    suspend fun returnToSeat(spec: FiniteAnimationSpec<Float>, reduceMotion: Boolean) {
        leaving = false
        if (travel.value == 0f) return
        if (reduceMotion) travel.snapTo(0f) else travel.animateTo(0f, spec)
    }
}

/**
 * The scrim's opacity for one frame: the entrance's own fade, taken back again in
 * proportion to how far the sheet has been dragged or thrown below its seat. The room
 * lightens under the finger, and a sheet that has travelled its whole height leaves a
 * window with no scrim left on it — which is what makes a dismissal a transition rather
 * than a cut.
 */
internal fun sheetScrimAlpha(fade: Float, travelPx: Float, heightPx: Float): Float {
    if (heightPx <= 0f) return fade
    return fade * (1f - (travelPx / heightPx).coerceIn(0f, 1f))
}

/**
 * Whether a released sheet carries on off-screen instead of springing back.
 *
 * Speed outranks distance in both directions: a flick down from barely below the seat is
 * a dismissal, and a flick back up is a refusal however far the sheet had already
 * travelled. Only a release with no real speed left in it is decided by distance.
 */
internal fun sheetDismissedByDrag(
    travelPx: Float,
    velocityPxPerSec: Float,
    heightPx: Float,
    minTravelPx: Float,
    flingPxPerSec: Float,
): Boolean = when {
    velocityPxPerSec >= flingPxPerSec -> travelPx > 0f
    velocityPxPerSec <= -flingPxPerSec -> false
    else -> travelPx >= maxOf(heightPx * SheetDragFraction, minTravelPx)
}

/**
 * Drives the shared sheet entry. Returned as a lambda so the transform is read in
 * the draw phase and the sheet's content is never recomposed by the animation.
 *
 * The rise is geometry, so it takes the scheme's spatial spring and overshoots — the
 * sheet is the consequence of a flick, and a flick lands with a little more travel
 * than it was aimed with.
 */
@Composable
internal fun rememberSheetRise(): () -> Float =
    rememberEntranceProgress(MaterialTheme.motionScheme.defaultSpatialSpec<Float>())

/** Every alpha in a sheet's entrance: an effects spring, which must not overshoot. */
@Composable
internal fun rememberSheetFade(): () -> Float =
    rememberEntranceProgress(MaterialTheme.motionScheme.fastEffectsSpec<Float>())

@Composable
private fun rememberEntranceProgress(spec: FiniteAnimationSpec<Float>): () -> Float {
    val reduceMotion = rememberReduceMotion()
    val progress = remember { Animatable(0f) }
    LaunchedEffect(reduceMotion) {
        if (reduceMotion) progress.snapTo(1f) else progress.animateTo(1f, spec)
    }
    return remember(progress) { { progress.value } }
}

/**
 * Translate + scale + fade a sheet up from its own bottom edge, all of it in the draw
 * phase. [progress] is the spatial clock and carries the geometry; [fade] is the effects
 * clock and carries the opacity alone. The two are separate because the spatial spring
 * rings through its end state by design, and a surface whose transparency rings with it
 * flickers against the scrim on the way in.
 *
 * [travel] is a third clock belonging to neither: the sheet's distance below its seat,
 * which a finger sets while one is down and the exit spring sets afterwards. It is added
 * to the entrance offset rather than replacing it, so a sheet grabbed mid-arrival moves
 * with the hand instead of jumping to meet it.
 */
internal fun Modifier.sheetRiseTransform(
    progress: () -> Float,
    fade: () -> Float,
    travel: () -> Float = { 0f },
): Modifier = graphicsLayer {
    val p = progress()
    val scale = Motion.SheetRiseScale + (1f - Motion.SheetRiseScale) * p
    alpha = fade()
    scaleX = scale
    scaleY = scale
    translationY = Motion.SheetRiseOffsetDp.dp.toPx() * (1f - p) + travel()
    transformOrigin = TransformOrigin(0.5f, 1f)
}
