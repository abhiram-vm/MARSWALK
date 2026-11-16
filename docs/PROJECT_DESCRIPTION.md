# MarsWalk: Project Description

Team Indy Knights: Satvik Vitta, Abhiram Menon, Satwik Pokala, Kalaanidhi Sundar
NASA Space Apps Challenge 2026, "Interplanetary Survival Guide: Martian Map"

## What it does

The first people on Mars won't need a map of the planet; they'll need a map of the next 500 meters. MarsWalk is a walking-scale traverse planner and field guide for one real place: the boxwork ridges on Mount Sharp in Gale crater, where NASA's Curiosity rover drilled in 2025. It runs as a single web page on any laptop or phone, with no install.

## How it works

- **Story:** a scroll story zooms from a Mars globe to Gale crater, Mount Sharp and the boxwork, then hands over to the planner.
- **Plan:** on a 3 by 3 km area of real 3D terrain, users add up to six stops by clicking the ground or choosing from 114 real places Curiosity stopped.
- **Two routes per leg:** Direct (fastest) and Cautious (avoids steep ground), both under an adjustable 20° slope limit.
- **GO or NO-GO:** checks departure after sunrise, an hour of daylight to spare, the slope limit, and, for pairs, staying within 300 m and in sight. Dragging the daylight timeline updates the call; NASA space weather adds a storm caution.
- **Pairs:** splits stops between two astronauts and checks separation and line of sight over the ridges.
- **Data layers:** slope hazard, night temperature, Curiosity's path and terrain relief, each with its source.
- **Science sites:** each has Curiosity's own Navcam photo; ten are named from NASA mission blogs.
- **Eye-level walk:** rehearse the route at human height, with the next hazard, time left and back-by time in a visor.
- **Field guide:** a printable crew briefing with a route map, timeline, sun, radiation dose and turn-back times. Every number is labelled measured, derived, assumed or simulated.

## Data and engine

NASA data: MRO HiRISE and CTX imagery (via Mars Trek), the USGS 1 m Gale terrain model, Mars Odyssey THEMIS night infrared, Curiosity waypoints, REMS weather, RAD radiation and Navcam photos, NASA DONKI space weather, the Viking globe mosaic, and the Mars24 sun algorithm. Partner data: ESA Mars Express HRSC stereo in the terrain model, and Spain's REMS weather station.

Routes use A* search on a 2 m slope grid, with walking speed from Tobler's hiking function scaled to NASA's Apollo suited-walking pace (2.5 km/h).

## Benefits and impact

MarsWalk turns existing NASA data into a complete decision a crew could follow: which way, how long, how steep, back before dark, safe to go, and what is at each stop. It is honest about its limits and lets crews rehearse before risk. The method works anywhere with a HiRISE terrain model, so it can serve mission planners, future crews and classrooms.

## Tools

TypeScript, three.js, Vite (built into one self-contained HTML file), Web Workers; Python with NumPy, Rasterio and Pillow for the data pipeline; Vitest and Playwright for testing; GitHub; team laptops, no special hardware. Claude Code assisted with documents and code; the concept and decisions are the team's.

## Creativity

It plans at walking scale rather than planet scale. It joins a cinematic story to a real decision tool, handles pair rules and line of sight, uses Curiosity as a scout for human science stops, and treats data provenance as a feature.

## Factors considered

The science goal (why the ridges resisted erosion), the site (the only one with surface radiation and weather data), human limits (pace, slope, daylight, radiation), pair safety, data honesty, focused scope, performance on modest devices, accessibility, licensing and AI disclosure.
