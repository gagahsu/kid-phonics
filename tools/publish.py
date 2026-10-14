"""Copy reviewed crops into assets/img/<slug>.webp.

  py tools/publish.py                  # every work/sheet_* folder
  py tools/publish.py work/sheet_14    # just these

Folders are published in sheet-number order, so a redraw (always a higher
sheet number) overwrites the earlier bad version of the same slug.
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
dst = ROOT / "assets/img"
dst.mkdir(parents=True, exist_ok=True)

dirs = [Path(d) for d in sys.argv[1:]] or sorted((ROOT / "work").glob("sheet_*"))
src = {}
for d in sorted(dirs, key=lambda p: p.name):
    for f in sorted(d.glob("*.png")):
        if not f.name.startswith("_"):
            src[f.stem] = f  # later sheet wins
for slug, f in sorted(src.items()):
    Image.open(f).save(dst / f"{slug}.webp", "WEBP", quality=90, method=4)  # method 6 is ~30x slower for no visible gain
print(f"published {len(src)} images from {len(dirs)} folders -> {dst}")
