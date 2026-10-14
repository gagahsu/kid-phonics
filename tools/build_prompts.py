"""Generate ChatGPT image prompts for every illustration that is still missing.

Reads data/art.json + every data/<lang>.json, finds art slugs referenced by
words but not yet in assets/img/, packs them 12 per sheet (3 cols x 4 rows)
and writes prompts/sheet_NN.txt (paste into ChatGPT) and
sheets/sheet_NN.names.txt (used by crop.py; kept next to the saved image).
Sheet numbers continue after the last sheets/sheet_NN.png.

Usage: py tools/build_prompts.py
"""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COLS, ROWS = 3, 4
PER_SHEET = COLS * ROWS

STYLE = """Create a portrait image (2:3 ratio) containing a 3-column by 4-row grid
of 12 separate illustrations for a 6-year-old's phonics app.

Style: cute sticker illustrations with a gentle 3D feel — chunky rounded
puffy shapes with soft inner shading, like inflated vinyl toys, but with
a thick dark-navy outline (#1F2A44) and a thick white sticker border
around each object. Bold, cheerful, saturated colors limited to:
cherry red #FF5A5F, sunny yellow #FFC93C, grass green #3BC47A,
sky blue #3FA9F5, grape purple #9B6BFF, tangerine #FF9A3C
(plus natural colors where needed, e.g. brown wood, white milk).
No drop shadows, no ground.

Layout rules: each illustration is centered in its own cell with generous
empty space around it; objects must not touch or overlap each other.
Pure white background. No text, no letters, no numbers, no borders,
no grid lines. Each cell shows exactly one subject as described."""

# face rule per category (see README); art entry "face": true/false overrides
FACE = {
    "animal": True, "plant": True, "vehicle": True, "sky": True,
    "person": None,  # people already have faces, no extra instruction
    "food": False, "object": False, "body": False, "scene": False,
}


def face_clause(a: dict) -> str:
    face = a.get("face", FACE.get(a["cat"], False))
    if face is None:
        return ""
    return " (with a friendly face: dot eyes, rosy cheeks)" if face else " (no face)"


def main():
    art = {k: v for k, v in json.loads((ROOT / "data/art.json").read_text(encoding="utf-8")).items()
           if not k.startswith("_")}
    wanted, problems = [], []
    for f in sorted((ROOT / "data").glob("*.json")):
        if f.name == "art.json":
            continue
        d = json.loads(f.read_text(encoding="utf-8"))
        words = d.get("words", {})
        for sym in d.get("symbols", []):
            for w in sym["words"]:
                if w not in words:
                    problems.append(f"{f.name}: {sym['s']} uses '{w}' but it is not in words")
                    continue
                slug = words[w]["art"]
                if slug not in art:
                    problems.append(f"{f.name}: '{w}' -> art '{slug}' missing in art.json")
                elif slug not in wanted:
                    wanted.append(slug)

    img_dir = ROOT / "assets/img"
    done = {p.stem for p in img_dir.glob("*.webp")} if img_dir.exists() else set()
    todo = [s for s in wanted if s not in done]
    unused = sorted(set(art) - set(wanted))

    # prompts/ is disposable; the names list lives next to the sheet image in
    # sheets/ so old sheets can always be re-cropped. Names lists whose image
    # was never saved are stale and get replaced; numbering continues after
    # the last saved sheet.
    out, sheet_dir = ROOT / "prompts", ROOT / "sheets"
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir()
    sheet_dir.mkdir(exist_ok=True)
    for nf in sheet_dir.glob("sheet_*.names.txt"):
        if not nf.with_name(nf.name.replace(".names.txt", ".png")).exists():
            nf.unlink()
    used = [int(p.stem.split("_")[1]) for p in sheet_dir.glob("sheet_[0-9][0-9].png")]
    first = max(used, default=0) + 1
    sheets = [todo[i:i + PER_SHEET] for i in range(0, len(todo), PER_SHEET)]
    for n, sheet in enumerate(sheets, first):
        lines = []
        for r in range(ROWS):
            row = sheet[r * COLS:(r + 1) * COLS]
            if not row:
                break
            label = "Row 1 (left to right)" if r == 0 else f"Row {r + 1}"
            lines.append(f"{label}: " + "; ".join(art[s]["desc"] + face_clause(art[s]) for s in row))
        style = STYLE
        if len(sheet) <= COLS:
            style = STYLE.replace("a portrait image (2:3 ratio) containing a 3-column by 4-row grid\nof 12",
                                  f"a landscape image (3:2 ratio) containing a single row\nof {len(sheet)}")
            lines = [lines[0].replace("Row 1 (left to right)", "Left to right")]
        elif len(sheet) != PER_SHEET:
            last = len(sheet) - COLS * (len(lines) - 1)
            style = STYLE.replace("3-column by 4-row grid\nof 12",
                                  f"3-column by {len(lines)}-row grid (last row has only {last})\nof {len(sheet)}")
        (out / f"sheet_{n:02d}.txt").write_text(style + "\n\n" + "\n".join(lines) + "\n", encoding="utf-8")
        (sheet_dir / f"sheet_{n:02d}.names.txt").write_text("\n".join(sheet) + "\n", encoding="utf-8")

    print(f"illustrations referenced: {len(wanted)}, done: {len(wanted) - len(todo)}, to draw: {len(todo)}")
    if sheets:
        print(f"prompts: prompts/sheet_{first:02d}.txt .. sheet_{first + len(sheets) - 1:02d}.txt"
              f" -> save each image as sheets/sheet_NN.png (same number!)")
    if unused:
        print("art.json entries not used by any word:", ", ".join(unused))
    for p in problems:
        print("PROBLEM:", p)


if __name__ == "__main__":
    main()
