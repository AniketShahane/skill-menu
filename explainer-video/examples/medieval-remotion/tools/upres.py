"""Re-draw every illustration at 2K from itself (same composition), so nothing is upscaled on screen.
Output: art/hi/<name>.png. prep_art.py prefers art/hi over art/gen."""
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image
sys.path.insert(0, str(Path(__file__).parent))
from genimg import gen
SRC, OUT = Path("art/gen"), Path("art/hi")
PROMPT = ("Re-draw this exact illustration at high resolution. Keep the composition, every figure, pose, colour, "
          "line and the plain cream background identical; only add crisp fine detail to the ink lines and washes. "
          "No new elements, no text, no frame.")
def aspect(p):
    w, h = Image.open(p).size
    r = w / h
    return "21:9" if r > 2.1 else "16:9" if r > 1.5 else "1:1"
names = sys.argv[1:] or [p.stem for p in SRC.glob("*.png") if p.stem != "cabinet"]
todo = [n for n in names if not (OUT / f"{n}.png").exists()]
print(len(todo), "to re-draw")
with ThreadPoolExecutor(4) as ex:
    res = list(ex.map(lambda n: (n, gen(str(OUT / f"{n}.png"), PROMPT, aspect=aspect(SRC / f"{n}.png"), refs=[str(SRC / f"{n}.png")], size="2K")), todo))
print("failed:", [n for n, ok in res if not ok])
