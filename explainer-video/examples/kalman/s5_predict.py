from common import *

M0, V0 = 0.9, 0.07
UDT, Q, R = 1.5, 0.06, 0.09
OFFS = [0.22, -0.18, 0.12, -0.08]   # GPS errors used in the little loop demo


class S5Predict(KScene):
    def construct(self):
        chapter_card(self, "Idea 3", "Time: the prediction step")
        ax = Axes(x_range=[0, 8, 1], y_range=[0, 1.9, 0.5], x_length=11.5, y_length=4.2,
                  axis_config=dict(color=DIM, stroke_width=2), x_axis_config=dict(include_numbers=True, font_size=22),
                  tips=False).shift(DOWN * 0.95)
        ax.y_axis.set_opacity(0)
        xl = txt("position (m)", 20, DIM).next_to(ax.x_axis, DOWN, buff=0.12)
        mu, var = ValueTracker(M0), ValueTracker(V0)
        cur = bell(ax, M0, V0, EST, fill=0.3)
        cart = make_cart(TRUTH, fill=0.15).move_to(ax.c2p(M0, 1.95))
        with self.voice("Third idea: time. The cart keeps moving, so our belief has to move too.") as d:
            self.play(FadeIn(ax), FadeIn(xl), FadeIn(cur), FadeIn(cart), run_time=1.2)
            self.play(cart.animate.move_to(ax.c2p(M0 + UDT, 1.95)), run_time=d - 1.2)

        f1 = ctex((r"\mu_p", PRED), r"=", (r"\mu", EST), r"+", r"u\,\Delta t", size=48)
        f2 = ctex((r"\sigma_p^2", PRED), r"=", (r"\sigma^2", EST), r"+", r"q", size=48)
        forms = VGroup(f1, f2).arrange(RIGHT, buff=1.5).to_edge(UP, buff=0.45)
        shift_only = bell(ax, M0 + UDT, V0, PRED, fill=0.2)
        arr = Arrow(ax.c2p(M0, 2.0 / 1.0 * 0 + 1.85), ax.c2p(M0 + UDT, 1.85), buff=0, color=WHITE, stroke_width=3)
        arr_l = MathTex(r"u\,\Delta t", font_size=34).next_to(arr, UP, buff=0.05)
        with self.voice("If the wheels say the cart moves at speed u, then after a time step, delta t, "
                        "our best guess shifts forward by u times delta t.") as d:
            self.play(FadeOut(cart), GrowArrow(arr), Write(arr_l), run_time=1.2)
            self.play(TransformFromCopy(cur, shift_only), run_time=2)
            self.play(Write(f1), run_time=1.5)

        spread = bell(ax, M0 + UDT, V0 + Q, PRED, fill=0.2)
        with self.voice("But the wheel speed isn't perfect, and its errors are unpredictable. "
                        "So as the curve slides forward, it also spreads out.") as d:
            self.wait(d * 0.4)
            self.play(Transform(shift_only, spread), run_time=2)

        note = txt("each step's error is fresh — unrelated to earlier ones", 22, GREY_B).next_to(forms, DOWN, buff=0.3)
        with self.voice("When independent random errors add up, their variances add. So the new variance is the old variance, "
                        "plus q, the variance of the fresh error from this step. It's called process noise. "
                        "We're assuming each step's error really is fresh, unrelated to the ones before.") as d:
            self.play(Write(f2), run_time=1.8)
            self.wait(d * 0.35)
            self.play(Indicate(f2[4], scale_factor=1.6), run_time=1.2)
            self.play(FadeIn(note), run_time=1)

        rule = VGroup(txt("predict → less certain", 28, PRED), txt("measure → more certain", 28, EST)).arrange(RIGHT, buff=1.2)
        rule.to_edge(UP, buff=0.5)
        with self.voice("Prediction always makes us less certain. Measurement always makes us more certain.") as d:
            self.play(FadeOut(VGroup(forms, note)), FadeIn(rule[0]), run_time=1)
            self.wait(d * 0.3)
            self.play(FadeIn(rule[1]), run_time=1)
        self.play(FadeOut(VGroup(arr, arr_l, rule)), FadeOut(shift_only), run_time=0.6)

        # The loop diagram
        bp = RoundedRectangle(width=3.6, height=1.0, corner_radius=0.2, color=PRED)
        bu = RoundedRectangle(width=3.6, height=1.0, corner_radius=0.2, color=EST)
        VGroup(bp, bu).arrange(RIGHT, buff=2.2).to_edge(UP, buff=0.45)
        tp = VGroup(txt("Predict", 28, PRED), txt("slide & spread", 20)).arrange(DOWN, buff=0.06).move_to(bp)
        tu = VGroup(txt("Update", 28, EST), txt("compare & tighten", 20)).arrange(DOWN, buff=0.06).move_to(bu)
        a1 = CurvedArrow(bp.get_right() + UP * 0.15, bu.get_left() + UP * 0.15, angle=-PI / 4, color=GREY_B)
        a2 = CurvedArrow(bu.get_left() + DOWN * 0.15, bp.get_right() + DOWN * 0.15, angle=-PI / 4, color=GREY_B)
        loop = VGroup(bp, bu, tp, tu, a1, a2)

        def cycle(m, v, z, rt):
            mp, vp = m + UDT, v + Q
            pr = bell(ax, mp, vp, PRED, fill=0.2)
            ms = bell(ax, z, R, MEAS, fill=0.15)
            m2, v2 = fuse(mp, vp, z, R)
            po = bell(ax, m2, v2, EST, fill=0.3)
            return (m2, v2), pr, ms, po

        with self.voice("And the Kalman filter is just these two steps, over and over. "
                        "Predict: slide and spread. Update: compare and tighten.") as d:
            self.play(FadeIn(loop), run_time=1)
            m, v = M0, V0
            truth = M0
            per = (d - 1) / 2
            for i in range(2):
                truth += UDT
                (m, v), pr, ms, po = cycle(m, v, truth + OFFS[i], per)
                self.play(ReplacementTransform(cur, pr), bp.animate.set_stroke(width=8), run_time=per * 0.35)
                self.play(FadeIn(ms), bp.animate.set_stroke(width=4), run_time=per * 0.25)
                self.play(ReplacementTransform(pr, po), FadeOut(ms), bu.animate.set_stroke(width=8), run_time=per * 0.3)
                self.play(bu.animate.set_stroke(width=4), run_time=per * 0.1)
                cur = po
        for i in range(2, 4):
            truth += UDT
            (m, v), pr, ms, po = cycle(m, v, truth + OFFS[i], 2)
            self.play(ReplacementTransform(cur, pr), run_time=0.8)
            self.play(FadeIn(ms), run_time=0.4)
            self.play(ReplacementTransform(pr, po), FadeOut(ms), run_time=0.8)
            cur = po
        self.play(FadeOut(VGroup(ax, xl, cur)), loop.animate.scale(0.75).to_edge(UP, buff=0.3), run_time=1)

        # Breathing variance
        P0, q, r = 2.0, 0.5, 1.0
        pts, segs = [(0, P0)], []
        P = P0
        for k in range(1, 11):
            Pm = P + q
            P = Pm * r / (Pm + r)
            pts += [(k, Pm), (k, P)]
        ch = Axes(x_range=[0, 10, 1], y_range=[0, 2.6, 0.5], x_length=10, y_length=4.2,
                  axis_config=dict(color=DIM, stroke_width=2, include_numbers=True, font_size=20),
                  tips=False).to_edge(DOWN, buff=0.7)
        cl = VGroup(txt("time step", 20, DIM).next_to(ch.x_axis, DOWN, buff=0.4),
                    ctex(r"\text{uncertainty }\sigma^2", size=30).rotate(PI / 2).next_to(ch.y_axis, LEFT, buff=0.35))
        for a, b in zip(pts[:-1], pts[1:]):
            col = PRED if b[1] > a[1] else EST
            segs.append(Line(ch.c2p(*a), ch.c2p(*b), color=col, stroke_width=5))
        Pm_ss = (q + np.sqrt(q * q + 4 * q * r)) / 2
        P_ss = Pm_ss * r / (Pm_ss + r)
        ss = VGroup(DashedLine(ch.c2p(0, Pm_ss), ch.c2p(10, Pm_ss), color=PRED, stroke_width=2, stroke_opacity=0.6),
                    DashedLine(ch.c2p(0, P_ss), ch.c2p(10, P_ss), color=EST, stroke_width=2, stroke_opacity=0.6))
        with self.voice("Watch the uncertainty. It breathes. Out with each prediction, in with each measurement. "
                        "And it quickly settles into a steady rhythm, where the spread added by each prediction "
                        "is exactly balanced by what each measurement removes.") as d:
            self.play(Create(ch), FadeIn(cl), run_time=1.2)
            self.play(LaggedStart(*[Create(s) for s in segs], lag_ratio=1.0), run_time=d * 0.6)
            self.play(Create(ss), run_time=1.2)
        self.wait(0.6)
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=1)
