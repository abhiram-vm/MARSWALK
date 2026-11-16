# MarsWalk

**Plan the first walk on Mars, meter by meter.**

A walking-scale traverse planner and field guide for one real place on Mars: the boxwork ridges on Mount Sharp in Gale crater, where NASA's Curiosity rover drilled in 2025.

Team Indy Knights: Satvik Vitta, Abhiram Menon, Satwik Pokala, Kalaanidhi Sundar.
NASA Space Apps Challenge 2026, ["Interplanetary Survival Guide: Martian Map"](https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/).

## Open it

Open [`index.html`](index.html) in a current browser, or visit the live site at **https://abhiram-vm.github.io/MARSWALK/**. It is one self-contained file: data, fonts and code are all inside it, and it works on laptops and phones.

- **Demo video (under 30 seconds):** [docs/demo/MarsWalk_demo_30s.mp4](docs/demo/MarsWalk_demo_30s.mp4)
- **Project description:** [docs/PROJECT_DESCRIPTION.md](docs/PROJECT_DESCRIPTION.md)
- **Data sources and credits:** [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)

## What you can do

- Follow a short story from the Mars globe down to Gale crater, Mount Sharp and the boxwork, or **Skip to the planner**.
- Plan a science walk: add up to six stops by clicking the ground, dragging a beacon, or picking one of 114 places Curiosity stopped from **Science sites**.
- Compare two routes for every leg, Direct and Cautious, both under an adjustable slope limit.
- Read the GO or NO-GO call (daylight, slope, pair rules, NASA space weather) and drag the departure along the daylight timeline.
- Switch to **Pair** to split the stops between two astronauts and check separation and line of sight.
- Open **Data layers** to see each NASA dataset and switch overlays.
- **Walk it at eye level** to rehearse the route, then open the printable **Field guide**.

## Repository

| Path | What |
| --- | --- |
| `index.html` | The app, built and self-contained |
| `web/` | App source: TypeScript, three.js, Vite; tests in `web/src/model.test.ts` and `web/tests/e2e.cjs` |
| `pipeline/` | Python scripts that fetch and prepare the NASA data |
| `data/` | Source data for the pipeline (terrain clip, stop lists, named sites) |
| `docs/` | Demo video, project description, data sources |

## Build and test

```bash
cd web && npm ci && npm test && npm run build && npm run e2e
```

`npm run build` writes `web/dist/index.html` and copies it to the repository root. `npm run dev` starts a development server. To rebuild the data (needs network access to NASA and USGS hosts):

```bash
python3 -m pip install -r pipeline/requirements.txt
python3 pipeline/clip_dem.py
python3 pipeline/fetch_reference.py
python3 pipeline/find_stops.py <cache-dir>
python3 pipeline/build_app_data.py <cache-dir>
python3 pipeline/fetch_globe.py
```

## AI assistance

The project concept, the framework and the decisions are our team's. We used Claude Code as an assistant for writing code and documents, and we reviewed what it produced. The demo video was assembled with Claude from real footage of the app and carries a visible AI-assisted watermark. No AI-generated images or audio are used in the app.

## Credits and licence

NASA/JPL-Caltech/University of Arizona (HiRISE); NASA/JPL-Caltech/MSSS (CTX); NASA/JPL-Caltech/Arizona State University (THEMIS); NASA/GSFC/MOLA Science Team (MOLA); USGS Astrogeology Science Center, Parker and Calef 2016 (Gale 1 m terrain model, including ESA Mars Express HRSC data); NASA/JPL-Caltech/SwRI (RAD); NASA/JPL-Caltech/CSIC-INTA (REMS); NASA/JPL-Caltech (Curiosity localization and Navcam); NASA DONKI, Community Coordinated Modeling Center (space weather); NASA Solar System Treks, JPL (Mars Trek). Full list in [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

Software: [three.js](https://threejs.org/) (MIT), Phosphor icons (MIT), B612, B612 Mono and Instrument Serif typefaces (Open Font License).

This project is not affiliated with or endorsed by NASA. Licence: Apache 2.0 ([LICENSE](LICENSE)); third-party licences in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
