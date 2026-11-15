# MARSWALK project plan

NASA Space Apps Challenge 2026, "Interplanetary Survival Guide: Martian Map".
Written 2026-11-14, revised 2026-11-15, for a team of two or three.

Companion documents: [CHALLENGE_BRIEF.md](CHALLENGE_BRIEF.md) (what NASA asks, rules, judging), [DATA_SOURCES.md](DATA_SOURCES.md) (every layer, its source and its limits), [DESIGN.md](DESIGN.md) (look, type, colour, layout, copy rules), [SUBMISSION.md](SUBMISSION.md) (form fields and demo).

## 0. Read this first

1. **The hackathon is this weekend.** The official site lists the event as November 14-15, 2026, and submission closes **Sunday November 15 at 11:59 p.m.** in your Local Event's time zone. This plan is written in hours-before-deadline, not days.
2. **The repository is private, and judges need a public link.** The guide says a final-project link must work with "no logins, permissions, or registrations". Make the repository public, or deploy the site publicly and link that, before you submit.
3. **AI use is allowed, with conditions.** AI may "accelerate" the work; it "should not be used to come up with your idea of how to solve the challenge", and AI-written code must be acknowledged. The MARSWALK concept and framework are the team's. Disclose the assistance briefly and truthfully (section 11).
4. **The riskiest dependency is already resolved.** Real 1 m elevation values for the site are clipped and committed (`data/dem/aoi_dem_1m.tif`, section 6). The map starter in `web/` already shows the site with live NASA layers.

## 1. The project in one paragraph

MARSWALK is a walking-scale traverse planner and survival guide for one real place on Mars: the boxwork ridges on Mount Sharp in Gale crater, which Curiosity has been studying since 2025. The map fills the screen. An astronaut clicks any start and any destination on the site. MARSWALK computes two routes across the terrain (fastest and most cautious), gives a go or no-go call against daylight, lets the crew rehearse the walk with a follow camera, and produces a field guide with a leg-by-leg plan, a turn-back rule, conditions, radiation and limits. Every number is marked as measured, derived, assumed or simulated.

### Does the challenge require routing between any two points?

No. The brief asks for "a layered, integrated view of a location or route". A route map is suggested "if possible", and a system that generates maps for different locations is on the list teams "may (but are not required to) consider". One site is fully in scope.

We go one step past the minimum where it is cheap and useful: any two points **inside our one site**, computed live. We do not attempt any place on Mars. That would need terrain data we have not prepared and would thin out everything else.

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
| Safety information | Slope hazard layer, go or no-go call against daylight, turn-back rule, time back from the far point, dose estimate |
| Space weather / radiation | RAD-based dose estimate. Shown as a go/no-go and budget figure, not as a map layer, because no route-scale radiation data exists (stated in the app) |
| Suit and load mobility | A visible, adjustable suit factor on walking speed, labelled as an assumption |
| Route avoiding significant obstacles | Core feature. "Obstacle" means slope the 1 m DEM can resolve; smaller rocks are a stated limit |

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

1. Opens MARSWALK. The camera eases from the whole site down to a default walk between two of Curiosity's drill sites.
2. Clicks anywhere on the map to move the destination, or taps a named station. Two routes appear in about a tenth of a second.
3. Reads the call: **GO** or **NO-GO**, with the reasons (back before sunset with a reserve, steepest ground, time to get back from the far point, radiation, ground temperature).
4. Compares **Direct** and **Cautious** on time, distance, climb and share of steep ground.
5. Drags along the elevation chart, or presses **Rehearse** to watch the walk with live distance, elevation, slope and time.
6. Opens the **Field guide**: decision, route, leg by leg, turn-back rule, conditions, radiation, what the rover found, a photo of the ground where one exists, limits and sources.
7. Opens **Assumptions** and changes the suit factor, slope limit, leaving time or time on site. Everything recomputes.

All seven steps work today in `preview/index.html`.

## 5. Scope

| Tier | Feature | Owner |
| --- | --- | --- |
| **Must** | Map of the AOI with HiRISE base and layer toggles (imagery, relief, slope hazard, thermal, rover track, stations) | UI |
| **Must** | Slope and cost grids from real elevation data, shipped as static files | Data |
| **Must** | Two routes between any two points on the site, computed in the browser (built) | Data |
| **Must** | Route comparison panel | UI |
| **Must** | Field briefing with provenance labels and a limits section | Science |
| **Must** | Radiation and conditions panel from cited values and the REMS feed | Science |
| **Must** | Public deployment, demo, completed submission form | Science |
| **Must** | Go or no-go call, leg-by-leg field guide, walk rehearsal (built) | UI |
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

A single static page with no server. Everything heavy is prepared once.

```
pipeline/ and preview/make_assets.py (Python, run once)
  clip the 1 m terrain for the site
  smooth, compute slope, pack elevation and slope into one PNG
  stitch the HiRISE image of the site from Mars Trek tiles
  collect stations, rover track, latest weather record
        |
        v
preview/index.html (one file, plain JavaScript, no framework)
  canvas map with pan, zoom and layers
  A* routing in a Web Worker on a 712 by 771 grid of 2 m cells
  go or no-go, comparison, elevation chart, rehearsal, field guide
```

Why these choices:

- **One file, no build step, no server.** Nothing can be down during judging, and it deploys anywhere a static file can live.
- **Its own image and terrain inside the file.** It works offline and does not depend on Mars Trek being fast on the day. The data still comes from Mars Trek and USGS, and the scripts that fetched it are in the repository.
- **Routing in the browser** so any two points work. The terrain grid has about 550,000 cells; a route takes well under a tenth of a second.
- **Deterministic guide text** from templates, not a language model. Every sentence is reproducible and checkable.

### Design

Full direction is in [DESIGN.md](DESIGN.md). In short:

- **The terrain is the interface.** A full-screen map with floating panels, in one dark look suited to a dim habitat or a visor.
- **Cinematic only where it explains something:** an opening camera move, a follow camera during rehearsal, relief shading computed from the real terrain. Nothing moves while you read.
- **Fast by construction:** one canvas that redraws only on change, routing in a background worker, no blur or animation library.
- **Obvious to use:** one active point at a time, a hint line that says what a click does, a large go or no-go call, messages for every failure.
- **Type and colour:** B612 and B612 Mono (cockpit display typefaces), one orange accent, green and red only for the decision.
- **Copy rules:** no em-dashes, no invented numbers, plain labels.

### Routing model

- Cost of a step is its length divided by walking speed. Speed depends on slope along the direction of travel (Tobler's function) times a suit factor. Both are assumptions and are labelled as such.
- Cells steeper than the slope limit are blocked.
- **Direct** minimises time. **Cautious** multiplies cost on cells over 10 degrees, so it trades distance for gentler ground.
- Return time is the time back to the start from the farthest point on the route.
- The rover's actual track is drawn for comparison: a route a wheeled vehicle is known to have driven.

### Elevation data: resolved

Routing needs real elevation values. Mars Trek's DEM tiles are 8-bit pictures, not values, so the pipeline reads the source file instead.

- `pipeline/clip_dem.py` window-reads the AOI from the USGS "Mars MSL Gale Merged DEM 1m" GeoTIFF in about 15 seconds and writes `data/dem/aoi_dem_1m.tif` (1,423 by 1,541 cells, no gaps). It has been run; the clip is committed.
- What the clip shows (DATA_SOURCES section 2a): the area is steep, with about 30 percent of cells over 20 degrees, and it carries metre-scale relief consistent with the ridges.
- Smooth before computing slope. At a 1 m baseline the slope is noisy; use a 3 to 5 m window, and route on a 2 m grid.
- The rover's published elevations come from this same DEM, so they cannot validate it. Rover tilt can, loosely.
- About 30 percent of the area is above the default 20 degree limit, but the default stations do connect: `pipeline/routes.py` finds a 537 m Direct route and a 618 m Cautious route (DATA_SOURCES section 3a). Other start and end points may not connect; the app must say so plainly when that happens.

### What exists in the repository now

| Path | State |
| --- | --- |
| `preview/index.html` | **The working prototype.** One self-contained file, about 2.5 MB, opens from disk. Full-screen map of the whole site, click-to-place points, live routing, go or no-go, route comparison, elevation chart, rehearsal, field guide, adjustable assumptions. Tested in a browser at desktop and phone width with no errors. |
| `preview/template.html`, `build.py`, `make_assets.py` | Source of the prototype and the scripts that rebuild it |
| `pipeline/routes.py` | Reference implementation of the routing model in Python. The prototype's in-browser result matches it (536 m against 537 m for the default Direct route). |
| `pipeline/fetch_reference.py`, `clip_dem.py` | Fetch Curiosity waypoints and weather; clip the terrain |
| `data/dem/aoi_dem_1m.tif` | The 1 m elevation clip |
| `web/` | Earlier starter (React and Leaflet with live Mars Trek tiles). Kept for the live-tile recipe. The prototype has overtaken it. |

**Recommended path to submission:** ship the prototype. Deploy `preview/index.html` as the site (it is a static file with no server), and spend the remaining time on checking the cited sources, the demo and the project page. Porting it into the React app would cost hours and add nothing a judge can see.

Not built: the night-thermal layer in the prototype, photos for stations other than S1, live Mars Trek tiles in the prototype (it carries its own image so that it works offline and during judging).

## 7. Schedule

The build is ahead of the original plan: the prototype covers the "must" tier. What remains, in order, counted in hours before the deadline:

| Hours to deadline | Work |
| --- | --- |
| Now | Everyone opens the prototype and clicks around for ten minutes. Write down anything confusing or wrong. Decide the open questions in section 12. |
| Next 2 | Science owner opens every source marked "cited, not opened" in DATA_SOURCES.md and confirms or removes the figure. Fix what the ten-minute test found. |
| Next 2 | Make the repository public or deploy `preview/index.html` to a public address. Test the link in a private window. **First "Submit for Judging".** |
| Next 3 | Demo: seven slides or a 30-second video, built around the demo path in section 4. Write the project page text. |
| If time remains | Night-thermal layer, photos at more stations, a short landing line above the map |
| Last 3 | Freeze. Run the DESIGN.md check. Resubmit. Check every link logged out. |
| Last hour | Buffer only |

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
| A user-picked pair is not connected under the slope limit | Medium | Show a clear message naming the limit, and offer to raise it |
| DEM noise read as obstacles | Medium | Smooth 3 to 5 m before slope; show slope as bands, not exact degrees |
| Mars Trek tiles slow or down during judging | Low to medium | Bundle one AOI base image as a fallback layer |
| Image hotlinks from mars.nasa.gov fail | Low | Store a handful of station photos in the repository with credits |
| Scope creep | High | The "will not build" list; freeze at three hours |
| Judges cannot open links | Medium while the repository is private | Public link tested logged out, twice |
| Demo over the limit | Low | Seven slides or 30 seconds; over-limit projects are ineligible |
| A cited figure turns out wrong | Low | Science owner opens every "cited, not opened" source before the first submission |
| Mixed-up units (mGy and mSv) | Medium | Use dose equivalent (mSv) for crew figures; keep absorbed dose (mGy) only as quoted |

## 11. AI disclosure

Short and true is the goal. Suggested wording for the README and the form's SI field:

> The project concept, the framework and the decisions are our team's. We used Claude Code as an assistant for drafting documents and writing code, and we reviewed what it produced. No AI-generated images, video or audio are used.

Notes for the team:

- Do not describe the assistance as smaller than it was. Most of the code and the first drafts of these documents were written with Claude Code, and the event rules ask teams to say where and how AI was used. Judges see AI indicators in the project and weigh "originality, intent, and execution"; an understated claim is a bigger risk than a plain one.
- What is genuinely yours, and worth saying first: the idea of comparing two routes for a chosen start and destination and ending in a mission briefing, and every choice you make from here.
- Code files carry a one-line note. Keep it on new files.
- No NASA logos or mission insignia in anything AI-generated. If you ever add an AI-generated image, it needs a visible watermark.

## 12. Open questions for the team

1. Which Local Event are you registered with, and what is its local judging schedule? This sets your real deadline.
2. Who owns the form and the demo? Name one person now.
3. Slides or video for the demo? Slides are less risky in the time left.
4. Is the suit factor of 0.5 acceptable as a default, or does someone want to find a published suited-walking figure?
