from common import *

MP, VP = 2.4, 0.45 ** 2   # prediction
MZ = 3.4                  # GPS reading
VZ0 = 0.32 ** 2


class S3Combine(KScene):
    def construct(self):
        chapter_card(self, "Idea 2", "Combining two beliefs")
        ax = Axes(x_range=[0, 6, 1], y_range=[0, 1.7, 0.5], x_length=11, y_length=4.0,
                  axis_config=dict(color=DIM, stroke_width=2), x_axis_config=dict(include_numbers=True, font_size=22),
                  tips=False).shift(DOWN * 1.05)
        ax.y_axis.set_opacity(0)
        xl = txt("position (m)", 20, DIM).next_to(ax.x_axis, DOWN, buff=0.12)
        vz = ValueTracker(VZ0)

        prior = bell(ax, MP, VP, PRED)
        meas = always_redraw(lambda: bell(ax, MZ, vz.get_value(), MEAS))
        pl = VGroup(txt("prediction", 26, PRED), txt("(the prior)", 20, PRED)).arrange(DOWN, buff=0.08)
        pl.next_to(ax.c2p(MP, pdf(MP, MP, VP)), UL, buff=0.1)
        ml = VGroup(txt("GPS reading", 26, MEAS), txt("(the likelihood)", 20, MEAS)).arrange(DOWN, buff=0.08)
        ml.next_to(ax.c2p(MZ, pdf(MZ, MZ, VZ0)), UR, buff=0.1)

        with self.voice("Second idea, and this is the heart of everything. "
                        "Suppose our prediction says the cart is around here, with some uncertainty.") as d:
            self.play(Create(ax), FadeIn(xl), run_time=1)
            self.play(Create(prior[1]), FadeIn(prior[0]), FadeIn(pl[0]), run_time=1.5)
        with self.voice("And the GPS says it's around here, with its own uncertainty.") as d:
            self.play(FadeIn(meas), FadeIn(ml[0]), run_time=1.5)
        q = MathTex("?", font_size=80).move_to(ax.c2p(2.95, 1.55))
        with self.voice("What should we believe now? Intuitively, something in between, "
                        "but closer to whichever source is more certain.") as d:
            self.play(Write(q), run_time=1)

        # Pointwise product, scanned left to right
        prod = lambda x: pdf(x, MP, VP) * pdf(x, MZ, VZ0)
        xs = ValueTracker(0.6)
        scan = always_redraw(lambda: DashedLine(ax.c2p(xs.get_value(), 0), ax.c2p(xs.get_value(), 1.65),
                                                color=GREY_B, stroke_width=2))
        d1 = always_redraw(lambda: Dot(ax.c2p(xs.get_value(), pdf(xs.get_value(), MP, VP)), color=PRED, radius=0.07))
        d2 = always_redraw(lambda: Dot(ax.c2p(xs.get_value(), pdf(xs.get_value(), MZ, VZ0)), color=MEAS, radius=0.07))
        d3 = always_redraw(lambda: Dot(ax.c2p(xs.get_value(), prod(xs.get_value())), color=EST, radius=0.07))
        trace = always_redraw(lambda: ax.plot(prod, x_range=[0.6, max(xs.get_value(), 0.61), 0.01],
                                              color=EST, stroke_width=4))
        rule = ctex((r"p_{\text{pred}}(x)", PRED), r"\times", (r"p_{\text{GPS}}(x)", MEAS), size=44).to_edge(UP, buff=0.5)
        with self.voice("Here's the principled way. For every possible position, ask how plausible it is "
                        "according to the prediction, and how plausible it is according to the measurement. "
                        "Then multiply the two.") as d:
            self.play(FadeOut(q), FadeIn(pl[1]), FadeIn(ml[1]), run_time=0.8)
            self.play(Write(rule), run_time=1.2)
            self.add(scan, d1, d2, trace, d3)
            self.play(xs.animate.set_value(5.4), run_time=d - 2.2, rate_func=linear)
        trace.clear_updaters()
        self.play(FadeOut(VGroup(scan, d1, d2, d3)), run_time=0.5)

        st = txt("both agree → survives", 22, EST).move_to(ax.c2p(0.9, 0.62))
        ct = txt("either says no → crushed", 22, GREY_B).move_to(ax.c2p(5.1, 0.62))
        surv = VGroup(st, Arrow(st.get_right(), ax.c2p(2.85, 0.22), buff=0.1, color=EST, stroke_width=3, tip_length=0.15))
        crush = VGroup(ct, Arrow(ct.get_bottom(), ax.c2p(4.3, 0.03), buff=0.1, color=GREY_B, stroke_width=3,
                                 tip_length=0.15))
        with self.voice("Positions that both sources find plausible survive. "
                        "Positions that either one rules out get crushed.") as d:
            self.play(FadeIn(surv), run_time=1)
            self.play(FadeIn(crush), run_time=1)

        mu, v = fuse(MP, VP, MZ, VZ0)
        post = bell(ax, mu, v, EST, fill=0.3)
        bayes = ctex((r"\text{prior}", PRED), r"\times", (r"\text{likelihood}", MEAS), r"\;\propto\;",
                     (r"\text{posterior}", EST), size=44).to_edge(UP, buff=0.5)
        with self.voice("Rescale it so the total area is one again. And remarkably, the product of two Gaussians "
                        "is another Gaussian. This is Bayes' rule in action: the prediction, called the prior, "
                        "times the measurement, called the likelihood, gives our new belief, the posterior.") as d:
            self.play(FadeOut(VGroup(surv, crush)), run_time=0.5)
            self.play(ReplacementTransform(trace, post), run_time=2.5)
            self.wait(d * 0.25)
            self.play(ReplacementTransform(rule, bayes), run_time=1.5)

        def width_bar(m, var, color, y):
            s = np.sqrt(var)
            return Line(ax.c2p(m - s, 0), ax.c2p(m + s, 0), color=color, stroke_width=7).shift(DOWN * y)
        bars = VGroup(width_bar(MP, VP, PRED, 0.95), width_bar(MZ, VZ0, MEAS, 1.15), width_bar(mu, v, EST, 1.35))
        with self.voice("And notice, the new curve is narrower than both of the originals. "
                        "Combining two independent pieces of information leaves you more certain than either one alone.") as d:
            self.play(FadeOut(xl), LaggedStart(*[GrowFromCenter(b) for b in bars], lag_ratio=0.4), run_time=2.5)
            self.play(Indicate(post, color=EST, scale_factor=1.05), run_time=1.2)
        self.play(FadeOut(bars), FadeIn(xl), FadeOut(bayes), run_time=0.6)

        # The formulas
        f_mu = ctex((r"\mu", EST), r"=", r"{", (r"\sigma_z^2", MEAS), (r"\,\mu_p", PRED), r"+", (r"\sigma_p^2", PRED),
                    (r"\,z", MEAS), r"\over", (r"\sigma_p^2", PRED), r"+", (r"\sigma_z^2", MEAS), r"}", size=46)
        f_var = ctex(r"{1 \over", (r"\sigma^2", EST), r"}", r"=", r"{1 \over", (r"\sigma_p^2", PRED), r"}", r"+",
                     r"{1 \over", (r"\sigma_z^2", MEAS), r"}", size=46)
        forms = VGroup(f_mu, f_var).arrange(RIGHT, buff=1.2).to_edge(UP, buff=0.4)
        key = VGroup(ctex((r"\mu_p,\sigma_p", PRED), r"\text{: prediction}", size=30),
                     ctex((r"z,\sigma_z", MEAS), r"\text{: GPS}", size=30),
                     ctex((r"\mu,\sigma", EST), r"\text{: new belief}", size=30)).arrange(RIGHT, buff=0.7)
        key.next_to(forms, DOWN, buff=0.3)
        self.play(FadeOut(VGroup(pl, ml)), run_time=0.5)
        with self.voice("Work out the algebra, and the new mean is a weighted average of the two means, "
                        "where each one is weighted by the other one's variance. So the noisier source gets less say.") as d:
            self.play(Write(f_mu), FadeIn(key), run_time=2.5)
            self.wait(d * 0.3)
            self.play(Indicate(f_mu[3]), Indicate(f_mu[4]), run_time=1.2)
            self.play(Indicate(f_mu[6]), Indicate(f_mu[7]), run_time=1.2)
        with self.voice("The variances combine like this. One over the new variance equals one over each variance, added up. "
                        "One over the variance measures certainty. It's called precision. And precisions simply add.") as d:
            self.play(Write(f_var), run_time=2.5)
            self.wait(d * 0.4)
            self.play(Indicate(f_var[5]), Indicate(f_var[9]), Indicate(f_var[1]), run_time=1.5)

        post_dyn = always_redraw(lambda: bell(ax, *fuse(MP, VP, MZ, vz.get_value()), EST, fill=0.3))
        self.remove(post); self.add(post_dyn)
        with self.voice("Watch what happens as the GPS gets more precise. The new belief slides toward it, and tightens. "
                        "Make the GPS sloppy, and we mostly stick with our prediction.") as d:
            self.play(vz.animate.set_value(0.2 ** 2), run_time=d * 0.4)
            self.play(vz.animate.set_value(1.1 ** 2), run_time=d * 0.45)
        self.play(vz.animate.set_value(VZ0), run_time=1.5)
        self.wait(0.5)
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=1)
