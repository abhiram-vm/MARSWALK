"""Build the data files for the MARSWALK app (web/src/data).

AI-assisted (Claude Code).

Writes:
  site_terrain.png    2 m routing grid: elevation (red, green) and slope (blue)
  site_hirise.jpg     HiRISE image of the site, NASA Mars Trek level 16
  site_ao.png         sky visibility (ambient occlusion) of the site at 4 m, baked here so browsers do not
  context_terrain.png 16 m terrain for an 8 km area around the site, with context_ao.png
  outer_terrain.png   64 m terrain for a 30 km area, with outer_ao.png and outer_ctx.jpg (CTX, Mars Trek level 10)
  context_ctx.jpg     CTX image of the same 8 km area, Mars Trek level 12
  context_themis.png  THEMIS night infrared of the 8 km area, Mars Trek level 9
  photos/c<sol>.jpg   Curiosity Navcam frame at each science stop (pipeline/find_stops.py)
  site.json           grid geometry, stations, rover track, weather, credits

Inputs: data/dem/aoi_dem_1m.tif, data/reference/curiosity_stops.json and named_sites.json,
web/public/data/waypoints.geojson and conditions.json (pipeline/fetch_reference.py).

Run from the repository root:  python3 pipeline/build_app_data.py [tile_cache_dir]
"""
import datetime as dt, io, json, math, os, pathlib, sys, time, urllib.request
import warnings
import numpy as np, rasterio
warnings.filterwarnings("ignore", category=rasterio.errors.NotGeoreferencedWarning)
from rasterio.windows import Window
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "src" / "data"
R = 3396190.0
DEM_URL = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif"
TREK = "https://trek.nasa.gov/tiles/Mars/EQ/{p}/1.0.0/default/default028mm/{z}/{r}/{c}.png"
CTX_RES, CTX_HALF = 16, 4000          # context grid: 16 m cells, 8 km square
OUT_RES, OUT_HALF = 64, 15000         # outer ring: 64 m cells, 30 km square
SITE_PER_M = 50                       # site heights packed in 2 cm steps (the 3 km area spans about 700 m)
SITE_IMAGE_PX = 4096                  # HiRISE image of the site, about 0.73 m per pixel


def mars24(date_iso, lon_e, hour_utc=12.0):
    """Sun on Mars for a UTC date, after NASA GISS Mars24 (Allison and McEwen 2000).
    Returns solar longitude Ls, the equation of time (true minus mean solar time) in
    minutes, and the solar declination in degrees."""
    y, m, d = map(int, date_iso.split("-"))
    if m <= 2:
        y, m = y - 1, m + 12
    a = y // 100
    jd_ut = int(365.25 * (y + 4716)) + int(30.6001 * (m + 1)) + d + hour_utc / 24 + 2 - a + a // 4 - 1524.5
    dt_j2000 = jd_ut + 69.184 / 86400 - 2451545.0  # TT minus UTC: 32.184 s + 37 leap seconds
    M = math.radians(19.3871 + 0.52402073 * dt_j2000)
    afms = 270.3871 + 0.524038496 * dt_j2000
    pbs = sum(A * math.cos(math.radians(0.985626 * dt_j2000 / tau + phi)) for A, tau, phi in [
        (0.0071, 2.2353, 49.409), (0.0057, 2.7543, 168.173), (0.0039, 1.1177, 191.837), (0.0037, 15.7866, 21.736),
        (0.0021, 2.1354, 15.704), (0.0020, 2.4694, 95.528), (0.0018, 32.8493, 49.095)])
    nu_m = (10.691 + 3.0e-7 * dt_j2000) * math.sin(M) + 0.623 * math.sin(2 * M) + 0.050 * math.sin(3 * M) + 0.005 * math.sin(4 * M) + 0.0005 * math.sin(5 * M) + pbs
    ls = (afms + nu_m) % 360
    eot_deg = 2.861 * math.sin(math.radians(2 * ls)) - 0.071 * math.sin(math.radians(4 * ls)) + 0.002 * math.sin(math.radians(6 * ls)) - nu_m
    dec = math.degrees(math.asin(0.42565 * math.sin(math.radians(ls)))) + 0.25 * math.sin(math.radians(ls))
    return {"ls": round(ls, 2), "eotMin": round(eot_deg * 4, 2), "dec": round(dec, 3), "date": date_iso}


def space_weather(cache):
    """Recent solar energetic particle events and modelled solar storm arrivals at Mars,
    from NASA's DONKI (api.nasa.gov). Uses NASA_API_KEY if set, otherwise DEMO_KEY.
    Falls back to cached responses when the API is unavailable."""
    key = os.environ.get("NASA_API_KEY", "DEMO_KEY")
    today = dt.date.today()
    out, fetched = {}, []
    for name, path, days in (("sep", "SEP", 59), ("enlil", "WSAEnlilSimulations", 30)):
        url = f"https://api.nasa.gov/DONKI/{path}?startDate={today - dt.timedelta(days=days)}&endDate={today}&api_key={key}"
        f = cache / f"donki_{name}.json" if cache else None
        try:
            out[name] = json.loads(get(url))
            fetched.append(dt.datetime.now(dt.timezone.utc))
            if f:
                f.write_text(json.dumps(out[name]))
        except Exception as e:
            print("DONKI", name, "unavailable:", str(e)[:80], "- using cache" if f and f.exists() else "")
            out[name] = json.loads(f.read_text()) if f and f.exists() else []
            if f and f.exists():
                fetched.append(dt.datetime.fromtimestamp(f.stat().st_mtime, dt.timezone.utc))
    arrivals = sorted({(i["arrivalTime"], bool(i.get("isGlancingBlow"))) for s in out["enlil"] for i in (s.get("impactList") or []) if i.get("location") == "Mars" and i.get("arrivalTime")})
    return {
        # when the data was fetched; the older of the two requests if they differ
        "checked": min(fetched).strftime("%Y-%m-%dT%H:%MZ") if fetched else None,
        "source": "NASA DONKI (CCMC): WSA-ENLIL simulations and SEP events",
        "marsArrivals": [{"time": t, "glancing": g} for t, g in arrivals],
        "sepEvents": [e.get("eventTime") for e in out["sep"]],
    }


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


def sky_view(z, cell, radii):
    """Share of the sky each cell sees, from the steepest horizon in 8 directions at the given
    distances (metres). Used as ambient occlusion: hollows darker, ridges lighter."""
    n_dir = 8
    occ = np.zeros_like(z)
    pad = int(max(radii) / cell) + 1
    zp = np.pad(z, pad, mode="edge")
    h, w = z.shape
    for k in range(n_dir):
        a = k * math.pi / 4
        m = np.zeros_like(z)
        for r in radii:
            dx, dy = round(math.cos(a) * r / cell), round(math.sin(a) * r / cell)
            sh = zp[pad + dy:pad + dy + h, pad + dx:pad + dx + w]
            m = np.maximum(m, (sh - z) / r)
        occ += m / np.sqrt(1 + m * m)
    return np.clip(1 - occ / n_dir * 1.25, 0.35, 1)


def save_ao(ao, path):
    Image.fromarray(np.round(ao * 255).astype(np.uint8), "L").save(path, optimize=True)


def overview(res, cx_m, cy_m, half):
    """Read a square around (cx_m, cy_m) at res metres per cell from the DEM's reduced-resolution
    copies. They sit in a separate .ovr file beside the 1 m model: its base is 4 m per cell and
    its own levels are 8, 16, 32, 64, 128 and 256 m. The .ovr carries no georeferencing, so pixel
    positions come from the main file's transform."""
    env = {"GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR", "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif,.ovr", "GDAL_HTTP_MAX_RETRY": "4"}
    with rasterio.Env(**env):
        with rasterio.open(DEM_URL) as main:
            left, top, nodata = main.transform.c, main.transform.f, main.nodata
        kw = {} if res == 4 else {"overview_level": int(math.log2(res // 4)) - 1}
        with rasterio.open(DEM_URL + ".ovr", **kw) as src:
            n = int(2 * half / res)
            col0, row0 = (cx_m - half - left) / res, (top - (cy_m + half)) / res
            a = src.read(1, window=Window(int(round(col0)), int(round(row0)), n, n), boundless=True, fill_value=nodata).astype("float64")
    bad = (a == nodata) | ~np.isfinite(a) | (a < -9000)
    return a, bad


def fill_edges(a, bad):
    """Fill cells with no data from the nearest valid cell along each row, then each column."""
    a = a.copy()
    for axis in (1, 0):
        x = np.moveaxis(a, axis, -1)
        m = np.moveaxis(bad, axis, -1).copy()
        for direction in (1, -1):
            idx = np.where(~m, np.arange(x.shape[-1]), 0 if direction == 1 else x.shape[-1] - 1)
            idx = np.maximum.accumulate(idx, axis=-1) if direction == 1 else np.minimum.accumulate(idx[..., ::-1], axis=-1)[..., ::-1]
            filled = np.take_along_axis(x, idx, axis=-1)
            ok = np.take_along_axis(~m, idx, axis=-1)
            x[m & ok] = filled[m & ok]
            m &= ~ok
        bad = np.moveaxis(m, -1, axis)
    a[bad] = np.median(a[~bad])
    return a


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
    rgb = pack_height(zsite, site_min, SITE_PER_M)
    rgb[..., 2] = np.clip(np.round(slope * 4), 0, 255).astype(np.uint8)
    Image.fromarray(rgb, "RGB").save(OUT / "site_terrain.png", optimize=True)
    west, east = math.degrees(b.left / R), math.degrees(b.right / R)
    south, north = math.degrees(b.bottom / R), math.degrees(b.top / R)
    him = mosaic("curiosity_hirise_mosaic", 16, west, east, south, north, cache)
    him.resize((SITE_IMAGE_PX, round(SITE_IMAGE_PX * him.height / him.width)), Image.LANCZOS).save(OUT / "site_hirise.jpg", quality=70, optimize=True)
    save_ao(sky_view(zsite[::2, ::2], 4.0, [6, 12, 24, 48, 96, 160]), OUT / "site_ao.png")
    print("site", cols, "x", rows)

    # Context terrain: read every 16th row of the source strips around the site
    cx_m, cy_m = (b.left + b.right) / 2, (b.top + b.bottom) / 2
    n = 2 * CTX_HALF // CTX_RES
    ctx, bad = overview(CTX_RES, cx_m, cy_m, CTX_HALF)
    if bad.any():
        ctx[bad] = np.median(ctx[~bad])
    ctx = box(ctx, 3)
    ctx_min = float(ctx.min())
    Image.fromarray(pack_height(ctx, ctx_min, 10), "RGB").save(OUT / "context_terrain.png", optimize=True)
    save_ao(sky_view(ctx, CTX_RES, [48, 96, 192, 384, 700]), OUT / "context_ao.png")
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

    # Outer ring: 30 km at 64 m, so the surroundings reach the horizon. Context only.
    on = 2 * OUT_HALF // OUT_RES
    outer, obad = overview(OUT_RES, cx_m, cy_m, OUT_HALF)
    if obad.any():
        # beyond the edge of the terrain model: carry the nearest valid row or column outward
        outer = fill_edges(outer, obad)
    outer = box(outer, 3)
    out_min = float(outer.min())
    Image.fromarray(pack_height(outer, out_min, 10), "RGB").save(OUT / "outer_terrain.png", optimize=True)
    save_ao(sky_view(outer, OUT_RES, [192, 384, 768, 1500, 2600]), OUT / "outer_ao.png")
    ow, oe = math.degrees((cx_m - OUT_HALF) / R), math.degrees((cx_m + OUT_HALF) / R)
    os_, on_ = math.degrees((cy_m - OUT_HALF) / R), math.degrees((cy_m + OUT_HALF) / R)
    oimg = np.asarray(mosaic("Gale_CTX_BlockAdj_dd", 10, ow, oe, os_, on_, cache).resize((1024, 1024), Image.LANCZOS), dtype="float64")
    # match brightness to the inner context image where they overlap
    inner = np.asarray(Image.open(OUT / "context_ctx.jpg").convert("L"), dtype="float64")
    k = 1024 * CTX_HALF / OUT_HALF / 2
    ov = oimg[int(512 - k):int(512 + k), int(512 - k):int(512 + k)]
    valid = oimg > 4
    oimg = (oimg - ov.mean()) / max(ov.std(), 1) * inner.std() + inner.mean()
    oimg[~valid] = inner.mean()
    Image.fromarray(np.clip(oimg, 0, 255).astype(np.uint8), "L").save(OUT / "outer_ctx.jpg", quality=74, optimize=True)
    print("outer", on, "x", on, "range", round(out_min), round(float(outer.max())), "filled cells", int(obad.sum()), "image gaps", int((~valid).sum()))

    # Science stops: every place Curiosity stopped to work in the area (pipeline/find_stops.py),
    # named from the mission blog where a post describes it (data/reference/named_sites.json).
    stops = json.loads((ROOT / "data" / "reference" / "curiosity_stops.json").read_text())["stops"]
    named = json.loads((ROOT / "data" / "reference" / "named_sites.json").read_text())["sites"]
    pdir = OUT / "photos"
    pdir.mkdir(exist_ok=True)
    for old in pdir.glob("*.jpg"):
        old.unlink()
    for old in OUT.glob("photo_*.jpg"):
        old.unlink()
    stations = []
    for st in stops:
        sid = f"c{st['sols'][0]}"
        nm = named.get(st["rmc"])
        ph = st.get("photo")
        if ph:
            big = bool(nm)
            f = cache / ("photo_" + ph["url"].split("/")[-1]) if cache else None
            data = f.read_bytes() if f and f.exists() else get(ph["url"])
            if f and not f.exists():
                f.write_bytes(data)
            size = 640 if big else 320
            im = Image.open(io.BytesIO(data)).convert("L").resize((size, size), Image.LANCZOS)
            # a frame with a band lost in transmission (pure black) is not shown
            if (np.asarray(im) < 4).mean() > 0.05:
                print("dropped photo with missing data:", sid)
                ph = None
            else:
                im.save(pdir / f"{sid}.jpg", quality=74 if big else 64, optimize=True)
        sols = st["sols"]
        stations.append({
            "id": sid, "rmc": st["rmc"],
            "name": nm["name"] if nm else f"Sol {sols[0]} stop",
            "kind": nm["kind"] if nm else "stop",
            "note": nm["note"] if nm else None,
            "source": nm["source"] if nm else None,
            "sols": sols, "visits": st.get("visits", [sols]), "stay": st["stay"], "mahli": st["mahli"], "chemcam": st["chemcam"],
            "lonlat": [st["lon"], st["lat"]],
            "photo": {k: ph[k] for k in ("sol", "date", "camera", "url")} if ph else None,
        })
    print(len(stations), "stations,", sum(1 for x in stations if x["kind"] != "stop"), "named,", sum(1 for x in stations if x["kind"] == "drill"), "drill sites")

    def cell(lon, lat):
        col, row = ~T * (math.radians(lon) * R, math.radians(lat) * R)
        return [round(col / 2, 2), round(row / 2, 2)]

    wp = json.loads((ROOT / "web" / "public" / "data" / "waypoints.geojson").read_text())["features"]
    cond = json.loads((ROOT / "web" / "public" / "data" / "conditions.json").read_text())["records"][0]
    site = {
        "site": {"cols": cols, "rows": rows, "cell": 2, "per_m": SITE_PER_M, "zmin": round(site_min, 2), "west": west, "east": east, "south": south, "north": north},
        "outer": {"n": on, "cell": OUT_RES, "zmin": round(out_min, 2), "per_m": 10},
        "context": {"n": n, "cell": CTX_RES, "zmin": round(ctx_min, 2), "per_m": 10,
                    "dx": round(cx_m - (b.left + b.right) / 2, 2), "dz": 0.0},
        "stations": [{**x, "xy": cell(*x.pop("lonlat"))} for x in stations],
        "track": [cell(*f["geometry"]["coordinates"]) for f in wp],
        "conditions": cond,
        "sun": mars24(cond["terrestrial_date"], (west + east) / 2),
        "spaceWeather": space_weather(cache),
    }
    (OUT / "site.json").write_text(json.dumps(site, indent=1))
    for f in sorted(OUT.iterdir()):
        print(f.name, round(f.stat().st_size / 1024), "KB")


if __name__ == "__main__":
    main()
