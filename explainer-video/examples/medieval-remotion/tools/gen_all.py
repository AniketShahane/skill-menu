"""Generate every illustration in art_manifest.py that doesn't exist yet (4 in parallel)."""
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from art_manifest import ART, STYLE
from genimg import gen

OUT = Path("art/gen")
names = sys.argv[1:] or list(ART)
todo = [n for n in names if not (OUT / f"{n}.png").exists() or n in sys.argv[1:]]
print(len(todo), "to make")
def one(n):
    aspect, subject = ART[n]
    style = STYLE if n != "cabinet" else STYLE.replace("Plain, flat, evenly toned warm cream vellum background", "Plain cream vellum background around the cabinet").replace("No text, no lettering, no border, no frame.", "No text, no lettering.")
    return n, gen(str(OUT / f"{n}.png"), f"{subject}\n\n{style}", aspect=aspect)
with ThreadPoolExecutor(4) as ex:
    bad = [n for n, ok in ex.map(one, todo) if not ok]
print("failed:", bad)
