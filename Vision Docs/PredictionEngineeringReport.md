# Engineering Report: 2027 Vegetation-Fire Outlook from MODIS + VIIRS

| | |
|---|---|
| Project | NASA Space Apps 2026, "Harmonization of MODIS and VIIRS Hot Spots", team "The Hotspots" |
| Scope | Prediction component: data harmonisation, label, preprocessing, model, validation, 2027 forecast |
| Code | `forecast/01_build_firms.py` … `forecast/05_figures.py` in this repository, copied from `src/` of the separate prediction project at its commit `dfb8163` (not a commit of this repository) |
| Status | Complete. Validated on held-out 2025 and 2026 Jan–Oct |
| Date | 2026-11-15 |

**Summary.** The system forecasts, for each of 67,422 H3 res-4 areas (~1,770 km²) and each month of 2027, the number of VIIRS active cell-days of vegetation fire. A LightGBM quantile model uses 21 features computed from fire history available on 2026-10-31. On held-out years the median model scores MAE 3.393 (2025) and 3.604 (2026) against 3.395 and 3.737 for the best baseline (seasonal climatology), classifies active vs inactive area-months with 84 % accuracy, and reproduces world monthly totals within 8–11 %. 83 % of the label variance is a stable place × season pattern; the model adds at most 3.6 % over climatology.

---

## 1. Requirements

| ID | Requirement | Implementation |
|---|---|---|
| R1 | Forecast all of 2027 | 12 monthly values per area, forecast origin 2026-10-31 |
| R2 | Combine MODIS and VIIRS without loss or double counting | Merge on H3 res-6 cell × UTC day, per-sensor columns (§4) |
| R3 | Demonstrate validity | Whole-year hold-out, identical forecast origin, 4 baselines (§8) |
| R4 | Run on one laptop within ~3 h | DuckDB with memory cap, CPU LightGBM; full pipeline ≈ 10 min |
| R5 | Traceability | Numbered scripts, `STEPS.md` log, this report |

## 2. Pipeline

`FIRMS CSV` → **01** cell-day merge → **02** monthly label grid → **03** features with cut-off → **04** train / validate / forecast → **05** figures

| Stage | Script | Input | Output | Runtime | Peak RAM |
|---|---|---|---|---|---|
| Merge | `01_build_firms.py` | `MODIS-2018-2026.csv`, `VIIRS-2018-2026.csv` (17 GB) | `FIRMS-2018-2026.parquet` / `.csv` | 83 s | 6.3 GB |
| Label + analysis | `02_analysis.py` | FIRMS parquet | `monthly_res4.parquet`, `monthly_res5.parquet` | 30 s | 5.1 GB |
| Features | `03_preprocess.py` | `monthly_res4.parquet` | `train_res4.parquet`, `features_2027_res4.parquet` | 15 s | 3.5 GB |
| Model | `04_train.py` | feature tables | `forecast_2027_res4.*`, `metrics.json`, `feature_importance.csv`, `test_predictions_res4.parquet` | 399 s | 3.9 GB |
| Figures | `05_figures.py` | outputs above | `results/figures/fig1…fig6` | not timed | not measured |

## 3. Data

### 3.1 Sources

| | MODIS | VIIRS |
|---|---|---|
| Product | FIRMS MODIS C6.1 (`M-C61`), Terra + Aqua | FIRMS VIIRS 375 m C2 (`J1V-C2`), NOAA-20 |
| Pixel at nadir | 1 km | 375 m |
| Period | 2018-04-01 → 2026-11-13 | 2018-04-01 → 2026-11-13 |
| Standard (archive) data | to 2026-08-31 | to 2026-07-31 |
| Near-real-time (NRT) data | 2026-09-01 → 11-13 (794,182 rows) | 2026-08-01 → 11-13 (7,451,723 rows) |
| Rows | 36,962,044 | 173,673,734 |

Acquisition: 55 FIRMS archive downloads, links in `data/firms_archive_links.csv`. Not used: MODIS 2000–2017, S-NPP, NOAA-21 (on disk in `data/firms-archive-csv/`).

### 3.2 Data-quality findings

| Finding | Evidence | Handling |
|---|---|---|
| NRT rows have no `type` column | Header check, all rows | `type = NaN`; static non-vegetation mask (§4, D3) |
| VIIRS missing days | 2023-07-19 → 22, 2023-09-30, 2024-02-04 (full date scan) | Monthly label scaled (§6, P2) |
| Partial last day | 2026-11-14 ends 16:52 UTC (VIIRS) | Data cut at 2026-11-13; Nov 2026 (13 days) excluded from monthly tables |
| Different MODIS start | NOAA-20 data begins 2018-04-01 | MODIS cut to 2018-04-01 (891,376 rows dropped) |
| VIIRS `brightness` saturates | 5.6 % of 2024 rows at 367 K | Column not used |
| VIIRS `bright_t31` fill value | 79 rows = 0 K (2024) | Column not used |
| Coordinates in scientific notation | e.g. `-9e-05`, 2–18 per file | Parsed as DOUBLE; no action |
| MODIS `version` label change | `6.03` → `61.03` at 2023 | Column not used (kept only as NRT flag) |
| MODIS orbit drift | §5, D5 | MODIS excluded from the label |

### 3.3 Column harmonisation

| Class | Columns | Treatment |
|---|---|---|
| Same meaning, same values | `latitude`, `longitude`, `acq_date`, `daynight`, `type` | Used |
| Same meaning, different coding | `confidence` (0–100 vs `l/n/h`), `instrument`, `satellite`, `version` | Recoded: confidence → nominal/high flag; instrument → sensor; version → `is_nrt` |
| Same name, different measurement | `brightness`, `bright_t31` (different bands), `scan`, `track` (~10× pixel area), `frp` (pixel-size dependent) | `frp` kept per sensor, never summed across sensors; others dropped |

## 4. Merge

| ID | Decision | Alternatives rejected | Rationale (evidence) |
|---|---|---|---|
| D1 | Aggregate to **H3 res-6 cell (36.1 km²) × UTC day**, one row per active cell-day, separate MODIS / VIIRS columns | (a) stack rows; (b) match individual detections across sensors | (a) counts one fire 2.9× (2024: 23.07 M detections vs 8.00 M active cell-days). (b) 1 km vs 375 m footprints and different overpass times make pixel matching ill-defined. H3 is near-equal-area and the team standard |
| D2 | Keep confidence nominal/high only (MODIS ≥ 30; VIIRS `n`, `h`) and `type = 0` (vegetation) | Keep all detections | Team rule (`INFO.md`); removes low-confidence and static industrial / volcanic / offshore sources |
| D3 | NRT rows: exclude res-6 cells where > 50 % of archive detections are `type` 1–3 (static mask, 23,216 cells) | Keep all NRT rows; drop NRT data | Out-of-sample test (mask from 2023, applied to 2024): 0.9 % of `type`-filtered cell-days missed, 0.8 % extra |
| D4 | Keep both sensors | VIIRS only | MODIS-only cell-days: 12.1 % of all active cell-days |

Implementation: DuckDB 2.0 + H3 community extension, two stages: (1) group by cell × day × sensor × class (veg / non-veg / NRT) → 76,726,361 rows; (2) mask + pivot → output.

| Output `FIRMS-2018-2026` | Value |
|---|---|
| Rows / distinct res-6 cells | 59,706,382 / 1,781,987 |
| Both sensors / MODIS only / VIIRS only | 18.2 % / 12.1 % / 69.8 % |
| Detections retained | MODIS 33.4 M, VIIRS 141.5 M |
| NRT rows | 2,268,126 |
| Columns | `cell, date, modis_n, modis_frp, modis_night, viirs_n, viirs_frp, viirs_night, is_nrt` |

## 5. Label

**Definition.** For H3 res-4 area *a* and month *m*:
`y(a, m) = number of (res-6 cell c inside a, day d in m) with ≥ 1 qualifying VIIRS detection`.

| ID | Decision | Alternatives rejected | Rationale (evidence) |
|---|---|---|---|
| D5 | **VIIRS NOAA-20 only** in the label; MODIS as features | MODIS + VIIRS union | Mean local time of MODIS daytime detections: Terra 10:45 (2018–21) → 09:42 (2026), Aqua 13:32 → 15:19. MODIS/VIIRS active cell-day ratio: 0.365 (2018) → 0.303 (2026). A MODIS-based label would contain a sensor-driven downward trend |
| D6 | **Active cell-days** | Detection count; FRP sum | Year-to-year correlation 2023 → 2024 (log scale), at 0.4° grid: cell-days 0.770, detections 0.738, FRP 0.707; same order at 0.05°, 0.15°, 1.0° |
| D7 | **H3 res 4** (~1,770 km²) | res 5 (~252 km²), res 6 | Place × season share of variance: 83 % (res 4) vs 76 % (res 5). Zero share 62 % vs 79 %. Rows 6.9 M vs 37.1 M (RAM budget) |
| D8 | **Calendar month** (UTC days) | Week; year | Team definition; strong annual cycle (peak August, minimum May); yearly world totals within −7 % / +8 % of the 2019–2025 mean |

Label grid: 67,422 areas (≥ 1 qualifying detection of either sensor, 2018-04 → 2026-10) × 103 months = 6,944,466 rows; 62.3 % zeros; non-zero median 4, p90 48, max 968.

## 6. Preprocessing and features

| # | Step | Detail |
|---|---|---|
| P1 | Dense grid | Zero-filled area × month (2018-04 → 2026-10), float32 / int8 types |
| P2 | Missing-day correction | `y` and VIIRS FRP × (days in month / days with data): 2023-07 × 31/27, 2023-09 × 30/29, 2024-02 × 29/28 |
| P3 | Forecast-origin rule | For target year *Y*, features use only months before *Y−1*-11-01 (origin 31 Oct of *Y−1*) |
| P4 | Target | Raw count `y`, no transform |
| P5 | Samples | Target years 2020–2027, 809,064 area-months each (2026: 674,220 with known target, Jan–Oct) |
| P6 | Split | Train 2020–2024 (4,045,320) · Test 2025 + 2026 Jan–Oct (1,483,284; 200,560 NRT targets) · Predict 2027 (809,064) |

| ID | Decision | Rationale |
|---|---|---|
| D9 | Origin 31 Oct of the previous year, identical for training, test and forecast | Data for the real forecast ends 2026-11-13; November is incomplete. Same origin in training removes look-ahead and makes test skill representative of 2027 use. Lead times 3 (Jan) to 14 (Dec) months |
| D10 | Scale months with missing VIIRS days | Without it July 2023 is 13 % low and biases climatology |
| D11 | First target year 2020 | Needs ≥ 1.5 years of history; target 2019 would have 7 months (2018-04 → 10) |

**Features (21)**, all computed from data before the origin:

| Group | Features | Definition |
|---|---|---|
| Calendar | `month`, `month_sin`, `month_cos`, `lead` | Target month; cyclic encoding; months after origin (`month + 2`) |
| Location | `lat`, `lon` | Area centroid |
| Climatology | `clim_mean`, `clim_median`, `clim_max`, `clim_std`, `clim_active_share`, `clim_n_years` | Statistics of `y` for the same calendar month over prior years |
| Persistence | `last_same` | Latest known same month (*Y−1* for Jan–Oct, *Y−2* for Nov–Dec) |
| Recent anomaly | `recent3`, `recent3_ratio`, `last12`, `last12_ratio` | Aug–Oct of *Y−1* and last 12 months, absolute and relative to the area's prior mean |
| Trend | `fy_slope` | Linear slope of fire-year (Nov–Oct) totals, fire years ≥ 2019 |
| MODIS | `modis_clim_mean`, `modis_ratio` | MODIS active cell-days, same-month mean; MODIS/VIIRS ratio of the area |
| Intensity | `frp_clim_mean` | VIIRS FRP, same-month mean |

Missing values (left to LightGBM): `fy_slope` and `last12_ratio` for target year 2020 (one fire year only), `clim_std` 5.2 % (single prior year).

## 7. Model

### 7.1 Selection

| Candidate | Verdict | Reason |
|---|---|---|
| Climatology (same-month mean / median) | Baseline | Team Step 1; explains 83 % of variance |
| Persistence (same month last year) | Baseline | Climatology MAE 28 % lower in analysis (3.41 vs 4.73) |
| Hurdle GLM (logit + zero-truncated NB), team Step 2 | Not implemented | Time budget; replaced by its named alternative |
| **LightGBM, quantile objectives** | **Selected** | Named alternative in team plan; non-linear feature interactions; native NaN handling; quantiles give median and range directly; trains on 5.5 M rows in minutes on CPU |
| Deep / sequence models | Rejected | ≤ 8 years per area-month; 83 % of signal is static seasonality; no usable GPU |

### 7.2 Configuration

| Parameter | Value |
|---|---|
| Library | LightGBM 4.7.0, CPU, 12 threads, seed 42 |
| Objectives | Quantile α = 0.1, 0.5, 0.9 (accepted); Tweedie, variance power 1.2 (rejected, §8.5) |
| Tree parameters | learning rate 0.1, 63 leaves, min 200 rows per leaf, feature fraction 0.8, bagging 0.8 every iteration, L2 = 1.0 |
| Early stopping | Train 2020–2023, validate 2024, patience 40, max 800 trees → best 55 / 372 / 196 / 88 (Tweedie / p10 / p50 / p90) |
| Test refit | Train 2020–2024, trees = best × 1.1 |
| Final refit | Train 2020 → 2026-10 (5.53 M rows), trees × 1.15 (+37 % rows) → 69 / 470 / 247 / 110 |
| Post-processing | Clip at 0; enforce p10 ≤ p50 ≤ p90 |

No hyperparameter search was run (time budget).

## 8. Validation

### 8.1 Protocol
Test years are never in the training data, and their features use the same origin rule (31 Oct of the previous year). Baselines use the same cut-off. Metrics: MAE, RMSE, correlation of log(1+y), ratio of summed forecast to summed truth.

### 8.2 Results

| Method | MAE 2025 | RMSE 2025 | MAE 2026 Jan–Oct | RMSE 2026 Jan–Oct | Total ratio 2025 / 2026 |
|---|---|---|---|---|---|
| Always 0 | 7.063 | 31.73 | 7.474 | 32.35 | 0 / 0 |
| Same month last year | 4.789 | 18.54 | 4.324 | 16.46 | 1.153 / 0.984 |
| Climatology mean | 3.710 | 12.99 | 4.019 | 14.29 | 1.081 / 1.047 |
| Climatology median | 3.395 | 13.01 | 3.737 | 14.59 | 0.958 / 0.924 |
| LightGBM Tweedie | 4.006 | 13.59 | 4.265 | 14.63 | 1.166 / 1.138 |
| **LightGBM p50** | **3.393** | **12.93** | **3.604** | **14.07** | 0.948 / 0.901 |

Units: active cell-days per area-month; mean target 7.06 (2025), 7.47 (2026).

### 8.3 Segments (LightGBM p50 vs climatology median, MAE)

| Segment | Model | Baseline |
|---|---|---|
| 2025, tropics (\|lat\| < 23.5°) | 6.23 | 6.14 |
| 2025, mid latitudes (23.5–45°) | 1.92 | 1.98 |
| 2025, high latitudes (> 45°) | 0.96 | 1.02 |
| 2025, Apr–Jul | worse in all 4 months | |
| 2025, Aug–Mar | better in all 8 months | |
| 2026 Jan–Jul (standard data) | 3.141 | 3.258 |
| 2026 Aug–Oct (NRT data) | 4.696 | 4.869 |

### 8.4 Reliability (LightGBM p50, 2025 / 2026)

| Measure | 2025 | 2026 |
|---|---|---|
| Correlation / R² | 0.909 / 0.825 | 0.895 / 0.800 |
| Active vs inactive (p50 ≥ 0.5): accuracy · precision · recall | 0.845 · 0.818 · 0.753 | 0.843 · 0.823 · 0.746 |
| Error ≤ 3 cell-days | 83.0 % | 82.6 % |
| Active area-months within factor 2 | 45.0 % | 43.9 % |
| Busiest decile: mean truth vs forecast | 127.6 vs 113.6 | 130.9 vs 112.5 |
| 10–90 % range coverage: all · active only (nominal 80 %) | 89.9 % · 77.4 % | 89.4 % · 76.5 % |
| World monthly total, mean abs. error (`clim_mean` / p50 sum) | 10.8 % / 10.2 % | 7.9 % / 10.7 % |
| 10° × 10° region × month totals, median abs. error (`clim_mean` / p50 sum) | 29.7 % / 41.4 % | 31.6 % / 42.1 % |

### 8.5 Acceptance

| Model | Rule | Decision |
|---|---|---|
| LightGBM p50 | MAE and RMSE below both climatology baselines in both test years | **Accepted** (vs best baseline: MAE −0.1 % / −3.6 %, RMSE −0.4 % / −1.5 %) |
| LightGBM Tweedie | RMSE below climatology mean | **Rejected**: higher MAE and RMSE, totals +14–17 % |

`metrics.json` field `model_beats_climatology: false` is the joint rule over both models; it is false because of the rejected Tweedie model.

Feature importance (p50 model, share of gain): `clim_mean` 63.7 %, `clim_active_share` 12.1 %, `last12` 7.2 %, `clim_median` 6.8 %; MODIS features < 1 %.

## 9. 2027 forecast

| ID | Decision | Rationale |
|---|---|---|
| D12 | Per-area value = LightGBM p50; range = p10–p90 | Accepted model (§8.5) |
| D13 | Sums over many areas use `clim_mean`, not the sum of p50 | Medians are not additive: summed p50 is 5–10 % low on test years and 41–42 % off on regional totals, `clim_mean` 30–32 % |

Output `results/forecast_2027_res4.csv` / `.parquet`: 809,064 rows (67,422 areas × 12 months). Columns: `area_id, lat, lon, year, month, pred_p50, pred_p10, pred_p90, clim_mean, clim_median, last_same, pred_mean` (`pred_mean` = rejected model, do not use).

| Result | Value |
|---|---|
| World total 2027 | 6,096,692 active cell-days (2019–2025: mean 6.13 M, range 5.71–6.65 M) |
| Monthly world totals (thousand) | Jan 558, Feb 522, Mar 534, Apr 442, May 364, Jun 417, Jul 582, Aug 718, Sep 628, Oct 483, Nov 400, Dec 449 |
| Areas with ≥ 1 forecast cell-day in 2027 | 37,360 of 67,422 |
| Latitude share | Tropics 82.4 %, 23.5–45° 13.1 %, > 45° 4.6 % |
| Largest per-area p90 | 666 (observed maximum 2018–2026: 968) |

## 10. Verification

| Check | Result |
|---|---|
| Unzipped bytes = zip listings | 53,260,111,134 = 53,260,111,134 |
| Each yearly file holds one calendar year | All 59 files, full scan |
| NRT append: rows added = NRT rows up to 2026-11-13 | MODIS 794,182; VIIRS 7,451,723 |
| Merge: MODIS standard vegetation detections, source CSV vs merged | 32,716,006 = 32,716,006 |
| Merged table: H3 resolution / duplicate cell-days | All res 6 / 0 |
| Label total (res-4 monthly) = VIIRS active cell-days (res-6 daily), to 2026-10 | 52,288,870 = 52,288,870 |
| No look-ahead: Aug-2025 `clim_mean` rebuilt from data ≤ 2024-10 | Max difference 0.0000 over 67,422 areas |
| Test targets = observed label | 809,064 rows, identical |
| Forecast: completeness, uniqueness, NaN, negatives, p10 ≤ p50 ≤ p90, CSV = Parquet | All pass |
| Numbers in `../Prediction.md` = output files | Pass |

## 11. Compute and reproducibility

| Item | Value |
|---|---|
| Hardware | AMD Ryzen 9 5900HS (8 cores / 16 threads), 15 GB RAM, 2 GB swap |
| GPU | NVIDIA RTX 3060 Mobile unusable (no kernel module for kernel 6.8.0-138); CPU only |
| Constraint | systemd-oomd terminates the session at > 50 % memory pressure for 20 s |
| Incident | 12:43: four parallel in-memory awk jobs (~3.3 GB each) triggered OOM; session lost, no data lost |
| Mitigation | All heavy processing in DuckDB with `memory_limit` 5–6 GB and disk spill; one heavy job at a time; Parquet intermediates |
| Software | Python 3.12.3; duckdb 2.0.0 (+ `h3` community extension), h3 4.5.0, pandas 3.1.1, numpy 2.5.4, pyarrow 26.0.1, lightgbm 4.7.0, matplotlib 3.11.2 (`requirements.txt`; in this repository `src/requirements.txt`, which leaves out h3 because no script imports it) |

Reproduce:
```bash
pip install -r requirements.txt
# download the 55 archives listed in data/firms_archive_links.csv, build data/datasets/MODIS-2018-2026.csv and VIIRS-2018-2026.csv (STEPS.md, Step 0)
# In this repository: the links are in scripts/firms_archive_links.csv, the packages in forecast/requirements.txt,
# and STEPS.md (with Step 0) stayed in the separate prediction project.
python forecast/01_build_firms.py && python forecast/02_analysis.py && python forecast/03_preprocess.py && python forecast/04_train.py && python forecast/05_figures.py
```

## 12. Deviations from the team specification (`INFO.md`)

| Team specification | Implementation | Reason |
|---|---|---|
| Reference sensor S-NPP, history from 2012 | NOAA-20, history from 2018-04 | Data selection for this work; S-NPP on disk, not integrated |
| Baseline 2012–2025, ≥ 10 years | 2018-04 → 2026-10 (≤ 8.5 years) | Consequence of the data selection |
| Step 2: hurdle regression (logit + ZTNB) | LightGBM quantile regression | Named alternative in the plan; time budget |
| Classes p75 / p90 / p25 per month | Not produced | Out of scope; derivable from forecast file + history |
| Model on res 4 / res 5 | res 4 only | RAM budget and lower noise (D7) |

## 13. Limitations and known issues

1. History only. No weather, drought or vegetation inputs; anomalous years are not anticipated (worst world monthly error on test: 28 %, spring 2025).
2. Small gain over climatology (≤ 3.6 % MAE); slightly worse than baseline in the tropics.
3. No hyperparameter search; early stopping on a single year (2024).
4. Range not calibrated: 89–90 % coverage overall vs 80 % nominal, 77 % on active area-months.
5. Busiest area-months under-forecast by 11–14 %.
6. Evaluated and forecast only for the 67,422 areas with ≥ 1 qualifying detection (either sensor) 2018-04 → 2026-10; other areas are implicitly 0. Including them would lower every method's MAE equally.
7. 2026-08 → 11 uses provisional NRT data with a static mask instead of `type`.
8. Label depends on NOAA-20 alone; a NOAA-20 outage in 2027 breaks comparability.
9. World and regional totals use `clim_mean` (a baseline), not model output (D13).
10. `FIRMS-2018-2026` row order is not guaranteed (written with `preserve_insertion_order = false`); sort by `date, cell` when order matters.
11. scikit-learn and statsmodels are installed but unused.

## 14. Recommended next work

| Priority | Item | Expected effect |
|---|---|---|
| 1 | Driver features: fire-weather index forecast, soil-moisture and NDVI anomalies (team Step 3) | Only route to skill on the 17 % year-to-year component |
| 2 | Integrate S-NPP 2012–2026, cross-calibrated with NOAA-20 | Longer climatology, ≥ 10-year baseline per team spec |
| 3 | Rolling-origin cross-validation (2021–2024) with hyperparameter search | Robust model selection |
| 4 | Conformal calibration of the 10–90 % range | Nominal coverage |
| 5 | Re-run when FIRMS standard data replaces NRT 2026-08 → 11 | Remove provisional data |
