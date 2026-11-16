"""Compute the two default MARSWALK routes from the 1 m terrain clip.

Written with AI assistance (Claude Code).

This is the reference implementation of the routing model
section 6. The web app will run the same model in a Web Worker; this script
exists so the numbers can be checked independently of the browser.

Inputs:  data/dem/aoi_dem_1m.tif, data/reference/stations.geojson
Outputs: web/public/data/routes.json   two routes with statistics and profiles
         web/public/data/slope.png     slope-band overlay for the map

Model (every parameter below is an assumption, see docs/DATA_SOURCES.md 4):
  - grid: DEM smoothed with a 5 m moving average, sampled every 2 m
  - walking speed: Tobler's hiking function on the slope along the direction
    of travel, times a suit factor
  - blocked: cells whose terrain slope exceeds the slope limit
  - Direct: least time. Cautious: time multiplied on cells steeper than 10 degrees.

Run from the repository root:  python3 pipeline/routes.py
"""

import heapq
import json
import math
import pathlib

import numpy as np
import rasterio
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
CELL = 2                 # metres per routing cell
SMOOTH = 5               # metres, moving-average window before slope
SUIT_FACTOR = 0.5        # assumed
SLOPE_LIMIT_DEG = 20.0   # assumed
STATION_MIN = 30         # assumed minutes of work at the science station
MARS_R = 3396190.0
DOSE_MSV_PER_SOL = 0.67  # MSL RAD, Hassler et al. 2014 (cited, not opened)
SOL_HOURS = 24.6597


def box(a, k):
    pad = k // 2
    ap = np.pad(a, pad, mode="edge")
    c = np.cumsum(np.cumsum(ap, 0), 1)
    c = np.pad(c, ((1, 0), (1, 0)))
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)


def tobler_kmh(tan_slope):
    return 6.0 * math.exp(-3.5 * abs(tan_slope + 0.05))


def astar(z, slope, rough, start, goal, cautious):
    rows, cols = z.shape
    blocked = slope > SLOPE_LIMIT_DEG
    vmax = tobler_kmh(-0.05) * SUIT_FACTOR / 3.6          # fastest possible m/s
    moves = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]

    def h(r, c):
        return math.hypot(r - goal[0], c - goal[1]) * CELL / vmax

    best = {start: 0.0}
    came = {}
    heap = [(h(*start), 0.0, start)]
    while heap:
        _, g, cur = heapq.heappop(heap)
        if cur == goal:
            path = [cur]
            while cur in came:
                cur = came[cur]
                path.append(cur)
            return path[::-1]
        if g > best.get(cur, math.inf):
            continue
        r, c = cur
        for dr, dc in moves:
            nr, nc = r + dr, c + dc
            if not (0 <= nr < rows and 0 <= nc < cols) or blocked[nr, nc]:
                continue
            dist = CELL * math.hypot(dr, dc)
            tan = (z[nr, nc] - z[r, c]) / dist
            t = dist / (tobler_kmh(tan) * SUIT_FACTOR / 3.6)
            if cautious:
                if slope[nr, nc] > 10:
                    t *= 1 + (slope[nr, nc] - 10) * 0.6
            ng = g + t
            if ng < best.get((nr, nc), math.inf):
                best[(nr, nc)] = ng
                came[(nr, nc)] = cur
                heapq.heappush(heap, (ng + h(nr, nc), ng, (nr, nc)))
    return None


def main():
    with rasterio.open(ROOT / "data" / "dem" / "aoi_dem_1m.tif") as src:
        dem = src.read(1).astype("float64")
        T = src.transform
    zs = box(dem, SMOOTH)
    gy, gx = np.gradient(zs, 1.0)
    slope1 = np.degrees(np.arctan(np.hypot(gx, gy)))
    rough1 = np.sqrt(np.maximum(box(dem * dem, 5) - box(dem, 5) ** 2, 0))
    z, slope, rough = zs[::CELL, ::CELL], slope1[::CELL, ::CELL], rough1[::CELL, ::CELL]
    rows, cols = z.shape

    def to_cell(lon, lat):
        x, y = math.radians(lon) * MARS_R, math.radians(lat) * MARS_R
        col, row = ~T * (x, y)
        return int(row) // CELL, int(col) // CELL

    def to_lonlat(r, c):
        x, y = T * (c * CELL + CELL / 2, r * CELL + CELL / 2)
        return [round(math.degrees(x / MARS_R), 7), round(math.degrees(y / MARS_R), 7)]

    st = {f["properties"]["id"]: f for f in
          json.load(open(ROOT / "data" / "reference" / "stations.geojson"))["features"]}
    start = to_cell(*st["S0"]["geometry"]["coordinates"])
    goal = to_cell(*st["S1"]["geometry"]["coordinates"])
    print("grid", rows, "x", cols, "start", start, "goal", goal,
          "blocked start/goal", slope[start] > SLOPE_LIMIT_DEG, slope[goal] > SLOPE_LIMIT_DEG,
          "blocked fraction %.2f" % (slope > SLOPE_LIMIT_DEG).mean())

    out = {
        "model": {
            "cell_m": CELL, "smoothing_m": SMOOTH, "suit_factor": SUIT_FACTOR,
            "slope_limit_deg": SLOPE_LIMIT_DEG, "station_minutes": STATION_MIN,
            "speed": "Tobler hiking function on slope along travel, times suit factor",
            "dose_msv_per_sol": DOSE_MSV_PER_SOL,
            "status": "all parameters are assumptions; see docs/DATA_SOURCES.md section 4",
        },
        "from": "S0", "to": "S1", "routes": [],
    }
    for name, cautious in (("Direct", False), ("Cautious", True)):
        path = astar(z, slope, rough, start, goal, cautious)
        if path is None:
            print(name, "NO PATH under the slope limit")
            continue
        dist = climb = descent = secs = back = 0.0
        over10 = over15 = 0.0
        prof = [[0.0, round(float(z[path[0]]), 1)]]
        for (r0, c0), (r1, c1) in zip(path, path[1:]):
            d = CELL * math.hypot(r1 - r0, c1 - c0)
            dz = z[r1, c1] - z[r0, c0]
            dist += d
            climb += max(dz, 0)
            descent += max(-dz, 0)
            secs += d / (tobler_kmh(dz / d) * SUIT_FACTOR / 3.6)
            back += d / (tobler_kmh(-dz / d) * SUIT_FACTOR / 3.6)
            over10 += d if slope[r1, c1] > 10 else 0
            over15 += d if slope[r1, c1] > 15 else 0
            prof.append([round(dist, 1), round(float(z[r1, c1]), 1)])
        sl = [float(slope[p]) for p in path]
        eva_h = (secs + back) / 3600 + STATION_MIN / 60
        route = {
            "name": name,
            "distance_m": round(dist),
            "climb_m": round(climb, 1), "descent_m": round(descent, 1),
            "max_slope_deg": round(max(sl), 1), "mean_slope_deg": round(sum(sl) / len(sl), 1),
            "share_over_10deg": round(over10 / dist, 2),
            "share_over_15deg": round(over15 / dist, 2),
            "outbound_min": round(secs / 60), "return_min": round(back / 60),
            "eva_hours": round(eva_h, 2),
            "eva_dose_msv": round(DOSE_MSV_PER_SOL * eva_h / SOL_HOURS, 3),
            "line": [to_lonlat(r, c) for r, c in path[::2]] + [to_lonlat(*path[-1])],
            "profile": prof[::4] + [prof[-1]],
        }
        out["routes"].append(route)
        print({k: v for k, v in route.items() if k not in ("line", "profile")})
    (ROOT / "web" / "public" / "data" / "routes.json").write_text(json.dumps(out))

    # Slope-band overlay: clear under 10, pale yellow 10-15, amber 15-20, dark over the limit.
    rgba = np.zeros((rows, cols, 4), dtype=np.uint8)
    rgba[(slope > 10) & (slope <= 15)] = (240, 214, 110, 120)
    rgba[(slope > 15) & (slope <= SLOPE_LIMIT_DEG)] = (226, 150, 40, 150)
    rgba[slope > SLOPE_LIMIT_DEG] = (20, 24, 27, 150)
    Image.fromarray(rgba, "RGBA").save(ROOT / "web" / "public" / "data" / "slope.png", optimize=True)


if __name__ == "__main__":
    main()
