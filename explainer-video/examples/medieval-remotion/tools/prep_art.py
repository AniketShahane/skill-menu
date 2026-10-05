"""Prepare art for the film.
- generated illustrations: divide out the background tint so the paper becomes pure white, then the page's
  `mix-blend-mode: multiply` lays the ink straight onto our vellum with no visible rectangle.
- vellum.jpg: a procedural parchment texture (seeded, so every render matches).
- manuscript miniatures: copied as-is (they're shown framed, not blended)."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
CROP = {"house": (0.30, 0.08, 0.70, 0.95), "ship": (0.17, 0.16, 0.86, 0.85), "monks": (0.13, 0.17, 0.89, 0.81), "tapestry": (0.25, 0.08, 0.75, 0.80)}
SRC, DST = ROOT / "art/gen", ROOT / "video/public/art"
DST.mkdir(parents=True, exist_ok=True)

def whiten(src, dst, maxw=2800):
    im = Image.open(src).convert("RGB")
    if im.width > maxw:
        im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    # Paper colour varies slowly across the page: estimate it with a big blur of the brightest pixels.
    lum = a.mean(2)
    bright = np.where(lum[..., None] > np.percentile(lum, 55), a, np.nan)
    border = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    paper = np.nanmedian(bright.reshape(-1, 3), 0) * 0.5 + np.median(border, 0) * 0.5
    small = Image.fromarray(np.clip(np.nan_to_num(bright, nan=0), 0, 255).astype(np.uint8)).resize((32, 32 * a.shape[0] // a.shape[1] or 1), Image.BOX)
    field = np.asarray(small.resize(im.size, Image.BICUBIC).filter(ImageFilter.GaussianBlur(40))).astype(np.float32)
    field = np.where(field.mean(2, keepdims=True) < paper.mean() * 0.8, paper, field)  # dark areas: use global paper
    out = np.clip(a / np.maximum(field, 1) * 255 * 1.02, 0, 255)
    # lift near-white to pure white so faint stains vanish
    l = out.mean(2, keepdims=True)
    out = np.where(l > 236, 255, out)
    img = Image.fromarray(out.astype(np.uint8))
    name = Path(src).stem
    if name in CROP:  # manual crop (fractions) for images with page edges / frames
        l, t, r, b = CROP[name]
        img = img.crop((int(l * img.width), int(t * img.height), int(r * img.width), int(b * img.height)))
    else:  # crop to the ink, keeping a margin, ignoring the outer 3% (page edges)
        g = np.asarray(img.convert("L")).astype(np.float32)
        m = g < 215
        bx, by = int(0.03 * g.shape[1]), int(0.03 * g.shape[0])
        m[:by] = m[-by:] = False; m[:, :bx] = m[:, -bx:] = False
        ys, xs = np.where(m)
        if len(xs) > 50:
            x0, x1 = np.percentile(xs, [0.2, 99.8]); y0, y1 = np.percentile(ys, [0.2, 99.8])
            mx, my = 0.08 * (x1 - x0), 0.08 * (y1 - y0)
            img = img.crop((int(max(0, x0 - mx)), int(max(0, y0 - my)), int(min(img.width, x1 + mx)), int(min(img.height, y1 + my))))
    img.save(dst, optimize=True)
    return img.width / img.height

def vellum(dst, w=1920, h=1080, seed=7):
    rng = np.random.default_rng(seed)
    def noise(scale):
        s = rng.random((h // scale + 2, w // scale + 2)).astype(np.float32)
        return np.asarray(Image.fromarray((s * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)).astype(np.float32) / 255
    n = 0.45 * noise(240) + 0.3 * noise(90) + 0.17 * noise(24) + 0.08 * noise(4)
    fib = np.asarray(Image.fromarray((rng.random((h, w)) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32) / 255
    yy, xx = np.mgrid[0:h, 0:w]
    r = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2)
    vign = np.clip(1 - 0.22 * np.clip(r - 0.55, 0, None) ** 1.6, 0, 1)
    base = np.array([238, 226, 198], np.float32)
    deep = np.array([214, 192, 150], np.float32)
    t = np.clip((n - 0.35) * 1.4, 0, 1)[..., None]
    img = base * (1 - t * 0.55) + deep * (t * 0.55)
    img = img * (0.985 + 0.03 * fib[..., None]) * vign[..., None]
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(dst, quality=92)

if __name__ == "__main__":
    names = sys.argv[1:]
    import json
    af = DST / "art.json"
    aspects = json.loads(af.read_text()) if af.exists() else {}
    for p in sorted(SRC.glob("*.png")):
        if names and p.stem not in names: continue
        hi = ROOT / "art/hi" / p.name
        if hi.exists(): p = hi  # 2K re-draw (tools/upres.py)
        if p.stem.startswith("test_"): continue
        out = DST / p.name
        if p.stem == "cabinet": continue
        aspects[p.stem] = round(whiten(p, out), 4)
        print("art", p.stem)
    af.write_text(json.dumps(aspects, indent=1))
    if not names or "vellum" in names:
        vellum(ROOT / "video/public/vellum.jpg"); print("vellum")
    m = ROOT / "public/manesse"
    if m.exists():
        md = ROOT / "video/public/manesse"; md.mkdir(exist_ok=True)
        for p in m.glob("*.jpg"):
            (md / p.name).write_bytes(p.read_bytes())
