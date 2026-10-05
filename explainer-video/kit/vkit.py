"""vkit — the explainer-video toolkit. `from vkit import *` in every scene file.

Gives you:
  KScene        Scene subclass with `with self.voice("..."):` narration blocks, subtitle capture,
                and automatic QA: text off-frame, text-on-text overlap, and animation overruns
                (a voice block whose animations outlast its speech) are logged.
  txt / ctex    sans text, and MathTex built from colored pieces.
  chapter_card  a short silent title card between chapters.
  Palette       BG, INK, DIM and four semantic accents (C_A..C_D). Give accents a meaning per video
                (e.g. C_A = prediction) and never reuse a color for a different meaning.
"""
import json
import os
import platform
from contextlib import contextmanager
from pathlib import Path

import numpy as np
from manim import *  # noqa: F401,F403  (re-exported to scenes)

import tts as _tts

# ---------------------------------------------------------------- environment
# Manim shells out to latex/dvisvgm; make TinyTeX visible even if the shell PATH lacks it.
for _p in [Path.home() / "Library/TinyTeX/bin/universal-darwin", Path.home() / ".TinyTeX/bin/x86_64-linux",
           Path.home() / ".TinyTeX/bin/aarch64-linux"]:
    if _p.exists() and str(_p) not in os.environ.get("PATH", ""):
        os.environ["PATH"] = f"{_p}{os.pathsep}{os.environ.get('PATH', '')}"

ROOT = _tts.find_project_root()
VIDEO = json.loads((ROOT / "video.json").read_text()) if (ROOT / "video.json").exists() else {}

# ---------------------------------------------------------------- look
BG = VIDEO.get("background", "#0E1117")
INK = WHITE
DIM = GREY_C
C_A = "#58C4DD"   # blue
C_B = "#FFD166"   # yellow
C_C = "#83C167"   # green
C_D = "#FF8C42"   # orange
FONT = VIDEO.get("font", "Helvetica Neue" if platform.system() == "Darwin" else "DejaVu Sans")
PAUSE = float(VIDEO.get("pause_after_line", 0.45))   # silence after each narrated line
config.background_color = BG

TEXTY = (Text, MarkupText, MathTex, Tex)


def txt(s, size=30, color=INK, **kw):
    """Sans-serif label text."""
    return Text(s, font=FONT, font_size=size, color=color, **kw)


def ctex(*parts, size=48):
    """MathTex from parts; a part is 'tex' or ('tex', color). Pieces may be fragments such as
    r'\\frac{' or r'\\over' because Manim 0.21 compiles all parts in one LaTeX run."""
    strs = [p if isinstance(p, str) else p[0] for p in parts]
    m = MathTex(*strs, font_size=size)
    for i, p in enumerate(parts):
        if not isinstance(p, str):
            m[i].set_color(p[1])
    return m


def chapter_card(scene, label, title, hold=0.8):
    n = txt(label, 26, DIM)
    t = txt(title, 50)
    g = VGroup(n, t).arrange(DOWN, buff=0.3)
    scene.play(FadeIn(n, shift=UP * 0.2), Write(t), run_time=1.2)
    scene.wait(hold)
    scene.play(FadeOut(g), run_time=0.6)


def rt(x, lo=0.3):
    """A run_time that is never too short (narration-derived durations can get small)."""
    return max(float(x), lo)


# ---------------------------------------------------------------- scene base

class KScene(Scene):
    """Narrated scene. Use `with self.voice("line") as d:` and fill ~d seconds of animation inside;
    the block then waits out the rest of the line plus PAUSE, so picture and speech stay in step."""

    def setup(self):
        self.subs = []
        self.layout_issues = {}

    @contextmanager
    def voice(self, text, pad=None):
        wav, dur = _tts.synth(text, ROOT)
        t0 = self.renderer.time
        self.add_sound(str(wav))
        line = " ".join(text.split())
        entry = [t0, dur, line, None]
        self.subs.append(entry)
        yield dur
        used = self.renderer.time - t0
        if used - dur > 0.5:  # animations outlasted the speech: dead air, and later reveals land late
            self.layout_issues.setdefault(("overrun", f"+{used - dur:.1f}s  {line[:50]}"), round(t0, 1))
        rem = dur + (PAUSE if pad is None else pad) - used
        if rem > 1 / 60:
            self.wait(rem)
        entry[3] = self.renderer.time  # end of the beat: qa.py samples the settled frame here

    # ---- layout QA: after every play/wait, look at visible text
    def play(self, *a, **kw):
        super().play(*a, **kw)
        self._check_layout()

    def wait(self, *a, **kw):
        super().wait(*a, **kw)
        self._check_layout()

    def _visible_texts(self):
        def walk(m):
            if isinstance(m, TEXTY):
                yield m
                return
            for s in m.submobjects:
                yield from walk(s)
        for top in self.mobjects:
            for m in walk(top):
                fam = m.family_members_with_points()
                if fam and max(f.get_fill_opacity() for f in fam) > 0.15:
                    yield m

    @staticmethod
    def _label(m):
        s = getattr(m, "original_text", None) or getattr(m, "tex_string", None) or getattr(m, "text", None) \
            or type(m).__name__
        return " ".join(str(s).split())[:50]

    def _check_layout(self):
        if not hasattr(self, "layout_issues"):
            return
        hw, hh = config.frame_width / 2 + 0.02, config.frame_height / 2 + 0.02
        t = round(self.renderer.time, 1)
        boxes = []
        for m in self._visible_texts():
            l, r, b, top = m.get_left()[0], m.get_right()[0], m.get_bottom()[1], m.get_top()[1]
            lab = self._label(m)
            if l < -hw or r > hw or b < -hh or top > hh:
                self.layout_issues.setdefault(("off-frame", lab), t)
            boxes.append((l, r, b, top, lab))
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                l1, r1, b1, t1, a = boxes[i]
                l2, r2, b2, t2, c = boxes[j]
                w, h = min(r1, r2) - max(l1, l2), min(t1, t2) - max(b1, b2)
                if w > 0 and h > 0:
                    small = min((r1 - l1) * (t1 - b1), (r2 - l2) * (t2 - b2)) or 1e-9
                    if w * h / small > 0.2:
                        self.layout_issues.setdefault(("overlap", f"{a}  ×  {c}"), t)

    def tear_down(self):
        name = type(self).__name__
        d = ROOT / "media" / "subs"
        d.mkdir(parents=True, exist_ok=True)
        (d / f"{name}.json").write_text(json.dumps({"total": self.renderer.time, "subs": self.subs}))
        q = ROOT / "media" / "qa"
        q.mkdir(parents=True, exist_ok=True)
        issues = [{"t": t, "kind": k, "what": w} for (k, w), t in sorted(self.layout_issues.items(), key=lambda x: x[1])]
        (q / f"{name}.layout.json").write_text(json.dumps(issues, indent=1))
        if issues:
            print(f"[issues] {name}: {len(issues)} (off-frame / overlap / overrun) — see media/qa/{name}.layout.json")
