package com.flick.receiver.ui.theme

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * The canonical Flick colour tokens (receiver-expressive-spec.md §2). The TV is
 * ALWAYS "the cinema" — fixed cinematic dark; it never re-tints from artwork, so
 * only the dark set lives here. Values match the design system hex exactly.
 *
 * **The role split flipped with the Expressive redesign, and the flip is
 * load-bearing:**
 * - Amber [Spark] `#FFB61E` carries **focus, transport and the playhead** — it is
 *   the one thing the eye tracks while the film is running. Every focus ring,
 *   the play button, the played portion of the scrub bar and the pairing code
 *   are amber, and nothing else is.
 * - Blue [Primary] / [PrimaryOnDark] carries **brand and the ambient field** —
 *   the mark, the glass tint on chrome, the pairing wash, the QR finder eyes. It
 *   never signals focus.
 *
 * (The previous system had this the other way round — cool cyan for focus, warm
 * coral for action. Nothing in the tree may still assume that.)
 */
object FlickColor {

    // ── 2a. Surfaces ────────────────────────────────────────────────────────

    /** App root / idle bed — blue-black. Never pure #000. */
    val Canvas = Color(0xFF04070F)

    /** Behind the film: one stop darker than [Canvas] so HDR peaks read. */
    val CanvasPlayback = Color(0xFF02040A)

    /** Pairing bed — carries the two ambient radial washes. */
    val CanvasPair = Color(0xFF060C1E)

    /** Raised card fill, design `rgba(9,17,42,.78)`. */
    val Surface = Color(0xC709112A)

    /** Nested card / row inside a [Surface] card. */
    val SurfaceRaised = Color(0xFF0E1A3A)

    /** Opaque twin of [Surface] — for rows that must not stack translucency. */
    val SurfaceRaisedAlt = Color(0xFF09112A)

    /**
     * Top-chrome pills floating over video: `#09112A` @ **34 %**.
     *
     * The design's 13 % was measured against its own dark still. The film is not
     * ours: over a white frame the top scrim has already thinned to ~0.45 by the
     * bottom of the pill row, and 13 % left `OnChrome` at 3.3:1 there. 34 % is the
     * least body that keeps that ink at 4.5:1 at the pill row's lowest edge.
     */
    val Glass = Color(0x5709112A)

    /**
     * Bottom transport panel + side chrome: `#163A8C` @ **34 %**.
     *
     * Same correction, and it is the panel's own top edge that forces it: the
     * transport is ~210 dp tall, so its header row sits barely inside the bottom
     * scrim's ramp. 13 % put the now-playing title at 2.8:1 over a white frame.
     */
    val GlassChrome = Color(0x57163A8C)

    /**
     * Subtitles / metrics panels: `#0F2A66` @ **88 %**.
     *
     * These are bottom-anchored above the transport and reach up through the band
     * that neither scrim covers, so nothing but their own fill is between dense
     * telemetry and an arbitrary frame. The design's `#163A8C` @ 50 % composited
     * to 0.33 luminance over white — titles at 2.7:1. Carried down toward
     * [CanvasPlayback] and thickened, the same blue holds white at 9.6:1 and
     * [OnPanelLabel] at 4.7:1 with no scrim under it at all.
     */
    val GlassPanel = Color(0xE00F2A66)

    /**
     * The plate a **state overlay** carries: `#09112A` @ **82 %**.
     *
     * Between the two playback scrims there is a band with no scrim at all, and
     * that band is deliberate — the film is the point. So the contract is the
     * other way round: anything that lands there owns its backdrop. At 82 % (the
     * same density as [ScrimVeil], which is what the handshake card already puts
     * behind a far less urgent message) white holds 13.8:1 and [Spark] 7.8:1 over
     * a white frame.
     */
    val GlassState = Color(0xD109112A)

    /** 1 dp hairline on glass, `rgba(255,255,255,.14)`. */
    val GlassBorder = Color(0x24FFFFFF)

    /** Cool hairline on the transport panel + side panels, `#96BEFF` @ 30 %. */
    val GlassBorderCool = Color(0x4D96BEFF)

    // ── 2b. Ink ─────────────────────────────────────────────────────────────

    val OnSurface = Color(0xFFF2F6FF)
    val OnSurfaceDim = Color(0xFFA9BCE6)
    val OnSurfaceMuted = Color(0xFF8FA4D6)
    val OnSurfaceFaint = Color(0xFF7E90BE)

    /** Brighter secondary body — the pairing "Listening…" status row. */
    val OnSurfaceSoft = Color(0xFFC9D8F7)

    /** Mono text on glass chrome (net pill, clock pill, spec chips). */
    val OnChrome = Color(0xFFDCE5FF)

    /** Stat / eyebrow labels inside the glass panels. */
    val OnPanelLabel = Color(0xFF9FB6E6)

    /** Ink on white or near-white fills: QR modules, the selected size cell. */
    val OnLight = Color(0xFF0A1533)

    // ── Outlines ────────────────────────────────────────────────────────────

    /** Unfocused control border, `#BEDCFF` @ 34 %. */
    val Outline = Color(0x57BEDCFF)

    /** Spec-chip / divider hairline, `rgba(255,255,255,.2)`. */
    val OutlineHairline = Color(0x33FFFFFF)

    /** The END SESSION pill's 2 dp outline, `rgba(255,255,255,.18)`. */
    val OutlineSoft = Color(0x2EFFFFFF)

    // ── 2c. Brand & accent — the role split ─────────────────────────────────

    /** Brand blue: mark triangle on light, QR finder eyes, ambient washes. */
    val Primary = Color(0xFF1240E8)

    /** Brand blue that survives a dark surface — the mark in chrome. */
    val PrimaryOnDark = Color(0xFF4A78FF)

    /** Links / connection accents. */
    val Link = Color(0xFF6FA0FF)

    /** Amber — focus, transport, playhead, pairing code. The eye's anchor. */
    val Spark = Color(0xFFFFB61E)

    /** Amber emphasis text (eyebrows, the highlighted word in body copy). */
    val SparkBright = Color(0xFFFFC44D)

    /** Playhead gradient end; ink on a selected amber row. */
    val SparkLight = Color(0xFFFFD87A)

    /** [SparkLight] @ 75 % — the meta chip on a selected amber row. */
    val SparkLightDim = Color(0xBFFFD87A)

    /** Ink on amber fills — the play glyph, the inverted side cards. */
    val OnSpark = Color(0xFF33240A)

    /** Secondary ink on amber fills, `rgba(51,36,10,.7)`. */
    val OnSparkDim = Color(0xB333240A)

    // ── 2c. Semantic ────────────────────────────────────────────────────────

    /** Healthy / listening dot. */
    val Live = Color(0xFF5BE38C)

    /** Degraded / recovering. */
    val Caution = Color(0xFFFFA23A)

    /** Crimson — unreachable / failed. Distinct from [Spark]; do not confuse. */
    val Trouble = Color(0xFFC9314D)

    val Info = Link

    /** [Live] @ 16 % — the healthy health-pill bed. */
    val LiveWash = Color(0x295BE38C)

    /** [Caution] @ 16 % — the degraded health-pill bed. */
    val CautionWash = Color(0x29FFA23A)

    // ── Control fills (focus vocabulary, §3) ────────────────────────────────

    /** Unfocused control fill, `rgba(148,190,255,.14)`. */
    val ControlFill = Color(0x2494BEFF)

    /** Slightly denser control fill for the square transport buttons, @ 16 %. */
    val ControlFillStrong = Color(0x2994BEFF)

    /** Close buttons / panel affordances, `rgba(190,220,255,.16)`. */
    val ChromeButtonFill = Color(0x29BEDCFF)

    /** Selected-but-not-focused fill, [Spark] @ 18 %. */
    val SelectedFill = Color(0x2EFFB61E)

    /** Selected-but-not-focused border, [SparkLight] @ 50 %. */
    val SelectedBorder = Color(0x80FFD87A)

    // ── Focus (§3) ──────────────────────────────────────────────────────────

    /** The detached focus ring — amber on every surface… */
    val FocusRing = Spark

    /**
     * The dark contour the detached ring wears on its outer edge.
     *
     * Amber measures 1.8:1 against a white frame — 1.2:1 against the part-scrimmed
     * one under the END SESSION pill — and the ring is the one thing a D-pad user
     * navigates by. On the playback screen it is also the only decoration drawn
     * OUTSIDE its control, i.e. on the film itself. The contour is invisible on
     * every dark surface in the system and is the whole read on a bright one,
     * where it stands at 7.2:1 from the frame and carries amber at 8.5:1.
     */
    val FocusRingContour = Color(0xCC02040A)

    /** …except on an amber fill, where amber-on-amber would vanish. */
    val FocusRingOnSpark = Color(0xFFFFFFFF)

    /** [Spark] @ 34 % — the scrub knob halo and the soft ring bloom. */
    val FocusRingSoft = Color(0x57FFB61E)

    /** [Spark] @ 16 % — the seek-burst wash and ambient focus glow. */
    val FocusGlow = Color(0x29FFB61E)

    // ── Scrub track (§2d) ───────────────────────────────────────────────────

    /** Track base, `rgba(255,255,255,.16)`. */
    val TrackBase = Color(0x29FFFFFF)

    /** Buffered fill, `rgba(255,255,255,.26)`. */
    val TrackBuffered = Color(0x42FFFFFF)

    // ── Scrims & panel light (§2d) ──────────────────────────────────────────

    /** Bottom playback scrim end, `#02040A` @ 92 %. */
    val ScrimEnd = Color(0xEB02040A)

    /**
     * Bottom playback scrim knee, `#02040A` @ 66 %.
     *
     * A single transparent → 92 % ramp over the bottom 56 % of the frame reaches
     * only ~0.20 where the transport panel's own top edge is, which is where the
     * panel's title and eyebrow live. The knee front-loads the ramp so the scrim
     * is dense by the time it meets the chrome it exists for, without widening the
     * band it covers — the film above it is untouched, and the whole scrim is
     * chrome-gated anyway.
     */
    val ScrimKnee = Color(0xA802040A)

    /**
     * The ±10 s burst's bed, `#02040A` @ 70 %.
     *
     * The burst used to be amber @ 16 % alone, which LIGHTENS a bright frame —
     * measurably: the wash came out *brighter* than the film under it and left the
     * white glyph and label at 2.4:1. The amber survives as the accent over this
     * bed; it just can no longer be the only thing there.
     *
     * Nothing may scale this. `seekAccentIntensity` is the speed level and it
     * belongs to the amber alone: applied to the whole wash it took the bed under
     * a single tap down to 0.43 and put the glyph back at 2.4:1.
     */
    val SeekWashBed = Color(0xB302040A)

    /** Top playback scrim start, `#02040A` @ 78 %. */
    val ScrimTop = Color(0xC702040A)

    /** Full-bleed veil behind the handshake card, [Canvas] @ 82 %. */
    val ScrimVeil = Color(0xD104070F)

    /** The transport panel's 1 dp inner top hairline, `rgba(230,242,255,.75)`. */
    val PanelHighlight = Color(0xBFE6F2FF)

    // ── The chrome panel's sheen ────────────────────────────────────────────
    // The phone's floating chrome is glass because it carries four things: a real
    // backdrop blur, a raking specular sheen, a tinted drop shadow and a hairline.
    // The TV cannot have the blur — the film is on a `SurfaceView`, which no
    // backdrop effect can sample, and a live blur over 4K on this TV's GPU is
    // exactly the frame budget the whole app exists to protect. So the TV gets
    // the other three, over the fill it already had: nothing here touches
    // [GlassChrome], whose 34 % was set by a contrast measurement.
    //
    // The sheen is raked, not vertical, and on a panel this wide that matters:
    // see `chromeSheenBrush` for where each stop actually lands.

    /**
     * The specular lip — white @ 32 %, at the sheen's opening stop.
     *
     * The brightest thing the chrome draws, and it is allowed to be because it
     * only ever falls on the panel's own padding. `CHROME_SHEEN_LIP_END` is what
     * holds it there.
     */
    val ChromeSheenLip = Color(0x52FFFFFF)

    /**
     * Where the lip lands once it is off the glint — white @ **1.6 %**, and the
     * most sheen any ink on this panel can receive.
     *
     * The design's 6 % was measured on a mock, not against a frame the app did not
     * choose. Over a white film the transport's tightest row — the amber SYNCING
     * eyebrow, which starts at 4.83:1 against the bare glass — went to 4.11:1 with
     * 6 % of white on top of it, under the 4.5 body floor. Every step down was
     * tested: 2.35 % is the most that keeps every row over the floor, and this is
     * the step below it. `PlaybackContrastTest` is the guard.
     */
    val ChromeSheenShoulder = Color(0x04FFFFFF)

    /** The body of the pane, white @ 0.8 % — half the shoulder, fading to nothing. */
    val ChromeSheenBody = Color(0x02FFFFFF)

    /**
     * The far edge of the pane catching the room — `#96BEFF` @ 8 %, cool rather
     * than white because a pane's foot picks up what is around it, not the light
     * that struck its lip.
     *
     * Held off the ink by `CHROME_SHEEN_FOOT_START` for the same reason as the lip.
     */
    val ChromeSheenFoot = Color(0x1496BEFF)

    /**
     * The most sheen that can fall on any ink the chrome panel carries.
     *
     * [ChromeSheenLip] and [ChromeSheenFoot] are both excluded by construction —
     * their stops sit inside the panel's own padding — so this is the shoulder,
     * which the gradient only ever decays from as it crosses the content. It is
     * what `PlaybackContrastTest` composites over every row.
     */
    val ChromeSheenOverInk = ChromeSheenShoulder

    /** Subtitle cue plate behind burned-in text, `rgba(2,4,10,.62)`. */
    val CueBackground = Color(0x9E02040A)

    // ── Throughput histogram (§5.5) ─────────────────────────────────────────

    /** Bars at or above 50 % of the rolling peak, [Spark] @ 85 %. */
    val HistogramBar = Color(0xD9FFB61E)

    /** Bars below 50 % of the rolling peak, [Caution] @ 60 %. */
    val HistogramBarLow = Color(0x99FFA23A)

    // ── Gradients ───────────────────────────────────────────────────────────

    /** The playhead / played fill — `#FFB61E → #FFD87A`, left to right. */
    val SparkGradient = Brush.horizontalGradient(listOf(Spark, SparkLight))
}
