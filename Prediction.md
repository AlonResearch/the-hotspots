# Prediction: vegetation-fire outlook for 2027

Team "The Hotspots" · NASA Space Apps 2026 · challenge "Harmonization of MODIS and VIIRS Hot Spots"

**Result in one line:** from 8.5 years of satellite hot spots we forecast, for 67,422 areas of the world and every month of 2027, how many *active cell-days* of vegetation fire to expect. Tested on two held-out years, the forecast gets "will it burn here this month?" right **84 %** of the time and world monthly totals within **8 % to 11 %**.

---

## 1. Data and merge

| | MODIS (Terra + Aqua) | VIIRS (NOAA-20) |
|---|---|---|
| Pixel size | 1 km | 375 m |
| Period used | 2018-04-01 to 2026-11-13 | 2018-04-01 to 2026-11-13 |
| Detections | 37.0 M | 173.7 M |

- Kept only **vegetation fires** (`type = 0`) with **nominal or high confidence**. The latest months (near-real-time data, no `type`) use a fixed mask of 23,216 non-vegetation cells instead.
- **Merged on a grid, not row by row:** one row per H3 res-6 cell (~36 km²) × day, with separate MODIS and VIIRS columns, written to `data/datasets/FIRMS-2018-2026.parquet`, 59.7 M rows.
- Why: stacking the rows would count the same fire **2.9×**; dropping MODIS would lose the **12 %** of active cell-days only MODIS saw.

## 2. Data analysis

**What we predict (label):** *active cell-days* = number of (res-6 cell, day) pairs with at least one VIIRS fire detection, per **H3 res-4 area (~1,770 km²) per month**.

*Figure not included: global monthly activity (`results/figures/fig1_global_monthly.png`, written by `forecast/05_figures.py`).*

Fire activity follows the same seasonal cycle every year; yearly totals vary only ±8 %. The stable "place × season" pattern explains **83 %** of all variation; the remaining 17 % is year-to-year change.

*Figure not included: MODIS orbit drift (`results/figures/fig2_modis_drift.png`, written by `forecast/05_figures.py`).*

The MODIS satellites are drifting: Aqua now passes almost 2 hours later than in 2018, and MODIS sees a shrinking share of fires. A label containing MODIS would show a false downward trend. **So the label comes from VIIRS only; MODIS is an input.**

## 3. Preprocessing

| Step | What |
|---|---|
| Aggregate | res-6 cell-days summed to 67,422 res-4 areas × 103 months (2018-04 to 2026-10) = 6.9 M rows; 62 % are zero |
| Repair | 3 months with missing VIIRS days scaled up (2023-07, 2023-09, 2024-02) |
| Exclude | November 2026 (only 13 days of data) |
| Features (21) | Usual value for the same month (mean, median, max, spread, share of active years), latest same month, last 3 and 12 months vs usual, trend, location, MODIS signal, fire intensity |
| No look-ahead | To forecast year Y, features use data only up to **31 October of Y−1**, exactly the situation of the real 2027 forecast (data ends 2026-10-31) |

## 4. Training

| Item | Choice |
|---|---|
| Model | LightGBM (gradient-boosted trees), on CPU, 6.6 minutes |
| Outputs | Median forecast + likely range (10 % and 90 % quantiles) |
| Training rows | 4.05 M (target years 2020 to 2024); number of trees set by early stopping on 2024 |
| Why this size | Only 7 to 8 years of history per area and 83 % seasonal signal: a larger (deep) model would overfit and add nothing |

## 5. Testing

Test years were **never seen in training**: 2025 (forecast made from data to 31 Oct 2024) and 2026 January to October (data to 31 Oct 2025).

*Figure not included: test error by method (`results/figures/fig3_test_mae.png`, written by `forecast/05_figures.py`).*

Our model equals the best simple baseline in 2025 and beats it by 3.6 % in 2026. It beats "same as last year" by 17 % to 29 %. A second model variant (expected value, Tweedie) was worse than the baseline and was **discarded**.

*Figure not included: observed vs forecast on test years (`results/figures/fig4_test_global.png`, written by `forecast/05_figures.py`).*

(World totals use the seasonal mean, because per-area medians do not add up.)

**How confident are we** (held-out years 2025 / 2026):

| Question | 2025 | 2026 |
|---|---|---|
| Will this area burn this month? (yes/no accuracy) | 84.5 % | 84.3 % |
| Correlation of forecast with reality | 0.91 | 0.90 |
| Forecast within ±3 cell-days | 83 % | 83 % |
| Reality inside the forecast range (10 % to 90 %) | 90 % | 89 % |
| World monthly total: average error | 10.8 % | 7.9 % |
| Region (10° × 10°) monthly total: typical error | 30 % | 32 % |
| Active area: amount within a factor of 2 | 45 % | 44 % |

**Confident about *where* and *when*; moderately confident about *how much*.** Both test years give nearly the same numbers, so the result is stable.

## 6. Results for 2027

*Figure not included: 2027 outlook (`results/figures/fig5_outlook_2027.png`, written by `forecast/05_figures.py`).*

| | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| World total (thousand active cell-days) | 558 | 522 | 534 | 442 | 364 | 417 | 582 | **718** | 628 | 483 | 400 | 449 |
| Areas expected to burn (of 67,422) | 19,784 | 20,712 | 23,806 | 25,723 | 25,034 | 21,798 | 21,074 | 22,742 | 23,267 | **26,034** | 24,472 | 20,799 |

- **World total 2027: 6.10 million active cell-days**, an average year (2019 to 2025 mean: 6.13 million; range 5.71 to 6.65).
- **Peak: August** (718 thousand). **Minimum: May** (364 thousand).
- **37,360 of 67,422 areas** are expected to burn at least once in 2027.
- **82 %** of the activity is in the tropics, 13 % in mid latitudes, 5 % above 45°.
- **Largest hot region:** central and southern Africa (10°N to 20°S, 10°E to 40°E) with about 2.0 million cell-days, one third of the world total.

*Figure not included: map of the 2027 forecast (`results/figures/fig6_map_2027.png`, written by `forecast/05_figures.py`).*

**Example, the team's demo place, Piedmont (box 44.0 to 46.5°N, 6.6 to 9.2°E, 33 areas):** busiest in August (typical 53, expected 87 active cell-days) and March to April (about 40 typical, 66 expected); quiet from November to January (under 15).

**Forecast file:** `results/forecast_2027_res4.csv` (809,064 rows = 67,422 areas × 12 months)

| Column | Meaning |
|---|---|
| `area_id`, `lat`, `lon`, `month` | H3 res-4 area, its centre, month of 2027 |
| `pred_p50` | Forecast (median active cell-days) |
| `pred_p10`, `pred_p90` | Likely range |
| `clim_mean`, `clim_median` | Seasonal baseline (use `clim_mean` when summing many areas) |

## 7. Limits

- This is an **empirical outlook from history, not a weather forecast**. It cannot foresee an unusually dry or wet 2027; in the quiet spring of 2025 the world total was off by up to 28 %.
- Exact amounts for a single active area are uncertain (within a factor of 2 only 45 % of the time); very busy months are under-forecast by 11 % to 14 %.
- Almost all skill is the seasonal pattern; the model adds 0 % to 3.6 % over it. More skill needs new inputs (weather, drought, vegetation), not a bigger model.
- Active cell-days measure how widespread and persistent burning is. They are **not burned area**.
- August to October 2026 are near-real-time data (provisional); areas that never burned in 2018 to 2026 are forecast as 0.

Reproduce, in this order: `forecast/01_build_firms.py`, `02_analysis.py`, `03_preprocess.py`, `04_train.py`, `05_figures.py` (about 10 minutes in total on a laptop). Packages: `forecast/requirements.txt`. The scripts read `data/datasets/MODIS-2018-2026.csv` and `data/datasets/VIIRS-2018-2026.csv`, which were built from the FIRMS archive downloads (`scripts/firms_archive_links.csv`) in the separate prediction project. That step is not in this repository, and neither is that project's full log (`STEPS.md`); the numbers are in [Vision Docs/PredictionEngineeringReport.md](Vision%20Docs/PredictionEngineeringReport.md). The figures and the forecast files are written to `results/`, which is git-ignored, so the six figures named above are not in the repository; run `forecast/05_figures.py` to make them.

AI-use disclosure: data processing, model code and this document were produced with an AI coding assistant (Claude Code) following the team's plan and decisions.
