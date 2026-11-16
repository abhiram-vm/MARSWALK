# Plan: the cinematic story site

Status: built in the beta (`beta/index.html`, `web/src/story.ts`), 2026-11-16. What shipped differs from the plan below in these ways:

- All nine chapters (0 to 8) are in, in one page with the planner. A first visit opens the story; `#plan` links and returning visitors go straight to the planner; the planner's **Story** button reopens it.
- Chapters 0 and 1 draw a globe from the Viking colour mosaic (NASA and USGS, via Mars Trek, `pipeline/fetch_globe.py`), with a dusty atmosphere, stars, drifting dust and a marker on Gale. Global relief (MOLA) was not added.
- Chapters 2 to 8 use the planner's own terrain and camera. Effects: contour lines every 10 m (brighter every 50 m) that spread outward, a scan line that sweeps the slope layer and then night temperature across the ground, Curiosity's track drawing itself, and the route drawing in. Chapter 7 switches to the pair plan.
- Display face: Instrument Serif (OFL) for chapter titles; B612 for everything else.
- Not built: astronaut figures in chapter 7 and a separate loader animation (the planner's loader is reused).

A scroll-driven 3D story that explains MARSWALK in about a minute and then hands the visitor to the planner. Judges see the story first, so it has to make the problem and the data obvious, look exceptional, and never stutter.

## 1. What it must do

1. Explain, in order: where this is, why it matters, what data it uses, what the planner decides, and that two astronauts can plan together.
2. Lead into the planner with one clear action, and let anyone skip straight to it at any moment.
3. Let people switch between the story and the planner at any time, both ways, without reloading data.
4. Run smoothly on a mid-range laptop and a recent phone; degrade gracefully below that.
5. Follow the same rules as the app (DESIGN.md section 7): real data only, credited, no invented numbers, no em or en dashes.

## 2. References to study

Sites the team should open and take notes on before designing. Check any award a site is said to have won before mentioning it anywhere public.

| Site | What to learn from it |
| --- | --- |
| Igloo Inc (igloo.inc) | One continuous 3D scene that scroll moves through; restrained typography over it |
| Lusion (lusion.co) | Shader-driven transitions, soft particles, how little UI a 3D page needs |
| Messenger by Abeto (messenger.abeto.co) | A tiny planet you explore; warmth and character from simple shapes |
| Bruno Simon's portfolio (bruno-simon.com) | Making a 3D scene playable; loading and performance tricks |
| NASA's Eyes on the Solar System (eyes.nasa.gov) | Real data, real scale, honest labels: the tone a NASA judge expects |
| Apple product pages (for example the AirPods or iPhone pages) | Scroll-scrubbed sequences, pacing, one idea per screen |

What we take: one continuous camera move instead of separate slides, big quiet type, motion that explains rather than decorates, and a loader that is part of the show.

## 3. The story, chapter by chapter

One scene, one camera. Scrolling moves the camera along a path; each chapter is a stop on that path with a short headline and one line of text. A thin chapter rail on the right shows where you are and lets you jump.

| # | Camera | On screen | Data shown |
| --- | --- | --- | --- |
| 0 | Black, then Mars resolves out of dust particles | "MARSWALK" and a single line: *The first people on Mars will need a map of the next five hundred metres.* | |
| 1 | Whole planet, slowly turning to Gale crater | "Gale crater. 4.8° south. Curiosity has been here since 2012." | A global Mars colour mosaic and MOLA relief |
| 2 | Down into the crater, Mount Sharp rising | "Mount Sharp. 5 km of layered rock, read like pages." | CTX image on the 8 km terrain we already ship |
| 3 | Low over the boxwork ridges | "The boxwork. Ridges that resisted erosion, hollows that did not. Nobody knows why." | HiRISE image on the 2 m terrain |
| 4 | Same view; data layers sweep across as scan lines | "Three missions, five kinds of data." Slope, night temperature, Curiosity's path, one after another | HiRISE, THEMIS, MSL track, labelled with mission and instrument |
| 5 | Curiosity's track draws itself; photos rise from the 49 sites | "Curiosity stopped 49 times here. Every stop is a place a person could walk to." | Navcam photos, site names from the mission blog |
| 6 | Two routes draw across the ridges; GO card appears | "MARSWALK finds the way, times it against the daylight, and makes the call." | A real route from the engine, real numbers |
| 7 | Two astronaut figures split up and walk | "Two astronauts. Never too far apart, never out of sight for long." | Pair check on the default pair plan |
| 8 | Camera settles into the planner's opening view | Button: **Plan a walk** | The planner fades its panels in around the same scene |

The last chapter is the handoff: the planner starts from exactly where the story's camera ends, so there is no cut.

## 4. Look and shaders

All effects are small custom shaders; no post-processing stack.

- **Dust in, dust out.** Instanced points with curl-noise motion form the planet on load and drift through the low-altitude chapters. About 20,000 points on desktop, 6,000 on phones.
- **Atmosphere.** A Fresnel rim on the globe with Mars's butterscotch sky colour at the limb and a thin blue hint on the night side (Mars sunsets are blue).
- **Topographic lines.** On the terrain, animated contour lines computed in the fragment shader from height, sweeping in during chapter 2. They say "this is real terrain data" at a glance.
- **Data scan.** In chapter 4 a soft-edged band sweeps across the ground; behind it the layer changes (image, slope, thermal). One uniform drives it from scroll.
- **Route draw.** The existing ribbon shader's reveal uniform, driven by scroll.
- **Grain and vignette** as a CSS overlay (a tiny noise PNG), so it costs no GPU time.

Type: keep B612 and B612 Mono for continuity with the planner, plus one display face for the big headlines (to choose: a condensed grotesk or an editorial serif; try both on chapter 1 and pick). Colour: the planner's tokens, with the orange accent used once per chapter at most.

## 5. How it is built

- **Same app, two modes.** The story and the planner share one page, one renderer and the terrain already loaded. Mode is in the URL (`#story` and `#plan`) so links and the back button work. This is what makes the handoff seamless and the switch instant.
- **Code layout.** A new `web/src/story/` folder: `story.ts` (chapters, scroll, camera path), `globe.ts` (planet, atmosphere), `dust.ts` (particles), `shaders/` (contour, scan). `main.ts` decides the mode at start.
- **Scroll.** Native scrolling over a tall spacer, read with one passive listener and smoothed in the render loop (no scroll library). Camera position comes from a Catmull-Rom curve through chapter keyframes.
- **Loading order.** Story assets first: a 2k global Mars mosaic and a low-resolution relief (both from NASA Mars Trek, about 1 MB together), then the existing site data in the background while the visitor reads chapters 0 to 2. The planner is ready by the time anyone reaches the end.
- **Data needed.** Global colour mosaic and global MOLA relief at low resolution, fetched by the pipeline like the other Trek layers and credited the same way.
- **Single file.** The build stays one self-contained `index.html`. Expected size after adding the globe textures: about 8 MB.

## 6. Switching between the two

- The story always shows **Skip to the planner** in the top corner.
- The planner's top bar gets a **Story** button. It keeps the current plan; returning to the planner restores it.
- First visit opens the story; a returning visitor (remembered locally) opens the planner, with the Story button there if they want it.
- Keyboard: arrow keys and Page Down step through chapters; Escape skips to the planner.

## 7. Performance budget

| Item | Desktop | Phone |
| --- | --- | --- |
| Frame time | under 12 ms on integrated graphics | under 20 ms |
| Particles | 20,000 | 6,000 |
| Render scale | adaptive, as in the planner | starts at 1.25× |
| First headline visible | under 1.5 s on broadband | under 3 s |

- Only one heavy scene is drawn at a time; the globe is removed once the camera is inside the crater.
- Rendering stops when the tab is hidden and when scrolling has settled.
- **Reduced motion:** chapters become still frames with a cross-fade; no particles, no camera flight.
- **Low-end fallback:** if the first frames are slow, drop particles and the contour shader, and keep the story.

## 8. Accessibility

- Every chapter's text is real text in the page, in order, readable by a screen reader without the 3D.
- Headlines pass contrast over the scene (a soft scrim behind text where the terrain is bright).
- The skip link is the first focusable element.

## 9. Order of work

1. Mode switching and URL handling with a placeholder story (one screen and a button). Proves the handoff and the Story button.
2. Camera path and scroll with chapters 2, 3 and 8, using the terrain we already have.
3. Globe, atmosphere, and the descent (chapters 1 and 2). Pipeline fetches the global layers.
4. Data scan and route draw (chapters 4 and 6).
5. Curiosity's track and photos (chapter 5), astronauts (chapter 7).
6. Dust and the loader (chapter 0).
7. Type, copy pass with the team, reduced-motion stills, phone layout.
8. Performance pass on the team's laptops and phones; browser test for the story and the switch.

Steps 1 and 2 give a working, shippable story on their own; everything after improves it.

## 10. Risks

| Risk | Answer |
| --- | --- |
| Looks impressive but explains nothing | Each chapter has one sentence and one piece of data; the team rewrites the copy in its own words |
| Slow on judges' machines | Budget above, adaptive scale, low-end fallback, tested on real devices |
| Story hides the actual tool | Skip link everywhere; returning visitors land in the planner |
| Build grows too large | Globe textures capped at about 1 MB; photos already compressed |
| Time | Steps 1 and 2 are the minimum; stop wherever time runs out |
