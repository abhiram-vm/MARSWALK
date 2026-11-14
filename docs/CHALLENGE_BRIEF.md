# Challenge brief: what NASA actually asks

Source of truth: the official page,
<https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/>
(read 2026-11-14; the page reports it was last published 2026-11-13).
The local-event copy at <https://hackathlone.com/challenges/interplanetary-survival-guide-martian-map>
was also read and matches the official text word for word in every section compared.

Rules, deadlines and judging criteria below come from the official
[2026 event page](https://www.spaceappschallenge.org/2026/),
[Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/) and
[Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/), all read 2026-11-14.

Quoted text is verbatim. Everything outside quotes is our reading of it.

## 1. Challenge facts

| Field | Value |
| --- | --- |
| Name | Interplanetary Survival Guide: Martian Map |
| Difficulty | Intermediate |
| Subjects | Human Exploration, Mars, Planets & Moons, Software, Space Exploration |
| Hackathon dates | November 14-15, 2026 |
| Submission window | Opens Sat Nov 14, 9:00 a.m.; closes **Sun Nov 15, 11:59 p.m.**, in the time zone of the team's Local Event (Universal Event: Team Owner's local time) |

## 2. The three tiers

The brief uses three different strengths of language. We keep them apart because it decides scope.

### Tier A: what the challenge asks (the core)

> "Your challenge is to create a layered, integrated view of a location or route on the Martian surface that pulls together data from multiple NASA science missions and could help a human explorer plan and carry out a successful Marswalk while conducting new and exciting science along the way."

> "Your challenge is to create a map, tool, or interface a Mars astronaut could use during a surface exploration mission, using NASA data and tools."

Read as requirements, that is five things:

1. A **layered, integrated view** (not a single image, not separate unrelated pages).
2. Of **a location or route on the Martian surface**.
3. Using data from **multiple NASA science missions** (more than one mission; the number of missions is separate from the number of data types).
4. That helps a **human explorer plan and carry out a Marswalk** (a tool for an astronaut, not a rover or a scientist on Earth).
5. **While conducting science** (the science objective is part of the product, not decoration).

The problem statement adds the gap we are meant to fill: existing tools "are built for regional and global views rather than the hyperlocalized areas astronauts will target on individual spacewalks or surface excursions."

### Tier B: what NASA suggests ("might", "may consider", "consider", "if possible")

| Suggestion | Exact wording |
| --- | --- |
| Start from a science goal and a matching location | "You might start by identifying some scientific goals for your mission and the location the astronaut will explore." Example given: boxwork formations, "a geologic phenomenon the Curiosity rover studied in 2025", in "the Mount Sharp region where Curiosity observed them." |
| Well-studied or less-studied site, your choice | "You might start with a location one of NASA's Mars Rovers or another mission has explored extensively ... or you might challenge yourself by focusing on an area that hasn't been studied as closely." |
| At least three kinds of data | "You may consider including at least three kinds of data—optical, thermal, spectral, topographic, geophysical, atmospheric, radiation, and chemical are a few examples—layered or combined in a way that provides helpful context for navigating the chosen location." |
| Safety information | "NASA's first priority is always astronaut safety, so consider what information might help a crew move safely through a new environment." |
| Radiation / space weather | "the radiation environment on Mars differs from those of Earth, Earth-orbit, and the Moon, so you might include space weather data." |
| Suit and load mobility | "Astronauts will conduct Mars surface science wearing spacesuits and possibly carrying scientific equipment and other supplies. Consider how this might impact their mobility" |
| A route that avoids obstacles | "if possible, include a route map that shows where the astronaut will travel to accomplish their scientific objectives while avoiding significant obstacles such as large rock formations." |

"At least three kinds of data" is a suggestion ("may consider"), not a rule. "Multiple NASA science missions" is in the core sentence.

### Tier C: explicitly optional ("You may (but are not required to) consider the following")

1. Format: habitat/spacecraft planning display, carried tablet app, helmet-visor HUD, or another format.
2. Static snapshot, interactive product, or a system that generates maps for different locations or data types.
3. Look at maps made for other destinations (Earth, Moon, other planets, exoplanets) for inspiration.
4. Past time frame, predicted future conditions, or no time frame (for stable data like topography and geology).
5. Use surface-mission imagery as point-of-view images "so the astronaut knows what to expect when they arrive at their destination."
6. Rovers or robotic systems to move crew and tools, or astronauts working in pairs.

## 3. Resources listed on the official page

All five are under "NASA Data & Resources". No Space Agency Partner resources are listed for this challenge. The page says "More resources may be added before the hackathon begins"; as of the 2026-11-13 publish the list is these five.

| Resource | URL | Official description |
| --- | --- | --- |
| JPL Mars Trek | <https://trek.nasa.gov/mars/> | "NASA web-based portal for exploration of Mars, showcases data collected by NASA at various landing sites." |
| USGS-NASA Planetary Geologic Mapping Program | <https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars> | "High-quality standardized geologic map of Mars" |
| Curiosity's proposed path up Mount Sharp | <https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/> | "Example of a route map visual for the Curiosity example mentioned above" |
| NASA Worldview | <https://worldview.earthdata.nasa.gov/> | Earth satellite imagery explorer (an example of a layered data display) |
| Mars Perseverance Raw Images Gallery | <https://mars.nasa.gov/mars2020/multimedia/raw-images/> | "Over 1 million images captured by the rover on its journey across the Mars surface." |

## 4. Where the official page adds to the summary we started from

Nothing in our starting summary contradicts the official page. The official text adds:

- The opening paragraph asks for a map with "updates on current conditions, and the data needed to complete their mission quickly and safely." Current conditions and speed are named, not only stable terrain.
- The boxwork example is specific: "a geologic phenomenon the Curiosity rover studied in 2025".
- The gap is phrased as "hyperlocalized areas astronauts will target on individual spacewalks or surface excursions".
- The background frames the value of humans as real-time judgment ("make connections, solve problems quickly, and apply context to observations").

## 5. Hard rules for a valid submission

From the Project Submission Guide and Judging & Awards Guide.

- Submit with the "Submit for Judging" button before **Sunday Nov 15, 11:59 p.m.** local event time. "Any projects saved or submitted past this deadline will not be eligible for judging." You can edit and resubmit until then; only the last saved submission is judged.
- All team members registered for the same Local Event (not waitlisted), on the team's Members tab. Maximum six members.
- All required form fields complete, in English (linked materials too; a video may be in another language only with English subtitles).
- **Demo is mandatory**: a video of 30 seconds or less, or a slide deck of at most seven slides including title and intro. "Projects that exceed these limits will not be eligible for Global Judging."
- **Links must be public**: "a publicly accessible link with no logins, permissions, or registrations required. If judges can't access your project, it can't be evaluated or judged." Our GitHub repository is private today; see the plan.
- **NASA data**: "To be eligible for a Global Award, you must use at least one NASA data or resource."
- **References**: list all external code, text, images, data and tools, even open-source or free ones. No copyrighted material without permission.
- No images, video, audio or likeness of anyone under 18.
- The project page takes images (JPG, PNG, GIF up to 10 MB) but not videos or documents.

### AI rules (the guide calls it "Super Intelligence (SI)")

> "The use of SI tools, such as machine learning, chatbots, image generation, and large language models, is permitted ... and should be used as a tool to accelerate innovation and creativity for your challenge solution. SI should not be used to (come up with your idea of how to solve the challenge)."

- AI-generated content "may not use, contain, or modify any NASA branding or design elements (such as the NASA logos, flags, or mission identifiers)."
- Images and videos made with AI need a visible watermark. Audio, code and data made with AI must be acknowledged "in descriptive text and metadata".
- The SI form answer is not shown to judges, but judges "will evaluate originality, intent, and execution based on the SI-assisted elements you include and identify".

What this means for us: the MARSWALK concept (pick a start and a science destination, compare two routes, get a briefing) is the team's own idea. AI assistance was used to develop the plan and will be used to write code. The team should make and own the design decisions, and say plainly in the repository and the form where AI was used.

## 6. Judging criteria

Each is scored 1 to 5 "at every level of judging". Score-5 descriptions, shortened:

| Criterion | What a 5 looks like (official wording, abridged) |
| --- | --- |
| Impact | "addressing a significant problem ... reach is extensive, inspiring, benefits a large audience" |
| Creativity | "a groundbreaking approach ... original and inventive proposed solution that stands out" |
| Validity | "scientifically sound and technically feasible ... fully developed ... highly usable and user-friendly" |
| Relevance | "thoroughly engages with the challenge ... NASA data is integral to the project's success ... rather than a superficial addition" |
| Presentation | "well-structured and compelling presentation, clearly articulating the challenge, proposed solution, and importance" |

The guide stresses presentation: "remember to pay equal attention to the final criterion: presentation." It also says the demo counts, "but the majority of judges' evaluation will be based on your project submission", meaning the project page text matters more than the demo.

## 7. What we could not verify

- Local-event judging times and formats. The guide says to "Check with your Local Lead about times for your Local Event's local judging and awards which may differ from the global submission times." Ask your Local Lead.
- Whether more resources were added to the Resources tab after 2026-11-13. Reload the official page once before submitting.
