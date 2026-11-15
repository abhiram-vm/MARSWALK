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

## Try it

Open `index.html` (at the repository root) in a current browser. It is one self-contained file with everything inside it: data, fonts and code. Once the repository is public, GitHub Pages can serve it from the main branch root.

- The camera descends to a default science walk: from the edge of the boxwork to the hollow and the ridge Curiosity drilled in 2025, and back.
- Add stops, and click the ground or a station photo to place them. Every leg is routed on the spot, two ways.
- Read the GO or NO-GO call, compare the routes, and drag the walk along the daylight timeline.
- Open **Data layers** to see each NASA dataset and switch overlays.
- Press **Walk it at eye level** to rehearse the walk, then open the **Field guide**.

Earlier prototypes are in `preview/` (2D and a first 3D version).

## Check it

```bash
cd web && npm test
```

```bash
cd web && npm run build && npm run e2e
```

`npm test` runs 17 engine tests; `npm run e2e` drives the built app through 21 checks in a browser. Findings and fixes are in [docs/AUDIT.md](docs/AUDIT.md).

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

The project concept, the framework and the decisions are our team's. We used Claude Code as an assistant for drafting documents and writing code, and we reviewed what it produced. No AI-generated images, video or audio are used.

3D rendering uses [three.js](https://threejs.org/) (MIT licence): 0.186 in the app, r149 in the earlier prototype (`preview/vendor/`). Icons: Phosphor (MIT). Typefaces: B612 and B612 Mono (Open Font License).

## Data credits

NASA/JPL-Caltech/University of Arizona (HiRISE); NASA/JPL-Caltech/MSSS (CTX, Mastcam); NASA/JPL-Caltech/Arizona State University (THEMIS); NASA/JPL-Caltech/SwRI (RAD); NASA/JPL-Caltech/CSIC-INTA (REMS); NASA/JPL-Caltech (Curiosity localization and engineering cameras); NASA Solar System Treks, JPL (Mars Trek tiles). Full list in [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

This project is not affiliated with or endorsed by NASA. Licence: Apache 2.0 ([LICENSE](LICENSE)); third-party licences in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
