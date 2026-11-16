# Submission guide

Rules quoted here are from the official [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/) and [Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/), read 2026-11-14. Draft text is a starting point for the team to rewrite in its own words.

## Deadline

"Submit for Judging" before **Sunday November 15, 11:59 p.m.**, local time of your Local Event (Universal Event: the Team Owner's local time). Late saves are not judged. Submit early and resubmit; only the last saved version counts.

## Before you open the form

- [ ] Every member is registered, on the same Local Event, not waitlisted, and listed on the team's Members tab.
- [ ] The final-project link opens in a private browser window with no login. The repository is public.
- [ ] The demo link opens the same way.
- [ ] Demo is at most seven slides (title and intro included) or at most 30 seconds of video. Over the limit means ineligible.
- [ ] Everything is in English.
- [ ] No one under 18 appears in any image, video or audio.
- [ ] No NASA logos or mission insignia in anything AI-generated.
- [ ] Every "cited, not opened" and "unverified" row in DATA_SOURCES.md has been opened and confirmed, or removed from the app.
- [ ] `LICENSE` and `THIRD_PARTY_NOTICES.md` are in the public repository (the event terms require an open-source licence and named third-party licences).
- [ ] `npm test` and `npm run e2e` pass on the final build.

## Form fields

| Field | What the guide asks | Notes for MARSWALK |
| --- | --- | --- |
| Project Name | Name of the project | MARSWALK |
| High-Level Project Summary | "What did you develop? How does it address the challenge? Why is it important?" | Three short paragraphs, one per question. Lead with the place and the decision. |
| Link to Project Demo | Seven slides or a 30-second video, public link | `docs/demo/MarsWalk_demo_30s.mp4` (29.5 s, silent, captioned, AI-assisted watermark). Upload to YouTube as Unlisted or link the GitHub file. |
| Link to Final Project | Public link to site or repository | The GitHub Pages address of the app (the repository's root `index.html`), with the repository linked from it |
| Detailed Project Description | What it does, how it works, benefits, goals, tools and languages | Walk through the demo path. Include the limits. Add two or three screenshots (images up to 10 MB are allowed). |
| Use of Super Intelligence (SI) | Whether and how AI tools were used | Use the short wording in PLAN.md section 11: the concept and decisions are the team's, Claude Code assisted with documents and code. Not shown to judges. |
| NASA Data | "specific details about what NASA data and resources you used" | One line per row of DATA_SOURCES.md section 2 that shipped: mission, instrument, product, what it does in the app. At least one NASA resource is required for a Global Award. |
| Space Agency Partner Data and Other References | All data, code, text, images and tools used | Libraries (Leaflet, React, Vite and so on), papers, blog posts, and REMS's Spanish contribution once the credit is confirmed |

The guide says the project page is "the page that the judges will review" and that most of the evaluation is based on it, more than on the demo.

## Draft summary (rewrite in your own words)

> The first people to walk on Mars will not need a map of the planet. They will need a map of the next five hundred metres. MARSWALK is a traverse planner for one real place: the boxwork ridges on Mount Sharp, where NASA's Curiosity rover has been drilling since 2025.
>
> An astronaut picks a starting point and a science station. MARSWALK overlays sub-metre orbital imagery and a one-metre terrain model from Mars Reconnaissance Orbiter, night-time thermal data from Mars Odyssey, and Curiosity's own track, weather record, radiation measurements and photographs. It computes two routes across the ridges, compares them on time, climb, steepness and return margin, and writes a one-page field briefing.
>
> Every number in that briefing is labelled as measured, derived, assumed or simulated, with its source, because a crew has to know which figures to trust.

Check before using: the summary names only layers that actually shipped.

## Seven-slide outline

1. **Title.** MARSWALK, team name, member names, the challenge name. (The guide requires team name, members and challenge.)
2. **The problem.** Existing tools show regions; a crew walks metres. One line from the brief.
3. **The place and the question.** Boxwork ridges from orbit and from Curiosity's cameras. Why ridges and hollows.
4. **The layers.** Four missions, five data types, one patch of ground. Mission and instrument credits visible.
5. **The decision.** Screenshot of the two routes and the comparison panel.
6. **The briefing.** The field card with provenance labels and the limits section.
7. **What it could become.** Any site with a HiRISE terrain model; honest list of what is assumed today.

## If you make a video instead

The guide's own timing for 30 seconds: introduce yourselves (0:00), the challenge (0:02), project name and tagline (0:05), how it works and how NASA data made it possible (0:10), the future (0:20 to 0:30). A screen recording of the demo path with captions fits this. English subtitles if anyone speaks another language.

## Optional: help judges reach a new website

The guide recommends requesting a FortiGuard web-filter classification for a newly created site (<https://www.fortiguard.com/faq/wfratingsubmit>, company name "N/A"). Not required.

## Final steps on the form

1. Tick the Terms and Conditions box.
2. Tick "Confirm All Work is Original" (it also confirms every external resource is listed in References).
3. Click "Submit for Judging". A confirmation banner appears on success.
