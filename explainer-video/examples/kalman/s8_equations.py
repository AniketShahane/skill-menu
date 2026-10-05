from common import *

P_ = r"P^-"
XP = r"\hat{x}^-"


class S8Equations(KScene):
    def construct(self):
        chapter_card(self, "The general recipe", "The Kalman filter equations")

        # Covariance matrix ↔ ellipse
        Pm = ctex(r"P =", r"\begin{bmatrix} \sigma_x^2 & c \\ c & \sigma_v^2 \end{bmatrix}", size=52).shift(LEFT * 3 + UP * 0.3)
        xh = ctex(r"\hat{x} =", r"\begin{bmatrix} \text{position} \\ \text{velocity} \end{bmatrix}", size=44)
        xh.next_to(Pm, UP, buff=0.8, aligned_edge=LEFT)
        ang = ValueTracker(0.0)
        ell = always_redraw(lambda: Ellipse(width=1.4, height=3.0, color=EST, fill_opacity=0.2)
                            .apply_matrix([[1, ang.get_value()], [0, 1]]).move_to(RIGHT * 3.2 + UP * 0.3))
        diag_note = txt("diagonal: each variable's variance", 22, GREY_B)
        off_note = txt("off-diagonal: correlation = the tilt", 22, GREY_B)
        VGroup(diag_note, off_note).arrange(DOWN, aligned_edge=LEFT, buff=0.2).next_to(Pm, DOWN, buff=0.7, aligned_edge=LEFT)
        with self.voice("With many variables, the mean becomes a vector, x hat. And the variance becomes a covariance matrix, P. "
                        "Its diagonal holds each variable's variance. Its off-diagonal entries hold the correlations, "
                        "which are the tilt of the ellipse.") as d:
            self.play(Write(xh), run_time=1.5)
            self.play(Write(Pm), FadeIn(ell), run_time=1.8)
            self.wait(d * 0.15)
            self.play(FadeIn(diag_note), run_time=1)
            self.play(FadeIn(off_note), ang.animate.set_value(0.9), run_time=max(d * 0.3, 1))
        self.play(FadeOut(VGroup(Pm, xh, diag_note, off_note, ell)), run_time=0.8)

        # The table: 1D twin | general form
        S = 40
        left = [
            ctex((r"\mu_p", PRED), "=", (r"\mu", EST), r"+ u\,\Delta t", size=S),
            ctex((r"\sigma_p^2", PRED), "=", (r"\sigma^2", EST), "+", "q", size=S),
            ctex((r"K", GAIN), "=", r"{", (r"\sigma_p^2", PRED), r"\over", (r"\sigma_p^2", PRED), "+", (r"\sigma_z^2", MEAS), r"}", size=S),
            ctex((r"\mu", EST), "=", (r"\mu_p", PRED), "+", (r"K", GAIN), "(", (r"z", MEAS), "-", (r"\mu_p", PRED), ")", size=S),
            ctex((r"\sigma^2", EST), "=", r"(1-", (r"K", GAIN), ")", (r"\sigma_p^2", PRED), size=S),
        ]
        right = [
            ctex((XP, PRED), "=", r"F", (r"\hat{x}", EST), r"+ B u", size=S),
            ctex((P_, PRED), "=", r"F", (r"P", EST), r"F^{\top}", "+", "Q", size=S),
            ctex((r"K", GAIN), "=", (P_, PRED), r"H^{\top}", r"(", r"H", (P_, PRED), r"H^{\top}", "+", (r"R", MEAS), r")^{-1}", size=S),
            ctex((r"\hat{x}", EST), "=", (XP, PRED), "+", (r"K", GAIN), "(", (r"z", MEAS), "-", r"H", (XP, PRED), ")", size=S),
            ctex((r"P", EST), "=", r"(I-", (r"K", GAIN), r"H)", (P_, PRED), size=S),
        ]
        ys = [2.0, 1.05, -0.35, -1.6, -2.65]
        for l, r, y in zip(left, right, ys):
            l.move_to([-4.3, y, 0])
            r.move_to([2.4, y, 0])
            r.align_to(np.array([0.0, 0, 0]), LEFT)
        h1 = txt("one dimension", 24, GREY_B).move_to([-4.3, 3.2, 0])
        h2 = txt("any number of dimensions", 24, GREY_B).move_to([2.6 + 1.2, 3.2, 0])
        sep = Line([-1.4, 3.4, 0], [-1.4, -3.3, 0], color=DIM, stroke_width=2)
        predict_box = SurroundingRectangle(VGroup(*left[:2], *right[:2]), color=PRED, buff=0.2, corner_radius=0.1, stroke_width=2)
        update_box = SurroundingRectangle(VGroup(*left[2:], *right[2:]), color=EST, buff=0.2, corner_radius=0.1, stroke_width=2)
        ptag = txt("predict", 22, PRED).next_to(predict_box, LEFT, buff=0.1).rotate(PI / 2)
        utag = txt("update", 22, EST).next_to(update_box, LEFT, buff=0.1).rotate(PI / 2)
        ptag.next_to(predict_box, LEFT, buff=0.08)
        utag.next_to(update_box, LEFT, buff=0.08)

        with self.voice("Here's every step we've built, in one dimension.") as d:
            self.play(FadeIn(h1), Create(sep), run_time=1)
            self.play(LaggedStart(*[Write(l) for l in left], lag_ratio=0.3), run_time=max(d - 1, 0.5))
        self.play(Create(predict_box), Create(update_box), FadeIn(ptag), FadeIn(utag), FadeIn(h2), run_time=1)

        with self.voice("Predict: move the estimate with the motion model, F, plus any known push, B u, like our wheel speed. "
                        "Then transform the uncertainty: F P F-transpose, which is exactly the shear we just saw. "
                        "And add the process noise, Q.") as d:
            self.play(Write(right[0]), run_time=2)
            self.wait(d * 0.2)
            self.play(Write(right[1]), run_time=2)
            self.play(Indicate(VGroup(right[1][2], right[1][3], right[1][4])), run_time=1.2)
            self.play(Indicate(right[1][6]), Indicate(left[1][4]), run_time=1)

        with self.voice("Update: H converts the state into what the sensor measures, and R is the sensor's noise. "
                        "The gain is how much each state variable co-varies with what the sensor sees, divided by the "
                        "total uncertainty of the reading. That co-varies part is exactly how a position reading "
                        "reached across, and corrected velocity.") as d:
            self.play(Write(right[2]), run_time=2.5)
            self.wait(d * 0.15)
            self.play(Indicate(VGroup(*right[2][4:11])), Indicate(VGroup(*left[2][5:8])), run_time=1.5)
            self.wait(d * 0.15)
            self.play(Indicate(VGroup(right[2][2], right[2][3]), scale_factor=1.3), run_time=1.5)

        with self.voice("Then nudge the estimate by K times the innovation, and shrink the covariance.") as d:
            self.play(Write(right[3]), run_time=d * 0.5)
            self.play(Write(right[4]), run_time=d * 0.4)

        links = VGroup(*[Arrow(l.get_right(), [r.get_left()[0], l.get_y(), 0], buff=0.25, color=GREY_D, stroke_width=2,
                               tip_length=0.12) for l, r in zip(left, right)])
        with self.voice("Every symbol here has a one-dimensional twin, that we already understand.") as d:
            self.play(LaggedStart(*[GrowArrow(a) for a in links], lag_ratio=0.2), run_time=d * 0.6)
        self.play(LaggedStart(*[Indicate(VGroup(l, r), scale_factor=1.04) for l, r in zip(left, right)], lag_ratio=0.3),
                  run_time=3)
        self.wait(1)
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=1)
