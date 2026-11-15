# Personas and Problem Definition

> **Status**: draft, 2026-11-15.

> **AI Disclosure and Verification Note**
> Text drafted by Gemini 3.8 Flash from the research report; research and fact-checking by Claude. The reframing of the personas was proposed by an AI assistant from the team's own documents and is pending team confirmation (the original four personas were the team's). The solution idea and method decisions are the team's. Every number carries a source tag and verification status.

> **Note (2026-11-15)**: mentions of `Solution.md`, `ImplementationPlan.md`, `Map Grid Plan.md` and `Thread Briefs.md` refer to early hackathon plans that were removed from the repository; they are in the git history.

***

## 1. The problem in one page

The primary job of The Hotspots is to answer one question: "is this place burning more than usual, and since when?" The product aims to answer this in seconds, using the harmonized MODIS and VIIRS record and showing its uncertainty [T].

The satellite record spans two distinct eras. MODIS on Terra and Aqua has provided active fire observations since late 2000. VIIRS on Suomi-NPP began in early 2012, followed by NOAA-20 in 2018 and NOAA-21 in 2023 or 2024. This record faces immediate disruption. Suomi-NPP VIIRS delivery to FIRMS ended on 2 November 2026 at 15:40 UTC [D: NASA-FIRMS-FAQ]. Orbit maintenance for Terra and Aqua ceased years ago, causing orbital drift that degrades observation geometry and overpass timing [D: NASA-Science-Terra; Giglio-LANCE-2025; LDOPE-2026]. NASA and CAMS project that Terra and Aqua operations will begin shutting down in late 2026 or 2027 [D: Earthdata-Transition; CAMS-2025; NASA-Feature-2024]. Without harmonization, the multi-decadal satellite record breaks.

### Who the live MVP serves directly vs who depends on planned layers [I]

| Persona | Core Job | Live MVP Fit | Dependency |
|---|---|---|---|
| **1. Regional fire planner and operations desk** | Assess if seasonal burning in a valley departs from historical normals | Direct fit | Harmonized history and anomaly calendar are the core product [I]. |
| **2. Climate, carbon and risk modelers** | Model decadal fire regimes across sensor transitions | Direct fit | Multi-sensor record continuity and stated uncertainty are the core product [I]. |
| **3. Landowner or farmer** | Plan agricultural burning within legal safety windows | Demo storyline | Depends on planned outlook, weather, and soil moisture layers (planned, illustrative) [I]. |
| **4. Incident commander and frontline crews** | Tactical on-scene wildfire containment | Weak fit (also affected) | Real-time tactical decisions rely on wind, terrain, and active fuel models, not satellite history [I]. |

### Where hotspots are weak in Piemonte

Active fire detections cannot be interpreted as a direct count of wildfires:
* In Piemonte, 49 percent of recorded forest fires are 0.5 ha or smaller [D: Regione-Piemonte-AIB-2026].
* For fires larger than 0.5 ha, the median fire size is 2.5 ha [D: Regione-Piemonte-AIB-2026].
* A nominal VIIRS 375 m pixel covers about 14 ha at nadir [D: Schroeder-2014], and a MODIS pixel covers 100 ha at nadir, growing to nearly 1,000 ha at swath edges [D: NASA-MODIS-Guide; Sofiev-2026].
* Fires of 30 ha or larger represent only about 5 to 10 percent of events, yet account for 81 percent of total burned area [D: Regione-Piemonte-AIB-2026; figure-read].
* Historical fire seasonality is heavily concentrated: January to April accounts for about 68 percent of fire events and 61 percent of burned area (figure-read from regional charts, status: needs database check) [D: Regione-Piemonte-AIB-2026].

Because most small fires remain below the detection threshold of spaceborne radiometers, The Hotspots displays satellite-visible activity (active cell-days), not a count of individual fires [T].

***

## 2. Persona 1: Regional Fire Planner and Operations Desk

### Who they are
Analysts and duty officers at regional operational coordination desks, such as Piemonte's Sala Operativa Unificata Permanente (SOUP). The SOUP is hosted at the regional Vigili del Fuoco directorate and staffed jointly with regional personnel and the Corpo Volontari AIB del Piemonte [D: Regione-Piemonte-Node-3017; L-353-2000; LR-15-2018]. They monitor fire potential, support seasonal declarations, and review district activity against regional records.

### One moment (illustrative scenario)
In mid-October, an operations analyst reviews satellite activity in the Val di Susa. Piemonte's typical fire season occurs between January and April, which holds about 68 percent of events [D: Regione-Piemonte-AIB-2026, figure-read]. An event like the October 2017 Bussoleno and Mompantero wildfire (which burned over 3,900 ha) represents an extreme out-of-season outlier [D: Regione-Piemonte-AIB-2026]. The analyst needs to know: "is this valley burning unusually for October against the multi-decadal record?" Note: the team must confirm on its own archive that the October 2017 event is clearly visible in the harmonized record before citing it in live pitch materials [T].

### Journey with today's tools

| Step | Tool used | Where it fails |
|---|---|---|
| **1. Seasonal review** | ARPA Piemonte bulletins and regional reports | Relies on weather indices and rainfall deficits against 1991-2020 normals, lacking a spatial satellite fire baseline [D: Il-Post-ARPA-2026; I]. |
| **2. Active monitoring** | NASA FIRMS | Displays raw hotspot points without multi-year anomaly context; separate MODIS and VIIRS layers display different detection densities [D: NASA-FIRMS-FAQ; O: FIRMS-2026]. |
| **3. Regional filtering** | Copernicus EFFIS | Applies a knowledge-based filter removing agricultural burns, updating 6 times daily, but presents fixed administrative units rather than valley boundaries [D: EFFIS-Active-Fire; I]. |
| **4. Anomaly judgment** | Internal desk discussions | Staff must mentally adjust for sensor differences when comparing current activity to historical episodes [I]. |
| **5. Declaration support** | Dirigenziale determinations | Formal declarations of maximum danger lack an automated spatial fire history benchmark [D: Regione-Piemonte-Danger-2026; I]. |
| **6. Post-season review** | Regional fire registers (AIB plan) | Ground records require months of annual consolidation before seasonal comparisons can be published [D: Regione-Piemonte-AIB-2026; I]. |

### What it costs them
* In 2026, Piemonte declared a state of maximum fire danger from 8 July to 11 September, followed by a regional emergency declaration on 3 August, driven by a June Po basin rainfall deficit of 36 percent against 1991-2020 and a July river flow deficit exceeding 40 percent [D: Regione-Piemonte-Danger-2026; MeteoWeb-2026; Il-Post-ARPA-2026].
* A regional page on the SOUP reports 66 fires, 180 vehicles and 507 AIB volunteers deployed since a high-danger state declared on 30 December. The year is not shown on the page, so check it before use [D: Regione-Piemonte-Node-3017; year unverified]. A 19 March 2019 release separately records a maximum danger declaration for the whole region [D: Regione-Piemonte-2019].
* In 2022, Piemonte recorded 380 fires and 2,628 ha across the full year [D: JRC-2022], with 156 fires above 0.5 ha in the regional database [D: Regione-Piemonte-AIB-2026, figure-read].
* Aerial coordination relies on regional helicopters supplemented by national COAU aircraft [D: Regione-Piemonte-2019], where Canadair CL-415 flight hours cost an estimated EUR 13,000 to 15,000 under turnkey service contracts (base rate EUR 12,850/hr) [Press: Panorama-VVF-2021].
* No source demonstrates that operations desks currently use satellite hotspot counts; planners rely on weather indices, ground reports, and civil protection assessments [D: Il-Post-ARPA-2026; I].

### Why this matters
Operations planners must distinguish ordinary seasonal burning from dangerous off-season anomalies across complex Alpine valleys.

### The gap we aim to close
We aim to provide a continuous burning activity calendar on a consistent spatial unit, allowing operations planners to select a valley and view whether current satellite-visible activity departs from the historical baseline [T].

### What we would validate
* **Validation question**: Do regional fire planners and SOUP analysts ask whether activity in a valley is historically unusual for the current season, and would a satellite-visible activity calendar change operational readiness or post-season reviews?
* **What the answer tells us**: If planners confirm this question is central, the baseline calendar addresses a genuine workflow gap. If planners state that fire danger determinations rest strictly on meteorological indices (such as ARPA drought assessments) regardless of past satellite detections, the product serves primarily as a retrospective reporting tool rather than an operational aid.

***

## 3. Persona 2: Climate, Carbon and Risk Modelers

### Who they are
Earth system scientists, carbon cycle researchers, and atmospheric modelers studying wildfire emissions and disturbance regimes. Global fire models and emissions inventories depend on continuous satellite time series, but foundational research confirms that sensor transitions introduce major discontinuities [D: Chen-2026; CAMS-2025; Sofiev-2026].

### One moment (illustrative scenario)
A climate scientist modeling Mediterranean fire emissions from 2000 to 2026 attempts to combine MODIS and VIIRS records. Concatenating raw active fire detections introduces apparent shifts in fire frequency in 2012 (Suomi-NPP VIIRS) and 2018 (NOAA-20 VIIRS) due to sensor resolution and sensitivity differences, which the team plans to measure on the FIRMS archive [T]. Without an empirical harmonization method, statistical models risk attributing sensor changes to climate-driven trends (illustrative, not data).

### Journey with today's tools

| Step | Tool used | Where it fails |
|---|---|---|
| **1. Data acquisition** | NASA FIRMS archive | Distributes separate archive files for MODIS (MCD14ML) and VIIRS (VNP14IMGML, VJ114IMGML) without cross-sensor normalization [M: GroundTruth.md; D: NASA-FIRMS-FAQ]. |
| **2. Sensor bridging** | Custom scripts (GFED, CAMS, MRBA60) | Each major group builds bespoke bridges: GFED5 uses lookup tables, CAMS added VIIRS in late 2025, and MRBA60 applies machine learning with quantile mapping [D: Chen-2026; CAMS-2025; UEA-MRBA60-2024]. |
| **3. Accounting for drift** | Orbital tracking data | Terra and Aqua mean equator crossing times drifted from historical morning (10:30) and afternoon (13:30) tracks, changing daily solar heating and fire detection conditions [D: NASA-Science-Terra; Giglio-LANCE-2025]. |
| **4. Pixel expansion** | Radiometer geometry tables | MODIS pixels expand from 1 km at nadir (100 ha) to 2.0 km by 4.8 km at scan edges; VIIRS limits edge growth to about 2x linear [D: NASA-MODIS-Guide; Schroeder-2014; Sofiev-2026]. |
| **5. Model execution** | Carbon and climate pipelines | S-NPP VIIRS delivery terminated on 2 November 2026, and MODIS faces decommissioning, forcing teams to reconcile feeds before modeling [D: NASA-FIRMS-FAQ; Earthdata-Transition]. |
| **6. Peer review** | Academic journals | Reviewers question whether multi-decadal trends reflect climate shifts or uncalibrated sensor transitions [I]. |

### What it costs them
* GFED5 explicitly terminates its science-quality series in 2022 because orbital drift exceeded operational thresholds; the GFED team states that comprehensive MODIS-to-VIIRS fusion "remains a key priority but requires further investment" [D: Chen-2026].
* CAMS introduced VIIRS into the GFAS system on 4 December 2025, warning that VIIRS does not replace the morning Terra overpass and urging the fire community to prepare for the post-MODIS era [D: CAMS-2025].
* MRBA60 documentation confirms that long-term multi-sensor continuity is essential for climate applications [D: UEA-MRBA60-2024].
* Radiometer sensitivity varies widely: MODIS C6.1 minimum detectable fire radiative power ranges from 3.7 MW (nadir, clear night) to 40 MW (daytime scan edge), whereas VIIRS detects fires down to about 0.5 to 0.7 MW at night [D: Sofiev-2026].
* Detection probabilities for powerful fires average 78 percent for MODIS and 88 percent for VIIRS globally, but fall below 30 percent and 40 percent in certain tropical regions [D: Sofiev-2026].
* In Northeast Asia (2012-2017), MODIS missed 65 percent of VIIRS 375 m forest fire pixels and 83 percent of low-biomass pixels; VIIRS missed 35 percent of MODIS forest pixels and 53 percent of low-biomass pixels [D: Fu-2020].
* VIIRS 375 m detects roughly 3 times more daytime and 25 times more nighttime fire pixels than the 750 m VIIRS product [D: Schroeder-2014].
* Burned area products (VNP64A1 and MCD64A1) omit roughly 72 percent of burned area compared to Landsat, and researchers anticipate that regional calibration will be necessary [D-snippet: Giglio-2025].
* S-NPP delivery ended 2 November 2026 [D: NASA-FIRMS-FAQ]; Terra and Aqua are projected to begin shutdown in late 2026 or 2027 [D: Earthdata-Transition; CAMS-2025; NASA-Feature-2024].
* No published literature provides an exact magnitude for the 2012 or 2018 active fire count step; it remains a team hypothesis to measure empirically [T].
* Institutional overlap exists: NASA researchers (Boschetti, Roy, Giglio) have proposed a 25-year 0.25-degree harmonized MODIS and VIIRS series with uncertainty bounds [D-snippet: Boschetti-2023], and recent work explores pre-fusion calibration [D-snippet: MDPI-Fusion-2026].

### Why this matters
Global carbon and climate models require continuous, sensor-agnostic fire activity records so that instrument retirements are not mistaken for real changes in fire frequency.

### The gap we aim to close
We aim to construct a transparent, empirical cross-sensor harmonization between MODIS and VIIRS active fire observations, providing clear uncertainty bounds and accessible documentation of calibration ratios [T].

### What we would validate
* **Validation question**: Would climate and carbon modelers utilize an open, harmonized active fire activity record with stated uncertainty, or do their workflows strictly require gridded burned area and fire radiative power emissions?
* **What the answer tells us**: If modelers indicate that active cell-day history provides a valuable independent benchmark for fire activity timing, the product fulfills a research need. If they require gridded emissions or burned area polygons, The Hotspots serves primarily as an illustrative monitoring baseline rather than an input to carbon accounting models.

***

## 4. Persona 3: Landowner or Farmer (Demo Storyline)

### Who they are
Agricultural operators and rural land managers who use controlled fire to clear crop residues or manage vegetation. The specific demo place for this persona is not chosen in advance; it will be selected from the processed satellite data according to the criteria defined in Solution.md (clear seasonal fire pattern, farmland context, Mediterranean or Italian location, and documented historical activity) [T; Solution.md].

### One moment (illustrative scenario)
A rural property manager needs to burn accumulated agricultural crop residue before seasonal restrictions tighten. The manager operates under strict legal calendars: in Piemonte, open burning of agricultural residues is prohibited from 1 November to 31 March by default [D: LR-15-2018; Regione-Piemonte-2019]. During authorized windows, burning is permitted only on days when air quality conditions meet regional standards (such as ARPA green semaforo days in designated windows) and is strictly forbidden whenever a regional maximum danger state is declared [D: Regione-Piemonte-Danger-2026; Regione-Piemonte-Node-15673]. The manager consults a neighbourhood-level calendar to see whether recent weeks in that district show unusually elevated fire activity compared to historical norms (illustrative scenario).

### Journey with today's tools

| Step | Tool used | Where it fails |
|---|---|---|
| **1. Check legal calendar** | Regional environmental portal / municipal bulletin | Sets fixed calendar prohibitions (such as the 1 November to 31 March ban) but cannot account for immediate local fire history [D: LR-15-2018; I]. |
| **2. Check danger status** | Regional Civil Protection announcements | Declares territory-wide maximum danger states, lacking localized slope or neighbourhood context [D: Regione-Piemonte-Danger-2026; I]. |
| **3. Check air quality** | ARPA semaforo indicator | Restricts burning windows based on urban PM10 thresholds, offering no wildfire risk assessment [D: Regione-Piemonte-Node-15673; I]. |
| **4. On-site assessment** | Visual inspection of parcel | Manager evaluates surface dryness by eye, lacking objective moisture or historical fire recurrence data [I]. |
| **5. Ignition decision** | Farm equipment / drip torch | Weather shifts or unexpected gusts risk fire escapes across unmanaged brush [I]. |
| **6. Regulatory exposure** | Carabinieri Forestali inspections | Escaped fires or unauthorized burns trigger severe statutory fines and legal liabilities [D: L-353-2000; Codice-Penale-423bis]. |

### What it costs them
* In Piemonte, agricultural open burning is banned by default between 1 November and 31 March (L.R. 15/2018) [D: LR-15-2018]. Mayors may grant temporary derogations for plant residue burning for up to 30 days in mountain areas and up to 15 days in plain areas (under the 2021-2025 plan), or up to 30 days non-consecutive under current regional provisions [D: Regione-Piemonte-AIB-2021; Regione-Piemonte-Node-15673]. Derogations are void during declared maximum danger states.
* Under regional air quality rules, burning windows (such as 15-30 September and 1-15 April) require green semaforo status from ARPA [D: Regione-Piemonte-Node-15673].
* Violating burning restrictions incurs administrative fines: EUR 300 to 3,000 under regional air quality regulations, and EUR 5,000 to 50,000 under national framework law (Legge 353/2000, art. 10 c.6) for actions causing fire risk during danger periods [D: L-353-2000; Normattiva-2026].
* Under Italian Penal Code art. 423-bis, causing a wildfire carries 2 to 5 years imprisonment for negligence and 6 to 10 years for intentional acts [D: Codice-Penale-423bis].
* Legge 353/2000 art. 10 imposes a 15-year restriction on changing the zoning designation of burned forest and pasture land, with a 10-year ban on construction, grazing, and hunting [D: L-353-2000].
* In Piemonte's 2000-2024 fire records (4,008 classified fires out of 5,561), causes are recorded as: voluntary 47.26 percent (including arson and deliberate burning), involuntary 23.25 percent, natural 3.02 percent, and doubtful 26.47 percent [D: Regione-Piemonte-AIB-2026].
* EU-wide, approximately 96 percent of wildfires are human-caused [D: JRC-2022], and Italy records about 98 percent human causation [D: ISPRA-2024].
* Demand for authorized, weather-gated burning tools is demonstrated by Portugal's national permit application, which processed 1,030,678 burn permits in 2022 across roughly 623,000 registered users, providing daily municipal safety status based on weather and fire statistics [D: JRC-2022].
* No data exists on how often agricultural residue burns escape control in Piemonte; this remains an unmeasured question for future interviews [?].

### Why this matters
Landowners must navigate complex legal prohibitions, seasonal danger declarations, and severe statutory penalties when conducting necessary agricultural burns.

### The gap we aim to close
Because landowners are bound by legal dates and weather conditions, historical satellite data alone does not dictate daily burn safety. We aim to show neighbourhood-level fire history (not farm-level precision) as context, while clearly labeling predictive outlook and ground condition layers as planned, illustrative capabilities [T; Solution.md].

### What we would validate
* **Validation question**: Does access to a neighbourhood-level satellite fire history calendar influence a landowner's burning schedule, or do municipal permits and legal calendar dates strictly govern their decisions?
* **What the answer tells us**: If landowners confirm that localized history informs risk awareness, neighbourhood calendars provide supplementary value. If legal calendar dates and municipal notices are the sole determining factor, landowner utility depends entirely on the future integration of official permit workflows and planned moisture layers.

***

## 5. Incident Commander and Frontline Firefighters (Also Affected)

### Operational reality
Frontline incident commanders and wildland firefighting crews face urgent life-safety and suppression demands during active incidents. Evidence indicates that a multi-decadal satellite hotspot history record is a weak fit for real-time tactical on-scene size-up:

* Standard wildland firefighting tactical size-up checklists, such as the US Incident Response Pocket Guide (IRPG), focus on current weather, fuel dryness, wind direction, escape routes, and terrain traps; they contain no requirement or workflow for querying satellite fire history [D: NWCG-IRPG-2022].
* Statutory cadastres of burned areas (such as the catasto delle aree percorse dal fuoco under Legge 353/2000 art. 10 c.2) are updated annually and posted at the municipal registry for 30 days, serving administrative land-use oversight rather than active field command [D: L-353-2000].
* Formal disaster reviews and accident reports (such as Pedrogao Grande 2017 and Mati 2018) identify critical bottlenecks in command communications, early evacuation, weather forecasting, and resource coordination, without identifying missing satellite history as a tactical factor [D: Pedrogao-2017; Mati-2018].
* An empirical US interview study of the Wildland Fire Decision Support System (WFDSS) found that wildland fire managers frequently utilized strategic decision systems after the fact to document decisions already reached on the ground, rather than directing real-time field tactics [D: Noble-2020]. WFDSS itself transitioned to WFDSS NextGen in March 2025, and does not evaluate satellite hotspot baselines [D: WFDSS-NextGen-2025].

Frontline incident commanders are best served not by navigating raw satellite platforms during size-up, but as recipients of concise pre-season briefings and valley risk profiles prepared by regional fire planners and operational desks [I].

***

## 6. Cross-Persona Gap Analysis

No deployed public platform found combines all five capabilities required to evaluate multi-sensor fire history [D: CurrentSolutionLandscape.md]:
1. A single continuous MODIS and VIIRS record on a comparable scale, with the underlying method made visible.
2. A burning activity calendar for an area chosen directly by the user.
3. An explicit classification of unusual versus normal activity for that area against a stated multi-year baseline.
4. Readable uncertainty estimates accessible to non-specialists, marking where estimates rely on extrapolation.
5. A defined transition plan for the post-MODIS era as Terra and Aqua approach decommissioning and Suomi-NPP FIRMS feeds conclude.

Existing operational systems already provide essential specialized capabilities. NASA FIRMS delivers near-real-time global active fire alerts within 3 hours but displays separate uncalibrated sensor points [D: NASA-FIRMS-FAQ]. Copernicus EFFIS republishes FIRMS detections 6 times daily after applying a knowledge-based filter that removes agricultural burns, presenting aggregate seasonal charts across fixed national and provincial boundaries [D: EFFIS-Active-Fire]. The gap is not alert speed or regional charting, but providing an auditable, harmonized local calendar with transparent uncertainty.

***

## 7. Hypotheses to Test

The team plans to evaluate the following hypotheses through targeted interviews:
* **Regional Planners (2 to 3 interviews)**: Do SOUP duty officers and regional AIB planners ask whether seasonal burning in a specific valley departs from historical normals, and would an active cell-day calendar alter operational readiness or post-season reporting?
* **Climate and Carbon Modelers (1 to 2 interviews)**: Do emissions and disturbance modelers have a practical use for a harmonized active cell-day time series with uncertainty bounds, or do their workflows strictly require gridded burned area (hectares) and fire radiative power?
* **Municipal and AIB Officials (1 interview)**: Do municipal officials issuing burning derogations or monitoring illegal agricultural burns benefit from localized historical fire recurrence patterns, or is decision-making entirely dictated by the legal calendar and ARPA air quality bulletins?

### Explicitly Not Claimed
* No source demonstrates that operational fire desks currently compare real-time active fire detections against a multi-year valley hotspot baseline.
* No published evidence indicates that individual farmers or landowners look up satellite hotspot history before igniting agricultural residue piles.
* No source indicates that frontline incident commanders require satellite active fire archives during tactical size-up.

***

## 8. Open Verification Tasks

The following unresolved data items and disagreements identified in the research report must be verified against primary sources before final presentations:
1. **Piemonte Farm Count**: The 67,148 figure represents the 2010 6th Agricultural Census (ISTAT), while 2020 provisional estimates report approximately 51,700 farms (down 23 percent); farm counts are dropped from pitch claims pending confirmation against the ISTAT 7th census regional table.
2. **NOAA-21 Archive Start Date**: Reconcile the discrepancy between the FIRMS FAQ (listing 17 January 2024) and the FIRMS download page/repository (listing 1 March 2023).
3. **Piemonte 2022 Statistics**: Confirm that 380 fires and 2,628 ha represent full-year totals across all sizes in JRC Table 25 (confirming whether previous citations to Table 37 or 38 were typographical errors), compared to 156 fires above 0.5 ha in the regional database.
4. **Corrected Academic Titles**: Confirm final citation details for Sofiev and Kouznetsov (2026) in Geoscientific Model Development and Fu et al. (2020) in Remote Sensing.
5. **Document Text Extraction**: Extract and review full texts of regional determinations (DGR 7614/2023, DGR 7660/2018, DGR 6665/2018, DGR 3148/2021), NIFC seasonal outlooks, and the EUSPA emergency user-needs report.
6. **Chart Figure Verification**: Verify figure-read estimates from the Piemonte AIB 2026-2030 plan against primary database records, specifically: January to April accounting for 68 percent of fire events and 61 percent of burned area, and the March mean of approximately 32 fires.
7. **Legal Derogation Provisions**: Resolve whether mayoral residue burning derogations are anchored in L.R. 1/2019 or L.R. 3/2020, and confirm allowable plain-area derogation limits (15 days vs 30 days).
8. **Demo Archive Window**: Confirm whether the team's processed FIRMS archive covers events through July 2026 or terminates in 2025.
9. **October 2017 Archive Check**: Verify directly on the team's harmonized data archive that the October 2017 Bussoleno-Mompantero fire (over 3,900 ha) is clearly captured as an activity anomaly before featuring it in live demonstrations.
10. **Statutory Penalties**: Confirm full primary texts for Legge 353/2000 art. 10 c.6, D.Lgs. 152/2006 art. 182 c.6-bis, and Penal Code art. 423-bis.

***

## 9. Sources

1. **JRC-2022**: European Commission Joint Research Centre (2023). *Forest Fires in Europe, Middle East and North Africa 2022*. Publications Office of the European Union. EUR 31692 EN. https://data.europa.eu/doi/10.2760/09354 (Status: READ-IN-FULL)
2. **JRC-2023-Advance**: European Commission Joint Research Centre (2024). *Advance Report on Forest Fires in Europe, Middle East and North Africa 2023*. Publications Office of the European Union. EUR 31893 EN. https://data.europa.eu/doi/10.2760/039809 (Status: READ-IN-FULL)
3. **JRC-News-2024**: European Commission Joint Research Centre (2024). *Wildfires 2023 among the worst in the EU this century*. 10 Apr 2024. https://joint-research-centre.ec.europa.eu/jrc-news-and-updates/wildfires-2023-among-worst-eu-century-2024-04-10_en (Status: READ-IN-FULL)
4. **EC-Copernicus-2022**: Copernicus Climate Change Service (2023). *European State of the Climate 2022: Wildfires*. https://climate.copernicus.eu/esotc/2022/wildfires (Status: READ-IN-FULL)
5. **ISPRA-2024**: Istituto Superiore per la Protezione e la Ricerca Ambientale (2024). *Annuario dei dati ambientali 2024: Incendi boschivi*. https://climadat.isprambiente.it/wp-content/uploads/2024/12/Fo_Incendi_boschivi_2024.pdf (Status: READ-IN-FULL)
6. **Regione-Piemonte-AIB-2026**: Regione Piemonte (2025). *Piano regionale per la programmazione delle attivita di previsione, prevenzione e lotta attiva contro gli incendi boschivi 2026-2030*. D.G.R. n. 22-1327 del 14 luglio 2025. https://www.regione.piemonte.it/web/media/57925/download (Status: READ-IN-FULL)
7. **Regione-Piemonte-AIB-2021**: Regione Piemonte (2021). *Piano regionale antincendi boschivi 2021-2025*. D.G.R. n. 14-3151 del 30 aprile 2021. https://www.regione.piemonte.it/web/media/22494/download (Status: READ-IN-FULL)
8. **Regione-Piemonte-Danger-2026**: Regione Piemonte (2026). *Incendi boschivi: revocato lo stato di massima pericolosita*. 11 settembre 2026. https://www.regione.piemonte.it/web/pinforma/notizie/incendi-boschivi-revocato-stato-massima-pericolosita (Status: READ-IN-FULL)
9. **Regione-Piemonte-2019**: Regione Piemonte (2019). *Dichiarato lo stato di massima pericolosita per incendi boschivi su tutto il territorio regionale*. 19 marzo 2019. https://www.regione.piemonte.it/web/pinforma/comunicati-stampa/dichiarato-stato-massima-pericolosita-per-incendi-boschivi-tutto-territorio-regionale (Status: READ-IN-FULL)
10. **Regione-Piemonte-Node-3017**: Regione Piemonte. *Antincendi boschivi: la Sala Operativa Unificata Permanente*. https://www.regione.piemonte.it/web/node/3017 (Status: READ-IN-FULL)
11. **Regione-Piemonte-Node-15673**: Regione Piemonte. *Abbruciamento di materiale vegetale: disposizioni regionali*. https://www.regione.piemonte.it/web/node/15673 (Status: READ-IN-FULL)
12. **NASA-FIRMS-FAQ**: National Aeronautics and Space Administration (2026). *FIRMS FAQ*. https://www.earthdata.nasa.gov/data/tools/firms/faq (Status: READ-IN-FULL)
13. **Earthdata-Transition**: National Aeronautics and Space Administration (2025). *Transition from MODIS to VIIRS*. Updated 2 May 2025. https://www.earthdata.nasa.gov/data/alerts-outages/transition-from-modis-viirs (Status: READ-IN-FULL)
14. **NASA-MODIS-Guide**: Giglio, L. (2023). *MODIS Collection 6 and 6.1 Active Fire Products User's Guide, Version 1.0*. NASA EOSDIS. https://www.earthdata.nasa.gov/s3fs-public/2023-09/MODIS_C6_C6.1_Fire_User_Guide_1.0.pdf (Status: READ-IN-FULL)
15. **NASA-Science-Terra**: National Aeronautics and Space Administration (2023). *Terra: The End of an Era*. NASA Science Mission Directorate. https://science.nasa.gov/science-research/earth-science/terra-the-end-of-an-era (Status: READ-IN-FULL)
16. **NASA-Feature-2024**: National Aeronautics and Space Administration. *Response to the 2023 Earth Science Senior Review and 2022-2023 out-of-cycle senior reviews* (projects Terra power to February 2027 and Aqua to September 2027). https://science.nasa.gov/wp-content/uploads/2024/02/response-to-2023-earth-science-senior-review-and-2022-2023-out-of-cycle-senior-reviews-final.pdf (Status: SNIPPET; the URL path suggests a 2024 document, so the date is unconfirmed)
17. **CAMS-2025**: Copernicus Atmosphere Monitoring Service (2025). *Drifting away: MODIS and the CAMS Global Fire Assimilation System*. ECMWF / CAMS Story. https://atmosphere.copernicus.eu/drifting-away-modis-cams-global-fire-assimilation-system (Status: READ-IN-FULL)
18. **Schroeder-2014**: Schroeder, W., et al. (2014). *The New VIIRS 375 m active fire detection data product: Algorithm description and initial assessment*. Remote Sensing of Environment, 143, 85-96. https://earthdata.nasa.gov/s3fs-public/imported/Schroeder_et_al_2014b_RSE.pdf (Status: READ-IN-FULL)
19. **Sofiev-2026**: Sofiev, M. and Kouznetsov, R. (2026). *Observation operator and detection limits for MODIS and VIIRS Fire Radiative Power products*. Geoscientific Model Development, 19, 10123-10142. https://gmd.copernicus.org/articles/19/10123/2026/ (Status: READ-IN-FULL)
20. **Chen-2026**: Chen, Y., et al. (2026). *Tracking recent extremes and interannual variability of global fire emissions using a near-real-time extension to the Global Fire Emissions Database (GFED5NRT)*. Earth System Science Data, 18, 7535-7555. https://essd.copernicus.org/articles/18/7535/2026/ (Status: READ-IN-FULL)
21. **Fu-2020**: Fu, Y., et al. (2020). *Fire Detection and Fire Radiative Power in Forests and Low-Biomass Lands in Northeast Asia: MODIS versus VIIRS Fire Products*. Remote Sensing, 12(18), 2870. https://doi.org/10.3390/rs12182870 (Status: READ-ABSTRACT)
22. **UEA-MRBA60-2024**: MRBA60 burned area dataset, Scientific Data (2026), via University of East Anglia ePrints. Exact title and authors not captured. https://ueaeprints.uea.ac.uk/id/eprint/104113/ (Status: READ-ABSTRACT)
23. **Noble-2020**: Noble, P. and Paveglio, T. B. (2020). *Exploring Adoption of the Wildland Fire Decision Support System: End User Perspectives*. Journal of Forestry, 118(2), 154-171. https://doi.org/10.1093/jofore/fvz070 (Status: READ-PART)
24. **L-353-2000**: Repubblica Italiana (2000). *Legge 21 novembre 2000, n. 353: Legge-quadro in materia di incendi boschivi*. Normattiva. https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2000-11-21;353~art10 (Status: READ-IN-FULL)
25. **LR-15-2018**: Regione Piemonte (2018). *Legge regionale 4 ottobre 2018, n. 15: Disciplina delle attivita di protezione civile e antincendi boschivi*. Consiglio Regionale del Piemonte. (Status: SNIPPET; the legal basis was taken from search summaries of regional decisions and the law text itself was not read. The 1 November to 31 March ban is read in the Regione 2019 release and the AIB plans.)
26. **Codice-Penale-423bis**: Repubblica Italiana. *Codice Penale, art. 423-bis: Incendio boschivo*. Brocardi. https://www.brocardi.it/codice-penale/libro-secondo/titolo-vi/capo-i/art423bis.html (Status: READ-PART, secondary legal portal; Normattiva text not read)
27. **Coldiretti-2026**: Coldiretti Piemonte (2026). *Abbruciamento residui vegetali: le regole in vigore*. https://piemonte.coldiretti.it/ (Status: advocacy organization, secondary; not used for any figure, kept only because it describes the 15 September to 15 April burning rule and a traffic-light request)
28. **EFFIS-Active-Fire**: Copernicus Emergency Management Service (2026). *EFFIS Technical Background: Active Fire Detection*. https://forest-fire.emergency.copernicus.eu/about-effis/technical-background/active-fire-detection (Status: READ-IN-FULL)
29. **Il-Post-ARPA-2026**: Il Post (2026). *La grave siccita in Piemonte*. 4 agosto 2026. Quoting ARPA Piemonte. https://www.ilpost.it/2026/08/04/piemonte-siccita/ (Status: READ-IN-FULL)
30. **MeteoWeb-2026**: MeteoWeb (2026). *Siccita: il Piemonte dichiara lo stato d'emergenza per crisi idrica e incendi boschivi*. 3 agosto 2026. https://www.meteoweb.eu/2026/08/siccita-il-piemonte-dichiara-lo-stato-demergenza-per-crisi-idrica-e-incendi-boschivi/1001964790/ (Status: READ-IN-FULL)
31. **Panorama-VVF-2021**: De Feo, G. (2021). *Incendi: quanto ci costa la flotta dei Canadair*. Panorama. https://www.panorama.it/news/cronaca/costo-canadair-incendi (Status: PRESS)
32. **Giglio-2025**: Giglio, L., et al. (2025). *The NASA VIIRS burned area product, global validation, and intercomparison with the NASA MODIS burned area product*. Remote Sensing of Environment 331, 115006. https://geog.umd.edu/sites/geog.umd.edu/files/pubs/1-s2.0-S0034425725004109-main.pdf (Status: SNIPPET; used for the omission against Landsat and the need for regional calibration, exact wording to check)
33b. **Giglio-LANCE-2025**: Giglio, L. (2025). *MODIS orbit drift*, LANCE UWG slides, May 2025. https://landweb.modaps.eosdis.nasa.gov/data/filePost/LANCE_UWG_Orbit_Drift_Giglio_202505.pdf (Status: READ-IN-FULL)
33. **LDOPE-2026**: NASA Land Data Operational Products Evaluation (2026). *MODIS Orbit Drift and Pixel Distortion Issue Notice*. Issue 1254, 8 Jan 2026. https://landweb.modaps.eosdis.nasa.gov/displayissue?id=1254 (Status: READ-IN-FULL)
34. **Boschetti-2023**: Boschetti, L., Roy, D. P., and Giglio, L. NASA science team slides (2022 and 2023) describing a planned harmonized 25-year 0.25 degree MODIS and VIIRS time series with uncertainties. Exact title and URL not captured; release status unconfirmed. (Status: SNIPPET)
35. **MDPI-Fusion-2026**: Remote Sensing (2026). Paper proposing "correction-before-fusion" for MODIS and VIIRS active fire products. Title and authors not captured; the page returned 403. Remote Sensing 18, 1650. https://mdpi-res.com/d_attachment/remotesensing/remotesensing-18-01650/article_deploy/remotesensing-18-01650.pdf (Status: SNIPPET)
36. **NWCG-IRPG-2022**: National Wildfire Coordinating Group (2022). *Incident Response Pocket Guide (IRPG), PMS 461*. https://www.nwcg.gov/publications/461 (Status: SNIPPET)
37. **WFDSS-NextGen-2025**: US Forest Service and Wildland Fire Management RD&A (2025). *WFDSS NextGen Transition Notice*. System of record 26 March 2025. (Status: SNIPPET)
38. **Pedrogao-2017**: Centro de Estudos sobre Incendios Florestais (2017). *O complexo de incendios de Pedrogao Grande e concelhos vizinhos*. Relatorio independente. (Status: SNIPPET)
39. **Mati-2018**: Hellenic Republic Independent Investigation Committee (2018). *Attica Wildfire Disaster Report*. (Status: SNIPPET)

***

## 10. Draft Pitch Lines

*Candidate lines for the team's live pitch. Each line carries its source tag and status under it, marked as draft.*

* **Pitch Line 1 (Record continuity and why now)**:
  > "On 2 November 2026, delivery of Suomi-NPP VIIRS data ended, and the remaining MODIS satellites are facing decommissioning. The international teams producing GFED and CAMS have each stated in their own documentation that harmonizing the multi-sensor satellite fire record remains an unfinished challenge."
  *Note: Draft line. Suomi-NPP shutdown date verified in NASA FIRMS FAQ [D: NASA-FIRMS-FAQ, Status: READ-IN-FULL]. Continuity challenges verified in GFED5NRT [D: Chen-2026, Status: READ-IN-FULL] and CAMS documentation [D: CAMS-2025, Status: READ-IN-FULL].*

* **Pitch Line 2 (Regional fire season and outlier detection)**:
  > "In Piemonte, sixty-eight percent of wildfires occur between January and April. When an out-of-season fire burned over 3,900 hectares in the Val di Susa in late October 2017, it stood out as an extreme statistical outlier that an operations planner needs to identify in seconds."
  *Note: Draft line. Conditional on verifying on our own data archive that the October 2017 event is clearly visible in the harmonized record. Seasonal distribution (figure-read) and October 2017 Bussoleno-Mompantero burned area verified in Regione Piemonte AIB Plan 2026-2030 [D: Regione-Piemonte-AIB-2026, Status: READ-IN-FULL].*

* **Pitch Line 3 (Satellite-visible activity instead of fire counts)**:
  > "Because the median wildfire in Piemonte is only 2.5 hectares while a single VIIRS pixel covers about 14 hectares, satellite sensors cannot provide an exact count of fires. Our platform maps satellite-visible activity and its uncertainty, showing planners where burning departs from historical norms without claiming false sensor precision."
  *Note: Draft line. Median fire size verified in Regione Piemonte AIB Plan 2026-2030 [D: Regione-Piemonte-AIB-2026, Status: READ-IN-FULL]. VIIRS 375 m pixel footprint verified in Schroeder et al. (2014) [D: Schroeder-2014, Status: READ-IN-FULL].*
