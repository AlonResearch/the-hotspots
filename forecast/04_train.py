import json
import time
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "data" / "work"
RES = ROOT / "results"
RES.mkdir(exist_ok=True)
t0 = time.time()
log = lambda m: print(f"[{time.time() - t0:5.0f}s] {m}", flush=True)

df = pd.read_parquet(WORK / "train_res4.parquet")
f27 = pd.read_parquet(WORK / "features_2027_res4.parquet")
FEATS = [c for c in f27.columns if c not in ("year", "area", "area_id", "split")]
log(f"loaded {len(df):,} rows, {len(FEATS)} features: {FEATS}")

BASE = dict(learning_rate=0.1, num_leaves=63, min_data_in_leaf=200, feature_fraction=0.8, bagging_fraction=0.8,
            bagging_freq=1, lambda_l2=1.0, num_threads=12, verbose=-1, seed=42)
MODELS = {
    "mean": dict(objective="tweedie", tweedie_variance_power=1.2, metric="rmse"),
    "p10": dict(objective="quantile", alpha=0.1, metric="quantile"),
    "p50": dict(objective="quantile", alpha=0.5, metric="quantile"),
    "p90": dict(objective="quantile", alpha=0.9, metric="quantile"),
}


def fit(name, train, valid=None, rounds=None):
    params = {**BASE, **MODELS[name]}
    dtr = lgb.Dataset(train[FEATS], train["target"], free_raw_data=False)
    if valid is not None:
        dva = lgb.Dataset(valid[FEATS], valid["target"], reference=dtr)
        return lgb.train(params, dtr, 800, valid_sets=[dva], callbacks=[lgb.early_stopping(40, verbose=False)])
    return lgb.train(params, dtr, rounds)


def metrics(y, p):
    y, p = np.asarray(y, float), np.asarray(p, float)
    return dict(MAE=np.mean(np.abs(y - p)), RMSE=np.sqrt(np.mean((y - p) ** 2)),
                corr_log=np.corrcoef(np.log1p(y), np.log1p(np.clip(p, 0, None)))[0, 1],
                total_ratio=p.sum() / y.sum())


tr, va = df[df.year <= 2023], df[df.year == 2024]
best = {}
for name in MODELS:
    m = fit(name, tr, va)
    best[name] = max(int(m.best_iteration * 1.1), 20)
    log(f"early stopping {name}: best iteration {m.best_iteration} -> use {best[name]}")

train = df[df.year <= 2024]
test = df[df.year >= 2025].copy()
models = {}
for name in MODELS:
    models[name] = fit(name, train, rounds=best[name])
    test[f"pred_{name}"] = np.clip(models[name].predict(test[FEATS]), 0, None)
    log(f"refit {name} on 2020-2024 ({best[name]} trees)")
test["pred_p50"] = np.maximum(test.pred_p50, test.pred_p10)
test["pred_p90"] = np.maximum(test.pred_p90, test.pred_p50)

CAND = {"always 0": np.zeros(len(test)), "same month last year": test.last_same, "climatology mean": test.clim_mean,
        "climatology median": test.clim_median, "LightGBM mean (Tweedie)": test.pred_mean,
        "LightGBM median (p50)": test.pred_p50}
out = {}
for label, sel in {"2025 (full year)": test.year == 2025, "2026 Jan-Oct": test.year == 2026,
                   "2026 Jan-Jul (archive)": (test.year == 2026) & (test.target_nrt == 0),
                   "2026 Aug-Oct (NRT)": (test.year == 2026) & (test.target_nrt == 1)}.items():
    tab = pd.DataFrame({k: metrics(test.target[sel], np.asarray(v)[sel.values]) for k, v in CAND.items()}).T
    out[label] = tab
    print(f"\n=== TEST {label}: {int(sel.sum()):,} area-months, mean target {test.target[sel].mean():.2f}")
    print(tab.round(3).to_string())

for yr in (2025, 2026):
    s = test.year == yr
    cov = np.mean((test.target[s] >= test.pred_p10[s]) & (test.target[s] <= test.pred_p90[s]))
    cov_act = np.mean(((test.target >= test.pred_p10) & (test.target <= test.pred_p90))[s & (test.target > 0)])
    below, above = np.mean(test.target[s] < test.pred_p10[s]), np.mean(test.target[s] > test.pred_p90[s])
    print(f"\n10-90 % range {yr}: coverage {cov:.3f} (target 0.80; below p10 {below:.3f}, above p90 {above:.3f}); "
          f"coverage where target > 0: {cov_act:.3f}")
    out[f"interval_{yr}"] = dict(coverage=cov, below_p10=below, above_p90=above, coverage_active=cov_act)

s = test[test.year == 2025]
bm = s.groupby("month").apply(lambda g: pd.Series({
    "mean_target": g.target.mean(), "MAE clim median": np.mean(np.abs(g.target - g.clim_median)),
    "MAE LGBM p50": np.mean(np.abs(g.target - g.pred_p50)),
    "RMSE clim mean": np.sqrt(np.mean((g.target - g.clim_mean) ** 2)),
    "RMSE LGBM mean": np.sqrt(np.mean((g.target - g.pred_mean) ** 2))}), include_groups=False)
print("\n=== 2025 by month"); print(bm.round(2).to_string())
band = pd.cut(s.lat.abs(), [0, 23.5, 45, 90], labels=["tropics (<23.5)", "mid (23.5-45)", "high (>45)"], include_lowest=True)
bl = s.groupby(band, observed=True).apply(lambda g: pd.Series({
    "area-months": len(g), "mean_target": g.target.mean(),
    "MAE clim median": np.mean(np.abs(g.target - g.clim_median)), "MAE LGBM p50": np.mean(np.abs(g.target - g.pred_p50)),
    "RMSE clim mean": np.sqrt(np.mean((g.target - g.clim_mean) ** 2)),
    "RMSE LGBM mean": np.sqrt(np.mean((g.target - g.pred_mean) ** 2))}), include_groups=False)
print("\n=== 2025 by latitude band"); print(bl.round(2).to_string())

imp = pd.DataFrame({"feature": FEATS, "gain_mean_model": models["mean"].feature_importance("gain"),
                    "gain_p50_model": models["p50"].feature_importance("gain")})
imp[["gain_mean_model", "gain_p50_model"]] = (100 * imp[["gain_mean_model", "gain_p50_model"]] /
                                              imp[["gain_mean_model", "gain_p50_model"]].sum()).round(1)
imp = imp.sort_values("gain_mean_model", ascending=False)
print("\n=== Feature importance (% of gain)"); print(imp.to_string(index=False))

test[["year", "month", "area_id", "lat", "lon", "target", "target_nrt", "clim_mean", "clim_median", "last_same",
      "pred_mean", "pred_p10", "pred_p50", "pred_p90"]].to_parquet(RES / "test_predictions_res4.parquet", index=False)
imp.to_csv(RES / "feature_importance.csv", index=False)

wins = all(out[k].loc["LightGBM median (p50)", "MAE"] < out[k].loc["climatology median", "MAE"] and
           out[k].loc["LightGBM mean (Tweedie)", "RMSE"] < out[k].loc["climatology mean", "RMSE"]
           for k in ("2025 (full year)", "2026 Jan-Oct"))
print(f"\n=== DECISION: LightGBM beats climatology on both test years (MAE and RMSE): {wins}")

fc = f27[["area_id", "lat", "lon", "month", "clim_median", "clim_mean", "last_same"]].copy()
fc.insert(3, "year", 2027)
for name in MODELS:
    rounds = int(best[name] * 1.15)
    fc[f"pred_{name}"] = np.clip(fit(name, df, rounds=rounds).predict(f27[FEATS]), 0, None)
    log(f"final fit {name} on 2020-2026 ({rounds} trees) -> 2027 predicted")
fc["pred_p50"] = np.maximum(fc.pred_p50, fc.pred_p10)
fc["pred_p90"] = np.maximum(fc.pred_p90, fc.pred_p50)
fc = fc.round({c: 2 for c in fc.columns if c.startswith(("pred_", "clim_", "last_"))})
fc.to_parquet(RES / "forecast_2027_res4.parquet", index=False)
fc.to_csv(RES / "forecast_2027_res4.csv", index=False)

json.dump({"features": FEATS, "trees": best, "model_beats_climatology": bool(wins),
           "test": {k: (v.round(4).to_dict("index") if isinstance(v, pd.DataFrame) else v) for k, v in out.items()}},
          open(RES / "metrics.json", "w"), indent=1, default=float)
print("\n=== 2027 forecast, global total per month (active cell-days, thousands)")
g = fc.groupby("month")[["clim_mean", "pred_mean", "pred_p10", "pred_p50", "pred_p90"]].sum() / 1000
print(g.round(0).to_string())
log("done")
