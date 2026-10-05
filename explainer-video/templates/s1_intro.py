"""Starter scene: shows the core patterns. Replace the content, keep the patterns.

Patterns:
  - open on a question in motion: no title card in the first 15 s
  - one narrated beat = one `with self.voice("...") as d:` block; animations inside add up to <= d
  - one deliberate silence per scene (pause-and-ponder), right before or after the key reveal
  - every spoken claim has a visible counterpart (the narration says "four times": the screen shows 4×)
  - continuous change = ValueTracker + always_redraw (the picture follows one number)
  - math arrives last, as a summary of what was seen, colored to match the picture
  - end the scene on a clean frame (fade out), unless the next scene continues the same picture
"""
from vkit import *


class S1Intro(KScene):
    def construct(self):
        r = ValueTracker(0.8)
        centre = LEFT * 3.2
        circle = always_redraw(lambda: Circle(radius=r.get_value(), color=C_A, fill_opacity=0.35).move_to(centre))
        radius = always_redraw(lambda: Line(centre, centre + RIGHT * r.get_value(), color=C_B, stroke_width=5))
        r_lab = always_redraw(lambda: MathTex("r", color=C_B, font_size=40).next_to(radius, UP, buff=0.08))
        paint = always_redraw(lambda: VGroup(txt("paint needed", 24, DIM), DecimalNumber(
            PI * r.get_value() ** 2, num_decimal_places=1, font_size=40, color=C_A)).arrange(DOWN, buff=0.12)
            .next_to(centre, DOWN, buff=2.1))

        with self.voice("Double a circle's radius. How much more paint does it take to fill it?") as d:
            self.play(GrowFromCenter(circle), Create(radius), FadeIn(r_lab), FadeIn(paint), run_time=1.5)
            self.play(r.animate.set_value(1.6), run_time=rt(d - 1.5), rate_func=there_and_back)
        self.wait(2.5)  # pause-and-ponder: let the viewer guess. Silence on purpose.

        with self.voice("Twice as much? Watch the number.") as d:
            self.play(r.animate.set_value(1.6), run_time=rt(d))

        # true size: each is the original small circle (r = 0.8), so the picture proves the claim
        small = VGroup(*[Circle(radius=0.8, color=C_A, fill_opacity=0.35) for _ in range(4)])
        small.arrange_in_grid(2, 2, buff=0.1).move_to(RIGHT * 3.3 + UP * 0.4)
        times4 = MathTex(r"4\times", font_size=56, color=C_D).next_to(small, LEFT, buff=0.3)
        with self.voice("Four times as much. Exactly four of the small circles' worth of paint.") as d:
            self.play(LaggedStart(*[FadeIn(c, scale=0.6) for c in small], lag_ratio=0.3), run_time=rt(d * 0.6))
            self.play(Write(times4), run_time=1)
        self.wait(1)

        area = ctex(("A", C_A), "=", r"\pi", ("r", C_B), "^2", size=60).next_to(small, DOWN, buff=0.7)
        with self.voice("Why four? Because the area grows with the radius squared. A equals pi r squared.") as d:
            self.play(Write(area), run_time=1.5)
            self.play(Indicate(area[3]), Indicate(area[4]), run_time=1.2)

        self.wait(0.5)
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=1)
