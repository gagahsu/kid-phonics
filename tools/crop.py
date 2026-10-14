"""Crop an AI-generated sticker sheet (white background, grid layout) into
individual transparent PNGs.

Usage:
  py tools/crop.py sheets/sheet_01.png
  (names default to sheets/sheet_01.names.txt, output to work/sheet_01)

Writes <slug>.png per item, manifest.json, review.html and _preview.png
(items on a dark background, to spot halos or eaten edges).

How it works:
  1. foreground = pixels that are not near-white
  2. connected regions (run-length labelling, no size limit)
  3. drop specks and detached pieces of the faint grey sticker outline
  4. k-means seeded at the grid cell centres groups the regions into n items
     (split items, kite tails, raindrops land in the right cell; the cluster
     index is the row-major position, last row may be short)
  5. per item: close gaps + fill holes, peel off the AI's own (uneven) white
     border, then add a uniform white sticker border (scaled to item size)
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

WHITE_T = 236      # channel value above which a pixel counts as "white"
LIGHT_T = 200      # regions whose mean darkest-channel is above this are faint outline debris
MIN_AREA = 30      # px; smaller regions are noise
PEEL_T = 215       # outer pixels lighter than this are the AI's sticker border -> peeled off
BORDER = 0.023     # white sticker border added back, as a fraction of the item's longer side
                   # (~7px for a typical 300px grid item; scales for single big images)
CLOSE = 9          # closing window (px) to seal faint/broken outlines
SIZE = 512         # output square size
PAD = 0.06         # margin around item inside output square


def label(mask: np.ndarray):
    """8-connected components via row runs + union-find.
    Returns list of components, each a list of (y, x0, x1) runs."""
    parent = []

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    runs, prev = [], []
    for y in range(mask.shape[0]):
        row = np.concatenate(([0], mask[y].astype(np.int8), [0]))
        d = np.flatnonzero(np.diff(row))
        cur = []
        j = 0
        for x0, x1 in zip(d[::2], d[1::2]):
            rid = len(runs)
            runs.append((y, int(x0), int(x1)))
            parent.append(rid)
            # previous-row runs touching [x0-1, x1] (8-connectivity)
            while j < len(prev) and runs[prev[j]][2] < x0:
                j += 1
            k = j
            while k < len(prev) and runs[prev[k]][1] <= x1:
                a, b = find(rid), find(prev[k])
                if a != b:
                    parent[a] = b
                k += 1
            cur.append(rid)
        prev = cur
    comps = {}
    for rid, r in enumerate(runs):
        comps.setdefault(find(rid), []).append(r)
    return list(comps.values())


def info(runs, minchan: np.ndarray):
    ys = [r[0] for r in runs]
    area = sum(r[2] - r[1] for r in runs)
    sx = sum((r[1] + r[2] - 1) / 2 * (r[2] - r[1]) for r in runs)
    sy = sum(r[0] * (r[2] - r[1]) for r in runs)
    tone = sum(int(minchan[r[0], r[1]:r[2]].sum()) for r in runs) / area
    return {"runs": runs, "area": area, "c": np.array([sx / area, sy / area]), "tone": tone,
            "box": [min(r[1] for r in runs), min(ys), max(r[2] for r in runs), max(ys) + 1]}


def locate(fg: np.ndarray, minchan: np.ndarray, n: int, cols: int):
    """Group regions into n items laid out row-major on a cols-wide grid.

    k-means on region centroids, seeded at the grid cell centres: split items
    and detached parts fall into the right cell, and the cluster index *is*
    the row-major position. Returns items (runs/box) plus problem notes."""
    rows = -(-n // cols)
    comps = [info(c, minchan) for c in label(fg)]
    # drop specks and detached pieces of the faint grey sticker outline
    comps = [c for c in comps if c["area"] >= MIN_AREA and c["tone"] < LIGHT_T]
    if not comps:
        return [], ["nothing found"]
    x0 = min(c["box"][0] for c in comps); x1 = max(c["box"][2] for c in comps)
    y0 = min(c["box"][1] for c in comps); y1 = max(c["box"][3] for c in comps)
    cw, ch = (x1 - x0) / cols, (y1 - y0) / rows
    centers = np.array([[x0 + (i % cols + 0.5) * cw, y0 + (i // cols + 0.5) * ch] for i in range(n)])
    pts = np.array([c["c"] for c in comps])
    w = np.array([c["area"] for c in comps], float)
    for _ in range(20):
        assign = np.argmin(((pts[:, None, :] - centers[None]) ** 2).sum(-1), axis=1)
        new = centers.copy()
        for k in range(n):
            sel = assign == k
            if sel.any():
                new[k] = (pts[sel] * w[sel, None]).sum(0) / w[sel].sum()
        if np.allclose(new, centers):
            break
        centers = new

    problems, items = [], []
    for k in range(n):
        mine = [c for c, a in zip(comps, assign) if a == k]
        if not mine:
            problems.append(f"cell {k + 1}: empty")
            items.append(None)
            continue
        items.append({"runs": [r for c in mine for r in c["runs"]],
                      "area": sum(c["area"] for c in mine),
                      "box": [min(c["box"][0] for c in mine), min(c["box"][1] for c in mine),
                              max(c["box"][2] for c in mine), max(c["box"][3] for c in mine)]})
    live = [it for it in items if it]
    med = float(np.median([it["area"] for it in live]))
    for k, it in enumerate(items):
        if it and it["area"] < 0.15 * med:
            problems.append(f"cell {k + 1}: suspiciously small ({it['area']}px) — missing item?")
        if it and it["area"] > 3 * med:
            problems.append(f"cell {k + 1}: suspiciously large ({it['area']}px) — two items merged?")
    return items, problems


def exterior(mask: np.ndarray) -> np.ndarray:
    """True where a False-pixel of mask is reachable from the crop border."""
    img = Image.fromarray(np.where(mask, 0, 255).astype(np.uint8)).copy()
    ImageDraw.floodfill(img, (0, 0), 128, thresh=0)  # crop is padded, (0,0) is outside
    return np.asarray(img) == 128


def render_item(it, crop: Image.Image, pad: int) -> Image.Image:
    """Cut one item out of its padded crop and give it a uniform white sticker border.

    1. item regions -> close small gaps -> fill holes (keeps white areas inside the outline)
    2. peel: near-white pixels connected to the outside are the AI's own sticker
       border (thickness varies per sheet) -> remove, stopping at the dark outline
    3. grow a white border (BORDER x longer side) around what is left"""
    x0, y0, x1, y1 = it["box"]
    w, h = crop.size
    m = np.zeros((h, w), np.uint8)
    for y, a, b in it["runs"]:
        m[y - y0 + pad, a - x0 + pad:b - x0 + pad] = 255
    m = np.asarray(Image.fromarray(m).filter(ImageFilter.MaxFilter(CLOSE)).filter(ImageFilter.MinFilter(CLOSE))) > 0
    m = ~exterior(m)
    light = np.asarray(crop.convert("RGB")).min(axis=2) > PEEL_T
    m = ~exterior(m & ~light)  # flood through the light rim, stop at the dark outline
    body = Image.fromarray(np.where(m, 255, 0).astype(np.uint8))
    border = max(3, round(BORDER * max(x1 - x0, y1 - y0)))
    rim = body.filter(ImageFilter.MaxFilter(2 * border + 1)).filter(ImageFilter.GaussianBlur(0.8))
    out = Image.new("RGBA", crop.size, (255, 255, 255, 0))
    out.putalpha(rim)
    out.paste(crop, (0, 0), body.filter(ImageFilter.GaussianBlur(0.6)))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sheet")
    ap.add_argument("--cols", type=int, default=3)
    ap.add_argument("--rows", type=int, help="only needed without --names")
    ap.add_argument("--names", help="text file, one name per line, row-major; its length = item count "
                                    "(default: SHEET with .names.txt instead of .png)")
    ap.add_argument("--out", help="default: work/<sheet name>")
    a = ap.parse_args()

    sheet = Path(a.sheet)
    if not a.names and sheet.with_suffix(".names.txt").exists():
        a.names = str(sheet.with_suffix(".names.txt"))
    if not a.out:
        a.out = str(Path(__file__).resolve().parent.parent / "work" / sheet.stem)
    names = None
    if a.names:
        names = [l.strip() for l in Path(a.names).read_text(encoding="utf-8").splitlines() if l.strip()]
    if not names and not a.rows:
        ap.error("give --names or --rows")
    n = len(names) if names else a.rows * a.cols
    rows = -(-n // a.cols)

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.png"):
        old.unlink()
    im = Image.open(a.sheet).convert("RGB")
    minchan = np.asarray(im).min(axis=2)
    found, problems = locate(minchan <= WHITE_T, minchan, n, a.cols)

    pad = CLOSE + round(BORDER * max(im.size)) + 2  # room for closing and the grown border
    src = Image.new("RGB", (im.width + 2 * pad, im.height + 2 * pad), (255, 255, 255))
    src.paste(im, (pad, pad))
    items, thumbs = [], []
    for idx, it in enumerate(found):
        if it is None:
            continue
        r, c = divmod(idx, a.cols)
        x0, y0, x1, y1 = it["box"]
        crop = render_item(it, src.crop((x0, y0, x1 + 2 * pad, y1 + 2 * pad)), pad)
        crop = crop.crop(crop.getbbox())
        w, h = crop.size
        side = int(max(w, h) / (1 - 2 * PAD))
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(crop, ((side - w) // 2, (side - h) // 2))
        canvas = canvas.resize((SIZE, SIZE), Image.LANCZOS)
        name = names[idx] if names and idx < len(names) else f"{idx + 1:02d}"
        fn = f"{name}.png"
        canvas.save(out / fn)
        thumbs.append(canvas)
        items.append({"file": fn, "name": name, "row": r + 1, "col": c + 1,
                      "src_box": [x0, y0, x1, y1], "src_px": [w, h]})

    (out / "manifest.json").write_text(json.dumps({"sheet": a.sheet, "items": items, "problems": problems},
                                                  ensure_ascii=False, indent=2), encoding="utf-8")
    cells = "".join(f'<figure><img src="{i["file"]}"><figcaption>{i["name"]}<br><small>{i["src_px"][0]}×{i["src_px"][1]}px</small></figcaption></figure>' for i in items)
    warn = "".join(f"<p class=warn>⚠ {p}</p>" for p in problems)
    (out / "review.html").write_text(f"""<!doctype html><meta charset=utf-8><title>review</title>
<style>body{{font-family:sans-serif;background:#eee}}.g{{display:grid;grid-template-columns:repeat({a.cols},200px);gap:12px}}
figure{{margin:0;text-align:center}}img{{width:200px;height:200px;background:repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 0 0/20px 20px;border-radius:12px}}
.warn{{color:#c00;font-weight:bold}}</style>{warn}<div class=g>{cells}</div>""", encoding="utf-8")

    # dark-background contact sheet: makes halos / eaten edges easy to spot
    cell = 256
    prev = Image.new("RGBA", (a.cols * cell, rows * cell), (40, 60, 90, 255))
    for i, t in enumerate(thumbs):
        prev.alpha_composite(t.resize((cell, cell), Image.LANCZOS), ((i % a.cols) * cell, (i // a.cols) * cell))
    prev.convert("RGB").save(out / "_preview.png")

    print(f"{len(items)} items -> {out}")
    for p in problems:
        print("PROBLEM:", p)


if __name__ == "__main__":
    main()
