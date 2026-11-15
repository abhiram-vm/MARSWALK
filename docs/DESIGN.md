# Design direction

How MARSWALK looks and behaves. A working example of everything here is `preview/index.html`.

This is the second direction. The first was a light "flight document" page with a static map. It was tidy but did not feel like a tool you would use on Mars. This version makes the terrain the interface.

## 1. Design read

Reading this as: a single-screen planning tool for a crew member and for judges who will give it a few minutes, in a dark, instrument-like language, built on our own CSS tokens with no component library.

It is a product interface, not a landing page. The landing-page guide the team chose says in its own scope note that it is not for product UI, so we take its universal rules (section 7) and leave its hero and section rules aside. The interface guide sets the direction.

## 2. The idea: the terrain is the interface

- The map fills the screen. Everything else floats over it and can be read at a glance.
- One committed dark look. A crew reads this in a dim habitat or through a visor; a bright page would be wrong for the setting.
- One accent, a safety orange, used for the chosen route, the active point and the main action. Green and red appear only for the go or no-go call, where they carry meaning.
- Depth comes from real data: relief shading computed from the terrain model, laid over the orbital image. No invented textures, glows or gradients.
- The thing people should remember: you click anywhere on Mars, and within a tenth of a second you have two routes, a go or no-go call and a guide for the walk.

## 3. Cinematic, but never slow

The team asked for more drama without losing speed. The rule we settled on: **motion only when it explains a change, and nothing moves while you are reading.**

| Moment | What moves | Why |
| --- | --- | --- |
| Opening | The camera eases from the whole site down to the route while the title fades | Shows where you are before showing detail |
| New route | The camera can refit to the route | Confirms the change |
| Rehearsal | A marker walks the route and the camera follows, with live distance, elevation, slope and time | Lets the crew see the walk before doing it |
| Field guide | Slides in from the right | State change |
| Buttons | Press down 1 px | Feedback |

How it stays fast:

- The map is one canvas. It redraws only when something changes; it does not run a loop while idle.
- Routing runs in a background worker, so the page never freezes. A new route across the 550,000-cell grid takes well under a tenth of a second on a laptop.
- Relief and slope layers are drawn once into off-screen images and reused.
- No blur effects over the map, no animation library, no scroll listeners.
- All motion is skipped when the device asks for reduced motion.

Measured in a headless test browser with software rendering: about 36 frames a second during the rehearsal camera move, the heaviest moment. A normal machine with graphics acceleration should do better; check on your own hardware.

## 4. Layout

```
+--------------------------------------------------------------------+
| MARSWALK  site                                          Prototype  |
| +-------------+ [readout during rehearsal]            [ layers ]   |
| | Walk        |                                       [ + - fit ]  |
| | GO / NO-GO  |                                                     |
| | Routes      |                 MAP                                 |
| | Elevation   |                                                     |
| | Rehearse    |                                        [ legend ]  |
| | Assumptions | [ hint: what a click does now ]                     |
| +-------------+                                                     |
+--------------------------------------------------------------------+
```

- **Left panel, in the order a person decides:** where from and to, whether to go, which route, what the ground does, then the actions.
- **Field guide** slides over the right side and can stay open while the map is used.
- **On a phone** the panel becomes a bottom sheet and the map keeps the top half.

## 5. Making it obvious to use

- There is always exactly one active point, start or destination, and it is outlined. A click on the map moves it. The hint line always says what a click will do.
- Named stations are one tap.
- A click on ground that is too steep moves to the nearest walkable ground and says so. If no route exists, the message names the slope limit and what to change.
- The go or no-go call is the largest thing in the panel, with the reasons listed under it.
- The elevation chart can be dragged; a marker on the map follows.
- Assumptions are sliders in one place. Change one and the routes recompute.

## 6. Tokens

| Token | Value | Use |
| --- | --- | --- |
| `paper` | `#0B0E10` | Behind the map |
| `surface` | `#14181B` | Panels |
| `raised` | `#1B2024` | Buttons and cards inside panels |
| `ink` | `#E8ECEA` | Text |
| `ink-2` | `#A2ABB0` | Secondary text |
| `rule` | `#2C3338` | Hairlines |
| `signal` | `#F26A3A` | The only accent |
| `go` / `nogo` | `#62C483` / `#EF6258` | The decision only |

- Corners are 2 px everywhere. No shadows.
- **Type:** B612 for the interface and B612 Mono for every number. Both were designed for aircraft cockpit displays. Self-hosted in the app.
- **Icons:** Phosphor, one weight.
- **Routes:** Direct is solid orange; Cautious is dashed off-white. They differ by line style as well as colour.
- **Slope:** pale yellow from 10 to 15 degrees, amber from 15 degrees to the limit, dark hatching above the limit.
- **Provenance marks** in the field guide differ by shape: solid for measured, outlined for derived, dashed for assumed, hatched for simulated.

## 7. Rules that always apply

1. No em-dashes or en-dashes in anything the user reads.
2. No invented numbers. Every figure comes from `DATA_SOURCES.md` or is marked assumed or simulated.
3. No decorative dots, version stamps, section numbers or fake telemetry.
4. Real imagery only, with real credits. No AI-generated pictures of Mars.
5. Plain labels. One label per action.
6. Every state has a message: computing, no route, point moved, outside the map.
7. Text passes contrast against its panel; routes and marks read against the image without relying on colour alone.

## 8. Check before each submission

- [ ] Click five different places on the map. Each gives two routes or a clear reason why not.
- [ ] Raise and lower each assumption. The call and the numbers change sensibly.
- [ ] Run the rehearsal to the end. Stop it halfway by touching the map.
- [ ] Open the field guide for both routes. Every figure has a mark.
- [ ] Try it at phone width.
- [ ] Turn on reduced motion. Nothing animates and everything still works.
- [ ] No dash characters in visible text. Every sentence reread by a person.
