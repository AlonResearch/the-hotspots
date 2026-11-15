# Product Roadmap: from the demo to the product

> **Status**: proposal, 2026-11-15. Nothing here is decided. It describes how the hackathon demo would grow into a product: the forecasting models, the recommendation models and the backend for a world-scale map. Method choices stay with the team (`MVP Implementation Plan.md` section 13). Claims from outside the team's reading are marked [M] (memory, unverified).
>
> **AI disclosure**: drafted by an AI assistant (Claude) from the team's documents. The team owns the content.

> **Note (2026-11-15)**: mentions of `Solution.md`, `ImplementationPlan.md`, `Map Grid Plan.md` and `Thread Briefs.md` refer to early hackathon plans that were removed from the repository; they are in the git history.

Contents: 1 what the demo is, 2 forecasting today, 3 forecasting with a regression on the harmonized score, 4 the full models (causes and recommendations), 5 the backend for a world-scale web app, 6 order of work, 7 pitch lines.

---

## 1. What the demo is

| Part | In the demo | In the product |
|---|---|---|
| Data | FIRMS archive, built offline into static JSON files, run locally | Continuous ingestion of FIRMS near-real-time and standard data |
| Harmonization | One VIIRS-equivalent score (active cell-days), plain ratio before 2012, versioned method | Same method, refitted when satellites change, every version kept |
| History | Map, time strip, calendar, typical and unusual months, contributions | Same, plus daily views and any drawn area at any size |
| Outlook | Empirical outlook from past years (section 2), if built | Distributional regression (section 3), then driver models (section 4) |
| Causes and actions | Handcrafted cards from the data and the literature | Models trained on driver data, each action backed by a named source |
| Hosting | Static files, no backend | Precomputed tiles on a CDN, a small API for drawn areas and forecasts |

The demo shows how the product behaves. The models in sections 3 and 4 need driver data, training and validation time that a 24-hour event does not give (`Insight Engine.md` section 6).

---

## 2. Forecasting today: the empirical outlook

This is the outlook of `Solution.md` 6.4. It is a climatology, not a weather forecast, and the UI says so.

For a place and a calendar month `m`, using the baseline years:

- **Chance of any fire activity**: `P(y > 0) = (years with y > 0) / (baseline years)`. Example: "Fire activity in October in 9 of 13 years."
- **Range of activity**: the median and the 25th to 75th percentile of the place's harmonized active cell-days in that month.
- **Validation**: leave one year out. Predict each held-out year from the others and compare with two naive rules: "same as last year" and "always the median". If the outlook does not beat both, the UI does not show it.

Why it is a good first step: it is honest, it needs no new data, and it uses the same baseline as the history view (2012 to 2025 under the current default), so the two never disagree.

Its limit: it knows the season and nothing about this year. A wet spring and a drought year get the same answer.

---

## 3. Forecasting with a regression on the harmonized score

The next step keeps the hotspot history as the only input and learns the **probability distribution of next month's harmonized score given the past scores**.

### 3.1 What is predicted

The target is `y`, the harmonized active cell-days of a place in a future month. It is a count with many zeros, so its distribution is a probability mass over 0, 1, 2 and so on, not a smooth density. The model returns the whole distribution, not one number. From it the app reads:

- `P(y > 0)`: chance of any fire activity.
- `P(y > p90 of the baseline)`: chance of a "much more than usual" month, in the same terms as the history view.
- The median and a 10th to 90th percentile range.

### 3.2 Model shape (a hurdle model)

Two parts, both regressions on the same features:

1. **Will there be any activity?** A logistic regression for `P(y > 0)`.
2. **How much, if any?** A count regression for `y` given `y > 0`, for example a truncated negative binomial. The negative binomial allows the spread to grow with the mean, which fire counts need.

Features from the harmonized history only:

| Feature | Meaning |
|---|---|
| Season | Calendar month, as sine and cosine or 12 dummies |
| Climatology | The place's baseline median and share of active years for that month |
| Recent anomaly | Last 1 to 3 months against their own baselines (persistence) |
| Last year | Same month last year |
| Trend | Year, to catch slow change such as land-use change |
| Region | The res 1 region, or the region's climatology, so data-poor places borrow strength |

Alternatives with the same output: quantile regression for a few quantiles, or gradient-boosted trees with a distributional loss [M]. The hurdle model comes first because each coefficient can be read and checked.

### 3.3 Rules that come from our method

- **Train on observed years.** VIIRS years (2012 on) are observed. Pre-2012 values are estimates whose zero share is distorted for small areas (plan finding S1). Train on 2012 on, or give earlier years a lower weight and test whether they help.
- **Model areas, not single cells.** A res 6 cell is mostly zeros. Fit on places and on res 4 and res 5 cells. If a forecast per res 6 cell is needed for the map, sample from the cell models and sum the draws, so the area forecast keeps the correlation between neighbours.
- **Same units as the history.** The model predicts harmonized active cell-days, so "more than usual" means the same thing in the history and in the outlook.

### 3.4 Validation

- **Rolling origin**: train on years up to `Y`, predict `Y + 1`, move forward one year at a time. Never let a test year into training.
- **Scores for distributions**: the Brier score for `P(y > 0)` and `P(y > p90)`, and the ranked probability score for the whole distribution [M]. Reliability diagram: when the model says 30%, does it happen about 30% of the time?
- **Must beat the empirical outlook of section 2.** If it does not, keep the simpler one.

Expected result, to state in the pitch: from hotspot history alone, most of the skill is the season. A gain over climatology needs the drivers of section 4.

---

## 4. The full models: probability, causes, recommendations

This is the three-step pipeline of `Insight Engine.md` section 2. The demo cards are handcrafted stand-ins for it.

### 4.1 Predict: add the drivers

The hurdle model of section 3 gets driver features (`Insight Engine.md` section 3):

| Driver | Feature | Source |
|---|---|---|
| Weather | Fire Weather Index forecast and its anomaly | Copernicus CDS, ECMWF |
| Soil moisture | Anomaly of the top soil layer | SMAP, ERA5-Land |
| Vegetation | NDVI anomaly | Sentinel-2/3 |
| Fuel structure | Understory and biomass indicators | GEDI, Sentinel-1 |
| People | Distance to roads, farmland and towns | Land-use and road maps |

With weather and soil forecasts as inputs, the lead time becomes weeks to a season instead of "this month in a typical year". Validation stays as in 3.4, and the model must beat the history-only model.

### 4.2 Explain: why is it likely?

For a regression, the contribution of each feature to a place's prediction can be read from its coefficients times the feature's departure from normal. For tree models, SHAP values do the same [M]. The UI shows the top two or three causes in plain words ("soil much drier than usual for October").

### 4.3 Recommend: what lowers it?

A table of actions, each with a named source (agency guidance, EFFIS or regional fire plans), and rules or a classifier that map the predicted risk and its main causes to those actions. Rules come first: they are auditable, and the number of labelled examples for a classifier is small. Nothing is presented as operational advice until each line has a source and an expert has reviewed it (`Solution.md` 6.5).

---

## 5. The backend for a world-scale web app

The demo has no backend: every file is built offline. The product keeps that idea for everything that can be precomputed and adds a small dynamic part only for what cannot.

### 5.1 Data flow

```
FIRMS NRT and SP  ->  ingest (scheduled)  ->  atom table (res 6 x day x satellite, Parquet)
                                                  |
                       harmonize (versioned method, refit on satellite changes)
                                                  |
             +------------------------+-----------+-------------+
             |                        |                         |
      map tiles per zoom        place series store        forecast jobs
      and month or day          (columnar, by region)     (nightly per region)
             |                        |                         |
          CDN cache            API for drawn areas         stored like series
```

### 5.2 Ingest

- Pull FIRMS near-real-time data on a schedule. Replace it with standard data when standard data is released, and keep the "provisional" status until then.
- Store the atom table in object storage, partitioned by month and res 0 region. A new day touches only a few partitions.
- Because every value is a sum of res 6 atoms, an update recomputes only the cells and months it touched. Coarser cells and areas follow by summing.
- Detect outages automatically (a satellite with missing days) and write them into `known_issues`, so the app never compares a broken month with normal.

### 5.3 Harmonize

- The ratio tables are refitted only when something changes: a new satellite, a new standard-data release or a team method decision. Each fit is a method version with its own `method.json`.
- Every published number carries the method version, so a past screenshot can be reproduced.
- The same overlap calibration handles future satellites: NOAA-21 against NOAA-20 now, and the next satellites in the series later [M].

### 5.4 Serve the world map

- **Precomputed tiles.** For each zoom level and each month (and day), the cells are cut into map tiles and stored as immutable files with the method version in the path. A CDN serves them, so the cost grows with the number of tiles, not with the number of users. Formats such as vector tiles or a single-file tile archive (PMTiles) fit this [M].
- **Cache rules.** Closed months never change for a method version, so their tiles are cached forever. Only the current month and the provisional months have a short cache time.
- **Daily playback.** Daily tiles are written only for zoom levels where they stay small. At coarse zooms the client plays the daily values carried inside the monthly tile.

### 5.5 Serve drawn areas and forecasts

- **Presets and common places** (countries, regions, protected areas) are precomputed like tiles.
- **Any drawn area** goes to a small API. It turns the shape into res 6 cells, sums their series from the columnar store and returns the place series with its classes. The result is cached by a hash of the cell list, so the same field drawn twice costs one computation.
- **Forecasts** are batch jobs per region, stored next to the series and served the same way. No model runs on a user request.

### 5.6 What keeps it reliable

- Static first: if the API is down, the map, the presets and the history still work from the CDN.
- Rate limits on the drawn-area API, and a cap on area size per request (the app already has one).
- Monitoring of data freshness and of the satellite status, shown to users as the "provisional" and "known issue" markers the demo already has.
- Phones are first-class (`AGENTS.md` rule 6). The tile sizes are chosen for mobile networks.

---

## 6. Order of work after the hackathon

1. Settle the method decisions D1 to D6 with the team and freeze method version 1.
2. Automate ingestion and the build, then publish to a CDN. The demo becomes a live map with no new science.
3. Empirical outlook (section 2) with its validation.
4. History-only regression (section 3). Ship it only if it beats step 3.
5. Driver data and the full predict, explain and recommend pipeline (section 4), one region first, with expert review of the actions.
6. Drawn-area API and daily views at all zooms.

---

## 7. Pitch lines

Three slides at most. Talk over them, do not read them.

**Slide: "Today, a demo"**
- One fire score for 26 years and four satellites (NOAA-21 shown separately), comparable across the 2012 change of satellites.
- Any place on Earth: is it burning more than usual, and since when?
- Built offline from NASA FIRMS, runs as a static web app.

Spoken: "Everything you see is real NASA data, merged into one score. The advice cards are a mock-up of what the models will say."

**Slide: "Next, a forecast"**
- Step 1: chance of fire next month from 26 years of history. Must beat "same as last year".
- Step 2: add weather, soil moisture and vegetation, to see a bad season weeks ahead.
- Step 3: explain the cause and suggest an action, each backed by a source.

**Slide: "At world scale"**
- The world map is precomputed and served from a cache, so more users add bandwidth, not server work.
- Only drawn areas and forecasts need a server, and the map keeps working without it.
- Every number carries its method version, so any result can be reproduced.
