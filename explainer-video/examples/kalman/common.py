"""Kalman example: vkit plus this video's palette and domain helpers.
Scenes do `from common import *`. Copy the kit files next to them to render (see README.md)."""
from vkit import *

# Semantic colors for this video (the color key in SCRIPT.md)
TRUTH = GREY_A
PRED = C_A   # prediction / prior
MEAS = C_B   # measurement / likelihood
EST = C_C    # estimate / posterior
GAIN = C_D   # Kalman gain


def pdf(x, mu, var):
    return np.exp(-(x - mu) ** 2 / (2 * var)) / np.sqrt(2 * np.pi * var)


def bell(ax, mu, var, color, fill=0.25, width=4, scale=1.0, x_range=None):
    """A Gaussian curve on `ax`, with a soft filled area under it."""
    lo, hi = x_range or (ax.x_range[0], ax.x_range[1])
    s = np.sqrt(var)
    lo, hi = max(lo, mu - 5 * s), min(hi, mu + 5 * s)
    g = ax.plot(lambda x: scale * pdf(x, mu, var), x_range=[lo, hi, (hi - lo) / 200],
                color=color, stroke_width=width)
    if fill <= 0:
        return VGroup(g)
    area = ax.get_area(g, x_range=[lo, hi], color=color, opacity=fill)
    area.set_stroke(width=0)
    return VGroup(area, g)


def fuse(mu1, v1, mu2, v2):
    """Product of two Gaussians (normalized): the Bayes update in 1D."""
    k = v1 / (v1 + v2)
    return mu1 + k * (mu2 - mu1), (1 - k) * v1


def make_cart(color=WHITE, w=0.85, h=0.38, fill=0.0):
    body = RoundedRectangle(width=w, height=h, corner_radius=0.07, color=color, stroke_width=3)
    body.set_fill(color, opacity=fill)
    wheels = VGroup(*[Circle(radius=0.07, color=color, stroke_width=3).set_fill(BG, 1)
                      .move_to(body.get_bottom() + RIGHT * dx) for dx in (-w * 0.28, w * 0.28)])
    return VGroup(body, wheels)
