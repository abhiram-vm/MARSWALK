# MARSWALK

A walking-scale traverse planner for one real place on Mars: the boxwork ridges on Mount Sharp, Gale crater.

Built for the 2026 NASA Space Apps Challenge, ["Interplanetary Survival Guide: Martian Map"](https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/).

**Status:** final app built. Open `index.html` at the repository root. Submission closes Sunday November 15, 2026, 11:59 p.m. local event time.

## What it does

The boxwork site in 3D from NASA terrain and orbital images, with Mount Sharp around it. Plan a science walk with up to four stops; MARSWALK routes every leg two ways (fastest and most cautious), makes a go or no-go call against daylight and NASA's solar storm forecasts for Mars, lets you walk the route at eye level first, and produces a field guide in which every number is labelled measured, derived, assumed or simulated. Data comes from Mars Reconnaissance Orbiter, Mars Odyssey, Curiosity and Mars Global Surveyor.

## Documents

| Document | Read it for |
| --- | --- |
| [docs/PLAN.md](docs/PLAN.md) | The project plan: site, scope, architecture, schedule, risks |
| [docs/CHALLENGE_BRIEF.md](docs/CHALLENGE_BRIEF.md) | What NASA asks, suggests and leaves optional; rules; judging criteria |
| [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) | Every data layer, its mission, resolution, endpoint, status and limits |
| [docs/DESIGN.md](docs/DESIGN.md) | How it looks and behaves: layout, motion, performance, tokens, checks |
| [docs/AUDIT.md](docs/AUDIT.md) | How it is built, rule compliance, defects found and fixed, tests |
| [docs/SUBMISSION.md](docs/SUBMISSION.md) | Submission checklist, form fields, demo outline |
| [HANDOFF.md](HANDOFF.md) | Start here if you are taking over: commands, releasing, renaming, open work |
| [CHANGELOG.md](CHANGELOG.md) | What changed, newest first |
| [docs/history/CHAT.md](docs/history/CHAT.md) | The conversation the project was built in |
| [docs/demo/](docs/demo/) | The 30-second demo video and the scripts that made it |

## Try it

Open `index.html` (at the repository root) in a current browser. It is one self-contained file with everything inside it: data, fonts and code. Once the repository is public, GitHub Pages can serve it from the main branch root.

- A first visit opens a short scroll story: the Mars globe turns to Gale crater, then Mount Sharp, the boxwork, the data and the plan, and hands over to the planner. **Skip to the planner** or a `#plan` link goes straight there; **Story** reopens it.
- The camera descends to a default science walk: from the edge of the boxwork to the hollow and the ridge Curiosity drilled in 2025, and back.
- Add stops by clicking the ground, dragging a beacon, or picking one of 114 places Curiosity worked from **Science sites**. Every leg is routed on the spot, two ways. **Quickest order** reorders the stops; four ready-made plans are one click away.
- Hover the ground to read its slope and height against your start.
- Switch to **Pair** to split the stops between two astronauts. MARSWALK checks how far apart they get and whether they can see each other over the terrain.
- Read the GO or NO-GO call, compare the routes, and drag the walk along the daylight timeline.
- Open **Data layers** to see each NASA dataset and switch overlays.
- Press **Walk it at eye level** (or **Walk as A** or **B** in a pair) to rehearse the walk: it pauses at each stop with Curiosity's photo, runs at ½× to 4×, and you can click the height profile to jump. Then open the **Field guide**.

### Releasing

`index.html` is the released app. `npm run build` (in `web/`) rebuilds it from the source; run `npm run e2e`, then commit `index.html`.

## Check it

```bash
cd web && npm test
```

```bash
cd web && npm run build && npm run e2e
```

`npm test` runs 22 engine tests; `npm run e2e` drives the built app through 42 checks in a browser, including the story. Findings and fixes are in [docs/AUDIT.md](docs/AUDIT.md).

## Build it

```bash
cd web && npm ci && npm run build
```

The build writes `web/dist/index.html` and copies it to the repository root. `npm run dev` starts a development server.

The data files in `web/src/data/` are already built. To rebuild them (needs network access to NASA and USGS hosts):

```bash
python3 -m pip install -r pipeline/requirements.txt
```

```bash
python3 pipeline/fetch_reference.py
```

```bash
python3 pipeline/clip_dem.py
```

```bash
python3 pipeline/build_app_data.py
```

## Before submitting

- This repository must be public, or the deployed site must be, for judges to open it.
- Open every source marked "cited, not opened" or "unverified" in DATA_SOURCES.md.

## AI assistance

The project concept, the framework and the decisions are our team's. We used Claude Code as an assistant for drafting documents and writing code, and we reviewed what it produced. The 30-second demo video was assembled with Claude from real screenshots of the app and carries a visible AI-assisted watermark. No AI-generated images or audio are used in the app.

3D rendering uses [three.js](https://threejs.org/) 0.186 (MIT licence). Icons: Phosphor (MIT). Typefaces: B612, B612 Mono and Instrument Serif (Open Font License).

## Data credits

NASA/JPL-Caltech/University of Arizona (HiRISE); NASA/JPL-Caltech/MSSS (CTX, Mastcam); NASA/JPL-Caltech/Arizona State University (THEMIS); NASA/JPL-Caltech/SwRI (RAD); NASA/JPL-Caltech/CSIC-INTA (REMS); NASA/JPL-Caltech (Curiosity localization and engineering cameras); NASA Solar System Treks, JPL (Mars Trek tiles). Full list in [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

This project is not affiliated with or endorsed by NASA. Licence: Apache 2.0 ([LICENSE](LICENSE)); third-party licences in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
