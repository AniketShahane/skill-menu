from common import *
from sim import SEED, N, simulate

D = simulate(SEED)


def interp(arr, t):
    i = int(np.clip(np.floor(t), 0, N - 1))
    f = np.clip(t - i, 0, 1)
    return arr[i] * (1 - f) + arr[i + 1] * f


class S1Hook(KScene):
    def construct(self):
        track = NumberLine(x_range=[-10, 10, 2], length=12.5, color=DIM, include_numbers=True,
                           font_size=22, stroke_width=2).shift(DOWN * 0.6)
        unit = txt("metres", 20, DIM).next_to(track, DOWN, buff=0.5)
        t = ValueTracker(0)

        def on_track(x, lift=0.0):
            return track.n2p(x) + UP * (0.27 + lift)

        cart = make_cart(TRUTH, fill=0.15)
        cart.add_updater(lambda m: m.move_to(on_track(interp(D["x"], t.get_value()))))
        ghost = make_cart(PRED, fill=0.25).set_opacity(0.85)
        ghost.add_updater(lambda m: m.move_to(on_track(interp(D["dr"], t.get_value()), lift=0.55)))

        def gps_marks():
            i = int(np.clip(round(t.get_value()), 0, N))
            g = VGroup()
            for j in range(max(0, i - 6), i + 1):
                age = i - j
                g.add(Dot(on_track(D["z"][j], lift=1.25), radius=0.09 if age == 0 else 0.06,
                          color=MEAS).set_opacity(1.0 if age == 0 else 0.45 * (1 - age / 7)))
            return g

        gps = always_redraw(gps_marks)

        with self.voice("Imagine you're trying to track a little cart, rolling back and forth along a track.") as d:
            self.play(Create(track), FadeIn(unit), run_time=1.5)
            self.add(cart)
            self.play(FadeIn(cart), run_time=0.6)
            self.play(t.animate.set_value(6), run_time=d - 2.4, rate_func=linear)
        self.play(t.animate.set_value(0), run_time=0.8)

        wl = txt("wheels → prediction", 24, PRED)
        wl.add_updater(lambda m: m.next_to(ghost, UP, buff=0.12))
        with self.voice("You have two ways of knowing where it is. First, the wheels. "
                        "By measuring how fast they turn, you can predict where the cart should be.") as d:
            self.add(ghost)
            self.play(FadeIn(ghost), FadeIn(wl), run_time=1)
            self.play(t.animate.set_value(30), run_time=d - 1, rate_func=linear)
        with self.voice("But small errors in that speed add up. "
                        "Over time, the prediction drifts away from the truth.") as d:
            self.play(t.animate.set_value(60), run_time=d, rate_func=linear)
        gap = always_redraw(lambda: DoubleArrow(
            on_track(interp(D["x"], t.get_value()), 0.1), on_track(interp(D["dr"], t.get_value()), 0.1),
            buff=0.35, color=RED_B, stroke_width=3, tip_length=0.15))
        drift = txt("drift", 22, RED_B).add_updater(lambda m: m.next_to(gap, DOWN, buff=0.08))
        self.play(FadeIn(gap), FadeIn(drift))
        self.wait(0.8)
        self.play(FadeOut(VGroup(gap, drift, ghost, wl)), t.animate.set_value(0), run_time=1)
        gap.clear_updaters(); drift.clear_updaters()

        gl = txt("GPS → measurement", 24, MEAS).move_to(on_track(-7, 1.8))
        with self.voice("Second, a GPS sensor. Its errors don't pile up, so it never drifts. "
                        "But every single reading is noisy, jumping around the true position.") as d:
            self.add(gps)
            self.play(FadeIn(gl), run_time=0.8)
            self.play(t.animate.set_value(30), run_time=d - 0.8, rate_func=linear)

        self.add(ghost)
        wl2 = txt("wheels", 24, PRED).add_updater(lambda m: m.next_to(ghost, LEFT, buff=0.15))
        self.add(wl2)
        a = VGroup(txt("Wheels", 30, PRED), txt("smooth, but drifts", 24)).arrange(DOWN, buff=0.15)
        b = VGroup(txt("GPS", 30, MEAS), txt("no drift, but jittery", 24)).arrange(DOWN, buff=0.15)
        pros = VGroup(a, b).arrange(RIGHT, buff=2.5).to_edge(UP, buff=0.5)
        with self.voice("One source is smooth, but drifts. The other doesn't drift, but it's jittery. "
                        "Neither is good enough on its own.") as d:
            self.play(FadeIn(a, shift=DOWN * 0.2), run_time=1)
            self.play(FadeIn(b, shift=DOWN * 0.2), run_time=1)
            self.play(t.animate.set_value(50), run_time=d - 2, rate_func=linear)

        q = txt("How should we combine them?", 40).to_edge(UP, buff=0.6)
        with self.voice("So, how should you combine them?"):
            self.play(FadeOut(pros), FadeIn(q, shift=UP * 0.2))

        est = make_cart(EST, fill=0.35)
        est.add_updater(lambda m: m.move_to(on_track(interp(D["mu"], t.get_value()), lift=-0.0)))
        el = txt("Kalman filter", 24, EST).move_to(on_track(7, 1.8))
        title = txt("The Kalman Filter", 64).to_edge(UP, buff=0.6)
        self.play(FadeOut(VGroup(ghost, wl2, gps, gl, cart)), t.animate.set_value(0), run_time=0.8)
        with self.voice("The answer is the Kalman filter. And by the end of this video, "
                        "you'll see it's just a few simple ideas, stacked on top of each other.") as d:
            self.play(ReplacementTransform(q, title), run_time=1.2)
            self.add(cart, ghost, gps, est)
            self.play(FadeIn(VGroup(cart, ghost, est, el)), run_time=0.6)
            self.add(el)
            self.play(t.animate.set_value(60), run_time=d - 1.8, rate_func=linear)
        self.wait(0.5)
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=1)
