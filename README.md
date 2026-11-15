# MARSWALK

A walking-scale traverse planner for one real place on Mars: the boxwork ridges on Mount Sharp, Gale crater.

Built for the 2026 NASA Space Apps Challenge, ["Interplanetary Survival Guide: Martian Map"](https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/).

**Status:** planning complete; starter map and data pipeline in place; routing, comparison and briefing not yet built. Submission closes Sunday November 15, 2026, 11:59 p.m. local event time.

## What it does

An astronaut picks a start point and a science station. MARSWALK overlays NASA orbital imagery, terrain, thermal data, Curiosity's track and ground-level photos on the same 1.5 km patch, computes two routes (fastest and most cautious), compares them, and produces a field briefing in which every number is labelled measured, derived, assumed or simulated.

## Documents

| Document | Read it for |
| --- | --- |
| [docs/PLAN.md](docs/PLAN.md) | The project plan: site, scope, architecture, schedule, risks |
| [docs/CHALLENGE_BRIEF.md](docs/CHALLENGE_BRIEF.md) | What NASA asks, suggests and leaves optional; rules; judging criteria |
| [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) | Every data layer, its mission, resolution, endpoint, status and limits |
| [docs/DESIGN.md](docs/DESIGN.md) | Visual direction, tokens, type, layout, copy rules, pre-flight check |
| [docs/SUBMISSION.md](docs/SUBMISSION.md) | Submission checklist, form fields, demo outline |

## See how it looks

Open `preview/index.html` in a browser. It is one self-contained file: real NASA imagery, two real computed routes, the comparison panel and the field briefing card, in the project's visual style. It is a static preview, not the app; routes are precomputed for one pair of points.

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
python3 preview/build.py
```

The pipeline needs network access to `mars.nasa.gov` and the USGS hosts listed in DATA_SOURCES.md. Its outputs are already committed, so the web app runs without it.

## Before submitting

- This repository must be public, or the deployed site must be, for judges to open it.
- Open every source marked "cited, not opened" or "unverified" in DATA_SOURCES.md.

## AI assistance

The planning documents in `docs/` were drafted with an AI coding assistant (Claude Code) from the official challenge pages and live NASA data endpoints. The team is responsible for reviewing and correcting them. Code written with AI assistance is identified in file headers. The project concept and design decisions are the team's. No AI-generated images, video or audio are used.

## Data credits

NASA/JPL-Caltech/University of Arizona (HiRISE); NASA/JPL-Caltech/MSSS (CTX, Mastcam); NASA/JPL-Caltech/Arizona State University (THEMIS); NASA/JPL-Caltech/SwRI (RAD); NASA/JPL-Caltech/CSIC-INTA (REMS); NASA/JPL-Caltech (Curiosity localization and engineering cameras); NASA Solar System Treks, JPL (Mars Trek tiles). Full list in [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

This project is not affiliated with or endorsed by NASA.
