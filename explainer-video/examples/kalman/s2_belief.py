from common import *


class S2Belief(KScene):
    def construct(self):
        chapter_card(self, "Idea 1", "A belief is a bell curve")
        ax = Axes(x_range=[0, 10, 1], y_range=[0, 1.1, 0.5], x_length=11, y_length=4.2,
                  axis_config=dict(color=DIM, stroke_width=2), x_axis_config=dict(include_numbers=True, font_size=22),
                  y_axis_config=dict(include_ticks=False), tips=False).shift(DOWN * 0.55)
        ax.y_axis.set_opacity(0)
        xl = txt("position (m)", 20, DIM).next_to(ax.x_axis, DOWN, buff=0.45)
        mu, sig = ValueTracker(5.0), ValueTracker(0.9)

        dot = Dot(ax.c2p(5, 0), color=EST, radius=0.1)
        cart = make_cart(TRUTH, fill=0.15).next_to(dot, UP, buff=0.05)
        claim = txt('"The cart is at 5.0 m."', 30).to_edge(UP, buff=0.7)
        with self.voice("First idea. When we say where the cart is, we shouldn't just give a single number. "
                        "We should describe our belief.") as d:
            self.play(Create(ax), FadeIn(xl), run_time=1.2)
            self.play(FadeIn(cart, shift=DOWN * 0.2), FadeIn(dot), Write(claim), run_time=1.5)
            self.wait(max(d - 4.2, 0.1))
            cross = Line(claim.get_left(), claim.get_right(), color=RED_B, stroke_width=4)
            self.play(Create(cross), run_time=0.8)
        self.play(FadeOut(VGroup(claim, cross, cart)), run_time=0.6)

        curve = always_redraw(lambda: bell(ax, mu.get_value(), sig.get_value() ** 2, EST, fill=0.25))
        peak = lambda: ax.c2p(mu.get_value(), pdf(mu.get_value(), mu.get_value(), sig.get_value() ** 2))
        mu_line = always_redraw(lambda: DashedLine(ax.c2p(mu.get_value(), 0), peak(), color=WHITE, stroke_width=2))
        mu_lab = always_redraw(lambda: MathTex(r"\mu", font_size=44).next_to(peak(), UP, buff=0.15))
        with self.voice("A great way to do that is with a bell curve, called a Gaussian. "
                        "Its peak, the mean, written mu, is our best guess.") as d:
            static = bell(ax, 5.0, 0.81, EST, fill=0.25)
            self.play(ReplacementTransform(dot, static), run_time=1.5)
            self.remove(static); self.add(curve)
            self.play(Create(mu_line), Write(mu_lab), run_time=1)

        def sig_arrow():
            m, s = mu.get_value(), sig.get_value()
            y = pdf(m + s, m, s * s)
            return DoubleArrow(ax.c2p(m, y), ax.c2p(m + s, y), buff=0, color=WHITE, stroke_width=3,
                               tip_length=0.15, max_tip_length_to_length_ratio=0.3)
        sarr = always_redraw(sig_arrow)
        slab = always_redraw(lambda: MathTex(r"\sigma", font_size=40).next_to(sarr, RIGHT, buff=0.12))
        with self.voice("Its width is set by the standard deviation, sigma. It says how unsure we are.") as d:
            self.play(GrowFromCenter(sarr), Write(slab), run_time=1.2)

        conf = txt("confident", 28, EST).to_edge(UP, buff=0.7)
        unsure = txt("unsure", 28, EST).to_edge(UP, buff=0.7)
        with self.voice("A narrow curve means we're confident. "
                        "A wide curve means the cart could be almost anywhere nearby.") as d:
            self.play(sig.animate.set_value(0.4), FadeIn(conf), run_time=d * 0.45)
            self.play(sig.animate.set_value(1.8), FadeTransform(conf, unsure), run_time=d * 0.45)
        self.play(sig.animate.set_value(0.9), FadeOut(unsure), run_time=1)

        def shade():
            m, s = mu.get_value(), sig.get_value()
            return ax.get_area(ax.plot(lambda x: pdf(x, m, s * s), x_range=[m - 1.2, m + 0.6, 0.02]),
                               x_range=[m - 1.2, m + 0.6], color=EST, opacity=0.55).set_stroke(width=0)
        band = always_redraw(shade)
        plaus = txt("height = how plausible each position is", 26).to_edge(UP, buff=0.6)
        area1 = txt("total area = 1   (the cart is somewhere)", 26).next_to(plaus, DOWN, buff=0.25)
        with self.voice("The height of the curve says how plausible each position is. "
                        "And the total area under it is one, because the cart has to be somewhere. "
                        "The area over any stretch is the chance the cart lies in it.") as d:
            self.play(FadeIn(plaus), run_time=1)
            self.wait(d * 0.3)
            self.play(FadeIn(area1), run_time=1)
            self.play(FadeIn(band), run_time=1)
            self.play(sig.animate.set_value(0.6), run_time=d * 0.2)
            self.play(sig.animate.set_value(0.9), run_time=d * 0.2)
        self.play(FadeOut(VGroup(plaus, area1, band)), run_time=0.6)

        formula = ctex(r"p(x) = \frac{1}{\sqrt{2\pi", (r"\sigma^2", WHITE), r"}}\, e^{-\frac{(x-", (r"\mu", WHITE),
                       r")^2}{2", (r"\sigma^2", WHITE), r"}}", size=40).to_corner(UL, buff=0.6)
        var = ctex(r"\sigma^2", r"= \text{variance}", size=44).to_corner(UR, buff=0.7)
        with self.voice("We'll often use sigma squared, the variance. Variances, and their reciprocals, "
                        "are the quantities that combine nicely, as you'll see.") as d:
            self.play(Write(formula), run_time=1.6)
            self.play(Write(var), run_time=1)
            self.play(Indicate(formula[1]), Indicate(formula[5]), Indicate(var[0]), run_time=1.2)

        with self.voice("From now on, every estimate is a curve, not a point.") as d:
            self.play(mu.animate.set_value(3.5), run_time=d * 0.5)
            self.play(mu.animate.set_value(5), run_time=d * 0.5)
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=1)
