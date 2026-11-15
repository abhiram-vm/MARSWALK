# Audit

Carried out 2026-11-15 on the app, the planning engine and the data pipeline, before submission. AI-assisted (Claude Code); every finding below has its evidence and was rechecked after the fix.

## 1. How MARSWALK is built

MARSWALK is a website: a static web app that runs entirely in the browser from one `index.html` file. There is no server.

| Part | Language and tools | Where |
| --- | --- | --- |
| Interface and app logic | TypeScript (compiled to JavaScript), HTML, CSS | `web/src/main.ts`, `style.css` |
| 3D view | three.js (WebGL) | `web/src/world.ts` |
| Planning engine | TypeScript, runs in the browser and in a Web Worker | `web/src/model.ts`, `routing.worker.ts` |
| Tests | Vitest (engine), Playwright (whole app in a browser) | `web/src/model.test.ts`, `web/tests/e2e.cjs` |
| Data pipeline | Python (numpy, rasterio, Pillow) | `pipeline/` |
| Build | Vite, into one self-contained file | `web/dist/index.html`, copied to `/index.html` |

"Backend" in this report means the planning engine and the data pipeline.

## 2. Challenge and rules compliance

Official pages re-read on 2026-11-15. The challenge page was last published 2026-11-13; its five resources are unchanged.

### The challenge

| Requirement (official wording) | Status | Evidence |
| --- | --- | --- |
| "a layered, integrated view" | Met | Data layers drawer; layers share one 3D frame; routes computed from the terrain |
| "of a location or route on the Martian surface" | Met | Boxwork unit, Gale crater, plus 8 km of context |
| "data from multiple NASA science missions" | Met | MRO, Mars Odyssey, Curiosity, MGS (terrain reference); also ESA Mars Express in the terrain model |
| "help a human explorer plan and carry out a successful Marswalk" | Met | Multi-stop routing, go or no-go, daylight timeline, eye-level walk, field guide with turn-back times |
| "while conducting new and exciting science" | Met | Stops are Curiosity's 2025 drill sites; objective and real photos in the guide |
| Suggested: three or more data types | Met | Optical, topographic, thermal, radiation, atmospheric, surface imagery, space weather |
| Suggested: safety, radiation, space weather | Met | Slope limit, daylight reserve, turn-back rule, dose, NASA solar storm forecasts for Mars |
| Suggested: suit and load | Met | Adjustable speed factor, default sourced from NASA Apollo planning |
| Suggested: route avoiding large obstacles | Met, with a stated limit | Ground over the slope limit is avoided; rocks under about 1 m are not in the terrain |

### Submission rules

| Rule | Status | Note |
| --- | --- | --- |
| Use at least one NASA data or resource | Met | Many; listed in the guide and DATA_SOURCES.md |
| Original content open source (Apache 2.0 by default) | **Fixed in this audit** | There was no licence. Added `LICENSE` (Apache 2.0) and `THIRD_PARTY_NOTICES.md` |
| Third-party licences identified in the documentation | **Fixed in this audit** | `THIRD_PARTY_NOTICES.md` |
| Links public, with no login | **Team action** | The repository is private. Make it public, then enable GitHub Pages |
| Demo: at most 30 seconds or seven slides | **Team action** | Not made yet |
| English throughout | Met | |
| No one under 18 shown | Met | No people appear |
| No NASA logos or insignia in AI-generated content | Met | No logos at all; no AI-generated images |
| AI use disclosed | Met | README and PLAN section 11 |
| Submit before Sunday 11:59 p.m. local event time | **Team action** | |

## 3. Findings

Severity: **High** changes what the app tells a crew; **Medium** affects accuracy or robustness; **Low** affects polish or process.

| # | Severity | Finding | Evidence | Status |
| --- | --- | --- | --- | --- |
| A1 | High | **Sun position was about 49 minutes off.** Clock times are local mean solar time, but the sun was computed as if they were true solar time. At "09:00" the sun was drawn where it would be at about 09:49 local true solar time, about 12° too high. Shadows and the "sun at departure" figure were wrong. | NASA's Mars24 method gives an equation of time of -49.4 min for the weather record's date. With it, the model's sunrise and sunset match Curiosity's measured 06:46 and 18:51 to within a minute. | Fixed. Pipeline computes Mars24 values; engine uses them; a test checks sunrise and sunset against the weather station |
| A2 | High | **The return walk was assumed, not planned.** The time back was the outbound path walked in reverse, and there was only one destination. | Code review | Fixed. Walks now have up to four stops and a separately routed return leg |
| A3 | High | **Routes could exceed the slope limit by a fraction of a degree.** The straightening step sampled each new straight line every quarter cell and could miss a steep cell's corner. | Seen in a screenshot: "Steepest ground 21°, inside the 20° limit" | Fixed with exact cell traversal (Amanatides and Woo). Tests assert no sample exceeds the limit; the check can now fail and turn the call to NO-GO |
| A4 | Medium | **Diagonal steps could cut between two blocked cells**, squeezing a route through the corner of a ridge. | Unit test on a 3 by 3 grid | Fixed and tested |
| A5 | Medium | **Distances were inflated by the grid's zig-zag**, by up to about 8% on diagonal stretches. | Geometry of 8-connected grids | Fixed: routes are straightened without crossing steeper ground, then measured along the line. Tests confirm a route never gets longer or steeper |
| A6 | Medium | **Radiation dose used the wrong day length.** The rate is per Earth day; the code divided by a Mars day. Dose was low by 2.7%. | NASA's RAD page plots "micrograys per day" over months; SwRI and NASA releases give 0.67 mSv per day | Fixed and tested |
| A7 | Medium | **The radiation figure was unverified.** | NASA page confirms about 210 µGy per day absorbed (August 2012 to June 2013); SwRI and NASA releases give 0.67 mSv per day dose equivalent | Verified as far as the hosts reachable allow. The paper itself (Science 343) is behind a captcha here |
| A8 | Medium | **The walking-speed default was an assumption without a source.** | Los Alamos report LA-UR-89-3858 on Apollo surface operations: NASA estimated 2.5 km/h for sustained suited walking, 3.6 km/h for up to an hour; Apollo 14's uphill average was about 1.7 km/h | Now sourced. The default gives 2.5 km/h on flat ground and about 1.4 km/h up a 10° slope. Lunar gravity differs; stated as a limit |
| A9 | Medium | **No space weather data,** although the brief names it. | Brief, Tier B | Added: NASA DONKI WSA-ENLIL forecasts of solar storm arrivals at Mars and recent SEP events; snapshot in the build, live refresh when hosted; a caution in the decision within a day of a modelled arrival |
| A10 | Medium | **No recovery if the GPU resets** (laptop sleep, driver reset). The view would freeze. | Code review | Fixed: the app shows a message and a reload button |
| A11 | Low | Overlapping stop labels when two stops are close (S1 and S2 are 10 m apart). | Screenshot | Fixed: labels stack |
| A12 | Low | Direction chevrons on the route pointed backwards. | Screenshot | Fixed |
| A13 | Low | npm install failed with an internal error caused by an optional test add-on. | npm log | Fixed with `web/.npmrc` (`legacy-peer-deps`) |
| A14 | Low | No automated tests. | | Added 17 engine tests and a 21-check browser test |

A bug introduced and caught during this audit: a shortcut in the route search compared costs stored in 32-bit floats, so rounding could discard a valid route. The Dijkstra comparison test caught it before it shipped; costs are now stored at full precision.

## 4. Data checks

| Check | Result |
| --- | --- |
| HiRISE image against the terrain | Aligned within one 2 m cell: a clear correlation peak within 3 m of zero offset |
| CTX image against the context terrain | Inconclusive at 16 m (correlation near zero; CTX brightness tracks dust and rock, not relief). Same placement method as the HiRISE image, which did verify. Context only |
| Station photos | All three Navcam frames were taken at exactly the rover position (site and drive number) recorded for their station |
| Station elevations | The rover's published elevations come from the same terrain model, so they confirm placement but cannot validate the model |
| Season | Mars24 gives Ls 341.6 for the weather record's date; the record says 341 |
| Elevation packing | 1 cm steps on the site, 10 cm on the context ring |

## 5. Tests

```bash
cd web && npm test
```

17 tests: route search against brute-force Dijkstra on 25 random terrains (both profiles), the slope limit, corner cutting, straightening, distance and time on known terrain, uphill against downhill, stop time, dose units, Mars and Earth minutes, the daylight reserve, sunrise and sunset against Curiosity's weather station, leg classification, space weather timing.

```bash
cd web && npm run build && npm run e2e
```

21 browser checks: load, default walk, itinerary, click-to-route, removing a stop, late departure turning NO-GO, layers, space weather, station card, walk to the last stop, Escape, field guide content, no em or en dashes, no page errors, phone layout, reduced motion.

## 6. Not verified

- **Frame rate on real hardware.** The build environment renders in software; test on the demo laptops.
- **The live space-weather refresh** from a hosted copy. It works through the NASA API, which allows browser requests from any site, but it uses NASA's shared demo key (about 10 requests an hour per address). If it fails the snapshot stays.
- **The radiation paper itself.** Figures are from NASA and SwRI pages about it.
