# forecast/

Scripts of the 2027 forecast (LightGBM quantile regression on fire history). What it predicts, the held-out test and the limits: [Prediction.md](../Prediction.md). Full engineering detail: [Vision Docs/PredictionEngineeringReport.md](../Vision%20Docs/PredictionEngineeringReport.md).

Run from the repository root, in order: `01_build_firms.py`, `02_analysis.py`, `03_preprocess.py`, `04_train.py`, `05_figures.py`. Packages: `requirements.txt`. Inputs are `data/datasets/MODIS-2018-2026.csv` and `data/datasets/VIIRS-2018-2026.csv`, which were built in the separate prediction project and are not produced by `pipeline/`. Outputs (forecast CSV and Parquet, `metrics.json`, figures) go to `results/`, which is git-ignored. To show the forecast in the app, see [web/README.md](../web/README.md) (`npm run import-forecast`).
