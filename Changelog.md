# Changelog

All notable changes to **The Hotspots** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

> **Agent Rule**: Always record changes in Changelog.md before making a commit, adding a feature, or altering logic.

---

## [2026-11-15] - Fix: seam labels on the time strip no longer overlap

### Fixed
- Scientific mode drew every seam label on one row at the right of its line, so close seams covered each other ("Aqua starts" and "Terra-only ratio ends (Aqua nominal)" in 2002, "NOAA-21 in orbit (not in the VIIRS series)" and "S-NPP ends" near the end) and "S-NPP ends" ran past the "now" mark. New `web/src/strip/seamLabels.ts` places each label in the first free spot: right of its line, then left; full text, then without its trailing parenthesis; row 1, then row 2 (two rows only when the strip is tall enough). A label with no free spot keeps its dashed line and its full text in a tooltip, and the seam check list still lists every seam. Labels stay left of the "now" mark. Text width is measured in the page font. Unit tests in `web/tests/unit/seamLabels.test.ts` check that no labels overlap from 360 to 2400 px.

---

## [2026-11-15] - Docs: submission working documents leave the repository

### Removed
- `Hackathon guides/nasa-project-form.md` and `Hackathon guides/public-release-checklist.md` moved to the git-ignored `Info.local/submission/` (internal working documents, including the release-day squash steps), then `Hackathon guides/README.md` and the folder, which had nothing public left.

### Changed
- Contributor.md: repository map and document table no longer list the folder or the two files; the event section no longer links the form. README: the two TODO comments no longer name the removed files (the licence TODO points to Whitepaper section 8). GroundTruth 3: says where the internal and submission documents are.

---

## [2026-11-15] - Docs: prune for the public release

### Removed
- `archive/` (`Solution.md`, `ImplementationPlan.md`, `Map Grid Plan.md`, `Thread Briefs.md`, `README.md`): superseded plans and internal briefs, archived earlier today, now removed on Arthur's decision. They are in the git history.
- Hackathon guides on the jury (`judge-panel.md`, `judge-profiles.md`), pitch advice (`presentation-and-criteria.md`), Turin logistics (`turin-local-event.md`), the rules digest (`official-rules-and-submission.md`), the challenge notes (`challenge-brief-and-clarifications.md`) and the first tool list (`existing-solutions-and-landscape.md`, duplicated by `Vision Docs/CurrentSolutionLandscape.md`).
- `assets/the_hotspots_banner.jpg` and `assets/the_hotspots_avatar.jpg` (AI-generated) and the banner at the top of Contributor.md.

### Changed
- GroundTruth 3: lists what remains and what was removed. The sections on the local briefing transcription pipeline (3b), event facts (3c) and NASA rules (3d) are condensed into one section, 3b "Hackathon rules that shaped the work". Archive request count corrected from 54 to 55 (the 55 rows of `scripts/firms_archive_links.csv` and 55 folders in `data/raw/archive/`). Item 6 no longer says no demo place is chosen.
- AI-use statement made the same in README, Contributor and the NASA form: code written with AI coding agents run through T3 Code (Claude and Gemini); the idea, design, product and method decisions are the team's, who checked the results; the Italy demo in `web/src/insight/demo.ts` was written with T3 Code, its rules and place profiles are the team's product decisions with no driver data behind them. Codex is no longer named (it was not used). Whitepaper's disclosure names "Claude Fable" instead of "Fable".
- README: "What is demo" no longer says the hosted demo carries Italy only (it carries the world at coarse resolution and Italy in full detail, as the top of the README says); the 2.78 GB figure links to its source in web/README.
- Contributor.md: repository map, document table and event section updated for the removals. Hackathon guides README lists the two remaining files.
- Vision Docs: paths to removed plans dropped, with a note in each affected document that those plans are in the git history. CurrentSolutionLandscape no longer points to the removed tool list. Pipeline comments and `pipeline/README.md` no longer cite removed plans.
- `Hackathon guides/nasa-project-form.md`: checklist items on Codex, the banner and avatar, and `demo.ts` marked resolved.
- `Hackathon guides/public-release-checklist.md`: rewritten with what was resolved and what still needs a decision.
- `Hackathon guides/public-release-checklist.md`: section 4 "Release day: squash history and go public", the last step, with the commands (not run): freeze, local bundle backup, one orphan commit with noreply co-author trailers, force push to `main` of the same repository, check remote refs, make public, check both links, re-clone. Items on the old history and author emails marked decided.
- Contributor.md: "The team" heading without emoji, the stale working-style line and the "Governance Documentation" list (duplicated by the repository map) removed. README's document table points to Contributor's repository map.

---

## [2026-11-15] - Docs: repository tidy for the public release

### Changed
- `src/` renamed to `forecast/` (the 2027 forecast scripts), so it is not confused with `web/src/`. The scripts resolve paths from the repository root, so they run unchanged. References updated in README, Contributor, GroundTruth 2 and 3h, Prediction, the prediction report, web/README, the NASA form notes and the release checklist. Added `forecast/README.md`.
- `.gitignore`: `results/` (forecast outputs and figures).

- `Solution.md`, `ImplementationPlan.md`, `Vision Docs/Map Grid Plan.md` and `Vision Docs/Thread Briefs.md` moved to `archive/`, each with a note naming what replaced it; `archive/README.md` lists them. Mentions in Vision Docs, GroundTruth, Contributor and the pipeline comments point to the new paths. The raw file differences that Contributor and GroundTruth cited from `Solution.md` 5.1 are now stated in `pipeline/README.md` (step normalize).
- Contributor.md: "Start here" rewritten for readers after the hackathon, a repository map that includes `forecast/` and `archive/`, a table of which document answers which question, and the event section in the past tense.
- `Vision Docs/MVP Implementation Plan.md`: a note on its current role (data contract and decisions D1 to D27; the status lines below it predate the decisions).
- `Vision Docs/CurrentSolutionLandscape.md` gets a title and a pointer to `Hackathon guides/existing-solutions-and-landscape.md`, whose intro now points back instead of promising a later analysis.

- `Prediction.md`: the six images from `results/figures/` (git-ignored, never in the repository) are replaced by a line naming each figure and the script that writes it (`forecast/05_figures.py`). Em dashes, arrows and en-dash ranges replaced, per the style rules; no number changed. Same for the five em dashes in `Vision Docs/PredictionEngineeringReport.md`.

### Removed
- `Hackathon guides/.gitkeep` (the folder has files).

---

## [2026-11-15] - Docs: public release checklist

### Added
- `Hackathon guides/public-release-checklist.md`: audit before the repository goes public, report only. Needs a decision: organizer briefing transcripts in the history of `main` (already on origin), the jury profile guides, the licence, the AI-generated banner and avatar (C2PA marks them as generated), and commit author emails. To fix: no OpenStreetMap, OpenFreeMap or FIRMS credit in the app, broken figure links in `Prediction.md`, `results/` not git-ignored, missing standard-product DOIs, video and screenshots. Clear: no keys in files or history, `Info.local/` and `AGENTS.local.md` untracked, no large files. Indexed in `Hackathon guides/README.md`.

---

## [2026-11-15] - Docs: README for judges, maintainer guide moved to Contributor.md

### Added
- `README.md` (new): the project summary for readers and NASA judges. What the app does, the problem and who it is for, the FIRMS products and periods used, how the harmonized score works, the leave-one-year-out results, confidence levels and limits, the 2027 forecast and its held-out test, what is demo, the team, the use of AI, references and links to the documents that hold each number. Hosted app link (Italy data only) and repository link; the demo video, screenshots, standard-product DOIs and licence are left as TODO comments. The DOIs given are those of the near-real-time products, read from their NASA Earthdata catalog pages.
- AGENTS.md: a line under the 4-document rule saying Contributor.md is now the maintainer guide and README.md the summary for judges (no rule removed).

### Changed
- `README.md` renamed to `Contributor.md` (maintainer guide), with a pointer to the new README. Links and mentions of the README's "How the fire score works" section now name Contributor.md: GroundTruth 4, Whitepaper Appendix A, MVP plan section 13, Insight Engine, `pipeline/README.md`, `pipeline/config.toml` comments and the method note written by `pipeline/publish.py` (the published manifest of the current build still says README until the next publish).
- GroundTruth 2: names the two documents.
- `Hackathon guides/nasa-project-form.md`: hosted app and repository links filled in, Italy-only scope of the hosted app stated, the forecast code is in `src/` (was "a separate project"), near-real-time DOIs and the FIRMS citation added, and the checklist items that are now resolved are ticked.

---

## [2026-11-15] - Docs: README brought up to date, stale numbers and links fixed

### Added
- `Hackathon guides/nasa-project-form.md`: text for every field of the NASA Project tab, with a checklist to clear before pasting. Indexed in `Hackathon guides/README.md`, together with `judge-profiles.md`, which was missing from the index.
- `src/requirements.txt`: the packages the forecast scripts import (duckdb, pandas, numpy, lightgbm, matplotlib) plus pyarrow for Parquet, with the versions recorded in the prediction report, and how to install the DuckDB `h3` extension.
- README: what the app shows for a place (history with confidence levels, 2027 forecast, Next 12 months, the Italy Why and What to do demo, scientific mode), a section on the 2027 forecast in `src/`, a "Use of AI" section, and `src/`, `Prediction.md`, `Whitepaper.md`, `Solution.md`, `ImplementationPlan.md` and the new guides in the repository tree.
- `web/README.md`: a Next 12 months section.

### Changed
- README: dropped the "Repository: Private" badge; Start Here now says the app runs on the real build and the method decisions are made; the stale "Known gap" note is replaced by a pointer to the NASA form draft; "From demo to product" now says the forecast exists.
- GroundTruth 3g, known issues: 67 outage satellite-months merged into 54 ranges, 37 of them in the baseline years (19 S-NPP or NOAA-20), at the 40% over 91 days rule. The old text (42 ranges, 28 months, 25% rule) was from before the detector fix. Counted again on `data/processed/harmonized/meta.json` and the published manifest.
- Whitepaper section 2 and 8: no FIRMS API months were used; the archive covered every month (GroundTruth 3g measured this).
- GroundTruth 2 and 3h, `web/README.md`: the forecast scripts are now in `src/`, not only in a separate project. Their inputs were built in that project and the scripts were not rerun here.
- `Prediction.md`: `STEPS.md` is not in this repository; the note now says where the inputs, packages and numbers are, and that `results/` is not in the repository.
- `Vision Docs/PredictionEngineeringReport.md`: commit `dfb8163` belongs to the separate prediction project; the reproduce block points to the files in this repository.
- `web/README.md`: `VITE_SHOW_PLANNED` has no planned sections left to show.
- MVP plan section 13: D26 now comes before D27.

### Restored
- `ImplementationPlan.md`, deleted in the working tree by no one's request. `Vision Docs/Map Grid Plan.md` and `MVP Implementation Plan.md` link to it.

---

## [2026-11-15] - Web app: Next 12 months section, demo places in search; merge of the insight demo

Two versions of the Italy insight demo were built in parallel. The pushed one (`web/src/insight/demo.ts`, sections Why and What to do, marked Demo) is kept. From the other, unpushed version only two ideas are kept, rebuilt on the pushed code; its own insight module, sections and tests are dropped (its "fire probability" percentages and model blend had no data behind them).

### Added
- Next 12 months (`web/src/panel/sections/OutlookSection.tsx`), no longer a planned slot: the place's forecast month by month, with the month of most expected activity, from the existing per-place forecast; a tap shows the month on the strip, calendar and map. Marked Forecast. For Turin, Milan, Monte Barone and Foggia one extra line, marked Demo, names the demo's riskiest month and the two months to prepare. Without forecast files it says so.
- Search (`web/src/ui/Search.tsx`): the four demo places (from `DEMO_REGIONS`) are in the list, unless the build already lists them.

### Changed
- `web/src/panel/registry.ts`: History is still the section opened when a place is chosen (`openByDefault`), now that Next 12 months is a live section placed before it.

---

## [2026-11-15] - Web app: map credits

### Added
- Map attribution (`web/src/map/MapStage.tsx`, `basemap.ts`, `styles/layout.css`): a compact (i) under the More button, closed at start, opened by a tap or click. It credits the basemap in use (OpenFreeMap, OpenMapTiles and OpenStreetMap contributors online; Natural Earth for the bundled fallback) and "Fire data: NASA FIRMS (MODIS, VIIRS)". On phones the button is 44 px and sits under the More button and mode sign.

### Checked
- Closed and open, it does not overlap the legend, the search card or the time strip at 1400 x 900 and 360 x 640 (Chromium; WebKit at 360). Typecheck, 147 unit tests, `tests/e2e/mobile.spec.ts` in Chromium and WebKit (34 passed, 6 skipped).

---

## [2026-11-15] - Web app: GitHub Pages build (world coarse, Italy in full)

The submitted site is served by GitHub Pages from a `gh-pages` branch of this repository, which caps a site at 1 GB.

### Added
- `build-deploy --clip w,s,e,n` (`web/scripts/clip-data.ts`): world at overview res 3 and 4, world summary and forecast; overview r5 for the res 0 parts that reach the box; detail tiles for the res 3 cells that reach it; presets inside the box. The copied manifest and detail index list only the copied files. Italy (6.6,35.4,18.6,47.1) on the real build: 94 detail tiles, 3 r5 parts, 2,183 files, 0.40 GB.
- `--base` (Vite `base` and the data URL, for `/the-hotspots/`), `--view` (default map view through `VITE_DEFAULT_VIEW`, `web/src/state/url.ts`), `--readme`, and a `.nojekyll` in every deploy folder.
- `web/scripts/demo-README.md`: README of the `gh-pages` branch.

### Checked
- Local preview under `/the-hotspots/`: Italy landing view, res 6 in Piedmont, Turin, Foggia and Alba place panels (history, calendar, Next 12 months, 2027 forecast), a place outside Italy (message, no error), phone width in Chromium and WebKit. No failed requests and no console errors.

---

## [2026-11-15] - Web app: deploy folder for a free static host

The judges need a public link. The real build (2.78 GB, 47,789 files) is over the 20,000 file limit of the Cloudflare Pages free plan, and 33,491 of the files are the res 5 overview.

### Added
- `npm run build-deploy` (`web/scripts/build-deploy.ts`): builds the app into `web/deploy/site`, copies `public/` without the data folders and copies the data folder (read only) without `overview/r5`. The copied `manifest.json` goes from res 4 to res 6 (res 6 from zoom 8.5) with no res 5 parts. Writes `_headers` and `404.html` and checks the Cloudflare Pages limits. `--keep-r5` copies everything, `--data-base <url>` builds for data on another origin.
- `web/README.md` section "Deploy (static host)": commands and what the deploy copy loses (res 5 between zoom 6 and 8.5).

### Changed
- `web/vite.config.ts`: `HOTSPOTS_NO_PUBLIC=1` turns off the Vite public copy, so a data symlink in `public/` does not end up in the build. Default behaviour unchanged.
- `web/.gitignore`: `deploy/`.

---

## [2026-11-15] - Web app: confidence levels on the harmonized score (D27)

Before 2012 the score is estimated from MODIS. For small places that estimate is not trustworthy: in Langhe (7 res 6 cells) the monthly peaks before 2012 were about twice as tall as after, which read as a drop in fire and is a method artifact. The app now shows how far each value can be trusted. Decided by the user.

### Added
- Confidence level per (place or map cell, month) (`web/src/stats/confidence.ts`): high for observed months; medium for estimated months of areas of 49 res 6 cells or more (and the world) and for provisional months; low for estimated months of smaller areas and every estimated month before 2002-10 (Terra alone). Settings `estimatedCompareMinCells` and `terraOnlyBefore` in `web/src/stats/config.ts`, with the leave-one-year-out numbers behind them. Map cells count as 7^(6 - res) res 6 cells.
- Display: low months are drawn faded (`opacity.lowConfidence`, 0.4) under the estimated hatch in the time strip, calendar and map (res 5 and 6, and every res before 2002-10); value text, calendar labels and the map tooltip name the level; the History summary shows a "Low confidence" or "Medium confidence" marker with one plain line and a "How to read" note (`web/src/ui/Confidence.tsx`), which in scientific mode lists the missed share and 75th percentiles by unit size from `method.json`; the map legend adds a line when cells are faded. Raw MODIS and VIIRS views are not faded.
- Tests: `web/tests/unit/confidence.test.ts` (10 tests) and a phone test on Langhe before and after 2012 in `web/tests/e2e/mobile.spec.ts` (Chromium and WebKit).

### Changed
- Terra-only months (before 2002-10) are no longer compared with normal at any size ("estimated from Terra alone"), like estimated months of small places.
- `method.json` contract: the `loyo` rows may carry `zero_pred_share`, `p75_pred` and `p75_obs` (already in the build; the schema now keeps them).
- Docs: Whitepaper section 3.9 (new), 3.7, 3.8, 4.3, 5, limitation 1, Key findings and Appendix A; README "How the fire score works" sections 6 and 7; GroundTruth sections 3f and 4; MVP plan decision D27.

---

## [2026-11-15] - Web app: demo of Why and What to do for four places in Italy

### Added
- `web/src/insight/demo.ts`: a demo of how the Insight Engine should work, for Turin, Milan, Monte Barone and the plain around Foggia. Simple if/else rules, based on the candidate classes of `Vision Docs/Insight Engine.md` section 4.1, give the main drivers and the steps for land managers and policy makers in the months before the month with the highest fire probability.
- Panel sections "Why" and "What to do" (`web/src/panel/sections/Insight/`), marked "Demo". They follow the selected forecast month, or the place's peak month. Other places get links to the four demo places. Scientific mode shows the value and the rule behind each line.

### Tests
- New `tests/unit/insight.test.ts` (5 tests). 137 unit tests pass. e2e: 87 passed, 6 skipped, Chromium and WebKit.

---

## [2026-11-15] - Web app: forecast for next year on the strip, calendar and map

The prediction model's output (per H3 res 4 area and month of 2027, from the team's separate prediction project) is now shown in the app. Asked for by the user: greyed and see-through so it reads as a forecast, one step to make next year the whole time strip, a new calendar row for the selected place, and both detail levels.

### Added
- Forecast files, an optional add-on to the data folder (`web/src/data/forecast.ts`): `forecast/manifest.json`, `forecast/map/r{3,4}/YYYY-MM.json` (median per cell) and `forecast/r4/<res 1 parent>.json` (10%, 50%, 90% per res 4 area and month). A folder without them shows no forecast.
- `npm run import-forecast` (`web/scripts/import-forecast.ts`, `forecast-files.ts`): reads the model's `forecast_2027_res4.csv` and `metrics.json` and writes the files. Measured on the 2027 file: 809,064 rows, 67,422 areas, 65,332 with a non-zero forecast, 485 files, 17 MB. World totals use `clim_mean`, as in the model's report. `npm run fixtures` writes a stand-in forecast (quantiles of the simulated 2012 to 2025 values), which is not a forecast. `npm run validate-data` and both writers check the forecast files (schemas, tiles against the manifest, res 3 map against res 4).
- Time strip (`strip/TimeStrip.tsx`, `strip/OutlookStrip.tsx`): forecast months after "now" as greyed, see-through bars in a dashed frame. A "2027 forecast" button next to the place name makes the forecast year the whole strip, one wide bar per month, and back. Right arrow from the last month of the record enters the forecast. Scientific mode adds the 10% to 90% range and the usual value.
- Calendar (`Calendar.tsx`): a row for the forecast year with greyed, dashed cells on the place's own colour scale. Arrow keys step from the record into it.
- History section (`Outlook.tsx`): a selected forecast month replaces the month sentence ("About 1.7 active cell-days expected, about the usual for August", likely range, usual value, "not a weather forecast"). Below the calendar, the forecast months as bars over the place's usual range. Scientific mode adds a table by month, how the forecast is made, the model's held-out test rows and a forecast CSV.
- Map (`MapStage.tsx`, `CellLayer.ts`, `Legend.tsx`): while a forecast month is selected the map shows the forecast at res 4 (res 3 when zoomed out), greyed at 50% opacity with a grey outline, and the legend says "Forecast" and "Greyed: a forecast, not an observation".
- Place forecast (`stats/forecast.ts`): a place takes the forecast of the res 4 areas it covers. A part of an area takes the share of the area's activity it had in the same calendar month of the baseline years (fallback: all baseline months, then the share of cells). Parts add up to the area forecast. This is an app-side rule for the team to confirm (plan D26).
- URL parameter `outlook=YYYY-MM` for the selected forecast month. `month` stays the record month, so every record view keeps working.
- "Forecast" status marker (dashed), `web/DESIGN.md` section "Forecast marks".

### Changed
- `panel/registry.ts`: `stripFutureMonths` removed. The strip takes its future months from the forecast files.
- Docs: `GroundTruth.md` (3f, new 3h, section 4), `README.md`, `web/README.md`, `web/DESIGN.md`, plan D26.

### Known limits
- The forecast is NOAA-20 cell-days; the record is the mean of S-NPP and NOAA-20, about 1% lower. Not corrected.
- A place over several areas: the range is the sum of the area ranges (wider than the true range) and the sum of medians runs low. Scientific mode says so.
- The real forecast was imported and checked as files, but the app was not run on the real record together with it (no real build on the machine used). December 2026 has neither data nor forecast.

### Tests
- New `tests/unit/forecast.test.ts` (13 tests: area shares, place sums, wording, CSV, file schemas, URL). 132 unit tests pass.
- New `tests/e2e/outlook.spec.ts` (8 tests) and two phone tests in `mobile.spec.ts` (tap in Chromium and WebKit, swipe in Chromium only).
- `history.spec.ts`: the calendar of the empty-record place now has 28 rows (27 years and the forecast year), changed on purpose.
- `scientific.spec.ts`: baseline line corrected from 22 to 14 years. It was stale since baselines started skipping estimated months (commit 29e7db1), not caused by this change.
- `playwright.config.ts`: Chromium's software-WebGL flags moved to the Chromium project; WebKit on Linux does not start with them.
- Full e2e run on the committed code: 87 passed, 6 skipped (swipe tests skip in WebKit), Chromium and WebKit.

---

## [2026-11-15] - Web app: see-through cells, street-level map, scale bar, hectares

After review: the cells hid the map, people could not find their own road, there was no scale, and areas were only in km².

### Added
- Scale bar (D25, `MapStage.tsx`): metric, updates as you zoom, bottom right on desktop and under the search card on phones.
- Street-level basemap (D25, `basemap.ts`): max zoom 15 instead of 12. The Detailed style adds buildings from zoom 13, wider roads, road numbers on motorways and trunk roads, road names (main roads from zoom 11, small roads from 13) and neighbourhood names. All are Detailed-only layers, so Quiet hides them.
- Areas in hectares (D24, `stats/wording.ts`): `formatHa` and `formatKm2`. `formatArea` now picks the unit by size: hectares first under 1 km² ("50 ha (0.5 km²)"), km² with hectares from 1 to 100 km² ("36 km² (3,600 ha)", one cell), km² only above. The tooltip stays in km². Hectares are what a farmer knows; for a region they would be unreadable.

### Changed
- Cell fill opacity falls with zoom (D24, `tokens.ts` `opacity.cellByRes`): 0.85 at res 3, 0.8, 0.7, 0.6 at res 6. The warm outline is unchanged, so cells keep their 3:1 edge. Legend swatches show the colour as it looks over land at the current resolution (`overLand`).
- On phones only the zoom buttons are hidden; the scale stays.
- Plan: D24 and D25 added to section 13, the token table and 8.2 follow. `GroundTruth.md` 3f updated.

### Tests
- New `tests/unit/area.test.ts` (units by size, `overLand`). `tests/unit/grid.test.ts`, `tests/e2e/core.spec.ts` and `tests/e2e/places.spec.ts` follow the new area text (the finest cell is now "36 km² (3,600 ha)", a drawn shape reads "N ha (0.x km²)"), which are purely text changes I made on purpose. 118 unit tests; e2e 76 passed, 5 skipped, Chromium and WebKit.

---

## [2026-11-15] - Whitepaper: limitation 1 says the small-place problem cannot be fixed with the available data

### Changed
- `Whitepaper.md` section 7, limitation 1: no ratio can recover fires MODIS did not detect, and VIIRS did not exist before 2012 to check a correction against. States that the app still draws estimated bars of small places at full height, without a label.

---

## [2026-11-15] - Baselines skip estimated months, outage detector, leave-one-year-out breakdown

### Fixed
- `web/src/stats/baseline.ts`: baselines skip estimated months. January 2012 is estimated (S-NPP started on 2012-01-20), so it is no longer in January baselines. All baseline months are observed VIIRS. A January target year in 2012 to 2025 now has 12 comparison years (13 for other months). `recordSummary` also skips estimated months.
- `pipeline/harmonize.py`, `pipeline/config.toml`: the outage detector marks a day as low when its rows are below 0.4 (was 0.25) of the satellite's median daily rows over a centred 91-day window (was the month's own median). The Aqua outage of 16 August to 2 September 2020 filled half of August and pulled that month's median down, so the old rule found only 2 low days. Now Aqua 2020-08 has 15 low days and 2020-09 has 2. New counts: 67 outage satellite-months in `meta.json` (was 51), 54 known-issue ranges in the manifest (was 42), 37 satellite-months in baseline years 2012 to 2025 (was 28). 19 of the 37 are S-NPP or NOAA-20 and can change a baseline value; 18 are Terra, Aqua or NOAA-21. Settings: `outage_low_day_share = 0.4`, `outage_window_days = 91`. Display only: values and complete or nominal months do not depend on it.

### Added
- Leave-one-year-out breakdown (`loyo_breakdown` in `meta.json` and `method.json`, setting `loyo_region_min_obs = 100`). Bias by held-out year is 0.988 to 1.028. Mean absolute error at res 4 by held-out year is 7.19 to 7.71 cell-days. Bias by season is 1.002 (DJF) and 1.004 (MAM, JJA, SON). Over the 350 res 1 regions with at least 100 observed cell-days in the fit months, bias has p10 0.937, median 1.005 and p90 1.033; 87.4% of regions are within 10% of 1.
- `Whitepaper.md` (sections 3.7, 4.2, 4.4, 7, 8, Table 3), `pipeline/README.md` and `README.md` updated to match.

### Changed
- Reran `harmonize.py` (318 s) and `publish.py` (672 s, other jobs were running). Ratios, bands, the pooled leave-one-year-out table, zero shares, VIIRS steps and all published values h, lo and hi are unchanged.

---

## [2026-11-15] - Web app: dev server ignores the data folders

### Changed
- `web/vite.config.ts`: the dev server no longer watches `public/data` and `public/firms`. Rebuilding fixtures or the FIRMS data (thousands of JSON files) no longer reloads the page in the middle of a session.

---

## [2026-11-15] - Web app: daily views (Piemonte daily area)

### Added

- Contract (`web/src/data/contract.ts`): optional `manifest.daily`, detail `daily {rows, dm_modis, dm_snpp, dm_noaa20}`, overview `daily {idx, d}`, summary `daily_areas`, and method `daily {noaa20_scale_applied, viirs_weights}`, as written in data-build's plan 4.6.
- Daily stats (`web/src/stats/daily.ts`): area test (cell centre in a bbox), month split by the documented rule, place days that return null unless every cell is covered, running total and 5-day sum. The place curve is hidden if `noaa20_scale_applied` is true, because the regional scale factors are not published.
- History panel (`web/src/panel/sections/History/DailyCurve.tsx`): running total by default, 5-day sum as the second view. "Usual month, spread evenly" line, only where months are compared. "UTC days" label and the Estimated marker. A tap picks a day; hover does the same on desktop only.
- Map (`web/src/strip/DayBar.tsx`, "Day by day" button on the strip): shown only when every active cell in view has daily values. The map builds up as a running total on the monthly colour scale, so classes stay monthly. Day playback runs at 600 ms per day. Changing month, starting monthly playback, or moving the view outside the area leaves day mode.
- Fixtures (`web/scripts/make-fixtures.ts`): a daily area "Piemonte west (fixture)" with bbox [6.0, 43.5, 7.75, 46.5]. Masks use a separate random generator, and all 2,238 files keep their monthly values (checked).
- Validator (`web/src/data/validate.ts`): masks match the monthly counts, overview days sum to h, and daily fields without `manifest.daily` are an error.

### Tests

- `tests/unit/daily.test.ts` (12 tests).
- `tests/e2e/daily.spec.ts` (8 tests).
- 3 phone tests in `mobile.spec.ts`: tap, swipe, 44 px targets, axe.
- The test hook has new fields: `dailyAvailable`, `day`, and `drawnTotal`, which counts cells in view only.
- Suite status: 113 unit tests passed, e2e 76 passed and 5 skipped.

---

## [2026-11-15] - Web app: cell grid and a map you can find your place on

After review: lone active cells looked like random dots, and with only country borders nobody could tell where they live.

### Added

- Cell grid (D22, `web/src/map/CellLayer.ts`, `MapStage.tsx`): when hexagons are 16 px or wider, every cell of the view is a faint ink outline (11%) under the active cells, without fill, capped at 20,000 cells. The legend shows "No fire detected" with an empty hexagon. A grey fill was left out: it would hide roads and names and tint the sea.
- Map presets (D23, `web/src/map/basemap.ts`): Detailed (default) adds roads by importance as you zoom in, regional, provincial and municipal borders, region, town, village and water names (local names for towns), and residential areas as a light tint. Roads, borders and names are drawn above the cells. Quiet keeps land, water, country and region borders and country and city names. "Map: Detailed or Quiet" in the More menu, remembered in the browser; on the bundled basemap the menu says the online map did not load. Switching only changes layer visibility, so the cell overlay is not rebuilt.

### Changed

- Cells are now drawn under the first road layer (online) or the country lines (bundled basemap), instead of under the labels.
- Store: `basemap` (which basemap loaded) and `mapStyle` (with `localStorage`).
- `web/DESIGN.md` (new section on finding your place), plan 8.2, 8.10, token table, D22 and D23; `GroundTruth.md` 3f; `web/README.md` (Settings).

### Tests

- `tests/unit/basemap.test.ts`: cells sit under lines and labels only, Quiet hides exactly the detail layers, switching touches only them.
- `tests/e2e/core.spec.ts`: the Map choice works and survives a reload; the grid and its legend entry appear at zoom 8 and not at world zoom.
- `tests/e2e/places.spec.ts`: the too-large polygon test clicked at points now covered by the drawing hint and by the legend (taller with the grid entry), so two of its four clicks never reached the map; the points moved into open map. Full suite: 63 passed, 4 skipped, Chromium and WebKit; 101 unit tests.

---

## [2026-11-15] - Web app: one-path layout

Second round of the design pass, after review: the layout should work like a fire escape route, where the obvious path is the right one and expert controls are out of the way.

### Changed

- `web/DESIGN.md`: new layout section. One question then one answer, the search card as the lit path, controls that never move, scientific detail and data notes behind a More menu with a visible "Scientific mode" sign, always a way back, no top bar.
- Top of the screen (`web/src/ui/TopBar.tsx`, new `web/src/ui/MoreMenu.tsx`): the bar across the map is gone. A floating "where" card holds the name, the search and a Draw button (icon only on phones), and a "..." More menu top right holds the Simple / Scientific switch and the notes about the data. While scientific mode is on, a "Scientific mode" sign sits next to the menu button. Changing the mode closes the menu; Escape and a tap outside close it too, Escape without clearing the place.
- Footer: "Data through" date, the "Fixture data" badge (a short "Fixture data." on phones) and the safety line, on every screen size.
- Zoom buttons moved to the bottom right on desktop and left out on phones, where pinch and double tap zoom.
- Phones: the legend is one row of swatches with words at the two ends (all six words remain for screen readers) and steps aside while drawing; the peek stop of the sheet shows only the place and its summary sentence; the full sheet keeps the search visible above it.
- Keyboard focus in the search shows as a ring around the whole card.
- `Vision Docs/MVP Implementation Plan.md`: D21 added to section 13; 7.3 (`TopBar`), 8.8 (where the switch lives), 8.9 (no top bar on phones), 8.11 (tab order) and the file list follow it. `GroundTruth.md` 3f updated.
- Tests: `tests/e2e/helpers.ts` gains `openOptions`. `core`, `scientific`, `mobile` and `mobile-a11y` specs open the menu before using the mode switch, read the date from the footer, and check the "Scientific mode" sign appears and goes. The 44 px target checks now include the More button. Full suite: 61 passed, 4 skipped, Chromium and WebKit.

---

## [2026-11-15] - Web app: visual design pass

### Added

- `.claude/skills/frontend-design/`: Anthropic's frontend-design skill (SKILL.md and its Apache 2.0 LICENSE.txt), copied from github.com/anthropics/skills, used to guide this pass.
- `web/DESIGN.md`: design direction for the app (audience, tone, colour, type, layout, the time strip as the one bold element, motion, density), written before the restyle.

### Changed

- Palette (`web/src/styles/tokens.css`, `tokens.ts`): lighter, cooler land (`#ECEEE9`), clearer steel water (`#BACAD2`), near-white chrome (`#FBFBF8`), a new "well" tone for sunken areas, teal `#16657D`, muted ink `#55615F`. Ember ramp retuned so the low steps read as fire against the land (`#F6D978` `#F0A848` `#DE6F36` `#BA4128` `#842320` `#46141A`).
- Cell outline: ember 6 at 60% instead of ink at 45%. Measured 4.1:1 against land and 3.5:1 against the lightest cell; the ink outline reached only 2.6:1, below the 3:1 that finding U4 asks for. Cell fill opacity 0.85 to 0.9.
- Radii by role (cards 8 px, controls 6 px, data marks 2 px), one float shadow, strip height 104 px on desktop and 64 px on phones (room for the month flag), body text 16 px on phones.
- Fonts: Atkinson Hyperlegible Next 400, 600 and 700. The unused Atkinson Hyperlegible Mono package is removed.
- `tests/unit/scaffold.test.ts`: the expected first ember colour follows the new token (a purely visual value).
- `tests/e2e/mobile-a11y.spec.ts`: the docked phone strip is now expected at 64 px instead of 56 px (a purely visual value, D20).
- Top bar: hexagon mark next to the name (a cell with activity), search field with a magnifier on a sunken fill that lifts on focus, segmented mode switch with a 600 weight.
- Map controls: the draw tools, zoom buttons, legend, notices and the draw bar share one floating card style.
- Legend: swatches drawn as hexagons inside the warm cell outline, like the cells on the map; on phones the six classes sit in a 3 by 2 grid so every word fits at 320 px. Status chips show their hatch in a small swatch before the word, so the word stays readable.
- Panel: slides in when a place is chosen (desktop, off with reduced motion), tighter title, quieter sub-headings, calendar cells on a sunken fill without borders, the current unusual month marked in the list, contribution rows and the "rest" row told apart, planned sections as a dashed card with the title only.
- Bottom sheet: softer shadow and handle, transparent panel inside the sheet.
- Time strip: the selected month is a teal cursor with a flag naming the month ("Aug 2017"), which travels with play and is readable on phones where the side text is hidden. Faint rules mark each January, the "now" mark is labelled above the bars, seam labels sit inside the plot, Play is a round ink button (teal while playing), and the side text has two lines. The space an outlook reserves after "now" (`stripFutureMonths`) is drawn as a dotted teal band labelled "Outlook" at its foot, clear of the seam labels; it stays empty in this MVP.
- `Vision Docs/MVP Implementation Plan.md`: section 10 token table updated to the new values; 8.2 (cell fill and outline), 8.6 (cursor, flag, outlook band), 8.9 (strip height) and 8.10 (basemap colours) follow it; D13 changed and D18 (cell colours and outline), D19 (type) and D20 (time strip look) added to section 13, each with the reason.
- `GroundTruth.md` 3f, `README.md` and `web/README.md` (new Design section, `src/styles` row) point to `web/DESIGN.md` and the tokens.

---

## [2026-11-15] - Validation of the world and daily builds

### Changed

- `npm run validate-data` passes on both full builds: the world build without daily fields (47,305 files, 3,828 s) and the build with the Piedmont daily fields (47,305 files, 3,160 s). The second run also shows the app's contract schemas accept the optional daily fields unchanged.
- The daily build is now in `web/public/firms/` (git-ignored), the folder the app reads with `VITE_DATA_BASE=/firms`. `GroundTruth.md` section 3g records the results.

---

## [2026-11-15] - Whitepaper revised after a referee review (Fable)

### Fixed
- Abstract: mean absolute error grows with area; it is the summed error and the missed share that fall. January 2012 is estimated and sits in the January baselines (stated, was "all observed"). Class frequencies with 13 years corrected (about 16% "much more", 29% each tail, 43% "usual", not "1 in 7"). "Five satellites" is four in the score (also in `Vision Docs/Product Roadmap.md`). Additivity holds to within 0.05 cell-days per cell-month after rounding. The UTC-day limitation no longer names regions without support (also in the README).

### Added
- Figure 1 (`assets/whitepaper_fig1_series.png`, `scripts/whitepaper_figure.py`): world totals per year, raw stitched record against the harmonized score. Key findings box, notation table, class precedence, worked example, FIRMS product folders, data and code availability, how to cite.
- Honest limits from the build's own numbers: the 2020 to 2025 ratios fall outside the band in three seasons; regional ratio spread (0.71 to 41.7, median 3.41) and widest bands; outage counts (51 satellite-months, 42 ranges, 15 in VIIRS baseline months); the detector's miss on the Aqua outage of August 2020; uncorrected Terra outages before 2002-10; what leave-one-year-out does not show.

---

## [2026-11-15] - Method whitepaper

### Added

- `Whitepaper.md`: the scientific write-up of the harmonized score (active cell-days, MODIS to VIIRS ratio per region and season, bootstrap band, additivity, VIIRS-only baseline and classes, small-place rule), with the build's ratio and leave-one-year-out tables, the zero-share gap, outages, limitations, reproducibility and a proposed forecasting section. Text drafted by Gemini from a fact sheet of the build's numbers, then fact-checked and corrected by Claude against `meta.json` and the code. Linked from the README method section.

---

## [2026-11-15] - Daily values for the Piedmont demo (optional contract fields)

### Added

- Demo place (D16): Piedmont, Italy, decided by the user. Preset `piedmont` in `places.json`.
- `pipeline/publish.py`: optional daily fields inside the existing monthly files, only for `publish.daily_areas` (Piedmont, and Piedmont with its neighbouring regions so a demo near the border has no edge effect). Detail tiles get day masks for the rows of selected res 6 cells, overview cells that contain one get `[day, value]` pairs for the whole cell, the summary gets one daily series per area, the manifest a `daily` block. UTC days. Values are the monthly `h` split over the days and rounded with the largest-remainder rule, so every cell and area sums exactly to its month; publish checks this.
- `pipeline/harmonize.py`: keeps the day masks (MODIS union, S-NPP, NOAA-20) in `cells.parquet`, and writes the applied NOAA-20 scale table.
- Size added: 1.8 MB on 2.76 GB (0.07%). `Vision Docs/MVP Implementation Plan.md` section 4.6 documents the fields as "v1 optional daily fields (proposed)". `GroundTruth.md` 3g and section 4 (D16), `pipeline/README.md`.

---

## [2026-11-15] - Place history for the whole world (D8)

### Changed

- `pipeline/config.toml`: `publish.detail_areas` is one world box. H3 centres lie in [-180, 180] x [-90, 90] and the test is inclusive, so every active res 3 cell gets a tile; publish now logs "13,183 of 13,183 active res 3 cells". Only publish was rerun.
- Real build: 13,183 detail tiles instead of 2,024, detail 1.5 GB (was 392 MB), largest tile 1.4 MB, total 2.6 GB in 47,305 files (was 1.4 GB, 36,146). Publish took 361 s. `npm run validate-data` started on it (it takes over an hour on the world build; the result is recorded in a later entry).
- Checked in a browser outside the old areas (Yakutia 2021-07, New South Wales 2019-12, California 2018-11, Zambia 2024-08): history opens and the panel sums of the res 6 detail equal the res 4 overview for h, lo, hi, MODIS and VIIRS.
- `README.md` (section 7 of "How the fire score works"), `GroundTruth.md` 3g, `pipeline/README.md`, `web/README.md`: coverage is the whole world.

---

## [2026-11-15] - README: method section checked against the real build

### Fixed

- "How the fire score works": NOAA-20 sees about 1.02 times what S-NPP sees, not 0.98 (0.98 is the scale back to S-NPP units; the steps of about 1% were right). The Terra-only ratio runs until Aqua has data every day (October 2002; Aqua data starts 2002-07-04). The 7-hexagon and 250 km² leave-one-year-out rows are the same cells in this build. The other quoted numbers match (ratio 2.5 to 3.1, bias 1.004, gap 146 / 100 / 217 regions).

---

## [2026-11-15] - Data build and the web app on real FIRMS data (MVP plan step 15)

### Added

- `pipeline/`: the data build of `ImplementationPlan.md`, one script per step, each reading the previous step's output from disk. `normalize.py` (raw archive CSV to Parquet, `Solution.md` 5.1 schema), `grid.py` (res 6 atom table with day masks, coverage tables, NRT static mask), `harmonize.py` (sensor groups, ratio fit with fallbacks and bootstrap band, Terra-only ratio, leave-one-year-out, measurements behind the method decisions), `publish.py` (contract v1 folder), `build.py` (all steps, then the contract check), `config.toml` (every setting and method decision), `requirements.txt`, `README.md`.
- Run on the full archive (2000-11 to 2026-11-14): 660 million detections, 58.0 million cell-months, about 12 minutes in total. Output `web/public/firms/` (git-ignored): 36,146 files, 1.4 GB. Run times and sizes per step are in `pipeline/README.md` and `data/processed/build_log.json`.
- `npm run validate-data -- public/firms` passes. The app runs on it with `VITE_DATA_BASE=/firms` and no code change, with no Fixture data badge. Rule 1 checked in the browser on three res 4 cells (central Portugal 2017-10, Rondonia 2010-08 estimated, South Sudan 2024-01): the panel sums of the res 6 detail equal the overview file for h, lo, hi, MODIS and VIIRS.

### Changed

- The build follows the team's method decisions D1 to D17 (D4: 2012 to 2025 baseline, NOAA-20 scaling off). The measurements behind them are in `pipeline/README.md` and `GroundTruth.md` section 3g.
- `web/README.md`: how to switch between fixtures (`public/data`) and real data (`public/firms`), including the Git Bash path conversion pitfall. `web/.gitignore` and `web/.prettierignore` skip `public/firms`.
- `GroundTruth.md`: new section 3g (data build, with the measured numbers: D2 NOAA-20 step, D4 zero shares and band widths, outage months in baseline years), step 15 done in 3f. `README.md`: data build section.

### Not done

- Next-year outlook (out of MVP scope), res 7 for a demo area (no demo place chosen), official-record validation (`Solution.md` 6.2 step 7).

---

## [2026-11-15] - Method decisions adopted and explained

### Changed

- The team adopted the MVP plan's defaults D1 to D17 as decisions. D4 is a 2012 to 2025 baseline (VIIRS years only), chosen from the measured zero-share gap between MODIS and VIIRS.
- `README.md`: new section "How the fire score works". For each choice it explains how it works, what it means and why it was chosen:
  - the unit, the filters, the MODIS to VIIRS ratio and the VIIRS satellites;
  - "more than usual", small places before 2012, the map, and the checks.
  - Figures measured on the 2026-11-15 build are quoted: ratio 2.5 to 3.1, leave-one-year-out bias 1.004, NOAA-20 to S-NPP 0.98, zero-share gap by region.
- `GroundTruth.md`: method marked decided.
- `Vision Docs/MVP Implementation Plan.md` section 13: decision note added.

---

## [2026-11-15] - Product roadmap (proposal)

### Added

- `Vision Docs/Product Roadmap.md`: proposal for growing the demo into a product, covering:
  - the empirical outlook and its validation;
  - a hurdle regression that predicts the probability distribution of a place's harmonized score from past scores, with rolling-origin validation;
  - the full predict, explain and recommend models with driver data;
  - a backend for a world-scale map: incremental ingestion of res 6 atoms, versioned harmonization, precomputed tiles on a CDN, and a small API for drawn areas and forecasts.
- It also gives the order of work and lines for three pitch slides. Nothing in it is decided.
- `README.md`: short "From demo to product" section linking to it.

---

## [2026-11-15] - Web app: estimated months of small places are not compared with normal

### Changed

- `web/src/stats`: a place with fewer than `estimatedCompareMinCells` res 6 cells (default 49, one res 4 cell, about 1,800 km²) gets the new class `estimated_only` (code 8) for estimated months: the value and the Estimated marker, no class, no unusual flag, no ratio. Sentence: "{Month} {year}: {v} active cell-days, estimated from MODIS. This area is too small to compare estimated months with normal." Reason: a regional ratio sets the level before 2012 but not how often a small area is zero, so its classes are unreliable (plan finding S1). Recommended in a method review against `Unified Score Research.md` and approved by the user. The threshold is a placeholder until the data build measures the zero-share gap by scale. Larger places, the world series and observed months are unchanged.
- `Series` carries the number of summed cells (`cells`), undefined for the world series.

---

## [2026-11-15] - Personas.md rewritten as a sourced problem definition (draft)

### Changed

- `Vision Docs/Personas.md`: replaced the empty file with a pitch-style problem definition for the four personas (scene, journey with today's tools, cost of failure, gap, validation question per persona), a source-tagged claims audit, a Sources section and draft pitch lines. Drafted by Gemini 3.8 Flash from the team's research docs, then fact-checked by a second model against primary sources. The figures that failed that check were removed or replaced (EU damage figures, Stoner 2020 citation, invented sensor ratios, invented thresholds). Architecture is described as undecided.
- Second rewrite after a deep-research pass (Piemonte AIB plan 2026-2030, JRC 2022, NASA, CAMS, GFED5NRT, Sofiev 2026, Fu 2020 and others). Personas reordered to follow the primary job "is this place burning more than usual, and since when?": regional fire planner and operations desk, climate, carbon and risk modelers, landowner as the demo storyline (no place named, per `Solution.md`), incident commander as a short "also affected" section. Removed: the late-February Susa Valley scene (conflicts with the 1 November to 31 March burning ban), the Langhe vineyard scene, all farm counts (67,148 is the 2010 census figure, 2020 is unconfirmed), "380 winter fires" (a full-year 2022 total) and the old Sofiev and Fu titles. Added a section on where hotspots are weak in Piemonte (most fires are far smaller than a pixel), hypotheses to test, open verification tasks and snippet-level source tags.
- Status: draft for team confirmation. The planner-first framing and the October 2017 Mompantero scene are proposals. The scene must be checked against the team's harmonized archive before use in the pitch. Some Piemonte figures are read from chart images and need a database check. The research report is in the session scratchpad, not in the repo.

---

## [2026-11-15] - Web app: phones as a first-class target

Mobile review after the MVP build. Other fire apps could not be used on phones because scrolling a list triggered its items. Every feature now works by touch, and the checks run in two browser engines.

### Fixed

- Time strip: on touch a swipe scrolled the strip and changed the month at the same time (it selected on touch start and while dragging). Touch and pen now select only on a tap; a mouse still drags to scrub.
- Strip options panel opened behind the bottom sheet on phones and could not be reached.
- Peek stop of the bottom sheet showed the area line and the zoom link instead of the summary sentence.

### Added

- "Strip options" button next to Play on phones: Raw / Harmonized switch and seam check, which were hidden on phones before.
- Legend can be folded away (all screen sizes).
- Phone details: 16 px search text (no iOS zoom on focus), safe-area padding for notched phones, lists, panel and strip scroll without moving the page, links and list buttons at least 44 px high, calendar cells 30 px high on phones.
- `web/tests/e2e/mobile.spec.ts`: 14 phone checks with real touch gestures (swipe never selects, tap selects; panel, calendar, search list and map; peek; drawing by taps; every scientific feature by touch; target sizes; folded legend; axe with the sheet open) at 375 x 667, 320 x 568 and 667 x 375. A WebKit project runs them in Safari's engine too (swipe checks are Chromium only). Full suite: 61 passed, 4 skipped.

### Changed

- `Vision Docs/MVP Implementation Plan.md` 8.9: touch rules (scroll never acts, nothing desktop only, targets, phone details, how it is checked).
- `AGENTS.md`: new rule 6, phones first-class.
- `web/README.md` (Phones section) and `GroundTruth.md` 3f.

---

## [2026-11-15] - Web app: map and historical view (MVP build)

Built from `Vision Docs/MVP Implementation Plan.md`, step by step. Method defaults (D1 to D17) are the plan's defaults, read from `manifest.json` where the plan says so. None of them is a team decision.

### Added

- Step 1, scaffold: `web/` with Vite, React and strict TypeScript, ESLint, Prettier, Vitest and Playwright, design tokens (`src/styles/tokens.css` and a typed copy), Atkinson Hyperlegible Next and Mono self-hosted through `@fontsource`. `web/.gitignore` re-includes `src/data/`, which the repo-wide `data/` rule would otherwise ignore. TypeScript is pinned to 5.9 because typescript-eslint does not support 7 yet. Dev server on 127.0.0.1:5288.
- Step 2, data contract: zod schemas for every file of contract version 1 (`web/src/data/contract.ts`), month helpers, and `npm run validate-data`, which checks each file against its schema and the cross-file rules of plan 4.5 (overview equals the detail sums, the world summary equals the res 3 sums, `h = lo = hi = viirs` from the first reference month, H3 ids and parents). Errors name the file and the path inside it.
- Step 3, fixtures: `npm run fixtures` (`web/scripts/make-fixtures.ts`) simulates fires in the six synthetic regions of plan section 5, observes them with simulated MODIS and VIIRS sensors, harmonizes with the default ratio method and writes the full contract to `web/public/data/` (git-ignored, 26 MB, about 20 s). Two runs give identical bytes. The six built-in checks pass. Note for the team: the plan's detection rates (S-NPP 0.90, MODIS group 0.61) give an expected raw seam step of 0.90 / 0.61 = 1.48, under the plan's own threshold of 1.5, so whether the check passes depends on the simulated year-to-year activity. Seed 1 passes (raw step 1.56, harmonized 1.05). The rates and the threshold are unchanged.
- `validate-data` fix: the res 5 "missing from overview" check now looks only at cells of the file's own res 0 part.
- Step 4, math: pure functions in `web/src/stats/` (place sums, baseline with type 7 percentiles, classes with the band rule and the zero-normal rule, simple-mode sentences, typical and unusual months, record summary, contributions, seam check) and `web/src/grid/` (ladder with hysteresis, place resolution with the 7-cell minimum and the 5,000-cell limit, overlap fill with the plan's fallback, areas and directions). 68 Vitest unit tests cover plan 12.1, including the fixture sums for contract rules 1 and 2.
- Step 5, shell: layout regions (top bar, map, panel, time strip, footer), Zustand store, URL hash sync (map and month changes replace the history entry after 300 ms, place and mode changes push one, invalid values fall back and are rewritten), the panel slot registry with the four slots of plan section 9 (History live, the three later features planned and hidden unless `VITE_SHOW_PLANNED=1`), a data loader with per-resolution LRU caches, request de-duplication and abort, a blocking error with Retry when the manifest fails, and a toast for notices.
- Steps 6 and 7, map with overview and detail (one commit, the code is shared): MapLibre with the deck.gl `H3HexagonLayer` interleaved under the basemap labels, zoom to resolution with hysteresis from the manifest ladder, density colouring with the manifest breaks, a thin ink outline when hexagons are 10 px or wider, crossfade between resolutions (off with reduced motion), legend in words (simple) or numbers with the unit (scientific) with the cell size chip and month status, hover tooltip, res 5 files per res 0 part in view, res 6 from the detail tiles in view (at most 60) read at the month with no new request, and "Detail is not available here in this build." where no tile covers the view. Basemap: OpenFreeMap vector tiles with a small style in the app tokens, falling back to bundled Natural Earth 1:50m land, borders and lakes (`web/public/basemap/`, public domain) when the tiles do not answer in 4 s or `VITE_BASEMAP=local` is set. MapLibre is pinned to 5.x because deck.gl 9.4 does not work with MapLibre 6 in interleaved mode.
- Step 8, places: click rules (res 6 gives the 7-cell neighbourhood, res 3 to 5 the cell under the pointer), search as a combobox (coordinates with N/S/E/W, preset places, Photon geocoder only on Enter with a 4 s timeout and the offline message), "Use my location", polygon and rectangle drawing with terra-draw (Finish button, Enter, Escape), the 7-cell minimum with its message, the 5,000-cell limit checked before the place is set, outlines for the drawn shape (dashed) and the analysis area (solid), and "Zoom to place". Playwright config (local basemap, SwiftShader) and the first UI specs for these rules.
- Step 9, time strip: one bar per month for the world or the selected place on a square-root scale, at least 3 px per month with sideways scroll that keeps the selected month in view, ember bars with a darker bar and a dot for unusual months, diagonal hatch for estimated, dots for provisional, outline for the partial month, a "now" marker with room for future months from the slot registry (0 in this build), slider semantics with value text (Left, Right, Page Up, Page Down, Home, End, Space), click and drag to select, and play (700 ms per month, waits for the map files, prefetches 3, stops at the end). Scientific mode adds the band whiskers, seam marks and a Raw / Harmonized switch.
- Step 10, History section: summary sentence of plan 6.4 with the status marker, an "Unusual" marker and the analysis area (and the last complete month under the partial month), an info button for "active cell-days" in simple mode, the calendar as an HTML table of buttons scaled to the place's own range with hatch, dot and outline, and arrow-key movement, year in context against the manifest percentile band and the median, typical months and the record summary, and the unusual months list (newest first, at most 12). Place and month changes are announced in the polite live region. Fixture note: the Langhe and Susa Valley presets have no activity anywhere in the generated record (Piemonte is the zero-heavy region), so they show the empty-record sentence; Central Portugal shows the active zero-normal wording.
- Step 11, contributions: the History section lists the cells that drive the selected month (sentence of plan 6.6, top 5 with at least 5%, an "Other N active cells" row so the list adds up to 100%, distance and direction from the centre, "Partly outside your shape" for added or boundary cells). While History is open the map draws the place's cells by share in 5 ember steps with everything else dimmed to 35%, the legend switches to shares (the month status chip stays), "Show activity" returns to the normal layer, and a row click flies to its cell.
- Step 12, scientific mode: series view switch on the map (Harmonized, Raw MODIS, Raw VIIRS) that drives the map layer, the legend and the URL, a "Seams" panel on the strip with the seam check of plan 6.7 for the world or the place, and in History a sensor table (harmonized with band, raw groups, each satellite, status), the seam check, baseline detail with the manifest percentiles and the class, provenance with the method lines and the known issues of the month, the method tables from `method.json`, and "Download CSV" (one row per month with a commented header).
- Search: the preset list no longer opens from the automatic focus on load, where it covered the map controls. It opens on click, typing or keyboard focus.
- Step 13, phone and accessibility: under 768 px the top bar keeps only search and the mode switch (data date and fixture note move to the footer), the strip docks at 56 px with the play button, and the panel becomes a bottom sheet with peek, half and full stops (tap or drag the handle). Controls are at least 44 px there. The skip link moves focus without touching the URL hash (it used to replace the hash, which holds the app state, and cleared the place). axe reports no serious or critical issue in simple or scientific mode with a place selected.
- Step 14, tests and docs: the Playwright suite covers plan 12.2 (first load, zoom steps, cell click, presets and coordinates, drawing, Portugal 2017-10, strip keys, scientific mode and seam check, partial and estimated months, CSV, reload from a full URL, phone layout, axe, offline geocoder) plus the manifest and tile error states: 37 checks. Unit tests: 95, including the basemap fallback when the network is blocked or slow. `web/README.md` (run, test, switch to real data, settings, known limits). `GroundTruth.md` section 3f and section 4, and `README.md`, describe the web app as built.

### Not done

- Plan step 15 (switch to real data): waits for the data track. The app needs no code change for it.

### Fixed

- `web/README.md` formatted with Prettier: `npm run lint` failed on a clean checkout because of it. On a clean clone, `npm ci`, `npm run fixtures`, `npm test` (95), `npm run build` and `npm run e2e` (37) pass.
- Time strip: the side column is wider and the value text is one line, so the Raw button and the Seams link are no longer clipped in scientific mode.

---

## [2026-11-15] - MVP Implementation Plan (map and historical view)

### Added

- `Vision Docs/MVP Implementation Plan.md`: final plan for the engineer building the map and historical view. Holds the review of the Map Grid Plan (scientific approach, UI and UX, persona workflows), scope, stack and layout, the frozen file contract (version 1), the fixture generator spec, the sum, baseline and class math with the zero-normal rule, state model, exact interaction rules, the panel slot registry, design tokens, 15 build steps with acceptance criteria, the test plan, and 17 open team decisions with the default in use for each. No method is decided by this document.

### Changed

- `Vision Docs/Map Grid Plan.md` (revision 3): pointer to the final plan, and corrections from the review. A click at res 6 now selects 7 cells, large drawn areas are refused instead of coarsened, detail tiles are per res 3 parent with res 6 cells only, status hatching moves from the map to the strip and calendar, the strip shows the world series when no place is selected, and the URL stores the place definition. New section 11 lists the corrections and the qualifications on density colouring, per-cell harmonized values and the 2012 and 2002 seams.

---

## [2026-11-15] - Unified Score Research: per-cell contributions

### Changed

- `Vision Docs/Unified Score Research.md`: added section 5.1 on the team's design for large areas of interest (one summary score and graph, then which cells drive each peak). It notes that only additive cell-days split exactly into contributions, and covers area baselines, boundary cells and fine-cell uncertainty. Added a matching default-mode pattern and an open question on the spatial unit. Replaced the old "means little without context" limit.
- Same file: aligned with the map and grid proposal (fixed base cell, coarser cells as sums). Calibration checks now refer to the base cell size instead of res 4 or 5 and res 7. Added notes on quantile mapping not preserving sums, non-additive measures staying raw, and zero-median wording. Added an unverified snippet on how MODIS against VIIRS bias depends on grid size.

---

## [2026-11-15] - Map Grid Plan (revision 2)

### Added

- `Vision Docs/Map Grid Plan.md`: map, grid and area-of-interest plan. Res 6 voxel (cell x day x satellite), coarser cells and AOIs as sums, density colouring, 7-cell minimum analysis area, file contract, UI shell with panel slots for later features. Revision 2 adds per-cell contributions, states that harmonized sums stay harmonized only under a plain ratio, keeps the day bitmask raw, adds a zero-normal wording rule, notes the noisier res 6 ratio, and adds three open decisions. Atom resolution res 6 is decided.

---

## [2026-11-15] - Unified Score Research (Brief D report)

### Added

- `Vision Docs/Unified Score Research.md`: first Brief D report. Source table with read status, comparison of how GFED5NRT, GFED5, VNP64A1, MRBA60, C3S, CAMS GFAS, INPE and others merge sensors, three candidate single scores (harmonized active cell-days, rank class, standardized anomaly) with evidence and limits, presentation patterns for the default and scientific modes, deadline fit, and open items. Options only, no method decision.

---

## [2026-11-15] - Brief D: Unified Score Research

### Added

- `Vision Docs/Thread Briefs.md` Brief D: research task on how scientific products merge multi-sensor fire records into one indicator, candidate single-score definitions, and how to present it in the scientific and default modes. Output goes to `Vision Docs/Unified Score Research.md`.

---

## [2026-11-14] - Archive Links

### Added

- `scripts/firms_archive_links.csv`: the 55 FIRMS archive zip URLs (MODIS, S-NPP, NOAA-20, NOAA-21, 2000-11 to 2026-11-14) with request id, source and period. All returned HTTP 200, 11.9 GB in total. README Data section points to it.

---

## [2026-11-14] - Validation Step

### Changed

- `Solution.md` 6.2: added step 7, optional validation against official fire records for the demo region, with its limits.
- `Vision Docs/CurrentSolutionLandscape.md`: softened "no ground truth exists" to say that official records exist for some regions but validate detection, not counts.

---

## [2026-11-14] - Thread Briefs

### Added

- `Vision Docs/Thread Briefs.md`: working briefs for three parallel analysis threads (understand the data and harmonization needs, literature, ground truth plus a real regression and classifier). Includes data locations, schema facts and honesty rules. Tasks, not decisions.

---

## [2026-11-14] - Data Route Update

### Changed

- README.md Data section: the FIRMS Archive Download is now the main route (54 world requests, one per product and year, public zip links on the list page, unzip layout), the API script is for gap filling. Size and time figures replaced with measured values.
- GroundTruth.md section 3e: two non-overlapping sources, archive form limits and cap behaviour, measured archive-vs-API file differences, measured sizes, API plan marked as not used for the bulk.
- Solution.md: removed the stale data caveat in 6.2, corrected the `type` column note (present in Standard files, missing in archive NRT files), added the measured normalization differences (`acq_time` padding, satellite codes) and the archive-first rule.

---

## [2026-11-14] - Demo Framing

### Changed

- `Solution.md`, `Vision Docs/Insight Engine.md`, `Vision Docs/Thread Briefs.md`, `Vision Docs/Personas.md`: replaced "mock", "fake", "illustrative" framing with one demo statement (a demonstration built on the scientific recommendations found, with the full models needing more than the 24 hours of the event). The statement lives in the documentation (Insight Engine section 6); the UI carries only the standard demo notice. Real data and handcrafted examples, described as such.

---

## [2026-11-14] - Two UI Modes

### Changed

- `Vision Docs/Insight Engine.md`: section 1 now defines two modes. A lean default dashboard (latest data, region probability, time graph, causes, actions) for responders and landowners, and a scientific mode (calendar, sensors, provenance, uncertainty). A proposal, not decided; not recorded in GroundTruth.md.
- `Solution.md`: provenance line in the north star aligned with the two modes (status marker in the dashboard, full detail in scientific mode).

---

## [2026-11-14] - Vision Document

### Added

- `Vision Docs/Insight Engine.md`: product vision for a decision support system on top of the harmonized hotspot record (three layers: harmonized history, prediction and explanation, action). A proposal, not a decided design; not recorded in GroundTruth.md.

---

## [2026-11-14] - Implementation Plan

### Added

- `ImplementationPlan.md`: DuckDB as the processing engine, a measured benchmark on the 1.5 GB NOAA-20 2025 file, caveats, and the next data build steps. Kept lean: no option comparison.

---

## [2026-11-14] - Solution Recommendation

### Added

- `Solution.md`: recommended north star for the web app (not decided). Offline Python build (DuckDB, h3) writing small static JSON; static Vite, React, MapLibre and deck.gl front end with no live backend. MVP scope: real harmonized world view and calendar, real neighbourhood history and empirical next-year outlook for one demo place, labelled mock drivers and actions. Data-type rules per FIRMS field, harmonization, baseline and outlook methods, build order to the 16:00 Sunday stop.
- GroundTruth.md: pointer to `Solution.md` as a proposal.

---

## [2026-11-14] - FIRMS Raw Data Ingestion

### Added

- `scripts/download_firms.py`: resumable, throttled worldwide FIRMS Area API downloader. One CSV per product and month under `data/raw/firms/`, manifest and log, waits on the key's transaction usage, retries with backoff, `--dry-run` prints the plan and cost.
- README.md "Data" section for maintainers: key, how to run, layout, time and size, resume, manual bulk download alternative, caveats.
- GroundTruth.md section 3e: confirmed ingestion path, layout, measured API cost, plan size.

### Changed

- `scripts/download_firms.py`: `--skip-years` leaves out years already requested through the FIRMS archive download (2018, 2019, 2023 to 2026), so the two sources do not download the same months.
- `scripts/download_firms.py`: `--key-var` and `--shard I/N` to split the plan across several MAP_KEYs, one process per key. The key counter is per key (measured: one key at 4407 while two others read 0).
- GroundTruth.md: ingestion strategy moved out of Pending (raw files only; storage, schema and index are still open). Noted that the pre-work ban ended with the event start on 2026-11-14.
- README.md: the pre-work rule now says it applied until the event started.

---

## [2026-11-14] - Event Research: Rules, Challenge Brief, Turin Event, Landscape

### Added

- `Hackathon guides/official-rules-and-submission.md`: deadlines, 7-slide or 30-second demo limit, rubric, eligibility checklist, pre-work ban, AI policy, awards. From NASA's Judging & Awards and Project Submission guides (Wayback copies) and GO Team answers on GitHub Discussions.
- `Hackathon guides/challenge-brief-and-clarifications.md`: challenge task, Discussion clarifications, MODIS and VIIRS data facts, sensor status, open decisions.
- `Hackathon guides/turin-local-event.md`: Turin schedule, hand-over and pitch window, sponsors, logistics.
- `Hackathon guides/existing-solutions-and-landscape.md`: FIRMS, Worldview, EFFIS, and public repos from other teams on this challenge. Gap analysis deferred.
- `Hackathon guides/README.md`: index of the guides.
- GroundTruth.md section 3d: NASA rules confirmed from official guides.

### Changed

- README.md: team table with the three members and roles, event section with deadlines and rules, updated structure line.
- GroundTruth.md: team composition updated; removed the open-recruitment line.

### Fixed

- Restored characters eaten by PowerShell escape sequences: the broken code fence in README.md, `assets/` and filenames in GroundTruth.md and Changelog.md, and `feat(...)`/`fix(...)` in AGENTS.md (typo repair only, no rule changed).
- README.md: added a "Start Here" reading order and a note that `Info.local/` is not in the repository.

### Fixed (submission tracks)

- `official-rules-and-submission.md` now separates the Turin local submission from the NASA platform submission in a side-by-side table (deadline, deliverables, where, who judges, limits) and marks what is unknown for Turin. README, `turin-local-event.md` and GroundTruth aligned.

### Fixed (Turin format)

- Recorded the team's information that the Turin presentation is 4 minutes plus 2 minutes of discussion, with a live demo allowed, no slide limit and no separate hand-over, and that work stops at 16:00 with everything submitted. Marked as team-reported because the recordings do not contain it. Updated the rules guide, Turin guide, pitch guides, README and GroundTruth.

### Changed (official pages read)

- Read the official challenge Details and Resources tabs and the public team page in the preview browser (fetch and curl still fail TLS). Replaced the condensed brief in `challenge-brief-and-clarifications.md` with the official wording, objectives and optional considerations. Resources tab lists only FIRMS. Team page About text is still the old recruiting text. GroundTruth, README and guides index updated.

### Known gaps

- Team registration confirmed by the team (2026-11-14); recorded in the rules guide and GroundTruth.
- The official challenge page and team page could not be fetched by tools (TLS certificate chain untrusted); resolved by reading them in the preview browser. Only the login-gated Project tab remains unread.

---

## [2026-11-14] - Slides, Name Cross-Check and Repo Reorganization

### Added

- `Hackathon guides/` (tracked): `presentation-and-criteria.md` and `judge-panel.md`, written by the Gemini 3.8 Flash (Medium) copywriter and reviewed against the sources.
- `Info.local/organizer-briefings/` (local only): slide photos with `slides-transcribed.md`, a Whisper vs Qwen3-ASR name cross-check, and the relocated pipeline.
- Confirmed event facts from the slides (criteria incl. Validity, deadlines, sponsors) in GroundTruth.md section 3c.
- `Hackathon guides/judge-profiles.md`: public-record matches for the jury and mentors, their organizations, past Turin winners and a likely judging lens, with confidence labels and sources.

### Changed

- Moved the briefing workspace out of the shared tree into git-ignored `Info.local/`; `.gitignore` now ignores `Info.local/`. Updated the transcription script paths and the brief template accordingly.
- Guides updated with the slide evidence: the third criterion is Validity, the closing tip is "End with purpose", submission deadlines added.

### Fixed

- Removed unverified employer and program names that an earlier guide draft had filled in from model memory.

---

## [2026-11-14] - Organizer Briefings Pipeline

### Added

- Added support for local developer overrides via git-ignored AGENTS.local.md.
- `organizer-briefings/` with `audio/` (git-ignored), `transcripts/`, `guides/` and `prompts/`, plus a README describing the workflow.
- `scripts/transcribe_briefings.py`: transcribes audio with Whisper large-v3-turbo using the ParkASR weights and virtualenv; writes one Markdown transcript per audio file with front matter, full text and timestamped segments.
- `organizer-briefings/prompts/copywriter_brief.md`: brief template for the Gemini 3.8 Flash (Medium) copywriter subagent (presentation/criteria guide and judge panel guide).
- Raw Whisper transcripts of the three organizer recordings and eight by-topic slices in `organizer-briefings/transcripts/by-topic/`.

### Fixed

- `scripts/transcribe_briefings.py` now decodes audio with ffmpeg (the HF pipeline failed on `.mp4`) and exits non-zero when any file fails.

---

## [2026-11-14] - Repository Inception & Governance Setup

### Added

- Standardized the repository structure in accordance with the DevBOOTSTRAP 4-document governance framework.
- Created README.md introducing the team, challenge overview, and repository layout.
- Created GroundTruth.md as the living technical source of truth, establishing confirmed invariants and clear boundaries against unverified assumptions.
- Created AGENTS.md containing active steering rules, commit protocols, and verification gates.
- Added project visual assets (`the_hotspots_banner.jpg`, `the_hotspots_avatar.jpg`) under `assets/`.
- Configured .gitignore for Python environments, Node.js, and data caches.

### Changed

- Wiped all speculative, unverified documentation and premature implementation plans to start with a clean, focused repository.
