# MarsWalk: Detailed Project Description

Team Indy Knights: Satvik Vitta, Abhiram Menon, Satwik Pokala, Kalaanidhi Sundar
NASA Space Apps Challenge 2026, "Interplanetary Survival Guide: Martian Map"

## What it does

The first people to walk on Mars will not need a map of the planet. They will need a map of the next five hundred meters. MarsWalk is a walking-scale traverse planner and field guide for one real place on Mars: the boxwork ridges on lower Mount Sharp in Gale crater, where NASA's Curiosity rover drilled in 2025. It turns orbital images, a 1 meter terrain model and Curiosity's own records into a plan an astronaut could actually follow: where to walk, how long it takes, whether it is safe to go, and what they will see when they get there.

MarsWalk runs as a single web page in any modern browser, on a laptop or a phone, with no installation and no account.

## How it works: the user experience

1. **A story that sets the scene.** A first visit opens a short scroll story in nine chapters. A globe of Mars, built from the Viking colour mosaic, turns to Gale crater. The camera descends to Mount Sharp and then the boxwork, where contour lines trace the ridges. A scan line sweeps the slope and night temperature layers, Curiosity's track and photos appear, and the story ends by handing the user to the planner. "Skip to the planner" goes straight there.
2. **Plan a science walk.** The planner opens on a 3 by 3 km area of real terrain shown in 3D, with Mount Sharp and a 30 km ring of surroundings on the horizon. A default walk goes from the edge of the boxwork to the Monte Grande hollow and the Nevado Sajama ridge that Curiosity drilled, and back. The user adds stops by clicking the ground, dragging a beacon, or choosing from 114 real places where Curiosity stopped for three sols or more. Up to six stops are allowed, "Quickest order" reorders them, and four ready-made plans are one click away.
3. **Two routes for every leg.** Each leg is routed two ways. Direct is the fastest. Cautious accepts a longer walk to avoid steep ground. Both stay under a slope limit (20 degrees by default, adjustable). The user compares them on time, distance, climb and the share of steep ground, and picks one.
4. **A GO or NO-GO call.** MarsWalk checks that the walk leaves after sunrise, gets back with at least an hour of daylight to spare, keeps every step within the slope limit, and, for a pair, keeps the two astronauts within 300 meters of each other and out of sight for no more than ten minutes at a time. Any failure turns the call to NO-GO and says why. A daylight timeline lets the user drag the departure time and watch the call change. NASA's space weather forecasts add a caution if a solar storm is due at Mars within a day.
5. **Work in pairs.** Real EVAs are done in pairs. Pair mode splits the stops between astronauts A and B, routes both, and checks their separation and line of sight over the ridges every half minute of the walk.
6. **See the data.** A Data layers panel shows each dataset with its source and switches overlays on the terrain: slope hazard, night surface temperature, Curiosity's drive path, the planning boundary, terrain relief, and a Mars colour tint (clearly labelled as a tint, because the orbital images are greyscale). Hovering anywhere reads out the slope and height.
7. **Science sites with real photos.** Every site card shows a real Curiosity Navcam photo taken there. Ten sites carry names and notes written from NASA's Curiosity mission blog, with a link to the post. Five of them are drill sites.
8. **Walk it at eye level.** "Walk it at eye level" puts the user on the ground at human height. The walk follows the route at half speed to four times speed, pauses at each stop with Curiosity's photo, and shows a visor with the next stop or hazard, time left and the back-by time. A helmet view and a height profile (click to jump) are included.
9. **A printable field guide.** The field guide is a one-page crew briefing: the objective, a route map on HiRISE imagery, a timeline with arrival times, sun angle, cumulative radiation dose and height at each stop, turn-back times, a leg-by-leg plan, conditions, and the limits of the data. Every number is labelled measured, derived, assumed or simulated, so the crew knows which figures to trust.

## How it works: the data and the engine

**NASA data (all public, no keys needed):**

- **Mars Reconnaissance Orbiter HiRISE** imagery (about 0.7 m per pixel) through NASA's Mars Trek, as the base map.
- **USGS Mars MSL Gale Merged DEM, 1 m** (Parker and Calef, 2016), the real elevation model used for slope and routing. It merges HiRISE, CTX and ESA Mars Express HRSC stereo, tied to MGS MOLA.
- **MRO CTX** Gale crater mosaic for the surroundings, brightness-matched to the HiRISE image.
- **Mars Odyssey THEMIS** night-time infrared for the surface temperature layer, a proxy for rocky versus dusty ground.
- **Curiosity (Mars Science Laboratory)** waypoints and traverse for positions and the drive path; **REMS** weather records for conditions, sunrise and sunset; **RAD** radiation measurements (about 0.67 mSv per day at the surface) for the dose estimate; and **Navcam** raw images for the site photos.
- **NASA DONKI** (Community Coordinated Modeling Center) WSA-ENLIL solar storm arrivals at Mars and solar particle events.
- **Viking MDIM 2.1** colour mosaic for the story globe.
- **NASA GISS Mars24** algorithm for the sun's position, checked to within a minute of Curiosity's measured sunrise and sunset.

**Space agency partner data:** the terrain model includes stereo data from ESA's Mars Express HRSC camera, and Curiosity's REMS weather station was contributed by Spain (CSIC-INTA).

**The engine:** the terrain is resampled to a 2 m grid and slope is computed with the Horn method. Walking speed comes from Tobler's hiking function, scaled by a suit factor so flat ground gives 2.5 km/h, matching NASA's Apollo planning figure for suited walking. Routes are found with A* search on an 8-connected grid (no corner cutting), blocked above the slope limit, then straightened without crossing steeper ground. Routing runs in a Web Worker so the interface never freezes. Radiation dose is the RAD rate multiplied by time outside. Line of sight between partners is traced over the terrain from eye height.

## Benefits

- **Grounded in real places and real data.** Every route is computed on NASA's actual terrain, at a site Curiosity has really explored.
- **Honest about what it knows.** Each figure says where it came from. Assumptions (walking speed, slope limit, time at each stop, a notional rover park position) are labelled and adjustable, and a limits section lists what the data cannot see, such as rocks smaller than about 1 meter.
- **A complete decision, not just a map.** It answers the questions a crew asks before stepping outside: which way, how long, how steep, back before dark, safe to go, and what is at each stop.
- **Rehearsal before risk.** Walking the route at eye level lets a crew see the ridges, the climbs and the turn-back points before anyone suits up.
- **Accessible to anyone.** One file, works offline from disk, runs on phones, and respects reduced-motion settings.

## Intended impact

MarsWalk shows how existing NASA data can be combined to plan the first human steps on Mars at the scale people actually walk. For mission planners, it is a template for turning orbital and rover data into routes, limits and a GO or NO-GO call. For future crews, it is a way to rehearse an EVA on real terrain. Because the method only needs a HiRISE-scale terrain model, it can be applied to any candidate landing or exploration site. For students and the public, it makes one real place on Mars something anyone can walk, meter by meter, and it teaches how to read data honestly.

## Tools, languages, hardware and software

- **Languages:** TypeScript for the app, Python 3 for the data pipeline, HTML and CSS.
- **App:** three.js 0.186 for 3D rendering, a Web Worker for routing, Vite with vite-plugin-singlefile to build everything (code, data, fonts and photos) into one self-contained HTML file.
- **Data pipeline:** Python with NumPy, Rasterio and Pillow to clip the 1 m terrain model, fetch Mars Trek tiles, find Curiosity's stops, choose the best Navcam photo for each, compute sun geometry and ambient occlusion, and package the data.
- **Testing:** Vitest (22 engine tests, including route search checked against brute-force Dijkstra on random terrains and the stop-order search against every permutation) and Playwright (42 browser checks covering the story, planning, pairs, layers, the walk, the field guide, the phone layout and reduced motion). oxlint for code quality.
- **Fonts and icons:** B612 and B612 Mono (designed for aircraft cockpit displays), Instrument Serif, Phosphor icons.
- **Hardware:** the team's own laptops; no special hardware. The app runs in a browser on laptops and phones.
- **Collaboration:** GitHub.
- **AI assistance:** Claude Code assisted with drafting documents and writing code; the concept, framework and decisions are the team's, and we reviewed what it produced. The demo video was assembled with Claude from real footage of the app and carries a visible AI-assisted watermark.

## How it is creative

- **Walking scale, not planet scale.** Most Mars maps show regions. MarsWalk is built around the next few hundred meters, the distance a person in a suit actually covers.
- **A decision tool with a story.** A cinematic scroll story takes the user from the whole planet down to one ridge before handing over the controls.
- **Two routes, a call, and a rehearsal.** Comparing a fast and a cautious route, getting a GO or NO-GO verdict, then walking it at eye level, is an end-to-end crew workflow rather than a map viewer.
- **Pairs and line of sight.** Planning for two astronauts who must stay close and in view is a real EVA rule that maps rarely model.
- **Curiosity as a scout.** The rover's real stops, photos and drill sites become the science stations a human crew would visit next.
- **Provenance as a feature.** Labelling every number as measured, derived, assumed or simulated is part of the design, not a footnote.

## Factors the team considered

- **Science objective:** why the boxwork ridges resisted erosion while the hollows did not. Curiosity drilled one hollow and one ridge a month apart; a person on foot could sample several ridge and hollow pairs in one walk.
- **Site choice:** Gale crater is the only place on Mars with a surface radiation detector and a weather station, and it has 1 meter terrain data and published ground truth.
- **Human limits:** suited walking speed, a slope limit, a daylight reserve, time at each stop, and radiation dose.
- **Pair safety:** separation and line of sight between partners.
- **Data honesty:** no invented numbers; every figure traced to a source or labelled as assumed; known gaps stated (no route-scale radiation map, no walking-scale thermal data, rocks under about 1 meter invisible, dust and sand not modelled).
- **Scope:** one real site done thoroughly rather than a thin planner for anywhere on Mars.
- **Performance:** terrain in 36 tiles with four detail levels, shading baked in advance, shadows redrawn only when needed, and a Performance mode for weaker devices.
- **Accessibility:** phone layout, reduced motion, readable cockpit typefaces, plain English.
- **Rules and licensing:** open-source licence (Apache 2.0), third-party licences listed, credits for every NASA dataset, no NASA logos or insignia, AI use disclosed.
