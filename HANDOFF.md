# Hand-off

Everything a person or an AI agent needs to pick up this project. Read this first, then README.md.

## What it is

A web app for NASA Space Apps 2026, challenge "Interplanetary Survival Guide: Martian Map". It plans a walk for astronauts across the boxwork ridges on Mount Sharp, Mars, using real NASA data: routes under a slope limit, a GO or NO-GO call (daylight, slope, space weather, pair rules), a first-person walk, and a printable field guide. A scroll story introduces it.

Working name: MARSWALK (the team plans to rename it; see "Renaming").

## Where things are

| Path | What |
| --- | --- |
| `index.html` | Released build. One self-contained file; open it in a browser. |
| `beta/index.html` | Beta build: latest code, marked BETA. |
| `web/` | The app: TypeScript, three.js, Vite. `src/main.ts` (UI and state), `world.ts` (3D), `model.ts` (route engine, tested), `story.ts` (story), `astronaut.ts`, `data.ts`, `routing.worker.ts`, `style.css`, `brand.ts` (name) |
| `web/tests/e2e.cjs` | Browser test (Playwright) |
| `web/src/model.test.ts` | Engine tests (Vitest) |
| `pipeline/` | Python scripts that fetch and prepare NASA data into `web/src/data/` |
| `data/` | Committed source data (terrain clip, stop lists, named sites) |
| `docs/` | PLAN, CHALLENGE_BRIEF, DATA_SOURCES, DESIGN, AUDIT, SUBMISSION, LANDING_PLAN; `history/CHAT.md` is the full build conversation |
| `CHANGELOG.md` | What changed, newest first |
| `preview/` | Early prototypes, kept for reference |

## Commands

From `web/` (Node 20 or later):

```bash
npm install
npm test                    # engine tests
npm run dev                 # local dev server
npm run build:beta          # writes ../beta/index.html
E2E_BETA=1 npm run e2e      # browser test of the beta (needs Playwright with Chromium)
npm run build               # writes ../index.html: this RELEASES the current code
npm run e2e                 # browser test of the release build
```

Data (only if it needs rebuilding; outputs are committed). From the repository root, Python 3 with `pipeline/requirements.txt`:

```bash
python3 pipeline/clip_dem.py
python3 pipeline/fetch_reference.py
python3 pipeline/find_stops.py <cache-dir>
python3 pipeline/build_app_data.py <cache-dir>
python3 pipeline/fetch_globe.py
```

Network hosts used: `asc-pds-services.s3.us-west-2.amazonaws.com` (USGS terrain), `trek.nasa.gov` (images), `mars.nasa.gov` (Curiosity waypoints, raw images, weather), `api.nasa.gov` (DONKI space weather). The planning area is set once in `pipeline/aoi.py`.

## Released and beta

- `index.html` is what the team has signed off. `beta/index.html` is for testing new features.
- The source on `main` is always the beta. Running `npm run build` releases it, so only do that when the beta is approved; then run `npm run e2e` and commit `index.html`.
- Current state: the beta has everything in CHANGELOG "Unreleased"; the release is at commit `857e8bd`.

## Renaming

1. Change `VITE_APP_NAME` in `web/.env`. That sets the page title, loader, top bar and story. Rebuild.
2. Find the old name in the docs and the repository name: `grep -rn "MARSWALK" --include=*.md .` and replace as wanted. Comments in code also mention it; they do not affect the app.
3. Local storage keys start with `mw-`; leave them, or change them all together in `main.ts` and `world.ts` (users would lose saved preferences, nothing else).

## Rules the project follows

- No em or en dashes in anything a user reads (the browser test checks).
- No invented numbers: every figure comes from `docs/DATA_SOURCES.md` or is labelled assumed or simulated.
- Real imagery with credits; the Mars colour is a tint and labelled as one.
- AI use is disclosed briefly and truthfully (PLAN.md section 11). Source files say "AI-assisted (Claude Code)".
- Commit messages from AI sessions end with the co-author line used in the history.

## Status and open work

Done: see CHANGELOG. Not done, roughly in priority order:

1. **Team review of the beta**, then release it (`npm run build`).
2. **Real-device performance check** on the team's laptops and phones (DESIGN.md section 8). The build environment renders in software, so frame rates there say little. The beta is about 15 MB; consider smaller site terrain or photos if loading is slow.
3. **Demo** (seven slides or 30 seconds of video) and the **submission form**: docs/SUBMISSION.md. Deadline and rules are there.
4. **Public hosting**: make the repository public and turn on GitHub Pages from the main branch root.
5. Rewrite the story text and the summary in the team's own words.
6. Ideas not built: astronaut figures in the story's pair chapter, MOLA relief on the globe, drill-sample chemistry notes at stations.

## Decisions already made

- Website, single self-contained HTML file, three.js 3D (the team chose 3D over the 2D preview).
- One real site (the boxwork unit), not a planner for any point on Mars.
- Commits go straight to `main`. Team of two or three, 48-hour weekend.
- New features go to the beta first.
