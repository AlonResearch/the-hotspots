# Current Solution Landscape

The team's notes on the current tools (first part, unchanged) and the evidence check against them (second part).

## The team's original notes: why the current solutions suck

The Existing Landscape: Currently, professionals rely on a fragmented ecosystem of monitoring and forecasting tools. The primary platforms include NASA's FIRMS (Fire Information for Resource Management System), Global Forest Watch (GFW), the European Forest Fire Information System (EFFIS), and administrative tools like the Wildland Fire Decision Support System (WFDSS).
Why They Fail (The Pain Points):
The Sensor Bias and Resolution Disconnect: Existing historical databases are split. MODIS pixels can distort up to 2km at the edges of the satellite swath, while the newer VIIRS sensor detects dramatically more small fires. Because they are not harmonized, comparing historical 2005 data to 2024 data directly creates statistical illusions, making it impossible to establish a true "normal" baseline.
Reactive, Not Predictive: Systems like FIRMS often only confirm a fire after it has grown large enough to be detected, missing small, fast-moving agricultural burns due to satellite overpass gaps.
Coarse Forecasting: Existing fire danger maps (like those used in EFFIS) are often too broad (ranging from 8 km to 28 km resolution) and are not calibrated to local fuels or specific historical fire regimes.
Administrative Burden: Decision Support Systems like WFDSS are frequently viewed by users as bureaucratic hurdles. Studies show they are often used retrospectively to justify decisions that incident commanders have already made on the ground, rather than acting as a proactive guide.

---

# Evidence check and landscape (added 2026-11-14)

Everything above is the team's original text, unchanged. Below is what our research found. Tags: **[O]** observed in the live app or page text, **[D]** read in documentation or a paper, **[I]** our inference. Agents could not take screenshots, so "observed" means page text and DOM, not a visual walkthrough. Sources are listed at the end.

## 1. The four pain points against the evidence

| Claim above | Status | Notes |
|---|---|---|
| MODIS and VIIRS are not harmonized, so a 2005-vs-2024 comparison misleads | **Supported** | FIRMS, Worldview, EFFIS and GFW all show the sensors as separate layers [O/D]. VIIRS 375 m gives about 3x more daytime and 25x more nighttime fire pixels than the 750 m VIIRS product [D, Schroeder 2014]. The "~6x vs MODIS" figure is a rival repo's claim, not verified [D]. |
| MODIS pixels distort up to 2 km at the swath edge | **Partly checked** | NASA says the pixel is 1 km at nadir and grows toward the scan edge [D]. We did not verify the "2 km" figure. Cite NASA's wording. |
| FIRMS only confirms a fire after it has grown large | **Not supported as written** | NASA says MODIS routinely detects flaming and smoldering fires around 1,000 m2 [D]. The real limits are overpass gaps, cloud, smoke and canopy, and small or cool fires [D]. Latency is about 3 hours [D]. Reword to "misses small fires between overpasses". |
| Fire-danger maps (EFFIS) are 8-28 km and uncalibrated | **Unverified** | Not checked, and it concerns fire danger forecasting, not hotspot history. Out of scope for this challenge unless we choose otherwise. |
| WFDSS is a bureaucratic hurdle used retrospectively | **Unverified** | We did not research WFDSS, and "studies show" has no citation. Add the study or drop the claim before the pitch. |

## 2. What exists today

| Tool | What it does well | Where it stops |
|---|---|---|
| **NASA FIRMS** | Source of record. Alerts, API, archive from 2000, gridded daily counts, side-by-side monthly burned-area comparison (visual only). | Map shows 1-31 days. No harmonization, anomaly vs baseline, calendar, area-of-interest statistics or time series found [O: script search of Advanced Mode]. The "Experimental" menu was not opened. |
| **NASA Worldview** | Imagery browsing, compare, animation. | Charting button disabled for fire layers [O]. Two sensors overlaid in one style [O]. No numbers to export. |
| **EFFIS** (Copernicus) | Weekly and cumulative charts with min-max and average envelopes, 2006-2025 [D]. Filters agricultural false alarms. | Fixed national and regional units. Sensors not reconciled. No calendar. |
| **GWIS** (JRC) | National statistics and country profiles. | Profiles end in 2019, which avoids the sensor seam [D]. |
| **Global Forest Watch** | Fire counts for a drawn or uploaded polygon, plus alerts [D, from search snippets]. | No baseline or calendar seen. Not confirmed in the live app. |
| **INPE Queimadas** (Brazil) | "This year vs average of previous years" column; z-score classes in bulletins [O/D]. | One unnamed reference sensor. Baseline period differs between pages. Brazil only. |
| **DEA Hotspots** (Australia) | Timeline, user-chosen satellites, confidence filter, summary stats. | Sensor choice is the user's, so no harmonization. No anomaly view found. |
| **fire.ai, Watch Duty** | Confidence filters, disclaimers, human-verified incident context. | No history or statistics. |
| **GFED5NRT, VNP64A1, FireCCI** | Published precedent for bridging MODIS to VIIRS by overlap calibration [D]. | Datasets, not tools. Burned area and emissions, not hotspot counts. Reliable when aggregated broadly. |
| **Rival Space Apps repos** | fire-harmony (most rigorous on paper), FireChronicle (calendar tab, tests), FireHarmonize. | Demos slow, empty or unverified; fire-harmony's ML model is hard to audit. |

## 3. What is missing

No deployed tool we found combines all of these:
1. A MODIS and VIIRS record on one comparable scale, with the method visible.
2. A calendar of burning activity for a user-drawn area.
3. "Unusual vs normal" for that area, against a stated baseline.
4. Uncertainty a non-scientist can read, such as marking where the series relies on extrapolation.
5. A stated plan for the MODIS end (Terra and Aqua end of science expected 2027 [D, secondary]; Suomi NPP FIRMS delivery ended 2026-11-02 [D]). Only the dataset community addresses this.

This is absence of evidence from page text and docs. Re-check in the live apps before the pitch.

## 4. Do not claim as new

- Area-of-interest selection and alerts (FIRMS, GFW).
- Baselines and anomaly comparison in general (EFFIS, INPE).
- Side-by-side year comparison of burned area (FIRMS).
- Density grids, animation, downloads, APIs.
- A harmonized calendar as an idea. Rival teams claim it. Our difference has to be the end user and how the answer and its uncertainty are shown.

## 5. Methods the literature supports (for a 2-day build)

- Count unique active equal-area cells per period instead of raw points.
- Use VIIRS as the reference sensor and keep MODIS-only years as a separate series.
- Calibrate with a transparent VIIRS/MODIS ratio over the overlap years, fitted by region and season, with intervals from the spread across years.
- Avoid pairwise detection matching: Aqua now passes hours after VIIRS, which broke one rival's 30-minute window [D].
- Flag anomalies against the same calendar month's history, and call them unusual only when they exceed the calibration band.
- Do not sum fire radiative power across sensors. State that counts are detections, not fires or burned area.
- No complete ground truth exists for historical hotspot counts. Say so, and use a leave-one-year-out check. Official fire records exist for some regions and can test how often each sensor detects real fires by fire size, but they are incomplete and biased towards larger or reported fires, so they validate detection, not counts.

These are inputs for discussion, not decisions. Nothing here is in GroundTruth.md yet.

## 6. Still unverified

- FIRMS: the Experimental menu, Fire Footprint (API-documented, absent from the map script), custom date ranges over 31 days, the alerts sign-up.
- Worldview: Compare, snapshot download, Measure, mobile.
- GFW and GWIS in their live apps.
- WFDSS, EFFIS fire-danger resolution, Windy, EO Browser, InciWeb, CAL FIRE, WIFIRE, Italian national services, any deployed Google Earth Engine fire app.
- Whether the Piemonte regional fire data is current enough to serve as local validation.
- The 2026 detection-probability figures (78% MODIS, 88% VIIRS) come from search snippets, not the full paper.

## Sources

- FIRMS: https://firms.modaps.eosdis.nasa.gov/map/ , https://firms.modaps.eosdis.nasa.gov/download/ , https://www.earthdata.nasa.gov/data/tools/firms/faq
- Worldview: https://worldview.earthdata.nasa.gov/ , https://nasa-gibs.github.io/gibs-api-docs/
- EFFIS: https://forest-fire.emergency.copernicus.eu/ ; GWIS: https://gwis.jrc.ec.europa.eu/
- INPE: https://data.inpe.br/queimadas/situacao_atual/ ; DEA: https://hotspots.dea.ga.gov.au/help
- GFED5: https://essd.copernicus.org/articles/18/7535/2026/ ; Global Fire Atlas: https://essd.copernicus.org/articles/11/529/2019/
- Schroeder et al. 2014: https://earthdata.nasa.gov/s3fs-public/imported/Schroeder_et_al_2014b_RSE.pdf ; Giglio et al. 2016: https://www.earthdata.nasa.gov/s3fs-public/imported/Giglio2016_C6_Fire.pdf
- Sofiev and Kouznetsov 2026: https://gmd.copernicus.org/articles/19/10123/2026/ ; VNP64A1 validation: https://geog.umd.edu/sites/geog.umd.edu/files/pubs/1-s2.0-S0034425725004109-main.pdf
