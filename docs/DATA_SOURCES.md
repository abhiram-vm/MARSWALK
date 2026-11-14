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

- The station position is the rover's last recorded waypoint at or before the event sol. That places the rover, not the drill bit; the drill target is within arm's reach (about 2 m) of the rover. For S0 and S2 the match between waypoint and drill sol is our inference from dates, not a NASA statement. S1 is firmer: the blog's image of the drill block was taken on sol 4687, the waypoint sol.
- S1 to S2 is about 10 m apart. S0 to S1 is about 500 m in a straight line with about 37 m of climb (computed from the table).

## 2. Layers

| # | Data type | Mission / instrument | Product | Resolution | Access | Status | Use in MARSWALK |
| --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | Optical | MRO / HiRISE | "MRO HiRISE, Curiosity Roving Site Mosaic" (`curiosity_hirise_mosaic`) | Tile pyramid has 19 levels; level 18 is about 0.16 m per pixel, consistent with a 0.25 m mosaic. Native resolution not stated in the catalog record. | Mars Trek WMTS, PNG | Verified. Tile at the site shows the polygonal ridge network. | Base map |
| O2 | Optical | MRO / CTX | "MRO CTX, Curiosity Roving Site Mosaic" (`curiosity_ctx_mosaic`), "Gale Crater Mosaic" (`Gale_CTX_BlockAdj_dd`) | About 6 m per pixel (CTX; Trek description says "up to 6 meters/pixel") | Mars Trek WMTS | Verified (catalog); tiles not individually tested | Regional context when zoomed out |
| T1 | Topographic | MRO / HiRISE stereo | "MRO HiRISE, Gale Crater DEM" (`Gale_DEM_SMG_1m`) | 1 m (from the product name) | Mars Trek WMTS, PNG | Verified, with a limit: the tiles are 8-bit grayscale pictures of the DEM, not elevation values | Shaded-relief overlay only |
| T2 | Topographic | MRO / HiRISE stereo | USGS Astrogeology "MSL Gale Merged DEM 1m" GeoTIFF (the source of T1) | 1 m | Direct download from USGS (planetarymaps.usgs.gov / astrogeology.usgs.gov) | **Unverified**: hosts were not reachable; exact file URL not confirmed | Real elevations for slope and routing. This is the critical dependency; see the fallback in the plan. |
| T3 | Topographic | MGS / MOLA | "MGS MOLA, Global DEM" and color hillshade | 463 m per pixel | Mars Trek WMTS | Verified (catalog) | Regional context only. Far too coarse for a 500 m walk. |
| H1 | Thermal | Mars Odyssey / THEMIS | "MO THEMIS-IR Night, Global Mosaic" 100 m v2 (and Day) | 100 m per pixel; tiles stop at level 9 here | Mars Trek WMTS, PNG | Verified at level 9; levels 10 and 11 return 404 | Context overlay: relative night-time surface temperature, a proxy for rocky versus loose ground. Only about 15 pixels across the AOI. |
| R1 | Radiation | MSL / RAD | Surface dose rate at Gale crater | Point measurement, one site | Published values (Hassler et al. 2014, *Science* 343, 1244797) | **Cited, not opened**: 0.210 ± 0.040 mGy/day absorbed dose; about 0.67 mSv/day dose equivalent, Aug 2012 to Jun 2013 | EVA dose estimate and go/no-go panel |
| A1 | Atmospheric | MSL / REMS | Curiosity weather feed (per-sol min/max air and ground temperature, pressure, UV index, opacity, sunrise, sunset) | Point measurement, one per sol | `https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json` | Verified: 4,745 sols; newest record sol 4995 (2026-08-25) | Conditions panel, daylight window |
| W | Localization | MSL / rover navigation | `MSL_waypoints.json`, `MSL_traverse.json` | Per drive; position, elevation, tilt, distance | `https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/` | Verified (665 KB and 1.36 MB GeoJSON) | Rover track overlay, stations, elevation ground truth |
| P1 | Optical (surface) | MSL / Mastcam, Navcam, Hazcam | Raw images by sol and camera | Camera dependent | `https://mars.nasa.gov/api/v1/raw_image_items/?order=sol+desc&per_page=..&condition_1=msl:mission` | Verified (returns JSON with image URLs) | "What you will see" images at stations |
| C1 | Chemical / mineral | MSL / APXS, ChemCam, CheMin, SAM | Drill-sample results at S0-S2 | Per sample | NASA mission blogs and papers | Blogs read; no numeric compositions extracted | Stretch: text notes at stations |

Missions represented: **Mars Reconnaissance Orbiter, Mars Odyssey, Mars Science Laboratory (Curiosity), Mars Global Surveyor**. Data types: optical, topographic, thermal, radiation, atmospheric (five), with chemical as a stretch.

### Mars Trek tile recipe (verified)

```
https://trek.nasa.gov/tiles/Mars/EQ/{product}/1.0.0/default/default028mm/{z}/{row}/{col}.png
```

- Equirectangular grid, two tiles wide by one tall at level 0. `col = floor((lon + 180) / (180 / 2^z))`, `row = floor((90 - lat) / (180 / 2^z))`.
- Format is PNG. Requests for `.jpg` return 404.
- Capabilities: `https://trek.nasa.gov/tiles/Mars/EQ/{product}/1.0.0/WMTSCapabilities.xml`.
- Layer search: `https://trek.nasa.gov/mars/TrekServices/ws/index/eq/searchItems?proj=urn:ogc:def:crs:EPSG::104905&start=0&rows=200&facetKeys=itemType&facetValues=product&key={keyword}`.
- In Leaflet this maps onto `L.CRS.EPSG4326` with `{z}/{y}/{x}`.
- Trek's ArcGIS ImageServer endpoints (`/mars/arcgis/rest/services/...`) timed out on every attempt. Do not plan around them.

## 3. Derived products (ours)

| Product | Derived from | Method | What it is not |
| --- | --- | --- | --- |
| Slope grid, 2 m cells | T2 | Resample to 2 m, Horn slope | Not sensitive to rocks or steps smaller than the DEM can resolve (roughly 1 to 2 m) |
| Roughness grid | T2 | Standard deviation of elevation in a 5 by 5 cell window | A terrain texture proxy, not a rock count |
| Traversal cost grid | Slope, roughness | Time per metre from a slope-dependent walking-speed function; cells above the slope limit are blocked | An estimate. See assumptions. |
| Routes | Cost grid | A* shortest path, 8-connected | Not a certified safe path |
| EVA dose estimate | R1 | Dose-equivalent rate multiplied by EVA duration | Not a prediction for a future date; ignores suit shielding and solar events |

## 4. Assumptions and simulated values

These are ours, not NASA's. The app must label each one where it appears.

| Item | Default | Basis | Label |
| --- | --- | --- | --- |
| Walking speed versus slope | Tobler's hiking function, `6 * exp(-3.5 * abs(tan(slope) + 0.05))` km/h | Tobler (1993), NCGIA Technical Report 93-1. Derived for unsuited people on Earth. | Assumed |
| Suit and load factor | Speed multiplied by 0.5, adjustable 0.3 to 0.8 | No validated Mars-suit walking model was found during planning. Sanity-check against published Apollo traverse speeds if time allows. | Assumed |
| Maximum walkable slope | 20 degrees, adjustable | Design choice, not a NASA limit | Assumed |
| Start point | S0 or P0, or any point the user clicks | A notional pressurized-rover park position. No crewed landing site exists. | Simulated |
| Time at each science station | 30 min, adjustable | Design choice | Assumed |
| EVA dose | 0.67 mSv/day multiplied by hours / 24.66 (one sol is about 24 h 39.6 min) | R1. Measured 2012-2013 near a weak solar maximum; galactic cosmic ray dose is higher near solar minimum. | Derived from measurement |
| Conditions | Latest available REMS record, or a chosen past sol | A1. The feed lags the present; the newest record seen was 78 sols older than the newest waypoint. | Measured (past) |

## 5. Things we know are missing

- **No route-scale radiation map exists.** RAD is one instrument at one place. Dose does not vary meaningfully across a 500 m walk, so radiation is a mission-level go/no-go and budget number, never a routing cost. We say this in the app.
- **No thermal data at walking scale.** THEMIS at 100 m shows the neighbourhood, not the path.
- **Rocks smaller than about 1 m are invisible** to the DEM. HiRISE imagery shows them down to roughly 0.75 m (three pixels at 0.25 m), but we do not detect them automatically.
- **Dust, sand trafficability and wind** are not modelled. Curiosity's wheels are not boots.
- **Boxwork ridge height** ("roughly 3 to 6 feet (1 to 2 meters) tall") is from a search summary of the JPL release ["NASA's Curiosity Mars Rover Starts Unpacking Boxwork Formations"](https://www.jpl.nasa.gov/news/nasas-curiosity-mars-rover-starts-unpacking-boxwork-formations/). The page itself was not reachable. Cited, not opened.

## 6. Credit lines

Use these beside each layer and in the References field. Confirm each against the source page before submitting.

- HiRISE: NASA/JPL-Caltech/University of Arizona
- CTX, Mastcam: NASA/JPL-Caltech/MSSS
- THEMIS: NASA/JPL-Caltech/Arizona State University
- MOLA: NASA/GSFC/MOLA Science Team
- RAD: NASA/JPL-Caltech/SwRI
- REMS: NASA/JPL-Caltech/CSIC-INTA (REMS was contributed by Spain; the Spanish Space Agency is a 2026 Space Apps partner, so mention it in the "Space Agency Partner Data" field after confirming the correct credit)
- Navcam, Hazcam, localization: NASA/JPL-Caltech
- Tiles and layer catalog: NASA Solar System Treks (Mars Trek), JPL
