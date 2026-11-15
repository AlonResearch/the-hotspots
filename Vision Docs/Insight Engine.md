# The Harmonized Insight Engine

A decision support system (DSS) that moves wildfire management from watching points on a map to anticipating risk and telling people what to do about it.

A historical hotspot calendar alone gives a land manager or firefighter little they can act on. The product is built in three layers, in this order of importance for the user:

| Layer | Purpose | Contents |
|---|---|---|
| 1. Harmonized history | What the challenge asks for | 20-year MODIS + VIIRS hotspot record, merged so the sensor of origin no longer matters |
| 2. Prediction and explanation | Creativity and novelty | Fire probability by place and time, drivers of that probability, recommendation classifier |
| 3. Action | Impact | Plain-language guidance for landowners, land managers, early-warning responders and firefighters |

> **Evidence labels used in this file.** *Checked* = the number or finding matched a search summary of the source on 2026-11-15; the paper itself was not read. This is the highest level reached so far. Nothing here is confirmed against a full paper text yet. *Design choice* = our own proposal, not a literature value. *Unverified* = stated by the team or on a slide, not checked. Numbers without a label are not claimed.

---

## 1. User Experience: Two Modes

Existing wildfire tools are clunky: too many layers, too many controls, closer to flying a plane than reading a map. We split the interface in two. The same data and models sit behind both. Only the amount shown differs.

### 1.1 Default mode: the dashboard

For firefighters, emergency responders, land managers and landowners. Very clean, very lean, low effort, low friction. It is built around what is happening now and what to do next, not around dates and sensors.

- **No region selected:** a simple map of the latest data, to explore different places. No layer menu.
- **Region selected** (search, or draw a property):
  1. **Probability of fire.**
     - About 2-3 km² or larger: one probability for the whole region.
     - Smaller parcel, e.g. 50 ha of farmland: a heat map across the parcel, with the probability varying by sub-area and the hotspots identified.
  2. **One simple graph** of probability over time. Selecting a point in time shows on the map where the risk is concentrated for that time.
  3. **Why:** the few main drivers (soil moisture, weather, fuel, proximity to human activity), in plain words.
  4. **What to do:** recommendations that lower the probability.
- **Trust marker:** each number carries one small, unobtrusive status (live, forecast, estimated, demo). Details are one click away, not on the surface.

Design rules: one primary view, at most a handful of controls, no jargon, readable in a few seconds. History is reachable at any moment (a link to the scientific mode) but is never the entry point.

### 1.2 Scientific mode (advanced)

For researchers and anyone who needs to audit a number. Entered at any time from the default mode, keeping the selected region.

- The harmonized historical **calendar**, with raw vs harmonized toggle and the baseline for each month.
- **Sensor detail:** which sensors (MODIS, VIIRS, SMAP, ERA5-Land, Sentinel and others) feed each number, how they were harmonized, and where the data comes from.
- **Provenance and status** for every figure: harmonized, provisional or demo.
- **Uncertainty:** the spread behind each baseline, number of years used, and model uncertainty for the probability.
- Feature values behind the cause attribution, and the evidence behind each recommendation.

### 1.3 How the modes relate

| | Default mode | Scientific mode |
|---|---|---|
| Audience | Firefighters, responders, landowners | Scientists, reviewers, curious users |
| Starts from | The latest data, or a region of interest | The historical record and the sensors |
| Main content | Probability, time graph, causes, actions | Calendar, sensors, provenance, uncertainty |
| Provenance and uncertainty | One status marker per number | Full detail for every number |
| Goal | Decide quickly what to do | Verify and understand where it comes from |

Principle: nothing is hidden, it is layered. Every simplified number in the dashboard can be traced to its full provenance and uncertainty in scientific mode.

---

## 2. Analytical Pipeline

The product answers three questions in sequence. Each step feeds the next.

### Step 1: Predict (how likely is a fire?)

Regress the probability of fire in a given region at a given time, from the harmonized hotspot history plus the environmental features in section 3.

### Step 2: Explain (why is it likely?)

Identify the causes behind the predicted probability using the same features: soil, weather, fuel and human infrastructure. The aim is to attribute risk to specific, understandable factors, not only to output a number.

### Step 3: Recommend (what lowers it?)

Given the feature set for a region, a classifier model outputs a set of scientifically grounded recommendations for preventing fires or reducing their probability.

**Open decisions** (not yet settled, so not specified here):
- Model families for the regression and the classifier.
- How recommendation classes are defined and labelled, and which literature or expert source backs each class (see section 4 for the candidate classes and what the literature does and does not support).
- How the cause attribution is computed.
- How probability is downscaled to sub-parcel resolution for the heat map.

---

## 3. Data Inputs

The harmonized satellite thermal anomalies (historical and near real-time) are layered with the datasets below. Each is tied to who benefits and where to get it.

### 3.1 Soil moisture

- **Relevance:** soil moisture and plant water stress improve prediction of fire growth beyond weather and surface fuels alone (checked against a search summary, see section 5). For a landowner, knowing that their soil is critically dry means a routine agricultural burn is more likely to escape.
- **Sources:**
  - NASA SMAP (Soil Moisture Active Passive): satellite measurement of water in the top soil layers.
  - ERA5-Land (ECMWF): global historical and current soil moisture.
- **Cloud advantage:** MODIS and VIIRS use thermal infrared and optical sensing and cannot see through heavy cloud or thick smoke. SMAP (L-band) and ASCAT use microwaves, which penetrate cloud, rain and surface vegetation to read the top ~5 cm of soil. Soil moisture is therefore available in overcast weather, when fire detection is blind.

> **Pitch:** A major limitation of existing wildfire tools is that optical fire detection (MODIS/VIIRS) is blinded by cloud. Our platform layers thermal hotspot data with microwave soil moisture data (SMAP). Because microwaves penetrate cloud, the system keeps monitoring the ground's vulnerability in overcast weather. If a farmer starts a burn under heavy cloud, where MODIS and VIIRS cannot see it, we still know the soil there is critically dry, and can warn before the clouds clear and the fire spreads.

### 3.2 Meteorology and Fire Weather Index (FWI)

- **Relevance:** Air temperature, relative humidity and wind speed determine whether a fire starts and how aggressively it spreads. Persistent heatwaves and low humidity are the main precursors of high fire danger. Critical for early-warning responders and firefighters, who need to know whether current winds will push a fire toward a town.
- **Sources:**
  - ECMWF Open Data: global weather forecasts.
  - Copernicus Climate Data Store: the Fire Weather Index, a ready-made index combining temperature, humidity, wind and rain into one fire-danger score.

### 3.3 Vegetation condition and fuel

- **Relevance:** Fire needs fuel. Healthy, dense vegetation carries a high fuel load but is harder to ignite, while stressed, aging or drying vegetation ignites easily.
- **Canopy-level greenness:** NDVI from Sentinel-2 or Sentinel-3. NDVI sees only the top of the canopy, so it misses deadwood, dry brush and ladder fuels on the forest floor.
- **Live fuel moisture:** estimated from optical indices and radiative transfer models (Yebra et al. 2013 review). Combining NDVI with surface temperature is an established approach (the ResearchGate paper on NDVI plus surface temperature in the reading list).
- **Sub-canopy structure:**
  - NASA GEDI: spaceborne LiDAR whose laser pulses pass through canopy gaps and return a 3D structure of the forest. Hakkenberg et al. (2024) used GEDI to show ladder fuels predict fire severity (verified, section 5).
  - SAR (e.g. Sentinel-1): microwaves penetrate the canopy to estimate above-ground biomass and fuel load.

> **Pitch:** Traditional fire danger platforms rely on optical vegetation indices (NDVI) that measure only the top of the canopy, leaving land managers blind to dry brush accumulating on the forest floor. We integrate NASA's GEDI LiDAR, which measures the 3D vertical structure of the forest. By identifying hidden ladder fuels beneath the trees, we give firefighters and land managers a three-dimensional view of combustible biomass, so they can clear dangerous understory before a fire ignites.

### 3.4 Human infrastructure

Distance to roads, agriculture and urban interfaces, used for both ignition likelihood and exposure.

### Summary

| Input | Role in the pipeline | Main source | Works under cloud |
|---|---|---|---|
| Hotspots (MODIS + VIIRS, harmonized) | History, target for the probability model | NASA FIRMS | No |
| Soil moisture | Ignition predictor, cause | SMAP, ERA5-Land, ASCAT | Yes |
| Weather and FWI | Ignition and spread, cause | ECMWF Open Data, Copernicus CDS | Forecasts, yes |
| NDVI / live fuel moisture | Canopy fuel condition | Sentinel-2/3, MODIS | No |
| Understory structure and biomass | Ladder fuels, fuel load | GEDI, Sentinel-1 SAR | SAR: yes |
| Human infrastructure | Ignition source, exposure | Road, land-use and urban maps | n/a |

---

## 4. Insight and Recommendation

The system flags when current conditions, or burning activity, in an area depart from what is normal for it. Example: current agricultural burning significantly exceeds the 20-year multi-sensor median for that exact month and soil condition.

### 4.1 Candidate recommendation classes

These are **candidate classes for the classifier, not validated rules**. The literature supports the *direction* of each action (what drives risk). It does not give us numeric trigger thresholds or a measured percentage by which each action lowers fire probability. Triggers and sizes marked *design choice* must be set from data or from regional forestry guidance before any number is shown to a user.

| Class | Driver the literature supports | Candidate action | What is verified | What is a design choice |
|---|---|---|---|---|
| Reduce ladder fuels | Ladder fuels, not canopy volume, predict fire severity (Hakkenberg et al. 2024) | Understory thinning or removal focused on ladder fuels | Direction of the effect. The paper's management reading favours targeting ladder fuels over broad thinning. | Which height stratum and density trigger the class. Any % reduction in severity or probability. |
| Pause ignition-prone burns in dry spells | Soil moisture and plant stress add predictive power for fire growth (Holden et al.; Krueger et al. 2023) | Postpone agricultural or prescribed burns while soil is unusually dry | That drier soil and plant stress raise fire-growth risk. | The percentile that triggers it, the ban length (7 or 14 days), the escape probability. |
| Fuel-moisture alert | Large fires in southern California chamise chaparral become much more likely below about 79% live fuel moisture (Dennison and Moritz 2009) | Raise alert and prepare firebreaks when estimated LFMC is low | The 79% threshold **for chamise in Los Angeles County chaparral**. | Any threshold for Piedmont vegetation (beech, chestnut, pine, grass). Buffer width. |
| Safe burn window | Fine dead fuel reduces spread when burning is done under safe conditions | Allow a low-intensity prescribed burn when conditions are moist and calm | General forestry practice. | Percentile range and wind limit. Not supported by a specific paper in the reading list. |

Training the classifier needs labelled outcomes (for example fire or no fire, or burn severity, per cell and period). Without them the classes stay rules written by us from the literature, and the demo should say so.

### 4.2 From data to recommendation: the supervised-learning link

The chain is data, outcome, driver, action, in that order. Each link is stated with what it needs and what is still open.

```
features X (per H3 cell, per month)  ->  outcome y (observed fire)  ->  which drivers push P(fire) up  ->  which of those can people change  ->  recommendation
```

**Unit of analysis.** One row per res 6 H3 cell and month. This matches the harmonized calendar the project already builds (monthly granularity, per `GroundTruth.md` section 4).

**Step A: a classifier that is trainable now.**
- **Label y:** fire activity observed in the cell and month, taken from the harmonized hotspot record (for example above or below the cell's own 20-year median, or any active detection). The harmonized history is the one label we hold at scale and its sensor bias is already handled, which is the point of the challenge.
- **Features X:** soil moisture anomaly, fire weather index, live fuel moisture estimate, canopy and understory structure, distance to roads and agricultural land, month of year, and the cell's own past activity.
- **Model:** any standard supervised classifier or probability regressor. The model family is still an open decision (section 2). Spatial and temporal hold-out (leave out whole years and whole regions) is required, otherwise neighbouring cells leak into the test set and the scores are inflated.
- **Why this is credible:** the papers in section 5 show that these same variables carry predictive signal for fire growth and severity. We are not claiming new physics, we are putting known drivers into one model.

**Step B: from drivers to a recommendation.** Split the features by whether people can change them:

| Feature | Can people change it? | What an agency or landowner can do | Supporting evidence |
|---|---|---|---|
| Ladder fuel and understory structure | Yes, over months to years | Targeted understory thinning, followed by surface fuel treatment | Hakkenberg et al. 2024 (severity); treatment meta-analyses (section 5) |
| Timing of burning, machinery use and other ignition-prone activity | Yes, immediately | Postpone or restrict during dry spells | Krueger et al. 2023 and Great Plains work (large fires below soil-moisture thresholds) |
| Distance to roads, farmland and settlements | Slowly (zoning, buffers) | Firebreaks, buffer rules, land-use planning near the interface | Human causes dominate in Europe (section 6) |
| Soil moisture, weather, live fuel moisture | No | Use as the trigger for when to act, not as something to treat | Holden et al.; Dennison and Moritz 2009 (regional) |

A recommendation is then the changeable factor that contributes most to a cell's predicted probability, shown only when the non-changeable factors (the trigger) say the window is dangerous. How the contribution is computed is an open decision (section 2, step 2).

**Step C: the same output at legislative scale.** Aggregate the cell probabilities and triggers over a region and month. An agency gets a ranked list of cells and months where the trigger conditions are met, and which changeable factor dominates. Example uses: when to consider a regional burn restriction, where fuel treatment funding would address the largest share of predicted risk, which wildland-urban interface cells need buffer rules. The tool supports a decision. It does not set the legal threshold, and it should not be presented as doing so.

**Where "easy to classify" needs a warning.** Two different labels are possible and they are not equal:
- **Learned from outcomes (Step A).** Honest, testable, and it will show a measurable score on held-out years.
- **Rule-defined classes** (for example "soil below the 15th percentile means pause burns"). A supervised model will learn these rules almost perfectly, because the labels are generated from the same features. That score proves the code works, not that the recommendation lowers fire probability.

**What the data cannot show by itself.** Step A learns association. It does not show that thinning a cell lowers next year's probability. That needs outcome data from treated and untreated places (for example fuel-treatment records matched to later fires), which the project does not hold. Until then, the effect size of an action comes from the published studies, with the transfer caveats in section 5.1.

### 4.3 Worked examples (illustrative, demo wording)

**Early-warning responder**

- **Insight:** *The harmonized MODIS/VIIRS calendar shows a peak in human-caused agricultural fires in this region every October. Current SMAP data shows soil moisture 30% below the 20-year average, and ECMWF forecasts high winds.*
- **Recommendation:** *High risk of agricultural fire escape. Recommend a temporary ban on stubble burning for the next 7 days and pre-positioning aerial resources near the agricultural-forest interface.*

**Landowner**

- **Insight:** The north-east third of the 50 ha parcel carries the highest fire probability this week: dry soil and fuel adjacent to a road.
- **Recommendation:** Postpone planned burns, and manage fuel in the flagged area. (Demo wording; in the full system the recommendations come from the classifier in step 3.)

The figures in these examples (30%, 7 days, 50 ha) are placeholders for the demo, not results.

---

## 5. Checked Evidence from the Reading List

Checked against search summaries of the sources on 2026-11-15. Full texts were not read, so confirm any number against the paper before quoting it on stage.

| Finding | Source | Status |
|---|---|---|
| Machine-learning models of daily fire growth in the US Northern Rocky Mountains explain about 36% of the variation with local weather, hydroclimate, fuels and topography, and about 56% with a one-day lag of fire behaviour. Adding soil moisture and plant hydraulic stress adds 8 to 9 percentage points of explained variation over weather and surface fuels. Soil moisture and plant stress rank among the dominant predictors. | USDA Forest Service study (Holden et al.), ResearchGate title "Soil Moisture is a Stronger Predictor of Forest Fire Spread Potential Than Weather in the US Northern Rocky Mountains" | Checked against a search summary on 2026-11-15; paper not read. Journal name and exact wording to check. |
| Ladder fuels (vegetation between 0 and 10 m in the summary) predicted fire severity more consistently than whole-forest biomass, canopy height or canopy volume across 42 large California wildfires from 2019 to 2021, including under extreme wind, slope and vapour pressure deficit. Sparse understories matched lower severity. | Hakkenberg, Clark and colleagues (2024), *Communications Earth & Environment*, built on GEDI spaceborne LiDAR | Checked against a search summary on 2026-11-15; paper not read. Height range and authors' full list to check in the paper. |
| Review: soil moisture (in situ, remotely sensed, modelled) predicts live and dead fuel moisture and fire occurrence and size, relationships vary by ecosystem, and operational danger systems rarely use direct soil moisture. | Krueger et al. (2023), *International Journal of Wildland Fire* 32(2), 111-132 | Checked against a search summary on 2026-11-15; paper not read. |
| A critical live fuel moisture level near 79% for chamise in Los Angeles County: large fires (above 1,000 ha) and burned area rise sharply below it. The date the threshold is crossed depends on antecedent (especially spring) rainfall. | Dennison and Moritz (2009), *International Journal of Wildland Fire* | Checked against a search summary on 2026-11-15; paper not read. Specific to chamise chaparral, not universal. Page numbers to check. |
| Review of remote sensing of live fuel moisture: empirical vegetation indices (NDVI, NDWI and others) and radiative transfer inversion, with the challenges for operational products. | Yebra, Dennison, Chuvieco, Riaño, Zylstra, Hunt, Danson, Qi and Jurdao (2013), *Remote Sensing of Environment* 136, 455-468, "...for fire danger assessment: Moving towards operational products" | Checked against a search summary on 2026-11-15; paper not read. |

| Fuel treatments in seasonally dry conifer forests of the US West lowered subsequent fire severity by roughly 60 to 72% against untreated areas, for thinning combined with prescribed or pile burning and for prescribed fire alone. Thinning alone was clearly less effective. The effect fell by more than half when a fire came more than 10 years after treatment. | Regional meta-analysis found through search (conservationgateway.org and ScienceDaily summaries). Paper not yet identified. | Checked against a search summary; paper not yet identified. Pull and cite the paper before using the number. |
| Large growing-season fires in the Southern Great Plains cluster below soil-moisture and plant-water-stress thresholds (one example given is a fraction of available water near 0.59). Large fires are suppressed above them even when weather is favourable. | Krueger and colleagues, Southern Great Plains grassland work | Checked against a search summary; paper not read. Grassland, not forest. Threshold values are local. |
| About 95 to 96% of fires in Europe are caused directly or indirectly by people. | European Commission Joint Research Centre and EFFIS, European Environment Agency material | Checked against a search summary; EFFIS report not read. Use the EFFIS wording, not 95 to 98%. |
| Over 90 to 95% of forest fires in Piedmont have a human origin. | Regione Piemonte and Carabinieri Forestali statistics (Italian sources) | Checked against a search summary; Italian source not read, see the translation note in section 5.1. |

**Not yet checked** (listed in the reading list, not read by us): the downscaled hourly soil moisture dataset, the Thailand Landsat 8 soil moisture paper, the Algeria Sidi Douma paper, the Kramer et al. ladder fuel LiDAR paper, the NAU ladder fuels page, the EUMETSAT fire management guide, the MDPI 2072-4292/18/7/1049 paper, the AJST paper and the Springer s41976-025-00203-w PDF. No claim in this file depends on them.

**Removed from the previous version because no source supports them:** "over 90% of significant burned areas follow a soil moisture deficit below the 10th to 15th percentile", "crown fire probability rises over 300%", "clearing ladder fuels cuts crown fire or severity by 60 to 80%", the 1 to 4 m stratum and 0.35 m⁻¹ density threshold, "escape risk is 4.8 times the median", the claim that 79% is a universal physical tipping point, and the claim that sensor step artefacts are 4 to 6 times. The measured MODIS to VIIRS ratio in this project's build is 2.5 to 3.1 (Contributor.md, method section).

### 5.1 Caveats: where the findings do not transfer, and translation issues

"Translation" here means two things: moving a finding to a different place, vegetation or scale, and moving words or definitions between languages and agencies. Both can silently change a number.

**Transfer to our setting**

| Issue | Why it matters | What to do |
|---|---|---|
| Different region and vegetation | The 79% value is for chamise chaparral in Los Angeles County. The ladder-fuel study is California conifer and mixed forest. The soil-moisture growth study is the US Northern Rockies. The Great Plains result is grassland. Piedmont has beech, chestnut, pine and mountain grass. | Treat each value as an example of a threshold effect, not as a Piedmont threshold. Derive local thresholds from local data. |
| Different outcome measured | The papers measure severity, daily fire growth or large-fire occurrence. Our target is whether a cell has fire activity in a month. These are related but are not the same quantity. | Say which outcome each source measured whenever it is cited. Do not quote severity results as probability results. |
| Different scale | SMAP soil moisture is coarse (about 9 km after downscaling), GEDI samples footprints of about 25 m along tracks and does not cover every parcel, and the parcel heat map is finer than either. | State the resolution of every input in scientific mode. Do not imply parcel-level precision from coarse inputs. |
| Different time period and instruments | The ladder-fuel fires are from 2019 to 2021. FIRMS detections come from MODIS and VIIRS, which differ in resolution, and Suomi NPP production ended on 2026-11-02. | Note the period and sensor behind each number. |
| Percentile vs absolute values | A "15th percentile" soil-moisture trigger depends on the reference years and the dataset. The same percentile differs between SMAP and ERA5-Land. | Fix one dataset and one reference period before setting a trigger, and record them. |
| Percentage points vs percent | The Rocky Mountain result is 8 to 9 percentage points of explained variation, from about 36% to 56% in the baseline models. It is not an 8 to 9% relative gain. | Always write "percentage points of explained variation". |
| Effect of treatment fades and depends on type | The 60 to 72% severity reduction is for thinning plus burning, drops by more than half after about 10 years, and is smaller for thinning alone. | Show treatment type and age with any recommendation that cites it. |
| Prediction is not causation | A model can rank drivers without showing that changing one lowers risk. | Present recommendations as risk-informed actions. Do not state a probability reduction until treated-versus-untreated data supports it. |

**Language and definition issues**

| Issue | Detail | What to do |
|---|---|---|
| Italian sources read through search summaries | Regione Piemonte and Carabinieri Forestali statistics are in Italian. The "over 90 to 95% human origin" was relayed by a summary, not read in the source. | Read the original table before quoting, and give the Italian term next to the English one. |
| "Incendio boschivo" is not the same as every vegetation fire | In Italian law and statistics it covers fires in woods and some adjacent land. FIRMS hotspots also include agricultural and grassland burning. Counts will not match one for one. | Say which definition a figure uses. Do not divide FIRMS counts by regional forest-fire counts. |
| "Human cause" includes several categories | Negligent (for example escaped agricultural burning), deliberate, and sometimes "unknown cause" are grouped differently between agencies. A "95%" may include or exclude unknown cases. | Quote the agency's own categories and year range. |
| "Fire severity" is used in several ways | Studies use satellite burn indices, crown damage or tree mortality. These are not interchangeable. | Name the metric used when citing severity. |
| Machine summaries | Several figures here come from AI search summaries. They can merge sources or change wording. | Treat every number as checked against a summary only, not confirmed, until the paper is open. |

---

## 6. Facts Taken from Elsewhere (not verified here)

- "95 to 98% of fires in Europe are caused by human activity" on the slides: search summaries of EU Joint Research Centre and EFFIS material give about 95 to 96%. Use the EFFIS figure, or cite the slide's range only if the original source is found.
- "About 50% of Piedmont fires are smaller than 0.5 ha" and "big fires are 5 to 10% of fires and 80% of burnt area": taken from the team's slides, which cite Regione Piemonte AIB 2026. Searches found no source for these. Quote them with that attribution and open the regional geoportal database to confirm.
- SMAP L-band reads roughly the top 5 cm of soil and penetrates cloud: standard instrument property, kept from the earlier draft, source to cite.
- Almost all significant burned areas following at least a month of severe moisture stress (earlier draft, section 3.1): unsourced, removed.

---

## 7. Audiences

| Audience | What they get |
|---|---|
| Landowner / manager | Parcel-level probability heat map, causes, and steps to lower risk |
| Early-warning responder | Region-level risk, departures from the historical norm, ban and pre-positioning recommendations |
| Firefighter | Weather-driven spread risk, such as whether winds push a fire toward a settlement |

---

## 8. Scope of the Demo

This is a demo. It demonstrates how the product should work, built on the scientific recommendations we found. The full models (training, validation, all driver data) need more time than the 24 hours of the event.

The demo runs on real harmonized data. The probability, cause and recommendation views are handcrafted from that data and the scientific literature, to show how the full system behaves:

- **Probability:** a regression on the harmonized history plus the section 3 features.
- **Causes:** attribution of risk to soil, weather, fuel and human factors.
- **Recommendations:** a classifier that maps the feature set to literature-backed actions.

**Current demo in the app.** The "Why" and "What to do" sections of the place panel show how this should work for four places in Italy: Turin, Milan, Monte Barone and the plain around Foggia. They are marked "Demo". The recommendations come from simple if/else rules based on the candidate classes in section 4.1, and are given for the months before the month with the highest fire probability (`web/src/insight/demo.ts`).

Training and validating these models needs the full driver datasets and more time. The UI shows only the standard demo notice; this explanation lives in the documentation.

**What to say if a judge asks whether the recommendations are proven to reduce fire probability:** the literature shows which conditions raise risk (dry soil and stressed plants, ladder fuels, low live fuel moisture). The effect size of each action on next year's fire probability is not measured by us and is not given by these papers. Closing that gap needs outcome-labelled training data, and the demo's recommendations are rules grounded in the drivers, not a validated forecast.
