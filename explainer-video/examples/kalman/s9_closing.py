from common import *


class S9Closing(KScene):
    def construct(self):
        title = txt("When is it the best you can do?", 40).to_edge(UP, buff=0.6)
        items = VGroup(*[VGroup(MathTex(r"\checkmark", color=EST, font_size=40), txt(s, 28)).arrange(RIGHT, buff=0.3)
                         for s in ["the system is linear",
                                   "the noise is Gaussian, with known variances",
                                   "each step's noise is independent of the others"]])
        items.arrange(DOWN, aligned_edge=LEFT, buff=0.35).next_to(title, DOWN, buff=0.7)
        verdict = VGroup(txt("⇒ provably optimal: smallest average squared error", 28, EST),
                         txt("(and without Gaussian noise: still the best linear estimator)", 22, GREY_B)
                         ).arrange(DOWN, buff=0.2).next_to(items, DOWN, buff=0.6)
        with self.voice("When the system is linear, the noise is Gaussian with known variances, and each step's noise is "
                        "independent of the others, this simple recipe is provably optimal. No other estimator has a smaller "
                        "average squared error. And even without Gaussian noise, it's still the best linear estimator.") as d:
            self.play(Write(title), run_time=1.2)
            self.play(LaggedStart(*[FadeIn(i, shift=RIGHT * 0.2) for i in items], lag_ratio=0.6), run_time=d * 0.45)
            self.play(FadeIn(verdict[0]), run_time=1)
            self.wait(d * 0.15)
            self.play(FadeIn(verdict[1]), run_time=1)
        self.play(FadeOut(VGroup(title, items, verdict)), run_time=0.8)

        curve = FunctionGraph(lambda x: 0.6 * np.sin(1.2 * x) + 0.1 * x, x_range=[-5, 5], color=GREY_B)
        tang = VGroup(*[Line(curve.point_from_proportion(p) + LEFT * 0.6, curve.point_from_proportion(p) + RIGHT * 0.6,
                             color=PRED).rotate(np.arctan(0.72 * np.cos(1.2 * (-5 + 10 * p)) + 0.1),
                                                about_point=curve.point_from_proportion(p))
                        for p in (0.2, 0.5, 0.8)])
        nl = VGroup(txt("not linear?", 34), txt("extended & unscented Kalman filters", 26, PRED),
                    txt("same ideas, applied approximately", 22, GREY_B)).arrange(DOWN, buff=0.2).to_edge(UP, buff=0.7)
        g = VGroup(curve, tang).shift(DOWN * 1.2)
        with self.voice("When things aren't linear, variants like the extended and unscented Kalman filters "
                        "apply the same ideas, approximately.") as d:
            self.play(FadeIn(nl[0]), Create(curve), run_time=1.5)
            self.play(FadeIn(nl[1]), LaggedStart(*[Create(t) for t in tang], lag_ratio=0.3), run_time=1.5)
            self.play(FadeIn(nl[2]), run_time=1)
        self.play(FadeOut(VGroup(nl, g)), run_time=0.8)

        earth = Circle(radius=0.9, color=PRED, fill_opacity=0.25).shift(LEFT * 4 + DOWN * 0.5)
        moon = Circle(radius=0.35, color=GREY_B, fill_opacity=0.3).shift(RIGHT * 4 + UP * 1.2)
        path = ArcBetweenPoints(earth.get_top(), moon.get_left(), angle=-PI / 3, color=WHITE, stroke_width=2)
        arc = path
        path = DashedVMobject(arc, num_dashes=40)
        craft = Dot(color=MEAS).move_to(arc.get_start())
        apollo = txt("Apollo navigation", 26).next_to(path, UP, buff=0.2)
        uses = txt("phones · cars · drones · robots", 28, GREY_B).to_edge(DOWN, buff=0.8)
        with self.voice("It helped navigate Apollo to the Moon. And its descendants run inside phones, cars, drones, "
                        "and countless robots.") as d:
            self.play(FadeIn(earth), FadeIn(moon), Create(path), FadeIn(apollo), run_time=1.5)
            self.play(MoveAlongPath(craft, arc), run_time=d * 0.4)
            self.play(FadeIn(uses), run_time=1)
        self.play(FadeOut(VGroup(earth, moon, path, craft, apollo, uses)), run_time=0.8)

        ax = Axes(x_range=[0, 10, 1], y_range=[0, 1.4, 0.5], x_length=11, y_length=3.2, tips=False,
                  axis_config=dict(color=DIM, stroke_width=2)).shift(DOWN * 1.6)
        ax.y_axis.set_opacity(0)
        lines = [("Every estimate is a belief.", WHITE), ("Predict, and it spreads out.", PRED),
                 ("Measure, and it sharpens.", EST), ("Blend the two, weighted by trust.", GAIN)]
        cap = VGroup(*[txt(s, 34, c) for s, c in lines]).arrange(DOWN, buff=0.25).to_edge(UP, buff=0.6)
        cur = bell(ax, 2.0, 0.09, EST, fill=0.3)
        with self.voice("And at its core is one humble idea. Every estimate is a belief.") as d:
            self.play(Create(ax), FadeIn(cur), run_time=1.2)
            self.play(FadeIn(cap[0]), run_time=1)
        m, v = 2.0, 0.09
        for i, (z, step) in enumerate([(3.6, 1.5), (5.0, 1.5), (6.6, 1.5)]):
            pv = v + 0.15
            pr = bell(ax, m + step, pv, PRED, fill=0.2)
            ms = bell(ax, z, 0.12, MEAS, fill=0.15)
            m, v = fuse(m + step, pv, z, 0.12)
            po = bell(ax, m, v, EST, fill=0.3)
            if i == 0:
                with self.voice("Predict, and the belief spreads out. Measure, and it sharpens. "
                                "Blend the two, weighted by how much you trust each.") as d:
                    self.play(ReplacementTransform(cur, pr), FadeIn(cap[1]), run_time=d * 0.3)
                    self.play(FadeIn(ms), FadeIn(cap[2]), run_time=d * 0.25)
                    self.play(ReplacementTransform(pr, po), FadeOut(ms), FadeIn(cap[3]), run_time=d * 0.3)
            else:
                self.play(ReplacementTransform(cur, pr), run_time=0.9)
                self.play(FadeIn(ms), run_time=0.5)
                self.play(ReplacementTransform(pr, po), FadeOut(ms), run_time=0.9)
            cur = po
        self.play(FadeOut(VGroup(ax, cur, cap)), run_time=1)
        thanks = txt("Thanks for watching.", 44)
        with self.voice("Thanks for watching.") as d:
            self.play(FadeIn(thanks), run_time=1)
        self.wait(1.5)
        self.play(FadeOut(thanks), run_time=1)
