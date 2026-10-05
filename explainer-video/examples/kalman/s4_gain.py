from common import *
from s3_combine import MP, VP, MZ, VZ0


class S4Gain(KScene):
    def construct(self):
        chapter_card(self, "Idea 2, rewritten", "The Kalman gain")
        ax = Axes(x_range=[0, 6, 1], y_range=[0, 1.7, 0.5], x_length=11, y_length=3.6,
                  axis_config=dict(color=DIM, stroke_width=2), x_axis_config=dict(include_numbers=True, font_size=22),
                  tips=False).shift(DOWN * 0.35)
        ax.y_axis.set_opacity(0)
        vz = ValueTracker(VZ0)
        K = lambda: VP / (VP + vz.get_value())
        post = lambda: fuse(MP, VP, MZ, vz.get_value())

        prior = bell(ax, MP, VP, PRED, fill=0.18)
        meas = always_redraw(lambda: bell(ax, MZ, vz.get_value(), MEAS, fill=0.18))
        postc = always_redraw(lambda: bell(ax, *post(), EST, fill=0.3))
        self.play(FadeIn(ax), FadeIn(prior), FadeIn(meas), FadeIn(postc), run_time=1)

        f_old = ctex((r"\mu", EST), r"=", r"{", (r"\sigma_z^2", MEAS), (r"\,\mu_p", PRED), r"+", (r"\sigma_p^2", PRED),
                     (r"\,z", MEAS), r"\over", (r"\sigma_p^2", PRED), r"+", (r"\sigma_z^2", MEAS), r"}", size=46)
        f_old.to_edge(UP, buff=0.4)
        f_new = ctex((r"\mu", EST), r"=", (r"\mu_p", PRED), r"+", (r"K", GAIN), r"(", (r"z", MEAS), r"-",
                     (r"\mu_p", PRED), r")", size=50).to_edge(UP, buff=0.7).shift(LEFT * 2.8)
        f_K = ctex((r"K", GAIN), r"=", r"{", (r"\sigma_p^2", PRED), r"\over", (r"\sigma_p^2", PRED), r"+",
                   (r"\sigma_z^2", MEAS), r"}", size=50).next_to(f_new, RIGHT, buff=1.4)
        with self.voice("Let's rewrite that weighted average in a more suggestive way.") as d:
            self.play(Write(f_old), run_time=1.5)

        y0 = 0.0
        tick = lambda x, c: Line(ax.c2p(x, 0) + DOWN * 0.18, ax.c2p(x, 0) + UP * 0.18, color=c, stroke_width=5)
        tp = tick(MP, PRED)
        tz = tick(MZ, MEAS)
        lab_p = ctex((r"\mu_p", PRED), size=36).next_to(ax.c2p(MP, 0), UP, buff=0.25).shift(LEFT * 0.25)
        lab_z = ctex((r"z", MEAS), size=36).next_to(ax.c2p(MZ, 0), UP, buff=0.25).shift(RIGHT * 0.2)
        gap_y = 0.8
        brace = BraceBetweenPoints(ax.c2p(MP, 0) + DOWN * gap_y, ax.c2p(MZ, 0) + DOWN * gap_y, direction=DOWN, color=WHITE)
        innov = VGroup(txt("innovation  =  surprise", 22),
                       ctex((r"z", MEAS), r"-", (r"\mu_p", PRED), size=34)).arrange(RIGHT, buff=0.3).next_to(brace, DOWN, buff=0.1)
        with self.voice("Start at the prediction. Look at the gap between what the sensor said, and what you expected. "
                        "This gap is called the innovation. It's the surprise.") as d:
            self.play(FadeOut(f_old), Create(tp), Write(lab_p), run_time=1.2)
            self.play(Create(tz), Write(lab_z), run_time=1)
            self.play(GrowFromCenter(brace), FadeIn(innov), run_time=1.3)

        arrow = always_redraw(lambda: Arrow(ax.c2p(MP, 0) + DOWN * 0.45, ax.c2p(post()[0], 0) + DOWN * 0.45, buff=0,
                                            color=GAIN, stroke_width=5, tip_length=0.18,
                                            max_tip_length_to_length_ratio=0.4))
        tm = always_redraw(lambda: tick(post()[0], EST))
        with self.voice("Then move a fraction, K, of the way across that gap.") as d:
            self.play(GrowArrow(arrow), Create(tm), run_time=1.5)
            self.play(Write(f_new), run_time=1.5)

        # K dial
        dial = NumberLine(x_range=[0, 1, 0.5], length=3.2, include_numbers=True, font_size=22, color=DIM)
        dial.next_to(f_K, DOWN, buff=0.6)
        knob = always_redraw(lambda: Triangle(color=GAIN, fill_opacity=1).scale(0.1).rotate(PI)
                             .next_to(dial.n2p(K()), UP, buff=0.02))
        kval = always_redraw(lambda: ctex((r"K", GAIN), rf"={K():.2f}", size=30).next_to(dial, RIGHT, buff=0.3))
        with self.voice("That fraction, K, is called the Kalman gain. It's the prediction's variance, divided by the total variance. "
                        "And that total is exactly the variance of the innovation itself, because the surprise contains "
                        "both the prediction's error, and the sensor's error.") as d:
            self.play(Write(f_K), run_time=1.8)
            self.play(Create(dial), FadeIn(knob), FadeIn(kval), run_time=1.2)
            self.wait(d * 0.35)
            self.play(Indicate(VGroup(f_K[5], f_K[6], f_K[7])), Indicate(innov[1]), run_time=1.5)

        with self.voice("In this one-dimensional case, K is always between zero and one. "
                        "If the sensor is terrible compared to our prediction, K is near zero, and we barely move. "
                        "If the sensor is excellent, K is near one, and we jump almost all the way to it.") as d:
            self.wait(d * 0.22)
            self.play(vz.animate.set_value(1.6 ** 2), run_time=d * 0.3)
            self.play(vz.animate.set_value(0.2 ** 2), run_time=d * 0.35)
        self.play(vz.animate.set_value(VZ0), run_time=1.5)

        f_var = ctex((r"\sigma^2", EST), r"=", r"(1-", (r"K", GAIN), r")", (r"\sigma_p^2", PRED), size=50)
        f_var.next_to(f_new, DOWN, buff=0.45, aligned_edge=LEFT)
        with self.voice("And the new variance is just one minus K, times the old one. "
                        "The more we trust the measurement, the more our uncertainty shrinks.") as d:
            self.play(Write(f_var), run_time=1.8)
            self.play(vz.animate.set_value(0.15 ** 2), run_time=d * 0.3)
            self.play(vz.animate.set_value(VZ0), run_time=d * 0.3)

        with self.voice("Notice something striking. How much we tighten depends only on how noisy the sensor is, "
                        "not on what it actually said.") as d:
            self.play(Circumscribe(f_var, color=GAIN), run_time=2)

        box = SurroundingRectangle(VGroup(f_new, f_K, f_var), color=GREY_B, buff=0.25, corner_radius=0.1)
        up = txt("the update step", 26, GREY_B).next_to(box, DOWN, buff=0.15, aligned_edge=RIGHT)
        with self.voice("That's the whole update step. Compare, then nudge by K.") as d:
            self.play(FadeOut(VGroup(dial, knob, kval)), run_time=0.5)
            self.play(Create(box), FadeIn(up), run_time=1.5)
        self.wait(0.8)
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=1)
