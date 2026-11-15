# MARSWALK project plan

NASA Space Apps Challenge 2026, "Interplanetary Survival Guide: Martian Map".
Written 2026-11-14 for a team of two or three using AI-assisted coding.

Companion documents: [CHALLENGE_BRIEF.md](CHALLENGE_BRIEF.md) (what NASA asks, rules, judging), [DATA_SOURCES.md](DATA_SOURCES.md) (every layer, its source and its limits), [DESIGN.md](DESIGN.md) (look, type, colour, layout, copy rules), [SUBMISSION.md](SUBMISSION.md) (form fields and demo).

## 0. Read this first

1. **The hackathon is this weekend.** The official site lists the event as November 14-15, 2026, and submission closes **Sunday November 15 at 11:59 p.m.** in your Local Event's time zone. This plan is written in hours-before-deadline, not days.
2. **The repository is private, and judges need a public link.** The guide says a final-project link must work with "no logins, permissions, or registrations". Make the repository public, or deploy the site publicly and link that, before you submit.
3. **AI use is allowed, with conditions.** AI may "accelerate" the work; it "should not be used to come up with your idea of how to solve the challenge", and AI-written code must be acknowledged. The MARSWALK concept is the team's. Keep the decisions yours and disclose the assistance (section 11).
4. **The riskiest dependency is already resolved.** Real 1 m elevation values for the site are clipped and committed (`data/dem/aoi_dem_1m.tif`, section 6). The map starter in `web/` already shows the site with live NASA layers.

## 1. The project in one paragraph

MARSWALK is a walking-scale traverse planner for one real place on Mars: the boxwork ridges on Mount Sharp in Gale crater, which Curiosity has been studying since 2025. An astronaut chooses a start point and a science station. MARSWALK lays NASA orbital imagery, terrain, thermal data, the rover's own track and ground-level photos over the same 1.5 km patch, computes two routes across the ridges (fastest and most cautious), compares them on time, climb, steepness and return margin, and produces a one-page field briefing in which every number is marked as measured, derived, assumed or simulated, with its source.

## 2. Why this site and this science objective

**Recommendation: the boxwork unit on lower Mount Sharp, Gale crater.** This is the example the brief itself gives. Reasons to take it anyway:

| Reason | Evidence |
| --- | --- |
| It is the only place on Mars with a NASA radiation detector on the surface. The brief singles out radiation; anywhere else we would have to model it. | MSL RAD has measured at Gale since 2012 (DATA_SOURCES R1). |
| It has a weather station. The brief asks for "updates on current conditions". | MSL REMS feed, 4,745 sols of daily records (A1). |
| Walking-scale data exists: sub-metre imagery and a 1 m terrain model. | HiRISE mosaic and DEM in Mars Trek (O1, T1). |
| The terrain is itself the obstacle. Ridges about 1 to 2 m tall with hollows between them are a routing problem a person on foot would face. | Ridge height: JPL release, cited but not opened (see DATA_SOURCES section 5). |
| Ground truth is published: where the rover drove, where it drilled, what it photographed. | Waypoints through sol 5073, raw-image API (W, P1). |
| The science question is open and current. Curiosity drilled a hollow (Monte Grande, Oct 2025) and an adjacent ridge top (Nevado Sajama, Nov 2025) to compare them. | NASA mission blogs (read). |

The cost of this choice is originality of location: other teams will pick the brief's example. We answer that with what we build on it (section 8, Creativity), not with an obscure site that has less data.

**Science objective (draft for the team to refine):** find out why the boxwork ridges resisted erosion while the hollows between them did not, by sampling ridge and hollow pairs at several places across the unit. Curiosity sampled one hollow and one adjacent ridge about a month apart (October and November 2025). A person on foot could visit several such pairs in one excursion and choose the next sample from what the last one showed, which is the human advantage the brief's background describes.

**Default scenario:** start at the edge of the boxwork unit (station S0, the Altadena drill area), walk to the Monte Grande hollow and Nevado Sajama ridge pair (S1, S2). Straight-line distance about 500 m, about 37 m of climb, round trip about 1 to 1.5 km. Coordinates are in DATA_SOURCES section 1.

## 3. Mapping to the brief

### What the challenge asks, and how MARSWALK answers

| Core requirement | MARSWALK |
| --- | --- |
| Layered, integrated view | One map; toggled layers share a single coordinate frame; routes are computed from the layers rather than drawn over them |
| A location or route on the Martian surface | A real 1.4 by 1.5 km area and computed routes inside it |
| Data from multiple NASA science missions | Mars Reconnaissance Orbiter (HiRISE, CTX), Mars Odyssey (THEMIS), Curiosity (RAD, REMS, cameras, localization), Mars Global Surveyor (MOLA, context) |
| Helps a human explorer plan and carry out a Marswalk | Route comparison for planning; field briefing card for carrying it out |
| While conducting science | Destinations are science stations with a stated objective and the rover's prior findings |
| Uses NASA data and tools | Mars Trek tile services and catalog; mars.nasa.gov data feeds |
| Hyperlocal, not regional | The whole product is one excursion's footprint |

### What NASA suggests, and what we do with each

| Suggestion | Decision |
| --- | --- |
| Start from a science goal and location | Done (section 2) |
| At least three kinds of data | Five: optical, topographic, thermal, radiation, atmospheric |
| Safety information | Slope and roughness hazard layer, return-time margin, daylight window, dose estimate |
| Space weather / radiation | RAD-based dose estimate. Shown as a go/no-go and budget figure, not as a map layer, because no route-scale radiation data exists (stated in the app) |
| Suit and load mobility | A visible, adjustable suit factor on walking speed, labelled as an assumption |
| Route avoiding significant obstacles | Core feature. "Obstacle" means slope and roughness the 1 m DEM can resolve; smaller rocks are a stated limit |

### Optional considerations

| Option | Decision |
| --- | --- |
| 1. Format | Habitat planning display (desktop web) plus a phone-width field briefing card styled as a printed flight document. No HUD. |
| 2. Static, interactive or generator | Interactive, one site. Not a generator. |
| 3. Inspiration from other missions | The field card borrows from Apollo traverse maps and cuff checklists. Use only if a team member confirms the reference. |
| 4. Time frame | Terrain: no time frame. Conditions: latest available REMS sol, clearly dated. |
| 5. Point-of-view imagery | Yes, if time: Curiosity images at each station. |
| 6. Rovers, pairs | Out of scope, except that the start point is described as a rover park. |

## 4. What the user does (the demo path)

1. Opens MARSWALK. The map shows the boxwork from orbit at sub-metre scale with three marked stations and Curiosity's track.
2. Toggles layers: imagery, shaded relief, slope hazard, night thermal, rover track.
3. Picks a start and a science station (or clicks anywhere).
4. Sees two routes drawn: **Direct** (least time) and **Cautious** (penalises steep and rough ground more heavily).
5. Reads the comparison: distance, climb, steepest section, share of route over 10 and 15 degrees, estimated time, return time from the far point, dose for the excursion, daylight remaining.
6. Selects a route and opens the **field briefing**: objective, route summary, what the rover found here, conditions, hazards, sources, limits.
7. Opens "what you will see": Curiosity's photos at the destination.

If steps 1 to 6 work on real data, the project is submittable.

## 5. Scope

| Tier | Feature | Owner |
| --- | --- | --- |
| **Must** | Map of the AOI with HiRISE base and layer toggles (imagery, relief, slope hazard, thermal, rover track, stations) | UI |
| **Must** | Slope and cost grids from real elevation data, shipped as static files | Data |
| **Must** | Two routes between chosen points, computed in the browser | Data |
| **Must** | Route comparison panel | UI |
| **Must** | Field briefing with provenance labels and a limits section | Science |
| **Must** | Radiation and conditions panel from cited values and the REMS feed | Science |
| **Must** | Public deployment, demo, completed submission form | Science |
| Should | Click-anywhere start and destination | UI |
| Should | Elevation profile chart per route | UI |
| Should | Curiosity photos at stations | Science |
| Should | Bundled AOI base image so the map works if Mars Trek is slow | Data |
| Should | Landing view: one-viewport hero with the live map, then the place, the layers, the limits (two hours at most; DESIGN.md section 8) | UI |
| Stretch | "Solar storm" scenario that flips the go/no-go | Science |
| Stretch | Assumption sliders (suit factor, slope limit) that recompute live | UI |
| Stretch | Station notes on rover chemistry results | Science |
| **Will not build** | Accounts, a backend, a chatbot, 3D terrain, a HUD, more than one site, automatic rock detection | |

Cut from the bottom when time runs short. Do not cut the limits section or the provenance labels; they carry the Validity score.

## 6. Technical approach

### Architecture

A static site with no server. Everything heavy is precomputed.

```
pipeline/  (Python, run once)            web/  (Vite, React, TypeScript, Leaflet, Tailwind v4)
  fetch DEM clip for the AOI               Leaflet map, CRS EPSG4326
  slope, roughness, cost grids      ->     layers from Mars Trek tiles (live)
  subset waypoints, stations               static data from web/public/data
  REMS and RAD summary JSON                A* routing in a Web Worker
  station photo index                      comparison panel, briefing card
         writes web/public/data/           deploys to GitHub Pages
```

Why these choices:

- **Leaflet** because Mars Trek's tiles are an equirectangular 2-by-1 grid that maps directly onto `L.CRS.EPSG4326`. Verified by fetching tiles with that scheme.
- **Routing in the browser** so the user can pick any two points. The grid is about 700 by 750 cells at 2 m; A* with a binary heap is well under a second.
- **No backend** so there is nothing to keep running during judging.
- **Deterministic briefing text** from templates, not a language model. Every sentence is reproducible and checkable.

### Design

Full direction is in [DESIGN.md](DESIGN.md). The decisions that affect the build:

- **A flight document, not a sci-fi console.** Light by default with a dark variant that follows the system setting; cool paper and ink; one safety-orange accent; 2 px corners; no shadows, glows or gradients.
- **Type:** B612 and B612 Mono, faces designed for aircraft cockpit displays, self-hosted. All numbers in mono.
- **Tokens are CSS variables** exposed to Tailwind v4, already in `web/src/index.css`. Use the token classes (`bg-surface`, `text-ink-2`, `border-rule`, `bg-signal`), never raw colours.
- **Icons:** Phosphor only.
- **Two routes are told apart by line style as well as colour** (solid orange, dashed off-white), and blocked ground is hatched, so nothing depends on colour alone.
- **Provenance marks** on the field card differ by shape (solid, outlined, dashed, hatched), so they print in greyscale.
- **Motion is CSS only** and limited to five transitions that each explain a change.
- **Copy rules:** no em-dashes, no invented numbers, plain labels, one label per action.
- The landing-page design guide the team chose excludes dense product UI by its own scope note. It governs the landing view, field card and slides in full, and only its universal rules apply to the map tool.

### Data files the pipeline writes

| File | Content |
| --- | --- |
| `aoi.json` | Bounds, grid size, cell size, origin |
| `elevation.bin`, `slope.bin`, `roughness.bin` | Float32 or scaled Uint16 grids |
| `slope.png` | Coloured hazard overlay for the map |
| `stations.geojson`, `track.geojson` | Stations and rover track clipped to the AOI |
| `conditions.json` | REMS record(s) used, with sol and date |
| `radiation.json` | RAD figures with citation |
| `photos.json` | Image URLs and credits per station |
| `sources.json` | Machine-readable copy of DATA_SOURCES for the briefing |

### Routing model

- Cost of a step is its length divided by walking speed. Speed depends on slope along the direction of travel (Tobler's function) times a suit factor. Both are assumptions and are labelled as such.
- Cells steeper than the slope limit are blocked.
- **Direct** minimises time. **Cautious** multiplies cost on cells over 10 degrees or with high roughness, so it trades distance for gentler ground.
- Return time is the time back to the start from the farthest point on the route.
- The rover's actual track is drawn for comparison: a route a wheeled vehicle is known to have driven.

### Elevation data: resolved

Routing needs real elevation values. Mars Trek's DEM tiles are 8-bit pictures, not values, so the pipeline reads the source file instead.

- `pipeline/clip_dem.py` window-reads the AOI from the USGS "Mars MSL Gale Merged DEM 1m" GeoTIFF in about 15 seconds and writes `data/dem/aoi_dem_1m.tif` (1,423 by 1,541 cells, no gaps). It has been run; the clip is committed.
- What the clip shows (DATA_SOURCES section 2a): the area is steep, with about 30 percent of cells over 20 degrees, and it carries metre-scale relief consistent with the ridges.
- Smooth before computing slope. At a 1 m baseline the slope is noisy; use a 3 to 5 m window, and route on a 2 m grid.
- The rover's published elevations come from this same DEM, so they cannot validate it. Rover tilt can, loosely.
- With 30 percent of the area above the default 20 degree limit, test early that the default stations are connected. If they are not, raise the limit or route on slope along the direction of travel rather than maximum slope.

### What exists in the repository now

| Path | State |
| --- | --- |
| `web/` | Vite, React, TypeScript, Leaflet, Tailwind v4, with the design tokens and fonts in place and checked in light and dark. Shows the AOI with HiRISE, CTX, DEM picture and THEMIS layers from Mars Trek, the rover track and the stations. Builds cleanly; checked in a browser with live tiles. No routing, comparison or briefing yet. |
| `pipeline/fetch_reference.py` | Run. Writes rover track, waypoints and the 30 newest REMS records to `web/public/data/`. |
| `pipeline/clip_dem.py` | Run. Writes the DEM clip and `web/public/data/aoi.json`. |
| `data/dem/aoi_dem_1m.tif` | The 1 m elevation clip. |
| `data/reference/stations.geojson` | The four stations. |

Not yet written: slope and cost grids, the routing worker, the comparison panel, the briefing, the radiation and conditions panels, deployment.

## 7. Schedule

Counted in hours before the deadline. Assumes about 20 working hours remain; if you have fewer, start at the matching row and cut from section 5's lower tiers.

| Hours to deadline | Data | UI | Science and presentation |
| --- | --- | --- | --- |
| 20 to 18 | Done already: DEM clip, reference data scripts. Start the slope grid. | Done already: map with HiRISE base, stations, rover track. Start layer panel. | Confirm registration, Local Event, team page. Make the repository public or pick the public host. |
| 18 to 14 | Slope, roughness, cost grids; write data files | Layer toggles, hazard overlay, thermal overlay | Write the science objective, station notes, source table |
| 14 to 10 | A* worker, two cost profiles, route statistics | Route drawing, comparison panel | Radiation and conditions content; open and confirm the "cited, not opened" sources |
| 10 to 7 | Elevation profile data, bundled base image | Briefing card, provenance labels | Briefing copy, limits section |
| 7 to 5 | Fix what the demo path exposes | Polish the demo path only | Deploy. Test the public link in a private window. **First "Submit for Judging" with what exists.** |
| 5 to 3 | Stretch items or fixes | Run the DESIGN.md pre-flight check; fix what fails | Demo (seven slides or a 30-second video) in the same type and colours. Final project page text. |
| 3 to 1 | Freeze code | Freeze code | Resubmit. Check every link logged out. |
| Last hour | Nothing | Nothing | Buffer only |

Submitting early is safe: the guide says you can "edit and resubmit your project as many times as you'd like until the end of the hackathon".

### Roles

- **Data:** pipeline, grids, routing worker.
- **UI:** map, layers, panels, briefing layout, deployment.
- **Science and presentation:** objective, sources, briefing text, limits, demo, submission form. With two people, the UI owner takes deployment and the Data owner takes the form.

## 8. Playing to the judging criteria

| Criterion | What earns the score | Where it shows |
| --- | --- | --- |
| Impact | A crew decision made safer and faster: which way to walk, and whether to go | Comparison panel, return margin, go/no-go |
| Creativity | (1) Provenance labels on every number. (2) Radiation treated honestly as a mission-level number, not a fake heat map. (3) The rover's real track and photos as ground truth for a human route. (4) A field card, not only a dashboard. | Briefing, radiation panel, map |
| Validity | Real elevation data drives the routes; assumptions are visible and adjustable; limits are written down | Briefing limits section, DATA_SOURCES |
| Relevance | Four NASA missions, five data types, Mars Trek as the tile source, all doing work in the route computation or the briefing | Layer panel with mission and instrument credits |
| Presentation | One clear story: a real place, a real question, two routes, one decision. A look that is recognisably ours and consistent across site, card and slides (DESIGN.md). | Landing view, demo and project page |

The submission guide says most of the evaluation rests on the project page, so the page text gets real time (SUBMISSION.md).

## 9. Honesty rules for the product

1. Every number carries one of four labels: **Measured** (instrument data), **Derived** (computed from measured data), **Assumed** (our parameter), **Simulated** (scenario).
2. Every layer shows mission, instrument, resolution and credit.
3. The briefing ends with a limits section that is never hidden or collapsed.
4. Estimates are shown as ranges or with "about", never to false precision.
5. Nothing appears in the app that is not listed in DATA_SOURCES.

## 10. Risks

| Risk | Likelihood | Response |
| --- | --- | --- |
| Default stations not connected under the slope limit | Medium | Test in the first hour of routing work; adjust the limit or the slope definition |
| DEM noise read as obstacles | Medium | Smooth 3 to 5 m before slope; show slope as bands, not exact degrees |
| Mars Trek tiles slow or down during judging | Low to medium | Bundle one AOI base image as a fallback layer |
| Image hotlinks from mars.nasa.gov fail | Low | Store a handful of station photos in the repository with credits |
| Scope creep | High | The "will not build" list; freeze at three hours |
| Judges cannot open links | Medium while the repository is private | Public link tested logged out, twice |
| Demo over the limit | Low | Seven slides or 30 seconds; over-limit projects are ineligible |
| A cited figure turns out wrong | Low | Science owner opens every "cited, not opened" source before the first submission |
| Mixed-up units (mGy and mSv) | Medium | Use dose equivalent (mSv) for crew figures; keep absorbed dose (mGy) only as quoted |

## 11. AI disclosure

Keep this true as the project changes, and reuse it in the form's SI field.

- This plan, the challenge brief summary and the data-source catalog were drafted with an AI coding assistant (Claude Code) from the official pages and live NASA endpoints. The team reviews and corrects them; say so only once that has happened.
- The starter map in `web/` and the scripts in `pipeline/` were written with AI assistance and say so in their file headers. Keep doing this for new files.
- No AI-generated images, video or audio are used. If that changes, add a visible watermark.
- No NASA logos or mission insignia appear in anything AI-generated.
- The project idea, the choice of site and the design decisions are the team's.

## 12. Open questions for the team

1. Which Local Event are you registered with, and what is its local judging schedule? This sets your real deadline.
2. Who owns the form and the demo? Name one person now.
3. Slides or video for the demo? Slides are less risky in the time left.
4. Is the suit factor of 0.5 acceptable as a default, or does someone want to find a published suited-walking figure?
