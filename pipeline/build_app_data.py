"""Build the data files for the MARSWALK app (web/src/data).

AI-assisted (Claude Code).

Writes:
  site_terrain.png    2 m routing grid: elevation (red, green) and slope (blue)
  site_hirise.jpg     HiRISE image of the site, NASA Mars Trek level 16
  context_terrain.png 16 m terrain for an 8 km area around the site
  context_ctx.jpg     CTX image of the same 8 km area, Mars Trek level 12
  context_themis.png  THEMIS night infrared of the 8 km area, Mars Trek level 9
  photo_S0.jpg, photo_S1.jpg, photo_S2.jpg   Curiosity Navcam frames at stations
  site.json           grid geometry, stations, rover track, weather, credits

Inputs: data/dem/aoi_dem_1m.tif, data/reference/stations.geojson,
web/public/data/waypoints.geojson and conditions.json (pipeline/fetch_reference.py).

Run from the repository root:  python3 pipeline/build_app_data.py [tile_cache_dir]
"""
import io, json, math, pathlib, sys, time, urllib.request
import numpy as np, rasterio
from rasterio.windows import Window
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "src" / "data"
R = 3396190.0
DEM_URL = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif"
TREK = "https://trek.nasa.gov/tiles/Mars/EQ/{p}/1.0.0/default/default028mm/{z}/{r}/{c}.png"
CTX_RES, CTX_HALF = 16, 4000          # context grid: 16 m cells, 8 km square
PHOTOS = {"S0": ("4560", "NAV_LEFT_B"), "S1": ("4687", "NAV_LEFT_B"), "S2": ("4716", "NAV_RIGHT_B")}


def get(url, cache=None):
    if cache and cache.exists():
        return cache.read_bytes()
    req = urllib.request.Request(url, headers={"User-Agent": "marswalk"})
    for attempt in range(4):
        try:
            data = urllib.request.urlopen(req, timeout=90).read()
            if cache:
                cache.write_bytes(data)
            return data
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))


def box(a, k):
    pad = k // 2
    ap = np.pad(a, pad, mode="edge")
    c = np.pad(np.cumsum(np.cumsum(ap, 0), 1), ((1, 0), (1, 0)))
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)


def mosaic(product, z, west, east, south, north, cache):
    d = 180 / 2 ** z
    c0, c1 = int((west + 180) / d), int((east + 180) / d)
    r0, r1 = int((90 - north) / d), int((90 - south) / d)
    img = Image.new("L", ((c1 - c0 + 1) * 256, (r1 - r0 + 1) * 256))
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1):
            f = cache / f"{product}_{z}_{r}_{c}.png" if cache else None
            img.paste(Image.open(io.BytesIO(get(TREK.format(p=product, z=z, r=r, c=c), f))).convert("L"),
                      ((c - c0) * 256, (r - r0) * 256))
    ppd = 256 / d
    return img.crop((round((west + 180) * ppd - c0 * 256), round((90 - north) * ppd - r0 * 256),
                     round((east + 180) * ppd - c0 * 256), round((90 - south) * ppd - r0 * 256)))


def pack_height(z, zmin, per_m=100):
    q = np.round((z - zmin) * per_m).astype(np.uint32)
    assert q.max() < 65536, "height range too large to pack"
    return np.dstack([(q >> 8).astype(np.uint8), (q & 255).astype(np.uint8), np.zeros_like(q, dtype=np.uint8)])


def main():
    cache = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if cache:
        cache.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)

    # Site grid (2 m), same model as pipeline/routes.py
    with rasterio.open(ROOT / "data" / "dem" / "aoi_dem_1m.tif") as src:
        dem, T, b = src.read(1).astype("float64"), src.transform, src.bounds
    zs = box(dem, 5)
    gy, gx = np.gradient(zs, 1.0)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))[::2, ::2]
    zsite = zs[::2, ::2]
    rows, cols = zsite.shape
    site_min = float(zsite.min())
    rgb = pack_height(zsite, site_min)
    rgb[..., 2] = np.clip(np.round(slope * 4), 0, 255).astype(np.uint8)
    Image.fromarray(rgb, "RGB").save(OUT / "site_terrain.png", optimize=True)
    west, east = math.degrees(b.left / R), math.degrees(b.right / R)
    south, north = math.degrees(b.bottom / R), math.degrees(b.top / R)
    mosaic("curiosity_hirise_mosaic", 16, west, east, south, north, cache).save(OUT / "site_hirise.jpg", quality=74, optimize=True)
    print("site", cols, "x", rows)

    # Context terrain: read every 16th row of the source strips around the site
    cx_m, cy_m = (b.left + b.right) / 2, (b.top + b.bottom) / 2
    ctx_cache = cache / "context_16m.npy" if cache else None
    env = {"GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR", "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif", "GDAL_HTTP_MAX_RETRY": "4"}
    n = 2 * CTX_HALF // CTX_RES
    nodata = -32767.0
    if ctx_cache and ctx_cache.exists():
        ctx = np.load(ctx_cache)
    else:
      with rasterio.Env(**env), rasterio.open(DEM_URL) as src:
        col0, row0 = ~src.transform * (cx_m - CTX_HALF, cy_m + CTX_HALF)
        col0, row0 = int(col0), int(row0)
        ctx = np.zeros((n, n), dtype="float64")
        t0 = time.time()
        for i in range(n):
            line = src.read(1, window=Window(col0, row0 + i * CTX_RES, n * CTX_RES, 1))[0]
            ctx[i] = line[::CTX_RES][:n]
            if i % 100 == 0:
                print("context row", i, "of", n, round(time.time() - t0), "s", flush=True)
        nodata = src.nodata
      if ctx_cache:
        np.save(ctx_cache, ctx)
    bad = (ctx == nodata) | ~np.isfinite(ctx)
    if bad.any():
        ctx[bad] = np.median(ctx[~bad])
    ctx = box(ctx, 3)
    ctx_min = float(ctx.min())
    Image.fromarray(pack_height(ctx, ctx_min, 10), "RGB").save(OUT / "context_terrain.png", optimize=True)
    cw, ce = math.degrees((cx_m - CTX_HALF) / R), math.degrees((cx_m + CTX_HALF) / R)
    cs, cn = math.degrees((cy_m - CTX_HALF) / R), math.degrees((cy_m + CTX_HALF) / R)
    # Match the CTX context image's brightness and contrast to HiRISE over the site,
    # so the seam between the two images is less visible.
    ctx_img = np.asarray(mosaic("Gale_CTX_BlockAdj_dd", 12, cw, ce, cs, cn, cache).resize((1024, 1024), Image.LANCZOS), dtype="float64")
    hi = np.asarray(Image.open(OUT / "site_hirise.jpg").convert("L"), dtype="float64")
    px = 1024 / (ce - cw)
    sub = ctx_img[int((cn - north) * px):int((cn - south) * px), int((west - cw) * px):int((east - cw) * px)]
    ctx_img = (ctx_img - sub.mean()) / max(sub.std(), 1) * hi.std() + hi.mean()
    Image.fromarray(np.clip(ctx_img, 0, 255).astype(np.uint8), "L").save(OUT / "context_ctx.jpg", quality=78, optimize=True)
    mosaic("THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018", 9, cw, ce, cs, cn, cache).save(OUT / "context_themis.png", optimize=True)
    print("context", n, "x", n, "range", round(ctx_min), round(float(ctx.max())), "nodata cells", int(bad.sum()))

    # Station photos from the Curiosity raw image API
    photos = {}
    for sid, (sol, cam) in PHOTOS.items():
        api = ("https://mars.nasa.gov/api/v1/raw_image_items/?order=date_taken+desc&per_page=100&page=0"
               f"&condition_1=msl:mission&condition_2={sol}:sol:gte&condition_3={sol}:sol:lte")
        # full-frame Navcam images ("EDR_F"), not thumbnails or subframes
        items = [i for i in json.loads(get(api))["items"] if i["instrument"] == cam and "EDR_F" in i["url"]]
        if not items:
            print("no photo for", sid)
            continue
        pick = items[len(items) // 2]
        Image.open(io.BytesIO(get(pick["url"]))).convert("L").resize((720, 720), Image.LANCZOS).save(OUT / f"photo_{sid}.jpg", quality=78, optimize=True)
        photos[sid] = {"sol": int(sol), "camera": "Navcam left", "date": pick["date_taken"][:10], "url": pick["url"]}
        print("photo", sid, pick["url"].split("/")[-1])

    def cell(lon, lat):
        col, row = ~T * (math.radians(lon) * R, math.radians(lat) * R)
        return [round(col / 2, 2), round(row / 2, 2)]

    st = json.loads((ROOT / "data" / "reference" / "stations.geojson").read_text())["features"]
    wp = json.loads((ROOT / "web" / "public" / "data" / "waypoints.geojson").read_text())["features"]
    cond = json.loads((ROOT / "web" / "public" / "data" / "conditions.json").read_text())["records"][0]
    site = {
        "site": {"cols": cols, "rows": rows, "cell": 2, "zmin": round(site_min, 2), "west": west, "east": east, "south": south, "north": north},
        "context": {"n": n, "cell": CTX_RES, "zmin": round(ctx_min, 2), "per_m": 10,
                    "dx": round(cx_m - (b.left + b.right) / 2, 2), "dz": 0.0},
        "stations": [{"id": f["properties"]["id"], "name": f["properties"]["name"], "note": f["properties"]["note"],
                      "sol": f["properties"]["waypoint_sol"], "xy": cell(*f["geometry"]["coordinates"])} for f in st],
        "track": [cell(*f["geometry"]["coordinates"]) for f in wp],
        "conditions": cond,
        "photos": photos,
    }
    (OUT / "site.json").write_text(json.dumps(site, indent=1))
    for f in sorted(OUT.iterdir()):
        print(f.name, round(f.stat().st_size / 1024), "KB")


if __name__ == "__main__":
    main()
