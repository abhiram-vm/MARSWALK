# Data sources and provenance

Every layer and number in MARSWALK must trace back to a row in this file. If something is not in here, it does not go in the app.

**Status column**

- **Verified**: the endpoint was fetched and inspected on 2026-11-14.
- **Cited, not opened**: the figure comes from a search-result summary of the named source. Open the source and confirm before putting it in the submission.
- **Unverified**: believed to exist, not reachable from the planning session. Confirm before relying on it.

## 1. Site

Boxwork unit, lower Mount Sharp (Aeolis Mons), Gale crater. Area of interest (AOI): longitude 137.372 to 137.396 E, latitude -4.816 to -4.790 (about 1.4 km by 1.5 km).

Scale used for conversions: Mars mean radius 3,396,190 m, so 1 degree of latitude is about 59,275 m.

### Science stations (real Curiosity positions)

Coordinates are from NASA's Curiosity localization file `MSL_waypoints.json` (section 2, row W). The file had 1,389 waypoints through sol 5073 when read.

| ID | What happened here | Waypoint sol | Lon (E) | Lat | Elevation (m, geoid) | Source of the event |
| --- | --- | --- | --- | --- | --- | --- |
| S0 | Edge of the boxwork unit; "Altadena" drill, June 2025 | 4560 | 137.3835414 | -4.79984723 | -3647.2 | NASA blog below says Altadena was drilled "at the edge of the boxwork ... back in June" |
| S1 | "Monte Grande" hollow; "Valle de la Luna" drill, Oct 18-19, 2025 | 4687 | 137.3810353 | -4.80783916 | -3610.4 | [Curiosity blog, sols 4689-4694](https://science.nasa.gov/blog/curiosity-blog-sols-4689-4694-drill-in-the-boxwork-unit-is-go/) (read) |
| S2 | "Nevado Sajama", drilled "atop one of the boxwork ridges", Nov 2025 | 4711 | 137.3810041 | -4.80800755 | -3607.7 | [Curiosity blog, sols 4723-4730](https://science.nasa.gov/blog/curiosity-blog-sols-4723-4730-digging-into-nevado-sajama) (read) |
| P0 | Rover position on approach to the unit (candidate start) | 4500 | 137.3895793 | -4.79356808 | -3689.4 | Waypoint file only |

Caveats:

- Elevations in the table are the waypoint file's `elev_geoid`, which is sampled from the same DEM we route on (section 2a).
- The station position is the rover's last recorded waypoint at or before the event sol. That places the rover, not the drill bit; the drill target is within arm's reach (about 2 m) of the rover. For S0 and S2 the match between waypoint and drill sol is our inference from dates, not a NASA statement. S1 is firmer: the blog's image of the drill block was taken on sol 4687, the waypoint sol.
- S1 to S2 is about 10 m apart. S0 to S1 is about 500 m in a straight line with about 37 m of climb (computed from the table).

## 2. Layers

| # | Data type | Mission / instrument | Product | Resolution | Access | Status | Use in MARSWALK |
| --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | Optical | MRO / HiRISE | "MRO HiRISE, Curiosity Roving Site Mosaic" (`curiosity_hirise_mosaic`) | Mars Trek serves it down to tile level 16, about 0.64 m per pixel here. Deeper levels return 404. The USGS source mosaic is finer; we have not fetched it. | Mars Trek WMTS, PNG | Verified. Tile at the site shows the polygonal ridge network. | Base map |
| O2 | Optical | MRO / CTX | "MRO CTX, Gale Crater Mosaic" (`Gale_CTX_BlockAdj_dd`), also "Curiosity Roving Site Mosaic" (`curiosity_ctx_mosaic`) | Gale mosaic served to level 12, about 10 m per pixel; roving-site mosaic only to level 10, about 41 m per pixel. The instrument itself reaches about 6 m. | Mars Trek WMTS | Verified from each product's capabilities file | Regional context when zoomed out |
| T1 | Topographic | MRO / HiRISE stereo | "MRO HiRISE, Gale Crater DEM" (`Gale_DEM_SMG_1m`) | 1 m source grid; tiles served to level 14, about 2.5 m per pixel | Mars Trek WMTS, PNG | Verified, with a limit: the tiles are 8-bit grayscale pictures of the DEM, not elevation values | Shaded-relief overlay only |
| T2 | Topographic | MRO / HiRISE and CTX stereo, Mars Express / HRSC, tied to MGS / MOLA | USGS Astrogeology "Mars MSL Gale Merged DEM 1m" GeoTIFF, v3 (Parker and Calef, 2016) | 1 m grid | [Catalog page](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m); file `https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif` (3.6 GB, redirects to `asc-pds-services.s3.us-west-2.amazonaws.com`) | Verified. AOI clipped with `pipeline/clip_dem.py` into `data/dem/aoi_dem_1m.tif`; see section 2a. | Real elevations for slope and routing |
| T3 | Topographic | MGS / MOLA | "MGS MOLA, Global DEM" and color hillshade | 463 m per pixel | Mars Trek WMTS | Verified (catalog) | Regional context only. Far too coarse for a 500 m walk. |
| H1 | Thermal | Mars Odyssey / THEMIS | "MO THEMIS-IR Night, Global Mosaic" 100 m v2 (and Day) | 100 m per pixel; tiles stop at level 9 here | Mars Trek WMTS, PNG | Verified at level 9; levels 10 and 11 return 404 | Context overlay: relative night-time surface temperature, a proxy for rocky versus loose ground. Only about 15 pixels across the AOI. |
| R1 | Radiation | MSL / RAD | Surface dose rate at Gale crater, August 2012 to June 2013 | Point measurement, one site | Hassler et al. (2014), *Science* 343, 1244797; [NASA page](https://science.nasa.gov/resource/radiation-measurements-on-mars/); [SwRI release](https://www.swri.org/newsroom/press-releases/swri-scientists-publish-first-radiation-measurements-the-surface-of-mars) | **Verified on NASA's page**: about 210 µGy per (Earth) day absorbed. 0.67 mSv per day dose equivalent from the SwRI and NASA releases. The paper itself was not reachable. | EVA dose: 0.67 mSv × minutes / 1440 |
| A1 | Atmospheric | MSL / REMS | Curiosity weather feed (per-sol min/max air and ground temperature, pressure, UV index, opacity, sunrise, sunset) | Point measurement, one per sol | `https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json` | Verified: 4,745 sols; newest record sol 4995 (2026-08-25) | Conditions panel, daylight window |
| W | Localization | MSL / rover navigation | `MSL_waypoints.json`, `MSL_traverse.json` | Per drive; position, elevation, tilt, distance | `https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/` | Verified (665 KB and 1.36 MB GeoJSON) | Rover track overlay, stations. Rover tilt is an independent check on DEM slope; rover elevation is not (section 2a). |
| P1 | Optical (surface) | MSL / Mastcam, Navcam, Hazcam | Raw images by sol and camera | Camera dependent | `https://mars.nasa.gov/api/v1/raw_image_items/?order=sol+desc&per_page=..&condition_1=msl:mission` | Verified (returns JSON with image URLs) | "What you will see" images at stations |
| C1 | Chemical / mineral | MSL / APXS, ChemCam, CheMin, SAM | Drill-sample results at S0-S2 | Per sample | NASA mission blogs and papers | Blogs read; no numeric compositions extracted | Stretch: text notes at stations |

Missions represented: **Mars Reconnaissance Orbiter, Mars Odyssey, Mars Science Laboratory (Curiosity), Mars Global Surveyor**. Data types: optical, topographic, thermal, radiation, atmospheric (five), with chemical as a stretch.

### 2a. What the terrain clip looks like (measured 2026-11-15)

- Full file: 32,980 by 57,440 cells, float32, 1 m cells, equirectangular projection on a 3,396,190 m sphere, nodata -32767.
- AOI clip: 1,423 by 1,541 cells, no missing cells, elevation -3771.7 to -3421.2 m.
- The area is steep. With 5 m smoothing the median slope is about 13 degrees, and about 30 percent of cells exceed 20 degrees. Routing here is a real problem, not a formality.
- Metre-scale texture is present: after removing a 15 m moving average, 98 percent of the residual lies within about -1.1 to +1.3 m. That is consistent with HiRISE stereo coverage and with ridges 1 to 2 m tall, but the catalog does not say which instrument supplied each part of the mosaic, so treat ridge-scale detail as likely, not certain.
- **Rover elevations are not independent ground truth.** Sampling the clip at all 119 waypoints inside the AOI reproduces the waypoint file's `elev_geoid` exactly (difference 0.00 m). The rover's published elevation is read from this same DEM.
- **Rover tilt is independent** (measured on board). Median rover tilt at those waypoints is 8.3 degrees (maximum 17.5); median DEM slope at the same points with 5 m smoothing is 9.9 degrees. Correlation between the two is weak (0.39), as expected when comparing a 3 m vehicle's attitude with a gridded slope. Curiosity was driven on the gentlest ground available, so 17.5 degrees is a floor on what is trafficable for the rover, not a human limit.
- The catalog page's own recommended citation reads: "Calef III, F.J. and Parker, T., 2016, MSL Gale Merged Orthophoto Mosaic, Publisher: PDS Annex, U.S. Geological Survey" with the DEM page URL. Use the page title and URL if in doubt.

### Mars Trek tile recipe (verified)

```
https://trek.nasa.gov/tiles/Mars/EQ/{product}/1.0.0/default/default028mm/{z}/{row}/{col}.png
```

- Equirectangular grid, two tiles wide by one tall at level 0. `col = floor((lon + 180) / (180 / 2^z))`, `row = floor((90 - lat) / (180 / 2^z))`.
- Format is PNG. Requests for `.jpg` return 404.
- Each product stops at its own deepest level (HiRISE mosaic 16, Gale CTX 12, DEM picture 14, THEMIS 9). The capabilities file lists the levels; requests beyond them return 404. An earlier version of this file overstated the HiRISE depth.
- Capabilities: `https://trek.nasa.gov/tiles/Mars/EQ/{product}/1.0.0/WMTSCapabilities.xml`.
- Layer search: `https://trek.nasa.gov/mars/TrekServices/ws/index/eq/searchItems?proj=urn:ogc:def:crs:EPSG::104905&start=0&rows=200&facetKeys=itemType&facetValues=product&key={keyword}`.
- In Leaflet this maps onto `L.CRS.EPSG4326` with `{z}/{y}/{x}`.
- Trek's ArcGIS ImageServer endpoints (`/mars/arcgis/rest/services/...`) timed out on every attempt. Do not plan around them.

### Hosts the pipeline needs

`trek.nasa.gov`, `mars.nasa.gov`, `astrogeology.usgs.gov`, `planetarymaps.usgs.gov`, `asc-pds-services.s3.us-west-2.amazonaws.com`. All are public and need no key.

### 2b. Added for the final app (built 2026-11-15 by `pipeline/build_app_data.py`)

| # | Data type | Mission / instrument | Product | Resolution | Status | Use |
| --- | --- | --- | --- | --- | --- | --- |
| T4 | Topographic | Same as T2 | 8 by 8 km around the site, read from every 16th row and column of the USGS Gale 1 m file | 16 m (meshed at 32 m) | Verified. No missing cells; elevations -4326 to -2812 m, so Mount Sharp rises about 1.5 km above the lowest point. | Real surroundings and horizon in 3D. Context only; no routing. |
| O3 | Optical | MRO / CTX | "Gale Crater Mosaic" (`Gale_CTX_BlockAdj_dd`), Mars Trek level 12, resampled to 1024 px over 8 km | about 8 m | Verified | Image on the surroundings. Brightness and contrast matched to HiRISE over the site so the seam is less visible. |
| H2 | Thermal | Mars Odyssey / THEMIS | Night IR, Mars Trek level 9, over the 8 km area | about 80 m per pixel (98 by 99 px) | Verified | Night surface temperature layer, shown as relative values stretched between the 2nd and 98th percentiles. Not degrees. |
| P2 | Optical (surface) | MSL / Navcam | Full-frame frames at each station: S0 `NLB_802311994EDR_F1161944NCAM00353M_` (sol 4560), S1 `NLB_813579692EDR_F1191722NCAM00354M_` (sol 4687), S2 `NRB_816167292EDR_F1200082NCAM00200M_` (sol 4716) | 1024 px, stored at 720 px | Verified | Station cards, arrival in walk mode, field guide. The S2 frame's name carries site 120, drive 82, the same rover position as S2's waypoint. |

What the thermal layer means: rock and coarse ground hold the day's heat and stay warmer at night; dust and fine sand cool quickly. At 80 m per pixel it shows the neighbourhood, not the path.

### 2c. Sun and space weather (added 2026-11-15)

| # | Data | Source | Status | Use |
| --- | --- | --- | --- | --- |
| S1 | Equation of time (-49.4 min), solar declination (-7.82°) and Ls (341.6) for 2026-08-25, the weather record's date | Computed with NASA GISS's Mars24 algorithm (Allison and McEwen 2000) in `pipeline/build_app_data.py` | Verified: with these values the sun rises and sets within a minute of Curiosity's measured 06:46 and 18:51 local mean solar time; Ls matches the record's 341 | Sun position, shadows, timeline |
| SW1 | Modelled solar storm (CME) arrivals at Mars | NASA DONKI, WSA-ENLIL simulations by the Community Coordinated Modeling Center, via api.nasa.gov | Verified: 13 Mars arrivals in the 30 days to 2026-11-15, latest 2026-11-13 12:00 UTC | Space weather card; caution within a day of an arrival |
| SW2 | Solar energetic particle events | NASA DONKI SEP list | Verified: none in the 60 days to 2026-11-15 | Space weather card |

The build carries a snapshot; a hosted copy also asks DONKI for the latest runs when it opens.

## 3. Derived products (ours)

| Product | Derived from | Method | What it is not |
| --- | --- | --- | --- |
| Slope grid, 2 m cells | T2 | Resample to 2 m, Horn slope | Not sensitive to rocks or steps smaller than the DEM can resolve (roughly 1 to 2 m) |
| Traversal cost grid | Slope | Time per metre from a slope-dependent walking-speed function; cells above the slope limit are blocked | An estimate. See assumptions. |
| Routes | Cost grid | A* shortest path, 8-connected, no corner cutting; then straightened without crossing steeper ground (`web/src/model.ts`; `pipeline/routes.py` is the earlier reference) | Not a certified safe path |
| Sun position | Mars24 values (S1), site latitude | Standard solar geometry with true solar time = mean solar time + equation of time | No atmospheric refraction; values are for the weather record's date |
| Terrain shading | Terrain | How much sky each point sees, sampled in 8 directions | A visual aid, not a measurement |
| Legs | Slope along the route | Slope averaged over about 20 m, classed at 5, 10 and 15 degrees, pieces under 15 m merged | A summary for the guide |
| EVA dose estimate | R1 | Dose-equivalent rate multiplied by EVA duration | Not a prediction for a future date; ignores suit shielding and solar events |

### 3a. First routing result (computed 2026-11-15, S0 to S1)

With the default assumptions in section 4, both routes connect without raising the slope limit.

| | Direct | Cautious |
| --- | --- | --- |
| Distance | 537 m | 618 m |
| Climb | 40 m | 41 m |
| Share of length over 10 degrees | 31% | 7% |
| Time out / back (assumed model) | 17 / 14 min | 19 / 15 min |
| Dose for the whole walk (derived) | about 0.03 mSv | about 0.03 mSv |

The two routes differ in a way a crew would care about: about 90 m more walking buys a path almost free of ground over 10 degrees. Show figures rounded, as the preview does.

## 4. Assumptions and simulated values

These are ours, not NASA's. The app must label each one where it appears.

| Item | Default | Basis | Label |
| --- | --- | --- | --- |
| Walking speed versus slope | Tobler's hiking function, `6 * exp(-3.5 * abs(tan(slope) + 0.05))` km/h | Tobler (1993), NCGIA Technical Report 93-1. Derived for unsuited people on Earth. | Assumed |
| Suit and load factor | Speed multiplied by 0.5, adjustable 0.3 to 0.8. Gives 2.5 km/h on flat ground and about 1.4 km/h up 10°. | Matches NASA's Apollo planning estimate of 2.5 km/h for sustained suited walking (3.6 km/h for up to an hour); Apollo 14's uphill average was about 1.7 km/h. Los Alamos report [LA-UR-89-3858](https://www.osti.gov/servlets/purl/7168757). Lunar gravity differs from Mars. | Assumed, with a source |
| Maximum walkable slope | 20 degrees, adjustable | Design choice, not a NASA limit | Assumed |
| Start point | S0 or P0, or any point the user clicks | A notional pressurized-rover park position. No crewed landing site exists. | Simulated |
| Time at each science station | 30 min, adjustable | Design choice | Assumed |
| EVA dose | 0.67 mSv per Earth day multiplied by the excursion's hours / 24 | R1. Measured 2012-2013 near a weak solar maximum; galactic cosmic ray dose is higher near solar minimum. | Derived from measurement |
| Conditions | Latest available REMS record, or a chosen past sol | A1. The feed lags the present; the newest record seen was 78 sols older than the newest waypoint. | Measured (past) |

## 5. Things we know are missing

- **No route-scale radiation map exists.** RAD is one instrument at one place. Dose does not vary meaningfully across a 500 m walk, so radiation is a mission-level go/no-go and budget number, never a routing cost. We say this in the app.
- **No thermal data at walking scale.** THEMIS at 100 m shows the neighbourhood, not the path.
- **Rocks smaller than about 1 m are invisible** to the DEM. The HiRISE tiles we use are about 0.64 m per pixel, so they show rocks of roughly 2 m and up; we do not detect them automatically.
- **Dust, sand trafficability and wind** are not modelled. Curiosity's wheels are not boots.
- **Boxwork ridge height** ("roughly 3 to 6 feet (1 to 2 meters) tall") is from a search summary of the JPL release ["NASA's Curiosity Mars Rover Starts Unpacking Boxwork Formations"](https://www.jpl.nasa.gov/news/nasas-curiosity-mars-rover-starts-unpacking-boxwork-formations/). The page itself was not reachable. Cited, not opened.

## 6. Credit lines

Use these beside each layer and in the References field. Confirm each against the source page before submitting.

- HiRISE: NASA/JPL-Caltech/University of Arizona
- CTX, Mastcam: NASA/JPL-Caltech/MSSS
- THEMIS: NASA/JPL-Caltech/Arizona State University
- MOLA: NASA/GSFC/MOLA Science Team
- Gale merged DEM: Parker, T. and Calef III, F.J. (2016), USGS Astrogeology Science Center; originators JPL-Caltech, NASA, USGS, University of Arizona. It incorporates HRSC data from ESA's Mars Express; ESA is a 2026 Space Apps partner.
- RAD: NASA/JPL-Caltech/SwRI
- REMS: NASA/JPL-Caltech/CSIC-INTA (REMS was contributed by Spain; the Spanish Space Agency is a 2026 Space Apps partner, so mention it in the "Space Agency Partner Data" field after confirming the correct credit)
- Navcam, Hazcam, localization: NASA/JPL-Caltech
- Tiles and layer catalog: NASA Solar System Treks (Mars Trek), JPL
