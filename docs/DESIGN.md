# Design

How MARSWALK looks and behaves. The final app is `web/`; its build is `web/dist/index.html`.

## 1. Design read

Reading this as: a mission-planning tool that judges from NASA and industry will use for a few minutes and astronauts would use for an hour, in a dark, instrument-like language with one cinematic signature (walking the route at eye level), built on three.js and plain TypeScript with our own tokens.

Two guides shaped it. From the landing-page guide we keep the universal rules (section 7); its hero and section rules do not apply to a single-screen tool, as its own scope note says. The interface guide set the direction: commit to one idea and execute it precisely.

## 2. The idea

**Mars, at walking scale, before you walk it.**

- The terrain fills the screen. Panels float over it and never cover the route.
- The look is dark and quiet so the ground carries the colour. One accent, a safety orange, marks the chosen route, the destination and the main action. Green and red appear only for GO and NO-GO.
- Depth comes from data: shading baked from the terrain itself, real Mount Sharp on the horizon, the sun placed for the hour you leave. No invented textures, glows or gradients.
- The thing people remember: you press **Walk it at eye level** and you are standing on the boxwork, with the destination beacon ahead and a visor telling you the next steep stretch is 40 m away.

## 3. Cinematic, never slow

Rule: motion only when it explains a change, and nothing moves while you are reading.

| Moment | What moves | Why |
| --- | --- | --- |
| Opening | Title fades while the camera descends from above the crater to the route; panels settle in after | Where you are, then what you are doing |
| New route | The route draws itself from start to destination | Confirms the change and shows direction |
| Walk it | First person at 1.8 m, true scale; the sun moves with simulated time; pauses at each stop; in a pair the partner walks too | Rehearsal |
| Orbit | Short inertia after a drag | Feels physical; stops in under a second |

How it stays fast:

- **Renders on demand.** Idle, it uses no GPU time.
- **Adaptive resolution.** If frames take longer than about 26 ms the render scale steps down; it steps back up when there is room.
- **Cheap geometry.** About 275,000 triangles for the site (4 m spacing over the 2 m grid) and 125,000 for the 8 km context. Shading from the terrain is baked once at load, so the GPU does not compute it per frame.
- **One shadow-casting light.** In walk mode its shadow area shrinks to the 500 m around the walker, which sharpens shadows at no cost.
- **Routing in a worker,** so the screen never freezes.
- **No post-processing, no blur over the 3D view,** no animation library.
- **Reduced motion** skips the opening, camera easing, inertia and the route draw-in.

## 4. Layout

```
+--------------------------------------------------------------------------+
| MARSWALK | Boxwork unit, Mount Sharp      Weather sol | Layers | Guide   |
| +--------------+   [ hint ]                                     [ + ]    |
| | Walk         |                                                [ - ]    |
| |  start, dest |              3D VIEW                           [fit]    |
| |  stations    |          pins on stations,                     [ N ]    |
| | GO / NO-GO   |          beacons at start                               |
| |  3 figures   |          and destination                                |
| | Route        |                                                         |
| |  Direct      |                                                         |
| |  Cautious    |                                                +------+ |
| | Walk it      | +----------------------------------------+     | mini | |
| | Assumptions  | | Daylight: sunrise .. walk .. reserve    |     | map  | |
| +--------------+ +----------------------------------------+     +------+ |
+--------------------------------------------------------------------------+
```

- **Plan panel** in the order a person decides: who (Solo or Pair), where (an itinerary: start, numbered stops, back to start, with walking time per leg), whether, which, then act, then space weather and assumptions.
- **Itinerary:** the selected row is outlined in orange and a click on the ground moves it. Beacons can also be dragged. Add a stop, remove one, reverse the order, or press **Quickest order**. Stops are numbered the same way on the map, the mini-map, the 3D tags and in the guide. Four ready-made plans sit under it.
- **Pairs:** each stop has an A or B badge; click it to hand the stop to the other astronaut. A is orange, B is blue (`b` token), on the map, tags, timeline lanes and walk buttons. A pair section shows the furthest separation, the share of time in sight, and a bar of when they are out of sight or too far apart.
- **Hover readout:** over the ground, a small card gives the slope, whether it is walkable, the height against the start, and the site name if there is one.
- **Space weather card:** NASA's latest forecasts of solar storms reaching Mars, with a plain one-line status and when it was checked. It says "live from NASA" when the hosted page has refreshed it, "snapshot" otherwise.
- **Daylight timeline:** the walk is drawn as blocks (each leg, each stop, the way back) between sunrise and sunset, with the last hour of light hatched and the sun's height as a curve. Drag the block to change when you leave; the call and the shadows update as you drag.
- **Data layers drawer:** every dataset with its mission, instrument and resolution. Base layers are labelled Base; overlays have switches.
- **Science sites:** a drawer lists all 49 places Curiosity worked here, grouped into drill sites, named sites and other stops, each with its photo and an Add button. On the map, named and drill sites have labelled pins; other stops are small dots that appear when zoomed in. Pins never show through panels and hide rather than overlap.
- **Site cards** show the real Curiosity photo, what was done there, a link to the blog post for named sites, and Add as stop or Start here.
- **Mini-map** shows the whole planning area, both routes and where the camera is looking. Click it to look somewhere.
- **Field guide** opens as a light paper sheet over the dark app: the one deliberate change of surface, because it is the document a crew would carry.
- **Phones:** the plan becomes a bottom sheet, the timeline sits above it, the mini-map is hidden, and the camera frames the route in the visible half.

## 5. Making it obvious

- One active point, start or destination, always highlighted. The line under it says what a click will do.
- First visit: a three-step card (click the ground, read the call, walk it). It does not return once dismissed.
- Clicking steep ground moves to the nearest walkable cell and says so. No route: the message names the limit and where to change it. Outside the planning area: the message says the surroundings are context only.
- Every decision figure has its reason listed under it.
- Keyboard: arrow keys orbit (and look around while walking), plus and minus zoom, Escape leaves walk mode or closes the guide, Space pauses a walk.

## 6. Tokens

| Token | Value | Use |
| --- | --- | --- |
| `bg` | `#0B0D0E` | Behind everything |
| `panel` | `#0D0F11` at 90% | Panels |
| `line` | white at 9% | Hairlines |
| `ink` / `ink-2` / `ink-3` | `#EFEBE6` / `#A8A49F` / `#75716C` | Text levels |
| `signal` | `#F2662F` | The only accent |
| `go` / `nogo` | `#63C98A` / `#F06A5D` | The decision only |
| `amber` | `#F0A43A` | Steep-ground warnings while walking |
| `b` | `#5FB4FF` | Astronaut B in pair mode only |
| `paper` / `paper-ink` | `#F3EFE8` / `#1B1714` | Field guide |

- Corners 4 px; pills only for map pins and the hint line.
- **Type:** B612 for interface text and B612 Mono for every number. Both were designed for aircraft cockpit displays. Self-hosted inside the build.
- **Icons:** Phosphor, bold weight, one family.
- **Routes:** Direct is solid orange with direction chevrons; Cautious is dashed off-white. They differ by line style as well as colour. In a pair only the chosen profile is drawn, one line per astronaut. While walking, the path is drawn only ahead of you, fades out at your feet, and your partner's is fainter than yours.
- **Slope layer:** pale yellow 10 to 15 degrees, amber 15 degrees to the limit, dark hatching above the limit.
- **Thermal layer:** a perceptual ramp from dark violet (cool at night) to pale yellow (warm at night), stretched between the 2nd and 98th percentiles.
- **Provenance marks** differ by shape: solid measured, outlined derived, dashed assumed, hatched simulated.

## 7. Rules that always apply

1. No em-dashes or en-dashes in anything the user reads.
2. No invented numbers. Every figure comes from DATA_SOURCES.md or is marked assumed or simulated.
3. Real imagery only, with real credits. The Mars colour is a tint on greyscale images and is labelled as one.
4. No decorative dots, version stamps, fake telemetry or scroll cues.
5. Plain labels. One label per action.
6. Every state has a message: loading, computing, no route, point moved, outside the area, no 3D support.
7. Text passes contrast on its surface; routes and marks never rely on colour alone.

## 8. Check before each submission

- [ ] Open `web/dist/index.html` on the demo laptop. The descent is smooth.
- [ ] `npm test` and `npm run e2e` pass.
- [ ] Click five places. Each gives two routes or a clear reason why not.
- [ ] Add a stop, drag it, remove it, reverse the stops, press Quickest order.
- [ ] Switch to Pair; swap a stop between A and B; load the pair plan; walk as B and find A.
- [ ] Drag the daylight block to late afternoon: the call turns NO-GO and the shadows lengthen.
- [ ] Turn each layer on and off.
- [ ] Open the science sites list and a site card; Add works.
- [ ] Walk it to the end; the arrival photo appears. Stop a walk halfway with Escape.
- [ ] Open the field guide for both routes; every figure has a mark.
- [ ] Phone width: the route is visible above the sheet.
- [ ] Reduced motion on: nothing animates, everything works.
- [ ] Every sentence reread by a person.

## 9. What was tested, and what was not

In the build environment, at desktop (1440 by 880) and phone (390 by 844) sizes:

- Loads in about 3 seconds from disk, with no errors.
- The route engine matches a brute-force reference solver on random terrain (AUDIT.md section 5).
- A click-to-route takes about 0.15 to 0.25 seconds, including the worker round trip.
- Layers, science sites, pairs, quickest order, dragging, hover, timeline, walk (speeds, seeking, stops), guide and reduced motion all work (32 browser checks).

That environment has no graphics card; it renders in software, so frame rates there say nothing about real hardware. **Run the check in section 8 on your own laptops.**

## 10. Earlier directions

- `preview/index.html`: 2D planner. Clear, but did not feel like Mars.
- `preview/cinematic.html`: first 3D version. The team preferred it; the final app keeps its idea and rebuilds the interface, adds the surroundings, stations with photos, the daylight timeline, layers, the mini-map and the paper field guide.
