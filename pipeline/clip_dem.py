"""Clip the USGS "MSL Gale Merged DEM 1m" to the MARSWALK area of interest.

Written with AI assistance (Claude Code).

Reads only the AOI window from the 3.6 GB GeoTIFF over HTTP range requests and
writes:
  data/dem/aoi_dem_1m.tif      elevation clip, native 1 m grid (about 6 MB, committed)
  web/public/data/aoi.json     grid geometry and elevation statistics

Source (docs/DATA_SOURCES.md row T2):
  Parker, T. and Calef III, F.J. (2016), Mars MSL Gale Merged DEM 1m,
  USGS Astrogeology Science Center,
  https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m

Run from the repository root:
  python3 pipeline/clip_dem.py
"""

import json
import os
import pathlib

import numpy as np
import rasterio
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds

# planetarymaps.usgs.gov redirects to this bucket.
URL = ("https://asc-pds-services.s3.us-west-2.amazonaws.com/"
       "mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif")
AOI = {"west": 137.372, "south": -4.816, "east": 137.396, "north": -4.790}
ROOT = pathlib.Path(__file__).resolve().parent.parent

# Geographic coordinates on the Mars sphere the file's projection is built on.
MARS_LONLAT = "+proj=longlat +R=3396190 +no_defs"


def main():
    env = {"GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
           "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif"}
    for ca in ("/etc/ssl/certs/ca-certificates.crt",):
        if os.path.exists(ca) and "CURL_CA_BUNDLE" not in os.environ:
            env["CURL_CA_BUNDLE"] = ca
    with rasterio.Env(**env), rasterio.open(URL) as src:
        print("size", src.width, "x", src.height, "dtype", src.dtypes[0],
              "nodata", src.nodata, "res", src.res)
        print("crs", src.crs.to_proj4())
        w, s, e, n = transform_bounds(MARS_LONLAT, src.crs, AOI["west"], AOI["south"],
                                      AOI["east"], AOI["north"])
        win = from_bounds(w, s, e, n, src.transform).round_offsets().round_lengths()
        dem = src.read(1, window=win)
        transform = src.window_transform(win)
        profile = src.profile.copy()
        profile.update(driver="GTiff", height=dem.shape[0], width=dem.shape[1],
                       transform=transform, compress="deflate", tiled=True,
                       blockxsize=256, blockysize=256)
        out = ROOT / "data" / "dem"
        out.mkdir(parents=True, exist_ok=True)
        with rasterio.open(out / "aoi_dem_1m.tif", "w", **profile) as dst:
            dst.write(dem, 1)

    valid = dem[dem != src.nodata] if src.nodata is not None else dem.ravel()
    valid = valid[np.isfinite(valid)]
    meta = {
        "source": "USGS Astrogeology, Mars MSL Gale Merged DEM 1m (Parker and Calef, 2016)",
        "source_url": "https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m",
        "aoi": AOI,
        "rows": int(dem.shape[0]), "cols": int(dem.shape[1]),
        "cell_size_m": [float(src.res[0]), float(src.res[1])],
        "projected_bounds_m": [float(w), float(s), float(e), float(n)],
        "crs_proj4": src.crs.to_proj4(),
        "elevation_m": {"min": float(valid.min()), "max": float(valid.max()),
                        "mean": float(valid.mean())},
        "valid_fraction": float(valid.size / dem.size),
    }
    (ROOT / "web" / "public" / "data" / "aoi.json").write_text(json.dumps(meta, indent=1))
    print(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
