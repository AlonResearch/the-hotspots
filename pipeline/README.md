# Data build

Turns the raw FIRMS archive (`data/raw/`) into the static JSON folder the web app reads (data
contract v1, `Vision Docs/MVP Implementation Plan.md` section 4). DuckDB from Python, with the
DuckDB `h3` community extension (downloaded once on first use).

Each step is its own script and reads the previous step's output from disk, so any step can be
rerun alone. Settings, including every method decision, are in `pipeline/config.toml`.

## Rebuild everything

From the repository root (Windows paths shown; any OS works):

```text
python -m venv .venv
.venv\Scripts\python -m pip install -r pipeline\requirements.txt
cd web && npm ci && cd ..
.venv\Scripts\python pipeline\build.py --data-root <folder holding raw\>
```

`build.py` runs `normalize`, `grid`, `harmonize`, `publish`, then `npm run validate-data` on the
published folder. `--from STEP` restarts at a step. Without `--data-root` the scripts use
`<repo>/data`. In a git worktree, point it at the main checkout's `data` folder; the raw files
are read in place and never copied.

The steps one by one (same arguments):

```text
.venv\Scripts\python pipeline\normalize.py --data-root D:\...\data
.venv\Scripts\python pipeline\grid.py      --data-root D:\...\data
.venv\Scripts\python pipeline\harmonize.py --data-root D:\...\data
.venv\Scripts\python pipeline\publish.py   --data-root D:\...\data   [--out web\public\firms]
cd web && npm run validate-data -- public/firms
```

`normalize` and `grid` skip files that already exist (`--force` rewrites them). `publish` builds
next to the target and swaps it in when complete. It refuses to replace a folder whose manifest
does not say `"source": "firms"` (so it never overwrites the fixtures) unless `--force` is given.
Every step appends its run time and output size to `data/processed/build_log.json`.

## Steps

| Step | Reads | Writes | Measured (2026-11-15, one laptop) |
|---|---|---|---|
| `normalize.py` | `raw/archive/DL_FIRE_*/*.csv` (and `raw/firms/` API months the archive lacks) | `processed/normalized/product=*/{year}_{SP,NRT}_{file}.parquet` | 59 CSV files (about 50 GB), 660 million rows, 141 s, 7.0 GB |
| `grid.py` | normalized Parquet | `processed/atoms/` atom table, coverage tables, NRT static mask | 125 s (atoms), 1.1 GB; coverage tables and mask alone 25 s |
| `harmonize.py` | atoms | `processed/harmonized/cells.parquet`, `meta.json` | 58.0 million cell-months, 223 s, 268 MB |
| `publish.py` | harmonized | `web/public/firms/` (contract v1) | 47,305 files, 361 s, 2.6 GB |

**normalize**: one schema for all products: `satellite, sensor_group, lat, lon,
acq_date, acq_time, confidence_class, frp, daynight, type, processing, source_file`. Pads
`acq_time`, maps satellite codes (Terra/T, Aqua/A, SNPP/N, N20/1, N21/2) and fails on unknown codes,
maps MODIS confidence 0 to 100 to classes (low under 30, nominal 30 to 79, high 80 and above), sets
`type` to NULL in NRT files (they have no type column), and checks that SP and NRT rows never
overlap in time. The archive and API files differ (measured on 2026-11-14): `acq_time` is
zero-padded text in the archive (`0010`) and an integer in the API files (`12`); S-NPP is
`SNPP/SNPP` (satellite/instrument) in the archive and `N/VIIRS` in the API files; `version`
strings differ; the archive NRT files (`fire_nrt_*.csv`) have no `type` column.

**grid**: the atom table: `cell6, month, satellite, active_days, day_mask,
n_det, n_det_night, frp_max, frp_sum, processing` for detections that pass the filters (type 0,
nominal or high confidence). The day is the UTC `acq_date`. Also writes `coverage.parquet` (days
with data per satellite and month), `coverage_daily.parquet` (rows per satellite and day) and the
NRT static mask (res 6 cells where at least half of the 2021 to 2025 SP detections are not type 0;
21,963 cells), which replaces the missing type filter in NRT months.

**harmonize**: collapses atoms per (cell, month, satellite) with `bit_or` of the day masks, then per
res 6 cell and month: `modis` (days seen by Terra or Aqua), the five per-satellite day counts, and
`viirs` (mean of S-NPP and NOAA-20 over those nominal in the month). Fits the ratio of S-NPP to
MODIS cell-days per H3 res 1 region and season on 2012-02 to 2019-12 (fallback to the res 0 parent
and then the globe below 30 MODIS cell-days), with a bootstrap band over the fit years, plus a
Terra-only ratio for the months before Aqua is nominal. Writes `h`, `lo`, `hi` as integers in
tenths, so every sum of cells is exact. Also fits a NOAA-20 to S-NPP scale (not applied by
default), leave-one-year-out by scale, and the measurements listed below.

**publish**: overview files per month at res 3, 4 and 5 (res 5 for all 107 active res 0 parts),
detail tiles for the res 3 cells whose centre lies in `publish.detail_areas`, the world summary,
places, `method.json` and the manifest (status ranges, partial month, seams and known issues are
measured from the files, not typed in).

## Method decisions and where they live

The team decided D1 to D17 on 2026-11-15. What each one means and why it was chosen is in the
section "How the fire score works" of `Contributor.md` (repository root). This table only maps them to settings.

| # | Decision | Setting |
|---|---|---|
| D1 | Plain ratio, VIIRS-equivalent | `harmonize.transfer` |
| D2 | Fit on S-NPP alone. Published VIIRS: mean of S-NPP and NOAA-20 when both nominal, else the one available; NOAA-21 held back. NOAA-20 to S-NPP scale fitted and reported, not applied | `harmonize.fit_reference`, `viirs_group`, `scale_noaa20_to_snpp` |
| D3 | Fit 2012-02 to 2019-12; 2020-01 to 2025-12 fitted for comparison only | `harmonize.fit_from`, `fit_to`, `compare_*` |
| D4 | Baseline 2012 to 2025 (VIIRS years only), target year excluded, at least 10 years | `publish.baseline` |
| D5 | Separate Terra-only ratio before Aqua is nominal (2002-10); months before 2012-02 estimated | `harmonize.terra_only_ratio` |
| D6 | H3 res 1 x season, fallback res 0 then global below 30 MODIS cell-days | `harmonize.region_res`, `min_fit_cell_days` |
| D7 | Classes at 25, 75, 90; ratio wording from a normal of 3 | `publish.classes` |
| D8 | Detail (place history) for the whole world: 13,183 res 3 tiles. World at res 3, 4 and 5 | `publish.detail_areas`, `r5_parts` |
| D9 | LOYO bias, MAE, n, plus the share predicted 0 but observed above 0 and the 75th percentiles; breakdown by held-out year, season and region (`loyo_breakdown`) | in `harmonize.py` |
| D10 | UTC `acq_date` | `grid.day` |
| D11 | Nominal and high confidence, type 0; NRT months: static mask from SP files, provisional | `filters.*` |
| D16 | Demo place: Piedmont, Italy (preset `piedmont`); daily fields for it and its neighbours | `publish.places`, `publish.daily_areas` |

Build settings that are not in D1 to D17: `nominal_day_share = 1.0` (a satellite with one missing day drops
out of the VIIRS mean for that month), `outage_low_day_share = 0.4` of the satellite's median daily rows over a centred
`outage_window_days = 91` window (known issues, display only), `loyo_region_min_obs = 100` (regions in the
leave-one-year-out breakdown), bootstrap of 200 draws, band 5th to 95th percentile, seed 1.

## Daily fields (Piedmont only)

`publish.daily_areas` lists boxes. Every active res 6 cell whose centre is in a box is selected
(Piedmont: 1,017 cells; Piedmont and its neighbouring regions: 3,423). Publish then splits the
monthly `h` of every res 6 cell under the res 3 parents of the selected cells over its UTC days:
before 2012-02 evenly over the MODIS days, from 2012-02 by the VIIRS group weight of each satellite
on each day, rounded with the largest-remainder rule in tenths so the days of every cell sum exactly
to its month. It writes:

- detail tiles: `daily = {rows, dm_modis, dm_snpp, dm_noaa20}` for the rows of selected cells;
- overview r3, r4, r5: `daily = {idx, d}` with `[day, value]` pairs for every cell that contains a
  selected cell, covering the whole cell;
- summary: `daily_areas`, one daily series per box, from the first day of the record to the data date;
- manifest: `daily = {areas, res6_cells, days: "utc"}`; `method.json`: `daily` (rule, VIIRS weights).

Checks in publish: every res 6 cell-month, every overview cell-month with daily values (r3 5,474,
r4 13,261, r5 25,612) and every area-month sums exactly to its monthly value; the day masks
reproduce `modis`, `snpp`, `noaa20` and `viirs`. Measured: 56,000 (cell, day) values, 1.8 MB added
to a 2.76 GB build (r3 +0.27 MB, r4 +0.39 MB, r5 +0.53 MB, detail +0.60 MB, summary +49 KB). The
field layout is section 4.6 of the MVP plan. An empty `daily_areas` turns the fields off.

## Measurements in this build (2026-11-15)

All in `data/processed/harmonized/meta.json`; the summaries also in the published `method.json`.

- **Ratio S-NPP / MODIS** (global, fit 2012-02 to 2019-12, 93 months; 2012-03 and 2016-02 dropped
  because a satellite missed a day): DJF 2.903, MAM 3.059, JJA 2.472, SON 2.837. The 2020 to 2025
  fit (not applied): 2.999, 3.115, 2.498, 2.872. Strata: 1,198 region-seasons use their own ratio,
  400 the res 0 fallback, 466 the global one.
- **Leave-one-year-out** (S-NPP as observed): bias 1.004 at every scale (a ratio of sums cannot
  differ between scales). Mean absolute error: res 6 2.1, res 5 3.6, res 4 7.4, region 177
  cell-days. Unit-months predicted 0 but observed above 0: res 6 53%, res 5 47%, res 4 41%, region
  15%. 75th percentile of non-zero units, predicted / observed: res 6 6.3 / 3.0, res 5 13.6 / 7.0,
  res 4 27.3 / 14.0, region 927 / 749. Breakdown (`loyo_breakdown`): bias by held-out year 2012 to
  2019 is 1.028, 0.994, 0.988, 1.011, 1.004, 1.010, 0.989, 1.008 (range 0.988 to 1.028); mean absolute
  error at res 4 by held-out year is 7.19 to 7.71 cell-days; bias by season DJF 1.002, MAM 1.004,
  JJA 1.004, SON 1.004. Over the 350 res 1 regions with at least 100 observed cell-days in the fit
  months, bias has p10 0.937, median 1.005, p90 1.033, and 87.4% are within 10% of 1.
- **NOAA-20 and S-NPP** (months where both have data every day): NOAA-20 / S-NPP cell-days 1.022,
  so with the scale off `h` steps by about x1.011 at 2018-04 and again at 2026-11. The fitted
  scale S-NPP / NOAA-20: DJF 0.980, MAM 0.979, JJA 0.973, SON 0.981, bands within about 1%.
  NOAA-21 / NOAA-20: 0.975. With `nominal_day_share = 1.0`, 15 months from 2018-04 use one
  satellite: 2022-07, 2022-08, 2023-07, 2023-09, 2024-02, 2024-05, 2024-06, 2024-07, 2024-09,
  2024-11, 2026-03, 2026-04, 2026-06, 2026-07, 2026-11.
- **D4 zero shares** (7-cell places = the 7 res 6 children of a res 5 cell, fit months): no
  activity in 88.1% of place-months on MODIS against 78.7% on S-NPP, a gap of 9.3 points; MODIS
  zero with S-NPP active in 10.6%. By res 1 region: 146 regions over 10 points (44% of places),
  100 between 5 and 10, 217 under 5, median 5.6. Relative band half-width (hi - lo) / 2h of the
  res 1 ratios: median 0.089, 90th percentile 0.31, maximum 4.7; global ratios 0.009 to 0.018.
- **Outages**: 67 satellite-months in `meta.json`, merged into 54 known-issue ranges (a missing day,
  or a day under 40% of the satellite's median daily rows over a centred 91-day window). The
  detector flags all of the Aqua outage of 16 August to 2 September 2020: 15 low days in 2020-08
  and 2 in 2020-09. 37 satellite-months fall in the 2012 to 2025 baseline years; 19 are S-NPP or
  NOAA-20 and can change `h`: S-NPP 2012-03, 2012-06, 2022-06, 2022-07, 2022-08, 2023-07, 2023-11,
  2024-01, 2024-05, 2024-06, 2024-07, 2024-09, 2024-11, 2025-07, 2025-11; NOAA-20 2023-07, 2023-09,
  2023-10, 2024-02. The other 18 are Terra, Aqua or NOAA-21. They are not excluded from baselines.
  Flags are display only; values and complete months do not depend on them.
- **Published sizes**: overview 1.1 GB (largest month file: r3 307 KB, r4 1.2 MB, r5 524 KB),
  detail 1.5 GB in 13,183 tiles (largest 1.4 MB), 2.6 GB and 47,305 files in total.
  `npm run validate-data` on it takes over an hour (the first, smaller build: 16 minutes).

## Notes for readers of the numbers

- Per-cell harmonized values before 2012-02 come from a regional ratio. They are estimated, can
  exceed the days in the month, and are zero wherever MODIS saw nothing (plan S1). Sums over areas
  are the reliable figure.
- The band is the spread of the regional ratio across the fit years, not a per-cell error (plan
  S2). For the error by size of area, read the leave-one-year-out table in `method.json`.
- `ring7` in that table is the 7 res 6 children of a res 5 cell (centre child plus ring 1), so it
  gives the same numbers as `res5`.
