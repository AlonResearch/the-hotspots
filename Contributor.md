# The Hotspots: contributor guide

> For maintainers and contributors: how to get the data, build it, run the app, and the method in plain words. The project summary for readers and judges is [README.md](README.md).

[![Event: NASA Space Apps Challenge 2026](https://img.shields.io/badge/NASA%20Space%20Apps-2026-orange.svg)](https://www.spaceappschallenge.org/2026)
[![Challenge: Harmonization of MODIS and VIIRS Hot Spots](https://img.shields.io/badge/Challenge-MODIS%20%26%20VIIRS%20Harmonization-red.svg)](https://www.spaceappschallenge.org/2026)

---

## The challenge

> *Understanding how burning activity is distributed across our planet over time, including wildfires and agricultural burns intense enough to be detected by satellite sensors, enables us to anticipate critical periods, guide monitoring efforts, and improve fire response. Satellites have tracked active fire hotspots for more than two decades, but the record is split across sensors whose data cannot be compared directly, leaving fire managers without a consistent picture of when and where burning has occurred. Your challenge is to build a web application that harmonizes these records into a burning activity calendar based on active fire hotspots, enabling early warning and emergency responders, scientists, and land managers to examine historical fire patterns, unusual conditions, and critical periods within a selected area of interest.*

---

## The team

Team page: [find-a-team/the-hotspots](https://www.spaceappschallenge.org/2026/find-a-team/the-hotspots/)

| Member | Role |
|---|---|
| Arthur Alonso ([@AlonResearch](https://github.com/AlonResearch)) | AI, UI/UX |
| Nurbanu Koc | Science and pitch |
| Bekhzod Anvarov | Programming and AI |

---

## Start here

1. [README.md](README.md): what the project is, the NASA data, the results and the limits (10 minutes).
2. [Whitepaper.md](Whitepaper.md): the method with equations and validation; [Prediction.md](Prediction.md): the 2027 forecast.
3. This file: how to get the data, build it and run the app, and the method in plain words ("How the fire score works").
4. [GroundTruth.md](GroundTruth.md): what is built and measured, every number from the build, and what is still open (section 4).
5. [AGENTS.md](AGENTS.md): the rules for commits, documents and style that apply to people and AI assistants alike.

## Repository map

```text
the-hotspots/
├── README.md                 # project summary for readers and judges
├── Contributor.md            # this file: maintainer guide
├── Whitepaper.md             # the method: equations, validation tables, limitations
├── Prediction.md             # the 2027 forecast: data, model, held-out test, results, limits
├── GroundTruth.md            # what is built and measured, and what is open
├── Changelog.md              # what changed and when
├── AGENTS.md                 # rules for contributors and AI assistants
├── pipeline/                 # data build: raw FIRMS CSV to the app's JSON (pipeline/README.md)
├── web/                      # web app: map, history, forecast (web/README.md, web/DESIGN.md)
├── forecast/                 # 2027 forecast scripts, 01_build_firms.py to 05_figures.py (forecast/README.md)
├── scripts/                  # download_firms.py (FIRMS API downloader), firms_archive_links.csv, whitepaper_figure.py
├── assets/                   # Whitepaper Figure 1
├── Vision Docs/              # research and product documents (table below)
└── .claude/skills/           # a design skill used by the AI assistants (its own LICENSE.txt)
```

Earlier plans, the internal event notes and the submission working documents were removed on 2026-11-15.

Not in the repository: `data/` (raw and processed FIRMS data, see "Data" below), `results/` (forecast outputs), `web/public/firms/` (the real build) and `Info.local/` (raw briefing audio, ASR transcripts and slide photos on one developer's machine). All are git-ignored.

## Which document answers which question

| Question | Document |
|---|---|
| What is this and does it work? | [README.md](README.md) |
| How exactly is the score computed and checked? | [Whitepaper.md](Whitepaper.md) |
| Why each method choice, in plain words? | "How the fire score works" below |
| What literature is behind the choices? | [Vision Docs/Unified Score Research.md](Vision%20Docs/Unified%20Score%20Research.md) |
| The full list of method and app decisions (D1 to D27) | [Vision Docs/MVP Implementation Plan.md](Vision%20Docs/MVP%20Implementation%20Plan.md), section 13 |
| How the 2027 forecast works and how good it is | [Prediction.md](Prediction.md); full detail in [Vision Docs/PredictionEngineeringReport.md](Vision%20Docs/PredictionEngineeringReport.md) |
| What is built, with every measured number | [GroundTruth.md](GroundTruth.md) |
| How to rebuild the data, with timings | [pipeline/README.md](pipeline/README.md) |
| How to run, test and deploy the app; the data contract | [web/README.md](web/README.md); the contract itself is section 4 of the MVP Implementation Plan |
| Why the app looks the way it does | [web/DESIGN.md](web/DESIGN.md) |
| Who the app is for | [Vision Docs/Personas.md](Vision%20Docs/Personas.md) (draft) |
| What other tools exist and what they miss | [Vision Docs/CurrentSolutionLandscape.md](Vision%20Docs/CurrentSolutionLandscape.md) |
| How it could become a product (not decided) | [Vision Docs/Product Roadmap.md](Vision%20Docs/Product%20Roadmap.md), [Vision Docs/Insight Engine.md](Vision%20Docs/Insight%20Engine.md) |
| The challenge | [Challenge page](https://www.spaceappschallenge.org/2026) and "The challenge" above |

## The event

- **Where**: NASA Space Apps Challenge 2026, Turin local event, hosted by I3P (Politecnico di Torino) with ESA BIC Turin. [Event page](https://www.i3p.it/en/events/nasa-space-apps-challenge-2026-turin-italy).
- **When**: 14 and 15 November 2026. Work stopped on Sunday at 16:00 for the Turin pitches; the NASA platform submission closed on Sunday at 23:59 Italian time.
- **Two separate submissions**: a live pitch in Turin (4 minutes plus 2 of discussion, team-reported), and a project page on spaceappschallenge.org with a demo of at most 7 slides or 30 seconds of video.
- **Scored on** Impact, Creativity, Validity, Relevance (NASA data as a core component) and Presentation, each 1 to 5.
- **Rules that shaped the work**: no coding or FIRMS downloading before the start on 2026-11-14, AI use disclosed, the idea is the team's.

---

## Web app

The map and historical view live in `web/`. It runs on the real data build (below) or on generated fixtures, which the tests use.

```text
cd web
npm ci
npm run fixtures
npm run dev        # http://127.0.0.1:5288, fixtures
```

What the app shows for a place:

- **History**: the time strip and calendar from 2000 to 2026, typical and unusual months, and which hexagons make up a peak. Every value has a confidence level (high, medium, low; see "How the fire score works", section 6).
- **2027 forecast**: when the data folder has forecast files, greyed bars after "now" on the time strip, a forecast row in the calendar and a greyed map. They come from the team's prediction model (`forecast/`, see below) through `npm run import-forecast`. It is an outlook from past fire seasons, not a weather forecast.
- **Next 12 months**: the place's forecast month by month, with the month of most expected activity. A tap shows that month on the strip, calendar and map. Without forecast files the section says so.
- **Why and What to do (demo)**: for four places in Italy (Turin, Milan, Monte Barone, Foggia) the panel shows how the Insight Engine ([Vision Docs/Insight Engine.md](Vision%20Docs/Insight%20Engine.md)) should work. The content comes from if/else rules in `web/src/insight/demo.ts`. No driver data (weather, soil moisture, vegetation) and no model is behind it, and the app marks these sections "Demo". The four places are in the search list.
- **Scientific mode**: raw MODIS and VIIRS series, the uncertainty band, the seam check, the method tables and CSV downloads.

Tests, the data contract check, the forecast files and how to switch to real data: [web/README.md](web/README.md). How the app should look and why: [web/DESIGN.md](web/DESIGN.md).

## How the fire score works (method decisions)

The full scientific write-up, with equations, validation tables and limitations, is the whitepaper: [Whitepaper.md](Whitepaper.md).

Decided by the team on 2026-11-15. The literature behind each choice is in [Vision Docs/Unified Score Research.md](Vision%20Docs/Unified%20Score%20Research.md). The full list, with codes D1 to D17, is in section 13 of [Vision Docs/MVP Implementation Plan.md](Vision%20Docs/MVP%20Implementation%20Plan.md). Every value below sits in `pipeline/config.toml` (data build) or `web/src/stats/config.ts` (app), so a later change is a config edit and a rebuild, not new code.

### 1. One unit: active cell-days

**How.**
- The world is cut into hexagons of about 36 km² (H3 resolution 6).
- For each hexagon and each day we ask one question: did any satellite see at least one qualifying fire there?
- A month's value is the number of (hexagon, day) pairs with a yes.
- A larger area is the plain sum of its hexagons.

**What it means.** "41 active cell-days" means fire was seen on 41 hexagon-days in that month in the area. It measures how widespread and how persistent burning was, not how many hectares burned.

**Why.**
- Counting days instead of detections removes most of the difference in pixel size between MODIS (1 km) and VIIRS (375 m). VIIRS splits one fire into many small detections, but it still counts as one day in that hexagon.
- Because areas are sums, every number on screen adds up. A region equals the sum of its parts at every zoom, and the panel can show which hexagons make up a peak.

### 2. Which detections count (D10, D11)

**How.**
- Only detections with nominal or high confidence count, and only type 0 (vegetation fire).
- MODIS confidence (0 to 100) is mapped to the same three classes: low below 30, nominal 30 to 79, high 80 and above.
- The near-real-time files of the last months have no type column. For those months we mask the hexagons that were mostly volcanoes, gas flares or other static heat sources in 2021 to 2025.
- Days are UTC dates.

**What it means.** Industrial heat, volcanoes and the least certain detections are left out. The last months are marked **Provisional** until NASA replaces them with the final data.

**Why.**
- The same filter is applied to both sensors, so they are compared on equal terms.
- UTC days are what FIRMS publishes. Depending on longitude, the day and night overpasses of one local day can fall on two UTC dates, or passes of two local days on one. The harmonization below absorbs that on average.

### 3. Joining MODIS and VIIRS into one score (D1, D3, D5, D6)

**How.**
- From February 2012 on, the score is what VIIRS sees (**observed**).
- Before that, only MODIS exists. We used 2012 to 2019, when both flew, to measure how many VIIRS cell-days there are for each MODIS cell-day. This ratio is measured per large region (H3 resolution 1, about 600,000 km²) and per season (DJF, MAM, JJA, SON). Earlier MODIS values are multiplied by that ratio (**estimated**).
- Regions with too little fire in the overlap (under 30 MODIS cell-days) use the ratio of their continent-sized parent cell. If that is also too thin, they use the global ratio.
- Until Aqua has data on every day of a month (October 2002; its first data is from 4 July 2002), the estimate uses Terra alone with its own Terra-only ratio.
- The uncertainty band shown with estimated months is the 5th to 95th percentile of the ratio when the overlap years are resampled.

**What it means.** All 26 years are in "VIIRS units". An estimated month answers the question: "about how much would VIIRS have seen?"
- Measured on this build, VIIRS sees about 2.5 to 3.1 times as many cell-days as MODIS, depending on season.
- When each overlap year is held out and predicted from the others, the total comes out 0.4% too high (bias 1.004).

**Why.**
- A plain ratio is the only correction under which sums stay correct, which the whole map relies on. More complex mappings, such as quantile mapping, break that.
- It is the same family of method as GFED5NRT and GFED5, and the leave-one-year-out check follows MRBA60 (see the research doc).
- VIIRS is the reference because it continues after MODIS ends.
- The fit uses 2012 to 2019 because Terra and Aqua drift after about 2020. A 2020 to 2025 fit is computed and reported, but not applied.

**Limit.** A ratio fixes the average level of an area, not of single hexagons. Where MODIS saw nothing, the estimate is zero. Where it saw something, the estimate can be larger than the number of days in the month. Area totals are reliable; single estimated hexagons are not.

### 4. The VIIRS satellites (D2)

**How.**
- S-NPP is the reference for the fit.
- The published VIIRS value is the mean of S-NPP and NOAA-20 when both are working for the whole month, otherwise the one that is.
- NOAA-21 is shown per satellite in scientific mode, but is not used in the score yet.
- Since S-NPP ended on 2026-11-02, the score is NOAA-20 alone.

**What it means.** Having one satellite more or fewer does not double the count. On this build, NOAA-20 sees about 1.02 times what S-NPP sees (the scale back to S-NPP units is about 0.98). So the steps when NOAA-20 starts (2018) and when S-NPP ends (2026) are about 1%. A setting to scale NOAA-20 to S-NPP exists and is turned off.

**Why.** Averaging the satellites in a group follows GFED5NRT. NOAA-21 is held back until its values are checked against NOAA-20, as GFED5NRT also does.

### 5. "More than usual" (D4, D7)

**How.**
- "Usual" for a month is computed from the same calendar month in **2012 to 2025**, leaving out the year being judged. It needs at least 10 years. January 2012 is left out because it is estimated (S-NPP started on 20 January 2012).
- The area's values are summed first, then compared, so the normal belongs to the whole area.
- The classes:
  - **much more than usual**: above the 90th percentile of those years;
  - **more than usual**: above the 75th percentile;
  - **quieter than usual**: below the 25th percentile;
  - **usual**: anything else.
- For estimated months, the low end of the uncertainty band must clear the threshold, so uncertainty alone never creates an alarm.
- "About twice the usual" is only said when the usual is at least 3 cell-days.
- When the usual is zero, the app says so in words ("Usually no fire activity in March") and never divides by zero.

**What it means.** With 13 comparison years, "much more than usual" means roughly "above the second highest of the other years". Expect it in about one month in six or seven, not one in ten.

**Why.**
- 2012 to 2025 keeps "usual" inside one sensor era, so a recent month is compared only with observed years. The VIIRS burned-area paper advises against simply joining the two records at local scales, and INPE and EFFIS also compare within one sensor era. The alternative, 2003 to 2025, is longer but mixes estimated and observed years.
- We measured how differently MODIS and VIIRS see zero months in small areas, as the gap in the share of zero months. The gap is over 10 points in 146 regions, 5 to 10 points in 100, and under 5 points in 217. The problem is real in many regions, so we chose the shorter but consistent baseline.
- Percentile classes need no assumption about the shape of the data. 13 to 22 years cannot support anything finer than the top 10%.

### 6. Small places before 2012: confidence levels (D27)

**How.** Every value has one of three confidence levels, worked out in the app from the month and the size of the area:

| Level | When | How it looks |
|---|---|---|
| **High** | Seen by VIIRS (February 2012 on) | Solid bars and calendar cells |
| **Medium** | Estimated from MODIS for an area of 49 hexagons (about 1,800 km²) or more, or a recent provisional month | Hatched (estimated) or dotted (provisional), full height |
| **Low** | Estimated for an area under 49 hexagons, or any estimated month before October 2002 (Terra alone) | Faded fill under the hatch, a **Low confidence** marker and one line of explanation; no "more than usual" class |

**What it means.** For a small place such as a 7-hexagon neighbourhood (about 250 km²), the bars before 2012 are not comparable with the bars after 2012. A small place can look as if fire dropped in 2012 when only the satellite changed. The app now shows those bars faded and says so where you read the value: "Before 2012 this area is too small for a reliable estimate. Heights are not comparable with later years." It does not say "more than usual" about a small field in 2005. Large areas and the world keep medium confidence: their totals hold up.

**Why.** We checked the estimate against what VIIRS saw in 2012 to 2019, leaving one year out at a time (Whitepaper section 4.2, Table 2):
- In single hexagons with fire, MODIS saw nothing in 53% of months; in 7-hexagon areas 47%; in 49-hexagon areas 41%; in whole regions 15%. Where MODIS saw nothing, the estimate is zero, and nothing can bring those fires back.
- Where MODIS did see fire, the estimate is about twice too high for areas up to 49 hexagons (75th percentile 13.6 against 7.0 for 7 hexagons).
- Totals are right on average (0.4% too high overall; within 10% for 87% of regions). So the errors cancel in large areas and not in small ones.
- Before October 2002 only Terra flew. Its ratio (7.3 to 8.2) could not be checked out of sample, and outage months such as June 2001 (15 of 30 days missing) read low, so those months are low at every size.

This cannot be fixed with the available data: VIIRS did not exist before 2012 to check a correction against. The 49-hexagon line is a setting (`web/src/stats/config.ts`); at that size 41% of active months are still missed, so medium means "totals usable", not "exact". The band shown in scientific mode is the year-to-year spread of the regional ratio (median half-width 9%), not the error for a place.

### 7. What the map shows (D8, D12, D17)

- **Map colour:** each hexagon is coloured by **activity density** (active cell-days per 1,000 km²) on fixed, log-spaced steps, in both modes. A "compared with usual" map is not the default: at fine zoom almost every normal is zero, so any fire would look unusual.
- **Calendar:** the calendar in the History panel is scaled to the place's own range, so a quiet place is still readable.
- **Coverage:** detailed place history is built for the whole world, like the map.
- **Confidence on the map (D27):** a map hexagon is a small area too. In estimated months, the two finest levels (about 250 km² and 36 km² hexagons) are drawn faded, with a legend line "Before 2012, cells this small are not a reliable estimate". The coarser levels (about 1,800 km² and 12,400 km²) stay as they are. Before October 2002 every level is faded. Zoom out to compare years. The raw MODIS and VIIRS views in scientific mode show what each sensor saw and are not faded.

### 8. How we check it

- **Leave one year out:** each overlap year is predicted from the others and compared with what VIIRS saw. This is done at five sizes: one hexagon, 7 hexagons, about 250 km², about 1,800 km², and a whole region. In this build the 7-hexagon groups are the 7 hexagons inside each 250 km² cell, so those two rows are the same. Results are in `method.json` and in scientific mode. Bias by held-out year stays between 0.988 and 1.028, and 87% of regions are within 10% of 1.
- **Seam check:** scientific mode shows the step in the raw and harmonized series across each satellite change.
- **Contract checks:** every published file is checked, including that each area's value equals the sum of its hexagons.
- **Outages:** satellite outages are detected from the data and listed as known issues. The detector compares each day with a 91-day median, so long outages such as Aqua's in August 2020 are caught.

## 2027 forecast (`forecast/`)

The forecast shown in the app comes from the scripts in `forecast/`, documented in [Prediction.md](Prediction.md) and, in more detail, in [Vision Docs/PredictionEngineeringReport.md](Vision%20Docs/PredictionEngineeringReport.md).

- **What it predicts**: VIIRS (NOAA-20) active cell-days of vegetation fire per H3 res 4 area (about 1,800 km²) and month of 2027, for 67,422 areas, as a median and a 10% to 90% range.
- **Model**: LightGBM quantile regression on 21 features from fire history (2018-04 to 2026-10), with no look-ahead: features stop at 31 October of the year before.
- **Held-out test** (2025, and 2026 January to October, never seen in training): mean absolute error 3.39 against 3.39 for the usual-value baseline in 2025, 3.60 against 3.74 in 2026. Almost all of its skill is the usual season of each area.
- **Limits**: an outlook from history, not a weather forecast. It cannot foresee an unusually dry or wet year.

It is a separate data path from `pipeline/`: it reads its own merged MODIS and VIIRS files for 2018 to 2026 (`data/datasets/`, not produced by `pipeline/`), and its label is NOAA-20 only, not the harmonized score. Run order and inputs are in Prediction.md; packages in `forecast/requirements.txt`.

```text
.venv\Scripts\python -m pip install -r forecast\requirements.txt
.venv\Scripts\python forecast\01_build_firms.py   # then 02_analysis, 03_preprocess, 04_train, 05_figures
cd web; npm run import-forecast -- --csv ..\results\forecast_2027_res4.csv --metrics ..\results\metrics.json
```

## From demo to product

The hackathon build is a demo: static files built offline, run locally. The forecast is a first model on fire history, and the Why and What to do sections are a demo for four places in Italy with no data behind them. The proposed path to a product (not decided yet) is in [Vision Docs/Product Roadmap.md](Vision%20Docs/Product%20Roadmap.md):

- **Forecast**: the 2027 forecast exists (above). The roadmap's next steps, a model on the harmonized score and then weather, soil moisture and vegetation as inputs, are not built.
- **Causes and actions**: models that explain the main drivers and map them to actions, each backed by a named source.
- **World scale**: precomputed map tiles on a CDN, plus a small API only for drawn areas and forecasts.

## Data build

`pipeline/` turns the raw archive (below) into the JSON files the app reads, with DuckDB from Python: normalize, grid (H3 res 6 atoms), harmonize (MODIS to VIIRS-equivalent), publish. One command, about 12 minutes on a laptop for the full 2000 to 2026 archive:

```text
python -m venv .venv
.venv\Scripts\python -m pip install -r pipeline\requirements.txt
.venv\Scripts\python pipeline\build.py          # reads data/raw, writes web/public/firms
cd web; $env:VITE_DATA_BASE='/firms'; npm run dev   # PowerShell; see web/README.md for bash
```

The method decisions above are settings in `pipeline/config.toml`. Steps, timings and the measurements behind each decision: [pipeline/README.md](pipeline/README.md).

## Data

The data is not on GitHub (`data/` is git-ignored). Each maintainer downloads it locally. There are two routes. Use the archive for the bulk, and the API script only for months the archive lacks, so nothing is downloaded twice.

### Route 1: Archive Download (main route)

1. Open https://firms.modaps.eosdis.nasa.gov/download/ and sign in (free Earthdata login, or the email-code option).
2. Create requests with area **World**, format **CSV**. A world request can span at most one calendar year, so make one request per year. Tick several sources in one submit (MODIS, VIIRS S-NPP, VIIRS NOAA-20, VIIRS NOAA-21). Ranges: MODIS from 2000-11-01, S-NPP from 2012-01-20 (ended 2026-11-02), NOAA-20 from 2018-04-01, NOAA-21 from 2023-03-01, all up to the latest day.
3. The account refuses new requests while too many are still queued. Submit in batches and wait for the earlier ones to reach Processed.
4. When a request shows Processed on the list page (https://firms.modaps.eosdis.nasa.gov/download/list.php), its zip link works without login: `https://firms.modaps.eosdis.nasa.gov/data/download/DL_FIRE_<source>_<id>.zip`. The email only confirms the request and carries no link.
5. Save the zips to `data/raw/archive-zips/` and unzip each into its own folder `data/raw/archive/<zip name>/`. Each holds `fire_archive_*.csv` (and `fire_nrt_*.csv` for recent months).

**Ready-made links.** The 55 zips we requested on 2026-11-14 are listed in `scripts/firms_archive_links.csv` (request id, source, period, URL). They need no login, so a maintainer can download them directly, for example `curl -O <url>` for each row. NASA may remove old request files after some time, and if a link fails, make a new request as described above.

Size: the full set (2000-11 to 2026-11) is about 50 GB of CSV plus about 12 GB of zips. Delete the zips once unzipped and checked.

### Route 2: API script (gap filling)

**1. Get a key.** Free MAP_KEY at https://firms.modaps.eosdis.nasa.gov/api/map_key/. Put it in a `.env` file in the repo root (git-ignored):

```text
FIRMS_MAP_KEY=your_key_here
```

The key allows 5000 transactions per 10 minutes, counted per key. A world day costs about 36 transactions.

**2. Run the downloader** from the repo root (Python 3, standard library only):

```text
python -I scripts/download_firms.py --dry-run
python -I scripts/download_firms.py --skip-years 2018,2019,2023,2024,2025,2026
python -I scripts/download_firms.py --products MODIS,VIIRS_SNPP --start 2015-01-01 --end 2019-12-31
```

Options: `--products` (MODIS, VIIRS_SNPP, VIIRS_NOAA20, VIIRS_NOAA21 or full names like MODIS_SP), `--start`, `--end`, `--skip-years` (years already taken from the archive), `--key-var` (which `.env` variable holds the key), `--shard I/N` (run every Nth planned month, one process per key), `--dry-run`, `--max-transactions-per-window` (default 4500).

To go faster with teammates' keys (each is a free key from their own email), put them in `.env` as `FIRMS_MAP_KEY_2`, `FIRMS_MAP_KEY_3` and so on, and start one process per key, for example `--shard 0/3 --key-var FIRMS_MAP_KEY`, `--shard 1/3 --key-var FIRMS_MAP_KEY_2`, `--shard 2/3 --key-var FIRMS_MAP_KEY_3`. Each shard writes its own `download.shardN.log` and `manifest.shardN.json`. Check the FIRMS terms before using more keys than your own team's.

**3. Where files land**: `data/raw/firms/{PRODUCT}/{PRODUCT}_{YYYY-MM}.csv`, one file per month, plus `manifest.json` and `download.log`.

**Time.** All four sensors from their start through the API alone: about 640 product-months and 700000 transactions, so at least 26 hours with one key (about 4 hours with 6). One month takes 20 to 45 seconds when the rate limit is not in the way.

**Resume.** Safe to stop and rerun. Finished months are skipped, an interrupted month restarts from its first day, and failed months are listed at the end of the log and retried on the next run.

### Caveats

Suomi NPP FIRMS production ended on 2026-11-02, so VIIRS_SNPP_NRT stops there. The archive and API files differ in small ways (padded `acq_time`, satellite codes, no `type` column in NRT files). See [pipeline/README.md](pipeline/README.md), step normalize, before parsing them.

---

## Use of AI

The code was written with AI coding agents run through T3 Code (Claude and Gemini). The team made the idea, the design and product decisions and the method decisions, and checked the results. The demo content for four places in Italy (`web/src/insight/demo.ts`) was also written with T3 Code; its rules and place profiles are the team's product decisions, with no driver data behind them. The documents were drafted with the same agents, and [Whitepaper.md](Whitepaper.md) and [Prediction.md](Prediction.md) say which one drafted or reviewed each. Speech-to-text models (Whisper, Qwen3-ASR) transcribed the organizers' briefings for the team's notes.
