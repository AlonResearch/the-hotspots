# MVP Implementation Plan: Map and Historical View

> **Current role (2026-11-15)**: the app is built from this plan. It remains the reference for the data contract (section 4) and the decision list D1 to D27 (section 13), which the team decided on 2026-11-15. The status lines below are from before those decisions. What was built and measured is in [GroundTruth.md](../GroundTruth.md).
>
> **Status**: final plan for the map plus historical view, 2026-11-15. It supersedes `Map Grid Plan.md` wherever the two differ. It is written for the engineer who builds the web app.
>
> **What is decided and what is not**: the team has decided the base cell (H3 res 6) and the overall shape (offline build, static files, no backend). The harmonization method, the baseline period, the classes and the wording are **not decided**. Section 13 lists every open decision with the default the engineer uses until the team decides. Defaults are recommendations, not decisions. Every default that depends on the method is read from `manifest.json`, so a team decision changes data, not code.
>
> **AI disclosure**: an AI assistant (Claude) reviewed the plan and drafted this text. The team owns the method decisions.

> **Note (2026-11-15)**: mentions of `Solution.md`, `ImplementationPlan.md`, `Map Grid Plan.md` and `Thread Briefs.md` refer to early hackathon plans that were removed from the repository; they are in the git history.

Contents: 1 review findings, 2 scope, 3 stack and layout, 4 data contract, 5 fixture generator, 6 math, 7 state and components, 8 interactions, 9 panel slots, 10 design tokens, 11 build steps, 12 test plan, 13 open decisions, 14 what to cut first.

---

## 1. Review findings

### 1.1 Scientific approach (against `Unified Score Research.md`)

Sound and kept: per-satellite res 6 atoms, active cell-days as the additive measure, coarser cells and areas as sums, VIIRS-equivalent reference, a plain ratio fitted on the overlap (the GFED5NRT and GFED5 pattern), leave-one-year-out (MRBA60 pattern), baselines from the summed area series, a wording rule for a zero normal.

Problems found:

| # | Finding | Why it matters | What this plan does |
|---|---|---|---|
| S1 | **A ratio cannot create activity in a cell where MODIS saw none.** Zero times any ratio is zero. Before 2012 the harmonized value sits only in the cells MODIS marked, and those cells get values above what one cell can have (a ratio of 3 on 20 MODIS days gives 60 "days" in a 31 day month). Regional sums are right. Single cells are not. | A res 6 cell that VIIRS sees once a year and MODIS never sees has a zero history before 2012 and activity after. Its own baseline then shows a false step at 2012. This is the seam, moved from the total to the cell. The 7-cell area reduces it and does not remove it. | Per-cell harmonized values are never capped (capping breaks the sums). Before 2012 they carry the "estimated" status. A click at res 6 selects the 7-cell neighbourhood, not one cell (U2). The map is coloured by activity level, not by per-cell class (S7). The team must measure the zero share per cell before and after 2012 (decision D4). |
| S2 | **The bootstrap band is a calibration band, not a per-cell error.** It is the spread of the regional ratio. Applied to one cell it gives a band of [0, 0] for a zero MODIS cell, which looks certain and is not. | The rule "unusual only when outside the band" is too easy to pass for small areas. | `lo` and `hi` stay in the contract and add up. The real error by size of area comes from leave-one-year-out, published in the optional `method.json` and shown in scientific mode. |
| S3 | **Leave-one-year-out "at res 6" has no metric yet.** Relative error is undefined on zeros. | Untestable as written. | Recommended metric set (decision D9): for each held-out year, at res 6, 7-cell ring, res 5, res 4 and region: bias (sum predicted / sum observed), mean absolute error in cell-days, and the share of cell-months where MODIS has zero and VIIRS does not. |
| S4 | **The overlap is short and the reference is not fixed.** S-NPP alone covers 2012 to 2018-03. Terra and Aqua drift after about 2020. A fit on 2012 to 2019 has 8 years, so a bootstrap over years gives a rough band. | The band is an indication, not a confidence interval. Say so in scientific mode. | Default (D2, D3): fit on 2012-02 to 2019-12 with S-NPP as reference, compare with a 2020 to 2025 fit and show the difference as a finding. |
| S5 | **January 2012 is a partial VIIRS month** (S-NPP starts 2012-01-20, measured in GroundTruth.md). | Treating it as observed puts a dip at the seam. | First observed reference month is 2012-02. January 2012 is MODIS-derived and "estimated". |
| S6 | **MODIS has its own seam.** Terra is alone until Aqua starts (FIRMS Aqua data begins mid 2002, verify the month in the archive). A ratio fitted on Terra plus Aqua does not apply to Terra-only months. The plan does not mention this. | A false step in 2002. MRBA60 drops 2001 and 2002 for a related reason. | Default (D5): a separate Terra-only ratio for those months, and the baseline starts in 2003. |
| S7 | **Density colouring does not stop colours changing with zoom.** One active day in a res 6 cell is 27.7 cell-days per 1,000 km². One in a res 3 cell is 0.08. The mean is preserved across zoom, the spread is not: fine cells are either empty or dark. | The plan's claim (issue 6, section 3) is too strong. It is still the right unit, because it is the only one that is comparable between areas. | Log-spaced breaks from the manifest. The legend always states the cell size. A per-cell "compared with normal" map is off by default: at res 6 nearly every normal is zero, so any fire would read as "more than usual". |
| S8 | **"Region x season" is not defined**, and regions with little fire have too few active cells for a fit. | Cannot build until chosen. | Default (D6): H3 res 1 parent x 3-month season, falling back to the res 0 parent and then to a global ratio when the stratum has too little overlap data (MRBA60 uses a similar fallback). No external boundary file needed. |
| S9 | **Partial and outage months.** The current month has 14 days. S-NPP lost days in 2022-07 and 2022-08, Aqua in 2020-08, Terra in 2001-06 (from the research doc, to verify in the atoms). | A partial month compared with full-month history reads as "quieter than usual". | `partial_months` and `known_issues` in the manifest. No class is shown for a partial month. |
| S10 | **Per-satellite display has no data.** The plan promises a sensor picker per VIIRS satellite, and the published files carry only one MODIS and one VIIRS value. | Scientific mode cannot show the 2018 and 2023 satellite additions. | Optional per-satellite arrays in the contract (`sat`). The UI shows them when present. |
| S11 | **UTC days.** Where local night spans UTC midnight (Americas, East Asia and Pacific), one local burning day can count as two UTC days, differently for each overpass time. | The regional ratio absorbs the average effect. It is a stated limit, not a blocker. | Default stays UTC `acq_date` as in the plan. Local solar date is a cheap alternative for the data owner (D10). |

Too big for the deadline (about 14 hours left at the time of writing, hand-in at 16:00):

- **Global res 6 detail.** The world at res 3 and res 4 is cheap because it is sums. Res 6 series for every active cell on Earth is a large build and thousands of files. Default (D8): detail for Europe, the Mediterranean and the demo regions first. The UI reads coverage from `detail/index.json` and says "History is not available for this area in this build" elsewhere.
- **Raw footprints.** Needs the demo place. Out of this MVP (slot and file name reserved).
- **Homogeneity tests, quantile mapping, official-record validation.** Not needed for the map and history view.

### 1.2 UI and UX (against `Personas.md` and `Insight Engine.md`)

| # | Finding | Fix in this plan |
|---|---|---|
| U1 | Insight Engine says history is never the entry point of the default mode. In this MVP history is the only live content. | The panel is a slot list ordered per mode (section 9). In simple mode the later slots (outlook, why, what to do) sit above History when they exist. Nothing else in the layout changes then. |
| U2 | The plan sets a 7-cell minimum analysis area, and also makes a clicked res 6 cell the place. These contradict each other. | A click at res 6 selects the cell plus ring 1 (7 cells). Clicks at res 3 to 5 select that cell (253 km² or more). |
| U3 | Hatching every hexagon for "estimated" does not work: status belongs to the month, so the whole map would be hatched before 2012. deck.gl's H3 layer also has no simple hatch fill. | Month status is one chip next to the legend. Hatching is used on the time strip and the calendar, where months sit side by side. |
| U4 | The two lightest ramp colours have a contrast of 1.03 and 1.49 against the ash basemap (measured). Low activity is invisible. | Active cells get a thin ink outline when hexagons are 10 px or wider, and cell fill opacity is fixed. Tokens in section 10. |
| U5 | "Arrow keys change the month" conflicts with MapLibre's keyboard panning. | Arrow keys change the month only while the time strip has focus (it is a slider). The map keeps its own keys. |
| U6 | The strip is said to show "the view or the place". A series for an arbitrary view is not in any file. | With no place selected the strip shows the world series from `summary/global.json`. This also gives the raw against harmonized seam view on first load. |
| U7 | The simple-mode text uses "active cell-days", which is jargon, and the legend unit "cell-days per 1,000 km²" means nothing to a landowner. | Simple mode leads with a class sentence and "in N of M years". The legend uses words (Low to High). The unit appears in scientific mode and behind an info button. |
| U8 | A WebGL map cannot be read by a screen reader or driven cell by cell from the keyboard. | Every map action has a non-map path: search, preset places, "Use my location". The calendar is a real HTML table. The strip is a slider with a text value. |
| U9 | Putting cell ids in the URL fails for large areas (5,000 ids). | The URL stores how the place was made (cell id, point, or encoded polygon). Cells are recomputed from it. |
| U10 | "More than about 5,000 cells: use a coarser resolution" needs coarse series the files do not need to carry, and changes values. | Hard limit of 5,000 res 6 cells (about 180,000 km²) for a drawn area, with a plain message. |
| U11 | The data is a static build, not live. Nothing in the plan tells the user how old it is. | "Data through 14 Nov 2026" is always visible, plus a "not for safety of life" line in the footer. |
| U12 | Hover is the only way to read a cell value. Touch has no hover. | Tap shows the same tooltip content in the panel header. |
| U13 | The geocoder is an online dependency and sends the typed text to a third party. | Coordinates and preset places work offline and are tried first. The geocoder is called only on Enter. |

### 1.3 User workflows

**Landowner (vineyard, Langhe).** Opens the app, sees a world map for a month. Searches the village, the map flies there, the place is the 7-cell neighbourhood.
- Fails: the first screen asks nothing of them. Fix: the search box has focus on load, with preset places and "Use my location" under it.
- Fails: a quiet area returns an empty calendar and "usually none" for every month. Fix: an explicit summary such as "Fire activity was detected here in 4 of 23 years" and a typical-months sentence that can say "No regular fire season in the record".
- Fails: a 50 ha drawing returns no cells in the old plan. Fixed by overlap mode plus the 7-cell minimum, with the message that satellites cannot resolve an area that small.
- Not answered by this MVP: "is it safe to burn this week". That is the outlook, why and what-to-do slots.

**Responder (duty officer, Susa Valley, a cluster in the current month).** Draws the valley, wants to know if this month is unusual.
- Fails: the current month is partial and provisional, so no class can be shown. The plan compares whole months only. Fix in this MVP: show "so far (14 of 30 days)" with the count, no class, and the class of the last complete month. A month-to-date comparison needs day-level data and is listed as later work.
- Fails: nothing to send to the incident log. Fix: the URL restores the exact view, and scientific mode has "Download CSV" for the place series.
- Works: the per-cell contributions show which part of the valley drives a month.

**Scientist (checking the 2012 seam).** Switches to scientific mode with no place selected.
- Works after U6: the world strip shows raw (MODIS before 2012-02, VIIRS after) against harmonized, with seam marks.
- Fails: no number for the step. Fix: a "seam check" line computed in the browser (mean of the 36 months after the seam over the mean of the 36 months before, for raw and for harmonized).
- Fails: no ratio, no out-of-sample error, no method version. Fix: `manifest.method` text and the optional `method.json` table.
- Fails: satellites added in 2018 and 2023 are invisible. Fix: optional `sat` arrays.
- Fails: cannot take the series away. Fix: CSV download.

**Incident commander.** Clicks a cell, reads the calendar. Works. Speed matters: no login, one click to history, cached tiles.

---

## 2. Scope

**In**
- World map of monthly burning activity on H3 cells, four resolutions by zoom, month selection and play.
- Place selection: click, search (coordinates, presets, geocoder), "Use my location", draw polygon or rectangle.
- Time strip for the world or the place.
- History section: summary sentence, calendar, year in context, typical months, unusual months, per-cell contributions.
- Simple and scientific modes. Scientific adds raw against harmonized, sensors, band, seam marks, seam check, baseline detail, provenance, CSV.
- URL state, mobile layout, keyboard and screen reader paths.
- Fixture generator and a data validator. The app runs on fixtures until real files exist, with no code change at the switch.

**Out (slot only, not implemented)**
- Next 12 months outlook (panel slot plus reserved space at the right end of the time strip).
- Why and What to do (panel slots).
- Raw detection footprints (reserved file name `demo/footprints.json`, no UI).
- Extra driver layers (soil moisture, FWI). The cell layer takes any value per cell per month, nothing more is built.

**Out entirely**
- The data build (owned by the data track: `ImplementationPlan.md`). This plan only fixes what it must output.
- Backend, accounts, live FIRMS calls, globe projection, deployment.

---

## 3. Stack and project layout

The proposed stack is confirmed, with three changes.

| Part | Choice | Note |
|---|---|---|
| App | Vite + React + TypeScript (strict) | Confirmed. Static output, fast dev server. |
| Map | MapLibre GL JS | Confirmed. No token. Mercator. |
| Cells | deck.gl `H3HexagonLayer` through `MapboxOverlay` (`@deck.gl/mapbox`, `@deck.gl/geo-layers`) | Confirmed. Takes cell ids, no geometry shipped. Try interleaved mode with the layer placed under the basemap labels. If that misbehaves, use overlaid mode with fill opacity 0.8. |
| Grid math | h3-js v4 | Confirmed. Needs `polygonToCellsExperimental` with the overlapping flag (added in 4.2, verify on install). Fallback in 8.4. |
| Drawing | terra-draw with its MapLibre adapter | Confirmed from `Solution.md`. |
| State | Zustand | **Added.** One small store, synced to the URL. Less code than context plus reducers. |
| Charts | Hand-written SVG components (d3-scale and d3-array only) | **Changed** from ECharts. The strip and the calendar are the signature elements, need hatch patterns, exact tokens and slider and table semantics. ECharts would add about 1 MB and fight all three. |
| Validation | zod schemas for every data file | **Added.** The same schemas type the app, check the fixtures and check the real build. |
| Fonts | Atkinson Hyperlegible Next, self-hosted through `@fontsource` | No network font request. Check tabular figures. If missing, use Atkinson Hyperlegible Mono for numbers. |
| Tests | Vitest (unit), Playwright with axe-core (UI) | |
| Lint | ESLint, Prettier, `tsc` with no emit | |

Pin exact versions in `package.json` at install time. Commit the lockfile.

```
web/
  index.html
  package.json  vite.config.ts  tsconfig.json  playwright.config.ts
  public/
    basemap/            Natural Earth land, countries, lakes (GeoJSON, committed)
    data/               generated (fixtures or real build). Git-ignored by the repo rule "data/"
  scripts/
    make-fixtures.ts    section 5
    validate-data.ts    checks a data folder against the contract
  src/
    main.tsx  App.tsx
    data/      contract.ts (zod schemas and types)  loader.ts  cache.ts
    grid/      ladder.ts  place.ts  area.ts  viewport.ts
    stats/     series.ts  baseline.ts  classify.ts  wording.ts  contributions.ts  seam.ts
    state/     store.ts  url.ts
    map/       MapStage.tsx  CellLayer.ts  PlaceOutline.ts  DrawControl.tsx  Legend.tsx  basemap.ts
    panel/     PlacePanel.tsx  registry.ts  sections/History/...  sections/Planned.tsx
    strip/     TimeStrip.tsx
    ui/        TopBar.tsx  Search.tsx  MoreMenu.tsx  ModeSwitch.tsx  StatusMarker.tsx  BottomSheet.tsx
    styles/    tokens.css  base.css
  tests/
    unit/  e2e/
```

Commands: `npm run dev`, `npm run build`, `npm run preview`, `npm run fixtures`, `npm run validate-data`, `npm run test`, `npm run e2e`, `npm run lint`.

`web/public/data/` is ignored by the existing `.gitignore` rule for `data/`. Fixtures are therefore regenerated, not committed, and the generator must be deterministic. The data folder can be changed with the environment variable `VITE_DATA_BASE` (default `/data`).

Repo rules for the engineer: record changes in `Changelog.md` before each commit, commit locally to main with conventional messages, never push, update `GroundTruth.md` once the app exists and is verified, and do not touch files outside `web/` and the four documents.

---

## 4. Data contract (frozen, version 1)

All files are JSON, UTF-8, under the data base folder. Months are strings `YYYY-MM`. A **month index** is the number of months since `record.start` (0 for the first month). H3 ids are 15-character lowercase hex strings. All activity values are **active cell-days per month**: the number of (res 6 cell, UTC day) pairs with at least one qualifying detection, summed over the res 6 cells that make up the cell or area. Harmonized values are VIIRS-equivalent and may be fractional. A per-cell harmonized value may exceed the number of days in the month (finding S1). Values are rounded to 1 decimal.

Value names used everywhere:

| Name | Type | Meaning |
|---|---|---|
| `h` | number ≥ 0 | Harmonized value |
| `lo`, `hi` | number, `lo ≤ h ≤ hi` | Calibration band. Equal to `h` for observed months |
| `modis` | number ≥ 0 | Raw MODIS group value (0 where MODIS has no data) |
| `viirs` | number ≥ 0 | Raw VIIRS reference group value (0 before the first VIIRS data) |
| `sat` | object, optional | Raw per-satellite values. Keys from `terra`, `aqua`, `snpp`, `noaa20`, `noaa21`. Each is an array aligned with the others |

### 4.1 `manifest.json`

```json
{
  "contract_version": 1,
  "source": "fixture",
  "built_at": "2026-11-15T01:30:00Z",
  "data_through": "2026-11-14",
  "atom_res": 6,
  "record": { "start": "2000-11", "end": "2026-11" },
  "first_reference_month": "2012-02",
  "status_ranges": [
    { "from": "2000-11", "to": "2012-01", "status": "estimated" },
    { "from": "2026-08", "to": "2026-11", "status": "provisional" }
  ],
  "partial_months": [ { "month": "2026-11", "days_covered": 14, "days_in_month": 30 } ],
  "seams": [
    { "month": "2002-07", "label": "Aqua starts" },
    { "month": "2012-02", "label": "VIIRS starts (S-NPP)" },
    { "month": "2018-04", "label": "NOAA-20 added" },
    { "month": "2023-03", "label": "NOAA-21 added" },
    { "month": "2026-11", "label": "S-NPP ends" }
  ],
  "known_issues": [
    { "from": "2022-07", "to": "2022-08", "satellite": "snpp", "note": "S-NPP outage, 16 days" }
  ],
  "baseline": { "start_year": 2003, "end_year": 2025, "min_years": 10, "exclude_target_year": true },
  "classes": { "p_low": 25, "p_high": 75, "p_very_high": 90, "min_normal_for_ratio": 3 },
  "ladder": [
    { "res": 3, "min_zoom": 0,   "source": "overview" },
    { "res": 4, "min_zoom": 4.5, "source": "overview" },
    { "res": 5, "min_zoom": 6.0, "source": "overview" },
    { "res": 6, "min_zoom": 7.5, "source": "detail" }
  ],
  "ladder_hysteresis": 0.3,
  "overview": { "r5_parts": ["801ffffffffffff", "803ffffffffffff"] },
  "detail": { "tile_res": 3, "max_place_cells": 5000 },
  "color": { "density_breaks": [1, 5, 25, 100, 300] },
  "method": {
    "version": "fixture-1",
    "reference": "VIIRS-equivalent",
    "transfer": "Ratio per region and season, fitted on 2012-02 to 2019-12",
    "viirs_group": "Mean of S-NPP and NOAA-20 when both are nominal",
    "filters": "type 0, confidence nominal or high",
    "notes": ["Free text lines shown under Provenance."]
  }
}
```

| Field | Type | Rule |
|---|---|---|
| `source` | `"fixture"` or `"firms"` | The app shows a "Fixture data" badge when it is `fixture` |
| `record` | months, inclusive | Every month in the range has overview files |
| `first_reference_month` | month | Before it the "raw" series is MODIS, from it on it is VIIRS |
| `status_ranges` | list | Months not covered are `observed`. Ranges do not overlap. Status values: `estimated`, `provisional` |
| `partial_months` | list | Months with incomplete coverage. No class is computed for them and they are never part of a baseline |
| `seams` | list | Drawn on the strip in scientific mode |
| `known_issues` | list | Shown under Provenance, and on a month when it falls in the range. `satellite` is optional |
| `baseline` | object | Calendar years used for "normal". See section 6 |
| `classes` | object | Percentiles for the classes and the smallest normal for ratio wording |
| `ladder` | list, ascending `min_zoom` | Zoom to resolution. `source` says which files feed that resolution |
| `overview.r5_parts` | list of res 0 ids | The res 0 parents for which res 5 overview files exist |
| `detail.tile_res` | integer | Resolution of the parent cell that names a detail tile |
| `color.density_breaks` | 5 ascending numbers | Class limits in cell-days per 1,000 km² per month. 6 colour classes |
| `method` | strings | Display only. The app never branches on them |

### 4.2 Overview files (one month, many cells)

- `overview/r3/{YYYY-MM}.json`
- `overview/r4/{YYYY-MM}.json`
- `overview/r5/{res0 id}/{YYYY-MM}.json` for every id in `overview.r5_parts`

Each file exists for every month of the record (with empty arrays when there is no activity).

```json
{ "month": "2024-08", "res": 4,
  "cell": ["841e9a3ffffffff"], "h": [41.0], "lo": [41.0], "hi": [41.0],
  "modis": [17], "viirs": [41.0], "cls": [5] }
```

Arrays have equal length. A cell is listed when any of `h`, `modis`, `viirs` is above 0. `cls` is optional (class against the cell's own normal, codes in 6.4). The app does not use it by default.

### 4.3 Detail tiles (all months, res 6 cells)

- `detail/index.json`: `{ "tile_res": 3, "tiles": ["831e9afffffffff", ...] }`, the parents that have a tile. The app never requests a tile that is not listed.
- `detail/{parent id}.json`:

```json
{ "parent": "831e9afffffffff", "res": 6, "start": "2000-11", "n_months": 313,
  "cells": ["861e9a007ffffff", "861e9a017ffffff"],
  "offsets": [0, 3, 5],
  "mi":    [140, 141, 285,  141, 290],
  "h":     [6.2, 3.1, 4.0,  9.3, 2.0],
  "lo":    [5.1, 2.6, 4.0,  7.7, 2.0],
  "hi":    [7.4, 3.7, 4.0, 11.1, 2.0],
  "modis": [2, 1, 2,  3, 1],
  "viirs": [0, 0, 4.0,  0, 2.0],
  "sat": { "snpp": [0, 0, 4,  0, 2], "noaa20": [0, 0, 4,  0, 2] } }
```

- `cells`: res 6 ids whose parent at `tile_res` is `parent`, sorted ascending. Only cells with any activity in the record.
- `offsets`: length `cells.length + 1`. The entries of cell `k` are positions `offsets[k]` to `offsets[k+1] - 1` of every value array.
- `mi`: month indexes, ascending within a cell. A month is listed when any value is above 0. Missing months are zero.
- Coarser cells are **not** stored. The app sums res 6 cells. The sums must equal the overview files (tested).

Changes from the Map Grid Plan, with reasons: tiles are named by the res 3 parent, not res 2 (a res 2 tile in a fire-dense region is an estimated 4 to 5 MB of JSON, and a 7-cell place would load all of it. A res 3 tile is a seventh of that, and a click on a res 3, 4 or 5 cell needs exactly one tile). Res 3 to 5 series are dropped from the tile because they are sums of what is already there. Sizes are estimates until the first real build. `tile_res` is in the manifest so the data owner can change it.

### 4.4 Other files

- `summary/global.json`: `{ "start": "2000-11", "n_months": 313, "h": [], "lo": [], "hi": [], "modis": [], "viirs": [], "sat": {} }`. Dense arrays of length `n_months`. World totals.
- `places.json`: `[ { "id": "sicily", "name": "Sicily, Italy", "lat": 37.6, "lon": 14.2 } ]`. Preset places for search. The demo place goes here when chosen.
- `method.json` (optional): `{ "ratios": [ { "region": "811e7ffffffffff", "season": "JJA", "ratio": 3.1, "lo": 2.6, "hi": 3.7, "n_years": 8 } ], "loyo": [ { "scale": "res6", "bias": 1.04, "mae": 2.3, "n": 120000 } ] }`. `scale` is one of `res6`, `ring7`, `res5`, `res4`, `region`. Rendered as two tables in scientific mode when present.
- `demo/footprints.json`: reserved, not read.

### 4.5 What the data build must guarantee

1. Overview values at res 3, 4 and 5 equal the sum of their res 6 descendants in the detail tiles, within 0.1 per summed cell, wherever a detail tile exists.
2. `summary/global.json` equals the sum of the res 3 overview file for each month.
3. For months at or after `first_reference_month`: `h = lo = hi = viirs`.
4. Every file passes `npm run validate-data`.

For the data owner: the atom table of the Map Grid Plan (section 6.1) is unchanged. The publish step converts `UBIGINT` cell ids to hex strings.

### 4.6 v1 optional daily fields (proposed)

Added 2026-11-15 by the data build (`pipeline/publish.py`, `publish.daily_areas`). They are optional keys inside the existing monthly files, with no new files per day, and only for the demo place (decision D16: Piedmont) and its neighbouring regions. The app's zod schemas strip unknown keys, so the current app and `npm run validate-data` read these files unchanged. Days are **UTC acquisition dates** (decision D10). Day `d` of a month is bit `d - 1` of a mask.

**Where.** A res 6 cell is selected when its centre is inside one of the `manifest.daily.areas` boxes. An overview cell (res 3, 4 or 5) gets daily values when it contains at least one selected res 6 cell, and those values cover the whole cell (all its res 6 children), so its days sum to its monthly `h`. Everything else is unchanged.

| File | Field | Content |
|---|---|---|
| `manifest.json` | `daily` | `{ "areas": [{name, bbox}], "res6_cells": n, "days": "utc" }`. Tells the app where daily data exists; it hides daily controls elsewhere |
| `detail/{parent}.json` | `daily` | Only in tiles with selected cells: `{ "rows": [...], "dm_modis": [...], "dm_snpp": [...], "dm_noaa20": [...] }`. `rows` are row positions (aligned with `mi`) of the selected res 6 cells; each mask array is aligned with `rows`. MODIS is Terra or Aqua |
| `overview/r3`, `r4`, `r5` | `daily` | Only in files with such cells: `{ "idx": [...], "d": [...] }`. `idx` are positions in `cell`; `d[k]` is the list of `[day, value]` pairs of cell `idx[k]`; missing days are 0 |
| `summary/global.json` | `daily_areas` | Per area: `{ name, bbox, res6_cells, daily_start, daily_h }`, the value of the area's selected res 6 cells per UTC day from `daily_start` (the first day of the record) to `data_through`. No world daily series |
| `method.json` | `daily` | The rule below, the UTC label, whether the NOAA-20 scale is applied, and `viirs_weights`: per month from `first_reference_month`, the weight of each VIIRS satellite in the mean |

**How a day's value is derived.**
- Before `first_reference_month`: `h x bit / modis`, where `bit` is the day's bit of `dm_modis`. It sums exactly to the monthly `h`.
- From it on: each day weighs `sum over s of viirs_weights[month][s] x bit_s` (NOAA-20 times its scale when the scale is applied), and `h` is spread in proportion. Because the monthly `viirs` is rounded to 0.1, the days derived from the masks sum to `h` within 0.05 per cell.
- The overview `d` and the summary `daily_h` values are that split rounded with the largest-remainder rule in tenths. So the days of every cell, and of every area, sum **exactly** to the monthly `h`; the publish step checks this for every cell-month with daily values at every resolution and for every area.

---

## 5. Fixture generator

`web/scripts/make-fixtures.ts`, run with `npm run fixtures`. Node, TypeScript, h3-js, a seeded generator (mulberry32, seed in a constant). Same seed gives byte-identical output. It writes the full contract of section 4 with `source: "fixture"`. It runs in under 2 minutes and writes less than 80 MB.

The generator simulates fires and two imperfect sensors, then **harmonizes the simulated data with the default method**, so the fixtures have the same oddities as the real build (values above 31, zero MODIS cells, a rough band).

**Regions.** Six, each the res 3 cell at the centre plus ring 1 (7 detail tiles, 2,401 res 6 cells).

| Id | Centre (lat, lon) | Season (peak months) | Level | Purpose |
|---|---|---|---|---|
| `sicily` | 37.6, 14.2 | Jul, Aug | medium | Mediterranean summer season |
| `portugal` | 39.9, -8.1 | Aug, with Jun to Oct shoulder | medium | Synthetic extreme months in 2017-06 and 2017-10 |
| `evros` | 41.0, 26.0 | Jul, Aug | low | Synthetic extreme month in 2023-08 |
| `piemonte` | 44.9, 7.6 | Feb, Mar | very low | Zero-heavy. Most cells never active |
| `sahel` | 8.0, 27.0 | Nov to Feb | very high | Near saturation at res 6 in season |
| `matogrosso` | -11.5, -54.5 | Aug, Sep | high | Southern hemisphere, year-to-year trend |

The extreme months are synthetic test events. They do not reproduce real fires.

**Fire model.** For cell `c`, month `t` with `D` days: daily fire probability `p = min(0.95, base[c] * season[region][month] * year[region][year] * event[region][t])`.
- `base[c]` = region level x lognormal noise (sigma 1.2) x a smooth bump around 3 random foci per region. A region-specific share of cells (60% in `piemonte` and `evros`, 30% elsewhere, 5% in `sahel`) is multiplied by 0.02.
- Region levels: sahel 0.30, matogrosso 0.08, sicily 0.02, portugal 0.02, evros 0.01, piemonte 0.002.
- `season`: 12 weights between 0.02 and 1. `year`: lognormal (sigma 0.35) plus a linear trend for `matogrosso`. `event`: 8 for the synthetic extreme months, else 1.
- Fire days `F ~ Binomial(D, p)`.

**Sensors.** Given `F` fire days:
- `terra ~ Binomial(F, 0.35)`, from 2000-11. `aqua ~ Binomial(F, 0.40)`, from 2002-07. `modis` = MODIS group days `~ Binomial(F, 0.61)` when both fly, equal to `terra` before 2002-07. Then 8% of each cell's MODIS days move to a random ring 1 neighbour inside the region (scan-edge effect).
- `snpp ~ Binomial(F, 0.90)` from 2012-01 (2012-01 with 12 of 31 days) to 2026-10. `noaa20` the same from 2018-04. `noaa21` the same from 2023-03.
- Outages: `snpp` halved in 2022-07 and 2022-08, `aqua` halved in 2020-08.
- `viirs` = mean of `snpp` and `noaa20` over those present that month. `noaa21` appears in `sat` only.
- 2026-11 has 14 days. 2026-08 to 2026-11 are provisional.

**Harmonization (default method).** Per region and season (DJF, MAM, JJA, SON): ratio = sum of `viirs` / sum of `modis` over 2012-02 to 2019-12. If the MODIS sum is under 30 cell-days, use the region's all-season ratio. Band multipliers: 5th and 95th percentile of the ratio over 200 bootstrap resamples of the years. A second, Terra-only ratio is fitted the same way for 2000-11 to 2002-06. Before 2012-02: `h = ratio * modis`, `lo` and `hi` from the band. From 2012-02: `h = lo = hi = viirs`. Write `method.json` with the ratios and a small `loyo` table computed by leaving each year out.

**Outputs.** Detail tiles, then overview files and the global summary as sums of the detail cells. `places.json` with the six regions plus "Langhe, Italy" (44.64, 7.93) and "Susa Valley, Italy" (45.14, 7.05), both inside `piemonte`.

**Checks the generator runs on its own output before exiting (fail the run if any is false):**
1. `validate-data` passes.
2. World raw series (MODIS before 2012-02, VIIRS after): mean of the 36 months after the seam over the mean of the 36 before is above 1.5. The same for `h` is between 0.8 and 1.25.
3. At least 40% of (res 6 cell, calendar month) pairs have a baseline median of zero.
4. At least one cell-month has `h` above the days in the month.
5. At least 100 cells have `modis` equal to zero in every month before 2012-02 and `viirs` above zero later.
6. Overview sums equal detail sums (contract rule 1).

---

## 6. Math (all in `src/stats`, pure functions, unit tested)

### 6.1 Place series

A place is a set of res 6 cells `C`. For every month index `t`:
`S.h[t] = Σ h[c][t]` over `c` in `C`, and the same for `lo`, `hi`, `modis`, `viirs` and each `sat` key. Cells missing from the tiles count as zero. Area `A = Σ cellArea(c)` in km² (h3-js). Density = `value / A * 1000`.

The **raw** series used for the seam view is `raw[t] = modis[t]` before `first_reference_month` and `viirs[t]` from it on.

### 6.2 Baseline

For a target month (year `y`, calendar month `m`), the baseline set `B` is `S.h` for calendar month `m` in every year from `baseline.start_year` to `baseline.end_year`, excluding year `y` when `exclude_target_year` is true, excluding partial months and months outside the record.

From `B`: `n = |B|`, `normal = median`, `p_low`, `p_high`, `p_very_high` (linear interpolation between order statistics, the common "type 7" definition), `years_active = count(b > 0)`, `max`.

The baseline is always computed from the summed series of the place, never from per-cell baselines.

### 6.3 Class of a month

Input: the target values `h`, `lo`, `hi` and the baseline of 6.2. First match wins.

| Order | Condition | Class | Code |
|---|---|---|---|
| 1 | month is partial | `partial` | 7 |
| 2 | `n < min_years` | `insufficient` | 0 |
| 3 | `normal = 0` and `h = 0` | `none_usual_none` | 1 |
| 4 | `normal = 0` and `h > 0` | `active_usual_none` | 2 |
| 5 | `lo > p_very_high` | `much_above` | 6 |
| 6 | `lo > p_high` | `above` | 5 |
| 7 | `hi < p_low` | `below` | 3 |
| 8 | otherwise | `usual` | 4 |

`unusual = (class is not partial or insufficient) and lo > 0 and lo > p_very_high`. This holds for a zero normal too.

Using `lo` and `hi` here is the "outside the spread and outside the band" rule of `Solution.md` 6.3: an estimated month is called above normal only if the low end of its band is above the threshold.

**Zero-normal rule**: no ratio is ever computed when `normal = 0`. A ratio is shown only when `normal ≥ min_normal_for_ratio` and the class is `above` or `much_above`. `ratio = h / normal`.

### 6.4 Wording (simple mode default, decision D7)

`{Month}` is the month name, `{year}` the target year, `{v}` the value, `{k}` = `years_active`, `{n}` = baseline years.

| Class | Sentence |
|---|---|
| `none_usual_none` | "Usually no fire activity in {Month}. None in {year}." |
| `active_usual_none` | "Usually no fire activity in {Month}. In {year}: {v} active cell-days." Then "Fire activity in {k} of {n} other years." |
| `below` | "Quieter than usual for {Month}." |
| `usual` | "Usual for {Month}." |
| `above` | "More than usual for {Month}." plus the ratio phrase when allowed |
| `much_above` | "Much more than usual for {Month}." plus the ratio phrase when allowed |
| `partial` | "{Month} {year} so far ({d} of {D} days): {v} active cell-days. Not compared with normal until the month is complete." |
| `insufficient` | "Not enough years to say what is usual." |

Ratio phrase: under 1.25 none, 1.25 to under 1.75 "About one and a half times the usual.", 1.75 to under 2.5 "About twice the usual.", 2.5 to under 10 "About {round(ratio)} times the usual.", 10 or more "More than 10 times the usual."

Every sentence is followed by the status marker when the month is estimated or provisional, and by the analysis area ("7 cells, about 250 km²").

### 6.5 Typical and unusual months

- Per calendar month over the baseline years: mean, median, `p_low`, `p_high`, `years_active`.
- A calendar month is a **typical fire month** when `years_active / n ≥ 0.5` and its mean is at least half of the largest monthly mean. Sentence: "Fire activity is most common in July and August." When there is none: "No regular fire season in this area in the record."
- **Unusual months**: every month of the record with `unusual = true`, newest first, at most 12 shown.
- Record summary: "Fire activity was detected here in {k} of {n} years."

The two thresholds (0.5 and half of the largest mean) are defaults in `stats/config.ts`.

### 6.6 Contributions

For a place with more than one cell and a selected month with `S.h[t] > 0`: `share[c] = h[c][t] / S.h[t]`. Shares sum to 1. Top contributors: cells sorted by share, the first 5 with a share of at least 5%. Sentence: "{j} cells make up {p}% of {Month} {year}." Each row gives the share, the value, and distance and compass direction from the place centre ("4 km north-east of the centre"). Cells added by the 7-cell minimum or cut by a drawn boundary are marked "partly outside your shape".

### 6.7 Seam check (scientific mode)

For a seam month index `s`: `step = mean(X[s .. s+35]) / mean(X[s-36 .. s-1])`, computed for `raw` and for `h`. Shown as "Raw: x3.1 across 2012-02. Harmonized: x1.05." It is a description, not a test: real fire activity also changes between the two windows. The text says so.

---

## 7. State model and components

### 7.1 Store (Zustand)

```ts
type Mode = 'simple' | 'sci';
type SeriesView = 'harmonized' | 'raw-modis' | 'raw-viirs';   // sci mode only, simple is always harmonized
type Place =
  | { kind: 'cell'; cell: string }                              // a res 3, 4 or 5 cell
  | { kind: 'point'; lat: number; lon: number; label?: string } // 7-cell neighbourhood
  | { kind: 'shape'; ring: [number, number][]; label?: string };// drawn polygon, lon/lat pairs

interface State {
  manifest: Manifest | null;
  view: { lat: number; lon: number; zoom: number };
  res: 3 | 4 | 5 | 6;            // derived from zoom with hysteresis, kept in the store
  month: string;                 // 'YYYY-MM'
  playing: boolean;
  mode: Mode;
  seriesView: SeriesView;
  place: Place | null;
  placeData: PlaceData | null;   // cells, area, summed series, load state
  drawing: 'off' | 'polygon' | 'rectangle';
}
```

`PlaceData` is derived: resolved cells, tiles needed, load status (`loading`, `ready`, `unavailable`, `error`), `S`, `A`.

### 7.2 URL

Hash with key and value pairs, parsed with `URLSearchParams`:

`#map=6.5/41.20/14.80&month=2024-08&place=p:44.6400,7.9300&mode=sci&view=raw-modis`

| Key | Format | Default when absent |
|---|---|---|
| `map` | `zoom/lat/lon` (zoom 2 decimals, lat and lon 4) | zoom 2, lat 25, lon 10 |
| `month` | `YYYY-MM` | latest month that is not partial |
| `place` | `c:{h3 id}`, `p:{lat},{lon}`, `s:{encoded polyline, precision 5}`, optional `&label=` | none |
| `mode` | `sci` | simple |
| `view` | `raw-modis`, `raw-viirs` | harmonized |

Map moves and month changes replace the history entry (debounced 300 ms). Place and mode changes push a new entry, so Back returns to the previous place. Invalid values fall back to the default, and the URL is rewritten. This replaces the path-style hash in the Map Grid Plan because it is easier to parse and extend.

### 7.3 Components

| Component | Job |
|---|---|
| `App` | Loads the manifest, shows a blocking error with a retry if it fails, lays out the regions |
| `TopBar` | Floating over the map, no bar: the "where" card (name, `Search`, draw) and `MoreMenu` (`ModeSwitch`, notes about the data, "Fixture data" badge). The "Data through" date, the "Fixture data" badge and the safety line sit in the footer (D21) |
| `Search` | Input with suggestions: parsed coordinates, preset places, geocoder results. "Use my location" button |
| `MapStage` | MapLibre map, deck.gl overlay, zoom and draw controls, legend. Owns nothing but the map instance |
| `CellLayer` | Builds the `H3HexagonLayer` props from the current resolution, month, series view and place |
| `PlaceOutline` | Two MapLibre line layers: drawn shape (thin, dashed) and analysis area (hexagon boundary) |
| `DrawControl` | terra-draw polygon and rectangle modes, cancel with Escape |
| `Legend` | Colour ramp, cell size chip, month status chip |
| `PlacePanel` | Place header (name, cells, area, status) and the section slots from the registry. Side panel on desktop, `BottomSheet` on mobile |
| `HistorySection` | `SummarySentence`, `Calendar`, `YearInContext`, `TypicalMonths`, `UnusualMonths`, `Contributions`, and in scientific mode `SensorTable`, `SeamCheck`, `BaselineDetail`, `Provenance`, `MethodTables`, `DownloadCsv` |
| `TimeStrip` | Monthly bars for the world or the place, month selection, play |
| `StatusMarker` | The one small status word next to a number: Estimated, Provisional, Partial, Fixture |

`loader.ts` fetches and validates files, with an in-memory LRU cache (overview: 24 files per resolution, detail: 80 tiles), request de-duplication and `AbortController` on stale requests. On load a detail tile is turned into typed arrays (`Uint16Array` for `mi`, `Float32Array` for values) with per-cell views through `offsets`, without copying.

---

## 8. Interactions (exact behaviour)

### 8.1 Zoom to resolution

Thresholds come from `manifest.ladder`. With hysteresis `x` (0.3): on first render the resolution is the last ladder entry with `min_zoom ≤ zoom`. After that it moves to a finer resolution only when `zoom ≥ min_zoom + x` of the finer entry, and to a coarser one only when `zoom < min_zoom - x` of the current entry. The legend chip shows "Cells: about 12,400 km²", "1,770 km²", "250 km²" or "36 km²". Past zoom 7.5 the hexagons stay at res 6 and the chip reads "Finest cell: 36 km²".

### 8.2 Cell layer

- Res 3 and 4: one overview file for the month. Res 5: one file per res 0 part that touches the viewport. Res 6: the detail tiles that touch the viewport, read at the selected month.
- Viewport to parts or tiles: the overlapping cells of the viewport rectangle at res 0 or at `tile_res` (same overlap routine as 8.4), intersected with `r5_parts` or `detail/index.json`. Not more than 60 detail tiles are requested for one view. Above that the res 5 overview stays on screen.
- Fill: the ember class of `value / cellArea * 1000` against `color.density_breaks`. Value is `h`, `modis` or `viirs` by `seriesView`. Zero is not drawn. Fill opacity by displayed resolution, 0.85 at res 3 down to 0.6 at res 6 (D24). A 1 px outline in ember 6 at 60% opacity when the hexagon is 10 px or wider (changed in the design pass, D18).
- Cell grid (D22): when hexagons at the displayed resolution are 16 px or wider, every cell of the view is drawn as a 1 px ink outline at 11%, under the active cells and without fill, with "No fire detected" in the legend. Zero is still not drawn as data. Not more than 20,000 grid cells for one view.
- While the files for a new month or resolution load, the previous layer stays on screen. No blank frame. A thin progress line shows at the top of the map after 300 ms.
- Where the zoom calls for res 6 and no detail tile exists, the res 5 overview is shown and the legend says "Detail is not available here in this build."
- Resolution changes crossfade over 200 ms. With `prefers-reduced-motion` they switch at once.

### 8.3 Hover, click, tap

- Hover (pointer devices): tooltip with month, the value with its unit and area in scientific mode ("41 active cell-days in 1,770 km²"), a word in simple mode (the legend class, "Low" to "Very high"), and the month status.
- Click or tap on a cell at res 3, 4 or 5: place = `{kind: 'cell'}`. Analysis cells are its res 6 descendants.
- Click or tap at res 6: place = `{kind: 'point'}` at the centre of the clicked cell. Analysis cells are that cell plus ring 1. Header: "Neighbourhood: 7 cells, about 250 km²".
- Click on empty map (no active cell under the pointer): at res 6 the same point rule applies (a quiet place is a valid question). At res 3 to 5 the cell under the pointer is selected whether or not it is drawn.
- If the tiles the place needs are not in `detail/index.json`: the panel shows "History is not available for this area in this build." The place stays outlined.
- Selecting a place opens the panel on History, pushes the URL, and does not move the map. "Zoom to place" fits the analysis area with 48 px padding.
- A selected place keeps its values at every zoom. Clear with the X in the panel header or Escape.

### 8.4 Draw

"Draw area" opens a two-item choice: polygon or rectangle. Click to add points, double click or Enter to finish, Escape to cancel. On finish:

1. Cells = res 6 cells overlapping the shape: `polygonToCellsExperimental` with the overlapping flag. If the function is missing in the installed h3-js: centre-mode `polygonToCells`, plus the cell of every vertex, plus the cell of points sampled every 1 km along the boundary.
2. If fewer than 7 cells: add ring 1 around each cell, and show "Satellites cannot resolve an area this small. We use the cells around it (about 250 km²)."
3. If more than `detail.max_place_cells`: no place is set. Message: "This area is too large for a history (limit about 180,000 km²). Draw a smaller area or click a cell."
4. Two outlines: the drawn shape (thin dashed teal) and the analysis area (solid teal, from `cellsToMultiPolygon`). The header gives both sizes: "Your shape: 0.5 km². Analysis area: 7 cells, about 250 km²."

### 8.5 Search

Input, suggestions in this order: (1) coordinates if the text parses as `lat, lon` in decimal degrees (also with N/S/E/W), (2) preset places from `places.json` matched by substring, (3) geocoder results, requested only when the user presses Enter and nothing above was chosen. Geocoder: Photon (`photon.komoot.io`), 5 results, 4 s timeout. On failure: "Search is offline. Try coordinates or a listed place." Choosing a result flies the map to zoom 9 and sets place = `{kind: 'point'}` with the result name as label. "Use my location" asks for the browser location and does the same. Denied permission gives a plain message and no place.

### 8.6 Time strip

- Data: the place series when a place is ready, else `summary/global.json`, labelled "World" or the place name.
- One bar per month over the whole record. Bar height on a square-root scale of the value from `seriesView` (in simple mode `h`). Width at least 3 px per month. If the strip is narrower than the record needs, it scrolls sideways and keeps the selected month in view.
- Fill: ember 3. Unusual months: ember 5 with a dot above. Estimated months: diagonal hatch. Provisional: dotted hatch. Partial: outline only.
- Scientific mode adds: the band as a thin whisker from `lo` to `hi`, seam marks with labels, and a "Raw / Harmonized" switch that redraws the bars from `raw` or `h` with a 300 ms height transition (the seam closing on screen).
- Right end: a "now" marker after the last month. The scale takes a `futureMonths` number (0 in this MVP) so the outlook can extend the strip later. Future months are drawn as a dotted teal band labelled "Outlook".
- The selected month is a teal cursor with a flag that names the month ("Aug 2017"), so the month can be read on phones where the side text is hidden. Faint rules mark each January (design pass, D20).
- It is a slider: `role="slider"`, value text such as "August 2024, 41 active cell-days, more than usual, estimated". Left and Right move one month, Page Up and Page Down one year, Home and End to the ends, Space starts and stops play. Click or drag selects a month.
- Play: one month every 700 ms, waits for the map files of each month, prefetches the next 3, stops at the last month.

### 8.7 History section

1. **Summary sentence** for the selected month (6.4), status marker, analysis area.
2. **Calendar**: an HTML table, one row per year (newest at the top), 12 month columns. Each cell is a button coloured on the ember ramp, scaled from zero to the place's own 98th percentile of non-zero months, with the scale printed under the table. Hatch for estimated and provisional, a dot for unusual, outline for partial. Selecting a cell selects the month. Each button has a text label ("August 2017: 212 active cell-days, much more than usual").
3. **Year in context**: 12 bars for the selected year over a band from `p_low` to `p_high` and a line at the normal, for each calendar month.
4. **Typical months** sentence and the record summary (6.5).
5. **Unusual months** list, each a button that selects the month.
6. **Contributions** (place with more than one cell): while the History section is open and a place is ready, the place's res 6 cells are drawn on the map at every zoom, coloured by `share / max share` in 5 ember steps, with everything outside dimmed to 35% opacity. The legend changes to "Share of this place's activity in {Month} {year}". The list of 6.6 sits in the panel. Clicking a row flies to that cell. A "Show activity" link returns the map to the normal colouring.

Scientific mode adds, below:

7. **Sensor table** for the selected month: harmonized with band, raw MODIS, raw VIIRS, each satellite when `sat` is present, and the status.
8. **Seam check** (6.7) for each seam inside the record.
9. **Baseline detail**: "Baseline 2003 to 2025, VIIRS-equivalent, 22 years", normal, `p_low`, `p_high`, `p_very_high`, years active.
10. **Provenance**: `manifest.method` lines, data through date, known issues that touch the selected month, contract version.
11. **Method tables** when `method.json` exists: the ratio rows for the place's regions and the leave-one-year-out rows.
12. **Download CSV**: one row per month with `month, h, lo, hi, modis, viirs, status, class`, plus a header comment with the place definition, area, method version and data through date.

### 8.8 Modes

The switch changes what is shown, never the layout. The place, month and map view are kept. The switch lives in the More menu (the "..." button, top right), and a "Scientific mode" sign sits next to that button while scientific mode is on; changing the mode closes the menu (D21). Simple mode: harmonized values only, words before numbers, legend in words, no sensor names. Scientific mode: everything in 8.6 and 8.7, numeric legend with the unit, the series view control (Harmonized, Raw MODIS, Raw VIIRS), which also drives the map layer.

### 8.9 Mobile (under 768 px)

No top bar: the search card with a draw button and the More menu float over the map (D21). Zoom buttons are left out; pinch and double tap zoom. The map fills the screen. The time strip stays docked at the bottom, 64 px high (56 px before the design pass, D20). The panel is a bottom sheet above the strip with three stops: peek (place name and summary sentence), half, full. Drag or tap the handle. Touch targets are at least 44 px. Drawing works by taps, with a visible "Finish" button.

Every feature works on a phone, by touch, with nothing left for a computer (added 2026-11-15 after a mobile review; other fire apps could not be scrolled on phones because the list items took the touch):

- **Scroll never acts.** A swipe on any list, the panel, the calendar, the search results or the time strip only scrolls it. Items act on a tap (a touch that moves less than about 10 px). The strip selects on tap for touch and pen, and keeps press and drag to scrub for a mouse. Lists, the panel and the strip scroll on their own and never move the page (`overscroll-behavior: contain`). The sheet changes height only from its handle, never from scrolling its content.
- **Map gestures stay with the map.** A one-finger drag pans, a tap selects. Nothing else on the map takes a drag.
- **Nothing is desktop only.** On phones the strip's Raw / Harmonized switch and the seam check sit behind a "Strip options" button next to Play. The series view switch, drawing, CSV download and every History part are reachable by touch. The legend folds away so the map is usable on small screens.
- **Targets.** Controls and links are at least 44 px high. Calendar cells are at least 24 px high; they cannot reach 24 px wide on a 320 px screen, and the strip and the unusual months list choose the same months with full-size targets (the equivalent-control exception of WCAG 2.5.8).
- **Phone details.** The search box uses 16 px text so iOS does not zoom on focus, the layout respects the safe areas of notched phones, and there is no sideways page scroll at 320 px width or in landscape.
- **Checked on** Chromium and WebKit (Safari's engine) at 375 x 667, 320 x 568 and 667 x 375 (`web/tests/e2e/mobile.spec.ts`, real touch gestures). Real devices are still to be tried.

### 8.10 Basemap

Default: an OpenFreeMap vector style, recoloured to the tokens (chalk land, steel water, muted labels; D13). Two presets (D23): Detailed (default) adds roads, regional and municipal borders, town, village, region and water names and residential areas as the zoom grows; Quiet keeps land, water, country and region borders, country and city names. Roads, borders and names are drawn above the cell layer. The choice sits in the More menu and is remembered in the browser (not in the URL). On the bundled basemap the menu says the online map did not load. If the style does not load within 4 s, or `VITE_BASEMAP=local` is set, the app uses the bundled Natural Earth layers (land, country lines, lakes) with no labels. The tests run with the local basemap.

### 8.11 Accessibility

- Every control is reachable by keyboard, with a visible 2 px teal focus ring. Tab order: search, draw, More menu, map controls, panel, strip.
- The map canvas has a label ("Map of fire activity for {Month} {year}. Use search or the place list to choose a place.") and is skipped by a "Skip to place details" link.
- Status is never colour alone: hatch plus a word.
- Text contrast at least 4.5:1, controls and data marks at least 3:1 against their background (see U4).
- Announce place and month changes in an `aria-live="polite"` region, using the summary sentence.
- `prefers-reduced-motion`: no crossfade, no fly animation (jump), play still works because the user starts it.

### 8.12 Loading, empty and error states

| Case | Shown |
|---|---|
| Manifest fails | Full-page message with the reason and a Retry button |
| Month file fails | Previous layer stays, a toast "Could not load {Month} {year}", retry on next selection |
| Tile fails for a place | Panel message with Retry |
| Place with no activity in the whole record | "No fire activity was detected here in the record (2000 to 2026)." Calendar still drawn, empty |
| Schema mismatch | Console error with the zod path, same UI as a failed file |

---

## 9. Panel slot registry

`src/panel/registry.ts`:

```ts
interface SectionSlot {
  id: 'outlook' | 'why' | 'actions' | 'history';
  title: string;
  status: 'live' | 'demo' | 'planned';
  order: { simple: number; sci: number };
  mapLayer?: string;                       // the layer the open section asks the map to show
  component: React.LazyExoticComponent<React.ComponentType<SectionProps>>;
}
interface SectionProps { place: Place; data: PlaceData; month: string; mode: Mode; }
```

| id | Title | Status now | Order simple | Order sci |
|---|---|---|---|---|
| `outlook` | Next 12 months | planned | 1 | 2 |
| `why` | Why | planned | 2 | 3 |
| `actions` | What to do | planned | 3 | 4 |
| `history` | History | live | 4 | 1 |

Rules: `live` sections render. `demo` sections render with the "Demo" status marker. `planned` sections render as a dashed outline with the title only when the app runs with `VITE_SHOW_PLANNED=1`, and are absent otherwise. Adding a feature later means changing one row and supplying the component. The panel, the store and the map are not touched. The first live section in the mode's order is open by default. The open section decides the map layer through `mapLayer` (Insight Engine rule: no layer menu in simple mode).

---

## 10. Design tokens

Exposed as CSS custom properties in `styles/tokens.css` and as a typed object for deck.gl.

| Token | Value | Use |
|---|---|---|
| `color.ash` (chalk) | `#ECEEE9` | Land, page background |
| `color.surface` (sheet) | `#FBFBF8` | Panel, top bar, strip, floating controls |
| `color.well` | `#EEF0EB` | Sunken areas: empty calendar cells, chips, search field at rest |
| `color.water` | `#BACAD2` | Water |
| `color.ink` | `#1F2A2B` | Text, linework (12.6:1 on chalk) |
| `color.ink-muted` | `#55615F` | Secondary text (5.5:1 on chalk, 6.2:1 on sheet) |
| `color.teal` | `#16657D` | Selection, focus, links (5.6:1 on chalk) |
| `color.ember.1` to `.6` | `#F6D978` `#F0A848` `#DE6F36` `#BA4128` `#842320` `#46141A` | Data only, light to dark |
| `color.cell-outline` | ember 6 at 60% | Outline of active cells: 4.1:1 against land, 3.5:1 against the lightest cell (fixes U4) |
| `opacity.cell` | 0.9 | Fill of the contribution cells (the place in focus) |
| `opacity.cellByRes` | 0.85, 0.8, 0.7, 0.6 for res 3, 4, 5, 6 | Cell fill by displayed resolution: lighter as you zoom in, so roads and names show through (D24) |
| `opacity.dimmed` | 0.35 | Cells outside the place in the contributions view |
| `opacity.grid` | ink at 11% | The cell grid outline (D22) |
| `font.family` | Atkinson Hyperlegible Next 400, 600, 700, system-ui, sans-serif | Everything |
| `font.size` | 13, 15 (16 on phones), 18, 24 px | Caption, body, heading and summary sentence, place title |
| `font.numeric` | tabular figures | All numbers |
| `space` | 4, 8, 12, 16, 24, 32 px | |
| `radius` | 8 px cards, 6 px controls, 2 px data marks | The radius says what a thing is |
| `shadow.float` | two soft layers | Everything that floats over the map |
| `size.panel` | 380 px | Desktop panel width |
| `size.strip` | 108 px desktop, 64 px mobile | Time strip height |
| `size.touch` | 44 px | Minimum touch target |
| `motion.fast`, `motion.strip` | 200 ms, 300 ms | Crossfade and panel entrance, strip morph |
| `pattern.estimated` | 45° ink lines, 1 px, 4 px apart, 40% | Hatch |
| `pattern.provisional` | 1 px ink dots, 4 px grid, 40% | Dotted hatch |

Values above were changed in the design pass of 2026-11-15 (D13, D18 to D20; direction in `web/DESIGN.md`). Rules kept from the Map Grid Plan: the only warm colour in the interface is data, teal is only selection and focus, sentence case, plain verbs, no all-caps labels, motion only in answer to a user action. Legend words for the 6 density classes in simple mode: "Very low", "Low", "Moderate", "High", "Very high", "Extreme".

---

## 11. Build steps and acceptance criteria

Do them in order. Each step ends with lint, type check and unit tests passing, a Changelog entry and a local commit.

| # | Step | Acceptance |
|---|---|---|
| 1 | **Scaffold** `web/` with the stack of section 3, scripts, strict TypeScript, tokens file, fonts | `npm run dev` serves a blank page in the ash colour with the font loaded locally. `npm run build`, `lint` and `test` pass |
| 2 | **Contract**: zod schemas and types for every file of section 4, `validate-data.ts` | Hand-written valid samples pass. Samples with a wrong type, unequal array lengths, unsorted `mi`, or `lo > h` fail with a readable path |
| 3 | **Fixtures**: `make-fixtures.ts` per section 5 | Two runs give identical bytes. The six built-in checks pass. Runs in under 2 minutes |
| 4 | **Math**: `stats/` and `grid/` pure functions per sections 6 and 8.1 | All unit tests of section 12.1 pass |
| 5 | **Shell**: layout regions, top bar, mode switch, store, URL sync, slot registry, empty panel | Loading a URL with every key restores the state. Changing state rewrites the URL. Back returns to the previous place. An invalid URL falls back to defaults |
| 6 | **Map and overview**: basemap with fallback, ladder with hysteresis, cell layer for res 3 to 5, legend with cell size and month status, hover tooltip | World view shows the six fixture regions. Zooming 4.4 to 4.6 to 4.4 does not flicker between resolutions. The legend chip changes with the resolution. With the network blocked the local basemap appears |
| 7 | **Detail**: tile index, loader, cache, res 6 layer, "detail not available" state | At zoom 8 over a fixture region res 6 cells appear. Changing the month at res 6 makes no network request. Outside the regions the notice shows |
| 8 | **Places**: click rules, search (coordinates, presets, geocoder), location, draw, outlines, limits and messages, "Zoom to place" | A click at res 6 gives exactly 7 cells. A drawn 50 ha polygon gives 7 or more cells and the small-area message. A polygon over the limit gives the too-large message. A place survives a reload from its URL with the same cells |
| 9 | **Time strip**: world and place series, selection, keyboard, play, hatches, unusual dots | Bars match the series values. The keys of 8.6 work. Estimated months are hatched. Play advances and stops at the end |
| 10 | **History section**: sentence, calendar, year in context, typical, unusual | For a fixture place the sentence, class and lists match values computed by the unit-tested functions. The Piemonte presets show zero-normal wording. Portugal 2017-10 is listed as unusual |
| 11 | **Contributions**: map recolour, list, fly to cell | Shares in the list sum to 100% (within rounding). The map dims cells outside the place. "Show activity" restores the normal layer |
| 12 | **Scientific mode**: series view on map and strip, band, seams, seam check, sensor table, baseline, provenance, method tables, CSV | The raw to harmonized switch changes the strip before 2012-02 and not after. Seam check shows a raw step above 1.5 and a harmonized step between 0.8 and 1.25 on the world series. The CSV parses and its `h` column equals the summed series |
| 13 | **Mobile and accessibility pass** | At 375 x 667 the sheet, strip and map all work by touch. The axe scan reports no serious or critical issue. Every action in 8.3 to 8.7 can be done by keyboard except freehand drawing, which has the search path as its substitute |
| 14 | **End-to-end tests and docs**: Playwright suite of 12.2, `web/README.md` (run, test, switch to real data), GroundTruth.md and Changelog.md updated | `npm run e2e` passes on a clean checkout after `npm ci` and `npm run fixtures` |
| 15 | **Switch to real data** when the data track delivers | `npm run validate-data` passes on the real folder. The app runs with no code change. The "Fixture data" badge is gone. Contract rule 1 is spot-checked in the browser on three places |

---

## 12. Test plan

### 12.1 Unit tests (Vitest)

**Sums**
- A place series equals the element-wise sum of its cells for `h`, `lo`, `hi`, `modis`, `viirs` and `sat`.
- A cell missing from every tile adds zero.
- Sum of the 7 res 6 children of a res 5 cell equals the res 5 overview value, for every fixture month (and the same for res 4 and res 3 through their descendants).
- The world summary equals the sum of the res 3 overview file.
- Area: the sum of `cellArea` for a 7-cell ring is between 230 and 280 km² at 45° N. Density uses the summed area.
- Shares sum to 1. Top contributors are sorted and respect the 5% floor.

**Baseline**
- Median and percentiles match hand-computed values for odd and even `n`, including ties and all zeros.
- The target year is excluded when the flag is true and included when false.
- Partial months and months outside the record are never in a baseline.
- Years outside `start_year` to `end_year` are ignored.
- `n < min_years` gives `insufficient`.
- The baseline of a place is computed from the summed series: a test with two cells whose medians are each zero and whose sum has a median above zero must return the non-zero normal.

**Classes and the zero-normal rule**
- Normal 0, value 0 gives `none_usual_none`. Normal 0, value 3 gives `active_usual_none`. In both cases the ratio is `null` and no code path divides by the normal.
- Normal 0, value above `p_very_high` sets `unusual` and keeps the zero-normal class.
- `lo > p_very_high` gives `much_above`. `h > p_very_high` with `lo` below it does not (band rule).
- `hi < p_low` gives `below`. `h < p_low` with `hi` above it gives `usual`.
- Normal above 0 and under `min_normal_for_ratio`: class is set, ratio phrase is absent.
- Ratio phrase limits at 1.25, 1.75, 2.5 and 10.
- A partial month gives `partial` whatever the values.
- Every class has a sentence, and no sentence contains "NaN", "Infinity" or "undefined" for a table of edge inputs.

**Grid and state**
- Ladder: resolution for a rising and falling zoom sequence around each threshold shows hysteresis. First render uses the plain threshold.
- Place resolution: a `cell` place at res 4 gives 49 res 6 cells (fewer under a pentagon). A `point` place gives 7. A tiny polygon gives at least 7. A polygon over the limit is rejected.
- The fallback overlap routine returns a superset of centre-mode cells and includes the cell of every vertex.
- URL: encode then decode returns the same state for each place kind. Garbage input returns defaults.
- Month helpers: index to month and back, month count of the record, status lookup at range edges.
- Seam check on a synthetic series with a known step.
- Loader: typed-array views through `offsets` return the right entries for the first, a middle and the last cell.

### 12.2 UI checks (Playwright, Chromium, local basemap, fixtures)

The app exposes a small test hook in development and test builds (`window.__hotspots`: current resolution, rendered cell count, place cell ids) because WebGL content cannot be read from the DOM.

1. First load: map, legend, strip with the world series, search focused, "Fixture data" badge and "Data through" date visible.
2. Zoom steps through res 3, 4, 5, 6. The legend chip text matches each.
3. Click at res 4 selects a cell. The panel shows History with a sentence. The URL contains `place=c:`.
4. Search "Langhe", choose the preset: the map moves, the place has 7 cells, the sentence uses zero-normal wording for a quiet month.
5. Search "37.6, 14.2": same flow from coordinates.
6. Draw a small rectangle: small-area message, two sizes in the header.
7. Select 2017-10 on the Portugal preset: the unusual marker shows, contributions list appears, shares sum to 100%.
8. Strip keyboard: Right, Page Up, Home and End change the month and the value text.
9. Mode switch to scientific keeps place and month. Raw against harmonized changes bars before 2012-02 only. Seam check text is present.
10. Select 2026-11: the partial sentence shows and no class word appears.
11. Select a month in 2005: "Estimated" marker in the panel and in the legend chip.
12. CSV download has one row per month and the header comment.
13. Reload with a full URL restores map, month, place, mode and view.
14. Mobile viewport 375 x 667: bottom sheet stops, strip docked, tap selects a place.
15. axe scan on the simple and scientific states with a place selected: no serious or critical issue.
16. Blocked network for the geocoder: the offline message shows and presets still work.

### 12.3 Manual checks before the pitch build

- Read every simple-mode sentence aloud for three places (quiet, seasonal, extreme). No jargon except "active cell-days" with its info button.
- Greyscale screenshot: classes still ordered, hatches visible.
- Throttled network (Fast 3G): first map under 5 s, a place under 3 s after its tiles are cached.
- Real data only: compare one place's CSV with a direct query on the atom table.

---

## 13. Open team decisions and the defaults in use

> **Update 2026-11-15**: the team adopted the defaults below as decisions, with one change: D4 uses a 2012 to 2025 baseline (VIIRS years only). The section "How the fire score works" of `Contributor.md` (formerly the README) explains each one.

None of these is decided. "Default" is what the fixtures and the app assume until the team says otherwise. D1 to D6 must be settled **before the data build**, because they change the published numbers. The others can change later without a rebuild of the app.

| # | Decision | Recommended default (not a decision) | Where it lives |
|---|---|---|---|
| D1 | Transfer form: plain ratio, or quantile mapping | **Plain ratio.** It is the only form under which sums of cells stay harmonized, which the whole design relies on | Data build. `manifest.method.transfer` |
| D2 | VIIRS reference group | **S-NPP alone for the fit (2012-02 to 2019-12). For the published series: mean of S-NPP and NOAA-20 when both are nominal, the one available otherwise. NOAA-21 held back** until its monthly values are checked against NOAA-20 (GFED5NRT does the same). After S-NPP ended (2026-11-02) the series is NOAA-20 | Data build. `method.viirs_group` |
| D3 | Fit period and drift | **Fit on 2012-02 to 2019-12, apply to all MODIS-only months.** Also fit 2020 to 2025 and report the difference | Data build. `method.json` |
| D4 | Baseline period | **2003 to 2025, target year excluded, at least 10 years.** The alternative is VIIRS years only (2012 to 2025, 14 years, no seam inside the baseline). Decide after measuring, per region, the share of zero cell-months before and after 2012 at res 6 and at 7 cells. If the shares differ a lot, small-area baselines across the seam are biased (finding S1) and the VIIRS-only baseline is the safer choice for small areas | `manifest.baseline` |
| D5 | Terra-only months (2000-11 to mid 2002) | **Separate Terra-only ratio, months marked estimated, baseline starts 2003.** Alternative: drop them, as MRBA60 drops 2001 and 2002 | Data build. `manifest.record`, `seams` |
| D6 | Region and season for the ratio | **H3 res 1 parent x 3-month season (DJF, MAM, JJA, SON), fallback to res 0 parent, then global, when the overlap has too few active cell-days.** The minimum count is for the data owner to set after looking at the data | Data build. `method.json` |
| D7 | Classes, percentiles and simple-mode wording, including the zero-normal sentences | **4 classes at the 25th, 75th and 90th percentile, ratio wording only when the normal is at least 3 cell-days, sentences of 6.4.** 23 years cannot support classes finer than about the top 10% | `manifest.classes`, `stats/wording.ts` |
| D8 | Detail coverage | **Europe, the Mediterranean and the demo regions first. World at res 3 and 4.** | `detail/index.json` |
| D9 | Leave-one-year-out metrics | **Bias, mean absolute error and the zero-MODIS share, at res 6, 7-cell ring, res 5, res 4 and region** (finding S3) | `method.json` |
| D10 | Day definition | **UTC `acq_date`** as in the Map Grid Plan. Local solar date is the alternative (finding S11) | Data build |
| D11 | Confidence filter, and the `type` filter for NRT months that lack the column | **Nominal and high for both sensors, type 0 only, NRT months marked provisional.** The NRT rule (static mask or persistence) stays with the data owner (`Solution.md` 5.1) | Data build. `method.filters` |
| D12 | Simple-mode map colour | **Activity level (density) in both modes.** "Compared with normal" appears in the panel text and on the strip for the selected place. A class map is possible later at res 3 to 5 through the optional `cls` field (finding S7) | App config |
| D13 | Basemap | **Light chalk land (`#ECEEE9`) and steel water (`#BACAD2`), OpenFreeMap with the local Natural Earth fallback.** Changed 2026-11-15 from ash `#E8EBE7` and slate `#C7D1D4`: land and sea were too close to read coasts on a sparse map, and the low ember steps vanished into the land. A dark basemap was considered and left out: it needs its own ramp (bright means more on dark, the reverse of the calendar) | `VITE_BASEMAP`, tokens |
| D14 | Search | **Coordinates and presets first, Photon geocoder on Enter** | App config |
| D15 | Boundary cells of a drawn area | **Whole cells that overlap the shape, marked in the contributions list.** No area weighting | `grid/place.ts` |
| D16 | Demo place | Not chosen. The app needs none. Add it to `places.json` when chosen | `places.json` |
| D17 | Calendar colour scale in the History section | **Scaled to the place's own range**, so quiet places are still readable. The map keeps the fixed density scale | `stats/config.ts` |
| D18 | Cell colours and outline | **Ember ramp `#F6D978` `#F0A848` `#DE6F36` `#BA4128` `#842320` `#46141A`, fill opacity 0.9, outline in ember 6 at 60%.** Changed 2026-11-15: the old ink outline at 45% reached only 2.6:1 against land, under the 3:1 of U4, and turned the cells grey; the new outline reaches 4.1:1. The first steps are more saturated so low activity reads as fire | `styles/tokens.css`, `styles/tokens.ts` |
| D19 | Type | **Atkinson Hyperlegible Next only, weights 400, 600, 700, body 16 px on phones.** Changed 2026-11-15: the mono face was loaded and unused; 600 gives labels and controls a middle weight | `main.tsx`, tokens |
| D20 | Time strip look | **108 px desktop, 64 px phones, teal cursor with a month flag, January rules, outlook band after "now".** Changed 2026-11-15 from 96 and 56 px: the flag needs room above the bars, and phones had no visible month while playing | `strip/TimeStrip.tsx`, tokens |
| D21 | Layout | **One path, like an escape route: no top bar; a floating "where" card (name, search, draw) top left and a More menu ("...") top right holding the detail level and the notes about the data; a "Scientific mode" sign next to it while that mode is on; data date, fixture badge and safety line in the footer; zoom buttons bottom right on desktop and left out on phones.** Changed 2026-11-15 after review: the mode switch, badge and date in a bar across the top competed with the one thing a first-time or hurried user needs, which is to say where. Direction in `web/DESIGN.md` | `ui/TopBar.tsx`, `ui/MoreMenu.tsx`, `styles/layout.css` |
| D22 | Cells with no detected fire | **A faint outline grid of every cell in view (16 px hexagons or wider), no fill, legend "No fire detected".** Added 2026-11-15 after review: lone active cells looked like random dots, with nothing to show the rest was checked. A grey fill was considered and left out: it hides roads and names, and without a land mask it would tint the sea | `map/CellLayer.ts`, `map/MapStage.tsx`, tokens |
| D23 | Basemap detail | **Detailed preset by default (roads, regional and municipal borders, towns, villages, residential areas, water names, drawn above the cells as zoom grows), Quiet as the one alternative, in the More menu.** Added 2026-11-15 after review: people could not tell where they live from country borders alone. A full layer menu was left out on purpose (Insight Engine: no layer menu in simple mode); satellite imagery would need a separate tile service and licence | `map/basemap.ts`, `ui/MoreMenu.tsx`, store |
| D24 | See-through cells and area units | **Cell fill opacity falls with zoom (0.85 at res 3, 0.6 at res 6), the warm outline stays. Areas are shown in the unit people use at that size: hectares first under 1 km² ("50 ha (0.5 km²)"), km² with hectares from 1 to 100 km² ("36 km² (3,600 ha)", a cell), km² only above ("12,400 km²").** Added 2026-11-15 after review: roads and villages must show through the cells, and a farmer thinks in hectares, but 1,240,000 ha for a region helps nobody. Acres for US and UK users would be a later setting | `map/density.ts`, `stats/wording.ts`, tokens |
| D25 | Finding your place | **Max zoom 15 (was 12); a metric scale bar in the bottom corner (top left under the search card on phones, where the legend takes the bottom); at street level the Detailed map adds buildings, wider roads, road numbers, road names (main roads from zoom 11, small roads from 13) and neighbourhood names. All of these are Detailed-only layers; Quiet hides them.** Added 2026-11-15 after review. Data overlay maps put the data under the roads and labels, which is what D22 and D23 already do; this extends it to street level | `map/basemap.ts`, `map/MapStage.tsx` |
| D26 | Forecast in the app | **Forecast months from the prediction model are shown after the record: greyed, see-through, dashed bars on the strip, a forecast row in the calendar, the forecast on the map at res 4. One button makes the forecast year the whole strip. A place takes the forecast of the res 4 areas it covers; a part of an area takes the share of the area's activity it had in the same calendar month of the baseline years. Scientific mode adds the 10% to 90% range, the model and its held-out test.** Added 2026-11-15 by the user. The share rule is an app-side rule, to be confirmed by the team | `data/forecast.ts`, `stats/forecast.ts`, `strip/`, `panel/sections/History/` |
| D27 | Confidence level of a value | **Decided by the user on 2026-11-15. Three levels per (place or map cell, month), computed in the app: high for observed months; medium for estimated months of areas of 49 res 6 cells or more (and the world) and for provisional months; low for estimated months of smaller areas and for every estimated month before 2002-10 (Terra alone). Map cells count as 7^(6 - res) res 6 cells, so res 5 and 6 are low in estimated months. Low months are drawn faded under the estimated hatch in the strip, calendar and map, get a "Low confidence" marker and one line of text, and no class.** Why: leave-one-year-out against S-NPP (Whitepaper Table 2): MODIS missed 53% of active res 6 cell-months, 47% at res 5, 41% at res 4, 15% for regions, and non-zero estimates are about twice too high up to res 4, while totals are unbiased. The existing band is the spread of the regional ratio, not this error. Cannot be fixed with the data (Whitepaper limitation 1), only shown. Whitepaper section 3.9 | `stats/confidence.ts`, `stats/config.ts`, `ui/Confidence.tsx`, strip, calendar, map, tokens |

Still unmeasured, and worth an hour of the data owner's time before D1 to D6 are fixed: how the VIIRS to MODIS ratio changes with cell size (res 6 against res 4), how much NOAA-20 raises cell-days over S-NPP alone, and the zero share per cell-month.

---

## 14. If time runs short

Cut from the bottom of this list first. Steps 1 to 10 are the product.

1. Method tables and the seam check for seams other than 2012-02.
2. Geocoder (keep coordinates and presets).
3. Rectangle drawing (keep polygon).
4. Year in context chart.
5. Crossfade between resolutions.
6. Contributions map recolour (keep the list).
7. Draw entirely (keep click and search).
8. Res 5 overview (go from res 4 straight to res 6 at zoom 7).
