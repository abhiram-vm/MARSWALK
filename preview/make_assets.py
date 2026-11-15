"""Build the image and terrain assets for the MARSWALK prototype.

AI-assisted (Claude Code).

Writes into preview/assets:
  site.jpg       HiRISE image of the whole site, stitched from NASA Mars Trek
                 tiles (level 16, about 0.64 m per pixel)
  terrain.png    routing grid packed into a PNG: red and green hold elevation
                 (hundredths of a metre above the grid minimum), blue holds
                 slope in quarter degrees
  site.json      grid geometry, stations, rover track, latest weather record

Run from the repository root:  python3 preview/make_assets.py [tile_cache_dir]
"""
import io, json, math, pathlib, sys, urllib.request
import numpy as np, rasterio
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "preview" / "assets"
R = 3396190.0
CELL, SMOOTH, Z = 2, 5, 16
TILES = "https://trek.nasa.gov/tiles/Mars/EQ/curiosity_hirise_mosaic/1.0.0/default/default028mm/{z}/{r}/{c}.png"


def box(a, k):
    pad = k // 2
    ap = np.pad(a, pad, mode="edge")
    c = np.pad(np.cumsum(np.cumsum(ap, 0), 1), ((1, 0), (1, 0)))
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)


def tile(cache, r, c):
    f = cache / f"{Z}_{r}_{c}.png" if cache else None
    if f and f.exists():
        return Image.open(f).convert("L")
    req = urllib.request.Request(TILES.format(z=Z, r=r, c=c), headers={"User-Agent": "marswalk"})
    data = urllib.request.urlopen(req, timeout=60).read()
    if f:
        f.write_bytes(data)
    return Image.open(io.BytesIO(data)).convert("L")


def main():
    cache = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
    with rasterio.open(ROOT / "data" / "dem" / "aoi_dem_1m.tif") as src:
        dem, T, b = src.read(1).astype("float64"), src.transform, src.bounds
    west, east = math.degrees(b.left / R), math.degrees(b.right / R)
    south, north = math.degrees(b.bottom / R), math.degrees(b.top / R)

    # Imagery
    d = 180 / 2 ** Z
    c0, c1 = int((west + 180) / d), int((east + 180) / d)
    r0, r1 = int((90 - north) / d), int((90 - south) / d)
    mos = Image.new("L", ((c1 - c0 + 1) * 256, (r1 - r0 + 1) * 256))
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1):
            mos.paste(tile(cache, r, c), ((c - c0) * 256, (r - r0) * 256))
    ppd = 256 / d
    crop = mos.crop((round((west + 180) * ppd - c0 * 256), round((90 - north) * ppd - r0 * 256),
                     round((east + 180) * ppd - c0 * 256), round((90 - south) * ppd - r0 * 256)))
    crop.save(OUT / "site.jpg", quality=72, optimize=True)

    # Terrain grid
    zs = box(dem, SMOOTH)
    gy, gx = np.gradient(zs, 1.0)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))[::CELL, ::CELL]
    z = zs[::CELL, ::CELL]
    zmin = float(z.min())
    q = np.round((z - zmin) * 100).astype(np.uint16)
    rgb = np.dstack([(q >> 8).astype(np.uint8), (q & 255).astype(np.uint8),
                     np.clip(np.round(slope * 4), 0, 255).astype(np.uint8)])
    Image.fromarray(rgb, "RGB").save(OUT / "terrain.png", optimize=True)
    rows, cols = z.shape

    def cell(lon, lat):
        col, row = ~T * (math.radians(lon) * R, math.radians(lat) * R)
        return [round(col / CELL, 2), round(row / CELL, 2)]

    st = json.loads((ROOT / "data" / "reference" / "stations.geojson").read_text())["features"]
    wp = json.loads((ROOT / "web" / "public" / "data" / "waypoints.geojson").read_text())["features"]
    cond = json.loads((ROOT / "web" / "public" / "data" / "conditions.json").read_text())["records"][0]
    site = {
        "rows": rows, "cols": cols, "cell_m": CELL, "zmin": round(zmin, 2),
        "west": west, "east": east, "south": south, "north": north,
        "image": list(crop.size),
        "stations": [{"id": f["properties"]["id"], "name": f["properties"]["name"],
                      "note": f["properties"]["note"], "xy": cell(*f["geometry"]["coordinates"])} for f in st],
        "track": [cell(*f["geometry"]["coordinates"]) for f in wp],
        "conditions": cond,
    }
    (OUT / "site.json").write_text(json.dumps(site))
    print("image", crop.size, "grid", rows, "x", cols, "zmin", zmin)


if __name__ == "__main__":
    main()
