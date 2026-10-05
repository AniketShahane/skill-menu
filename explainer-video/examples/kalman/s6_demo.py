from common import *
from sim import SEED, N, simulate, stats

D = simulate(SEED)


class S6Demo(KScene):
    def construct(self):
        chapter_card(self, "All together", "Tracking the cart")
        ax = Axes(x_range=[0, N, 10], y_range=[-10, 12, 5], x_length=8.9, y_length=4.1,
                  axis_config=dict(color=DIM, stroke_width=2, include_numbers=True, font_size=20),
                  tips=False).to_edge(UP, buff=0.85).shift(LEFT * 0.95)
        labs = VGroup(txt("time step", 18, DIM).next_to(ax.x_axis.get_right(), UP, buff=0.15).shift(LEFT * 1.0),
                      txt("position (m)", 18, DIM).rotate(PI / 2).next_to(ax.y_axis, LEFT, buff=0.45))
        k = D["k"]
        line = lambda y, c, w=3: VMobject(stroke_color=c, stroke_width=w).set_points_as_corners(
            [ax.c2p(a, b) for a, b in zip(k, y)])
        truth = line(D["x"], TRUTH, 3)
        wheels = line(D["dr"], PRED, 3)
        gps = VGroup(*[Dot(ax.c2p(a, b), radius=0.04, color=MEAS) for a, b in zip(k, D["z"])])
        leg = VGroup(*[VGroup(Line(ORIGIN, RIGHT * 0.4, color=c, stroke_width=4), txt(s, 20, c)).arrange(RIGHT, buff=0.15)
                       for s, c in [("truth", TRUTH), ("GPS", MEAS), ("wheels only", PRED), ("Kalman filter", EST)]])
        leg.arrange(RIGHT, buff=0.6).to_edge(UP, buff=0.3)
        leg[1][0].become(Dot(leg[1][0].get_center(), radius=0.06, color=MEAS))

        with self.voice("Let's put it all together on our cart. Here's the truth, the GPS readings, "
                        "and the drifting wheel prediction.") as d:
            self.play(Create(ax), FadeIn(labs), run_time=1.2)
            self.play(Create(truth), FadeIn(leg[0]), run_time=1.5)
            self.play(LaggedStart(*[FadeIn(g, scale=2) for g in gps], lag_ratio=0.05), FadeIn(leg[1]), run_time=2)
            self.play(Create(wheels), FadeIn(leg[2]), run_time=max(d - 4.7, 1))

        sd = np.sqrt(D["P"])
        t = ValueTracker(0)

        def upto(n):
            n = max(int(n), 1)
            return k[: n + 1]

        def kf_line():
            ks = upto(t.get_value())
            return VMobject(stroke_color=EST, stroke_width=4).set_points_as_corners(
                [ax.c2p(a, D["mu"][a]) for a in ks])

        def kf_band():
            ks = upto(t.get_value())
            up = [ax.c2p(a, D["mu"][a] + 2 * sd[a]) for a in ks]
            lo = [ax.c2p(a, D["mu"][a] - 2 * sd[a]) for a in ks[::-1]]
            return Polygon(*up, *lo, stroke_width=0, fill_color=EST, fill_opacity=0.25)
        band, kfl = always_redraw(kf_band), always_redraw(kf_line)
        with self.voice("And here's the Kalman filter, with a shaded band showing two standard deviations "
                        "of its uncertainty.") as d:
            self.play(wheels.animate.set_stroke(opacity=0.5), gps.animate.set_opacity(0.6), FadeIn(leg[3]), run_time=0.6)
            self.add(band, kfl)
            self.play(t.animate.set_value(N), run_time=d - 0.6, rate_func=linear)

        g_rmse, k_rmse, drift, inside = stats(D)
        panel = VGroup(
            txt("typical error", 20, GREY_B),
            VGroup(txt("GPS", 22, MEAS), txt(f"{g_rmse:.2f} m", 22)).arrange(RIGHT, buff=0.3),
            VGroup(txt("filter", 22, EST), txt(f"{k_rmse:.2f} m", 22)).arrange(RIGHT, buff=0.3),
            VGroup(txt("wheels", 22, PRED), txt(f"drifted {abs(drift):.1f} m", 22)).arrange(RIGHT, buff=0.3),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.22).to_edge(RIGHT, buff=0.3).shift(UP * 1.4)
        with self.voice("It's smoother than the GPS, and unlike the wheels, it never drifts away. "
                        "It takes the best of both.") as d:
            self.play(FadeIn(panel, shift=LEFT * 0.2), run_time=1.2)
            self.play(Indicate(panel[2]), run_time=1.2)

        zoom_box = Rectangle(width=ax.x_length / N * 14, height=4.1, color=WHITE, stroke_width=2).move_to(
            ax.c2p(37, 1))
        ins = VGroup(txt("truth inside the band", 20, GREY_B), txt(f"{round(inside * 100)}% of steps", 22)
                     ).arrange(DOWN, aligned_edge=LEFT, buff=0.12).next_to(panel, DOWN, buff=0.5, aligned_edge=LEFT)
        with self.voice("And because the filter's noise model matches reality here, the truth stays inside the band "
                        "about ninety-five percent of the time. The filter isn't just accurate. "
                        "It's honest about how unsure it is.") as d:
            self.play(Create(zoom_box), run_time=1)
            self.play(zoom_box.animate.move_to(ax.c2p(20, 1)), run_time=d * 0.35)
            self.play(FadeIn(ins), FadeOut(zoom_box), run_time=1)

        kax = Axes(x_range=[0, N, 10], y_range=[0, 0.8, 0.2], x_length=8.9, y_length=1.3,
                   axis_config=dict(color=DIM, stroke_width=2, include_numbers=True, font_size=18),
                   tips=False).next_to(ax, DOWN, buff=0.55)
        kl = ctex((r"K", GAIN), size=34).next_to(kax.y_axis, LEFT, buff=0.35)
        kc = VMobject(stroke_color=GAIN, stroke_width=4).set_points_as_corners([kax.c2p(a, D["K"][a]) for a in k])
        with self.voice("Watch the gain, K, too. It starts high, because at first we know very little. "
                        "Then it settles to a constant value, matching the steady rhythm we just saw.") as d:
            self.play(Create(kax), FadeIn(kl), run_time=1)
            self.play(Create(kc), run_time=d - 1.2, rate_func=linear)
        self.wait(1)
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=1)
