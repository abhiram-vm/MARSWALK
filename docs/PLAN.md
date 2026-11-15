# MARSWALK project plan

NASA Space Apps Challenge 2026, "Interplanetary Survival Guide: Martian Map".
Written 2026-11-14, revised 2026-11-15, for a team of two or three.

Companion documents: [CHALLENGE_BRIEF.md](CHALLENGE_BRIEF.md) (what NASA asks, rules, judging), [DATA_SOURCES.md](DATA_SOURCES.md) (every layer, its source and its limits), [DESIGN.md](DESIGN.md) (how the app looks and behaves), [SUBMISSION.md](SUBMISSION.md) (form fields and demo).

## 0. Read this first

1. **Submission closes Sunday November 15, 11:59 p.m.** in your Local Event's time zone.
2. **The app is built.** `web/` holds the final version: a 3D planner that builds to one self-contained file, copied to the repository root as `index.html`. Section 6 says what it does and section 7 what is left.
3. **Judges need a public link.** The repository is private. Make it public, or host `web/dist/index.html` publicly (section 7), and test the link logged out.
4. **AI use must be disclosed briefly and truthfully** (section 11).

## 1. The project in one paragraph

MARSWALK is a walking-scale traverse planner and field guide for one real place on Mars: the boxwork ridges on Mount Sharp in Gale crater, which Curiosity has been studying since 2025. The site is shown in 3D from NASA's terrain and orbital images, with Mount Sharp rising around it. An astronaut clicks any start and destination in the 1.4 km planning area. MARSWALK computes two routes (fastest and most cautious), makes a go or no-go call against daylight, shows the walk on a daylight timeline, lets the crew walk it first at eye level with a visor-style display, and produces a printable field guide with a leg-by-leg plan, a turn-back rule, conditions, radiation, real Curiosity photos of the destination, and limits. Every number is marked as measured, derived, assumed or simulated.

### Does the challenge require routing between any two points?

No. The brief asks for "a layered, integrated view of a location or route". A route map is suggested "if possible", and a system that generates maps for different locations is on the list teams "may (but are not required to) consider". One site is fully in scope. MARSWALK routes between any two points **inside one site**; it does not attempt any place on Mars.

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

**Default scenario:** start at the edge of the boxwork unit (station S0, the Altadena drill area), walk to the Monte Grande hollow and Nevado Sajama ridge pair (S1, S2). The computed Direct route is about 540 m with 40 m of climb; the round trip takes about an hour under the default assumptions. Coordinates are in DATA_SOURCES section 1.

## 3. Mapping to the brief

Checked against the official text again on 2026-11-15, after the final app was built.

### What the challenge asks, and where the app answers it

| Core requirement (official wording in CHALLENGE_BRIEF.md) | In the app |
| --- | --- |
| "a layered, integrated view" | One 3D view; the **Data layers** drawer lists each dataset with its mission, instrument and resolution, and switches overlays on and off. Routes are computed from the terrain, not drawn on top of it. |
| "of a location or route on the Martian surface" | The 1.4 by 1.5 km boxwork site, with an 8 km ring of real terrain around it for context |
| "pulls together data from multiple NASA science missions" | Mars Reconnaissance Orbiter (HiRISE, CTX, stereo terrain), Mars Odyssey (THEMIS), Curiosity (RAD, REMS, Navcam, localization), Mars Global Surveyor (MOLA, as the terrain's vertical reference). ESA's Mars Express HRSC also feeds the terrain model. |
| "help a human explorer plan and carry out a successful Marswalk" | Plan: route comparison, go or no-go, daylight timeline. Carry out: eye-level walk with heading, slope warnings and time, and the field guide with a turn-back rule. |
| "while conducting new and exciting science" | Science stations are Curiosity's 2025 drill sites, each with a real Navcam photo and what was done there; the objective is stated in the guide. |
| "a map, tool, or interface a Mars astronaut could use ... using NASA data and tools" | Imagery from NASA Mars Trek; terrain from the USGS-NASA mapping programme; weather, track and photos from NASA's Curiosity feeds |
| Gap named in the brief: "hyperlocalized areas astronauts will target on individual spacewalks" | Everything is at walking scale: 2 m routing cells, eye-level view, metres and minutes |

### What NASA suggests, and what we do with each

| Suggestion | In the app |
| --- | --- |
| Start from a science goal and location | Section 2; stated in the guide |
| At least three kinds of data | Six: optical (HiRISE, CTX), topographic (terrain), thermal (THEMIS), radiation (RAD), atmospheric (REMS), surface imagery (Navcam) |
| Safety | Slope hazard layer, blocked ground over the limit, go or no-go, sunset reserve, time back from the far point, turn-back rule, steep-ground warnings while walking |
| Radiation and space weather | RAD dose for the walk, with a note that no route-scale radiation data exists and that a solar particle event would change the call |
| Suit and load | Adjustable share of normal walking speed, labelled as an assumption |
| Route avoiding large obstacles | Routes avoid ground steeper than the limit; rocks smaller than the terrain model resolves are a stated limit |

### Optional considerations

| Option | Decision |
| --- | --- |
| 1. Habitat display, tablet, or helmet HUD | Habitat planning screen, phone layout, and a visor-style display in walk mode |
| 2. Static, interactive or generator | Interactive, one site |
| 3. Maps from other missions | Field guide in the spirit of Apollo traverse maps and cuff checklists |
| 4. Time frame | Terrain has none; weather is the latest Curiosity record, dated on screen |
| 5. Point-of-view images | Real Navcam photos at each station, in the station cards, at arrival in walk mode, and in the guide |
| 6. Rovers or pairs | Not modelled; the start is described as a rover park |

## 4. What the user does (the demo path)

1. **Opens MARSWALK.** The camera descends from above Gale crater to a default walk between two of Curiosity's drill sites.
2. **Chooses where to go.** Clicks the ground, or taps a station photo and presses Go here. Two routes appear in a fraction of a second.
3. **Reads the call.** GO or NO-GO, with whole walk time, back-by time and radiation dose, and the reasons.
4. **Picks a route.** Direct or Cautious, compared on time, distance, steep share and steepest ground.
5. **Sets the time.** Drags the walk along the daylight timeline. Shadows on the terrain move with the sun; the call turns NO-GO if the walk eats into the last hour of light.
6. **Checks the layers.** Slope hazard, night surface temperature, Curiosity's drive path.
7. **Walks it.** Eye level, true scale, compass, slope warnings, Mars clock, profile; Curiosity's photo of the destination on arrival.
8. **Opens the field guide.** A printable sheet with the route map and everything the crew needs.

All eight work in the current build.

## 5. Scope

| Tier | Feature | State |
| --- | --- | --- |
| Must | 3D site with real terrain and imagery, 8 km context | Built |
| Must | Any-two-points routing in a worker, two route profiles | Built |
| Must | Go or no-go, comparison, daylight timeline | Built |
| Must | Data layers with mission credits: slope, thermal, track | Built |
| Must | Science stations with real photos | Built |
| Must | Walk at eye level, flyover | Built |
| Must | Field guide with provenance marks and limits | Built |
| Must | Phone layout, reduced-motion support, single-file build | Built |
| Must | Public hosting, demo, submission form | **Team** |
| Should | Station notes on drill results (chemistry) from published sources | Not built |
| Should | A "space weather" toggle that simulates a solar particle event | Not built |
| Will not build | Accounts, a backend, a chatbot, other sites, automatic rock detection | |

## 6. Technical approach

### The app (`web/`)

```
pipeline/build_app_data.py (Python, run once)
  site terrain: 2 m grid, elevation and slope packed in one PNG
  site image: HiRISE, stitched from NASA Mars Trek tiles
  context: 8 km of terrain at 16 m read from the same USGS file,
           CTX image matched in brightness to HiRISE, THEMIS night infrared
  station photos: Curiosity Navcam frames found through NASA's raw-image API
        |
        v
web/ (Vite, TypeScript, three.js 0.186)
  src/model.ts           routing (A*), route analysis, legs, go or no-go, sun position
  src/routing.worker.ts  routing off the main thread
  src/world.ts           3D: terrain meshes with baked shading, sky, sun and shadows,
                         route ribbons, beacons, picking, camera, walk and flyover
  src/main.ts            panels, daylight timeline, layers, stations, HUD, field guide
        |
        v
web/dist/index.html      one self-contained file, about 4 MB, also copied to /index.html
```

Why these choices:

- **One file, no server.** Nothing can be down during judging. It runs from any static host, a USB stick, or straight from disk.
- **Plain TypeScript and three.js, no UI framework.** Less code to load, and the UI is a few panels.
- **Its own copy of the data.** The app does not depend on NASA servers being fast on the day. The scripts that fetched the data are in the repository.
- **Draws only when something changes,** and lowers its resolution if frames slow down (DESIGN.md section 3).

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

### Build and run

```bash
cd web && npm ci && npm run build
```

Open `web/dist/index.html`. For development, `npm run dev`. To rebuild the data (needs network access to NASA and USGS hosts): `python3 pipeline/build_app_data.py`.

### Earlier prototypes

`preview/index.html` (2D) and `preview/cinematic.html` (first 3D) are kept for reference. The app in `web/` replaces both.

## 7. What is left, in order

| When | Work | Owner |
| --- | --- | --- |
| Now | Everyone uses the app for ten minutes on the laptop you will demo from. Note anything slow, confusing or wrong. | All |
| Next | Open every source marked "cited, not opened" in DATA_SOURCES.md; confirm or remove the figure. | Science |
| Next | Publish: make the repository public, then Settings, Pages, deploy from branch `main`, folder `/ (root)`. The root `index.html` is the app (the build copies it there). Or upload that one file to any static host. Test the link in a private window. **First "Submit for Judging".** | One person |
| Then | Demo: a 30-second screen recording (descent, click, call, timeline drag, walk, guide) or seven slides. | Presentation |
| Then | Project page text from SUBMISSION.md, in your own words. | Presentation |
| Last hours | Freeze. Run the DESIGN.md check. Resubmit. Check every link logged out. | All |

Submitting early is safe: the guide says you can "edit and resubmit your project as many times as you'd like until the end of the hackathon".

## 8. Playing to the judging criteria

| Criterion | What earns the score | Where it shows |
| --- | --- | --- |
| Impact | A real crew decision, which way and whether to go, made from real data | Call, comparison, timeline, guide |
| Creativity | Walking the route at eye level before going; sun and shadows at departure time; provenance marks on every number; radiation handled honestly | Walk mode, timeline, guide |
| Validity | Real terrain drives the routes; assumptions are visible and adjustable; limits are written down; numbers match the Python reference | Assumptions, guide limits, DATA_SOURCES |
| Relevance | Four NASA missions and six instruments, each named in the Data layers drawer and doing work in the decision | Data layers drawer, guide sources |
| Presentation | One story: a real place, a real question, a decision, a walk | The opening descent, the walk, the demo |

## 9. Honesty rules for the product

1. Every number carries one of four labels: **Measured** (instrument data), **Derived** (computed from measured data), **Assumed** (our parameter), **Simulated** (scenario).
2. Every layer shows mission, instrument, resolution and credit.
3. The briefing ends with a limits section that is never hidden or collapsed.
4. Estimates are shown as ranges or with "about", never to false precision.
5. Nothing appears in the app that is not listed in DATA_SOURCES.

## 10. Risks

| Risk | Likelihood | Response |
| --- | --- | --- |
| The judge's computer has weak graphics | Medium | Resolution drops automatically; the demo video carries the visual story regardless |
| WebGL unavailable | Low | The app says so and names supported browsers; `preview/index.html` works without WebGL |
| A user-picked pair is not connected under the slope limit | Medium | Clear message naming the limit and how to change it |
| Judges cannot open links | Medium while private | Public link tested logged out, twice |
| Demo over the limit | Low | 30 seconds or seven slides; over-limit projects are ineligible |
| A cited figure turns out wrong | Low | Science owner checks every cited source first |

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
2. Who owns hosting, the form and the demo? Name one person for each.
3. Is the default suit factor of 50% acceptable, or does someone want to find a published suited-walking figure?
