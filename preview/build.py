"""Build the static MARSWALK design preview.

Written with AI assistance (Claude Code).

Fills preview/template.html with real project data and writes one
self-contained file, preview/index.html, that opens straight from disk.
Nothing in it is invented: routes come from pipeline/routes.py, conditions
from pipeline/fetch_reference.py, imagery from preview/assets (a HiRISE crop
stitched from NASA Mars Trek tiles and one Curiosity Navcam frame).

Run from the repository root, after `npm ci` in web/ (for the font files):
  python3 pipeline/routes.py
  python3 preview/build.py [extra_output_fragment.html]

The optional argument also writes the page without the <html> wrapper, which
is the form some preview hosts expect.
"""

import base64
import json
import math
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
HERE = ROOT / "preview"
DATA = ROOT / "web" / "public" / "data"
FONTS = ROOT / "web" / "node_modules" / "@fontsource"

bbox = json.loads((HERE / "assets" / "bbox.json").read_text())
routes_doc = json.loads((DATA / "routes.json").read_text())
routes = {r["name"].lower(): r for r in routes_doc["routes"]}
model = routes_doc["model"]
stations = {f["properties"]["id"]: f for f in
            json.loads((ROOT / "data" / "reference" / "stations.geojson").read_text())["features"]}
waypoints = json.loads((DATA / "waypoints.geojson").read_text())["features"]
cond = json.loads((DATA / "conditions.json").read_text())["records"][0]
icons = json.loads((HERE / "assets" / "icons.json").read_text())

PXW, PXH = bbox["px_w"], bbox["px_h"]


def b64(path, mime):
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def px(lon, lat):
    x = (lon - bbox["west"]) / (bbox["east"] - bbox["west"]) * PXW
    y = (bbox["north"] - lat) / (bbox["north"] - bbox["south"]) * PXH
    return round(x, 1), round(y, 1)


def path_d(lonlats):
    pts = [px(*p) for p in lonlats]
    return "M" + " L".join(f"{x} {y}" for x, y in pts)


def route_svg(name, hero):
    d = path_d(routes[name]["line"])
    extra = ' pathLength="1"' if hero and name == "direct" else ""
    return f'<path class="rt-casing" d="{d}"/><path class="rt-{name}"{extra} d="{d}"/>'


def stations_svg():
    out = []
    for sid, cls, r in (("S2", "stn-sci", 9), ("S1", "stn-sci", 13), ("S0", "stn-start", 13)):
        x, y = px(*stations[sid]["geometry"]["coordinates"])
        out.append(f'<circle class="stn {cls}" cx="{x}" cy="{y}" r="{r}"/>')
    return "".join(out)


def labels_svg():
    out = []
    for sid, dx in (("S0", 24), ("S1", 24)):
        x, y = px(*stations[sid]["geometry"]["coordinates"])
        out.append(f'<text class="maplabel" x="{x + dx}" y="{y + 9}">{sid}</text>')
    return "".join(out)


def minutes(m):
    h, mm = divmod(int(round(m)), 60)
    return f"{h} h {mm:02d} min" if h else f"{mm} min"


def facts(r):
    walk = r["outbound_min"] + r["return_min"] + model["station_minutes"]
    return {
        "distance": f"{int(round(r['distance_m'], -1))} m",
        "climb": f"{round(r['climb_m'])} m",
        "steepest": f"{round(r['max_slope_deg'])}°",
        "over10": f"{round(r['share_over_10deg'] * 100)}%",
        "out": f"{r['outbound_min']} min",
        "back": f"{r['return_min']} min",
        "walk": minutes(walk),
        "walk_min": f"{walk} min",
        "dose": f"{r['eva_dose_msv']:.2f} mSv",
    }


F = {k: facts(v) for k, v in routes.items()}


def cmp_rows(keys):
    labels = {"distance": "Distance", "climb": "Climb", "steepest": "Steepest ground",
              "over10": "Over 10°", "out": "Out", "back": "Back",
              "walk_min": "Whole walk", "dose": "Dose"}
    return "\n".join(
        f'<tr><td>{labels[k]}</td><td class="num">{F["direct"][k]}</td>'
        f'<td class="num">{F["cautious"][k]}</td></tr>' for k in keys)


def conditions_html():
    rows = [
        ("Air", f"{cond['min_temp']} to {cond['max_temp']} °C"),
        ("Ground", f"{cond['min_gts_temp']} to {cond['max_gts_temp']} °C"),
        ("Pressure", f"{cond['pressure']} Pa"),
        ("Daylight", f"{cond['sunrise']} to {cond['sunset']}"),
        ("Sky", cond["atmo_opacity"]),
        ("UV", cond["local_uv_irradiance_index"]),
    ]
    return "".join(f'<dt>{k}</dt><dd class="num">{v}</dd>' for k, v in rows)


def profile_svg():
    W, H, L, R, T, B = 720, 200, 54, 14, 12, 30
    xmax = math.ceil(max(r["distance_m"] for r in routes.values()) / 100) * 100
    zs = [p[1] for r in routes.values() for p in r["profile"]]
    ymin, ymax = math.floor(min(zs) / 10) * 10, math.ceil(max(zs) / 10) * 10
    pw, ph = W - L - R, H - T - B

    def X(d):
        return round(L + d / xmax * pw, 1)

    def Y(z):
        return round(T + (ymax - z) / (ymax - ymin) * ph, 1)

    parts = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Elevation against distance for both routes">']
    for z in range(ymin, ymax + 1, 10):
        parts.append(f'<line class="ax" x1="{L}" y1="{Y(z)}" x2="{W - R}" y2="{Y(z)}"/>'
                     f'<text x="{L - 8}" y="{Y(z) + 3}" text-anchor="end">{z}</text>')
    for d in range(0, xmax + 1, 100):
        parts.append(f'<text x="{X(d)}" y="{H - 10}" text-anchor="middle">{d} m</text>')
    for name in ("cautious", "direct"):
        d = "M" + " L".join(f"{X(p[0])} {Y(p[1])}" for p in routes[name]["profile"])
        parts.append(f'<path id="prof-{name}" class="p-{name}" d="{d}"/>')
    parts.append("</svg>")
    vexag = (ph / (ymax - ymin)) / (pw / xmax)
    return "".join(parts), round(vexag)


def card(name):
    r, f = routes[name], F[name]
    other = "cautious" if name == "direct" else "direct"
    extra = int(round(routes["cautious"]["distance_m"] - routes["direct"]["distance_m"], -1))

    def li(mark, word, text):
        return (f'<li><span class="mk mk-{mark}" role="img" aria-label="{word}"></span>'
                f'<span>{text}</span></li>')

    trade = (f"Shortest in time. {f['over10']} of it crosses ground steeper than 10°."
             if name == "direct" else
             f"About {extra} m longer than Direct. Only {f['over10']} of it crosses ground steeper than 10°.")
    hidden = "" if name == "direct" else " hidden"
    return f"""
<article class="card" id="card-{name}"{hidden}>
  <header><b>FIELD BRIEFING</b><span>{r['name']} route, S0 to S1</span></header>
  <div class="key" aria-label="Key to marks">
    <span><i class="mk mk-m"></i> measured</span><span><i class="mk mk-d"></i> derived</span>
    <span><i class="mk mk-a"></i> assumed</span><span><i class="mk mk-s"></i> simulated</span>
  </div>
  <h3>Objective</h3>
  <ul><li class="plain">Sample one hollow and one adjacent ridge of the boxwork unit, to learn why the ridges resisted erosion.</li></ul>
  <h3>Route</h3>
  <ul>
    {li('s', 'Simulated', 'Start at <span class="v">S0</span>, a notional rover park at the edge of the unit')}
    {li('d', 'Derived', f'Distance <span class="v">{f["distance"]}</span>, climb <span class="v">{f["climb"]}</span>')}
    {li('d', 'Derived', trade)}
    {li('a', 'Assumed', f'Out <span class="v">{f["out"]}</span>, back <span class="v">{f["back"]}</span>, at the station <span class="v">{model["station_minutes"]} min</span>')}
    {li('a', 'Assumed', f'Whole walk about <span class="v">{f["walk"]}</span>')}
  </ul>
  <h3>Hazards</h3>
  <ul>
    {li('d', 'Derived', f'Steepest ground on the route <span class="v">{f["steepest"]}</span>')}
    {li('a', 'Assumed', f'Ground over <span class="v">{round(model["slope_limit_deg"])}°</span> is treated as blocked')}
  </ul>
  <h3>Conditions</h3>
  <ul>
    {li('m', 'Measured', f'Air <span class="v">{cond["min_temp"]} to {cond["max_temp"]} °C</span>, ground <span class="v">{cond["min_gts_temp"]} to {cond["max_gts_temp"]} °C</span>')}
    {li('m', 'Measured', f'Daylight <span class="v">{cond["sunrise"]} to {cond["sunset"]}</span> local time, sky {cond["atmo_opacity"].lower()}')}
  </ul>
  <h3>Radiation</h3>
  <ul>
    {li('m', 'Measured', f'<span class="v">{model["dose_msv_per_sol"]} mSv</span> per Mars day at Gale crater (Curiosity RAD, 2012 to 2013)')}
    {li('d', 'Derived', f'About <span class="v">{f["dose"]}</span> for this walk. The same on either route.')}
  </ul>
  <h3>What the rover found</h3>
  <ul><li class="plain">Curiosity drilled this hollow in October 2025 and the ridge top beside it, Nevado Sajama, in November 2025.</li></ul>
  <div class="limits">
    <h3>Limits</h3>
    <ul>
      <li class="plain">Rocks smaller than about 1 m are not in the terrain model.</li>
      <li class="plain">Walking speed is an Earth hiking model scaled by an assumed suit factor of {model['suit_factor']}.</li>
      <li class="plain">The slope limit is our assumption, not a NASA limit.</li>
      <li class="plain">Sand, dust and wind are not modelled.</li>
      <li class="plain">Conditions are from sol {cond['sol']} ({cond['terrestrial_date']}), not today.</li>
      <li class="plain">The radiation rate is quoted from a summary of the 2014 paper. The team has not yet read the paper itself.</li>
    </ul>
  </div>
</article>"""


def font_faces():
    out = []
    for family, pkg, stem in (("B612", "b612", "b612"), ("B612 Mono", "b612-mono", "b612-mono")):
        for weight in (400, 700):
            f = FONTS / pkg / "files" / f"{stem}-latin-{weight}-normal.woff2"
            out.append(
                f"@font-face {{ font-family: '{family}'; font-weight: {weight}; font-style: normal; "
                f"font-display: swap; src: url({b64(f, 'font/woff2')}) format('woff2'); }}")
    return "\n".join(out)


def main():
    profile, vexag = profile_svg()
    track = path_d([f["geometry"]["coordinates"] for f in waypoints])
    scale_px = round(100 / bbox["width_m"] * PXW, 1)
    fill = {
        "FONT_FACES": font_faces(),
        "BASEMAP": b64(HERE / "assets" / "basemap.jpg", "image/jpeg"),
        "NAVCAM": b64(HERE / "assets" / "navcam_sol4687.jpg", "image/jpeg"),
        "SLOPE": b64(HERE / "assets" / "slope.png", "image/png"),
        "PXW": PXW, "PXH": PXH, "WIDTH_M": round(bbox["width_m"]),
        "ICON_ARROW": icons["ArrowRight"], "ICON_OUT": icons["ArrowSquareOut"].replace('width="18" height="18"', 'width="14" height="14"'),
        "ROUTES_SVG_HERO": route_svg("cautious", True) + route_svg("direct", True),
        "ROUTES_SVG_TOOL": f'<g id="tool-cautious">{route_svg("cautious", False)}</g>'
                           f'<g id="tool-direct">{route_svg("direct", False)}</g>',
        "STATIONS_SVG": stations_svg(), "LABELS_SVG": labels_svg(), "TRACK_D": track,
        "SCALE_PX": scale_px, "SCALE_Y": PXH - 44,
        "CMP_TERRAIN": cmp_rows(["distance", "climb", "steepest", "over10"]),
        "CMP_TIME": cmp_rows(["out", "back", "walk_min", "dose"]),
        "CONDITIONS": conditions_html(),
        "CONDITIONS_NOTE": f"Latest record in NASA's Curiosity weather feed: sol {cond['sol']}, "
                           f"{cond['terrestrial_date']}. Past data, not live.",
        "PROFILE_SVG": profile, "VEXAG": vexag,
        "CARD_DIRECT": card("direct"), "CARD_CAUTIOUS": card("cautious"),
        "SUIT": model["suit_factor"], "LIMIT": round(model["slope_limit_deg"]),
        "STATION": model["station_minutes"],
    }
    page = (HERE / "template.html").read_text()
    for k, v in fill.items():
        page = page.replace("{{" + k + "}}", str(v))
    assert "{{" not in page, page[page.index("{{"):][:60]
    for bad in ("—", "–"):
        assert bad not in page, "dash character found in page text"

    head, body = page.split("</style>", 1)
    standalone = (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        f"{head}</style>\n</head>\n<body>{body}</body>\n</html>\n")
    (HERE / "index.html").write_text(standalone)
    print("preview/index.html", round(len(standalone) / 1024), "KB")
    if len(sys.argv) > 1:
        pathlib.Path(sys.argv[1]).write_text(page)
        print(sys.argv[1], round(len(page) / 1024), "KB")
    print({k: F[k] for k in F})


if __name__ == "__main__":
    main()
