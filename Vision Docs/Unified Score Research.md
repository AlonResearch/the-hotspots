# Unified Score Research (Brief D)

> **Status**: first report, 2026-11-15, written for Brief D in `Thread Briefs.md`. Research only. It gives options with evidence and does not choose a method: under the NASA AI policy the team decides. Nothing here is in GroundTruth.md.
>
> **AI disclosure**: an AI assistant (Claude) searched, read and summarised the sources and drafted this text. The team defined the question, the two UI modes and the personas.

> **Note (2026-11-15)**: mentions of `Solution.md`, `ImplementationPlan.md`, `Map Grid Plan.md` and `Thread Briefs.md` refer to early hackathon plans that were removed from the repository; they are in the git history.

**Scope**: Brief B covers how MODIS and VIIRS detections differ. This document covers how long multi-sensor fire records are merged into one indicator, how that indicator's uncertainty is carried, and how it is shown in the default mode and the scientific mode.

**Evidence tags**

| Tag | Meaning |
|---|---|
| **[R]** | Read in the full text (paper body or documentation page) |
| **[P]** | Read in part (abstract, landing page, or some sections only). The note says which part |
| **[S]** | Seen only in a search-result snippet. **Unverified** |
| **[M]** | From model memory. **Unverified** |
| **[I]** | Our inference or arithmetic, not a claim from a source |

---

## 1. Short answer

1. **No product we found merges MODIS and VIIRS active-fire counts into one long index the way we want to.** The nearest examples merge burned area or emissions (GFED5NRT, VNP64A1 with MCD64A1, MRBA60) or FRP (CAMS GFAS, Zheng et al. 2026). The operational hotspot services (INPE, and probably EFFIS and GWIS) avoid the problem: they keep one reference satellite, or they compare with a baseline taken from a single sensor era. [R, plus S for EFFIS and GWIS]
2. **Every merging method we read calibrates on the overlap years against one chosen reference.** GFED5NRT uses a ratio per region and land-cover type (VIIRS counts to GFED5 burned area, 2012-2022). MRBA60 uses random forests per biome and month plus quantile mapping (2019-2024). VNP64A1 reuses the MODIS algorithm and checks agreement with orthogonal regression. [R]
3. **For the number shown to users, operational services use relative scores, not absolute ones**: the percent difference against the mean of past years (INPE), percentile rankings and standard-deviation anomalies against a ~40 year history put into 6 classes (EFFIS fire danger), percentile categories (US Drought Monitor), and terciles against 1991-2020 (NOAA CPC). GFED5NRT shows its own new record as a Z-score against the climatology of the older product. [R]
4. **Uncertainty is carried very differently.** C3S and MRBA60 ship a per-cell uncertainty layer (standard error, or an RMSE model). GFED5NRT gives no numeric range and says so. GFAS publishes a known-issues table and recomputed values when a satellite failed. INPE gives plain caveats ("partial month", "do not compare daily values"). [R]
5. **Three candidate single scores fit the deadline** (section 5): (A) harmonized active cell-days at a VIIRS-equivalent level with a calibration band; (B) the rank of the month against the cell's own same-month history, shown as a class; (C) a standardized anomaly against a reference-era climatology. They can be stacked (B or C is computed from A), so choosing is about which one the user sees first.

---

## 2. Sources read

| # | Source | Link | What was read | What it shows for us |
|---|---|---|---|---|
| 1 | Chen et al. 2026, GFED5NRT, ESSD 18, 7535 | https://essd.copernicus.org/articles/18/7535/2026/ | [P] HTML from the abstract to Sect. 6 (the tail and references only summarised); Table 1 values not read (image) | VIIRS counts calibrated to GFED5 by an effective fire area ratio per region and land-cover type over 2012-2022; SNPP and NOAA-20 averaged; NOAA-21 not used yet; no numeric uncertainty |
| 2 | GFED5NRT author-revised manuscript (ATC1) | https://essd.copernicus.org/preprints/essd-2026-158/essd-2026-158-ATC1.pdf | [P] Figure captions and Sect. 3.4 text extracted locally. This is the authors' tracked-changes manuscript, **not** the reviewer report. Reviewer comments were **not** read | Z-score defined against the GFED5 2012-2022 climatology; daily chart with historical mean and ±1 SD band |
| 3 | Chen et al. 2023, GFED5, ESSD 15, 5227 | https://essd.copernicus.org/articles/15/5227/2023/ | [P] Abstract, Sect. 1, 2.1-2.5 verbatim; later sections only summarised | Correction factors for MODIS omission from higher-resolution data; pre-MODIS sensors joined by regression through zero per region, vegetation class and season, blended with a MODIS-era climatology |
| 4 | Giglio et al. 2025, VNP64A1 validation and intercomparison with MCD64A1, RSE 331, 115006 | https://geog.umd.edu/sites/geog.umd.edu/files/pubs/1-s2.0-S0034425725004109-main.pdf | [R] Full text extracted locally | Same algorithm adapted; global r = 0.991 at 0.25°; VNP64A1 maps 2.1-6.3 % more burned area per year; "simple concatenation ... at local scales is not advisable for long-term trend analyses" |
| 5 | Torres-Vázquez et al. 2026, MRBA60, Scientific Data (article in press) | https://doi.org/10.1038/s41597-026-07959-w (copy read: https://ueaeprints.uea.ac.uk/104113/1/s41597-026-07959-w_reference.pdf) | [R] Abstract, methods, uncertainty section | Overlap 2019-2024; biome and season random forests; quantile mapping; leave-one-year-out; per-cell uncertainty from an RMSE model |
| 6 | C3S burned area dataset page | https://cds.climate.copernicus.eu/datasets/satellite-fire-burned-area | [R] Landing page | MODIS 2001-2019 and OLCI 2017-present from "the same processing chain"; per-cell "Standard error" and per-pixel "Confidence level" layers |
| 7 | CAMS, "Drifting away from MODIS" (25 Feb 2026) | https://atmosphere.copernicus.eu/drifting-away-modis-cams-global-fire-assimilation-system | [R] | VIIRS added to GFAS on 4 Dec 2025; Terra data collection to end Jan 2027, Aqua around Sep 2027 |
| 8 | ECMWF GFAS v1.4.2 and v1.2 documentation | https://confluence.ecmwf.int/spaces/CKB/pages/601301528 and https://confluence.ecmwf.int/spaces/CKB/pages/88247734 | [R] | Kalman filter fills gaps; v1.2 used a regression to keep single-satellite output consistent with two-satellite output; Terra 2016 failure: values recalculated from Aqua only |
| 9 | Zheng et al. 2026, FRP correction and fusion of MYD14 and VNP14IMG, Remote Sens. 18, 1650 | https://www.mdpi.com/2072-4292/18/10/1650 | [P] Highlights and abstract (PDF extracted locally) | VIIRS as reference for a viewing-angle correction of MODIS FRP, then fusion; covers the overlap 2012-2024 only, no backcast |
| 10 | INPE INFOQUEIMA bulletin, Sept 2025 | https://dataserver-coids.inpe.br/queimadas/queimadas/Infoqueima/2025/2025_09_infoqueima.pdf | [P] Section 1 (fire foci) | 11 satellites received, "apenas o satélite de referência" used for comparisons; anomaly map against 2003-2023; state table with % change against last year |
| 11 | INPE TerraBrasilis change history | https://www.terrabrasilis.dpi.inpe.br/app/dashboard/fires/biomes/aggregated/data/historico-de-alteracoes.pdf | [R] | Reference satellite named as "AQUA/MODIS passagem da tarde"; the series was reprocessed in full when inputs changed |
| 12 | INPE situation and statistics pages | https://data.inpe.br/queimadas/situacao_atual/ | [R] | "Dif. M." = % difference from the mean of previous years; current year excluded from the mean; min, mean and max; "not recommended to compare daily values, only monthly totals" |
| 13 | Revista Pesquisa FAPESP, "Como monitorar o fogo" (2019) | https://revistapesquisa.fapesp.br/en/2020/02/04/how-to-monitor-forest-fires/ | [R] | INPE series uses one afternoon Aqua pass; counts are indicators, "not an absolute measure of fire" |
| 14 | EFFIS fire danger forecast, technical background | https://forest-fire.emergency.copernicus.eu/about-effis/technical-background/fire-danger-forecast | [R] | 6 classes; FWI "ranking" (percentiles) and "anomaly" (standard deviations) against ~40 years, with class thresholds |
| 15 | NDMC, US Drought Monitor tutorial, section 5 | https://drought.unl.edu/Education/Tutorials/Usdm/section-five.aspx | [R] | D0-D4 from percentile rank bands; white for no designation; D4 needs consensus across indicator types |
| 16 | NIDIS/drought.gov, "Emerging climate trends make monitoring drought more complex" (2024) | https://www.drought.gov/news/emerging-climate-trends-make-monitoring-drought-more-complex-2024-05-28 | [R] | Percentile categories drift: D4 occurred up to 18 % of 2000-2022 in parts of the West against an expected 2 % |
| 17 | NOAA CPC long-lead tools page | https://www.cpc.ncep.noaa.gov/products/predictions/long_range/tools.html | [R] | Three classes split at the terciles of 1991-2020; probabilities shown as shifts from 33.3 % |
| 18 | Sofiev and Kouznetsov 2026, GMD 19, 10123 | https://gmd.copernicus.org/articles/19/10123/2026/ | [S] Abstract snippets only | Detection-probability maps from overpasses and weather; global probability of detecting powerful fires 78 % MODIS, 88 % VIIRS (preprint values) |
| 19 | EFFIS and GWIS statistics portals, seasonal trend reports | https://forest-fire.emergency.copernicus.eu/apps/effis.statistics/estimates , https://gwis.jrc.ec.europa.eu/apps/country.profile/ | Not readable (JavaScript-only pages; report PDFs returned HTML) | [S] only: EFFIS weekly charts with min-max and average, 2006-2025 for burnt area and 2012-2025 for MODIS and VIIRS thermal anomalies; GWIS clusters MODIS and VIIRS anomalies into fire perimeters |
| 20 | Global Forest Watch / WRI blog posts | https://www.wri.org/insights/5-graphs-show-just-how-unusual-years-wildfires-are | [S] only | Plain comparisons: "more fires than any other year since at least 2012", "more than double the annual average for this time of year" |
| 21 | Homogeneity tests on merged satellite records (CM SAF, ESA CCI soil moisture and SST) | https://www2.mdpi.com/2072-4292/6/1/352 | [S] only | Change-point tests (Pettitt, SNHT, penalized maximal t and F) at sensor transitions |
| 22 | Boschetti et al., NASA MODIS science team slides 2022 and 2023 | https://modis.gsfc.nasa.gov/sci_team/meetings/202305/presentations/boschetti.pdf | Not readable (HTTP 403) | [S] only: a planned 0.25° calibrated MODIS/VIIRS burned-area series using Landsat and Sentinel-2 as reference, "paper in preparation" |

Not found or not read: a global VIIRS-based Global Fire Atlas (search found only the MODIS C6.1 update and talks [S]); the IPCC uncertainty guidance note (HTTP 403); the WMO SPI user guide (empty page); the Canadian fire danger class page (JavaScript-only); the GFED5NRT reviewer reports.

---

## 3. How the products merge sensors

### 3.1 Notes per source

**GFED5NRT** [P, source 1 and 2]
- *What is merged*: VIIRS 375 m active-fire counts, scaled to burned area and emissions. It does **not** fuse MODIS and VIIRS: the authors call it "a first step toward developing global fire records that merge VIIRS and MODIS observations".
- *Bias correction*: an **effective fire area** (EFA), the mean burned area per VIIRS detection, taken from GFED5 over the overlap 2012-2022, for each of 14 GFED regions × 16 land-cover or burning types ("up to 224 EFA scalars"). It is a ratio, not a regression. No seasonal stratification found. A scan-angle weighting table (SNPP 2019-2021, by cross-track sample, day or night, month and land cover) and a static hotspot mask come first.
- *Number of satellites*: per grid cell, "the arithmetic mean of the SNPP- and NOAA-20-based estimates when both instruments are operating nominally"; the other satellite alone when one is missing. NOAA-21 is held back "pending systematic evaluations of data quality and consistency". So the merge **averages** satellites rather than summing them.
- *Seam test*: overlap metrics (Spearman maps, slope, nRMSE, Taylor skill score, global temporal TSS 0.88 for burned area) and a Z-score Hovmöller plot with the seam marked, described as a "smooth transition". No change-point or leave-out test found. The metrics are computed on the same years used to fit the EFA, so they are in-sample [I].
- *Uncertainty*: none numeric. The paper says the metrics "quantify inter-product consistency and transfer errors rather than formal parametric confidence bounds", and fine-scale results "carry substantially higher uncertainty".
- *Drift*: GFED5 ends in 2022 "when orbital drift-induced changes surpassed the thresholds defined for high-quality science products".

**GFED5** [P, source 3]
- Pre-MODIS sensors (VIRS, ATSR) are joined by a regression forced through zero per region, vegetation class and season, blended with a MODIS-era climatology weighted by r². The authors warn that the early years are "not on par" with the MODIS era. This is the same shape as our MODIS-to-VIIRS backcast, with the older sensor as the predictor.

**VNP64A1 against MCD64A1** [R, source 4]
- *Approach*: the MODIS algorithm adapted to VIIRS, same grid and 500 m reporting resolution. No numerical calibration step.
- *Consistency checks*: compared at 0.25° and by calendar month, with Pearson r and the **orthogonal least-squares slope** (errors allowed in both products), per year and per GFED region. Global spatial r = 0.991 for 2013-2023; VIIRS maps more burned area every year (2.1 % in 2017 to 6.3 % in 2013); median absolute relative difference across regions 6.7 %, highest in Southeast Asia (33.1 %).
- *Warnings that apply to us*: high agreement at coarse cells can hide compensating errors ("burned area omission and commission errors may compensate each other with progressively coarser grid cells"). The two largest monthly discrepancies match sensor outages (Aqua, 15 days in August 2020; S-NPP, 16 days in July-August 2022). "Simple concatenation ... at local scales is not advisable for long-term trend analyses but may be acceptable at the broad scales of some GFED regions (e.g., EURO, NHSA)". A single harmonized record "could be successfully generated at local scales through their statistical inter-calibration".
- *Number of satellites*: Collection 2 uses S-NPP only. Using S-NPP with NOAA-20 improved the composites but is deferred to Collection 3. An Aqua-only MODIS product "is not viable" because a single MODIS loses too much input.
- *Validation*: against 561 Landsat image pairs, VNP64A1 36.7 % commission and 72.4 % omission, MCD64A1 34.2 % and 71.5 %. The relative bias is negative in every biome, down to -85.5 % in the Mediterranean.

**MRBA60** [R, source 5]
- *What is merged*: monthly burned area at 0.25°, FireCCI51 (MODIS) for 2003-2018 adjusted to look like FireCCIS311 (Sentinel-3 SYN with VIIRS active fires), and FireCCIS311 itself from 2019.
- *Bias correction*: random forests per region (modified continental biome) and month, trained on the overlap 2019-2024, with predictors such as FireCCI51 burned area, active fires, FRP, climate and NDVI; predictors chosen by recursive elimination with **leave-one-year-out** validation. Then **empirical quantile mapping** per region-month (3-month window, quantile step 0.01) to undo the forest's pull toward the mean. Region-months with fewer than 30 burned cells in at least two years keep the raw MODIS-era value. 2001-2002 are dropped as less reliable.
- *Uncertainty*: an empirical model of RMSE as a linear function of the predicted value, fitted per biome over 2019-2024 in 10 quantile bins, then mapped for every cell and month. From 2019 the reference product's own standard error layer is used. The authors call it "an empirical, first-order approximation".
- *Result*: global burned area up by about 1.1 Mkm² per year over FireCCI51, "while preserving the reported decline in BA over the past two decades".

**C3S burned area** [R, source 6]
- MODIS-based 2001-2019 and OLCI-based 2017-present, built with "the same processing chain". The page lists no cross-sensor bias adjustment. Each grid cell carries a "Standard error" (m²) and each pixel a "Confidence level" (%). The QA table appears to list "Consistency" as not passed (the table layout was flattened, so this reading is uncertain).

**CAMS GFAS** [R, source 7 and 8]
- *What is merged*: FRP from Terra and Aqua MODIS and S-NPP VIIRS (NOAA-20 and NOAA-21 not listed), assimilated with a **Kalman filter** that fills gaps such as cloud and carries the previous analysis forward. Output on a 0.1° grid, hourly and 24 hour.
- *Number of satellites*: v1.2 documented a "statistical regression of the output when assimilating only Aqua or Terra observations so as to preserve consistency with data obtained assimilating Aqua and Terra observations". The v1.4.2 pages do not say whether adding VIIRS changed the totals.
- *Sensor failures*: when Terra degraded (24 February to 4 March 2016), values "have been recalculated using Aqua MODIS data only and have replaced the anomalous values". A missing Aqua day (8-9 August 2016) is recorded as "leading to reduced GFAS emissions". These are kept in a public known-issues list.
- *Drift and end dates*: Terra and Aqua "running low on fuel and experiencing orbital drift"; Terra data collection to end January 2027, Aqua around September 2027. (The VNP64A1 paper, written in 2025, says "scheduled to be decommissioned in 2026". The CAMS article is newer.)

**Zheng et al. 2026** [P, source 9]
- Pixel-level fusion of Aqua MODIS and S-NPP VIIRS FRP for 2012-2024: VIIRS as reference for a viewing-angle correction of MODIS FRP, then "quality-prioritized fusion"; 3.82 times more fire pixels than MODIS alone. It improves the overlap years, and does not extend VIIRS-like values back before 2012.

**INPE Queimadas** [R, sources 10 to 13]
- One **reference satellite**: Aqua MODIS, afternoon pass. 11 satellites are received but "Para análises temporais e espaciais comparativas, apenas o satélite de referência é empregado". No calibration at all: the record stays consistent because the sensor never changes. When inputs changed (October 2024), the dashboard series was reprocessed from August 2018 and the change was logged.
- We did not find what INPE plans after Aqua ends (not in the pages read).

**EFFIS and GWIS** [S]
- Snippets say the EFFIS weekly charts compare the current year with a min-max band and average, with 2006-2025 for burnt area and **2012-2025 for MODIS and VIIRS thermal anomalies**, and that GWIS clusters MODIS and VIIRS anomalies into fire perimeters. If true, both avoid a cross-sensor baseline by starting the baseline when VIIRS starts. Not verified: the pages are JavaScript-only. GWIS country profiles ending in 2019 is recorded as [D] in `CurrentSolutionLandscape.md`.

**Change-point and homogeneity testing** [S]
- Merged climate data records (CM SAF irradiance, ESA CCI soil moisture and sea surface temperature) are tested for breaks at sensor transitions with Pettitt, SNHT and penalized maximal t or F tests, often on the difference between the record and an independent reference. Not read in full.

### 3.2 Comparison table

| Product | Merged quantity | Unit of the final index | Cross-sensor correction | Satellites in orbit | Seam or consistency test | Uncertainty shown | Usable on our data in a few hours? |
|---|---|---|---|---|---|---|---|
| INPE Queimadas | Active-fire counts | Fire foci per area and month, % vs mean of previous years | None: one reference satellite (Aqua afternoon pass) | Fixed at one pass of one satellite | Not needed while the sensor is unchanged; changes logged and series reprocessed | Plain caveats only | **Yes**. Trivial. But it ends with Aqua in 2027, and ignores VIIRS sensitivity |
| GFED5NRT | VIIRS counts → burned area, emissions | km², Tg C, on 0.25° | Ratio (effective fire area) per region × land-cover type, fitted on 2012-2022 overlap | SNPP and NOAA-20 **averaged**; NOAA-21 held back | Overlap metrics, Z-score plot across the seam (in-sample) | None numeric, stated as a limit | **Yes, in form**: a ratio per region and type is the Solution.md 6.2 recipe. Their target is burned area, ours would be VIIRS cell-days |
| GFED5 (pre-MODIS join) | Burned area | km² | Regression through zero per region, vegetation, season; r²-weighted blend with climatology | n/a | Quality warning for early years | ± values in abstract, definition not read | Yes, as a variant of the ratio |
| VNP64A1 vs MCD64A1 | Burned area | km², 500 m | Same algorithm, no calibration; agreement measured | S-NPP only (C2) | Orthogonal regression slope and r per year and region; outage months explained | Validation errors per biome with standard errors | **Checks yes** (orthogonal slope, per-year r). The algorithm route is not ours |
| MRBA60 | Burned area | km², 0.25° monthly | Random forest per biome and month + quantile mapping, trained 2019-2024 | n/a | Leave-one-year-out in feature selection; external validation | Per-cell RMSE model; reference SE after 2019 | Quantile mapping alone: **yes** (a few hours). Random forest with drivers: **no** |
| C3S burned area | Burned area | km², 0.25° | Same processing chain on both sensors | n/a | Not described on the page | Standard error per cell, confidence per pixel | Not a method we can copy |
| CAMS GFAS | FRP | W m⁻², 0.1° | Kalman filter; v1.2 regression to keep single-satellite days consistent | Explicit consistency regression (v1.2) | Known-issues list; failed periods recomputed | None numeric found | Kalman: **no**. Known-issues list: **yes** |
| Zheng et al. 2026 | FRP per pixel | MW | View-angle correction of MODIS to VIIRS, then fusion | Aqua and S-NPP only | Landsat check | Not read | **No** (pixel matching; Aqua now passes hours after VIIRS) |
| EFFIS and GWIS [S] | Burnt area, thermal anomalies | ha, counts | Baseline starts in 2012 for thermal anomalies [S] | Not known | Not known | min-max band [S] | Display pattern only |

---

## 4. Points that matter for our record

These follow from the sources above combined with our data facts. They are inferences [I] unless tagged.

1. **The reference is a choice every product makes explicitly.** GFED5NRT calibrates VIIRS to the older MODIS-based product; MRBA60 calibrates the older MODIS product to the newer Sentinel-3 one; INPE keeps one satellite. Challenge discussion #1879 allows MODIS-equivalent or VIIRS-equivalent (volunteer answers in the challenge Discussions, summarised in GroundTruth.md section 3b). VIIRS-equivalent matches MRBA60's direction and survives the MODIS end in 2027 [R, source 7].
2. **Satellites must be averaged or fixed, not stacked.** GFED5NRT averages SNPP and NOAA-20; GFAS v1.2 regressed single-satellite days onto two-satellite days; VNP64A1 uses S-NPP alone. Active cell-days count "at least one detection per day", so every extra overpass raises the chance of a detection on a burning day. Adding NOAA-20 (2018) and NOAA-21 (2023) to S-NPP would raise cell-days even with no change in fire. Options seen in the sources: one satellite per period (VNP64A1, INPE), or compute the index per satellite and average (GFED5NRT).
3. **Calibrate and test at the cell size where the number is shown.** VNP64A1 shows that agreement at 0.25° can hide errors, and that local concatenation is not advisable for trends. Our calibration should be reported at the cell size the user sees, not only on the regional sums where it is fitted. The map and grid proposal (2026-11-15) fixes one base cell size (H3 res 6, about 36 km²) and makes every coarser cell and every area a sum of base cells, so the leave-one-year-out error should be reported at res 6. A search snippet says MODIS grid FRP underestimation against VIIRS "varies largely with grid size and satellite view angle" (Li, Zhang and Kondragunta, Africa, adjustment models at 0.05° to 0.5°) [S, paper not read]. If that holds for counts too, a ratio fitted at one cell size does not transfer to another, which supports fitting at one fixed base size.
4. **Overlap metrics computed on the fitting years are optimistic.** GFED5NRT's are in-sample; MRBA60 uses leave-one-year-out. Solution.md 6.2 step 6 already plans leave-one-year-out.
5. **Sensor outages show up as seams.** VNP64A1 traced its two largest discrepancies to the Aqua gap (August 2020) and the S-NPP gap (July-August 2022). GFED5 lists the Terra gap 15 June to 3 July 2001 and the Aqua gap 16 August to 2 September 2020 [P]. These months should carry a flag in our series.
6. **Drift breaks a fixed ratio.** GFED5 stops in 2022 because of drift [P]. A ratio fitted on 2012-2019 may not hold after 2020; Solution.md 6.2 already proposes fitting both periods and comparing.
7. **A climatology needs enough years.** With harmonized months from 2001 to 2025 there are at most 25 values per calendar month per cell; VIIRS alone gives 14 (2012-2025). The smallest rank-based exceedance that 25 years can resolve is about 1 in 26, about 4 % [I]. EFFIS uses ~40 years and USDM's categories assume a 100-year rank list [R]. Classes finer than about "top 10 %" would rest on very few years.
8. **Zeros dominate.** Most cell-months in most places have no fire [I, to check in Brief A]. Percentiles tie at zero and a standard deviation is unstable when a cell has a handful of active months. EFFIS and CPC work on continuous weather variables; fire counts are not continuous.

---

## 5. Candidate single scores

Each is a definition the team can adopt, combine or drop. All three can come from the same build (Solution.md steps 3 to 5).

### A. Harmonized active cell-days (level)

**Definition**: for a base cell and a month, the number of days with at least one qualifying detection, expressed as a VIIRS-equivalent value. Coarser cells and areas of interest are sums of base cells (map and grid proposal, res 6 base cell proposed). MODIS-only months are converted with the overlap ratio (per region and season) and carry a band from a bootstrap over overlap years. (This is Solution.md 6.1 and 6.2.)

**Evidence for**
- Calibrating a count to a reference with a ratio per region and land-cover type over the overlap is what GFED5NRT does in production [P]. GFED5 joined older sensors with a regression through zero per region, vegetation and season [P].
- INPE publishes raw foci counts from a reference satellite as its headline number [R], so a count-type index is accepted operationally.
- Quantile mapping per region-month (MRBA60 [R]) is a ready alternative to a single ratio when the relation is not proportional.

**Limits**
- On its own, the total for a large area of interest hides where the activity is. The team's design (section 5.1) answers this: the total is the summary, and the per-cell values show which cells drive each peak.
- Depends on the base cell size and the satellite set (section 4, points 2 and 3). A fixed base size makes values comparable across zoom levels; the satellite rule is still open.
- VIIRS-equivalent values before 2012 are estimates by construction.

**Uncertainty carried by**: bootstrap band over overlap years (Solution.md); or a per-value error model like MRBA60's RMSE-by-magnitude fit [R].

### B. Rank of the month in the cell's own history, shown as a class

**Definition**: for a cell and calendar month, the percentile rank of this month's value (A) among the same month in all baseline years, then put into a few classes (for example below normal, normal, above normal, well above normal). Solution.md 6.3 adds a rule: "unusual" only when outside the spread **and** outside the harmonization band.

**Evidence for**
- EFFIS publishes an FWI **ranking**: "percentiles of occurrence" against ~40 years, with classes at the 80th, 90th, 95th, 98th and 99th percentile [R].
- The US Drought Monitor assigns D0 to D4 from rank bands (D0 = positions 21-30 of 100, D4 = the lowest 2), with white for no designation [R].
- NOAA CPC uses three classes split at the terciles of 1991-2020 [R].
- INPE's anomaly map is "acima da média" and "abaixo da média" against 2003-2023 [R].
- **Variant B2, rank within each sensor era**: ranking each month against the same sensor's own history does not need a level calibration. It is close to what quantile mapping does (MRBA60 maps quantiles of one product onto the other [R]) and to INPE's single-sensor comparison. We did not find a fire product that publishes B2 itself, so it is a constructed option [I]. Its weak point: a MODIS-era rank and a VIIRS-era rank rest on different years and different numbers of years.

**Limits**
- Few years (section 4, point 7): classes beyond about the top 10 % are not supported by 25 years, still less by 14.
- Zero-heavy cells: most months tie at rank zero; the class has to say "no activity, as usual" rather than "normal" [I].
- Percentile categories drift when the climate shifts: drought.gov reports D4 "occurring far more often than 2% of the time", up to 18 % in parts of the West over 2000-2022 [R]. A fixed baseline period should be named.
- Relative only: a "normal" month in a high-fire cell can still be dangerous. It must sit next to the level (A).

**Uncertainty carried by**: the harmonization band of A propagated into the rank (a month counts as "above normal" only if it stays above with the band's low end); the number of years shown next to the class.

### C. Standardized anomaly against a reference-era climatology

**Definition**: Z = (value − climatological mean of that month) / interannual standard deviation, with the mean and SD taken from a fixed reference period, optionally put into classes.

**Evidence for**
- GFED5NRT defines exactly this: "Z = (v-m)/std, where v is the monthly burned area, m is the climatological monthly mean, and std is the standard deviation of interannual variability", using the GFED5 2012-2022 climatology for all series, including the new VIIRS one [P, source 2]. It also identifies extreme events with Z-score thresholds.
- EFFIS publishes an FWI anomaly "computed as a standard deviation from the 40-year historical mean values", in classes at 0, 0.5, 1.0, 1.5 and 2.5 SD [R].
- INPE's anomaly map is a difference from the 2003-2023 mean [R].

**Limits**
- Count data with many zeros and skewed peaks: one large fire year inflates the SD and hides later anomalies; cells with one or two active months give extreme Z-scores (GFED5NRT reports events "5 to 68 standard deviations above" their means [P]) [I].
- "Standard deviations" is jargon for the default mode; it needs classes or words on top.
- Using one era's climatology for another era's values (as GFED5NRT does) assumes the calibration is right. Any residual bias appears as a false anomaly.

**Uncertainty carried by**: as for B; plus the SD itself, which is uncertain with few years.

### Also considered

- **Probability of activity** (share of past years with at least one active day in that month; Solution.md 6.4). This is the outlook, not the history score. The event "at least one detection" is the one most sensitive to sensor sensitivity: VIIRS sees smaller fires [S, Sofiev and Kouznetsov 2026: 78 % vs 88 % detection of powerful fires], so a MODIS-era probability is lower for the same fire regime [I]. It needs the harmonized A underneath, or a VIIRS-only base period.
- **Burned area or emissions as the score** (GFED, FireCCI, VNP64A1). Well documented but a different quantity, not hotspots, and not what the challenge asks for.
- **FRP-based score** (GFAS, Zheng). Solution.md 5.1 already rules out adding MODIS and VIIRS FRP; GFAS needs a Kalman system.

### Summary table

| | A. Harmonized cell-days | B. Rank class | C. Standardized anomaly |
|---|---|---|---|
| Answers | How much burning activity? | Is this month unusual here? | How far from normal here? |
| Used operationally by | INPE (counts, single satellite) | EFFIS FWI ranking, USDM, CPC | EFFIS FWI anomaly, GFED5NRT, INPE anomaly map |
| Needs a level calibration | Yes | Yes (B), No (B2) | Yes |
| Behaves with zeros and few years | Fine | Ties at zero; coarse classes only | Unstable SD |
| Default-mode reading | Needs context | Direct (a word and a colour) | Needs classes |
| Built before 16:00? | Yes (Solution.md plan) | Yes, once A exists | Yes, once A exists |
| Splits into per-cell contributions (5.1) | Yes, exactly (it adds up) | No | No |

### 5.1 Areas larger than one cell: one summary, per-cell contributions

**Team design (agreed, 2026-11-15)**: when the area of interest covers more than one cell, the user sees one short summary score and one graph over time. When they look at a peak or a place, the app shows which cells inside the area contribute to that peak and how much. Different cells can peak for different reasons (vegetation, distance to a river, land use), so the per-cell view is part of the answer, not an extra. The spatial unit (the smallest resolution, or a mix of resolutions) is still open.

What this means for the score options. These points are inferences [I] unless tagged:

1. **Only an additive measure splits exactly into contributions.** Active cell-days (A) add up: the area total is the sum over cells, so each cell's share of a peak is its value divided by the total. A rank (B) or a Z-score (C) does not add up. The rank of the area total is not the mean of the cell ranks, and cell anomalies can cancel. So even if the headline is B or C, the contributions would be shown in the units of A, and each cell could carry its own class as a label.
2. **The area summary needs its own baseline.** If the headline is B or C, compute it on the area's summed series against the area's own history, not by averaging the cells' classes. The area can be "normal" while one cell is far above its own normal. The per-cell view is where that shows.
3. **Totals grow with the area.** A sum of cell-days over 40 cells is not comparable with one over 4 cells. For the summary, options are a relative score (B or C on the area series), the share of cells active, or cell-days per cell. For contributions, a share of the peak (%) reads the same at any area size.
4. **Cells cut by the area boundary.** Weighting a cell by the fraction inside the area assumes detections are spread evenly in the cell. The alternatives are to count whole cells only, or to use finer cells along the edge. Each choice should be stated in the scientific mode.
5. **Fine cells are noisier and less calibrated.** The harmonization ratio is fitted on a coarse parent (Solution.md 6.2), so finer cells inherit it. VNP64A1 warns that agreement at coarse cells can hide errors that appear at finer ones [R]. GFED5NRT says fine-scale results "carry substantially higher uncertainty" [P]. So per-cell contributions, especially at the base cell size and before 2012, carry the "estimated" marker more often than the area summary does. This bears on the open choice of spatial unit: the smallest cells give the most detail for contributions, but have the fewest detections per cell and the weakest support for the calibration. At res 6 (about 36 km²) the two sensors will more often mark different cells for the same burning than on large cells, so the VIIRS to MODIS ratio is expected to be larger and noisier there [I, to measure].
7. **Sums stay harmonized only under a plain ratio.** If every base cell in a region gets the same multiplier, the sum of harmonized cells equals the harmonized sum. Quantile mapping (MRBA60) is non-linear, so harmonizing cells and then summing gives a different total from harmonizing the sum. If the team picks quantile mapping, it must say at which level it is applied.
8. **Measures that do not add up stay raw.** "Days with fire anywhere in the area" (a union of days across cells) cannot be corrected with a per-cell ratio. If shown, label it raw.
9. **"Usual" is often zero.** With small cells and small areas the median for a month is often zero, so wording such as "twice the usual" is undefined. The default mode needs a phrase for that case (for example "Usually no fire activity in August; this year 3 active cell-days").
6. **Precedents for "who contributes" in the sources.** INPE's bulletin lists the 10 municipalities with the most fire foci under the national total, and gives each biome's share (Cerrado ~52 %, Amazônia ~26 %) [R]. GFED5NRT outlines its extreme-event regions as polygons on the anomaly map [P]. Neither ties contributions to a selected peak in time. We did not find a fire service that does, so that link is our design and not something borrowed [I].

---

## 6. Presentation patterns

### 6.1 Default mode (responders, firefighters, land managers, landowners)

Patterns seen in operational services, with their status:

| Pattern | Seen in | Status | Fit with Insight Engine 1.1 |
|---|---|---|---|
| A few named classes with fixed colours; "normal" left white or neutral | USDM (white = no designation) [R]; EFFIS 6 danger classes [R]; CPC three classes [R] | Proven at scale | One status word per region; no legend to learn |
| Plain sentence against the mean of past years | INPE "Dif. M." (% vs mean of previous years) [R]; WRI/GFW "more than double the annual average for this time of year" [S] | Proven | "About twice the usual for November" fits the "readable in a few seconds" rule |
| Ranking sentence | WRI/GFW "more fires than any other year since at least 2012" [S] | Common in news use | Must name the start year, which also states the baseline |
| Current year line over a historical band | GFED5NRT daily chart: mean and ±1 SD for 2002-2022 with the current year in red [P]; EFFIS weekly min-max and average [S]; INPE min, mean, max [R] | Proven | The "one simple graph" in 1.1 |
| Partial-period note | INPE: current year excluded from the mean; latest month partial; "compare monthly totals, not daily values" [R] | Proven | Matches the "provisional" trust marker |
| One summary for the area, then "where" on demand | INPE top 10 municipalities and biome shares under the national total [R]; GFED5NRT event polygons on the anomaly map [P] | Proven as a static table or map; linking it to a selected peak is our design (5.1) | Graph of the area summary; selecting a peak colours the cells by their share of that peak and names the top contributors |
| Escalate only with agreement | USDM: D4 needs "a strong consensus across multiple types of indicators" [R] | Proven (for drought) | Same idea as Solution.md 6.3: say "unusual" only when outside both the spread and the harmonization band |

How uncertainty is kept off the surface, from the sources:
- **By suppressing the claim, not drawing a bar**: USDM's consensus rule and our "outside the band" rule both show uncertainty as "we don't call it unusual". This adds no visual load [R for USDM; I for the transfer].
- **By coarse classes**: three or four classes hide the spread that a number would show (CPC, INPE) [R].
- **By one status marker** (estimated, provisional, demo), already in Insight Engine 1.1. Candidates for the "estimated" label from the sources: VIIRS-equivalent values before 2012; NRT months; months with a known sensor outage; cells where the calibration had too little data (MRBA60's rule: fewer than 30 cells in at least two years keeps the raw value [R]).

### 6.2 Scientific mode (scientists, reviewers)

What the papers and services publish so a reviewer can trust a merged number:

| Element | Seen in | What we could show |
|---|---|---|
| Per-sensor series side by side, raw and harmonized | VNP64A1 monthly series per GFED region [R]; GFED5NRT SNPP-only vs combined [P] | Raw MODIS, raw VIIRS per satellite, harmonized, on one chart for the selected area |
| Overlap scatter with slope and r, per year and region | VNP64A1 orthogonal regression per year (Table 1) and per region [R]; GFED5NRT Table 1 [P] | Overlap scatter of MODIS vs VIIRS cell-days with the fitted ratio and an orthogonal slope |
| Out-of-sample check | MRBA60 leave-one-year-out [R] | Leave-one-year-out error per region (Solution.md 6.2 step 6) |
| Seam marked on the time axis | GFED5NRT red dashed line at 2023 on the Z-score plot [P] | Vertical marks at 2012-01 (VIIRS start), 2018-04 (NOAA-20), 2023-03 (NOAA-21), and the reference switch |
| Ratio over time, by satellite | GFED5 stops at 2022 for drift [P]; CAMS drift note [R] | Overlap ratio per year, Terra and Aqua separately (Brief A step 3) |
| Per-cell uncertainty layer | C3S standard error [R]; MRBA60 RMSE model [R] | The band of A for every cell-month, and the number of years behind each baseline |
| Known-issues and change log with dates | GFAS known issues (Terra 2016, Aqua 2016) [R]; TerraBrasilis change history [R] | A list of gaps (Terra 2001, Aqua 2020, S-NPP 2022 outages), reprocessing and method version |
| Stated reference period and reference sensor | INPE 2003-2023 [R]; CPC 1991-2020 [R]; GFED5NRT 2012-2022 [P] | One line: "Baseline 20XX-20YY, VIIRS-equivalent, N years" |
| Homogeneity test at transitions | CM SAF, ESA CCI [S] | Optional: a Pettitt or similar test on the harmonized series at each sensor change |

---

## 7. What fits the deadline

| Method | Fits before 16:00? | Note |
|---|---|---|
| Single reference satellite series (INPE style) | Yes | Useful as a raw check. Not the score: Aqua ends in 2027 [R] |
| Ratio per region and season, VIIRS reference, bootstrap band (GFED5NRT style; Solution.md 6.2) | Yes | Fix or average the VIIRS satellites first (section 4, point 2) |
| Empirical quantile mapping per region and season (MRBA60's second step) | Probably, as an alternative to the ratio | Needs enough active cells per stratum |
| Leave-one-year-out check | Yes | Planned in Solution.md 6.2 |
| Orthogonal regression slope and r per year in the overlap | Yes | Cheap and directly comparable to VNP64A1 |
| Rank class (B) and Z-score (C) on top of A | Yes | Once A exists |
| Simple change-point test on the harmonized series | Maybe | Only if time remains |
| Random forest harmonization with drivers (MRBA60) | No | Needs climate and vegetation predictors and tuning |
| Kalman assimilation (GFAS) | No | |
| Pixel matching and view-angle correction (Zheng) | No | Also broken by Aqua's later overpass (CurrentSolutionLandscape.md) |
| Detection-probability maps (Sofiev and Kouznetsov) | No | Read only as snippets |

**Where the score must stay labelled as estimated**
- Every VIIRS-equivalent value before 2012-01 (it is a model output).
- NRT months (2026-08 or 2026-09 on), as Solution.md already says.
- Months with a known outage of a contributing satellite.
- Cells or region-seasons where the overlap had too few active cells for the fit.
- Values outside the range seen in the overlap (MRBA60 leaves such values unharmonized [R]).
- Values for single base cells (res 6 in the current proposal), more than area sums, because the calibration is fitted on regional sums.
- Classes in the top tail beyond what the number of years can resolve (section 4, point 7).

---

## 8. Still open and unverified

- **GFED5NRT**: Table 1 values, the reviewer reports, and whether the EFA training uses S-NPP alone or both satellites were not read.
- **EFFIS and GWIS**: baseline years, sensors and the "number of fires" method come from snippets only. A browser session could confirm them.
- **GFW**: how "unusual" is defined on the dashboard (snippet only, no formula found).
- **Sofiev and Kouznetsov 2026**: detection probabilities from snippets of the preprint, not the final paper.
- **NASA MODIS-VIIRS harmonization project** (Boschetti, Roy, Giglio): slides blocked (403); publication status unknown.
- **VIIRS Global Fire Atlas**: no release found.
- **INPE after Aqua**: no statement found on the next reference satellite.
- **Homogeneity tests**: only snippets; no fire-record example read.
- **IPCC likelihood language, SPI guide, Canadian FWI classes**: pages not readable; not used above.
- **Our own data**: zero share per cell-month, number of active months per cell, and how much NOAA-20 raises cell-days over S-NPP alone are not measured here. They belong to Brief A and decide whether B or C is stable. Also not measured: how the VIIRS to MODIS ratio changes with cell size (res 6 against res 4 or res 3). The Li, Zhang and Kondragunta grid-size result is a snippet only.

## 9. Questions for the team

1. Which number does the default mode show first: the class (B or C) or the level (A)?
2. VIIRS reference: one satellite per period, or the mean across VIIRS satellites (GFED5NRT)?
3. Calibration form: ratio with bootstrap band, or quantile mapping?
4. Baseline period: all harmonized years (2001-2025), or VIIRS years only (2012-2025, like EFFIS thermal anomalies per the snippet)?
5. How many classes, and at which percentiles, given 14 to 25 years?
6. Base cell size (res 6 is proposed in the map and grid plan) and how cells cut by the area boundary are counted.
7. Default-mode wording when the usual value is zero (5.1 point 9).
