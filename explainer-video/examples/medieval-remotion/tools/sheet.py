"""Contact sheet of qa/<chapter>/*.png with beat id + narration under each tile."""
import json, sys, textwrap
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
d = Path(__file__).resolve().parent.parent / "qa" / sys.argv[1]
shots = json.loads((d / "shots.json").read_text())
font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 15)
tw, th = 640, 360
cols = 3
rows = (len(shots) + cols - 1) // cols
per = 9  # tiles per sheet
for k in range(0, len(shots), per):
    part = shots[k:k + per]
    r = (len(part) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw, r * (th + 70)), "white")
    for i, s in enumerate(part):
        im = Image.open(d / f"{s['id']}.png").convert("RGB").resize((tw, th))
        x, y = (i % cols) * tw, (i // cols) * (th + 70)
        sheet.paste(im, (x, y))
        ImageDraw.Draw(sheet).text((x + 6, y + th + 4), f"[{s['id']} @{s['frame']}] " + "\n".join(textwrap.wrap(s["text"], 84)[:3]), fill="black", font=font)
    p = d / f"sheet{k // per + 1}.jpg"
    sheet.save(p, quality=82)
    print(p)
