# Changelog

Newest first. Commit hashes are on `main`. "Beta" means the change is in `beta/index.html` and the source, but not yet in the released `index.html` (see HANDOFF.md, "Released and beta").

## Unreleased (beta)

### 2026-11-15: 30-second demo video
- `docs/demo/MarsWalk_demo_30s.mp4`: silent 29.5 s walkthrough of the beta following the Space Apps demo timing (team, challenge, title, how it works, future), captioned in English, with an AI-assisted watermark. Scripts that captured and rendered it are in `docs/demo/tools/`.

### 2026-11-16: hand-off
- The product name is one setting: `VITE_APP_NAME` in `web/.env` (see HANDOFF.md, "Renaming").
- Added HANDOFF.md, AGENTS.md, CLAUDE.md, this changelog and `docs/history/CHAT.md` (the build conversation).

### 2026-11-16: story site (`a2fd11b`)
- Scroll-driven story in nine chapters in the same page as the planner: Mars globe turning to Gale crater, Mount Sharp, the boxwork with contour lines, a scan line sweeping slope then night temperature, Curiosity's track and photos, the route and the call, the pair plan, and a hand-off into the planner.
- First visit opens the story; `#plan` links and returning visitors go to the planner; a Story button reopens it.
- Fix: the daylight timeline could crash right after switching plans.

### 2026-11-16: bigger map, speed, one-way walks (`d8523c3`)
- Planning area 3 by 3 km (was 1.4 by 1.5 km); 114 science sites (was 49); surroundings 30 km (was 8 km) with haze so the edge never shows.
- Terrain in 36 tiles with four detail levels; layers in the terrain shader; shadows redrawn only when the sun or view changes; shading baked in the pipeline; weaker graphics detected, plus a Performance mode switch.
- One-way walks: end at the last stop instead of returning.
- Beta copy set up (`npm run build:beta`).
- Fix: the arrival message could be overwritten at the end of a walk; on slow devices the walk played slower than the chosen speed.

## Released (`index.html`)

### 2026-11-16 (`857e8bd`, `1de15c1`)
- Large "Walk it at eye level" button over the map with a Direct or Cautious switch; clicking a route line selects it.
- Partner drawn as an astronaut with a walking stride; helmet view; speed ½×, 1×, 4× and a free slider.
- Walk readouts cut to next stop, time left, back-by time, ground and partner; per-stop sun, dose and height moved to the field guide.
- Plan for the story site (`docs/LANDING_PLAN.md`).

### 2026-11-16: pairs and science sites (`9c7d872`)
- Working in pairs: stops split between astronauts A and B; separation and line-of-sight checks feed the GO or NO-GO call.
- 49 science sites from Curiosity's record with Navcam photos, 10 named from the mission blog.
- Drag beacons, hover readout, quickest order, ready-made plans, up to six stops.
- Better eye-level walk: path drawn only ahead, pauses at stops, seek, look around. Flyover removed.

### 2026-11-15: audit (`7d73e7c`)
- Full audit (docs/AUDIT.md): sun position fixed with the Mars24 method, route search checked against brute force, slope limit enforced exactly, and more.
- Multi-stop walks and space weather from NASA DONKI.

### 2026-11-15: the 3D app (`08ea097`, `836c18d`)
- Final app in three.js: real terrain and imagery, routes, GO or NO-GO, daylight timeline, layers, walk at eye level, field guide.

### 2026-11-14 to 15: plan and prototypes (`c89641d` to `a03584a`)
- Project plan, challenge brief, data sources, design direction, data pipeline and 1 m terrain clip, 2D and 3D previews in `preview/`.
