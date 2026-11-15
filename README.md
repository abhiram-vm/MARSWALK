# MARSWALK

A walking-scale traverse planner for one real place on Mars: the boxwork ridges on Mount Sharp, Gale crater.

Built for the 2026 NASA Space Apps Challenge, ["Interplanetary Survival Guide: Martian Map"](https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/).

**Status:** working prototype in `preview/index.html`. Submission closes Sunday November 15, 2026, 11:59 p.m. local event time.

## What it does

An astronaut picks a start point and a science station. MARSWALK overlays NASA orbital imagery, terrain, thermal data, Curiosity's track and ground-level photos on the same 1.5 km patch, computes two routes (fastest and most cautious), compares them, and produces a field briefing in which every number is labelled measured, derived, assumed or simulated.

## Documents

| Document | Read it for |
| --- | --- |
| [docs/PLAN.md](docs/PLAN.md) | The project plan: site, scope, architecture, schedule, risks |
| [docs/CHALLENGE_BRIEF.md](docs/CHALLENGE_BRIEF.md) | What NASA asks, suggests and leaves optional; rules; judging criteria |
| [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) | Every data layer, its mission, resolution, endpoint, status and limits |
| [docs/DESIGN.md](docs/DESIGN.md) | How it looks and behaves: layout, motion, performance, tokens, checks |
| [docs/SUBMISSION.md](docs/SUBMISSION.md) | Submission checklist, form fields, demo outline |

## Try it

Two versions of the same planner, each one self-contained file:

- `preview/index.html`, **Map**: fast 2D planner, works on any device.
- `preview/cinematic.html`, **Descent**: the site in 3D, with sun shadows at your departure time, a first-person walk of the route and a flyover. Needs WebGL.

In either:

- Click anywhere on the map to move the destination. Two routes are computed on the spot.
- Read the go or no-go call, compare the routes, drag along the elevation chart.
- Press Rehearse to watch the walk. Open the Field guide for the leg-by-leg plan.

It covers one site, the boxwork unit in Gale crater, using real NASA imagery and terrain.

## Run it

```bash
cd web && npm ci && npm run dev
```

Data pipeline (Python 3, from the repository root):

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
python3 pipeline/routes.py
```

```bash
python3 preview/make_assets.py
```

```bash
python3 preview/build.py
```

The pipeline needs network access to `mars.nasa.gov` and the USGS hosts listed in DATA_SOURCES.md. Its outputs are already committed, so the web app runs without it.

## Before submitting

- This repository must be public, or the deployed site must be, for judges to open it.
- Open every source marked "cited, not opened" or "unverified" in DATA_SOURCES.md.

## AI assistance

The project concept, the framework and the decisions are our team's. We used Claude Code as an assistant for drafting documents and writing code, and we reviewed what it produced. No AI-generated images, video or audio are used.

3D rendering uses [three.js](https://threejs.org/) r149, MIT licence (`preview/vendor/`).

## Data credits

NASA/JPL-Caltech/University of Arizona (HiRISE); NASA/JPL-Caltech/MSSS (CTX, Mastcam); NASA/JPL-Caltech/Arizona State University (THEMIS); NASA/JPL-Caltech/SwRI (RAD); NASA/JPL-Caltech/CSIC-INTA (REMS); NASA/JPL-Caltech (Curiosity localization and engineering cameras); NASA Solar System Treks, JPL (Mars Trek tiles). Full list in [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

This project is not affiliated with or endorsed by NASA.
