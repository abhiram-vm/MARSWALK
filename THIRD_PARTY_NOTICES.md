# Licences

MARSWALK's own code and documents are licensed under the Apache License 2.0 (`LICENSE`), the licence NASA Space Apps applies to submissions that do not name another one.

## Software included in the app

| Component | Licence | Use |
| --- | --- | --- |
| [three.js](https://threejs.org/) | MIT | 3D rendering (bundled in the app; r149 also in `preview/vendor/`) |
| [Phosphor Icons](https://phosphoricons.com/) | MIT | Interface icons, pre-rendered into `web/src/icons.ts` |
| [B612 and B612 Mono](https://github.com/polarsys/b612) via Fontsource | SIL Open Font License 1.1 | Typefaces, embedded in the build |

Build and test tools, not shipped in the app: Vite (MIT), vite-plugin-singlefile (MIT), TypeScript (Apache 2.0), Vitest (MIT), oxlint (MIT).

## Data

| Data | Source | Terms |
| --- | --- | --- |
| HiRISE and CTX images, via NASA Mars Trek | NASA/JPL-Caltech/University of Arizona; NASA/JPL-Caltech/MSSS | NASA imagery, generally not subject to copyright in the United States; credit given as requested |
| THEMIS night infrared | NASA/JPL-Caltech/Arizona State University | As above |
| Mars MSL Gale Merged DEM 1m | USGS Astrogeology Science Center (Parker and Calef, 2016) | US Government work, public domain |
| Curiosity weather, waypoints, radiation figures and Navcam images | NASA/JPL-Caltech (REMS: NASA/JPL-Caltech/CSIC-INTA; RAD: NASA/JPL-Caltech/SwRI) | NASA data and imagery; credit given |
| Space weather (WSA-ENLIL runs, SEP events) | NASA DONKI, Community Coordinated Modeling Center | NASA data |

Full provenance is in `docs/DATA_SOURCES.md`. MARSWALK is not affiliated with or endorsed by NASA and uses no NASA logos or insignia.
