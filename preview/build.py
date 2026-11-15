"""Build the MARSWALK prototype page.

AI-assisted (Claude Code).

Fills preview/template.html with the site data and assets and writes one
self-contained file, preview/index.html, that opens straight from disk.
The page computes routes in the browser from the packed terrain grid.

Run from the repository root, after `npm ci` in web/ (for the font files):
  python3 preview/make_assets.py     (only when the site data changes)
  python3 preview/build.py [extra_output_fragment.html]
"""
import base64, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
HERE = ROOT / "preview"
A = HERE / "assets"
FONTS = ROOT / "web" / "node_modules" / "@fontsource"


def b64(path, mime):
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def font_faces():
    out = []
    for family, pkg in (("B612", "b612"), ("B612 Mono", "b612-mono")):
        for weight in (400, 700):
            f = FONTS / pkg / "files" / f"{pkg}-latin-{weight}-normal.woff2"
            out.append(f"@font-face {{ font-family: '{family}'; font-weight: {weight}; font-style: normal; "
                       f"font-display: swap; src: url({b64(f, 'font/woff2')}) format('woff2'); }}")
    return "\n".join(out)


def main():
    icons = json.loads((A / "icons.json").read_text())
    fill = {
        "FONT_FACES": font_faces(),
        "SITE_JSON": (A / "site.json").read_text(),
        "ICONS_JSON": json.dumps({k: icons[k] for k in ("CheckCircle", "WarningCircle")}),
        "NAVCAM": b64(A / "navcam_sol4687.jpg", "image/jpeg"),
        "TERRAIN": b64(A / "terrain.png", "image/png"),
        "SITE_IMG": b64(A / "site.jpg", "image/jpeg"),
        "I_SWAP": icons["ArrowsDownUp"], "I_PLAY": icons["Play"], "I_STOP": icons["Stop"],
        "I_ARROW": icons["ArrowRight"], "I_PLUS": icons["Plus"], "I_MINUS": icons["Minus"],
        "I_FIT": icons["CornersOut"], "I_X": icons["X"],
    }
    page = (HERE / "template.html").read_text()
    for k, v in fill.items():
        page = page.replace("{{" + k + "}}", v)
    assert "{{" not in page, page[page.index("{{"):][:60]
    for bad in ("—", "–"):
        assert bad not in page, "dash character found in page text"
    head, body = page.split("</style>", 1)
    standalone = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
                  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
                  f"{head}</style>\n</head>\n<body>{body}</body>\n</html>\n")
    (HERE / "index.html").write_text(standalone)
    print("preview/index.html", round(len(standalone) / 1024), "KB")
    if len(sys.argv) > 1:
        pathlib.Path(sys.argv[1]).write_text(page)


if __name__ == "__main__":
    main()
