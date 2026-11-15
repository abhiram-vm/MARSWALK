# Design direction

How MARSWALK should look and read. Applies two design guides the team chose: an anti-template landing-page guide ("taste") and a distinctive-interface guide ("frontend design"). Tokens in this file are already live in `web/src/index.css`.

## 1. Where each guide applies

The taste guide says in its own scope note that it is for landing pages and not for dashboards or dense product UI. MARSWALK is mostly a map tool. So:

| Surface | Governed by |
| --- | --- |
| Landing view (what a judge sees first) | Taste guide in full: hero rules, section rules, pre-flight check |
| Field briefing card | Taste guide for copy, type, colour and contrast; frontend-design guide for the concept |
| Demo slides | Same tokens, type and copy rules as the landing view |
| Map tool (map, layer panel, route comparison) | Frontend-design guide for direction; from the taste guide only the universal rules in section 7 |

A working example of everything below is in `preview/index.html`.

## 2. Design read

Reading this as: a mission-planning tool with a short landing view, for judges from NASA and industry who will give it a few minutes, in a utilitarian flight-document language, built on our own CSS tokens with Tailwind v4 utilities and no component library.

## 3. The direction: a flight document, not a sci-fi console

Most space-hackathon interfaces are dark navy with glowing cyan panels. MARSWALK goes the other way. It looks like something a crew would be issued: a printed traverse map and a checklist page.

- **Tone:** industrial and utilitarian. Flat surfaces, hairline rules, sharp corners, numbers set in a fixed-width face.
- **Light by default.** Cool paper and ink around greyscale orbital imagery, with a dark "night operations" variant that follows the system setting.
- **One accent:** a safety orange in the family of the orange crew suits worn for launch and entry, so the route is the loudest thing on screen.
- **The thing people should remember:** the field card. Every number on it carries a small provenance mark that says whether it was measured, derived, assumed or simulated.

What we deliberately leave out: glows, gradients, glass panels, purple or cyan, custom cursors, decorative grid lines, animated counters, fake telemetry.

## 4. Dials

| Surface | Variance | Motion | Density | Why |
| --- | --- | --- | --- | --- |
| Landing view | 6 | 4 | 4 | Asymmetric but calm; judges should read, not watch |
| Map tool | 3 | 3 | 7 | A working instrument: rigid grid, almost no motion, tight data |
| Field card | 4 | 2 | 7 | A printed page |

The guide's baseline is 8 / 6 / 4. We lower all three because the audience is evaluating a safety tool and the build window is short. Motion we cannot finish properly would count against us.

## 5. Tokens

Theme strategy: CSS variables, switched by `prefers-color-scheme`. One strategy, set once at the root.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `paper` | `#F2F4F3` | `#0F1214` | Page background |
| `surface` | `#FAFBFA` | `#171B1E` | Panels, header, card |
| `ink` | `#14181B` | `#E8ECEA` | Text |
| `ink-2` | `#4A5258` | `#A2ABB0` | Secondary text, units, credits |
| `rule` | `#C8CDD0` | `#2B3237` | Hairlines and borders |
| `signal` | `#C8401A` | `#F26A3A` | The only accent |
| `on-signal` | `#FAFBFA` | `#0F1214` | Text on a signal-coloured button |

Measured contrast ratios (WCAG AA needs 4.5 for body text):

| Pair | Light | Dark |
| --- | --- | --- |
| ink on paper | 16.2 | 15.8 |
| ink-2 on paper | 7.2 | 8.1 |
| signal on paper | 4.5 | 6.2 |
| on-signal on signal (buttons) | 4.8 | 6.2 |

Rules:

- **Colour lock.** `signal` is the only accent anywhere in the interface, the card and the slides.
- **No pure black or white.** The values above are the extremes.
- **Shape lock.** Every corner is 2 px. No pills, no rounded cards.
- **No shadows.** Separation comes from hairlines and the paper and surface steps.

### Marks on the map

The imagery is greyscale in both themes, so map marks use fixed values and do not switch with the theme.

| Mark | Style |
| --- | --- |
| Direct route | Solid `#F26A3A`, 4 px, with a 1 px dark casing |
| Cautious route | Dashed off-white `#FAFBFA`, 4 px, with a dark casing. Told apart by line style as well as colour. |
| Curiosity track | Thin off-white line, 2 px |
| Science station | Orange disc with a dark ring |
| Start point | Off-white disc with a dark ring |
| Area boundary | 1 px dashed orange |

Slope hazard is data, not interface, so it gets its own ramp and stays off the accent: no tint under 10 degrees, pale yellow from 10 to 15, amber from 15 to 20, and a dark diagonal hatch for blocked ground over the slope limit. The hatch means blocked cells read without relying on colour.

## 6. Type

| Role | Face | Notes |
| --- | --- | --- |
| Interface and headings | B612, 400 and 700 | Designed for aircraft cockpit displays, for legibility on screens under workload. Open Font License. |
| Every number, coordinate, unit and credit | B612 Mono | Fixed width so columns of figures line up |

- Self-hosted through the `@fontsource/b612` and `@fontsource/b612-mono` packages. No font CDN links.
- No serif anywhere. Emphasis inside a headline uses bold of the same face.
- Wordmark: `MARSWALK` in B612 bold with wide letter spacing. It is plain type, not a logo, and it does not imitate any NASA mark.
- Headlines stay modest: 36 to 48 px on the landing view. Hierarchy comes from weight and the ink and ink-2 steps.
- Icons: Phosphor (`@phosphor-icons/react`) only, one weight throughout. No hand-drawn SVG icons, no emoji.

## 7. Rules that apply everywhere, including the map tool

1. No em-dashes or en-dashes in anything the user reads. Use a full stop, a comma or a hyphen.
2. No invented numbers. Every figure comes from `DATA_SOURCES.md` or is labelled as assumed or simulated. This is the same rule as the plan's honesty rules, and it is also a design rule.
3. No decorative status dots, version stamps, section numbers, scroll cues, or labels laid over images.
4. No fake screenshots built from boxes. The product preview on the landing view is the real map.
5. Image credits are real credits for real images, written plainly below the image.
6. Plain labels. "Route comparison", "Limits", "Sources". No mock-poetic headings.
7. One label per action. The entry action is "Plan a walk" wherever it appears.
8. Button text fits on one line and passes contrast in both themes.
9. Loading, empty and error states exist for the map tiles, the route computation and the photos. A route that cannot be found says why (blocked by the slope limit) and what to change.
10. Honour `prefers-reduced-motion`. No `scroll` event listeners.

## 8. Layout

### Landing view (time-boxed to two hours; cut to the hero alone if short)

- **Hero, fits one viewport.** Left: headline of at most two lines, one sentence of at most 20 words, one button ("Plan a walk"). Right: the live map of the boxwork with the two default routes drawn. At most four text elements. No small label above the headline, no tagline under the button.
- **Three short sections below, each a different layout:** the place (one HiRISE crop beside one Curiosity photo, with credits), the layers (four missions as a compact grid with each instrument's real resolution), the limits (a plain stacked list of what the tool does not know).
- No logo wall, no testimonials, no pricing. They do not apply.
- Navigation: wordmark, "Plan a walk", "Sources". One line, 56 px tall.
- Below 768 px everything stacks in a single column, text first.

Draft hero copy for the team to rewrite: headline "Plan the next five hundred metres on Mars." Sentence: "Two routes across the boxwork ridges of Mount Sharp, computed from NASA terrain data, with every number sourced."

### Map tool

```
+----------------------------------------------------------------+
| MARSWALK   site line (mono)                      theme, sources |  56 px
+------------------+---------------------------------------------+
| Plan             |                                             |
|  start, station  |                                             |
| Routes           |                 MAP                         |
|  Direct          |                                             |
|  Cautious        |                                   layers    |
| Conditions       |                                             |
| Radiation        +---------------------------------------------+
| [Open briefing]  |  elevation profile (if built)               |
+------------------+---------------------------------------------+
   320 px rail          fluid
```

- The rail is a single surface divided by hairlines, not a stack of cards.
- Route comparison is two columns of figures in mono with the units in `ink-2`. No bar charts with filled tracks.
- The selected route's column gets a 2 px signal-coloured top rule. Nothing else changes colour.
- On a phone the rail becomes a bottom sheet and the map takes the screen.

### Field card

- A single column about 420 px wide that works on a phone and prints on one page.
- Sections in this order: objective, route, hazards, conditions, radiation, what the rover found, limits, sources.
- The limits section is always expanded.
- Provenance marks sit to the left of each figure:

| Mark | Meaning | Drawn as |
| --- | --- | --- |
| M | Measured | Solid square |
| D | Derived | Outlined square |
| A | Assumed | Dashed outline |
| S | Simulated | Hatched square |

The marks differ by shape, not colour, so they survive greyscale printing and colour-blind readers. A legend is printed once at the top of the card.

## 9. Motion

Every animation has to earn its place by explaining a change.

| Motion | Purpose | Spec |
| --- | --- | --- |
| Route draws from start to destination | State change: a route was computed | Stroke offset, 600 ms, once |
| Layer fades in or out | Feedback on a toggle | Opacity, 150 ms |
| Field card slides in | State change | Transform, 200 ms |
| Landing hero text and map appear in sequence | Hierarchy on first load | Opacity and 8 px rise, 60 ms stagger, once |
| Buttons press down 1 px | Feedback | On `:active` |

CSS only, animating transform and opacity. No animation library. Nothing loops. Under reduced motion all of it is instant.

## 10. Where we depart from the guides, and why

| Guide default | What we do | Reason |
| --- | --- | --- |
| Motion library for animation | CSS only | Five simple transitions do not justify the bundle or the build time |
| Next.js with server components | Vite single-page app | Already built; a static site with no server is the right shape for judging |
| Generate images for every section | Real NASA imagery only | An AI-generated picture of Mars in a project about real Mars data would undercut it, and would need a watermark under the event rules |
| High variance and motion baseline | Lowered | Section 4 |
| Texture, grain and atmospheric backgrounds | Flat paper | The orbital image is the texture |

## 11. Pre-flight check for this project

Run before each submission.

- [ ] No em-dash or en-dash in any visible string.
- [ ] One accent colour; nothing else saturated outside the map's hazard ramp.
- [ ] Every corner is 2 px.
- [ ] Light and dark both checked by eye; controls, popups and the card follow the theme.
- [ ] Every button label fits one line and passes 4.5 contrast.
- [ ] Hero fits a 1280 by 720 viewport with the button visible; headline two lines at most; sentence 20 words at most.
- [ ] At most one small uppercase label on the whole landing view.
- [ ] No two landing sections share a layout.
- [ ] Every image is real and credited. No overlaid tags.
- [ ] Every number traces to `DATA_SOURCES.md` or carries an A or S mark.
- [ ] Loading, empty and error states exist for tiles, routing and photos.
- [ ] Works at 375 px wide.
- [ ] Reduced-motion setting removes all animation.
- [ ] Every visible sentence reread by a person for sense.
