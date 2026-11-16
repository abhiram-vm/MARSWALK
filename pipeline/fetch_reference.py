"""Fetch Curiosity reference data for the MARSWALK area of interest.

Written with AI assistance (Claude Code).

Reads two public NASA feeds and writes small static files for the web app:
  web/public/data/track.geojson       rover waypoints inside the AOI, as a line
  web/public/data/waypoints.geojson   the same waypoints as points with elevation
  web/public/data/conditions.json     latest REMS weather records

Sources (see docs/DATA_SOURCES.md, rows W and A1):
  https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json
  https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json

Standard library only. Run from the repository root:
  python3 pipeline/fetch_reference.py
"""

import json
import pathlib
import urllib.request
from datetime import datetime, timezone

WAYPOINTS = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json"
WEATHER = "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json"
from aoi import AOI  # noqa: E402  shared planning area
OUT = pathlib.Path(__file__).resolve().parent.parent / "web" / "public" / "data"


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "marswalk-pipeline"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    props = [f["properties"] for f in get_json(WAYPOINTS)["features"]]
    inside = [
        p for p in props
        if AOI["west"] <= p["lon"] <= AOI["east"] and AOI["south"] <= p["lat"] <= AOI["north"]
    ]
    meta = {"source": f"{WAYPOINTS} (read {today})", "credit": "NASA/JPL-Caltech"}

    track = {
        "type": "FeatureCollection", **meta,
        "note": "Straight segments between consecutive waypoints inside the AOI",
        "features": [{
            "type": "Feature",
            "properties": {
                "first_sol": min(p["sol"] for p in inside),
                "last_sol": max(p["sol"] for p in inside),
                "waypoints": len(inside),
            },
            "geometry": {"type": "LineString",
                         "coordinates": [[p["lon"], p["lat"]] for p in inside]},
        }],
    }
    (OUT / "track.geojson").write_text(json.dumps(track))

    points = {
        "type": "FeatureCollection", **meta,
        "features": [{
            "type": "Feature",
            "properties": {"sol": p["sol"], "elev_geoid_m": p["elev_geoid"],
                           "tilt_deg": p["tilt"], "dist_total_m": p["dist_total_m"]},
            "geometry": {"type": "Point", "coordinates": [p["lon"], p["lat"]]},
        } for p in inside],
    }
    (OUT / "waypoints.geojson").write_text(json.dumps(points))

    soles = get_json(WEATHER)["soles"]
    keep = ["sol", "terrestrial_date", "ls", "min_temp", "max_temp", "min_gts_temp",
            "max_gts_temp", "pressure", "atmo_opacity", "local_uv_irradiance_index",
            "sunrise", "sunset"]
    conditions = {
        "source": f"{WEATHER} (read {today})",
        "credit": "NASA/JPL-Caltech/CSIC-INTA (REMS)",
        "units": {"temp": "deg C", "pressure": "Pa", "sunrise_sunset": "local Mars time"},
        "note": "Newest records first. The feed lags the present; check the sol and date.",
        "records": [{k: s.get(k) for k in keep} for s in soles[:30]],
    }
    (OUT / "conditions.json").write_text(json.dumps(conditions, indent=1))

    newest = conditions["records"][0]
    print(f"waypoints in AOI: {len(inside)} (sols {track['features'][0]['properties']['first_sol']}"
          f" to {track['features'][0]['properties']['last_sol']})")
    print(f"newest weather record: sol {newest['sol']} ({newest['terrestrial_date']})")


if __name__ == "__main__":
    main()
