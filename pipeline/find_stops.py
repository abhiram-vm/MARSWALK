"""Find the places Curiosity stopped to work inside the MARSWALK planning area.

AI-assisted (Claude Code).

From NASA's Curiosity waypoint file, every end-of-drive position inside the area
where the rover stayed three sols or more is a candidate. For each, NASA's raw-image
record tells what the rover did there: MAHLI (arm camera) close-ups mean contact
science, ChemCam remote micro-imager frames mean laser chemistry. Candidates within
12 m of each other are merged. A full-frame Navcam image taken at exactly the same
rover position (site and drive in the file name) becomes the stop's photo.

Writes data/reference/curiosity_stops.json. Run: python3 pipeline/find_stops.py [cache_dir]
"""
import io, json, math, pathlib, sys, time, urllib.request
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
WAYPOINTS = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json"
RAW = "https://mars.nasa.gov/api/v1/raw_image_items/?order=date_taken+asc&per_page={n}&page={p}&condition_1=msl:mission&condition_2={a}:sol:gte&condition_3={b}:sol:lte{extra}"
from aoi import AOI as _A  # noqa: E402  shared planning area
AOI = (_A["west"], _A["south"], _A["east"], _A["north"])
R = 3396190.0


def get(url, cache=None):
    if cache and cache.exists():
        return json.loads(cache.read_text())
    for attempt in range(4):
        try:
            d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "marswalk"}), timeout=90))
            if cache:
                cache.write_text(json.dumps(d))
            return d
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 + 3 * attempt)


def count(a, b, inst, cache):
    d = get(RAW.format(n=1, p=0, a=a, b=b, extra=f"&search={inst}"), cache / f"n_{inst}_{a}_{b}.json" if cache else None)
    return int(d.get("total") or 0)


def frame_score(data):
    """How good a Navcam frame is as a 'what you will see' photo: the texture of a typical
    row (the 40th percentile), so frames that are mostly sky or blank score near zero.
    Frames with black gaps (incomplete downlinks) are rejected."""
    # score at thumbnail size so thumbnails and full frames are comparable
    im = np.asarray(Image.open(io.BytesIO(data)).convert("L").resize((64, 64), Image.BILINEAR), dtype="float64")
    if (im < 3).mean() > 0.02:
        return -1.0
    rows = np.abs(np.diff(im, axis=1)).mean(axis=1)
    glare = max(0.0, im.mean() - 190) * 0.1
    return float(np.percentile(rows, 40)) - glare


def best_frame(hits, cache):
    """Scores up to sixteen candidate frames on their thumbnails and returns the best one."""
    # Navcam sequences NCAM0055x are sky-pointed in this period (checked by eye on sols
    # 4673 to 4679); ChemCam-commanded frames (CCAM) are usually tight on a target.
    ground = [it for it in hits if "NCAM0055" not in it["url"] and "CCAM" not in it["url"]]
    hits = ground or hits
    if not hits:
        return None
    step = max(1, len(hits) // 16)
    best, best_s = None, -1.0
    for it in hits[::step][:16]:
        thumb = it["url"].replace("EDR_F", "EDR_T")
        data = None
        # use the thumbnail when NASA publishes one; otherwise score the full frame
        for url, name in ((thumb, "t_"), (it["url"], "f_")):
            f = cache / (name + url.split("/")[-1]) if cache else None
            try:
                if f and f.exists():
                    data = f.read_bytes()
                else:
                    data = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "marswalk"}), timeout=60).read()
                    if f:
                        f.write_bytes(data)
                break
            except Exception:
                data = None
        if data is None:
            continue
        sc = frame_score(data)
        if sc > best_s:
            best, best_s = it, sc
    return best


def main():
    cache = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if cache:
        cache.mkdir(parents=True, exist_ok=True)
    P = [f["properties"] for f in get(WAYPOINTS, cache / "waypoints.json" if cache else None)["features"]]
    cands = []
    for i, p in enumerate(P):
        if not (AOI[0] <= p["lon"] <= AOI[2] and AOI[1] <= p["lat"] <= AOI[3]):
            continue
        stay = (P[i + 1]["sol"] if i + 1 < len(P) else p["sol"] + 1) - p["sol"]
        if stay >= 3:
            cands.append({**p, "stay": stay, "last": p["sol"] + stay - 1})
    print(len(cands), "candidates")
    for c in cands:
        a, b = c["sol"], c["last"]
        c["mahli"] = count(a, b, "MAHLI", cache)
        c["chemcam"] = count(a, b, "CHEMCAM_RMI", cache)
        site, drive = c["RMC"].split("_")
        code = f"{int(site):03d}{int(drive):04d}"
        hits = []
        for cam in ("NAV_LEFT_B", "NAV_RIGHT_B"):
            for page in range(3):
                d = get(RAW.format(n=100, p=page, a=a, b=b, extra=f"&search={cam}"), cache / f"nav_{cam}_{a}_{b}_{page}.json" if cache else None)
                hits += [it for it in d.get("items", []) if f"EDR_F{code}" in it["url"]]
                if len(d.get("items", [])) < 100:
                    break
        photo = best_frame(hits, cache)
        c["photo"] = {"url": photo["url"], "sol": photo["sol"], "date": photo["date_taken"][:10], "camera": "Navcam " + ("left" if "NLB_" in photo["url"] else "right")} if photo else None
        print(c["RMC"], "sols", a, "to", b, "MAHLI", c["mahli"], "ChemCam", c["chemcam"], "photo", bool(photo), flush=True)

    # Merge unnamed positions closer than 12 m into a neighbour. Sites with a name from the
    # mission blog (data/reference/named_sites.json) always stay separate: the hollow and the
    # ridge Curiosity drilled are only about 10 m apart, and that pair is the point.
    named = json.loads((ROOT / "data" / "reference" / "named_sites.json").read_text())["sites"]

    def dist(p, q):
        return math.hypot(p["easting"] - q["easting"], p["northing"] - q["northing"])
    sites = []
    for c in sorted(cands, key=lambda c: (c["RMC"] not in named, -c["stay"])):
        if c["RMC"] in named:
            sites.append({"anchor": c, "members": [c]})
            continue
        near = sorted((s for s in sites if dist(s["anchor"], c) < 12), key=lambda s: dist(s["anchor"], c))
        if near:
            near[0]["members"].append(c)
        else:
            sites.append({"anchor": c, "members": [c]})
    out = []
    for s in sites:
        m = s["members"]
        a = s["anchor"]
        out.append({
            "rmc": a["RMC"], "lon": a["lon"], "lat": a["lat"], "elev": a["elev_geoid"],
            # the anchor's own visit first; other merged visits extend the record
            "sols": [a["sol"], a["last"]],
            "visits": sorted([x["sol"], x["last"]] for x in m),
            "stay": sum(x["stay"] for x in m),
            "mahli": sum(x["mahli"] for x in m), "chemcam": sum(x["chemcam"] for x in m),
            "photo": a["photo"] or next((x["photo"] for x in m if x["photo"]), None),
        })
    out.sort(key=lambda s: s["sols"][0])
    path = ROOT / "data" / "reference" / "curiosity_stops.json"
    path.write_text(json.dumps({"source": WAYPOINTS + " and the NASA raw image API", "stops": out}, indent=1))
    print(len(out), "sites written to", path)


if __name__ == "__main__":
    main()
