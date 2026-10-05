# Manim cookbook (Manim Community 0.21) — patterns and the gotchas that cost time

Use ManimCE APIs only (`from manim import *`, via `from vkit import *`), not 3b1b's `manimlib`. If you
aren't sure an API exists, check it in the venv before relying on it:
`$VENV/bin/python -c "from manim import *; help(Axes.plot)"`. Made-up APIs and parameters are the
main failure mode reported by TheoremExplainAgent.

## Frame and layout budget
The frame is 14.22 × 8 units, centred at the origin (x ∈ [-7.1, 7.1], y ∈ [-4, 4]). Keep text 0.3 units
inside the edges. Plan regions before coding:

| region | y range | use |
|---|---|---|
| title band | 2.6 … 3.7 | formulas, questions, legends |
| stage | -3.2 … 2.4 | the main picture (axes, curves, objects) |
| side panel | x > 3.8 | readouts, stats, small formulas (use `to_edge(RIGHT, buff=0.4)`) |

- **Reserve space for the tallest moment, not the typical one.** Curves that peak high (a very
  narrow Gaussian) will climb into the title band. Clamp the slider range, or lower and shorten the
  axes. Both happened in the Kalman video.
- **Long labels:** use font 20–24 for side panels. Split text over 2 lines instead of shrinking it
  below 18.
- **Axis labels:** if the axis crosses the middle of the plot (y range from negative to positive), put
  "time" labels at the axis end, `UP` side, not `DOWN`, where they collide with tick numbers. Put a
  rotated y label `next_to(ax, LEFT)`, not `next_to(ax.y_axis, LEFT)`, when the y-axis sits mid-plot.
- **Check the layout log** after every render (`media/qa/<Scene>.layout.json`) and look at the contact
  sheet. The log catches text off-frame or overlapping text; only your eyes catch a curve hiding a
  label.

## Core patterns
```python
# Narrated beat: animations inside should total about d seconds; the block waits out the rest.
with self.voice("Watch what happens as the sensor gets sharper.") as d:
    self.play(sigma.animate.set_value(0.2), run_time=rt(d * 0.6))

# Continuous dependence: everything redraws from one tracker.
s = ValueTracker(1.0)
curve = always_redraw(lambda: axes.plot(lambda x: f(x, s.get_value()), color=C_A))

# Morph a static object, then swap in the live (always_redraw) version.
static = make_curve(1.0)
self.play(ReplacementTransform(dot, static))
self.remove(static); self.add(curve)   # ReplacementTransform *into* an always_redraw object is unreliable

# Colored equation whose pieces you can Indicate / Transform by index.
eq = ctex(("\\mu", C_C), "=", "{", ("\\sigma_z^2", C_B), ("\\mu_p", C_A), "\\over", "\\sigma_p^2", "}")
self.play(Indicate(eq[3]))

# Many objects appearing.
self.play(LaggedStart(*[FadeIn(d, scale=2) for d in dots], lag_ratio=0.05), run_time=2)

# Sweep a scan line and trace a product curve (great for "multiply pointwise").
x = ValueTracker(lo)
trace = always_redraw(lambda: axes.plot(prod, x_range=[lo, max(x.get_value(), lo + 0.01), 0.01]))

# Continuous point clouds: keep sample identity so dots glide instead of reshuffling.
# cloud = mean + S @ e with fixed e; refactor S_new = S @ chol(S^-1 P_new S^-T)
```

## Gotchas (each one cost a render)
1. **LaTeX pieces:** 0.21 compiles all MathTex parts in one run, separated by `\special` markers, so
   fragments like `r"\frac{"` or `r"\over"` are fine as separate parts. `\textcolor` is *not*
   available (xcolor isn't loaded). Color by piece with `ctex`.
2. **Parallel renders must not share a media dir.** They delete each other's `.dvi` files, giving
   "Your installation does not support converting .dvi files to SVG". `render.sh` already gives
   each scene `media_<Scene>/`.
3. **`DashedVMobject` has no points of its own.** Keep the source path for `MoveAlongPath` and
   `get_start()`.
4. **`Text.text` drops spaces.** Use `original_text` if you need the string back.
5. **zsh eats `$VAR:suffix`.** `"$M:generateContent"` becomes something else. Write `"${M}:generateContent"`.
6. **always_redraw cost:** each one rebuilds every frame. Fine for a few; for 300 dots, animate a
   VGroup Transform instead.
7. **Updaters on mobjects you'll FadeOut:** clear updaters (`m.clear_updaters()`) on anything frozen
   on screen, or it keeps following its tracker.
8. **Transform between very different point counts** looks like melting. Use FadeTransform or
   ReplacementTransform between similar shapes.
9. **Narration-derived run_times can go ≤ 0.** Wrap them in `rt(...)`, which never returns less than 0.3.
10. **Hidden y-axis:** `ax.y_axis.set_opacity(0)` keeps the coordinate system and hides the line.
11. **Scene joins:** default to ending on a blank frame (`self.play(*[FadeOut(m) for m in self.mobjects])`).
    When consecutive chapters share an object, end on a held frame and rebuild that exact state as the next
    scene's first frame (a match cut), so continuity survives the boundary.
12. **Transform between two Text objects garbles the letters** mid-morph (seen as "secret: ? → 70").
    Use `FadeTransform` for text changes, and `TransformMatchingTex` for equations that share pieces.
13. **Landing an animation on a word:** Gemini returns no word timings, so there are no bookmarks. End
    the voice line at that word and start a new `voice()` block for the rest.
14. **Overruns:** if a block's animations last longer than its speech (`d`), the next line starts late
    and the picture runs ahead of the words. `render.sh lint` lists every overrun; shorten run_times or
    split the line.

## Speed
- `./render.sh lint`: every scene in seconds, no frames drawn. Use it after each edit.
- Preview at 480p15: a 10-minute video took about 3 minutes on a 15-core M-series Mac; a 1.5-minute
  video takes under a minute.
- Final at 1080p60: about 4–5 minutes for 10 minutes of video.
- Re-render only the scenes you changed: `./render.sh l S3Combine S4Gain`.
- Cap the number of scenes to about the number of CPU cores.
