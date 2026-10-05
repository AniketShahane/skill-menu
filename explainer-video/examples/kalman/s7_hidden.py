from common import *

F = np.array([[1.0, 1.0], [0.0, 1.0]])
Qm = 0.02 * np.array([[0.25, 0.5], [0.5, 1.0]])   # white-acceleration process noise, dt = 1
H = np.array([[1.0, 0.0]])
Rm = 0.25
V_TRUE = 1.2
ZS = [1.26, 2.33, 3.92, 4.85]                     # GPS readings: truth 1.2k + noise (sd 0.5)
M0, P0 = np.array([0.0, 0.0]), np.diag([0.25, 4.0])


def kf_predict(m, P):
    return F @ m, F @ P @ F.T + Qm


def kf_update(m, P, z):
    S = (H @ P @ H.T)[0, 0] + Rm
    K = (P @ H.T)[:, 0] / S
    return m + K * (z - (H @ m)[0]), (np.eye(2) - np.outer(K, H[0])) @ P


class S7Hidden(KScene):
    def construct(self):
        chapter_card(self, "Two dimensions", "Learning what you can't see")
        ax = Axes(x_range=[-5, 9, 1], y_range=[-5, 5, 1], x_length=8.6, y_length=6.0,
                  axis_config=dict(color=DIM, stroke_width=2, include_numbers=True, font_size=18),
                  tips=False).shift(LEFT * 1.75 + DOWN * 0.35)
        xl = txt("position (m)", 20, DIM).next_to(ax.x_axis.get_right(), DOWN, buff=0.35).shift(LEFT * 0.6)
        vl = txt("velocity (m/s)", 20, DIM).rotate(PI / 2).next_to(ax, LEFT, buff=0.25)
        E = np.random.default_rng(3).standard_normal((240, 2))

        # The cloud is m + S e for fixed samples e. Re-factoring S continuously (S_new = S chol(S^-1 P_new S^-T))
        # keeps each dot's identity, so dots glide instead of reshuffling.
        self.S = np.linalg.cholesky(P0)

        def refactor(P):
            Si = np.linalg.inv(self.S)
            self.S = self.S @ np.linalg.cholesky(Si @ P @ Si.T)
            return self.S

        def make_cloud(m, P, color):
            S = refactor(P)
            return VGroup(*[Dot(ax.c2p(*(m + S @ e)), radius=0.035, color=color, fill_opacity=0.75) for e in E])

        def ellipse(m, P, color, width=3):
            L = np.linalg.cholesky(P)
            th = np.linspace(0, TAU, 120)
            pts = [ax.c2p(*(m + 2 * L @ np.array([np.cos(a), np.sin(a)]))) for a in th]
            return VMobject(stroke_color=color, stroke_width=width).set_points_smoothly(pts)

        def vbar(m, P, color):
            s = 2 * np.sqrt(P[1, 1])
            x = ax.c2p(8.6, 0)[0]
            lo, hi = ax.c2p(0, m[1] - s)[1], ax.c2p(0, m[1] + s)[1]
            return VGroup(Line([x, lo, 0], [x, hi, 0], color=color, stroke_width=6),
                          Line([x - 0.1, lo, 0], [x + 0.1, lo, 0], color=color, stroke_width=4),
                          Line([x - 0.1, hi, 0], [x + 0.1, hi, 0], color=color, stroke_width=4))

        def readout(m, P, color):
            return VGroup(txt("velocity estimate", 22, GREY_B),
                          ctex(rf"\hat v = {m[1]:.2f} \pm {2 * np.sqrt(P[1, 1]):.2f}", size=40).set_color(color),
                          txt(f"(true: {V_TRUE} m/s)", 20, GREY_B)).arrange(DOWN, buff=0.15).to_corner(UR, buff=0.5)

        with self.voice("Now for the part that feels like magic. What if there are no wheel sensors at all, only GPS? "
                        "Can we still predict where the cart is going?") as d:
            self.play(FadeIn(txt("only GPS. no wheel sensors.", 34).shift(UP * 0.3), rate_func=there_and_back_with_pause),
                      run_time=d)

        m, P = M0, P0
        cloud = make_cloud(m, P, EST)
        ell = ellipse(m, P, EST)
        state = ctex(r"\text{state} = \begin{bmatrix} \text{position} \\ \text{velocity} \end{bmatrix}", size=34)
        state.to_corner(UR, buff=0.5)
        with self.voice("Yes, if we also keep track of its velocity. Now our state is two numbers: position, and velocity. "
                        "And a Gaussian belief in two dimensions looks like a cloud of possibilities, outlined by an ellipse.") as d:
            self.play(Create(ax), FadeIn(xl), FadeIn(vl), Write(state), run_time=2)
            self.play(LaggedStart(*[FadeIn(c, scale=0.5) for c in cloud], lag_ratio=0.01), run_time=2)
            self.play(Create(ell), run_time=1.2)

        truth = Star(n=5, outer_radius=0.13, color=WHITE, fill_opacity=1).move_to(ax.c2p(0, V_TRUE))
        tl = txt("truth", 18).next_to(truth, UL, buff=0.05)
        bar = vbar(m, P, EST)
        ro = readout(m, P, EST)
        with self.voice("Suppose at first we know the position fairly well, but the velocity hardly at all. "
                        "A tall, thin ellipse.") as d:
            self.play(FadeOut(state), FadeIn(ro), Create(bar), run_time=1.5)
            self.play(FadeIn(truth), FadeIn(tl), run_time=1)

        # Predict: every possibility slides right by its own velocity
        mp, Pp0 = F @ m, F @ P @ F.T
        sheared = VGroup(*[c.copy().move_to(ax.c2p(*(F @ np.array(ax.p2c(c.get_center())))))
                           for c in cloud]).set_color(PRED)
        self.S = F @ self.S
        arrows = VGroup(*[Arrow(c.get_center(), s.get_center(), buff=0, stroke_width=2, tip_length=0.08,
                                color=PRED, max_tip_length_to_length_ratio=0.25)
                          for c, s in list(zip(cloud, sheared))[::8]])
        with self.voice("Now predict one second ahead. A faster cart will have moved further. "
                        "So every possibility slides to the right, by an amount equal to its velocity.") as d:
            self.play(LaggedStart(*[GrowArrow(a) for a in arrows], lag_ratio=0.03), run_time=d * 0.35)
            self.play(Transform(cloud, sheared), Transform(ell, ellipse(mp, Pp0, PRED)),
                      truth.animate.move_to(ax.c2p(V_TRUE, V_TRUE)), FadeOut(tl),
                      FadeOut(arrows), run_time=d * 0.55)

        mp, Pp = kf_predict(m, P)
        cor = Pp[0, 1] / np.sqrt(Pp[0, 0] * Pp[1, 1])
        corr = txt(f"correlation ≈ {cor:.2f}", 22, PRED).next_to(ro, DOWN, buff=0.6)
        hint = VGroup(txt("further ahead than expected", 20), txt("⇒ probably faster", 20)).arrange(DOWN, buff=0.1)
        hint.next_to(corr, DOWN, buff=0.25)
        with self.voice("The ellipse shears, and tilts. Position and velocity have become correlated. "
                        "If the cart is further ahead than expected, it was probably moving faster. "
                        "We also add a little extra spread, for unpredictable pushes.") as d:
            self.play(Indicate(ell, color=PRED, scale_factor=1.05), FadeIn(corr), run_time=1.5)
            self.play(FadeIn(hint), run_time=1)
            self.wait(d * 0.3)
            self.play(Transform(cloud, make_cloud(mp, Pp, PRED)), Transform(ell, ellipse(mp, Pp, PRED)), run_time=1.5)
        m, P = mp, Pp

        def band(z):
            s = 2 * np.sqrt(Rm)
            r = Rectangle(width=ax.c2p(z + s, 0)[0] - ax.c2p(z - s, 0)[0], height=ax.y_length,
                          stroke_width=0, fill_color=MEAS, fill_opacity=0.18).move_to(ax.c2p(z, 0))
            r.set_y(ax.get_center()[1])
            c = DashedLine(ax.c2p(z, -5), ax.c2p(z, 5), color=MEAS, stroke_width=2)
            return VGroup(r, c)
        z = ZS[0]
        b = band(z)
        bl = txt("GPS reading", 22, MEAS).next_to(b, UP, buff=0.08)
        with self.voice("Now a GPS reading arrives. It only tells us about position. A vertical band.") as d:
            self.play(FadeIn(b), FadeIn(bl), FadeOut(VGroup(corr, hint)), run_time=1.5)

        w = np.array([np.exp(-(ax.p2c(c.get_center())[0] - z) ** 2 / (2 * Rm)) for c in cloud])
        w = w / w.max()
        mu2, P2 = kf_update(m, P, z)
        with self.voice("Weight each possibility by how well it agrees with the reading. "
                        "The cloud shrinks along position, as you'd expect. "
                        "But because it's tilted, it also shrinks in velocity!") as d:
            self.play(*[c.animate.set_opacity(0.05 + 0.9 * wi) for c, wi in zip(cloud, w)], run_time=d * 0.3)
            self.wait(d * 0.15)
            self.play(Transform(cloud, make_cloud(mu2, P2, EST)), Transform(ell, ellipse(mu2, P2, EST)),
                      run_time=d * 0.3)
            self.play(Transform(bar, vbar(mu2, P2, EST)), Transform(ro, readout(mu2, P2, EST)), run_time=d * 0.2)
        m, P = mu2, P2

        diff = ctex(r"\frac{\text{now} - \text{a moment ago}}{\text{time}} = \text{speed}", size=28)
        diff.next_to(ro, DOWN, buff=0.7).to_edge(RIGHT, buff=0.4)
        with self.voice("We just learned the cart's speed, without ever measuring speed. In effect, the filter compared "
                        "where the cart was a moment ago, with where it is now. And that difference is a speed.") as d:
            self.play(Circumscribe(ro, color=EST), run_time=1.5)
            self.wait(d * 0.3)
            self.play(Write(diff), run_time=1.8)

        with self.voice("This is the real power of the Kalman filter. Through correlations created by the physics, "
                        "it infers things it can't see directly.") as d:
            self.play(FadeOut(VGroup(b, bl)), run_time=1)
        self.play(FadeOut(diff), run_time=0.5)

        with self.voice("Repeat, and the estimate homes in on the true velocity, "
                        "settling into a narrow, steady band around it.") as d:
            per = (d - 0.2) / 3
            for i, z in enumerate(ZS[1:], start=2):
                mp, Pp = kf_predict(m, P)
                self.play(Transform(cloud, make_cloud(mp, Pp, PRED)), Transform(ell, ellipse(mp, Pp, PRED)),
                          truth.animate.move_to(ax.c2p(V_TRUE * i, V_TRUE)), run_time=per * 0.35)
                b = band(z)
                self.play(FadeIn(b), run_time=per * 0.2)
                m, P = kf_update(mp, Pp, z)
                self.play(Transform(cloud, make_cloud(m, P, EST)), Transform(ell, ellipse(m, P, EST)),
                          Transform(bar, vbar(m, P, EST)), Transform(ro, readout(m, P, EST)),
                          FadeOut(b), run_time=per * 0.45)
        self.wait(1)
        self.play(*[FadeOut(x) for x in self.mobjects], run_time=1)
